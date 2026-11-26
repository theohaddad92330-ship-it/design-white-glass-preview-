import {
  AUTOMATION_RULE_LIMITS,
  AUTOMATION_SIGNAL_SOURCES,
  OUTREACH_SEQUENCE_MAX_STEPS,
  OUTREACH_SEQUENCE_TEMPLATES,
  outreachStepKindSchema,
  outreachTemplateKeySchema,
  signalPlaybook,
  type AutomationPreparedAction,
  type AutomationSignal,
  type CreateAutomationRuleRequest,
  type OutreachPlaybookKey,
  type OutreachStepKind,
  type OutreachTemplateKey,
} from '@bellum/contracts'

/**
 * L'ASSISTANT « CRÉER UNE SÉQUENCE » — Audience · Objectif · Messages · Vérification, pur.
 *
 * Il naît en #4355.1 / #4357.1 (19/10/2026) sous la forme Quand → Pour qui → Modèle → Relecture. Décision
 * Louis du 22/10/2026 (QCM C/D, maquettes Théo V22, Théo C sequences-assistant.R1) : l'ordre devient celui de
 * Théo, et la séquence part d'une AUDIENCE — plusieurs contacts, un nom saisi dès la première étape
 * (`c131_sequence_audience_multi_contacts`, ⚠️ renverse c74). « Quand démarrer » (maintenant / quand un signal
 * arrive) reste en tête de l'étape Audience : le moteur est commun (c128), seul le départ change.
 *
 * Quatre étapes, linéaires (aucune branche oui/non, décision du 14/10). Le retour arrière ne défait RIEN :
 * l'état ne se vide qu'en refermant l'assistant, jamais en changeant d'étape.
 */

const STEPS = ['audience', 'objective', 'messages', 'review'] as const
type JourneyStep = (typeof STEPS)[number]
type JourneyTrigger = 'manual' | 'signal'

/**
 * Théo C sequences-assistant.N4 — les objectifs NOMMÉS, qui choisissent le modèle de messages. Le quatrième,
 * « seulement une action préparée » (A2), n'est pas une cadence : un message unique par contact, à valider
 * dans À traiter (le gabarit « message unique » du catalogue).
 */
export const JOURNEY_OBJECTIVES = [
  { key: 'open_conversation', template: 'prospection_3_touches' },
  { key: 'present_expertise', template: 'nurturing' },
  { key: 'resume_exchange', template: 'dormant_connection' },
  { key: 'prepared_only', template: 'single_message' },
] as const satisfies readonly { key: string; template: OutreachTemplateKey }[]

type JourneyObjectiveKey = (typeof JOURNEY_OBJECTIVES)[number]['key']

/** Une touche de la cadence : le canal et le jour, réglables à l'étape Messages (A3). */
type JourneyCadenceStep = { kind: OutreachStepKind; offsetDays: number; label: string }

/** Le sous-ensemble d'un contact que la fenêtre de création sait reprendre (`PickableContact`). */
export type JourneyContact = {
  id: string
  full_name: string
  title: string | null
  email: string | null
  assigned_to?: string | null
  /** Théo C sequences-assistant — « Compte · poste » sur la ligne ; absent d'un brouillon ancien, jamais deviné. */
  company_name?: string | null
}

export type JourneyState = {
  step: JourneyStep
  trigger: JourneyTrigger
  /** Théo C sequences-assistant.N5 — le nom, saisi dès l'étape 1. Vide = la fenêtre en dérive un. */
  name: string
  contacts: ReadonlyMap<string, JourneyContact>
  objective: JourneyObjectiveKey
  template: OutreachTemplateKey
  /** `null` = la cadence du modèle, telle quelle ; sinon la cadence réglée dans l'assistant. */
  cadence: readonly JourneyCadenceStep[] | null
  signal: AutomationSignal
  days: string
  playbook: OutreachPlaybookKey
  /** L'utilisateur a choisi le modèle lui-même : changer de signal ne le remplace plus. */
  playbookChosen: boolean
  /**
   * « Préparer seulement » un e-mail à relire ou un appel, au lieu d'une séquence : la capacité
   * `prepare_action` de l'ancien constructeur de règles, gardée (aucune n'est perdue à la fusion).
   */
  prepared: AutomationPreparedAction | null
}

export type JourneyEvent =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'goTo'; step: JourneyStep }
  | { type: 'chooseTrigger'; trigger: JourneyTrigger }
  | { type: 'setName'; name: string }
  | { type: 'toggleContact'; contact: JourneyContact }
  /** « Sélection métier » : l'audience rendue par le constructeur d'audience, ajoutée d'un geste. */
  | { type: 'addContacts'; contacts: readonly JourneyContact[] }
  | { type: 'chooseObjective'; objective: JourneyObjectiveKey }
  | { type: 'chooseSignal'; signal: AutomationSignal }
  | { type: 'setDays'; days: string }
  | { type: 'choosePlaybook'; playbook: OutreachPlaybookKey }
  | { type: 'choosePrepared'; prepared: AutomationPreparedAction }
  | { type: 'setStepKind'; index: number; kind: OutreachStepKind }
  | { type: 'setStepDay'; index: number; offsetDays: number }
  | { type: 'addStep' }
  | { type: 'removeStep'; index: number }
  /** Théo C sequences-assistant — « Monter / Descendre l'étape ». */
  | { type: 'moveStep'; index: number; direction: 'up' | 'down' }

export function journeySteps(): readonly JourneyStep[] {
  return STEPS
}

export function initialJourney(): JourneyState {
  return {
    step: 'audience',
    trigger: 'manual',
    name: '',
    contacts: new Map(),
    objective: 'open_conversation',
    // Le même gabarit par défaut que la fenêtre de création.
    template: 'prospection_3_touches',
    cadence: null,
    signal: 'hiring',
    days: '60',
    playbook: signalPlaybook('hiring'),
    playbookChosen: false,
    prepared: null,
  }
}

function needsDays(signal: AutomationSignal): boolean {
  return 'parameter' in AUTOMATION_SIGNAL_SOURCES[signal]
}

function daysValid(state: JourneyState): boolean {
  if (!needsDays(state.signal)) return true
  const days = Number(state.days)
  return (
    Number.isInteger(days) &&
    days >= AUTOMATION_RULE_LIMITS.inactiveDaysMin &&
    days <= AUTOMATION_RULE_LIMITS.inactiveDaysMax
  )
}

/** La cadence à l'écran : celle qui a été réglée, sinon celle du modèle choisi. */
export function journeyCadence(state: JourneyState): readonly JourneyCadenceStep[] {
  if (state.cadence) return state.cadence
  return OUTREACH_SEQUENCE_TEMPLATES[state.template].steps.map(step => ({
    kind: step.kind,
    offsetDays: step.offset_days,
    label: '',
  }))
}

/** « Continuer » n'est offert que quand l'étape a sa réponse. */
export function journeyCanContinue(state: JourneyState): boolean {
  switch (state.step) {
    case 'audience':
      return state.trigger === 'signal' ? daysValid(state) : state.contacts.size > 0
    case 'objective':
    case 'messages':
      return true
    case 'review':
      return false
  }
}

function withCadence(state: JourneyState, edit: (steps: JourneyCadenceStep[]) => JourneyCadenceStep[]): JourneyState {
  return { ...state, cadence: edit([...journeyCadence(state)]) }
}

export function reduceJourney(state: JourneyState, event: JourneyEvent): JourneyState {
  const at = STEPS.indexOf(state.step)
  switch (event.type) {
    case 'next':
      return journeyCanContinue(state)
        ? { ...state, step: STEPS[Math.min(at + 1, STEPS.length - 1)] ?? state.step }
        : state
    case 'back':
      return { ...state, step: STEPS[Math.max(at - 1, 0)] ?? state.step }
    case 'goTo': {
      // Revenir est toujours permis ; avancer ne saute jamais une étape qui attend encore sa réponse.
      const target = STEPS.indexOf(event.step)
      if (target < 0) return state
      if (target <= at) return { ...state, step: event.step }
      let probe = state
      while (STEPS.indexOf(probe.step) < target) {
        const next = reduceJourney(probe, { type: 'next' })
        if (next.step === probe.step) return state
        probe = next
      }
      return probe
    }
    case 'chooseTrigger':
      return { ...state, trigger: event.trigger }
    case 'setName':
      return { ...state, name: event.name }
    case 'toggleContact': {
      const contacts = new Map(state.contacts)
      if (contacts.has(event.contact.id)) contacts.delete(event.contact.id)
      else contacts.set(event.contact.id, event.contact)
      return { ...state, contacts }
    }
    case 'addContacts': {
      const contacts = new Map(state.contacts)
      for (const contact of event.contacts) if (!contacts.has(contact.id)) contacts.set(contact.id, contact)
      return { ...state, contacts }
    }
    case 'chooseObjective': {
      const objective = JOURNEY_OBJECTIVES.find(candidate => candidate.key === event.objective)
      if (!objective) return state
      // Un autre objectif repart de la cadence de SON modèle : aucune cadence réglée n'est laissée orpheline.
      return { ...state, objective: objective.key, template: objective.template, cadence: null }
    }
    case 'chooseSignal':
      return {
        ...state,
        signal: event.signal,
        playbook: state.playbookChosen ? state.playbook : signalPlaybook(event.signal),
      }
    case 'setDays':
      return { ...state, days: event.days }
    case 'choosePlaybook':
      return { ...state, playbook: event.playbook, playbookChosen: true, prepared: null }
    case 'choosePrepared':
      return { ...state, prepared: event.prepared, playbookChosen: true }
    case 'setStepKind':
      return withCadence(state, steps =>
        steps.map((step, index) => (index === event.index ? { ...step, kind: event.kind } : step)),
      )
    case 'setStepDay':
      return withCadence(state, steps =>
        steps.map((step, index) =>
          index === event.index ? { ...step, offsetDays: Math.min(365, Math.max(0, event.offsetDays)) } : step,
        ),
      )
    case 'addStep':
      return withCadence(state, steps => {
        if (steps.length >= OUTREACH_SEQUENCE_MAX_STEPS) return steps
        // La nouvelle touche tombe APRÈS la dernière : c'est ce qu'on veut neuf fois sur dix.
        const last = steps[steps.length - 1]
        return [...steps, { kind: 'reminder', offsetDays: last ? last.offsetDays + 3 : 3, label: '' }]
      })
    case 'removeStep':
      // La dernière touche ne se retire pas : une séquence sans étape n'est pas une séquence.
      return withCadence(state, steps =>
        steps.length <= 1 ? steps : steps.filter((_, index) => index !== event.index),
      )
    case 'moveStep': {
      const target = event.direction === 'up' ? event.index - 1 : event.index + 1
      const cadence = journeyCadence(state)
      if (target < 0 || target >= cadence.length || event.index < 0 || event.index >= cadence.length) return state
      // Ce qui bouge, c'est la TOUCHE (son canal, son libellé) ; le calendrier garde ses jours dans l'ordre : la
      // première touche reste au jour du départ, et aucun jour ne passe avant le précédent.
      return withCadence(state, steps => {
        const next = [...steps]
        const from = next[event.index]
        const to = next[target]
        if (!from || !to) return steps
        next[event.index] = { ...to, offsetDays: from.offsetDays }
        next[target] = { ...from, offsetDays: to.offsetDays }
        return next
      })
    }
  }
}

/**
 * Ce que l'assistant remet à la fenêtre de création pour une séquence « maintenant » : l'audience, le nom,
 * le modèle, et la cadence seulement si elle a été réglée. La fenêtre refait les dernières gardes
 * (doublons, exclusions, désinscrits, collègue, brouillon préparé) — jamais une seconde copie ici.
 */
export function journeyLaunchRequest(state: JourneyState): {
  contacts: JourneyContact[]
  name: string
  template: OutreachTemplateKey
  customSteps: readonly JourneyCadenceStep[] | null
} {
  return {
    contacts: [...state.contacts.values()],
    name: state.name.trim(),
    template: state.template,
    customSteps: state.cadence,
  }
}

const DRAFT_KEY = 'bellum.sequence-journey.draft'
const TRIGGERS: readonly JourneyTrigger[] = ['manual', 'signal']
const OBJECTIVE_KEYS: readonly string[] = JOURNEY_OBJECTIVES.map(objective => objective.key)

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Théo C sequences-assistant.N3 — « Quitter et conserver ». Le brouillon vit dans le navigateur de la
 * personne (la maquette laissait « à trancher : back léger ou localStorage » ; rien d'autre que les
 * contacts qu'elle a cochés, un nom et une cadence n'y est écrit). Un stockage bloqué ne casse jamais
 * l'assistant : il rend simplement « pas de brouillon ».
 */
export function saveJourneyDraft(state: JourneyState, storage: DraftStorage | null = browserStorage()): void {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify({ ...state, contacts: [...state.contacts.values()] }))
  } catch {
    // Brouillon non conservé : l'assistant continue.
  }
}

export function clearJourneyDraft(storage: DraftStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(DRAFT_KEY)
  } catch {
    // Rien à vider si le stockage est bloqué.
  }
}

export function loadJourneyDraft(storage: DraftStorage | null = browserStorage()): JourneyState | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<Omit<JourneyState, 'contacts'>> & { contacts?: unknown }
    if (
      !draft.step ||
      !(STEPS as readonly string[]).includes(draft.step) ||
      !draft.trigger ||
      !TRIGGERS.includes(draft.trigger) ||
      !Array.isArray(draft.contacts) ||
      !draft.objective ||
      !OBJECTIVE_KEYS.includes(draft.objective) ||
      !outreachTemplateKeySchema.safeParse(draft.template).success
    ) {
      return null
    }
    const contacts = new Map<string, JourneyContact>()
    for (const contact of draft.contacts as JourneyContact[]) contacts.set(contact.id, contact)
    const base = initialJourney()
    const cadence = Array.isArray(draft.cadence)
      ? draft.cadence.filter(step => outreachStepKindSchema.safeParse(step.kind).success)
      : null
    return { ...base, ...draft, contacts, cadence } as JourneyState
  } catch {
    return null
  }
}

/** La règle qu'écrit un parcours « sur signal » — la même requête que l'ancien constructeur de règles. */
export function journeyRuleRequest(state: JourneyState): CreateAutomationRuleRequest {
  if (state.prepared) {
    return {
      signal: state.signal,
      action_kind: 'prepare_action',
      prepared_action: state.prepared,
      ...(needsDays(state.signal) ? { inactive_days: Number(state.days) } : {}),
    }
  }
  return {
    signal: state.signal,
    action_kind: 'enroll_sequence',
    playbook_key: state.playbook,
    ...(needsDays(state.signal) ? { inactive_days: Number(state.days) } : {}),
  }
}

/**
 * L'URL ouvre le parcours (`?parcours=1`), ou directement sur son déclencheur « sur signal »
 * (`?parcours=signal`, le lien « En faire une automatisation » d'Aujourd'hui, #4354.2). Lue, jamais
 * réécrite (GA-27) : recharger la page rouvre le même écran.
 */
export function journeyFromSearch(search: Record<string, unknown>): JourneyState | null {
  const value = search.parcours
  if (value === 'signal') return { ...initialJourney(), trigger: 'signal' }
  if (value !== '1' && value !== 1 && value !== true) return null
  const state = initialJourney()
  // Théo C sequences-detail — « Dupliquer… » : le nom de la copie et la cadence de l'originale (`canal.jour,…`) ;
  // l'audience se choisit dans l'assistant, rien ne démarre avant la relecture.
  const name = typeof search.nom === 'string' ? search.nom.trim().slice(0, 120) : ''
  const cadence = cadenceFromParam(search.cadence)
  return { ...state, ...(name ? { name } : {}), ...(cadence ? { cadence } : {}) }
}

/** `email.0,reminder.4` → la cadence ; un canal inconnu, un jour illisible ou trop de touches : aucune cadence, jamais devinée. */
function cadenceFromParam(raw: unknown): readonly JourneyCadenceStep[] | null {
  if (typeof raw !== 'string' || raw === '') return null
  const parts = raw.split(',')
  if (parts.length > OUTREACH_SEQUENCE_MAX_STEPS) return null
  const steps: JourneyCadenceStep[] = []
  for (const part of parts) {
    const [kind, day] = part.split('.')
    const parsedKind = outreachStepKindSchema.safeParse(kind)
    const offsetDays = Number(day)
    if (!parsedKind.success || !Number.isInteger(offsetDays) || offsetDays < 0 || offsetDays > 365) return null
    steps.push({ kind: parsedKind.data, offsetDays, label: '' })
  }
  return steps
}
