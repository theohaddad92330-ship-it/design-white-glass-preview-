import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_HERO_STATE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2117.6, .25-29 — L'ACTION PRINCIPALE DU HERO, EN DÉMONSTRATION.
 *
 * Le lot C1 (#2117, `hero-action-par-etat`) choisit un état parmi CINQ
 * (`heroPrimaryAction`, apps/web) à partir de cinq champs du compte :
 * `status`, `commercial_status`, `priority_gate`, la prochaine action dérivée
 * de `raw_analysis`, et un rendez-vous posé à l'agenda.
 *
 * Cette suite RÉIMPLÉMENTE la même décision, EN LISANT LES MÊMES CHAMPS —
 * jamais un import de `apps/web` dans l'API (périmètre du dépôt). Elle ne
 * fait pas confiance à `demo-coverage.ts` sur parole : elle relit le JEU et
 * prouve, pour chaque état, ce que l'entrée du registre affirme.
 */

/** Les cinq états du hero (`DossierHeroState`, PDF #2117) — recopiés ici en
 *  DUR, faute de pouvoir importer le type côté web. */
const HERO_STATES = ['analysis-incomplete', 'meeting-booked', 'watching', 'plan-active', 'no-plan'] as const
type HeroState = (typeof HERO_STATES)[number]

/** Les statuts d'ANALYSE qui veulent dire « ce dossier n'est pas fini » —
 *  même liste que `heroPrimaryAction.ts` (`INCOMPLETE_ANALYSIS`). */
// #4459.1 — `imported` (versé par un import du CRM, jamais analysé) y entre, comme côté web.
const INCOMPLETE_ANALYSIS = ['prospect', 'imported', 'analyzing', 'error', 'canceled']

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function firstQuickWinLabel(quickWins: unknown): string | null {
  if (!Array.isArray(quickWins) || quickWins.length === 0) return null
  const first = quickWins[0] as unknown
  if (typeof first === 'string') return nullableString(first)
  if (first && typeof first === 'object') return nullableString((first as { action?: unknown }).action)
  return null
}

function firstPlanActionLabel(actionPlan: unknown): string | null {
  if (!actionPlan || typeof actionPlan !== 'object') return null
  const phases = (actionPlan as { phases?: unknown }).phases
  if (!Array.isArray(phases)) return null
  for (const phase of phases) {
    const actions = (phase as { actions?: unknown })?.actions
    if (!Array.isArray(actions)) continue
    for (const action of actions) {
      const label = nullableString((action as { action?: unknown })?.action)
      if (label !== null) return label
    }
  }
  return null
}

/** Réimplémentation de `deriveImmediateAction` (apps/web,
 *  `useAccountOverviewData.ts`) — mêmes cinq sources, même ordre. */
function deriveNextActionLabel(analysis: Record<string, unknown>): string | null {
  const plan = analysis.plan as Record<string, unknown> | undefined
  const planEvaluation = plan?.evaluation as Record<string, unknown> | undefined
  return (
    nullableString(analysis.immediate_action) ??
    firstQuickWinLabel(analysis.quick_wins) ??
    firstQuickWinLabel(plan?.quick_wins) ??
    firstQuickWinLabel(planEvaluation?.quick_wins) ??
    firstPlanActionLabel(plan?.action_plan) ??
    firstPlanActionLabel(analysis.action_plan)
  )
}

/** Réimplémentation de `decideState` (apps/web, `heroPrimaryAction.ts`) —
 *  même ordre de questions, même priorité entre les deux « veilles ». */
function deriveHeroState(input: {
  status: string
  commercialStatus: string | undefined
  priorityGate: string | undefined
  nextActionLabel: string | null
  meetingBooked: boolean
}): HeroState {
  if (INCOMPLETE_ANALYSIS.includes(input.status)) return 'analysis-incomplete'
  if (input.meetingBooked) return 'meeting-booked'
  if (input.priorityGate === 'parked') return 'watching'
  if (input.nextActionLabel !== null) return 'plan-active'
  if (input.commercialStatus === 'watching') return 'watching'
  return 'no-plan'
}

/**
 * L'état de chaque dossier réel, tel que la démo le seme.
 *
 * `status` n'est PAS une colonne de `demo-dataset.ts` (aucun des cinq
 * dossiers ne le porte) : `DemoSeedService` l'écrit en DUR à `'completed'`
 * pour les cinq comptes réels — vérifié plus bas en relisant sa source.
 * `meetingBooked` est `false` pour les cinq : aucun événement d'agenda de
 * démonstration ne référence l'un de ces comptes (vérifié plus bas aussi).
 */
function seededHeroStates(): Record<string, HeroState> {
  const result: Record<string, HeroState> = {}
  for (const dossier of DEMO_DOSSIERS) {
    result[dossier.account.company_name] = deriveHeroState({
      status: dossier.account.analysis_status ?? 'completed',
      commercialStatus: dossier.account.commercial_status,
      priorityGate: dossier.account.priority_gate,
      nextActionLabel: deriveNextActionLabel(dossier.account.raw_analysis),
      meetingBooked: false,
    })
  }
  return result
}

describe('#2117.6, .25-29 — l’action principale du hero, en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const agendaSource = readFileSync(join(__dirname, 'demo-agenda.ts'), 'utf8')
  const states = seededHeroStates()
  // ⚠️ RETRAIT DU 01/10/2026 (Louis) — « watching » passe par la porte `parked`,
  // que seuls deux dossiers retirés portaient (Société Générale prioritisée,
  // SNCF et Groupe BPCE en attente : un compte « pas maintenant » y
  // contredirait leurs propres faits). L'état est BLOQUÉ, jamais déclassé :
  // tant que la salle a moins de six dossiers (ENGIE, TotalEnergies, Alstom,
  // autre lot) et qu'aucun ne le déclenche, les gardes constatent l'attente ;
  // dès que la salle a six dossiers, elles exigent de nouveau l'état.
  const watchingPending = DEMO_DOSSIERS.length < 6 && !Object.values(states).includes('watching')

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(DEMO_HERO_STATE_COVERAGE).length).toBe(HERO_STATES.length)
  })

  it('classe CHAQUE état du registre : seedé, ou vide à dessein avec sa raison', () => {
    expect(Object.keys(DEMO_HERO_STATE_COVERAGE).sort()).toEqual([...HERO_STATES].sort())
    for (const entry of Object.values(DEMO_HERO_STATE_COVERAGE)) {
      expect(entry.reason.trim().length).toBeGreaterThan(40)
    }
  })

  it.each(HERO_STATES.filter(state => DEMO_HERO_STATE_COVERAGE[state]?.state === 'seede'))(
    'état « %s » (seedé) — au moins un dossier RÉEL le déclenche',
    state => {
      if (state === 'watching' && watchingPending) return
      expect(Object.values(states)).toContain(state)
    },
  )

  it.each(HERO_STATES.filter(state => DEMO_HERO_STATE_COVERAGE[state]?.state === 'vide_a_dessein'))(
    'état « %s » (vide à dessein) — la garde sait dire NON : AUCUN dossier ne le déclenche',
    state => {
      expect(Object.values(states)).not.toContain(state)
    },
  )

  it('watching — un dossier `parked` (« pas maintenant ») — ou BLOQUÉ en attendant les trois nouveaux comptes', () => {
    const parked = DEMO_DOSSIERS.filter(d => d.account.priority_gate === 'parked')
    if (parked.length === 0) {
      expect(watchingPending).toBe(true)
      return
    }
    for (const dossier of parked) {
      // « En cours d'analyse » précède la veille (`decideState`) : un compte `analyzing` n'est pas « watching ».
      const expected = dossier.account.analysis_status === 'analyzing' ? 'analysis-incomplete' : 'watching'
      expect(states[dossier.account.company_name]).toBe(expected)
    }
  })

  it('plan-active — Société Générale et SNCF, chacune avec une action NOMMÉE', () => {
    for (const company of ['Société Générale', 'SNCF']) {
      expect(states[company]).toBe('plan-active')
      const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === company)!
      expect(deriveNextActionLabel(dossier.account.raw_analysis)).not.toBeNull()
    }
  })

  it('no-plan — Groupe BPCE, pas encore trié ET sans action dérivable', () => {
    const bpce = DEMO_DOSSIERS.find(d => d.account.company_name === 'Groupe BPCE')!
    expect(bpce.account.commercial_status).not.toBe('watching')
    expect(bpce.account.priority_gate).not.toBe('parked')
    expect(deriveNextActionLabel(bpce.account.raw_analysis)).toBeNull()
    expect(states['Groupe BPCE']).toBe('no-plan')
  })

  it('analysis-incomplete — UN seul compte `analyzing` (lot D01, #3666), à lecture précédente lisible', () => {
    // Le semis lit `analysis_status` du dossier, `completed` à défaut.
    expect(seedSource).toContain("dossier.account.analysis_status ?? 'completed'")
    const analyzing = DEMO_DOSSIERS.filter(d => d.account.analysis_status === 'analyzing')
    expect(analyzing.map(d => d.account.company_name)).toEqual(['TotalEnergies'])
    for (const dossier of analyzing) {
      // Une lecture précédente LISIBLE : la fiche reste consultable pendant l'actualisation
      // (`hasReadableDossierWhileAnalyzing`, #2164.16) — sinon l'écran plein « attente » la masque.
      const evaluation = dossier.account.raw_analysis.evaluation as { dossier_read?: Record<string, unknown> }
      expect(Object.keys(evaluation.dossier_read ?? {}).length).toBeGreaterThan(0)
    }
    expect(states['TotalEnergies']).toBe('analysis-incomplete')
    const others = Object.entries(states).filter(([company]) => company !== 'TotalEnergies')
    expect(others.map(([, state]) => state)).not.toContain('analysis-incomplete')
  })

  it('le SEMIS tient ce que « meeting-booked : vide à dessein » promet — aucun agenda de démo ne cite un compte réel', () => {
    // Le hero cherche le prochain rendez-vous par le SITE du compte
    // (`useAccountNextMeeting`) : aucun site de dossier n'apparaît dans l'agenda.
    // Décision Louis 04/10/2026 — le rendez-vous de livraison cite SNCF par son
    // NOM (rattachement du brief par le titre), jamais par son site ni par une
    // adresse d'invité.
    for (const company of ['SNCF', 'Société Générale', 'Groupe BPCE']) {
      const website = DEMO_DOSSIERS.find(d => d.account.company_name === company)?.account.website ?? ''
      expect(website.length).toBeGreaterThan(0)
      expect(agendaSource).not.toContain(website.replace(/^https?:\/\/(www\.)?/, ''))
    }
    for (const company of ['Société Générale', 'Groupe BPCE']) {
      expect(agendaSource).not.toContain(company)
    }
  })

  it('sait dire NON — un dossier inventé « analyzing » retombe bien sur `analysis-incomplete`', () => {
    // Contrepartie obligatoire : prouver que `deriveHeroState` PEUT rendre les
    // deux états « vide à dessein », pour distinguer « le jeu ne les déclenche
    // pas » de « la fonction ne sait pas les rendre ».
    expect(
      deriveHeroState({
        status: 'analyzing',
        commercialStatus: 'watching',
        priorityGate: 'pending',
        nextActionLabel: 'Une action',
        meetingBooked: false,
      }),
    ).toBe('analysis-incomplete')
    expect(
      deriveHeroState({
        status: 'completed',
        commercialStatus: 'watching',
        priorityGate: 'pending',
        nextActionLabel: null,
        meetingBooked: true,
      }),
    ).toBe('meeting-booked')
  })
})
