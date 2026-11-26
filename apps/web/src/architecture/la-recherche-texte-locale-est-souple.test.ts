/**
 * #4400.1 — la recherche texte LOCALE lit le normaliseur de `@bellum/contracts`, pas une sous-chaîne exacte.
 *
 * Retour bêta ESN du 21/10/2026 : « archi cyber » ne trouvait rien alors qu'« architecte cybersécurité »
 * trouvait. Le défaut vivait dans chaque filtre local qui écrivait `x.toLowerCase().includes(needle)`.
 * Cette garde protège la règle (UNE recherche souple, celle de Découvrir), elle ne l'invente pas :
 * elle liste les filtres déjà branchés et refuse qu'un d'eux retombe sur la sous-chaîne exacte.
 *
 * Elle sait dire NON : `readsExactSubstring` est éprouvée sur un mauvais exemple.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(__dirname, '..')

/** Les filtres locaux branchés sur `matchesFlexibleQuery` (besoins, contacts d'un compte, talents, projets). */
const WIRED = [
  'features/projects/portfolio/model/needs.ts',
  'features/accounts/view/account-detail/tabs/contacts/contactGrouping.ts',
  'features/consultants/view/detail/TalentAddToNeedDialog.tsx',
  'features/projects/view/ProjectsPage.tsx',
  'features/matching/view/MatchDrawer.tsx',
] as const

function readsExactSubstring(source: string): boolean {
  return /\.toLowerCase\(\)\.includes\((?:needle|query|search)\b/.test(source)
}

describe('la recherche texte locale est souple (#4400.1)', () => {
  it('la garde sait dire NON : une sous-chaîne exacte est reconnue', () => {
    expect(readsExactSubstring('rows.filter(r => r.label.toLowerCase().includes(needle))')).toBe(true)
    expect(readsExactSubstring('rows.filter(r => matchesFlexibleQuery(needle, r.label))')).toBe(false)
  })

  it.each(WIRED)('%s lit le normaliseur partagé, jamais une sous-chaîne exacte', file => {
    const source = readFileSync(resolve(SRC, file), 'utf8')
    expect(source).toContain('matchesFlexibleQuery')
    expect(readsExactSubstring(source)).toBe(false)
  })
})
