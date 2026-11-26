import { z } from 'zod'
import { MEASURABILITY_THRESHOLDS } from './measurability.js'

/**
 * Le POSITIONNEMENT — un talent proposé sur un projet, et ce qui lui arrive
 * ensuite.
 *
 * Le produit savait classer un vivier contre un besoin (`consultant-matching`)
 * et réécrire un CV pour une mission. Il ne gardait AUCUNE trace de ce qui était
 * réellement parti chez le client, ni de ce qu'il en avait dit. Trois
 * conséquences vécues dans toutes les ESN :
 *
 *  - on ne sait pas quelle version du CV le client a reçue, donc on ne peut pas
 *    préparer la soutenance ;
 *  - on repousse un profil déjà refusé chez le même client, ce qui est la façon
 *    la plus rapide de perdre un compte ;
 *  - on ne peut répondre à aucune question de pilotage — « combien de profils
 *    pour une signature ? » suppose de les avoir comptés.
 *
 * Deux refus structurent le contrat :
 *
 * 1. **« Sans retour » est une ISSUE À PART**, pas un refus. C'est le cas le
 *    plus fréquent en réalité, et le compter comme un refus ferait mentir tous
 *    les taux : on saurait qu'on a « perdu » là où on ne sait simplement rien.
 * 2. **Aucun taux sans dénominateur.** `null` et non `0 %` : un espace qui a
 *    positionné trois profils ce mois-ci ne doit pas lire « 0 % de succès » —
 *    il doit lire « pas encore mesurable ».
 */

/**
 * Le cycle d'un positionnement. Fermé et ORDONNÉ : sans ordre, on ne sait pas
 * dire qu'un profil a « avancé », et l'entonnoir ne veut plus rien dire.
 */
export const SUBMISSION_STAGES = [
  /** Retenu dans la sélection interne. Le client n'a rien reçu. */
  'shortlisted',
  /** Le CV est PARTI chez le client. C'est ici que le compteur commence. */
  'submitted',
  /** Le client a demandé à rencontrer la personne. */
  'interview',
  /** Le client prend le profil. */
  'accepted',
  /** Le client dit non, avec une raison. */
  'rejected',
  /** Nous retirons le profil (indisponible, autre mission, refus du consultant). */
  'withdrawn',
] as const
export const submissionStageSchema = z.enum(SUBMISSION_STAGES)
export type SubmissionStage = (typeof SUBMISSION_STAGES)[number]

/** Les étapes closes : plus rien n'en repart tout seul. */
export const CLOSED_SUBMISSION_STAGES: readonly SubmissionStage[] = ['accepted', 'rejected', 'withdrawn']

/**
 * Les transitions AUTORISÉES.
 *
 * Une machine fermée et non « tout vers tout » : un profil qui passerait de
 * `rejected` à `shortlisted` sans trace effacerait un refus client, et c'est
 * précisément le refus qu'il ne faut pas oublier avant de repousser quelqu'un.
 * Rouvrir est possible — mais depuis `withdrawn` seulement, parce qu'un retrait
 * vient de NOUS et peut légitimement se rétracter.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<SubmissionStage, readonly SubmissionStage[]>> = {
  shortlisted: ['submitted', 'withdrawn', 'rejected'],
  submitted: ['interview', 'accepted', 'rejected', 'withdrawn'],
  interview: ['accepted', 'rejected', 'withdrawn'],
  accepted: [],
  rejected: [],
  withdrawn: ['shortlisted', 'submitted'],
}

export function canTransition(from: SubmissionStage, to: SubmissionStage): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * #2335.2 (LAU-FINAL-076) — REFORMULÉ. Le seizième sous-statut nommé le plus
 * en détail que peut prendre un positionnement, de la préparation à
 * l'archivage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ADDITIF, ET NON UN REMPLACEMENT DE `SubmissionStage`
 * ─────────────────────────────────────────────────────────────────────────
 * La demande d'origine lit comme un remplacement des six `SUBMISSION_STAGES`
 * par seize valeurs. Mesuré avant d'écrire une ligne : `SubmissionStage` a
 * DOUZE fichiers appelants (staffing, collision, catalogues, besoins ouverts,
 * propositions…) qui branchent dessus des décisions déjà en production —
 * remplacer l'énumération aurait un rayon d'effet que ce lot ne peut pas
 * couvrir en sécurité. La reformulation : les seize sous-statuts s'AJOUTENT,
 * chacun retombant sur UNE étape existante (`SUBSTATUS_TO_STAGE`) — rien de ce
 * qui lit `SubmissionStage` aujourd'hui ne bouge.
 */
export const SUBMISSION_SUBSTATUSES = [
  'to_qualify',
  'consultant_agreement_pending',
  'ready_to_present',
  'to_validate',
  'presented',
  'acknowledged',
  'interview_to_schedule',
  'interview_scheduled',
  'interview_done',
  'second_interview',
  'selected',
  'declined',
  'withdrawn',
  'no_response',
  'converted_to_mission',
  'archived',
  /**
   * #2940 (#2189.20/.21/.33/.34/.36) — CINQ sous-statuts, ADDITIFS EN FIN
   * (même discipline que `FEEDBACK_AXES`, GA-08) : « avant présentation »
   * ne pouvait ni échouer techniquement ni se déclarer envoyé sans connecteur
   * (copie manuelle), et « après entretien » ne savait nommer que « second
   * entretien » — pas « poursuivre », « clarifier » ni « négocier ».
   */
  'presentation_failed',
  'presented_manually',
  'to_pursue',
  'to_clarify',
  'to_negotiate',
] as const
export const submissionSubstatusSchema = z.enum(SUBMISSION_SUBSTATUSES)
export type SubmissionSubstatus = (typeof SUBMISSION_SUBSTATUSES)[number]

/** Chaque sous-statut retombe sur UNE étape de la machine existante. */
export const SUBSTATUS_TO_STAGE: Readonly<Record<SubmissionSubstatus, SubmissionStage>> = {
  to_qualify: 'shortlisted',
  consultant_agreement_pending: 'shortlisted',
  ready_to_present: 'shortlisted',
  to_validate: 'shortlisted',
  presented: 'submitted',
  acknowledged: 'submitted',
  interview_to_schedule: 'interview',
  interview_scheduled: 'interview',
  interview_done: 'interview',
  second_interview: 'interview',
  selected: 'accepted',
  declined: 'rejected',
  withdrawn: 'withdrawn',
  no_response: 'rejected',
  converted_to_mission: 'accepted',
  archived: 'withdrawn',
  // #2940 — rien n'est encore parti : un échec technique de présentation ne
  // fait avancer aucune étape.
  presentation_failed: 'shortlisted',
  // Le CV est réellement parti, juste sans connecteur — même étape que `presented`.
  presented_manually: 'submitted',
  to_pursue: 'interview',
  to_clarify: 'interview',
  to_negotiate: 'interview',
}

/**
 * Les transitions AUTORISÉES entre sous-statuts — fermée, comme
 * `ALLOWED_TRANSITIONS` ci-dessus. « Une transition requiert un événement ou
 * une déclaration explicite » (LAU-FINAL-076) : sauter de « à qualifier » à
 * « retenu » sans passer par la présentation ni l'entretien ne se déclare pas
 * tout seul.
 */
const SUBSTATUS_TRANSITIONS: Readonly<Record<SubmissionSubstatus, readonly SubmissionSubstatus[]>> = {
  to_qualify: ['consultant_agreement_pending', 'withdrawn'],
  consultant_agreement_pending: ['ready_to_present', 'withdrawn'],
  ready_to_present: ['to_validate', 'withdrawn'],
  // #2189.20/.21 — une présentation peut échouer techniquement (retour
  // connecteur) ou partir sans connecteur (copie manuelle) : deux issues
  // ADDITIVES à côté de « présenté ».
  to_validate: ['presented', 'presented_manually', 'presentation_failed', 'withdrawn'],
  // Un échec se corrige en retentant — jamais en sautant vers « présenté ».
  presentation_failed: ['to_validate', 'withdrawn'],
  presented: ['acknowledged', 'no_response', 'withdrawn'],
  // Même suite que « présenté » : le CV est parti, la méthode diffère.
  presented_manually: ['acknowledged', 'no_response', 'withdrawn'],
  acknowledged: ['interview_to_schedule', 'declined', 'no_response', 'withdrawn'],
  interview_to_schedule: ['interview_scheduled', 'withdrawn'],
  interview_scheduled: ['interview_done', 'withdrawn'],
  // #2189.33/.34/.36 — trois décisions ADDITIVES à côté de « second entretien » :
  // poursuivre, clarifier un point avant de décider, ou négocier les conditions.
  interview_done: ['second_interview', 'to_pursue', 'to_clarify', 'to_negotiate', 'selected', 'declined', 'withdrawn'],
  second_interview: ['selected', 'declined', 'withdrawn'],
  to_pursue: ['selected', 'declined', 'withdrawn'],
  // Une fois clarifié, soit ça repart en poursuite, soit ça se négocie.
  to_clarify: ['to_pursue', 'to_negotiate', 'declined', 'withdrawn'],
  to_negotiate: ['selected', 'declined', 'withdrawn'],
  selected: ['converted_to_mission'],
  declined: ['archived'],
  // Comme `SUBMISSION_STAGES.withdrawn` : un retrait vient de NOUS et peut
  // légitimement se rétracter.
  withdrawn: ['to_qualify', 'archived'],
  no_response: ['archived'],
  converted_to_mission: ['archived'],
  archived: [],
}

export function canTransitionSubstatus(from: SubmissionSubstatus, to: SubmissionSubstatus): boolean {
  if (from === to) return false
  return SUBSTATUS_TRANSITIONS[from].includes(to)
}

/**
 * #2177.11 / .12 / .13 / .15 / .20 / .21 — les seize sous-statuts existaient
 * déjà (#2335.1, `SUBMISSION_SUBSTATUSES`), affichés en badge dès qu'ils sont
 * posés, mais RIEN ne les faisait avancer manuellement : seul le sous-statut
 * d'ENTRÉE de chaque étape était posé (`deriveSubstatusFromStage`), jamais les
 * étapes intermédiaires (« accord consultant attendu », « prêt à
 * présenter »…). Nomme les cibles atteignables, pour l'écran comme pour la
 * porte du service qui les applique.
 */
export function nextSubstatuses(from: SubmissionSubstatus): readonly SubmissionSubstatus[] {
  return SUBSTATUS_TRANSITIONS[from]
}

/**
 * #2335.1 — le sous-statut d'ENTRÉE d'une étape, tel que le pilote aujourd'hui
 * la machine à six étapes (`ALLOWED_TRANSITIONS`).
 *
 * ⚠️ Volontairement PERMISSIF, pas la machine fermée `canTransitionSubstatus`
 * ci-dessus : la machine à six étapes autorise déjà `submitted → accepted`
 * SANS passer par un entretien (un client peut prendre sur dossier). Le
 * sous-statut détaillé (« entretien réalisé », « second entretien »…) reste
 * une déclaration EXPLICITE réservée à qui l'écrit vraiment — cette fonction
 * ne fait que nommer l'endroit où « accepté » tombe par défaut (`selected`),
 * jamais un raccourci through `interview_done`.
 */
export function deriveSubstatusFromStage(
  stage: SubmissionStage,
  outcomeReason: SubmissionOutcomeReason | null,
): SubmissionSubstatus {
  switch (stage) {
    case 'shortlisted':
      return 'to_qualify'
    case 'submitted':
      return 'presented'
    case 'interview':
      return 'interview_scheduled'
    case 'accepted':
      return 'selected'
    case 'rejected':
      // « Sans réponse » est un sous-statut à part, même raison que
      // `SUBMISSION_OUTCOME_REASONS.no_feedback` : un silence n'est pas un
      // refus argumenté.
      return outcomeReason === 'no_feedback' ? 'no_response' : 'declined'
    case 'withdrawn':
      return 'withdrawn'
  }
}

/**
 * Pourquoi un positionnement s'est arrêté. Liste FERMÉE : un motif écrit à la
 * main par chacun ne s'agrège jamais, et la question « pourquoi perd-on ? » ne
 * se répond qu'en agrégeant.
 *
 * `no_feedback` est le motif le plus important de la liste, et c'est celui
 * qu'aucun CRM ne propose : le client n'a jamais répondu. Le ranger dans
 * « refusé » ferait croire à un refus argumenté qui n'a pas eu lieu.
 */
export const SUBMISSION_OUTCOME_REASONS = [
  'price',
  'skills',
  'seniority',
  'availability',
  'other_supplier',
  'need_cancelled',
  'candidate_declined',
  'no_feedback',
  'other',
] as const
export const submissionOutcomeReasonSchema = z.enum(SUBMISSION_OUTCOME_REASONS)
export type SubmissionOutcomeReason = (typeof SUBMISSION_OUTCOME_REASONS)[number]

/**
 * #2177.24 — le canal d'un positionnement, réutilisant les QUATRE valeurs
 * déjà canoniques du plan de Laura (`ActionPlanItemChannel`, #2395.4) : un
 * cinquième canal ici serait un mensonge de canal une fois lu ailleurs comme
 * une des quatre valeurs déjà en production.
 */
export const SUBMISSION_CHANNELS = ['phone', 'email', 'linkedin', 'meeting'] as const
export const submissionChannelSchema = z.enum(SUBMISSION_CHANNELS)
export type SubmissionChannel = (typeof SUBMISSION_CHANNELS)[number]

export const submissionSchema = z.object({
  id: z.string().guid(),
  projectId: z.string().guid(),
  projectLabel: z.string().nullable(),
  accountId: z.string().guid().nullable(),
  accountName: z.string().nullable(),
  /** Le rôle précis visé, quand le projet en porte plusieurs. */
  needId: z.string().guid().nullable(),
  needRole: z.string().nullable(),
  consultantId: z.string().guid(),
  consultantName: z.string().nullable(),
  /** #4502 — le poste du consultant (`consultants.title`), tel que stocké. `null`/absent = aucune ligne, jamais un poste deviné. */
  consultantTitle: z.string().nullable().optional(),
  stage: submissionStageSchema,
  /** #2335.1 — le niveau de détail EN PLUS de `stage` (seize valeurs
   *  possibles). `null` sur une ligne créée avant #2335 : jamais deviné. */
  substatus: submissionSubstatusSchema.nullable(),
  /** Depuis quand le positionnement est à cette étape. */
  stageEnteredAt: z.string(),
  /** Quand le CV est réellement PARTI. `null` tant qu'il n'est pas envoyé — le
   *  compteur « combien de temps pour un retour » démarre là et nulle part ailleurs. */
  submittedAt: z.string().nullable(),
  /** Premier retour client, quel qu'il soit. `null` = toujours rien. */
  firstFeedbackAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  outcomeReason: submissionOutcomeReasonSchema.nullable(),
  outcomeDetail: z.string().nullable(),
  /** TJM proposé au client, en centimes. `null` = non chiffré, jamais 0. */
  proposedRateCents: z.number().int().nonnegative().nullable(),
  /** #4192 — jours prévus et coût journalier (centimes). `null` = non chiffré, jamais 0. */
  plannedDays: z.number().int().positive().nullable(),
  dailyCostCents: z.number().int().nonnegative().nullable(),
  /** #4192 — (TJM − coût) × jours. `null` = marge non mesurée (un des trois manque), jamais 0. */
  plannedMarginCents: z.number().int().nullable(),
  /** La VERSION du CV envoyée, figée. Sans elle, impossible de préparer une
   *  soutenance : on ne sait pas ce que le client a lu. */
  cvSnapshot: z.string().nullable(),
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  // #2177.6 / .25 — le CONTACT destinataire chez le client. `null` : jamais
  // deviné, une ligne créée avant ce lot n'en a jamais déclaré.
  recipientContactId: z.string().guid().nullable(),
  recipientContactName: z.string().nullable(),
  channel: submissionChannelSchema.nullable(),
  // #2177.8 — le message PRÉPARÉ pour accompagner l'envoi. Jamais expédié
  // par le copilote : préparer reste autorisé, envoyer ne l'est jamais.
  message: z.string().nullable(),
  // #2177.28 — la disponibilité ANNONCÉE au moment du positionnement, figée
  // comme `cvSnapshot` : le vivier continue d'évoluer, ce texte ne bouge pas.
  availability: z.string().nullable(),
  // #2177.30 — les conditions particulières de ce positionnement (texte libre).
  conditions: z.string().nullable(),
  /** #2320.18 (épopée #2967) — l'accord DÉCLARÉ du consultant à être proposé
   *  sur ce positionnement. `null` = jamais déclaré, jamais deviné. */
  consultantAgreement: z.boolean().nullable(),
  /** N'a de sens QUE si `consultantAgreement` est renseigné. */
  consultantAgreementDate: z.string().nullable(),
  /**
   * #2189.39 — la prochaine action sur CE positionnement, TOUJOURS datée et
   * attribuée : les trois champs sont posés ensemble ou pas du tout (contrainte
   * SQL `submissions_next_action_check`, migration `1796321396120`). Distincte
   * de la prochaine action du BESOIN (`needNextAction`) : un positionnement
   * avance à son propre rythme une fois présenté.
   */
  nextActionLabel: z.string().nullable(),
  nextActionDueAt: z.string().nullable(),
  nextActionOwnerId: z.string().guid().nullable(),
  nextActionOwnerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Submission = z.infer<typeof submissionSchema>

/**
 * #2335.3 (LAU-FINAL-076) — la TIMELINE d'un positionnement, chaque étape
 * avec sa date. Lit les traces déjà écrites par `SubmissionsService.trace()`
 * dans `activities` (kind `task`, source `system`) — pas une nouvelle table :
 * l'événement existait déjà, seule la ROUTE qui le sert au singulier manquait.
 */
export const submissionTimelineEventSchema = z.object({
  /** L'objet écrit par le système — `<nom du profil> — <étape>`, déjà
   *  traduit à l'écran par `timelineEventTitle` (activities). */
  subject: z.string().nullable(),
  occurredAt: z.string(),
})
export type SubmissionTimelineEvent = z.infer<typeof submissionTimelineEventSchema>

/**
 * #2189.10-.16 — l'APERÇU d'une présentation, ce que le client va recevoir,
 * lecture seule. Trois champs manquaient entièrement (destinataire, message,
 * canal, conditions se lisaient déjà dans `SubmissionDetailsDialog`) :
 *
 *  - `subject` — aucun objet n'existait, dérivé sans invention du besoin/compte ;
 *  - `cv` — quelle version du CV part réellement, `null` = aucune figée encore ;
 *  - `argumentsSource` — d'où viennent les arguments avancés, jamais « on le sait
 *    juste » : soit le dossier de compétences déjà généré, soit rien (nommé).
 */
export const submissionPreviewSchema = z.object({
  subject: z.string(),
  cv: z.object({ capturedAt: z.string().nullable() }).nullable(),
  argumentsSource: z.string().nullable(),
})
export type SubmissionPreview = z.infer<typeof submissionPreviewSchema>

/**
 * Construit l'aperçu, PUR — `cvCapturedAt` vient de la version de CV réellement
 * figée pour ce besoin (`cv_versions`, lue par l'appelant), jamais devinée ici :
 * un CV envoyé sans version retrouvée rend `capturedAt: null`, honnêtement.
 */
export function buildSubmissionPreview(
  submission: Pick<Submission, 'consultantName' | 'needRole' | 'projectLabel' | 'accountName' | 'cvSnapshot'>,
  cvCapturedAt: string | null,
): SubmissionPreview {
  const role = submission.needRole ?? submission.projectLabel ?? 'ce besoin'
  const who = submission.consultantName ?? 'ce profil'
  const subject = submission.accountName
    ? `Positionnement — ${who} pour ${role} chez ${submission.accountName}`
    : `Positionnement — ${who} pour ${role}`

  return {
    subject,
    cv: submission.cvSnapshot ? { capturedAt: cvCapturedAt } : null,
    argumentsSource: submission.cvSnapshot ? 'le CV figé pour cette présentation' : null,
  }
}

export const createSubmissionSchema = z
  .object({
    projectId: z.string().guid(),
    consultantId: z.string().guid(),
    needId: z.string().guid().optional(),
    /** Défaut : `shortlisted`. Un profil n'est pas « envoyé » parce qu'on l'a retenu. */
    stage: z.enum(['shortlisted', 'submitted']).default('shortlisted'),
    proposedRateCents: z.number().int().min(0).max(500_000).nullable().default(null),
    /** #4192 — jours prévus (miroir du CHECK SQL `> 0`). */
    plannedDays: z.number().int().positive().max(3650).nullable().optional(),
    /** #4192 — coût journalier en centimes ; absent = pré-rempli depuis le coût du talent. */
    dailyCostCents: z.number().int().min(0).max(500_000).nullable().optional(),
  })
  .strict()
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>

export const advanceSubmissionSchema = z
  .object({
    stage: submissionStageSchema,
    outcomeReason: submissionOutcomeReasonSchema.optional(),
    outcomeDetail: z.string().trim().max(2000).optional(),
    proposedRateCents: z.number().int().min(0).max(500_000).nullable().optional(),
    plannedDays: z.number().int().positive().max(3650).nullable().optional(),
    dailyCostCents: z.number().int().min(0).max(500_000).nullable().optional(),
    /** Le texte du CV envoyé, figé au moment de l'envoi. */
    cvSnapshot: z.string().max(200_000).optional(),
  })
  .strict()
  .refine(value => !CLOSED_SUBMISSION_STAGES.includes(value.stage) || value.outcomeReason !== undefined, {
    message: 'Une clôture demande un motif — sans lui, la question « pourquoi perd-on ? » reste sans réponse',
    path: ['outcomeReason'],
  })
export type AdvanceSubmissionInput = z.infer<typeof advanceSubmissionSchema>

/** #2177.11 / .12 / .13 / .15 / .20 / .21 — fait avancer le SOUS-statut, sans
 *  toucher `stage` : la machine à six étapes ne bouge jamais depuis cette
 *  route, seul `nextSubstatuses`/`canTransitionSubstatus` l'autorise. */
export const advanceSubstatusSchema = z
  .object({
    substatus: submissionSubstatusSchema,
  })
  .strict()
export type AdvanceSubstatusInput = z.infer<typeof advanceSubstatusSchema>

/**
 * #2177.6 / .8 / .24 / .25 / .28 / .30 — le DÉTAIL d'un positionnement :
 * destinataire, canal, message préparé, disponibilité annoncée, conditions.
 * Route SÉPARÉE de `advance`/`advanceSubstatus` : ces cinq champs ne portent
 * ni étape ni sous-statut, et n'en font jamais bouger un.
 */
export const recordSubmissionDetailsSchema = z
  .object({
    recipientContactId: z.string().guid().nullable().optional(),
    channel: submissionChannelSchema.nullable().optional(),
    message: z.string().trim().max(5000).nullable().optional(),
    availability: z.string().trim().max(300).nullable().optional(),
    conditions: z.string().trim().max(2000).nullable().optional(),
    /**
     * #2320.18 (épopée #2967) — l'accord DÉCLARÉ du consultant, oui ou non,
     * jamais deviné. Même garde que `assignmentInputSchema.consentDate`
     * (#2407.4) : une date n'a de sens QUE si l'accord (oui OU non) est
     * renseigné — un « non » se date aussi, c'est le refus qui compte.
     */
    consultantAgreement: z.boolean().nullable().optional(),
    consultantAgreementDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .optional(),
  })
  .strict()
  .refine(value => !value.consultantAgreementDate || value.consultantAgreement !== undefined, {
    message: 'Une date d’accord suppose un accord déclaré (oui ou non)',
    path: ['consultantAgreementDate'],
  })
export type RecordSubmissionDetailsInput = z.infer<typeof recordSubmissionDetailsSchema>

/**
 * #2189.39 — poser (ou effacer) la prochaine action de CE positionnement.
 * Les trois champs voyagent ENSEMBLE : soit les trois sont fournis (poser une
 * action datée et attribuée), soit les trois sont `null` (l'effacer) — jamais
 * une étape sans date, ni une date sans porteur.
 */
export const recordSubmissionNextActionSchema = z
  .object({
    label: z.string().trim().min(1).max(300).nullable(),
    dueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable(),
    ownerId: z.string().guid().nullable(),
  })
  .strict()
  .refine(
    value => (value.label === null) === (value.dueAt === null) && (value.label === null) === (value.ownerId === null),
    {
      message: 'Une prochaine action est datée ET attribuée — les trois champs, ou aucun',
    },
  )
export type RecordSubmissionNextActionInput = z.infer<typeof recordSubmissionNextActionSchema>

// ───────────────────────────────── entretiens ────────────────────────────────

export const INTERVIEW_MODES = ['onsite', 'remote', 'phone'] as const
export const interviewModeSchema = z.enum(INTERVIEW_MODES)
export type InterviewMode = (typeof INTERVIEW_MODES)[number]

/** `pending` tant que rien n'est su : l'absence de verdict n'est pas un échec. */
export const INTERVIEW_OUTCOMES = ['pending', 'positive', 'negative', 'no_show'] as const
export const interviewOutcomeSchema = z.enum(INTERVIEW_OUTCOMES)
export type InterviewOutcome = (typeof INTERVIEW_OUTCOMES)[number]

export const interviewSchema = z.object({
  id: z.string().guid(),
  submissionId: z.string().guid(),
  scheduledAt: z.string(),
  mode: interviewModeSchema,
  /** Les personnes côté client, telles qu'on nous les a annoncées. */
  clientAttendees: z.array(z.string()),
  outcome: interviewOutcomeSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
  /**
   * #2875/#3398 (BM) — `null` tant que personne n'a ouvert le brief
   * d'entretien (`InterviewBriefDialog`). Posé une seule fois, à la première
   * ouverture : une réouverture ne la recule jamais (c'est quand on l'a
   * d'abord consultée qui compte pour « entretien à préparer »).
   */
  briefViewedAt: z.string().nullable(),
})
export type Interview = z.infer<typeof interviewSchema>

export const scheduleInterviewSchema = z
  .object({
    scheduledAt: z.string().datetime({ offset: true }),
    mode: interviewModeSchema.default('remote'),
    clientAttendees: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    notes: z.string().trim().max(5000).optional(),
  })
  .strict()
export type ScheduleInterviewInput = z.infer<typeof scheduleInterviewSchema>

export const recordInterviewOutcomeSchema = z
  .object({
    outcome: interviewOutcomeSchema,
    notes: z.string().trim().max(5000).optional(),
  })
  .strict()
export type RecordInterviewOutcomeInput = z.infer<typeof recordInterviewOutcomeSchema>

// ─────────────────────────────────── retour ──────────────────────────────────

/**
 * Le retour client, sur les quatre axes qui décident réellement.
 *
 * Chaque axe est un verdict à trois valeurs — ou `unknown`, qui est le défaut.
 * Forcer un avis là où le client n'en a pas donné fabriquerait une donnée, et
 * c'est cette donnée-là qui servirait ensuite à décider quel profil pousser.
 */
export const FEEDBACK_VERDICTS = ['unknown', 'below', 'meets', 'above'] as const
export const feedbackVerdictSchema = z.enum(FEEDBACK_VERDICTS)
export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

/**
 * #2335.4 (LAU-FINAL-076) — DIX axes nommés, pas quatre. Les quatre premiers
 * existaient déjà (`technical`/`experience`/`communication`/`price`) ; les six
 * suivants s'AJOUTENT — c'est un élargissement, jamais un remplacement : une
 * ligne déjà écrite garde ses quatre axes, les six nouveaux valent `unknown`.
 *
 * #2178.29 — ONZIÈME axe, « personnalité » : le seul des huit axes demandés
 * par #2178 (compétence/séniorité/contexte/timing/budget/personnalité/
 * disponibilité/autre) qui manquait — les sept autres se lisaient déjà via
 * `technical`/`seniority`/`context`/`timing`/`price`/`availability`/`other`.
 * AJOUTÉ EN FIN (GA-08), jamais inséré au milieu.
 */
export const FEEDBACK_AXES = [
  'technical',
  'experience',
  'communication',
  'price',
  'seniority',
  'context',
  'availability',
  'location',
  'timing',
  'other',
  'personality',
] as const
export const feedbackAxisSchema = z.enum(FEEDBACK_AXES)
export type FeedbackAxis = (typeof FEEDBACK_AXES)[number]

export const submissionFeedbackSchema = z.object({
  id: z.string().guid(),
  submissionId: z.string().guid(),
  technical: feedbackVerdictSchema,
  experience: feedbackVerdictSchema,
  communication: feedbackVerdictSchema,
  price: feedbackVerdictSchema,
  seniority: feedbackVerdictSchema,
  context: feedbackVerdictSchema,
  availability: feedbackVerdictSchema,
  location: feedbackVerdictSchema,
  timing: feedbackVerdictSchema,
  other: feedbackVerdictSchema,
  /** #2178.29 — le geste que l'issue empêchait : « personnalité » n'existait pas. */
  personality: feedbackVerdictSchema,
  /** Ce que le client a dit, tel quel. Jamais reformulé. */
  verbatim: z.string().nullable(),
  /**
   * #2335.6 — l'apprentissage réutilisable, écrit à la main. PUREMENT
   * additif : cette note ne réécrit AUCUN champ du profil consultant (aucune
   * compétence, aucun niveau) — elle ne peut donc jamais écraser une preuve
   * déjà posée (mission réalisée, compétence vérifiée). Elle ne généralise
   * pas non plus à tous les besoins : elle reste attachée à CE positionnement.
   */
  learning: z.string().nullable(),
  recordedAt: z.string(),
  recordedByName: z.string().nullable(),
})
export type SubmissionFeedback = z.infer<typeof submissionFeedbackSchema>

export const recordFeedbackSchema = z
  .object({
    technical: feedbackVerdictSchema.default('unknown'),
    experience: feedbackVerdictSchema.default('unknown'),
    communication: feedbackVerdictSchema.default('unknown'),
    price: feedbackVerdictSchema.default('unknown'),
    seniority: feedbackVerdictSchema.default('unknown'),
    context: feedbackVerdictSchema.default('unknown'),
    availability: feedbackVerdictSchema.default('unknown'),
    location: feedbackVerdictSchema.default('unknown'),
    timing: feedbackVerdictSchema.default('unknown'),
    other: feedbackVerdictSchema.default('unknown'),
    personality: feedbackVerdictSchema.default('unknown'),
    verbatim: z.string().trim().max(5000).optional(),
    /** #2335.6 — jamais écrit sur le profil, voir `submissionFeedbackSchema.learning`. */
    learning: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(value => Boolean(value.verbatim) || FEEDBACK_AXES.some(axis => value[axis] !== 'unknown'), {
    message: 'Un retour vide n’est pas un retour : renseigne au moins un axe ou ce que le client a dit',
  })
export type RecordFeedbackInput = z.infer<typeof recordFeedbackSchema>

// ─────────────────────────────── retour consultant ───────────────────────────
/**
 * #2335.5 (LAU-FINAL-076) — le retour du CONSULTANT sur la présentation, un
 * objet TOTALEMENT séparé du retour client (`submissionFeedbackSchema`
 * ci-dessus). Huit axes qui lui sont propres — l'intérêt pour la mission, la
 * compréhension du besoin, le manager, la mission elle-même, les conditions,
 * les inquiétudes, sa disponibilité, sa décision — jamais fusionnés avec ceux
 * du client : un bloc écrase l'autre à la première confusion, et c'est
 * exactement ce que l'issue refuse (« les deux feedbacks restent séparés »).
 */
export const CONSULTANT_FEEDBACK_AXES = [
  'interest',
  'understanding',
  'manager',
  'mission',
  'conditions',
  'concerns',
  'availability',
  'decision',
] as const
export type ConsultantFeedbackAxis = (typeof CONSULTANT_FEEDBACK_AXES)[number]

export const submissionConsultantFeedbackSchema = z.object({
  id: z.string().guid(),
  submissionId: z.string().guid(),
  interest: feedbackVerdictSchema,
  understanding: feedbackVerdictSchema,
  manager: feedbackVerdictSchema,
  mission: feedbackVerdictSchema,
  conditions: feedbackVerdictSchema,
  concerns: feedbackVerdictSchema,
  availability: feedbackVerdictSchema,
  decision: feedbackVerdictSchema,
  /** Ce que le consultant a dit, tel quel. Jamais reformulé. */
  verbatim: z.string().nullable(),
  recordedAt: z.string(),
  recordedByName: z.string().nullable(),
})
export type SubmissionConsultantFeedback = z.infer<typeof submissionConsultantFeedbackSchema>

export const recordConsultantFeedbackSchema = z
  .object({
    interest: feedbackVerdictSchema.default('unknown'),
    understanding: feedbackVerdictSchema.default('unknown'),
    manager: feedbackVerdictSchema.default('unknown'),
    mission: feedbackVerdictSchema.default('unknown'),
    conditions: feedbackVerdictSchema.default('unknown'),
    concerns: feedbackVerdictSchema.default('unknown'),
    availability: feedbackVerdictSchema.default('unknown'),
    decision: feedbackVerdictSchema.default('unknown'),
    verbatim: z.string().trim().max(5000).optional(),
  })
  .strict()
  .refine(value => Boolean(value.verbatim) || CONSULTANT_FEEDBACK_AXES.some(axis => value[axis] !== 'unknown'), {
    message: 'Un retour vide n’est pas un retour : renseigne au moins un axe ou ce que le consultant a dit',
  })
export type RecordConsultantFeedbackInput = z.infer<typeof recordConsultantFeedbackSchema>

// ──────────────────────────────── l'entonnoir ────────────────────────────────

type FunnelRow = {
  stage: SubmissionStage
  submittedAt: string | null
  firstFeedbackAt: string | null
  outcomeReason: SubmissionOutcomeReason | null
}

export const submissionFunnelSchema = z.object({
  byStage: z.partialRecord(submissionStageSchema, z.number().int().nonnegative()),
  /** Positionnements réellement PARTIS chez un client. Le dénominateur de tout. */
  submitted: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  /** Restés sans le moindre retour. Comptés À PART des refus. */
  noFeedback: z.number().int().nonnegative(),
  /** `null` quand rien n'est encore clos — pas `0`. */
  acceptanceRate: z.number().min(0).max(1).nullable(),
  /**
   * Jours médians entre l'envoi et le premier retour.
   *
   * `null` tant qu'il n'y a pas assez de retours pour qu'une médiane veuille
   * dire quelque chose — le plancher est
   * `MEASURABILITY_THRESHOLDS.submissionFeedbackDelay`. Jamais `0`, et jamais
   * une médiane sur deux observations : elle se lirait exactement comme une
   * médiane sur cinquante, et c'est sur ce chiffre qu'on décide de relancer un
   * client ou d'attendre.
   */
  medianDaysToFeedback: z.number().nullable(),
})
export type SubmissionFunnel = z.infer<typeof submissionFunnelSchema>

/**
 * L'entonnoir des positionnements.
 *
 * Trois règles d'honnêteté, chacune contre un chiffre qui ment :
 *
 *  - le taux d'acceptation se calcule sur les positionnements **clos avec une
 *    réponse** : inclure ceux qui n'ont jamais eu de retour ferait passer un
 *    silence pour un refus ;
 *  - **aucun taux sans dénominateur** : `null`, jamais `0 %` ;
 *  - la latence est une **médiane** — un seul retour à trois mois déplacerait
 *    une moyenne et ferait croire que le client met un trimestre à répondre.
 */
export function submissionFunnel(rows: readonly FunnelRow[]): SubmissionFunnel {
  const byStage: Partial<Record<SubmissionStage, number>> = {}
  let submitted = 0
  let accepted = 0
  let rejected = 0
  let noFeedback = 0
  const latencies: number[] = []

  for (const row of rows) {
    byStage[row.stage] = (byStage[row.stage] ?? 0) + 1
    if (row.submittedAt) submitted += 1
    if (row.stage === 'accepted') accepted += 1
    if (row.stage === 'rejected') {
      if (row.outcomeReason === 'no_feedback') noFeedback += 1
      else rejected += 1
    }
    if (row.submittedAt && row.firstFeedbackAt) {
      const start = Date.parse(row.submittedAt)
      const end = Date.parse(row.firstFeedbackAt)
      if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
        latencies.push((end - start) / 86_400_000)
      }
    }
  }

  // Le dénominateur : ceux qui ont reçu une VRAIE réponse. Un silence n'est pas
  // un refus, et le compter comme tel ferait chuter le taux sans qu'aucun client
  // n'ait dit non.
  const decided = accepted + rejected

  return {
    byStage: byStage as Record<SubmissionStage, number>,
    submitted,
    accepted,
    rejected,
    noFeedback,
    acceptanceRate: decided === 0 ? null : accepted / decided,
    medianDaysToFeedback: median(latencies),
  }
}

/**
 * La médiane, ou `null` quand il n'y a pas assez d'observations pour qu'elle
 * veuille dire quelque chose.
 *
 * Le plancher est celui de `MEASURABILITY_THRESHOLDS.submissionFeedbackDelay` —
 * lu, jamais recopié : un second seuil ici divergerait au premier ajustement.
 *
 * ⚠️ Rendre `null` plutôt qu'un nombre est le point de la fonction. Un « délai
 * médian de 3 jours » calculé sur deux retours se lit exactement comme un délai
 * médian calculé sur cinquante, et c'est sur ce chiffre-là qu'on décide de
 * relancer un client ou d'attendre.
 */
function median(values: readonly number[]): number | null {
  if (values.length < MEASURABILITY_THRESHOLDS.submissionFeedbackDelay) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value =
    sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : (sorted[middle] ?? 0)
  return Math.round(value * 10) / 10
}

/**
 * #4192 (épopée #4191, lot L1) — la marge PRÉVUE d'un positionnement :
 * (TJM − coût journalier) × jours. `null` quand l'un des trois manque —
 * « non mesurée », jamais 0 (gardes GA-18 / GA-19).
 */
export function plannedMarginCents(input: {
  proposedRateCents: number | null
  dailyCostCents: number | null
  plannedDays: number | null
}): number | null {
  const { proposedRateCents, dailyCostCents, plannedDays } = input
  if (proposedRateCents === null || dailyCostCents === null || plannedDays === null) return null
  return (proposedRateCents - dailyCostCents) * plannedDays
}

/**
 * #4191 (G4) — le coût journalier chargé que la mission née de la signature
 * REPREND : celui du positionnement retenu, à défaut le coût chargé du talent.
 * Un coût absent, nul ou négatif n'est pas un coût : `null` — la marge reste
 * « non mesurée », jamais calculée sur 0 (gardes GA-18 / GA-19).
 */
export function carriedLoadedDailyCostCents(
  positioningCents: number | null | undefined,
  consultantCents: number | null | undefined,
): number | null {
  for (const cents of [positioningCents, consultantCents]) {
    if (typeof cents === 'number' && Number.isFinite(cents) && cents > 0) return Math.round(cents)
  }
  return null
}

/**
 * #4192 — la colonne du kanban candidat d'un positionnement. Aucun nouvel enum
 * d'étape : une lecture des étapes et sous-statuts existants. `null` = hors
 * kanban (en sélection interne, refusé ou retiré).
 */
export function candidatePipelineColumn(
  stage: SubmissionStage,
  substatus: SubmissionSubstatus | null | undefined,
): 'envoye' | 'presente' | 'entretien' | 'retenu' | null {
  switch (stage) {
    case 'submitted':
      return substatus === 'presented' || substatus === 'presented_manually' || substatus === 'acknowledged'
        ? 'presente'
        : 'envoye'
    case 'interview':
      return 'entretien'
    case 'accepted':
      return 'retenu'
    default:
      return null
  }
}
