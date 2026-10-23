import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collect } from '../src/collect.mjs'

/**
 * Build a page that looks like Douban's collection list.
 * @param {number[]} ids subject ids on the page
 * @param {number | null} total count printed in the heading, or `null` to omit it
 */
function page(ids, total) {
  const heading = total === null ? '' : `<h1>读过的书(${total})</h1>`
  const items = ids.map(id => `
    <li class="subject-item">
      <h2><a href="https://book.douban.com/subject/${id}/" title="书${id}">书${id}</a></h2>
      <div class="pub">作者 / 出版社 / 2020-1 / 10.00元</div>
      <span class="date">2020-01-01 读过</span>
    </li>`).join('')
  return `<html><body>${heading}<ul>${items}</ul></body></html>`
}

/**
 * Serve queued pages in request order so paging can be tested without network.
 * @param {string[]} htmls pages to hand out
 */
function fakePages(htmls) {
  /** @type {string[]} */
  const calls = []
  let index = 0
  /** @type {typeof import('../src/fetch.mjs').fetchPage} */
  const fetcher = async url => {
    calls.push(url)
    if (index >= htmls.length) throw new Error(`unexpected request ${calls.length}: ${url}`)
    return htmls[index++]
  }
  return { fetcher, calls }
}

const offsets = calls => calls.map(url => Number(new URL(url).searchParams.get('start') ?? 0))
const range = (from, count) => Array.from({ length: count }, (_, index) => from + index)

test('a short page does not end the run', async () => {
  const { fetcher, calls } = fakePages([
    page(range(1, 15), 59),
    page(range(16, 15), 59),
    page(range(31, 14), 59),
    page(range(45, 15), 59),
  ])
  const run = await collect('someone', 'book', 'done', { fetcher, delay: 1, jitter: 0, log: () => {} })

  assert.equal(run.entries.length, 59)
  assert.deepEqual(offsets(calls), [0, 15, 30, 45], 'page 3 rendered 14 entries and the run still asked for page 4')
  assert.equal(run.declaredTotal, 59)
  assert.equal(run.shortfall, 0)
  assert.equal(run.stoppedBy, 'total')
  assert.equal(run.nextStart, 60, 'resume points at the next page slot')
})

test('a page-boundary duplicate is reported instead of silently truncating', async () => {
  const { fetcher, calls } = fakePages([
    page(range(1, 15), 30),
    page(range(15, 15), 30),
    page([], 30),
    page([], 30),
  ])
  const run = await collect('someone', 'book', 'done', { fetcher, delay: 1, jitter: 0, log: () => {} })

  assert.equal(run.entries.length, 29)
  assert.equal(run.duplicates, 1)
  assert.equal(run.shortfall, 1)
  assert.equal(run.stoppedBy, 'empty')
  assert.deepEqual(offsets(calls), [0, 15, 30, 45])
})

test('one empty page is re-checked before giving up', async () => {
  const { fetcher, calls } = fakePages([
    page(range(1, 15), 30),
    page([], 30),
    page(range(16, 15), 30),
  ])
  const run = await collect('someone', 'book', 'done', { fetcher, delay: 1, jitter: 0, log: () => {} })

  assert.equal(run.entries.length, 30)
  assert.equal(run.stoppedBy, 'total')
  assert.deepEqual(offsets(calls), [0, 15, 30])
})

test('without a heading, two consecutive empty pages end the run', async () => {
  const { fetcher, calls } = fakePages([page([1, 2], null), page([], null), page([], null)])
  const run = await collect('someone', 'book', 'done', { fetcher, delay: 1, jitter: 0, log: () => {} })

  assert.equal(run.entries.length, 2)
  assert.equal(run.declaredTotal, null)
  assert.equal(run.shortfall, null)
  assert.deepEqual(offsets(calls), [0, 15, 30])
})

test('resuming from an offset reports coverage against the declared total', async () => {
  const { fetcher, calls } = fakePages([
    page(range(556, 15), 825),
    page(range(571, 15), 825),
    page([], 825),
    page([], 825),
  ])
  const run = await collect('someone', 'book', 'done', { fetcher, start: 555, delay: 1, jitter: 0, log: () => {} })

  assert.equal(run.entries.length, 30)
  assert.equal(run.shortfall, 795, 'coverage is reported against the declared total, not the requested window')
  assert.deepEqual(offsets(calls), [555, 570, 585, 600])
})

test('requests the page URL of the requested category and status', async () => {
  const { fetcher, calls } = fakePages([page([], 0), page([], 0)])
  await collect('someone', 'game', 'wish', { fetcher, delay: 1, jitter: 0, log: () => {} })
  assert.equal(calls[0], 'https://www.douban.com/people/someone/games?action=wish')
})
