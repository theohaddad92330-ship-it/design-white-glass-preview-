import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * KEVIN-FIX (c) — recette prod 20/10 : la cellule Score de /accounts tenait sur 4 lignes dans ~90 px.
 * Largeur minimale commune à l'en-tête, au squelette et à la ligne ; verdict et « non arbitré » sur une ligne.
 * La garde sait dire NON : l'ancienne largeur (w-20 jusqu'à md) y est refusée.
 */
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8')

describe('liste des comptes — la cellule Décision d’équipe et verdict', () => {
  it.each(['AccountsTableHeaderRow.tsx', 'AccountsTableSkeleton.tsx'])('%s porte la largeur minimale', file => {
    const source = read(file)
    // Refonte Théo (comptes-liste) : la colonne Décision s'aligne à gauche comme la maquette — la largeur minimale reste.
    expect(source).toContain("'w-40 min-w-40'")
    expect(source).not.toContain('w-20 pr-4 text-center')
    expect(source).not.toContain('w-28 min-w-28 text-center')
  })

  it('la ligne garde la même largeur et ne coupe ni le verdict ni « non arbitré »', () => {
    const row = read('AccountTableRow.tsx')
    expect(row).toContain('w-40 min-w-40 overflow-hidden')
    const source = read('AccountDecisionCell.tsx')
    // #4470 — le verdict long retourne à la ligne DANS sa cellule (jamais coupé, jamais débordant) :
    // il ne porte donc plus `whitespace-nowrap`, qui le faisait déborder sur la colonne voisine.
    expect(source).toMatch(/min-w-0 max-w-full break-words tracking-wide/)
    expect(source).not.toMatch(/whitespace-nowrap[^"]*tracking-wide/)
    expect(source).toMatch(/whitespace-nowrap text-\[var\(--bellum-text-muted\)\]"\s+data-testid="score-unarbitrated"/)
  })

  it('KEVIN-FIX — « évaluation indisponible » passe à la ligne, avec sa raison, sans « zéro mesuré »', () => {
    const source = read('AccountDecisionCell.tsx')
    expect(source).toContain('recommendation.unavailableReason')
    expect(source).toContain("t('list.verdictUnavailable')")
    for (const locale of ['fr', 'en']) {
      const json = readFileSync(join(__dirname, `../../../../i18n/locales/${locale}/accounts.json`), 'utf8')
      expect(json).toContain('"verdictUnavailable"')
      expect(json).not.toMatch(/z[ée]ro mesur|zero measur/i)
    }
  })
})
