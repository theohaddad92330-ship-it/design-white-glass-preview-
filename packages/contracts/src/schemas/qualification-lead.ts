import { z } from 'zod'
import { PIPELINE_STAGES } from './project.js'
import { opportunityFreshness } from './opportunity-ontology.js'

/**
 * #2172 — LES PISTES À QUALIFIER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PISTE N'EST PAS UNE OPPORTUNITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Une opportunité se travaille : elle a un porteur, une étape, un montant, une
 * prochaine action. Une piste se VÉRIFIE : c'est un signal dont personne ne
 * sait encore s'il tient. Les confondre produit le défaut que
 * `opportunity-ontology.ts` décrit déjà pour le mot « besoin » — un compteur
 * gonflé par des choses que personne n'a regardées, et un commercial qui dit à
 * un DSI qu'on a « noté son besoin » alors qu'il n'a rien demandé.
 *
 * Ce module fige donc ce qu'une piste porte, et surtout ce qu'elle N'A PAS le
 * droit d'affirmer. Il ne stocke rien : la file se dérive à la lecture, comme
 * `evidence` (D27 · 28/08). Seules les DÉCISIONS (écarter, mettre en veille)
 * sont persistées, et la table qui les porte est bornée à l'espace.
 *
 * ⚠️ AUCUNE PROBABILITÉ. Le rang d'une piste est un score DÉCOMPOSÉ sur six
 * axes nommés, dont chaque axe non évaluable SORT du dénominateur. Ce n'est pas
 * une chance de signature : refusé six fois, `c26_probabilite` au registre.
 */

// ── Les cinq niveaux de preuve (#2172.4 → .9) ────────────────────────────────

/**
 * Les cinq niveaux de PREUVE d'une piste.
 *
 * ⚠️ CE N'EST PAS UN ENTONNOIR, et c'est le point le plus facile à défaire.
 * « Piste proposée par Laura » n'est pas au-dessus de « Signal isolé » : c'est
 * une autre ORIGINE. Les ordonner reviendrait à dire qu'une piste « progresse »
 * de l'une à l'autre — elle ne progresse pas, elle se vérifie. Le module
 * n'expose donc AUCUNE table de rang (`Record<LeadEvidenceLevel, number>`), et
 * `qualification-lead.test.ts` relit ce fichier pour s'en assurer.
 *
 * L'ordre du tableau n'est que l'ordre d'AJOUT (GA-08 : on n'insère jamais au
 * milieu) — il ne porte aucune progression.
 */
export const LEAD_EVIDENCE_LEVELS = [
  'isolated_signal',
  'converging_signals',
  'detected_need',
  'crm_or_exchange',
  'copilot_proposal',
] as const
export const leadEvidenceLevelSchema = z.enum(LEAD_EVIDENCE_LEVELS)
export type LeadEvidenceLevel = z.infer<typeof leadEvidenceLevelSchema>

export const LEAD_EVIDENCE_LABELS: Record<LeadEvidenceLevel, { fr: string; en: string }> = {
  isolated_signal: { fr: 'Signal isolé', en: 'Isolated signal' },
  converging_signals: { fr: 'Convergence de signaux', en: 'Converging signals' },
  detected_need: { fr: 'Besoin détecté', en: 'Detected need' },
  crm_or_exchange: { fr: 'Piste issue du CRM ou d’un échange', en: 'Lead from the CRM or an exchange' },
  copilot_proposal: { fr: 'Piste proposée par Laura', en: 'Lead proposed by Laura' },
}

/** Ce que chaque niveau EXIGE pour être revendiqué — la phrase que l'écran
 *  affiche sous le niveau, pour qu'il se conteste. */
export const LEAD_EVIDENCE_REQUIREMENTS: Record<LeadEvidenceLevel, { fr: string; en: string }> = {
  isolated_signal: {
    fr: 'Un fait daté et sourcé, seul. Rien ne le corrobore encore.',
    en: 'One dated and sourced fact, alone. Nothing corroborates it yet.',
  },
  converging_signals: {
    fr: 'Au moins deux faits datés qui pointent dans la même direction.',
    en: 'At least two dated facts pointing the same way.',
  },
  detected_need: {
    fr: 'Un chantier lu dans les faits du compte — personne ne l’a formulé.',
    en: 'A programme read from the account’s facts — nobody expressed it.',
  },
  crm_or_exchange: {
    fr: 'Quelqu’un l’a écrit ou dit : le CRM, un échange, une reprise de fichier.',
    en: 'Someone wrote or said it: the CRM, an exchange, an imported file.',
  },
  copilot_proposal: {
    fr: 'Laura la propose à partir des faits du dossier. À vérifier avant tout geste.',
    en: 'Laura proposes it from the dossier’s facts. To be checked before any move.',
  },
}

/** Ce qu'il faut savoir d'une ligne pour dire d'OÙ la piste vient. */
export type LeadEvidenceInput = {
  /** `PROJECT_KINDS` — `signal` et `imported` ont un sens propre ici. */
  kind: string
  stage: string
  /** Les faits datés ET sourcés qui la soutiennent. Zéro = rien à vérifier. */
  sourceFactCount: number
  /** Quelqu'un l'a formulée : le CRM, un échange tracé, l'utilisateur. */
  expressed: boolean
  /** Laura l'a proposée à partir des faits du dossier. */
  proposedByCopilot: boolean
}

/**
 * D'où vient la piste — pas « à quel étage elle est montée ».
 *
 * La cascade descend de l'origine la plus ENGAGEANTE (quelqu'un l'a formulée)
 * vers la moins engageante (un fait isolé), parce que c'est l'origine qui
 * commande la vérification suivante : on ne vérifie pas de la même façon ce
 * qu'un client a dit et ce qu'une annonce publique laisse entendre. Une piste
 * formulée ET proposée par Laura reste une piste FORMULÉE : la parole humaine
 * est ce qu'il y a à vérifier, la proposition n'est que le chemin qui y mène.
 *
 * `null` quand rien ne la soutient : une piste sans fait source ne s'invente
 * pas d'origine (« jamais de donnée fictive »), et l'écran ne la montre pas.
 */
export function classifyLeadEvidence(input: LeadEvidenceInput): LeadEvidenceLevel | null {
  if (input.expressed || input.kind === 'imported') return 'crm_or_exchange'
  if (input.sourceFactCount <= 0) return null
  if (input.proposedByCopilot) return 'copilot_proposal'
  if (input.kind !== 'signal') return 'detected_need'
  return input.sourceFactCount >= 2 ? 'converging_signals' : 'isolated_signal'
}

// ── Ce qui MANQUE sur une piste (#2172.16) ───────────────────────────────────

/**
 * Les manques NOMMÉS. Un écran n'écrit jamais un blanc ni un « 0 » à leur
 * place : « aucun interlocuteur identifié » est une information, un vide n'en
 * est pas une (GA-18 / GA-19).
 */
export const LEAD_MISSING_INFO = {
  no_contact: { fr: 'Aucun interlocuteur identifié sur ce périmètre.', en: 'No contact identified on this perimeter.' },
  no_date: { fr: 'Le fait source n’est pas daté.', en: 'The source fact carries no date.' },
  no_matched_expertise: {
    fr: 'Aucune de tes expertises n’a été rapprochée.',
    en: 'None of your areas of expertise has been matched.',
  },
  no_perimeter: { fr: 'Le périmètre n’est pas délimité.', en: 'The perimeter is not delimited.' },
  no_named_role: {
    fr: 'Aucun rôle potentiellement concerné n’a été nommé.',
    en: 'No potentially concerned role named.',
  },
  no_source_detail: { fr: 'La source du fait n’est pas identifiée.', en: 'The fact’s source is not identified.' },
} as const satisfies Record<string, { fr: string; en: string }>
export type LeadMissingInfo = keyof typeof LEAD_MISSING_INFO

/**
 * KEVIN-FIX (a) — recette prod 20/10 : « Aucun rôle potentiellement concerné n’a été nommé » s'affichait sur un
 * compte dont des personnes sont nommées ailleurs sur la fiche. Le manque est celui de la PISTE (aucun rôle
 * rattaché), pas celui du compte : quand l'écran sait que des personnes sont connues, il le DIT.
 */
export const LEAD_NO_NAMED_ROLE_WITH_CONTACTS = {
  fr: 'Aucun rôle n’est rattaché à cette piste ; des personnes sont connues sur le compte, à rapprocher.',
  en: 'No role is attached to this lead; people are known on the account, to be matched.',
} as const satisfies { fr: string; en: string }

// ── Le rang, décomposé (#2172.20 → .25) ──────────────────────────────────────

/**
 * Les six axes du rang, NOMMÉS à l'écran — la même grammaire que le
 * « Pourquoi ce rang ? » du chemin d'accès des contacts, déjà en production.
 *
 * Aucun critère protégé n'y figure : on classe des PISTES, pas des personnes.
 */
export const LEAD_RANKING_AXES = [
  'offer_fit',
  'freshness',
  'information_reachable',
  'contact_or_access',
  'user_request',
  'known_constraints',
] as const
export type LeadRankingAxis = (typeof LEAD_RANKING_AXES)[number]

export const LEAD_RANKING_AXIS_LABELS: Record<LeadRankingAxis, { fr: string; en: string }> = {
  offer_fit: { fr: 'Adéquation avec l’offre', en: 'Fit with your offer' },
  freshness: { fr: 'Fraîcheur du fait', en: 'Freshness of the fact' },
  information_reachable: { fr: 'Possibilité d’obtenir une information', en: 'Chance of getting information' },
  contact_or_access: { fr: 'Présence d’un contact ou d’un accès', en: 'A contact or an access exists' },
  user_request: { fr: 'Demande explicite de ta part', en: 'You asked for it explicitly' },
  known_constraints: { fr: 'Contraintes connues', en: 'Known constraints' },
}

/** Sous trois axes mesurés, il n'y a pas de score — un score nu n'existe pas. */
export const LEAD_MIN_MEASURED_AXES = 3

/** La valeur maximale d'un axe. Deux paliers pleins, un palier partiel. */
const AXIS_MAX = 2

export type LeadRankingInput = {
  /** Rapprochement offre ↔ piste. `null` = personne ne l'a évalué. */
  offerFit: 'strong' | 'partial' | 'none' | null
  /** Date du dernier fait qui soutient la piste. `null` = NON MESURÉ — surtout
   *  pas « périmé » : un fait non daté ne prouve rien dans les deux sens. */
  lastFactAt: string | null
  /** Sait-on par quel chemin obtenir l'information qui manque ? */
  informationReachable: boolean | null
  /** Un contact, une relation ou un accès existe sur ce périmètre. */
  hasContactOrAccess: boolean | null
  /** L'utilisateur a demandé ce sujet explicitement (recherche, veille, Laura). */
  userRequested: boolean | null
  /** Ce qui est connu et qui gêne : marché réservé, prestataire en place, gel. */
  knownConstraints: 'none' | 'some' | 'blocking' | null
}

export type LeadAxisVerdict =
  | { axis: LeadRankingAxis; measured: false }
  | { axis: LeadRankingAxis; measured: true; value: number; max: number }

export type LeadRanking = {
  /** `null` = pas assez d'axes mesurés pour noter. JAMAIS `0` à la place. */
  score: number | null
  axes: LeadAxisVerdict[]
  /** Ce qui n'a PAS pu être évalué, nommé — c'est ce que l'écran affiche. */
  notMeasured: LeadRankingAxis[]
  measuredCount: number
}

/**
 * Le rang d'une piste : un score décomposé, et rien d'autre.
 *
 * ⚠️ UN AXE NON ÉVALUABLE SORT DU DÉNOMINATEUR. Le compter à zéro ferait
 * mesurer au score la complétude de NOS données, pas l'intérêt de la piste :
 * une piste sur laquelle on ne sait rien tomberait au fond de la file, ce qui
 * est exactement l'inverse de ce qu'une file de QUALIFICATION doit faire.
 *
 * ⚠️ Un axe mesuré à zéro RESTE dedans : « contraintes bloquantes » est une
 * mesure, pas une absence.
 */
export function rankQualificationLead(input: LeadRankingInput, now: Date = new Date()): LeadRanking {
  const axes: LeadAxisVerdict[] = LEAD_RANKING_AXES.map(axis => {
    const value = axisValue(axis, input, now)
    return value === null ? { axis, measured: false } : { axis, measured: true, value, max: AXIS_MAX }
  })

  const measured = axes.filter((verdict): verdict is Extract<LeadAxisVerdict, { measured: true }> => verdict.measured)
  const notMeasured = axes.filter(verdict => !verdict.measured).map(verdict => verdict.axis)
  const total = measured.reduce((sum, verdict) => sum + verdict.value, 0)

  return {
    score: measured.length >= LEAD_MIN_MEASURED_AXES ? Math.round((100 * total) / (AXIS_MAX * measured.length)) : null,
    axes,
    notMeasured,
    measuredCount: measured.length,
  }
}

function axisValue(axis: LeadRankingAxis, input: LeadRankingInput, now: Date): number | null {
  switch (axis) {
    case 'offer_fit':
      return input.offerFit === null ? null : { strong: 2, partial: 1, none: 0 }[input.offerFit]
    case 'freshness':
      // La dérivation de fraîcheur vit à UN endroit (`opportunity-ontology`) —
      // mais une date ABSENTE n'y arrive jamais : elle y vaudrait `stale`, et
      // « non daté » n'est pas « périmé ».
      return input.lastFactAt === null
        ? null
        : { fresh: 2, ageing: 1, stale: 0 }[opportunityFreshness(input.lastFactAt, now)]
    case 'information_reachable':
      return input.informationReachable === null ? null : input.informationReachable ? 2 : 0
    case 'contact_or_access':
      return input.hasContactOrAccess === null ? null : input.hasContactOrAccess ? 2 : 0
    case 'user_request':
      return input.userRequested === null ? null : input.userRequested ? 2 : 0
    case 'known_constraints':
      return input.knownConstraints === null ? null : { none: 2, some: 1, blocking: 0 }[input.knownConstraints]
  }
}

// ── La mémoire marché (#2172.26 / .27) ───────────────────────────────────────

/** Ce que la mémoire marché a le droit de dire d'une piste : une compatibilité
 *  STRUCTURELLE, lue sur des parcours comparables. Rien d'autre. */
export type LeadMarketMemory = { structuralFit: 'strong' | 'partial' | 'none' | null }

const FIT_RANK: Record<'strong' | 'partial' | 'none', number> = { none: 0, partial: 1, strong: 2 }

/**
 * La mémoire marché peut AMÉLIORER la compatibilité structurelle d'une piste.
 * Elle ne crée JAMAIS l'urgence ni le besoin.
 *
 * Pourquoi c'est une garde et pas une intention : « sur des comptes comparables
 * ce sujet est souvent externalisé » est une observation sur ce qu'on SAIT du
 * marché (GA-259), jamais un fait sur CE compte-ci. Si elle pouvait toucher la
 * fraîcheur, la demande ou l'accès, elle fabriquerait un « maintenant » que
 * personne n'a observé — et un commercial appellerait un DSI sur une urgence
 * inventée par une moyenne.
 *
 * Elle ne DESCEND pas non plus une compatibilité mieux établie par les faits du
 * compte : une moyenne ne corrige pas une observation.
 */
export function applyMarketMemoryToLead(base: LeadRankingInput, memory: LeadMarketMemory): LeadRankingInput {
  const next: LeadRankingInput = { ...base, offerFit: raisedFit(base.offerFit, memory.structuralFit) }
  if (!marketMemoryChangeIsLegal(base, next)) {
    throw new Error('#2172.26 — la mémoire marché ne peut toucher QUE la compatibilité structurelle.')
  }
  return next
}

function raisedFit(
  current: LeadRankingInput['offerFit'],
  fromMemory: LeadMarketMemory['structuralFit'],
): LeadRankingInput['offerFit'] {
  if (fromMemory === null) return current
  if (current === null) return fromMemory
  return FIT_RANK[fromMemory] > FIT_RANK[current] ? fromMemory : current
}

/**
 * L'INVARIANT, exposé pour être éprouvé : hors `offerFit`, une piste sort de la
 * mémoire marché byte pour byte. La garde est écrite en négatif (« tout sauf un
 * champ ») parce qu'un champ AJOUTÉ demain doit tomber du bon côté par défaut.
 */
export function marketMemoryChangeIsLegal(before: LeadRankingInput, after: LeadRankingInput): boolean {
  const keys = Object.keys(before) as (keyof LeadRankingInput)[]
  if (keys.length !== Object.keys(after).length) return false
  for (const key of keys) {
    if (key === 'offerFit') continue
    if (before[key] !== after[key]) return false
  }
  // Et dans le seul sens autorisé : vers le haut.
  if (before.offerFit !== null && after.offerFit !== null) {
    return FIT_RANK[after.offerFit] >= FIT_RANK[before.offerFit]
  }
  return true
}

// ── Les huit actions (#2172.28 → .35) ────────────────────────────────────────

export const LEAD_ACTIONS = [
  'qualify_now',
  'add_to_pipe',
  'create_need',
  'analyse_account',
  'find_contacts',
  'ask_laura',
  'snooze',
  'dismiss',
] as const
export type LeadAction = (typeof LEAD_ACTIONS)[number]

// ── La conversion en opportunité (#2172.36 → .41, .53) ───────────────────────

/**
 * LES CINQ SEULS CHAMPS DEMANDÉS À LA CONVERSION.
 *
 * Tout ce qui est déjà connu — le compte, le périmètre, les faits sources, la
 * date, l'expertise rapprochée — ne se ressaisit pas : le formulaire les
 * REPREND. Un écran qui les redemande fait retaper ce que le produit vient de
 * trouver, et c'est le geste qui fait abandonner une file de qualification.
 *
 * `.strict()` n'est pas une précaution de validation : c'est la règle. Une clé
 * de plus dans la charge utile est une ressaisie qui se réintroduit.
 */
export const LEAD_CONVERSION_FIELDS = ['owner_id', 'objective', 'initial_stage', 'next_action', 'need'] as const

export const leadConversionSchema = z
  .object({
    /** Le porteur. Jamais déduit du créateur du compte. */
    owner_id: z.string().min(1),
    /** Ce qu'on cherche à obtenir — une phrase, pas un montant. */
    objective: z.string().min(1).max(200),
    /** L'étape de DÉPART dans le pipe. Les cinq étapes figées. */
    initial_stage: z.enum(PIPELINE_STAGES),
    next_action: z.object({ title: z.string().min(1).max(200), due_on: z.string().min(1) }),
    /** Le besoin ÉVENTUEL : `null` quand il n'y en a pas encore. */
    need: z.string().max(200).nullable(),
  })
  .strict()
export type LeadConversion = z.infer<typeof leadConversionSchema>

// ── L'écartement (#2172.42 → .49, .54) ───────────────────────────────────────

/** Les sept motifs d'écartement. `other` en dernier — GA-08 : on ajoute en fin. */
export const LEAD_DISMISS_REASONS = [
  'out_of_target',
  'no_real_demand',
  'bad_timing',
  'no_access',
  'false_data',
  'already_handled',
  'other',
] as const
export const leadDismissReasonSchema = z.enum(LEAD_DISMISS_REASONS)
export type LeadDismissReason = z.infer<typeof leadDismissReasonSchema>

export const LEAD_DISMISS_REASON_LABELS: Record<LeadDismissReason, { fr: string; en: string }> = {
  out_of_target: { fr: 'Hors cible', en: 'Out of target' },
  no_real_demand: { fr: 'Pas de demande réelle', en: 'No real demand' },
  bad_timing: { fr: 'Mauvais timing', en: 'Bad timing' },
  no_access: { fr: 'Pas d’accès', en: 'No access' },
  false_data: { fr: 'Donnée fausse', en: 'False data' },
  already_handled: { fr: 'Déjà traité', en: 'Already handled' },
  other: { fr: 'Autre', en: 'Other' },
}

/**
 * LA PORTÉE D'UN ÉCARTEMENT — l'espace de travail, et rien au-delà.
 *
 * Ce qui est vrai pour cet espace ne devient pas vrai pour tout le monde : « pas
 * d'accès » veut dire que CETTE ESN n'a pas d'accès, « hors cible » que ce
 * compte n'est pas dans SA cible. Remonter l'un ou l'autre à la donnée marché
 * globale ferait disparaître la piste chez un concurrent qui, lui, avait un
 * accès — et ce serait, au passage, un échange d'informations entre ESN
 * concurrentes (`COMMUNITY_FORBIDDEN_KINDS`, GA-43).
 */
export const LEAD_DISMISSAL_SCOPE = 'workspace' as const

export type LeadDismissal = {
  leadKey: string
  reason: LeadDismissReason
  note: string | null
  scope: typeof LEAD_DISMISSAL_SCOPE
  /** La pierre tombale : datée, donc consultable et réversible à la main. */
  dismissedAt: string
  /** TOUJOURS `null`. Le champ existe pour que la garde ait quelque chose à
   *  lire, et pour qu'un contributeur qui voudrait écrire au marché voie le
   *  refus AVANT d'écrire le code. */
  marketMemoryWrite: null
}

export function buildLeadDismissal(input: {
  leadKey: string
  reason: LeadDismissReason
  note: string | null
  at?: Date
}): LeadDismissal {
  return {
    leadKey: input.leadKey,
    reason: input.reason,
    note: input.note,
    scope: LEAD_DISMISSAL_SCOPE,
    dismissedAt: (input.at ?? new Date()).toISOString(),
    marketMemoryWrite: null,
  }
}

/**
 * L'INVARIANT de l'écartement, exposé pour être éprouvé : il reste dans
 * l'espace, et il n'écrit rien au marché. On lui passe volontairement un
 * écartement fautif dans le test — c'est ce qui prouve qu'il sait dire non.
 */
export function dismissalStaysInWorkspace(dismissal: unknown): boolean {
  if (typeof dismissal !== 'object' || dismissal === null) return false
  const candidate = dismissal as Partial<LeadDismissal>
  if (candidate.scope !== LEAD_DISMISSAL_SCOPE) return false
  if (candidate.marketMemoryWrite !== null) return false
  return typeof candidate.dismissedAt === 'string' && candidate.dismissedAt.length > 0
}

/**
 * LE CORPS d'une décision prise sur une piste — `POST …/decision`.
 *
 * `.strict()` et l'ABSENCE de `scope` sont la garde : la portée n'est pas un
 * paramètre du client. Un appel qui essaierait d'écarter « pour tout le monde »
 * est refusé à la validation, avant même la contrainte SQL.
 */
export const leadDecisionInputSchema = z
  .object({
    decision: z.enum(['dismissed', 'snoozed']),
    reason: leadDismissReasonSchema.nullable().default(null),
    note: z.string().max(500).nullable().default(null),
    /** ISO. Exigée pour une veille, interdite pour un écartement. */
    snoozed_until: z.string().min(1).nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'dismissed') {
      if (!value.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['reason'],
          message: 'Un écartement porte toujours un motif.',
        })
      }
      if (value.snoozed_until) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['snoozed_until'],
          message: 'Une pierre tombale n’expire pas.',
        })
      }
      return
    }
    if (!value.snoozed_until) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snoozed_until'],
        message: 'Une mise en veille porte une échéance — sinon « plus tard » vaut « jamais ».',
      })
    }
    if (value.reason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reason'], message: 'Une veille n’est pas un refus.' })
    }
  })
export type LeadDecisionInput = z.infer<typeof leadDecisionInputSchema>

// ── La raison de la proposition et la vérification suivante (#2172.17 / .18) ──

/**
 * POURQUOI cette piste est proposée — et pourquoi c'est un CODE.
 *
 * Une raison construite en français dans la dérivation serait figée : l'écran
 * anglais afficherait une phrase française, et personne ne le verrait avant un
 * client anglophone. Les formes CONNUES restent des DONNÉES, jamais des phrases
 * — c'est la règle qu'`accountTopOpportunities` applique déjà pour les montants
 * et les dates.
 */
export const LEAD_PROPOSAL_REASONS = [
  'single_dated_fact',
  'converging_facts',
  'expressed_demand',
  'copilot_reading',
] as const
export const leadProposalReasonSchema = z.enum(LEAD_PROPOSAL_REASONS)
export type LeadProposalReason = z.infer<typeof leadProposalReasonSchema>

export const LEAD_PROPOSAL_REASON_LABELS: Record<LeadProposalReason, { fr: string; en: string }> = {
  single_dated_fact: {
    fr: 'Un fait daté sur ce compte, et rien qui le corrobore encore.',
    en: 'One dated fact on this account, and nothing corroborating it yet.',
  },
  converging_facts: {
    fr: 'Plusieurs faits datés pointent vers le même domaine.',
    en: 'Several dated facts point to the same domain.',
  },
  expressed_demand: {
    fr: 'Quelqu’un l’a écrit ou dit, et c’est tracé dans ton espace.',
    en: 'Someone wrote or said it, and it is traced in your workspace.',
  },
  copilot_reading: {
    fr: 'Laura l’a rapprochée des faits de ce dossier.',
    en: 'Laura matched it with this dossier’s facts.',
  },
}

/**
 * LA PROCHAINE VÉRIFICATION — la seule chose qu'une piste demande.
 *
 * Elle est PRÉCISE, et elle porte sur ce qui manque : une file qui dirait
 * « à qualifier » sur chaque ligne ne dirait rien. Ce n'est pas une action
 * commerciale : c'est le geste qui permet de décider s'il y en a une.
 */
export const LEAD_VERIFICATIONS = [
  'confirm_source',
  'find_contact',
  'confirm_scope',
  'confirm_expertise',
  'confirm_with_contact',
] as const
export const leadVerificationSchema = z.enum(LEAD_VERIFICATIONS)
export type LeadVerification = z.infer<typeof leadVerificationSchema>

export const LEAD_VERIFICATION_LABELS: Record<LeadVerification, { fr: string; en: string }> = {
  confirm_source: {
    fr: 'Retrouver la source du fait et vérifier sa date avant d’en parler.',
    en: 'Find the fact’s source and check its date before mentioning it.',
  },
  find_contact: {
    fr: 'Identifier un interlocuteur sur ce périmètre — aucun n’est connu.',
    en: 'Identify a contact on this perimeter — none is known yet.',
  },
  confirm_scope: {
    fr: 'Délimiter le périmètre : quelle entité, quel site, quelle direction.',
    en: 'Delimit the perimeter: which entity, which site, which department.',
  },
  confirm_expertise: {
    fr: 'Vérifier laquelle de tes expertises ce chantier appelle.',
    en: 'Check which of your areas of expertise this programme calls for.',
  },
  confirm_with_contact: {
    fr: 'Demander à un interlocuteur si le chantier est ouvert, et sous quel budget.',
    en: 'Ask a contact whether the programme is open, and under which budget.',
  },
}

// ── La piste, telle qu'un écran la lit (#2172.10 → .19) ──────────────────────

/** Un fait source : ce qu'il dit, d'où il vient, quand il a été observé. */
export const leadSourceFactSchema = z.object({
  label: z.string(),
  /** `null` = la source n'est pas identifiée — c'est un MANQUE, pas un vide. */
  source: z.string().nullable(),
  /** `null` = le fait n'est pas daté. Jamais une date devinée. */
  observed_on: z.string().nullable(),
})

export const qualificationLeadSchema = z.object({
  /** Clé stable de la piste — c'est elle que porte une décision. */
  key: z.string(),
  account_id: z.string(),
  company_name: z.string().nullable(),
  logo_url: z.string().nullable(),
  label: z.string(),
  evidence_level: leadEvidenceLevelSchema,
  /** #2172.11 — le périmètre : l'entité, le site, la direction concernée. */
  perimeter: z.string().nullable(),
  /** #2172.12 — le fait, ou les signaux, qui la soutiennent. Jamais vide. */
  source_facts: z.array(leadSourceFactSchema).min(1),
  /** #2172.13 — la date de la piste, celle du fait le plus récent. */
  observed_on: z.string().nullable(),
  /** #2172.14 — l'expertise rapprochée, de TON catalogue. */
  matched_expertise: z.string().nullable(),
  /** #2172.15 — le rôle potentiellement concerné. Un RÔLE, pas une personne. */
  potential_role: z.string().nullable(),
  /** #2172.16 — ce qui manque, nommé. */
  missing: z.array(z.enum(Object.keys(LEAD_MISSING_INFO) as [LeadMissingInfo, ...LeadMissingInfo[]])),
  /** #2172.17 — pourquoi elle est proposée. Un CODE, jamais une phrase : une
   *  phrase construite dans la dérivation serait figée en français pour
   *  toujours, et deux écritures de la même raison divergent. */
  proposal_reason: leadProposalReasonSchema,
  /** #2172.18 — la prochaine vérification, précise. Un code, même raison. */
  next_verification: leadVerificationSchema,
})
export type QualificationLead = z.infer<typeof qualificationLeadSchema>
