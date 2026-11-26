import { z } from 'zod'
import { executionForReach, reachFromTable, type EffectExecution, type EffectReach } from './effect-reach.js'
import { minDelayBeforeStep, OUTREACH_SCENARIOS, type OutreachScenario } from './outreach-scenarios.js'
import {
  OUTREACH_CALL_OUTCOMES,
  OUTREACH_DELAY_UNITS,
  OUTREACH_ENROLLMENT_EXCLUSION_CODES,
  OUTREACH_LINKEDIN_INVITE_OUTCOMES,
} from './outreach-multichannel.js'
import { outreachSequenceStopEventSchema, type OutreachSequenceStopEvent } from './outreach-sequence-events.js'

/**
 * Séquences d'outreach multi-touch (roadmap §8 « programme une relance/séquence »
 * + §5 « mes relances »).
 *
 * Une séquence est une cadence de touches DATÉES sur un contact (ex. J0 email
 * préparé → J+4 rappel → J+10 relance email). Chaque étape a une échéance
 * (`due_at`) et un type (`kind`) :
 *  - `email`    — PRÉPARE le brouillon (draft snapshoté dans `payload`) et crée
 *                 un rappel interne daté « à envoyer ». L'email n'est JAMAIS
 *                 envoyé automatiquement — l'humain déclenche l'envoi via la
 *                 capacité send-email existante (#394, tous ses garde-fous
 *                 s'appliquent : opt-out, idempotence, ownership).
 *  - `reminder` — rappel interne daté (réutilise le journal `user_actions` via
 *                 l'intent `schedule_reminder` de l'Action Router).
 *  - `task`     — tâche interne datée (même mécanisme de rappel).
 *
 * Marquer une étape `done` fait avancer la séquence ; quand toutes les étapes
 * sont `done`/`skipped`, la séquence passe `completed`. `paused` gèle la
 * suite sur l'un des HUIT événements de pause (#2381.2 — reprise seulement
 * par geste humain explicite) ; `cancelled` clôt la séquence et skippe les
 * étapes restantes — posé automatiquement sur l'un des DIX-SEPT événements
 * d'arrêt (#2381.1, `OUTREACH_SEQUENCE_STOP_EVENTS`), dont une réponse ou un
 * RDV du contact (user_status `replied` / `meeting` : #2381.6, « pas d'étape
 * suivante pour être sûr » — jamais une simple pause).
 */

export const outreachSequenceStatusSchema = z.enum(['active', 'paused', 'completed', 'cancelled'])
export type OutreachSequenceStatus = z.infer<typeof outreachSequenceStatusSchema>

/**
 * Ce que l'écran AFFICHE — plus fin que ce que la base stocke (addendum final p56).
 *
 * Le badge disait « Active » sur une séquence dont la prochaine étape était un
 * e-mail que personne ne pouvait envoyer, faute de messagerie connectée. Le
 * stockage n'était pas faux : la séquence court bien. C'est le mot qui mentait —
 * « active » laisse entendre que quelque chose part tout seul, alors que le code
 * d'outreach dit précisément l'inverse (une étape e-mail PRÉPARE un brouillon et
 * pose un rappel, elle n'envoie jamais).
 *
 * D'où un statut d'AFFICHAGE dérivé plutôt que quatre valeurs de plus en base :
 * il se calcule à partir de l'état réel (échéance, canal de l'étape, capacité
 * connectée), donc il ne peut pas diverger de la réalité — une colonne, si.
 */
export const outreachDisplayStatusSchema = z.enum([
  /** Créée, rien n'est encore dû. */
  'prepared',
  /** Des échéances à venir, rien à faire aujourd'hui. */
  'scheduled',
  /** La prochaine étape est un e-mail et aucune messagerie n'est connectée. */
  'awaiting_connection',
  /**
   * Sans connecteur, mais rien ne bloque : chaque message est prêt et peut être
   * copié tel quel (recette finale §44).
   *
   * Distinct d'`awaiting_connection`, et la distinction compte : celui-là dit
   * « il manque quelque chose », celui-ci dit « vous pouvez travailler ». Les
   * confondre transforme un produit utilisable sans messagerie en un produit qui
   * a l'air en panne.
   */
  'ready_to_copy',
  /** Une étape est due : elle attend le geste de l'utilisateur. */
  'awaiting_validation',
  /**
   * Le contact a répondu. La séquence s'arrête d'elle-même : continuer à
   * relancer quelqu'un qui vient de répondre est la faute la plus coûteuse
   * d'une séquence, et la seule que l'outil peut éviter à coup sûr.
   */
  'responded',
  /** Une étape a échoué à l'exécution — l'erreur est expliquée et reprenable. */
  'failed',
  'paused',
  'completed',
  'cancelled',
  // #2202.48/#2202.51 — AJOUTÉS EN FIN (GA-08) : deux causes d'arrêt que
  // `cancelled` masquait toutes les deux sous le même mot. La cause vit déjà
  // dans `outreach_transitions.cause` (#2381, `OUTREACH_SEQUENCE_STOP_EVENTS`)
  // — ces deux valeurs ne créent aucun nouvel événement, elles exposent à
  // l'écran une distinction que le journal fait déjà. Les quinze autres causes
  // restent un « cancelled » générique : rien dans le tri ne demandait plus.
  /** Arrêtée sur un refus explicite du contact (`cause: 'refusal'`). */
  'refused',
  /** Arrêtée sur un bounce dur — adresse invalide (`cause: 'hard_bounce'`). */
  'bounced',
])
export type OutreachDisplayStatus = z.infer<typeof outreachDisplayStatusSchema>

/**
 * Dérive le statut d'affichage. Fonction PURE : mêmes entrées, même sortie, et
 * elle se teste sans base ni horloge réelle (`now` est un paramètre).
 *
 * `canSend` porte la vérité sur la capacité d'envoi. Il vaut `false` par défaut :
 * le pire cas honnête. Un appelant qui oublie de le renseigner affiche « en
 * attente de connexion » — visible et corrigeable — plutôt qu'un « active » qui
 * ne l'est pas.
 */
export function deriveOutreachDisplayStatus(input: {
  status: OutreachSequenceStatus
  /** Prochaine étape en attente, ou `null` quand il n'en reste aucune. */
  nextStep: { due_at: string; kind: OutreachStepKind } | null
  /** Une messagerie est-elle connectée pour cet utilisateur ? */
  canSend?: boolean
  now?: Date
  /** Au moins une étape a-t-elle déjà été faite ? Distingue « préparée » de « planifiée ». */
  hasProgress?: boolean
  /**
   * Le contact a-t-il répondu ? Domine tout le reste (§44) — une séquence dont
   * l'interlocuteur vient de répondre ne doit plus rien annoncer d'autre que
   * « il a répondu », quelle que soit l'échéance suivante.
   */
  hasReply?: boolean
  /** Une étape a-t-elle échoué à l'exécution ? */
  hasFailure?: boolean
  /**
   * #2202.48/#2202.51 — la CAUSE de l'arrêt, quand `status` vaut `cancelled`
   * (`outreach_transitions.cause` de la transition la plus récente, #2381).
   * Seules deux causes affinent l'affichage (`refusal` → `refused`,
   * `hard_bounce` → `bounced`) ; toute autre cause, ou son absence, reste un
   * `cancelled` générique — ajouter une distinction de plus se décide au tri,
   * pas ici.
   */
  cancelReason?: OutreachSequenceStopEvent | null
}): OutreachDisplayStatus {
  if (input.status === 'cancelled') {
    if (input.cancelReason === 'refusal') return 'refused'
    if (input.cancelReason === 'hard_bounce') return 'bounced'
    return 'cancelled'
  }
  if (input.status !== 'active') return input.status

  // La réponse d'abord : relancer quelqu'un qui vient de répondre est la faute
  // la plus coûteuse d'une séquence, et la seule que l'outil peut éviter à coup
  // sûr. Elle passe donc AVANT l'échec comme avant l'échéance.
  if (input.hasReply) return 'responded'
  if (input.hasFailure) return 'failed'
  if (!input.nextStep) return 'completed'

  const now = (input.now ?? new Date()).getTime()
  const due = new Date(input.nextStep.due_at).getTime()

  // Une étape e-mail sans messagerie connectée n'attend pas une échéance. Mais
  // « en attente de connexion » n'est le mot juste que tant que rien n'est dû :
  // une fois l'échéance passée, le brouillon est prêt et l'utilisateur peut le
  // COPIER — dire « il manque une connexion » à ce moment-là décrit un blocage
  // qui n'existe pas, alors que le travail est faisable à la main.
  if (input.nextStep.kind === 'email' && !input.canSend) {
    return due <= now ? 'ready_to_copy' : 'awaiting_connection'
  }
  if (due <= now) return 'awaiting_validation'
  return input.hasProgress ? 'scheduled' : 'prepared'
}

export const outreachStepKindSchema = z.enum([
  'email',
  'reminder',
  'task',
  // Lot L-B (#4165, épopée #4163) — AJOUTÉS EN FIN (GA-08) : les vrais canaux
  // d'une cadence multicanal. LinkedIn et l'appel restent MANUELS (« ce qu'on
  // ne promet pas ») : l'étape prépare le geste, le commercial le fait.
  'linkedin_invite',
  'linkedin_message',
  'call',
])
export type OutreachStepKind = z.infer<typeof outreachStepKindSchema>

/**
 * #2378.9 — une étape qui SORT attend, une étape INTERNE part.
 *
 * DÉCISION LOUIS 21/09/2026 : une étape programmée (J+4, J+10) s'exécute selon
 * CE QU'ELLE ATTEINT, pas selon qui l'a programmée. Le côté de chaque nature se
 * DÉCLARE ici, dans le contrat, contre le vocabulaire partagé avec l'Action
 * Router (`effect-reach.ts`, `INTENT_REACH`) — pas deux mots pour une règle.
 *
 * ⚠️ Le côté se lit sur ce que L'EXÉCUTION AUTOMATIQUE de l'étape toucherait,
 * jamais sur ce que l'humain fera ensuite. Une étape `task` « Demande de
 * connexion LinkedIn » est INTERNE : à l'heure dite, Bellum crée une tâche et
 * rien d'autre ne bouge ; c'est le commercial qui, plus tard, envoie
 * l'invitation depuis LinkedIn — son clic, pas le nôtre. La nature `email`, au
 * contraire, PRÉPARE un brouillon et la seule chose qui manque est l'envoi :
 * c'est elle qui tomberait de l'autre côté si personne ne tenait la frontière.
 *
 * `Record<OutreachStepKind, …>` : une nature ajoutée à
 * {@link outreachStepKindSchema} sans être déclarée ici ne compile pas.
 */
export const OUTREACH_STEP_REACH: Record<OutreachStepKind, EffectReach> = {
  /** Un brouillon prêt dont il ne manque que l'envoi : il SORT. */
  email: 'external',
  /** Une note à soi-même, datée — personne d'autre ne l'apprend. */
  reminder: 'internal',
  /** Une tâche interne datée. Ce que l'humain en fait ensuite lui appartient. */
  task: 'internal',
  /**
   * Lot L-B — LinkedIn : Bellum ne pilote JAMAIS LinkedIn. Le geste est
   * « copier le message et ouvrir le profil » puis « marquer envoyé » : le clic
   * et l'envoi sont ceux du commercial, comme pour `task`.
   */
  linkedin_invite: 'internal',
  linkedin_message: 'internal',
  /** Lot L-B — une trame d'appel préparée ; l'appel et son issue sont humains. */
  call: 'internal',
}

/** #2378.9 — de quel côté tombe une nature d'étape. Une nature non déclarée
 *  (colonne `kind` élargie par une migration, JSON importé) tombe du côté qui
 *  ATTEND — voir {@link reachFromTable}. */
export function outreachStepReach(kind: string): EffectReach {
  return reachFromTable(OUTREACH_STEP_REACH, kind)
}

/** #2378.9 — ce qu'une étape ÉCHUE a le droit de faire sans clic humain. */
export function outreachStepExecution(kind: string): EffectExecution {
  return executionForReach(outreachStepReach(kind))
}

export const outreachStepStatusSchema = z.enum(['pending', 'done', 'skipped'])
export type OutreachStepStatus = z.infer<typeof outreachStepStatusSchema>

/**
 * #2909 (#2378.2) — LE PLAFOND DE VOLUME PAR ÉTAPE.
 *
 * Une séquence reste mono-contact (c74, `campaign_label` juste au-dessus) :
 * le plafond ne porte donc jamais sur UNE séquence, mais sur combien de
 * contacts partageant la MÊME étiquette de campagne ont déjà reçu CETTE
 * position d'étape aujourd'hui — l'agrégat que `campaign_label` existe déjà
 * pour porter.
 *
 * Fonction PURE, comme `marginBelowThreshold` : le compte du jour est lu par
 * l'appelant (une requête SQL groupée par `workspace_id, campaign_label,
 * position, done_at::date`), cette fonction ne fait que la COMPARAISON.
 *
 * ⚠️ Un plafond atteint ne bloque RIEN tout seul — un envoi reste un clic
 * humain (doctrine c82, GA-375) — il NOMME quand une position a atteint sa
 * limite du jour, pour que l'écran puisse le dire avant le clic. `null` =
 * aucun plafond réglé pour cette position, jamais bloquant par défaut, même
 * doctrine que `marginAlertThreshold` (éteint par défaut).
 */
export function campaignStepDailyCapReached(sentToday: number, cap: number | null): boolean {
  if (cap === null) return false
  return sentToday >= cap
}

/**
 * #2909 (#2378.2) — LE DÉCLENCHEUR PAR OUVERTURE/CLIC, closed sur DEUX valeurs.
 *
 * L'épopée demandait un déclencheur automatique (pixel d'ouverture, lien de
 * redirection pour le clic). Aucun des deux n'est honnête à construire ici :
 * `OutreachMessageService` le dit déjà (« AUCUNE route de ce service n'envoie
 * quoi que ce soit ») — l'envoi est un geste humain fait DANS LA MESSAGERIE DU
 * COMMERCIAL, jamais relayé par Bellum, donc aucun pixel ni lien réécrit par ce
 * produit ne traverse jamais le message réellement envoyé. En fabriquer un
 * produirait un signal qui semble mesuré et ne l'est jamais — exactement la
 * donnée fictive que la doctrine interdit.
 *
 * Le signal reste donc DÉCLARATIF — le commercial rapporte ce qu'il a constaté
 * dans SA messagerie (un accusé de lecture, un clic visible côté outil de
 * lien) — même famille que « Fait » (c81 : un geste déclaratif, jamais confondu
 * avec une preuve). `opened`/`clicked` sont les deux seules valeurs qu'un
 * commercial peut honnêtement affirmer avoir vues ; jamais une troisième
 * inventée pour occuper une case.
 */
export const OUTREACH_ENGAGEMENT_SIGNALS = ['opened', 'clicked'] as const
export const outreachEngagementSignalSchema = z.enum(OUTREACH_ENGAGEMENT_SIGNALS)
export type OutreachEngagementSignal = z.infer<typeof outreachEngagementSignalSchema>

/** Une étape persistée d'une séquence — échéance datée + payload libre
 *  (ex. snapshot du brouillon d'email préparé, note, référence du rappel). */
export const outreachSequenceStepSchema = z.object({
  id: z.string().guid(),
  sequence_id: z.string().guid(),
  /** Ordre de l'étape dans la séquence (0-based). */
  position: z.number().int().nonnegative(),
  /** Échéance datée de l'étape (ISO). */
  due_at: z.string().datetime(),
  kind: outreachStepKindSchema,
  /** Contexte de l'étape : `label`, `note` (contexte sur le contact),
   *  `objective` (ce que l'étape cherche à obtenir, #2202.33 — distinct de
   *  `note`), et pour `email` le snapshot du brouillon préparé
   *  (`email_draft`) — jamais un envoi. */
  payload: z.record(z.string(), z.unknown()),
  status: outreachStepStatusSchema,
  done_at: z.string().datetime().nullable(),
  /** #2909 — déclaré par le commercial, jamais détecté automatiquement (voir
   *  {@link OUTREACH_ENGAGEMENT_SIGNALS}). `null` = rien rapporté. */
  engagement_signal: outreachEngagementSignalSchema.nullable(),
  engagement_signal_at: z.string().datetime().nullable(),
})
export type OutreachSequenceStep = z.infer<typeof outreachSequenceStepSchema>

/** #2909 — le corps de `PATCH .../steps/:stepId/engagement` : déclarer ou
 *  effacer (`null`, une correction humaine gagne toujours) le signal rapporté. */
export const declareOutreachEngagementSignalSchema = z.object({
  engagement_signal: outreachEngagementSignalSchema.nullable(),
})
export type DeclareOutreachEngagementSignalInput = z.infer<typeof declareOutreachEngagementSignalSchema>

/**
 * #3061 — ce que la pause `not_now_deferred` sait dire, honnêtement. Voir le
 * champ `not_now_revalidation` de {@link outreachSequenceSchema} pour le détail
 * de chaque clé.
 */
export const outreachSequenceNotNowRevalidationSchema = z.object({
  due: z.boolean(),
  poste_still_valid: z.boolean(),
  not_evaluated: z.array(z.enum(['contexte', 'signal', 'pertinence'])),
})
export type OutreachSequenceNotNowRevalidation = z.infer<typeof outreachSequenceNotNowRevalidationSchema>

/** Une séquence d'outreach sur un contact, avec ses étapes ordonnées. */
export const outreachSequenceSchema = z.object({
  id: z.string().guid(),
  contact_id: z.string().guid(),
  /** Nom du contact (résolu côté serveur, scope workspace) — null si inconnu. */
  contact_name: z.string().nullable(),
  /**
   * Le POSTE du contact et le compte auquel il appartient (#1515).
   *
   * Le cockpit de suivi doit dire QUI est contacté et CHEZ QUI : une ligne
   * « Séquence · Marie Dubois » ne suffit pas à décider s'il faut la relancer.
   * Les trois champs sortent de la MÊME lecture que le nom (`contactNames`),
   * donc aucune requête de plus.
   *
   * ⚠️ `.default(null)` sur les trois : l'app et l'API se déploient séparément,
   * et un navigateur plus récent que le serveur recevrait sinon `undefined` là
   * où le contrat exige une valeur — un champ qui change de FORME ne dégrade
   * pas, il casse le parsing de toute la ligne.
   *
   * ⚠️ La photo n'est PAS ici. Elle serait un critère protégé dans une charge
   * utile qui sert aussi à choisir qui contacter : elle s'affiche sur une fiche,
   * elle n'entre pas dans une liste qui ordonne des gens.
   */
  contact_role: z.string().nullable().default(null),
  account_id: z.string().nullable().default(null),
  account_name: z.string().nullable().default(null),
  name: z.string(),
  /**
   * #2203.32 → .38 / #2153.29 — L'ÉTIQUETTE de campagne (arbitrage de Louis,
   * 16/09/2026). Les séquences lancées ensemble la partagent ; « où en est ma
   * campagne ? » se lit en filtrant dessus.
   *
   * ⚠️ Ce n'est PAS un objet « campagne » : aucune table, aucune cadence
   * commune, aucun ajout de contact après coup. Une séquence reste
   * mono-contact — c'est ce qui lui permet de s'arrêter quand CETTE personne
   * répond, et « retirer ce contact » (#2203.59) reste « annuler UNE des
   * séquences », qui existe déjà.
   *
   * `null` = lancée seule, et ce n'est pas « une campagne sans nom ».
   * `.default(null)` : l'app et l'API se déploient séparément — même raison
   * que `contact_role` au-dessus.
   */
  campaign_label: z.string().nullable().default(null),
  /**
   * #2378.6 — le GABARIT d'origine, gardé même quand la cadence a été
   * personnalisée : une séquence partie de « Prospection 3 touches » puis
   * retouchée pour CE contact reste reconnaissable. `null` = composée à la main.
   */
  template_key: z.string().nullable().default(null),
  /**
   * #5029.1 — le consultant en intercontrat que cette séquence PROPOSE (Reverse
   * Market, playbook F). `null` = une séquence ordinaire. Non nul ⇒ séquence
   * TOUJOURS manuelle, même sous mandat d'envoi signé (#5029.2).
   * `.default(null)` : app et API se déploient séparément.
   */
  consultant_id: z.string().guid().nullable().default(null),
  /** #2378.7 — la séquence dont celle-ci est une copie ; `null` = originale. */
  duplicated_from: z.string().guid().nullable().default(null),
  /**
   * #2380.67 — le FORÇAGE d'une collision (#1935.17) : quand cette séquence a
   * été créée alors qu'une autre était déjà active sur le même contact,
   * `forced_over_sequence_id` nomme celle qu'elle a mise en pause, et
   * `force_justification` porte le motif écrit qui a levé le refus. Les deux
   * `null` ensemble = pas de collision à cette création. Aucun DROIT de plus
   * n'est accordé ici : c'est la même permission qui crée une séquence
   * (`messages:send`) qui force — la justification est ce qui distingue « le
   * commercial a vu le refus et décidé » de « le refus n'a servi à rien »,
   * même patron que `acknowledge_risk`.
   */
  forced_over_sequence_id: z.string().guid().nullable().default(null),
  force_justification: z.string().nullable().default(null),
  status: outreachSequenceStatusSchema,
  /**
   * Lot L-B — l'unité des délais de CETTE séquence. `business_days` pour toute
   * séquence neuve, `calendar_days` pour l'existant (aucun changement
   * silencieux). `.default('calendar_days')` : app et API se déploient
   * séparément, et c'est l'ancien comportement qui doit s'afficher.
   */
  delay_unit: z.enum(OUTREACH_DELAY_UNITS).default('calendar_days'),
  /**
   * Lot L-B — présent quand la séquence est en PAUSE VACANCES : la date de
   * reprise prévue. `null` = pas de pause vacances (une pause manuelle ou
   * automatique ne porte jamais de date).
   */
  vacation_until: z.string().datetime().nullable().default(null),
  created_at: z.string().datetime(),
  /** Étapes ordonnées par `position` croissante. */
  steps: z.array(outreachSequenceStepSchema),
  /** Prochaine étape à jouer (première `pending` par échéance), ou null. */
  next_step: outreachSequenceStepSchema.nullable(),
  /**
   * Le contact a répondu (statut `replied` ou `meeting`).
   *
   * `deriveOutreachDisplayStatus` sait rendre « A répondu » depuis `hasReply`
   * depuis le premier jour, avec sa traduction et son test — mais aucun
   * appelant ne le renseignait, et le champ n'existait nulle part ailleurs que
   * dans son propre contrat. La colonne « Réponses » de l'écran valait donc
   * structurellement zéro : `status === 'responded'` ne pouvait jamais être
   * vrai.
   */
  contact_replied: z.boolean(),
  /**
   * #2202.48/#2202.51 — la CAUSE de l'arrêt quand `status` vaut `cancelled`,
   * relue depuis `outreach_transitions.cause` (#2381) — jamais recalculée : la
   * classification de la réponse qui a arrêté la séquence s'est déjà faite une
   * fois (`outreachReplyEffect`), la refaire ici divergerait au premier
   * fournisseur de classification changé. `null` couvre aussi bien « toujours
   * active » que « pas de transition retrouvée ».
   */
  cancel_reason: outreachSequenceStopEventSchema.nullable().default(null),
  /**
   * #3061 — présent SEULEMENT quand `status` vaut `paused` pour la cause
   * `not_now_deferred` : le contact a dit « pas maintenant ». `due` dit si le
   * délai de reconsidération (`NOT_NOW_REVALIDATION_DAYS`) est dépassé.
   * `poste_still_valid` est la SEULE revérification automatique honnête ici —
   * `contact.lifecycle_state`, le même fait que {@link resume} vérifie déjà.
   * `not_evaluated` NOMME ce qu'aucun calcul ne mesure encore (doctrine : un
   * axe non évaluable est nommé, jamais tû ni deviné) — le planificateur qui
   * les évaluerait lui-même reste un chantier séparé.
   */
  not_now_revalidation: outreachSequenceNotNowRevalidationSchema.nullable().default(null),
  /**
   * Une messagerie est-elle réellement connectée pour cet utilisateur ?
   *
   * ⚠️ Résolu par le SERVEUR. Il était calculé par chaque écran, à partir de sa
   * propre lecture de la messagerie — deux écrans, deux lectures, deux vérités
   * possibles sur la même séquence. Et surtout : le serveur créait une séquence
   * `active` contenant des étapes e-mail sans avoir jamais regardé s'il pouvait
   * en envoyer une. Le badge disait la capacité, le chemin d'écriture l'ignorait.
   *
   * `false` reste le pire cas honnête : un appelant qui ne le renseigne pas
   * affiche « en attente de connexion », visible et corrigeable, plutôt qu'un
   * « active » qui ne l'est pas.
   */
  can_send: z.boolean(),
})
export type OutreachSequence = z.infer<typeof outreachSequenceSchema>

/* ------------------------------- templates -------------------------------- */

/**
 * Les cadences disponibles, une par SITUATION (addendum final p57).
 *
 * Une cadence unique appliquée à tout le monde est ce qui produit la relance
 * mécanique : on ne relance pas un compte froid sur LinkedIn comme on suit un
 * push profil chez un client actif. Chaque entrée porte donc une situation
 * commerciale reconnaissable, et le principe qui la justifie est documenté avec
 * elle — sans quoi la prochaine cadence sera choisie au hasard.
 *
 * ⚠️ Ce sont des calendriers CHOISIS par leur nom, pas le rythme automatique
 * d'un compte : celui-là vit dans `PATTERNS`
 * (`apps/api/src/modules/contacts/cadence-templates.ts`) et couvre les neuf
 * états de relation. Que les deux ne coïncident pas est délibéré et argumenté —
 * voir le bloc « ⚑ Où vit le rythme d'une relance » dans `outreach-scenarios.ts`
 * et `OutreachService.cadenceScenario`.
 */
export const outreachTemplateKeySchema = z.enum([
  'prospection_3_touches',
  'cold_linkedin',
  'cold_email',
  'fresh_signal',
  'profile_push',
  'existing_client',
  // #2202.1/.2/.3/.4/.6/.8 — cinq situations réclamées par le retour, absentes
  // des six premières : un message SEUL (sans cadence forcée), une session
  // d'appels, une cadence délibérément légère, l'entretien d'une relation sur
  // la durée (nurturing), et la relance qui suit un rendez-vous. AJOUTÉES EN
  // FIN (même règle que `actionOutcomeSchema`) : aucune valeur retirée, aucun
  // rang recyclé.
  'single_message',
  'call_session',
  'light_sequence',
  'nurturing',
  'post_meeting_followup',
  // #2202.39/#2202.40 — AJOUTÉS EN FIN (GA-08) : deux situations dont le
  // SCÉNARIO existait déjà (`outreach-scenarios.ts`, `referred_contact` et
  // `dormant_connection`) sans gabarit dédié dans le sélecteur — le contact
  // recommandé partait sur `prospection_3_touches`, un lien dormant sur
  // `existing_client`, deux cadences pensées pour une autre situation.
  'referred_contact',
  'dormant_connection',
  // #2202.44 — AJOUTÉ EN FIN (GA-08) : les treize gabarits précédents couvrent
  // tous des CONTACTS (prospect froid, client actif, recommandation, lien
  // dormant…) — aucun ne couvre un PARTENAIRE ESN (apporteur d'affaires ou
  // sous-traitance). Une relation d'affaires entre deux entreprises n'est pas
  // une prospection : pas de « signal vérifié », pas de « close-loop » vers une
  // vente, mais une proposition de collaboration puis un entretien du lien.
  'esn_partner',
])
export type OutreachTemplateKey = z.infer<typeof outreachTemplateKeySchema>

/**
 * Templates de séquence — source de vérité unique des offsets/labels, partagée
 * API (calcul des échéances réelles) et web (aperçu des échéances avant
 * création). `offset_days` est relatif au jour de création (J0 = aujourd'hui).
 */
export const OUTREACH_SEQUENCE_TEMPLATES: Record<
  OutreachTemplateKey,
  {
    name: string
    steps: {
      kind: OutreachStepKind
      offset_days: number
      /**
       * Le libellé écrit dans la BASE au moment de la création. Il reste en
       * français : c'est un enregistrement, pas un texte d'interface — le
       * retraduire après coup changerait ce qu'une séquence créée en mars dit
       * d'elle-même.
       */
      label: string
      /**
       * CE QUE CETTE TOUCHE APPORTE — la clé d'affichage (#1510).
       *
       * ⚠️ *« Ne pas afficher uniquement J0 / J+4 / J+10 sans expliquer ce que
       * chaque message apporte. »* L'aperçu rendait `label` TEL QUEL, donc en
       * français quelle que soit la langue : un utilisateur anglophone lisait
       * « Relance valeur (J+4) ». La forme (offsets, canaux) vit ici, unique ;
       * le TEXTE vit dans les catalogues, dans les deux langues, et une garde
       * vérifie qu'aucune étape n'en manque.
       */
      purposeKey: string
    }[]
  }
> = {
  prospection_3_touches: {
    name: 'Prospection — 3 touches',
    steps: [
      // ⚠️ Les libellés de CE gabarit étaient les seuls à ne rien dire —
      // « Email préparé », « Rappel », « Relance email » nomment le CANAL, pas
      // ce que la touche apporte. Les cinq autres disaient déjà « Premier
      // contact », « Relance valeur », « Preuve sociale », « Close-loop ».
      { kind: 'email', offset_days: 0, label: 'Premier contact (J0)', purposeKey: 'prospection_3_touches.0' },
      { kind: 'reminder', offset_days: 4, label: 'Rappel de relance (J+4)', purposeKey: 'prospection_3_touches.1' },
      { kind: 'email', offset_days: 10, label: 'Relance et close-loop (J+10)', purposeKey: 'prospection_3_touches.2' },
    ],
  },
  // Compte froid, LinkedIn : aucune pression avant l'acceptation. Relancer
  // quelqu'un qui n'a pas encore accepté la connexion, c'est se faire ignorer
  // deux fois.
  cold_linkedin: {
    name: 'Compte froid — LinkedIn',
    steps: [
      { kind: 'task', offset_days: 0, label: 'Demande de connexion (J0)', purposeKey: 'cold_linkedin.0' },
      { kind: 'task', offset_days: 2, label: 'Message après acceptation', purposeKey: 'cold_linkedin.1' },
      { kind: 'reminder', offset_days: 7, label: 'Relance valeur (J+5 après message)', purposeKey: 'cold_linkedin.2' },
      { kind: 'reminder', offset_days: 12, label: 'Dernière relance (J+10)', purposeKey: 'cold_linkedin.3' },
    ],
  },
  // Compte froid, e-mail : quatre touches, et CHACUNE apporte une information
  // différente. Répéter le même message trois fois n'est pas une cadence.
  cold_email: {
    name: 'Compte froid — email',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Premier contact (J0)', purposeKey: 'cold_email.0' },
      { kind: 'email', offset_days: 4, label: 'Relance valeur (J+4)', purposeKey: 'cold_email.1' },
      { kind: 'email', offset_days: 10, label: 'Preuve sociale (J+10)', purposeKey: 'cold_email.2' },
      { kind: 'email', offset_days: 18, label: 'Close-loop (J+18)', purposeKey: 'cold_email.3' },
    ],
  },
  // Signal très frais : agir vite, mais vérifier le signal d'abord — un signal
  // mal lu grille le compte pour six mois.
  fresh_signal: {
    name: 'Signal frais',
    steps: [
      { kind: 'task', offset_days: 0, label: 'Vérifier le signal (J0)', purposeKey: 'fresh_signal.0' },
      { kind: 'email', offset_days: 0, label: 'Premier contact (J0)', purposeKey: 'fresh_signal.1' },
      { kind: 'reminder', offset_days: 3, label: 'Relance (J+3)', purposeKey: 'fresh_signal.2' },
      { kind: 'reminder', offset_days: 7, label: 'Close-loop (J+7)', purposeKey: 'fresh_signal.3' },
    ],
  },
  // Push profil : disponibilité et preuve, jamais un CV générique. La fenêtre
  // est courte — un profil disponible ne le reste pas.
  profile_push: {
    name: 'Push profil',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Push profil (J0)', purposeKey: 'profile_push.0' },
      { kind: 'reminder', offset_days: 2, label: 'Relance (J+2)', purposeKey: 'profile_push.1' },
      { kind: 'reminder', offset_days: 5, label: 'Relance (J+5)', purposeKey: 'profile_push.2' },
      { kind: 'task', offset_days: 8, label: 'Close-loop et libération du profil', purposeKey: 'profile_push.3' },
    ],
  },
  // Client actif : la coordination interne passe AVANT la relance. Écrire à un
  // client sans savoir ce que fait l'équipe en mission est le meilleur moyen de
  // se contredire.
  existing_client: {
    name: 'Client actif — expansion',
    steps: [
      { kind: 'task', offset_days: 0, label: "Point avec l'équipe en mission (J0)", purposeKey: 'existing_client.0' },
      { kind: 'email', offset_days: 2, label: 'Proposition adjacente (J+2)', purposeKey: 'existing_client.1' },
      { kind: 'reminder', offset_days: 9, label: 'Suivi (J+7 après envoi)', purposeKey: 'existing_client.2' },
    ],
  },
  // #2202.1/.2 — LE CAS QUI NE DEMANDE PAS DE CADENCE. Une question précise, une
  // réponse à donner : forcer un rappel puis une relance sur un contact déjà
  // identifié aurait fabriqué un suivi qui n'a pas lieu d'être.
  single_message: {
    name: 'Message unique',
    steps: [{ kind: 'email', offset_days: 0, label: 'Message unique (J0)', purposeKey: 'single_message.0' }],
  },
  // #2202.3 — le téléphone d'abord : utile quand la conversation vaut mieux
  // qu'un écrit. Le rappel à J+2 n'est pas une relance insistante, c'est la
  // deuxième fenêtre pour joindre la même personne.
  call_session: {
    name: 'Session d’appels',
    steps: [
      { kind: 'task', offset_days: 0, label: 'Appeler (J0)', purposeKey: 'call_session.0' },
      { kind: 'task', offset_days: 2, label: 'Rappeler si injoignable (J+2)', purposeKey: 'call_session.1' },
    ],
  },
  // #2202.4 — deux touches, largement espacées : le retour demande de ne pas
  // presser un contact qu'on ne veut pas brusquer.
  light_sequence: {
    name: 'Séquence légère',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Premier contact (J0)', purposeKey: 'light_sequence.0' },
      { kind: 'reminder', offset_days: 10, label: 'Relance espacée (J+10)', purposeKey: 'light_sequence.1' },
    ],
  },
  // #2202.6 — une relation à ENTRETENIR, pas à convertir tout de suite : le
  // rythme est mensuel, jamais une relance insistante (distinct du `mode`
  // `nurturing` déjà lu par `CampaignContext`, qui ne choisissait encore aucun
  // gabarit particulier).
  nurturing: {
    name: 'Nurturing',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Premier partage (J0)', purposeKey: 'nurturing.0' },
      { kind: 'reminder', offset_days: 30, label: 'Second point (J+30)', purposeKey: 'nurturing.1' },
      { kind: 'reminder', offset_days: 60, label: 'Troisième point (J+60)', purposeKey: 'nurturing.2' },
    ],
  },
  // #2202.8 — juste après un rendez-vous : le compte rendu fixe ce qui a été
  // dit avant que ça se dilue, puis deux relances resserrées tant que le
  // rendez-vous est encore frais.
  post_meeting_followup: {
    name: 'Relance après rendez-vous',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Compte rendu (J0)', purposeKey: 'post_meeting_followup.0' },
      { kind: 'reminder', offset_days: 5, label: 'Relance (J+5)', purposeKey: 'post_meeting_followup.1' },
      { kind: 'reminder', offset_days: 12, label: 'Close-loop (J+12)', purposeKey: 'post_meeting_followup.2' },
    ],
  },
  // Recommandation reçue : la source ne se cite que si elle y a autorisé —
  // même règle que le scénario `referred_contact` (`outreach-scenarios.ts`).
  referred_contact: {
    name: 'Recommandation',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Premier message (J0)', purposeKey: 'referred_contact.0' },
      { kind: 'reminder', offset_days: 4, label: 'Relance (J+4)', purposeKey: 'referred_contact.1' },
      { kind: 'email', offset_days: 7, label: 'Close-loop (J+7)', purposeKey: 'referred_contact.2' },
    ],
  },
  // Lien existant devenu silencieux : reconnaître le temps passé avant de
  // redemander quoi que ce soit — même règle que le scénario
  // `dormant_connection` (`outreach-scenarios.ts`).
  dormant_connection: {
    name: 'Réactivation — lien existant',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Reprise de contact (J0)', purposeKey: 'dormant_connection.0' },
      { kind: 'reminder', offset_days: 5, label: 'Relance (J+5)', purposeKey: 'dormant_connection.1' },
      { kind: 'email', offset_days: 7, label: 'Close-loop (J+7)', purposeKey: 'dormant_connection.2' },
    ],
  },
  // #2202.44 — un partenaire ESN (apporteur d'affaires, sous-traitance) : on
  // propose une collaboration, on relance une fois, puis on ENTRETIENT le lien
  // sur la durée (rythme nurturing) au lieu de fermer en close-loop — une
  // relation d'affaires entre deux entreprises ne se qualifie pas comme une
  // vente.
  esn_partner: {
    name: 'Partenaire',
    steps: [
      { kind: 'email', offset_days: 0, label: 'Proposition de collaboration (J0)', purposeKey: 'esn_partner.0' },
      { kind: 'reminder', offset_days: 7, label: 'Relance (J+7)', purposeKey: 'esn_partner.1' },
      { kind: 'task', offset_days: 21, label: 'Point partenaire (J+21)', purposeKey: 'esn_partner.2' },
    ],
  },
}

/**
 * CE QU'UN GABARIT PROMET, DÉRIVÉ DE SES ÉTAPES (#1510).
 *
 * Le retour demande que chaque modèle dise « nombre d'étapes · durée · canaux
 * utilisés » avant qu'on le choisisse. Les trois se LISENT dans la table
 * ci-dessus : les recopier à côté d'elle serait la loi 1 du tome 7 enfreinte —
 * un réglage à deux endroits, qui divergent au premier gabarit modifié.
 *
 * La durée est l'offset du DERNIER jour, pas le nombre d'étapes : « 4 touches
 * sur 18 jours » est exactement ce que le retour écrit, et c'est ce qu'un
 * commercial a besoin de savoir pour choisir entre une approche courte et une
 * cadence longue.
 */
export function outreachTemplateSpan(key: OutreachTemplateKey): {
  stepCount: number
  /** Jours entre la première et la dernière étape. Zéro quand tout tombe à J0. */
  spanDays: number
  /** Les natures d'étape employées, dans l'ordre du contrat, sans doublon. */
  kinds: OutreachStepKind[]
} {
  const steps = OUTREACH_SEQUENCE_TEMPLATES[key].steps
  const kinds: OutreachStepKind[] = []
  for (const step of steps) if (!kinds.includes(step.kind)) kinds.push(step.kind)
  return {
    stepCount: steps.length,
    spanDays: steps.reduce((max, step) => Math.max(max, step.offset_days), 0),
    kinds,
  }
}

/* ------------------------- espacement entre messages ------------------------ */

/**
 * Le PLANCHER de délai entre deux étapes qui écrivent, quand on ne sait rien de
 * la relation.
 *
 * ⚠️ La règle porte sur les messages, pas sur les étapes. Deux étapes le même
 * jour sont parfaitement légitimes quand l'une est une tâche : « vérifier le
 * signal » puis « premier contact » est l'ordre voulu du gabarit `fresh_signal`,
 * et l'interdire casserait le seul scénario qui demande d'agir vite. Deux
 * MESSAGES le même jour, en revanche, ne sont pas une cadence — c'est la même
 * personne écrite deux fois.
 *
 * La valeur est le plus petit délai non nul des quatre scénarios (4 jours pour
 * un contact recommandé). Elle vit ici et non dans le service pour que l'aperçu
 * du navigateur et la validation du serveur ne divergent pas.
 *
 * ⚠️ C'est un plancher DÉRIVÉ : le vrai rythme dépend de l'état de la relation,
 * et il vit dans `OUTREACH_SCENARIOS`. Ce nombre est ce qui reste quand on n'a
 * pas de scénario — pas une règle concurrente.
 *
 * Et il est dérivé POUR DE BON. Il était écrit `= 4` à la main, avec en
 * commentaire la façon de le recalculer : un nombre recopié à côté de sa table
 * finit par ne plus la suivre, et un commentaire ne casse jamais la CI. Le jour
 * où un scénario descend à trois jours, ce plancher descend avec lui — au lieu
 * de refuser en silence une séquence que le scénario autorise.
 */
export const OUTREACH_MIN_DAYS_BETWEEN_MESSAGES: number = Object.values(OUTREACH_SCENARIOS)
  .flatMap(scenario => [...scenario.minDelayDays])
  .filter(days => days > 0)
  .reduce((smallest, days) => Math.min(smallest, days), Number.POSITIVE_INFINITY)

/**
 * Les natures d'étape qui envoient réellement quelque chose.
 *
 * #2378.9 — DÉRIVÉE de {@link OUTREACH_STEP_REACH}, plus jamais réécrite à la
 * main (GA-26) : c'était un second `new Set(['email'])`, qui disait la même
 * chose que la frontière et qui aurait cessé de la dire au premier ajout.
 * Le sens de la dérivation est le bon : tout ce qui SORT compte comme un
 * message dans l'espacement, y compris une nature dont on ne saurait pas encore
 * si c'en est vraiment un — espacer à tort resserre la cadence, l'inverse
 * relancerait quelqu'un trop vite.
 */
const SENDING_KINDS: ReadonlySet<OutreachStepKind> = new Set<OutreachStepKind>(
  (Object.keys(OUTREACH_STEP_REACH) as OutreachStepKind[]).filter(kind => outreachStepReach(kind) === 'external'),
)

/** Une paire de messages trop rapprochée : ce qui a été demandé, et ce qu'il
 *  fallait. `required` voyage avec le problème pour que le message d'erreur dise
 *  le délai RÉELLEMENT exigé — un refus qui annonce le mauvais nombre envoie
 *  corriger la séquence dans le vide. */
export type OutreachSpacingProblem = {
  previousIndex: number
  index: number
  days: number
  required: number
}

/**
 * Les paires de messages trop rapprochées, dans l'ordre. Liste VIDE = conforme.
 *
 * Pure et datée par ses entrées : elle se teste sans horloge. Les étapes sont
 * supposées triées par échéance, comme les rend `resolveSteps`.
 *
 * ## Le rythme vient du SCÉNARIO quand on le connaît
 *
 * `scenario` porte la cadence de l'état de relation (0 / 5 / 7 pour une approche
 * froide, 0 / 4 / 7 pour un contact recommandé) : on n'espace pas de la même
 * façon quelqu'un qui vient d'accepter une connexion et un inconnu. Le délai
 * exigé DÉPEND donc du rang du message — un seuil unique laisserait passer le
 * troisième message à cinq jours là où le scénario en demande sept.
 *
 * ⚠️ `scenario` absent (état de relation inconnu) ⇒ plancher plat, c'est-à-dire
 * le comportement historique à l'identique. Appliquer le scénario le plus strict
 * à ce qu'on n'a pas mesuré serait conclure un verdict d'un silence.
 *
 * Propriété qui rend ce branchement sûr, et qui est TESTÉE : aucun scénario ne
 * descend sous le plancher. Le connaître ne peut que RESSERRER, jamais relâcher.
 */
export function outreachMessageSpacingProblems(
  steps: readonly { kind: OutreachStepKind; due_at: Date }[],
  scenario?: OutreachScenario | null,
): OutreachSpacingProblem[] {
  const problems: OutreachSpacingProblem[] = []
  let previous: { index: number; at: number } | null = null
  // Le rang du message DANS la cadence — il ne suit pas l'index de l'étape, qui
  // compte aussi les tâches et les rappels.
  let messageRank = 0
  steps.forEach((step, index) => {
    if (!SENDING_KINDS.has(step.kind)) return
    const at = step.due_at.getTime()
    if (previous) {
      const days = Math.floor((at - previous.at) / 86_400_000)
      const required = scenario ? minDelayBeforeStep(scenario, messageRank) : OUTREACH_MIN_DAYS_BETWEEN_MESSAGES
      if (days < required) {
        problems.push({ previousIndex: previous.index, index, days, required })
      }
    }
    previous = { index, at }
    messageRank += 1
  })
  return problems
}

/**
 * #2374.24 (épopée #2800) — le nombre de messages que porte cette composition.
 *
 * `OutreachScenario.maxSteps` était déclaré (`outreach-scenarios.ts`) depuis le
 * paquet de récupération sans qu'aucun chemin d'écriture ne le lise : un
 * plafond PAR ÉTAT DE RELATION que personne ne consultait, pendant que
 * `OUTREACH_SEQUENCE_MAX_STEPS` (plus bas) plafonnait le même nombre pour
 * TOUT LE MONDE, sans distinguer un inconnu d'un contact recommandé. Réutilise
 * `SENDING_KINDS`, comme l'espacement : une tâche ou un rappel de plus ne
 * rapproche personne d'une relance de trop.
 */
export function outreachMessageCount(steps: readonly { kind: OutreachStepKind }[]): number {
  return steps.filter(step => SENDING_KINDS.has(step.kind)).length
}

/**
 * #2374.24 — vrai quand une étape écrit sur un canal que ce scénario
 * n'autorise pas pour cet état de relation.
 *
 * Le seul canal qu'une séquence PROGRAMME réellement aujourd'hui est l'e-mail
 * (`kind: 'email'` — le brouillon `linkedin_draft` reste composé et copié à la
 * main par le commercial, hors séquence, jamais automatisé). Un scénario dont
 * `allowedChannels` omet `email_draft` — `accepted_connection` : connexion
 * LinkedIn tout juste acceptée, canal LinkedIn uniquement — ne doit donc
 * jamais voir composer une étape `email` : ce serait écrire par le canal que
 * l'état de relation refuse précisément.
 *
 * `scenario` absent (état de relation inconnu) ⇒ jamais de refus : on ne
 * conclut pas d'un silence, même règle que l'espacement (`outreachMessageSpacingProblems`).
 */
export function outreachChannelForbidden(
  steps: readonly { kind: OutreachStepKind }[],
  scenario: OutreachScenario | null | undefined,
): boolean {
  if (!scenario) return false
  if (scenario.allowedChannels.includes('email_draft')) return false
  return steps.some(step => step.kind === 'email')
}

/* ---------------------------------- create --------------------------------- */

/** Borne haute d'étapes par séquence — garde le fan-out de rappels raisonnable. */
export const OUTREACH_SEQUENCE_MAX_STEPS = 12

/** Une étape custom à la création : datée par `offset_days` (jours après
 *  aujourd'hui) OU par `due_at` explicite — l'un des deux est requis. */
export const createOutreachStepInputSchema = z
  .object({
    kind: outreachStepKindSchema,
    offset_days: z.number().int().min(0).max(365).optional(),
    due_at: z.string().datetime().optional(),
    label: z.string().trim().min(1).max(300).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
    /**
     * #2202.33 — ce que l'étape CHERCHE À OBTENIR (« qualifier le besoin »,
     * « obtenir un accord de principe ») — CHAMP DISTINCT de `note` (tranché
     * sans Louis, LOT j4 26/09 : la confondre avec `note` aurait doublonné le
     * même texte libre sous deux noms plutôt que de nommer deux choses
     * différentes — la note est un CONTEXTE sur le contact, l'objectif est le
     * BUT de l'étape elle-même).
     */
    objective: z.string().trim().min(1).max(300).optional(),
    /**
     * #3756.2 — le brouillon RÉSOLU d'un modèle de la bibliothèque (objet +
     * corps, variables déjà remplacées). Absent = le brouillon du contact.
     */
    draft: z.object({ subject: z.string().max(300), body: z.string().min(1).max(20000) }).optional(),
    /**
     * #3756.3 — les variables sans valeur qui BLOQUENT cette étape (messages
     * nommés). Une étape bloquée ne porte aucun brouillon : on n'envoie jamais
     * un `{{firstName}}` littéral, on ne devine rien.
     */
    blocked_variables: z.array(z.string().max(200)).max(20).optional(),
  })
  .refine(step => step.offset_days !== undefined || step.due_at !== undefined, {
    message: 'Chaque étape doit être datée : offset_days ou due_at requis.',
  })
export type CreateOutreachStepInput = z.infer<typeof createOutreachStepInputSchema>

/** Body de `POST /outreach/sequences` — un template simple OU des étapes
 *  custom (exactement l'un des deux). */
export const createOutreachSequenceRequestSchema = z
  .object({
    contact_id: z.string().guid(),
    name: z.string().trim().min(1).max(200).optional(),
    /**
     * L'étiquette partagée par les séquences lancées d'un même geste
     * (#2203.32 → .38). Absente = lancée seule ; le serveur n'en invente
     * jamais une, sinon chaque séquence solitaire deviendrait une campagne
     * d'une personne.
     */
    campaign_label: z.string().trim().min(1).max(120).optional(),
    template: outreachTemplateKeySchema.optional(),
    steps: z.array(createOutreachStepInputSchema).min(1).max(OUTREACH_SEQUENCE_MAX_STEPS).optional(),
    /**
     * #2378.6 — des étapes custom PARTIES d'un gabarit : le gabarit se garde
     * comme référence, il ne décide plus de la cadence.
     */
    template_key: outreachTemplateKeySchema.optional(),
    /**
     * « Oui, je sais que cette personne a probablement quitté l'entreprise. »
     *
     * Un contact étiqueté `RISQUE` — l'employeur détecté ne correspond ni au
     * compte ni à l'entité — ne part JAMAIS en séquence sans ce drapeau
     * (PDF 2 §5.2). Ce n'est pas une confirmation générique : c'est la seule
     * chose qui distingue « le commercial a vu le badge et a décidé » de « le
     * badge n'a servi à rien ».
     */
    acknowledge_risk: z.boolean().optional(),
    /**
     * #2380.67 — LE FORÇAGE d'une collision (#1935.17, refus « une séquence
     * est déjà active sur ce contact »). Absent ou vide ⇒ le refus reste ENTIER,
     * exactement le comportement d'avant ce point. Présent (motif non vide)
     * ⇒ l'ancienne séquence active est mise en PAUSE et celle-ci se crée —
     * jamais deux cadences actives sur la même personne à la fois, seule la
     * raison du refus original.
     */
    force_justification: z.string().trim().min(1).max(500).optional(),
    /**
     * Lot L-B — l'unité des délais. Absente = `business_days` (toute séquence
     * NEUVE compte en jours ouvrés). Les offsets des gabarits et des étapes
     * custom se lisent dans cette unité.
     */
    delay_unit: z.enum(OUTREACH_DELAY_UNITS).optional(),
    /**
     * Lot L-B — « Oui, je passe outre » : lève les exclusions FORÇABLES à
     * l'inscription (contacté il y a moins de 30 jours, compte déjà client).
     * Ne lève JAMAIS l'opposition RGPD ni, seul, la collision de séquence
     * active (celle-là garde `force_justification`).
     */
    override_exclusions: z.boolean().optional(),
  })
  .refine(body => Boolean(body.template) !== Boolean(body.steps), {
    message: 'Fournir un template OU des étapes custom (exactement un des deux).',
  })
export type CreateOutreachSequenceRequest = z.infer<typeof createOutreachSequenceRequestSchema>

/**
 * #2378.5 — modifier une étape ENCORE À FAIRE. Mêmes gardes qu'à la création
 * (ordre, espacement minimal entre deux messages) : une cadence retouchée
 * n'échappe pas aux règles d'une cadence créée.
 */
export const updateOutreachStepInputSchema = z
  .object({
    due_at: z.string().datetime().optional(),
    label: z.string().trim().min(1).max(300).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
    /** #2202.33 — voir {@link createOutreachStepInputSchema}. */
    objective: z.string().trim().min(1).max(300).optional(),
    /**
     * #2202.36 — le RESPONSABLE de l'étape : un membre de l'espace (vérifié côté serveur). `null` l'efface — une
     * correction humaine gagne toujours. Absent = on n'y touche pas.
     */
    owner_id: z.string().guid().nullable().optional(),
    /** Lot L-B — changer le canal d'une étape ENCORE À FAIRE. */
    kind: outreachStepKindSchema.optional(),
    /** Lot L-B — le délai en jours (ouvrés ou calendaires selon la séquence)
     *  depuis la création de la séquence ; recalcule `due_at`. Exclusif de `due_at`. */
    offset_days: z.number().int().min(0).max(365).optional(),
    /**
     * #3702 — l'objet et le corps écrits PAR LA PERSONNE pour une étape e-mail
     * qui n'a aucun brouillon (la préparation a échoué, ou rien n'existait).
     * Le serveur refuse d'écraser un brouillon déjà préparé : celui-là se
     * révise dans « À valider » (versionné), jamais ici.
     */
    email_draft: z
      .object({
        subject: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(20000),
      })
      .optional(),
  })
  .refine(
    input =>
      input.due_at !== undefined ||
      input.label !== undefined ||
      input.note !== undefined ||
      input.objective !== undefined ||
      input.owner_id !== undefined ||
      input.kind !== undefined ||
      input.offset_days !== undefined ||
      input.email_draft !== undefined,
    { message: 'Rien à modifier.' },
  )
export type UpdateOutreachStepInput = z.infer<typeof updateOutreachStepInputSchema>

/**
 * #2378.7 — dupliquer = reprendre les étapes pour UN AUTRE contact (reco (a)
 * du registre). Une séquence reste mono-contact (c74) : aucune inscription
 * n'est partagée, l'originale et ses étapes ne bougent pas.
 */
export const duplicateOutreachSequenceRequestSchema = z.object({
  contact_id: z.string().guid(),
  acknowledge_risk: z.boolean().optional(),
  /** #2380.67 — voir {@link createOutreachSequenceRequestSchema}. */
  force_justification: z.string().trim().min(1).max(500).optional(),
})
export type DuplicateOutreachSequenceRequest = z.infer<typeof duplicateOutreachSequenceRequestSchema>

/* ------------------------------ lot L-B (#4165) ----------------------------- */

/** Lot L-B — `PATCH .../steps/:stepId/outcome` : l'issue DÉCLARÉE d'une étape
 *  (invitation acceptée ou non, issue d'un appel). `null` efface — une
 *  correction humaine gagne toujours. */
export const declareOutreachStepOutcomeSchema = z.object({
  outcome: z.enum([...OUTREACH_LINKEDIN_INVITE_OUTCOMES, ...OUTREACH_CALL_OUTCOMES]).nullable(),
})
export type DeclareOutreachStepOutcomeInput = z.infer<typeof declareOutreachStepOutcomeSchema>

/** Lot L-B — `POST .../steps/reorder` : les étapes ENCORE À FAIRE, dans le
 *  nouvel ordre. Les échéances ne bougent pas de place : ce sont les mêmes
 *  créneaux, redistribués. */
export const reorderOutreachStepsSchema = z.object({
  step_ids: z.array(z.string().guid()).min(2).max(OUTREACH_SEQUENCE_MAX_STEPS),
})
export type ReorderOutreachStepsInput = z.infer<typeof reorderOutreachStepsSchema>

/** Lot L-B — `POST /outreach/sequences/vacation` : « tout en pause jusqu'au… ». */
export const startOutreachVacationSchema = z.object({
  until: z.string().datetime(),
})
export type StartOutreachVacationInput = z.infer<typeof startOutreachVacationSchema>

/** Lot L-B — `POST /outreach/sequences/eligibility` : les exclusions, contact par contact. */
export const outreachEligibilityRequestSchema = z.object({
  contact_ids: z.array(z.string().guid()).min(1).max(200),
})
export type OutreachEligibilityRequest = z.infer<typeof outreachEligibilityRequestSchema>

export const outreachEligibilityResponseSchema = z.object({
  contacts: z.array(
    z.object({
      contact_id: z.string().guid(),
      contact_name: z.string().nullable(),
      exclusions: z.array(
        z.object({
          code: z.enum(OUTREACH_ENROLLMENT_EXCLUSION_CODES),
          forceable: z.boolean(),
        }),
      ),
      /** `false` = l'information « compte déjà client » n'existe pas : jamais devinée. */
      client_status_known: z.boolean(),
    }),
  ),
})
export type OutreachEligibilityResponse = z.infer<typeof outreachEligibilityResponseSchema>
