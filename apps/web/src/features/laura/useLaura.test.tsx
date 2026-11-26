import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import type { InterventionDefinition } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { STALE_RUN_MS, useAnalysisStore } from '@/stores/analysisStore'
import { useBackgroundTasksStore } from '@/stores/backgroundTasksStore'
import { LauraCard } from './LauraCard'
import { isLauraSilenced, setLauraSilenced } from './laura-silence-signal'
import { useLauraBusy } from './useLauraBusy'

// #1946.10 — le traceur produit mesure la NATURE d'intervention (`intervention.key`)
// et son issue — voir le describe dédié plus bas.
const trackInterventionOutcome = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackInterventionOutcome: (...args: unknown[]) => trackInterventionOutcome(...args),
}))

/**
 * LAURA SE TAIT VRAIMENT PENDANT UNE ANALYSE — §3.2 du PDF 7.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS PROUVENT, ET CE QU'ILS REFUSENT DE PROUVER
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle « jamais pendant une saisie, un import, une analyse, une validation »
 * était écrite, gardée côté serveur, et **ne se déclenchait pratiquement
 * jamais** : le client la calculait avec `[data-analysis-running="true"]`, un
 * attribut posé par AUCUN composant du dépôt, photographié UNE fois au
 * changement d'écran.
 *
 * Un test qui vérifierait qu'une constante existe, ou qu'un attribut est bien
 * lu, aurait été vert sur le code défectueux. Ceux-ci passent donc par l'écran
 * de Laura et par le corps réellement envoyé au serveur : pendant une analyse,
 * ce qui part porte `busy: true` et **rien ne s'affiche**.
 *
 * ⚠️ Le serveur simulé applique la vraie règle de `canInterrupt` — il refuse
 * quand la demande dit `busy`, et il refuse AVANT d'écrire la trace. Un mock qui
 * répondrait toujours pareil testerait le client contre un serveur qui n'existe
 * pas ; celui-ci a d'ailleurs révélé une boucle de requêtes (223 en une
 * seconde) que la première version du correctif portait.
 */

vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useLocation: () => ({ pathname: '/dashboard' }) }
})

const apiFetchMock = vi.mocked(apiFetch)

const INTERVENTION: InterventionDefinition = {
  key: 'rfp_deadline_gaps',
  family: 'business_value',
  condition: 'Un appel d’offres arrive à échéance sous trois jours.',
  action: 'Ouvrir le dossier',
  screen: '/dashboard',
  route: '/projects',
  format: 'panel',
  impact: 9,
  urgency: 10,
  actionability: 10,
}

const SPEAKS = { speaks: true, intervention: INTERVENTION, priority: 90, traceId: 'trace-1' }

/**
 * Le serveur, tel qu'il est : `canInterrupt` refuse sur `busy` et sort AVANT
 * d'écrire la trace — donc un refus « occupé » ne consomme ni le plafond du
 * jour, ni la règle « une intervention par écran ».
 */
function serverThatRespectsBusy(whenFree: unknown): void {
  apiFetchMock.mockImplementation((call: unknown) => {
    const request = call as { path: string; body?: { busy?: boolean } }
    if (request.path !== '/laura/plan') return Promise.resolve({})
    if (request.body?.busy === true) return Promise.resolve({ speaks: false, reason: 'busy' })
    return Promise.resolve(whenFree)
  })
}

/** Les corps envoyés à `/laura/plan`, dans l'ordre. */
function plansSent(): { screen: string; busy: boolean; surface: string }[] {
  return apiFetchMock.mock.calls
    .map(call => call[0] as { path: string; body?: { screen: string; busy: boolean; surface: string } })
    .filter(call => call.path === '/laura/plan')
    .map(call => call.body!)
}

function runningAnalysis(at = Date.now()) {
  return {
    jobId: 'job-1',
    accountId: 'acct-1',
    companyName: 'BNP Paribas',
    state: 'analyzing' as const,
    phase: 'research',
    percent: 12,
    error: null,
    completedSteps: [],
    currentStep: 'scope' as const,
    // Un événement daté : sans preuve de vie, `isRunStale` évincerait le run et
    // le test mesurerait le contraire de son sujet.
    events: [{ at, label: 'Analyse lancée', percent: 0, status: 'running' as const, key: 'analysis_start' }],
    warnings: [],
    sourceHealth: {},
    // #2630.2 — une course porte aussi ce qui est DÉJÀ trouvé ; ici, rien encore.
    partials: [],
  }
}

function startAnalysis(): void {
  act(() => {
    useAnalysisStore.setState({ runs: { 'acct-1': runningAnalysis() } })
  })
}

function endAnalysis(): void {
  act(() => {
    useAnalysisStore.setState({ runs: {} })
  })
}

/** Laisse tourner les micro-tâches : prouve qu'AUCUNE requête de plus ne part. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 20))
}

beforeAll(() => {
  // Le magasin d'analyses est PERSISTÉ : sans ce débranchement, un run écrit
  // par un autre fichier de test réhydraterait celui-ci et Laura se tairait
  // pour une raison qui n'est pas la sienne.
  useAnalysisStore.persist.setOptions({
    storage: createJSONStorage(() => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })),
  })
})

beforeEach(() => {
  apiFetchMock.mockReset()
  useAnalysisStore.setState({ runs: {} })
  useBackgroundTasksStore.setState({ tasks: {} })
  setLauraSilenced(false)
})

afterEach(() => {
  cleanup()
})

describe('le signal « on travaille » — il est RELU, jamais photographié', () => {
  it('n’est plus un attribut du DOM : celui d’avant n’existe nulle part', () => {
    // L'ancien mécanisme : `document.querySelector('[data-analysis-running="true"]')`.
    // Aucun composant du dépôt ne pose cet attribut — une seule occurrence dans
    // tout le code, celle du sélecteur lui-même.
    expect(document.querySelector('[data-analysis-running="true"]')).toBeNull()

    const { result } = renderHook(() => useLauraBusy())
    expect(result.current).toBe(false)

    startAnalysis()
    expect(result.current).toBe(true)

    endAnalysis()
    expect(result.current).toBe(false)
  })

  it('ignore un run PÉRIMÉ — un onglet fermé au milieu d’une analyse ne bâillonne pas Laura', () => {
    const { result } = renderHook(() => useLauraBusy())
    act(() => {
      useAnalysisStore.setState({ runs: { 'acct-1': runningAnalysis(Date.now() - STALE_RUN_MS - 1_000) } })
    })
    expect(result.current).toBe(false)
  })

  it('compte une tâche de fond — un import, une sauvegarde, une validation', () => {
    const { result } = renderHook(() => useLauraBusy())
    act(() => {
      useBackgroundTasksStore.getState().register({ id: 'import-1', title: 'Import du portefeuille' })
    })
    expect(result.current).toBe(true)

    act(() => {
      useBackgroundTasksStore.getState().complete('import-1')
    })
    expect(result.current).toBe(false)
  })

  it('compte une SAISIE, et la relâche quand la frappe s’arrête', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useLauraBusy())
      expect(result.current).toBe(false)

      act(() => {
        document.dispatchEvent(new Event('input', { bubbles: true }))
      })
      expect(result.current).toBe(true)

      // Une pause d'une seconde au milieu d'une phrase ne relâche rien…
      act(() => {
        vi.advanceTimersByTime(1_000)
      })
      expect(result.current).toBe(true)

      // …trois secondes, si. Un champ abandonné ne tait pas Laura pour la visite.
      act(() => {
        vi.advanceTimersByTime(2_500)
      })
      expect(result.current).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Laura et le travail en cours', () => {
  it('se tait pendant une analyse, et le serveur reçoit bien `busy: true`', async () => {
    serverThatRespectsBusy(SPEAKS)
    startAnalysis()
    render(<LauraCard />)

    await waitFor(() => expect(plansSent()).toHaveLength(1))
    expect(plansSent()[0]!.busy).toBe(true)
    await settle()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('redemande quand l’analyse est finie — un refus « occupé » n’a rien consommé côté serveur', async () => {
    serverThatRespectsBusy(SPEAKS)
    startAnalysis()
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))

    endAnalysis()

    await waitFor(() => expect(plansSent()).toHaveLength(2))
    // Même écran, deuxième demande : la première n'a consommé ni le plafond du
    // jour, ni la règle « une intervention par écran ».
    expect(plansSent()[1]).toMatchObject({ screen: '/dashboard', busy: false })
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('n’envoie rien de plus tant que l’analyse tourne — pas de boucle de requêtes', async () => {
    serverThatRespectsBusy(SPEAKS)
    startAnalysis()
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))

    // Le run bouge (progression, événements) sans cesser d'être en cours.
    act(() => {
      useAnalysisStore.getState().setProgress('acct-1', { percent: 40, phase: 'contacts' })
      useAnalysisStore.getState().setProgress('acct-1', { percent: 60, phase: 'classify' })
    })

    await settle()
    expect(plansSent()).toHaveLength(1)
  })

  it('ne négocie pas avec un serveur qui dit « occupé » alors qu’on ne l’est pas', async () => {
    // Désynchronisation, instance en retard, règle serveur qu'on n'a pas : le
    // navigateur se croit libre et le serveur refuse. Une relance sert à
    // rattraper UNE course, jamais à insister — la première version du
    // correctif partait en boucle (223 requêtes en une seconde).
    apiFetchMock.mockResolvedValue({ speaks: false, reason: 'busy' })
    render(<LauraCard />)

    await waitFor(() => expect(plansSent()).toHaveLength(2))
    await settle()
    expect(plansSent()).toHaveLength(2)
  })

  it('ne retire PAS une intervention déjà affichée quand une analyse démarre', async () => {
    // Elle a été posée AVANT : elle n'interrompt plus rien, et la retirer
    // brûlerait silencieusement une intervention du plafond du jour.
    serverThatRespectsBusy(SPEAKS)
    render(<LauraCard />)
    expect(await screen.findByRole('status')).toBeInTheDocument()

    startAnalysis()

    await settle()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(plansSent()).toHaveLength(1)
  })

  it('ne redemande pas quand le serveur a tranché — une seule demande par écran', async () => {
    serverThatRespectsBusy({ speaks: false, reason: 'nothing_to_say' })
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))

    startAnalysis()
    endAnalysis()

    await settle()
    expect(plansSent()).toHaveLength(1)
  })
})

describe('#2427.10 — le verdict du budget de proactivité est PARTAGÉ, pas gardé pour soi', () => {
  it('écrit « silencieuse » quand le serveur refuse sur `disabled` (D49)', async () => {
    serverThatRespectsBusy({ speaks: false, reason: 'disabled' })
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))
    expect(isLauraSilenced()).toBe(true)
  })

  it('écrit « silencieuse » quand le serveur refuse sur `retreat` (§5.3)', async () => {
    serverThatRespectsBusy({ speaks: false, reason: 'retreat' })
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))
    expect(isLauraSilenced()).toBe(true)
  })

  it('ne confond pas un refus « occupé » ou « plafond atteint » avec un « stop » de l’utilisateur', async () => {
    setLauraSilenced(true)
    serverThatRespectsBusy({ speaks: false, reason: 'cap_reached' })
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))
    expect(isLauraSilenced()).toBe(false)
  })

  it('repasse à « non silencieuse » dès qu’une intervention parle de nouveau', async () => {
    setLauraSilenced(true)
    serverThatRespectsBusy(SPEAKS)
    render(<LauraCard />)
    await waitFor(() => expect(plansSent()).toHaveLength(1))
    expect(isLauraSilenced()).toBe(false)
  })
})

/**
 * #1946.10 — L'ISSUE D'UNE INTERVENTION, ET SA NATURE.
 *
 * Tranché sans Louis (decisions-louis-22-09-soir.md §12, aucune recommandation
 * écrite dans la ligne de registre) : la NATURE nommée est `intervention.key`
 * (la clé de catalogue, déjà lue par `LauraCard.tsx` — jamais le destinataire,
 * jamais la phrase rendue), et l'endroit où l'issue se conclut est `react`
 * dans `useLaura.ts` — la seule porte vers `/laura/*`. Les TROIS gestes que la
 * carte offre RÉELLEMENT (« Ouvrir le dossier », « Pas maintenant », « Fermer »)
 * couvrent exactement les trois valeurs de l'émetteur.
 */
describe('#1946.10 — l’issue d’une intervention, mesurée par son geste', () => {
  beforeEach(() => {
    trackInterventionOutcome.mockReset()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, assign: vi.fn() },
      writable: true,
    })
  })

  it('« suivie » — clic sur le geste PRINCIPAL, avec la NATURE (`intervention.key`), jamais la phrase rendue', async () => {
    const user = userEvent.setup()
    serverThatRespectsBusy(SPEAKS)
    render(<LauraCard />)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Ouvrir le dossier' }))

    expect(trackInterventionOutcome).toHaveBeenCalledWith('rfp_deadline_gaps', 'suivie')
    expect(trackInterventionOutcome).not.toHaveBeenCalledWith(expect.stringContaining('échéance'), expect.anything())
  })

  it('« rejetee » — clic sur « Pas maintenant », le refus explicite d’une proposition', async () => {
    const user = userEvent.setup()
    serverThatRespectsBusy(SPEAKS)
    render(<LauraCard />)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Pas maintenant' }))

    expect(trackInterventionOutcome).toHaveBeenCalledWith('rfp_deadline_gaps', 'rejetee')
  })

  it('« ignoree » — fermeture SANS LECTURE (✕), un geste sans engagement', async () => {
    const user = userEvent.setup()
    serverThatRespectsBusy(SPEAKS)
    render(<LauraCard />)
    await screen.findByRole('status')

    await user.click(screen.getByRole('button', { name: 'Fermer' }))

    expect(trackInterventionOutcome).toHaveBeenCalledWith('rfp_deadline_gaps', 'ignoree')
  })
})
