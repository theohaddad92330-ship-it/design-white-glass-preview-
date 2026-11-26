import type { TFunction } from 'i18next'
import { detectQuestionnaireContradictions, unknownAnswerReasonOf, type UnknownAnswerReason } from '@bellum/contracts'
import {
  firstSlugOfStage,
  TEMPS1_STAGES,
  stageQuestions,
  questionsMatchingConditions,
  type Choice,
  type Question,
} from '@/features/onboarding/lib/questions'
import { presentedValue, validate } from '@/features/onboarding/lib/validation'
import type {
  OnboardingAnswerValue,
  OnboardingAnswers,
  OnboardingPrefillMeta,
  PrefillFieldMeta,
} from '@/stores/onboardingStore'

/**
 * #2030 — « RELIRE AVANT DE GÉNÉRER L'AUDIT » : les huit blocs du
 * récapitulatif, construits sur les VRAIES réponses Temps-1 (jamais une
 * donnée fictive). Trois blocs (Entreprise, Offre, Marché) ont déjà leurs
 * questions câblées dans `TEMPS1_STAGES` ; les quatre autres (BU, Utilisateur,
 * Système, Objectifs) n'ont pas encore de question Temps-1 — d'autres lots les
 * collectent (cf. le fichier de dispatch, L3/L14/L19). Le bloc existe quand
 * même (#2030.2-.7 : « le bloc existe » est le critère de recette), avec un
 * état honnête plutôt qu'une valeur inventée.
 */

// `ReviewFieldRowState`/`ReviewBlockState`/`ReviewBlockCode` ne sont consommés
// que dans ce fichier (knip) : `ReviewFieldRow`/`ReviewBlock` (exportés plus
// bas) suffisent aux appelants.
type ReviewFieldRowState = 'answered' | 'missing' | 'unconfirmedPrefill'

/**
 * #2089.11/.15-.19 — le statut DOCTRINE à cinq valeurs, ADDITIF à
 * `ReviewFieldRowState` (#2030, ci-dessus, ne change pas — 26 assertions
 * existantes le pinnent).
 *
 * #2089.17/.19 — `toVerify` et `contradictory` sont désormais DÉRIVÉS au
 * niveau ÉLÉMENT depuis deux signaux réels, jamais un statut deviné :
 *  - `contradictory` — la clé de cette question figure parmi celles d'une
 *    tension détectée par `detectQuestionnaireContradictions` (contrats,
 *    #2029, huit détecteurs purs déjà câblés côté écran de contradictions,
 *    `onboarding-contradictions.ts`) ; l'emporte sur `confirmed`/`proposed` —
 *    deux réponses en tension ne sont pas plus « confirmées » l'une que
 *    l'autre.
 *  - `toVerify` — un prérempli NON confirmé dont la `confidence` est
 *    `medium`/`low` (`PrefillConfidence`, docblock : « invite a review before
 *    the user clicks through ») ; un prérempli `high` reste `proposed`, comme
 *    avant.
 * Une réponse ABSENTE ne peut être ni l'un ni l'autre — `unknown` reste seul
 * juge d'une case vide (#2071.6/doctrine « non mesuré n'est jamais 0 »).
 */
// Non exporté : consommé uniquement dans ce fichier (`statusOf`, `ReviewFieldRow.status`)
// — `pnpm lint:exports:types` (knip) interdit d'exporter un type sans appelant externe.
/**
 * #2027.3 — `unmeasuredByChoice` : une réponse DÉCLARÉE incertaine
 * (`allowUnknown`, #2027.1). Distinct de `unknown` (jamais répondu) — l'audit
 * doit pouvoir dire « Ta marge n'est pas mesurée », jamais « Ta marge est
 * faible » ni la confondre avec une case simplement vide.
 */
type ReviewFieldStatus = 'confirmed' | 'proposed' | 'toVerify' | 'unknown' | 'contradictory' | 'unmeasuredByChoice'

function statusOf(
  rowState: ReviewFieldRowState,
  meta: PrefillFieldMeta | undefined,
  isContradictory: boolean,
  unknownReason: UnknownAnswerReason | null,
): ReviewFieldStatus {
  // #2027.3 — l'emporte sur tout : une réponse déclarée incertaine n'est ni
  // manquante, ni contradictoire, ni un prérempli à vérifier.
  if (unknownReason) return 'unmeasuredByChoice'
  if (rowState === 'missing') return 'unknown'
  if (isContradictory) return 'contradictory'
  if (rowState === 'unconfirmedPrefill') return meta?.confidence === 'high' ? 'proposed' : 'toVerify'
  return 'confirmed'
}

/**
 * #2089.12 — provenance (source + date) d'un élément PROPOSÉ, reprise
 * TELLE QUELLE de `prefillMeta` (déjà affichée par `PrefillBadge` sur l'écran
 * de question) : jamais recalculée, jamais devinée pour une réponse tapée
 * directement — `null` dans ce cas, pas une provenance fictive.
 */
// Non exporté, même raison que `ReviewFieldStatus` ci-dessus.
type ReviewFieldProvenance = { source: string; asOfIso: string | null }

export type ReviewFieldRow = {
  key: string
  labelKey: string
  /** Valeur AFFICHÉE : le libellé i18n d'un choix codé (`Choice.labelKey`,
   *  ex. `CLOUD_DEVOPS_SRE` → « Cloud, DevOps, SRE… »), ou la valeur PERSISTÉE
   *  verbatim quand la question n'a pas de catalogue de choix (elle porte déjà
   *  du français) — relecture onboarding : libellés, pas les codes (mesuré en
   *  prod le 15/09/2026). `null` quand rien n'est répondu — jamais une chaîne
   *  vide qui se lirait comme une vraie réponse (#2030.14). */
  value: string | null
  state: ReviewFieldRowState
  status: ReviewFieldStatus
  provenance: ReviewFieldProvenance | null
  /** #2027.4 — la raison déclarée, ou `null` sur une vraie réponse mesurée
   *  (ou une absence de réponse). Porte assez pour la liste « Informations à
   *  compléter » (#2030.8) sans redevoir relire la valeur persistée. */
  unknownReason: UnknownAnswerReason | null
}

type ReviewBlockState = 'confirmed' | 'toVerify'
type ReviewBlockCode = 'company' | 'businessUnit' | 'user' | 'offer' | 'market' | 'system' | 'goals' | 'unknowns'

export type ReviewEditTarget = { stage: string; slug: string }

export type ReviewBlock = {
  code: ReviewBlockCode
  titleKey: string
  rows: ReviewFieldRow[]
  state: ReviewBlockState
  /** #2030.9 — où corriger ce bloc. `null` quand aucune question Temps-1 ne le
   *  nourrit encore : un renvoi deviné vaudrait pire qu'aucun bouton. */
  editTarget: ReviewEditTarget | null
}

/**
 * Les choix connus d'une question, quelle que soit sa forme (`single`/`multi`
 * à plat, `multi-grouped` réparti en groupes) — le seul endroit qui les
 * aplatit (GA-26), pour que la résolution ci-dessous et un futur appelant ne
 * divergent pas sur « où chercher un choix ».
 */
function choicesOf(question: Question): Choice[] {
  if (question.kind === 'single' || question.kind === 'multi') return question.choices
  if (question.kind === 'multi-grouped') return question.groups.flatMap(g => g.choices)
  return []
}

/**
 * relecture onboarding : libellés, pas les codes (mesuré en prod le
 * 15/09/2026) — un code d'énumération PERSISTÉ (ex. `CLOUD_DEVOPS_SRE`,
 * `yes`) se résout vers son libellé i18n via `Choice.labelKey`, exactement
 * comme `QuestionField.tsx` le fait déjà pour l'écran de question
 * (`labelOf`) : un réglage vit à un seul endroit, mais une DÉRIVATION aussi
 * — recopier cette règle divergerait au premier choix ajouté sans son
 * pendant ici. Un code sans choix connu (question `text`/`tags`, ou valeur
 * absente du catalogue) s'affiche TEL QUEL — jamais vide, jamais deviné : la
 * doctrine « un champ illisible vaut `null`, jamais une valeur de
 * remplissage » vaut aussi pour un code qu'on ne sait pas traduire.
 */
function displayLabelOf(question: Question, rawValue: string, t: TFunction<'onboarding'>): string {
  const choice = choicesOf(question).find(c => c.value === rawValue)
  return choice?.labelKey ? t(choice.labelKey) : rawValue
}

/**
 * #2087.31 — exportée pour `onboarding-answers-recap.ts` (le drawer « Voir
 * mes réponses ») : LA dérivation « valeur persistée → libellé affichable »
 * vit ici (GA-26), un second lecteur ne la recopie pas.
 */
export function toDisplayValue(
  question: Question,
  value: OnboardingAnswerValue | undefined,
  t: TFunction<'onboarding'>,
): string {
  if (Array.isArray(value)) return value.map(v => displayLabelOf(question, v, t)).join(', ')
  return value ? displayLabelOf(question, value, t) : ''
}

function fieldRowOf(
  question: Question,
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta,
  contradictingKeys: ReadonlySet<string>,
  t: TFunction<'onboarding'>,
): ReviewFieldRow {
  const raw = answers[question.key]
  const filled = validate(question, presentedValue(question, raw))
  const meta = prefillMeta[question.key]
  const unconfirmedPrefill = filled && meta !== undefined
  const state: ReviewFieldRowState = !filled ? 'missing' : unconfirmedPrefill ? 'unconfirmedPrefill' : 'answered'
  // #2027.2 — une réponse d'INCERTITUDE (#2027.1) reste `answered` pour
  // `validate`/`state` (elle a bien une valeur, distincte d'une absence) ;
  // seul `status` la distingue d'une réponse mesurée.
  const unknownReason = unknownAnswerReasonOf(typeof raw === 'string' ? raw : null)
  // #2089.19 — une réponse ABSENTE ne peut pas être « en tension » avec une
  // autre : seule une valeur réellement déclarée entre dans un détecteur.
  const isContradictory = filled && contradictingKeys.has(question.key)
  return {
    key: question.key,
    labelKey: question.label,
    value: filled ? toDisplayValue(question, raw, t) : null,
    state,
    status: statusOf(state, meta, isContradictory, unknownReason),
    provenance: unconfirmedPrefill ? { source: meta.source, asOfIso: meta.asOf ?? null } : null,
    unknownReason,
  }
}

function rowsOfStage(
  stageCode: string,
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta,
  contradictingKeys: ReadonlySet<string>,
  t: TFunction<'onboarding'>,
): ReviewFieldRow[] {
  const stage = TEMPS1_STAGES.find(s => s.code === stageCode)
  if (!stage) return []
  // #2023.5 — une question que le branchement ne POSE pas ne se relit pas
  // « manquante » : elle n'a jamais été posée, l'afficher en rouge demanderait
  // de corriger un écran où elle n'apparaît pas.
  // #2089.19 arrive par le même appel : le filtre ci-dessus choisit QUELLES
  // questions sont relues, `contradictingKeys` dit lesquelles sont en tension.
  // Les deux sont orthogonaux — en garder un seul perdrait l'autre.
  // #2626.1 — la RELECTURE lit le catalogue, pas le parcours : une question
  // reposée au Temps 2 et déjà répondue doit rester visible ici. « Ce que
  // Bellum a compris » ne dépend pas du moment où la réponse a été donnée, et
  // on archive, on ne supprime pas. Seule la CONDITION de branchement filtre.
  return questionsMatchingConditions(stageQuestions(stage), answers).map(q =>
    fieldRowOf(q, answers, prefillMeta, contradictingKeys, t),
  )
}

function editTargetOfStage(stageCode: string): ReviewEditTarget | null {
  const slug = firstSlugOfStage(stageCode)
  return slug ? { stage: stageCode, slug } : null
}

function stateOf(rows: ReviewFieldRow[]): ReviewBlockState {
  return rows.length > 0 && rows.every(r => r.state === 'answered') ? 'confirmed' : 'toVerify'
}

function block(
  code: ReviewBlockCode,
  titleKey: string,
  rows: ReviewFieldRow[],
  editTarget: ReviewEditTarget | null,
): ReviewBlock {
  return { code, titleKey, rows, state: stateOf(rows), editTarget }
}

/** #2030.1-.8 — les huit blocs, dans l'ordre exact de l'issue. */
export function buildReviewBlocks(
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta,
  t: TFunction<'onboarding'>,
): ReviewBlock[] {
  // #2089.19 — calculé UNE fois pour tous les blocs : les huit détecteurs de
  // `@bellum/contracts` (#2029) sont la SEULE source de tension entre deux
  // réponses Temps-1 ; jamais une contradiction inventée depuis autre chose.
  const contradictingKeys = new Set(detectQuestionnaireContradictions(answers).flatMap(c => c.keys))
  const company = rowsOfStage('company_info', answers, prefillMeta, contradictingKeys, t)
  const offer = rowsOfStage('offer_expertise', answers, prefillMeta, contradictingKeys, t)
  const market = rowsOfStage('target_market', answers, prefillMeta, contradictingKeys, t)
  // #2027.4 — les inconnues DÉCLARÉES (#2027.1) alimentent une liste
  // d'informations à compléter : retirées de leur bloc d'origine (loi 4 du
  // tome 7 — jamais deux fois sous la même forme), regroupées ici. Un bloc
  // d'origine qui n'en portait qu'une reste éligible « confirmé » sur le
  // reste — une inconnue déclarée n'est PAS comptée comme un problème
  // (`review.dataWarning.description`).
  const isKnown = (row: ReviewFieldRow): boolean => row.unknownReason === null
  const unknowns = [...company, ...offer, ...market].filter(row => !isKnown(row))
  return [
    block('company', 'review.blocks.company.title', company.filter(isKnown), editTargetOfStage('company_info')),
    // #2030.2 — la BU est un LIBELLÉ DÉCLARATIF (Louis 15/09), pas une
    // partition : pas de question Temps-1 aujourd'hui, donc pas de ligne — le
    // bloc existe et nomme honnêtement ce qui manque plutôt que d'inventer une
    // valeur.
    block('businessUnit', 'review.blocks.businessUnit.title', [], null),
    block('user', 'review.blocks.user.title', [], null),
    block('offer', 'review.blocks.offer.title', offer.filter(isKnown), editTargetOfStage('offer_expertise')),
    block('market', 'review.blocks.market.title', market.filter(isKnown), editTargetOfStage('target_market')),
    block('system', 'review.blocks.system.title', [], null),
    block('goals', 'review.blocks.goals.title', [], null),
    // #2030.8 / #2027.4 — désormais peuplé par les réponses marquées
    // incertaines, quel que soit leur bloc d'origine.
    block('unknowns', 'review.blocks.unknowns.title', unknowns, null),
  ]
}
