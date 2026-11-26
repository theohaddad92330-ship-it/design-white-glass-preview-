import type { AuditContradiction, CommercialTensionRuleId, ProfileContext } from '@bellum/contracts'
import {
  detectAcquisitionWithoutRoutine,
  detectCommercialTensions,
  detectContactWithoutFollowUpDate,
  detectContentWithoutCommercialUse,
  detectFeedbackNotRecorded,
  detectInterviewWithoutFollowUp,
  detectKeyAccountsWithoutAccessPath,
  detectMissionWithoutRenewal,
  detectMissionsWithoutCapitalisation,
  detectNeedReducedToTitle,
  detectNeedsWithoutQualification,
  detectObjectivesAboveCapacity,
  detectOfferWithoutProof,
  detectPartnersWithoutEconomicsOrFeedback,
  detectPoolWithoutAvailability,
  detectProfileNotSecured,
  detectProfilesWithoutCommitment,
  detectRfpsWithoutGoNoGo,
  detectTooManySimultaneousMarkets,
} from './tension-detectors'

/**
 * #2066.1-.10, .17, .27 — LA CHAÎNE FINE « CONTACT → … → CAPITALISATION ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE JOUR-LÀ : LA TABLE À SIX MACRO-ÉTAPES SE REMPLACE, PAS SE DOUBLE
 * ─────────────────────────────────────────────────────────────────────────
 * `feat/laudit-rend-ses-tensions-et-ses-axes` avait posé une chaîne à SIX
 * macro-étapes (Entrées → Qualification → Positionnement → Exécution →
 * Partenariats → Capitalisation) en attendant que #2066 livre son moteur fin.
 * Ce lot EST ce moteur : les 12 règles de #2064 et les 6 nouvelles de
 * #2066.11-.16 (18 au total, `tension-detectors.ts`) sont reclassées dans les
 * NEUF étapes nommées par le retour (#2066.1-.9) : Contact, Échange, Besoin,
 * Profil, Entretien, Accord, Démarrage, Suivi, Capitalisation — par IDENTITÉ
 * de règle (`ruleId`), jamais par un mot deviné dans son libellé. GA-26 :
 * une seule table fait cette correspondance, ici ; la six-étapes précédente
 * est retirée, pas conservée en parallèle.
 *
 * Le classement, et pourquoi :
 *  - `contact`   : entrer en contact et le RESTER — trop de marchés visés à
 *                  la fois, un grand compte sans voie d'accès vers le
 *                  décideur, une acquisition sans routine pour la tenir, un
 *                  contact sans date de reprise (#2066.11).
 *  - `exchange`  : ce qui se dit une fois le contact pris — une offre
 *                  affirmée sans preuve, du contenu produit mais jamais
 *                  réutilisé dans l'échange.
 *  - `need`      : qualifier ce que le prospect demande — des besoins sous
 *                  le seuil de qualification, un besoin réduit à un simple
 *                  intitulé (#2066.12).
 *  - `profile`   : le consultant proposé — un vivier sans disponibilité, un
 *                  profil engagé sur un dossier sans être sécurisé
 *                  (#2066.13).
 *  - `interview` : la rencontre décisive — un profil présenté sans
 *                  engagement client tracé, un entretien sans suite
 *                  enregistrée (#2066.14).
 *  - `agreement` : la décision de s'engager — un appel d'offres reçu sans
 *                  décision GO/NO-GO tracée.
 *  - `kickoff`   : démarrer sans dépasser sa capacité — des objectifs
 *                  mensuels supérieurs à la cadence recommandée.
 *  - `followUp`  : le suivi dans la durée — un partenariat actif sans
 *                  économie ni feedback connus, une mission éligible à un
 *                  renouvellement qui ne l'obtient jamais (#2066.15).
 *  - `capitalisation` : ce qui reste après coup — une mission terminée sans
 *                  capitalisation, un feedback client jamais consigné
 *                  (#2066.16). La dernière étape porte les DEUX dernières
 *                  règles du moteur : ce n'est pas un hasard de nommage,
 *                  c'est la même idée mesurée aux deux bouts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, JAMAIS UN QUATRIÈME INVENTÉ
 * ─────────────────────────────────────────────────────────────────────────
 * - `rupture` : au moins une règle de l'étape a RÉELLEMENT déclenché
 *   (`detectCommercialTensions` l'a mise dans `contradictions`).
 * - `measured` : aucune rupture, mais au moins une règle de l'étape a pu
 *   être évaluée et n'a rien signalé — un fait mesuré, pas une case vide.
 * - `unknown` : TOUTES les règles de l'étape manquent de signal — l'étape le
 *   dit, elle ne se rend jamais comme « rien à signaler ».
 *
 * Les fonctions de détection sont rappelées ICI, individuellement, pour
 * lire leur statut par règle (`clear` vs `unknown`) — `detectCommercialTensions`
 * ne réexpose pas cette distinction (son agrégat ne garde que les ruptures et
 * des libellés d'inconnu sans `ruleId`). Ce sont les MÊMES fonctions pures
 * que l'agrégateur appelle, jamais une deuxième dérivation : GA-26.
 *
 * ⚠️ Aujourd'hui, `build-audit.ts` n'appelle `detectCommercialTensions` qu'avec
 * `context` (jamais `signals`) : les 6 règles nouvelles ET 7 des 12 règles
 * d'origine dépendent d'un signal externe jamais relié. Sur un profil pauvre
 * (`technicien-petite-esn` du corpus #2070), les DIX-HUIT règles rendent
 * `unknown` — donc les NEUF étapes aussi. Ce n'est pas un trou de ce fichier :
 * c'est ce que `ProfileContext`, un questionnaire d'onboarding, ne porte pas.
 */

export type AuditChainStageKey =
  | 'contact'
  | 'exchange'
  | 'need'
  | 'profile'
  | 'interview'
  | 'agreement'
  | 'kickoff'
  | 'followUp'
  | 'capitalisation'

type AuditChainStageState = 'rupture' | 'measured' | 'unknown'

export type AuditChainStage = {
  key: AuditChainStageKey
  state: AuditChainStageState
  /** Les ruptures RÉELLEMENT déclenchées à cette étape — `[]` si aucune. */
  ruptures: AuditContradiction[]
}

export const AUDIT_CHAIN_STAGE_ORDER: readonly AuditChainStageKey[] = [
  'contact',
  'exchange',
  'need',
  'profile',
  'interview',
  'agreement',
  'kickoff',
  'followUp',
  'capitalisation',
]

export const AUDIT_CHAIN_STAGE_RULES: Record<AuditChainStageKey, readonly CommercialTensionRuleId[]> = {
  contact: [
    'tooManySimultaneousMarkets',
    'keyAccountsWithoutAccessPath',
    'acquisitionWithoutRoutine',
    'contactWithoutFollowUpDate',
  ],
  exchange: ['offerWithoutProof', 'contentWithoutCommercialUse'],
  need: ['needsWithoutQualification', 'needReducedToTitle'],
  profile: ['poolWithoutAvailability', 'profileNotSecured'],
  interview: ['profilesWithoutCommitment', 'interviewWithoutFollowUp'],
  agreement: ['rfpsWithoutGoNoGo'],
  kickoff: ['objectivesAboveCapacity'],
  followUp: ['partnersWithoutEconomicsOrFeedback', 'missionWithoutRenewal'],
  capitalisation: ['missionsWithoutCapitalisation', 'feedbackNotRecorded'],
}

/** #2066.10 — le libellé FR de chaque étape, pour le contenu personnalisé
 *  (non-i18n) que `build-audit.ts` écrit dans `breakpoints` — même
 *  discipline que le reste de ce fichier et de `tension-detectors.ts` : du
 *  texte FR en dur, jamais retraduit ailleurs (GA-26, une seule table). Le
 *  RENDU écran (`AuditChain.tsx`) passe par i18n (`chain.stage.<key>`),
 *  cette table-ci ne sert QUE le contenu dérivé côté `build-audit.ts`. */
export const AUDIT_CHAIN_STAGE_LABELS_FR: Record<AuditChainStageKey, string> = {
  contact: 'Contact',
  exchange: 'Échange',
  need: 'Besoin',
  profile: 'Profil',
  interview: 'Entretien',
  agreement: 'Accord',
  kickoff: 'Démarrage',
  followUp: 'Suivi',
  capitalisation: 'Capitalisation',
}

type RuleDetector = (context: ProfileContext | null | undefined) => { status: 'triggered' | 'clear' | 'unknown' }

const RULE_DETECTORS: Record<CommercialTensionRuleId, RuleDetector> = {
  objectivesAboveCapacity: detectObjectivesAboveCapacity,
  tooManySimultaneousMarkets: detectTooManySimultaneousMarkets,
  offerWithoutProof: detectOfferWithoutProof,
  acquisitionWithoutRoutine: detectAcquisitionWithoutRoutine,
  poolWithoutAvailability: detectPoolWithoutAvailability,
  needsWithoutQualification: detectNeedsWithoutQualification,
  profilesWithoutCommitment: detectProfilesWithoutCommitment,
  keyAccountsWithoutAccessPath: detectKeyAccountsWithoutAccessPath,
  partnersWithoutEconomicsOrFeedback: detectPartnersWithoutEconomicsOrFeedback,
  contentWithoutCommercialUse: detectContentWithoutCommercialUse,
  rfpsWithoutGoNoGo: detectRfpsWithoutGoNoGo,
  missionsWithoutCapitalisation: detectMissionsWithoutCapitalisation,
  contactWithoutFollowUpDate: detectContactWithoutFollowUpDate,
  needReducedToTitle: detectNeedReducedToTitle,
  profileNotSecured: detectProfileNotSecured,
  interviewWithoutFollowUp: detectInterviewWithoutFollowUp,
  missionWithoutRenewal: detectMissionWithoutRenewal,
  feedbackNotRecorded: detectFeedbackNotRecorded,
}

export function buildAuditChain(context: ProfileContext | null | undefined): AuditChainStage[] {
  const { contradictions } = detectCommercialTensions(context)

  return AUDIT_CHAIN_STAGE_ORDER.map(key => {
    const ruleIds = AUDIT_CHAIN_STAGE_RULES[key]
    const ruptures = contradictions.filter(item => (ruleIds as readonly string[]).includes(item.ruleId))
    if (ruptures.length > 0) return { key, state: 'rupture' as const, ruptures }

    const allUnknown = ruleIds.every(ruleId => RULE_DETECTORS[ruleId](context).status === 'unknown')
    return { key, state: (allUnknown ? 'unknown' : 'measured') as AuditChainStageState, ruptures: [] }
  })
}

/**
 * ⚠️ LOCAL, et pas par oubli : la règle du dépôt (knip,
 * `pnpm lint:exports:types`) interdit d'exporter un type que personne n'importe
 * par son nom. `findAuditChainBreakLocation` a bien un appelant réel
 * (`AuditChain.tsx:26`), mais il en INFÈRE le type de retour — le nom, lui,
 * n'est lu nulle part. Il redevient exporté le jour où quelqu'un l'annote.
 */
type AuditChainBreakLocation = {
  /** L'étape en RUPTURE — jamais devinée, la première dans l'ordre de la chaîne. */
  brokenKey: AuditChainStageKey
  /** L'étape juste avant, si elle existe — `null` si la rupture est la toute
   *  première étape (rien à situer AVANT « Contact »). */
  beforeKey: AuditChainStageKey | null
}

/**
 * #2066.10 — IDENTIFIER OÙ L'INFORMATION OU L'ACTION SE PERD, DANS LA CHAÎNE.
 *
 * `build-audit.ts:156` (le headline `bottleneck`) donnait déjà UN goulot —
 * un texte libre (`coachingInsights.mainWeakness`). Cette fonction le
 * PROLONGE : elle situe le goulot dans la chaîne quand une rupture existe,
 * au lieu d'ouvrir un second champ. `build-audit.ts` compose les deux (la
 * chaîne d'abord, le texte libre en repli) — jamais deux dérivations
 * indépendantes du même goulot (GA-26).
 *
 * `null` quand aucune étape n'est en rupture : pas de localisation à
 * inventer — le texte libre reste alors la seule source.
 */
export function findAuditChainBreakLocation(stages: readonly AuditChainStage[]): AuditChainBreakLocation | null {
  const brokenIndex = stages.findIndex(stage => stage.state === 'rupture')
  if (brokenIndex === -1) return null
  const brokenKey = stages[brokenIndex]?.key
  if (!brokenKey) return null
  const beforeKey = brokenIndex > 0 ? (stages[brokenIndex - 1]?.key ?? null) : null
  return { brokenKey, beforeKey }
}
