import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PilotageLevelReport, PilotageMetric, PilotageStatus } from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * #1812 (09/09/2026) — « Demander à {{copilot}} » ne prend plus de place sur la
 * page : sur un poste de bureau, c'est la BULLE qui porte la question, et
 * `AskLaura` ne rend alors rien du tout.
 *
 * Ce test-ci ne mesure pas la bulle — il mesure que CET écran propose bien le
 * geste, avec le bon libellé et le bon contexte. On double donc le dépôt pour
 * dire « une autre instance porte la bulle », cas où `AskLaura` rend son lien
 * exactement comme avant. Le nouveau chemin a ses propres tests :
 * `laura-intro-store.test.tsx`, `LauraIntroBar.test.tsx`, `LauraDock.intro.test.tsx`
 * et `AskLaura.test.tsx`.
 */
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * Le compteur « 3 alertes » de l'entête de `/pilotage` (#1128).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, NOMMÉ PAR LOUIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Pareil que les autres fois. Si tu mets un truc en rouge, peux tu me mettre
 * cliquable pour qu'on arrive directement sur lesdites alertes :) »
 *
 * C'est la DEUXIÈME fois : le tableau de bord avait exactement ce défaut
 * (#1095, #1096). Le chiffre est juste — il compte les maillons dont le statut
 * est `alerte` — et il n'existait AUCUN chemin depuis l'endroit où la question
 * se pose vers ce qu'il compte. Le pilotage affiche huit maillons, dont deux ou
 * trois rouges quelque part dans la mosaïque : lire « 3 alertes » puis chercher
 * lesquelles à l'œil est exactement le travail que l'écran devait éviter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS GARDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Le compteur est un CONTRÔLE — donc tabulable, annoncé, et il répond à
 *    Entrée. `<button type="button">` et non `<div onClick>` (GA-35).
 * 2. Il mène au maillon qui décroche, et à lui seul : un maillon `ok` ou
 *    `non_mesure` n'est pas une destination.
 * 3. « lesdites alertes » est un PLURIEL : un second clic mène à la suivante.
 * 4. Zéro alerte ⇒ aucune pastille. Jamais « 0 alertes », qui présenterait une
 *    absence comme une mesure.
 */
const useQuery = vi.fn()
// #1322 / #1323 — l'écran porte maintenant un entête personnalisé, qui lit le
// profil. Ce test-ci ne mesure pas l'entête : il double la feuille plutôt que
// de monter un fournisseur de session dont il n'a rien à faire.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => useQuery(options) }))
// #4197 — la carte « besoins détectés » de `DecisionStrip` lit `useCrmCounters` (un `useQuery`) :
// sans ce double, le `useQuery` partagé ci-dessus lui rendrait `{ levels }` pour tout.
vi.mock('@/features/crm-counters/useCrmCounters', () => ({ useCrmCounters: () => ({ data: undefined }) }))

/** L'arbre de routes que CE navigateur connaît — voir `quality/lib/destinations`. */
let routesByPath: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
  useRouter: () => ({ routesByPath }),
}))

const chain = vi.fn()
vi.mock('../api', () => ({ pilotageApi: { chain: () => chain() } }))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

/** L'entête réelle est montée par `CustomerPage`. Ce qui compte ici est que la
 *  pastille et les cartes vivent dans le MÊME document : c'est ce qui permet au
 *  bouton de retrouver sa destination. */
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, pageTitleBadge }: { children: React.ReactNode; pageTitleBadge?: React.ReactNode }) => (
    <div>
      <header>{pageTitleBadge}</header>
      {children}
    </div>
  ),
}))

vi.mock('./CrmPipelinePanel', () => ({ CrmPipelinePanel: () => <div data-testid="crm-pipeline-panel" /> }))
// L1 Cockpit — les deux blocs neufs ont leurs propres tests (`WeekDeltaStrip.test.tsx`,
// `MonthObjectiveBlock.test.tsx`) et leur propre lecture réseau, qui passerait par le
// même `useQuery` partagé ci-dessus.
vi.mock('./WeekDeltaStrip', () => ({ WeekDeltaFold: () => <div data-testid="block-weekDelta" /> }))
// Louis 23/10 — le Cockpit de Théo (`./cockpit/*`) : ses pièces ont leurs propres tests (`cockpit/Cockpit.test.tsx`,
// `CockpitPipeEvolution.test.tsx`) et leurs propres lectures, qui passeraient par le `useQuery` partagé ci-dessus.
vi.mock('./cockpit/useCockpitFigures', () => ({ useCockpitFigures: () => ({}) }))
vi.mock('./cockpit/CockpitCoverage', () => ({ CockpitCoverage: () => <div data-testid="cockpit-coverage" /> }))
vi.mock('@/features/dashboard/components/personal/TrajectoryVerdict', () => ({
  TrajectoryVerdict: () => <div data-testid="trajectory-verdict" />,
}))
vi.mock('./cockpit/CockpitTiles', () => ({ CockpitTiles: () => <div data-testid="block-tiles" /> }))
vi.mock('./cockpit/CockpitCash', () => ({ CockpitCash: () => <div data-testid="block-finance-card" /> }))
vi.mock('./cockpit/CockpitPipeEvolution', () => ({ CockpitPipeEvolution: () => <div data-testid="block-curve" /> }))
vi.mock('./cockpit/CockpitStages', () => ({ CockpitStages: () => <div data-testid="block-stages" /> }))
vi.mock('./cockpit/CockpitDecisions', () => ({
  CockpitDecisions: () => <section data-testid="block-decisions" aria-label="Trois décisions à prendre" />,
}))
vi.mock('./MonthObjectiveBlock', () => ({ MonthObjectiveBlock: () => <div data-testid="block-objective" /> }))
const esnProfile = vi.fn(() => ({ data: { user_role: null as string | null } }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useEsnProfile: () => esnProfile() }))
vi.mock('./RitualsPanel', () => ({ RitualsPanel: () => null }))
vi.mock('./WorkspaceLearningPanel', () => ({ WorkspaceLearningPanel: () => null }))
vi.mock('./InterestPenetrabilityPortfolioPanel', () => ({ InterestPenetrabilityPortfolioPanel: () => null }))
vi.mock('./ContributionPanel', () => ({ ContributionPanel: () => null }))
vi.mock('@/features/playbooks/view/InterventionsBlock', () => ({ InterventionsBlock: () => null }))
vi.mock('@/features/playbooks/view/PlaybooksSummary', () => ({ PlaybooksSummary: () => null }))
// #3253.d (reste de #3294) — la section a son propre appelant réseau
// (`useWeakestLinkDiagnosis`), qui passerait par le même `useQuery` partagé
// ci-dessus (il ne discrimine pas par clé) : doublée, comme les deux hooks
// du contexte Laura juste en dessous.
vi.mock('@/features/weakest-link-diagnosis/WeakestLinkDiagnosisSection', () => ({
  WeakestLinkDiagnosisSection: () => <div data-testid="weakest-link-diagnosis-section" />,
}))

// #2206.45-.48 — le contexte Laura de l'écran lit ces deux hooks EN PLUS de
// `pilotageApi.chain` ; les doubler évite de les faire transiter par le même
// `useQuery` partagé ci-dessus, qui ne discrimine pas par clé.
const interventionsQuery = vi.fn(() => ({ data: [] }))
vi.mock('@/features/playbooks/api', () => ({ useInterventions: () => interventionsQuery() }))
const membersQuery = vi.fn(() => ({ data: [] }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => membersQuery() }))

const { CockpitBody } = await import('./CockpitBody')

function level(name: PilotageLevelReport['level'], status: PilotageStatus): PilotageLevelReport {
  return {
    level: name,
    status,
    metrics: [{ key: `${name}_total`, value: status === 'non_mesure' ? null : 12, unit: 'count', status }],
  }
}

/** Trois maillons rouges parmi huit — la mosaïque exacte de la capture. */
function chainWithThreeAlerts(): PilotageLevelReport[] {
  return [
    level('acquisition', 'ok'),
    level('conversation', 'alerte'),
    level('qualification', 'ok'),
    level('sourcing', 'alerte'),
    level('conversion', 'ok'),
    level('economie', 'non_mesure'),
    level('expansion', 'alerte'),
    level('qualite', 'ok'),
  ]
}

function seed(levels: PilotageLevelReport[]) {
  useQuery.mockReturnValue({ data: { levels }, isLoading: false })
}

/** Les cinq écrans qui portent les objets comptés par la chaîne. */
const ALL_ROUTES: Record<string, unknown> = {
  '/mes-cibles': true,
  '/contacts': true,
  '/projects/needs': true,
  '/consultants': true,
  '/accounts': true,
}

beforeEach(() => {
  vi.clearAllMocks()
  esnProfile.mockReturnValue({ data: { user_role: null } })
  routesByPath = ALL_ROUTES
  seed(chainWithThreeAlerts())
})

describe('/pilotage — un bloc ne vit qu’à un seul endroit (GA-26)', () => {
  it('ne monte plus la synthèse CRM : elle vit dans Pilotage › Pipe', () => {
    render(<CockpitBody />)
    expect(screen.queryByTestId('crm-pipeline-panel')).toBeNull()
  })
})

describe('/pilotage › Cockpit — le recul du portefeuille (#2114)', () => {
  // #2114.13/.60/.64/.66 — le verdict et la couverture étaient montés sous une route morte (/dashboard).
  it('monte le verdict de trajectoire EN TÊTE, puis la couverture du portefeuille', () => {
    render(<CockpitBody />)
    const verdict = screen.getByTestId('trajectory-verdict')
    const tiles = screen.getByTestId('block-tiles')
    const coverage = screen.getByTestId('cockpit-coverage')
    expect(verdict.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tiles.compareDocumentPosition(coverage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('/pilotage — le compteur d’alertes mène aux alertes', () => {
  it('est un bouton, donc tabulable et annoncé (GA-35 / GA-32)', async () => {
    render(<CockpitBody />)

    const counter = screen.getByRole('button', { name: /3 alertes/i })
    expect(counter).toHaveAttribute('type', 'button')
    // Un `<button>` est dans l'ordre de tabulation par construction : on vérifie
    // qu'on ne l'en a pas sorti, et que son nom accessible CONTIENT le libellé
    // visible (WCAG 2.5.3 — « label in name »).
    expect(counter).not.toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('3 alertes')).toBeInTheDocument()

    // Tabulable : l'ordre de tabulation atteint le bouton (des cartes de décision le précèdent désormais).
    for (let step = 0; step < 30 && document.activeElement !== counter; step += 1) await userEvent.tab()
    expect(document.activeElement).toBe(counter)
  })

  it('mène au premier maillon qui décroche — pas au premier maillon tout court', async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    render(<CockpitBody />)

    await userEvent.click(screen.getByRole('button', { name: /3 alertes/i }))

    const landed = document.activeElement as HTMLElement
    expect(landed.id).toBe('pilotage-maillon-conversation')
    expect(landed.textContent).toContain('Conversation')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('répond à Entrée au clavier, comme tout bouton', async () => {
    render(<CockpitBody />)

    const counter = screen.getByRole('button', { name: /3 alertes/i })
    counter.focus()
    await userEvent.keyboard('{Enter}')

    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-conversation')
  })

  it('« lesdites alertes » est un pluriel : le clic suivant mène à la suivante', async () => {
    render(<CockpitBody />)
    const counter = screen.getByRole('button', { name: /3 alertes/i })

    await userEvent.click(counter)
    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-conversation')

    await userEvent.click(counter)
    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-sourcing')

    await userEvent.click(counter)
    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-expansion')

    // Et la boucle revient au début plutôt que de devenir inerte.
    await userEvent.click(counter)
    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-conversation')
  })

  it('ne fait de destination QUE des maillons qui décrochent', () => {
    const { container } = render(<CockpitBody />)

    expect(container.querySelector('#pilotage-maillon-conversation')).not.toBeNull()
    // `ok` : rien à aller voir. `non_mesure` non plus — y envoyer quelqu'un lui
    // ferait chercher un décrochage là où il n'y a pas de mesure.
    expect(container.querySelector('#pilotage-maillon-acquisition')).toBeNull()
    expect(container.querySelector('#pilotage-maillon-economie')).toBeNull()
  })

  it('un seul maillon rouge : la pastille est au singulier et mène là', async () => {
    seed([level('acquisition', 'ok'), level('conversion', 'alerte')])
    render(<CockpitBody />)

    await userEvent.click(screen.getByRole('button', { name: /1 alerte/i }))
    expect((document.activeElement as HTMLElement).id).toBe('pilotage-maillon-conversion')
  })

  it('aucune alerte : aucune pastille, et surtout pas « 0 alertes »', () => {
    seed([level('acquisition', 'ok'), level('economie', 'non_mesure')])
    render(<CockpitBody />)

    expect(screen.queryByRole('button', { name: /alerte/i })).toBeNull()
    expect(screen.queryByText(/0 alerte/i)).toBeNull()
  })
})

/**
 * #2206.5 — « phrase dynamique chiffrée depuis données réelles ». L'en-tête
 * promettait déjà « Bellum … te montre uniquement les endroits où une
 * décision est nécessaire », mais la phrase était générique, la même que la
 * chaîne soit saine ou en feu. Elle reprend désormais le MÊME calcul que la
 * pastille (`alertingLevels`, GA-26) — jamais un second décompte.
 */

/**
 * #1805 — « mettre les alertes, à droite du titre, et plus sur une ligne en
 * plus ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA PASTILLE FAISAIT AVANT
 * ─────────────────────────────────────────────────────────────────────────
 * `pageTitleBadge` la portait jusqu'à `PageHeader` — le mock de
 * `CustomerPage` ci-dessus la capture dans le `<header>` de test pour cette
 * raison précise, à l'origine. Sur `/pilotage`, `PageHeader` ne rend JAMAIS
 * son propre titre (la barre de section nomme déjà l'écran), si bien que la
 * pastille se retrouvait SEULE dans cette entête — une bande de 48 px sans
 * rien à sa gauche, distincte du bloc d'accueil qui porte le VRAI titre visible
 * (`ScreenIntro`). C'est exactement « une ligne en plus ».
 *
 * Ces tests gardent le contraire : la pastille est rendue dans le MÊME bloc
 * que le titre affiché, jamais dans l'entête générique, et jamais deux fois.
 */
// #2206.4 — le libellé exact demandé, « Voici où ton système décroche » : la
// personnalisation par prénom (#1322.1) reste, seule la formule change.

/**
 * L'accès contextuel au copilote — une surface, pas six (#1322.6, D44).
 *
 * ⚠️ Les gardes « un compteur mène à sa population » et « un quotient ne ment
 * pas sur zéro » ont DÉMÉNAGÉ dans `LevelDetail.test.tsx` le 04/09/2026
 * (#1433). Elles n'ont pas été affaiblies : la chaîne ne montre plus qu'une
 * métrique par maillon et les autres vivent dans le détail qui s'ouvre au clic,
 * si bien qu'une garde restée ici aurait mesuré une page où la moitié des lignes
 * ne sont plus rendues — et serait passée au vert en ne lisant rien.
 */
function metric(key: string, value: number | null, unit: 'count' | 'rate' = 'count'): PilotageMetric {
  return { key, value, unit, status: value === null ? 'non_mesure' : 'ok' }
}

function chainWith(metrics: PilotageMetric[]): PilotageLevelReport[] {
  return [{ level: 'acquisition', status: 'ok', metrics }]
}

const ACCES_COPILOTE = '/chat'

/**
 * La tendance des indicateurs de STOCK (D2 · 26/08, D49 · 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * (a) SANS photo du mois précédent, aucun pourcentage ne s'affiche, et l'écran
 *     DIT pourquoi. « +100 % » sur un mois qu'on n'a pas mesuré serait une
 *     invention — la même faute que d'écrire « 0 » pour « non mesuré ».
 *  ·  La photo ne vaut QUE pour les stocks : un indicateur de FLUX n'en porte
 *     pas, parce que sa comparaison se recalcule à partir de dates.
 *  ·  « rien le mois précédent » (un zéro MESURÉ) et « pas de photo » (rien de
 *     mesuré) ne sont pas la même phrase, et ne doivent jamais le devenir.
 */
describe('/pilotage — la tendance des STOCKS', () => {
  function seedWithBaseline(metrics: PilotageMetric[], values: Record<string, number> | null) {
    useQuery.mockReturnValue({
      data: {
        levels: chainWith(metrics),
        stockBaseline:
          values === null
            ? { month: null, takenOn: null, values: {} }
            : { month: '2026-07', takenOn: '2026-07-31', values },
      },
      isLoading: false,
    })
  }

  it('(a) sans photo précédente : AUCUN pourcentage, et la phrase qui l’explique', () => {
    seedWithBaseline([metric('activeClients', 12)], null)
    render(<CockpitBody />)

    expect(screen.getByText('pas de photo le mois dernier')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  // R21-FIX (15/10) : un STOCK compté se lit en écart absolu, jamais « +2612 % ».
  it('affiche l’écart absolu quand la photo existe, jamais un pourcentage', () => {
    seedWithBaseline([metric('activeClients', 12)], { activeClients: 10 })
    render(<CockpitBody />)

    expect(screen.getByText('+2 vs mois précédent')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('« rien le mois précédent » n’est PAS « pas de photo » — un zéro mesuré est une mesure', () => {
    seedWithBaseline([metric('activeClients', 3)], { activeClients: 0 })
    render(<CockpitBody />)

    expect(screen.getByText('rien le mois précédent')).toBeInTheDocument()
    expect(screen.queryByText('pas de photo le mois dernier')).not.toBeInTheDocument()
  })

  it('les deux mois à zéro : « aucun ce mois-ci », toujours sans pourcentage', () => {
    seedWithBaseline([metric('activeClients', 0)], { activeClients: 0 })
    render(<CockpitBody />)

    expect(screen.getByText('aucun ce mois-ci')).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('un indicateur de FLUX ne porte AUCUNE tendance — elle se recalcule', () => {
    // `emailsSent` est daté par `email_sent_at` : le photographier créerait une
    // seconde vérité. La ligne reste un chiffre nu.
    seedWithBaseline([metric('emailsSent', 310)], { activeClients: 10 })
    render(<CockpitBody />)

    expect(screen.getByText('310')).toBeInTheDocument()
    expect(screen.queryByText(/mois/)).not.toBeInTheDocument()
  })

  it('une valeur NON LUE ne se voit attribuer aucune évolution', () => {
    seedWithBaseline([metric('activeClients', null)], { activeClients: 10 })
    render(<CockpitBody />)

    expect(screen.getByText('non mesuré')).toBeInTheDocument()
    expect(screen.queryByText(/mois/)).not.toBeInTheDocument()
  })
})

describe('#3253.d (reste de #3294) — le diagnostic du maillon faible atteint Pilotage', () => {
  it('rend la section — quatrième surface sur six, même composant que /briefing', () => {
    seed(chainWithThreeAlerts())
    render(<CockpitBody />)

    expect(screen.getByTestId('weakest-link-diagnosis-section')).toBeInTheDocument()
  })

  it('L1 — le maillon faible est JUSTE SOUS la chaîne compacte, dans le bloc chaîne', () => {
    render(<CockpitBody />)

    const compact = screen.getByTestId('chain-compact')
    const weakest = screen.getByTestId('weakest-link-diagnosis-section')
    expect(compact.compareDocumentPosition(weakest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(compact.closest('section')).toBe(weakest.closest('section'))
  })
})

describe('L1 Cockpit — quatre blocs, un ordre par rôle, le même contenu', () => {
  const BLOCKS = ['block-weekDelta', 'block-objective', 'weakest-link-diagnosis-section', 'chain-compact'] as const

  const orderOf = () => {
    const ids = [
      ['weekDelta', 'block-weekDelta'],
      ['objective', 'block-objective'],
      ['chain', 'chain-compact'],
    ] as const
    return [...ids]
      .map(([name, id]) => ({ name, node: screen.getByTestId(id) }))
      .sort((a, b) => (a.node.compareDocumentPosition(b.node) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .map(item => item.name)
  }

  it('défaut : delta de la semaine → objectif → chaîne', () => {
    render(<CockpitBody />)
    expect(orderOf()).toEqual(['weekDelta', 'objective', 'chain'])
  })

  it('dirigeant : l’objectif passe en premier', () => {
    esnProfile.mockReturnValue({ data: { user_role: 'Fondateur / CEO' } })
    render(<CockpitBody />)
    expect(orderOf()[0]).toBe('objective')
  })

  it('manager commercial : les décisions passent en premier', () => {
    esnProfile.mockReturnValue({ data: { user_role: 'Business Manager' } })
    render(<CockpitBody />)
    const decisions = screen.getByTestId('block-decisions')
    expect(
      decisions.compareDocumentPosition(screen.getByTestId('block-weekDelta')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it.each([null, 'Fondateur / CEO', 'Business Manager', 'Head of Sales', 'Business Developer', 'Responsable staffing'])(
    'le rôle %s change l’ORDRE, jamais le CONTENU : mêmes blocs, mêmes titres',
    role => {
      esnProfile.mockReturnValue({ data: { user_role: role } })
      const { container, unmount } = render(<CockpitBody />)
      for (const id of BLOCKS) expect(screen.getByTestId(id)).toBeInTheDocument()
      // Louis 23/10 — le Cockpit de Théo : « Trois décisions », le pli de la chaîne et le pli « Détail ».
      expect(screen.getByTestId('block-decisions')).toBeInTheDocument()
      const folds = [...container.querySelectorAll('details[data-testid]')].map(node =>
        node.getAttribute('data-testid'),
      )
      expect(folds).toEqual(expect.arrayContaining(['cockpit-chain-fold', 'cockpit-detail-fold']))
      expect([...container.querySelectorAll('h2')].map(h => h.id)).toEqual(['cockpit-chain'])
      unmount()
    },
  )

  it('le dictionnaire des indicateurs (KpiCataloguePanel) a disparu de la page', () => {
    render(<CockpitBody />)
    expect(screen.queryByText(/dictionnaire des indicateurs/i)).not.toBeInTheDocument()
  })

  it('le reste vit sous un seul titre « Détail »', () => {
    render(<CockpitBody />)
    expect(screen.getByTestId('cockpit-detail-fold').querySelector('summary')).toHaveTextContent(/^Détail/)
  })
})
