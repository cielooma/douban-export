import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { decodeEntities, parseItems, parseTotal, textOf } from '../src/parse.mjs'

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

test('parses the book grid template', () => {
  const books = parseItems(fixture('collect.html'), { category: 'book', status: 'done' })
  assert.equal(books.length, 3)

  const [first] = books
  assert.equal(first.category, 'book')
  assert.equal(first.subjectId, '36672955')
  assert.equal(first.title, '我看见的世界')
  assert.equal(first.subtitle, '李飞飞自传')
  assert.equal(first.detail, '[美] 李飞飞 / 赵灿 / 中信出版集团 / 2024-4 / 85.00元')
  assert.equal(first.rating, 4)
  assert.equal(first.status, 'done')
  assert.equal(first.date, '2025-05-10')
  assert.equal(first.comment, '')
  assert.equal(first.url, 'https://book.douban.com/subject/36672955/')

  assert.equal(books[2].rating, null, 'an unrated book keeps a null rating')
})

test('parses films, keeping the original title as the subtitle', () => {
  const films = parseItems(fixture('movie.html'), { category: 'movie', status: 'done' })
  assert.equal(films.length, 2)

  const [first] = films
  assert.equal(first.category, 'movie')
  assert.equal(first.subjectId, '26933210')
  assert.equal(first.title, '蜘蛛侠：英雄无归')
  assert.equal(first.subtitle, 'Spider-Man: No Way Home')
  assert.ok(first.detail.includes('汤姆·霍兰德'))
  assert.equal(first.rating, 4)
  assert.equal(first.date, '2026-08-08')
  assert.equal(first.url, 'https://movie.douban.com/subject/26933210/')
})

test('parses albums', () => {
  const [album] = parseItems(fixture('music.html'), { category: 'music', status: 'done' })
  assert.equal(album.title, '新长征路上的摇滚')
  assert.equal(album.detail, '崔健 / 1989-02-01 / 专辑 / CD / 摇滚')
  assert.equal(album.rating, 5)
  assert.equal(album.date, '2007-11-12')
  assert.equal(album.url, 'https://music.douban.com/subject/1394742/')
})

test('parses games, converting allstarNN to stars', () => {
  const [game] = parseItems(fixture('game.html'), { category: 'game', status: 'done' })
  assert.equal(game.subjectId, '25899591')
  assert.equal(game.title, '战斗砖块剧场 BattleBlock Theater')
  assert.equal(game.detail, 'PC / MAC / LIN / X360 / 横版过关 / 动作 / 2013-04-03')
  assert.equal(game.rating, 4)
  assert.equal(game.date, '2026-10-22')
  assert.equal(game.status, 'done', 'the games page carries no status word, so the requested one is used')
  assert.equal(game.url, 'https://www.douban.com/game/25899591/')
})

test('reads the declared total from the page heading', () => {
  assert.equal(parseTotal(fixture('collect.html')), 92)
  assert.equal(parseTotal(fixture('movie.html')), 406)
  assert.equal(parseTotal(fixture('game.html')), 159)
  assert.equal(parseTotal('<html></html>'), null)
})

test('parses the compact list template and falls back to the requested status', () => {
  const listMode = `
    <li id="list123" class="item">
      <div class="item-show">
        <div class="title"><a href="https://book.douban.com/subject/123/">三体</a></div>
        <div class="date"><span class="rating5-t"></span>&nbsp;&nbsp;2024-02-03</div>
      </div>
      <div id="grid123" class="hide comment-item">
        <div class="grid-date"><span class="intro">刘慈欣 / 重庆出版社 / 2008-1 / 23.00元</span><br /></div>
      </div>
    </li>`

  const [book] = parseItems(listMode, { category: 'book', status: 'wish' })
  assert.equal(book.title, '三体')
  assert.equal(book.rating, 5)
  assert.equal(book.date, '2024-02-03')
  assert.equal(book.status, 'wish')
  assert.equal(book.detail, '刘慈欣 / 重庆出版社 / 2008-1 / 23.00元')
})

test('keeps a short comment verbatim', () => {
  const html = `<li class="subject-item">
    <h2><a href="https://book.douban.com/subject/456/" title="活着">活着</a></h2>
    <div class="pub">余华 / 作家出版社 / 2012-8 / 20.00元</div>
    <span class="date">2020-01-01 读过</span>
    <p class="comment comment-item">一口气读完，<b>值得</b>再读。</p>
  </li>`

  const [book] = parseItems(html, { category: 'book' })
  assert.equal(book.comment, '一口气读完， 值得 再读。')
  assert.equal(book.status, 'done')
})

test('de-duplicates repeated subject ids', () => {
  const item = `
    <li class="subject-item">
      <h2><a href="https://book.douban.com/subject/789/" title="重复">重复</a></h2>
      <span class="date">2021-05-05 读过</span>
    </li>`
  assert.equal(parseItems(item + item, { category: 'book' }).length, 1)
})

test('decodes entities and collapses whitespace', () => {
  assert.equal(decodeEntities('a &amp; b &#20013; &#x6587; &unknown;'), 'a & b 中 文 &unknown;')
  assert.equal(textOf('  <p>多行\n   文本</p>  '), '多行 文本')
})
