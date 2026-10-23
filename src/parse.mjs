/**
 * Parsers for Douban's collection pages.
 *
 * Douban renders three markup families across the four collections, and this
 * module handles all of them:
 * - `grid`  — books: `<li class="subject-item">` (default) or `<li class="item">` (`?mode=list`), with the publication line, star rating, marked date, and an optional short comment.
 * - `media` — films and music: `<div class="item comment-item">`, with a `li.title` holding `<em>title / original title</em>`, a `li.intro` line, rating, date, and an optional `span.comment`.
 * - `game`  — games: `<div class="common-item">`, with `div.title`, a `div.desc` block, an `allstarNN` rating, and a date.
 *
 * One record shape is produced for every collection so paging and exporting
 * stay category-agnostic.
 */

import { CATEGORIES } from './categories.mjs'

const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Decode the HTML entities Douban emits in page text.
 * @param {string} html raw markup
 * @returns {string} text with named and numeric entities decoded
 */
export function decodeEntities(html) {
  return html.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, body) => {
    if (body.startsWith('#')) {
      const codePoint = body[1].toLowerCase() === 'x'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

/**
 * Strip tags and collapse whitespace, keeping the text of a markup fragment.
 * @param {string} html raw markup
 * @returns {string} single-line text
 */
export function textOf(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/**
 * Split a collection page into per-entry markup chunks.
 * A chunk ends at the last closing tag before the next entry starts, so markup
 * from the next entry never leaks into this entry's fields.
 * @param {string} html collection page markup
 * @param {{ itemStart: RegExp, closeTag: string }} spec category descriptor
 * @returns {string[]} one markup chunk per candidate entry
 */
export function splitItemChunks(html, spec) {
  const pattern = new RegExp(spec.itemStart.source, 'g')
  const starts = [...html.matchAll(pattern)].map(match => match.index)
  const chunks = []
  for (let index = 0; index < starts.length; index++) {
    const end = index + 1 < starts.length ? starts[index + 1] : html.length
    const chunk = html.slice(starts[index], end)
    const closing = chunk.lastIndexOf(spec.closeTag)
    chunks.push(closing === -1 ? chunk : chunk.slice(0, closing))
  }
  return chunks
}

/**
 * Parse the entries on one collection page.
 * @param {string} html collection page markup
 * @param {{ category: 'book' | 'movie' | 'music' | 'game', status?: 'done' | 'doing' | 'wish' }} options category selects the parser; `status` is
 *   assumed when a page omits the status word (every non-book page does)
 * @returns {import('./types.mjs').EntryRecord[]} parsed entries, de-duplicated
 *   by subject id
 */
export function parseItems(html, { category, status }) {
  const spec = CATEGORIES[category]
  if (!spec) throw new Error(`unknown category: ${category}`)
  const parsers = { grid: parseGridEntry, media: parseMediaEntry, game: parseGameEntry }
  const records = []
  for (const chunk of splitItemChunks(html, spec)) {
    const record = parsers[spec.kind](chunk, spec, status)
    if (record) records.push(record)
  }
  return dedupe(records)
}

/**
 * Read the entry count Douban prints in the page heading, such as
 * `读过的书(92)` or `阿北看过的影视(218)`.
 * @param {string} html collection page markup
 * @returns {number | null} declared total, or `null` when no heading carries a count
 */
export function parseTotal(html) {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const fromHeading = heading ? textOf(heading[1]).match(/\((\d+)\)/) : null
  if (fromHeading) return Number.parseInt(fromHeading[1], 10)
  const fallback = html.match(/(?:读过的书|看过的影视|听过的音乐|玩过的游戏)\((\d+)\)/)
  return fallback ? Number.parseInt(fallback[1], 10) : null
}

/** @param {string} chunk @param {import('./categories.mjs').CategorySpec} spec @param {string} [status] */
function parseGridEntry(chunk, spec, status) {
  const subject = chunk.match(spec.subject)
  if (!subject) return null

  const titleAttr = chunk.match(/<a[^>]*\stitle="([^"]+)"/)
  const titleBlock = chunk.match(/<div class="title">([\s\S]*?)<\/div>/)
  const title = textOf(titleAttr?.[1] ?? titleBlock?.[1] ?? '')
  if (!title) return null

  const subtitleBlock = chunk.match(/<span[^>]*style="font-size:12px;?"[^>]*>([\s\S]*?)<\/span>/)
  const detailBlock = chunk.match(/<div class="pub">([\s\S]*?)<\/div>/)
    ?? chunk.match(/<span class="intro">([\s\S]*?)<\/span>/)
  const dateText = textOf((chunk.match(/<span class="date">([\s\S]*?)<\/span>/)
    ?? chunk.match(/<div class="date">([\s\S]*?)<\/div>/))?.[1] ?? '')

  return {
    category: 'book',
    subjectId: subject[1],
    title,
    subtitle: textOf(subtitleBlock?.[1] ?? '').replace(/^:\s*/, ''),
    detail: textOf(detailBlock?.[1] ?? ''),
    rating: starRating(chunk),
    status: statusOf(dateText, 'book') ?? status ?? null,
    date: dateOf(dateText),
    comment: textOf((chunk.match(/<p class="comment[^"]*"[^>]*>([\s\S]*?)<\/p>/)
      ?? chunk.match(/<span class="comment">([\s\S]*?)<\/span>/))?.[1] ?? ''),
    url: `https://book.douban.com/subject/${subject[1]}/`,
  }
}

/** @param {string} chunk @param {import('./categories.mjs').CategorySpec} spec @param {string} [status] */
function parseMediaEntry(chunk, spec, status) {
  const subject = chunk.match(spec.subject)
  if (!subject) return null

  const titleLine = textOf((chunk.match(/<em>([\s\S]*?)<\/em>/)
    ?? chunk.match(/<li class="title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/))?.[1] ?? '')
  const [title = '', original = ''] = titleLine.split(' / ')
  if (!title) return null

  const detail = textOf((chunk.match(/<li class="intro">([\s\S]*?)<\/li>/))?.[1] ?? '')
  const dateText = textOf((chunk.match(/<span class="date">([\s\S]*?)<\/span>/))?.[1] ?? '')

  return {
    category: spec.host.startsWith('movie') ? 'movie' : 'music',
    subjectId: subject[1],
    title,
    subtitle: original,
    detail,
    rating: starRating(chunk),
    status: statusOf(dateText, 'movie') ?? status ?? null,
    date: dateOf(dateText),
    comment: textOf((chunk.match(/<span class="comment">([\s\S]*?)<\/span>/))?.[1] ?? ''),
    url: `https://${spec.host}/subject/${subject[1]}/`,
  }
}

/** @param {string} chunk @param {import('./categories.mjs').CategorySpec} spec @param {string} [status] */
function parseGameEntry(chunk, spec, status) {
  const subject = chunk.match(spec.subject)
  if (!subject) return null

  const title = textOf((chunk.match(/<div class="title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/))?.[1] ?? '')
  if (!title) return null

  const descBlock = chunk.match(/<div class="desc">([\s\S]*?)(?:<div class="rating-info">|<\/div>)/)
  const dateText = textOf((chunk.match(/<span class="date">([\s\S]*?)<\/span>/))?.[1] ?? '')
  const allstar = chunk.match(/class="rating-star allstar(\d+)"/)

  return {
    category: 'game',
    subjectId: subject[1],
    title,
    subtitle: '',
    detail: textOf(descBlock?.[1] ?? ''),
    rating: allstar ? Math.max(1, Math.round(Number.parseInt(allstar[1], 10) / 10)) : null,
    status: statusOf(dateText, 'game') ?? status ?? null,
    date: dateOf(dateText),
    comment: textOf((chunk.match(/<span class="comment">([\s\S]*?)<\/span>/))?.[1] ?? ''),
    url: `https://www.douban.com/game/${subject[1]}/`,
  }
}

/** @param {string} chunk */
function starRating(chunk) {
  const match = chunk.match(/class="rating([1-5])-t"/)
  return match ? Number.parseInt(match[1], 10) : null
}

/** @param {string} text */
function dateOf(text) {
  return text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? ''
}

/** @param {string} text @param {'book' | 'movie' | 'music' | 'game'} category */
function statusOf(text, category) {
  for (const [key, word] of Object.entries(CATEGORIES[category].words)) {
    if (text.includes(word)) return /** @type {'done' | 'doing' | 'wish'} */ (key)
  }
  return null
}

/** @param {import('./types.mjs').EntryRecord[]} records */
function dedupe(records) {
  const seen = new Map()
  for (const record of records) seen.set(record.subjectId, record)
  return [...seen.values()]
}
