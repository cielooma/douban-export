import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toCsv, toJson, toMarkdown } from '../src/export.mjs'

/** @type {import('../src/types.mjs').EntryRecord[]} */
const books = [
  {
    category: 'book',
    subjectId: '1',
    title: '三体',
    subtitle: '地球往事',
    detail: '刘慈欣 / 重庆出版社 / 2008-1 / 23.00元',
    rating: 5,
    status: 'done',
    date: '2024-02-03',
    comment: '好看，但"黑暗森林"更好',
    url: 'https://book.douban.com/subject/1/',
  },
  {
    category: 'book',
    subjectId: '2',
    title: '想读的书',
    subtitle: '',
    detail: '',
    rating: null,
    status: 'wish',
    date: '',
    comment: '',
    url: 'https://book.douban.com/subject/2/',
  },
]

test('CSV starts with a BOM and the shared header', () => {
  const csv = toCsv(books, 'book')
  assert.ok(csv.startsWith('\uFEFF状态,标题,副标题,详细信息'))
  assert.ok(csv.includes('读过,三体,地球往事,刘慈欣'))
})

test('CSV renders each category with its own status wording', () => {
  const films = [{ ...books[0], category: 'movie', status: 'wish', title: '蜘蛛侠' }]
  assert.ok(toCsv(films, 'movie').includes('想看,蜘蛛侠'))
  const games = [{ ...books[0], category: 'game', status: 'doing', title: '塞尔达' }]
  assert.ok(toCsv(games, 'game').includes('在玩,塞尔达'))
})

test('CSV quotes fields containing commas, quotes, or newlines', () => {
  const csv = toCsv([{ ...books[0], title: '书名, 带逗号', comment: '引号"与\n换行' }], 'book')
  assert.ok(csv.includes('"书名, 带逗号"'))
  assert.ok(csv.includes('"引号""与\n换行"'))
})

test('Markdown groups by collection and escapes pipes', () => {
  const markdown = toMarkdown({
    user: 'someone',
    category: 'book',
    recordsByStatus: { done: books.slice(0, 1), doing: [], wish: books.slice(1) },
    exportedAt: new Date('2026-01-02T03:04:05Z'),
  })
  assert.ok(markdown.includes('# 豆瓣图书导出（someone）'))
  assert.ok(markdown.includes('## 读过（1）'))
  assert.ok(markdown.includes('## 想读（1）'))
  assert.ok(!markdown.includes('## 在读'), 'empty collections are omitted')
  assert.ok(markdown.includes('[三体](https://book.douban.com/subject/1/)'))
  assert.ok(markdown.includes('| [想读的书](https://book.douban.com/subject/2/) |  |  |  |  |'))
})

test('Markdown titles a film export with the film wording', () => {
  const markdown = toMarkdown({ user: 'someone', category: 'movie', recordsByStatus: { wish: [] } })
  assert.ok(markdown.includes('# 豆瓣影视导出（someone）'))
})

test('JSON keeps counts and every record', () => {
  const payload = JSON.parse(toJson({ user: 'someone', category: 'book', recordsByStatus: { done: books } }))
  assert.deepEqual(payload.counts, { done: 2 })
  assert.equal(payload.items.length, 2)
  assert.equal(payload.category, 'book')
  assert.equal(payload.user, 'someone')
})
