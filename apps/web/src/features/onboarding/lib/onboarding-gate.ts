import { isAnswerFilled, TEMPS1_REQUIRED_KEYS, type EsnAnswers } from '@bellum/contracts'
import type { UserCredits } from '@/features/credits/api'
import { hasExistingOffer } from './existing-offer'
import { TEMPS1_QUESTION_KEYS, TEMPS1_SUBSTEPS, type FlatSubStep } from './questions'

/** Ce que les gardes savent du compte au moment de décider. `null` = la lecture
 *  a échoué (429, panne, réseau) — « on ne sait pas », jamais « c'est faux ». */
type OnboardingGateInput = {
  status: string | null | undefined
  credits: UserCredits | null | undefined
  /**
   * Quand l'utilisateur a explicitement reporté le questionnaire (« Plus
   * tard »). `null`/absent = il ne l'a pas reporté.
   *
   * Cette entrée existe pour remplacer un raccourci qui coûtait cher (recette
   * finale §13). Il fallait bien une sortie, sinon quelqu'un qui refuse le
   * questionnaire y est renvoyé à chaque navigation ; faute de trace du refus,
   * le code utilisait « ce compte a déjà une offre » comme preuve qu'il l'avait
   * REMPLI. Deux choses différentes : un compte bêta est provisionné avec un
   * palier AVANT d'avoir répondu à quoi que ce soit. Résultat, tout nouveau
   * compte bêta sautait l'onboarding et lançait des analyses génériques en se
   * présentant comme personnalisé.
   *
   * Le droit commercial (a-t-il un palier ?) et l'état du profil (a-t-il
   * répondu ?) sont désormais deux questions séparées, et seule la seconde
   * décide de cet écran.
   */
  skippedAt?: string | null
  /**
   * #2021 — DÉCISION LOUIS 08/10/2026 : la date de la PREMIÈRE complétion
   * RÉELLE de l'onboarding (`OnboardingStateResponse.first_completed_at`,
   * `null`/absent s'il n'a jamais été terminé). Le signal qui distingue, à
   * `status: 'refresh_required'`, un utilisateur DÉJÀ onboardé (le bandeau
   * de reprise prend le relais, plus de redirection) d'un utilisateur qui
   * n'a jamais terminé le questionnaire (qui reste redirigé).
   */
  firstCompletedAt?: string | null
}

/**
 * Ce compte doit-il passer par le questionnaire ? — LE prédicat, partagé par
 * les deux côtés de la porte.
 *
 * Il existait en deux versions qui se contredisaient, et c'est ce désaccord qui
 * a mis la production à genoux :
 *
 *   - `CustomerPageContent`, monté sur TOUTE page client, redirigeait vers
 *     `/onboarding` dès que `status !== 'completed'` ;
 *   - le garde de `/onboarding` renvoyait vers `/dashboard` dès que
 *     `hasExistingOffer(credits)`.
 *
 * Un compte `status: 'in_progress'` AVEC une analyse déjà consommée satisfait
 * les deux : `/dashboard` renvoyait vers `/onboarding`, qui renvoyait vers
 * `/dashboard`. Boucle infinie, un `GET /onboarding/state` par tour, l'API
 * rate-limite, et le 429 levé dans un `beforeLoad` casse l'écran — « Oups ».
 * Le cas n'a rien d'exotique : il suffit d'avoir lancé une analyse sans avoir
 * fini le questionnaire, ce que le produit autorise explicitement (« Plus
 * tard » sur l'invite de complément de profil).
 *
 * Rendre le prédicat unique n'est pas un raccourci d'écriture : c'est ce qui
 * rend la boucle IMPOSSIBLE. Deux gardes qui lisent la même fonction sur les
 * mêmes données ne peuvent plus se renvoyer la balle.
 */
/** Où mène l'écran « Choisis ton offre » : l'afficher, ou en sortir. */
type PlanScreenDestination = 'show' | '/briefing' | '/onboarding/company'

/**
 * L'écran de tarifs se montre-t-il à ce compte ?
 *
 * Règle : on ne le montre QUE sur une lecture de crédits CERTAINE qui dit
 * « aucune offre servie ». Une lecture en échec n'est pas un compte neuf — et
 * c'est exactement ce que le garde concluait : `getMine().catch(() => null)`
 * puis `needsOnboarding(…, null)` ⇒ `true` ⇒ tarifs. Un abonné Growth dont le
 * `GET /credits/me` prenait un 429 se faisait donc demander de choisir une
 * offre qu'il paie déjà. Sans crédits lisibles on renvoie au tableau de bord :
 * l'écran normal de l'application, d'où le vrai nouveau venu peut relancer
 * l'onboarding.
 */
export function resolvePlanScreen({
  status,
  credits,
  creditsUnknown,
}: OnboardingGateInput & { creditsUnknown: boolean }): PlanScreenDestination {
  if (status === 'completed') return '/briefing'
  // Crédits illisibles (429, panne) : on ne peut pas savoir s'il y a un palier,
  // donc on ne demande pas d'en choisir un — mais on ne renvoie PAS au tableau
  // de bord non plus. Ce renvoi-là créait une boucle depuis que le questionnaire
  // ne se laisse plus dispenser par un palier : le tableau de bord réexpédie
  // vers l'onboarding tant que le questionnaire n'est pas fait, et l'onboarding
  // renvoyait au tableau de bord tant que les crédits étaient illisibles.
  // Continuer le questionnaire est sans risque — il ne demande aucun paiement —
  // et surtout, ça termine.
  if (creditsUnknown) return '/onboarding/company'
  // Offre déjà servie : rien à choisir ici — la suite du questionnaire NOMME
  // l'offre en place (`ExistingOfferNotice`), plutôt que de rediriger muettement.
  //
  // Cet écran-ci lit bien `hasExistingOffer` : « ai-je un palier ? » est
  // exactement la question qu'il pose. C'est le QUESTIONNAIRE qui n'avait pas le
  // droit de s'en servir comme preuve de complétion (§13) — et cette ligne est
  // la raison pour laquelle le prédicat existe encore.
  if (credits?.is_demo === true || hasExistingOffer(credits)) return '/onboarding/company'
  return 'show'
}

export function needsOnboarding({ status, credits, skippedAt, firstCompletedAt }: OnboardingGateInput): boolean {
  // Espace de démonstration : le visiteur arrive par un lien ouvert pour VOIR le
  // produit, jamais pour remplir un questionnaire. Il atterrit directement dans
  // l'app, quel que soit l'état d'onboarding du compte démo partagé.
  if (credits?.is_demo === true) return false
  // Questionnaire terminé : plus jamais.
  if (status === 'completed') return false
  // #2579 — la ligne qui vivait ici (`if (status === 'refresh_required')
  // return true`, posée par #2572 AVANT le report ci-dessous) est retirée :
  // elle était REDONDANTE avec l'invariant que le serveur tient déjà
  // (`OnboardingService.requestRefresh` efface `skipped_at` au moment même où
  // il pose `refresh_required` — même règle que `complete()` : « un
  // questionnaire terminé/une reconfiguration demandée efface son report »).
  // Donc juste après une demande, `skippedAt` est FORCÉMENT `null`, et le
  // `return true` final ci-dessous suffisait déjà. La ligne ne protégeait
  // rien — elle CASSAIT le seul cas qu'elle n'avait pas prévu : un « Plus
  // tard » posé APRÈS la demande. Un compte qui rouvrait la reconfiguration
  // puis reportait restait enfermé dans /onboarding, sans sortie (#2579.1,
  // #2579.2). Retirer cette ligne ne touche PAS `resolveOnboardingEntry`
  // (plus bas), qui lit le même `status === 'refresh_required'`
  // indépendamment de `skippedAt` : la reconfiguration reste proposée et
  // reprenable depuis Réglages › Profil (#2579.3, non-régression).
  //
  // Report EXPLICITE de l'utilisateur (« Plus tard »). C'est la seule autre
  // sortie, et elle est volontaire : on ne ramène pas quelqu'un vers un écran
  // qu'il vient de refuser. Les analyses lancées ensuite sont marquées
  // GÉNÉRIQUES — le report ne fait pas semblant d'être une complétion. C'est
  // aussi le geste le plus RÉCENT dès qu'il suit une demande de
  // reconfiguration : il rend la main.
  if (skippedAt) return false
  // #2021 — DÉCISION LOUIS 08/10/2026 (QCM), RENVERSE #2572 pour CE SEUL cas,
  // #2579 reste intacte (le report ci-dessus continue de rendre la main en
  // premier, qu'il ait ou non déjà été onboardé). Recette écran du 07-08/10 :
  // depuis Réglages › Profil, « Revoir ce questionnaire en mode guidé » →
  // « Compléter mon profil » → `/accounts`/`/search` redirigeaient de force
  // vers `/onboarding` tant qu'aucun « Plus tard » n'était cliqué — exactement
  // le piège que #2021 dénonce. Un utilisateur DÉJÀ onboardé qui redemande une
  // reconfiguration n'est PLUS redirigé : `OnboardingRefreshBanner`
  // (`shouldShowOnboardingRefreshBanner`, plus bas) prend le relais avec un
  // bandeau « Questionnaire en cours — Reprendre » discret, montré par
  // `CustomerPageContent`. Un utilisateur qui n'a JAMAIS terminé le
  // questionnaire — `firstCompletedAt` absent — reste redirigé comme avant :
  // ce n'est lui que la ligne #2572 protégeait réellement. `c91_reconfiguration_deja_onboarde_bandeau_pas_redirection`
  // au registre de doctrine.
  if (status === 'refresh_required' && firstCompletedAt) return false
  return true
}

/**
 * #2021 — DÉCISION LOUIS 08/10/2026 : le bandeau de reprise discret,
 * EXACTEMENT le cas que `needsOnboarding` ne redirige plus — même entrée,
 * même ordre de gardes (GA-26 : une seule dérivation). Visible SSI la
 * reconfiguration est en attente (`refresh_required`), ni terminée
 * (`skippedAt`/complétion ne s'appliquent pas à ce statut) ni reportée
 * (« Plus tard »), ET que ce compte a déjà terminé l'onboarding au moins une
 * fois — un utilisateur jamais onboardé ne voit jamais ce bandeau, il est
 * redirigé (voir `needsOnboarding` ci-dessus).
 */
export function shouldShowOnboardingRefreshBanner({
  status,
  credits,
  skippedAt,
  firstCompletedAt,
}: OnboardingGateInput): boolean {
  // Même garde qu'ailleurs dans ce fichier : une démonstration ne demande
  // jamais réellement de reconfiguration (`useReconfigureOnboarding`).
  if (credits?.is_demo === true) return false
  if (skippedAt) return false
  return status === 'refresh_required' && Boolean(firstCompletedAt)
}

/* -------------------------------------------------------------------------- */
/*  Page 0 (#2013) et reconfiguration guidée (#2022)                           */
/* -------------------------------------------------------------------------- */

/**
 * #2013.3 — la durée annoncée du questionnaire, à UN SEUL endroit (GA-26).
 *
 * Elle est annoncée sur la page 0 ET sert de base au temps estimé d'une
 * reconfiguration (#2022.5). Deux écrans qui recopieraient le nombre finiraient
 * par annoncer deux durées différentes pour le même questionnaire — c'est déjà
 * ce qui arrivait : la carte d'intro promettait « moins de 2 minutes » pendant
 * que l'issue en annonce huit à douze.
 */
export const ONBOARDING_ESTIMATED_MINUTES = { min: 8, max: 12 } as const

/**
 * #2013.1 — le questionnaire est-il encore VIERGE ?
 *
 * Déplacé ici depuis le garde de route : la page 0 pose exactement la même
 * question que lui, et deux copies de ce prédicat se contrediraient le jour où
 * l'une des deux apprend une clé de plus — c'est toute la leçon de
 * `needsOnboarding` juste au-dessus.
 *
 * La porte est l'ABSENCE DE RÉPONSES, délibérément pas `status ===
 * 'not_started'` : l'inscription crée déjà la ligne en `in_progress`, si bien
 * qu'un contrôle de statut rendrait cet écran inatteignable pour tout vrai
 * nouveau venu.
 */
export function isQuestionnaireUntouched(answers: EsnAnswers | undefined): boolean {
  if (!answers) return false
  return TEMPS1_REQUIRED_KEYS.every(key => !isAnswerFilled(answers?.[key]))
}

/** Ce que l'entrée `/onboarding` doit faire pour ce compte. */
type OnboardingEntry =
  /** #2013 — page 0 : la promesse avant la première question. */
  | 'welcome'
  /** #2022 — page 0, version « on a repensé la personnalisation ». */
  | 'reconfiguration'
  /** 16/09/2026 — page 0, version « des questions ne t'ont jamais été posées ».
   *  Voir {@link canOfferResume} : l'onboarding est marqué TERMINÉ, et des
   *  sous-étapes du parcours n'ont jamais été atteintes. */
  | 'resume'
  /** Le chemin historique : on reprend le questionnaire là où il en est. */
  | 'continue'

/**
 * #2013.1 / #2022.1 — qui voit la page 0, et laquelle.
 *
 * ⚠️ `continue` est le cas par défaut, et c'est voulu : quelqu'un au milieu du
 * questionnaire repasse par `/onboarding` à chaque navigation depuis le tableau
 * de bord. Lui remontrer la page de bienvenue à chaque fois transformerait un
 * écran d'accueil en péage. Deux comptes seulement la voient : celui qui n'a
 * encore rien répondu, et celui à qui on DEMANDE de reconfigurer.
 */
export function resolveOnboardingEntry({
  status,
  answers,
  awaitingAdmin = false,
}: {
  status: string | null | undefined
  answers: EsnAnswers | undefined
  /** #4158.12 — le membre attend l'administrateur : jamais l'accueil « reprise ». */
  awaitingAdmin?: boolean
}): OnboardingEntry {
  // La reconfiguration passe en premier : un espace existant a des réponses,
  // donc il ne peut pas être « vierge » — l'ordre rend la lecture explicite.
  if (status === 'refresh_required') return 'reconfiguration'
  // 16/09 : status=completed avec current_stage_code=transition_summary, étapes
  // 6-7 jamais atteintes. Avant cette ligne, la porte ne lisait que le statut et
  // cet espace-là ne revoyait plus jamais le questionnaire.
  if (!awaitingAdmin && hasUnreachedSubSteps({ status, answers })) return 'resume'
  if (isQuestionnaireUntouched(answers)) return 'welcome'
  return 'continue'
}

/**
 * #2014 — ONBOARDING SELON L'ORIGINE DU COMPTE.
 *
 * Ce que l'écran d'accueil (`welcome`, cf. {@link resolveOnboardingEntry})
 * peut dire d'un compte NEUF avant sa première réponse, sans jamais deviner.
 *
 * Sur les sept origines listées par l'issue (self-service, bêta provisionné,
 * invitation, démo, retour après paiement, ancien compte incomplet, transfert
 * d'espace), seules deux ont un signal FIABLE dans le produit aujourd'hui :
 *   - `beta_provisioned` — `credits.plan === 'beta'`, réservé au provisioning
 *     back-office (jamais posé par le trigger de signup self-service) ;
 *   - `paid_return` — un palier PAYANT (`starter`/`team`/`growth`) déjà servi
 *     alors que le questionnaire n'a pas encore une seule réponse : le compte
 *     a payé avant de configurer son activité.
 *
 * #2014.3 / #2014.7 (17/09/2026) — l'invitation d'un collègue et le transfert
 * vers un autre espace SONT désormais distingués : même événement (décision
 * Louis 17/09), un seul signal — la dernière invitation ACCEPTÉE pour cette
 * adresse, que `OnboardingService.getState` résout côté API et rend sous
 * `joined_workspace` (`onboarding.service.ts:findJoinedWorkspace`). Ce signal
 * l'emporte sur le palier : une invitation acceptée est un fait, jamais une
 * inférence — un compte self-service, bêta ou déjà payant peut tout autant
 * avoir été invité dans un AUTRE espace que le sien.
 *
 * Le compte né d'une démo reste sans signal (mesuré : aucun chemin ne
 * transforme un espace de démo PARTAGÉ en compte réel) et retombe sur
 * `self_service`, qui reste VRAI — jamais une devinette.
 *
 * « L'ancien compte incomplet » a déjà SON message : c'est `resume`
 * (`resolveOnboardingEntry`), pas une valeur de cette fonction — l'appelant
 * ne consulte l'origine QUE sur la branche `welcome`.
 */
type OnboardingOrigin = 'self_service' | 'beta_provisioned' | 'paid_return' | 'invited'

/** Paliers payants du catalogue live (`apps/web/src/lib/plans.ts`) — jamais
 *  posés par le trigger de signup (`decouverte`) ni par le provisioning
 *  admin (`beta`). */
const PAID_PLAN_CODES: ReadonlySet<string> = new Set(['starter', 'team', 'growth'])

/** Ce que `OnboardingStateResponse.joined_workspace` porte — voir
 *  `packages/contracts/src/schemas/onboarding.ts`. */
type JoinedWorkspace = { workspace_name: string; invited_by_name: string | null }

export function resolveOnboardingOrigin(
  credits: UserCredits | null | undefined,
  joinedWorkspace?: JoinedWorkspace | null,
): OnboardingOrigin {
  // #2014.3/.7 — le signal le plus direct (une invitation RÉELLEMENT
  // acceptée) l'emporte sur toute inférence tirée du palier.
  if (joinedWorkspace) return 'invited'
  const plan = credits?.plan
  if (plan === 'beta') return 'beta_provisioned'
  if (plan && PAID_PLAN_CODES.has(plan)) return 'paid_return'
  return 'self_service'
}

/* -------------------------------------------------------------------------- */
/*  Reprise d'un parcours marqué terminé avant d'avoir tout posé (16/09/2026)  */
/* -------------------------------------------------------------------------- */

/**
 * Les sous-étapes du Temps 1 dont AUCUNE question n'a de réponse.
 *
 * ⚠️ POURQUOI CETTE MESURE-LÀ, ET CE QU'ELLE NE SAIT PAS DIRE.
 * Rien n'enregistre les étapes ATTEINTES : `user_onboarding_state` ne porte
 * qu'un pointeur courant, et `user_onboarding_transitions` journalise les
 * STATUTS, pas les écrans. Le seul fait mesurable est donc « cette sous-étape
 * n'a pas une seule réponse » — ce qui ne distingue pas un écran jamais montré
 * d'un écran vu et laissé entièrement vide. Les deux se traitent pareil et
 * c'est délibéré : on ne sait pas, donc on PROPOSE, on ne relance jamais tout
 * seul (`canOfferResume` ne mène qu'à la page 0, qui attend un clic).
 *
 * La mesure porte sur la SOUS-ÉTAPE, pas sur la question, et c'est ce qui la
 * sépare de {@link reconfigurationPlan} : une réponse manquante sur un écran
 * qu'on a vu est un choix de l'utilisateur, pas une étape qu'on lui a volée.
 */
function unreachedSubSteps(answers: EsnAnswers | undefined): FlatSubStep[] {
  if (!answers) return [] // « on ne sait pas » n'est pas « il manque tout ».
  return TEMPS1_SUBSTEPS.filter(step => step.questions.every(question => !isAnswerFilled(answers[question.key])))
}

/** Statut terminal + des sous-étapes jamais posées — la condition exacte. */
function hasUnreachedSubSteps({
  status,
  answers,
}: {
  status: string | null | undefined
  answers: EsnAnswers | undefined
}): boolean {
  // `activated` est déclaré terminal au même titre que `completed`
  // (`ONBOARDING_TRANSITIONS`, API) : l'écrire ici évite que cette porte
  // redevienne muette le jour où le parcours d'activation se câble.
  if (status !== 'completed' && status !== 'activated') return false
  return unreachedSubSteps(answers).length > 0
}

/**
 * 16/09/2026 — PROPOSE-T-ON À CET ESPACE DE REPRENDRE SON QUESTIONNAIRE ?
 *
 * Mesuré en production sur l'espace de Louis : `GET /api/onboarding/state`
 * rendait `status: completed` avec `current_stage_code: transition_summary`, et
 * plus de soixante réponses à `null` — des sous-étapes AJOUTÉES au Temps 1 après
 * qu'il avait terminé (client idéal, interlocuteurs, chemins d'accès, outillage,
 * temps de charge, freins). `needsOnboarding` ne lit que le STATUT, donc
 * `/onboarding` le renvoyait chez Laura : le parcours ne se reprenait plus
 * JAMAIS. Décision de Louis le 16/09 : c'est un défaut, pas un état légitime.
 *
 * ⚠️ Ce n'est PAS « rouvrir l'onboarding à tout le monde », et le témoin est
 * dans les tests : un espace terminé qui a bien parcouru toutes ses sous-étapes
 * reste FERMÉ. Renvoyer un utilisateur satisfait dans un questionnaire de 72
 * questions serait un défaut de plus, dans l'autre sens.
 *
 * ⚠️ Et ce prédicat ne fait entrer personne : il autorise `/onboarding` à
 * AFFICHER la page 0, qui propose et attend un clic. `needsOnboarding` — celui
 * que lit `CustomerPageContent`, monté sur toute page client — n'est pas touché,
 * donc aucun écran ne redirige cet espace vers le questionnaire.
 */
export function canOfferResume({
  status,
  answers,
  credits,
  awaitingAdmin = false,
}: {
  status: string | null | undefined
  answers: EsnAnswers | undefined
  credits?: UserCredits | null
  /** #4158.12 — le membre attend que l'administrateur décrive l'ESN. */
  awaitingAdmin?: boolean
}): boolean {
  // #4158.12 — la « reprise » rouvrirait des questions entreprise que ce membre
  // ne remplit pas (l'API les ignore) : il garde son chemin de questions perso.
  if (awaitingAdmin) return false
  // Espace de DÉMONSTRATION : partagé entre prospects. Un visiteur renvoyé dans
  // le questionnaire y laisserait le compte que le prospect suivant va ouvrir.
  if (credits?.is_demo === true) return false
  return hasUnreachedSubSteps({ status, answers })
}

/**
 * #2022.4 / #2022.5 — ce qu'une reconfiguration REDEMANDE, et le temps que ça
 * prend.
 *
 * ⚠️ CE QU'ON SAIT NOMMER, ET CE QU'ON NE SAIT PAS. L'issue demande quatre
 * familles : les champs NOUVEAUX, les ambiguïtés, les contradictions et les
 * informations DEVENUES OBSOLÈTES. Une seule est mesurable ici : une réponse
 * absente. Les trois autres supposent une date PAR RÉPONSE (obsolescence) ou
 * une relecture croisée (ambiguïté, contradiction) que ni `esn_profiles` ni
 * `OnboardingStateResponse` ne portent — les deviner reviendrait à reposer des
 * questions au hasard à quelqu'un qui y a déjà répondu. On rend donc ce qui est
 * VRAI ; le reste reste non mesuré plutôt que compté à zéro.
 *
 * `estimatedMinutes` vaut `null` quand il n'y a rien à redemander : « 0 minute »
 * serait faux, et une durée inventée pire encore.
 *
 * R15N-9 — le dénominateur est `TEMPS1_QUESTION_KEYS`, ce que le PARCOURS pose
 * réellement, PAS `TEMPS1_REQUIRED_KEYS`, la porte de complétion serveur.
 * Mesuré en production le 15/09 : les dix clés requises remplies rendaient un
 * plan VIDE alors que 33 des 52 réponses du questionnaire restaient absentes —
 * « ai-je le droit d'entrer ? » et « combien reste-t-il à faire ? » sont deux
 * questions différentes. Aucun des deux nombres ne s'écrit ici : le
 * questionnaire en pose 72 depuis la vague du 15/09, et un nombre recopié dans
 * un commentaire redevient faux à la question suivante.
 */
type ReconfigurationPlan = {
  /** Les clés du Temps 1 encore sans réponse, dans l'ordre du questionnaire. */
  keys: (keyof EsnAnswers)[]
  /** Fourchette dérivée de {@link ONBOARDING_ESTIMATED_MINUTES}, `null` si rien. */
  estimatedMinutes: { min: number; max: number } | null
}

export function reconfigurationPlan(answers: EsnAnswers | undefined): ReconfigurationPlan {
  const keys = TEMPS1_QUESTION_KEYS.filter(key => !isAnswerFilled(answers?.[key]))
  if (keys.length === 0) return { keys: [], estimatedMinutes: null }

  // La fourchette se DÉRIVE de la durée du questionnaire complet, au prorata du
  // nombre de questions restantes — elle ne se saisit pas une deuxième fois.
  // Plancher à 1 minute : « 0 minute » n'est pas une durée.
  const share = keys.length / TEMPS1_QUESTION_KEYS.length
  const min = Math.max(1, Math.round(ONBOARDING_ESTIMATED_MINUTES.min * share))
  const max = Math.max(min, Math.round(ONBOARDING_ESTIMATED_MINUTES.max * share))
  return { keys: [...keys], estimatedMinutes: { min, max } }
}
