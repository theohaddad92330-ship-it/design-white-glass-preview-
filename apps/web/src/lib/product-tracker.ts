/**
 * #1682 — le traceur produit. Minimal, sans aucune dépendance EXTERNE :
 * uniquement des API navigateur standard, plus UN import interne. Un traceur
 * qui appuie sur autre chose que `fetch`/`sendBeacon`/`localStorage` hérite du
 * budget, des failles et des mises à jour de ce qu'il importe.
 *
 * ⚠️ L'unique import est `apiUrl` (`lib/api-origin.ts`), et il n'est pas
 * négociable : GA-45 exige que TOUT appel passe par la porte unique. La version
 * d'origine relisait `VITE_API_URL` — élégant, et faux pour tout utilisateur
 * derrière une passerelle qui bloque le domaine direct. Voir `eventsUrl()`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONTRAT — l'union FERMÉE de 21 événements
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est la partie que cinq écrans (#1683, #1684, #1685, #1687, #1688) liront :
 *
 *   screen_viewed     { route, previousViewDurationMs, provenance }
 *   screen_left       { route, durationMs, leaveMode: 'nav'|'fermeture'|'inactivite' }
 *   tab_opened        { screen, tab }
 *   action_started    { action, screen }
 *   action_completed  { action, durationMs }
 *   action_abandoned  { action, atStep }
 *   filter_applied    { screen, filterName }
 *   search_performed  { screen, resultCount }
 *   error_shown       { screen, errorCode }
 *
 * #1946 (14/09/2026) — DIX formes de plus, et la raison de les ajouter est
 * écrite dans le titre de l'issue : « mesurer la VALEUR, pas le volume de
 * messages ». Elles mesurent ce qu'un geste a PRODUIT, jamais combien de fois
 * il a été fait :
 *
 *   assistant_first_question_sent  { screen }
 *   suggestion_clicked             { screen, rank }
 *   assistant_first_useful_result  { screen, durationMs }
 *   assistant_answer_judged        { screen, verdict: 'utile'|'pas_pertinent'|'donnee_fausse'|'deja_fait'|'pas_maintenant'|'mauvaise_priorite' }
 *   assistant_redirect_followed    { fromScreen, toScreen }
 *   prepared_action_stage          { action, stage: 'preparee'|'validee'|'executee'|'corrigee'|'abandonnee' }
 *   draft_reused                   { screen, extent: 'tel_quel'|'retouche'|'reecrit' }
 *   intervention_outcome           { intervention, outcome: 'suivie'|'ignoree'|'rejetee' }
 *   memory_added                   { screen }
 *
 * #2085 (15/09/2026) — DEUX formes de plus, la mesure des FRICTIONS du
 * parcours d'onboarding (où les gens s'arrêtent, quelle étape est reprise,
 * quel champ est abandonné) :
 *
 *   onboarding_prefill_reviewed    { screen, outcome: 'confirmed'|'corrected'|'ignored' }
 *   onboarding_step_back           { screen }
 *
 * #2085 (16/09/2026, lot « mesure-de-l'onboarding ») — SIX formes de plus.
 * Les trois premières distinguent le flux COMPORTEMENTAL (ce fichier) du flux
 * AUDIT voisin qui porte presque le même nom : `analysis_completed` et
 * `member_invited` (`product-analytics.service.ts`) existent déjà, mais
 * portent un `userId` et vivent dans le journal d'activité — deux flux
 * distincts, jamais mélangés (voir l'en-tête de ce fichier, §L'INTERRUPTEUR) :
 *
 *   onboarding_audit_generated      { screen }
 *   onboarding_audit_validated      { screen }
 *   onboarding_first_value_viewed   { screen }
 *   connector_activated             { screen }
 *   data_imported                   { screen }
 *   invitation_sent                 { screen }
 *
 * ⚠️ L'élargissement de l'union est une décision de Louis du 14/09/2026, prise
 * CONTRE la recommandation et sans que la relecture juridique RGPD de
 * `c64_analytique_produit` soit faite. Elle ne lève AUCUNE des cinq règles :
 * l'unité d'analyse reste l'écran / la fonction / le parcours, aucune de ces
 * dix formes ne porte de contenu, aucune ne porte d'identité, et le plancher de
 * sessions s'applique toujours à la LECTURE. Ce n'est PAS une troisième
 * exception nommée : il n'y en a que deux (#1946.22 et #1949.23), et une
 * troisième ferait rougir GA-264 / GA-266.
 *
 * `durationMs` est soit un NOMBRE de millisecondes, soit la chaîne littérale
 * `'over_30_min'` — jamais un nombre au-delà de 30 minutes (voir plus bas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON N'ÉMET JAMAIS — le cœur du lot, pas un détail
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contenu d'un champ. La valeur d'un filtre (« secteur=banque » désigne une
 * stratégie commerciale). Le texte d'une recherche. Les coordonnées d'un clic.
 * Le mouvement de souris. Chaque fonction d'émission ci-dessous n'accepte QUE
 * les paramètres du contrat — il n'existe structurellement aucun endroit où
 * glisser une valeur en plus. La garde qui le PROUVE sur ces fonctions, pas
 * seulement sur un type, vit dans
 * `apps/api/src/architecture/product-tracker-emits-no-content.spec.ts` (GA-264)
 * — un choix délibéré : elle lit ce fichier-ci en TEXTE, elle ne lui fait
 * jamais confiance sur ses propres exports.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INTERRUPTEUR — `VITE_PRODUCT_TRACKER_ENABLED`
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT DATÉ du 15/10/2026 (#4016.8d, décision Louis 11/10/2026,
 * `c64_analytique_produit`) : le traceur est ALLUMÉ par défaut dans un build de
 * PRODUCTION ; `VITE_PRODUCT_TRACKER_ENABLED=false` (ou `0`) l'arrête, et gagne
 * sur tout. Hors production (test, développement) : éteint tant que la variable
 * n'est pas `'true'`/`'1'`. Éteint = NO-OP STRICT : aucun timer posé, aucun
 * écouteur attaché, aucun appel réseau. ~~« Sans la variable : NO-OP STRICT —
 * défaut à l'ARRÊT, la relecture juridique n'étant pas faite »~~ (ancien
 * texte). Inchangé : relecture de session toujours interdite, aucun contenu,
 * hash de session tourné à 24 h, seuil de 5 sessions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MESURE DE DURÉE — les deux pièges nommés dans l'issue
 * ─────────────────────────────────────────────────────────────────────────────
 * (1) Le compteur s'arrête après 60 s d'INACTIVITÉ (pas de mouvement, pas de
 *     frappe, onglet caché) — sinon un onglet oublié compte 6 h. Un onglet
 *     caché n'a par construction plus d'événement souris/clavier réel, donc
 *     la même horloge couvre les trois cas.
 * (2) La durée est BORNÉE à 30 minutes par vue ; au-delà, la valeur rendue est
 *     la chaîne `'over_30_min'`, jamais un nombre.
 *
 * ⚠️ `requestAnimationFrame` NE TIRE JAMAIS dans un onglet caché — et jsdom,
 * lui, le fait tirer quand même : une horloge posée sur rAF se fige pour
 * toujours en production sans qu'aucun test ne le voie. L'horloge ci-dessous
 * est un `setInterval` (qui continue de tirer, au ralenti, en arrière-plan) et
 * `visibilitychange` — jamais rAF.
 */

import { apiUrl } from './api-origin'

type LeaveMode = 'nav' | 'fermeture' | 'inactivite'
type DurationMs = number | 'over_30_min'

/**
 * #1946 — les quatre énumérations FERMÉES des formes ajoutées. Fermées, et pas
 * des chaînes libres, pour la raison qui tient tout ce fichier : une chaîne
 * libre est un endroit où un contenu peut entrer. « Réponse jugée générique »
 * (#1946.9) se dit avec un verdict ; l'écrire avec l'extrait de la réponse
 * jugée serait la même phrase et une fuite.
 *
 * ⚠️ Le degré de réécriture (#1946.16, « messages commerciaux réécrits
 * ENTIÈREMENT ») se CALCULE là où le texte vit, et seul le degré voyage : le
 * traceur ne reçoit jamais ni le brouillon ni le message envoyé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D10 — décision Louis 14/09/2026 : la mesure connaît les six verdicts.
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour d'une personne sur une réponse de Laura a SIX verdicts
 * (`REPLY_FEEDBACK_VERDICTS`, `@bellum/contracts`) ; `AnswerVerdict` n'en
 * connaissait que trois, et les trois manquants (« déjà fait », « pas
 * maintenant », « mauvaise priorité ») n'avaient aucune case honnête. Élargi à
 * six, les TROIS NOUVEAUX AJOUTÉS À LA FIN (GA-08 — un enum ne perd jamais de
 * valeur et n'en insère jamais au milieu) : `deja_fait`, `pas_maintenant`,
 * `mauvaise_priorite`, sous le MÊME nom que leur verdict de retour d'origine —
 * la correspondance devient l'identité.
 *
 * ⚠️ CORRIGÉ le 14/09/2026 (lot « mesures-sans-appelant », en câblant le seul
 * appelant réel, `ReplyFeedback.tsx`) : les trois PREMIERS n'étaient PAS ceux
 * de `REPLY_FEEDBACK_VERDICTS` — `generique`/`inexacte` n'existent nulle part
 * ailleurs dans le dépôt (ni en base, ni dans un Zod, ni référencés par l'API
 * hors de fixtures de test arbitraires), un défaut resté invisible tant
 * qu'aucun appelant ne compilait les deux types ensemble. Les trois vrais sont
 * `utile`, `pas_pertinent`, `donnee_fausse`. Renommés ICI, pas déplacés :
 * GA-08 protège un enum qui voyage vers une contrainte SQL, ce qui n'est pas
 * le cas ici — `properties` est un JSONB sans contrainte sur `verdict` côté
 * API (`product-analytics.service.ts` ne valide que la présence de la CLÉ).
 *
 * Pas d'import de `ReplyFeedbackVerdict` ici : ce fichier n'a qu'UNE
 * dépendance externe (`apiUrl`, voir l'en-tête du fichier), et les six chaînes
 * sont recopiées à la main comme le reste de ce contrat — la garde qui les
 * tient est `product-tracker-emitters-have-a-caller.test.ts`.
 */
type PreparedActionStage = 'preparee' | 'validee' | 'executee' | 'corrigee' | 'abandonnee'
type AnswerVerdict = 'utile' | 'pas_pertinent' | 'donnee_fausse' | 'deja_fait' | 'pas_maintenant' | 'mauvaise_priorite'
type DraftExtent = 'tel_quel' | 'retouche' | 'reecrit'
type InterventionOutcome = 'suivie' | 'ignoree' | 'rejetee'

/**
 * #2085 — le sort d'une valeur PRÉREMPLIE (devinée depuis la fiche entreprise),
 * telle que `PrefillBadge.tsx` la rend : confirmée telle quelle, corrigée (le
 * focus va au champ, la valeur change ensuite par un `setAnswer` ordinaire —
 * jamais lue ici), ou ignorée (la suggestion est retirée). Une seule forme, un
 * seul verdict fermé — même motif que `assistant_answer_judged` : le geste
 * varie, jamais le texte qu'il porterait.
 */
type PrefillReviewOutcome = 'confirmed' | 'corrected' | 'ignored'

/**
 * #2085.6 — le sort d'une CONTRADICTION du questionnaire (`OnboardingContradictionCard.tsx`,
 * les huit détecteurs déterministes `onboarding-contradictions.ts`) : soit la
 * personne CORRIGE une des deux réponses en tension (« Corriger », renvoi vers
 * `editTarget`), soit elle confirme explicitement que les deux tiennent
 * (« Maintenir les deux »). « Expliquer » n'est pas un troisième outcome : ça
 * ne résout rien, ça révèle seulement l'hypothèse d'audit (#2029.11) — la
 * personne peut encore choisir l'une des deux issues ensuite.
 */
type ContradictionResolutionOutcome = 'corrected' | 'keptBoth'

type BehavioralEvent =
  | {
      name: 'screen_viewed'
      properties: { route: string; previousViewDurationMs: DurationMs | null; provenance: string | null }
    }
  | { name: 'screen_left'; properties: { route: string; durationMs: DurationMs; leaveMode: LeaveMode } }
  | { name: 'tab_opened'; properties: { screen: string; tab: string } }
  | { name: 'action_started'; properties: { action: string; screen: string } }
  | { name: 'action_completed'; properties: { action: string; durationMs: DurationMs } }
  | { name: 'action_abandoned'; properties: { action: string; atStep: string } }
  | { name: 'filter_applied'; properties: { screen: string; filterName: string } }
  | { name: 'search_performed'; properties: { screen: string; resultCount: number } }
  | { name: 'error_shown'; properties: { screen: string; errorCode: string } }
  // #1946 — s'AJOUTENT à la fin, jamais au milieu : la liste voyage vers la
  // base (`event_name`) et vers trois gardes qui la recopient, et un ordre qui
  // bouge se lit comme une valeur perdue (GA-08).
  | { name: 'assistant_first_question_sent'; properties: { screen: string } }
  | { name: 'suggestion_clicked'; properties: { screen: string; rank: number } }
  | { name: 'assistant_first_useful_result'; properties: { screen: string; durationMs: DurationMs } }
  | { name: 'assistant_answer_judged'; properties: { screen: string; verdict: AnswerVerdict } }
  | { name: 'assistant_redirect_followed'; properties: { fromScreen: string; toScreen: string } }
  | { name: 'prepared_action_stage'; properties: { action: string; stage: PreparedActionStage } }
  | { name: 'draft_reused'; properties: { screen: string; extent: DraftExtent } }
  | { name: 'intervention_outcome'; properties: { intervention: string; outcome: InterventionOutcome } }
  | { name: 'memory_added'; properties: { screen: string } }
  // #2085 (15/09/2026) — les frictions du parcours d'onboarding. Deux formes,
  // à la fin de l'union comme les précédentes (GA-08) : ce qu'une suggestion
  // préremplie est devenue, et qu'une étape a été reprise en ARRIÈRE — un
  // signal que `screen_left`/`screen_viewed` (génériques, posés par le
  // routeur) ne distinguent pas d'une navigation en avant.
  | { name: 'onboarding_prefill_reviewed'; properties: { screen: string; outcome: PrefillReviewOutcome } }
  | { name: 'onboarding_step_back'; properties: { screen: string } }
  // #2085 (16/09/2026) — six formes de plus, chacune un geste DISTINCT du flux
  // AUDIT voisin qui porte un nom proche (`analysis_completed`,
  // `integration_connected`, `member_invited`… tous dans
  // `product-analytics.service.ts`, avec un `userId`). Ici : anonyme, par
  // ÉCRAN, jamais par personne.
  | { name: 'onboarding_audit_generated'; properties: { screen: string } }
  | { name: 'onboarding_audit_validated'; properties: { screen: string } }
  | { name: 'onboarding_first_value_viewed'; properties: { screen: string } }
  | { name: 'connector_activated'; properties: { screen: string } }
  | { name: 'data_imported'; properties: { screen: string } }
  | { name: 'invitation_sent'; properties: { screen: string } }
  // #2085.6 (23/09/2026) — la relecture d'onboarding EST le seul endroit où
  // une contradiction se résout (`OnboardingContradictionCard.tsx`), ajouté
  // en fin comme les précédents (GA-08).
  | {
      name: 'onboarding_contradiction_resolved'
      properties: { screen: string; outcome: ContradictionResolutionOutcome }
    }
  // #2985 (26/09/2026) — le Meeting OS (#2319) : neuf formes de plus, à la fin
  // comme les précédentes (GA-08). Chacune un ÉCRAN seul, sauf `question_used`
  // qui porte un RANG (même motif que `suggestion_clicked` : la position
  // rendue, jamais le texte de la question). Le contrat d'origine (#2985) en
  // nomme onze ; UNE manquait ici — `crm_writeback_confirmed` — faute d'un
  // geste qui la rendrait honnête aujourd'hui (le stade CRM proposé depuis
  // cette carte n'atteint jamais mieux que `'proposed'` — une écriture
  // confirmée vit dans la porte générique de l'Action OS, hors périmètre de ce
  // lot). Voir le rapport du lot sur #2985.
  | { name: 'brief_generated'; properties: { screen: string } }
  | { name: 'brief_opened'; properties: { screen: string } }
  | { name: 'question_used'; properties: { screen: string; rank: number } }
  | { name: 'notes_added'; properties: { screen: string } }
  | { name: 'summary_generated'; properties: { screen: string } }
  | { name: 'summary_approved'; properties: { screen: string } }
  | { name: 'actions_created'; properties: { screen: string } }
  | { name: 'followup_created'; properties: { screen: string } }
  | { name: 'false_association_corrected'; properties: { screen: string } }
  // #2319.123 — tranché sans Louis (29/09/2026) : `meeting_completed` manquait
  // faute d'une fin de rendez-vous qui se déclare à l'écran. Construire cette
  // affordance (un bouton « Terminer ») serait une décision d'écran neuve,
  // hors d'un lot de câblage. La plus simple décision compatible avec la
  // doctrine : le SEUL endroit où l'outil reconnaît déjà le rendez-vous comme
  // terminé, du point de vue du commercial, est la validation ÉCRITE du
  // compte rendu (`MeetingNotesCard.onApprove`, issue `'done'` du kind
  // `recap`) — le même geste que `summary_approved`, jamais deviné, jamais un
  // second calcul (GA-26). `meeting_completed` porte l'intention FUNNEL (le
  // rendez-vous est clos), `summary_approved` porte l'intention ARTEFACT (le
  // texte du résumé est validé) : deux mesures distinctes du même geste, pas
  // une donnée dupliquée.
  | { name: 'meeting_completed'; properties: { screen: string } }
  // #2108.49-.53 (épopée #2767, 29/09/2026) — les CINQ mesures du geste
  // accepter/reporter/rejeter/corriger sur une carte de priorité
  // (`CardDispositionControls.tsx`, #2099.17-.32, livré le 28/09). La liste
  // blanche d'ingestion (BEHAVIORAL_EVENT_NAMES côté serveur) a été corrigée
  // le 29/09 (#2767, lot R01) pour un AUTRE trou (les neuf événements Meeting
  // OS) — ces cinq-ci restaient un second trou, nommé mais jamais câblé côté
  // FRONT (aucun appelant, `git grep priority_` sur ce fichier avant ce lot :
  // 0 résultat). `kind` est le genre DÉJÀ porté par la carte
  // (`briefingActionKindSchema`, un enum fermé) — jamais un second calcul
  // (GA-26). `priority_corrected` couvre le motif `wrong_data` du geste
  // « Pas pertinent » (une donnée fausse EST une correction) ;
  // `priority_rejected` couvre les cinq autres motifs — les deux jamais
  // confondus, sinon `corrected` perdrait son sens.
  | { name: 'priority_viewed'; properties: { screen: string; kind: string } }
  | { name: 'priority_accepted'; properties: { screen: string; kind: string } }
  | { name: 'priority_snoozed'; properties: { screen: string; kind: string } }
  | { name: 'priority_rejected'; properties: { screen: string; kind: string } }
  | { name: 'priority_corrected'; properties: { screen: string; kind: string } }
  // #2108.54 (épopée #2767, 30/09/2026) — une tâche est cochée dans une liste
  // de tâches (`TaskList`, geste `completeWithConfirmation`). Un écran seul :
  // le titre de la tâche est exactement le genre de contenu que ce fichier
  // n'émet jamais (voir l'en-tête, §CE QU'ON N'ÉMET JAMAIS).
  | { name: 'task_completed'; properties: { screen: string } }
  // #2319.129/.130 (épopée #2985, 30/09/2026) — une écriture CRM COMPOSÉE par
  // un compte rendu (provenance `meeting_note`, #2855) que la personne vient
  // de CONFIRMER dans la file (`ActionCenter`). Tranché sans Louis : on
  // l'émet au geste qui confirme, là où la provenance voyage déjà
  // (`target.source`), plutôt que de la porter à travers la file d'écriture
  // partagée. Un écran seul : ni le stade, ni l'affaire, ni la source.
  | { name: 'crm_writeback_confirmed'; properties: { screen: string } }

type QueuedEvent = BehavioralEvent & { occurredAt: string }

// ─── L'interrupteur ─────────────────────────────────────────────────────────

function isEnabled(): boolean {
  const raw = (import.meta.env.VITE_PRODUCT_TRACKER_ENABLED ?? '').toString().trim().toLowerCase()
  // L'ARRÊT est un geste explicite (`false`/`0`) — il gagne sur tout.
  if (raw === 'false' || raw === '0') return false
  if (raw === 'true' || raw === '1') return true
  // #4016.8d (Louis 11/10/2026) — allumé par défaut dans un build de PRODUCTION ; test et
  // développement restent éteints tant qu'on ne l'allume pas (aucun appel réseau en CI).
  return import.meta.env.PROD === true
}

// ─── L'horloge d'ACTIVITÉ — jamais rAF, voir le docblock d'en-tête ─────────

const TICK_MS = 1_000
const INACTIVITY_LIMIT_MS = 60_000
const MAX_VIEW_DURATION_MS = 30 * 60_000

let activeClockMs = 0
let lastActivityAt = Date.now()
let inactivityEmitted = false
let tickTimer: ReturnType<typeof setInterval> | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null

/** La lecture actuelle de l'horloge active — jamais l'horloge murale. */
function now(): number {
  return activeClockMs
}

/** Le temps ACTIF écoulé depuis un relevé de `now()`, borné à 30 min. */
function elapsedSince(mark: number): DurationMs {
  const raw = activeClockMs - mark
  return raw >= MAX_VIEW_DURATION_MS ? 'over_30_min' : raw
}

function markActive(): void {
  // Un onglet caché ne doit pas pouvoir raviver l'horloge : un événement
  // fantôme (certains frameworks en émettent en arrière-plan) ne doit pas
  // prolonger une vue que l'utilisateur ne regarde plus.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  lastActivityAt = Date.now()
  inactivityEmitted = false
}

function tick(): void {
  const idle = Date.now() - lastActivityAt
  if (idle <= INACTIVITY_LIMIT_MS) {
    activeClockMs += TICK_MS
    return
  }
  // Le seuil d'inactivité vient d'être franchi : la vue en cours, si elle
  // existe, se ferme ici — pas d'attente de la prochaine navigation, sinon un
  // onglet oublié resterait « en cours de vue » indéfiniment.
  if (currentScreen && !inactivityEmitted) {
    enqueue('screen_left', {
      route: currentScreen.route,
      durationMs: elapsedSince(currentScreen.mark),
      leaveMode: 'inactivite',
    })
    currentScreen = null
    inactivityEmitted = true
  }
}

// ─── Écrans ─────────────────────────────────────────────────────────────────

let currentScreen: { route: string; mark: number } | null = null

/**
 * Appelée par le routeur (`router.tsx`) à chaque résolution de navigation.
 * Ferme la vue précédente (`screen_left`, manière `'nav'`) et ouvre la
 * suivante (`screen_viewed`). Une résolution vers la MÊME route (changement de
 * paramètres de recherche seulement) ne rouvre pas de vue.
 */
export function notifyRouteViewed(route: string, provenance: string | null): void {
  if (!isEnabled()) return
  if (currentScreen && currentScreen.route === route) return

  const previousViewDurationMs = currentScreen ? elapsedSince(currentScreen.mark) : null
  if (currentScreen) {
    enqueue('screen_left', {
      route: currentScreen.route,
      durationMs: previousViewDurationMs as DurationMs,
      leaveMode: 'nav',
    })
  }
  currentScreen = { route, mark: now() }
  enqueue('screen_viewed', { route, previousViewDurationMs, provenance })
}

// ─── Actions — un début connu, ou pas d'événement (« non mesuré n'est jamais
//     0 ») ────────────────────────────────────────────────────────────────

const actionStarts = new Map<string, number>()
function actionKey(screen: string, action: string): string {
  return `${screen}::${action}`
}

export function trackTabOpened(screen: string, tab: string): void {
  if (!isEnabled()) return
  enqueue('tab_opened', { screen, tab })
}

export function trackActionStarted(action: string, screen: string): void {
  if (!isEnabled()) return
  actionStarts.set(actionKey(screen, action), now())
  enqueue('action_started', { action, screen })
}

export function trackActionCompleted(action: string, screen: string): void {
  if (!isEnabled()) return
  const key = actionKey(screen, action)
  const mark = actionStarts.get(key)
  actionStarts.delete(key)
  // #1682 — non mesuré n'est jamais 0 : sans un début connu, on ne fabrique
  // pas une durée, on n'émet rien.
  if (mark === undefined) return
  enqueue('action_completed', { action, durationMs: elapsedSince(mark) })
}

export function trackActionAbandoned(action: string, screen: string, atStep: string): void {
  if (!isEnabled()) return
  actionStarts.delete(actionKey(screen, action))
  enqueue('action_abandoned', { action, atStep })
}

/**
 * #2154.30 — l'écriture d'un écran, de son début à son issue : `action_started` à
 * l'appel, puis `action_completed` au SUCCÈS ou `action_abandoned` (étape `error`)
 * à l'échec. S'utilise comme options d'une mutation :
 * `mutation.mutate(vars, trackedMutation('project_created', '/projects'))`.
 * Par écran et par nom d'action, jamais par personne — comme les trois émetteurs
 * qu'elle compose.
 */
export function trackedMutation(action: string, screen: string): { onSuccess: () => void; onError: () => void } {
  trackActionStarted(action, screen)
  return {
    onSuccess: () => trackActionCompleted(action, screen),
    onError: () => trackActionAbandoned(action, screen, 'error'),
  }
}

export function trackFilterApplied(screen: string, filterName: string): void {
  if (!isEnabled()) return
  // #1682 — la valeur d'un filtre ne sort jamais, seulement son nom : la
  // signature elle-même n'a pas de troisième paramètre où en glisser une.
  enqueue('filter_applied', { screen, filterName })
}

export function trackSearchPerformed(screen: string, resultCount: number): void {
  if (!isEnabled()) return
  // #1682 — le NOMBRE de résultats, jamais la requête : aucun paramètre ici ne
  // porte un texte de recherche.
  enqueue('search_performed', { screen, resultCount })
}

export function trackErrorShown(screen: string, errorCode: string): void {
  if (!isEnabled()) return
  enqueue('error_shown', { screen, errorCode })
}

// ─── #1946 — la valeur, pas le volume ───────────────────────────────────────
//
// Deux repères de session, et ils sont la raison pour laquelle ce lot n'ajoute
// PAS un compteur de messages. « Ne pas optimiser uniquement le nombre de
// messages » (#1946.17) n'est pas tenu par la discipline d'un écran : le
// traceur n'émet qu'une SEULE ligne pour la première question d'une session, et
// rien du tout pour les suivantes. Il n'existe donc aucune ligne à partir de
// laquelle un volume de messages se reconstruirait.

let firstQuestionMark: number | null = null
let firstUsefulResultEmitted = false

/**
 * #1946.1 — « première question envoyée ». Les appels suivants n'émettent RIEN
 * (voir ci-dessus) ; ils servent seulement à poser le repère de départ du délai
 * jusqu'au premier résultat utile.
 */
export function trackAssistantQuestionSent(screen: string): void {
  if (!isEnabled()) return
  if (firstQuestionMark !== null) return
  firstQuestionMark = now()
  enqueue('assistant_first_question_sent', { screen })
}

/**
 * #1946.2 — « clic suggestion ». Le RANG de la suggestion, jamais son libellé :
 * une suggestion de Laura est souvent bâtie sur le portefeuille de
 * l'utilisateur (« Analyser <une société> »), donc son texte EST le pipe
 * commercial d'un client.
 *
 * Un rang qui n'est pas une position réelle n'émet rien plutôt que d'écrire un
 * `0` — « non mesuré n'est jamais 0 », et un rang 0 se lirait comme une
 * position.
 */
export function trackSuggestionClicked(screen: string, rank: number): void {
  if (!isEnabled()) return
  if (!Number.isInteger(rank) || rank < 1) return
  enqueue('suggestion_clicked', { screen, rank })
}

/**
 * #1946.3/.9/.23/.24 — ce que vaut une réponse, en TROIS verdicts. Le premier
 * verdict « utile » d'une session émet en plus le repère #1946.3 (« premier
 * résultat utile »), avec le délai depuis la première question — bornée à 30
 * min comme toute durée du traceur.
 *
 * Sans première question connue, AUCUN délai n'est fabriqué : le jugement sort,
 * le repère non.
 */
export function trackAssistantAnswerJudged(screen: string, verdict: AnswerVerdict): void {
  if (!isEnabled()) return
  enqueue('assistant_answer_judged', { screen, verdict })
  if (verdict !== 'utile' || firstUsefulResultEmitted || firstQuestionMark === null) return
  firstUsefulResultEmitted = true
  enqueue('assistant_first_useful_result', { screen, durationMs: elapsedSince(firstQuestionMark) })
}

/** #1946.4 — « redirection suivie » : Laura renvoie vers un écran, l'utilisateur
 *  y va. Deux motifs de route, rien d'autre. */
export function trackAssistantRedirectFollowed(fromScreen: string, toScreen: string): void {
  if (!isEnabled()) return
  enqueue('assistant_redirect_followed', { fromScreen, toScreen })
}

/**
 * #1946.5/.6/.7/.8/.25 — la chaîne d'une action PRÉPARÉE : préparée, validée,
 * exécutée, corrigée, abandonnée. Une seule forme d'événement et une étape
 * fermée, plutôt que cinq événements : ce sont les cinq états d'un même geste,
 * et cinq lignes séparées ne se rejoindraient que par une jointure qu'il aurait
 * fallu inventer.
 *
 * `action` est le NOM du geste (« relance_compte »), jamais sa cible : ni
 * compte, ni contact, ni message.
 */
export function trackPreparedActionStage(action: string, stage: PreparedActionStage): void {
  if (!isEnabled()) return
  enqueue('prepared_action_stage', { action, stage })
}

/** #1946.16/.24 — ce qu'un brouillon de Laura est devenu : repris tel quel,
 *  retouché, ou réécrit entièrement. Le DEGRÉ, jamais le texte. */
export function trackDraftReused(screen: string, extent: DraftExtent): void {
  if (!isEnabled()) return
  enqueue('draft_reused', { screen, extent })
}

/** #1946.10 — « intervention ignorée ». Le nom de la NATURE d'intervention et ce
 *  qu'elle est devenue — jamais son destinataire, jamais son texte. */
export function trackInterventionOutcome(intervention: string, outcome: InterventionOutcome): void {
  if (!isEnabled()) return
  enqueue('intervention_outcome', { intervention, outcome })
}

/** #1946.11 — « mémoire ajoutée ». Qu'une mémoire ait été posée, jamais ce
 *  qu'elle contient. */
export function trackMemoryAdded(screen: string): void {
  if (!isEnabled()) return
  enqueue('memory_added', { screen })
}

// ─── #2085 — les frictions du parcours d'onboarding ────────────────────────

/**
 * #2085.5/.19/.20 — ce qu'une suggestion préremplie est devenue :
 * `PrefillBadge.tsx` a trois boutons, ce traceur a un événement et un
 * verdict. Jamais la VALEUR devinée ni la valeur saisie ensuite — seulement
 * ce que l'utilisateur en a fait.
 */
export function trackPrefillReviewed(screen: string, outcome: PrefillReviewOutcome): void {
  if (!isEnabled()) return
  enqueue('onboarding_prefill_reviewed', { screen, outcome })
}

/**
 * #2085.17 — une étape du questionnaire reprise en ARRIÈRE. Le routeur émet
 * déjà `screen_left`/`screen_viewed` à chaque changement de sous-étape, mais
 * ces deux-là ne disent pas la DIRECTION : un retour ressemble, dans ce flux,
 * à une avancée. C'est ce signal-ci, posé par le seul appelant qui connaît la
 * direction (`useOnboardingNavigation.onBack`), qui la porte.
 */
export function trackOnboardingStepBack(screen: string): void {
  if (!isEnabled()) return
  enqueue('onboarding_step_back', { screen })
}

/**
 * #2085.7 — « audit généré » : la génération du profil de contexte a RÉUSSI
 * côté client (`useGenerateAuditPhases.runVerifyThenBuild`). Distinct
 * d'`analysis_completed` (flux AUDIT, `product-analytics.service.ts`,
 * `userId` porté) : celui-ci compte une ANALYSE de compte, jamais la
 * génération de l'audit d'onboarding lui-même.
 */
export function trackOnboardingAuditGenerated(screen: string): void {
  if (!isEnabled()) return
  enqueue('onboarding_audit_generated', { screen })
}

/**
 * #2085.8 — « audit validé » : le clic sur `useValidateProfileContext`
 * (D9 — le clic EST la décision) a réussi.
 */
export function trackOnboardingAuditValidated(screen: string): void {
  if (!isEnabled()) return
  enqueue('onboarding_audit_validated', { screen })
}

// #2085.9 — repère de session : « première valeur vue » n'a de sens qu'UNE
// fois par onglet, comme `firstUsefulResultEmitted` (#1946) juste au-dessus.
let firstValueViewedEmitted = false

/**
 * #2085.9 — « première valeur vue ». DÉFINITION (la plus discutable du lot,
 * donc écrite ici en toutes lettres) : le premier instant où un LIVRABLE réel
 * — l'audit généré à partir des données déclarées par l'utilisateur, tel que
 * `WelcomeScreen` le rend une fois `useEsnProfile` chargé — est effectivement
 * montré à l'écran. Ce n'est PAS le même repère que #2085.23 (« première
 * action UTILE ») : voir-son-audit est un événement PASSIF (l'écran s'affiche
 * avec de vraies données), agir dessus (ouvrir un compte, envoyer un message,
 * lancer une recherche) est un geste ACTIF — les deux se distinguent parce que
 * quelqu'un peut voir sans jamais agir, et c'est précisément la friction que
 * #2085 cherche à mesurer. Émis UNE fois par session (voir le repère
 * ci-dessus) : rouvrir `/welcome` dans le même onglet n'est pas une SECONDE
 * « première » valeur.
 */
export function trackOnboardingFirstValueViewed(screen: string): void {
  if (!isEnabled()) return
  if (firstValueViewedEmitted) return
  firstValueViewedEmitted = true
  enqueue('onboarding_first_value_viewed', { screen })
}

/**
 * #2085.11 — « connecteur ». Distinct du jalon d'ACTIVATION `tool_connected`
 * (`OnboardingActivation`, dérivé côté serveur pour la checklist) et de
 * l'événement AUDIT `integration_connected` (`product-analytics.service.ts`,
 * `userId` porté, déjà lu par l'entonnoir d'onboarding par cohorte
 * d'espaces). Celui-ci est anonyme, par ÉCRAN : posé au SEUL endroit qui
 * connaît une connexion RÉUSSIE côté navigateur — le retour d'un aller-retour
 * OAuth confirmé par le SERVEUR (`parseOAuthCallback`, jamais un clic
 * optimiste).
 */
export function trackConnectorActivated(screen: string): void {
  if (!isEnabled()) return
  enqueue('connector_activated', { screen })
}

/** #2085.12 — « import » : un import de données a été ÉCRIT (`outcome.written`
 *  de `ImportWizard.apply()`), jamais une simulation. */
export function trackDataImported(screen: string): void {
  if (!isEnabled()) return
  enqueue('data_imported', { screen })
}

/** #2085.13 — « invitation ». Distinct de l'événement AUDIT `member_invited`
 *  (`product-analytics.service.ts`, `userId` porté, journal d'activité) :
 *  celui-ci est anonyme, par ÉCRAN. */
export function trackInvitationSent(screen: string): void {
  if (!isEnabled()) return
  enqueue('invitation_sent', { screen })
}

/**
 * #2085.6 — « contradiction corrigée ». Émis par `OnboardingContradictionCard`
 * au clic sur l'un des deux gestes qui RÉSOLVENT une tension : jamais sur
 * « Expliquer » (qui ne fait que révéler l'hypothèse, #2029.11), jamais une
 * troisième valeur devinée pour la réponse elle-même — seulement le geste.
 */
export function trackContradictionResolved(screen: string, outcome: ContradictionResolutionOutcome): void {
  if (!isEnabled()) return
  enqueue('onboarding_contradiction_resolved', { screen, outcome })
}

// ─── #2985 — le Meeting OS (#2319) ─────────────────────────────────────────

/** #2319.102 (partiel) — le pré-brief a produit au moins un bloc affichable
 *  (`MeetingPrepDialog`, une fois le compte et son détail chargés). */
export function trackBriefGenerated(screen: string): void {
  if (!isEnabled()) return
  enqueue('brief_generated', { screen })
}

/** Le panneau de pré-brief s'ouvre — `MeetingPrepDialog`, à chaque rendez-vous
 *  ouvert, qu'un brief en sorte ou non. */
export function trackBriefOpened(screen: string): void {
  if (!isEnabled()) return
  enqueue('brief_opened', { screen })
}

/**
 * Une question suggérée est COCHÉE dans la checklist du mode live
 * (`MeetingLiveView`) — jamais son texte, seulement le RANG rendu (1-based),
 * même motif que `trackSuggestionClicked`. Décocher n'émet rien : ce n'est pas
 * un second usage, seulement une correction de la case.
 */
export function trackQuestionUsed(screen: string, rank: number): void {
  if (!isEnabled()) return
  if (!Number.isInteger(rank) || rank < 1) return
  enqueue('question_used', { screen, rank })
}

/** #2319.61-.63 — des notes ont été soumises à la structuration
 *  (`MeetingNotesCard.onStructure`) ; le bouton reste fermé sur un champ vide,
 *  donc cet appel porte toujours une soumission réelle. */
export function trackNotesAdded(screen: string): void {
  if (!isEnabled()) return
  enqueue('notes_added', { screen })
}

/** #1903.12 — la structuration a rendu un compte rendu avec un RÉSUMÉ non vide
 *  (`MeetingNotesCard.onStructure`, succès du serveur). */
export function trackSummaryGenerated(screen: string): void {
  if (!isEnabled()) return
  enqueue('summary_generated', { screen })
}

/** #1903.12 — le compte rendu a été VALIDÉ et écrit (`MeetingNotesCard.onApprove`,
 *  issue `'done'` du kind `recap` — jamais sur `'blocked'`/`'skipped'`/`'failed'`). */
export function trackSummaryApproved(screen: string): void {
  if (!isEnabled()) return
  enqueue('summary_approved', { screen })
}

/** Les actions choisies dans les prochaines étapes ont été créées SANS échec
 *  (`MeetingNotesCard.onCreateTasks`, `result.failed.length === 0`). */
export function trackActionsCreated(screen: string): void {
  if (!isEnabled()) return
  enqueue('actions_created', { screen })
}

/** #2103.18 — le mail de suivi a été DÉPOSÉ en brouillon (jamais envoyé,
 *  `MeetingNotesCard.onDepositEmailDraft`, succès du serveur). */
export function trackFollowupCreated(screen: string): void {
  if (!isEnabled()) return
  enqueue('followup_created', { screen })
}

/** #2319.123 — le rendez-vous est clos, du point de vue du commercial : même
 *  géste que `trackSummaryApproved` (`MeetingNotesCard.onApprove`, issue
 *  `'done'` du kind `recap`), jamais un second calcul (GA-26). Voir la
 *  décision au-dessus de `meeting_completed` dans `BehavioralEvent`. */
export function trackMeetingCompleted(screen: string): void {
  if (!isEnabled()) return
  enqueue('meeting_completed', { screen })
}

/**
 * #2319.16/.131 — le compte rattaché à un rendez-vous a été CORRIGÉ par
 * l'utilisateur (`MeetingPrepDialog`, le sélecteur « Corriger le compte » —
 * jamais le premier choix parmi des entreprises ambiguës, qui n'est pas une
 * correction d'erreur).
 */
export function trackFalseAssociationCorrected(screen: string): void {
  if (!isEnabled()) return
  enqueue('false_association_corrected', { screen })
}

/** #2108.49 — une carte de priorité est rendue à l'écran. Posé au montage,
 *  une fois par carte (jamais par re-rendu — voir l'appelant, `PriorityCard`,
 *  monté une fois par `id` React). */
export function trackPriorityViewed(screen: string, kind: string): void {
  if (!isEnabled()) return
  enqueue('priority_viewed', { screen, kind })
}

/** #2108.50 — la carte est marquée « Déjà traité » (`disposition: 'done'`) :
 *  le seul geste POSITIF du menu de disposition, jamais deviné d'un simple
 *  clic sur le CTA (qui ouvre une fiche, ne clôt rien). */
export function trackPriorityAccepted(screen: string, kind: string): void {
  if (!isEnabled()) return
  enqueue('priority_accepted', { screen, kind })
}

/** #2108.51 — la carte est reportée (`disposition: 'postponed'`), quelle que
 *  soit l'option choisie (cet après-midi/demain/cette semaine/date). */
export function trackPrioritySnoozed(screen: string, kind: string): void {
  if (!isEnabled()) return
  enqueue('priority_snoozed', { screen, kind })
}

/** #2108.52 — la carte est refusée (`disposition: 'dismissed'`) pour un motif
 *  AUTRE que « donnée fausse » — ce motif-là est `priority_corrected`, jamais
 *  compté deux fois. */
export function trackPriorityRejected(screen: string, kind: string): void {
  if (!isEnabled()) return
  enqueue('priority_rejected', { screen, kind })
}

/** #2108.53 — la carte est refusée pour motif « donnée fausse »
 *  (`reason: 'wrong_data'`) : une correction, pas un simple refus. */
export function trackPriorityCorrected(screen: string, kind: string): void {
  if (!isEnabled()) return
  enqueue('priority_corrected', { screen, kind })
}

/** #2108.54 — une tâche est cochée (`completeWithConfirmation`), jamais sur
 *  l'annulation (`undoCompletion`) : un décocher n'est pas un second
 *  achèvement. */
export function trackTaskCompleted(screen: string): void {
  if (!isEnabled()) return
  enqueue('task_completed', { screen })
}

/** #2319.129/.130 — l'écriture CRM d'un compte rendu est confirmée par la
 *  personne (approuvée, jamais rejetée ni seulement proposée). */
export function trackCrmWritebackConfirmed(screen: string): void {
  if (!isEnabled()) return
  enqueue('crm_writeback_confirmed', { screen })
}

// ─── Le germe de session — un hasard local, jamais un hachage côté client ──
//
// Le hachage + la rotation (règle 4, `c64_analytique_produit`) vivent côté
// SERVEUR (`hashBehavioralSession()`, `@bellum/contracts`,
// `ProductAnalyticsService.ingestBehavioralBatch`) : ce fichier envoie un
// germe brut aléatoire, jamais un hash, et ne le fait JAMAIS survivre à une
// fermeture d'onglet plus de 24 h — la garantie de rotation ne dépend
// toutefois pas de cette TTL locale, elle dépend du serveur qui écrit.

const SEED_STORAGE_KEY = 'bellum_pt_seed'
const SEED_TTL_MS = 24 * 60 * 60 * 1000
let sessionSeed: string | null = null

function randomSeed(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function getSessionSeed(): string {
  if (sessionSeed) return sessionSeed
  try {
    const raw = localStorage.getItem(SEED_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { seed?: unknown; createdAtMs?: unknown }
      if (
        typeof parsed.seed === 'string' &&
        typeof parsed.createdAtMs === 'number' &&
        Date.now() - parsed.createdAtMs < SEED_TTL_MS
      ) {
        sessionSeed = parsed.seed
        return sessionSeed
      }
    }
  } catch {
    // localStorage indisponible (navigation privée, quota…) — on retombe sur
    // un germe tenu en mémoire pour l'onglet en cours.
  }
  const seed = randomSeed()
  sessionSeed = seed
  try {
    localStorage.setItem(SEED_STORAGE_KEY, JSON.stringify({ seed, createdAtMs: Date.now() }))
  } catch {
    // Best-effort : le germe reste utilisable pour cet onglet même si rien ne
    // peut être persisté.
  }
  return seed
}

// ─── Tampon + envoi ─────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = 15_000
const MAX_BUFFERED_EVENTS = 50

let buffer: QueuedEvent[] = []

/**
 * L'URL d'ingestion, résolue par LA PORTE UNIQUE (`lib/api-origin.ts`).
 *
 * ⚠️ GA-45, et l'incident qui l'a fait écrire : un utilisateur derrière une
 * passerelle qui bloque le domaine direct de l'API voit tout fonctionner — sauf
 * les appels qui CONTOURNENT la porte, parce qu'eux ignorent le repli. Un
 * traceur best-effort est le pire endroit possible pour ce défaut : il échoue
 * en silence par construction, donc personne ne le verrait, et la mesure serait
 * creuse pile chez les utilisateurs les plus contraints — FAUSSE sans jamais
 * avoir l'air cassée.
 *
 * `apiUrl()` rend une URL ABSOLUE même quand le repli est armé (base relative),
 * ce dont `sendBeacon` a besoin.
 */
function eventsUrl(): string {
  return apiUrl('/analytics/events').toString()
}

function enqueue<E extends BehavioralEvent>(name: E['name'], properties: E['properties']): void {
  if (!isEnabled()) return
  if (typeof document === 'undefined') return
  buffer.push({ name, properties, occurredAt: new Date().toISOString() } as QueuedEvent)
  if (buffer.length >= MAX_BUFFERED_EVENTS) flush('buffer_full')
}

/**
 * Envoie le tampon courant. Un échec est SILENCIEUX ET PERDU — best-effort,
 * comme le service serveur (`ProductAnalyticsService`) : jamais de reprise,
 * jamais une erreur visible à l'utilisateur. Le tampon est vidé AVANT
 * l'envoi : un lot qui échoue n'est donc jamais rejoué.
 */
function flush(reason: 'timer' | 'unload' | 'buffer_full'): void {
  if (buffer.length === 0) return
  const events = buffer
  buffer = []
  const payload = JSON.stringify({ sessionSeed: getSessionSeed(), events })

  if (reason === 'unload' && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(eventsUrl(), new Blob([payload], { type: 'application/json' }))
    } catch {
      // #1682 — un échec d'envoi est silencieux et perdu, sans reprise.
    }
    return
  }

  if (typeof fetch !== 'function') return
  fetch(eventsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // #1682 — best-effort : aucun appel réseau bloquant, aucune reprise.
  })
}

function onVisibilityChange(): void {
  if (typeof document === 'undefined') return
  if (document.visibilityState === 'hidden') return
  markActive()
}

function onPageHide(): void {
  if (currentScreen) {
    enqueue('screen_left', {
      route: currentScreen.route,
      durationMs: elapsedSince(currentScreen.mark),
      leaveMode: 'fermeture',
    })
    currentScreen = null
  }
  flush('unload')
}

// ─── Montage ────────────────────────────────────────────────────────────────

let installed = false

/**
 * Monte le traceur — appelée une fois, depuis `main.tsx`. NO-OP STRICT sans
 * `VITE_PRODUCT_TRACKER_ENABLED` : aucun timer, aucun écouteur.
 */
export function initProductTracker(): void {
  if (!isEnabled()) return
  if (typeof document === 'undefined' || installed) return
  installed = true

  lastActivityAt = Date.now()
  tickTimer = setInterval(tick, TICK_MS)
  flushTimer = setInterval(() => flush('timer'), FLUSH_INTERVAL_MS)

  document.addEventListener('pointerdown', markActive, { passive: true })
  document.addEventListener('keydown', markActive)
  document.addEventListener('scroll', markActive, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', onPageHide)
}

/** Réservé aux tests : remet le module dans l'état d'avant tout montage. */
export function resetProductTrackerForTests(): void {
  if (tickTimer) clearInterval(tickTimer)
  if (flushTimer) clearInterval(flushTimer)
  tickTimer = null
  flushTimer = null
  installed = false
  buffer = []
  currentScreen = null
  activeClockMs = 0
  lastActivityAt = Date.now()
  inactivityEmitted = false
  actionStarts.clear()
  // #1946 — sans ces deux lignes, un test hériterait du repère de session du
  // précédent et « la première question » ne sortirait plus jamais.
  firstQuestionMark = null
  firstUsefulResultEmitted = false
  firstValueViewedEmitted = false
  sessionSeed = null
  document.removeEventListener('pointerdown', markActive)
  document.removeEventListener('keydown', markActive)
  document.removeEventListener('scroll', markActive)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pagehide', onPageHide)
  try {
    localStorage.removeItem(SEED_STORAGE_KEY)
  } catch {
    // best-effort, comme le reste du module.
  }
}
