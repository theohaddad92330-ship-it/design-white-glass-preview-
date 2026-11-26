import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1119 — « La notification ne disparaît pas. »
 *
 * `toast.loading()` de sonner est PERMANENT. Quand on le remplace par son
 * résultat en réutilisant le même `id`, sonner MET À JOUR le toast existant :
 * tout champ non redonné est conservé — `duration` comprise. Un
 * `toast.success(msg, { id })` sans `duration` hérite donc de l'infini et reste
 * à l'écran pour toujours.
 *
 * Rien ne le signale : pas d'erreur, pas de test rouge, un toast bien rendu.
 * D'où cette garde, qui LIT le code et sait dire non.
 *
 * Elle ne surveille QUE les fichiers qui utilisent `toast.loading` : ailleurs,
 * un toast sans durée prend simplement le défaut de sonner, ce qui est correct.
 */

const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (entry === 'node_modules' || entry.startsWith('.')) return []
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.(spec|test)\.tsx?$/.test(entry) ? [full] : []
  })
}

/** Les appels `toast.<kind>(…, { … id … })` d'un fichier, avec leurs options. */
function toastUpdates(source: string): string[] {
  const out: string[] = []
  const call = /toast\.(success|error|message|warning|info)\s*\(/g
  let match: RegExpExecArray | null
  // `exec` avec le drapeau `g` est STATEFUL — c'est voulu ici (on itère), et
  // c'est précisément le piège qui a rendu une garde borgne en août : on ne
  // réutilise JAMAIS ce `RegExp` ailleurs.
  while ((match = call.exec(source)) !== null) {
    // On lit jusqu'à la parenthèse fermante correspondante, en comptant.
    let depth = 0
    let i = match.index + match[0].length - 1
    for (; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1
      else if (source[i] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    out.push(source.slice(match.index, i + 1))
  }
  return out
}

describe('GA — un toast qui remplace un chargement redonne sa durée (#1119)', () => {
  const files = sourceFiles(SRC).filter(file => readFileSync(file, 'utf8').includes('toast.loading('))

  it('surveille bien quelque chose', () => {
    // Une garde qui ne lit rien est verte pour toujours.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map(file => [file.slice(SRC.length + 1), file]))(
    '%s : chaque toast identifié porte une durée',
    (_label, file) => {
      const source = readFileSync(file, 'utf8')
      const guilty = toastUpdates(source).filter(call => /\bid:/.test(call) && !/\bduration:/.test(call))

      expect(guilty).toEqual([])
    },
  )
})
