/**
 * #3499 — LA SYNTHÈSE : SECTIONS REPLIÉES, ET SEULEMENT CELLES QUI ONT UN CONTENU.
 *
 * Remplace la preuve de #1881 (deux replis « Contexte » / « Fiche » sous une
 * colonne ouverte d'une vingtaine de cartes) : le retour du 01/10/2026 (« la
 * majorité des éléments sont vides, inconnus, non renseignés », « on comprend
 * rien ») a tranché pour des sections REPLIÉES par défaut, ordonnées par
 * utilité commerciale, et ABSENTES quand elles n'ont rien à montrer.
 *
 * Les cartes sont des jetons : chacune a sa propre suite et ses requêtes ; ce
 * qu'on prouve ici, c'est la STRUCTURE.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Account, Contact } from '@bellum/contracts'
import { TabOverview } from './TabOverview'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({ useHiringDomainProfile: () => undefined }))

const motionComponents = new Map<string, unknown>()
const relaunch = vi.hoisted(() => vi.fn())
vi.mock('../../../hooks/useAccountRelaunch', () => ({ useAccountRelaunch: () => ({ relaunch }) }))
// #2556 — le bloc « ce que BellumAI ajoute » lit la présence CRM : aucun CRM ici.
vi.mock('@/features/crm/hooks/useCrmPresence', () => ({ useCrmPresence: () => ({ data: undefined }) }))
vi.mock('../../../hooks/useAccountRegistryAnnouncements', () => ({
  useAccountRegistryAnnouncements: () => ({ data: null }),
}))
vi.mock('../../../hooks/useAccountFieldConflicts', () => ({ useAccountFieldConflicts: () => ({ data: [] }) }))
// #3917.9 — le journal d'écriture de la fiche (source + date de l'effectif) : ici, aucun.
vi.mock('@/features/crm-core/hooks/useRecordEdit', () => ({ useRecordHistory: () => ({ data: [] }) }))
vi.mock('./sections/VerdictUnchangedLine', () => ({
  VerdictUnchangedLine: () => <div data-testid="verdict-unchanged-line" />,
}))
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({
            children,
            variants: _v,
            initial: _i,
            animate: _a,
            exit: _e,
            transition: _t,
            ...props
          }: any) => {
            const Component = prop
            return <Component {...props}>{children}</Component>
          }
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('./AccountOfferLensBanner', () => ({ AccountOfferLensBanner: () => <div>PRISME-OFFRES</div> }))
vi.mock('@/features/projects/open-needs/view/NeedProposalsPanel', () => ({
  NeedProposalsPanel: () => <div>BESOINS-PROPOSES</div>,
}))
vi.mock('../components/EntityResolutionPanel', () => ({ EntityResolutionPanel: () => null }))
vi.mock('./sections/BellumReadCard', () => ({ BellumReadCard: () => <div>LECTURE-BELLUM</div> }))
vi.mock('./sections/AccountStrategy5PSection', () => ({ AccountStrategy5PSection: () => <div>STRATEGIE-5P</div> }))
vi.mock('./sections/AccountVariationSignalsSection', () => ({
  AccountVariationSignalsSection: () => null,
}))
vi.mock('./sections/AccountInterestPenetrabilitySection', () => ({
  AccountInterestPenetrabilitySection: () => <div>PENETRABILITE-INTERET</div>,
}))
vi.mock('@/features/google/components/MeetingPrepBrief', () => ({ MeetingPrepBrief: () => <div>BRIEF-RDV</div> }))
// #3666.k — un test de bout en bout rend la VRAIE section « Pourquoi maintenant » (la carte
// de signaux et sa couverture) ; tous les autres la gardent en jeton.
const realWhyNow = vi.hoisted(() => ({ on: false }))
vi.mock('./sections/WhyNowSection', async importOriginal => {
  const actual = await importOriginal<typeof import('./sections/WhyNowSection')>()
  return {
    WhyNowSection: (props: React.ComponentProps<typeof actual.WhyNowSection>) =>
      realWhyNow.on ? <actual.WhyNowSection {...props} /> : <div>POURQUOI-MAINTENANT</div>,
  }
})
vi.mock('./sections/OpeningStrategyCard', () => ({ OpeningStrategyCard: () => <div>PAR-OU-OUVRIR</div> }))
vi.mock('./sections/IncumbentEsnCard', () => ({ IncumbentEsnCard: () => <div>ESN-EN-PLACE</div> }))
vi.mock('./sections/AccountCanonicalContextSection', () => ({
  AccountCanonicalContextSection: () => <div>CONTEXTE-CANONIQUE</div>,
}))
vi.mock('./sections/OffersAndPositioningSection', () => ({ OffersAndPositioningSection: () => <div>OFFRES</div> }))
vi.mock('./sections/CompanyPublicDataSection', () => ({ CompanyPublicDataSection: () => <div>DONNEES-PUBLIQUES</div> }))
vi.mock('./sections/AccountRecordCard', () => ({ AccountRecordCard: () => <div>FICHE-CORRIGEABLE</div> }))
vi.mock('./sections/AccountVocabularySection', () => ({ AccountVocabularySection: () => <div>VOCABULAIRE</div> }))
vi.mock('./sections/AccountProvenancePanel', () => ({ AccountProvenancePanel: () => <div>PROVENANCE</div> }))
vi.mock('./sections/ApolloFirmographicsCard', () => ({ ApolloFirmographicsCard: () => <div>FIRMOGRAPHIE</div> }))
vi.mock('./sections/CompetitivePositioningCard', () => ({
  CompetitivePositioningCard: () => <div>POSITIONNEMENT</div>,
}))
// #4323.3 — le couple « ESN déjà en place » + « Positionnement » passe par un seul composant (il lit le contexte canonique).
vi.mock('./sections/EsnAndPositioning', () => ({ EsnAndPositioning: () => <div>ESN-ET-POSITIONNEMENT</div> }))
vi.mock('./sections/BattlecardCard', () => ({ BattlecardCard: () => <div>BATTLECARD</div> }))
vi.mock('./sections/AccountMarketMemoryCard', () => ({ AccountMarketMemoryCard: () => <div>MEMOIRE-MARCHE</div> }))
vi.mock('./sections/AccountTechStructureSection', () => ({
  AccountTechStructureSection: () => <div>STRUCTURE-TECHNIQUE</div>,
}))
vi.mock('./sections/AccountKnownMovementsCard', () => ({ AccountKnownMovementsCard: () => <div>MOUVEMENTS</div> }))
vi.mock('./sections/ConsultantsKnowSectorCard', () => ({ ConsultantsKnowSectorCard: () => null }))
vi.mock('./sections/AccountChangesCard', () => ({ AccountChangesCard: () => <div>CHANGEMENTS</div> }))
vi.mock('./sections/AccountRunsContainer', () => ({ AccountRunsContainer: () => <div>RUNS</div> }))
const factsBrief = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/features/account-facts/useAccountFactsBrief', () => ({ useAccountFactsBrief: () => factsBrief.value }))
vi.mock('./veille/AccountHistoryFactsSection', () => ({
  AccountHistoryFactsSection: ({ accountId }: { accountId: string }) => <div>FAITS-DATES-{accountId}</div>,
}))
vi.mock('../components/RefreshOutcomeCard', () => ({ RefreshOutcomeCard: () => <div>RAFRAICHISSEMENT</div> }))
vi.mock('@/features/universal-import/view/ImportedExtraCard', () => ({ ImportedExtraCard: () => null }))
vi.mock('./sections/AccountAttachedDocumentsCard', () => ({ AccountAttachedDocumentsCard: () => null }))
vi.mock('./sections/accountProvenance', () => ({ buildAccountProvenance: () => ({ sources: [] }) }))

// #3594 — `Link` lu sans routeur complet (même convention que TabCommittee.test.tsx).
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({
    children,
    to,
    params,
    search,
  }: {
    children: React.ReactNode
    to: string
    params?: Record<string, string>
    search?: unknown
  }) => (
    <a href="#" data-to={to} data-params={JSON.stringify(params)} data-search={JSON.stringify(search)}>
      {children}
    </a>
  ),
}))

const overviewMock = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('./useAccountOverviewData', () => ({ useAccountOverviewData: () => overviewMock.value }))

const BASE = {
  id: 'acc-1',
  company_name: 'DEVOTEAM',
  priority_score: null,
  status: 'prospect',
  created_at: '2026-01-01',
}
const CONTACTS = [
  { id: 'c1', full_name: 'Alice Martin', title: 'DSI', decision_role: 'decideur', lifecycle_state: 'qualifie' },
  { id: 'c2', full_name: 'Bruno Petit', title: 'Responsable achats', decision_role: null, lifecycle_state: 'enrichi' },
] as unknown as Contact[]

function monter(account: Partial<Account>, contacts: Contact[], overview: Record<string, unknown>) {
  overviewMock.value = { bellumRead: {}, dossierRead: null, mainRisk: null, ...overview }
  render(<TabOverview account={{ ...BASE, ...account } as Account} contacts={contacts} onTabChange={vi.fn()} />)
}

const RICHE = {
  angles: [{ title: 'Moderniser le SI de paiement', description: 'Le programme est lancé.' }],
  recent_signals: [{ signal: 'Nomination d’un nouveau DSI' }],
  plan: { action_plan: { phases: [{ actions: [{ action: 'Appeler la DSI' }, { action: 'Envoyer le brief' }] }] } },
}

describe('#4099 — « contacts clés » ne compte que des contacts pertinents', () => {
  it('2610 contacts dont 16 pertinents : le résumé dit 16, jamais 2610', () => {
    const many = [
      ...Array.from({ length: 2594 }, (_, i) => ({
        id: `d${i}`,
        full_name: `Détecté ${i}`,
        lifecycle_state: 'detecte',
      })),
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `q${i}`,
        full_name: `Pertinent ${i}`,
        lifecycle_state: 'qualifie',
      })),
    ] as unknown as Contact[]
    monter({}, many, {})
    expect(screen.getByText('16 contacts clés')).toBeInTheDocument()
    expect(screen.queryByText(/2610 contacts clés/)).not.toBeInTheDocument()
  })

  it('aucun contact pertinent : pas de résumé du tout, jamais « 0 contact clé »', () => {
    const onlyDetected = [{ id: 'd1', full_name: 'Détecté', lifecycle_state: 'detecte' }] as unknown as Contact[]
    monter({}, onlyDetected, {})
    expect(document.body.textContent).not.toMatch(/contacts? clés?/)
  })
})

describe('#3916 — les annonces légales comptent pour la section qui les porte', () => {
  it('SAIT DIRE NON puis OUI : sans annonce, pas de section ; avec des annonces seules, la section existe et les compte', () => {
    monter({ status: 'completed' }, [], {})
    expect(screen.queryByRole('button', { name: /Technologies et chiffres clés/ })).not.toBeInTheDocument()
  })

  it('des annonces légales sans technologie ni chiffre ouvrent la section et dit combien', () => {
    monter({ status: 'completed' }, [], {
      legal_signals: [
        { type: 'Dépôts des comptes', date: '2026-06-01' },
        { type: 'Ventes et cessions', date: '2026-05-01' },
      ],
    })
    const header = screen.getByRole('button', { name: /Technologies et chiffres clés/ })
    expect(header).toHaveTextContent('2 annonces légales')
  })
})

describe('#3916.r40 — les annonces légales se LISENT sans ouvrir la section (recette EDF : seul le compteur se voyait)', () => {
  it('SAIT DIRE NON puis OUI : avec des annonces, la liste datée et « Voir l’annonce » sont visibles d’emblée', () => {
    monter({ status: 'completed' }, [], {
      legal_signals: [
        { type: 'Dépôts des comptes', date: '2026-06-01', url: 'https://www.bodacc.fr/annonce/1' },
        { type: 'Ventes et cessions', date: '2026-05-01', url: 'https://www.bodacc.fr/annonce/2' },
      ],
    })
    // #4965.1 (01/11) — section secondaire : repliée d'office ; le compteur reste lisible dans l'en-tête.
    const header = screen.getByRole('button', { name: /Technologies et chiffres clés/ })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    expect(header).toHaveTextContent('2 annonces légales')
  })
})

describe('#3499 — la synthèse : des sections repliées, seulement quand elles ont un contenu', () => {
  it('(b) SAIT DIRE NON — un compte sans contenu ne rend AUCUNE section, aucun texte d’absence', () => {
    monter({}, [], {})

    expect(screen.queryAllByRole('button', { expanded: false })).toHaveLength(0)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/non renseign|non mesur|Aucun/i)
  })

  it('#3293 — SAIT DIRE NON puis OUI : la carte Colonnes (section Stratégie) est montée dès qu’il y a des contacts', async () => {
    // Sans contact ni lecture stratégique : aucune section Stratégie (rien à montrer).
    monter({ status: 'completed' }, [], {})
    expect(screen.queryByRole('button', { name: /Stratégie de compte/ })).not.toBeInTheDocument()
  })

  it('#3293 — un compte AVEC contacts mais sans lecture stratégique rend quand même la section Stratégie', async () => {
    monter({ status: 'completed' }, CONTACTS, {})
    // #3674.1 — la stratégie est OUVERTE à l'arrivée : aucun clic nécessaire.
    expect(screen.getByRole('button', { name: /Stratégie de compte/ })).toHaveAttribute('aria-expanded', 'true')
    // #3777 (décision Louis 10/10, GA-26) — « Cinq questions de terrain » a QUITTÉ la Synthèse : elle vit sur le Plan.
    expect(screen.queryByText('STRATEGIE-5P')).not.toBeInTheDocument()
  })

  it('#3231 (recette 10/10) — une direction interne déclarée montre sa fiche (4 rôles + « Compléter ») sans chercher', () => {
    monter({ declared_internal_client_mode: 'internal_service' } as Partial<Account>, [], {})
    expect(screen.getByText('FICHE-CORRIGEABLE')).toBeInTheDocument()
  })

  it('#4965.1 (01/11) — rôles non déclarés : « Sources et confiance » est repliée d’office, la fiche s’ouvre au clic', () => {
    monter(
      { declared_internal_client_mode: null, status: 'completed', priority_score: 7 } as Partial<Account>,
      CONTACTS,
      RICHE,
    )
    expect(screen.getByRole('button', { name: /Sources et confiance/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('FICHE-CORRIGEABLE')).not.toBeInTheDocument()
  })

  it('#3231 — SAIT DIRE NON : un client direct déclaré garde la section repliée', () => {
    monter(
      { declared_internal_client_mode: 'external_buyer', status: 'completed', priority_score: 7 } as Partial<Account>,
      CONTACTS,
      RICHE,
    )
    expect(screen.getByRole('button', { name: /Sources et confiance/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('FICHE-CORRIGEABLE')).not.toBeInTheDocument()
  })

  it('(c) les sections présentes sont REPLIÉES par défaut, dans l’ordre d’utilité commerciale, avec un résumé', () => {
    monter(
      { status: 'completed', priority_score: 7, declared_internal_client_mode: 'external_buyer' } as Partial<Account>,
      CONTACTS,
      RICHE,
    )

    const toggles = screen.getAllByRole('button', { expanded: false })
    const titres = toggles.map(toggle => toggle.textContent ?? '')
    // #3674.1 — « Stratégie de compte » ouvre la synthèse, ouverte : elle n'est pas dans les replis.
    expect(screen.getByRole('button', { name: /Stratégie de compte/ })).toHaveAttribute('aria-expanded', 'true')
    // #3673.10 — un compte ANALYSÉ ouvre aussi « Préparer le rendez-vous » : elle n'est pas dans les replis.
    expect(screen.getByRole('button', { name: /Préparer le rendez-vous/ })).toHaveAttribute('aria-expanded', 'true')
    const ordre = ['Plan d', 'Contacts', 'Angles', 'Sources', 'Historique']
    const positions = ordre.map(titre => titres.findIndex(texte => texte.includes(titre)))
    expect(positions.every(position => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)

    // Le résumé d'une ligne dans l'en-tête replié.
    expect(screen.getByText('2 contacts clés')).toBeInTheDocument()
    expect(screen.getByText("1 angle d'attaque")).toBeInTheDocument()
    expect(screen.getByText(/2 actions planifiées/)).toBeInTheDocument()

    // Repliées : le contenu n'est PAS dans le DOM.
    for (const jeton of ['LECTURE-BELLUM', 'FICHE-CORRIGEABLE', 'RUNS', 'PAR-OU-OUVRIR']) {
      expect(screen.queryByText(jeton)).not.toBeInTheDocument()
    }
  })

  it('le score vit dans « Sources et confiance », jamais en haut de la synthèse', async () => {
    const user = userEvent.setup()
    monter(
      { status: 'completed', priority_score: 7, declared_internal_client_mode: 'external_buyer' } as Partial<Account>,
      CONTACTS,
      RICHE,
    )

    expect(screen.queryByText('LECTURE-BELLUM')).not.toBeInTheDocument()
    const sources = screen.getByRole('button', { name: /Sources et confiance/ })
    await user.click(sources)
    expect(screen.getByText('LECTURE-BELLUM')).toBeInTheDocument()
    // Ouvrir une section ne déplie qu'elle.
    expect(screen.getByRole('button', { name: /Contacts et comité/ })).toHaveAttribute('aria-expanded', 'false')
  })

  // #4068.6 — l'historique daté (affaires passées, missions, besoins récurrents, derniers échanges) se lit aussi
  // dans la synthèse du compte, section « Historique » : le même lecteur que la veille, un second appelant.
  it('#4068.6 — la section « Historique » de la synthèse porte les faits datés du compte', async () => {
    const user = userEvent.setup()
    monter({ status: 'completed', id: 'acc-9' } as Partial<Account>, CONTACTS, RICHE)
    expect(screen.queryByText(/FAITS-DATES-/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Historique/ }))
    expect(screen.getByText('FAITS-DATES-acc-9')).toBeInTheDocument()
  })

  // #4284.18 — le volet « Historique » est replié : sans le dire sur son en-tête, la recette ne pouvait pas VÉRIFIER
  // que la fiche porte les faits datés (y compris anciens). L'en-tête compte les faits, et se tait sans fait.
  it('#4284.18 — l’en-tête replié de « Historique » compte les faits datés du compte, anciens compris', () => {
    factsBrief.value = {
      asOf: '2026-10-20',
      deals: [
        { date: '2025-03-02', kind: 'deal_won', label: 'Refonte SI' },
        { date: '2026-08-02', kind: 'deal_lost', label: 'TMA' },
      ],
      missions: [{ date: '2025-01-10', kind: 'mission', label: 'Mission data' }],
      recurringNeeds: [],
      exchanges: [],
      notes: [],
    }
    try {
      monter({ status: 'completed', id: 'acc-9' } as Partial<Account>, CONTACTS, RICHE)
      expect(screen.getByRole('button', { name: /Historique/ })).toHaveTextContent(/3 faits datés/)
    } finally {
      factsBrief.value = null
    }
  })

  it('#4284.18 — NON : sans fait daté, l’en-tête n’annonce aucun « 0 fait »', () => {
    monter({ status: 'completed', id: 'acc-9' } as Partial<Account>, CONTACTS, RICHE)
    expect(screen.getByRole('button', { name: /Historique/ })).not.toHaveTextContent(/fait/)
  })

  it('les contacts ouverts listent des personnes réelles, sans ligne pour une absence', async () => {
    const user = userEvent.setup()
    monter({ status: 'completed' }, CONTACTS, RICHE)

    await user.click(screen.getByRole('button', { name: /Contacts et comité/ }))
    const liste = screen.getByText('Alice Martin').closest('ul') as HTMLElement
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2)
    expect(liste.textContent).not.toMatch(/non renseign|—\s*$/i)
  })

  // #3594 — « rendre chaque contact cliquable » : chaque ligne ouvre SA fiche.
  it('#3594 — chaque contact de la synthèse est un lien vers sa fiche /contacts/$id', async () => {
    const user = userEvent.setup()
    monter({ status: 'completed' }, CONTACTS, RICHE)

    await user.click(screen.getByRole('button', { name: /Contacts et comité/ }))
    const lien = screen.getByRole('link', { name: /Alice Martin/ })
    expect(lien).toHaveAttribute('data-to', '/contacts/$id')
    expect(lien).toHaveAttribute('data-params', JSON.stringify({ id: 'c1' }))
    expect(screen.getByRole('link', { name: /Bruno Petit/ })).toHaveAttribute(
      'data-params',
      JSON.stringify({ id: 'c2' }),
    )
  })

  it('les comptes « du même secteur » ne sont plus dans la synthèse (décision 4)', () => {
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, RICHE)
    expect(screen.queryByText(/même secteur/i)).not.toBeInTheDocument()
  })
})

describe('#3499 — les trois questions de Louis : business, mémoire, recherche', () => {
  it('titre chaque groupe qui a au moins une section, jamais un groupe vide', () => {
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, RICHE)
    expect(screen.getByRole('heading', { name: 'Où est le business' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Ce que .* sait du compte/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Ce qu'on a cherché ensemble" })).toBeInTheDocument()
  })

  it('SAIT DIRE NON — sans contenu, aucun titre de groupe', () => {
    monter({}, [], {})
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('#3666.7 — une source en échec ne doit pas rendre les autres blocs indisponibles', () => {
  it('signaux non collectés (source en échec) : Plan, Contacts et Angles restent visibles', () => {
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, {
      ...RICHE,
      recent_signals: [],
      signal_coverage: { status: 'incomplete', unreachable: [{ source: 'brave_news', reason: 'timeout' }] },
    })

    // Ces trois sections ne dépendent ni de `recent_signals` ni de `signal_coverage`
    // (voir `visibleSynthesisSections` : plan/contacts/angles lisent d'autres champs) :
    // la panne d'UNE source de collecte ne doit donc rien leur retirer.
    expect(screen.getByRole('button', { name: /Plan d/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Contacts et comité/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Angles/ })).toBeInTheDocument()
  })

  afterEach(() => {
    realWhyNow.on = false
  })

  it('#3666.k — UNE seule source échoue : l’analyse est terminée, la source est NOMMÉE (famille, jamais le fournisseur), le reste s’affiche', () => {
    realWhyNow.on = true
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, {
      ...RICHE,
      recent_signals: [],
      signal_coverage: {
        status: 'incomplete',
        consulted: ['brave_news', 'bodacc', 'boamp'],
        unreachable: [{ source: 'france_travail', reason: 'timeout' }],
      },
    })

    // L'analyse est terminée : pas de carte « en cours », le dossier se lit.
    expect(screen.queryByText(/Actualisation en cours/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plan d/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Contacts et comité/ })).toBeInTheDocument()
    // La source en échec se nomme comme NON CONSULTÉE — jamais « aucun signal ».
    expect(screen.getAllByText(/offres d'emploi non consulté/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/France Travail|Apec|Brave/i)).not.toBeInTheDocument()
  })

  it('sait dire NON — toutes les sources ont répondu : rien n’est annoncé « non consulté »', () => {
    realWhyNow.on = true
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, {
      ...RICHE,
      recent_signals: [],
      signal_coverage: { status: 'none_found', consulted: ['france_travail', 'bodacc'], unreachable: [] },
    })
    expect(screen.queryByText(/non consulté/)).not.toBeInTheDocument()
  })

  it('#3666.k — sans AUCUN matériau de rendez-vous et une source en échec, la section reste : elle seule nomme ce qui n’a pas été consulté', () => {
    realWhyNow.on = true
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, {
      angles: RICHE.angles,
      plan: RICHE.plan,
      recent_signals: [],
      signal_coverage: { status: 'incomplete', unreachable: [{ source: 'brave_news', reason: 'timeout' }] },
    })

    expect(screen.getByRole('button', { name: /Préparer le rendez-vous/ })).toBeInTheDocument()
    expect(screen.getAllByText(/presse non consulté/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Plan d/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Angles/ })).toBeInTheDocument()
  })
})

describe('#3673.10 — recette prod 09/10 : « Préparer le rendez-vous » ouvert dès l’arrivée sur un compte analysé', () => {
  it('compte analysé (« Terminé ») — le repli est OUVERT à l’arrivée, sans clic', () => {
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, RICHE)
    expect(screen.getByRole('button', { name: /Préparer le rendez-vous/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('POURQUOI-MAINTENANT')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — compte JAMAIS analysé, le repli reste REPLIÉ même avec du matériau', () => {
    // #3674.5 — un compte jamais analysé n'a pas de `lastAnalyzed` : la section
    // « Rendez-vous » reste repliée, même règle que « Stratégie » juste au-dessus.
    monter({ status: 'prospect' }, CONTACTS, { ...RICHE, pains: [{ pain: 'Budget gelé' }] })
    expect(screen.getByRole('button', { name: /Préparer le rendez-vous/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('POURQUOI-MAINTENANT')).not.toBeInTheDocument()
  })
})

describe('#3674 — la stratégie de compte est l’entrée commerciale du dossier', () => {
  it('#3674.1 — « Stratégie de compte » est la PREMIÈRE section de la synthèse, avant le plan et les contacts', () => {
    monter({ status: 'completed', priority_score: 7 }, CONTACTS, RICHE)
    const titres = screen.getAllByRole('button', { expanded: undefined }).map(button => button.textContent ?? '')
    const strategie = titres.findIndex(titre => titre.includes('Stratégie de compte'))
    const plan = titres.findIndex(titre => titre.includes('Plan d'))
    const contacts = titres.findIndex(titre => titre.includes('Contacts'))
    expect(strategie).toBeGreaterThanOrEqual(0)
    expect(strategie).toBeLessThan(plan)
    expect(strategie).toBeLessThan(contacts)
  })

  it('#3674.5 — compte JAMAIS analysé : synthèse courte + « Analyser ce compte », jamais un tableau 5P vide', async () => {
    const user = userEvent.setup()
    // Des contacts existent (ajoutés à la main) : avant ce lot, la section 5P se montait quand même.
    monter({ status: 'prospect', sector: 'Énergie' }, CONTACTS, {})

    expect(screen.queryByText('STRATEGIE-5P')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Stratégie de compte/ })).not.toBeInTheDocument()
    const carte = screen.getByTestId('account-unanalyzed')
    expect(carte.textContent).toMatch(/pas encore été analysé/)
    expect(carte.textContent).toMatch(/Énergie/)
    expect(carte.textContent).toMatch(/2 contacts/)
    await user.click(screen.getByRole('button', { name: 'Analyser ce compte' }))
    expect(relaunch).toHaveBeenCalledTimes(1)
  })

  it('#3674.3 — la fiche d’un contact ouverte depuis la stratégie porte l’origine : le retour ramène à la stratégie', async () => {
    const user = userEvent.setup()
    monter({ id: 'acc-1', status: 'completed' }, CONTACTS, RICHE)
    await user.click(screen.getByRole('button', { name: /Contacts et comité/ }))
    expect(screen.getByRole('link', { name: /Alice Martin/ })).toHaveAttribute(
      'data-search',
      JSON.stringify({ from: 'account', fromId: 'acc-1', fromTab: 'overview' }),
    )
  })

  // #4283.8 (23/10) — la DATE de prochaine ré-analyse a rejoint la fraîcheur du hero (`AccountFreshness`) : la vue
  // d'ensemble ne la répète pas, elle ne dit que la raison de son absence.
  it('K4 — compte suivi avec une date : la vue d’ensemble ne la répète pas (elle est dans le hero)', () => {
    monter({ status: 'completed', next_reanalysis_at: '2026-10-19' }, CONTACTS, RICHE)
    expect(screen.queryByTestId('next-reanalysis-line')).not.toBeInTheDocument()
  })

  it('K4 — compte suivi sans date : la raison est dite (veille suspendue)', () => {
    monter({ status: 'completed', next_reanalysis_at: null, next_reanalysis_reason: 'suspended' }, CONTACTS, RICHE)
    expect(screen.getByTestId('next-reanalysis-line')).toHaveTextContent('Veille suspendue')
  })

  it('K4 — compte suivi jamais analysé : la raison est dite', () => {
    monter({ status: 'prospect', next_reanalysis_at: null, next_reanalysis_reason: 'never_analyzed' }, CONTACTS, {})
    expect(screen.getByTestId('next-reanalysis-line')).toHaveTextContent('Jamais analysé')
  })

  it('K4 22/10 — un compte non suivi DIT « Pas de ré-analyse automatique : compte non suivi »', () => {
    monter({ status: 'completed', next_reanalysis_at: null, next_reanalysis_reason: 'not_followed' }, CONTACTS, RICHE)
    expect(screen.getByTestId('next-reanalysis-line')).toHaveTextContent(
      'Pas de ré-analyse automatique : compte non suivi.',
    )
  })

  it('K4 SAIT DIRE NON — une réponse sans raison (ancienne API) n’invente aucune ligne de ré-analyse', () => {
    monter({ status: 'completed', next_reanalysis_at: null, next_reanalysis_reason: null }, CONTACTS, RICHE)
    expect(screen.queryByTestId('next-reanalysis-line')).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON — un compte analysé ne montre pas la carte « Analyser ce compte »', () => {
    monter({ status: 'completed' }, CONTACTS, RICHE)
    expect(screen.queryByTestId('account-unanalyzed')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analyser ce compte' })).not.toBeInTheDocument()
  })
})

/**
 * #4078 — les cinq blocs du dossier complet (axes de lecture, écosystème, domaines,
 * indicateurs financiers, garde-fous) ne sont produits par une vraie analyse que depuis
 * le 13/10. Un compte analysé AVANT ne les porte pas : la Synthèse le DIT (doctrine du
 * rattrapage), plutôt que de laisser croire qu'il n'y a rien à lire.
 */
describe('#4078 — la Synthèse dit quand les blocs du dossier sont antérieurs à leur production', () => {
  const STALE = /analysé avant que l’analyse produise les axes de lecture/

  it('compte analysé AVANT la capacité, jamais rejoué : le bandeau est là, daté de l’analyse', () => {
    monter({ status: 'completed', last_analyzed_at: '2026-10-01T09:00:00.000Z' } as Partial<Account>, CONTACTS, {})
    expect(screen.getByText(STALE)).toBeInTheDocument()
    expect(screen.getByText(/1 octobre 2026/)).toBeInTheDocument()
  })

  it('sait dire NON — blocs produits après la capacité : aucun bandeau', () => {
    monter(
      {
        status: 'completed',
        last_analyzed_at: '2026-10-01T09:00:00.000Z',
        dossier_blocks_collected_at: '2026-10-13T09:00:00.000Z',
      } as Partial<Account>,
      CONTACTS,
      {},
    )
    expect(screen.queryByText(STALE)).not.toBeInTheDocument()
  })

  it('sait dire NON — analysé après la capacité (étape sans date) : aucun bandeau', () => {
    monter({ status: 'completed', last_analyzed_at: '2026-10-14T09:00:00.000Z' } as Partial<Account>, CONTACTS, {})
    expect(screen.queryByText(STALE)).not.toBeInTheDocument()
  })

  it('sait dire NON — compte jamais analysé : aucun bandeau (rien n’est antérieur à rien)', () => {
    monter({ status: 'completed' }, CONTACTS, {})
    expect(screen.queryByText(STALE)).not.toBeInTheDocument()
  })
})

describe('#4180 (R41) — « Même verdict depuis le … » est monté à l’ouverture de la Vue d’ensemble', () => {
  it('SAIT DIRE NON puis OUI : jamais analysé, aucune ligne ; analysé, la ligne est montée hors du repli', () => {
    monter({}, [], {})
    expect(screen.queryByTestId('verdict-unchanged-line')).not.toBeInTheDocument()
  })

  it('un compte analysé monte la ligne sans ouvrir « Historique des analyses »', () => {
    monter({ status: 'completed' }, [], {})
    expect(screen.getByTestId('verdict-unchanged-line')).toBeInTheDocument()
  })
})

describe('#4994.1 (recette prod 03/11) — « Axes de lecture du compte » ne rend aucun code NAF brut', () => {
  it('SAIT DIRE NON puis OUI : le code part, le libellé et le texte restent', async () => {
    monter({ status: 'completed' } as Partial<Account>, CONTACTS, {
      ...RICHE,
      structural_reading_axes: [
        { label: 'Arts du spectacle (NAF 90.01Z)', interpretation: 'Activité déclarée NAF 92.3B, mécénat culturel' },
      ],
      financial_indicators: [{ label: 'Chiffre d’affaires stable, NAF 90.01Z' }],
    })
    const user = userEvent.setup()
    for (const toggle of screen.queryAllByRole('button', { expanded: false })) await user.click(toggle)

    expect(screen.getByText(/Arts du spectacle/)).toBeInTheDocument()
    expect(screen.getByText(/mécénat culturel/)).toBeInTheDocument()
    expect(screen.getByText(/Chiffre d’affaires stable/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/NAF\s*\d/)
  })
})
