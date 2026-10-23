/**
 * Shared record types. This module has no runtime exports; it exists so the
 * JSDoc `import('./types.mjs').EntryRecord` references resolve.
 */

/**
 * One entry from a Douban collection list, normalized across every category.
 * @typedef {object} EntryRecord
 * @property {'book' | 'movie' | 'music' | 'game'} category collection the entry came from
 * @property {string} subjectId Douban subject id, e.g. `36672955`
 * @property {string} title entry title
 * @property {string} subtitle original title or subtitle when Douban prints one, otherwise empty
 * @property {string} detail the detail line: publication data, film credits, album credits, or game platforms
 * @property {number | null} rating the user's star rating 1-5, or `null` when unrated
 * @property {'done' | 'doing' | 'wish' | null} status collection the entry was read from
 * @property {string} date marked date as `YYYY-MM-DD`, or empty when absent
 * @property {string} comment the user's short comment, or empty
 * @property {string} url canonical subject page
 */

export {}
