import { orgGraphSchema, type AccountMarketContext, type OrgGraph } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { GroupOrgView } from './GroupOrgView'

/**
 * #2837 — même mock que `OrgInfluenceMap.test.tsx` : un état par défaut
 * silencieux (« Non mesuré ») pour ne perturber aucun test existant de ce
 * fichier, qui n'attendent rien de la mémoire marché.
 */
type MarketMemoryQueryState = { data?: AccountMarketContext | null; isPending: boolean; isError: boolean }
const marketMemoryState: { current: MarketMemoryQueryState } = {
  current: { data: undefined, isPending: false, isError: false },
}
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => marketMemoryState.current,
}))

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const SOURCE = { id: 's-off', kind: 'official_site' as const, grounding: 'A' as const, date: '2026-08-01' }

function graph(over: Record<string, unknown> = {}): OrgGraph {
  return orgGraphSchema.parse({
    graphVersion: 4,
    entities: [
      { id: 'e-grp', name: 'AIRBUS SE', type: 'groupe', parentId: null, confidence: 95, sources: [SOURCE] },
      { id: 'e-ds', name: 'Defence & Space', type: 'filiale', parentId: 'e-grp', confidence: 90, sources: [SOURCE] },
      { id: 'e-heli', name: 'Helicopters', type: 'filiale', parentId: 'e-grp', confidence: 88, sources: [] },
    ],
    people: [
      {
        id: 'p-1',
        fullName: 'Michael Schoellhorn',
        title: 'CEO Defence & Space',
        entityId: 'e-ds',
        hierarchyLevel: 'L1',
        decisionRoles: ['economic_buyer'],
        identityStatus: 'actionable',
        confidence: 92,
        sources: [SOURCE],
      },
      {
        id: 'p-2',
        fullName: 'Bruno Even',
        title: 'CEO Helicopters',
        entityId: 'e-heli',
        hierarchyLevel: 'L1',
        decisionRoles: [],
        identityStatus: 'classified',
        confidence: 70,
        sources: [],
      },
    ],
    hierarchyEdges: [],
    influenceEdges: [],
    ...over,
  })
}

const label = (key: string, options?: Record<string, unknown>) => i18n.t(`accountOrg:${key}`, options ?? {}) as string

/**
 * LA VUE GROUPE — une maquette écartée le 30/08, rétablie EN VUE le 31/08.
 *
 * Ce que ces tests tiennent : la structure est CLIQUABLE (donc tabulable), le
 * panneau qualité ne fabrique aucun pourcentage, et le trait entre deux entités
 * ne se fait jamais passer pour un rattachement observé.
 */
describe('GroupOrgView', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le corpus n’est pas vide — trois entités, deux personnes', () => {
    expect(graph().entities).toHaveLength(3)
    expect(graph().people).toHaveLength(2)
  })

  it('dessine l’arbre des entités, racine d’abord', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    const rows = screen.getAllByRole('button')
    expect(rows[0]).toHaveTextContent('AIRBUS SE')
    expect(screen.getByText('Defence & Space')).toBeInTheDocument()
    expect(screen.getByText('Helicopters')).toBeInTheDocument()
  })

  // Recette démo Orange 12/10/2026 — « 0 dans le périmètre · 0 rattachés » sur chaque entité : une entité où le graphe ne
  // place personne ne dit pas « 0 » (ce serait affirmer qu'elle est vide), elle dit ce que le graphe sait.
  it('une entité sans personne placée ne s’écrit jamais « 0 dans le périmètre · 0 rattachés »', () => {
    render(<GroupOrgView graph={graph({ people: [] })} onOpenEntity={() => {}} />)
    expect(screen.queryByText(/^0 dans le périmètre/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Aucune personne placée dans l’organigramme').length).toBeGreaterThanOrEqual(3)
  })

  it('une entité qui porte des personnes garde ses deux comptes', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    expect(screen.getAllByText(/\d+ dans le périmètre · \d+ rattachés directement/).length).toBeGreaterThanOrEqual(2)
  })

  it('une entité s’OUVRE — et c’est un bouton, donc ça se tabule', async () => {
    const user = userEvent.setup()
    const onOpenEntity = vi.fn()
    render(<GroupOrgView graph={graph()} onOpenEntity={onOpenEntity} />)
    const target = screen.getByText('Defence & Space').closest('button') as HTMLButtonElement
    target.focus()
    await user.keyboard('{Enter}')
    expect(onOpenEntity).toHaveBeenCalledWith('e-ds')
  })

  // #2284.6 — GA-26 : le kind AFFINE le type, il ne s'y ajoute pas — un badge.
  it('une marque rangée en filiale se dit « Marque », et plus « Filiale » (un seul badge)', () => {
    const g = graph()
    const entities = g.entities.map(e => (e.id === 'e-heli' ? { ...e, entityKind: 'brand' as const } : e))
    render(<GroupOrgView graph={{ ...g, entities }} onOpenEntity={() => {}} />)
    const row = screen.getByText('Helicopters').closest('li') as HTMLElement
    const brand = i18n.t('accountDetail:overview.entityResolution.kind.brand') as string
    expect(within(row).getByText(brand)).toBeInTheDocument()
    expect(within(row).queryByText(label('entityType.filiale'))).toBeNull()
    // Le témoin sans kind garde son type : la garde ne vide pas tout.
    const ds = screen.getByText('Defence & Space').closest('li') as HTMLElement
    expect(within(ds).getAllByText(label('entityType.filiale')).length).toBeGreaterThan(0)
  })

  it('le trait vers le parent dit « appartenance », pas « rattachement sourcé »', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    // Deux filiales ⇒ deux traits de structure. La racine n'en a aucun.
    expect(screen.getAllByText(label('orgMap.link.structure'))).toHaveLength(2)
    expect(screen.queryByText(label('orgMap.link.sourced'))).toBeNull()
  })

  it('« contacts rattachés » n’affiche pas 0 % — le contrat ne le mesure pas', () => {
    render(<GroupOrgView graph={graph()} discovered={2241} onOpenEntity={() => {}} />)
    const panel = screen.getByRole('group', { name: label('group.qualityTitle') })
    expect(within(panel).getByText(label('group.quality.attached'))).toBeInTheDocument()
    // Une part non mesurable se DIT ; « 0 % » affirmerait que personne ne l'est.
    expect(within(panel).queryByText('0 %')).toBeNull()
    // La phrase porte AUSSI sa raison, d'où le motif plutôt que l'égalité :
    // « non mesuré » répond à « combien ? », pas à « pourquoi je ne sais pas ? ».
    expect(within(panel).getAllByText(new RegExp(i18n.t('common:unknownValue'))).length).toBeGreaterThan(0)
  })

  /**
   * #2499 — DÉFAUT recette 17/09 (passage 7) : `GroupOrgView.tsx:212`, le `dd`
   * porte `shrink-0` SANS que la ligne accepte de passer à la ligne — sur un
   * texte long (« non mesuré — aucune analyse ne mesure encore le
   * rattachement », 288 px de large mesurés en recette), la valeur écrase le
   * libellé (`dt`). Cause racine documentée du dépôt (`CLAUDE.md`, règle
   * mobile) : `min-width: auto` sur un enfant de flex est le premier
   * responsable des débordements horizontaux ; ici c'est son jumeau côté
   * largeur MAXIMALE (`shrink-0` fige l'item à sa largeur de contenu, qui peut
   * dépasser le conteneur). Le couple correct — déjà posé ailleurs dans ce
   * dépôt, `DossierReadBlocks.tsx` — est `flex-wrap` sur la ligne et
   * `min-w-0` (jamais `shrink-0`) sur la valeur, pour qu'un texte long passe
   * à la ligne plutôt que de déborder.
   */
  it('#2499 — une raison longue ne déborde jamais : la ligne peut passer à la ligne', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    const panel = screen.getByRole('group', { name: label('group.qualityTitle') })
    const reasonText = within(panel).getAllByText(new RegExp(i18n.t('common:unknownValue')))[0]
    const row = reasonText.closest('dd')
    expect(row).not.toBeNull()
    expect(row?.className ?? '').not.toContain('shrink-0')
    expect(row?.className ?? '').toContain('min-w-0')
    const line = row?.parentElement
    expect(line?.className ?? '').toContain('flex-wrap')
  })

  it('une part MESURÉE s’affiche — les deux personnes portent un niveau', () => {
    const panel = () => screen.getByRole('group', { name: label('group.qualityTitle') })
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    expect(within(panel()).getByText(label('group.quality.leveled'))).toBeInTheDocument()
    expect(within(panel()).getByText('100 %')).toBeInTheDocument()
  })

  // Louis 13/10/2026 — même règle que le bandeau (#4090) : sans arête, pas de « 0 liens vérifiés / 0 zones à couvrir ».
  it('un graphe SANS arête : le panneau qualité ne montre ni « liens vérifiés » ni « zones à couvrir »', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    const panel = screen.getByRole('group', { name: label('group.qualityTitle') })
    expect(within(panel).queryByText(label('focal.coverage.verifiedLinks'))).toBeNull()
    expect(within(panel).queryByText(label('focal.coverage.uncoveredZones'))).toBeNull()
    expect(within(panel).getByText(label('focal.coverage.noHierarchy'))).toBeInTheDocument()
  })

  it('#4805 — sans aucune entité, la vue NOMME l’absence au lieu de disparaître', () => {
    render(<GroupOrgView graph={graph({ entities: [], people: [] })} onOpenEntity={() => {}} />)
    expect(screen.getByTestId('org-view-absence')).toHaveTextContent(i18n.t('accountOrg:absence.view'))
  })
})

/**
 * #2310.54 — corriger une ENTITÉ, pas seulement une personne.
 *
 * La vue Groupe est celle des cinq qui EXPOSE des entités (`EntityRow`) ; elle
 * n'ouvrait jusqu'ici que la navigation (`onOpenEntity`), jamais le tiroir de
 * correction. Le contrat et la route API acceptaient déjà `objectType:
 * 'entity'` — seul cet écran n'avait aucun geste pour l'atteindre.
 */
describe('#2310.54 — corriger une entité depuis la vue Groupe', () => {
  beforeEach(async () => {
    vi.mocked(apiFetch).mockReset()
    await i18n.changeLanguage('fr')
  })

  it('sans `accountId`, aucun bouton mort — on n’affiche pas un geste qu’on ne peut pas brancher', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    expect(screen.queryByText(i18n.t('accountOrg:group.correctEntity'))).toBeNull()
  })

  it('chaque entité porte un geste « Corriger », qui ouvre le tiroir sur SES champs — pas ceux d’une personne', async () => {
    const user = userEvent.setup()
    render(withQueryClient(<GroupOrgView graph={graph()} onOpenEntity={() => {}} accountId="acc-1" />))
    const row = screen.getByText('Defence & Space').closest('li') as HTMLLIElement
    await user.click(within(row).getByText(i18n.t('accountOrg:group.correctEntity')))

    expect(screen.getByText(i18n.t('accountOrg:correction.title', { name: 'Defence & Space' }))).toBeInTheDocument()
    // Les champs proposés sont ceux d'une ENTITÉ (nom, entité parente) — jamais
    // un champ de personne (titre, N+1…).
    expect(screen.getByText(i18n.t('accountOrg:correction.fields.name'))).toBeInTheDocument()
    expect(screen.queryByText(i18n.t('accountOrg:correction.fields.title'))).toBeNull()
  })

  it('la correction envoyée porte `objectType: "entity"` — jamais « person » écrit en dur', async () => {
    const user = userEvent.setup()
    vi.mocked(apiFetch).mockResolvedValue({ graphVersion: 5, corrections: [], applied: true })
    render(withQueryClient(<GroupOrgView graph={graph()} onOpenEntity={() => {}} accountId="acc-1" />))
    const row = screen.getByText('Helicopters').closest('li') as HTMLLIElement
    await user.click(within(row).getByText(i18n.t('accountOrg:group.correctEntity')))
    await user.type(screen.getByLabelText(i18n.t('accountOrg:correction.newLabel')), 'Airbus Helicopters')
    await user.type(
      screen.getByLabelText(i18n.t('accountOrg:correction.reasonLabel')),
      'Nom légal relevé sur le registre.',
    )
    await user.click(screen.getByRole('button', { name: i18n.t('accountOrg:correction.submit') }))

    expect(apiFetch).toHaveBeenCalledTimes(1)
    const call = vi.mocked(apiFetch).mock.calls[0]?.[0] as {
      body: { objectType: string; objectId: string; claims: { field: string }[] }
    }
    expect(call.body.objectType).toBe('entity')
    expect(call.body.objectId).toBe('e-heli')
    expect(call.body.claims[0]?.field).toBe('name')
  })
})

/**
 * #2837 — la ligne mémoire marché, RACINE seulement (même règle que la carte
 * système `OrgInfluenceMap`, GA-391 : `market_company_signal` est un agrégat
 * par ENTREPRISE, jamais ventilé par filiale).
 */
describe('#2837 — la ligne mémoire marché ne se pose que sur la racine', () => {
  beforeEach(() => {
    marketMemoryState.current = {
      data: { paths_observed: 4 } as AccountMarketContext,
      isPending: false,
      isError: false,
    }
  })

  it('la racine (AIRBUS SE) porte la ligne, les filiales n’en portent aucune', () => {
    render(withQueryClient(<GroupOrgView graph={graph()} onOpenEntity={() => {}} accountId="acc-1" />))
    const line = i18n.t('accounts:marketContext.paths', { count: 4 }) as string
    const rootRow = screen.getByText('AIRBUS SE').closest('li') as HTMLLIElement
    expect(within(rootRow).getByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument()
    for (const name of ['Defence & Space', 'Helicopters']) {
      const row = screen.getByText(name).closest('li') as HTMLLIElement
      expect(within(row).queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
    }
  })

  it('sans `accountId`, aucune ligne — pas d’entité à interroger', () => {
    render(<GroupOrgView graph={graph()} onOpenEntity={() => {}} />)
    const line = i18n.t('accounts:marketContext.paths', { count: 4 }) as string
    expect(screen.queryByText(new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeNull()
  })
})
