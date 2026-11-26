import type {
  AutomationActionKind,
  AutomationOutcome,
  AutomationPreparedAction,
  AutomationSignal,
  OutreachIntent,
  OutreachPlaybookKey,
} from '@bellum/contracts'

/**
 * Lot L-D1 (#4167, craft rule n°9) — LES AUTOMATISATIONS, SEMÉES.
 *
 * Ce que le lien de démonstration montre d'« Actions › Automatisations » : des
 * règles ACTIVES avec des déclenchements COMPTÉS sur 30 jours (le journal est
 * semé, le compteur le lit — il n'est pas fabriqué), une règle éteinte jamais
 * passée (« non mesuré », jamais 0), et ce que les règles ont préparé dans
 * « À traiter » (source « automatisation », le signal en « pourquoi maintenant »).
 *
 * ⚠️ Rien de ceci ne tourne en démo : le passage du matin saute les espaces de
 * démonstration (`AutomationRunnerService.runAll`). Ce sont des RÉSULTATS semés,
 * sur des contacts FICTIFS (`.example`) qui n'ont aucune autre séquence active —
 * une seconde séquence sur le même contact serait une collision de sollicitation.
 */

type DemoAutomationFiring = {
  outcome: AutomationOutcome
  daysAgo: number
  /** Le contact concerné (nom du dossier), `null` quand aucun n'a été retenu. */
  contact: string | null
  /** Le « pourquoi » d'un écart : un code d'exclusion de l'outreach, ou le motif nommé. */
  reason?: string
  /** `true` : la ligne pointe la séquence née du modèle pour ce contact (`DEMO_PLAYBOOK_SEQUENCES`). */
  linksSequence?: boolean
}

export const DEMO_AUTOMATION_RULES: readonly {
  signal: AutomationSignal
  actionKind: AutomationActionKind
  playbook?: OutreachPlaybookKey
  prepared?: AutomationPreparedAction
  inactiveDays?: number
  enabled: boolean
  creditCap: number | null
  templateKey?: string
  /** Théo C automations-editeur — le nom donné à la règle, sa version, et son brouillon (testé ou non). */
  name?: string
  version?: number
  draft?: {
    name: string
    prepared: AutomationPreparedAction
    /** `true` : un essai réussi a suivi l'enregistrement du brouillon, la version suivante peut s'activer. */
    tested: boolean
  }
  /** Quand la règle a tourné pour la dernière fois ; `null` = jamais (compteurs « non mesuré »). */
  lastRunDaysAgo: number | null
  firings: readonly DemoAutomationFiring[]
}[] = [
  {
    // Un recrutement détecté → la séquence « Signal de recrutement » (celle de Pierre Palmieri existe vraiment).
    signal: 'hiring',
    name: 'Un recrutement IT est détecté',
    actionKind: 'enroll_sequence',
    playbook: 'hiring_signal',
    enabled: true,
    creditCap: 40,
    templateKey: 'automation_hiring',
    lastRunDaysAgo: 0,
    firings: [
      { outcome: 'enrolled', daysAgo: 6, contact: 'Pierre Palmieri', linksSequence: true },
      { outcome: 'excluded', daysAgo: 4, contact: 'Lorenzo Bini Smaghi', reason: 'active_sequence' },
      { outcome: 'excluded', daysAgo: 2, contact: 'Isabelle Rouault', reason: 'recently_contacted' },
    ],
  },
  {
    // Un appel d'offres publié → un e-mail préparé à relire (le message est dans « À traiter »).
    signal: 'tender',
    name: 'Un appel d’offres est publié',
    actionKind: 'prepare_action',
    prepared: 'email_to_review',
    enabled: true,
    creditCap: null,
    lastRunDaysAgo: 0,
    firings: [
      { outcome: 'prepared', daysAgo: 1, contact: 'Nadia Perrin' },
      {
        outcome: 'no_contact',
        daysAgo: 9,
        contact: null,
        reason: 'Aucun contact à toi n’a pu être retenu pour ce signal.',
      },
    ],
  },
  {
    // Un nouveau décideur → un e-mail préparé à relire.
    signal: 'new_decision_maker',
    name: 'Un nouveau décideur apparaît',
    actionKind: 'prepare_action',
    prepared: 'email_to_review',
    enabled: true,
    creditCap: 20,
    lastRunDaysAgo: 0,
    firings: [
      { outcome: 'prepared', daysAgo: 2, contact: 'Julien Castaing' },
      { outcome: 'prepared', daysAgo: 12, contact: 'Younes Berrada' },
    ],
  },
  {
    // Un modèle installé mais ÉTEINT, jamais passé : « non mesuré », jamais 0.
    signal: 'inactive_account',
    name: 'Un compte reste 60 jours sans action',
    actionKind: 'enroll_sequence',
    playbook: 'win_back',
    inactiveDays: 60,
    enabled: false,
    creditCap: null,
    templateKey: 'automation_inactive_account',
    lastRunDaysAgo: null,
    firings: [],
  },
  {
    // Théo C automations-editeur — la règle de l'éditeur : une fin de mission approche → un appel à passer. Sa
    // version 2 (45 jours pour EDF dans la maquette ; ici, un e-mail à relire plutôt qu'un appel) attend d'être
    // activée : elle a été testée, la v1 continue de tourner.
    signal: 'mission_end',
    actionKind: 'prepare_action',
    prepared: 'call_to_make',
    enabled: true,
    creditCap: 30,
    name: 'Une fin de mission approche',
    version: 1,
    draft: { name: 'Une fin de mission approche (e-mail à relire)', prepared: 'email_to_review', tested: true },
    lastRunDaysAgo: 1,
    firings: [],
  },
]

/**
 * Théo C automations-bibliotheque.N3 — le JOURNAL DES ESSAIS, semé pour que l'écran ne soit pas vide en réunion :
 * un essai du brouillon (réussi), un essai de la règle qui tourne (réussi), un échec NOMMÉ (source non lisible).
 * Un essai ne crée ni tâche ni message : aucune de ces lignes ne porte de preuve d'envoi.
 */
export const DEMO_AUTOMATION_TRIALS: readonly {
  /** L'indice de la règle dans `DEMO_AUTOMATION_RULES`. */
  rule: number
  target: 'live' | 'draft'
  outcome: 'ok' | 'failed'
  daysAgo: number
  situationsRead: number | null
  labels: readonly string[]
  wouldAct: number | null
  reason?: string
}[] = [
  { rule: 4, target: 'draft', outcome: 'ok', daysAgo: 0, situationsRead: 2, labels: ['EDF', 'Thales'], wouldAct: 2 },
  { rule: 0, target: 'live', outcome: 'ok', daysAgo: 2, situationsRead: 1, labels: ['SNCF'], wouldAct: 1 },
  {
    rule: 4,
    target: 'live',
    outcome: 'failed',
    daysAgo: 8,
    situationsRead: null,
    labels: [],
    wouldAct: null,
    reason: 'La source de cette règle n’a pas pu être lue : connecte-la, puis relance l’essai.',
  },
]

/**
 * Ce que les règles ont PRÉPARÉ et qui attend dans « À traiter » : un e-mail à relire par règle
 * « préparer un e-mail », `needs_review` — rien n'est envoyé, rien n'est validé à la place de la personne.
 * Les textes sont des exemples fictifs ; `reason` est le signal, affiché en « pourquoi maintenant ».
 */
export const DEMO_AUTOMATION_MESSAGES: readonly {
  contact: string
  /** L'indice de la règle (dans `DEMO_AUTOMATION_RULES`) qui l'a préparé. */
  rule: number
  intent: OutreachIntent
  reason: string
  subject: string
  body: string
}[] = [
  {
    contact: 'Nadia Perrin',
    rule: 1,
    intent: 'qualify_context',
    reason: 'Appel d’offres publié : accompagnement des applications métier du groupe (fictif).',
    subject: 'Votre appel d’offres sur les applications métier',
    body: 'Bonjour Nadia,\n\nJ’ai vu passer votre appel d’offres sur l’accompagnement des applications métier. Avant de répondre, une question de cadrage : le périmètre inclut-il la reprise de l’existant, ou seulement les évolutions à venir ?\n\nBien cordialement',
  },
  {
    contact: 'Julien Castaing',
    rule: 2,
    intent: 'open_relationship',
    reason: 'Nouveau décideur détecté : Julien Castaing prend la direction du numérique (fictif).',
    subject: 'Félicitations pour votre nouveau poste',
    body: 'Bonjour Julien,\n\nBravo pour votre nomination. Les premiers mois sont souvent l’occasion de faire un état des lieux : seriez-vous ouvert à un échange de trente minutes sur ce qui compte pour vous en priorité ?\n\nBien cordialement',
  },
]
