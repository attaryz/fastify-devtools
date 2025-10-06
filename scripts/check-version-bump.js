#!/usr/bin/env node
/*
  Pre-commit version bump reminder
  - If staged changes include source files but do NOT include a version bump in package.json,
    prompt to optionally abort so you can bump the version first.
  - Set SKIP_VERSION_PROMPT=1 to bypass.
*/
const { execSync } = require('child_process')
const readline = require('readline')

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

if (process.env.SKIP_VERSION_PROMPT === '1') process.exit(0)

// Get staged files
const staged = run('git diff --cached --name-only').split('\n').filter(Boolean)
if (staged.length === 0) process.exit(0)

// Consider these as code changes requiring a bump reminder
const codePaths = ['src/', 'test/', 'scripts/', 'package.json', 'tsconfig.json']
const hasCodeChanges = staged.some((p) => codePaths.some((cp) => p === cp || p.startsWith(cp)))
if (!hasCodeChanges) process.exit(0)

// If package.json isn't staged, definitely no bump staged
const pkgStaged = staged.includes('package.json')
let hasVersionBump = false
if (pkgStaged) {
  const pkgDiff = run('git diff --cached package.json')
  // look for a staged diff line that bumps the version, e.g. +  "version": "0.5.1"
  hasVersionBump = /\+\s*"version"\s*:\s*"\d+\.\d+\.\d+"/.test(pkgDiff)
}

if (hasVersionBump) process.exit(0)

// Prompt user
// If not interactive (e.g., some IDE git integrations), skip prompt
if (!process.stdin.isTTY) {
  // non-interactive: allow commit to proceed
  process.exit(0)
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const msg = [
  'No version bump detected in package.json for this commit.',
  'It is recommended to bump the version when committing code changes.',
  '',
  'Abort commit to bump the version now? (Y/n): '
].join('\n')

rl.question(msg, (answer) => {
  rl.close()
  const a = (answer || '').trim().toLowerCase()
  const abort = a === '' || a === 'y' || a === 'yes'
  if (abort) {
    console.error('\nCommit aborted. To bump the version, run one of:')
    console.error('  yarn version patch')
    console.error('  yarn version minor')
    console.error('  yarn version major')
    console.error('\nThen recommit and push.')
    process.exit(1)
  }
  // Continue with commit
  process.exit(0)
})
