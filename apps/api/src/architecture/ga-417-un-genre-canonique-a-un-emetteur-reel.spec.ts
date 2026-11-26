import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { INTERVENTION_KINDS, TRIGGER_CATALOG, canonicalTriggerKindValues } from '@bellum/contracts'

/**
 * GA-417 — #2875 (#2402.1) : chaque genre de `canonical_trigger_events` a un
 * ÉMETTEUR réel, et le catalogue ne porte aucun genre que la table refuserait.
 * « Du code juste, testé, que personne n'appelle » (CLAUDE.md) : un genre
 * ajouté à la liste fermée (donc à la contrainte SQL) sans appelant de
 * `buildTriggerEvent` est un genre mort — cette garde le nomme.
 *
 * Elle protège une règle déjà inscrite (GA-389 garde « hors catalogue »,
 * celle-ci garde « sans émetteur »), elle n'en invente pas.
 *
 * Preuves : SAIT DIRE NON (fixture sans émetteur), LIT (fichiers réels
 * énumérés, > 10), N'ATTRAPE PAS ce qu'elle ne vise pas (un genre cité en
 * commentaire ne compte pas).
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
}

/** Vrai si `source` émet le genre `kind` : le littéral `'<kind>'` (hors
 *  commentaire) dans un fichier qui appelle `buildTriggerEvent(`. Le genre peut
 *  passer par une variable (`type: draft.kind`, `type: kind`) : on exige le
 *  littéral dans le même fichier que l'appel, pas la forme de l'argument. */
export function emitsKind(source: string, kind: string): boolean {
  const code = stripComments(source)
  return code.includes('buildTriggerEvent(') && code.includes(`'${kind}'`)
}

function productionFiles(): string[] {
  const out = execFileSync('git', ['ls-files', 'apps/api/src/modules'], { cwd: REPO_ROOT, encoding: 'utf8' })
  return out
    .split('\n')
    .filter(file => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.test.ts'))
}

describe('GA-417 — #2875 : un genre canonique a un émetteur réel', () => {
  it('SAIT DIRE NON : un genre sans buildTriggerEvent, ou seulement cité en commentaire, n’a pas d’émetteur', () => {
    expect(emitsKind(`buildTriggerEvent({ type: 'credit_low' })`, 'credit_low')).toBe(true)
    expect(emitsKind(`const x = { type: 'credit_low' }`, 'credit_low')).toBe(false)
    expect(emitsKind(`// 'credit_low'\nbuildTriggerEvent({ type: 'autre' })`, 'credit_low')).toBe(false)
    expect(emitsKind(`const k = 'affaire_perdue'\nbuildTriggerEvent({ type: k })`, 'affaire_perdue')).toBe(true)
  })

  const files = productionFiles()
  const sources = files.map(file => readFileSync(join(REPO_ROOT, file), 'utf8'))

  it('LIT quelque chose : les fichiers de production sont énumérés', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  const interventionKinds = new Set<string>(INTERVENTION_KINDS)
  const hasEmitter = (kind: string) => sources.some(source => emitsKind(source, kind))

  it('chaque genre non-intervention de la liste fermée a un émetteur qui construit un `type` littéral', () => {
    const orphans = canonicalTriggerKindValues.filter(kind => !interventionKinds.has(kind) && !hasEmitter(kind))
    // Le message nomme les orphelins : la liste vide EST l'assertion.
    expect(orphans.join(', ')).toBe('')
  })

  it('les natures d’intervention passent par UN émetteur générique (toTriggerEvent) qui construit ET persiste', () => {
    const sweeper = stripComments(
      readFileSync(join(REPO_ROOT, 'apps/api/src/modules/playbooks/interventions.sweeper.ts'), 'utf8'),
    )
    expect(sweeper).toContain('buildTriggerEvent(')
    expect(sweeper).toMatch(/type:\s*draft\.kind/)
    expect(sweeper).toMatch(/\.recordOnceByDedupeKey\(/)
  })

  it('chaque genre de la liste fermée est au catalogue, `unified`', () => {
    const missing = canonicalTriggerKindValues.filter(kind => TRIGGER_CATALOG[kind]?.status !== 'unified')
    expect(missing).toEqual([])
  })
})
