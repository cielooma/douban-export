/**
 * Descriptors for the four Douban collections this tool exports.
 *
 * Each category owns its own host, path segment, page markup, and wording
 * (`读过` for books, `看过` for films, `听过` for music, `玩过` for games), so
 * everything else — paging, parsing, exporting — stays category-agnostic.
 */

/** Order used by `--category all` and by report output. */
export const CATEGORY_ORDER = ['book', 'movie', 'music', 'game']

/** Status keys shared by every category, in display order. */
export const STATUS_ORDER = ['done', 'doing', 'wish']

const STATUS_ALIASES = {
  done: 'done',
  read: 'done',
  collect: 'done',
  doing: 'doing',
  do: 'doing',
  wish: 'wish',
}

/**
 * Normalize a `--status` value.
 * @param {string} value raw CLI value
 * @returns {'done' | 'doing' | 'wish' | null} canonical status, or `null` for an unknown value
 */
export function normalizeStatus(value) {
  return STATUS_ALIASES[value] ?? null
}

/**
 * @typedef {object} CategorySpec
 * @property {string} label Chinese label used in reports and Markdown headings
 * @property {string} stem output filename stem, e.g. `books`
 * @property {'grid' | 'media' | 'game'} kind markup family, selecting a parser
 * @property {string} host site host
 * @property {Record<'done' | 'doing' | 'wish', string>} paths URL path or `action` value per status
 * @property {Record<'done' | 'doing' | 'wish', string>} words status words printed in the UI
 * @property {RegExp} itemStart opener of one item block on a collection page
 * @property {string} closeTag closing tag of one item block
 * @property {RegExp} subject subject-id pattern inside an item block
 */

/** @type {Record<'book' | 'movie' | 'music' | 'game', CategorySpec>} */
export const CATEGORIES = {
  book: {
    label: '图书',
    stem: 'books',
    kind: 'grid',
    host: 'book.douban.com',
    paths: { done: 'collect', doing: 'do', wish: 'wish' },
    words: { done: '读过', doing: '在读', wish: '想读' },
    itemStart: /<li[^>]*class="(?:subject-item|item)"[^>]*>/g,
    closeTag: '</li>',
    subject: /book\.douban\.com\/subject\/(\d+)/,
  },
  movie: {
    label: '影视',
    stem: 'movies',
    kind: 'media',
    host: 'movie.douban.com',
    paths: { done: 'collect', doing: 'do', wish: 'wish' },
    words: { done: '看过', doing: '在看', wish: '想看' },
    itemStart: /<div[^>]*class="item comment-item"[^>]*>/g,
    closeTag: '</div>',
    subject: /movie\.douban\.com\/subject\/(\d+)/,
  },
  music: {
    label: '音乐',
    stem: 'music',
    kind: 'media',
    host: 'music.douban.com',
    paths: { done: 'collect', doing: 'do', wish: 'wish' },
    words: { done: '听过', doing: '在听', wish: '想听' },
    itemStart: /<div[^>]*class="item comment-item"[^>]*>/g,
    closeTag: '</div>',
    subject: /music\.douban\.com\/subject\/(\d+)/,
  },
  game: {
    label: '游戏',
    stem: 'games',
    kind: 'game',
    host: 'www.douban.com',
    paths: { done: 'collect', doing: 'do', wish: 'wish' },
    words: { done: '玩过', doing: '在玩', wish: '想玩' },
    itemStart: /<div[^>]*class="common-item"[^>]*>/g,
    closeTag: '</div>',
    subject: /douban\.com\/game\/(\d+)/,
  },
}

/**
 * Build the URL of one collection page.
 *
 * `sort` is pinned for the subject collections so a page boundary cannot move
 * between two requests; the games page has no sorting parameter.
 * @param {'book' | 'movie' | 'music' | 'game'} category collection to read
 * @param {string} user Douban user id
 * @param {'done' | 'doing' | 'wish'} status collection to list
 * @param {number} start zero-based offset of the first entry on the page
 * @param {'time' | 'rating' | 'title'} [sort] ordering Douban applies
 * @returns {string} absolute page URL
 */
export function pageUrl(category, user, status, start, sort = 'time') {
  const spec = CATEGORIES[category]
  if (!spec) throw new Error(`unknown category: ${category}`)
  const action = spec.paths[status]
  if (!action) throw new Error(`unknown status: ${status}`)

  const query = new URLSearchParams()
  if (category === 'game') query.set('action', action)
  if (start > 0) query.set('start', String(start))
  if (category !== 'game') query.set('sort', sort)

  const base = category === 'game'
    ? `https://www.douban.com/people/${encodeURIComponent(user)}/games`
    : `https://${spec.host}/people/${encodeURIComponent(user)}/${action}`
  return `${base}?${query}`
}
