/**
 * Page through one Douban collection and report what the run actually covered.
 *
 * Two things end a run: reaching the total the page heading declares, or two
 * consecutive empty pages.
 *
 * `start` addresses 15 entry slots, and Douban rounds it down to the page that
 * contains it — `start=14` returns the page that begins at 0. A page that
 * renders 14 entries means one slot holds an entry Douban does not publish; it
 * is not reachable through any offset, so stepping by {@link PAGE_SIZE} is
 * correct and a short page is a coverage fact, not a stopping signal.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchPage, sleep } from './fetch.mjs'
import { pageUrl, CATEGORIES } from './categories.mjs'
import { parseItems, parseTotal } from './parse.mjs'

/** Entries Douban puts on one collection page. Offsets advance by this step. */
export const PAGE_SIZE = 15

/**
 * Export one collection.
 * @param {string} user Douban user id
 * @param {'book' | 'movie' | 'music' | 'game'} category collection to read
 * @param {'done' | 'doing' | 'wish'} status which list of that category to read
 * @param {{
 *   cookie?: string,
 *   start?: number,
 *   delay?: number,
 *   jitter?: number,
 *   maxPages?: number,
 *   timeoutMs?: number,
 *   retries?: number,
 *   sort?: 'time' | 'rating' | 'title',
 *   saveHtml?: string,
 *   signal?: AbortSignal,
 *   fetcher?: typeof fetchPage,
 *   log?: (line: string) => void,
 * }} [options] run options; `fetcher` and `log` exist for tests
 * @returns {Promise<{ entries: import('./types.mjs').EntryRecord[], declaredTotal: number | null, duplicates: number, pages: number, nextStart: number, stoppedBy: string, shortfall: number | null }>}
 *   the entries collected plus coverage facts: `declaredTotal` is the count the
 *   page heading claims, `duplicates` counts repeated subject ids seen across
 *   page boundaries, `nextStart` is the slot to resume from, and `shortfall` is
 *   how many declared entries are missing (`null` when the heading was absent)
 */
export async function collect(user, category, status, options = {}) {
  const {
    cookie,
    start = 0,
    delay = 2500,
    jitter = 500,
    maxPages = 200,
    timeoutMs = 20_000,
    retries = 2,
    sort = 'time',
    saveHtml,
    signal,
    fetcher = fetchPage,
    log = line => console.error(line),
  } = options
  const word = CATEGORIES[category].words[status]

  /** @type {Map<string, import('./types.mjs').EntryRecord>} */
  const entries = new Map()
  let declaredTotal = null
  let duplicates = 0
  let emptyPages = 0
  let pages = 0
  /** @type {'total' | 'empty' | 'max-pages'} */
  let stoppedBy = 'max-pages'

  for (let page = 0; page < maxPages; page++) {
    const offset = start + page * PAGE_SIZE
    const url = pageUrl(category, user, status, offset, sort)
    if (page > 0) await sleep(delay + Math.floor(Math.random() * jitter), signal)
    const html = await fetcher(url, { cookie, timeoutMs, retries, signal })
    pages++
    if (saveHtml) await dumpHtml(saveHtml, `${category}-${status}-${offset}.html`, html)

    declaredTotal ??= parseTotal(html)
    const parsed = parseItems(html, { category, status })

    if (parsed.length === 0) {
      emptyPages++
      if (emptyPages >= 2) {
        stoppedBy = 'empty'
        break
      }
      if (page > 0) log(`  ${word} 第 ${page + 1} 页 … 空页，再确认一次`)
      continue
    }
    emptyPages = 0
    for (const entry of parsed) {
      if (entries.has(entry.subjectId)) duplicates++
      entries.set(entry.subjectId, entry)
    }

    const reachedTotal = declaredTotal !== null && entries.size >= declaredTotal
    const coverage = declaredTotal === null ? `${entries.size} 条` : `${entries.size}/${declaredTotal} 条`
    const short = parsed.length < PAGE_SIZE && !reachedTotal ? `（本页只有 ${parsed.length} 条，继续翻页）` : ''
    log(`  ${word} 第 ${page + 1} 页 … ${coverage}${short}`)

    if (reachedTotal) {
      stoppedBy = 'total'
      break
    }
  }

  return {
    entries: [...entries.values()],
    declaredTotal,
    duplicates,
    pages,
    nextStart: start + pages * PAGE_SIZE,
    stoppedBy,
    shortfall: declaredTotal === null ? null : Math.max(0, declaredTotal - entries.size),
  }
}

/** @param {string} dir @param {string} name @param {string} html */
async function dumpHtml(dir, name, html) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), html, 'utf8')
}
