import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const requiredFiles = [
  'package.json',
  'vite.config.ts',
  '.env.local.example',
  'dev-proxy.config.example.json',
  'start-local.cmd',
  'src/lib/storageNamespace.ts',
]

const sampleFiles = [
  '.env.local.example',
  'dev-proxy.config.example.json',
  'start-local.cmd',
]

const secretPatterns = [
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bghp_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
  /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?(?!your|replace|example|false|true|$)[A-Za-z0-9._-]{16,}/i,
]
const localHardcodedPatterns = [
  /\bfhl\.mom\b/i,
]

const failures = []

async function fileExists(file) {
  try {
    await access(path.join(root, file), constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readText(file) {
  return readFile(path.join(root, file), 'utf8')
}

for (const file of requiredFiles) {
  if (!(await fileExists(file))) failures.push(`missing required file: ${file}`)
}

for (const file of ['dev-proxy.config.example.json', 'dev-proxy.config.json']) {
  if (!(await fileExists(file))) continue
  try {
    JSON.parse(await readText(file))
  } catch (error) {
    failures.push(`invalid JSON: ${file}: ${error.message}`)
  }
}

for (const file of sampleFiles) {
  if (!(await fileExists(file))) continue
  const text = await readText(file)
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      failures.push(`possible secret in sample file: ${file}`)
      break
    }
  }
  for (const pattern of localHardcodedPatterns) {
    if (pattern.test(text)) {
      failures.push(`local-only endpoint in sample file: ${file}`)
      break
    }
  }
}

if (failures.length) {
  console.error('[local-smoke-check] failed')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('[local-smoke-check] ok')
