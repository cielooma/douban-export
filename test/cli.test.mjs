import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url))

test('the CLI file parses', () => {
  // cli.mjs runs on import, so no test imports it; a syntax error would
  // otherwise reach the user before any test did.
  const result = spawnSync(process.execPath, ['--check', cli], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})

test('--help prints usage and exits 0', () => {
  const result = spawnSync(process.execPath, [cli, '--help'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--category/)
  assert.match(result.stdout, /--status/)
})

test('--version prints the package version', () => {
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/)
})

test('a bad --status fails cleanly without a stack trace', () => {
  const result = spawnSync(process.execPath, [cli, '--user', 'someone', '--status', 'finished'], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /不支持的值：finished/)
  assert.doesNotMatch(result.stderr, /\n\s+at /)
})
