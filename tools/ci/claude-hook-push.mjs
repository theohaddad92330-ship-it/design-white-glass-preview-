#!/usr/bin/env node
/**
 * Hook `PreToolUse` (Bash) de `.claude/settings.json` — lot `ci/5-process`.
 *
 * Un agent ne pousse pas un commit que `pnpm ci:local` n'a pas vu vert : le
 * témoin `<git-dir>/ci-local-ok` doit porter le SHA de HEAD. Sinon le push est
 * refusé (code 2, message lu par l'agent). Exemptés : suppression de branche
 * (`--delete`, `:branche`) et `--tags`, qui ne poussent aucun code neuf.
 *
 * Entrée : le JSON du hook sur stdin (`tool_input.command`, `cwd`).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** `{ dir }` si la commande est un `git push` à garder (`dir` = argument de `-C`), sinon `null`. */
export function parsePush(command) {
  const m = /(?:^|[;&|(]\s*)git((?:\s+-C\s+("[^"]+"|'[^']+'|\S+))?)\s+push\b([^;&|]*)/s.exec(command.trim())
  if (!m) return null
  const rest = m[3] ?? ''
  if (/\s--(delete|tags)\b|\s-d\b/.test(` ${rest}`)) return null
  const refs = rest.split(/\s+/).filter(a => a && !a.startsWith('-'))
  if (refs.slice(1).some(r => r.startsWith(':'))) return null
  const dir = m[2] ? m[2].replace(/^["']|["']$/g, '') : null
  return { dir }
}

export function pushVerdict({ head, witness }) {
  if (witness && head && witness === head) return { allow: true, message: '' }
  return {
    allow: false,
    message:
      `Push refusé : la porte locale n'a pas vu ce commit vert (témoin ${witness ? witness.slice(0, 10) : 'absent'}, ` +
      `HEAD ${head ? head.slice(0, 10) : '?'}). Lancer \`pnpm ci:local\` (en fond, sortie vers un fichier), corriger ` +
      'ce qui est rouge, puis pousser. Détail : docs/ci.md « Porte locale ».',
  }
}

function git(cwd, args) {
  const out = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return out.status === 0 ? out.stdout.trim() : null
}

function main() {
  let input = {}
  try {
    input = JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return 0
  }
  const push = parsePush(String(input?.tool_input?.command ?? ''))
  if (!push) return 0
  const cwd = resolve(input?.cwd ?? process.cwd(), push.dir ?? '.')
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir'])
  if (!gitDir) return 0
  const head = git(cwd, ['rev-parse', 'HEAD'])
  const file = `${gitDir}/ci-local-ok`
  const witness = existsSync(file) ? readFileSync(file, 'utf8').trim() : null
  const verdict = pushVerdict({ head, witness })
  if (verdict.allow) return 0
  process.stderr.write(`${verdict.message}\n`)
  return 2
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main())
