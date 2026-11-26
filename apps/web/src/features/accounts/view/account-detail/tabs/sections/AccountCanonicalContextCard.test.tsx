import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCanonicalContextCard } from './AccountCanonicalContextCard'
// #3672 revient sur le libellé de provenance de #2116, délibérément ; ce qui tient : la source reste nommée (une par fait/champ), déclaré vs déduit reste distinct, date et certitude restent affichées.

/**
 * #2116.1-12 — le contexte canonique RENDU : chaque fait avec sa provenance,
 * et ce qui manque NOMMÉ plutôt que laissé en blanc.
 */
function context(overrides: Partial<AccountIntelligenceContextView> = {}): AccountIntelligenceContextView {
  return {
    accountId: 'acc-1',
    // #3219 (#190.1) — aucune contradiction de champ ouverte sur ce compte.
    conflicts: [],
    // #2116.3 / .6 / .7 — l'identité du compte, avec l'échelon qui l'a dite.
    companyName: {
      state: 'known',
      value: 'THALES',
      provenance: { source: 'current_data', observedAt: '2026-09-01T00:00:00.000Z' },
    },
    sector: {
      state: 'known',
      value: 'Défense',
      provenance: { source: 'human_correction', observedAt: '2026-09-10T00:00:00.000Z' },
    },
    headquarters: {
      state: 'known',
      value: 'Paris',
      provenance: { source: 'registry_identity', observedAt: '2026-08-15T00:00:00.000Z' },
    },
    // #2116.6 — la mémoire marché : « je n'ai pas pu lire » par défaut, pour
    // que le fixture le plus courant NE soit PAS celui qui invente une lecture.
    marketMemory: {
      provenance: { source: 'market_memory', observedAt: null },
      read: { status: 'unavailable', reason: 'corpus_indisponible' },
    },
    // #2116.10 — pas rendu par cette carte (IncumbentEsnCard en est le seul
    // propriétaire) : présent uniquement parce que le champ n'est pas
    // optionnel au contrat.
    incumbentEsn: {
      state: 'known',
      value: [{ name: 'Sopra Steria', contractType: null, strengths: null, weaknesses: null }],
      provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
    },
    technologies: {
      state: 'known',
      value: [{ name: 'React', usage: 'portail client' }],
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
    },
    entryPaths: {
      state: 'known',
      value: [{ label: 'Direction du portail client', targetProfile: 'CTO', justification: 'Refonte en cours' }],
      provenance: { source: 'inference', observedAt: null },
    },
    recommendations: [],
    ...overrides,
  }
}

describe('AccountCanonicalContextCard', () => {
  it('#2116.1-8 — NOMME la provenance de chaque fait, avec son vocabulaire fermé', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    expect(await screen.findByText('React')).toBeInTheDocument()
    // #2116.2 + D11 — la mémoire marché se nomme « mémoire marché », JAMAIS
    // par le nom de la brique qui la sert : nos fournisseurs ne se nomment pas.
    expect(screen.getByText(/Historique observé/)).toBeInTheDocument()
    expect(screen.getByText(/Hypothèse à valider/)).toBeInTheDocument()
    expect(screen.queryByText(/DataForge/i)).toBeNull()
  })

  // #3672 (recette prod 06/10) — « Par où entrer » et « Ce qu'on en tire »
  // répétaient les deux mêmes portes : une seule place (GA-26). Une porte déjà
  // portée par une recommandation se lit dans « Ce qu'on en tire » (qui garde
  // nature, date, limite) ; « Par où entrer » ne garde que ce qu'elle seule dit.
  it('#3672 — une porte déjà recommandée ne se répète pas sous « Par où entrer »', async () => {
    const entryPaths: AccountIntelligenceContextView['entryPaths'] = {
      state: 'known',
      value: [
        { label: 'Direction du portail client', targetProfile: 'CTO', justification: 'Refonte en cours' },
        { label: 'DSI infrastructure', targetProfile: null, justification: null },
      ],
      provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
    }
    const recommendation = (id: string, label: string) =>
      ({
        id,
        label,
        detail: null,
        nature: 'inference',
        provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
        freshness: 'fresh',
        confidence: { level: 'deduced', corroborationCount: null },
        limit: 'not_a_commitment',
        check: 'confirm_with_contact',
        action: 'open_contacts',
      }) as AccountIntelligenceContextView['recommendations'][number]
    renderWithRouter(
      <AccountCanonicalContextCard
        context={context({
          entryPaths,
          recommendations: [
            recommendation('entry-path-0', 'Direction du portail client'),
            recommendation('entry-path-1', 'DSI infrastructure'),
          ],
        })}
        onTabChange={vi.fn()}
      />,
    )
    await screen.findByText('THALES')
    expect(screen.getAllByText('Direction du portail client')).toHaveLength(1)
    expect(screen.getAllByText('DSI infrastructure')).toHaveLength(1)
    // #3672 revient sur #2116.x, délibérément (Louis 10/10) : une recommandation d'ENTRÉE
    // (open_contacts) se lit sous « Par où entrer », AVEC ses métadonnées — plus sous « Ce qu'on en tire ».
    expect(screen.getByText('Par où entrer')).toBeInTheDocument()
    expect(screen.queryByText("Ce qu'on en tire")).toBeNull()
    expect(screen.getAllByText('Déduit par Laura')).toHaveLength(2)
  })

  it("#3672 — sait dire NON : une recommandation qui n'est pas une entrée reste sous « Ce qu'on en tire »", async () => {
    const plan = {
      id: 'plan-0',
      label: 'Cibler le DSI groupe',
      detail: null,
      nature: 'inference',
      provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
      freshness: 'fresh',
      confidence: { level: 'deduced', corroborationCount: null },
      limit: 'not_a_commitment',
      check: 'confirm_with_contact',
      action: 'open_plan',
    } as AccountIntelligenceContextView['recommendations'][number]
    renderWithRouter(
      <AccountCanonicalContextCard context={context({ recommendations: [plan] })} onTabChange={vi.fn()} />,
    )
    await screen.findByText('Cibler le DSI groupe')
    expect(screen.getByText("Ce qu'on en tire")).toBeInTheDocument()
  })

  it('#3672 — sait dire NON : sans recommandation, « Par où entrer » garde ses portes', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    expect(await screen.findByText('Direction du portail client')).toBeInTheDocument()
    expect(screen.getByText('Par où entrer')).toBeInTheDocument()
  })

  it('#2116.19 — un fait SANS date le DIT : « date inconnue », jamais un silence', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    expect(await screen.findByText(/date inconnue/)).toBeInTheDocument()
  })

  it('#2116.10-12 — sait dire NON : un fait inconnu est NOMMÉ, pas rendu en blanc', async () => {
    renderWithRouter(
      <AccountCanonicalContextCard context={context({ technologies: { state: 'unknown' } })} onTabChange={vi.fn()} />,
    )
    expect(await screen.findByText('Par où entrer')).toBeInTheDocument()
    // « Non mesuré » n'est pas « aucune ESN en place », et surtout pas « 0 ».
    expect(screen.getAllByText(/Non mesuré|Not measured/i).length).toBeGreaterThan(0)
  })

  // #3672 (R4 07/10, réfuté en recette : « Par où entrer » affiche « Non mesuré ») —
  // c'est une LISTE de portes, pas un score : une absence n'y fait AUCUNE ligne
  // (doctrine du 20/09, « dans une liste, une absence ne fait aucune ligne »),
  // contrairement à un fait scalaire (technologies, secteur…) qui, lui, se nomme.
  it('#3672 — une liste de portes inconnue ne rend aucune ligne « Non mesuré »', async () => {
    renderWithRouter(
      <AccountCanonicalContextCard context={context({ entryPaths: { state: 'unknown' } })} onTabChange={vi.fn()} />,
    )
    await screen.findByText('THALES')
    expect(screen.queryByText('Par où entrer')).toBeNull()
  })

  it('#3499 — une techno déjà en pastille n’est pas répétée ; le bloc se masque quand il se vide', async () => {
    const two = context({
      technologies: {
        state: 'known',
        value: [
          { name: 'React', usage: 'portail client' },
          { name: 'Kafka', usage: 'flux' },
        ],
        provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
      },
    })
    const { unmount } = renderWithRouter(
      <AccountCanonicalContextCard context={two} onTabChange={vi.fn()} excludeTechnologies={[' react ']} />,
    )
    expect(await screen.findByText('Kafka')).toBeInTheDocument()
    expect(screen.queryByText('React')).toBeNull()
    unmount()
    renderWithRouter(
      <AccountCanonicalContextCard context={two} onTabChange={vi.fn()} excludeTechnologies={['React', 'Kafka']} />,
    )
    expect(await screen.findByText('Par où entrer')).toBeInTheDocument()
    expect(screen.queryByText('Technologies en place')).toBeNull()
    expect(screen.queryByText('Kafka')).toBeNull()
  })

  it('#2116.10 — ne rend JAMAIS « Qui est déjà en place » : IncumbentEsnCard en est le SEUL propriétaire', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    await screen.findByText('React')
    expect(screen.queryByText('Qui est déjà en place')).toBeNull()
    expect(screen.queryByText('Sopra Steria')).toBeNull()
  })

  it("#2116.3/.6/.7 — l'identité du compte atteint l'écran AVEC son échelon nommé", async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    expect(await screen.findByText('Défense')).toBeInTheDocument()
    // #2116.7 — LE point le plus grave du retour : une correction humaine gagne
    // toujours, et jusqu'ici sa provenance n'atteignait jamais l'écran.
    expect(screen.getByText(/Corrigé par ton équipe/)).toBeInTheDocument()
    expect(screen.getByText('THALES')).toBeInTheDocument()
    expect(screen.getByText('Paris')).toBeInTheDocument()
    expect(screen.getByText(/Information vérifiée/)).toBeInTheDocument()
  })

  it('#2116.3/.6/.7 — sait dire NON : une identité que personne ne sait est NOMMÉE, jamais laissée en blanc', async () => {
    renderWithRouter(
      <AccountCanonicalContextCard context={context({ sector: { state: 'unknown' } })} onTabChange={vi.fn()} />,
    )
    await screen.findByText('THALES')
    expect(screen.queryByText('Défense')).toBeNull()
    expect(screen.getAllByText(/Non mesuré|Not measured/i).length).toBeGreaterThan(0)
  })

  it('#2116.6 — la mémoire marché NOMME ce qu’elle a observé, avec sa provenance', async () => {
    renderWithRouter(
      <AccountCanonicalContextCard
        context={context({
          marketMemory: {
            provenance: { source: 'market_memory', observedAt: null },
            read: {
              status: 'ok',
              coverage: {
                covered: true,
                marketPaths: 12,
                esnObserved: [],
                observedStack: [],
                observedZone: null,
                roleFamilies: [
                  { family: 'Data', persons: 4 },
                  { family: 'Cloud', persons: 2 },
                ],
                exEsnPresent: null,
              },
            },
          },
        })}
        onTabChange={vi.fn()}
      />,
    )
    expect(await screen.findByText('Data')).toBeInTheDocument()
    // Le COMPTE voyage avec la famille : « Data » seul est un inventaire.
    expect(screen.getByText(/4 parcours observés/)).toBeInTheDocument()
    // « Historique observé » titre la carte ET nomme la provenance : au moins deux.
    expect(screen.getAllByText(/Historique observé/).length).toBeGreaterThan(1)
  })

  // K.3 / #4325 (Louis 19/10/2026) — « Autre » est la plus grosse famille et ne dit rien : elle montre
  // son détail, et ne se présente pas comme une famille métier.
  describe('K.3 / #4325 — la famille « Autre »', () => {
    const withFamilies = (roleFamilies: { family: string; persons: number }[]) =>
      context({
        marketMemory: {
          provenance: { source: 'market_memory', observedAt: null },
          read: {
            status: 'ok',
            coverage: {
              covered: true,
              marketPaths: 12,
              esnObserved: [],
              observedStack: [],
              observedZone: null,
              roleFamilies,
              exEsnPresent: null,
            },
          },
        },
      })
    const FAMILIES = [
      { family: 'Autre', persons: 225 },
      { family: 'Direction / Conseil', persons: 106 },
    ]

    it('« Autre » sort de la liste des métiers, garde son nombre, et se déplie en intitulés réels comptés', async () => {
      renderWithRouter(
        <AccountCanonicalContextCard
          context={withFamilies(FAMILIES)}
          contacts={[
            { family: null, title: 'Chargé de mission' },
            { family: null, title: 'Chargé de mission' },
            { family: null, title: 'Responsable QHSE' },
            { family: 'IT', title: 'Chef de projet SI' },
          ]}
          onTabChange={vi.fn()}
        />,
      )
      expect(await screen.findByText('Direction / Conseil')).toBeInTheDocument()
      const other = screen.getByTestId('role-family-other')
      expect(other).toHaveTextContent(/225/)
      // Pas une famille métier : aucun item de la liste des métiers ne porte « Autre ».
      expect(screen.getByTestId('role-families-list')).not.toHaveTextContent(/Autre/)
      const detail = screen.getByTestId('role-family-other-detail')
      expect(detail).toHaveTextContent('Chargé de mission')
      expect(detail).toHaveTextContent('2')
      expect(detail).toHaveTextContent('Responsable QHSE')
      expect(detail).not.toHaveTextContent('Chef de projet SI')
    })

    it('au-delà de six intitulés, « Voir plus » déplie le reste', async () => {
      const contacts = Array.from({ length: 8 }, (_, i) => ({ family: null, title: `Intitulé ${i}` }))
      renderWithRouter(
        <AccountCanonicalContextCard context={withFamilies(FAMILIES)} contacts={contacts} onTabChange={vi.fn()} />,
      )
      await screen.findByTestId('role-family-other-detail')
      expect(screen.queryByText('Intitulé 7')).toBeNull()
      screen.getByRole('button', { name: /Voir plus \(2\)/ }).click()
      expect(await screen.findByText('Intitulé 7')).toBeInTheDocument()
    })

    it('sans intitulé à détailler, la ligne NOMME que le détail n’est pas disponible — jamais une famille opaque ni « 0 »', async () => {
      renderWithRouter(
        <AccountCanonicalContextCard context={withFamilies(FAMILIES)} contacts={[]} onTabChange={vi.fn()} />,
      )
      const other = await screen.findByTestId('role-family-other')
      expect(other).toHaveTextContent(/détail .* n’est pas disponible/i)
      expect(screen.queryByTestId('role-family-other-detail')).toBeNull()
    })

    it('sait dire NON : sans « Autre » dans l’historique, aucune ligne « Autre » n’apparaît', async () => {
      renderWithRouter(
        <AccountCanonicalContextCard
          context={withFamilies([{ family: 'Data', persons: 4 }])}
          contacts={[{ family: null, title: 'Chargé de mission' }]}
          onTabChange={vi.fn()}
        />,
      )
      await screen.findByText('Data')
      expect(screen.queryByTestId('role-family-other')).toBeNull()
    })
  })

  it('#2116.6 — « je n’ai pas pu lire » ne se rend PAS comme « rien observé »', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    expect(await screen.findByText(/lecture de l.historique observé indisponible/i)).toBeInTheDocument()
  })

  /**
   * #2126.15 — la lecture a RÉPONDU, et le compte est sous le seuil : ce n'est
   * ni une panne ni un « Non mesuré » générique, c'est un état NOMMÉ. Et sait
   * dire NON : un compte couvert sans famille de métier ne l'emprunte pas.
   */
  it('#2126.15 — un compte sous le seuil NOMME l’absence d’observation exploitable', async () => {
    const coverage = {
      covered: false,
      marketPaths: null,
      esnObserved: [],
      observedStack: [],
      observedZone: null,
      roleFamilies: [],
      exEsnPresent: null,
    }
    renderWithRouter(
      <AccountCanonicalContextCard
        context={context({
          marketMemory: { provenance: { source: 'market_memory', observedAt: null }, read: { status: 'ok', coverage } },
        })}
        onTabChange={vi.fn()}
      />,
    )
    expect(
      await screen.findByText('Aucune observation exploitable n’est disponible pour ce compte.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/lecture de l.historique observé indisponible/i)).not.toBeInTheDocument()
  })

  it('#2126.15 — sait dire NON : un compte COUVERT sans famille ne se dit pas « sous le seuil »', async () => {
    const coverage = {
      covered: true,
      marketPaths: 3,
      esnObserved: [],
      observedStack: [],
      observedZone: null,
      roleFamilies: [],
      exEsnPresent: null,
    }
    renderWithRouter(
      <AccountCanonicalContextCard
        context={context({
          marketMemory: { provenance: { source: 'market_memory', observedAt: null }, read: { status: 'ok', coverage } },
        })}
        onTabChange={vi.fn()}
      />,
    )
    expect(await screen.findByText('THALES')).toBeInTheDocument()
    expect(
      screen.queryByText('Aucune observation exploitable n’est disponible pour ce compte.'),
    ).not.toBeInTheDocument()
  })

  it('se TAIT quand la façade n’a pas répondu — une lecture indisponible n’est pas un constat', () => {
    const { container } = renderWithRouter(<AccountCanonicalContextCard context={null} onTabChange={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('#2116.11 — rend l’USAGE d’une technologie, pas seulement son nom', async () => {
    renderWithRouter(<AccountCanonicalContextCard context={context()} onTabChange={vi.fn()} />)
    // Ciblé sur la LIGNE de la techno : « portail client » apparaît aussi dans
    // le libellé du chemin d'accès, et un `findByText` large y répondrait.
    const technology = await screen.findByText('React')
    expect(technology.closest('p')?.textContent).toContain('portail client')
  })
})
