import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useMarketContextSearch } from '@/features/search/hooks/useMarketContextSearch'
import { useHasAccountsToAct } from '@/features/accounts/hooks/useHasAccountsToAct'
import { WelcomeScreen } from './WelcomeScreen'

/**
 * #1921.9 → #1921.12 — L'ACCUEIL PASSE LA MAIN À LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Laura parle après la restitution — une phrase STATIQUE (aucun appel
 *    réseau supplémentaire au delà des données déjà chargées par l'écran).
 * 2. Le CTA principal « Laisse Laura choisir » ouvre `/chat?from=welcome`,
 *    SANS `prompt` ni `ask` : c'est Laura qui parle en premier.
 * 3. Les deux CTA secondaires réutilisent des destinations EXISTANTES
 *    (`/search`, `/consultants`) — aucune nouvelle route.
 * 4. Le maillon faible n'est PLUS ici (décision Louis 19/10 — maillon faible :
 *    Cockpit seul, `/pilotage`). `OnboardingRestitutionCard` reste le MÊME
 *    composant qu'utilise `/settings/profile/context` (GA-26).
 * 5. Ce que les connecteurs débloqueront (#1921.8) nomme des CAPACITÉS —
 *    jamais un éditeur — et lie vers Réglages › Intégrations.
 */

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} data-to={to} {...rest}>
      {children}
    </a>
  ),
  useNavigate: () => navigate,
}))
vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: vi.fn() }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: vi.fn() }))
vi.mock('@/features/profile-context/hooks/useProfileContext', () => ({ useProfileContext: vi.fn() }))
vi.mock('@/features/search/hooks/useMarketContextSearch', () => ({ useMarketContextSearch: vi.fn() }))
// #2091.31 — le signal de PORTEFEUILLE EXISTANT pour « prioriser ma semaine ».
vi.mock('@/features/accounts/hooks/useHasAccountsToAct', () => ({ useHasAccountsToAct: vi.fn() }))
// R16-3 — même mock que `Chat.test.tsx` : `/welcome` lit le MÊME hook que la
// saisie de Laura (pas un second chemin vers le registre d'outils).
const connectedCapabilitiesMock = vi.fn()
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => connectedCapabilitiesMock(),
}))
// #3252.8 — « Ce n'est pas mon contexte » réutilise le déclencheur EXISTANT
// (#2021/#2022) — ce mock isole la restitution de `useSession`, hors de
// portée de ces tests-ci.
const reconfigureTrigger = vi.fn().mockResolvedValue(true)
vi.mock('@/features/profile/hooks/useReconfigureOnboarding', () => ({
  useReconfigureOnboarding: () => ({
    available: true,
    alreadyRequested: false,
    pending: false,
    trigger: reconfigureTrigger,
  }),
}))

const MAIN_WEAKNESS = 'Tu réponds tard aux appels d’offres entrants.'
const KEY_ADVICE = 'Priorise les comptes où un consultant est déjà positionné.'

function mockProfile(firstName = 'Théo'): void {
  vi.mocked(useProfile).mockReturnValue({
    data: { first_name: firstName },
  } as unknown as ReturnType<typeof useProfile>)
}

function mockEsn(recruitsForClients: 'yes' | 'no' | null = 'yes'): void {
  vi.mocked(useEsnProfile).mockReturnValue({
    data: {
      esn_name: 'Acme ESN',
      consultant_size: '20',
      expertise_areas: [],
      target_sectors: [],
      // #2091.28 — par défaut `'yes'` : la majorité des tests de ce fichier
      // ne portent pas sur ce signal et attendaient déjà le bouton visible.
      recruits_for_clients: recruitsForClients,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useEsnProfile>)
}

function mockProfileContext(
  overrides: {
    coaching?: boolean
    strengths?: string[]
    suggestions?: number
    withheldFields?: string[]
    withheldAt?: string
    noContext?: boolean
  } = {},
): void {
  if (overrides.noContext) {
    vi.mocked(useProfileContext).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useProfileContext>)
    return
  }
  vi.mocked(useProfileContext).mockReturnValue({
    data: {
      profile_context: {
        welcomeSummary: {
          profileRecap: '',
          searchesPersonalization: '',
          contactsPersonalization: '',
          messagesPersonalization: '',
          scoringPersonalization: '',
          firstAnalysisSuggestions: Array.from({ length: overrides.suggestions ?? 0 }, (_, i) => ({
            companyName: `Compte ${i}`,
            sector: 'Banque',
            reason: 'Signal récent',
          })),
        },
        coachingInsights: overrides.coaching ? { mainWeakness: MAIN_WEAKNESS, keyAdvice: KEY_ADVICE } : undefined,
        messagingStyle: overrides.strengths ? { differentiationPoints: overrides.strengths } : undefined,
      },
      withheld: overrides.withheldFields
        ? { fields: overrides.withheldFields, storedAt: overrides.withheldAt ?? null }
        : undefined,
    },
  } as unknown as ReturnType<typeof useProfileContext>)
}

function mockMarketSearch(): void {
  vi.mocked(useMarketContextSearch).mockReturnValue({
    data: undefined,
    isPending: false,
  } as unknown as ReturnType<typeof useMarketContextSearch>)
}

/** #2091.31 — le signal de PORTEFEUILLE EXISTANT, `false` par défaut : un
 *  utilisateur qui sort d'onboarding n'a, par construction, rien à prioriser. */
function mockAccountsToAct(hasAccountsToAct = false): void {
  vi.mocked(useHasAccountsToAct).mockReturnValue({
    data: { hasAccountsToAct },
  } as unknown as ReturnType<typeof useHasAccountsToAct>)
}

beforeEach(() => {
  navigate.mockReset()
  mockProfile()
  mockEsn()
  mockMarketSearch()
  mockAccountsToAct()
  connectedCapabilitiesMock.mockReset()
  connectedCapabilitiesMock.mockReturnValue({ families: [], tools: [], isLoading: false })
})

afterEach(() => {
  cleanup()
})

describe('#1921.9 — Laura parle après la restitution', () => {
  it('affiche une phrase signée, avec le prénom — texte STATIQUE, aucun choix produit requis', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.getByText(/j’ai maintenant suffisamment de contexte pour commencer/i)).toBeInTheDocument()
  })

  it('dégrade proprement sans prénom — jamais une phrase cassée', () => {
    mockProfile('')
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.getByText(/j’ai maintenant suffisamment de contexte pour commencer/i)).toBeInTheDocument()
  })
})

// #2091.26 — « j'ai MAINTENANT suffisamment de contexte » n'est vrai QUE si le
// profil de contexte est réellement chargé. La phrase était affichée sans
// condition alors que `hasProfileContext` existe déjà pour d'autres blocs de
// cet écran (l'audit teaser) — c'est « non mesuré rendu vrai », GA-18/19 un
// cran plus haut : une affirmation, pas un chiffre, mais le même défaut.
describe('#2091.26 — la phrase de Laura ne prétend « suffisamment de contexte » que si c’est vrai', () => {
  it('sans profil de contexte encore établi, Laura ne prétend pas avoir assez de contexte', () => {
    mockProfileContext({ noContext: true })
    render(<WelcomeScreen />)
    expect(screen.queryByText(/suffisamment de contexte/i)).not.toBeInTheDocument()
    expect(screen.getByText(/je termine de préparer ton contexte/i)).toBeInTheDocument()
  })

  it('avec un profil de contexte établi, la phrase affirme le contexte ET nomme le prénom', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.getByText(/merci théo.*j’ai maintenant suffisamment de contexte/i)).toBeInTheDocument()
  })
})

describe('#1921.10 / #2091.34 — le CTA principal passe la main à Laura, avec le contexte de l’audit', () => {
  it('« Laisse Laura choisir » ouvre /chat?from=welcome, SANS prompt ni ask', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /laisse laura choisir/i }))
    const sentSearch = (navigate.mock.calls[0]?.[0] as { search?: Record<string, unknown> })?.search
    expect(sentSearch).toMatchObject({ from: 'welcome' })
    expect(sentSearch).not.toHaveProperty('prompt')
    expect(sentSearch).not.toHaveProperty('ask')
  })

  it('transporte le périmètre et la stratégie de l’audit, sans porter d’objet précis', () => {
    mockEsn('yes')
    mockProfileContext()
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /laisse laura choisir/i }))
    const context = (
      navigate.mock.calls[0]?.[0] as {
        search?: { context?: { entityId: string | null; facets: { label: string; value: string }[] } }
      }
    )?.search?.context
    expect(context?.entityId).toBeNull()
    expect(context?.facets.some(f => f.value.includes('CDI'))).toBe(true)
  })
})

describe('#2091.40 — le premier écran est Laura, ou une action qu’elle a préparée', () => {
  it('le CTA « Laisse Laura choisir » précède le résumé de profil dans le document', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    const lauraCta = screen.getByRole('button', { name: /laisse laura choisir/i })
    const profileSummary = screen.getByRole('heading', { name: /a compris de ton activité/i })
    // `DOCUMENT_POSITION_FOLLOWING` : `profileSummary` vient APRÈS `lauraCta`.

    expect(lauraCta.compareDocumentPosition(profileSummary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('maquette validée ouverture.html#ouverture-premier-jour, grammaire onboarding-accueil', () => {
  it('ordonne : en-tête (question), gestes, Laura, tableau des comptes, ce que Bellum a compris', () => {
    mockProfileContext({ suggestions: 3 })
    render(<WelcomeScreen />)
    const heading = screen.getByTestId('welcome-heading')
    expect(heading.querySelector('h1')?.textContent).toMatch(/Par quel compte commences-tu/)
    const order = [
      heading,
      screen.getByRole('button', { name: /laisse laura choisir/i }),
      screen.getByTestId('welcome-laura'),
      screen.getByRole('heading', { name: /des comptes qui te ressemblent/i }),
      screen.getByRole('table'),
      screen.getByRole('heading', { name: /a compris de ton activité/i }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('le tableau commun nomme ses colonnes et ouvre chaque compte par « Analyser »', () => {
    mockProfileContext({ suggestions: 2 })
    render(<WelcomeScreen />)
    const headers = screen.getAllByRole('columnheader').map(th => th.textContent)
    expect(headers).toEqual(['Compte', 'Secteur visé', 'Pourquoi', 'Action'])
    expect(screen.getAllByRole('button', { name: 'Analyser' })).toHaveLength(2)
  })

  it('sans suggestion : aucun tableau, aucune ligne vide', () => {
    mockProfileContext({ suggestions: 0 })
    render(<WelcomeScreen />)
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('#1921.11 / #1921.12 — les CTA secondaires réutilisent des destinations EXISTANTES', () => {
  it('« Analyser un compte » sans suggestion ouvre la recherche existante (/search)', () => {
    mockProfileContext({ suggestions: 0 })
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /analyser un compte/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/search' })
  })

  it('« Analyser un compte » avec des suggestions déjà prêtes défile vers elles, sans créer de destination', () => {
    mockProfileContext({ suggestions: 3 })
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /analyser un compte/i }))
    expect(navigate).not.toHaveBeenCalledWith({ to: '/search' })
  })

  it('« Partir d’un consultant » ouvre le vivier existant (/consultants)', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /partir d.un consultant/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/consultants' })
  })
})

describe('#2091.28 — « Partir d’un consultant » est ISSUE DE L’AUDIT, pas fixe', () => {
  it('ne se propose PAS à une ESN qui a dit ne pas placer de CDI chez ses clients (#1124)', () => {
    mockEsn('no')
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.queryByRole('button', { name: /partir d.un consultant/i })).toBeNull()
    // Le repli générique, lui, reste — rien dans l'audit ne peut le rendre hors-sujet.
    expect(screen.getByRole('button', { name: /analyser un compte/i })).toBeInTheDocument()
  })

  it('ne se propose pas non plus tant que l’ESN n’a pas répondu — un `null` n’est pas un `yes`', () => {
    mockEsn(null)
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.queryByRole('button', { name: /partir d.un consultant/i })).toBeNull()
  })
})

describe('#2091.31 — « Prioriser ma semaine » exige un PORTEFEUILLE EXISTANT', () => {
  it('ne se propose PAS à la sortie d’onboarding — portefeuille vide, par construction', () => {
    mockEsn(null)
    mockAccountsToAct(false)
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.queryByRole('button', { name: /prioriser ma semaine/i })).toBeNull()
  })

  it('se propose dès que le portefeuille porte un compte en attente d’action, et ouvre /accounts', () => {
    mockEsn(null)
    mockAccountsToAct(true)
    mockProfileContext()
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /prioriser ma semaine/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/accounts' })
  })

  it('TROIS CARTES MAXIMUM — ne se propose jamais en plus de « positionner un consultant »', () => {
    mockEsn('yes')
    mockAccountsToAct(true)
    mockProfileContext()
    render(<WelcomeScreen />)
    expect(screen.getByRole('button', { name: /partir d.un consultant/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /prioriser ma semaine/i })).toBeNull()
  })
})

describe('#1921.3 — Tes forces (points de différenciation du Profiler)', () => {
  it('sans point de différenciation généré : aucun bloc — jamais une liste inventée', () => {
    mockProfileContext({ strengths: [] })
    render(<WelcomeScreen />)
    expect(screen.queryByText('strengths.sectionTitle', { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tes forces' })).not.toBeInTheDocument()
  })

  it('avec des points générés : chacun s’affiche, texte intégral', () => {
    mockProfileContext({ strengths: ['Référence vérifiable sur ce secteur', 'Consultants déjà en poste'] })
    render(<WelcomeScreen />)
    expect(screen.getByRole('heading', { name: 'Tes forces' })).toBeInTheDocument()
    expect(screen.getByText('Référence vérifiable sur ce secteur')).toBeInTheDocument()
    expect(screen.getByText('Consultants déjà en poste')).toBeInTheDocument()
  })
})

describe('maillon faible — Cockpit seul (décision Louis 19/10), plus rien sur /welcome', () => {
  it('sans coaching généré : aucun bloc', () => {
    mockProfileContext({ coaching: false })
    render(<WelcomeScreen />)
    expect(screen.queryByText(MAIN_WEAKNESS)).not.toBeInTheDocument()
    expect(screen.queryByText(KEY_ADVICE)).not.toBeInTheDocument()
  })

  it('⚠️ SAIT DIRE NON — avec coaching généré, ni bloc « maillon faible » ni son texte, ni ligne vers Pilotage', () => {
    mockProfileContext({ coaching: true })
    render(<WelcomeScreen />)
    expect(screen.queryByText('Ton principal maillon faible')).toBeNull()
    expect(screen.queryByText(MAIN_WEAKNESS)).toBeNull()
    expect(screen.queryByTestId('weakest-link-summary')).toBeNull()
    expect(screen.queryByText('Maillon faible du moment')).toBeNull()
    expect(screen.queryByRole('button', { name: /point de vigilance/i })).not.toBeInTheDocument()
  })

  it('ne renvoie plus vers /settings/profile/context', () => {
    mockProfileContext({ coaching: true })
    render(<WelcomeScreen />)
    const link = screen.queryAllByRole('link').find(a => a.getAttribute('data-to') === '/settings/profile/context')
    expect(link).toBeUndefined()
  })
})

/**
 * R15N-11 (note liée) — le mécanisme qui retient un texte non conforme est
 * SAIN (on refuse d'afficher un texte qui viole la doctrine) mais parlait en
 * vocabulaire INTERNE : « nos règles » ne veut rien dire pour un utilisateur.
 * Le mécanisme reste : seul le texte change.
 */
describe('R15N-11 (note liée) — le texte du texte retenu ne parle pas en vocabulaire interne', () => {
  it('nomme ce qui se passe sans dire « nos règles »', () => {
    mockProfileContext({ withheldFields: ['welcomeSummary.searchesPersonalization'], withheldAt: '2026-09-15' })
    render(<WelcomeScreen />)
    expect(screen.queryByText(/nos règles/i)).not.toBeInTheDocument()
    expect(screen.getByText(/prochaine génération de ton contexte/i)).toBeInTheDocument()
  })
})

describe('#2071.1 — la restitution ouvre la porte vers l’audit commercial complet', () => {
  it('sans profil de contexte établi : aucun lien vers l’audit', () => {
    mockProfileContext({ noContext: true })
    render(<WelcomeScreen />)
    expect(screen.queryByRole('link', { name: /audit/i })).not.toBeInTheDocument()
  })

  it('avec un profil de contexte établi : un lien vers /settings/profile/audit', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    const link = screen.getAllByRole('link').find(a => a.getAttribute('data-to') === '/settings/profile/audit')
    expect(link).toBeDefined()
  })
})

describe('#1921.8 — ce que les connecteurs débloqueront, nommé par CAPACITÉ', () => {
  it('nomme CRM / messagerie / agenda, jamais un éditeur, et lie vers Réglages › Intégrations', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    // #2083 a ajouté d’autres bulles qui mentionnent aussi CRM / messagerie /
    // agenda (« ce qui change sans connecteur ») : un motif ANCRÉ retrouve la
    // bulle précise de #1921.8, sans ambiguïté avec les nouvelles.
    expect(screen.getByText(/^Ton CRM :/)).toBeInTheDocument()
    expect(screen.getByText(/^Ta messagerie :/)).toBeInTheDocument()
    expect(screen.getByText(/^Ton agenda :/)).toBeInTheDocument()

    const FORBIDDEN_VENDOR_NAMES = [
      'HubSpot',
      'Salesforce',
      'Pipedrive',
      'Attio',
      'Gmail',
      'Outlook',
      'Google',
      'Microsoft',
      'Notion',
    ]
    const body = document.body.textContent ?? ''
    for (const vendor of FORBIDDEN_VENDOR_NAMES) {
      expect(body).not.toContain(vendor)
    }

    const link = screen.getAllByRole('link').find(a => a.getAttribute('data-to') === '/integrations')
    expect(link).toBeDefined()
  })

  /**
   * Revue d'intégration du lot 7 — la carte promettait deux choses que le
   * produit ne fait pas : « des messages préparés dans le ton du dernier
   * échange » (le corps d'un message ne part JAMAIS vers le modèle, D65 —
   * `doctrine-registry.ts`) et « les rendez-vous et rappels se posent sans un
   * clic de plus » (une écriture d'agenda part d'un geste). Ce qui EST livré :
   * la messagerie et l'agenda nourrissent le brief du matin.
   */
  it('ne promet que ce qui est livré : messagerie et agenda nourrissent le brief, rien ne s’écrit sans geste', () => {
    mockProfileContext()
    render(<WelcomeScreen />)
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/ton du dernier échange/i)
    expect(body).not.toMatch(/sans un clic/i)
    expect(screen.getByText(/^Ta messagerie :.*brief/)).toBeInTheDocument()
    expect(screen.getByText(/^Ton agenda :.*brief/)).toBeInTheDocument()
  })
})

/**
 * R16-3 — mesuré en production le 16/09/2026 : quatre connexions OAuth vivantes
 * depuis six semaines, et `/welcome` rendait quand même « Connecter mes outils »
 * et une liste au futur. La règle du 02/08/2026 (« jamais de nom d'éditeur côté
 * app ») a été REMPLACÉE le 13/09/2026 (décision Louis, batch 11, #1912.11,
 * `tool-naming.ts`) : l'outil que l'espace a BRANCHÉ se nomme, au présent,
 * partout où c'est utile — la saisie de Laura le fait déjà via le MÊME hook
 * (`useConnectedCapabilities`). `/welcome` était resté sur l'ancienne règle.
 */
describe('R16-3 — /welcome nomme les outils BRANCHÉS, au présent (décision du 13/09/2026)', () => {
  it('HubSpot + Gmail branchés : les deux se nomment, « Connecter mes outils » disparaît', () => {
    connectedCapabilitiesMock.mockReturnValue({
      families: ['crm', 'email'],
      tools: [
        { provider: 'hubspot', family: 'crm', name: 'HubSpot' },
        { provider: 'gmail', family: 'email', name: 'Gmail' },
      ],
      isLoading: false,
    })
    mockProfileContext()
    render(<WelcomeScreen />)

    expect(screen.getByText(/^HubSpot :.*sans ressaisie/)).toBeInTheDocument()
    expect(screen.getByText(/^Gmail :.*brief/)).toBeInTheDocument()
    expect(screen.queryByText(/connecter mes outils/i)).not.toBeInTheDocument()
    // L'agenda, lui, n'est pas branché dans ce scénario : il reste au futur,
    // nommé par CAPACITÉ — la règle d'avant reste juste pour ce qui n'est pas connecté.
    expect(screen.getByText(/^Ton agenda :.*brief/)).toBeInTheDocument()
  })

  it('rien de branché : garde exactement la formulation actuelle, au futur, sans nom d’éditeur', () => {
    mockProfileContext()
    render(<WelcomeScreen />)

    expect(screen.getByText(/connecter mes outils/i)).toBeInTheDocument()
    expect(screen.getByText(/^Ton CRM :.*sans ressaisie/)).toBeInTheDocument()
    expect(screen.getByText(/^Ta messagerie :.*brief/)).toBeInTheDocument()
    expect(screen.getByText(/^Ton agenda :.*brief/)).toBeInTheDocument()
  })

  it('registre illisible : se comporte comme « rien branché », jamais une liste inventée', () => {
    // Le hook collapse déjà une erreur réseau / un corps non-tableau vers
    // `tools: []` (`useConnectedCapabilities.test.tsx`, « un registre qui n'est
    // pas un tableau ne nomme rien et ne fait rien tomber ») — cette assertion
    // prouve que l'écran, lui, ne distingue pas « rien branché » de « je ne
    // sais pas » : les deux rendent la même formulation, jamais une liste
    // devinée.
    connectedCapabilitiesMock.mockReturnValue({ families: [], tools: [], isLoading: false })
    mockProfileContext()
    render(<WelcomeScreen />)

    expect(screen.getByText(/connecter mes outils/i)).toBeInTheDocument()
    expect(screen.queryByText(/HubSpot|Gmail/)).not.toBeInTheDocument()
  })
})

/**
 * #2083 — « NE JAMAIS BLOQUER L’UTILISATEUR » : sans connecteur branché,
 * `/welcome` dit explicitement ce qui reste possible tout de suite (#2083.1-.5,
 * .7) et ce qui change en attendant un connecteur (#2083.8-.13) — jamais un
 * silence dont l’utilisateur doit deviner la raison. Une fois un outil
 * branché, `connectors.titleConnected` couvre déjà cette assurance : la
 * doublure disparaît (loi 4 du design, une seule forme du même contenu).
 *
 * #2083.15 — `MarketAwarenessCard` rend `null` sans zone ni expertise
 * déclarée, une décision DÉLIBÉRÉE de #1627 (« RIEN N’EST BLOQUANT »,
 * `MarketAwarenessCard.tsx:63-68`) qu’on ne renverse pas ici. La bulle
 * « mémoire marché » de cette liste porte la condition à sa place, pour que
 * son absence ne se lise jamais comme un vide anormal.
 *
 * #2083.16 — cette liste est écrite HORS du namespace `market-memory` : GA-259
 * ne la voit pas. Elle ne doit donc jamais formuler un taux ou un pourcentage
 * (« couverture ») — seulement des capacités nommées.
 */
describe('#2083 — sans connecteur, ce qui reste possible et ce qui change', () => {
  it('rien de branché : dit ce qui reste possible et ce qui change, sans pourcentage ni « couverture »', () => {
    mockProfileContext()
    render(<WelcomeScreen />)

    expect(
      screen.getByText(/observations du marché.*apparaissent dès que ta zone ou tes expertises/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/découvrir des comptes par signaux/i)).toBeInTheDocument()
    expect(screen.getByText(/analyse publique/i)).toBeInTheDocument()
    expect(screen.getByText(/ajout manuel/i)).toBeInTheDocument()
    expect(screen.getByText(/import d.un fichier/i)).toBeInTheDocument()
    expect(screen.getByText(/plan d.action/i)).toBeInTheDocument()

    expect(screen.getByText(/relations entre contacts.*moins précises/i)).toBeInTheDocument()
    expect(screen.getByText(/historique des échanges.*moins précis/i)).toBeInTheDocument()
    expect(screen.getByText(/rendez-vous.*moins précis/i)).toBeInTheDocument()
    expect(screen.getByText(/doublons.*moins précise/i)).toBeInTheDocument()
    // #2083.12/.13 — écrire dans le CRM et préparer un message sont
    // INDISPONIBLES sans connecteur, jamais « moins précis » : la doctrine
    // interdit de dire une chose fausse pour rester dans un même vocabulaire.
    expect(screen.getByText(/écrire dans ton crm.*indisponible/i)).toBeInTheDocument()
    expect(screen.getByText(/préparer un message.*indisponible/i)).toBeInTheDocument()

    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/%/)
    expect(body).not.toMatch(/couverture/i)
  })

  it('un outil déjà branché : la liste disparaît — l’assurance vit déjà dans « ce que tes outils font »', () => {
    connectedCapabilitiesMock.mockReturnValue({
      families: ['crm'],
      tools: [{ provider: 'hubspot', family: 'crm', name: 'HubSpot' }],
      isLoading: false,
    })
    mockProfileContext()
    render(<WelcomeScreen />)

    expect(screen.queryByText(/observations du marché.*apparaissent dès que/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ce qui change sans connecteur/i)).not.toBeInTheDocument()
  })
})

/**
 * #2002 (la famille) — « le bouton [...] est trop petit », le même défaut sur
 * l'écran voisin du parcours d'entrée.
 *
 * Trois gestes AUTONOMES (corriger la restitution, ouvrir le contexte de
 * profil, brancher un outil) posés seuls au bout d'une ligne d'entête, en
 * `text-xs` : 16 px de haut sous un doigt, quatre fois moins que le plancher
 * GA-30. Ce ne sont PAS les liens de texte DANS une phrase que GA-30 exempte
 * (`variant="link"` neutralise le plancher exprès, `button.tsx`
 * compoundVariants) — ceux-ci sont des boutons écrits en lien.
 *
 * ⚠️ Comme sur `/onboarding/plan` : jsdom ne mesure pas, donc on lit DEUX
 * classes. `min-height` est inerte sur une boîte inline, et un `<Link>` rend
 * une `<a>` — sans passage en flex sous pointeur grossier, le plancher ne
 * grandit rien.
 */
describe('#2002 (famille) — les gestes autonomes de l’accueil atteignent 44 px au doigt (GA-30)', () => {
  // #1921.4/.5 — `/settings/profile/context` a quitté cette liste : le
  // coaching est rapatrié, ce n'est plus un lien de renvoi (voir plus haut).
  it.each([['/onboarding'], ['/integrations']])(
    'le lien vers %s porte le plancher tactile, sur une boîte qui sait grandir',
    to => {
      mockProfileContext({ coaching: true })
      render(<WelcomeScreen />)

      const link = screen.getAllByRole('link').find(a => a.getAttribute('data-to') === to)
      expect(link).toBeDefined()
      expect(link?.className).toContain('pointer-coarse:min-h-11')
      expect(link?.className).toMatch(/pointer-coarse:(inline-)?flex/)
    },
  )
})

describe('#2075.28 — « Analyser un compte de mon audit » ouvre le parcours d’analyse PRÉREMPLI', () => {
  it('avec des comptes proposés : /search avec le premier compte de l’audit, sa raison et son identifiant', () => {
    mockProfileContext({ suggestions: 2 })
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /analyser un compte de mon audit/i }))
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate.mock.calls[0]?.[0]).toMatchObject({
      to: '/search',
      search: { company: 'Compte 0', suggestionReason: 'Signal récent' },
    })
    expect((navigate.mock.calls[0]?.[0] as { search: Record<string, unknown> }).search).toHaveProperty('suggestionId')
  })

  it('sait dire NON : sans compte proposé, la recherche s’ouvre vide (aucun compte inventé)', () => {
    mockProfileContext({ suggestions: 0 })
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByRole('button', { name: /analyser un compte/i }))
    expect(navigate).toHaveBeenCalledWith({ to: '/search' })
  })
})
