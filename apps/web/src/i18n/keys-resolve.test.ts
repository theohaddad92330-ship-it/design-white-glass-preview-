import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DEFAULT_LANGUAGE } from '@/i18n/config'
import { resources } from '@/i18n/resources'

/**
 * Garde : une clé écrite EN DUR dans un `t('…')` doit exister.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 * `parity.test.ts` compare FR et EN : il attrape une clé traduite d'un seul
 * côté. Il ne peut RIEN dire d'une clé absente des DEUX — et c'est ce cas-là
 * qui s'affiche à l'écran, parce qu'i18next rend alors la clé BRUTE. Le
 * 01/09/2026, la carte Odoo affichait littéralement « integrations.disconnect »
 * en production : `t('disconnect')` sous `keyPrefix: 'integrations'` cherchait
 * `settings:integrations.disconnect`, qui n'a jamais existé. Le balayage qui
 * a suivi en a trouvé quatorze autres, dont cinq `aria-label` — invisibles à
 * l'œil, lues telles quelles par un lecteur d'écran.
 *
 * ⚠️ Elle ne voit QUE les clés littérales en apostrophes simples. Un
 * `t(`x.${y}`)` est hors de portée : ce que la garde ne peut pas décider,
 * elle ne le devine pas. C'est une limite, pas un trou — les clés dynamiques
 * sont couvertes par `enum-keys.test.ts`.
 */

const SRC = join(__dirname, '..')
/** La langue de référence : FR est le défaut ET le repli (voir config.ts). */
const CATALOG = resources[DEFAULT_LANGUAGE] as Record<string, unknown>

type Bind = { namespaces: string[]; keyPrefix: string | null }

/**
 * Les commentaires sortent AVANT la lecture : celui qui documente ce défaut
 * cite la clé fautive, et une garde qui lit ses propres explications
 * s'auto-accuse. Le `(?<!:)` épargne le `//` d'une URL — sans lui, une ligne
 * qui contient `https://…` verrait tout ce qui suit disparaître, y compris un
 * vrai `t('…')`.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    // Les tests eux-mêmes portent des clés d'EXEMPLE, volontairement fausses.
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/** `useTranslation(...)` → les namespaces liés et le préfixe éventuel. */
function bindsOf(source: string): Map<string, Bind[]> {
  const binds = new Map<string, Bind[]>()
  const pattern =
    /const\s*\{\s*t(?::\s*(\w+))?[^}]*\}\s*=\s*useTranslation\(\s*(\[[^\]]*\]|'[^']*')?\s*(?:,\s*\{[^}]*?keyPrefix:\s*'([^']+)'[^}]*\})?\s*\)/g
  for (const match of source.matchAll(pattern)) {
    const alias = match[1] ?? 't'
    const rawNs = match[2]
    const namespaces = rawNs
      ? [...rawNs.matchAll(/'([^']+)'/g)].map(m => m[1])
      : // `useTranslation()` sans argument tombe sur le namespace par défaut.
        ['common']
    const list = binds.get(alias) ?? []
    list.push({ namespaces, keyPrefix: match[3] ?? null })
    binds.set(alias, list)
  }
  return binds
}

function lookup(namespace: string, path: string): boolean {
  const tree = CATALOG[namespace]
  if (!tree) return false
  const walk = (candidate: string): unknown => {
    let cursor: unknown = tree
    for (const part of candidate.split('.')) {
      if (typeof cursor !== 'object' || cursor === null || !(part in (cursor as Record<string, unknown>)))
        return undefined
      cursor = (cursor as Record<string, unknown>)[part]
    }
    return cursor
  }
  if (walk(path) !== undefined) return true
  // Les pluriels i18next : la clé nue n'existe pas, ses variantes oui.
  return ['_one', '_other', '_zero', '_two', '_few', '_many'].some(suffix => typeof walk(path + suffix) === 'string')
}

/** Les clés d'un fichier qui ne se résolvent nulle part. Exportée pour la
 *  preuve que la garde sait dire NON. */
export function unresolvedKeys(rawSource: string): string[] {
  const source = stripComments(rawSource)
  const binds = bindsOf(source)
  const missing: string[] = []
  for (const [alias, pairs] of binds) {
    const call = new RegExp(`\\b${alias}\\(\\s*'([^']+)'((?:\\s*,\\s*\\{[^}]*\\})?)`, 'g')
    for (const match of source.matchAll(call)) {
      const key = match[1]
      const options = match[2] ?? ''
      // `t('clé', { ns: 'autre' })` change le namespace pour CET appel.
      const override = /\bns:\s*'([^']+)'/.exec(options)?.[1] ?? null
      const candidates: Array<[string, string]> = []
      if (key.includes(':')) {
        const [ns, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
        candidates.push([ns, rest])
      }
      for (const bind of pairs) {
        const full = bind.keyPrefix ? `${bind.keyPrefix}.${key}` : key
        for (const ns of override ? [override] : bind.namespaces) candidates.push([ns, full])
        // Un `ns` explicite ignore le `keyPrefix` du hook.
        if (override) candidates.push([override, key])
      }
      if (!candidates.some(([ns, path]) => lookup(ns, path))) missing.push(key)
    }
  }
  return missing
}

describe('les clés littérales de `t()` existent', () => {
  const files = sourceFiles(SRC)

  it('lit un corpus non vide', () => {
    // Sans ce plancher, un `sourceFiles` cassé rendrait la garde verte à vide.
    expect(files.length).toBeGreaterThan(400)
    const calls = files.reduce(
      (total, file) => total + (readFileSync(file, 'utf8').match(/\bt\w*\(\s*'/g) ?? []).length,
      0,
    )
    expect(calls).toBeGreaterThan(2000)
  })

  it('sait dire NON', () => {
    const fake = `const { t } = useTranslation('common')\nconst x = t('cette.cle.nexiste.pas')`
    expect(unresolvedKeys(fake)).toEqual(['cette.cle.nexiste.pas'])
    const real = `const { t } = useTranslation('common')\nconst x = t('actions.disconnect')`
    expect(unresolvedKeys(real)).toEqual([])
    // Une clé CITÉE dans un commentaire n'est pas une clé appelée.
    const commented = `const { t } = useTranslation('common')\n/* jadis t('cle.morte') */\nconst x = t('actions.connect')`
    expect(unresolvedKeys(commented)).toEqual([])
  })

  it('aucune clé écrite en dur ne manque au catalogue', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const key of unresolvedKeys(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(SRC, file)} → ${key}`)
      }
    }
    expect(offenders, 'clés absentes du catalogue FR').toEqual([])
  })
})
