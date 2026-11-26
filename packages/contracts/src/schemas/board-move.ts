import { z } from 'zod'
import { missionBoardColumnSchema, type MissionBoardColumn } from './mission-board.js'

/**
 * Ce qu'un déplacement de carte SUR LE BOARD entraîne, propose et vérifie
 * (PDF 5 §3).
 *
 * Le pipe des Projets a déjà sa fonction (`stage-move.ts`) et elle n'est pas
 * dupliquée ici : elle raisonne sur les neuf ÉTAPES d'un projet, celle-ci sur
 * les douze COLONNES du board, qui recouvrent deux objets différents. Les
 * fondre obligerait l'une des deux à parler le vocabulaire de l'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE BOARD ÉCRIT, ET CE QU'IL N'ÉCRIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * La décision D2 avait posé que le board est une PROJECTION : aucun état à lui.
 * Elle tient toujours. Un déplacement n'écrit donc jamais « la carte est en
 * colonne 9 » — il écrit sur l'OBJET D'ORIGINE : un projet change d'étape, une
 * mission change de statut. Ce que D2 interdit est un troisième jeu d'états,
 * pas le geste.
 *
 * Quatre règles, chacune contre une faute précise :
 *
 *  - **aucun déplacement silencieux.** Le panneau s'ouvre toujours, et
 *    « déplacer seulement » reste possible. Un geste qui déclenche cinq actions
 *    sans les annoncer se fait contourner en une semaine.
 *  - **`defaultChecked` seulement au niveau N1.** N1 = ce que le produit fait
 *    seul, sans rien envoyer dehors. Une case pré-cochée qui écrit à un client
 *    est la seule faute de cet écran qui ne se rattrape pas.
 *  - **une action qui exige une capacité absente est GRISÉE**, avec la raison.
 *    La proposer sans le dire ferait cliquer sur un bouton qui ne fait rien.
 *  - **un motif est exigé vers « Perdue »**, et nulle part ailleurs. Le
 *    demander partout le ferait remplir n'importe comment.
 */

/** Ce qu'une action a besoin d'avoir sous la main pour être proposée. */
export const BOARD_CAPABILITIES = ['mailbox', 'calendar', 'crm'] as const
export type BoardCapability = (typeof BOARD_CAPABILITIES)[number]

export type BoardProposal = {
  key: string
  /** `n1` = le produit le fait seul, sans rien envoyer dehors. */
  level: 'n1' | 'n2'
  /** Ce geste sort-il de l'outil (e-mail, message, client) ? */
  external: boolean
  /** Pré-cochée ? Jamais au-delà de N1, jamais sur un envoi externe. */
  defaultChecked: boolean
  /** Ce qu'il faut avoir connecté. `null` = rien. */
  requiresCapability: BoardCapability | null
  /**
   * QUI fait le geste — ajouté le 26/08/2026, arbitrage Louis.
   *
   * Le serveur RENDAIT `acceptedActions` tel quel et n'exécutait rien : vingt
   * cases qu'on cochait et qui ne faisaient rien. C'est le même défaut que le
   * pipe des Projets avait corrigé en août avec ce champ-là, et que le board
   * n'avait jamais corrigé.
   *
   * `server` n'est apposé que sur ce que le produit sait RÉELLEMENT faire, sans
   * rien inventer. Un REX, par exemple, reste `user` : il exige un résumé écrit
   * par un humain, et le fabriquer produirait la phrase que ce dépôt s'interdit.
   * Tout le reste ressort en RAPPEL nommé — un rappel affiché est honnête, une
   * case qui ne fait rien ne l'est pas.
   */
  performedBy: 'server' | 'user'
}

export type BoardMoveEffects = {
  /** Les colonnes que la transition écrit sur l'objet d'origine. */
  changes: readonly string[]
  proposals: readonly BoardProposal[]
  /** Ce qu'on montre sans rien décider : « la date de fin est-elle connue ? » */
  checks: readonly string[]
  reasonRequired: boolean
  /**
   * `true` quand la transition CRÉE un objet — la colonne 7, et elle seule.
   *
   * Elle mérite d'être signalée parce qu'elle est la seule qu'on ne défait pas
   * d'un clic : revenir en arrière laisse une mission derrière soi.
   */
  createsMission: boolean
}

const N1 = (
  key: string,
  defaultChecked: boolean,
  requiresCapability: BoardCapability | null = null,
  performedBy: 'server' | 'user' = 'user',
): BoardProposal => ({
  key,
  level: 'n1',
  external: false,
  defaultChecked,
  requiresCapability,
  performedBy,
})

/** Un geste qui SORT de l'outil. Jamais pré-coché, quelle que soit la colonne. */
const N2 = (key: string, requiresCapability: BoardCapability | null = 'mailbox'): BoardProposal => ({
  key,
  level: 'n2',
  external: true,
  defaultChecked: false,
  requiresCapability,
  // Un geste qui sort de l'outil reste TOUJOURS à la main de l'utilisateur.
  // C'est la règle du pipe, et la faire sauter ici ferait partir un message
  // client sur un glisser-déposer.
  performedBy: 'user',
})

type ColumnEffects = {
  changes: readonly string[]
  proposals: readonly BoardProposal[]
  checks: readonly string[]
  reasonRequired: boolean
}

/**
 * Ce que chaque colonne d'arrivée entraîne (§3, une ligne par colonne).
 *
 * Les `changes` disent quelle colonne de quelle table est écrite. Ils ne sont
 * jamais vides sauf pour « À créer », qui ne change rien : la carte y est déjà,
 * c'est la mission qui manque.
 */
const BY_COLUMN: Readonly<Record<MissionBoardColumn, ColumnEffects>> = {
  a_creer: {
    changes: [],
    proposals: [N1('create_mission_from_project', true)],
    checks: ['amount_known', 'billing_contact_known'],
    reasonRequired: false,
  },
  qualification: {
    changes: ['project_needs.status'],
    proposals: [N1('structure_need', true), N2('ask_client_scope')],
    checks: ['decision_contact_known'],
    reasonRequired: false,
  },
  matching: {
    changes: ['project_needs.status'],
    proposals: [N1('launch_matching', true), N1('widen_external_sourcing', false)],
    checks: ['need_has_one_skill'],
    reasonRequired: false,
  },
  shortlist_prete: {
    changes: ['project_needs.status'],
    proposals: [N1('generate_dossiers', true), N2('prepare_client_message')],
    checks: ['at_most_five_profiles', 'none_rejected_here'],
    reasonRequired: false,
  },
  profil_propose: {
    changes: ['project_needs.status', 'submissions.submitted_at'],
    proposals: [N1('create_submissions', true), N1('schedule_followups', true)],
    checks: ['consent_valid', 'dossier_attached'],
    reasonRequired: false,
  },
  validation_client: {
    changes: ['project_needs.status'],
    proposals: [N1('defence_brief', true), N2('ask_interview_date')],
    checks: ['interview_scheduled'],
    reasonRequired: false,
  },
  gagnee: {
    changes: ['missions.status', 'projects.outcome'],
    proposals: [
      N1('create_mission', true),
      N2('ask_purchase_order'),
      N1('prepare_onboarding', true),
      N2('tell_consultant'),
    ],
    checks: ['dates_known', 'sold_rate_known', 'billing_contact_known'],
    reasonRequired: false,
  },
  en_cours: {
    changes: ['missions.status', 'missions.started_on'],
    proposals: [
      N1('set_timesheet_cadence', true),
      N1('plan_j30_review', true, 'calendar', 'server'),
      N1('arm_t60_alert', true),
    ],
    // La date de fin n'est pas exigée — une mission sans fin est légitime —
    // mais elle est VÉRIFIÉE, parce que sans elle aucune alerte de
    // renouvellement ne pourra jamais partir.
    checks: ['end_date_known'],
    reasonRequired: false,
  },
  renouvellement: {
    changes: ['missions.status'],
    proposals: [
      N2('ask_client_feedback'),
      N2('ask_consultant_availability'),
      N1('prepare_extension', false),
      N1('search_repositioning', false),
    ],
    checks: ['end_date_known'],
    reasonRequired: false,
  },
  terminee: {
    changes: ['missions.status', 'missions.ends_on'],
    proposals: [
      N1('collect_rex', true),
      N1('check_last_timesheet', true),
      N1('check_invoicing', true),
      N2('ask_testimonial'),
      N1('launch_repositioning', false),
    ],
    checks: ['everything_invoiced'],
    reasonRequired: false,
  },
  perdue: {
    changes: ['missions.status', 'projects.outcome'],
    proposals: [N1('collect_loss_rex', true), N1('park_account', false, null, 'server')],
    checks: [],
    // Le seul motif obligatoire du board. Une perte sans raison n'apprend rien,
    // et c'est le seul moment où on l'obtient.
    reasonRequired: true,
  },
  en_veille: {
    changes: ['missions.status'],
    // Mettre en veille pose une QUESTION — quand revoit-on ça ? — sans exiger
    // de motif : ce n'est pas une décision qu'on justifie, c'est une décision
    // qu'on date.
    proposals: [N1('set_review_date', false)],
    checks: [],
    reasonRequired: false,
  },
}

export function effectsForBoardMove(from: MissionBoardColumn, to: MissionBoardColumn): BoardMoveEffects {
  const base = BY_COLUMN[to]
  return {
    changes: base.changes,
    proposals: base.proposals,
    checks: base.checks,
    reasonRequired: base.reasonRequired,
    // La colonne 7 est la seule qui fait naître un objet. `a_creer` propose de
    // créer aussi, mais depuis l'entonnoir : c'est le même geste, signalé au
    // même titre.
    createsMission: (to === 'gagnee' || to === 'a_creer') && from !== 'gagnee' && from !== 'a_creer',
  }
}

/**
 * Les propositions réellement offrables, compte tenu de ce qui est connecté.
 *
 * Une action dont la capacité manque n'est pas RETIRÉE : elle reste visible,
 * décochée et grisée, avec la capacité qui lui manque. La retirer ferait croire
 * qu'elle n'existe pas ; la laisser cliquable ferait croire qu'elle marche.
 */
export function offerableProposals(
  proposals: readonly BoardProposal[],
  available: readonly BoardCapability[],
): { proposal: BoardProposal; disabled: boolean; missingCapability: BoardCapability | null }[] {
  return proposals.map(proposal => {
    const missing =
      proposal.requiresCapability !== null && !available.includes(proposal.requiresCapability)
        ? proposal.requiresCapability
        : null
    return { proposal, disabled: missing !== null, missingCapability: missing }
  })
}

/** Les clés à pré-cocher, une fois les capacités connues. Une action grisée
 *  n'est jamais cochée, même si son niveau l'autoriserait. */
export function defaultCheckedKeys(
  proposals: readonly BoardProposal[],
  available: readonly BoardCapability[],
): string[] {
  return offerableProposals(proposals, available)
    .filter(entry => entry.proposal.defaultChecked && !entry.disabled)
    .map(entry => entry.proposal.key)
}

/**
 * Ce qu'un déplacement de carte demande au serveur.
 *
 * `acceptedActions` porte ce que l'utilisateur a COCHÉ — et le serveur ne fait
 * que ce qui s'y trouve. Ignorer ce champ est exactement le défaut trouvé sur
 * le pipe des Projets : la case « créer la mission » y était pré-cochée et
 * n'était jamais lue.
 */
export const moveBoardCardSchema = z
  .object({
    to: missionBoardColumnSchema,
    /** Obligatoire vers « Perdue ». Le serveur refuse s'il manque. */
    reason: z.string().trim().min(1).max(500).optional(),
    acceptedActions: z.array(z.string().min(1).max(60)).max(12).default([]),
  })
  .strict()
export type MoveBoardCard = z.infer<typeof moveBoardCardSchema>

/**
 * Les actions du board que le SERVEUR exécute lui-même.
 *
 * Deux, et pas vingt — parce qu'on n'exécute que ce qu'on sait faire sans rien
 * inventer :
 *
 *  - `park_account` écarte le compte avec le motif de la perte, qui est déjà
 *    exigé par la colonne « Perdue ». C'est le même geste que sur le pipe.
 *  - `plan_j30_review` pose un point à J+30 du démarrage dans l'agenda connecté.
 *    Sa capacité (`calendar`) est déclarée depuis le premier jour ; sans agenda,
 *    la case est grisée avant même d'arriver au serveur.
 *
 * Ce qui n'y figure pas et pourrait surprendre : `collect_rex` et
 * `collect_loss_rex` exigent un résumé ÉCRIT par un humain, `check_invoicing`
 * et `check_last_timesheet` sont des vérifications à faire, `create_mission`
 * n'a pas de sens sur une carte qui EST déjà une mission, et `arm_t60_alert`
 * décrit une routine qui tourne déjà pour toute mission datée. Chacune est un
 * rappel, et le dit.
 */
export const SERVER_PERFORMED_BOARD_ACTIONS = ['park_account', 'plan_j30_review'] as const
export type ServerPerformedBoardAction = (typeof SERVER_PERFORMED_BOARD_ACTIONS)[number]

/**
 * Sépare ce que le serveur exécute de ce qui reste à la charge de l'utilisateur.
 *
 * Une clé inconnue tombe dans `pending` plutôt que d'être jetée : un client plus
 * récent que le serveur ne doit pas voir une case disparaître en silence — c'est
 * la règle du pipe, et la raison pour laquelle le défaut d'origine était
 * invisible.
 */
export function splitBoardActions(accepted: readonly string[]): {
  server: ServerPerformedBoardAction[]
  pending: string[]
} {
  const server: ServerPerformedBoardAction[] = []
  const pending: string[] = []
  for (const key of accepted) {
    if ((SERVER_PERFORMED_BOARD_ACTIONS as readonly string[]).includes(key)) {
      server.push(key as ServerPerformedBoardAction)
    } else {
      pending.push(key)
    }
  }
  return { server, pending }
}

/** Ce que le serveur rend après un déplacement : ce qu'il a FAIT, ce qui reste. */
export type BoardMoveOutcome = {
  performed: string[]
  pending: string[]
  failed: Array<{ key: string; reason: string }>
}
