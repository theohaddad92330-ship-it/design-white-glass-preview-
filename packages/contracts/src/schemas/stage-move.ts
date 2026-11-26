import type { ProjectStage } from './project.js'

/**
 * Ce qu'un déplacement d'étape ENTRAÎNE, PROPOSE et VÉRIFIE (PDF 2 §8.5).
 *
 * Le PDF 1 avait nommé cette fonction (`effectsForMove`) et ne l'avait pas
 * écrite, faute de consommateur — le §8.5 est ce consommateur.
 *
 * Trois familles, et les tenir séparées est tout l'intérêt :
 *  - ce qui CHANGE mécaniquement en base, que l'utilisateur subit ;
 *  - ce qui est PROPOSÉ, qu'il coche ou décoche ;
 *  - ce qui est VÉRIFIÉ, qu'on lui montre sans rien décider à sa place.
 *
 * La règle qui protège le tout : **aucun envoi externe n'est pré-coché**, et
 * seul le niveau N1 (ce que le produit fait seul, sans conséquence sortante)
 * peut l'être. Une case pré-cochée qui envoie un e-mail est la seule faute de
 * cet écran qui ne se rattrape pas.
 */
export type StageProposal = {
  key: string
  /** Pré-cochée ? Jamais au-delà de N1, jamais sur un envoi externe. */
  checked: boolean
  /** `n1` = le produit le fait seul, sans rien envoyer dehors. */
  level: 'n1' | 'n2'
  /** Ce geste sort-il de l'outil (e-mail, CRM, client) ? */
  external: boolean
  /**
   * QUI fait le geste — et c'est la distinction qui manquait.
   *
   * `server` : le produit l'exécute au moment du déplacement. `user` : c'est un
   * rappel, le produit ne fait rien et l'écran doit le dire. Sans ce champ,
   * toutes les cases se ressemblaient et aucune n'était lue : la case « créer
   * la mission » était pré-cochée depuis le premier jour et n'a jamais créé une
   * seule mission.
   */
  performedBy: 'server' | 'user'
  /**
   * #4339.2 — CE QUE LE SERVEUR FAIT quand la case est cochée, et le seul mode d'existence d'une proposition :
   * une tâche datée (dans Aujourd'hui), un brouillon de mail (jamais envoyé), un matching du vivier, ou
   * l'écartement du compte. Une proposition sans exécution câblée est RETIRÉE du catalogue, pas laissée en rappel.
   */
  execution: StageExecution
}

export type StageExecution =
  | { kind: 'task'; dueInDays: number }
  | { kind: 'draft' }
  | { kind: 'matching' }
  | { kind: 'account' }

export type StageMoveEffects = {
  /** Les colonnes que la transition écrit, toujours `stage` et `stage_entered_at`. */
  changes: readonly string[]
  proposals: readonly StageProposal[]
  /** Ce qu'on montre sans rien décider : « un contact décisionnaire existe-t-il ? » */
  checks: readonly string[]
  reasonRequired: boolean
  /**
   * Un retour arrière depuis « gagné » peut laisser une mission orpheline.
   * Le §15 le classe comme un cas à BLOQUER tant que la mission n'est pas
   * traitée ; ici on le SIGNALE, parce que la fonction ne connaît pas les
   * missions — c'est l'appelant qui les lit.
   */
  warnsAboutMission: boolean
  /**
   * `true` quand la transition CRÉE des missions — « signé », et elle seule.
   * #4195 : ce n'est plus une case à cocher, c'est un effet ANNONCÉ — le serveur
   * crée une mission par positionnement retenu à la signature, toujours.
   *
   * Elle mérite d'être signalée parce que c'est le seul geste de cet écran
   * qu'on ne défait pas d'un clic : le produit n'a aucun chemin de suppression
   * de mission, et c'est délibéré — supprimer une mission effacerait
   * l'historique de facturation qui s'y accroche. Le prix de cette prudence
   * est qu'une mission créée par erreur reste, donc l'écran le DIT avant.
   */
  createsMission: boolean
}

const proposal = (key: string, execution: StageExecution, checked: boolean): StageProposal => ({
  key,
  checked,
  // Rien ne sort de l'outil : un brouillon n'est PAS un envoi (le copilote prépare, le commercial envoie).
  level: 'n1',
  external: false,
  performedBy: 'server',
  execution,
})
const task = (key: string, dueInDays: number, checked: boolean): StageProposal =>
  proposal(key, { kind: 'task', dueInDays }, checked)
// Un brouillon ne se pré-coche jamais : il touche la boîte du commercial.
const draft = (key: string): StageProposal => proposal(key, { kind: 'draft' }, false)
const matching = (key: string, checked: boolean): StageProposal => proposal(key, { kind: 'matching' }, checked)

/**
 * #4339.1 / #4339.3 — le catalogue des propositions, par étape d'arrivée.
 *
 * Retirées faute d'exécution câblée (#4339.2) : `create_needs`, `first_task`, `ask_budget`, `schedule_followups`,
 * `prepare_client_message`, `ask_purchase_order`, `tell_consultant`. Elles n'étaient que des rappels « à faire » :
 * une case qui ne fait rien n'est pas honnête.
 */
const BY_STAGE: Record<ProjectStage, Omit<StageMoveEffects, 'changes' | 'warnsAboutMission' | 'createsMission'>> = {
  detected: { proposals: [task('review_signal', 1, false)], checks: ['signal_dated'], reasonRequired: false },
  potential: { proposals: [task('qualify_later', 7, false)], checks: ['signal_dated'], reasonRequired: false },
  qualified: {
    proposals: [task('complete_btmmp', 2, true), task('identify_sponsor', 2, true)],
    checks: ['decision_contact_exists'],
    reasonRequired: false,
  },
  confirmed: {
    // « Proposer des consultants de ton vivier » : le besoin est qualifié, il faut des profils.
    proposals: [matching('create_submissions', true)],
    checks: ['skills_filled'],
    reasonRequired: false,
  },
  profiles_submitted: {
    proposals: [
      task('verify_profile_sent', 1, true),
      task('schedule_interview', 2, true),
      draft('prepare_follow_up_mail'),
      matching('search_more_profiles', false),
    ],
    checks: ['at_most_five_profiles', 'none_rejected_here'],
    reasonRequired: false,
  },
  negotiation: {
    proposals: [task('prepare_rate_argument', 2, true), task('check_procurement', 2, true)],
    checks: ['amount_filled'],
    reasonRequired: false,
  },
  won: {
    proposals: [task('prepare_onboarding', 2, false)],
    checks: ['dates_known', 'sold_rate_known', 'billing_contact_known'],
    reasonRequired: false,
  },
  lost: {
    proposals: [
      task('collect_loss_rex', 7, true),
      proposal('park_account', { kind: 'account' }, false),
      task('replan_six_months', 180, false),
    ],
    checks: [],
    // Le motif est OBLIGATOIRE : une perte sans raison n'apprend rien à
    // personne, et c'est le seul moment où on l'obtient.
    reasonRequired: true,
  },
  dormant: {
    // Mettre en veille pose une QUESTION (quand revoit-on ça ?) sans exiger de motif : une décision qu'on date.
    proposals: [task('set_review_date', 30, false)],
    checks: [],
    reasonRequired: false,
  },
}

/** Le texte de la tâche que crée chaque proposition « tâche » — jamais deviné, jamais saisi par le client. */
export const STAGE_ACTION_TASKS: Record<string, { title: string; objective: string; expectedResult: string }> = {
  review_signal: {
    title: 'Relire le signal d’origine',
    objective: 'Vérifier que le signal tient toujours avant d’investir du temps.',
    expectedResult: 'Le signal est relu et daté, ou l’affaire est écartée.',
  },
  qualify_later: {
    title: 'Reprendre la qualification de cette piste',
    objective: 'Ne pas laisser la piste dormir sans décision.',
    expectedResult: 'La piste est qualifiée ou écartée.',
  },
  complete_btmmp: {
    title: 'Compléter la qualification de l’affaire',
    objective: 'Rendre l’affaire comparable aux autres avant d’engager des profils.',
    expectedResult: 'Budget, besoin, calendrier et décideurs sont renseignés.',
  },
  identify_sponsor: {
    title: 'Identifier le sponsor de l’affaire',
    objective: 'Savoir qui porte le besoin côté client.',
    expectedResult: 'Le sponsor est nommé sur l’affaire.',
  },
  verify_profile_sent: {
    title: 'Vérifier que le profil est bien parti',
    objective: 'S’assurer que le client a reçu le profil présenté.',
    expectedResult: 'Le client a bien reçu le profil, ou le renvoi est fait.',
  },
  schedule_interview: {
    title: 'Caler le créneau d’entretien avec le client',
    objective: 'Transformer le profil présenté en entretien.',
    expectedResult: 'Un créneau d’entretien est fixé avec le client.',
  },
  prepare_rate_argument: {
    title: 'Préparer l’argumentaire TJM',
    objective: 'Arriver à la négociation avec un tarif défendu.',
    expectedResult: 'L’argumentaire de TJM est prêt avant le prochain échange.',
  },
  check_procurement: {
    title: 'Vérifier le process achats du client',
    objective: 'Éviter qu’un référencement ou un bon de commande bloque la signature.',
    expectedResult: 'Les étapes achats du client sont connues.',
  },
  prepare_onboarding: {
    title: 'Préparer l’onboarding du consultant',
    objective: 'Que le démarrage de la mission soit prêt à la date convenue.',
    expectedResult: 'Les accès, le contact et la date de démarrage sont confirmés.',
  },
  collect_loss_rex: {
    title: 'Collecter un retour sur cette perte',
    objective: 'Apprendre de la perte tant que le client s’en souvient.',
    expectedResult: 'Le retour d’expérience de la perte est saisi.',
  },
  replan_six_months: {
    title: 'Relancer ce client dans six mois',
    objective: 'Revenir quand le contexte aura changé.',
    expectedResult: 'Un échange de relance a eu lieu avec le client.',
  },
  set_review_date: {
    title: 'Revoir cette affaire en veille',
    objective: 'Décider si l’affaire se réveille ou se clôt.',
    expectedResult: 'L’affaire est relancée ou clôturée.',
  },
}

export function effectsForMove(from: ProjectStage, to: ProjectStage): StageMoveEffects {
  const base = BY_STAGE[to]
  const changes = ['stage', 'stage_entered_at']
  if (to === 'won' || to === 'lost') changes.push('outcome', 'closed_at')
  // Rouvrir un projet clos efface sa clôture : « gagné le 3 mars » sur un
  // projet redevenu en négociation est un mensonge que personne ne remarque.
  if ((from === 'won' || from === 'lost') && to !== 'won' && to !== 'lost') changes.push('outcome', 'closed_at')

  return {
    changes,
    proposals: base.proposals,
    checks: base.checks,
    reasonRequired: base.reasonRequired,
    warnsAboutMission: from === 'won' && to !== 'won',
    createsMission: to === 'won',
  }
}

/**
 * Ce que le SERVEUR sait exécuter, et rien d'autre.
 *
 * La liste est courte à dessein : y inscrire une clé sans écrire le code qui va
 * avec reproduirait exactement le défaut qu'on corrige. Tout le reste est un
 * rappel, et le déplacement le rend tel quel pour que l'écran l'affiche comme
 * ce qu'il est — quelque chose qui reste à faire.
 */
// `create_mission` n'est plus proposé (#4195) mais reste ici : un ancien client l'envoie encore. Les autres clés sont
// TOUTES les propositions du catalogue (#4339.2) — `stage-move-executions.test.ts` verrouille l'égalité.
export const SERVER_PERFORMED_STAGE_ACTIONS = [
  'create_mission',
  'park_account',
  'review_signal',
  'qualify_later',
  'complete_btmmp',
  'identify_sponsor',
  'create_submissions',
  'verify_profile_sent',
  'schedule_interview',
  'prepare_follow_up_mail',
  'search_more_profiles',
  'prepare_rate_argument',
  'check_procurement',
  'prepare_onboarding',
  'collect_loss_rex',
  'replan_six_months',
  'set_review_date',
] as const
export type ServerPerformedStageAction = (typeof SERVER_PERFORMED_STAGE_ACTIONS)[number]

/**
 * Trie les cases cochées entre ce que le serveur va faire et ce qui reste à la
 * charge de l'utilisateur.
 *
 * Une clé inconnue tombe dans `pending` plutôt que d'être jetée : un client plus
 * récent que le serveur ne doit pas voir une case disparaître en silence.
 */
export function splitStageActions(accepted: readonly string[]): {
  server: ServerPerformedStageAction[]
  pending: string[]
} {
  const server: ServerPerformedStageAction[] = []
  const pending: string[] = []
  for (const key of accepted) {
    if ((SERVER_PERFORMED_STAGE_ACTIONS as readonly string[]).includes(key)) {
      server.push(key as ServerPerformedStageAction)
    } else pending.push(key)
  }
  return { server, pending }
}

/**
 * Ce qu'un déplacement d'étape a RÉELLEMENT fait.
 *
 * Trois listes séparées, et la troisième est celle qui compte : une action
 * demandée qui échoue doit se voir. `performed` sans `failed` laisserait croire
 * qu'une case décochée d'elle-même n'avait pas été cochée.
 */
export type StageMoveOutcome = {
  performed: string[]
  /** Coché, mais c'est à l'utilisateur de le faire. L'écran le dit. */
  pending: string[]
  failed: Array<{ key: string; reason: string }>
  /**
   * #4339.2 — le RÉSULTAT VISIBLE de chaque proposition exécutée : la tâche créée (dans Aujourd'hui), le brouillon
   * (ouvrable), le matching lancé (avec le besoin dont il classe les profils). Absent chez un ancien serveur.
   */
  created?: StageActionResult[]
}

export type StageActionResult = {
  key: string
  kind: 'task' | 'draft' | 'matching'
  /** Identifiant de la tâche, du brouillon, ou du besoin dont le matching a tourné. */
  id: string | null
  /** Lien vers le brouillon (messagerie) quand le fournisseur en rend un ; sinon l'écran le déduit du `kind`. */
  href: string | null
}

/** L'exécution d'une proposition, ou `null` pour une clé inconnue (ou `create_mission`, exécutée par la signature). */
export function stageActionExecution(key: string): StageExecution | null {
  for (const stage of Object.values(BY_STAGE)) {
    const found = stage.proposals.find(item => item.key === key)
    if (found) return found.execution
  }
  return null
}
