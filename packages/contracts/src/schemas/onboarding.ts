import { z } from 'zod'
import type { UnknownAnswerReason } from './onboarding-unknown-answers.js'
import { effectifObservedAtMapSchema } from './onboarding-effectif-freshness.js'
import { AUTHORITY_SCALE_CHOICES } from './authority-scope.js'
import { ATTRIBUTION_ANSWER_FIELDS, HEARD_ABOUT_BELLUM_OPTIONS } from './onboarding/answers-attribution.js'
import { AUTORITE_ANSWER_FIELDS } from './onboarding/answers-autorite.js'
import { BASE_CLIENTS_ANSWER_FIELDS, CLIENT_BASE_COUNT_BAND_CHOICES } from './onboarding/answers-base-clients.js'
import { CANAUX_ANSWER_FIELDS, ENTRY_CHANNEL_VALUES, ENTRY_CHANNELS_USED_VALUES } from './onboarding/answers-canaux.js'
import { CHEMINS_ACCES_ANSWER_FIELDS } from './onboarding/answers-chemins-acces.js'
import { ANNUAL_REVENUE_PERIODS, CHIFFRES_CLES_ANSWER_FIELDS } from './onboarding/answers-chiffres-cles.js'
import { CLIENT_IDEAL_ANSWER_FIELDS } from './onboarding/answers-client-ideal.js'
import { COMPLEMENT_LIBRE_ANSWER_FIELDS } from './onboarding/answers-complement-libre.js'
import { CREDIBILITE_STAFFING_ANSWER_FIELDS } from './onboarding/answers-credibilite-staffing.js'
import {
  ASSOCIATES_COUNT_BAND,
  DELIVERY_TEAM_SIZE_BAND,
  EQUIPE_ANSWER_FIELDS,
  MARKETING_TEAM_SIZE_BAND,
  OPS_TEAM_SIZE_BAND,
  RECRUITERS_TEAM_SIZE_BAND,
  TEAM_COORDINATION_MODE,
} from './onboarding/answers-equipe.js'
import { FREINS_ANSWER_FIELDS, SALES_FREIN_CHOICES } from './onboarding/answers-freins.js'
import { IMPLANTATION_ANSWER_FIELDS } from './onboarding/answers-implantation.js'
import { INTERLOCUTEURS_ANSWER_FIELDS } from './onboarding/answers-interlocuteurs.js'
import { MATURITE_EFFECTIF_ANSWER_FIELDS } from './onboarding/answers-maturite-effectif.js'
import {
  ACTIVITY_MEASURE_VALUES,
  ACTIVITY_REFERENCE_PERIODS,
  MESURES_ANSWER_FIELDS,
} from './onboarding/answers-mesures.js'
import { offerDomainAnswerFields } from './onboarding/answers-offer-domains.js'
import { OFFRE_SECTEURS_ANSWER_FIELDS } from './onboarding/answers-offre-secteurs.js'
import { SECTEURS_NIVEAUX_ANSWER_FIELDS } from './onboarding/answers-secteurs-niveaux.js'
import { OBJECTIFS_ANSWER_FIELDS } from './onboarding/answers-objectifs.js'
import {
  OUTILLAGE_ANSWER_FIELDS,
  TOOLING_CONFIDENCE_CHOICES,
  TOOLING_DUPLICATES_CHOICES,
  TOOLING_EXPORT_CHOICES,
  TOOLING_FRESHNESS_CHOICES,
  TOOLING_PRESENCE_SCALE,
  TOOLING_REFERENCE_CHOICES,
  TOOLING_REFERENCE_DATA_CHOICES,
} from './onboarding/answers-outillage.js'
import { PROFILE_ANSWER_FIELDS } from './onboarding/answers-profil.js'
import { RECRUITMENT_ANSWER_FIELDS } from './onboarding/answers-recrutement.js'
export {
  RECRUITS_FOR_CLIENTS_VALUES,
  placesProfilesForClients,
  type RecruitsForClients,
} from './onboarding/answers-recrutement.js'
import { RESEAU_ANSWER_FIELDS } from './onboarding/answers-reseau.js'
import {
  ROUTINES_ANSWER_FIELDS,
  DOSSIER_CONTINUITY_BREAKS,
  DOSSIER_CONTINUITY_PRACTICES,
} from './onboarding/answers-routines.js'
import { SITE_WEB_ANSWER_FIELDS } from './onboarding/answers-site-web.js'
import {
  TEMPS_ANSWER_FIELDS,
  TEMPS_PERSONAL_ANSWER_KEYS,
  COMPETING_WORKLOADS,
  PROTECTED_SLOT_CAPACITY,
  WEEKLY_SALES_TIME_BANDS,
  WEEKLY_SALES_TIME_SLOTS,
  WORKLOAD_VARIABILITY,
} from './onboarding/answers-temps.js'
import { TEMPS1_ANSWER_FIELDS } from './onboarding/answers-temps1.js'
import { TEMPS2_ANSWER_FIELDS } from './onboarding/answers-temps2.js'
import { TERRITOIRE_REMOTE_ANSWER_FIELDS } from './onboarding/answers-territoire-remote.js'
import { TERRITOIRE_CAPACITE_ANSWER_FIELDS } from './onboarding/answers-territoire-capacite.js'
import { METIERS_PLACES_ANSWER_FIELDS } from './onboarding/answers-metiers-places.js'
import { WORKSPACE_PROFILE_ANSWER_FIELDS } from './onboarding/answers-profil-espace.js'
import { V23_ANSWER_FIELDS } from './onboarding/answers-v23.js'
import { VIVIER_ANSWER_FIELDS, VIVIER_COUNT_BAND_CHOICES } from './onboarding/answers-vivier.js'
import { workspaceRoleSchema } from './workspace.js'

/**
 * Pourquoi les champs de réponse vivent dans `./onboarding/` : les lots qui
 * ajoutent une question au questionnaire écrivent TOUS dans `esnAnswersSchema`.
 * Un fichier unique en faisait un verrou — et un contrat mal fusionné rend
 * `undefined` un champ que quelqu'un lit déjà. La règle pour la suite : **une
 * famille de réponses = un fichier ; ajouter un champ, c'est toucher UN bloc.**
 * L'index ci-dessous ne fait que recomposer, dans l'ordre d'avant l'éclatement.
 * Garde : `onboarding/answers.test.ts`.
 *
 * Ce fichier garde en revanche `OFFER_DOMAINS` et tout ce qui vient après le
 * schéma : la garde de parité de l'IA lit cette énumération ICI, par son chemin.
 */
export { ONBOARDING_MAX_MULTI, PROFILE_ANSWER_MAX_MULTI, TEMPS2_MAX_REFERENCES } from './onboarding/limits.js'
// #2059 — attribution marketing (« Comment as-tu connu {{brand}} ? »).
export { HEARD_ABOUT_BELLUM_OPTIONS } from './onboarding/answers-attribution.js'
/**
 * Canaux d'entrée (#2048) et unités comparables (#2049) — lot L19.
 *
 * Le catalogue ET les dérivations de doctrine sortent par ici : « non mesuré »
 * n'est jamais « 0 » (`channelAuditBuckets`), et aucun taux ne se calcule sans
 * dénominateur fiable (`comparableRate`). Ils sont publics parce que l'audit
 * qui les lira vit hors de ce paquet — une dérivation vit à UN endroit (GA-26),
 * et personne ne doit avoir à la refaire.
 */
export {
  ENTRY_CHANNELS,
  ENTRY_CHANNEL_VALUES,
  ENTRY_CHANNELS_USED_VALUES,
  channelAuditBuckets,
  type ChannelAuditBuckets,
  type ChannelAuditInput,
  type EntryChannel,
} from './onboarding/answers-canaux.js'
export {
  ACTIVITY_MEASURES,
  ACTIVITY_MEASURE_VALUES,
  ACTIVITY_REFERENCE_PERIODS,
  ORDER_OF_MAGNITUDE_PERIOD,
  activityPeriodIsExplicit,
  comparableRate,
  funnelBreak,
  type ActivityFunnelInput,
  type ActivityMeasure,
  type ComparableRateResult,
  type FunnelBreak,
  type RateRefusal,
} from './onboarding/answers-mesures.js'
/**
 * La LECTURE D'AUDIT (#2042.15, #2043.10, #2049.15, #2050.14, #2051.16) — cinq
 * dérivations pures sur les réponses déclarées, au même titre que
 * `channelAuditBuckets` juste au-dessus et pour la même raison : l'audit qui
 * les lit vit hors de ce paquet, et une dérivation vit à UN endroit (GA-26).
 *
 * Aucune ne rend de taux, de score ni de probabilité — aucun de leurs types
 * n'en porte le champ. `funnelBreak` sort déjà ci-dessus ; `auditFunnelBreak`
 * est son premier APPELANT hors test, pas une seconde version.
 */
export {
  accessStrategy,
  auditFunnelBreak,
  auditStartingPoint,
  routineProposalsFromBreaks,
  type AccessStrategy,
  type AuditStartingPoint,
  type RoutineProposal,
} from './onboarding/audit-readout.js'

/**
 * Les catalogues de valeurs des blocs L19, RÉ-EXPORTÉS pour le questionnaire
 * web : `packages/contracts/src/index.ts` n'expose que ce fichier, et les
 * sous-étapes `temps`, `temps-charge` et `routines` lisent ces listes au lieu de
 * les recopier (GA-26 — une borne de tranche vit à UN seul endroit ; trois
 * copies des bandes d'heures auraient divergé à la première borne ajustée et
 * rendu les trois états du temps incomparables).
 */
export {
  COMPETING_WORKLOADS,
  PROTECTED_SLOT_CAPACITY,
  WEEKLY_SALES_TIME_BANDS,
  WEEKLY_SALES_TIME_SLOTS,
  WORKLOAD_VARIABILITY,
} from './onboarding/answers-temps.js'
export { DOSSIER_CONTINUITY_BREAKS, DOSSIER_CONTINUITY_PRACTICES } from './onboarding/answers-routines.js'

/**
 * #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà du
 * commercial : les tranches d'associés, recruteurs, delivery, marketing, ops
 * et le mode de coordination, ré-exportées comme leurs voisines : l'écran
 * (`lib/questions/qui-fait-quoi.ts`) les CITE, il ne les recopie pas (GA-26).
 */
export {
  ASSOCIATES_COUNT_BAND,
  DELIVERY_TEAM_SIZE_BAND,
  MARKETING_TEAM_SIZE_BAND,
  OPS_TEAM_SIZE_BAND,
  RECRUITERS_TEAM_SIZE_BAND,
  TEAM_COORDINATION_MODE,
}

/**
 * #2088.12/.13 — le catalogue de périodes de `annual_revenue_amount`,
 * ré-exporté comme ses voisins : l'écran du questionnaire (`lib/questions/
 * chiffre-affaires.ts`) et tout lecteur futur le CITENT, ils ne le recopient
 * pas (GA-26).
 */
export { ANNUAL_REVENUE_PERIODS, type AnnualRevenuePeriod } from './onboarding/answers-chiffres-cles.js'

/**
 * #2052 — les objectifs commerciaux NOMMÉS, ré-exportés pour que l'app web (et
 * un futur écran de saisie) et l'API partagent le MÊME catalogue de natures,
 * de périodes et de niveaux d'engagement (GA-26 — une dérivation vit à un seul
 * endroit).
 */
export {
  esnObjectiveSchema,
  objectiveCommitmentLevelSchema,
  objectiveKindSchema,
  objectivePeriodSchema,
  OBJECTIFS_ANSWER_FIELDS,
  OBJECTIVE_COMMITMENT_LEVELS,
  OBJECTIVE_KINDS,
  OBJECTIVE_PERIODS,
  OBJECTIVES_MAX_ITEMS,
  type EsnObjective,
  type ObjectiveCommitmentLevel,
  type ObjectiveKind,
  type ObjectivePeriod,
} from './onboarding/answers-objectifs.js'

/**
 * Vivier déclaré (#2046) — les bandes et les quatre états au contrat
 * (`vivier-etats.ts` les consomme, ne les recopie jamais).
 */
export { VIVIER_COUNT_BAND_CHOICES, TALENT_POOL_STATES } from './onboarding/answers-vivier.js'
/**
 * Base de clients déclarée (#2047) — bandes et dérivation de capitalisation
 * (#2047.13 → .18), publique parce que `esnAnswersToProfileData` et les écrans
 * d'audit qui liront ce lien vivent hors de ce paquet.
 */
export { CLIENT_BASE_COUNT_BAND_CHOICES } from './onboarding/answers-base-clients.js'
export {
  CLIENT_BASE_CAPITALIZATION_LINKS,
  deriveClientBaseCapitalizationSignals,
  describeCapitalizationGap,
  type CapitalizationSignal,
  type ClientBaseCapitalizationInput,
  type ClientBaseCapitalizationLink,
  type ClientBaseCapitalizationSignals,
} from './onboarding/client-base-capitalization.js'

/**
 * #2054 / #2055 — les catalogues de la cartographie d'outillage et des freins
 * vivent dans leur bloc de réponses, et NULLE PART ailleurs : l'écran les
 * importe d'ici (`lib/questions/outillage.ts`, `lib/questions/freins.ts`), les
 * gardes les relisent, et un réglage vit à un seul endroit (GA-26).
 */
export {
  OUTILLAGE_ANSWER_FIELDS,
  TOOLING_CONFIDENCE_CHOICES,
  TOOLING_DUPLICATES_CHOICES,
  TOOLING_EXPORT_CHOICES,
  TOOLING_FRESHNESS_CHOICES,
  TOOLING_INTERNAL_NAMES_MAX,
  TOOLING_MAP_KEYS,
  TOOLING_REFERENCE_CHOICES,
  TOOLING_REFERENCE_DATA_CHOICES,
  TOOLING_PRESENCE_ABSENT,
  TOOLING_PRESENCE_SCALE,
  toolingFamilyIsAbsent,
  toolingMapKeysForConnectedTools,
  type ToolingMapKey,
} from './onboarding/answers-outillage.js'
export {
  FREINS_ANSWER_FIELDS,
  SALES_FREIN_CHOICES,
  readSalesFreins,
  type SalesFreinReading,
} from './onboarding/answers-freins.js'
/**
 * #2060 — la question ouverte qui FERME le parcours, et sa lecture « non
 * mesuré n'est jamais 0 » (GA-18/GA-19). Ré-exportée comme ses voisines :
 * l'écran (`lib/questions/complement-libre.ts`) et un futur lecteur d'audit
 * la lisent d'ici, jamais d'une copie.
 */
export { COMPLEMENT_LIBRE_ANSWER_FIELDS, readUncoveredActivityNote } from './onboarding/answers-complement-libre.js'
export { ACTIVITY_NOTE_FACTS_MAX, proposeActivityNoteFacts } from './onboarding/activity-note-facts.js'
export type { ActivityNoteFact } from './onboarding/activity-note-facts.js'
/**
 * #2041.1 — les cinq niveaux par secteur et le seuil de la relance. Réexportés
 * ici comme leurs voisins : l'écran du questionnaire et le détecteur de
 * contradictions les LISENT depuis `@bellum/contracts`, ils ne les recopient
 * pas (GA-26).
 */
export {
  PRIORITY_SECTORS_NUDGE_THRESHOLD,
  SECTEURS_NIVEAUX_ANSWER_FIELDS,
  SECTOR_ENGAGEMENT_LEVELS,
  prioritySectorCount,
  sectorEngagementLevels,
  type SectorEngagement,
  type SectorEngagementLevel,
} from './onboarding/answers-secteurs-niveaux.js'

/**
 * Offer domains (PDF6 §1 — « Bellum ne doit pas être enfermé dans le
 * vocabulaire IT/data ») : the business domain the seller sells INTO. Drives
 * the IA prompt lens via the offer-domain packs
 * (`apps/ia/app/services/offer_domains/` — keep both lists in sync; the IA
 * golden test `test_offer_domains.py` mirrors this enum).
 *
 * `esn_it` is the DEFAULT (the live product): an absent/`esn_it` value renders
 * the exact historical prompts — byte-identical, locked by the IA goldens.
 * Extensible: adding a domain = one enum value here + one pack on the IA side
 * + i18n labels (checklist in `agent_docs/offer-domains.md`).
 */
export const OFFER_DOMAINS = [
  'esn_it',
  'finance',
  'supply_chain',
  'product_design',
  'pmo',
  'rh',
  'generic',
  // Ajouté EN FIN le 24/08 (GA-08) — conseil en ingénierie industrielle
  // (addendum Stelya). La position compte : cet ordre est aussi celui du
  // départage `dominantOfferDomain`, si bien qu'un ajout en fin ne peut pas
  // voler une égalité à un pack existant.
  'industrial_engineering',
  // #2633.1 — un vendeur dont le portefeuille cite « IA, machine learning,
  // GenAI & agents » (AI_ML_GENAI) retombait sur le prisme générique
  // `esn_it` : les recommandations ne citaient jamais Data Science/ML/GenAI
  // spécifiquement. Ajouté EN FIN, même raison que `industrial_engineering`.
  'ia',
  // #3186.3 / #3186.5 (LAU-FINAL-192, retour bêta 28/09) — même trou que
  // `ia` avant #2633.1 : les codes portefeuille `CYBER_IAM_GRC` et
  // `QUALITY_VALIDATION_HSE` pointaient sur `esn_it` / `industrial_engineering`
  // (prisme générique), donc un ESN cyber ou HSE pur recevait la même
  // stratégie qu'un ESN IT ou industriel généraliste — le NO-GO exact que la
  // spec interdit. Ajoutés EN FIN, même raison que `ia`.
  'cyber',
  'hse',
] as const

export const offerDomainSchema = z.enum(OFFER_DOMAINS)
export type OfferDomain = z.infer<typeof offerDomainSchema>

/** Default domain — the historical ESN/IT product path. */
export const DEFAULT_OFFER_DOMAIN: OfferDomain = 'esn_it'

/**
 * #2004 — la machine d'état canonique de l'onboarding nomme dix états ;
 * la contrainte SQL (`user_onboarding_state_status_check`, migration
 * `1793583494449-OnboardingStatusStates`) n'en portait que trois. Élargi ICI
 * en PREMIER (GA-11/GA-12 : la contrainte SQL part avant le code qui écrit la
 * valeur), les trois historiques restent EN TÊTE et DANS LEUR ORDRE, les neuf
 * nouvelles s'ajoutent EN FIN dans l'ordre de l'issue.
 *
 * ⚠️ Ce lot élargit SEULEMENT la contrainte : aucun code n'écrit encore ces
 * neuf valeurs (machine d'état, entitlement, facturation — hors périmètre,
 * laissés à une décision produit ultérieure).
 */
export const onboardingStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'identity_in_progress',
  'audit_in_progress',
  'audit_generating',
  'audit_to_review',
  'audit_validated',
  'data_enrichment_optional',
  'first_value_ready',
  'activated',
  'refresh_required',
])
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>

export const onboardingStageSchema = z.object({
  id: z.string().guid(),
  code: z.string(),
  title: z.string(),
  stage_order: z.number().int(),
  is_required: z.boolean(),
})
export type OnboardingStage = z.infer<typeof onboardingStageSchema>

/**
 * Les 117 champs de réponse (dont #2032.10 `role_functions_practiced`,
 * #2036.9 `growth_target_zones` et #2036.2 `remote_and_travel_scope`),
 * recomposés depuis leurs blocs dans l'ORDRE d'avant
 * l'éclatement — l'ordre des clés est une part du contrat (il commande celui du
 * résultat de `parse`), donc il ne se réarrange pas pour faire joli.
 *
 * Chaque bloc porte sa propre raison d'être : Temps 1 le cadrage (10), le
 * portefeuille d'offre (2), le placement en CDI chez le client (1), le
 * complément Temps 2 (5), le profil progressif (27), maturité + effectif réel
 * (7 — lot L15, #2034/#2035), les canaux d'entrée (4 — lot L19, #2048), les
 * unités comparables (2 — lot L19, #2049), la capacité réelle (7 — lot L19,
 * #2050), la continuité des dossiers (2 — lot L19, #2051), la chaîne
 * d'outillage et les freins (lot L19, #2054/#2055), le client idéal (9 — lot
 * L17, #2042), les interlocuteurs (3 — lot L17, #2043), les chemins
 * d'accès (3 — lot L17, #2044), l'offre en types de prestation et les
 * secteurs de référence (4 — lot 26, #2038/#2041), la crédibilité et les
 * modes de réponse au besoin (5 — lot 26, #2039/#2040) et les objectifs
 * commerciaux NOMMÉS (1 — lot L19, #2052).
 */
export const esnAnswersSchema = z.object({
  ...TEMPS1_ANSWER_FIELDS,
  ...offerDomainAnswerFields(offerDomainSchema),
  ...RECRUITMENT_ANSWER_FIELDS,
  ...TEMPS2_ANSWER_FIELDS,
  ...PROFILE_ANSWER_FIELDS,
  ...MATURITE_EFFECTIF_ANSWER_FIELDS,
  ...CANAUX_ANSWER_FIELDS,
  ...MESURES_ANSWER_FIELDS,
  ...TEMPS_ANSWER_FIELDS,
  ...ROUTINES_ANSWER_FIELDS,
  ...OUTILLAGE_ANSWER_FIELDS,
  ...FREINS_ANSWER_FIELDS,
  ...CLIENT_IDEAL_ANSWER_FIELDS,
  ...INTERLOCUTEURS_ANSWER_FIELDS,
  ...CHEMINS_ACCES_ANSWER_FIELDS,
  // Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
  // secteurs référencés, crédibilité et modes de réponse au besoin.
  ...OFFRE_SECTEURS_ANSWER_FIELDS,
  // #2041.1 — `priority_sectors`, la clé qui donne aux secteurs cinq niveaux
  // au lieu de vingt cases équivalentes. AJOUT SEULEMENT : `target_sectors`,
  // `reference_sectors` et `no_go_sectors` gardent leur sens et leurs lecteurs.
  ...SECTEURS_NIVEAUX_ANSWER_FIELDS,
  ...CREDIBILITE_STAFFING_ANSWER_FIELDS,
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS, en remplacement du
  // champ unique `monthly_target` (conservé — voir `answers-profil.ts`).
  ...OBJECTIFS_ANSWER_FIELDS,
  // Vivier et base de clients DÉCLARÉS à l'onboarding (#2046, #2047) : ce que
  // l'ESN a DÉJÀ, pas seulement ce qu'elle vise.
  ...VIVIER_ANSWER_FIELDS,
  ...BASE_CLIENTS_ANSWER_FIELDS,
  // #2059 (lot L19) — attribution marketing, ferme le stage `target_market`.
  ...ATTRIBUTION_ANSWER_FIELDS,
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège +
  // bureaux), AJOUTÉE EN FIN comme les blocs précédents.
  ...IMPLANTATION_ANSWER_FIELDS,
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
  // NOMBRES du questionnaire, AJOUTÉS EN FIN comme les blocs précédents.
  ...CHIFFRES_CLES_ANSWER_FIELDS,
  // #2060 — la question ouverte qui FERME le parcours (stage `goals`, sous-
  // étape `complement-libre`, montée EN DERNIER dans `TEMPS1_STAGES`) :
  // « Y a-t-il quelque chose d'important sur ton activité que mes questions
  // n'ont pas couvert ? ». AJOUTÉE EN FIN comme les blocs précédents.
  ...COMPLEMENT_LIBRE_ANSWER_FIELDS,
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ, AJOUTÉ EN FIN comme les blocs précédents. N'entre nulle part
  // dans les droits (`workspace-permission.guard.ts` reste seul, GA-26).
  ...AUTORITE_ANSWER_FIELDS,
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » : associés,
  // recruteurs, delivery, marketing, ops et mode de coordination. AJOUTÉ EN
  // FIN comme les blocs précédents.
  ...EQUIPE_ANSWER_FIELDS,
  // #2640.2 — le site de l'entreprise devient une réponse comme les autres
  // (source affichée, corrigeable), AJOUTÉ EN FIN comme les blocs précédents.
  ...SITE_WEB_ANSWER_FIELDS,
  // #2045.1/.2/.4/.6/.7 (lot B, 22/09/2026) — le réseau personnel DÉCLARÉ pour
  // quatre des portes d'entrée de `canaux.ts`, plus les relations chaudes
  // transversales, AJOUTÉ EN FIN comme les blocs précédents.
  ...RESEAU_ANSWER_FIELDS,
  // #2036.2 (#2847, modèle de territoire à 7 axes) — le remote accepté et
  // les déplacements, AJOUTÉ EN FIN comme les blocs précédents.
  ...TERRITOIRE_REMOTE_ANSWER_FIELDS,
  // #2036.8 (#2847, modèle de territoire à 7 axes) — la posture déclarée par
  // rapport au territoire (capacité avérée / relations existantes /
  // intention), AJOUTÉ EN FIN comme les blocs précédents. V1 tranché sans
  // Louis, voir `answers-territoire-capacite.ts`.
  ...TERRITOIRE_CAPACITE_ANSWER_FIELDS,
  // #3923.a — les métiers placés (`placed_roles`), colonne existante enfin
  // transportée jusqu'au web pour juger la pertinence des offres d'emploi.
  // AJOUTÉ EN FIN comme les blocs précédents.
  ...METIERS_PLACES_ANSWER_FIELDS,
  // #4270.1 (18/10) — le profil d'espace « forfait / conseil » (`workspace-profile.ts`).
  // AJOUTÉ EN FIN comme les blocs précédents.
  ...WORKSPACE_PROFILE_ANSWER_FIELDS,
  // Théo O onboarding-couverture (22/10) — les 26 clés neuves de la V23, AJOUTÉ EN FIN comme les blocs précédents.
  ...V23_ANSWER_FIELDS,
})
export type EsnAnswers = z.infer<typeof esnAnswersSchema>

/** Partial write — the front saves one stage's answers at a time. */
export const saveAnswersSchema = esnAnswersSchema.partial()
export type SaveAnswers = z.infer<typeof saveAnswersSchema>

export const advanceStageSchema = z.object({ stage_code: z.string().min(1) })
export type AdvanceStage = z.infer<typeof advanceStageSchema>

/**
 * #2007.11 — la question qu'un utilisateur choisit de PASSER, nommément (pas
 * une absence muette qui se lirait « non mesuré » et non « refusé sciemment
 * pour l'instant »). `esnAnswersSchema.keyof()` réutilise EXACTEMENT le même
 * vocabulaire de clés que les réponses elles-mêmes (GA-26 : une seule liste
 * de clés), jamais une seconde énumération qui pourrait diverger.
 */
export const skipQuestionSchema = z.object({ key: esnAnswersSchema.keyof() })
export type SkipQuestion = z.infer<typeof skipQuestionSchema>

/**
 * #4425.4 — la réponse qu'un humain CONFIRME sans la réécrire (le geste
 * « Confirmer » d'une réponse dont l'origine n'est pas établie). Même
 * vocabulaire de clés que {@link skipQuestionSchema} (GA-26).
 */
export const confirmAnswerSchema = z.object({ key: esnAnswersSchema.keyof() })
export type ConfirmAnswer = z.infer<typeof confirmAnswerSchema>

export const onboardingStateResponseSchema = z.object({
  /** Onboarding session id (the `user_onboarding_state` natural key). */
  id: z.string().guid(),
  status: onboardingStatusSchema,
  current_stage_code: z.string().nullable(),
  stages: z.array(onboardingStageSchema),
  answers: esnAnswersSchema,
  /**
   * Quand l'utilisateur a explicitement reporté le questionnaire (« Plus
   * tard »), `null` sinon.
   *
   * Le report est une DÉCISION, pas une complétion : les analyses lancées
   * ensuite sont marquées génériques (cf. `RunProfileProvenance`). Le champ
   * existe pour que le produit cesse de déduire « il a répondu » de « il a une
   * offre » — deux faits que rien ne relie, et dont la confusion faisait sauter
   * l'onboarding à tous les comptes bêta (recette finale §13).
   */
  skipped_at: z.string().nullable().default(null),
  /**
   * #2021 — DÉCISION LOUIS 08/10/2026 : la date de la PREMIÈRE complétion
   * RÉELLE de l'onboarding, `null` s'il n'a jamais été terminé. Même donnée
   * que `OnboardingService.firstOnboardingCompletionAt` (déjà calculée pour
   * la bannière de refonte #2897, la transition `to_status: 'completed'` la
   * plus ANCIENNE du journal `user_onboarding_transitions`) — un second
   * lecteur, jamais une seconde dérivation (GA-26).
   *
   * C'est le signal qui distingue, à `status: 'refresh_required'`, un
   * utilisateur DÉJÀ onboardé qui redemande une reconfiguration (le
   * bandeau « Questionnaire en cours — Reprendre » prend le relais, il
   * n'est plus redirigé) d'un utilisateur qui n'a JAMAIS terminé le
   * questionnaire (qui reste redirigé — voir `needsOnboarding`,
   * `onboarding-gate.ts`). `.catch(null)` ET `.default(null)` comme
   * `active_import_session_id` : une API ancienne omet la clé, et cette
   * fenêtre ne doit jamais se lire comme « déjà onboardé ».
   */
  first_completed_at: z.string().nullable().catch(null).default(null),
  /**
   * Les clés d'`answers` qui viennent de la fiche de l'ENTREPRISE et non de la
   * personne — ce que {@link inheritedAnswerKeys} calcule côté API.
   *
   * Elle existe pour que le flux sache ce qu'il reste à poser : une question
   * d'entreprise héritée ne se repose pas, une question personnelle héritée si
   * ({@link isAnswerPendingForMember}).
   *
   * ⚠️ `.catch([])` ET `.default([])`, comme `offer_domain` juste au-dessus :
   * une API ANCIENNE omet la clé, et la fenêtre « front neuf sur API ancienne »
   * dure plusieurs minutes à chaque livraison (Vercel ~1 min, Railway plusieurs).
   * Vide = comportement d'avant, à l'octet près.
   */
  inherited_answer_keys: z.array(z.string()).catch([]).default([]),
  /**
   * #2004.19 — la session d'import (BEL-INT-602) EN COURS de cet utilisateur,
   * si l'assistant n'a pas fini son travail dessus (`draft`/`simulated`/
   * `failed`/`partial` — jamais `applied`/`rolled_back`, terminaux). `null`
   * sans session à reprendre, jamais deviné côté écran : la dérivation vit
   * dans `OnboardingService.getState`, un seul endroit.
   *
   * ⚠️ `.catch(null)` ET `.default(null)` : une API ancienne omet la clé, et
   * la fenêtre « front neuf sur API ancienne » ne doit jamais lire ça comme
   * une session à reprendre qui n'existe pas.
   */
  active_import_session_id: z.string().guid().nullable().catch(null).default(null),
  /**
   * #2014.3 / #2014.7 — l'espace REJOINT par invitation acceptée (même
   * événement qu'un transfert vers un autre espace, décision Louis 17/09),
   * et qui a invité si connu. `null` sans invitation acceptée à cette
   * adresse — jamais deviné côté écran, la dérivation vit dans
   * `OnboardingService.getState`, un seul endroit.
   */
  joined_workspace: z
    .object({
      workspace_name: z.string(),
      invited_by_name: z.string().nullable(),
    })
    .nullable()
    .catch(null)
    .default(null),
  /**
   * #4158.12 (Louis, 14/10/2026) — « le membre qui arrive AVANT l'administrateur
   * attend l'administrateur ».
   *
   * Non nul quand l'appelant est un MEMBRE (sans `team:manage`) d'un espace qui
   * n'a PAS encore de fiche entreprise canonique : il ne répond alors qu'à ses
   * questions PERSONNELLES (`ESN_PERSONAL_ANSWER_KEYS`), n'écrit aucune réponse
   * entreprise, et son onboarding se termine sur elles. `admin_name` = prénom +
   * nom EN CLAIR du propriétaire de l'espace, `null` s'il n'en a pas — jamais
   * deviné. Quand l'administrateur décrit l'ESN, la clé repasse à `null` et le
   * membre HÉRITE (`inherited_answer_keys`).
   *
   * ⚠️ `.catch(null)` ET `.default(null)` : une API ancienne omet la clé, et
   * « front neuf sur API ancienne » ne doit jamais lire ça comme une attente.
   */
  awaiting_company_admin: z.object({ admin_name: z.string().nullable() }).nullable().catch(null).default(null),
  /**
   * #2035.8 — la date à laquelle CHAQUE bande d'effectif a été observée
   * (`{@link EffectifObservedAtMap}`, clé d'`EsnAnswers` → ISO). Le front en
   * dérive la fraîcheur (`readEffectifFreshness`) plutôt que de recevoir un
   * état déjà tranché : la même donnée sert un seuil qui peut changer côté
   * contrat sans nouvel aller-retour API.
   *
   * ⚠️ `.catch({})` ET `.default({})` : une API ANCIENNE omet la clé — la
   * fenêtre « front neuf sur API ancienne » ne doit jamais lire ça comme un
   * ensemble de réponses toutes fraîches ni toutes périmées, seulement
   * `never_observed`, ce que `{}` rend déjà.
   */
  effectif_observed_at: effectifObservedAtMapSchema.catch({}).default({}),
})
export type OnboardingStateResponse = z.infer<typeof onboardingStateResponseSchema>

/**
 * Keys required to complete Temps 1 (all 10). The API uses this as the
 * completion gate (no partial submission); the front uses it to keep the
 * final "Terminer" action disabled until everything is filled.
 */
export const TEMPS1_REQUIRED_KEYS = [
  'esn_name',
  'consultant_size',
  'sales_team_size',
  'expertise_areas',
  'positioning',
  'target_sectors',
  'target_company_types',
  'staffing_model',
  'geo_zones',
  'main_sales_pain',
] as const satisfies readonly (keyof EsnAnswers)[]

export type Temps1RequiredKey = (typeof TEMPS1_REQUIRED_KEYS)[number]

/**
 * #2626.1 — LE MOMENT où une question se pose. Un catalogue, deux moments.
 *
 * Mesuré avant ce lot : le questionnaire du Temps 1 posait 135 questions, dont
 * **125 bloquaient « Continuer »**, alors que la porte de complétion
 * (`TEMPS1_REQUIRED_KEYS`, juste au-dessus) n'en exige que 10. C'est là que
 * passaient les cinq minutes qu'on promet de ne pas dépasser.
 *
 * Arbitrage Louis du 20/09/2026, en QCM, l'option « on les rend simplement
 * facultatives et elles restent affichées » lui ayant été proposée et REFUSÉE :
 * **les 125 basculent en Temps 2**. Elles sortent du Temps 1 et sont reposées
 * plus tard, quand le commercial a vu un dossier — « Ton premier dossier est
 * prêt. Affinons-le. »
 *
 * Ce que cette fonction N'EST PAS : une liste à tenir à la main. Le moment est
 * DÉRIVÉ de la porte de complétion — une clé exigée pour entrer est, par
 * définition, ce qu'on ne peut pas remettre à plus tard ; tout le reste
 * approfondit. Ajouter une question au Temps 1 ne se fait donc que d'UN geste
 * (l'inscrire dans `TEMPS1_REQUIRED_KEYS`), jamais de deux (GA-26).
 *
 * ⚠️ « Reportée » n'est pas « supprimée » et n'est pas « répondue vide ». Une
 * question du Temps 2 sort du DÉNOMINATEUR du Temps 1 — elle n'y compte pas
 * comme manquante (GA-18/GA-19) — et entre dans celui du Temps 2. Une réponse
 * déjà donnée à l'une d'elles reste en base et reste affichée : on archive, on
 * ne supprime pas, et une correction humaine gagne toujours.
 */
export type OnboardingMoment = 'temps1' | 'temps2'

const TEMPS1_REQUIRED_KEY_SET: ReadonlySet<string> = new Set<string>(TEMPS1_REQUIRED_KEYS)

/** Le moment auquel une clé de réponse est posée. Voir {@link OnboardingMoment}. */
export function onboardingMomentOf(key: string): OnboardingMoment {
  return TEMPS1_REQUIRED_KEY_SET.has(key) ? 'temps1' : 'temps2'
}

/**
 * Projette une réponse d'`EsnAnswers` vers ce qu'un CHAMP DE FORMULAIRE sait
 * éditer — une chaîne ou une liste de chaînes — et rend `null` pour tout le
 * reste.
 *
 * #2052 a fait d'`esn_objectives` un tableau d'OBJETS. Les trois endroits du
 * web qui recopiaient `Array.isArray(value) ? value : (value ?? '')` ont cessé
 * de compiler le même jour. Le correctif tentant — un `as string[]` — aurait
 * laissé passer le tableau d'objets jusqu'au champ, pour s'y afficher
 * « [object Object] » : un rendu inventé, exactement ce que ce dépôt refuse.
 *
 * La projection vit donc ICI, à un seul endroit (GA-26), et dit NON : une
 * valeur structurée n'est pas une valeur de formulaire, et l'appelant SAUTE la
 * clé plutôt que de la déformer. Le jour où `esn_objectives` gagne son écran,
 * c'est cet écran qui lit la valeur structurée — pas le magasin générique.
 */
export function toFormAnswerValue(value: unknown): string | string[] | null {
  if (value == null) return ''
  if (typeof value === 'string') return value
  // #2088.12 — les deux premiers champs `number` (`consultant_count`,
  // `annual_revenue_amount`) : le magasin d'écran (`OnboardingAnswers`,
  // `apps/web/src/stores/onboardingStore.ts`) reste `string | string[]`
  // comme tous ses voisins — un SEUL type de valeur de formulaire, pas un
  // second pour ces deux clés. `Number.isFinite` écarte `NaN`/`Infinity`,
  // qu'`esnAnswersSchema` ne laisse jamais passer côté serveur mais qu'un
  // appelant de test pourrait forger.
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (Array.isArray(value)) {
    return value.every(item => typeof item === 'string') ? (value as string[]) : null
  }
  return null
}

/**
 * A field is "answered" when a string is non-empty or an array is non-empty.
 *
 * #2052 — élargi de `string[]` à `readonly unknown[]` pour accepter
 * `esn_objectives` (un tableau d'OBJETS, pas de chaînes) sans caster chaque
 * appelant : la règle « tableau vide = pas répondu » vaut pour n'importe quel
 * élément, pas seulement une chaîne.
 *
 * #2088.12 — élargi à `number` pour `consultant_count` /
 * `annual_revenue_amount` : `0` EST une réponse (une ESN qui vient de se
 * créer peut avoir zéro consultant placé) — seuls `null`/`undefined`/`NaN`
 * comptent comme « pas répondu ».
 */
export function isAnswerFilled(value: string | number | readonly unknown[] | null | undefined): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * #4875 — CE QUI BLOQUE L'OUVERTURE DE L'ESPACE : UNE règle, à UN endroit (GA-26).
 *
 * La porte serveur (`OnboardingService`) et l'écran de relecture
 * (`missingEssentials`) recopiaient chacun le filtre `isAnswerFilled` ; l'écart
 * entre le client et le serveur n'était nommé qu'en commentaire. Les deux lisent
 * désormais cette fonction.
 *
 * « Je ne sais pas encore » sur une clé de type LISTE est un état ASSUMÉ et
 * NOMMÉ (`declared`) : ce n'est ni une liste vide, ni une absence de réponse, et
 * il n'invente AUCUNE valeur (une liste ne porte pas le libellé : il partirait
 * comme une cible dans les prompts). La clé reste donc un manque — le cadrage ne
 * peut pas passer complet — mais l'écran dit QU'elle est déclarée inconnue, pas
 * qu'elle a été oubliée. Une clé texte répondue par le libellé reste une réponse
 * (tranché le 31/10, #4875.1).
 *
 * `statuses` : le statut local des clés qui ne peuvent pas le porter dans leur
 * valeur. Absent côté serveur, qui ne voit que les valeurs.
 */
export type RequiredAnswerGap = { key: Temps1RequiredKey; declared: UnknownAnswerReason | null }

export function requiredAnswerGaps(
  answers: Partial<Record<string, unknown>> | null | undefined,
  {
    awaitingCompanyAdmin = false,
    statuses = {},
  }: { awaitingCompanyAdmin?: boolean; statuses?: Partial<Record<string, UnknownAnswerReason>> },
): RequiredAnswerGap[] {
  const required = awaitingCompanyAdmin ? TEMPS1_REQUIRED_KEYS.filter(isPersonalAnswerKey) : TEMPS1_REQUIRED_KEYS
  return required
    .filter(key => !isAnswerFilled(answers?.[key] as Parameters<typeof isAnswerFilled>[0]))
    .map(key => ({ key, declared: statuses[key] ?? null }))
}

/* -------------------------------------------------------------------------- */
/*  Temps 2 — le complément de profil, APRÈS la première analyse terminée.    */
/* -------------------------------------------------------------------------- */

/**
 * The Temps-2 answer keys, in asking order.
 *
 * The selection rule is the one this codebase has broken five times and now
 * enforces: **a question exists only if its answer is READ somewhere**. Each
 * key below lands in {@link AnalysisProfileData} via `esnAnswersToProfileData`
 * and is printed into at least one Claude prompt:
 *
 * - `decision_maker_personas` → `personas` — read by `bellum_contacts`,
 *   `bellum_facts`, `bellum_organigramme`, `bellum_plan`, `bellum_signals`,
 *   `bellum_strategy`, and used as the Apollo people-search titles
 *   (`phase2_contacts._resolve_personas`);
 * - `avg_sales_cycle` → `salesCycle` — `bellum_plan`, `bellum_strategy`,
 *   `bellum_organigramme` (cadence of the action plan);
 * - `avg_tjm` → `avgTJM` — `bellum_contacts`, `bellum_plan`, `bellum_strategy`;
 * - `client_references` → `references` — `bellum_strategy` (attack angles),
 *   `bellum_plan`, `bellum_contacts` (proof injected into the messages);
 * - `no_go_sectors` → `noGoSectors` — `bellum_strategy` (never builds an angle
 *   on a sector the seller refuses).
 *
 * Other `esn_profiles` columns (`outreach_channels`, `known_competitors`,
 * `support_preferences`, `available_consultants_band`,
 * `target_accounts_maturity`, `social_proof_level`…) stay UNASKED on purpose:
 * nothing reads them yet, so asking would be effort with no payback.
 * `placed_roles` is TRANSPORTED since #3923.a (read by Discover's
 * `signalRelevance`) and, since the 09/10 decision (#3923), ASKED by the
 * Temps-2 complement (`PROFILE_QUESTIONS`, block `role`) and editable in
 * « Mon profil » — one column, two screens (GA-26). It stays out of this list:
 * this list is the legacy five-key complement, not the whole questionnaire.
 */
export const TEMPS2_ANSWER_KEYS = [
  'decision_maker_personas',
  'avg_sales_cycle',
  'avg_tjm',
  'client_references',
  'no_go_sectors',
] as const satisfies readonly (keyof EsnAnswers)[]

type Temps2AnswerKey = (typeof TEMPS2_ANSWER_KEYS)[number]

/**
 * Closed value catalog of the Temps-2 choice questions — the exact strings
 * persisted in `esn_profiles` and printed verbatim into the French prompts.
 *
 * Deliberately NOT merged into {@link ESN_ANSWER_OPTIONS}: that catalog is the
 * prefill contract (Temps 1 only), and the prefill may not guess a TJM or a
 * client reference. A sibling golden test keeps this list and the Temps-2
 * wizard questions in sync.
 *
 * `avg_tjm` values carry no currency symbol because the prompts render them as
 * « TJM moyen : {avgTJM} EUR » — a value like « 550-700 » must read cleanly
 * there.
 */
export const TEMPS2_ANSWER_OPTIONS = {
  decision_maker_personas: [
    "DSI / Directeur des Systèmes d'Information",
    'CTO / Directeur Technique',
    'RSSI / Directeur Cybersécurité',
    'Chief Data Officer / Directeur Data',
    'Directeur de la Transformation / Digital',
    'Directeur des Achats / Acheteur IT',
    'Directeur Financier (DAF)',
    'DRH / Directeur des Ressources Humaines',
    'Directeur de Programme / PMO',
    'Responsable Infrastructure & Production',
    'Responsable Applicatif / Delivery',
    'Directeur Métier (opérations, supply, marketing)',
    // #2043.3 / #2043.4 — achats et RH étaient déjà couverts (« Directeur des
    // Achats », « DRH ») ; recrutement et partenariats manquaient. Ajoutées EN
    // FIN (GA-08) — un catalogue persisté n'insère jamais au milieu.
    'Responsable Recrutement / Talent Acquisition',
    'Responsable Partenariats / Alliances',
    'Direction industrielle / usine',
    'Direction ingénierie / bureau d’études',
    'Responsables méthodes / qualité / HSE',
    'Direction achats / supply chain',
    'Direction financière / contrôle de gestion',
    'Direction RH / formation',
    'Direction marketing / commerciale',
    'Direction médicale / affaires réglementaires',
    'Direction générale de PME / ETI',
    'Responsable de programme / PMO',
  ],
  avg_sales_cycle: ["Moins d'1 mois", '1 à 3 mois', '3 à 6 mois', '6 à 12 mois', 'Plus de 12 mois'],
  avg_tjm: ['moins de 400', '400-550', '550-700', '700-900', 'plus de 900'],
  no_go_sectors: [
    'Banque de détail & Banque privée',
    "Banque d'investissement & Marchés",
    'Assurance & Mutuelles',
    'Industrie manufacturière & Automobile',
    'Aéronautique & Défense',
    'Énergie & Utilities (EDF, Engie...)',
    'BTP & Construction',
    'Chimie & Pharmaceutique',
    'Retail & Grande distribution',
    'Telecom & Médias',
    'Santé & Medtech',
    'Secteur public & Collectivités',
    'Aucun secteur exclu',
    'Agroalimentaire & Agriculture',
    'Pharmacie & Biotechnologies',
    'ESN & Cabinets partenaires',
    'Secteurs à préciser',
  ],
} as const satisfies Partial<Record<Temps2AnswerKey, readonly string[]>>

/**
 * Lifecycle of the Temps-2 complement for one user. Everything but `locked` is
 * a state the user put themselves in — the complement never blocks the product:
 *
 * - `locked`    — no completed analysis yet: nothing is proposed (asking before
 *                 the rep has SEEN a dossier is exactly what we refuse to do);
 * - `pending`   — proposable now;
 * - `snoozed`   — « plus tard », comes back after {@link COMPLEMENT_SNOOZE_DAYS};
 * - `completed` — the rep went through it;
 * - `dismissed` — « ne plus me le proposer », never shown again.
 */
const complementStatusSchema = z.enum(['locked', 'pending', 'snoozed', 'completed', 'dismissed'])
export type ComplementStatus = z.infer<typeof complementStatusSchema>

/** How long « plus tard » silences the complement. */
export const COMPLEMENT_SNOOZE_DAYS = 3

export const profileComplementStateSchema = z.object({
  status: complementStatusSchema,
  /** A first analysis reached `completed` — the trigger condition. */
  eligible: z.boolean(),
  /** The card may be rendered right now (`pending` only). Derived server-side
   *  so the front never re-implements the snooze arithmetic. */
  visible: z.boolean(),
  /** How many of the {@link TEMPS2_ANSWER_KEYS} carry an answer, 0..5. */
  answered_count: z.number().int().min(0),
  total_count: z.number().int().min(0),
  /** ISO date the snooze expires, `null` outside `snoozed`. */
  snoozed_until: z.string().nullable(),
})
export type ProfileComplementState = z.infer<typeof profileComplementStateSchema>

/* -------------------------------------------------------------------------- */
/*  Workspace-canonical ESN profile — company profile shared by the team,     */
/*  merged with a light personal overlay per member.                          */
/* -------------------------------------------------------------------------- */

/**
 * The answer keys that belong to the MEMBER, not the company: the commercial's
 * own objectives/pain point, plus the whole Temps-2 complement. Everything else
 * in {@link EsnAnswers} describes the ESN itself (name, size, offers, sectors,
 * geo, staffing…) and always resolves from the workspace's canonical profile
 * when one exists.
 *
 * Why the complement is personal, and not company: it is answered from a
 * DASHBOARD by whoever is sitting there, including a plain member. Company
 * fields written by a member are ignored once a canonical profile exists — a
 * complement routed to that bucket would silently swallow the five answers we
 * just asked for. As a personal overlay it never disappears, and the merge rule
 * still gives a teammate the canonical's values until they answer their own
 * (the owner's row IS the canonical, so their complement is the team default).
 */
/**
 * Les réponses du profil progressif (§21-30) qui décrivent LA PERSONNE et non
 * l'entreprise : son rôle, ses objectifs, sa routine, ses blocages, ce qu'elle
 * accepte de partager. Sans ce classement, la réponse d'un membre serait écrasée
 * (ou ignorée) par le profil canonique de l'espace de travail — le piège que
 * #735 avait déjà rencontré sur les 5 questions du Temps 2.
 */
const PROFILE_PERSONAL_ANSWER_KEYS = [
  'user_role',
  'role_tenure',
  'industry_tenure',
  'individual_goal',
  'monthly_target',
  'team_overlap',
  'portfolio_size',
  'accounts_relationship_status',
  'weekly_calls',
  'weekly_emails',
  'weekly_linkedin',
  'sales_routine',
  'sales_blockers',
  'proactivity_level',
  'shared_data_scope',
  // #2058.2 / #2058.10 — les moments acceptés et le niveau de détail attendu
  // décrivent LA PERSONNE, exactement comme `proactivity_level`/
  // `shared_data_scope` juste au-dessus : ce que CE membre accepte n'est pas
  // ce qu'accepte son associé. Miroir Python à tenir :
  // `_PERSONAL_PROFILE_COLUMNS` (`seller_context.py`).
  'contact_windows',
  'detail_level',
  // #2018.5 — les outils déclarés (profil progressif, `answers-profil.ts`)
  // décrivent LA PERSONNE, comme `sales_routine`/`sales_blockers` juste
  // au-dessus : ce que CE membre utilise n'est pas ce qu'utilise son associé.
  // Rangé côté entreprise, la réponse d'un membre s'écrivait dans le
  // canonique de l'espace et y écrasait ce que d'autres membres avaient
  // déclaré — le même piège que #735. ⚠️ Compte existant : les réponses déjà
  // écrites AVANT ce lot restent dans la colonne `esn_profiles.tooling` de
  // qui les a répondues (aucune migration de données, GA-11/GA-12 — la
  // colonne ne bouge pas, seul le ROUTAGE de lecture/écriture change) ; pour
  // le propriétaire du canonique rien ne change (sa ligne EST le canonique).
  'tooling',
  // #2055 — les freins décrivent LA PERSONNE, comme `main_sales_pain` et
  // `sales_blockers` juste au-dessus : le frein d'un Business Manager n'est pas
  // celui de son directeur. Rangés côté entreprise, ils seraient ignorés dès
  // qu'un profil canonique existe, et les quatre réponses disparaîtraient en
  // silence — le piège que #735 avait déjà rencontré sur le Temps 2.
  // ⚠️ Miroir Python à tenir : `_PERSONAL_PROFILE_COLUMNS` (`seller_context.py`).
  'sales_freins',
  'frein_attempted',
  'frein_stopped',
  'frein_stopped_reason',
  // #2032.10 / #2036.9 (16/09) — les fonctions exercées et l'ambition
  // territoriale décrivent LA PERSONNE, comme `user_role`/`individual_goal`
  // ci-dessus : le parcours d'un Business Manager n'est pas celui de son
  // associé, et « je souhaite développer telle zone » est une déclaration au
  // singulier. Sans cette ligne, les deux réponses d'un membre partiraient
  // vers la fiche canonique de l'entreprise et y seraient écrasées.
  'role_functions_practiced',
  'growth_target_zones',
  // #2033.2-.8 (D3, 18/09/2026) — le périmètre d'autorité décrit LA PERSONNE :
  // ce qu'un Business Manager décide seul n'est pas ce que décide son
  // associé. Miroir Python à tenir : `_PERSONAL_PROFILE_COLUMNS`
  // (`seller_context.py`).
  'decisions_alone',
  'decisions_to_validate',
  'people_managed',
  'recruitment_accounts_authority',
  'staffing_authority',
  'margin_billing_authority',
  'tools_access',
  'invite_authority',
  // #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel décrit LA
  // PERSONNE, comme `growth_target_zones` ci-dessus : le vivier d'anciens
  // clients d'un Business Manager n'est pas celui de son associé. Miroir
  // Python à tenir : `_PERSONAL_PROFILE_COLUMNS` (`seller_context.py`).
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
  'warm_relations_count_band',
  // Théo O onboarding-couverture (22/10/2026) — les « Précisions de cadrage » V23 qui décrivent LA PERSONNE (son prénom pour
  // Laura, son périmètre, sa façon de travailler, son horizon, ses outils, ses accès, ses priorités) : sans cette ligne elles
  // partiraient vers la fiche canonique de l'entreprise et y écraseraient celles d'un associé. Miroir Python à tenir :
  // `_PERSONAL_PROFILE_COLUMNS` (`seller_context.py`).
  'first_name',
  'scope_level',
  'scope_unit',
  'autonomy',
  'context_policy',
  'horizon',
  'success_target',
  'workflow_pain',
  'tools',
  'account_access',
  'priority_expertise',
  'delivery_frictions',
] as const satisfies readonly (keyof EsnAnswers)[]

export const ESN_PERSONAL_ANSWER_KEYS = [
  'main_sales_pain',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — `client_references` et
  // `no_go_sectors` passent ENTREPRISE : exclues explicitement du spread
  // Temps 2 ci-dessous, qui reste par ailleurs la liste des CINQ questions du
  // complément (`profileComplementStateSchema`), pas celle des clés
  // personnelles — les deux répondent à des questions différentes. Voir
  // `layered-profile.ts` (`COMPANY_LAYER_ANSWER_KEYS`) et la migration de
  // données idempotente qui accompagne ce reclassement.
  ...TEMPS2_ANSWER_KEYS.filter(
    (key): key is Exclude<Temps2AnswerKey, 'client_references' | 'no_go_sectors'> =>
      key !== 'client_references' && key !== 'no_go_sectors',
  ),
  ...PROFILE_PERSONAL_ANSWER_KEYS,
  // #2050 (lot L19) — les heures que CETTE personne peut engager ne sont pas
  // celles de son associé. Sans cette ligne, la réponse d'un membre partirait
  // vers la fiche canonique de l'entreprise et y serait ignorée.
  ...TEMPS_PERSONAL_ANSWER_KEYS,
  // #2052 (lot L19) — les objectifs commerciaux NOMMÉS décrivent LA PERSONNE,
  // exactement comme `individual_goal`/`monthly_target` juste au-dessus
  // (`PROFILE_PERSONAL_ANSWER_KEYS`) — un objectif de rendez-vous se déclare
  // par vendeur, pas par entreprise. Sans cette ligne, une fois un profil
  // canonique d'espace posé, les objectifs déclarés par un membre seraient
  // ignorés en silence : exactement le piège #735 que cette liste existe pour
  // fermer.
  'esn_objectives',
  // #2059 — comment CETTE personne a connu {{brand}} n'est pas comment son
  // associé l'a connu : personnelle, comme `main_sales_pain` ci-dessus.
  'heard_about_bellum',
  // #2005.6 (DÉCISION Louis 17/09, lot CP2) — le nombre de consultants gérés
  // DIRECTEMENT par CETTE personne n'est pas celui de son associé. Reclassée
  // PERSONNE : elle était rangée entreprise faute d'être dans cette liste, et
  // absente des deux couches du profil à trois couches (#2005.6 au registre).
  'consultants_managed_by_user_band',
  // #2035.2 — la BU dont CETTE personne parle n'est pas forcément celle de son
  // associé (deux membres d'un même espace peuvent porter deux BU
  // différentes, exactement pourquoi `business-unit` existe comme module à
  // part). Même raisonnement que la ligne au-dessus, jamais fusionnée avec le
  // total entreprise/groupe.
  'consultant_size_business_unit_band',
] as const satisfies readonly (keyof EsnAnswers)[]

export type EsnPersonalAnswerKey = (typeof ESN_PERSONAL_ANSWER_KEYS)[number]

/** The complement of {@link ESN_PERSONAL_ANSWER_KEYS}: the fields owned by the
 *  company (workspace canonical profile), editable by owner/admin only once a
 *  canonical profile exists. */
export const ESN_COMPANY_ANSWER_KEYS = TEMPS1_REQUIRED_KEYS.filter(
  (key): key is Exclude<Temps1RequiredKey, EsnPersonalAnswerKey> =>
    !(ESN_PERSONAL_ANSWER_KEYS as readonly string[]).includes(key),
)

/** Whether `key` belongs to the member's personal overlay (vs the company). */
export function isPersonalAnswerKey(key: keyof EsnAnswers): key is EsnPersonalAnswerKey {
  return (ESN_PERSONAL_ANSWER_KEYS as readonly string[]).includes(key)
}

/**
 * The single merge rule between a workspace's canonical (company) profile and
 * a member's own answers: company fields ALWAYS come from the canonical;
 * personal fields ({@link ESN_PERSONAL_ANSWER_KEYS}) come from the member when
 * answered, else fall back to the canonical's value. Pure — used by the API
 * resolution (`EsnProfileWorkspaceResolver`) and mirrored by the IA
 * (`seller_context.merge_canonical_row`), so both sides agree byte-for-byte.
 */
export function mergeWorkspaceAnswers(canonical: EsnAnswers, personal: EsnAnswers): EsnAnswers {
  const merged: EsnAnswers = { ...canonical }
  for (const key of ESN_PERSONAL_ANSWER_KEYS) {
    // Same value, same key on both sides — the per-key type is preserved by the
    // shared `EsnAnswers` shape; TS just cannot follow it through a loop union.
    if (isAnswerFilled(personal[key])) {
      ;(merged as Record<string, unknown>)[key] = personal[key]
    }
  }
  return merged
}

/**
 * Les clés dont la valeur FUSIONNÉE vient de la fiche de l'entreprise et non
 * de la personne — le pendant de {@link mergeWorkspaceAnswers}, qui produit la
 * valeur sans dire d'où elle vient.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE (#1671-ter, retour de Louis du 07/09/2026).
 * La fusion fait retomber une clé PERSONNELLE sur la valeur canonique quand le
 * membre n'a pas répondu. C'est juste pour NOURRIR un prompt — mieux vaut le
 * frein commercial de l'associé que rien — et faux pour DÉCIDER quoi demander :
 * sans cette distinction, le second associé hérite du frein de son collègue et
 * on ne lui pose plus jamais la seule question qui soit la sienne.
 *
 * « Hériter du vide n'est pas hériter » : une clé que le canonique ne porte pas
 * non plus n'est jamais nommée ici. Et un espace mono-utilisateur, où la ligne
 * canonique EST celle du membre, n'hérite de rien — l'appelant ne doit alors
 * même pas appeler cette fonction (cf. `EsnProfileWorkspaceResolver`).
 */
export function inheritedAnswerKeys(canonical: EsnAnswers, personal: EsnAnswers): (keyof EsnAnswers)[] {
  const merged = mergeWorkspaceAnswers(canonical, personal)
  return (Object.keys(merged) as (keyof EsnAnswers)[]).filter(key => {
    // Rien à hériter d'une case vide.
    if (!isAnswerFilled(merged[key] as string | string[] | null | undefined)) return false
    // Une clé personnelle à laquelle il a répondu est la sienne, pas un héritage.
    if (isPersonalAnswerKey(key) && isAnswerFilled(personal[key] as string | string[] | null | undefined)) return false
    // Tout le reste de la valeur fusionnée vient du canonique.
    return isAnswerFilled(canonical[key] as string | string[] | null | undefined)
  })
}

/**
 * Cette question reste-t-elle à poser à CE membre ? — LA règle du flux
 * d'onboarding partagé, écrite une fois et lue des deux côtés.
 *
 *   · une question d'ENTREPRISE remplie — même héritée — ne se repose pas :
 *     onze des douze questions du premier temps sont des faits sur l'ESN ;
 *   · une question PERSONNELLE héritée SE repose, parce qu'elle n'est pas
 *     encore la sienne ;
 *   · une question vide se pose, comme toujours.
 *
 * ⚠️ `inherited` vide ⇒ le prédicat vaut exactement « la réponse est absente »,
 * à l'octet près. C'est ce qui rend le changement inerte pour tout utilisateur
 * seul dans son espace, c'est-à-dire pour presque tous.
 *
 * #2022.4 — décision Louis 15/09/2026 : ce prédicat ne redemande QUE les
 * réponses ABSENTES. Il ne tente JAMAIS de repérer une réponse « obsolète »
 * ou « contradictoire avec une autre » — les détecter demanderait une DATE
 * PAR RÉPONSE, que ni `esn_profiles` ni `OnboardingStateResponse` ne portent
 * aujourd'hui, et deviner l'obsolescence reposerait des questions au hasard.
 * Ce n'est pas un oubli : c'est le choix retenu, tranché une fois. Une date
 * par réponse est un chantier À PART — ne pas l'ajouter ici pour « corriger »
 * ce prédicat.
 */
export function isAnswerPendingForMember(
  key: keyof EsnAnswers,
  answers: EsnAnswers,
  inherited: readonly (keyof EsnAnswers)[],
): boolean {
  if (!isAnswerFilled(answers[key] as string | string[] | null | undefined)) return true
  return isPersonalAnswerKey(key) && inherited.includes(key)
}

/**
 * Splits a partial save into its company / personal halves so the write path
 * can route each to the right row (canonical vs member overlay). Keys not set
 * on `answers` are absent from both halves.
 */
export function splitAnswersByScope(answers: SaveAnswers): { company: SaveAnswers; personal: SaveAnswers } {
  const company: SaveAnswers = {}
  const personal: SaveAnswers = {}
  for (const key of Object.keys(answers) as (keyof SaveAnswers)[]) {
    const value = answers[key]
    if (value === undefined) continue
    const target = isPersonalAnswerKey(key) ? personal : company
    ;(target as Record<string, unknown>)[key] = value
  }
  return { company, personal }
}

/**
 * Response of `GET /esn-profile/workspace` — how the caller's ESN profile is
 * shared inside their workspace. Drives the Réglages › Profil screen split
 * between "Profil de l'entreprise (partagé)" and "Mes préférences
 * personnelles".
 */
export const esnProfileWorkspaceMetaSchema = z.object({
  /** A canonical (shared) company profile exists for the active workspace. */
  shared: z.boolean(),
  /** The caller may edit the shared company fields (owner/admin — `team:manage`),
   *  or no canonical profile exists yet (legacy per-user profile, fully editable). */
  canEditCompany: z.boolean(),
  /** The caller's role in the active workspace, `null` when none resolved. */
  role: workspaceRoleSchema.nullable(),
})
export type EsnProfileWorkspaceMeta = z.infer<typeof esnProfileWorkspaceMetaSchema>

/**
 * The activation milestones of the self-serve onboarding checklist, in funnel
 * order. Each flag is DERIVED server-side from real data (esn_profiles,
 * analysis_runs, product_events, user_actions, *_connections) — never a
 * stored/fake progress.
 *
 * #1810 — `tool_connected` (⑥) was ADDED at the end (GA-08: an enum only
 * grows, and only at the tail). The retour: onboarding never explicitly
 * invited anyone to connect their mailbox, agenda or CRM — someone could
 * finish it having never been asked, then use a half-blind product without
 * knowing why. This milestone is deliberately non-blocking, like the other
 * five: it nudges from the (already dismissible) checklist, it never gates a
 * step of the wizard.
 */
export const ACTIVATION_STEP_KEYS = [
  'profile_completed',
  'analysis_launched',
  'dossier_viewed',
  'contact_enriched',
  'message_prepared',
  'tool_connected',
  // #2077.6 — « première correction », AJOUTÉ À LA FIN (GA-08). Le retour
  // demandait ce jalon parce que corriger est le geste qui fait passer le
  // produit de « ce qu'une machine a trouvé » à « ce que MON équipe sait » :
  // c'est la première fois que l'utilisateur écrit dans la mémoire du compte,
  // et un dossier corrigé revient corrigé à l'analyse suivante. Non bloquant,
  // comme les six autres.
  'correction_made',
  // #2077.9 — « premier collègue invité », AJOUTÉ À LA FIN (GA-08). Inviter
  // est réservé à `team:manage` (owner/admin) et plafonné par les sièges du
  // plan : un simple membre, ou un espace au plafond de sièges, ne peut JAMAIS
  // faire passer ce jalon à vrai. D'où `colleague_invited` (voir
  // `ActivationStepStatus` ci-dessous), le seul jalon qui n'est pas booléen.
  'colleague_invited',
] as const

export type ActivationStepKey = (typeof ACTIVATION_STEP_KEYS)[number]

/**
 * #2077.9 — l'état d'un jalon qui n'est pas toujours ATTEIGNABLE. Un booléen
 * qui ne peut jamais passer à vrai ment (« pas encore » suppose que le geste
 * reste possible). `not_applicable` le dit explicitement : le jalon sort du
 * dénominateur d'activation, comme un axe non évaluable sort d'un score
 * (doctrine « non mesuré n'est jamais 0 »).
 *
 * GA-08 : `done` et `pending` sont les deux états que chaque autre jalon
 * portait déjà (`true`/`false`) ; `not_applicable` est le nouvel état, ajouté
 * EN FIN.
 */
export const activationStepStatusValues = ['done', 'pending', 'not_applicable'] as const
export type ActivationStepStatus = (typeof activationStepStatusValues)[number]
export const activationStepStatusSchema = z.enum(activationStepStatusValues)

/* -------------------------------------------------------------------------- */
/*  ESN profile prefill — « je tape le nom de mon ESN, tout se pré-remplit »   */
/* -------------------------------------------------------------------------- */

/**
 * The CLOSED value catalog of every choice-based answer, keyed by answer key.
 *
 * These are the exact strings persisted in `esn_profiles` and pattern-matched
 * in French by the IA prompt builder (`apps/ia/app/models/profile_context.py`),
 * so a prefill that invents a value outside this list silently degrades every
 * downstream analysis. The prefill pipeline therefore VALIDATES against this
 * catalog server-side and drops anything unknown.
 *
 * Presentation (grouping, i18n label keys, ordering) stays in the front's
 * `questions.ts`; a golden test asserts both lists stay in sync.
 */

/**
 * #2033.2 / #2033.3 — le catalogue de types de décision, partagé par
 * `decisions_alone` ET `decisions_to_validate` : les deux questions posent le
 * MÊME catalogue (une décision peut apparaître dans l'une ou l'autre, ou dans
 * aucune), donc un seul catalogue plutôt que deux qui diverseraient au
 * premier ajout (GA-26).
 */
const AUTHORITY_DECISION_TYPES = [
  'Envoyer une offre commerciale',
  'Fixer un tarif ou une remise',
  'Signer un nouveau compte client',
  'Recruter un consultant',
  'Décider un staffing',
  "Inviter quelqu'un dans l'espace",
] as const

export const ESN_ANSWER_OPTIONS = {
  consultant_size: ['1-10', '10-30', '30-80', '80-200', '200-500', '500+'],
  sales_team_size: [
    'Je suis seul (fondateur / indépendant)',
    '2-3 personnes',
    '4-8 personnes',
    '8-15 personnes',
    '15+ personnes',
    "Je n'ai pas d'équipe commerciale dédiée",
  ],
  expertise_areas: [
    'Cloud & Infrastructure (AWS, Azure, GCP, Hosting)',
    'Data & Intelligence Artificielle',
    'Cybersécurité & Conformité',
    'DevOps, SRE & Automatisation',
    'Développement applicatif (Web, Mobile, API)',
    'SAP & ERP (S/4HANA, Oracle, Sage)',
    'Réseau & Télécom',
    'Testing & Assurance qualité',
    'Architecture SI & Urbanisation',
    'IoT & Systèmes embarqués',
    'Gestion de projet & PMO',
    'Agilité, Scrum, Coaching agile',
    'Transformation digitale & Conduite du changement',
    'Conseil en stratégie SI',
    'AMOA / Business Analysis',
    'Product Management & Design (UX/UI)',
    'Finance & Contrôle de gestion',
    'Marketing digital & CRM',
    'RH & SIRH',
    'Supply Chain & Logistique',
    'Industrie & Manufacturing (MES, GMAO, PLM)',
    // #2531.1 / #2549.2 — ajoutées EN FIN (GA-08) le 18/09/2026, retour
    // client Ludovic Marx (ESN d'ingénierie industrielle) : le catalogue
    // était orienté IT/DSI et ne portait qu'un seul regard logiciel sur
    // l'industrie. Ce sont des MÉTIERS/EXPERTISES (l'axe de CETTE liste),
    // distincts du SECTEUR client — déjà porté par `target_sectors`
    // (« Industrie manufacturière & Automobile », « Aéronautique &
    // Défense », « Énergie & Utilities », « BTP & Construction »,
    // « Transport ferroviaire & Aérien », « Santé & Medtech »). Détail
    // et non-régression : onboarding.expertise-areas-industrial.test.ts.
    'Mécanique & Conception (CAO, DAO)',
    'Automatisme, Robotique & Contrôle-commande',
    'Méthodes & Industrialisation',
    'Qualité, Certification & Métrologie',
    'Génie civil & Structures (BTP, VRD)',
    'Électronique & Instrumentation',
    'Achats / Procurement / Category management',
    'Finance de marché / Risques / Conformité',
    'Actuariat / Assurance métier',
    'Comptabilité / Consolidation / FP&A',
    'RH / Recrutement / Formation',
    'Marketing / Communication / Création',
    'Commerce / RevOps / Relation client',
    'Ingénierie systèmes / MBSE / Sûreté',
    'Énergie / Nucléaire / Utilities',
    'Maintenance / Fiabilité / MRO',
    'Chimie / Procédés / Oil & Gas',
    'Électrique / Électronique / Hardware',
    'Santé / Clinique / Affaires réglementaires',
    'Pharma / GMP / Validation / CMC',
    'Agroalimentaire / Agronomie',
    'ESG / RSE / Décarbonation',
    'Juridique / Fiscalité / Gouvernance',
    'Immobilier / Facilities / Workplace',
    'Sûreté / Sécurité physique / Gestion de crise',
    'Audiovisuel / Production / Broadcast',
    'Hôtellerie / Tourisme / Revenue management',
  ],
  positioning: [
    'Expertise de niche - spécialisé sur 1-2 domaines pointus',
    'Multi-compétences ciblées - 3-5 domaines avec références solides',
    'Généraliste - large spectre selon les besoins client',
    'Régie pure - on place des profils sur demande',
    'Conseil & Delivery - cadrage + exécution',
  ],
  staffing_model: [
    'Uniquement des CDI internes',
    'Principalement CDI + quelques freelances ponctuels',
    'Mix équilibré CDI / Freelances',
    'Principalement freelances / sous-traitants',
    'Uniquement freelances (pas de CDI)',
  ],
  target_sectors: [
    'Banque de détail & Banque privée',
    "Banque d'investissement & Marchés",
    'Assurance & Mutuelles',
    'Fintech & Services financiers',
    'Industrie manufacturière & Automobile',
    'Aéronautique & Défense',
    'Énergie & Utilities (EDF, Engie...)',
    'BTP & Construction',
    'Chimie & Pharmaceutique',
    'Retail & Grande distribution',
    'E-commerce & Marketplaces',
    'Luxe & Cosmétiques',
    'Hôtellerie, Tourisme & Loisirs',
    'Transport ferroviaire & Aérien',
    'Transport routier & Maritime',
    'Supply Chain & Logistique',
    'Telecom & Médias',
    'Santé & Medtech',
    'Secteur public & Collectivités',
    'Éducation & Recherche',
    'Tech & Startups / Scale-ups',
    'Immobilier & PropTech',
    'Tous secteurs — sans préférence',
    'Agroalimentaire & Agriculture',
    'Industrie de process & Matériaux',
    'Pharmacie & Biotechnologies',
    'Équipements médicaux & Dispositifs de santé',
    'Organismes de formation',
    'Associations & Économie sociale',
    'Services professionnels & Conseil',
    'ESN & Cabinets partenaires',
    'Sécurité & Sûreté',
    'Sport, Culture & Événementiel',
    'Secteur non encore défini',
  ],
  target_company_types: [
    'CAC40 / SBF120 (grands comptes)',
    'ETI (500-5 000 salariés)',
    'PME (50-500 salariés)',
    'Startups & Scale-ups',
    'Secteur public & Collectivités',
    'Toutes tailles — selon la pertinence',
    'TPE / petites structures',
    'PME de moins de 50 salariés',
    'Associations / organismes sans but lucratif',
  ],
  geo_zones: [
    'Paris & Île-de-France',
    'Lyon & Auvergne-Rhône-Alpes',
    'Lille & Hauts-de-France',
    'Nantes & Pays de la Loire',
    'Bordeaux & Nouvelle-Aquitaine',
    'Toulouse & Occitanie',
    'Marseille & PACA',
    'Strasbourg & Grand Est',
    'Rennes & Bretagne',
    'Full remote (pas de contrainte géo)',
    'National (toute la France)',
    'International',
    'Outre-mer',
    'Belgique',
    'Allemagne',
    'Italie',
    'Pays-Bas',
    'Portugal',
  ],
  main_sales_pain: [
    'Trouver les bons comptes à cibler',
    'Identifier les décideurs et trouver leurs coordonnées',
    "Personnaliser mes messages d'approche",
    'Me différencier des autres ESN sur les mêmes comptes',
    'Gérer mon temps entre prospection, delivery et management',
    'Convertir mes RDV en signatures',
    'Fidéliser mes comptes existants',
    'Former et coordonner mon équipe commerciale',
    'Je ne sais pas par où commencer',
    // #3385.3 (beta #3385, 30/09/2026) — miroir de `lib/questions/frein.ts`
    // (apps/web), six formulations stratégiques additives.
    'Je manque de comptes qualifiés',
    "Mes comptes sont ouverts mais ne s'étendent pas",
    'Je manque de profils quand un besoin arrive',
    'Mes marges se dégradent',
    "Toute l'activité dépend de quelques personnes",
    'Je manque de visibilité sur ce qui fonctionne',
  ],
  // #2034 — maturité commerciale de l'ESN (lot L15).
  esn_maturity_situation: [
    'Activité en création',
    'Premiers clients',
    'Activité stabilisée',
    'Croissance',
    "Transformation d'un modèle existant",
    'Nouvelle activité au sein d’un groupe',
    // #2034.5 — la BU est un LIBELLÉ DÉCLARATIF (décision Louis 15/09), pas
    // une partition : ni `workspace_id` propre, ni droits propres. Une
    // réponse de questionnaire parmi d'autres, un filtre de lecture plus tard.
    'Plusieurs agences / BU',
  ],
  active_clients_band: [
    'Aucun client actif pour le moment',
    '1 à 5 clients actifs',
    '6 à 15 clients actifs',
    '16 à 50 clients actifs',
    'Plus de 50 clients actifs',
  ],
  revenue_recurrence: [
    'Essentiellement du contrat récurrent (régie longue, forfait reconduit)',
    'Un mix de récurrent et de one-shot',
    'Essentiellement du one-shot (mission ponctuelle, projet unique)',
  ],
  client_concentration_risk: [
    "Un client représente plus de la moitié du chiffre d'affaires",
    'Un client pèse fort mais reste minoritaire',
    "Le chiffre d'affaires est réparti, aucun client dominant",
    'Je ne sais pas encore',
  ],
  company_growth_goal: [
    "Stabiliser l'activité actuelle",
    // #2641.1 — accélérer ce qui marche déjà, distinct de « stabiliser »
    // (rien à consolider) et de « développer un nouveau secteur » (rien de
    // nouveau visé). Voir `maturite.ts` pour le détail.
    'Accélérer la croissance actuelle',
    'Développer un nouveau secteur ou une nouvelle offre',
    'Ouvrir un nouveau territoire',
    'Se structurer ou lever des fonds',
    'Se préparer à une cession ou une transmission',
    "Pas d'objectif de croissance formalisé pour l'instant",
  ],
  // #2035 — effectif réel (lot L15).
  consultants_managed_by_user_band: [
    'Aucun consultant géré directement',
    '1 à 5 consultants',
    '6 à 15 consultants',
    '16 à 30 consultants',
    'Plus de 30 consultants',
  ],
  // #2035.5 — les valeurs portent les mots-clés que lit déjà
  // `sales_context.py::_bench_band` (« aucun »/« plein » → bas, « quelques » →
  // moyen, « beaucoup »/« fort » → haut) : la colonne et son lecteur IA
  // existaient déjà (migration 1780000000000), seule la question manquait.
  available_consultants_band: [
    'Aucune disponibilité, planning plein',
    'Quelques consultants disponibles en intercontrat',
    'Beaucoup de disponibilité, fort intercontrat',
  ],
  // #2035.1 / #2035.2 — mêmes six bandes que `consultant_size` : la question
  // n'est pas « combien de consultants » (déjà posée) mais « dans QUELLE
  // population ce nombre-là se compte ».
  consultant_size_group_band: ['1-10', '10-30', '30-80', '80-200', '200-500', '500+'],
  consultant_size_business_unit_band: ['1-10', '10-30', '30-80', '80-200', '200-500', '500+'],
  // #2048 — les quatre facettes des canaux d'entrée (lot L19). Elles CITENT le
  // même catalogue plutôt que de le recopier quatre fois : un réglage vit à un
  // seul endroit (GA-26), et quatre copies auraient divergé au premier canal
  // ajouté. Le catalogue, sa raison et ses numéros de point :
  // `./onboarding/answers-canaux.ts`.
  entry_channels_used: ENTRY_CHANNELS_USED_VALUES,
  entry_channels_measured: ENTRY_CHANNEL_VALUES,
  entry_channels_last_starts: ENTRY_CHANNEL_VALUES,
  entry_channels_time_split: ENTRY_CHANNEL_VALUES,
  // #2048.13 — même catalogue, cité pas recopié (GA-26).
  entry_channels_period: ENTRY_CHANNEL_VALUES,
  // #2049 — les onze unités de l'entonnoir et la période qui les rend
  // comparables (`./onboarding/answers-mesures.ts`).
  activity_measures_tracked: ACTIVITY_MEASURE_VALUES,
  activity_reference_period: ACTIVITY_REFERENCE_PERIODS,
  // #2050 — la capacité RÉELLE (lot L19). Les trois états du temps partagent la
  // MÊME échelle de bandes, importée de son bloc : trois listes recopiées
  // auraient divergé à la première borne ajustée, et les états seraient devenus
  // incomparables (GA-26, « un réglage vit à un seul endroit »).
  weekly_sales_time_declared: WEEKLY_SALES_TIME_BANDS,
  weekly_sales_time_protected: WEEKLY_SALES_TIME_BANDS,
  weekly_sales_time_residual: WEEKLY_SALES_TIME_BANDS,
  weekly_sales_time_slots: WEEKLY_SALES_TIME_SLOTS,
  competing_workloads: COMPETING_WORKLOADS,
  workload_variability: WORKLOAD_VARIABILITY,
  protected_slot_capacity: PROTECTED_SLOT_CAPACITY,
  // #2051 — la continuité des dossiers (lot L19).
  dossier_continuity_practices: DOSSIER_CONTINUITY_PRACTICES,
  dossier_continuity_breaks: DOSSIER_CONTINUITY_BREAKS,
  // #2054 — la chaîne d'outillage. Les onze maillons partagent LA MÊME échelle
  // (`TOOLING_PRESENCE_SCALE`, `onboarding/answers-outillage.ts`) : elle vit
  // là-bas et nulle part ailleurs, ces onze lignes la citent, elles ne la
  // recopient pas. ⚠️ Aucune marque n'y figure — on nomme la CAPACITÉ
  // (doctrine `tool-naming`, gardes GA-44 et `i18n/no-vendor-names.test.ts`).
  tooling_crm: TOOLING_PRESENCE_SCALE,
  tooling_ats: TOOLING_PRESENCE_SCALE,
  tooling_erp: TOOLING_PRESENCE_SCALE,
  tooling_mailbox: TOOLING_PRESENCE_SCALE,
  tooling_calendar: TOOLING_PRESENCE_SCALE,
  tooling_drive: TOOLING_PRESENCE_SCALE,
  tooling_spreadsheet: TOOLING_PRESENCE_SCALE,
  tooling_enrichment: TOOLING_PRESENCE_SCALE,
  tooling_sourcing_platform: TOOLING_PRESENCE_SCALE,
  tooling_bi: TOOLING_PRESENCE_SCALE,
  tooling_personal_notes: TOOLING_PRESENCE_SCALE,
  // #2054.13 — la source de RÉFÉRENCE, puis ce qu'elle contient.
  tooling_reference: TOOLING_REFERENCE_CHOICES,
  tooling_reference_data: TOOLING_REFERENCE_DATA_CHOICES,
  // #2054.14 — la fraîcheur. « Je ne sais pas » est une réponse honnête de
  // l'utilisateur ; l'absence de réponse reste `null` et ne vaut jamais « 0 ».
  tooling_reference_freshness: TOOLING_FRESHNESS_CHOICES,
  // #2054.15 — la confiance DÉCLARÉE. Aucune note, aucun pourcentage, aucune
  // probabilité : ce n'est pas un score (doctrine `c26_probabilite`).
  tooling_reference_confidence: TOOLING_CONFIDENCE_CHOICES,
  // #2054.16
  tooling_reference_export: TOOLING_EXPORT_CHOICES,
  // #2054.17 — le doublon se CONSTATE ; on propose une fusion, on ne fusionne jamais.
  tooling_duplicates: TOOLING_DUPLICATES_CHOICES,
  // #2055.1-.13 — les seize freins. `tooling_pain` (#2054.18) n'est PAS ici :
  // c'est un texte libre, une douleur ne se choisit pas dans une liste fermée.
  sales_freins: SALES_FREIN_CHOICES,
  // #2042 — client idéal (lot L17).
  ideal_client_size: ['Moins de 50 salariés', '50 à 500 salariés', '500 à 5 000 salariés', 'Plus de 5 000 salariés'],
  ideal_client_structure: [
    'Groupe coté / grand compte',
    'Filiale de groupe',
    'PME indépendante / familiale',
    'Startup / Scale-up',
    'Secteur public & Collectivités',
  ],
  ideal_client_maturity: [
    'Client en démarrage / structuration',
    'Client en forte croissance',
    'Client établi, activité stable',
    'Client en transformation ou restructuration',
  ],
  ideal_client_territory: [
    'Clients basés en Île-de-France',
    'Clients basés en région',
    'Clients basés à l’international',
    'Peu importe la localisation du client',
  ],
  ideal_client_accessibility: [
    'Accessible directement (réseau ou déjà en contact)',
    'Accessible via un intermédiaire (partenaire, recommandation)',
    'Hors réseau actuel, prospection à froid nécessaire',
  ],
  // #2042.7 — mêmes bandes que le cycle CONSTATÉ (`avg_sales_cycle`, Temps 2) :
  // c'est la même unité, seule l'intention change (tolérable vs constaté).
  // Citée, pas recopiée (GA-26).
  ideal_client_max_sales_cycle: TEMPS2_ANSWER_OPTIONS.avg_sales_cycle,
  ideal_client_min_deal_size: ['Moins de 10 000 €', '10 000 à 50 000 €', '50 000 à 150 000 €', 'Plus de 150 000 €'],
  ideal_client_referencement_constraints: [
    "Référencement fournisseur obligatoire (UGAP, centrale d'achat...)",
    'Accord-cadre ou marché existant requis',
    'Audit ou certification préalable exigé',
    'Aucune contrainte de référencement connue',
  ],
  ideal_client_current_state: [
    'Correspond au profil théorique',
    'Accessible dès maintenant',
    'Déjà un client connu',
    'Particulièrement rentable',
  ],
  // #2043 — interlocuteurs (lot L17).
  real_response_level: [
    'Niveau exécutif (COMEX / CODIR)',
    'Niveau management intermédiaire',
    'Niveau opérationnel',
    'Variable selon le compte',
  ],
  budget_validator: [
    'Le décideur rencontré directement',
    'Un niveau direction générale (COMEX)',
    'Les achats, après validation technique',
    'Variable selon le compte ou le montant',
  ],
  access_orienteur: [
    'Un sponsor interne déjà identifié',
    'Le contact opérationnel du moment',
    "Aucun, c'est notre prospection qui identifie l'entrée",
    'Un partenaire ou un intermédiaire',
  ],
  // #2044 — chemins d'accès (lot L17). Catalogue partagé avec
  // `entry_channels_used` (#2048, `answers-canaux.ts`) — cité, pas recopié.
  entry_channels_dependency: ENTRY_CHANNEL_VALUES,
  entry_channels_saturation: ENTRY_CHANNEL_VALUES,
  // Lot 26 — #2038.3/.4/.5/.6/.8/.9/.10/.11 : les types de prestation, un axe
  // NEUF à côté de `positioning` (largeur de spécialisation) qu'on ne touche
  // pas — voir `answers-offre-secteurs.ts`. Même catalogue pour les trois
  // clés : ce qui change entre elles est le SOUS-ENSEMBLE coché, jamais le
  // vocabulaire.
  service_types: [
    'Régie',
    'Forfait',
    'Conseil',
    'Audit',
    'Centre de services',
    'Assistance technique',
    'Sous-traitance',
    'Sous-traitance rang 2',
    'Produit ou formation',
    'Services managés / infogérance',
    'Produit / solution éditée',
    'Recrutement permanent',
    'Bureau d’études / ingénierie de projet',
  ],
  // #2038.12 — sous-ensemble déjà VENDU de `service_types` (état « prouvé »).
  service_types_proven: [
    'Régie',
    'Forfait',
    'Conseil',
    'Audit',
    'Centre de services',
    'Assistance technique',
    'Sous-traitance',
    'Sous-traitance rang 2',
    'Produit ou formation',
    'Services managés / infogérance',
    'Produit / solution éditée',
    'Recrutement permanent',
    'Bureau d’études / ingénierie de projet',
  ],
  // #2038.13 — types PAS ENCORE proposés que l'ESN veut développer (état
  // « ambition » — #2038.15 : jamais fusionné avec `service_types_proven`).
  service_types_desired: [
    'Régie',
    'Forfait',
    'Conseil',
    'Audit',
    'Centre de services',
    'Assistance technique',
    'Sous-traitance',
    'Sous-traitance rang 2',
    'Produit ou formation',
    'Services managés / infogérance',
    'Produit / solution éditée',
    'Recrutement permanent',
    'Bureau d’études / ingénierie de projet',
  ],
  // #2041.2 — parmi les secteurs visés (`target_sectors`), ceux où l'ESN a
  // une référence RÉELLE (mission en cours ou passée). Même catalogue que
  // `target_sectors` : c'est un SOUS-ENSEMBLE affiné, pas un nouveau
  // vocabulaire de secteurs.
  reference_sectors: [
    'Banque de détail & Banque privée',
    "Banque d'investissement & Marchés",
    'Assurance & Mutuelles',
    'Fintech & Services financiers',
    'Industrie manufacturière & Automobile',
    'Aéronautique & Défense',
    'Énergie & Utilities (EDF, Engie...)',
    'BTP & Construction',
    'Chimie & Pharmaceutique',
    'Retail & Grande distribution',
    'E-commerce & Marketplaces',
    'Luxe & Cosmétiques',
    'Hôtellerie, Tourisme & Loisirs',
    'Transport ferroviaire & Aérien',
    'Transport routier & Maritime',
    'Supply Chain & Logistique',
    'Telecom & Médias',
    'Santé & Medtech',
    'Secteur public & Collectivités',
    'Éducation & Recherche',
    'Tech & Startups / Scale-ups',
    'Immobilier & PropTech',
    'Tous secteurs — sans préférence',
    'Agroalimentaire & Agriculture',
    'Industrie de process & Matériaux',
    'Pharmacie & Biotechnologies',
    'Équipements médicaux & Dispositifs de santé',
    'Organismes de formation',
    'Associations & Économie sociale',
    'Services professionnels & Conseil',
    'ESN & Cabinets partenaires',
    'Sécurité & Sûreté',
    'Sport, Culture & Événementiel',
    'Secteur non encore défini',
  ],
  // #2041.1 — parmi les secteurs visés, ceux que l'ESN déclare PRIORITAIRES.
  // Même catalogue que `target_sectors` et `reference_sectors`, pour la même
  // raison : c'est un NIVEAU posé sur le même vocabulaire, pas un second
  // vocabulaire. Un catalogue recopié divergerait au premier secteur ajouté.
  priority_sectors: [
    'Banque de détail & Banque privée',
    "Banque d'investissement & Marchés",
    'Assurance & Mutuelles',
    'Fintech & Services financiers',
    'Industrie manufacturière & Automobile',
    'Aéronautique & Défense',
    'Énergie & Utilities (EDF, Engie...)',
    'BTP & Construction',
    'Chimie & Pharmaceutique',
    'Retail & Grande distribution',
    'E-commerce & Marketplaces',
    'Luxe & Cosmétiques',
    'Hôtellerie, Tourisme & Loisirs',
    'Transport ferroviaire & Aérien',
    'Transport routier & Maritime',
    'Supply Chain & Logistique',
    'Telecom & Médias',
    'Santé & Medtech',
    'Secteur public & Collectivités',
    'Éducation & Recherche',
    'Tech & Startups / Scale-ups',
    'Immobilier & PropTech',
    'Tous secteurs — sans préférence',
    'Agroalimentaire & Agriculture',
    'Industrie de process & Matériaux',
    'Pharmacie & Biotechnologies',
    'Équipements médicaux & Dispositifs de santé',
    'Organismes de formation',
    'Associations & Économie sociale',
    'Services professionnels & Conseil',
    'ESN & Cabinets partenaires',
    'Sécurité & Sûreté',
    'Sport, Culture & Événementiel',
    'Secteur non encore défini',
  ],
  // #2040.3/.4/.5/.6 — le pendant multi de `staffing_model` (choix unique, le
  // mode DOMINANT) : les modes RÉELLEMENT cumulés, sans toucher au premier.
  staffing_modes: [
    'Recrutement après besoin',
    'Sous-traitance',
    'Nearshore',
    'Partenaires',
    'Consultants salariés',
    'Portage salarial',
    'Ressources de partenaires',
    'Équipe dédiée / centre de services',
  ],
  // #2040.9 — comment les profils proposés sont validés avant d'être envoyés.
  profile_validation_methods: [
    'Entretien technique interne',
    'Test technique ou mise en situation',
    'Vérification de références',
    'Validation client avant proposition',
    'Aucun process formalisé',
  ],
  // #2040.12 — contraintes contractuelles qui pèsent sur une mission.
  contractual_constraints: [
    "Durée d'engagement minimale",
    'Clause de non-concurrence',
    'Préavis de fin de mission',
    'Garantie de remplacement',
    'Aucune contrainte particulière',
  ],
  // #2046 — le vivier de consultants DÉCLARÉ à l'onboarding. Le funnel compté
  // cite le même catalogue (GA-26) que les quatre états au contrat.
  talent_pool_identified_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_qualified_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_available_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_availability_recency_band: ['Cette semaine', 'Ce mois-ci', 'Il y a plus d’un mois', 'Je ne sais pas'],
  talent_pool_avg_tjm_band: ['moins de 400', '400-550', '550-700', '700-900', 'plus de 900'],
  talent_pool_mobility_band: [
    'Essentiellement locaux',
    'Mobiles en France',
    'Mobiles en Europe ou à l’international',
    'Un mix, non homogène',
  ],
  talent_pool_other_processes_band: [
    'Aucun à notre connaissance',
    'Quelques-uns',
    'La plupart sont aussi en process ailleurs',
  ],
  talent_pool_engagement_reality_band: [
    'Tous engageables immédiatement',
    'Une partie seulement',
    'Peu sont réellement engageables tout de suite',
  ],
  // #2046.11 → .14 — les quatre états au contrat (`TALENT_POOL_STATES`,
  // `answers-vivier.ts`), même catalogue de bandes que le funnel ci-dessus.
  talent_pool_state_interested_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_state_available_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_state_secured_band: VIVIER_COUNT_BAND_CHOICES,
  talent_pool_state_presentable_band: VIVIER_COUNT_BAND_CHOICES,
  // #2047 — la base de clients DÉCLARÉE à l'onboarding.
  client_base_missions_ongoing_band: CLIENT_BASE_COUNT_BAND_CHOICES,
  client_base_missions_completed_band: CLIENT_BASE_COUNT_BAND_CHOICES,
  // #2047.8 — compte les cas EXPLOITABLES, pas leur contenu.
  client_base_case_studies_band: ['0', '1-5', 'plus de 5'],
  // #2059 — attribution marketing. ⚠️ Listée ici pour la garde de parité
  // écran ↔ contrat (`questions.golden.test.ts`), mais jamais candidate au
  // PREFILL : aucune source publique ne peut deviner « comment cette personne
  // a connu {{brand}} », donc la pipeline de prefill ne la propose jamais.
  heard_about_bellum: HEARD_ABOUT_BELLUM_OPTIONS,
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — la période du chiffre
  // d'affaires annuel, seul des trois champs neufs à être un choix fermé
  // (`consultant_count` et `annual_revenue_amount` sont des `number`, hors
  // du catalogue de ce golden par construction — voir `isCatalogQuestion`,
  // `questions.golden.test.ts`).
  annual_revenue_period: ANNUAL_REVENUE_PERIODS,
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Ces réponses n'entrent nulle part dans les droits
  // (`workspace-permission.guard.ts` reste seul, GA-26) : elles cadrent
  // seulement ce que Laura PROPOSE — voir `schemas/authority-scope.ts`.
  decisions_alone: AUTHORITY_DECISION_TYPES,
  decisions_to_validate: AUTHORITY_DECISION_TYPES,
  people_managed: [
    'Des Business Managers',
    'Des consultants',
    'Des recruteurs',
    'Une équipe pluridisciplinaire',
    'Personne, je ne manage personne',
  ],
  // Catalogue partagé avec `staffing_authority` / `margin_billing_authority`
  // / `invite_authority` juste en dessous : les quatre échelles CITENT le
  // même catalogue fermé (`AUTHORITY_SCALE_CHOICES`, `authority-scope.ts`,
  // GA-26) — c'est la valeur EXACTE que lit la fonction de gate #2033.9.
  recruitment_accounts_authority: AUTHORITY_SCALE_CHOICES,
  staffing_authority: AUTHORITY_SCALE_CHOICES,
  margin_billing_authority: AUTHORITY_SCALE_CHOICES,
  tools_access: [
    'CRM',
    'ATS / vivier de consultants',
    'Outil de facturation',
    'Messagerie professionnelle',
    'Aucun outil dédié',
  ],
  invite_authority: AUTHORITY_SCALE_CHOICES,
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
  // du commercial. Catalogues CITÉS depuis `answers-equipe.ts`, jamais
  // recopiés (GA-26).
  associates_count: ASSOCIATES_COUNT_BAND,
  recruiters_team_size: RECRUITERS_TEAM_SIZE_BAND,
  delivery_team_size: DELIVERY_TEAM_SIZE_BAND,
  marketing_team_size: MARKETING_TEAM_SIZE_BAND,
  ops_team_size: OPS_TEAM_SIZE_BAND,
  team_coordination_mode: TEAM_COORDINATION_MODE,
  // #2088.26 (mesure 20/09, DÉCISION Louis 20/09 QCM) — les 13 régions de
  // France métropolitaine, mêmes libellés canoniques que `siteGeo.ts`
  // (`DEPT_TO_REGION`/`CITY_REGIONS`, carte des sites d'un compte) — voir
  // `implantation.ts` pour le détail de la mesure et le choix des groupes.
  // AJOUTÉE EN FIN comme les blocs précédents. `allowOther: true` (comme
  // `expertise_areas`/`target_sectors`) : ce catalogue ne ferme rien, il
  // guide — une valeur hors catalogue (ville, territoire) reste saisissable.
  company_locations: [
    'Île-de-France',
    'Hauts-de-France',
    'Grand Est',
    'Bourgogne-Franche-Comté',
    'Auvergne-Rhône-Alpes',
    "Provence-Alpes-Côte d'Azur",
    'Corse',
    'Nouvelle-Aquitaine',
    'Occitanie',
    'Bretagne',
    'Pays de la Loire',
    'Normandie',
    'Centre-Val de Loire',
    'Guadeloupe',
    'Martinique',
    'Guyane',
    'La Réunion',
    'Mayotte',
    'Autres territoires ultramarins',
    'Belgique',
    'Allemagne',
    'Italie',
    'Pays-Bas',
    'Portugal',
    'Autres pays',
  ],
  // #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel pour quatre
  // portes de `canaux.ts` (« Anciens clients », « Anciens collègues »,
  // « Partenaires et rang 2 », « Recommandation »), AJOUTÉ EN FIN comme les
  // blocs précédents. Même catalogue de bandes que le vivier de consultants
  // (GA-26) : `VIVIER_COUNT_BAND_CHOICES` compte des personnes dans les deux
  // cas.
  former_clients_count_band: VIVIER_COUNT_BAND_CHOICES,
  former_colleagues_count_band: VIVIER_COUNT_BAND_CHOICES,
  partners_count_band: VIVIER_COUNT_BAND_CHOICES,
  referrers_count_band: VIVIER_COUNT_BAND_CHOICES,
  // #2045.6 — les relations chaudes, transversales aux quatre portes
  // ci-dessus. Même catalogue de bandes (GA-26).
  warm_relations_count_band: VIVIER_COUNT_BAND_CHOICES,
  // #2036.2 (#2847, modèle de territoire à 7 axes) — le remote accepté et les
  // déplacements, AJOUTÉ EN FIN comme les blocs précédents. Catalogue FERMÉ
  // (pas de `allowOther`) : six postures, jamais un texte libre.
  remote_and_travel_scope: [
    'Remote accepté sans restriction',
    'Remote partiel (quelques jours sur site)',
    'Sur site uniquement',
    'Déplacements ponctuels chez le client acceptés',
    'Grands déplacements acceptés',
    'Aucun déplacement possible',
  ],
  // #2036.8 (#2847, modèle de territoire à 7 axes) — trois postures, jamais
  // fusionnées : la capacité avérée ne se déduit jamais de l'intention.
  zone_capability_status: [
    'Je peux intervenir (capacité déjà avérée)',
    'J’ai déjà des relations sur ces zones',
    'Je souhaite développer ces zones (pas encore une capacité avérée)',
  ],
  // Théo O onboarding-couverture (22/10/2026) — les catalogues des « Précisions de cadrage » de la V23 (valeurs verbatim).
  // ⚠️ `tools` : la V23 nomme des éditeurs (CRM, ATS, messagerie…) ; la doctrine (GA-44) veut la CAPACITÉ, pas l'éditeur — l'outil
  // branché se nomme par injection, jamais par un littéral. Écart assumé et daté, rapporté au lot.
  target_nature: [
    'Clients finaux',
    'ESN / cabinets partenaires',
    'Plateformes / intermédiaires',
    'Sans préférence pour le moment',
  ],
  target_size: ['Toutes les tailles selon la pertinence', 'TPE', 'PME', 'ETI', 'Grand groupe', 'Start-up / scale-up'],
  horizon: [
    'Cette semaine',
    'Sous 30 jours',
    'Sous 60 jours',
    'Sur le trimestre',
    'Sur six mois',
    'À plus long terme',
    'Pas encore défini',
  ],
  language_capabilities: [
    'Français',
    'Anglais',
    'Allemand',
    'Espagnol',
    'Italien',
    'Néerlandais',
    'Portugais',
    'Arabe',
  ],
  activity_nature: [
    'ESN généraliste',
    'ESN spécialiste',
    'Cabinet de conseil',
    'Société d’ingénierie',
    'Bureau d’études',
    'Cabinet de recrutement',
    'Collectif de freelances',
    'Activité indépendante',
    'Centre de services / infogérance',
    'Éditeur / intégrateur',
    'Agence digitale / créative',
    'Management de transition',
  ],
  data_sources: [
    'Portefeuille de comptes',
    'Contacts et échanges',
    'CV et dossiers de compétences',
    'Besoins et appels d’offres',
    'Références et cas clients',
    'Missions et relevés d’activité',
    'Factures et règlements',
    'Documents d’offre',
    'Aucune donnée pour le moment',
  ],
  tools: [
    'Aucun outil pour le moment',
    'Tableur',
    'CRM',
    'Outil de gestion d’activité et de facturation',
    'Outil de suivi des candidats',
    'Messagerie professionnelle',
    'Agenda partagé',
    'Espace de documents partagé',
    'Outil de prise de notes',
    'Outil de prospection sur les réseaux professionnels',
    'Plateforme de mise en relation avec des freelances',
    'Outil de notes de réunion',
    'Outil d’enrichissement',
    'Outil comptable',
  ],
  delivery_frictions: [
    'CRA / relevés d’activité',
    'Validations client',
    'Commandes / contrats',
    'Factures à préparer',
    'Factures à envoyer',
    'Encaissements / retards',
    'Renouvellements',
    'Marge / coûts inconnus',
    'Aucune difficulté déclarée',
  ],
  autonomy: [
    'Conseils et préparations, sans action externe',
    'Préparer puis me faire valider les actions externes',
    'Étudier une délégation limitée pour certains usages',
  ],
  context_policy: ['Avec mon activité comme contexte', 'En mode Neutre, sans préférences implicites'],
  currency: ['EUR', 'CHF', 'GBP', 'USD', 'CAD', 'Autre devise'],
  scope_level: ['Mon activité individuelle', 'Mon portefeuille', 'Mon agence / ma BU', 'Mon entreprise', 'Mon groupe'],
  bench_status: [
    'Oui, disponibles maintenant',
    'Oui, à une date prochaine',
    'Pas actuellement',
    'Je source après qualification du besoin',
    'Non applicable à mon activité',
  ],
  recruiting_priorities: [
    'Sourcer des profils',
    'Qualifier les compétences',
    'Confirmer les disponibilités',
    'Réduire l’intercontrat',
    'Préparer les présentations',
    'Réactiver mon vivier',
    'Préparer une relève',
    'Pas de priorité pour le moment',
  ],
  country_scope: [
    'France',
    'Belgique',
    'Luxembourg',
    'Suisse',
    'Royaume-Uni',
    'Allemagne',
    'Espagne',
    'Italie',
    'Pays-Bas',
    'Portugal',
    'Canada',
    'Autres pays à préciser',
  ],
} as const satisfies Partial<Record<keyof EsnAnswers, readonly string[]>>

/**
 * Answer keys the prefill is ALLOWED to propose. The two exclusions are
 * deliberate and are the product rule, not a limitation:
 *
 * - `sales_team_size`: internal org, no public source — guessing it would be
 *   fabricated data.
 * - `main_sales_pain`: the member's OWN pain point (personal overlay, see
 *   {@link ESN_PERSONAL_ANSWER_KEYS}) — only the human can answer it.
 *
 * Anything a source cannot ground stays EMPTY and is flagged "à compléter";
 * we never fill a field to make the screen look finished.
 */
export const PREFILLABLE_ANSWER_KEYS = [
  'esn_name',
  'consultant_size',
  'expertise_areas',
  'positioning',
  'staffing_model',
  'target_sectors',
  'target_company_types',
  'geo_zones',
  // ⚠️ `offer_domain` est GELÉE, plus PRODUITE. Le préremplissage la déduisait
  // d'un NAF 62.0x (`esn_it`) : honnête tant que l'onboarding posait la
  // question, redevenu une présélection SILENCIEUSE le jour où le portefeuille
  // de domaines l'a remplacée (D-DF2). La déduction est retirée côté IA
  // (`esn_prefill.py`) ; la clé reste ici parce qu'une taxonomie ne rétrécit
  // jamais (GA-08) et que d'anciens profils la portent en base.
  'offer_domain',
  // #2640.2 — le site web, résolu par `pick_website` (SIREN → domaine d'e-mail
  // → recherche par nom, `esn_prefill.py`) — jamais deviné à partir du nom.
  // AJOUTÉ EN FIN (GA-08 — `enum-additivity.test.ts`), jamais avant `offer_domain`.
  'esn_website',
] as const satisfies readonly (keyof EsnAnswers)[]

export type PrefillableAnswerKey = (typeof PREFILLABLE_ANSWER_KEYS)[number]

/**
 * How much to trust one prefilled field. Drives the UI treatment: `high` reads
 * as a fact (registry-grounded), `medium`/`low` invite a review before the user
 * clicks through.
 */
export const PREFILL_CONFIDENCES = ['high', 'medium', 'low'] as const
export const prefillConfidenceSchema = z.enum(PREFILL_CONFIDENCES)
export type PrefillConfidence = z.infer<typeof prefillConfidenceSchema>

/**
 * Where a prefilled value came from — shown verbatim next to the field.
 *
 * #2006.4 — RÉUTILISÉ, pas dupliqué, comme la source d'une réponse en
 * général (`answerProvenanceSchema`, `onboarding-answer-contract.ts`) : `user`
 * (la personne a tapé sa réponse) et `connector` (une connexion de l'espace
 * la porte) sont AJOUTÉS EN FIN (GA-08) — les quatre premières valeurs restent
 * dans leur ordre, c'est le contrat du préremplissage d'identité d'entreprise
 * qu'elles servaient déjà.
 */
export const PREFILL_SOURCES = ['registry', 'pappers', 'website', 'inference', 'user', 'connector'] as const
export const prefillSourceSchema = z.enum(PREFILL_SOURCES)
export type PrefillSource = z.infer<typeof prefillSourceSchema>

/** One prefilled answer plus the provenance the UI must display. */
export const prefilledFieldSchema = z.object({
  value: z.union([z.string(), z.array(z.string())]),
  confidence: prefillConfidenceSchema,
  source: prefillSourceSchema,
  /** Short human sentence justifying the value (e.g. "NAF 62.02A — conseil en
   *  systèmes informatiques"). Never a fabricated citation. */
  rationale: z.string().max(240).optional(),
  /**
   * #2028.2 — quand la donnée préremplie a été observée (ISO, la précision
   * que la source connaît : jour ou seulement année). `.nullable().default(null)`
   * comme `naf_code` sur `prefillCompanySchema` : un producteur IA qui n'émet
   * pas encore cette date (#2028.8, `à trancher`) continue de parser, et
   * l'absence reste `null` — jamais une date devinée.
   */
  as_of: z.string().nullable().default(null),
})
export type PrefilledField = z.infer<typeof prefilledFieldSchema>

/**
 * Whether a registry NAF code is coherent with an IT services company.
 *
 * Deliberately TRI-STATE, and the whole point of the disambiguation hardening:
 * - `true`  — the code proves an IT activity (62.0x / 63.1x / 58.2x);
 * - `false` — the registry CONTRADICTS it (a SCI, a garage…) → the UI warns;
 * - `null`  — no NAF code at all → the UI stays silent. "We don't know" must
 *   never be rendered as "this isn't an IT company".
 */
const esnNafCoherenceSchema = z.boolean().nullable().default(null)

/**
 * #2086.25 — DÉCISION Louis 17/09 : « groupe ou filiale », les DEUX moitiés
 * du lien capitalistique (cartographie Pappers, `extract_parent_companies` /
 * `extract_subsidiaries` côté IA). `parentCompanies` nomme les sociétés qui
 * détiennent celle-ci (`[]` = aucune trouvée) ; `subsidiaryCount` compte
 * celles qu'elle détient — un COMPTE, jamais la liste : un groupe peut porter
 * des dizaines de filiales, la carte de confirmation nomme le PARENT (peu
 * nombreux en pratique) et compte le reste plutôt que de le déverser.
 */
export const prefillCompanyGroupSchema = z.object({
  parentCompanies: z.array(z.string()),
  subsidiaryCount: z.number().int().min(0),
})
export type PrefillCompanyGroup = z.infer<typeof prefillCompanyGroupSchema>

/** Registry identity resolved for the typed name — shown as the match header. */
export const prefillCompanySchema = z.object({
  name: z.string(),
  /**
   * #2015.3 — raison sociale ET nom commercial, quand le registre les
   * distingue. `name` garde son rôle historique (le nom qu'on AFFICHE en
   * titre, préférant le nom commercial quand il existe) ; ces deux champs
   * s'ajoutent pour la ligne secondaire de la carte, quand elle a un sens.
   * `.default(null)` : un producteur IA antérieur à ce contrat les omet, et
   * l'absence reste `null` — jamais une raison sociale devinée depuis `name`.
   */
  legal_name: z.string().nullable().default(null),
  commercial_name: z.string().nullable().default(null),
  siren: z.string().nullable(),
  city: z.string().nullable(),
  /**
   * #2015.5 — le pays du siège. `.default(null)` : sans donnée registre, on
   * ne devine JAMAIS "France" — un SIREN peut être résolu sans que le siège
   * ait pu être qualifié plus finement, et un futur profil hors France ne
   * doit jamais hériter d'un pays qu'il n'a pas.
   */
  country: z.string().nullable().default(null),
  /** `.default(null)` on the two new keys: an IA build older than this contract
   *  simply omits them, and a missing coherence signal must degrade to "unknown"
   *  (silent) rather than fail the whole parse and lose the prefill. */
  naf_code: z.string().nullable().default(null),
  naf_label: z.string().nullable(),
  is_esn_naf: esnNafCoherenceSchema,
  website: z.string().nullable(),
  headcount_label: z.string().nullable(),
  /**
   * #2015.8 — l'entreprise est-elle active ? Tri-état ASSUMÉ, comme
   * `is_esn_naf` : `false` signifie que le registre dit l'entreprise cessée,
   * `true` qu'elle est active, `null` qu'on n'a aucune donnée de registre
   * pour le dire — jamais "active" par défaut sur un silence.
   */
  is_active: z.boolean().nullable().default(null),
  /**
   * #2086.25 — DÉCISION Louis 17/09 : groupe/filiale, visible seulement
   * APRÈS confirmation (`prefillCandidateSchema`, la liste d'homonymes, n'a
   * pas ce champ). `.default(null)` : un producteur IA antérieur à ce
   * contrat l'omet, et l'absence reste `null` — jamais un groupe inventé.
   */
  group: prefillCompanyGroupSchema.nullable().default(null),
})
export type PrefillCompany = z.infer<typeof prefillCompanySchema>

/**
 * One homonym the registry returned, with the facts a human needs to tell it
 * apart from its namesakes. Everything but `siren`/`name` is nullable: the free
 * registry is often partial, and a fact it does not carry stays absent rather
 * than being filled in.
 */
export const prefillCandidateSchema = z.object({
  siren: z.string(),
  name: z.string(),
  city: z.string().nullable().default(null),
  department: z.string().nullable().default(null),
  naf_code: z.string().nullable().default(null),
  naf_label: z.string().nullable().default(null),
  is_esn_naf: esnNafCoherenceSchema,
  headcount_label: z.string().nullable().default(null),
  establishment_count: z.number().int().nullable().default(null),
  creation_date: z.string().nullable().default(null),
  /** Deterministic ranking score 0..1 (see the IA `esn_candidate_ranking`
   *  barème). Ordering signal only — never shown as a percentage of truth. */
  score: z.number().min(0).max(1).default(0),
})
export type PrefillCandidate = z.infer<typeof prefillCandidateSchema>

/** How many homonyms the disambiguation list may show. Beyond this a list stops
 *  helping the user decide and starts drowning them. */
export const PREFILL_MAX_CANDIDATES = 5

export const esnPrefillRequestSchema = z.object({
  name: z.string().min(2).max(120),
  /** Pin the match when the user picked an autocomplete suggestion — skips the
   *  name→SIREN resolution and its homonym risk. */
  siren: z
    .string()
    .regex(/^\d{9}$/)
    .nullish(),
})
export type EsnPrefillRequest = z.infer<typeof esnPrefillRequestSchema>

export const esnPrefillResponseSchema = z.object({
  /** False when no registry match was found — the UI keeps the manual wizard
   *  and shows no error (typing a name that isn't in the registry is normal).
   *  False ALSO when `ambiguous`: nothing was prefilled, on purpose. */
  matched: z.boolean(),
  company: prefillCompanySchema.nullable(),
  /** Only keys the pipeline could ground. Absent key = "à compléter". */
  fields: z.record(z.string(), prefilledFieldSchema),
  /** The ranked registry homonyms. Populated whenever the resolution had more
   *  than one plausible entity; carries the single resolved entity otherwise. */
  candidates: z.array(prefillCandidateSchema).default([]),
  /**
   * True when several entities plausibly match the typed name. The pipeline
   * then prefills NOTHING (`matched: false`, empty `fields`) and the UI must
   * make the user pick before anything is proposed — a full ESN profile feeds
   * every downstream analysis prompt, so it may never be seeded from an entity
   * the user did not explicitly recognise.
   */
  ambiguous: z.boolean().default(false),
})
export type EsnPrefillResponse = z.infer<typeof esnPrefillResponseSchema>

/**
 * #2060.9 — « Laura reformule, l'utilisateur valide avant enregistrement ».
 *
 * Un geste EXPLICITE (un bouton, jamais un appel automatique à la frappe) sur
 * une réponse LIBRE du questionnaire. `answerText` et `questionLabel` sont les
 * SEULES données envoyées — aucune donnée personnelle au-delà de la réponse
 * elle-même et de l'intitulé de la question qu'elle complète.
 */
export const onboardingReformulateRequestSchema = z.object({
  questionLabel: z.string().min(1).max(200),
  answerText: z.string().min(1).max(2000),
  locale: z.enum(['fr', 'en']).default('fr'),
})
export type OnboardingReformulateRequest = z.infer<typeof onboardingReformulateRequestSchema>

/**
 * Le VRAI résultat du modèle — jamais de repli fabriqué : un échec se traduit
 * par une erreur HTTP (voir `OnboardingController.reformulateAnswer`), pas par
 * une réponse 200 à `reformulated` vide ou deviné.
 */
export const onboardingReformulateResponseSchema = z.object({
  reformulated: z.string().min(1),
})
export type OnboardingReformulateResponse = z.infer<typeof onboardingReformulateResponseSchema>

/** The `SaveAnswers` patch carried by a prefill — drops provenance metadata. */
export function prefillToAnswers(fields: Record<string, PrefilledField>): SaveAnswers {
  const out: Record<string, string | string[]> = {}
  for (const key of PREFILLABLE_ANSWER_KEYS) {
    const field = fields[key]
    if (field && isAnswerFilled(field.value)) out[key] = field.value
  }
  return saveAnswersSchema.parse(out)
}

export const onboardingActivationSchema = z.object({
  /** ① #2077.3 — the commercial profile context was VALIDATED by this user
   *  (`profiles.profile_context_status === 'validated'`, D9), not merely
   *  filled in. A completed questionnaire isn't a validated profile — the
   *  milestone now reads the stronger fact. */
  profile_completed: z.boolean(),
  /** ② At least one analysis run was launched by this user (analysis_runs). */
  analysis_launched: z.boolean(),
  /** ③ A completed dossier was opened (product_events `account_viewed`). */
  dossier_viewed: z.boolean(),
  /** ④ A contact was enriched (product_events `contact_enriched` or a plan
   *  enrichment request in user_actions). */
  contact_enriched: z.boolean(),
  /** ⑤ A first message was copied or sent (user_actions message types). */
  message_prepared: z.boolean(),
  /** ⑥ #1810 — at least one personal or team tool is connected (mailbox,
   *  agenda, CRM — google_connections / microsoft_connections / crm_connections). */
  tool_connected: z.boolean(),
  /** ⑦ #2077.6 — a first structured correction on a dossier by THIS user
   *  (`account_feedback`): « ce play est hors sujet », « ce contact n'est plus
   *  là ». Personal like the others — a teammate's correction doesn't activate
   *  me, even though the correction itself belongs to the workspace memory. */
  correction_made: z.boolean(),
  /** ⑧ #2077.9 — see {@link ActivationStepStatus}: `not_applicable` when the
   *  caller cannot invite right now (no `team:manage`, or the workspace is at
   *  its seat cap) — excluded from `completed_count` AND from the applicable
   *  denominator, never counted as "not yet". */
  colleague_invited: activationStepStatusSchema,
  /** Number of milestones reached, among the APPLICABLE ones. */
  completed_count: z.number().int().min(0).max(ACTIVATION_STEP_KEYS.length),
  /** True once every APPLICABLE milestone is reached — the widget disappears. */
  is_complete: z.boolean(),
})
export type OnboardingActivation = z.infer<typeof onboardingActivationSchema>

/* -------------------------------------------------------------------------- */
/*  Couverture vs priorités (ONB-03, audit terrain du 17/08)                   */
/* -------------------------------------------------------------------------- */

/**
 * L'étendue déclarée d'une ESN : spécialiste, multi-spécialiste, généraliste.
 *
 * Le questionnaire portait DÉJÀ l'information (`positioning` : « Expertise de
 * niche », « Multi-compétences ciblées », « Généraliste »), mais personne ne
 * s'en servait pour interpréter la question suivante. Résultat, une ESN
 * généraliste qui couvre douze domaines se voyait demander cinq expertises sans
 * qu'on lui dise ce que ces cinq-là signifiaient — et « tout sélectionner »
 * paraissait la seule réponse honnête.
 *
 * La distinction que le produit doit tenir : la COUVERTURE est ce qu'on sait
 * faire, les PRIORITÉS sont ce sur quoi on veut aller chercher des affaires.
 * Un profil qui les confond dilue les prompts, les contacts et le score — le
 * généraliste obtient alors des recommandations moins bonnes que le spécialiste,
 * exactement l'inverse de ce qu'il attend en cochant plus de cases.
 */
export const COVERAGE_MODES = ['specialist', 'multi', 'generalist'] as const
export const coverageModeSchema = z.enum(COVERAGE_MODES)
export type CoverageMode = z.infer<typeof coverageModeSchema>

/**
 * L'étendue déduite du positionnement déclaré.
 *
 * Déduite et non demandée : poser une question de plus pour une information
 * qu'on possède déjà est le meilleur moyen d'obtenir deux réponses qui se
 * contredisent. `null` quand rien n'est déclaré, ou quand le positionnement ne
 * parle pas d'étendue (« Régie pure », « Conseil & Delivery » disent un MODE
 * d'intervention, pas une largeur de catalogue).
 */
export function coverageModeOf(positioning: string | null | undefined): CoverageMode | null {
  const value = (positioning ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (!value) return null
  if (value.includes('niche')) return 'specialist'
  if (value.includes('multi-competences') || value.includes('multi competences')) return 'multi'
  if (value.includes('generaliste')) return 'generalist'
  return null
}

/**
 * Une ESN généraliste qui n'a déclaré AUCUNE priorité commerciale.
 *
 * C'est le seul cas où l'onboarding doit avertir plutôt que laisser passer :
 * sans priorité, le produit n'a rien pour ordonner ses recommandations et
 * rendra du générique — ce que l'utilisateur lira comme « l'outil ne me connaît
 * pas ». Un spécialiste sans expertise déclarée est déjà bloqué par la
 * complétion du Temps 1 ; le généraliste, lui, peut « tout couvrir » et donc
 * croire qu'il n'a rien à prioriser.
 */
export function needsPriorityWarning(answers: Pick<EsnAnswers, 'positioning' | 'expertise_areas'>): boolean {
  return coverageModeOf(answers.positioning) === 'generalist' && answers.expertise_areas.length === 0
}
