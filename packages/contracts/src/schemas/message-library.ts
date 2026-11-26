import { contentVisibilitySchema } from './shared-content.js'
import { z } from 'zod'
import {
  OUTREACH_CHANNELS,
  OUTREACH_PERSONAS,
  OUTREACH_SCENARIO_IDS,
  OUTREACH_SCENARIOS,
} from './outreach-scenarios.js'

/**
 * #3427 — LA BIBLIOTHÈQUE VERSIONNÉE D'EXEMPLES COMMERCIAUX.
 *
 * `message-matrix.ts` le dit lui-même : « la matrice dit COMMENT écrire,
 * jamais QUOI écrire » — aucun gabarit verbatim n'existe nulle part dans le
 * dépôt (`outreach-scenarios.ts` : « un gabarit recopié devient un message
 * envoyé tel quel », donc aucun n'y est stocké). Ce fichier COMBLE ce trou,
 * il ne duplique rien : une entrée d'ici porte le TEXTE, jamais la structure
 * (cadence, ton, interdits) que les registres existants possèdent déjà.
 *
 * Deux catégories, jamais confondues (`mode`) :
 * - `verbatim` — un MODÈLE APPROUVÉ, repris mot pour mot, seules les
 *   `expectedVariables` changent (`renderVerbatim`).
 * - `inspiration` — un EXEMPLE DE COMPORTEMENT pour Laura : jamais repris
 *   automatiquement, jamais candidat de `selectApprovedTemplate`.
 *
 * RÈGLE ABSOLUE (le corps de #3427, verbatim) : un texte portant une
 * affirmation sur une relation, un partenaire, un référencement, un client,
 * un résultat, un délai, une disponibilité, une mission, un projet, une
 * technologie ou un chiffre ne peut être « prêt à envoyer » tant que
 * l'affirmation n'est pas soutenue par une donnée réelle et autorisée
 * (`verifiedFactId` non nul). Jamais devinée : `evaluateReadiness` ne
 * vérifie RIEN elle-même, elle lit seulement ce qui a été déclaré vérifié —
 * doctrine « jamais de donnée fictive ».
 *
 * La sélection (`selectApprovedTemplate`) ne compare JAMAIS le texte de la
 * demande au texte des entrées (interdit explicite du corps de l'issue :
 * « ne doit jamais choisir un exemple uniquement parce que certains mots
 * ressemblent à la demande ») — seuls les champs structurés du registre
 * partagé (`OutreachChannel`, `OutreachScenarioId`, `OutreachPersona`)
 * décident, et chaque décision garde sa trace (`MessageLibrarySelectionTrace`).
 */

export const MESSAGE_LIBRARY_MODES = ['verbatim', 'inspiration'] as const
export const messageLibraryModeSchema = z.enum(MESSAGE_LIBRARY_MODES)
export type MessageLibraryMode = (typeof MESSAGE_LIBRARY_MODES)[number]

export const MESSAGE_LIBRARY_STATUSES = ['approuve', 'a_revoir', 'historique', 'interdit'] as const
export const messageLibraryStatusSchema = z.enum(MESSAGE_LIBRARY_STATUSES)
export type MessageLibraryStatus = (typeof MESSAGE_LIBRARY_STATUSES)[number]

/** Les onze catégories d'affirmation que la RÈGLE ABSOLUE nomme, verbatim. */
export const MESSAGE_LIBRARY_CLAIM_KINDS = [
  'relation',
  'partenaire',
  'referencement',
  'client',
  'resultat',
  'delai',
  'disponibilite',
  'mission',
  'projet',
  'technologie',
  'chiffre',
] as const
export const messageLibraryClaimKindSchema = z.enum(MESSAGE_LIBRARY_CLAIM_KINDS)
export type MessageLibraryClaimKind = (typeof MESSAGE_LIBRARY_CLAIM_KINDS)[number]

export const messageLibraryClaimSchema = z.object({
  kind: messageLibraryClaimKindSchema,
  statement: z.string().min(1),
  /** `null` = affirmation déclarée, pas encore soutenue par une donnée réelle. */
  verifiedFactId: z.string().min(1).nullable(),
})
export type MessageLibraryClaim = z.infer<typeof messageLibraryClaimSchema>

/**
 * #3439.1 — la confirmation d'UN fait obligatoire : quel fait, par QUI, QUAND.
 * Posée par un geste humain explicite (`confirmMandatoryFact`), jamais déduite
 * ni par le modèle ni par la ressemblance d'un texte (doctrine : « jamais de
 * donnée fictive »).
 */
export const messageLibraryFactConfirmationSchema = z.object({
  fact: z.string().min(1),
  confirmedBy: z.string().min(1),
  confirmedAt: z.string().datetime(),
})
export type MessageLibraryFactConfirmation = z.infer<typeof messageLibraryFactConfirmationSchema>

export const confirmMandatoryFactRequestSchema = z.object({ fact: z.string().min(1) })
export type ConfirmMandatoryFactRequest = z.infer<typeof confirmMandatoryFactRequestSchema>

/**
 * #3437 / #3438 / #3440 — l'ÉTAPE d'une séquence : la note d'invitation (avant
 * acceptation), puis M1 (ouverture), M2 (apport de valeur, J+5 / J+7), M3
 * (clôture, J+12 / J+14). Sans elle, les trois messages d'un même persona
 * partageaient canal + scénario + persona et la sélection en rendait un au
 * hasard de l'ordre de lecture.
 */
export const MESSAGE_LIBRARY_STEPS = ['invitation', 'M1', 'M2', 'M3'] as const
export const messageLibraryStepSchema = z.enum(MESSAGE_LIBRARY_STEPS)
export type MessageLibraryStep = (typeof MESSAGE_LIBRARY_STEPS)[number]

export const messageLibraryEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** Le texte complet, `{{variable}}` pour chaque entrée d'`expectedVariables`. */
  text: z.string().min(1),
  origin: z.string().min(1),
  sourceDocument: z.string().min(1),
  version: z.number().int().positive(),
  date: z.string().datetime(),
  channel: z.enum(OUTREACH_CHANNELS),
  scenarioId: z.enum(OUTREACH_SCENARIO_IDS),
  persona: z.enum(OUTREACH_PERSONAS),
  /** Rôle dans la décision — texte libre (le comité d'achat a son propre
   *  classifieur côté `apps/ia`, non partagé en TS ; on ne le duplique pas). */
  decisionRole: z.string().min(1),
  stage: z.string().min(1),
  route: z.string().min(1),
  /** L'étape dans la séquence ; absente = entrée sans séquence (exemple isolé). */
  step: messageLibraryStepSchema.nullish(),
  objective: z.string().min(1),
  expectedVariables: z.array(z.string().min(1)),
  mandatoryFacts: z.array(z.string().min(1)),
  /** Les faits de `mandatoryFacts` confirmés par un humain ; absent = aucun. */
  factConfirmations: z.array(messageLibraryFactConfirmationSchema).optional(),
  claims: z.array(messageLibraryClaimSchema),
  status: messageLibraryStatusSchema,
  mode: messageLibraryModeSchema,
  usageConstraints: z.array(z.string().min(1)),
  /** #4158.30 — partagé avec l'équipe (défaut) ou personnel ; l'auteur et la dernière mise à jour. */
  visibility: contentVisibilitySchema.optional(),
  createdBy: z.string().guid().nullable().optional(),
  updatedAt: z.string().optional(),
})
export type MessageLibraryEntry = z.infer<typeof messageLibraryEntrySchema>

/** La surface HTTP de création — l'`id` naît côté base, jamais fourni. */
export const createMessageLibraryEntrySchema = messageLibraryEntrySchema.omit({
  id: true,
  factConfirmations: true,
  createdBy: true,
  updatedAt: true,
})
export type CreateMessageLibraryEntry = z.infer<typeof createMessageLibraryEntrySchema>

export const renderMessageLibraryEntryRequestSchema = z.object({
  variables: z.record(z.string(), z.string()),
})
export type RenderMessageLibraryEntryRequest = z.infer<typeof renderMessageLibraryEntryRequestSchema>

/** Les faits obligatoires qu'aucun humain n'a encore confirmés (#3439.1). */
export function unconfirmedMandatoryFacts(
  entry: Pick<MessageLibraryEntry, 'mandatoryFacts' | 'factConfirmations'>,
): string[] {
  const confirmed = new Set((entry.factConfirmations ?? []).map(c => c.fact))
  return entry.mandatoryFacts.filter(fact => !confirmed.has(fact))
}

/** Dérivé de `OUTREACH_SCENARIOS`, jamais stocké une seconde fois (GA-26). */
export function relationshipStateOf(entry: Pick<MessageLibraryEntry, 'scenarioId'>): string {
  return OUTREACH_SCENARIOS[entry.scenarioId].relationshipState
}

export type MessageLibraryReadiness =
  | { readonly ready: true }
  | {
      readonly ready: false
      readonly reason: string
      readonly blockedClaims: readonly MessageLibraryClaim[]
    }

/**
 * La RÈGLE ABSOLUE. Un statut `historique` ou `interdit` n'est JAMAIS activable
 * — les textes historiques « restent archivés mais ne sont pas activables
 * comme messages prêts à envoyer » (corps de #3427, verbatim). Une affirmation
 * sans `verifiedFactId` bloque, quel que soit le statut par ailleurs.
 *
 * #3439 (recette prod, 30/09/2026) — un scénario portant des
 * `mandatoryFacts` (ex. « identité du référent confirmée ») ne se propose
 * QUE si chacun est confirmé (corps de #3427 : « Sans cela, le scénario ne
 * doit pas être proposé »). Tant qu'un fait n'est pas confirmé, une entrée qui EN déclare
 * reste bloquée, quel que soit son statut par ailleurs.
 * #3439.1 — le mécanisme existe : `factConfirmations` (qui, quand), posé par
 * `POST /message-library/:id/confirm-fact`. tranché sans Louis : un membre
 * avec le droit d'écriture des fiches confirme, fait par fait ; jamais le
 * modèle.
 */
export function evaluateReadiness(entry: MessageLibraryEntry): MessageLibraryReadiness {
  if (entry.status === 'historique' || entry.status === 'interdit') {
    return {
      ready: false,
      reason: `statut ${entry.status} : archivé, jamais activable comme message prêt à envoyer`,
      blockedClaims: [],
    }
  }
  const unconfirmed = unconfirmedMandatoryFacts(entry)
  if (unconfirmed.length > 0) {
    return {
      ready: false,
      reason: `fait(s) obligatoire(s) non confirmé(s) : ${unconfirmed.join(', ')}`,
      blockedClaims: [],
    }
  }
  const blockedClaims = entry.claims.filter(claim => claim.verifiedFactId == null)
  if (blockedClaims.length > 0) {
    // #3437 (recette 03/10) — le motif NOMME le chiffre ou l'affirmation : « écarté » seul ne dit
    // pas ce qu'il faut vérifier.
    const named = blockedClaims.map(claim => `« ${claim.statement} »`).join(', ')
    return {
      ready: false,
      reason: `affirmation non soutenue par une donnée réelle et autorisée : ${named}`,
      blockedClaims,
    }
  }
  if (entry.status !== 'approuve') {
    return { ready: false, reason: `statut ${entry.status} : pas encore approuvé`, blockedClaims: [] }
  }
  return { ready: true }
}

export const confirmMessageClaimRequestSchema = z.object({ claimIndex: z.number().int().min(0) })
export type ConfirmMessageClaimRequest = z.infer<typeof confirmMessageClaimRequestSchema>

/**
 * #3437 / #3438 (recette prod 03/10) — confirmer UNE affirmation (chiffre, résultat, délai) : un geste
 * HUMAIN explicite, jamais le modèle. Trace qui et quand dans `verifiedFactId`
 * (`confirmed-by:<userId>@<date>`) ; reconfirmer garde le premier confirmant.
 *
 * tranché sans Louis : une entrée « à revoir » dont la SEULE raison était ses affirmations devient
 * `approuve` quand la dernière est confirmée — sauf si un fait obligatoire reste à confirmer, si le
 * texte est déclaré tronqué, ou si le statut est archivé/interdit (jamais activable).
 */
export function confirmMessageClaim(
  entry: Pick<MessageLibraryEntry, 'claims' | 'status' | 'mandatoryFacts' | 'factConfirmations' | 'usageConstraints'>,
  claimIndex: number,
  confirmedBy: string,
  confirmedAt: string,
): Pick<MessageLibraryEntry, 'claims' | 'status'> {
  const target = entry.claims[claimIndex]
  if (!target) throw new Error('claim_index_out_of_range')
  const claims = entry.claims.map((claim, index) =>
    index === claimIndex && claim.verifiedFactId == null
      ? { ...claim, verifiedFactId: `confirmed-by:${confirmedBy}@${confirmedAt}` }
      : claim,
  )
  const settled =
    claims.every(claim => claim.verifiedFactId != null) &&
    unconfirmedMandatoryFacts(entry).length === 0 &&
    !entry.usageConstraints.some(constraint => /tronqu/i.test(constraint))
  return { claims, status: entry.status === 'a_revoir' && settled ? 'approuve' : entry.status }
}

export const messageLibrarySelectionCriteriaSchema = z.object({
  channel: z.enum(OUTREACH_CHANNELS),
  scenarioId: z.enum(OUTREACH_SCENARIO_IDS),
  persona: z.enum(OUTREACH_PERSONAS),
  /** Optionnelle : absente, l'étape la plus précoce disponible gagne. */
  step: messageLibraryStepSchema.optional(),
})
export type MessageLibrarySelectionCriteria = z.infer<typeof messageLibrarySelectionCriteriaSchema>

export type MessageLibrarySelectionTrace = {
  readonly selectedId: string | null
  /** Pourquoi CETTE entrée (ou pourquoi aucune) — le test de traçabilité
   *  demandé par #3427 lit ce champ, jamais une déduction a posteriori. */
  readonly reasons: readonly string[]
  /** Chaque écarté se nomme (titre) ; `matchesCriteria` distingue celui qui
   *  convenait au canal/scénario/persona mais que la règle absolue bloque (le
   *  motif qui compte pour la personne) de celui qui était simplement ailleurs.
   *  Les premiers passent devant : un plafond d'affichage ne les coupe pas. */
  readonly rejected: readonly {
    readonly id: string
    readonly title: string
    readonly reason: string
    readonly matchesCriteria: boolean
  }[]
}

/** L'ordre des étapes ; une entrée sans étape passe après toutes les autres. */
function stepRank(step: MessageLibraryStep | null | undefined): number {
  return step ? MESSAGE_LIBRARY_STEPS.indexOf(step) : MESSAGE_LIBRARY_STEPS.length
}

/**
 * Sélectionne un MODÈLE APPROUVÉ par ses champs structurés — jamais par
 * ressemblance de mots avec une demande libre (interdit explicite de #3427).
 * Déterministe : à égalité de critères, la version la plus haute gagne, puis
 * la date la plus récente.
 */
export function selectApprovedTemplate(
  entries: readonly MessageLibraryEntry[],
  criteria: MessageLibrarySelectionCriteria,
): MessageLibrarySelectionTrace {
  const rejected: { id: string; title: string; reason: string; matchesCriteria: boolean }[] = []
  const candidates = entries.filter(entry => {
    if (entry.mode !== 'verbatim') {
      rejected.push({
        id: entry.id,
        title: entry.title,
        reason: 'mode inspiration : jamais sélectionnable verbatim',
        matchesCriteria: false,
      })
      return false
    }
    if (entry.channel !== criteria.channel) {
      rejected.push({
        id: entry.id,
        title: entry.title,
        reason: `canal ${entry.channel} ≠ ${criteria.channel} demandé`,
        matchesCriteria: false,
      })
      return false
    }
    if (entry.scenarioId !== criteria.scenarioId) {
      rejected.push({
        id: entry.id,
        title: entry.title,
        reason: `scénario ${entry.scenarioId} ≠ ${criteria.scenarioId} demandé`,
        matchesCriteria: false,
      })
      return false
    }
    if (entry.persona !== criteria.persona) {
      rejected.push({
        id: entry.id,
        title: entry.title,
        reason: `persona ${entry.persona} ≠ ${criteria.persona} demandé`,
        matchesCriteria: false,
      })
      return false
    }
    if (criteria.step !== undefined && entry.step !== criteria.step) {
      rejected.push({
        id: entry.id,
        title: entry.title,
        reason: `étape ${entry.step ?? 'non précisée'} ≠ ${criteria.step} demandée`,
        matchesCriteria: false,
      })
      return false
    }
    const readiness = evaluateReadiness(entry)
    if (!readiness.ready) {
      rejected.push({ id: entry.id, title: entry.title, reason: readiness.reason, matchesCriteria: true })
      return false
    }
    return true
  })

  rejected.sort((a, b) => Number(b.matchesCriteria) - Number(a.matchesCriteria))

  if (candidates.length === 0) {
    // #3427 (recette prod 02/10) — « aucun message approuvé » sans motif : en prod la
    // bibliothèque n'était pas importée, donc AUCUN écarté à nommer. Une bibliothèque
    // vide se dit vide, avec le geste qui la remplit.
    if (entries.length === 0) {
      return {
        selectedId: null,
        reasons: [
          'la bibliothèque de l’espace est vide : aucune séquence n’a été importée (Réglages › Base de connaissance › Bibliothèque › « Importer les séquences livrées »)',
        ],
        rejected,
      }
    }
    return { selectedId: null, reasons: ['aucun modèle approuvé ne correspond aux critères'], rejected }
  }

  const [selected] = [...candidates].sort(
    (a, b) => stepRank(a.step) - stepRank(b.step) || b.version - a.version || b.date.localeCompare(a.date),
  )
  return {
    selectedId: selected.id,
    reasons: [
      `canal=${criteria.channel}`,
      `scénario=${criteria.scenarioId}`,
      `persona=${criteria.persona}`,
      ...(selected.step ? [`étape=${selected.step}`] : []),
      `version retenue=${selected.version}`,
    ],
    rejected,
  }
}

export type MessageLibraryRenderResult =
  | { readonly ok: true; readonly text: string; readonly variablesSubstituted: Readonly<Record<string, string>> }
  | { readonly ok: false; readonly reason: string; readonly missingVariables: readonly string[] }

/**
 * Substitue les `{{variable}}` du texte VERBATIM — jamais de réécriture libre
 * (« le texte n'est pas réécrit librement », corps de #3427). Bloque avant
 * toute substitution si l'entrée n'est pas prête (`evaluateReadiness`) : une
 * variable manquante ne devine jamais une valeur (« jamais de donnée
 * fictive »).
 */
export function renderVerbatim(
  entry: MessageLibraryEntry,
  variables: Readonly<Record<string, string>>,
): MessageLibraryRenderResult {
  const readiness = evaluateReadiness(entry)
  if (!readiness.ready) {
    return { ok: false, reason: readiness.reason, missingVariables: [] }
  }
  const missingVariables = entry.expectedVariables.filter(name => !(variables[name] ?? '').trim())
  if (missingVariables.length > 0) {
    return { ok: false, reason: 'variables attendues manquantes', missingVariables }
  }
  const text = entry.expectedVariables.reduce((acc, name) => acc.split(`{{${name}}}`).join(variables[name]), entry.text)
  return { ok: true, text, variablesSubstituted: variables }
}

export type MessageLibraryBehaviorExample = {
  readonly id: string
  readonly title: string
  /** Le texte COMPLET de l'exemple — pour s'en inspirer, jamais pour le réciter. */
  readonly text: string
  readonly objective: string
  readonly usageConstraints: readonly string[]
  /** Les affirmations de l'exemple qu'aucune donnée réelle ne soutient : à ne JAMAIS reprendre comme un fait. */
  readonly unverifiedClaims: readonly string[]
  readonly usage: 'behavior_only'
}

export type MessageLibraryBehaviorSelection = {
  readonly examples: readonly MessageLibraryBehaviorExample[]
  readonly reasons: readonly string[]
  readonly rejected: readonly { readonly id: string; readonly reason: string }[]
}

/**
 * #3443 / #3446 test 6 — les EXEMPLES DE COMPORTEMENT (`mode: inspiration`)
 * que Laura lit pour préserver scénario, logique, type de question et niveau
 * de pression. Même sélection structurée que `selectApprovedTemplate` (canal,
 * scénario, persona — jamais la ressemblance de mots), mais ils ne sont JAMAIS
 * rendus ni récités (`usage: 'behavior_only'`).
 *
 * tranché sans Louis : une affirmation non soutenue n'écarte PAS l'exemple
 * (on s'inspire d'un déroulé, on n'envoie pas son texte) — elle est NOMMÉE
 * dans `unverifiedClaims` pour que Laura ne la reprenne jamais comme un fait.
 * Un exemple archivé/interdit/à revoir, ou dont un fait obligatoire n'est pas
 * confirmé, reste écarté.
 */
export function selectBehaviorExamples(
  entries: readonly MessageLibraryEntry[],
  criteria: MessageLibrarySelectionCriteria,
): MessageLibraryBehaviorSelection {
  const rejected: { id: string; reason: string }[] = []
  const examples: MessageLibraryBehaviorExample[] = []
  for (const e of entries) {
    const reason = behaviorRejection(e, criteria)
    if (reason) {
      rejected.push({ id: e.id, reason })
      continue
    }
    examples.push({
      id: e.id,
      title: e.title,
      text: e.text,
      objective: e.objective,
      usageConstraints: e.usageConstraints,
      unverifiedClaims: e.claims.filter(c => c.verifiedFactId == null).map(c => c.statement),
      usage: 'behavior_only',
    })
  }
  if (examples.length === 0) {
    return { examples, reasons: ['aucun exemple de comportement ne correspond aux critères'], rejected }
  }
  return {
    examples,
    reasons: [`canal=${criteria.channel}`, `scénario=${criteria.scenarioId}`, `persona=${criteria.persona}`],
    rejected,
  }
}

function behaviorRejection(e: MessageLibraryEntry, c: MessageLibrarySelectionCriteria): string | null {
  if (e.mode !== 'inspiration') return 'mode verbatim : un modèle à reprendre, pas un exemple de comportement'
  if (e.status !== 'approuve') return `statut ${e.status} : jamais proposé comme exemple`
  if (e.channel !== c.channel) return `canal ${e.channel} ≠ ${c.channel} demandé`
  if (e.scenarioId !== c.scenarioId) return `scénario ${e.scenarioId} ≠ ${c.scenarioId} demandé`
  if (e.persona !== c.persona) return `persona ${e.persona} ≠ ${c.persona} demandé`
  const unconfirmed = unconfirmedMandatoryFacts(e)
  if (unconfirmed.length > 0) return `fait(s) obligatoire(s) non confirmé(s) : ${unconfirmed.join(', ')}`
  return null
}
