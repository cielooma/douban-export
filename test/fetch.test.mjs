import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pageUrl } from '../src/categories.mjs'
import { DoubanHttpError, sleep } from '../src/fetch.mjs'

test('builds collection URLs for every category', () => {
  assert.equal(pageUrl('book', '1222949', 'done', 0), 'https://book.douban.com/people/1222949/collect?sort=time')
  assert.equal(pageUrl('movie', '1222949', 'wish', 30), 'https://movie.douban.com/people/1222949/wish?start=30&sort=time')
  assert.equal(pageUrl('music', '1222949', 'doing', 0), 'https://music.douban.com/people/1222949/do?sort=time')
  assert.equal(
    pageUrl('game', '1222949', 'wish', 15),
    'https://www.douban.com/people/1222949/games?action=wish&start=15',
  )
})

test('pins the sort order so page boundaries cannot move', () => {
  assert.equal(
    pageUrl('book', '1222949', 'done', 30, 'title'),
    'https://book.douban.com/people/1222949/collect?start=30&sort=title',
  )
})

test('rejects unknown categories and statuses instead of guessing a path', () => {
  assert.throws(() => pageUrl('podcast', '1222949', 'done', 0), /unknown category/)
  assert.throws(() => pageUrl('book', '1222949', 'finished', 0), /unknown status/)
})

test('sleep rejects once its signal aborts', async () => {
  const controller = new AbortController()
  const pending = sleep(5_000, controller.signal)
  controller.abort(new Error('stop'))
  await assert.rejects(pending, /stop/)
})

test('HTTP errors keep their status for retry decisions', () => {
  const error = new DoubanHttpError('blocked', { status: 403, url: 'https://book.douban.com/' })
  assert.equal(error.status, 403)
  assert.equal(error.url, 'https://book.douban.com/')
})
