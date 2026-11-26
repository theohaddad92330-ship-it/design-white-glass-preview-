import { z } from 'zod'
import { clampProactivityCap, PROACTIVITY_MIN_CAP } from './proactivity.js'

/**
 * LE BUDGET D'INTERRUPTION DE LAURA PRODUIT — §5.3 du PDF 10, §13.2 et §13.3 du tome 6.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────
 * Le §5.3 se présente comme « une reprise et un durcissement du compteur de
 * proactivité (PDF 6 §7) ». La reprise est déjà en production — plafond
 * journalier réglable de 1 à 5, priorité impact × urgence × capacité d'agir,
 * suppression plutôt que mise en file, rien à dire ⇒ rien envoyé. Voir
 * `proactivity.ts`, qui reste le propriétaire de ces règles-là.
 *
 * Le DURCISSEMENT, lui, n'existait nulle part, et c'est ce fichier :
 *
 *  1. **Une intervention par écran.** Le plafond journalier laisse passer trois
 *     messages sur le même écran en une minute — trois fois raisonnable, une
 *     fois insupportable.
 *  2. **Vingt minutes entre deux.** Sans espacement, le plafond du jour se vide
 *     en trois minutes puis Laura se tait pendant huit heures : le pire des
 *     deux mondes, agaçante puis absente.
 *  3. **Le retrait.** Le §5.3 en décrit deux, et ils ne disent pas la même
 *     chose. Deux interventions IGNORÉES d'affilée veut dire « pas maintenant »
 *     — le plafond descend à une par jour pendant une semaine. Trois FERMETURES
 *     sans lecture veulent dire « pas du tout » — Laura se met en retrait sept
 *     jours et le dit une fois, sans reproche.
 *
 * ⚠️ **Le repli laisse PASSER**, comme dans `proactivity.ts` : mieux vaut une
 * intervention de trop qu'un message important avalé par une panne de compteur.
 * Un état illisible n'est donc jamais traité comme un refus.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE TOME 6 AJOUTE, ET QUI MANQUAIT (29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Le §13.2 pose un plafond qui n'est PAS fixe — « il suit le comportement » —
 * en cinq lignes. Trois étaient tenues (« 3 acceptées ⇒ maintenu » par le geste
 * utile qui remet les compteurs à zéro ; « 0 acceptée ⇒ 1 pendant 7 jours » par
 * le plafond réduit daté ; « 3 fermetures ⇒ 0 pendant 7 jours » par le retrait).
 * **Les deux autres n'existaient nulle part, et elles vont dans les deux sens :**
 *
 *  · **La BAISSE** — « 3 interventions, 1 acceptée ⇒ plafond 2 ». Une
 *    acceptation PARTIELLE n'armait rien : le plafond réduit ne se déclenche que
 *    sur deux interventions IGNORÉES d'affilée, et quelqu'un qui agit sur une
 *    proposition sur trois n'ignore rien du tout.
 *  · **La HAUSSE** — « interroge Laura spontanément > 5 fois/jour ⇒ 4 ». Le
 *    budget n'avait aucun chemin vers le HAUT : un utilisateur qui réclame Laura
 *    six fois par jour recevait le même plafond que celui qui la subit.
 *
 * Le §13.3 pose par ailleurs trois **moments d'or** où « le plafond ne
 * s'applique pas ». `canInterrupt` n'avait aucune exemption : quelqu'un qui
 * revenait de deux semaines recevait UNE intervention, ce qui est l'inverse de
 * l'intention.
 */

/**
 * §5.3 — une seule intervention par écran.
 *
 * ⚠️ Cette règle n'a PAS de constante, et c'est délibéré. Elle a porté un
 * `MAX_PER_SCREEN = 1` que rien ne lisait : `canInterrupt` la tient par
 * `screensServed.includes(screen)`, une appartenance, pas un décompte. Un
 * réglage qu'on peut changer sans que rien ne bouge est pire qu'un réglage
 * absent — il promet un levier qui n'existe pas. Passer à deux interventions
 * par écran demanderait de changer la STRUCTURE de `screensServed` (un
 * décompte, pas un ensemble), pas une valeur.
 */
/** §5.3 — le délai minimum entre deux interventions. */
export const MIN_GAP_MINUTES = 20
/**
 * Le délai au-delà duquel une intervention sans réaction compte comme IGNORÉE.
 *
 * Une intervention de ce matin ne l'est pas : la requalifier tout de suite
 * ferait descendre le plafond de quelqu'un qui déjeunait. Vit ICI (GA-26) et
 * non dans `laura.service.ts`, qui l'importait en le redéclarant : la même
 * règle sert désormais aussi `computeLauraAnalytics` (`laura-analytics.ts`),
 * et deux copies auraient fini par diverger.
 */
export const IGNORED_AFTER_HOURS = 24
/** Deux interventions ignorées d'affilée font descendre le plafond à 1… */
export const IGNORED_BEFORE_THROTTLE = 2
export const THROTTLE_DAYS = 7
export const THROTTLED_CAP = 1
/** …trois fermetures sans lecture font taire Laura pour une semaine. */
export const CLOSED_BEFORE_RETREAT = 3
export const RETREAT_DAYS = 7

/* ------------------------------------------------------------------ */
/*  §13.2 — le budget adaptatif                                        */
/* ------------------------------------------------------------------ */

/**
 * §13.2, la HAUSSE : « utilisateur qui interroge Laura spontanément > 5 fois
 * par jour ⇒ 4 ».
 *
 * Le tome écrit « > 5 », donc SIX déclenche et cinq pile ne déclenche pas. Le
 * seuil et la valeur sont deux constantes distinctes parce que ce sont deux
 * décisions distinctes : l'une dit à partir de quand on considère la personne
 * demandeuse, l'autre dit ce qu'on lui accorde.
 */
export const SPONTANEOUS_QUERIES_FOR_RAISE = 5
/**
 * …et le plafond passe à QUATRE.
 *
 * ⚠️ C'est un PLANCHER, jamais une valeur imposée : quelqu'un qui a réglé 5 et
 * qui pose dix questions ne doit pas se retrouver descendu à 4. « → 4 » est une
 * hausse, et une hausse ne fait pas baisser.
 */
export const ENGAGED_USER_CAP = 4

/**
 * Ce qu'on a observé d'une JOURNÉE, pour décider du plafond de la suivante.
 *
 * ⚠️ **`spontaneousQueries` est nullable et les deux autres ne le sont pas**, et
 * la différence porte la règle « non mesuré n'est jamais zéro » : `sent` et
 * `accepted` viennent des traces d'interventions, qu'on relit toujours — `0`
 * y est une mesure VRAIE. Les sollicitations, elles, viennent d'une lecture
 * séparée qui peut échouer, et « je n'ai pas su lire ses messages » ne se
 * confond pas avec « elle n'a posé aucune question ».
 */
export const dailyObservationSchema = z.object({
  /** Interventions envoyées ce jour-là. */
  sent: z.number().int().min(0),
  /** Celles sur lesquelles la personne a AGI (`acted`). */
  accepted: z.number().int().min(0),
  /** Questions qu'ELLE a posées au copilote. `null` = non mesuré. */
  spontaneousQueries: z.number().int().min(0).nullable(),
})
export type DailyObservation = z.infer<typeof dailyObservationSchema>

/**
 * Pourquoi le plafond du jour vaut ce qu'il vaut.
 *
 * Une liste FERMÉE, et pas de la décoration : le plafond de quelqu'un a changé
 * sans qu'il ait rien réglé, et il a le droit de savoir laquelle des quatre
 * raisons s'applique. C'est aussi ce qui rend la règle vérifiable à l'écran.
 */
export const CAP_REASONS = ['user_setting', 'throttled', 'partial_acceptance', 'engaged_user'] as const
export type CapReason = (typeof CAP_REASONS)[number]

export type CapDecision = { cap: number; reason: CapReason }

/**
 * LE PLAFOND DU JOUR — la seule dérivation, et il n'y en a qu'une.
 *
 * L'ordre est celui de la force du signal, et il n'est pas interchangeable :
 *
 *  1. **Le plafond réduit daté** gagne sur tout le reste. Il porte sept jours
 *     décidés hier ; le recalculer à partir de l'observation d'aujourd'hui
 *     ferait deux vérités sur la même semaine.
 *  2. **Rien d'observé ⇒ rien de changé.** Sans journée d'hier, on ne déduit
 *     rien : quelqu'un qui s'inscrit ce matin n'a pas un taux d'acceptation de
 *     0 %, il n'en a pas.
 *  3. **La baisse** — journée PLEINE et acceptation partielle. « Pleine »
 *     compte : une seule intervention envoyée hier ne dit rien du plafond, elle
 *     dit qu'il n'a pas été atteint. Sans cette condition, un espace calme
 *     verrait son plafond descendre pour n'avoir rien eu à recevoir.
 *  4. **La hausse**, et seulement si la baisse ne s'applique pas. Poser six
 *     questions ET ignorer ce qu'on propose veut dire « je te veux À LA
 *     DEMANDE », pas « interromps-moi davantage » — donner plus de place aux
 *     interruptions à quelqu'un qui vient de les ignorer serait lire le signal
 *     à l'envers.
 */
export function adaptiveCapFor(input: {
  /** Le réglage de la personne, tel qu'il est en base. */
  cap: number
  /** La journée précédente. `null` = on n'a rien observé. */
  yesterday: DailyObservation | null
  /** Jusqu'à quand le plafond réduit court, s'il court. */
  throttleUntil: number | null
  now: number
}): CapDecision {
  if (input.throttleUntil !== null && input.throttleUntil > input.now) {
    return { cap: THROTTLED_CAP, reason: 'throttled' }
  }

  const setting = clampProactivityCap(input.cap)
  const yesterday = input.yesterday
  if (yesterday === null) return { cap: setting, reason: 'user_setting' }

  // La BAISSE. `sent >= setting` : la journée est allée AU plafond, donc le
  // comportement a été observé au plafond. `accepted < sent` : au moins une
  // proposition n'a pas trouvé preneur.
  if (yesterday.sent > 0 && yesterday.sent >= setting && yesterday.accepted < yesterday.sent) {
    return { cap: Math.max(PROACTIVITY_MIN_CAP, setting - 1), reason: 'partial_acceptance' }
  }

  // La HAUSSE. `null` ne déclenche pas : une lecture qui a échoué n'est pas
  // « zéro question posée ».
  if (yesterday.spontaneousQueries !== null && yesterday.spontaneousQueries > SPONTANEOUS_QUERIES_FOR_RAISE) {
    const raised = Math.max(setting, ENGAGED_USER_CAP)
    if (raised > setting) return { cap: raised, reason: 'engaged_user' }
  }

  return { cap: setting, reason: 'user_setting' }
}

/* ------------------------------------------------------------------ */
/*  §13.3 — les trois moments d'or                                     */
/* ------------------------------------------------------------------ */

/**
 * Les trois moments où l'interruption est ATTENDUE, et où le plafond ne
 * s'applique pas (§13.3). Chacun avec sa raison, qui est ce qui le justifie :
 *
 *  · `return_from_absence` — l'utilisateur veut savoir ce qu'il a raté. Sans
 *    cette exception, quelqu'un qui revient de deux semaines reçoit UNE
 *    intervention, c'est-à-dire l'inverse de l'intention.
 *  · `long_action_finished` — il ATTEND le résultat. Le message n'interrompt
 *    rien : il répond à une attente que le produit a lui-même créée.
 *  · `real_blocker` — il est en train d'échouer sans le savoir. C'est le
 *    pendant, côté Laura, de l'exemption `origin: 'failure'` de
 *    `proactivity.ts` : « un échec doit se voir ».
 *
 * ⚠️ **Un moment d'or ne lève QUE le plafond.** Il ne contourne ni
 * l'interrupteur de la personne (D49 — une Laura qu'on ne peut pas couper est
 * une Laura qu'on subit), ni le retrait (annoncé une fois : le contourner
 * ferait de l'annonce un mensonge), ni « occupé », ni l'unicité par écran, ni
 * les vingt minutes. Le tome écrit « le plafond ne s'applique pas », pas
 * « toutes les bornes sautent ».
 */
export const GOLDEN_MOMENTS = ['return_from_absence', 'long_action_finished', 'real_blocker'] as const
export const goldenMomentSchema = z.enum(GOLDEN_MOMENTS)
export type GoldenMoment = (typeof GOLDEN_MOMENTS)[number]

/**
 * §13.3 — l'absence à partir de laquelle le RETOUR est un moment d'or.
 *
 * ⚠️ Cinq, et non sept. Le tome porte les deux nombres pour deux questions
 * différentes : §13.3 « retour d'absence > 5 jours » décide si le PLAFOND
 * saute, §14 n°37 « retour après 7 jours d'absence » décide si Laura a un brief
 * de reprise à proposer (c'est `LONG_ABSENCE_DAYS`, dans le détecteur). Entre
 * six et sept jours, le moment est donc doré et Laura n'a rien à y dire — elle
 * se tait, ce qui est le comportement correct : une dérogation n'oblige à rien.
 */
export const RETURN_FROM_ABSENCE_DAYS = 5

/**
 * §14 n°37 — l'absence à partir de laquelle Laura a un BRIEF DE REPRISE à
 * proposer, distinct du moment d'or ci-dessus (voir le docblock de
 * `RETURN_FROM_ABSENCE_DAYS` : sept jours, pas cinq).
 *
 * Vivait en `const` PRIVÉ de `laura-detector.ts` (API) — la seule règle qui le
 * lisait, `no_connection_7_days`. #2106.29/#2802 lui trouve un second lecteur :
 * le résumé condensé de longue absence du brief (« qu'est-ce qui a bougé »),
 * côté web. Un réglage vit à UN seul endroit (GA-26) : recopier `7` là-bas
 * aurait fabriqué deux seuils qui divergent le jour où l'un des deux change.
 */
export const LONG_ABSENCE_DAYS = 7

/**
 * §13.3 — au-delà, « la fin d'une action longue » n'est plus une nouvelle.
 *
 * Une analyse terminée il y a six heures ne justifie aucune dérogation : la
 * personne l'a vue, ou elle ne l'attendait plus. La demi-heure est la fenêtre
 * où « il attend le résultat » est encore vrai.
 */
export const LONG_ACTION_FRESH_MINUTES = 30

/**
 * Ce que chaque moment d'or a le droit de faire passer.
 *
 * Sans cette table, la dérogation serait le trou : un jeton CRM expiré donnerait
 * à Laura un budget illimité pour parler de n'importe quoi, et le §13 tout
 * entier existe pour éviter exactement ça. Le moment justifie l'interruption,
 * donc l'interruption doit porter SUR lui.
 *
 * ⚠️ **`long_action_finished` n'a pas de clé, et c'est un FAIT écrit, pas un
 * oubli** : le catalogue n'a aucune intervention « ton analyse est prête ». Le
 * moment est donc détecté, honoré par la porte, et ne trouve rien à dire — la
 * liste vide le dit, là où une clé approchante aurait menti. Le jour où la clé
 * existe, elle s'ajoute ici et la garde du test la vérifie.
 */
export const GOLDEN_MOMENT_INTERVENTIONS: Readonly<Record<GoldenMoment, readonly string[]>> = {
  // Le brief de reprise — « pendant ton absence : 3 signaux, 2 relances dues ».
  return_from_absence: ['no_connection_7_days'],
  // Rien dans le catalogue ne dit « ton analyse est terminée ». Voir ci-dessus.
  long_action_finished: [],
  // « Ton connecteur ne répond plus depuis mardi. »
  real_blocker: ['connector_error_48h'],
}

/**
 * Ce que l'utilisateur a fait de la dernière intervention.
 *
 * Trois réactions, et la nuance entre les deux dernières porte tout le §5.3 :
 * IGNORER, c'est ne pas répondre — la personne était occupée ; FERMER SANS
 * LIRE, c'est un geste, et un geste veut dire « pas ça ».
 *
 * #2403.33 (épopée #2995) — `refused_stale_data` : la CINQUIÈME valeur, sur
 * les six libellés nommés par le registre (« pas maintenant / jamais /
 * dismiss / ignoré / traité ailleurs / mauvaise donnée »). Seule celle-là a
 * gagné un signal RÉEL, distinct de `refused` ordinaire (« pas maintenant ») :
 * #2403.38 sait dater la DERNIÈRE correction humaine sur l'entité d'une
 * intervention. Quand une personne refuse une suggestion dont l'entité a
 * DÉJÀ (ou vient d'être) corrigée par un humain depuis que la trace a été
 * posée, ce refus ne veut pas dire « pas maintenant » — il veut dire
 * « c'était faux ». `LauraService.react()` l'écrit à la place de `refused`
 * dans ce seul cas, jamais deviné, jamais choisi par l'écran.
 *
 * #2403.33 (28/09/2026, lot SRC3, décision Louis `SOURCES-28-09.md` : un
 * point classé A — donnée absente — n'est plus un reste, on ajoute la source)
 * — `refused_handled_elsewhere` : la SIXIÈME valeur, et le dernier des six
 * libellés à gagner un signal réel. Le signal : `user_actions` (le journal
 * d'actions déjà écrit par le CRM branché comme par Bellum — export CRM,
 * tâche créée, statut commercial changé…) porte une ligne sur le MÊME OBJET
 * (`account_id`/`contact_id` = l'entité de la trace) postérieure à la pose de
 * la trace. Quand une personne refuse une suggestion dont l'objet a déjà
 * reçu une action depuis, ce refus ne veut pas dire « pas maintenant » — il
 * veut dire « déjà traité, ailleurs que dans cette bulle ».
 * `LauraService.react()` l'écrit à la place de `refused` dans ce seul cas,
 * jamais deviné, jamais choisi par l'écran — même mécanique que
 * `refused_stale_data`, vérifiée EN PREMIER (une donnée fausse prime sur une
 * action déjà faite : les deux peuvent être vraies à la fois, et « c'était
 * faux » est la raison la plus utile des deux à l'écran).
 *
 * Le seul libellé restant SANS signal réel dans ce dépôt est « jamais »
 * (distinct d'un cooldown de trente jours révisable) : aucune source ne dit
 * qu'une personne veut ne PLUS JAMAIS revoir une clé. L'inventer serait une
 * donnée fictive (`agent_docs/doctrine.md:19`).
 */
export const INTERVENTION_REACTIONS = [
  'acted',
  'ignored',
  'closed_unread',
  'refused',
  'refused_stale_data',
  'refused_handled_elsewhere',
] as const
export const interventionReactionSchema = z.enum(INTERVENTION_REACTIONS)
export type InterventionReaction = (typeof INTERVENTION_REACTIONS)[number]

/**
 * Les trois formes de refus, ÉCRITES — la même liste que lit `isRefusal`
 * ci-dessous, exportée pour l'appelant qui a besoin de la porter dans une
 * clause SQL (`WHERE reaction = ANY($1)`) plutôt que de reconstruire un
 * `.filter(isRefusal)` en mémoire — #2319.118, `LauraService.workspacePreferenceCounts`.
 * Un seul endroit écrit la liste (GA-26) ; `isRefusal` et ce tableau ne
 * peuvent pas diverger puisque l'un est dérivé de l'autre.
 */
export const REFUSAL_REACTIONS = ['refused', 'refused_stale_data', 'refused_handled_elsewhere'] as const

/**
 * Un refus, sous QUELQUE forme que ce soit — `refused` (« pas maintenant »),
 * `refused_stale_data` (« mauvaise donnée », #2403.33) et
 * `refused_handled_elsewhere` (« déjà traité ailleurs », #2403.33) disent
 * tous les trois « pas ça », et doivent compter IDENTIQUEMENT partout où
 * `refused` comptait avant que ces formes n'existent : le cooldown de trente
 * jours (§5.7), PRÉFÉRENCE (#2403.24), le taux d'acceptation (D644). Une
 * fonction à UN seul endroit (GA-26) plutôt qu'un `=== 'refused'` recopié
 * qui aurait oublié une nouvelle forme dans un des trois.
 */
export function isRefusal(reaction: InterventionReaction | string | null): boolean {
  return (REFUSAL_REACTIONS as readonly string[]).includes(reaction ?? '')
}

export const interruptionStateSchema = z.object({
  /** Écrans déjà servis dans la fenêtre courante. */
  screensServed: z.array(z.string()).default([]),
  /** Horodatage de la dernière intervention, en millisecondes. */
  lastInterventionAt: z.number().nullable().default(null),
  /** Interventions ignorées d'affilée. Remis à zéro dès qu'une est traitée. */
  consecutiveIgnored: z.number().int().min(0).default(0),
  /** Fermetures sans lecture d'affilée. */
  consecutiveClosedUnread: z.number().int().min(0).default(0),
  /** Jusqu'à quand Laura se tait, s'il y a lieu. */
  retreatUntil: z.number().nullable().default(null),
  /** Jusqu'à quand le plafond est descendu à un. */
  throttleUntil: z.number().nullable().default(null),
  /** L'utilisateur a-t-il coupé Laura lui-même (D49) ? */
  disabled: z.boolean().default(false),
})
export type InterruptionState = z.infer<typeof interruptionStateSchema>

export const EMPTY_INTERRUPTION_STATE: InterruptionState = {
  screensServed: [],
  lastInterventionAt: null,
  consecutiveIgnored: 0,
  consecutiveClosedUnread: 0,
  retreatUntil: null,
  throttleUntil: null,
  disabled: false,
}

/** Pourquoi Laura se tait. Une liste FERMÉE : chaque raison appelle un geste
 *  différent côté produit, et « elle ne dit rien » n'en est pas une. */
export const SILENCE_REASONS = [
  'disabled',
  'retreat',
  'screen_already_served',
  'too_soon',
  'busy',
  'cap_reached',
] as const
export type SilenceReason = (typeof SILENCE_REASONS)[number]

export type InterruptionVerdict =
  | {
      allowed: true
      capForToday: number
      capReason: CapReason
      /** Présent SEULEMENT quand l'exception a servi — c'est-à-dire quand le
       *  plafond était atteint et qu'un moment d'or l'a levé. Sous le plafond,
       *  l'intervention passait de toute façon : l'annoncer ferait croire à un
       *  budget dépensé qui ne l'a pas été. */
      goldenMoment?: GoldenMoment
    }
  | { allowed: false; reason: SilenceReason; until?: number }

export type InterruptionRequest = {
  state: InterruptionState
  /** L'écran sur lequel l'intervention se poserait. */
  screen: string
  /** L'utilisateur est-il en train de faire quelque chose qu'on n'interrompt
   *  pas — une saisie, un import, une analyse, une validation ? */
  busy: boolean
  /** Interventions déjà envoyées aujourd'hui. */
  sentToday: number
  /** Le plafond réglé par l'utilisateur (1 à 5). */
  cap: number
  /** Ce qu'on a observé HIER, pour le budget adaptatif du §13.2. `null` ou
   *  absent = rien d'observé, donc rien de déduit. */
  yesterday?: DailyObservation | null
  /** Le moment d'or en cours, s'il y en a un (§13.3). Il lève le plafond, et
   *  RIEN d'autre. */
  goldenMoment?: GoldenMoment | null
  now: number
}

/** En retrait — l'utilisateur a fermé sans lire plusieurs fois de suite
 *  (§5.3), et la fenêtre n'est pas encore passée. Module-privé : la seule
 *  raison d'être de cette fonction est de ne pas répéter cette expression
 *  dans `canInterrupt` ET dans `isInterruptionSilenced` (GA-26). */
function isRetreating(state: InterruptionState, now: number): boolean {
  return Boolean(state.retreatUntil && state.retreatUntil > now)
}

/**
 * #1938.13 — LE SOUS-ENSEMBLE DU BUDGET QUI VAUT POUR TOUT CANAL.
 *
 * `canInterrupt` répond pour la bulle posée sur UN écran (elle a un plafond de
 * volume, un écran, un délai minimal). Un canal sans écran — les notifications
 * du produit, relayées ensuite par e-mail ou SMS — n'a rien à emprunter à ces
 * trois-là. Il a en revanche exactement la même raison de se taire dans les
 * deux cas où l'utilisateur a dit ou montré « arrête » : la fonction est
 * COUPÉE, ou il vient de fermer sans lire plusieurs fois de suite (retrait).
 *
 * Volontairement HORS de cette fonction : le plafond du jour (une question de
 * VOLUME, pas de silence total — `adaptiveCapFor`), le throttle après des
 * messages ignorés (qui RÉDUIT le plafond plutôt que de couper), et
 * `screensServed`. Les confondre avec un silence total ferait taire un canal
 * qui ne le doit pas.
 */
export function isInterruptionSilenced(state: InterruptionState, now: number): boolean {
  return state.disabled || isRetreating(state, now)
}

/**
 * Laura peut-elle parler maintenant ?
 *
 * L'ordre des refus est celui de la volonté de l'utilisateur : ce qu'il a
 * DÉCIDÉ passe avant ce qu'on a déduit de son comportement, qui passe avant les
 * bornes mécaniques. Inverser reviendrait à lui répondre « le délai est écoulé »
 * alors qu'il a coupé la fonction.
 */
export function canInterrupt(request: InterruptionRequest): InterruptionVerdict {
  const { state, now } = request

  if (state.disabled) return { allowed: false, reason: 'disabled' }
  if (isRetreating(state, now)) {
    return { allowed: false, reason: 'retreat', until: state.retreatUntil ?? undefined }
  }
  // « Jamais pendant une saisie, un import, une analyse, une action en cours de
  // validation » — interrompre quelqu'un qui travaille est exactement ce qui
  // fait couper la fonction.
  if (request.busy) return { allowed: false, reason: 'busy' }
  if (state.screensServed.includes(request.screen)) {
    return { allowed: false, reason: 'screen_already_served' }
  }
  if (state.lastInterventionAt !== null && now - state.lastInterventionAt < MIN_GAP_MINUTES * 60_000) {
    return { allowed: false, reason: 'too_soon', until: state.lastInterventionAt + MIN_GAP_MINUTES * 60_000 }
  }

  // Le plafond du jour ne se calcule pas ici : il se DEMANDE. Deux chemins qui
  // refont la même dérivation divergent, et c'est ce qui est arrivé au clamp du
  // réglage (borné à cinq d'un côté, illimité de l'autre).
  const { cap: capForToday, reason: capReason } = adaptiveCapFor({
    cap: request.cap,
    yesterday: request.yesterday ?? null,
    throttleUntil: state.throttleUntil,
    now,
  })

  if (request.sentToday >= capForToday) {
    // §13.3 — les trois moments où l'interruption est ATTENDUE. Le plafond ne
    // s'applique pas ; toutes les bornes évaluées AU-DESSUS, si.
    if (request.goldenMoment) {
      return { allowed: true, capForToday, capReason, goldenMoment: request.goldenMoment }
    }
    return { allowed: false, reason: 'cap_reached' }
  }

  return { allowed: true, capForToday, capReason }
}

/** L'état après une intervention envoyée. */
export function afterIntervention(state: InterruptionState, screen: string, now: number): InterruptionState {
  return {
    ...state,
    screensServed: [...new Set([...state.screensServed, screen])],
    lastInterventionAt: now,
  }
}

/**
 * L'état après la réaction de l'utilisateur.
 *
 * Un geste UTILE remet les deux compteurs à zéro — c'est le seul signal qui dit
 * « continue ». Un refus explicite ne compte comme aucun des deux : il porte sur
 * une proposition, pas sur Laura, et le §5.7 s'en occupe autrement (« tu ne la
 * reproposes pas avant 30 jours »).
 */
export function afterReaction(
  state: InterruptionState,
  reaction: InterventionReaction,
  now: number,
): InterruptionState {
  if (reaction === 'acted') {
    return { ...state, consecutiveIgnored: 0, consecutiveClosedUnread: 0, throttleUntil: null }
  }
  if (isRefusal(reaction)) return state

  if (reaction === 'closed_unread') {
    const closed = state.consecutiveClosedUnread + 1
    return {
      ...state,
      consecutiveClosedUnread: closed,
      ...(closed >= CLOSED_BEFORE_RETREAT
        ? { retreatUntil: now + RETREAT_DAYS * 24 * 60 * 60 * 1000, consecutiveClosedUnread: 0 }
        : {}),
    }
  }

  const ignored = state.consecutiveIgnored + 1
  return {
    ...state,
    consecutiveIgnored: ignored,
    ...(ignored >= IGNORED_BEFORE_THROTTLE
      ? { throttleUntil: now + THROTTLE_DAYS * 24 * 60 * 60 * 1000, consecutiveIgnored: 0 }
      : {}),
  }
}

/** Une nouvelle journée : les écrans se réarment, le reste survit. Le retrait
 *  et le plafond réduit sont datés, ils n'ont rien à réinitialiser. */
export function startOfDay(state: InterruptionState): InterruptionState {
  return { ...state, screensServed: [] }
}
