/**
 * Fetching documentation pages as plain text.
 *
 * - GitHub "blob" URLs are rewritten to raw.githubusercontent.com so we get markdown, not the
 *   GitHub web app shell.
 * - HTML pages are reduced to their visible text so quotes can be matched against them.
 * - Every URL is fetched at most once per run (in-memory cache) with a small concurrency limit
 *   and retries on transient errors.
 */

export interface FetchResult {
  url: string;
  fetchUrl: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType: string;
  text: string;
  error?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  userAgent?: string;
  maxBytes?: number;
}

const DEFAULT_UA = 'agentmatrix-bot/0.1 (+https://github.com/agentmatrix; docs verification)';

export function toFetchableUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  u.hash = '';
  if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
    // https://github.com/owner/repo/blob/ref/path/to/file.md -> raw
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  }
  return u.toString();
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  middot: '·',
  bull: '•',
  rarr: '→',
  larr: '←',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    const b = body.toLowerCase();
    if (b.startsWith('#x')) {
      const cp = Number.parseInt(b.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    if (b.startsWith('#')) {
      const cp = Number.parseInt(b.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES[b] ?? whole;
  });
}

export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<(br|hr)\b[^>]*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|table|section|article|header|footer|pre|blockquote|dd|dt|dl|nav|aside|main|figure|figcaption|details|summary)\b[^>]*>/gi, '\n');
  s = s.replace(/<\/(td|th)\b[^>]*>/gi, ' \t ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/\r/g, '');
  s = s.replace(/[ \t\f\v]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function looksLikeHtml(contentType: string, body: string): boolean {
  if (/text\/html|application\/xhtml/i.test(contentType)) return true;
  const head = body.slice(0, 500).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

async function fetchOnce(url: string, opts: Required<FetchOptions>): Promise<FetchResult> {
  const fetchUrl = toFetchableUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(fetchUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': opts.userAgent,
        accept: 'text/markdown, text/plain, text/html;q=0.9, */*;q=0.5',
      },
    });
    const contentType = res.headers.get('content-type') ?? '';
    const buf = Buffer.from(await res.arrayBuffer());
    const body = buf.subarray(0, opts.maxBytes).toString('utf8');
    const text = looksLikeHtml(contentType, body) ? htmlToText(body) : body.replace(/\r\n/g, '\n');
    return {
      url,
      fetchUrl,
      finalUrl: res.url || fetchUrl,
      status: res.status,
      ok: res.ok,
      contentType,
      text,
      ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (err) {
    const message = err instanceof Error ? (err.name === 'AbortError' ? `timeout after ${opts.timeoutMs}ms` : err.message) : String(err);
    return { url, fetchUrl, finalUrl: fetchUrl, status: 0, ok: false, contentType: '', text: '', error: message };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<FetchResult> {
  const opts: Required<FetchOptions> = {
    timeoutMs: options.timeoutMs ?? 30_000,
    retries: options.retries ?? 2,
    userAgent: options.userAgent ?? DEFAULT_UA,
    maxBytes: options.maxBytes ?? 4 * 1024 * 1024,
  };
  let last: FetchResult | null = null;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const result = await fetchOnce(url, opts);
    last = result;
    const transient = result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500;
    if (result.ok || !transient) return result;
    await sleep(500 * 2 ** attempt);
  }
  return last as FetchResult;
}

/** Fetches each URL once per run, with bounded concurrency. */
export class Fetcher {
  private readonly cache = new Map<string, Promise<FetchResult>>();
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly options: FetchOptions = {},
    private readonly concurrency = 4,
  ) {}

  get(url: string): Promise<FetchResult> {
    const key = toFetchableUrl(url);
    let p = this.cache.get(key);
    if (!p) {
      p = this.withSlot(() => fetchText(url, this.options));
      this.cache.set(key, p);
    }
    return p;
  }

  private async withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
