import { z } from 'zod'
import {
  esnAnswersSchema,
  isAnswerFilled,
  isPersonalAnswerKey,
  prefillConfidenceSchema,
  prefillSourceSchema,
  TEMPS2_ANSWER_KEYS,
  type EsnAnswers,
} from './onboarding.js'

/**
 * #2006 — le CONTRAT d'une réponse d'onboarding, au-delà de sa valeur brute.
 *
 * `EsnAnswers` (`onboarding.ts`) ne porte que la valeur : un dictionnaire de
 * 114 clés sans libellé de question, sans source, sans date, sans statut.
 * Personne ne peut dire d'où vient une réponse, si l'utilisateur l'a
 * confirmée, ni ce qu'elle change dans le produit. Ce fichier ajoute
 * l'ENVELOPPE, PAR CLÉ, à côté d'`EsnAnswers` — additif : un lecteur qui ne
 * connaît que la valeur continue de fonctionner à l'octet près.
 */

/**
 * #2006.8 — proposé (préremplissage jamais relu par l'utilisateur) · confirmé
 * (l'utilisateur a validé, même sans rien changer) · corrigé (l'utilisateur a
 * modifié une valeur proposée ou déjà confirmée) · inconnu (une valeur existe
 * mais son statut de confirmation n'a jamais pu être établi — jamais utilisé
 * par la migration : #2006.22 migre l'historique en `proposed`, pas `unknown`,
 * parce que la valeur EST une proposition de préremplissage ou une saisie,
 * jamais une absence).
 *
 * GA-08 — un enum ne perd jamais une valeur, n'en insère jamais une au
 * milieu : celui-ci est NEUF, il n'a pas d'historique à casser
 * (`enum-additivity.test.ts` : « un enum entièrement nouveau est libre »).
 */
export const ANSWER_STATUSES = ['proposed', 'confirmed', 'corrected', 'unknown'] as const
export const answerStatusSchema = z.enum(ANSWER_STATUSES)
export type AnswerStatus = z.infer<typeof answerStatusSchema>

/**
 * #2006.9 — la version du QUESTIONNAIRE, pas celle d'une réponse ni celle du
 * snapshot `esn_profiles.version` (qui compte les SAUVEGARDES d'un profil).
 * Ce nombre bouge quand une question est ajoutée, retirée du parcours, ou
 * reformulée d'une façon qui change son sens. Chaque réponse enregistre la
 * version en vigueur au moment où elle a été captée — jamais recalculée après
 * coup, sinon une vieille réponse semblerait avoir répondu à une question
 * qu'elle n'a jamais lue.
 */
export const CURRENT_QUESTIONNAIRE_VERSION = 1

/**
 * #2006.2 — la QUESTION elle-même, pas seulement sa clé technique : le
 * libellé qui était affiché ET sa version, pour qu'une reformulation future
 * n'efface pas ce que l'utilisateur a réellement lu au moment de répondre.
 */
export const answerQuestionRefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  version: z.number().int().positive(),
})
export type AnswerQuestionRef = z.infer<typeof answerQuestionRefSchema>

/**
 * #2006.4 / .5 / .6 / .7 — la provenance d'une réponse, sur le même PATRON
 * que `Provenance` (`provenance.ts` : la source ET la date) plutôt que
 * d'inventer deux champs séparés : `observedAt` et `actorId` reprennent le
 * nom exact des champs de `fieldProvenanceSchema`.
 *
 * `source` RÉUTILISE `PrefillSource` (`PrefillFieldMeta.source`,
 * `PrefillBadge.tsx`) plutôt qu'un second vocabulaire : `registry`/`pappers`
 * (registre), `website` (import du site), `inference` (déduction)
 * existaient déjà pour le préremplissage de l'identité d'entreprise ; `user`
 * (la personne a tapé la réponse elle-même) et `connector` (une connexion de
 * l'espace la porte, cf. `toolingMapKeysForConnectedTools`) sont AJOUTÉS EN
 * FIN (GA-08) pour couvrir les cinq sources d'une réponse en général.
 *
 * `confidence` RÉUTILISE `PrefillConfidence` : trois paliers NOMMÉS
 * (`high`/`medium`/`low`), jamais un nombre nu (doctrine « un score n'est
 * jamais nu »).
 */
export const answerProvenanceSchema = z.object({
  source: prefillSourceSchema,
  confidence: prefillConfidenceSchema,
  /** #2006.6 — ISO, ou `null` quand la source ne date pas l'observation. */
  observedAt: z.string().nullable(),
  /** #2006.7 — l'utilisateur qui a répondu/corrigé, `null` pour une source
   *  automatique (préremplissage, connecteur, déduction). */
  actorId: z.string().guid().nullable(),
})
export type AnswerProvenance = z.infer<typeof answerProvenanceSchema>

/**
 * #2006.10 — pourquoi CETTE question a été posée à CETTE personne. Les
 * branches réelles du parcours, vérifiées contre `ESN_PERSONAL_ANSWER_KEYS`,
 * `ESN_COMPANY_ANSWER_KEYS` et `TEMPS2_ANSWER_KEYS` (`onboarding.ts`) — un
 * enum NEUF, libre de tout historique. Aucune ramification conditionnelle
 * question-par-question n'existe ailleurs dans ce dépôt à ce jour ; en
 * ajouter une ici serait inventer un motif qu'aucun code ne tient.
 *
 * #2006.3 — `business_unit_profile` complète les deux branches personne /
 * entreprise avec la troisième couche du profil (`LAYERED_PROFILE_LAYERS`,
 * `layered-profile.ts` : `'company' | 'businessUnit' | 'person'`) : le
 * questionnaire a un niveau BU (`consultant_size_business_unit_band`,
 * `OnboardingBusinessUnitStep`) que ces deux branches ne pouvaient pas
 * nommer. AJOUTÉE EN FIN (GA-08) — un enum de production ne perd jamais une
 * valeur ni n'en insère une au milieu.
 */
export const ANSWER_BRANCH_REASONS = [
  'always_asked',
  'company_profile',
  'personal_profile',
  'temps2_after_first_analysis',
  'business_unit_profile',
] as const
export const answerBranchReasonSchema = z.enum(ANSWER_BRANCH_REASONS)
export type AnswerBranchReason = z.infer<typeof answerBranchReasonSchema>

/**
 * #2006.11 — CE QUE la réponse modifie dans le produit. Les dix aires
 * demandées par l'issue ; la preuve fichier:ligne par aire (ou l'aveu
 * qu'aucun consommateur n'est encore vérifié) vit dans
 * `onboarding-question-consumers.ts`, avec la garde qui empêche une question
 * d'exister sans y figurer.
 */
export const PRODUCT_CONSUMER_AREAS = [
  'scoring',
  'decouvrir',
  'priorisation',
  'contacts',
  'messages',
  'reverse_market',
  'laura',
  'routines',
  'pilotage',
  'audit',
] as const
export const productConsumerAreaSchema = z.enum(PRODUCT_CONSUMER_AREAS)
export type ProductConsumerArea = z.infer<typeof productConsumerAreaSchema>

/** #2006.2 → .11 fusionnés — l'enveloppe complète d'UNE réponse, à côté de sa
 *  valeur brute dans `EsnAnswers`. */
export const answerMetaSchema = z.object({
  question: answerQuestionRefSchema,
  questionnaireVersion: z.number().int().positive(),
  provenance: answerProvenanceSchema,
  status: answerStatusSchema,
  branchReason: answerBranchReasonSchema,
  consumerAreas: z.array(productConsumerAreaSchema),
})
export type AnswerMeta = z.infer<typeof answerMetaSchema>

/** Persisté PAR CLÉ, additif à côté d'`EsnAnswers` — `esn_profiles.answer_meta`
 *  (migration `1795000000001-OnboardingAnswerMeta.ts`, #2006.22). */
export const answerMetaMapSchema = z.record(z.string(), answerMetaSchema)
export type AnswerMetaMap = z.infer<typeof answerMetaMapSchema>

/**
 * #2006.22 — la migration qui ne réécrit RIEN en base : elle dit comment LIRE
 * une ligne qui n'a pas encore de `answer_meta` pour une clé donnée. Une
 * réponse historique existe (une valeur dans `EsnAnswers`, écrite avant ce
 * lot) sans jamais avoir eu de statut de confirmation — elle se lit
 * `proposed`, JAMAIS `confirmed` : personne n'a explicitement confirmé quoi
 * que ce soit, la présenter comme validée serait une donnée inventée.
 * `unknown` serait pire ici : la valeur n'est pas d'origine incertaine, elle
 * vient d'une saisie ou d'un préremplissage bien réels — ce qui manque, c'est
 * la CONFIRMATION, pas la connaissance.
 */
export function resolveAnswerStatus(meta: Pick<AnswerMeta, 'status'> | null | undefined): AnswerStatus {
  return meta?.status ?? 'proposed'
}

/**
 * #2006.22 (décision Louis 20/09/2026, QCM) — le motif de branchement d'UNE
 * clé, dérivé des classifications RÉELLES du parcours plutôt qu'inventé :
 * {@link TEMPS2_ANSWER_KEYS} prime sur {@link isPersonalAnswerKey} — depuis
 * D3/#2005.4, `client_references` et `no_go_sectors` sont routées ENTREPRISE
 * (`isPersonalAnswerKey` rend `false`) mais restent posées au Temps 2, donc
 * `temps2_after_first_analysis` reste leur motif réel. Pour tout le reste,
 * cette fonction suit EXACTEMENT la même règle que `splitAnswersByScope`
 * (`onboarding.ts`) — celle qui décide DÉJÀ sur quelle ligne une réponse
 * s'écrit (`EsnProfileService.persistAnswers`) : personnel si
 * `isPersonalAnswerKey`, entreprise sinon.
 *
 * `always_asked` et `business_unit_profile` restent VOLONTAIREMENT hors de
 * cette fonction : aucune clé n'est aujourd'hui classée ainsi par un code
 * vérifiable (aucun ensemble de clés ne les distingue de `company_profile`),
 * et les y ranger serait le motif de branchement FAUX que #2006.22 refuse
 * explicitement — « un motif de branchement faux est pire qu'un motif
 * absent : il ment au contrat. »
 */
export function resolveAnswerBranchReason(key: keyof EsnAnswers): AnswerBranchReason {
  if ((TEMPS2_ANSWER_KEYS as readonly string[]).includes(key as string)) return 'temps2_after_first_analysis'
  return isPersonalAnswerKey(key) ? 'personal_profile' : 'company_profile'
}

/**
 * #2006.22 (décision Louis 20/09/2026) — DÉCISION : tenir le badge de statut
 * ÉTEINT tant qu'aucune réponse n'a jamais été réellement confirmée. Un badge
 * qui affiche « non confirmé » sur chaque réponse d'un compte réel, parce que
 * rien n'y est jamais confirmé, ne distingue rien et n'informe personne —
 * c'est exactement l'état réfuté en production le 20/09 (réouverture de
 * l'issue à la recette). Dès qu'UNE clé porte `confirmed` ou `corrected`
 * (même grouping que `AnswerStatusBadge`, `ProfileStagePage.tsx`), le badge
 * redevient un signal utile PARTOUT sur l'écran : la question « qu'est-ce qui
 * a vraiment été relu, sur ce compte ? » a alors une réponse.
 */
export function hasAnyConfirmedAnswer(map: AnswerMetaMap): boolean {
  return Object.values(map).some(meta => meta.status === 'confirmed' || meta.status === 'corrected')
}

/**
 * #2007.9 — la COMPLÉTUDE transmise au moteur : combien de questions ont une
 * réponse, sur combien au total. Une dérivation PURE sur `EsnAnswers`
 * (`isAnswerFilled` par clé), donc calculable des DEUX côtés (API, tests)
 * sans jamais diverger — « une dérivation vit à un seul endroit » (GA-26).
 *
 * Jamais réduite à un pourcentage ici : un ratio nu perdrait le dénominateur,
 * et le moteur (ou un test) qui voudrait le total devrait le redemander
 * ailleurs. Les deux nombres voyagent ensemble.
 */
/**
 * #2007.6 / #2007.7 / #2007.10 / #2007.12 — ce que `answer_meta` (persisté par
 * `stampAnswerMeta`, #2006.22) transmet au MOTEUR, dérivé une seule fois
 * (GA-26) pour que l'API (`ProfileContextService.triggerGeneration`) et ce
 * test se lisent la même chose.
 *
 * Trois angles sur LA MÊME carte, jamais une quatrième donnée inventée :
 *  - #2007.6 / #2007.12 : une ligne « source, statut » par réponse CONNUE
 *    (dans `meta`) — le contrat portait déjà des valeurs typées (champs,
 *    unités, périodes) ; il lui manquait la source et le statut par réponse,
 *    « pas des phrases concaténées ».
 *  - #2007.7 : les clés dont la valeur vient d'une source EXTERNE plutôt que
 *    d'une saisie. Aucune capacité de ce dépôt ne modélise aujourd'hui un
 *    « contenu importé » distinct de cette provenance (grep vérifié,
 *    #2007.7 au registre) — « autorisé » se lit donc ici comme « la
 *    personne a laissé cette source alimenter sa réponse », pas comme un
 *    consentement RGPD séparé.
 *  - #2007.10 : les clés que l'utilisateur a CORRIGÉES après une première
 *    valeur (`status === 'corrected'`), un sous-ensemble du statut nommé à
 *    part parce que le point le demande séparément.
 *
 * Jamais une clé sans entrée dans `meta` : une réponse jamais confirmée ni
 * corrigée ne produit AUCUNE ligne (doctrine « non mesuré ≠ 0 » — une ligne
 * absente ne dit jamais qu'une réponse vaut rien, même principe que
 * `_COMPLEMENT_INTRO` côté Python, `bellum_profiler.py`).
 */
export const IMPORTED_ANSWER_SOURCES = ['registry', 'pappers', 'website', 'inference', 'connector'] as const

export type AnswerProvenanceForModel = {
  answerProvenanceLines: string[]
  importedContextKeys: string[]
  correctedAnswersLines: string[]
}

export function deriveAnswerProvenanceForModel(meta: AnswerMetaMap): AnswerProvenanceForModel {
  const answerProvenanceLines: string[] = []
  const importedContextKeys: string[] = []
  const correctedAnswersLines: string[] = []
  for (const key of Object.keys(meta).sort()) {
    const entry = meta[key]
    answerProvenanceLines.push(`${key}: source=${entry.provenance.source}, statut=${entry.status}`)
    if ((IMPORTED_ANSWER_SOURCES as readonly string[]).includes(entry.provenance.source)) {
      importedContextKeys.push(key)
    }
    if (entry.status === 'corrected') {
      correctedAnswersLines.push(`${key}: corrigé le ${entry.provenance.observedAt ?? 'date inconnue'}`)
    }
  }
  return { answerProvenanceLines, importedContextKeys, correctedAnswersLines }
}

/**
 * #2063.2/.3/.4/.5 — CLASSER CHAQUE RÉPONSE, sur `Réglages › Profil`.
 *
 * Tranché par Louis 22/09 soir (`decisions-louis-22-09-soir.md` §1) : la
 * recommandation écrite au registre (22/09 soir, lot audit-profiler)
 * s'applique — classifier au niveau de la RÉPONSE, en réutilisant
 * `AnswerProvenance.source` et `AnswerStatus`, DÉJÀ persistés et DÉJÀ
 * envoyés au Profileur (`deriveAnswerProvenanceForModel` ci-dessus), plutôt
 * qu'un enum orphelin sans producteur.
 *
 * Six des huit catégories de #2063 : « Déclaré » (#2063.1) et « Inconnu »
 * (#2063.6) étaient déjà `déjà là` (vocabulaire du prompt IA, `UnknownValue`)
 * — cette fonction les rend ici aussi, pour une classification COHÉRENTE et
 * complète, sans reformuler leur preuve d'existant. « Contradictoire »
 * (#2063.7) et « À vérifier » (#2063.8) restent hors de cette fonction : ce
 * sont des faits de l'AUDIT (`AuditContradiction`, comparaison entre
 * PLUSIEURS réponses), jamais dérivables d'UNE seule réponse — les y forcer
 * inventerait une tension que rien ne mesure (doctrine « jamais de donnée
 * fictive »).
 *
 * Mapping, un statut/une source → une catégorie, jamais deux à la fois :
 *  - statut `unknown` → `unknown` (le statut lui-même n'a jamais pu être
 *    établi, quelle que soit la source) ;
 *  - source `inference` → `deduced` (#2063.5, correspondance directe) ;
 *  - source `website` → `imported` (#2063.3, importé du site) ;
 *  - source `connector` → `observed` (#2063.4, lu dans un outil connecté) ;
 *  - source `registry`/`pappers` ET statut `confirmed` → `prefilled_confirmed`
 *    (#2063.2, exactement l'intitulé de l'issue) ;
 *  - source `registry`/`pappers` sans confirmation → `unknown` (un
 *    préremplissage jamais relu n'est ni confirmé ni déclaré : sa
 *    confirmation reste, de fait, non établie) ;
 *  - source `user` → `declared` (#2063.1, déjà là).
 */
export const ANSWER_KNOWLEDGE_BASES = [
  'declared',
  'prefilled_confirmed',
  'imported',
  'observed',
  'deduced',
  'unknown',
] as const
export const answerKnowledgeBasisSchema = z.enum(ANSWER_KNOWLEDGE_BASES)
export type AnswerKnowledgeBasis = z.infer<typeof answerKnowledgeBasisSchema>

export function resolveAnswerKnowledgeBasis(
  meta: Pick<AnswerMeta, 'status' | 'provenance'> | null | undefined,
): AnswerKnowledgeBasis {
  if (!meta || meta.status === 'unknown') return 'unknown'
  const { source } = meta.provenance
  if (source === 'inference') return 'deduced'
  if (source === 'website') return 'imported'
  if (source === 'connector') return 'observed'
  if (source === 'registry' || source === 'pappers')
    return meta.status === 'confirmed' ? 'prefilled_confirmed' : 'unknown'
  return 'declared'
}

export function computeAnswerCompleteness(answers: EsnAnswers): { answeredCount: number; totalCount: number } {
  const keys = Object.keys(esnAnswersSchema.shape) as (keyof EsnAnswers)[]
  // #2088.12 — `consultant_count` / `annual_revenue_amount` sont des `number`,
  // pas des `string`/`string[]` : le cast suit `isAnswerFilled`, élargi au
  // même endroit (GA-26).
  const answeredCount = keys.filter(key =>
    isAnswerFilled(answers[key] as string | number | readonly unknown[] | null | undefined),
  ).length
  return { answeredCount, totalCount: keys.length }
}
