/**
 * HTTP access to Douban collection pages.
 *
 * Douban rate-limits and screens automated traffic, so every page request
 * carries a browser User-Agent, an `Accept-Language` header, and a `book.douban.com`
 * Referer — the Referer is what turns a bare request into a `200` instead of a
 * `403`. Public collections need no cookie; a cookie only reaches private ones.
 */

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Raised when Douban answers with an error status or blocks the request. */
export class DoubanHttpError extends Error {
  /**
   * @param {string} message human-readable failure
   * @param {{ url?: string, status?: number }} [details] request that failed
   */
  constructor(message, details = {}) {
    super(message)
    this.name = 'DoubanHttpError'
    this.url = details.url
    this.status = details.status
  }
}

/**
 * Fetch one collection page as text.
 * Retries network failures, `5xx`, and `429`; refuses to retry `403`/`418`,
 * which mean the request needs a cookie or a slower pace.
 * @param {string} url page URL
 * @param {{ cookie?: string, timeoutMs?: number, retries?: number, signal?: AbortSignal }} options request options
 * @returns {Promise<string>} page markup
 */
export async function fetchPage(url, { cookie, timeoutMs = 20_000, retries = 2, signal } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2_000 * 2 ** (attempt - 1), signal)
    try {
      return await requestOnce(url, { cookie, timeoutMs, signal })
    } catch (error) {
      lastError = error
      if (error instanceof DoubanHttpError && ![429, 500, 502, 503, 504].includes(error.status)) throw error
      if (signal?.aborted) throw error
    }
  }
  throw lastError
}

/** @param {string} url @param {{ cookie?: string, timeoutMs: number, signal?: AbortSignal }} options */
async function requestOnce(url, { cookie, timeoutMs, signal }) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const headers = {
    'user-agent': USER_AGENT,
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'referer': 'https://book.douban.com/',
    'cache-control': 'no-cache',
  }
  if (cookie) headers.cookie = cookie

  const response = await fetch(url, { headers, signal: combined, redirect: 'follow' })
  if (!response.ok) {
    throw new DoubanHttpError(httpErrorText(response.status), { url, status: response.status })
  }
  return await response.text()
}

/** @param {number} status */
function httpErrorText(status) {
  if (status === 403 || status === 418) {
    return `Douban blocked the request (HTTP ${status}). Wait a minute and retry, or pass a browser cookie with --cookie.`
  }
  if (status === 404) return 'Douban returned 404: check the user id and whether the collection is public.'
  return `Douban returned HTTP ${status}.`
}

/**
 * Sleep for the given time, honouring an abort signal.
 * @param {number} ms milliseconds to wait
 * @param {AbortSignal} [signal] cancellation signal
 * @returns {Promise<void>} resolves after the wait
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
