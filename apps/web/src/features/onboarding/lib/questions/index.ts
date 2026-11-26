/**
 * Pourquoi ce dossier existe : `lib/questions.ts` était un fichier unique de
 * 385 lignes que 396 demandes utilisateur en attente voulaient toucher en même
 * temps — le VERROU DE FICHIER, pas la machine, était ce qui empêchait
 * plusieurs auteurs d'écrire en parallèle.
 *
 * La règle pour la suite : **une sous-étape = un fichier ; ajouter ou changer
 * une question, c'est toucher UN seul fichier.** L'index ne fait que
 * recomposer l'ordre et exposer l'API publique — le chemin d'import
 * `@/features/onboarding/lib/questions` n'a pas bougé. Garde : `index.test.ts`.
 */
import { ancienneteStep } from './anciennete'
import { attributionStep } from './attribution'
import { decisionsAutoriteStep } from './decisions-autorite'
import { equipeManageeStep } from './equipe-managee'
import { outilsInvitationStep } from './outils-invitation'
import { responsabilitesAutoriteStep } from './responsabilites-autorite'
import { baseClientsActiviteStep } from './base-clients-activite'
import { baseClientsCapitalisationStep } from './base-clients-capitalisation'
import { baseClientsSuiviStep } from './base-clients-suivi'
import { cadrageActiviteStep } from './cadrage-activite'
import { cadrageOutilsStep } from './cadrage-outils'
import { cadrageMissionsStep } from './cadrage-missions'
import { cadrageRoleStep } from './cadrage-role'
import { cadrageLauraStep } from './cadrage-laura'
import { cadrageOffreStep } from './cadrage-offre'
import { cadrageExpertisesStep } from './cadrage-expertises'
import { cadrageStaffingStep } from './cadrage-staffing'
import { cadrageEconomieStep } from './cadrage-economie'
import { cadrageCiblesStep } from './cadrage-cibles'
import { cadrageTerritoireStep } from './cadrage-territoire'
import { cadrageExclusionsStep } from './cadrage-exclusions'
import { cadrageHorizonStep } from './cadrage-horizon'
import { canauxStep } from './canaux'
import { cheminsAccesStep } from './chemins-acces'
import { chiffreAffairesStep } from './chiffre-affaires'
import { ciblesStep } from './cibles'
import { clientIdealStep } from './client-ideal'
import { credibilitePreuvesStep } from './credibilite-preuves'
import { domaineOffreStep } from './domaine-offre'
import { domainesStep } from './domaines'
import { effectifReelStep } from './effectif-reel'
import { entrepriseStep } from './entreprise'
import { equipeCommercialeStep } from './equipe-commerciale'
import { freinStep } from './frein'
import { freinsStep } from './freins'
import { implantationStep } from './implantation'
import { interlocuteursStep } from './interlocuteurs'
import { maturiteStep } from './maturite'
import { mesuresStep } from './mesures'
import { objectifsStep } from './objectifs'
import { offrePrestationsStep } from './offre-prestations'
import { offrePrestationsEtatsStep } from './offre-prestations-etats'
import { outillageStep } from './outillage'
import { outillageAnnexeStep } from './outillage-annexe'
import { outillageQualiteStep } from './outillage-qualite'
import { positionnementStep } from './positionnement'
import { preferencesEchangesStep } from './preferences-echanges'
import { questionOuverteStep } from './question-ouverte'
import { quiFaitQuoiStep } from './qui-fait-quoi'
import { recrutementStep } from './recrutement'
import { reseauComptageStep } from './reseau-comptage'
import { roleStep } from './role'
import { routinesStep } from './routines'
import { santeActiviteStep } from './sante-activite'
import { secteursStep } from './secteurs'
import { staffingCadreStep } from './staffing-cadre'
import { staffingModesStep } from './staffing-modes'
import { tempsStep } from './temps'
import { tempsChargeStep } from './temps-charge'
import type { OnboardingStageDef, Question } from './types'
import { isDeferredToTemps2 } from './visibility'
import { vivierCollecteStep } from './vivier-collecte'
import { vivierComptageStep } from './vivier-comptage'
import { vivierEtatsStep } from './vivier-etats'

// `SubStep` reste interne au dossier (les fichiers de sous-étape l'importent de
// `./types`) : l'API publique est exactement celle d'avant l'éclatement.
export type { Choice, ChoiceIconKey, CrmVocabularyField, OnboardingStageDef, Question } from './types'
// #2039.6 (épopée #2880) — `dynamicChoicesFromAnswerKey` (`multi`) se résout
// par CETTE fonction, à l'endroit qui sait déjà lire `answers` (le wizard),
// jamais recopiée.
export { choicesFromAnswerTags } from './types'
// #2023.5 — le branchement adaptatif se lit par CE chemin, comme le reste de
// l'API publique du dossier : `visibility.ts` reste le seul endroit qui
// l'implémente (GA-26).
export {
  answered,
  isConditionMet,
  isDeferredToTemps2,
  isQuestionVisible,
  questionsMatchingConditions,
  visibleQuestions,
} from './visibility'

export const TEMPS1_STAGES: OnboardingStageDef[] = [
  {
    code: 'company_info',
    title: 'stages.companyInfo',
    // #2054 — la cartographie de l'outillage tient trois sous-étapes : les
    // systèmes, les à-côtés, puis la qualité de la source de référence.
    steps: [
      entrepriseStep,
      equipeCommercialeStep,
      maturiteStep,
      santeActiviteStep,
      effectifReelStep,
      // #2046 — le vivier de consultants DÉCLARÉ, AJOUTÉ EN FIN comme les
      // lots précédents : l'ordre déjà posé ne bouge pas d'un cran.
      vivierComptageStep,
      vivierCollecteStep,
      vivierEtatsStep,
      // #2047 — la base de clients DÉCLARÉE, même principe.
      baseClientsActiviteStep,
      baseClientsCapitalisationStep,
      baseClientsSuiviStep,
      tempsStep,
      tempsChargeStep,
      routinesStep,
      outillageStep,
      outillageAnnexeStep,
      outillageQualiteStep,
      // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée
      // (siège + bureaux), AJOUTÉE EN FIN comme les blocs précédents.
      implantationStep,
      // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — le chiffre d'affaires
      // annuel et sa période, AJOUTÉ EN FIN comme les blocs précédents.
      chiffreAffairesStep,
      // Théo O onboarding-couverture (22/10) — « Précisions de cadrage » de la V23, AJOUTÉES EN FIN comme les blocs précédents.
      cadrageActiviteStep,
      cadrageOutilsStep,
      cadrageMissionsStep,
    ],
  },
  // #2018.2 — « Ton rôle » du stepper (`ONBOARDING_RESULT_STEPS`) attendait
  // ses questions Temps-1 depuis #2023.1 (`stageCodes: []`). Positionné juste
  // après `company_info` : on décrit l'entreprise, puis qui y répond.
  {
    code: 'role',
    title: 'stages.role',
    // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
    // DÉCLARÉ, quatre sous-étapes AJOUTÉES EN FIN comme les lots précédents :
    // ces réponses cadrent ce que Laura PROPOSE (#2033.9/.10), jamais ce que
    // l'API accepte (GA-26, `workspace-permission.guard.ts` reste seul).
    steps: [
      roleStep,
      ancienneteStep,
      decisionsAutoriteStep,
      equipeManageeStep,
      responsabilitesAutoriteStep,
      outilsInvitationStep,
      // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — associés, recruteurs,
      // delivery, marketing, ops et mode de coordination. AJOUTÉE EN FIN
      // comme les blocs précédents.
      quiFaitQuoiStep,
      // #2058.2 / #2058.10 — les moments acceptés pour être sollicité et le
      // niveau de détail attendu, réfutés en production le 20/09 : posés
      // côté profil progressif depuis le 19/09, jamais dans ce catalogue.
      // AJOUTÉE EN FIN comme les blocs précédents.
      preferencesEchangesStep,
      // Théo O onboarding-couverture (22/10) — précisions de cadrage V23 : prénom de Laura, périmètre, façon de travailler.
      cadrageRoleStep,
      cadrageLauraStep,
    ],
  },
  {
    code: 'offer_expertise',
    title: 'stages.offerExpertise',
    // Lot 26 (#2038, #2039, #2040) — quatre sous-étapes ajoutées EN FIN :
    // types de prestation, leurs états (prouvé/ambition), modes de réponse au
    // besoin, cadre de mise à disposition, preuves complémentaires.
    steps: [
      domaineOffreStep,
      domainesStep,
      positionnementStep,
      recrutementStep,
      offrePrestationsStep,
      offrePrestationsEtatsStep,
      staffingModesStep,
      staffingCadreStep,
      credibilitePreuvesStep,
      // Théo O onboarding-couverture (22/10) — précisions de cadrage V23 : offre, expertises, staffing, repères économiques.
      cadrageOffreStep,
      cadrageExpertisesStep,
      cadrageStaffingStep,
      cadrageEconomieStep,
    ],
  },
  {
    code: 'target_market',
    title: 'stages.targetMarket',
    // Lot L19 — `canaux` (#2048) et `mesures` (#2049) portent sur l'activité
    // commerciale RÉELLE : elles se posent après que la cible est nommée.
    // #2055 — `frein` demande LE plus gros ; `freins` demande le reste et les
    // trois relances qui séparent le symptôme du goulot. Elles ferment le stage.
    // Lot L17 (#2042, #2043, #2044) — client idéal, interlocuteurs et
    // chemins d'accès ferment le stage, AJOUTÉS EN FIN : l'ordre posé par
    // le lot L19 et #2055 ci-dessus ne bouge pas d'un cran.
    // #2059 — attribution marketing, AJOUTÉE EN FIN à son tour : même règle,
    // le lot L17 ne bouge pas d'un cran.
    steps: [
      secteursStep,
      ciblesStep,
      canauxStep,
      mesuresStep,
      freinStep,
      freinsStep,
      clientIdealStep,
      interlocuteursStep,
      cheminsAccesStep,
      attributionStep,
      // #2045.1/.2/.4/.7 (lot B, 22/09/2026) — le réseau personnel DÉCLARÉ
      // pour quatre portes de `canauxStep`, AJOUTÉE EN FIN comme les blocs
      // précédents.
      reseauComptageStep,
      // Théo O onboarding-couverture (22/10) — précisions de cadrage V23 : cibles, territoire, exclusions et accès.
      cadrageCiblesStep,
      cadrageTerritoireStep,
      cadrageExclusionsStep,
    ],
  },
  // #2018.4 — « Tes objectifs » du stepper attendait ses questions Temps-1
  // depuis #2023.1, comme `role` ci-dessus.
  {
    code: 'goals',
    title: 'stages.goals',
    // #2060 — `question-ouverte` FERME le parcours (#2060.1, libellé exact
    // de l'issue), AJOUTÉE EN FIN comme les blocs précédents.
    // Théo O onboarding-couverture (22/10) — l'horizon et le résultat attendu précèdent la question ouverte, qui FERME toujours le parcours.
    steps: [objectifsStep, cadrageHorizonStep, questionOuverteStep],
  },
]

export const TEMPS1_STAGE_CODES: string[] = TEMPS1_STAGES.map(s => s.code)

/** Every question of a stage, flattened across its sub-steps. */
export function stageQuestions(stage: OnboardingStageDef): Question[] {
  return stage.steps.flatMap(s => s.questions)
}

/**
 * #2022.4/.5 (R15N-9) — TOUTES les clés de réponse que le questionnaire du
 * Temps 1 POSE réellement, dans l'ordre du parcours — 80 au 15/09/2026 au
 * soir, et non les 10 de
 * `TEMPS1_REQUIRED_KEYS` (la porte de complétion serveur, `packages/contracts`).
 * Les deux répondent à des questions différentes : « ai-je le droit
 * d'entrer ? » contre « combien reste-t-il à faire ? ». Dérivée d'ICI, le seul
 * endroit qui connaît les sous-étapes (GA-26) : une question ajoutée à un
 * stage est comptée automatiquement, sans registre à tenir à jour à la main.
 */
export const TEMPS1_QUESTION_KEYS: Question['key'][] = TEMPS1_STAGES.flatMap(stageQuestions)
  // #2626.1 — depuis l'arbitrage du 20/09/2026, le Temps 1 ne POSE que ce
  // qu'il exige : 125 des 135 questions sont reposées au Temps 2. Le filtre est
  // ici et dans `isQuestionVisible`, tous deux appuyés sur le MÊME prédicat.
  .filter(q => !isDeferredToTemps2(q))
  .map(q => q.key)

/**
 * #2626.1 — les questions que le Temps 1 REND, dans l'ordre du parcours : le
 * catalogue du Temps 2, dérivé des stages (GA-26 — pas un second registre à
 * tenir à jour à la main, sinon il divergerait à la première question ajoutée).
 *
 * Elles ne sont ni supprimées ni perdues : elles ont changé de MOMENT. Le
 * complément de profil (`ProfileQuestionnaireDialog`, derrière la carte « Ton
 * premier dossier est prêt. Affinons-le. ») les repose après les 6 blocs du
 * questionnaire de profil.
 */
export const TEMPS1_DEFERRED_QUESTIONS: Question[] = TEMPS1_STAGES.flatMap(stageQuestions).filter(isDeferredToTemps2)

/** A sub-step plus its position in the global Temps-1 sequence. */
export type FlatSubStep = {
  index: number
  stageCode: string
  stageIndex: number
  slug: string
  questions: Question[]
}

/**
 * #2626.1 — LE CATALOGUE : toutes les sous-étapes et toutes leurs questions,
 * sans tenir compte du moment où elles se posent.
 *
 * C'est ce que le dépôt CONTIENT ; `TEMPS1_SUBSTEPS` juste en dessous est ce
 * que le Temps 1 POSE. Les deux existaient confondus avant l'arbitrage du
 * 20/09/2026 ; ils se séparent ici, et les gardes de corpus (« une sous-étape =
 * un fichier », « l'éclatement n'a rien perdu ») lisent celui-ci — sinon elles
 * accuseraient un fichier d'être orphelin parce que sa question est reposée
 * plus tard.
 */
export const TEMPS1_CATALOGUE_SUBSTEPS: FlatSubStep[] = TEMPS1_STAGES.flatMap((stage, stageIndex) =>
  stage.steps.map(step => ({
    index: 0,
    stageCode: stage.code,
    stageIndex,
    slug: step.slug,
    questions: step.questions,
  })),
).map((s, index) => ({ ...s, index }))

export const TEMPS1_SUBSTEPS: FlatSubStep[] = TEMPS1_CATALOGUE_SUBSTEPS.map(s => ({
  ...s,
  // #2626.1 — la sous-étape ne porte QUE ce que le Temps 1 pose encore.
  questions: s.questions.filter(q => !isDeferredToTemps2(q)),
}))
  // Une sous-étape entièrement reportée n'est plus une étape : elle sort du
  // parcours plutôt que d'afficher une page blanche à traverser. Elle n'est pas
  // perdue pour autant — ses questions sont dans `TEMPS1_DEFERRED_QUESTIONS`.
  .filter(s => s.questions.length > 0)
  .map((s, index) => ({ ...s, index }))

export function findSubStep(stageCode: string, slug: string): FlatSubStep | undefined {
  return TEMPS1_SUBSTEPS.find(s => s.stageCode === stageCode && s.slug === slug)
}

/**
 * #2626.1 — la sous-étape telle que le CATALOGUE la définit, qu'elle soit
 * encore posée au Temps 1 ou reposée au Temps 2.
 *
 * `findSubStep` répond « où en est le parcours ? » ; celle-ci répond « que
 * contient cette sous-étape ? ». Les gardes de rendu (champ, carte, guide) ont
 * besoin de la seconde : elles prouvent qu'un MÉCANISME marche sur une question
 * RÉELLE, et une question réelle reposée au Temps 2 reste une question réelle.
 */
export function findCatalogueSubStep(stageCode: string, slug: string): FlatSubStep | undefined {
  return TEMPS1_CATALOGUE_SUBSTEPS.find(s => s.stageCode === stageCode && s.slug === slug)
}

export function firstSlugOfStage(stageCode: string): string | undefined {
  return TEMPS1_STAGES.find(s => s.code === stageCode)?.steps[0]?.slug
}
