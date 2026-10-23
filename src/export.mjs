/**
 * Serializers for exported collections.
 *
 * Every category uses the same columns, so a CSV opened in a spreadsheet and a
 * Markdown note kept in an Obsidian vault stay comparable across books, films,
 * music, and games.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CATEGORIES } from './categories.mjs'

/** Header row shared with {@link toCsv}. */
export const CSV_COLUMNS = ['状态', '标题', '副标题', '详细信息', '我的评分', '标记日期', '短评', '豆瓣链接']

/**
 * Render entries as CSV with a UTF-8 BOM, so Excel opens Chinese text correctly.
 * @param {import('./types.mjs').EntryRecord[]} records entries to serialize
 * @param {'book' | 'movie' | 'music' | 'game'} category selects the status wording
 * @returns {string} CSV document
 */
export function toCsv(records, category) {
  const words = CATEGORIES[category].words
  const rows = [CSV_COLUMNS, ...records.map(record => [
    words[record.status] ?? '',
    record.title,
    record.subtitle,
    record.detail,
    record.rating ? '★'.repeat(record.rating) : '',
    record.date,
    record.comment,
    record.url,
  ])]
  return `\uFEFF${rows.map(row => row.map(escapeCsvField).join(',')).join('\r\n')}\r\n`
}

/**
 * Render entries as one Markdown document with a section per collection.
 * @param {{ user: string, category: 'book' | 'movie' | 'music' | 'game', recordsByStatus: Record<string, import('./types.mjs').EntryRecord[]>, exportedAt?: Date }} input export metadata
 * @returns {string} Markdown document
 */
export function toMarkdown({ user, category, recordsByStatus, exportedAt = new Date() }) {
  const spec = CATEGORIES[category]
  const lines = [
    `# 豆瓣${spec.label}导出（${user}）`,
    '',
    `导出时间：${localStamp(exportedAt)}`,
    '',
  ]
  for (const [status, records] of Object.entries(recordsByStatus)) {
    if (records.length === 0) continue
    lines.push(`## ${spec.words[status]}（${records.length}）`, '')
    lines.push('| 标题 | 详细信息 | 评分 | 标记日期 | 短评 |', '| --- | --- | --- | --- | --- |')
    for (const record of records) {
      const title = `[${escapeMarkdown(record.title)}](${record.url})`
      const rating = record.rating ? '★'.repeat(record.rating) : ''
      lines.push(`| ${title} | ${escapeMarkdown(record.detail)} | ${rating} | ${record.date} | ${escapeMarkdown(record.comment)} |`)
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/**
 * Render entries as a JSON payload with counts, keeping the full record shape.
 * @param {{ user: string, category: 'book' | 'movie' | 'music' | 'game', recordsByStatus: Record<string, import('./types.mjs').EntryRecord[]>, exportedAt?: Date }} input export metadata
 * @returns {string} JSON document
 */
export function toJson({ user, category, recordsByStatus, exportedAt = new Date() }) {
  const counts = Object.fromEntries(
    Object.entries(recordsByStatus).map(([status, records]) => [status, records.length]),
  )
  return `${JSON.stringify({
    user,
    category,
    exportedAt: exportedAt.toISOString(),
    counts,
    items: Object.values(recordsByStatus).flat(),
  }, null, 2)}\n`
}

/**
 * Write one category's entries in the requested formats.
 * @param {{ user: string, category: 'book' | 'movie' | 'music' | 'game', recordsByStatus: Record<string, import('./types.mjs').EntryRecord[]>, outDir: string, formats: string[], exportedAt?: Date }} input export request
 * @returns {Promise<string[]>} paths written, in format order
 */
export async function writeExports({ user, category, recordsByStatus, outDir, formats, exportedAt = new Date() }) {
  const spec = CATEGORIES[category]
  const records = Object.values(recordsByStatus).flat()
  const renderers = {
    csv: () => toCsv(records, category),
    md: () => toMarkdown({ user, category, recordsByStatus, exportedAt }),
    json: () => toJson({ user, category, recordsByStatus, exportedAt }),
  }
  await mkdir(outDir, { recursive: true })
  const written = []
  for (const format of formats) {
    const render = renderers[format]
    if (!render) throw new Error(`unknown format: ${format} (expected csv, md, or json)`)
    const path = join(outDir, `douban-${spec.stem}-${user}.${format}`)
    await writeFile(path, render(), 'utf8')
    written.push(path)
  }
  return written
}

/** @param {Date} date */
function localStamp(date) {
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** @param {string} value */
function escapeCsvField(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** @param {string} value */
function escapeMarkdown(value) {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ')
}
