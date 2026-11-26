import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { Route as ExpensesBaremeRoute } from '../expenses/bareme'
import { Route as ExpensesRoute } from '../expenses/index'
import { Route as CessionsRoute } from './cessions'
import { Route as PaiementsRoute } from './paiements'

/**
 * Refonte Théo PR12 — les adresses du lot qui n'ont PLUS d'écran propre : aucune ne garde l'ancien
 * dessin, chacune mène à l'écran refondu qui porte désormais sa fonction (« on archive, on ne
 * supprime pas » : l'adresse survit pour ses liens entrants, `replace` pour que « précédent » ne
 * reboucle pas).
 */
function redirectOf(beforeLoad: unknown): { to?: string; hash?: string; search?: unknown; replace?: boolean } {
  try {
    ;(beforeLoad as () => void)()
  } catch (thrown) {
    if (isRedirect(thrown)) return thrown.options as { to?: string; hash?: string; search?: unknown; replace?: boolean }
    throw thrown
  }
  throw new Error('aucune redirection levée')
}

describe('PR12 — les anciennes adresses mènent aux écrans refondus', () => {
  it('/missions/cessions → la section « Cessions » de la Vue financière', () => {
    expect(redirectOf(CessionsRoute.options.beforeLoad)).toMatchObject({
      to: '/missions/finance',
      hash: 'cessions',
      replace: true,
    })
  })
  it('/missions/paiements → « Ce qui sort » de la Vue financière (A4 : Paiements y est fondu)', () => {
    expect(redirectOf(PaiementsRoute.options.beforeLoad)).toMatchObject({
      to: '/missions/finance',
      hash: 'sorties',
      replace: true,
    })
  })
  it('/expenses → l’onglet Notes de frais de Missions', () => {
    expect(redirectOf(ExpensesRoute.options.beforeLoad)).toMatchObject({
      to: '/missions/notes-de-frais',
      replace: true,
    })
  })
  it('/expenses/bareme → Réglages › Règles métier › Frais (un réglage, un endroit)', () => {
    expect(redirectOf(ExpensesBaremeRoute.options.beforeLoad)).toMatchObject({
      to: '/settings/workspace-rules',
      search: { onglet: 'frais' },
      replace: true,
    })
  })
})
