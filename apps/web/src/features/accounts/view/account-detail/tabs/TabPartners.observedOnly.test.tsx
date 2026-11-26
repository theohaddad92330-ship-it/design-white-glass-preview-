import type { Account, PartnerEvidenceOrigin } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/**
 * #1624 — « SEULEMENT OBSERVÉE » DOIT POUVOIR ÊTRE VRAI SUR UNE VRAIE LIGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ LE 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * `isObservedOnly` exigeait `origins.length === 1 && origins[0] ===
 * 'market_observation'`. `mergePartnerEvidence` (API) ne produit JAMAIS cette
 * forme : elle pousse toujours `workspace_declared` ou `current_inference` à
 * côté. Le prédicat était donc structurellement faux sur `landscape.partners`,
 * et les deux CTA de la modale comme le libellé « Route partenaire
 * potentielle » n'étaient jamais rendus — « du code juste que personne
 * n'atteint », le motif n°1 de ce dépôt.
 *
 * Décision de Louis (16/09/2026) : « seulement observée » veut dire **aucune
 * preuve DÉCLARÉE par l'espace**. Une inférence du produit n'est pas une
 * déclaration de l'équipe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT CES FIXTURES — ET POURQUOI CE N'EST PAS UNE INVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `FORMES_REELLES` est la liste EXHAUSTIVE des combinaisons d'origines qu'une
 * ligne canonique peut porter, et elle n'est pas devinée : elle est énumérée en
 * faisant tourner la vraie fonction, dans
 * `apps/api/src/modules/partners/merge-partner-evidence.spec.ts`
 * (« #1624 — les combinaisons d'origines réellement émises »). Les deux listes
 * doivent rester identiques ; c'est ce test-là qui le dira le jour où la fusion
 * changera de forme.
 *
 * Les trois preuves que cette suite doit rendre :
 *  1. le prédicat est VRAI sur au moins une forme réellement produite ;
 *  2. il est FAUX dès que l'espace a déclaré ou qualifié quelque chose ;
 *  3. elle LIT un corpus non vide — une liste vidée par accident ne peut pas
 *     rendre cette suite verte.
 */

/**
 * Les quatre formes que `mergePartnerEvidence` émet vraiment, et rien d'autre.
 *
 * ⚠️ Typée `PartnerEvidenceOrigin[][]`, PAS `as const` : un `as const` sur des
 * tuples de longueurs et de contenus différents fait de `origins` une UNION de
 * tuples littéraux au fil du `.map()`, et `Array.prototype.includes` distribue
 * alors son paramètre en INTERSECTION des origines de chaque tuple — qui vaut
 * `never` dès que deux formes ne partagent aucune origine (mesuré ici : `tsc`
 * refusait `origins.includes('workspace_declared')`). Le type nominal partagé
 * (`@bellum/contracts`) porte la même exhaustivité sans ce piège.
 */
const FORMES_REELLES: readonly PartnerEvidenceOrigin[][] = [
  ['workspace_declared', 'market_observation'],
  ['market_observation', 'current_inference'],
  ['workspace_declared'],
  ['current_inference'],
]

let landscape: Record<string, unknown> = {}
const calls: { path: string; method?: string; body?: unknown }[] = []

vi.mock('@/lib/api', () => ({
  apiFetch: (args: { path: string; method?: string; body?: unknown }) => {
    calls.push(args)
    if (args.method) return Promise.resolve({})
    return Promise.resolve(landscape)
  },
}))

// ⚠️ Un identifiant DIFFÉRENT par test : `renderWithRouter` partage un
// `QueryClient` de niveau module (voir `TabPartners.evidence.test.tsx`).
let seq = 0
const nextAccount = () => ({ id: `a-observed-${++seq}`, company_name: 'SNCF' }) as Account

/**
 * La ligne canonique par DÉFAUT : détectée par le pipeline et observée par le
 * corpus. `rank`/`relationship` à « unknown », parce que `seedDetectedPartners`
 * écrit littéralement ces deux valeurs pour toute ligne qu'il pose.
 */
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  rank: 'unknown',
  relationship: 'unknown',
  note: null,
  source: 'analysis',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  evidence_origins: ['market_observation', 'current_inference'],
  market_observation_count: 9,
  ...over,
})

beforeEach(() => {
  cleanup()
  calls.length = 0
  landscape = { partners: [], recommendations: [], observed: [] }
})

describe('TabPartners — « seulement observée » sur une ligne que l’API produit (#1624)', () => {
  it('⚠️ le corpus de formes LU n’est pas vide — sinon tout ce fichier est vert sur rien', () => {
    expect(FORMES_REELLES.length).toBeGreaterThanOrEqual(4)
    // La forme que l'ancien prédicat exigeait n'est produite par personne.
    expect(FORMES_REELLES.map(formes => formes.join('+'))).not.toContain('market_observation')
  })

  it('rend les QUATRE formes réelles, et une seule porte « Route partenaire potentielle »', async () => {
    landscape = {
      partners: FORMES_REELLES.map((origins, rang) =>
        partner({
          id: `p-${rang}`,
          name: `ESN ${rang}`,
          evidence_origins: [...origins],
          source: origins.includes('workspace_declared') ? 'declared' : 'analysis',
          market_observation_count: origins.includes('market_observation') ? 9 : null,
        }),
      ),
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    // Le corpus RENDU est non vide et complet : une ligne par forme.
    const lignes = await screen.findAllByTestId(/^partner-row-p-\d$/)
    expect(lignes).toHaveLength(FORMES_REELLES.length)
    // Refonte Théo (23/10) — `.a4-partner-grid` : chaque société est une CARTE de la grille, aucune hors d'elle.
    const grille = screen.getByTestId('partner-grid')
    for (const ligne of lignes) expect(grille).toContainElement(ligne)

    // ① VRAI sur la forme « détectée + observée » — celle que le pipeline pose.
    expect(within(lignes[1]!).getByText('Route partenaire potentielle')).toBeInTheDocument()
    // ② FAUX partout ailleurs : déclarée+observée, déclarée seule, détectée seule.
    expect(screen.getAllByText('Route partenaire potentielle')).toHaveLength(1)
    expect(within(lignes[0]!).getByText('Rang inconnu')).toBeInTheDocument()
    expect(within(lignes[3]!).getByText('Rang inconnu')).toBeInTheDocument()
  })

  it('une QUALIFICATION humaine retire la ligne de « seulement observée »', async () => {
    // `PATCH /accounts/partners/:id` (#2122.46) ne bascule pas `source`, donc
    // les origines ne bougent pas : seul le rang dit qu'une personne a tranché.
    // « Une correction humaine gagne toujours » — l'écran ne réécrit pas par
    // dessus.
    landscape = { partners: [partner({ rank: 'rank2' })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const ligne = await screen.findByTestId('partner-row-p-1')
    expect(within(ligne).getByText('Rang 2')).toBeInTheDocument()
    expect(screen.queryByText('Route partenaire potentielle')).not.toBeInTheDocument()
    // L'interdit LITTÉRAL de l'issue, vérifié tel qu'elle l'écrit.
    expect(screen.queryByText(/Rang 2 disponible/)).not.toBeInTheDocument()
  })

  it('les deux CTA de la modale sont ATTEIGNABLES sur cette ligne', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const modale = await screen.findByRole('dialog')

    expect(within(modale).getByRole('button', { name: /Qualifier la relation avec ALTEN/ })).toBeInTheDocument()
    expect(within(modale).getByRole('link', { name: /Vérifier ALTEN/i })).toBeInTheDocument()
  })

  it('le témoin : une ligne DÉCLARÉE par l’espace ne porte aucun des deux CTA', async () => {
    landscape = {
      partners: [partner({ source: 'declared', evidence_origins: ['workspace_declared', 'market_observation'] })],
      recommendations: [],
      observed: [],
    }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const modale = await screen.findByRole('dialog')

    expect(within(modale).queryByRole('button', { name: /Qualifier la relation avec ALTEN/ })).not.toBeInTheDocument()
    expect(within(modale).queryByRole('link', { name: /Vérifier ALTEN/i })).not.toBeInTheDocument()
  })

  it('⚠️ « Qualifier » de la modale n’appelle JAMAIS le POST qui rend 400 — il ouvre la qualification', async () => {
    // Le défaut qu'on aurait livré en réparant le seul prédicat : `add` fait un
    // `POST /accounts/:id/partners`, refusé par un 400 sur un nom déjà présent
    // — et une ligne canonique est par définition déjà présente.
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ALTEN/i }))
    const modale = await screen.findByRole('dialog')
    await user.click(within(modale).getByRole('button', { name: /Qualifier la relation avec ALTEN/ }))

    expect(calls.filter(call => call.method === 'POST')).toEqual([])
    // …et le formulaire de qualification, lui, est bien ouvert.
    expect(await screen.findByRole('button', { name: /Enregistrer la qualification de ALTEN/i })).toBeInTheDocument()
  })
})
