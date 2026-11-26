import { z } from 'zod'
import { userAutonomyBand, userAutonomyBandSchema, type AutomationLevel, type UserAutonomyBand } from './action-os.js'

/**
 * Le compte rendu de rendez-vous (§5.3 et §7.2 du rapport besoins).
 *
 * Toutes les listes peuvent être VIDES, et c'est un état valable. Un compte
 * rendu qui invente trois décisions parce que le schéma en attend trois est pire
 * qu'un compte rendu court : il fait porter à quelqu'un un engagement qu'il n'a
 * pas pris, et il circule.
 */

// ── L'extrait qui justifie une sortie (§ « Après » de la spec Meeting OS) ─────

/**
 * D'où vient CE qui est écrit.
 *
 * **Sans ce champ, les neuf sorties de la cascade sont indiscernables d'une
 * hallucination bien présentée.** C'est lui, et lui seul, qui distingue « le
 * client a dit ça » de « le modèle le pense ». Le type est une union
 * DISCRIMINÉE plutôt qu'un `excerpt?: string` : un extrait vide ne peut donc
 * pas se faire passer pour un extrait, il n'a pas de forme où loger.
 *
 * Deux cas, et deux seulement :
 *
 * - `transcript` — la phrase est dans le transcript, citée telle quelle.
 * - `notes-derived` — l'entrée était des notes dictées ou tapées, pas un
 *   transcript : il n'y a aucune phrase à citer, et le dire vaut mieux que
 *   recopier la note en la présentant comme une citation.
 *
 * Il n'y a pas de troisième cas. Une sortie sans extrait n'est pas « sourcée
 * autrement » : elle est écartée par {@link buildMeetingCascade}, et le nombre
 * d'écartées est ANNONCÉ — jamais absorbé en silence.
 */
export const meetingEvidenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('transcript'),
    /** La phrase, telle qu'elle a été prononcée. Jamais reformulée. */
    excerpt: z.string().trim().min(1).max(500),
  }),
  z.object({ kind: z.literal('notes-derived') }),
  /**
   * #2319.63 — l'objet vient de la DÉCLARATION de l'utilisateur, saisie à part
   * des notes : ce que le commercial affirme, pas ce que le client a dit. Une
   * déclaration ne confirme jamais à elle seule un projet du client (voir
   * {@link opportunityIsConfirmed}).
   */
  z.object({ kind: z.literal('user-statement') }),
])
export type MeetingEvidence = z.infer<typeof meetingEvidenceSchema>

// ── Les entrées (#2319.61-.63) ──────────────────────────────────────────────

/**
 * #2319.61-.62 — la NATURE du texte principal. Un compte rendu importé et un
 * e-mail sont des textes COLLÉS par l'utilisateur : le produit ne lit jamais la
 * boîte pour les trouver (D58, D65 — le corps d'un message ne sort pas vers le
 * modèle sans ce geste).
 */
export const MEETING_NOTES_INPUT_KINDS = ['notes', 'transcript', 'imported_report', 'email'] as const
export const meetingNotesInputKindSchema = z.enum(MEETING_NOTES_INPUT_KINDS)
export type MeetingNotesInputKind = (typeof MEETING_NOTES_INPUT_KINDS)[number]

/**
 * Le texte porte-t-il des phrases CITABLES telles quelles ? Des notes prises à
 * la main n'en portent pas : exiger une citation reviendrait à en faire
 * fabriquer une.
 */
export function isCitableMeetingInput(kind: MeetingNotesInputKind): boolean {
  return kind !== 'notes'
}

// ── Les objets de la partie APRÈS ────────────────────────────────────────────

export const meetingNextStepSchema = z.object({
  action: z.string(),
  /** Vide quand la réunion ne l'a pas dit — jamais deviné. */
  owner: z.string(),
  /** L'échéance telle qu'elle a été énoncée. Vide plutôt qu'une date fabriquée. */
  due: z.string(),
  /**
   * `null` accepté pour les comptes rendus produits AVANT que la source soit
   * exigée. Une action sans extrait ne s'affiche pas comme extraite : la
   * cascade l'écarte et le compte.
   */
  evidence: meetingEvidenceSchema.nullable().default(null),
})

/** Sortie 2 — une opportunité candidate. Elle reste un BROUILLON jusqu'au GO. */
export const meetingOpportunitySchema = z.object({
  /** Ce qui est cherché, dans les mots du client. */
  title: z.string().trim().min(1).max(200),
  /** Le compte concerné, quand la réunion l'a nommé. Vide sinon. */
  accountName: z.string().max(200).default(''),
  /**
   * #2319.82 — « Projet à qualifier » tant que la preuve est insuffisante.
   * Le défaut est la prudence : une discussion exploratoire ne devient pas une
   * opportunité confirmée parce qu'un champ manquait.
   */
  qualification: z.enum(['confirmed', 'to_qualify']).default('to_qualify'),
  evidence: meetingEvidenceSchema,
})
export type MeetingOpportunity = z.infer<typeof meetingOpportunitySchema>

/** Sortie 3 — un besoin exprimé. Il passe par un GO/NO-GO, pas par un `create`. */
export const meetingNeedSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Profil, compétences, volume — tels qu'énoncés. Vide plutôt qu'inventé. */
  detail: z.string().max(1000).default(''),
  /** #2319.82 — « Besoin potentiel » tant que le client ne l'a pas exprimé. */
  qualification: z.enum(['expressed', 'potential']).default('potential'),
  evidence: meetingEvidenceSchema,
})
export type MeetingNeed = z.infer<typeof meetingNeedSchema>

/**
 * #2103.10 (épopée #2878) — un PROBLÈME décrit par le client, DISTINCT d'un
 * besoin de staffing (`meetingNeedSchema`). Le client peut décrire une
 * difficulté opérationnelle, organisationnelle ou technique sans qu'aucun
 * besoin de prestataire externe n'ait été énoncé — les deux sorties
 * coexistent, l'une n'implique pas l'autre.
 */
export const meetingClientIssueSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** Contexte ou impact du problème, tel qu'énoncé. Vide plutôt qu'inventé. */
  detail: z.string().max(1000).default(''),
  evidence: meetingEvidenceSchema,
})
export type MeetingClientIssue = z.infer<typeof meetingClientIssueSchema>

/**
 * Sortie 4 — une personne citée pendant le rendez-vous.
 *
 * ⚠️ Aucun critère protégé n'entre ici, et il n'y a rien à classer : cette
 * liste n'ordonne personne, elle rapporte qui a été nommé. Le rôle est celui
 * qui a été DIT ; vide sinon.
 */
export const meetingMentionedContactSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  role: z.string().max(160).default(''),
  evidence: meetingEvidenceSchema,
})
export type MeetingMentionedContact = z.infer<typeof meetingMentionedContactSchema>

/** Sortie 7 — le stade CRM PROPOSÉ. Proposé : rien n'est déplacé sans le GO. */
export const meetingCrmStageSchema = z.object({
  /** Le stade suggéré, dans le vocabulaire de l'espace. */
  proposedStage: z.string().trim().min(1).max(120),
  /** Pourquoi ce stade — une phrase, tirée de ce qui s'est dit. */
  rationale: z.string().max(500).default(''),
  evidence: meetingEvidenceSchema,
})
export type MeetingCrmStage = z.infer<typeof meetingCrmStageSchema>

/**
 * Sortie 8 — la relance, en brouillon PLANIFIÉ.
 *
 * `dueLabel` est l'échéance telle qu'elle a été convenue (« dans dix jours »,
 * « après leur comité »). Vide quand la réunion ne l'a pas dite : le produit
 * ne fabrique pas un « J+10 » pour remplir la carte.
 */
export const meetingReminderSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  dueLabel: z.string().max(120).default(''),
  evidence: meetingEvidenceSchema,
})
export type MeetingReminder = z.infer<typeof meetingReminderSchema>

/**
 * #2777 — les deux natures d'un apprentissage. Partagé avec la contrainte SQL
 * `account_memory_kind_check` (GA-12) et le corps d'écriture de
 * `MeetingNotesService` : un seul endroit pour la liste (GA-26).
 */
export const ACCOUNT_MEMORY_KINDS = ['objection', 'commitment'] as const
export type AccountMemoryKind = (typeof ACCOUNT_MEMORY_KINDS)[number]

/** Sortie 9 — une objection entendue, ou un engagement pris. Mémoire du compte. */
export const meetingLearningSchema = z.object({
  kind: z.enum(ACCOUNT_MEMORY_KINDS),
  content: z.string().trim().min(1).max(1000),
  evidence: meetingEvidenceSchema,
})
export type MeetingLearning = z.infer<typeof meetingLearningSchema>

/**
 * #2319.64-.74 — un objet extrait SÉPARÉMENT (fait, demande, critère,
 * engagement), avec sa source. Sans source, il n'a pas de forme où loger.
 */
export const meetingExtractedItemSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  evidence: meetingEvidenceSchema,
})
export type MeetingExtractedItem = z.infer<typeof meetingExtractedItemSchema>

/**
 * #2319.71 — une date citée. `when` est l'échéance TELLE QU'ÉNONCÉE (« fin
 * octobre ») : le produit ne la convertit pas en jour, il ne l'invente pas.
 */
export const meetingDateSchema = z.object({
  label: z.string().trim().min(1).max(300),
  when: z.string().trim().min(1).max(120),
  evidence: meetingEvidenceSchema,
})
export type MeetingDate = z.infer<typeof meetingDateSchema>

/**
 * Ce que la cascade a réellement lu.
 *
 * `detail` porte ce qu'on SAIT (« 46 min »), pas ce qu'on suppose : une durée
 * absente reste vide, elle ne devient pas « 0 min ».
 */
export const meetingSourceSchema = z.object({
  // #2319.61-.63 — en FIN : un compte rendu importé, un e-mail collé, la
  // déclaration de l'utilisateur.
  kind: z.enum(['transcript', 'notes', 'crm', 'calendar', 'imported_report', 'email', 'user_statement']),
  detail: z.string().max(120).default(''),
})
export type MeetingSource = z.infer<typeof meetingSourceSchema>

// ── Le compte rendu ──────────────────────────────────────────────────────────

/**
 * Le compte rendu complet : les six champs d'origine, plus la partie APRÈS.
 *
 * Les six premiers ne bougent pas d'un caractère — deux des neuf sorties
 * existaient déjà et n'avaient pas à être reconstruites. Tout ce qui est ajouté
 * porte un `.default()`, donc un compte rendu écrit avant ce chantier se relit
 * sans migration et sans mensonge : ses champs neufs valent « rien de connu »,
 * pas « zéro ».
 */
export const meetingRecapSchema = z.object({
  summary: z.string(),
  decisions: z.array(z.string()),
  nextSteps: z.array(meetingNextStepSchema),
  openQuestions: z.array(z.string()),
  signals: z.array(z.string()),
  followUpEmail: z.string(),

  // ── La partie APRÈS ────────────────────────────────────────────────────────
  opportunity: meetingOpportunitySchema.nullable().default(null),
  need: meetingNeedSchema.nullable().default(null),
  /** #2103.10 — distinct de `need` : un problème client n'est pas un besoin de staffing. */
  clientIssue: meetingClientIssueSchema.nullable().default(null),
  mentionedContacts: z.array(meetingMentionedContactSchema).default([]),
  crmStage: meetingCrmStageSchema.nullable().default(null),
  reminder: meetingReminderSchema.nullable().default(null),
  learnings: z.array(meetingLearningSchema).default([]),

  // ── #2319.64-.74 — les extractions SÉPARÉES ────────────────────────────────
  // Chacune a sa liste : un fait n'est pas une demande, et l'engagement du
  // client n'est pas celui du commercial. ⚠️ Aucun champ `budget` ni `mission`
  // (#2319.79 / .81) : un montant n'existe ici que CITÉ, dans `criteria`, et
  // une mission ne se crée pas depuis un compte rendu.
  facts: z.array(meetingExtractedItemSchema).default([]),
  requests: z.array(meetingExtractedItemSchema).default([]),
  criteria: z.array(meetingExtractedItemSchema).default([]),
  dates: z.array(meetingDateSchema).default([]),
  clientCommitments: z.array(meetingExtractedItemSchema).default([]),
  userCommitments: z.array(meetingExtractedItemSchema).default([]),

  /**
   * L'extrait du compte rendu lui-même (sortie 1) et celui du mail (sortie 6).
   *
   * Deux champs à part plutôt qu'un `{ content, evidence }` : `summary` et
   * `followUpEmail` sont des `string` lus par du code déjà en production, et
   * changer leur type pour loger un extrait aurait cassé des appelants sans
   * rien apporter au sourçage.
   */
  recapEvidence: meetingEvidenceSchema.nullable().default(null),
  followUpEvidence: meetingEvidenceSchema.nullable().default(null),

  /** Ce que la cascade a lu pour produire tout ça. */
  sources: z.array(meetingSourceSchema).default([]),

  /**
   * #2103.37 — l'id du RENDEZ-VOUS SOURCE, quand ce compte rendu en vient un.
   *
   * Toutes les sorties de la cascade (résumé, tâches, brouillon, stade CRM…)
   * sont DÉRIVÉES de ce même compte rendu (`buildMeetingCascade`) : le
   * rattacher une fois ici les rattache toutes, sans le répéter sur chacune
   * (GA-26 — un réglage vit à un seul endroit). Transmis par le client
   * (`agendaEventSchema.id`, jamais deviné côté serveur) ; `null` quand le
   * compte rendu ne vient pas d'un rendez-vous précis (notes libres,
   * démonstration).
   */
  sourceEventId: z.string().nullable().default(null),

  /**
   * Le coût annoncé, en crédits — ou `null` quand il n'est pas chiffrable.
   *
   * `null` n'est pas `0`. Un « 0 crédit » affiché parce qu'on n'a pas su
   * calculer se lit comme une gratuité promise ; ce champ dit « on ne l'a pas
   * chiffré » et l'écran l'écrit tel quel.
   */
  estimatedCredits: z.number().int().min(0).nullable().default(null),
})

export type MeetingRecap = z.infer<typeof meetingRecapSchema>
export type MeetingNextStep = z.infer<typeof meetingNextStepSchema>

/** État du service de transcription. Sans clé, la capacité est déclarée à
 *  `false` et l'écran le dit — plutôt que d'échouer au clic. */
export const transcriptionStatusSchema = z.object({ available: z.boolean() })

export type TranscriptionStatus = z.infer<typeof transcriptionStatusSchema>

// ── La cascade : les neuf sorties, et ce qui les sépare ──────────────────────

/**
 * Les sorties qui ÉCRIVENT EN INTERNE. Sept, et sept seulement.
 *
 * ⚠️ **C'est ici que la promesse « aucune action externe envoyée » est TENUE,
 * et elle l'est en retirant le MOYEN, pas la permission.** Le mail de suivi et
 * la relance ne figurent pas dans cette énumération : une requête de validation
 * en lot ne peut donc pas les NOMMER — ni au compilateur, ni à Zod, ni à
 * l'exécution. Il n'y a pas de drapeau `skipExternal` à oublier de cocher, pas
 * de `if` à contourner : la forme même de la demande n'a pas de case où les
 * mettre.
 */
export const meetingInternalOutputKindSchema = z.enum([
  'recap',
  'opportunity',
  'need',
  'contacts',
  'next_steps',
  'crm_stage',
  'learnings',
  /** #2103.10 — un problème client s'écrit en interne, il ne part nulle part. */
  'client_issue',
])
export type MeetingInternalOutputKind = z.infer<typeof meetingInternalOutputKindSchema>

/**
 * Les sorties qui touchent l'EXTÉRIEUR. Deux brouillons, et rien d'autre.
 *
 * Elles s'approuvent une par une — il n'existe volontairement aucun schéma qui
 * en accepte une LISTE. « Approuver deux messages d'un clic » n'a pas de forme
 * dans ce contrat.
 */
export const meetingExternalOutputKindSchema = z.enum(['follow_up_email', 'reminder'])
export type MeetingExternalOutputKind = z.infer<typeof meetingExternalOutputKindSchema>

/**
 * Les sorties de l'écran, dans leur ordre. Neuf à l'origine (spec Meeting OS,
 * § « Après ») ; `client_issue` (#2103.10) s'AJOUTE en dixième et dernière
 * position plutôt que de s'insérer près de `need` — un ajout en fin de liste
 * ne déplace aucune position existante.
 */
export const meetingOutputKindSchema = z.enum([
  'recap',
  'opportunity',
  'need',
  'contacts',
  'next_steps',
  'follow_up_email',
  'crm_stage',
  'reminder',
  'learnings',
  'client_issue',
])
export type MeetingOutputKind = z.infer<typeof meetingOutputKindSchema>

/** L'ordre de l'écran, figé. `position` s'y LIT, elle ne se saisit pas. */
const MEETING_OUTPUT_ORDER: readonly MeetingOutputKind[] = meetingOutputKindSchema.options

/**
 * Le niveau TECHNIQUE de chaque sortie (N0-N5).
 *
 * ⚠️ C'est LUI qui décide. La puce A0-A3 de la carte s'en DÉDUIT, elle ne se
 * saisit pas à la main — sinon les deux vocabulaires divergeraient au premier
 * ajout de sortie.
 *
 * Le mail et la relance sont `n1_prepare` : le copilote les PRÉPARE, il ne les
 * envoie pas. Ils portent quand même la puce `a3`, parce que leur DESTINATION
 * est extérieure — et c'est cette bande qui les sort du lot.
 */
export const MEETING_OUTPUT_AUTOMATION_LEVEL: Readonly<Record<MeetingOutputKind, AutomationLevel>> = {
  recap: 'n1_prepare',
  opportunity: 'n2_user_approval',
  need: 'n2_user_approval',
  contacts: 'n2_user_approval',
  next_steps: 'n2_user_approval',
  follow_up_email: 'n1_prepare',
  crm_stage: 'n2_user_approval',
  reminder: 'n1_prepare',
  learnings: 'n4_bounded_auto',
  client_issue: 'n2_user_approval',
}

/**
 * L'état affiché sous le titre d'une carte.
 *
 * `dated_and_owned` et `partially_dated` sont deux états DIFFÉRENTS, et c'est
 * délibéré : la maquette écrit « Datés et assignés » sous les next steps, mais
 * la doctrine du produit laisse propriétaire et échéance VIDES quand la réunion
 * ne les a pas dits. Écrire « datés et assignés » sur des actions sans date
 * serait un chiffre inventé à l'écran, en toutes lettres.
 */
export const meetingCardStateSchema = z.enum([
  'to_validate',
  'draft',
  'draft_go_no_go',
  'to_confirm',
  'dated_and_owned',
  'partially_dated',
  'separate_draft',
  'stage_proposed',
  'scheduled_draft',
  'account_memory',
  /** #2319.82 — « Projet à qualifier » : la preuve ne suffit pas à confirmer. */
  'to_qualify',
  /** #2319.82 — « Besoin potentiel » : le client ne l'a pas exprimé. */
  'potential_need',
])
export type MeetingCardState = z.infer<typeof meetingCardStateSchema>

export const meetingCascadeCardSchema = z.object({
  kind: meetingOutputKindSchema,
  /** Rang affiché, 1 à 10. Stable : la cascade se lit toujours dans le même ordre. */
  position: z.number().int().min(1).max(10),
  /** La puce. DÉRIVÉE du niveau technique — jamais saisie. */
  band: userAutonomyBandSchema,
  state: meetingCardStateSchema,
  /** Combien d'objets la sortie porte. Une carte sans objet n'existe pas. */
  itemCount: z.number().int().min(1),
  /**
   * Une source par objet porté. L'écran montre la première ; les autres
   * restent lisibles à l'ouverture de la carte. Jamais vide : une carte sans
   * source n'est pas produite.
   */
  evidence: z.array(meetingEvidenceSchema).min(1),
  /** La sortie touche-t-elle une personne ou un système extérieur ? */
  reachesOutside: z.boolean(),
})
export type MeetingCascadeCard = z.infer<typeof meetingCascadeCardSchema>

export const meetingCascadeSummarySchema = z.object({
  /** Ce que la validation en lot écrira, par famille et par nombre d'objets. */
  internalWrites: z.array(z.object({ kind: meetingInternalOutputKindSchema, count: z.number().int().min(1) })),
  /** Les brouillons qui restent SÉPARÉS. Jamais dans le lot. */
  externalDrafts: z.array(meetingExternalOutputKindSchema),
  /** Voir {@link meetingRecapSchema}.estimatedCredits : `null` n'est pas `0`. */
  estimatedCredits: z.number().int().min(0).nullable(),
  sources: z.array(meetingSourceSchema),
  /**
   * Combien de sorties ont été ÉCARTÉES faute de source.
   *
   * Annoncé plutôt qu'absorbé : une cascade qui perd trois actions en silence
   * donne exactement la même impression qu'une réunion qui n'en portait que
   * six. Le nombre est là pour que la différence se voie.
   */
  droppedWithoutEvidence: z.number().int().min(0),
})

export const meetingCascadeSchema = z.object({
  cards: z.array(meetingCascadeCardSchema),
  summary: meetingCascadeSummarySchema,
})
export type MeetingCascade = z.infer<typeof meetingCascadeSchema>

/**
 * #3758 — L'INSTANTANÉ qu'une approbation de `recap` enregistre, EN PLUS du
 * texte (`body`) : les décisions, les prochaines étapes et la relance telles
 * que la cascade les a dérivées CE jour-là. C'est lui que la carte
 * `post_meeting_summary` de Laura relit — jamais le texte libre du modèle,
 * jamais reconstruit après coup par une seconde analyse.
 */
export const meetingRecapSnapshotSchema = z.object({
  decisions: z.array(z.string()),
  nextSteps: z.array(meetingNextStepSchema),
  reminder: meetingReminderSchema.nullable(),
})
export type MeetingRecapSnapshot = z.infer<typeof meetingRecapSnapshotSchema>

/**
 * Ce qu'une approbation de `recap` doit envoyer à l'API — à UN seul endroit
 * (GA-26).
 *
 * Avant ce helper, `MeetingNotesCard` et `NoteCascadeProposal` composaient
 * chacun le même `body` (résumé + décisions) séparément : exactement le motif
 * que GA-26 existe pour fermer — un troisième champ ajouté là-bas aurait pu
 * diverger entre les deux écrans sans qu'aucun test ne le voie. L'instantané
 * structuré (#3758) est `null` plutôt qu'un objet vide : une réunion sans
 * décision, sans prochaine étape et sans relance n'a rien à enregistrer, et un
 * instantané vide se lirait comme « rien n'a été retenu » au lieu de « rien
 * n'a été dit ».
 */
export function meetingRecapApprovalInput(
  recap: MeetingRecap,
  accountId: string,
): { accountId: string; body: string; snapshot: MeetingRecapSnapshot | null } {
  const body = [recap.summary.trim(), ...recap.decisions].filter(Boolean).join('\n\n')
  const hasSnapshot = recap.decisions.length > 0 || recap.nextSteps.length > 0 || recap.reminder !== null
  return {
    accountId,
    body,
    snapshot: hasSnapshot ? { decisions: recap.decisions, nextSteps: recap.nextSteps, reminder: recap.reminder } : null,
  }
}

/**
 * #2319.82 — une opportunité n'est CONFIRMÉE que si le modèle l'a dite telle ET
 * que sa preuve vient de la réunion. La seule déclaration de l'utilisateur ne
 * confirme pas le projet d'un client.
 */
export function opportunityIsConfirmed(opportunity: MeetingOpportunity): boolean {
  return opportunity.qualification === 'confirmed' && opportunity.evidence.kind !== 'user-statement'
}

/** #2319.82 — même règle pour un besoin : exprimé, et prouvé par la réunion. */
export function needIsExpressed(need: MeetingNeed): boolean {
  return need.qualification === 'expressed' && need.evidence.kind !== 'user-statement'
}

/** `a3` ⇔ la sortie est externe. Une seule table, lue dans les deux sens. */
function reachesOutside(kind: MeetingOutputKind): boolean {
  return meetingExternalOutputKindSchema.safeParse(kind).success
}

/**
 * La puce d'une sortie.
 *
 * Elle ne se saisit nulle part : elle passe par {@link userAutonomyBand}, la
 * dérivation de A depuis N, qui vit dans `action-os.ts` et à cet endroit-là
 * uniquement (GA-26). Ce fichier n'a AUCUNE table A0-A3 à lui.
 */
export function meetingOutputBand(kind: MeetingOutputKind): UserAutonomyBand {
  return userAutonomyBand({
    level: MEETING_OUTPUT_AUTOMATION_LEVEL[kind],
    reachesOutside: reachesOutside(kind),
  })
}

/**
 * Des neuf sorties du compte rendu aux cartes de l'écran.
 *
 * **La règle qui porte toute la fonction : une sortie sans extrait ne
 * s'affiche pas comme extraite.** Elle est retirée, et comptée dans
 * `droppedWithoutEvidence`. C'est la seule façon de faire tenir ensemble « on
 * n'invente pas » et « on ne perd rien en silence ».
 *
 * La dérivation vit ICI, à un seul endroit : l'écran, la démonstration et les
 * tests lisent la même. Deux chemins qui la referaient divergeraient au premier
 * ajout de sortie.
 */
export function buildMeetingCascade(recap: MeetingRecap): MeetingCascade {
  const cards: MeetingCascadeCard[] = []
  let dropped = 0

  const push = (
    kind: MeetingOutputKind,
    state: MeetingCardState,
    evidence: readonly (MeetingEvidence | null)[],
  ): void => {
    const sourced = evidence.filter((item): item is MeetingEvidence => item !== null)
    dropped += evidence.length - sourced.length
    if (sourced.length === 0) return
    cards.push({
      kind,
      position: MEETING_OUTPUT_ORDER.indexOf(kind) + 1,
      band: meetingOutputBand(kind),
      state,
      itemCount: sourced.length,
      evidence: sourced,
      reachesOutside: reachesOutside(kind),
    })
  }

  // 1 — le compte rendu structuré.
  if (recap.summary.trim() || recap.decisions.length > 0) {
    push('recap', 'to_validate', [recap.recapEvidence])
  }
  // 2 — l'opportunité détectée.
  // #2319.82 — « Projet à qualifier » tant que la preuve ne suffit pas.
  if (recap.opportunity) {
    push('opportunity', opportunityIsConfirmed(recap.opportunity) ? 'draft' : 'to_qualify', [
      recap.opportunity.evidence,
    ])
  }
  // 3 — le besoin exprimé. #2319.82 — « Besoin potentiel » sinon.
  if (recap.need) {
    push('need', needIsExpressed(recap.need) ? 'draft_go_no_go' : 'potential_need', [recap.need.evidence])
  }
  // 4 — les personnes citées.
  if (recap.mentionedContacts.length > 0) {
    push(
      'contacts',
      'to_confirm',
      recap.mentionedContacts.map(contact => contact.evidence),
    )
  }
  // 5 — les prochaines étapes. L'état DIT si elles sont réellement datées.
  if (recap.nextSteps.length > 0) {
    const allDatedAndOwned = recap.nextSteps.every(step => step.owner.trim() !== '' && step.due.trim() !== '')
    push(
      'next_steps',
      allDatedAndOwned ? 'dated_and_owned' : 'partially_dated',
      recap.nextSteps.map(step => step.evidence),
    )
  }
  // 6 — le mail de suivi. Brouillon SÉPARÉ : il ne rejoint jamais le lot.
  if (recap.followUpEmail.trim()) push('follow_up_email', 'separate_draft', [recap.followUpEvidence])
  // 7 — le stade CRM proposé.
  if (recap.crmStage) push('crm_stage', 'stage_proposed', [recap.crmStage.evidence])
  // 8 — la relance. Brouillon SÉPARÉ, lui aussi.
  if (recap.reminder) push('reminder', 'scheduled_draft', [recap.reminder.evidence])
  // 9 — objections et engagements, mémoire du compte.
  if (recap.learnings.length > 0) {
    push(
      'learnings',
      'account_memory',
      recap.learnings.map(learning => learning.evidence),
    )
  }
  // 10 — #2103.10 : le problème client, distinct du besoin de staffing.
  if (recap.clientIssue) push('client_issue', 'to_confirm', [recap.clientIssue.evidence])

  cards.sort((a, b) => a.position - b.position)

  const internalWrites = cards
    .filter(card => !card.reachesOutside)
    .map(card => ({
      // La carte n'est PAS externe : son `kind` appartient donc à l'énumération
      // interne. Le `parse` est la preuve — il refuserait un ajout mal classé.
      kind: meetingInternalOutputKindSchema.parse(card.kind),
      count: card.itemCount,
    }))

  const externalDrafts = cards
    .filter(card => card.reachesOutside)
    .map(card => meetingExternalOutputKindSchema.parse(card.kind))

  return {
    cards,
    summary: {
      internalWrites,
      externalDrafts,
      estimatedCredits: recap.estimatedCredits,
      sources: recap.sources,
      droppedWithoutEvidence: dropped,
    },
  }
}
