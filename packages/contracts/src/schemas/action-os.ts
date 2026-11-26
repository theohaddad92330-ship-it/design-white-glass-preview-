import { z } from 'zod'
import { actionIntentSchema, actionIntentTypeSchema, type ActionIntentType } from './action-router.js'

/**
 * Action OS — les objets métier qui manquaient entre « le copilote recommande »
 * et « quelque chose s'est produit dans un outil » (addendum final p22-25, p88).
 *
 * L'infrastructure existait déjà : BullMQ, un outbox, des Redis Streams, des
 * identifiants de corrélation, un routeur à cinq intents et un journal. Ce qui
 * n'existait pas, c'est le DOMAINE : un workflow qu'on peut versionner et
 * administrer, un run qu'on peut reprendre, une approbation qu'on peut exiger,
 * une réservation de crédits qu'on peut libérer. Sans eux, « exécution
 * gouvernée » se résumait à un appel de service qui réussissait ou non.
 *
 * Trois principes portent tout le fichier :
 *
 * 1. **Rien ne part sans avoir été montré.** Un pas de workflow déclare sa
 *    cible, son connecteur, sa permission, son coût estimé et son risque AVANT
 *    de s'exécuter — c'est ce qui rend la prévisualisation possible.
 * 2. **Un échec n'est pas un silence.** Les issues distinguent `failed` (on
 *    sait que ça a raté), `partial` (une partie est passée) et `unknown` (le
 *    timeout : on ne sait pas, et le dire est la seule réponse honnête).
 * 3. **Un crédit se réserve avant de se dépenser.** Débiter puis échouer, ou
 *    échouer puis débiter, sont deux façons de mentir sur le solde.
 */

// ── Niveaux d'automatisation (p25) ───────────────────────────────────────────

/**
 * Ce que Bellum a le droit de faire seul, du conseil pur à l'autonomie bornée.
 *
 * Le niveau n'est pas une préférence de confort : il décide qui porte la
 * responsabilité de l'écriture. `n2` (un clic de l'utilisateur) est le défaut
 * produit ; `n3` s'impose dès que l'action engage l'espace au-delà de son
 * auteur — volume, dépense, suppression, export.
 */
export const automationLevelSchema = z.enum([
  /** Conseil : score, briefing, critique. Aucune écriture. */
  'n0_advice',
  /** Préparation : brouillon, tâche proposée, shortlist. Aucune action externe. */
  'n1_prepare',
  /** Approbation simple : un clic de l'utilisateur. */
  'n2_user_approval',
  /** Approbation manager : volume, dépense, changement de propriétaire, export sensible. */
  'n3_manager_approval',
  /** Automatique borné : digest, rappel, rafraîchissement, sync non destructive. */
  'n4_bounded_auto',
  /** Autonomie étendue : séquences ou actions récurrentes, après historique fiable. */
  'n5_extended_auto',
])
export type AutomationLevel = z.infer<typeof automationLevelSchema>

/** Ordre croissant d'exigence — sert à comparer deux niveaux sans table ad hoc. */
export const AUTOMATION_LEVEL_ORDER: readonly AutomationLevel[] = [
  'n0_advice',
  'n1_prepare',
  'n2_user_approval',
  'n3_manager_approval',
  'n4_bounded_auto',
  'n5_extended_auto',
] as const

// ── Le même sujet, dit à l'utilisateur (A0-A3) ───────────────────────────────

/**
 * Ce que Bellum ANNONCE de son autonomie, en quatre bandes.
 *
 * ⚠️ **Ce n'est PAS un second modèle d'autorisation.** `automationLevelSchema`
 * (N0-N5, juste au-dessus) décide ; A0-A3 le DIT. Deux vocabulaires pour deux
 * publics : six niveaux techniques n'ont jamais tenu sur une puce de carte, et
 * un commercial n'a pas à savoir ce que « n3 » veut dire pour comprendre que
 * rien ne partira sans lui.
 *
 * La couche est purement ADDITIVE : aucun `n*` ne change de nom, d'ordre ou de
 * sens parce qu'elle existe. La garde `no-n-level-was-renamed` le vérifie.
 *
 * - `a0` — lire, calculer, expliquer. Aucune écriture.
 * - `a1` — préparer un brouillon, une tâche, une liste. Rien n'est posé.
 * - `a2` — écrire en INTERNE, après un GO.
 * - `a3` — agir vers une personne ou un système EXTÉRIEUR.
 */
export const userAutonomyBandSchema = z.enum(['a0', 'a1', 'a2', 'a3'])
export type UserAutonomyBand = z.infer<typeof userAutonomyBandSchema>

/**
 * La dérivation de A depuis N, **et elle vit ici, à un seul endroit** (GA-26).
 *
 * Deux entrées, parce que le niveau technique ne suffit pas à répondre :
 *
 * 1. `level` — ce que la politique d'approbation exige.
 * 2. `reachesOutside` — la sortie touche-t-elle une personne ou un système qui
 *    n'est pas nous ?
 *
 * **La cible l'emporte sur le niveau, et c'est le cœur de la promesse.** Un
 * brouillon de mail est `n1_prepare` — il ne part pas, personne ne l'a approuvé,
 * il n'engage rien. Il est pourtant `a3`, parce que sa DESTINATION est
 * extérieure. C'est cette bande, et elle seule, qui l'exclut de toute validation
 * en lot : on ne veut pas qu'un clic « tout valider » emporte un message vers un
 * client au milieu de sept écritures internes.
 *
 * `n5_extended_auto` sans destinataire extérieur rend `a2` : la table du
 * mapping (08_ACTION_AUTONOMY_MAPPING) ne le nomme pas, mais une autonomie
 * étendue qui écrit en interne reste une écriture interne — et la règle dure du
 * même document interdit déjà à N4/N5 de sortir.
 */
export function userAutonomyBand(input: { level: AutomationLevel; reachesOutside: boolean }): UserAutonomyBand {
  if (input.reachesOutside) return 'a3'
  if (input.level === 'n0_advice' || input.level === 'n4_bounded_auto') return 'a0'
  if (input.level === 'n1_prepare') return 'a1'
  return 'a2'
}

/**
 * Nature du risque porté par un pas. `irreversible` n'est pas « grave » : c'est
 * « on ne peut pas revenir en arrière », ce qui est une propriété différente et
 * qui, seule, justifie d'exiger un niveau d'approbation supérieur.
 */
export const actionRiskSchema = z.enum(['low', 'medium', 'high', 'irreversible'])
export type ActionRisk = z.infer<typeof actionRiskSchema>

// ── Où l'effet atterrit : dedans, ou sur quelqu'un ───────────────────────────

/**
 * Est-ce que l'effet de cette action ATTEINT une personne qui n'est pas le
 * propriétaire du run ?
 *
 * ⚠️ L'axe n'est PAS « est-ce que ça quitte notre base » — une écriture CRM
 * quitte notre base et ne sollicite personne. L'axe est « quelqu'un d'autre
 * reçoit-il quelque chose de notre fait », parce que c'est la seule propriété
 * qu'aucun réglage n'a le droit de lever (`c14_automatisation` : « le copilote
 * n'envoie jamais d'e-mail, il prépare, le commercial envoie »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI, ET PAS DANS UN NOUVEAU CHAMP DU PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'information EXISTE déjà, écrite en toutes lettres dans les docblocs de
 * `action-router.ts` : « Never an external send — a notification is not an
 * email » (`notify_user`), « a reminder is a note to self […] you do not invite
 * a client to a reminder » (`schedule_reminder` vs `create_calendar_event`).
 * Elle n'avait simplement aucune forme LISIBLE PAR DU CODE. Ajouter un champ
 * `external: boolean` au `WorkflowStep` en aurait fait une SECONDE déclaration
 * de la même chose, que l'auteur d'un pas aurait pu contredire (loi 1 : un
 * réglage vit à un seul endroit). Ici, la portée est déduite du seul
 * `intentType` — c'est-à-dire du discriminant sur lequel le routeur lui-même
 * décide quoi appeler, donc de ce qui se produit RÉELLEMENT.
 *
 * La table est un `Record` EXHAUSTIF, et c'est le point : un neuvième type
 * d'intent ne compile pas tant que personne n'a répondu à la question. Un
 * oubli devient une erreur de type, pas un « interne » par défaut.
 *
 * `create_calendar_event` est classé `external` bien qu'il PUISSE ne porter
 * aucun invité : le pas déclare son type, jamais sa charge utile, et un
 * planificateur qui ne peut pas savoir doit choisir le côté qui demande un
 * humain. Un rappel sans invité, lui, a son propre type (`schedule_reminder`).
 */
/**
 * #2449 — OÙ l'effet atterrit, en trois sites, et NON en deux.
 *
 * La table ci-dessous a remplacé `INTENT_REACH` (`'internal' | 'external'`)
 * **sans changer une seule réponse de `reachesOutsideProduct`** : elle la
 * DÉCOUPE. Le docblock au-dessus dit déjà pourquoi il le fallait — « une
 * écriture CRM quitte notre base et ne sollicite personne » — mais la valeur,
 * elle, ne savait pas le dire : `create_crm_task` et `pin_memory_fact`
 * répondaient tous deux `internal`, alors que l'un écrit dans l'outil d'un
 * tiers et l'autre dans nos propres tables.
 *
 * Ce découpage est ce qui rend le niveau « préparer » (#2449.8-.15) TENABLE :
 * « il crée à l'INTÉRIEUR de BellumAI, jamais dehors » ne se décide pas sur
 * « quelqu'un reçoit-il quelque chose », mais sur « l'écriture atterrit-elle
 * chez nous ». Deux questions, une seule table — parce que deux tables
 * divergeraient (GA-26).
 *
 *   `bellum`           nos propres tables. Rien ne sort, rien n'est facturé
 *                      ailleurs, personne n'est sollicité.
 *   `connected_system` l'outil d'en face : le CRM du client, sa boîte, son
 *                      agenda, un fournisseur facturé. L'écriture SORT de
 *                      BellumAI ; personne ne la reçoit pour autant.
 *   `person`           quelqu'un REÇOIT quelque chose de notre fait. C'est la
 *                      seule propriété qu'aucun réglage n'a le droit de lever
 *                      (`c14_automatisation`).
 */
const INTENT_SITE: Record<ActionIntentType, ActionEffectSite> = {
  /** Un e-mail part vers une boîte qui n'est pas la nôtre. */
  send_email: 'person',
  /** Un événement avec invités atterrit dans l'agenda de quelqu'un d'autre. */
  create_calendar_event: 'person',
  /** Une fiche dans l'outil du client : personne ne reçoit rien, mais ça SORT. */
  create_crm_task: 'connected_system',
  create_crm_note: 'connected_system',
  /**
   * Une lecture facturée chez un fournisseur — la cible n'est pas sollicitée,
   * et l'appel part quand même hors de chez nous, au prix d'un crédit. Classé
   * par le SITE et non par le seul `estimatedCredits` déclaré : un pas dont
   * l'auteur oublie d'annoncer son coût reste tenu par la porte.
   */
  enrich_contact: 'connected_system',
  /** Une note à soi-même, datée, dans nos tables. */
  schedule_reminder: 'bellum',
  snooze: 'bellum',
  /** Une notification in-app au propriétaire du run. */
  notify_user: 'bellum',
  // #1931 — les cinq intents que les cartes de chat migrent vers Action OS
  // (lot 4). Aucun ne sollicite quelqu'un d'autre que le propriétaire du run
  // avant qu'un HUMAIN n'ait cliqué « Envoyer » ailleurs.
  /** Un brouillon GÉNÉRÉ chez nous, jamais envoyé par ce pas. */
  generate_message: 'bellum',
  /**
   * Un brouillon déposé dans une boîte PERSONNELLE (D58) — personne ne le
   * reçoit, mais il est écrit chez Google, pas chez nous. C'est exactement le
   * « brouillon externe » que #2449.4 interdit au niveau « répondre seulement »
   * et que #2449.17 (déjà là, `card-effect-ports.ts`) fait valider.
   */
  create_mail_draft: 'connected_system',
  /** Un réglage de routine personnelle. */
  update_routine: 'bellum',
  /** Un réglage d'espace ou personnel. */
  update_setting: 'bellum',
  /** Une note épinglée à la mémoire de l'espace — personne n'est notifié. */
  pin_memory_fact: 'bellum',
  // Épopée #2771 — les cinq rollbacks. Chacun atterrit là où le geste qu'il
  // défait atterrissait : un rappel/un statut restent chez nous, une tâche CRM
  // sort (une note rectificative), une séquence stoppée reste chez nous (ce
  // sont ses ENVOIS futurs, empêchés, qui auraient atteint quelqu'un), un
  // brouillon supprimé sort (sa messagerie personnelle, comme sa création).
  cancel_reminder: 'bellum',
  restore_status: 'bellum',
  remove_crm_task: 'connected_system',
  // #2319.114 — la clôture s'écrit chez le fournisseur, comme la création.
  close_crm_task: 'connected_system',
  stop_sequence: 'bellum',
  delete_draft: 'connected_system',
  // #3076 — un champ de `projects` (Bellum) : rien ne sort, personne n'est sollicité.
  update_opportunity: 'bellum',
}

/**
 * #4016 L6 — l'effet ÉCRIT-il dans l'outil du client (son CRM, sa boîte) ?
 *
 * « Pour le CRM faut quand même un go du user » (Louis 11/10/2026). Le site
 * `connected_system` mêle deux gestes : une ÉCRITURE chez le client (tâche,
 * note, brouillon) et une LECTURE facturée chez un fournisseur
 * (`enrich_contact`). Seule la première garde son plancher « un humain dit
 * oui » quelle que soit la posture de l'espace ; la seconde est une dépense,
 * tenue par le seuil de dépense. Dérivé de `INTENT_SITE` (GA-26) : un futur
 * intent `connected_system` est une écriture chez le client tant qu'il n'est
 * pas nommé ici comme une lecture.
 */
const CONNECTED_SYSTEM_READS: ReadonlySet<ActionIntentType> = new Set<ActionIntentType>(['enrich_contact'])

export function writesIntoClientTool(intentType: ActionIntentType): boolean {
  const site = INTENT_SITE[intentType] ?? UNDECLARED_INTENT_SITE
  return site === 'connected_system' && !CONNECTED_SYSTEM_READS.has(intentType)
}

/** Les trois sites où l'effet d'un intent peut atterrir. */
export const actionEffectSiteSchema = z.enum(['bellum', 'connected_system', 'person'])
export type ActionEffectSite = z.infer<typeof actionEffectSiteSchema>

/**
 * #2378.9 — le côté d'un intent NON DÉCLARÉ. `person`, c'est-à-dire celui qui
 * ATTEND une validation : la seule valeur par défaut qui ne peut pas faire
 * parler le produit à quelqu'un sans qu'on l'ait voulu. Jumeau de
 * {@link UNDECLARED_EFFECT_REACH} (`effect-reach.ts`), même doctrine.
 */
const UNDECLARED_INTENT_SITE: ActionEffectSite = 'person'

/** Où l'effet de cet intent atterrit — lu sur le seul discriminant du routeur. */
export function intentSite(intentType: ActionIntentType): ActionEffectSite {
  return INTENT_SITE[intentType]
}

// ── Ce qu'on peut défaire, et comment (#2400.8) ──────────────────────────────

/**
 * #2400.8 — la réversibilité d'un geste, en trois classes.
 *
 * ⚠️ Ce N'EST PAS `actionRiskSchema`. `risk: 'irreversible'` dit « on ne peut
 * pas revenir en arrière » sur UN PAS tel que son auteur l'a déclaré ; cette
 * table le dit sur le TYPE d'intent, donc sur ce qui se produit réellement, et
 * elle distingue en plus le cas que `risk` fusionne : un geste qu'on ne peut
 * pas DÉFAIRE mais qu'on peut COMPENSER.
 *
 *   `reversible`   le geste se retire, et après retrait plus rien n'en reste :
 *                  un rappel, un réglage, un brouillon non envoyé.
 *   `compensable`  le geste ne se retire pas, mais un second geste le corrige
 *                  ⚠️ **en AJOUTANT, jamais en supprimant** (doctrine « on
 *                  archive, on ne supprime pas ») : une note rectificative
 *                  versée au CRM, une tâche refermée, un crédit remboursé au
 *                  balayage nocturne (`c78_remboursement_credits_nocturne`).
 *   `irreversible` rien ne le défait ni ne le compense : un e-mail parti est lu.
 *
 * ⚠️ Un geste compensateur n'écrase JAMAIS une correction humaine, quelle que
 * soit sa date (doctrine « une correction humaine gagne toujours »). C'est
 * pourquoi cette table classe, et ne DÉFAIT rien : elle dit ce qui est
 * rattrapable, le rattrapage reste un geste que quelqu'un demande.
 */
const INTENT_REVERSIBILITY: Record<ActionIntentType, ActionReversibility> = {
  /** Parti, c'est lu. Aucun rappel de message n'existe de notre côté. */
  send_email: 'irreversible',
  /** L'évènement s'annule ; l'invitation reçue, non — d'où « compensable ». */
  create_calendar_event: 'compensable',
  /** Une tâche se REFERME dans le CRM ; on ne l'y supprime pas. */
  create_crm_task: 'compensable',
  /** Une note versée ne s'efface pas : on en verse une rectificative. */
  create_crm_note: 'compensable',
  /** La donnée s'archive, et le crédit débité à tort se rembourse (c78). */
  enrich_contact: 'compensable',
  /** Un pense-bête se retire, et il n'en reste rien. */
  schedule_reminder: 'reversible',
  snooze: 'reversible',
  /** Une notification est vue : on ne la dé-notifie pas, on la rectifie. */
  notify_user: 'compensable',
  /** Un brouillon chez nous s'archive. */
  generate_message: 'reversible',
  /** Un brouillon non envoyé, dans SA boîte : il se retire sans trace. */
  create_mail_draft: 'reversible',
  update_routine: 'reversible',
  update_setting: 'reversible',
  pin_memory_fact: 'reversible',
  // Épopée #2771 — les cinq rollbacks EUX-MÊMES, classés comme le geste
  // qu'ils défont l'aurait été s'il avait pu être annulé directement : une
  // fois joués, rien ne reste à compenser (un rappel éteint, un statut
  // restauré, une séquence arrêtée, un brouillon retiré) SAUF le retrait
  // d'une tâche CRM, qui verse une note et ne supprime rien côté CRM — donc
  // `compensable`, comme `create_crm_task` lui-même.
  cancel_reminder: 'reversible',
  restore_status: 'reversible',
  remove_crm_task: 'compensable',
  /** Rien ne se supprime chez le fournisseur : une tâche fermée peut se rouvrir de là-bas, pas d'ici. */
  close_crm_task: 'compensable',
  stop_sequence: 'reversible',
  delete_draft: 'reversible',
  // #3076 — un champ se réécrit à sa valeur d'avant, comme `update_setting`.
  update_opportunity: 'reversible',
}

export const actionReversibilitySchema = z.enum(['reversible', 'compensable', 'irreversible'])
export type ActionReversibility = z.infer<typeof actionReversibilitySchema>

/** Ce qu'on peut défaire de ce geste — lu sur le seul discriminant du routeur. */
export function intentReversibility(intentType: ActionIntentType): ActionReversibility {
  return INTENT_REVERSIBILITY[intentType]
}

/**
 * Vrai quand l'effet du pas SORT du produit et atteint quelqu'un.
 *
 * Le seul appelant qui compte est le plancher d'approbation
 * (`approval-policy.ts`) : un pas externe ne s'exécute jamais sans qu'un humain
 * ait dit oui, quel que soit le niveau d'automatisation de l'espace.
 *
 * #2449 — DÉRIVÉ de `INTENT_SITE`, et non plus d'une seconde table : « atteint
 * quelqu'un » est exactement le site `person`. Les réponses sont inchangées,
 * intent par intent (témoin dans `copilot-action-level.test.ts`).
 */
export function reachesOutsideProduct(intentType: ActionIntentType): boolean {
  // #2378.9 + #2449 — LES DEUX LOTS ONT RAISON, ET LA FUSION AVAIT PERDU LE
  // SECOND. #2449 a eu raison de DÉRIVER la réponse de `INTENT_SITE` plutôt que
  // d'entretenir une seconde table (GA-26). #2378.9 a eu raison d'exiger qu'une
  // clé ABSENTE rende le côté qui ATTEND : le compilateur garantit la table
  // exhaustive, mais pas la valeur qui arrive d'ailleurs — une colonne élargie
  // par une migration, le JSON d'un workflow importé, la réponse d'un service.
  //
  // Lire `INTENT_SITE` à nu rendait `undefined` pour ces valeurs-là, donc
  // `false`, donc « interne », donc exécutable sans qu'un humain dise oui. Le
  // produit a le droit d'agir seul ; il n'a pas le droit de PARLER À QUELQU'UN
  // seul. Un intent non déclaré est donc traité comme atteignant une personne.
  return (INTENT_SITE[intentType] ?? UNDECLARED_INTENT_SITE) === 'person'
}

/**
 * Les familles d'actions que le rapport (p25) déclare sensibles quoi qu'il
 * arrive. Elles ne peuvent jamais descendre sous `n2`, et franchissent `n3` dès
 * qu'un seuil de volume ou de dépense est atteint.
 */
export const sensitiveActionFamilySchema = z.enum([
  'bulk_send',
  'multichannel_send',
  'bulk_delete',
  'bulk_update',
  'costly_enrichment',
  'data_export',
  'client_commitment',
])
export type SensitiveActionFamily = z.infer<typeof sensitiveActionFamilySchema>

// ── Issue d'une action (p32) ─────────────────────────────────────────────────

/**
 * Issue d'un pas ou d'un run.
 *
 * `unknown` mérite son existence : quand un appel externe part en timeout, on ne
 * sait pas s'il a abouti. Le transformer en `failed` ferait rejouer une action
 * peut-être déjà faite (doublon) ; en `done`, on annoncerait un succès inventé.
 * On le dit, et on réconcilie avant de rejouer.
 */
export const actionOutcomeSchema = z.enum([
  'done',
  'partial',
  'skipped',
  'failed',
  'cancelled',
  'awaiting_approval',
  'unknown',
  // Ajouté en FIN (GA-08). Une requête ACCEPTÉE par le fournisseur n'est pas une
  // action vérifiée : la replier en `done` déclarerait la réussite et débiterait
  // le crédit sur une promesse. `queued` n'est pas terminal — il attend une
  // confirmation, il ne la remplace pas.
  'queued',
])
export type ActionOutcome = z.infer<typeof actionOutcomeSchema>

/**
 * ⚠️ IL N'Y A PAS DE LISTE DES ISSUES TERMINALES, ET C'EST DÉLIBÉRÉ.
 *
 * Ce fichier a porté un `TERMINAL_OUTCOMES = ['done','skipped','failed',
 * 'cancelled']` que personne n'a jamais lu. Le runner ne pose pas la question
 * « cette issue est-elle terminale ? » : il pose la seule qui décide,
 * `outcome === 'unknown'` (`workflow-runner.service.ts`), parce que le doute
 * sur un envoi peut-être parti est le seul cas où l'on s'arrête.
 *
 * Une liste que personne ne lit ne se trompe pas bruyamment : elle se périme.
 * `queued` a été ajouté à l'énumération sans y entrer — et l'aurait-il fallu
 * que rien ne l'aurait signalé. Le jour où une reprise a besoin de la notion,
 * elle se dérive de `actionOutcomeSchema`, à côté de la reprise, avec son test.
 */

// ── Politique de reprise (p24 « RetryPolicy ») ───────────────────────────────

/**
 * Combien de fois, à quel rythme, et jusqu'où on réessaie. L'infrastructure
 * BullMQ savait déjà le faire ; ce qui manquait, c'est que le MÉTIER en décide —
 * un envoi d'e-mail ne se rejoue pas comme une lecture de registre.
 */
export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  /** Délai de base en secondes ; le runner applique un backoff exponentiel. */
  backoffSeconds: z.number().int().min(1).max(3600),
  /** Un pas non idempotent ne se rejoue JAMAIS tout seul après un `unknown`. */
  retryOnUnknown: z.boolean(),
})
export type RetryPolicy = z.infer<typeof retryPolicySchema>

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffSeconds: 30,
  retryOnUnknown: false,
}

// ── Réservation de crédits (p24) ─────────────────────────────────────────────

/**
 * Un crédit se réserve, puis se consomme ou se libère.
 *
 * Sans cet objet, deux comportements coexistaient : débiter d'abord (et rendre
 * la main sur un échec, en espérant que le remboursement passe) ou débiter à la
 * fin (et découvrir à l'arrivée que le solde était vide). La réservation rend le
 * solde exact À TOUT MOMENT — ce qui compte quand un run touche vingt contacts.
 */
export const creditReservationStateSchema = z.enum(['reserved', 'consumed', 'released', 'expired'])
export type CreditReservationState = z.infer<typeof creditReservationStateSchema>

export const creditReservationSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  userId: z.string().guid(),
  /** Ce que la réservation couvre : une analyse, un enrichissement. */
  kind: z.enum(['analysis', 'enrichment']),
  amount: z.number().int().min(1),
  state: creditReservationStateSchema,
  /** Le run ou l'action que cette réservation couvre. */
  reference: z.string().min(1),
  createdAt: z.string().datetime(),
  /** Au-delà, la réservation est libérée d'office : un run mort ne gèle pas un solde. */
  expiresAt: z.string().datetime(),
  settledAt: z.string().datetime().nullable(),
})
export type CreditReservation = z.infer<typeof creditReservationSchema>

// ── Pas de workflow (p29 « chaque étape contient… ») ─────────────────────────

/**
 * Un pas exécutable, déclaré en entier avant de partir.
 *
 * `expectedResult` n'est pas décoratif : c'est ce qu'on relit après coup pour
 * dire « fait » sans croire l'API sur parole (p30, « après chaque action,
 * vérifie le résultat externe lorsque l'API le permet »).
 */
export const workflowStepSchema = z.object({
  /** Identifiant du pas DANS sa définition — stable d'une version à l'autre. */
  key: z.string().min(1).max(64),
  intentType: actionIntentTypeSchema,
  /** Ce que le pas cherche à obtenir, en une phrase, pour la prévisualisation. */
  intent: z.string().min(1).max(300),
  /** Capacité requise (`crm`, `email`, `calendar`…) — pas le nom d'un éditeur. */
  capability: z.string().min(1).max(40),
  /** Permission nécessaire côté espace de travail (`contacts:write`…). */
  permission: z.string().min(1).max(60),
  /** Coût annoncé, en crédits Bellum. 0 = gratuit, jamais « inconnu ». */
  estimatedCredits: z.number().int().min(0),
  risk: actionRiskSchema,
  /** Famille sensible, quand le pas en relève — force le niveau d'approbation. */
  sensitiveFamily: sensitiveActionFamilySchema.optional(),
  /** Ce qu'on doit observer pour déclarer le pas réussi. */
  expectedResult: z.string().min(1).max(300),
  /** Pas dont celui-ci dépend (clés). Un cycle est refusé à l'enregistrement. */
  dependsOn: z.array(z.string().min(1).max(64)).default([]),
  retry: retryPolicySchema.default(DEFAULT_RETRY_POLICY),
})
export type WorkflowStep = z.infer<typeof workflowStepSchema>

// ── Déclencheur (p22) ────────────────────────────────────────────────────────

export const workflowTriggerSchema = z.enum([
  /** L'utilisateur lance le workflow depuis un écran. */
  'manual',
  /** Un signal frais est détecté sur un compte suivi. */
  'signal_detected',
  /** Un rendez-vous approche ou vient de se terminer. */
  'meeting_upcoming',
  /** Un compte suivi n'a plus d'activité depuis N jours. */
  'account_dormant',
  /** Une mission arrive à échéance. */
  'mission_ending',
  /** Un projet a été qualifié et cherche des experts. */
  'project_qualified',
  // Ajouté en FIN (GA-08) — #1931. Laura propose un geste DANS la conversation
  // (« je peux relancer X demain ? ») : le run existe dès la proposition, pas
  // seulement au clic, pour que la carte survive au rechargement (D1 du plan
  // lot 4 : `context.pending_actions` n'était stocké nulle part). Distinct de
  // `manual` — celui-là suppose un écran, pas un fil de discussion.
  'copilot_proposal',
  // Ajouté en FIN (GA-08) — #2276. Une demande complexe devenue un job composite
  // (`laura-job.ts`). Distinct de `copilot_proposal` : les lectures de CARTES
  // filtrent sur ce dernier, et un job n'est pas une carte.
  'laura_job',
])
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>

/** Texte affiché des deux côtés de l'app (règle i18n permanente FR+EN). */
export const localizedLabelSchema = z.object({ fr: z.string().min(1), en: z.string().min(1) })

export const workflowDefinitionSchema = z.object({
  /** Clé stable et lisible (`signal_to_account_opening`). */
  key: z.string().min(1).max(64),
  /** Version entière : une définition modifiée n'écrase jamais l'ancienne, elle
   *  en crée une nouvelle — un run en cours garde la sienne. */
  version: z.number().int().min(1),
  name: localizedLabelSchema,
  description: localizedLabelSchema,
  trigger: workflowTriggerSchema,
  /**
   * Niveau MINIMUM exigé par le workflow lui-même, quel que soit le contenu de
   * ses pas — un PLANCHER, jamais un plafond.
   *
   * ⚠️ Conséquence de la correction du 01/09/2026 : un `minimumLevel` en `n4` ou
   * `n5` n'ACCORDE rien. Ces deux niveaux n'exigent personne, donc en tant que
   * plancher ils sont neutres — le workflow dit « je n'ajoute aucune exigence de
   * mon côté », et ce sont les pas et la posture de l'espace qui tranchent.
   * Auparavant, un `minimumLevel: 'n4'` RELEVAIT le niveau du run au-dessus de
   * celui de ses propres pas ; c'est cette inversion qui laissait un envoi partir
   * seul. Un workflow qui doit tourner sans personne le peut toujours : il suffit
   * que ses pas soient internes et que l'espace soit en automatique borné.
   */
  minimumLevel: automationLevelSchema,
  steps: z.array(workflowStepSchema).min(1).max(20),
  /** Un workflow désactivé reste visible et documenté — il ne s'exécute plus. */
  enabled: z.boolean(),
})
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>

// ── Demande d'approbation (p24) ──────────────────────────────────────────────

export const approvalStateSchema = z.enum(['pending', 'approved', 'rejected', 'expired'])
export type ApprovalState = z.infer<typeof approvalStateSchema>

export const approvalRequestSchema = z.object({
  id: z.string().guid(),
  runId: z.string().guid(),
  /** Pas concerné, ou `null` quand l'approbation porte sur le run entier. */
  stepKey: z.string().max(64).nullable(),
  /** Niveau exigé : `n2` = l'auteur suffit, `n3` = un manager de l'espace. */
  requiredLevel: automationLevelSchema,
  state: approvalStateSchema,
  requestedBy: z.string().guid(),
  decidedBy: z.string().guid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  /** Ce qui sera fait si l'approbation est accordée — la prévisualisation figée. */
  summary: z.string().min(1).max(2000),
  estimatedCredits: z.number().int().min(0),
  /** Passé cette date, la demande expire : une approbation vieille de deux
   *  semaines ne dit plus rien du contexte qui l'a motivée. */
  expiresAt: z.string().datetime(),
  reason: z.string().max(1000).nullable(),
})
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>

// ── Exécution (p22, p32) ─────────────────────────────────────────────────────

export const workflowRunStatusSchema = z.enum([
  'planned',
  'awaiting_approval',
  'running',
  'done',
  'partial',
  'failed',
  'cancelled',
  // Ajoutés en FIN (GA-08), parce qu'il manquait deux vérités que `done` et
  // `failed` disaient à leur place :
  //
  // `blocked` — rien n'est parti. Aucun pas exécutable, ou tous sautés. Le geste
  // est de brancher un outil, pas de rejouer. C'est le cas que `done` masquait,
  // et il était produit PAR CONSTRUCTION : le contrôleur passe des capacités
  // vides, donc tout pas était bloqué et le run se déclarait terminé.
  //
  // `unknown` — la requête est peut-être partie. `dispatchFailureOutcome` porte
  // déjà cette distinction au niveau du PAS ; le niveau run l'annulait en
  // comptant `unknown` avec `failed`, ce qui invite à rejouer un envoi qui a
  // pu aboutir.
  'blocked',
  'unknown',
  // Ajoutés en FIN (GA-08) — #1931, la migration des cartes de chat vers Action
  // OS. Les neuf valeurs ci-dessus disaient déjà tout du cycle d'un run, sauf
  // deux choses qu'une carte peut vivre et qu'aucune ne nommait :
  //
  // `snoozed` — l'utilisateur a choisi « Plus tard » (#1931 : l'état « Reportée »).
  // Ce n'est ni `cancelled` (personne n'a refusé le geste) ni `awaiting_approval`
  // (la date n'est pas encore là) : c'est une carte VIVANTE, remise à une date
  // choisie. `snoozed_until` (migration `CopilotCardsOnWorkflowRuns`) porte cette
  // date ; l'approbation qui la rouvre relance son expiration de 3 jours.
  //
  // `superseded` — un fait plus récent a rendu la carte sans objet (« Obsolète »
  // dans #1931) avant qu'on l'ait ni exécutée ni refusée : le contact a déjà été
  // enrichi par un autre geste, le rendez-vous a été déplacé. La replier en
  // `cancelled` mentirait sur QUI a mis fin au run — personne n'a dit non, le
  // monde a changé sous la carte.
  'snoozed',
  'superseded',
  // Ajoutés en FIN (GA-08) — #2276.22 / #2276.23, le job composite de Laura
  // (`laura-job.ts`). Aucun des onze ne disait qu'une fiche existe AVANT toute
  // décision : `planned` veut dire « confirmé, en file » pour un job.
  //
  // `draft` — Laura a posé la fiche, mais il manque ce qui la rend confirmable
  // (le périmètre qu'elle a dû supposer). `to_confirm` — la fiche est complète,
  // son coût maximum est annoncé, et RIEN de payant ne part avant le clic.
  // `status` est un `text` sans CHECK (`1788270000000-ActionOs.ts`) : rien à
  // élargir côté SQL.
  'draft',
  'to_confirm',
])
export type WorkflowRunStatus = z.infer<typeof workflowRunStatusSchema>

export const workflowRunStepSchema = z.object({
  key: z.string().min(1).max(64),
  intentType: actionIntentTypeSchema,
  /**
   * #2201.43 — la CAPACITÉ du pas (`crm`, `email`, `calendar`…), jamais un
   * éditeur — recopiée de `workflowStepSchema.capability` au moment de
   * l'exécution. Optionnelle : un pas déjà persisté avant ce champ n'en porte
   * pas, et une trace qui ne la connaît pas ne nomme rien plutôt que d'inventer
   * une capacité.
   */
  capability: z.string().min(1).max(40).optional(),
  outcome: actionOutcomeSchema,
  /** Nombre de tentatives réellement effectuées (1 = pas de reprise). */
  attempts: z.number().int().min(0),
  /** Référence de l'objet créé côté outil, quand il y en a une. */
  externalRef: z.string().max(300).nullable(),
  /** Ce qui a été réellement débité — jamais l'estimation recopiée. */
  creditsSpent: z.number().int().min(0),
  reason: z.string().max(2000).nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})
export type WorkflowRunStep = z.infer<typeof workflowRunStepSchema>

export const workflowRunSchema = z.object({
  id: z.string().guid(),
  workspaceId: z.string().guid(),
  userId: z.string().guid(),
  definitionKey: z.string().min(1).max(64),
  definitionVersion: z.number().int().min(1),
  trigger: workflowTriggerSchema,
  status: workflowRunStatusSchema,
  accountId: z.string().guid().nullable(),
  contactId: z.string().guid().nullable(),
  /** Identifiant de corrélation partagé par tous les journaux du run. */
  correlationId: z.string().min(1).max(64),
  steps: z.array(workflowRunStepSchema),
  estimatedCredits: z.number().int().min(0),
  spentCredits: z.number().int().min(0),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})
export type WorkflowRun = z.infer<typeof workflowRunSchema>

// ── Plan (p29 « tu retournes trois listes ») ─────────────────────────────────

/**
 * Le plan produit AVANT toute exécution, en trois listes.
 *
 * Trois listes plutôt qu'une seule assortie de drapeaux, parce que ce sont trois
 * conversations différentes avec l'utilisateur : « je le fais », « approuve et je
 * le fais », « je ne peux pas, voici pourquoi ». Les fondre rend l'écran illisible
 * et laisse croire qu'un pas bloqué finira bien par passer.
 */
export const workflowPlannedStepSchema = z.object({
  step: workflowStepSchema,
  /** Cible résolue, rendue lisible (« Claire Dubois — ACME »). */
  target: z.string().min(1).max(300),
  /** Pourquoi ce pas est dans CETTE liste. Toujours renseigné. */
  rationale: z.string().min(1).max(500),
})
export type WorkflowPlannedStep = z.infer<typeof workflowPlannedStepSchema>

export const workflowBlockedStepSchema = workflowPlannedStepSchema.extend({
  /** Ce qu'il faudrait pour débloquer : une capacité à connecter, une donnée. */
  missing: z.string().min(1).max(300),
})
export type WorkflowBlockedStep = z.infer<typeof workflowBlockedStepSchema>

export const workflowActionPlanSchema = z.object({
  definitionKey: z.string().min(1).max(64),
  definitionVersion: z.number().int().min(1),
  executableNow: z.array(workflowPlannedStepSchema),
  approvalRequired: z.array(workflowPlannedStepSchema),
  blocked: z.array(workflowBlockedStepSchema),
  /** Somme des coûts annoncés des pas exécutables ET approuvables. */
  estimatedCredits: z.number().int().min(0),
  /** Le niveau requis par le pas le plus exigeant du plan. */
  requiredLevel: automationLevelSchema,
})
export type WorkflowActionPlan = z.infer<typeof workflowActionPlanSchema>

// ── Requêtes API ─────────────────────────────────────────────────────────────

export const planWorkflowRequestSchema = z.object({
  definitionKey: z.string().min(1).max(64),
  accountId: z.string().guid().optional(),
  contactId: z.string().guid().optional(),
  /** Intents supplémentaires proposés par le copilote pour ce run. */
  extraIntents: z.array(actionIntentSchema).max(20).optional(),
})
export type PlanWorkflowRequest = z.infer<typeof planWorkflowRequestSchema>

export const startWorkflowRequestSchema = planWorkflowRequestSchema.extend({
  /**
   * Clé d'idempotence fournie par l'appelant. Deux clics sur le même bouton
   * portent la même clé et ne produisent qu'un run — c'est la seule protection
   * qui tienne quand le réseau répond deux fois.
   */
  idempotencyKey: z.string().min(8).max(120),
})
export type StartWorkflowRequest = z.infer<typeof startWorkflowRequestSchema>

export const decideApprovalRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(1000).optional(),
})
export type DecideApprovalRequest = z.infer<typeof decideApprovalRequestSchema>

/**
 * #2864 — DÉLÉGUER une demande d'approbation à un collègue du MÊME espace.
 * `null` retire la délégation (la demande revient à son circuit d'origine).
 * L'appartenance à l'espace se vérifie côté serveur, jamais ici : le contrat
 * ne connaît pas les membres.
 */
export const assignApprovalRequestSchema = z.object({
  assigneeId: z.string().guid().nullable(),
})

/**
 * #2856 — REPORTER une demande d'approbation (une écriture CRM/ERP en attente).
 * Même patron que {@link snoozeCardRequestSchema}, au grain de la DEMANDE :
 * `until` daté = reportée jusqu'à cette date ; `null` = la réveiller tout de
 * suite. Le report ne décide rien : la demande reste `pending`, passe toujours
 * par la porte, et ne peut pas dépasser son expiration (vérifié côté serveur).
 */
export const snoozeApprovalRequestSchema = z.object({
  until: z.string().datetime().nullable(),
})

/**
 * Durée de validité d'une demande d'approbation — CONSTANTE UNIQUE (GA-26).
 *
 * #1931 : « geste de système = demande visible, prévisualisation FIGÉE,
 * expiration 3 jours » (doctrine, `CLAUDE.md`). Elle vivait comme un littéral
 * privé dans `workflow-runner.service.ts` ; une carte de copilote la relance à
 * l'identique quand elle sort de « Reportée » (`snoozed`), ce qui exigeait
 * qu'un DEUXIÈME endroit connaisse la même durée. Exportée ici, c'est
 * `workflow-runner.service.ts` qui l'importe désormais — jamais l'inverse.
 */
export const APPROVAL_TTL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Reporter une carte à une date CHOISIE — le défaut quand l'utilisateur n'en
 * choisit pas une (#1931, arbitrage Louis du 12/09 : « reporter = date
 * choisie, défaut demain 9 h »).
 *
 * Pure : `now` porte l'horloge ET le fuseau de l'appelant, jamais deviné ici.
 * L'heure locale importe — « demain 9 h » n'a pas le même instant UTC à Paris
 * et à Montréal, et un défaut qui l'ignorerait proposerait un report nocturne.
 */
export function defaultSnoozeUntil(now: Date): Date {
  const next = new Date(now)
  next.setDate(next.getDate() + 1)
  next.setHours(9, 0, 0, 0)
  return next
}

// ── Gestes sur une carte de copilote (#1931, #1943, #1959) ──────────────────

/**
 * Les six gestes qu'une carte de copilote peut recevoir, un clic à la fois.
 *
 * Chacun cible SA carte par l'URL (le `runId`, déjà porté par
 * `workflowRunSchema.id`) — aucun de ces corps ne répète d'identifiant, pour la
 * même raison que {@link ActionIntent} : un identifiant qui voyage dans le
 * corps est un identifiant qu'un appelant peut falsifier.
 */

/**
 * Confirmer — le clic EST la décision (doctrine : « geste d'utilisateur =
 * auto-approuvé »). Rien à transmettre au-delà de l'identité du run : un corps
 * vide est le signal qu'aucune donnée supplémentaire ne peut changer ce qui va
 * s'exécuter — la prévisualisation était déjà FIGÉE.
 */
export const confirmCardRequestSchema = z.object({}).strict()
export type ConfirmCardRequest = z.infer<typeof confirmCardRequestSchema>

/** Refuser — état persisté : approbation `rejected` + run `cancelled` (la carte reste visible, jamais supprimée). */
export const rejectCardRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
})
export type RejectCardRequest = z.infer<typeof rejectCardRequestSchema>

/**
 * Reporter — `until` absent = {@link defaultSnoozeUntil} calculé côté APPELANT
 * (jamais deviné dans le contrat, qui ne porte pas d'horloge). Présent, c'est
 * la date choisie qui prévaut toujours.
 */
export const snoozeCardRequestSchema = z.object({
  until: z.string().datetime().optional(),
})
export type SnoozeCardRequest = z.infer<typeof snoozeCardRequestSchema>

/**
 * Modifier — avant confirmation seulement (une carte `awaiting_review` ou
 * `prepared`, jamais une carte déjà `running`/`done`). Le patch reste un objet
 * ouvert ICI : chaque type de carte a ses propres champs modifiables
 * (`pendingChatActionSchema` les nomme tous), et les dupliquer dans un second
 * schéma générique romprait « un réglage vit à un seul endroit » (GA-26) le
 * jour où l'un des deux change sans l'autre. Valider le CONTENU du patch
 * contre le bon variant de carte est le geste de l'appelant (L2/L4).
 */
export const modifyCardRequestSchema = z.object({
  patch: z.record(z.string(), z.unknown()),
})
export type ModifyCardRequest = z.infer<typeof modifyCardRequestSchema>

/**
 * Réessayer — jamais offert sur `unknown` (doctrine : un timeout n'est pas un
 * échec, et rejouer un envoi peut-être déjà parti est pire que de ne rien
 * faire). C'est `cardStateOf` (`copilot-card.ts`) qui porte cette exclusion, pas
 * ce schéma — un corps de requête ne peut pas refuser d'exister selon l'état
 * du run qu'il cible.
 */
export const retryCardRequestSchema = z.object({}).strict()
export type RetryCardRequest = z.infer<typeof retryCardRequestSchema>

/**
 * #2865 — Relancer un run MULTI-PAS (`WorkflowRunnerService`), depuis le pas en
 * échec — jamais un pas déjà réussi, qui a peut-être déjà écrit. Corps vide,
 * comme {@link retryCardRequestSchema} : c'est le statut PERSISTÉ du run et
 * l'issue de son prochain pas qui décident si la relance est possible, jamais
 * un paramètre que l'appelant choisirait.
 */
export const retryWorkflowRunRequestSchema = z.object({}).strict()
export type RetryWorkflowRunRequest = z.infer<typeof retryWorkflowRunRequestSchema>

/** Annuler — un run déjà `running` (#1959 : « bouton annuler lorsque possible »). */
export const cancelCardRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
})
export type CancelCardRequest = z.infer<typeof cancelCardRequestSchema>

/**
 * #4016 L6 — « SANS PLAFOND », la valeur la plus haute qu'un seuil peut prendre.
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026, épopée #4016, lot L6) : les seuils
 * de volume et de dépense étaient bornés à 1 000 cibles et 10 000 crédits ; ils
 * se règlent désormais « jusqu'à l'infini » par l'admin. L'infini s'écrit avec
 * la plus grande valeur que la colonne `integer` de `workspaces` sait porter
 * (2^31 - 1) : aucun run n'atteint ce nombre de cibles ni de crédits, et la
 * valeur reste un entier qu'on lit, jamais un `null` — qui veut déjà dire
 * « suit le défaut produit » en base — ni un `0` — qui se lirait « zéro ».
 * L'écran l'affiche « Sans plafond ».
 */
export const APPROVAL_THRESHOLD_UNBOUNDED = 2_147_483_647

const approvalThresholdSchema = z.number().int().min(1).max(APPROVAL_THRESHOLD_UNBOUNDED)

/** Réglages d'approbation d'un espace de travail (p25, défaut décidé 02/08). */
export const approvalSettingsSchema = z.object({
  /** Niveau appliqué aux actions ordinaires (email, écriture CRM, rappel). */
  defaultLevel: automationLevelSchema,
  /** Au-delà de ce nombre de cibles, un run passe en approbation manager. */
  bulkThreshold: approvalThresholdSchema,
  /** Au-delà de ce coût en crédits, un run passe en approbation manager. */
  spendThreshold: approvalThresholdSchema,
})
export type ApprovalSettings = z.infer<typeof approvalSettingsSchema>

/**
 * #4016 L6 — les postures qu'un ADMIN peut poser sur son espace. `n0`/`n1` n'en
 * sont pas (`approval-policy.ts`, `WORKSPACE_POSTURES` : rien ne saurait tenir
 * leur promesse « rien ne s'écrit »).
 */
export const WORKSPACE_APPROVAL_POSTURES = [
  'n2_user_approval',
  'n3_manager_approval',
  'n4_bounded_auto',
  'n5_extended_auto',
] as const satisfies readonly AutomationLevel[]

/**
 * #4016 L6 — `PUT /action-os/approval-settings` : chaque champ est optionnel, et
 * `null` RETIRE le réglage (l'espace revient au défaut produit) — jamais un 0.
 */
export const updateApprovalSettingsSchema = z
  .object({
    defaultLevel: z.enum(WORKSPACE_APPROVAL_POSTURES).nullable().optional(),
    bulkThreshold: approvalThresholdSchema.nullable().optional(),
    spendThreshold: approvalThresholdSchema.nullable().optional(),
  })
  .strict()
export type UpdateApprovalSettings = z.infer<typeof updateApprovalSettingsSchema>

/** #4016 L6 — `GET /action-os/approval-settings` : les réglages EFFECTIFS, et lesquels l'espace a posés. */
export const approvalSettingsViewSchema = approvalSettingsSchema.extend({
  /** Les champs que l'espace a réglés lui-même — les autres suivent le défaut produit. */
  customised: z.array(z.enum(['defaultLevel', 'bulkThreshold', 'spendThreshold'])),
  /** L'appelant peut-il modifier ces réglages (`team:manage`) ? */
  canEdit: z.boolean(),
})
export type ApprovalSettingsView = z.infer<typeof approvalSettingsViewSchema>

/**
 * Défauts d'un espace neuf : un clic pour l'ordinaire, un manager au-delà de
 * dix cibles ou de vingt crédits. Ces deux seuils sont le garde-fou que le
 * rapport (p25) juge non négociable — un envoi en masse ne doit jamais tenir
 * sur le seul clic de son auteur.
 */
export const DEFAULT_APPROVAL_SETTINGS: ApprovalSettings = {
  defaultLevel: 'n2_user_approval',
  bulkThreshold: 10,
  spendThreshold: 20,
}

/**
 * LA TRAÇABILITÉ D'UNE EXÉCUTION — #1498.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE RETOUR DEMANDE, ET CE QUI MANQUAIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Chaque action importante doit permettre de comprendre : qui l'a déclenchée,
 * qui l'a validée, depuis quel objet, via quel outil, quel résultat a réellement
 * été confirmé. »*
 *
 * ⚠️ Les cinq réponses étaient DÉJÀ EN BASE — `workflow_runs.user_id` et
 * `.trigger`, `action_approvals.decided_by` et `.decided_at`, `.account_id`,
 * et l'issue de chaque pas. Aucune n'arrivait jusqu'à l'écran : la vue des runs
 * rendait l'entité telle quelle, et l'entité ne porte que des identifiants. Ce
 * n'est donc pas une donnée qui manquait, c'est un CHEMIN — le défaut n°1 de ce
 * dépôt.
 *
 * ⚠️ Un nom absent reste `null`. Un profil supprimé, un compte anonymisé, une
 * exécution déclenchée par une routine : l'écran écrit alors ce qu'il sait
 * (« déclenchée automatiquement ») et jamais un nom de remplissage.
 */
export const runTraceSchema = z.object({
  /** Le déclencheur — `manual`, `schedule`, `event`… tel que la base le porte. */
  trigger: z.string(),
  /** Qui a lancé l'exécution. `null` quand le profil n'est plus lisible. */
  triggeredByName: z.string().nullable(),
  /**
   * Qui a validé, et quand. `null` quand aucune approbation n'a été requise —
   * ce qui n'est PAS la même chose que « personne n'a validé » : un pas
   * auto-approuvé n'a jamais demandé de décision, et l'écran le dit ainsi.
   */
  approvedByName: z.string().nullable(),
  approvedAt: z.string().nullable(),
  /** Depuis quel objet — le nom du compte visé, quand il y en a un. */
  accountName: z.string().nullable(),
})
export type RunTrace = z.infer<typeof runTraceSchema>
