import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountBillingCard } from './AccountBillingCard'
import type { AccountRow } from './types'
import type { AccountBillingLens } from './useAccountBillingLens'
import type { AccountExpansionLens } from './useAccountExpansion'
import type { AccountInvoiceReadinessColumn } from './useAccountInvoiceReadiness'
import type { AccountRevenueColumn } from '@/features/propagation/hooks'

/**
 * #1413.2 — « ne pas afficher par défaut des colonnes comme "Prêt à facturer"
 * sous l'angle commercial ; la vue facturation peut, elle, faire remonter les
 * informations financières pertinentes déjà existantes ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux lectures d'argent ont DÉMÉNAGÉ du tableau commercial vers cette
 * carte. Le déménagement ne doit pas perdre en route la seule règle que la
 * colonne portait : « Facturé » disparaît ENTIÈREMENT pour qui n'a aucun droit
 * financier. Une colonne devenue une case de carte est exactement le genre de
 * transport où une conditionnelle s'évapore sans que rien ne rougisse.
 *
 * ⚠️ La garde sait dire NON : le premier test échouerait si la carte rendait le
 * montant inconditionnellement, le second si elle cessait de le rendre du tout.
 */

/* Droit financier présent, aucun montant propagé pour ce compte : la cellule
   rend alors son tiret MOTIVÉ (« aucun mois facturé »), et c'est suffisant ici —
   ce qu'on protège est la présence du LIBELLÉ et la conditionnelle du droit, pas
   le formatage du montant, qui a son propre test (`AccountRevenueCell`). */
const REVENUE_VISIBLE: AccountRevenueColumn = {
  visible: true,
  failed: false,
  canReadFinance: true,
  byAccount: new Map(),
} as unknown as AccountRevenueColumn

const REVENUE_DENIED: AccountRevenueColumn = {
  visible: false,
  failed: false,
  canReadFinance: false,
  byAccount: new Map(),
} as unknown as AccountRevenueColumn

const READINESS: AccountInvoiceReadinessColumn = {
  failed: false,
  get: () => ({ kind: 'none' }) as ReturnType<AccountInvoiceReadinessColumn['get']>,
}

const BILLING: AccountBillingLens = { failed: false, loading: false, get: () => null }
const EXPANSION: AccountExpansionLens = { failed: false, get: () => null } as unknown as AccountExpansionLens

const ROW: AccountRow = {
  id: 'acc-1',
  company_name: 'Edf',
  sector: 'Énergie',
  priority_score: 7,
  status: 'completed',
  created_at: '2026-07-01T00:00:00.000Z',
}

function renderCard(revenue: AccountRevenueColumn) {
  return renderWithRouter(
    <AccountBillingCard row={ROW} billing={BILLING} expansion={EXPANSION} readiness={READINESS} revenue={revenue} />,
  )
}

describe('AccountBillingCard — les deux lectures d’argent, sur l’angle qui les demande', () => {
  it('porte « Prêt à facturer », que le tableau commercial ne montre plus', async () => {
    renderCard(REVENUE_VISIBLE)
    expect(await screen.findByText('Prêt à facturer')).toBeInTheDocument()
  })

  it('porte « Facturé » et son montant quand le droit financier est là', async () => {
    renderCard(REVENUE_VISIBLE)
    expect(await screen.findByText('Facturé')).toBeInTheDocument()
  })

  it('retire ENTIÈREMENT « Facturé » quand le droit manque — pas une case vide', async () => {
    renderCard(REVENUE_DENIED)
    // La carte se rend bien : c'est la seule colonne d'argent qui disparaît.
    expect(await screen.findByText('Prêt à facturer')).toBeInTheDocument()
    expect(screen.queryByText('Facturé')).not.toBeInTheDocument()
  })
})
