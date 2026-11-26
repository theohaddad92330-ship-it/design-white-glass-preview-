import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLAN_FEATURE_KEYS } from '@bellum/contracts'

/**
 * Parité entre le contrat de features et la liste recopiée dans l'éditeur de
 * plans du dashboard-manager.
 *
 * Le DM ne dépend pas de `@bellum/contracts` : sa liste de cases à cocher est
 * une COPIE. Une copie qui dérive ne fait pas de bruit — une feature ajoutée au
 * contrat resterait invisible dans le backoffice (donc jamais activable), et une
 * clé supprimée du contrat continuerait à s'afficher en produisant un 400 à
 * l'enregistrement. Même raison d'être et même technique que
 * `dm-plan-proxy-parity.spec.ts` : on lit le fichier comme du texte, parce que
 * c'est une liste littérale qui dérive.
 */
describe('dashboard-manager plan features ↔ PLAN_FEATURE_KEYS parity', () => {
  const EDITOR = join(__dirname, '../../../../dashboard-manager/src/app/facturation/_components/plans-editor.tsx')
  const source = readFileSync(EDITOR, 'utf8')

  /** Les clés de feature que l'éditeur propose. */
  function editorFeatureKeys(): string[] {
    const block = /const PLAN_FEATURES: ReadonlyArray<[^>]*> = \[([\s\S]*?)\n\]/.exec(source)
    if (!block) throw new Error(`PLAN_FEATURES not found in ${EDITOR} — did the editor change shape?`)
    return [...block[1].matchAll(/key: '([^']+)'/g)].map(match => match[1])
  }

  it('propose EXACTEMENT les features du contrat (ni oubli, ni clé morte)', () => {
    expect([...editorFeatureKeys()].sort()).toEqual([...PLAN_FEATURE_KEYS].sort())
  })

  it('nomme chaque feature en FR et en EN (le backoffice est bilingue)', () => {
    const rows = [...source.matchAll(/\{ key: '([^']+)', fr: '([^']+)', en: '([^']+)' \}/g)]
    expect(rows).toHaveLength(PLAN_FEATURE_KEYS.length)
    for (const [, , fr, en] of rows) {
      expect(fr.trim().length).toBeGreaterThan(0)
      expect(en.trim().length).toBeGreaterThan(0)
    }
  })
})
