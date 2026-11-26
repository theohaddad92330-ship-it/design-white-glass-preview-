import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// #3591 — « supprime, ça n'a aucune valeur ajoutée » : la carte « Organigramme
// revérifié » ne s'affiche plus sous l'organigramme. La revérification reste dite
// là où l'actualisation est racontée (`RefreshOutcomeCard`, qui lit le même diff).
describe('#3591 — pas de carte de revérification sous l’organigramme', () => {
  const source = readFileSync(join(__dirname, 'TabOrganigramme.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('TabOrganigramme ne monte plus OrgPeopleRefreshDiffCard', () => {
    expect(source).not.toContain('OrgPeopleRefreshDiffCard')
  })

  it('le composant orphelin est supprimé', () => {
    expect(existsSync(join(__dirname, 'organigramme', 'OrgPeopleRefreshDiffCard.tsx'))).toBe(false)
  })
})
