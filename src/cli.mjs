#!/usr/bin/env node
/**
 * Command-line entry point: export one user's Douban collections.
 *
 * Usage: `douban-export --user <id> [--category book,movie] [--status wish]`
 * Run `douban-export --help` for every option.
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { collect } from './collect.mjs'
import { CATEGORIES, CATEGORY_ORDER, STATUS_ORDER, normalizeStatus } from './categories.mjs'
import { writeExports } from './export.mjs'

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version

const HELP = `douban-export ${VERSION} — 导出豆瓣的读书 / 影视 / 音乐 / 游戏记录

用法
  douban-export --user <豆瓣ID> [选项]

选项
  -u, --user <id>        豆瓣用户 ID，即 douban.com/people/<id> 中的 <id>（必填）
  -t, --category <list>  要导出的类别，逗号分隔：book(图书),movie(影视),music(音乐),game(游戏)
                         也可写 all；默认 book
  -s, --status <list>    要导出的列表，逗号分隔：
                           done  = 读过 / 看过 / 听过 / 玩过
                           doing = 在读 / 在看 / 在听 / 在玩
                           wish  = 想读 / 想看 / 想听 / 想玩
                         兼容旧写法：read/collect 等于 done，do 等于 doing
                         默认 done,doing,wish（全部）
  -c, --cookie <cookie>  浏览器 Cookie 字符串，私密收藏需要；也可用环境变量 DOUBAN_COOKIE
  -f, --format <list>    输出格式，逗号分隔：csv,md,json（默认 csv）
  -o, --out <dir>        输出目录（默认 ./douban-books）
      --sort <order>     排序：time(默认),rating,title；固定排序才不会在页边界重复
      --start <n>        从第 n 条开始抓（断点续抓，默认 0）
      --delay <ms>       每页之间的等待，默认 2500，最小 1000
      --max-pages <n>    每个列表最多抓多少页，默认 200
      --timeout <ms>     单次请求超时，默认 20000
      --retries <n>      失败重试次数，默认 2
      --save-html <dir>  把每页 HTML 存下来，方便排查解析问题
  -v, --version          显示版本号
  -h, --help             显示本帮助

示例
  douban-export --user 1222949 --format csv,md
  douban-export --user 1222949 --category movie --status wish
  douban-export --user 1222949 --category all --status done,wish --format csv
  douban-export --user 1222949 --category music --start 15 --format json
`

const options = {
  user: { type: 'string', short: 'u' },
  category: { type: 'string', short: 't', default: 'book' },
  status: { type: 'string', short: 's', default: 'done,doing,wish' },
  cookie: { type: 'string', short: 'c' },
  format: { type: 'string', short: 'f', default: 'csv' },
  out: { type: 'string', short: 'o', default: './douban-books' },
  sort: { type: 'string', default: 'time' },
  start: { type: 'string', default: '0' },
  delay: { type: 'string', default: '2500' },
  'max-pages': { type: 'string', default: '200' },
  timeout: { type: 'string', default: '20000' },
  retries: { type: 'string', default: '2' },
  'save-html': { type: 'string' },
  version: { type: 'boolean', short: 'v', default: false },
  help: { type: 'boolean', short: 'h', default: false },
}

const controller = new AbortController()
process.once('SIGINT', () => controller.abort(new Error('interrupted')))

/** Raised for bad command-line input, so it prints without a stack trace. */
class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

try {
  await main(parseArgs({ options, allowPositionals: false }).values)
} catch (error) {
  if (error instanceof Error && (error instanceof UsageError || error.name.startsWith('Douban'))) {
    console.error(`\n✗ ${error.message}`)
    process.exitCode = 1
  } else {
    throw error
  }
}

/** @param {Record<string, string | boolean | undefined>} values parsed arguments */
async function main(values) {
  if (values.version) {
    console.log(VERSION)
    return
  }
  if (values.help) {
    process.stdout.write(HELP)
    return
  }
  const user = requiredUser(values.user)
  const categories = listOf(values.category, [...CATEGORY_ORDER, 'all'])
    .flatMap(item => (item === 'all' ? CATEGORY_ORDER : [item]))
  const statuses = listOf(values.status, [...STATUS_ORDER, 'read', 'collect', 'do']).map(status => {
    const canonical = normalizeStatus(status)
    if (!canonical) throw new UsageError(`未知的 --status：${status}（可选 done,doing,wish）`)
    return canonical
  })
  const formats = listOf(values.format, ['csv', 'md', 'json'])
  const delay = Math.max(1000, Number(values.delay))

  for (const category of categories) {
    const recordsByStatus = {}
    const runs = []
    for (const status of statuses) {
      const run = await collect(user, category, status, {
        cookie: (values.cookie ?? process.env.DOUBAN_COOKIE ?? '').trim() || undefined,
        start: Number(values.start) || 0,
        delay,
        maxPages: Number(values['max-pages']),
        timeoutMs: Number(values.timeout),
        retries: Number(values.retries),
        sort: values.sort,
        saveHtml: values['save-html'],
        signal: controller.signal,
      })
      recordsByStatus[status] = run.entries
      runs.push({ category, status, ...run })
    }

    const written = await writeExports({ user, category, recordsByStatus, outDir: values.out, formats })
    for (const run of runs) {
      const label = `${CATEGORIES[category].label}·${CATEGORIES[category].words[run.status]}`
      const declared = run.declaredTotal === null ? '' : `（声明 ${run.declaredTotal} 条）`
      console.log(`${label}：${run.entries.length} 条${declared}`)
      if (run.shortfall && run.stoppedBy === 'max-pages') {
        console.log(`  已到 --max-pages 上限，想抓全请加大 --max-pages，或从 --start ${run.nextStart} 续抓。`)
      } else if (run.shortfall) {
        reportShortfall(run)
      }
    }
    for (const path of written) console.log(`已写入 ${path}`)
  }
}

/**
 * Explain a run that ended below the declared total instead of failing silently.
 * @param {{ category: 'book' | 'movie' | 'music' | 'game', status: 'done' | 'doing' | 'wish', entries: unknown[], declaredTotal: number | null, duplicates: number, nextStart: number, shortfall: number | null }} run finished run
 */
function reportShortfall(run) {
  const spec = CATEGORIES[run.category]
  console.error(`\n⚠ ${spec.label}·${spec.words[run.status]} 只拿到 ${run.entries.length}/${run.declaredTotal} 条，缺 ${run.shortfall} 条。`)
  if (run.duplicates > 0) {
    console.error(`  本次有 ${run.duplicates} 条重复：豆瓣在页边界上重复返回了同一条目，通常说明两次请求之间排序变了。`)
  }
  if (run.duplicates === 0) {
    console.error('  若每页都只有 14 条，缺的那条通常是被豆瓣隐藏的条目，任何 start 偏移都取不到，属正常。')
  }
  console.error('  否则可能是未登录的深度分页限制，或该页返回了风控降级页面。')
  console.error(`  排查：--save-html ./debug --category ${run.category} --status ${run.status} --max-pages 1 --start ${run.nextStart} 看该页 HTML；`)
  console.error(`  私密收藏加 --cookie；或从断点续抓：--start ${run.nextStart} --category ${run.category} --status ${run.status}。`)
}

/** @param {string | undefined} value */
function requiredUser(value) {
  const user = (value ?? '').trim()
  if (!user) throw new UsageError('缺少 --user：请传入豆瓣用户 ID，例如 douban-export --user 1222949')
  if (!/^[\w-]+$/.test(user)) throw new UsageError(`--user 只能包含字母、数字、下划线和连字符：${user}`)
  return user
}

/** @param {string | boolean | undefined} value @param {string[]} allowed */
function listOf(value, allowed) {
  const items = String(value ?? '').split(',').map(item => item.trim()).filter(Boolean)
  if (items.length === 0) throw new UsageError(`需要至少一个值，可选：${allowed.join(',')}`)
  for (const item of items) {
    if (!allowed.includes(item)) throw new UsageError(`不支持的值：${item}，可选：${allowed.join(',')}`)
  }
  return items
}
