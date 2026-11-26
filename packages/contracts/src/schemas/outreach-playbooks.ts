import type {
  CreateOutreachSequenceRequest,
  CreateOutreachStepInput,
  OutreachStepKind,
  OutreachTemplateKey,
} from './outreach-sequence.js'
import { outreachTemplateKeySchema } from './outreach-sequence.js'
import { OUTREACH_DEFAULT_DELAY_UNIT, parseStepVariables } from './outreach-multichannel.js'

/**
 * Lot L-C (#4166, épopée #4163) — LES HUIT MODÈLES ESN, classés par DÉCLENCHEUR.
 *
 * Un commercial qui n'y connaît rien ne choisit pas « une cadence e-mail à
 * quatre touches » : il sait POURQUOI il écrit maintenant (un poste ouvert, un
 * nouveau DSI, un appel d'offres…). Les modèles se rangent donc par ce
 * pourquoi, jamais par canal. Chaque étape dit son canal, son délai en jours
 * OUVRÉS, son intention en une ligne et un conseil court.
 *
 * Forme ici (canal, délai, intention = liste fermée, libellé stocké en base),
 * texte d'interface dans les catalogues FR et EN (`outreach:playbooks.*`, comme
 * `purposeKey` des gabarits) — une garde du web vérifie qu'aucune clé ne manque.
 *
 * ⚠️ Rien n'est promis : un modèle PRÉPARE (brouillon, trame d'appel, tâche).
 * L'e-mail n'est jamais envoyé seul, LinkedIn et l'appel restent des gestes
 * manuels (lot L-B). Aucune probabilité de réponse n'est affichée.
 */

export const OUTREACH_PLAYBOOK_KEYS = [
  'hiring_signal',
  'new_cio',
  'tender',
  'win_back',
  'after_meeting',
  'bench_consultant',
  'regie_to_forfait',
  'warm_contact',
] as const
export type OutreachPlaybookKey = (typeof OUTREACH_PLAYBOOK_KEYS)[number]

/** L'intention d'une étape — ce qu'elle CHERCHE À OBTENIR. Liste fermée. */
export const OUTREACH_STEP_INTENTS = [
  'get_reply',
  'qualify_need',
  'book_exchange',
  'show_proof',
  'stay_visible',
  'close_loop',
  'check_deadline',
] as const
export type OutreachStepIntent = (typeof OUTREACH_STEP_INTENTS)[number]

/**
 * L'intention telle qu'elle s'ÉCRIT dans la base (`payload.objective`) : en
 * français, comme les libellés des gabarits — un enregistrement, pas un texte
 * d'interface (l'écran la traduit depuis `outreach:playbooks.intent.*`).
 */
export const OUTREACH_STEP_INTENT_LABELS: Record<OutreachStepIntent, string> = {
  get_reply: 'Obtenir une réponse',
  qualify_need: 'Qualifier le besoin',
  book_exchange: 'Fixer un échange',
  show_proof: 'Montrer une preuve',
  stay_visible: 'Rester visible',
  close_loop: 'Clore proprement',
  check_deadline: 'Vérifier l’échéance',
}

export type OutreachPlaybookStep = {
  kind: OutreachStepKind
  /** Jours OUVRÉS depuis la création (J0 = aujourd'hui). */
  offset_days: number
  /** Écrit en base à la création (français, comme les libellés des gabarits). */
  label: string
  intent: OutreachStepIntent
  /** Clé du conseil court dans le catalogue : `<playbook>.<rang>`. */
  tipKey: string
}

type StepSeed = readonly [OutreachStepKind, number, string, OutreachStepIntent]

function steps(key: OutreachPlaybookKey, seeds: readonly StepSeed[]): OutreachPlaybookStep[] {
  return seeds.map(([kind, offset_days, label, intent], index) => ({
    kind,
    offset_days,
    label,
    intent,
    tipKey: `${key}.${index}`,
  }))
}

export const OUTREACH_PLAYBOOKS: Record<OutreachPlaybookKey, { letter: string; steps: OutreachPlaybookStep[] }> = {
  hiring_signal: {
    letter: 'A',
    steps: steps('hiring_signal', [
      ['email', 0, 'E-mail sur le poste ouvert', 'get_reply'],
      ['linkedin_invite', 1, 'Invitation sans note', 'stay_visible'],
      ['linkedin_message', 4, 'Message : présenter un profil type', 'qualify_need'],
      ['call', 8, 'Appel avec trame', 'book_exchange'],
      ['email', 12, 'E-mail de clôture douce', 'close_loop'],
    ]),
  },
  new_cio: {
    letter: 'B',
    steps: steps('new_cio', [
      ['linkedin_invite', 0, 'Félicitations (note d’invitation)', 'get_reply'],
      ['email', 3, 'E-mail : proposer un état des lieux', 'qualify_need'],
      ['email', 8, 'E-mail : retour d’expérience comparable', 'show_proof'],
      ['call', 14, 'Appel', 'book_exchange'],
      ['email', 20, 'E-mail de clôture', 'close_loop'],
    ]),
  },
  tender: {
    letter: 'C',
    steps: steps('tender', [
      ['email', 0, 'E-mail avec une question de cadrage', 'qualify_need'],
      ['call', 2, 'Appel', 'get_reply'],
      ['email', 5, 'E-mail : références proches', 'show_proof'],
      ['task', 9, 'Vérifier la date limite', 'check_deadline'],
    ]),
  },
  win_back: {
    letter: 'D',
    steps: steps('win_back', [
      ['email', 0, 'E-mail : collaboration passée et nouveauté', 'get_reply'],
      ['linkedin_message', 4, 'Message de reprise de contact', 'stay_visible'],
      ['call', 9, 'Appel', 'qualify_need'],
      ['email', 15, 'E-mail : proposer 15 minutes', 'book_exchange'],
    ]),
  },
  after_meeting: {
    letter: 'E',
    steps: steps('after_meeting', [
      ['email', 0, 'E-mail : compte rendu et prochaines étapes', 'get_reply'],
      ['email', 3, 'E-mail : la ressource promise', 'show_proof'],
      ['call', 7, 'Appel', 'qualify_need'],
      ['email', 14, 'E-mail : relance sur la décision', 'close_loop'],
    ]),
  },
  bench_consultant: {
    letter: 'F',
    steps: steps('bench_consultant', [
      ['email', 0, 'E-mail : profil anonymisé et disponibilité', 'get_reply'],
      ['linkedin_invite', 1, 'Invitation de connexion', 'stay_visible'],
      ['call', 3, 'Appel', 'book_exchange'],
      ['email', 6, 'E-mail : deux profils alternatifs', 'qualify_need'],
      ['email', 10, 'E-mail de clôture', 'close_loop'],
    ]),
  },
  regie_to_forfait: {
    letter: 'G',
    steps: steps('regie_to_forfait', [
      ['email', 0, 'E-mail avec un cas concret', 'get_reply'],
      ['linkedin_message', 5, 'Message court vers le cas', 'stay_visible'],
      ['email', 10, 'E-mail : le prochain projet', 'qualify_need'],
      ['call', 15, 'Appel', 'book_exchange'],
    ]),
  },
  warm_contact: {
    letter: 'H',
    steps: steps('warm_contact', [
      ['linkedin_invite', 0, 'Invitation de connexion', 'get_reply'],
      ['email', 3, 'E-mail', 'qualify_need'],
      ['call', 7, 'Appel', 'book_exchange'],
    ]),
  },
}

/**
 * Le nom d'ENREGISTREMENT de chaque modèle (français, comme les libellés des
 * gabarits : une séquence créée en mars garde le nom qu'elle avait). L'écran,
 * lui, affiche `outreach:playbooks.trigger.<modèle>.name` dans la langue de l'utilisateur.
 */
export const OUTREACH_PLAYBOOK_NAMES: Record<OutreachPlaybookKey, string> = {
  hiring_signal: 'Signal de recrutement',
  new_cio: 'Nouveau DSI nommé',
  tender: 'Appel d’offres',
  win_back: 'Réactivation d’un ancien client',
  after_meeting: 'Après un rendez-vous',
  bench_consultant: 'Consultant en inter-contrat',
  regie_to_forfait: 'Passage de la régie au forfait',
  warm_contact: 'Contact tiède (salon, visite)',
}

/** Le nom d'une séquence née d'un modèle : `{modèle} — {contact}`. Un seul endroit (création réelle ET démo). */
export function playbookSequenceName(playbook: OutreachPlaybookKey, contactName: string): string {
  return `${OUTREACH_PLAYBOOK_NAMES[playbook]} — ${contactName}`
}

/** Jours ouvrés entre la première et la dernière étape d'un modèle. */
export function playbookSpanDays(key: OutreachPlaybookKey): number {
  return OUTREACH_PLAYBOOKS[key].steps.reduce((max, step) => Math.max(max, step.offset_days), 0)
}

/* ------------------------ les 14 gabarits existants, rangés ------------------ */

export type OutreachTemplateCategory = OutreachPlaybookKey | 'other'

/**
 * Où se range chaque gabarit existant. `Record<OutreachTemplateKey, …>` : un
 * gabarit ajouté au contrat sans être rangé ici ne compile pas. Rien n'est
 * supprimé — « autres » garde tout ce qui n'a pas de déclencheur propre.
 */
export const OUTREACH_TEMPLATE_CATEGORY: Record<OutreachTemplateKey, OutreachTemplateCategory> = {
  prospection_3_touches: 'other',
  cold_linkedin: 'other',
  cold_email: 'other',
  fresh_signal: 'hiring_signal',
  profile_push: 'bench_consultant',
  existing_client: 'regie_to_forfait',
  single_message: 'other',
  call_session: 'other',
  light_sequence: 'warm_contact',
  nurturing: 'warm_contact',
  post_meeting_followup: 'after_meeting',
  referred_contact: 'warm_contact',
  dormant_connection: 'win_back',
  esn_partner: 'other',
}

export function templatesOfCategory(category: OutreachTemplateCategory): OutreachTemplateKey[] {
  return outreachTemplateKeySchema.options.filter(key => OUTREACH_TEMPLATE_CATEGORY[key] === category)
}

/* ------------------------------ assistant en 4 questions --------------------- */

/** Q3 — ce que j'offre. */
export const OUTREACH_WIZARD_OFFERS = ['regie', 'forfait', 'profil'] as const
export type OutreachWizardOffer = (typeof OUTREACH_WIZARD_OFFERS)[number]

/** Q4 — ce que je veux obtenir. */
export const OUTREACH_WIZARD_GOALS = ['reply', 'qualify', 'exchange', 'reactivate'] as const
export type OutreachWizardGoal = (typeof OUTREACH_WIZARD_GOALS)[number]

/**
 * Q2 — « pourquoi maintenant » : le déclencheur d'un signal déjà connu (compte,
 * Découvrir), ou `null`. Un type de signal inconnu ne se devine pas : `null`.
 */
export function triggerFromSignalType(signalType: string | null | undefined): OutreachPlaybookKey | null {
  switch ((signalType ?? '').trim().toLowerCase()) {
    case 'hiring':
    case 'recrutement':
      return 'hiring_signal'
    case 'tender':
    case 'appel_offres':
      return 'tender'
    case 'nomination':
      return 'new_cio'
    default:
      return null
  }
}

/**
 * Le modèle proposé. Le déclencheur d'abord (c'est le « pourquoi maintenant »),
 * puis l'offre et l'objectif ; sans rien de net, le plus simple : contact tiède.
 * Fonction PURE — l'utilisateur change le modèle proposé librement.
 */
export function recommendPlaybook(input: {
  trigger: OutreachPlaybookKey | null
  offer: OutreachWizardOffer
  goal: OutreachWizardGoal
}): OutreachPlaybookKey {
  if (input.trigger) return input.trigger
  if (input.goal === 'reactivate') return 'win_back'
  if (input.offer === 'profil') return 'bench_consultant'
  return 'warm_contact'
}

/**
 * Le gabarit d'origine gardé comme RÉFÉRENCE sur une séquence née d'un modèle
 * (`template_key`, #2378.6 : la cadence est libre, le gabarit reste lisible dans
 * le badge de mode). Le premier gabarit rangé sous ce déclencheur ; `null` quand
 * aucun ne l'est — jamais un gabarit voisin choisi au hasard.
 */
export function playbookTemplateKey(playbook: OutreachPlaybookKey): OutreachTemplateKey | null {
  return templatesOfCategory(playbook)[0] ?? null
}

/** Le texte préparé de chaque étape, par rang (0-based). */
export type PlaybookStepDraft = { subject: string; body: string }
export type PlaybookStepDrafts = Readonly<Record<number, PlaybookStepDraft | undefined>>

/**
 * La requête de création d'une séquence née d'un modèle — UN seul constructeur,
 * lu par l'assistant du navigateur ET par les automatisations (L-D1) : deux
 * constructeurs finiraient par créer deux séquences différentes du même modèle.
 *
 * Rien n'est inventé : une étape dont Laura n'a rien préparé reste VIDE ; une
 * variable sans repli BLOQUE l'étape e-mail (jamais de `{{…}}` littéral).
 */
export function buildPlaybookCreateRequest(input: {
  contactId: string
  playbook: OutreachPlaybookKey
  name: string
  drafts: PlaybookStepDrafts
  campaignLabel?: string
  /** Geste explicite pour passer outre une exclusion FORÇABLE (jamais le RGPD). */
  overrideExclusions?: { justification: string }
}): CreateOutreachSequenceRequest {
  const steps = OUTREACH_PLAYBOOKS[input.playbook].steps.map((step, index): CreateOutreachStepInput => {
    const draft = input.drafts[index]
    const body = draft?.body.trim() ?? ''
    const base: CreateOutreachStepInput = {
      kind: step.kind,
      offset_days: step.offset_days,
      label: step.label,
      objective: OUTREACH_STEP_INTENT_LABELS[step.intent],
    }
    if (!body) return base
    if (step.kind === 'email') {
      const empty = parseStepVariables(`${draft?.subject ?? ''} ${body}`)
        .filter(variable => variable.fallback === null)
        .map(variable => variable.name)
      if (empty.length > 0) return { ...base, blocked_variables: empty }
      return { ...base, draft: { subject: draft?.subject.trim() ?? '', body } }
    }
    if (step.kind === 'linkedin_invite' || step.kind === 'linkedin_message' || step.kind === 'call') {
      return { ...base, draft: { subject: '', body } }
    }
    return base
  })

  const templateKey = playbookTemplateKey(input.playbook)
  return {
    contact_id: input.contactId,
    name: input.name,
    ...(input.campaignLabel ? { campaign_label: input.campaignLabel } : {}),
    steps,
    ...(templateKey ? { template_key: templateKey } : {}),
    delay_unit: OUTREACH_DEFAULT_DELAY_UNIT,
    ...(input.overrideExclusions
      ? { override_exclusions: true, force_justification: input.overrideExclusions.justification }
      : {}),
  }
}

/**
 * Les natures d'étape que Laura sait RÉDIGER, et le canal du moteur de
 * rédaction (`POST /ia/message`) qui les sert. Une invitation LinkedIn part
 * sans note, une tâche ne se rédige pas : elles sont absentes, jamais devinées.
 */
export const PLAYBOOK_ENGINE_CHANNEL: Partial<Record<OutreachStepKind, 'email' | 'linkedin' | 'phone'>> = {
  email: 'email',
  linkedin_message: 'linkedin',
  call: 'phone',
}

/** Ce que Laura reçoit pour préparer UNE étape : le « pourquoi », l'offre, l'objectif, l'intention. */
export function buildPlaybookContext(input: {
  trigger: string | null
  stepLabel: string
  intent: string
  offer: string
  goal: string
}): string {
  return [
    input.trigger ? `Situation : ${input.trigger}.` : null,
    `Étape : ${input.stepLabel}.`,
    `Intention : ${input.intent}.`,
    `J’offre : ${input.offer}.`,
    `Je veux obtenir : ${input.goal}.`,
    'Message court, une seule question, rien d’inventé.',
  ]
    .filter((line): line is string => line !== null)
    .join(' ')
}
