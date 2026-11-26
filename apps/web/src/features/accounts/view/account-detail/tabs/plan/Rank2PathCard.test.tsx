import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountPartner } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Rank2PathCard } from './Rank2PathCard'

let partners: (AccountPartner & { score: number })[] = []
// #3404.11 / .14 — vide par défaut : aucune relation gouvernée liée, la
// carte se comporte exactement comme avant ce lot.
let partnerRelations: unknown[] = []

vi.mock('@/features/accounts/hooks/useAccountPartnersLandscape', () => ({
  useAccountPartnersLandscape: () => ({ data: { partners } }),
}))

vi.mock('@/features/partner-pipeline/api/partner-pipeline-api', () => ({
  PARTNER_PIPELINE_KEY: ['partners', 'pipeline'],
  fetchPartnerRelations: () => Promise.resolve(partnerRelations),
}))

/** Les cinq critères mesurés et vrais — un rang 2 dont la qualification est
 *  ACHEVÉE, celui qui a le droit de voir le chemin (#2316.22-.27). */
const QUALIFIED: Pick<
  AccountPartner,
  | 'rank2_scope_accessible'
  | 'rank2_brief_precise'
  | 'rank2_contact_accountable'
  | 'rank2_economics_clear'
  | 'rank2_next_steps_ready'
> = {
  rank2_scope_accessible: true,
  rank2_brief_precise: true,
  rank2_contact_accountable: true,
  rank2_economics_clear: true,
  rank2_next_steps_ready: true,
}

function partner(overrides: Partial<AccountPartner & { score: number }> = {}): AccountPartner & { score: number } {
  return {
    id: 'p-1',
    account_id: 'a-1',
    created_at: '2026-09-01T00:00:00.000Z',
    detected_at: null,
    entity_id: null,
    name: 'Sopra Steria',
    rank: 'rank2',
    relationship: 'partner',
    note: null,
    scope: null,
    source: 'declared',
    placements: 2,
    certainty: null,
    score: 60,
    ...QUALIFIED,
    ...overrides,
  }
}

beforeEach(() => {
  partners = []
  partnerRelations = []
})

/**
 * #2646.2 — LE PLAN D'ACTION PROPOSE LE CHEMIN RANG 2 → PREUVE → RANG 1.
 *
 * `account-partner.entity.ts` porte déjà `rank`/`relationship`, mais rien ne
 * le lisait pour PROPOSER quoi que ce soit sur l'onglet Plan : ni chance de
 * réussite, ni score — un CHEMIN nommé (`WORKFLOW_OUTCOME_CATALOG.rank2_to_rank1`,
 * déjà servi par `/action-os/workflows`, sans appelant côté web).
 */
describe('Rank2PathCard (#2646.2)', () => {
  it('propose le chemin quand un partenaire tient le rang 2 sur ce compte', async () => {
    partners = [partner({ name: 'Sopra Steria', rank: 'rank2', relationship: 'partner' })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Sopra Steria/)).toBeInTheDocument()
    // Les TROIS pas du chemin, nommés — jamais une probabilité de réussite.
    expect(screen.getByText(/preuve/i)).toBeInTheDocument()
    expect(screen.queryByText(/%|probabilité|prévisionnel pondéré/i)).not.toBeInTheDocument()
  })

  it('ne s’affiche pas quand aucun partenaire ne tient le rang 2', async () => {
    partners = [partner({ rank: 'rank1', relationship: 'partner' })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText(/Sopra Steria/)).not.toBeInTheDocument()
  })

  it('ignore un rang 2 qui n’est pas un partenaire (concurrent) — pas notre porte', async () => {
    partners = [partner({ rank: 'rank2', relationship: 'competitor' })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(screen.queryByText(/Sopra Steria/)).not.toBeInTheDocument()
  })
})

/**
 * #2316.22-.27 / .36 — LA RÈGLE NO-GO : PAS DE CV NI DE POSITIONNEMENT AVANT
 * QUALIFICATION.
 *
 * Les trois pas du chemin SONT le positionnement — la carte doit donc montrer
 * la checklist des cinq critères, jamais les pas, tant que la qualification
 * n'est pas `go`.
 */
describe('Rank2PathCard — la règle NO-GO du rang 2 (#2316.22-.27 / .36)', () => {
  it('montre la checklist, jamais les trois pas, quand un critère mesuré est absent', async () => {
    partners = [partner({ rank2_brief_precise: false })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Qualifier le rang 2 avant tout CV/i)).toBeInTheDocument()
    expect(screen.getByText(/Brief précis/i)).toBeInTheDocument()
    // Jamais les trois pas du chemin tant que ce n'est pas « go ».
    expect(screen.queryByText(/Réunir la preuve/i)).not.toBeInTheDocument()
  })

  it('nomme chaque critère non mesuré — jamais un score nu, jamais deviné', async () => {
    partners = [
      partner({
        rank2_scope_accessible: null,
        rank2_brief_precise: null,
        rank2_contact_accountable: null,
        rank2_economics_clear: null,
        rank2_next_steps_ready: null,
      }),
    ]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Compte ou périmètre accessible/i)).toBeInTheDocument()
    // Les cinq BADGES disent « Non mesuré », exactement — la phrase de décision
    // en dessous dit « non mesurés » (pluriel) et ne doit pas être comptée ici.
    expect(screen.getAllByText(/^Non mesuré$/i).length).toBe(5)
    expect(screen.queryByText(/Réunir la preuve/i)).not.toBeInTheDocument()
  })

  it('propose le chemin dès que les cinq critères sont mesurés ET vrais', async () => {
    partners = [partner()]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Réunir la preuve/i)).toBeInTheDocument()
    expect(screen.queryByText(/Qualifier le rang 2 avant tout CV/i)).not.toBeInTheDocument()
  })
})

/**
 * #3404.11 / .14 — LE CADRE DE GOUVERNANCE (`partner_relations`), QUAND CETTE
 * PRÉSENCE EN DÉSIGNE UN.
 *
 * « Aucune recommandation ne doit encourager à contourner un partenaire » —
 * une clause de non-sollicitation retire le pas d'accès direct, elle ne le
 * nuance pas.
 */
describe('Rank2PathCard — le cadre de gouvernance (#3404.11 / .14)', () => {
  const relation = (over: Record<string, unknown> = {}) => ({
    id: 'rel-1',
    name: 'Sopra Steria',
    contactName: null,
    nonSolicitation: null,
    governance: {
      marginFloorPercent: null,
      marginSharePercent: null,
      accountOwnership: null,
      ourContactName: null,
    },
    ...over,
  })

  it('retire le pas d’accès direct quand une clause de non-sollicitation est déclarée', async () => {
    partners = [partner({ partner_relation_id: 'rel-1' })]
    partnerRelations = [relation({ nonSolicitation: true })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    // Attendre le texte que seul le rendu APRÈS résolution de la relation
    // liée porte : sans lui, l'assertion suivante pourrait s'exécuter avant
    // que le second rendu (celui qui retire le pas) n'ait eu lieu.
    expect(await screen.findByText(/non-sollicitation/i)).toBeInTheDocument()
    expect(screen.getByText(/Réunir la preuve/i)).toBeInTheDocument()
    expect(screen.queryByText(/Préparer l'approche directe/i)).not.toBeInTheDocument()
  })

  it('garde le pas d’accès direct quand aucune relation liée ne le porte', async () => {
    partners = [partner({ partner_relation_id: null })]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Préparer l'approche directe/i)).toBeInTheDocument()
  })

  it('nomme quand ce rang 2 détruit la marge', async () => {
    partners = [partner({ partner_relation_id: 'rel-1' })]
    partnerRelations = [
      relation({
        governance: { marginFloorPercent: 12, marginSharePercent: 5, accountOwnership: null, ourContactName: null },
      }),
    ]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/détruit la marge/i)).toBeInTheDocument()
  })

  it('nomme qui porte le message quand un propriétaire est déclaré', async () => {
    partners = [partner({ partner_relation_id: 'rel-1' })]
    partnerRelations = [
      relation({
        governance: {
          marginFloorPercent: null,
          marginSharePercent: null,
          accountOwnership: 'ours',
          ourContactName: 'Maëlle Lorquin',
        },
      }),
    ]
    renderWithRouter(<Rank2PathCard accountId="a-1" />)

    expect(await screen.findByText(/Maëlle Lorquin/)).toBeInTheDocument()
  })
})
