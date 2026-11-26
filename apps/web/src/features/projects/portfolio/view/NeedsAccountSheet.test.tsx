import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProjectRow } from '@bellum/contracts'
import { i18n } from '@/i18n'
import type { AccountNeeds } from '../model/needs'

/** A materialized besoin mounts ProjectStageControl (a mutation hook),
 *  so these renders need a QueryClient even though nothing is fetched on mount. */
function renderSheet(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

vi.mock('@/features/accounts/hooks/useRefreshDimension', () => ({
  useRefreshDimension: () => ({ isPending: false, mutate: vi.fn() }),
}))

// The sheet fetches materialized opportunities (session + query client) to show
// the lifecycle + CRM export. This layout test drives that path through a mutable
// stub so we can render both the non-materialized and materialized cases.
let opportunitiesStub: ProjectRow[] = []
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({ data: opportunitiesStub }),
}))

// L'export CRM est une mutation (query client) — testé pour de vrai dans
// useExportProjectToCrm.test ; ici on stube pour un test de mise en page.
vi.mock('@/features/projects/hooks/useExportProjectToCrm', () => ({
  useExportProjectToCrm: () => ({ isPending: false, mutate: vi.fn() }),
}))

// « Ajouter au plan » écrit sur le dossier (mutation + query client) : stubé ici,
// le corps envoyé est vérifié plus bas (#2123.46), l'écriture l'est dans
// `usePersistAccountPlan.test.tsx`.
const addAction = vi.fn((_input: unknown) => Promise.resolve())
vi.mock('@/features/accounts/hooks/usePersistAccountPlan', () => ({
  usePersistAccountPlan: () => ({ addAction, addAngle: vi.fn(), isPending: false }),
}))

const { NeedsAccountSheet } = await import('./NeedsAccountSheet')

/** A materialized opportunity that JOINS the fixture need (same account/kind/label). */
const materializedOpportunity: ProjectRow = {
  id: 'opp-1',
  account_id: 'acc-1',
  company_name: 'Acme Industries',
  sector: 'Industrie',
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration cloud à mener',
  detail: null,
  offer: 'Cloud',
  source: 'analysis',
  confidence: 'high',
  urgency: 'high',
  stage: 'detected',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

const entry: AccountNeeds = {
  accountId: 'acc-1',
  companyName: 'Acme Industries',
  sector: 'Industrie',
  score: 7.4,
  updatedAt: null,
  topUrgency: 'high',
  offers: ['Cloud'],
  needs: [
    {
      id: 'n-1',
      kind: 'pain',
      label: 'Migration cloud à mener',
      detail: null,
      offer: 'Cloud',
      timeframe: null,
      urgency: 'high',
    },
  ],
}

/**
 * Le bouton de fermeture du Sheet est rendu HORS FLUX (`absolute top-4 right-4`,
 * icône `size-4`) : il occupe la bande 16→32 px depuis le bord droit du panneau.
 * L'en-tête, lui, dispose son contenu en flux — il doit donc réserver lui-même
 * la gouttière, sinon tout élément aligné à droite passe SOUS la croix.
 *
 * Géométrie : l'en-tête est en `p-5` (20 px) ; le `pr-6` (24 px) de la rangée
 * porte la frontière du contenu à 44 px, au-delà des 32 px du bouton.
 */
describe('NeedsAccountSheet — en-tête', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('réserve la gouttière du bouton de fermeture pour le badge d’urgence', () => {
    renderSheet(<NeedsAccountSheet entry={entry} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    const title = screen.getByText('Acme Industries')
    const row = title.closest('[data-slot="sheet-header"]')?.firstElementChild

    expect(row).not.toBeNull()
    expect(row?.className).toMatch(/\bpr-6\b/)
  })
})

/**
 * Règle maison : aucun bouton sans endpoint. « Créer un rappel » écrit sur le
 * COMPTE (l'Action Router accepte un `accountId`), il est donc toujours offert ;
 * « Ce besoin ailleurs » (`/opportunities/:id/similar`) et « Ajouter au CRM »
 * (`/opportunities/:id/export-crm`) exigent tous deux un besoin MATÉRIALISÉ —
 * sans ligne en base, il n'y a pas d'id, donc pas de bouton. La génération d'un
 * angle vit sur l'onglet Plan du compte, jamais dans ce panneau.
 */
describe('NeedsAccountSheet — actions du besoin', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    opportunitiesStub = []
  })

  it('offre le rappel sur tout besoin ; ni comparaison ni export CRM sans besoin matérialisé', () => {
    opportunitiesStub = []
    renderSheet(<NeedsAccountSheet entry={entry} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Créer un rappel' })).toBeInTheDocument()
    // Aucun besoin matérialisé → pas d'id à comparer, exporter ni à chiffrer.
    expect(screen.queryByRole('button', { name: 'Ce besoin ailleurs' })).toBeNull()
    expect(screen.queryByRole('button', { name: /CRM/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /montant/i })).toBeNull()
  })

  it('offre comparaison, export CRM ET saisie du montant dès que le besoin est matérialisé', () => {
    opportunitiesStub = [materializedOpportunity]
    renderSheet(<NeedsAccountSheet entry={entry} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Ce besoin ailleurs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter au CRM' })).toBeInTheDocument()
    // Montant d'affaire estimé (cockpit §10 — pipeline valorisé) : proposé dès qu'il
    // y a un id à persister, jamais prérempli d'un 0.
    expect(screen.getByRole('button', { name: 'Ajouter un montant estimé' })).toBeInTheDocument()
  })

  // #2123.46 — le besoin devient une LIGNE du plan, avec son résultat attendu.
  // L'identifiant du besoin (`acc-1:pain:0`) est une POSITION dans l'analyse,
  // pas un objet du référentiel des besoins : il n'est pas donné comme objet
  // visé — l'écran nommera le manque plutôt que de pointer vers rien.
  it('#2123.46 — « Ajouter au plan » écrit le besoin avec son résultat attendu, sans objet deviné', async () => {
    opportunitiesStub = []
    addAction.mockClear()
    renderSheet(<NeedsAccountSheet entry={entry} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    screen.getByRole('button', { name: 'Ajouter au plan' }).click()

    expect(addAction).toHaveBeenCalledWith({
      label: 'Qualifier le besoin : Migration cloud à mener',
      reason: 'Savoir si « Migration cloud à mener » est un vrai besoin, et qui le porte',
      target: null,
      expected_outcome: "Besoin confirmé ou écarté, avec l'interlocuteur qui le porte",
    })
  })

  it("n'affiche jamais de bouton de génération d'angle (il vit sur l'onglet Plan)", () => {
    opportunitiesStub = [materializedOpportunity]
    renderSheet(<NeedsAccountSheet entry={entry} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /angle/i })).toBeNull()
  })
})
