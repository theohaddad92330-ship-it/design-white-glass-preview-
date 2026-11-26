import { missionAvailabilityCertainty, type MissionAvailabilityCertainty, type RenewalStatus } from '@bellum/contracts'

/**
 * LA PLANIFICATION — placer des missions sur une frise, sans jamais inventer
 * une date.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CALCUL VIT DANS SON PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Une frise est un calcul déguisé en dessin. Chaque barre est une affirmation :
 * « cette mission court du 10 juillet au 20 septembre ». Écrite dans du JSX,
 * cette affirmation ne se teste pas — et c'est précisément là que les dates
 * absentes se transforment en dates fausses, parce qu'un `?? 0` sur une
 * position est invisible à la relecture.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE RÉPONSES POSSIBLES, ET AUCUNE N'EST « ZÉRO »
 * ─────────────────────────────────────────────────────────────────────────────
 * `placeMission` ne rend jamais une barre par défaut. Elle rend :
 *
 *  - `bar` — on sait la placer. Ses quatre drapeaux disent ce que ses bords
 *    veulent dire : `clippedStart`/`clippedEnd` = « ça continue au-delà de ce
 *    que tu vois », `openStart`/`openEnd` = « **ce bord n'est pas une date** ».
 *    Les deux se ressemblent à l'œil et ne veulent pas dire la même chose :
 *    une mission rognée a une fin, on ne la montre pas ; une mission ouverte
 *    n'en a pas, et personne ne l'a promise.
 *  - `undated` — aucune date exploitable. Elle sort du dessin et va dans un
 *    bloc NOMMÉ. La poser à gauche de la frise lui donnerait une date de
 *    démarrage qu'aucun humain n'a saisie.
 *  - `outside` — datée, mais ailleurs. Comptée, jamais collée au bord.
 *  - `inconsistent` — elle finit avant de commencer. Une largeur négative se
 *    rend à l'envers ou pas du tout, et sans un mot.
 *
 * Le même principe gouverne {@link todayOffsetPercent} : hors fenêtre, elle
 * rend `null` et non `0`, parce que `0` est le BORD GAUCHE — le repère
 * « aujourd'hui » se tracerait au 1er juillet en plein mois de décembre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES MOIS N'ONT PAS TOUS LA MÊME LARGEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Les barres se placent au JOUR près. Des entêtes de mois à largeur égale
 * décaleraient février de trois jours et août de rien : la barre d'une mission
 * qui démarre le 1er septembre tomberait visiblement à côté de la colonne
 * « Septembre ». Chaque mois porte donc la largeur de SES jours.
 */

/** Ce dont la frise a besoin d'une mission — jamais l'entité complète. */
export type PlannedMission = {
  id: string
  /** `null` = jamais saisi. Une chaîne illisible vaut `null`, jamais 1970. */
  startedOn: string | null
  /** Fin PRÉVUE. `null` = sans fin connue — occupé, sans date. */
  endsOn: string | null
}

/** Non exporté à dessein : il se lit à travers {@link PlanningWindow}, et un
 *  type exporté sans appelant est une promesse d'API que personne ne tient. */
type PlanningMonth = {
  /** `YYYY-MM`. */
  key: string
  /** Part de la fenêtre occupée par ce mois, en pourcentage de SES jours. */
  widthPercent: number
}

export type PlanningWindow = {
  /** Premier jour du premier mois, `YYYY-MM-DD`. */
  startsOn: string
  /** Dernier jour du dernier mois, `YYYY-MM-DD`. */
  endsOn: string
  /** Nombre de jours couverts, bornes comprises. C'est le dénominateur. */
  totalDays: number
  months: PlanningMonth[]
}

export type MissionPlacement =
  | {
      kind: 'bar'
      leftPercent: number
      widthPercent: number
      /** La mission continue AVANT la fenêtre. Son début existe, il est hors champ. */
      clippedStart: boolean
      /** La mission continue APRÈS la fenêtre. Sa fin existe, elle est hors champ. */
      clippedEnd: boolean
      /** Aucune date de démarrage n'a été saisie. Le bord gauche n'est pas une date. */
      openStart: boolean
      /** Aucune date de fin n'a été saisie. Le bord droit n'est pas une date. */
      openEnd: boolean
    }
  | { kind: 'undated' }
  | { kind: 'outside' }
  | { kind: 'inconsistent' }

/** Non exporté : c'est le retour de {@link summarizePlanning}, inféré chez
 *  l'appelant. Même raison que {@link PlanningMonth}. */
type PlanningSummary = {
  /** Missions dessinées dans la fenêtre. */
  visible: number
  /** Missions dont le DÉMARRAGE tombe dans la fenêtre. Une mission déjà
   *  commencée avant n'y est pas — elle ne démarre pas, elle continue. */
  startsInWindow: number
  /** Missions dont la FIN PRÉVUE tombe dans la fenêtre. Une mission sans date
   *  de fin n'y entre JAMAIS : ce serait transformer une absence en échéance. */
  endsInWindow: number
  /** Missions qui courent sans fin connue. Comptées à part, et nommées. */
  openEnded: number
  /** Missions qu'aucune date ne permet de placer. */
  undated: number
  /** Missions datées, entièrement hors de la fenêtre. */
  outside: number
  /** Missions dont la fin précède le début. Une saisie à corriger. */
  inconsistent: number
}

/**
 * Quatre mois — un trimestre plus le mois suivant.
 *
 * Le nombre n'est pas décoratif : la fenêtre de renouvellement la plus large du
 * produit est J+60 (`renewalsToAct`), et une frise plus courte que cette fenêtre
 * ne montrerait jamais l'échéance qu'on demande à l'utilisateur d'anticiper.
 */
export const PLANNING_WINDOW_MONTHS = 4

/**
 * LES DEUX ÉCHELLES DE LA FRISE — #1374.
 *
 * ⚠️ **Le retour demandait « 3 mois | 6 mois », et le plancher est à QUATRE.**
 * La raison est celle qui fixe déjà {@link PLANNING_WINDOW_MONTHS} : la fenêtre
 * de renouvellement la plus large du produit est J+60 (`renewalsToAct`).
 * L'ancre s'ouvre un mois AVANT le mois courant ; à trois mois, la frise ne
 * couvre plus, vers l'avant, que la fin du mois courant plus un mois — soit
 * ~31 jours dans le pire cas. Les fins de mission que cet écran existe pour
 * anticiper sortiraient du champ, et l'utilisateur croirait qu'il n'y en a pas.
 *
 * Deux choix, pas trois : au-delà, un contrôle d'échelle redevient le « panneau
 * complexe » que le même retour refuse en toutes lettres.
 */
export const PLANNING_SCALES = [4, 6] as const
export type PlanningScale = (typeof PLANNING_SCALES)[number]

const MONTH_RE = /^(\d{4})-(\d{2})$/
/** Accepte une date nue comme une date horodatée : les deux formes circulent. */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/
const MS_PER_DAY = 86_400_000

/**
 * Le numéro de jour d'une date, ou `null` si elle n'est pas lisible.
 *
 * ⚠️ L'aller-retour est ce qui compte. `new Date('2026-02-31')` ne rend pas une
 * erreur : il rend le 3 mars. La barre partirait alors d'un jour que personne
 * n'a saisi, et rien à l'écran ne le dirait.
 */
/** Exportée pour {@link ../planning-conflicts.ts} : même lecture de date que
 *  tout le reste de ce fichier — jamais une seconde implémentation qui
 *  divergerait sur un cas limite (29 février, format horodaté…). */
export function toDayNumber(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = DATE_RE.exec(value)
  if (!parsed) return null
  const year = Number(parsed[1])
  const month = Number(parsed[2])
  const day = Number(parsed[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const ms = Date.UTC(year, month - 1, day)
  const roundTrip = new Date(ms)
  if (roundTrip.getUTCFullYear() !== year || roundTrip.getUTCMonth() !== month - 1 || roundTrip.getUTCDate() !== day) {
    return null
  }
  return Math.floor(ms / MS_PER_DAY)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dayToIso(dayNumber: number): string {
  const date = new Date(dayNumber * MS_PER_DAY)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

function daysInMonth(year: number, monthIndex: number): number {
  // Le jour 0 du mois suivant EST le dernier jour de celui-ci — février
  // bissextile compris, sans table à maintenir.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Le mois d'une date, dans le fuseau du LECTEUR — c'est le sien qui décide de
 *  ce qu'« aujourd'hui » veut dire, pas celui du serveur. */
export function monthOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

/**
 * Le JOUR d'une date, `YYYY-MM-DD`, dans le fuseau du LECTEUR — même raison
 * que {@link monthOf} juste au-dessus. Exportée pour {@link ../filters.ts}
 * (#2408.60) : la facette « Consultants bientôt disponibles » lit la même
 * horloge que ce fichier — deux lectures de « aujourd'hui » divergeraient à
 * minuit, un jour sur deux.
 */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Décale un mois `YYYY-MM`, fins d'année comprises. */
export function shiftMonth(month: string, delta: number): string {
  const parsed = MONTH_RE.exec(month)
  if (!parsed) throw new Error(`Mois illisible : ${month}`)
  const year = Number(parsed[1])
  const monthIndex = Number(parsed[2]) - 1
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1))
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}`
}

/**
 * La fenêtre de N mois qui commence au mois donné.
 *
 * ⚠️ Elle JETTE sur un mois illisible plutôt que de retomber sur aujourd'hui :
 * un repli silencieux afficherait la frise du mois courant sous des flèches de
 * navigation qui ne bougeraient plus, et le défaut ressemblerait à un écran figé.
 */
export function planningWindow(anchorMonth: string, months: number = PLANNING_WINDOW_MONTHS): PlanningWindow {
  const parsed = MONTH_RE.exec(anchorMonth)
  if (!parsed) throw new Error(`Mois de planification illisible : ${anchorMonth}`)
  const year = Number(parsed[1])
  const month = Number(parsed[2])
  if (month < 1 || month > 12) throw new Error(`Mois de planification hors bornes : ${anchorMonth}`)
  if (!Number.isInteger(months) || months < 1) throw new Error(`Fenêtre de planification invalide : ${months}`)

  const cells: Array<{ key: string; days: number }> = []
  for (let offset = 0; offset < months; offset += 1) {
    const cursor = new Date(Date.UTC(year, month - 1 + offset, 1))
    const cursorYear = cursor.getUTCFullYear()
    const cursorMonth = cursor.getUTCMonth()
    cells.push({
      key: `${cursorYear}-${pad2(cursorMonth + 1)}`,
      days: daysInMonth(cursorYear, cursorMonth),
    })
  }
  const totalDays = cells.reduce((sum, cell) => sum + cell.days, 0)
  const firstDay = Math.floor(Date.UTC(year, month - 1, 1) / MS_PER_DAY)

  return {
    startsOn: dayToIso(firstDay),
    endsOn: dayToIso(firstDay + totalDays - 1),
    totalDays,
    months: cells.map(cell => ({ key: cell.key, widthPercent: (cell.days / totalDays) * 100 })),
  }
}

/** Où placer une mission dans la fenêtre — et si on ne peut pas, POURQUOI. */
export function placeMission(mission: PlannedMission, window: PlanningWindow): MissionPlacement {
  const windowStart = toDayNumber(window.startsOn)
  const windowEnd = toDayNumber(window.endsOn)
  /* c8 ignore next -- une fenêtre est construite par `planningWindow`, jamais à la main */
  if (windowStart === null || windowEnd === null) return { kind: 'undated' }

  const start = toDayNumber(mission.startedOn)
  const end = toDayNumber(mission.endsOn)
  if (start === null && end === null) return { kind: 'undated' }
  if (start !== null && end !== null && end < start) return { kind: 'inconsistent' }

  // Une borne absente n'est PAS une borne au bord de la fenêtre : la barre
  // couvre le bord, et son drapeau `open*` dit que ce bord n'est pas une date.
  const openStart = start === null
  const openEnd = end === null
  const effectiveStart = start ?? windowStart
  const effectiveEnd = end ?? windowEnd
  if (effectiveEnd < windowStart || effectiveStart > windowEnd) return { kind: 'outside' }

  const drawnStart = Math.max(effectiveStart, windowStart)
  const drawnEnd = Math.min(effectiveEnd, windowEnd)
  return {
    kind: 'bar',
    leftPercent: ((drawnStart - windowStart) / window.totalDays) * 100,
    // `+ 1` : une mission d'un seul jour occupe un jour, pas zéro. Sans lui,
    // elle serait invisible — un zéro de plus qui ment, en largeur.
    widthPercent: ((drawnEnd - drawnStart + 1) / window.totalDays) * 100,
    clippedStart: !openStart && effectiveStart < windowStart,
    clippedEnd: !openEnd && effectiveEnd > windowEnd,
    openStart,
    openEnd,
  }
}

/**
 * La position d'aujourd'hui dans la fenêtre — `null` quand il n'y est pas.
 *
 * ⚠️ **Jamais `0`.** Zéro est le bord GAUCHE de la fenêtre : rendre `0` pour
 * « hors fenêtre » tracerait le trait « nous sommes ici » sur le 1er du premier
 * mois, ce qui est une date, et une date fausse.
 */
export function todayOffsetPercent(window: PlanningWindow, today: string): number | null {
  const day = toDayNumber(today)
  const windowStart = toDayNumber(window.startsOn)
  /* c8 ignore next */
  if (day === null || windowStart === null) return null
  const offset = day - windowStart
  if (offset < 0 || offset >= window.totalDays) return null
  return (offset / window.totalDays) * 100
}

/** Ce que la fenêtre contient, compté par NATURE — jamais replié sur un total. */
export function summarizePlanning(missions: readonly PlannedMission[], window: PlanningWindow): PlanningSummary {
  // ⚠️ Le MÊME prédicat que les pastilles (`isInWindow`, `matchesPlanningFacet`)
  // — #1370. Un compteur et un filtre écrits séparément divergent au premier
  // seuil changé, et une pastille qui annonce « 3 » puis n'affiche que deux
  // lignes se lit comme une panne (GA-26).
  const inWindow = (day: number | null): boolean => isInWindow(day, window)

  const summary: PlanningSummary = {
    visible: 0,
    startsInWindow: 0,
    endsInWindow: 0,
    openEnded: 0,
    undated: 0,
    outside: 0,
    inconsistent: 0,
  }

  for (const mission of missions) {
    const placement = placeMission(mission, window)
    if (placement.kind === 'undated') {
      summary.undated += 1
      continue
    }
    if (placement.kind === 'outside') {
      summary.outside += 1
      continue
    }
    if (placement.kind === 'inconsistent') {
      summary.inconsistent += 1
      continue
    }
    summary.visible += 1
    if (inWindow(toDayNumber(mission.startedOn))) summary.startsInWindow += 1
    // ⚠️ La condition porte sur la DATE, jamais sur la barre : une mission sans
    // fin dessine son bord droit au bout de la fenêtre, et l'y compter ferait
    // annoncer un renouvellement que personne n'a promis.
    if (inWindow(toDayNumber(mission.endsOn))) summary.endsInWindow += 1
    if (placement.openEnd) summary.openEnded += 1
  }
  return summary
}

/**
 * L'ordre de lecture d'une frise : de gauche à droite.
 *
 * Les lignes non plaçables SORTENT du tri, elles ne remontent pas en tête. Une
 * mission sans date posée en première ligne d'une frise se lit comme la plus
 * ancienne — sa position dirait une date qu'elle n'a pas.
 */
export function sortPlacements<T extends { label: string; placement: MissionPlacement }>(rows: readonly T[]): T[] {
  return rows
    .filter(row => row.placement.kind === 'bar')
    .sort((a, b) => {
      const left =
        (a.placement.kind === 'bar' ? a.placement.leftPercent : 0) -
        (b.placement.kind === 'bar' ? b.placement.leftPercent : 0)
      if (left !== 0) return left
      return a.label.localeCompare(b.label, 'fr')
    })
}

// ─────────────────────────────────────────────────────────────────────────────
// LES POPULATIONS DE LA FRISE — #1370, #1374
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les trois populations que la synthèse annonce, et que les pastilles filtrent.
 *
 * ⚠️ « Missions sur la fenêtre » n'en fait PAS partie : c'est le TOTAL, et une
 * pastille qui filtre sur tout ne filtre rien. Elle reste le compte de tête.
 *
 * ⚠️ Ces trois-là sont les mêmes objets que les compteurs de
 * {@link summarizePlanning} — pas des jumeaux. Le compteur APPELLE le prédicat
 * (GA-26) : deux calculs de la même population divergent au premier seuil
 * changé, et une pastille qui annonce « 3 » puis n'affiche que deux lignes se
 * lit comme une panne.
 */
export const PLANNING_FACETS = ['starts', 'ends', 'openEnded'] as const
export type PlanningFacet = (typeof PLANNING_FACETS)[number]

/**
 * Est-ce que cette mission tombe dans cette population ?
 *
 * ⚠️ Une mission qui n'est PAS dessinée n'y tombe jamais, quelle que soit sa
 * date : sans date exploitable, hors fenêtre, ou incohérente, elle vit dans son
 * bloc nommé sous la frise. La retenir ferait cliquer une pastille comptée pour
 * n'afficher aucune ligne.
 */
export function matchesPlanningFacet(mission: PlannedMission, facet: PlanningFacet, window: PlanningWindow): boolean {
  const placement = placeMission(mission, window)
  if (placement.kind !== 'bar') return false
  switch (facet) {
    case 'starts':
      return isInWindow(toDayNumber(mission.startedOn), window)
    // ⚠️ La DATE, jamais le bord de la barre : une mission sans fin dessine son
    // bord droit au bout de la fenêtre, et l'y compter annoncerait une échéance
    // que personne n'a promise.
    case 'ends':
      return isInWindow(toDayNumber(mission.endsOn), window)
    case 'openEnded':
      return placement.openEnd
  }
}

/** Ce jour tombe-t-il dans la fenêtre ? `null` (illisible ou absent) n'y tombe pas. */
function isInWindow(day: number | null, window: PlanningWindow): boolean {
  if (day === null) return false
  const start = toDayNumber(window.startsOn)
  const end = toDayNumber(window.endsOn)
  /* c8 ignore next -- une fenêtre est construite par `planningWindow`, jamais à la main */
  if (start === null || end === null) return false
  return day >= start && day <= end
}

// ─────────────────────────────────────────────────────────────────────────────
// GLISSER UNE BARRE — #2194.44
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le nombre de jours ENTIERS que représente un déplacement en pixels sur la
 * piste — la conversion inverse de {@link placeMission} : `totalDays` jours
 * occupent `trackWidthPx` pixels de large, donc `deltaPx` pixels valent
 * `deltaPx / trackWidthPx * totalDays` jours.
 *
 * ⚠️ Arrondi au jour le plus proche, jamais tronqué : un relâchement à
 * mi-jour doit pouvoir revenir à SA position de départ (delta 0), pas rester
 * bloqué un jour plus tôt par une troncature systématique vers le bas.
 */
export function pixelsToDayDelta(deltaPx: number, trackWidthPx: number, totalDays: number): number {
  if (trackWidthPx <= 0 || totalDays <= 0) return 0
  return Math.round((deltaPx / trackWidthPx) * totalDays)
}

/**
 * Décale une date ISO de N jours (négatif = vers le passé), au jour près.
 *
 * ⚠️ Jette sur une date illisible plutôt que de retomber sur un jour deviné :
 * cette fonction ne sert qu'à décaler une date DÉJÀ connue — voir
 * {@link canDragMission}, qui écarte justement les bords qui n'en sont pas.
 */
export function shiftDateByDays(dateIso: string, deltaDays: number): string {
  const day = toDayNumber(dateIso)
  if (day === null) throw new Error(`Date illisible, impossible à décaler : ${dateIso}`)
  return dayToIso(day + deltaDays)
}

/**
 * Une mission ne se glisse que si SES DEUX bords sont des dates connues, ET
 * entièrement dans le champ de la fenêtre affichée.
 *
 * ⚠️ Glisser un bord OUVERT (`openStart`/`openEnd`) inventerait la date que
 * personne n'a saisie — même refus que {@link placeMission}, qui hachure ce
 * bord plutôt que de l'habiller en date. Glisser un bord ROGNÉ
 * (`clippedStart`/`clippedEnd`) déplacerait une date que la fenêtre ne montre
 * qu'en partie : le point de départ visible à l'écran ne serait pas le vrai.
 */
export function canDragMission(placement: MissionPlacement): boolean {
  return (
    placement.kind === 'bar' &&
    !placement.openStart &&
    !placement.openEnd &&
    !placement.clippedStart &&
    !placement.clippedEnd
  )
}

/** Pourquoi une barre REFUSE {@link canDragMission} — `null` si elle se glisse. */
type DragBlockReason = 'openStart' | 'clippedStart' | 'clippedEnd' | 'openEnd'

/**
 * #2989 (recette 27/09) — « glisser une barre bloquée n'a AUCUN effet
 * visible » : le geste était bien refusé (par design, {@link canDragMission})
 * mais le refus lui-même ne se voyait ni ne s'entendait — un geste empêché en
 * silence se lit comme une fonctionnalité cassée, pas comme une règle.
 *
 * Cette fonction NOMME la raison, dans le même ordre que les notes de bord de
 * la ligne (#1372 : ouvert avant rogné, gauche avant droite), pour que
 * l'écran puisse l'annoncer au lieu de rester muet. Elle n'invente jamais de
 * date — elle dit seulement laquelle manque ou est hors champ.
 */
export function dragBlockReason(placement: MissionPlacement): DragBlockReason | null {
  if (placement.kind !== 'bar' || canDragMission(placement)) return null
  if (placement.openStart) return 'openStart'
  if (placement.clippedStart) return 'clippedStart'
  if (placement.clippedEnd) return 'clippedEnd'
  return 'openEnd'
}

// ─────────────────────────────────────────────────────────────────────────────
// QUAND LA PERSONNE SE LIBÈRE — #1373
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La disponibilité DÉRIVÉE d'une fin de mission — jamais estimée.
 *
 * `unknown` est le cas qui compte : sans date de fin, on ne sait pas, et le
 * retour l'écrit lui-même (« ne jamais estimer une disponibilité si la date de
 * fin n'existe pas »). C'est la même règle que la barre ouverte de la frise,
 * dite en mots plutôt qu'en dessin.
 *
 * #2410.60 — et une fin CONNUE ne suffit pas non plus : `now`/`from` portent
 * leur `certainty` (`certaine` / `incertaine`, {@link missionAvailabilityCertainty}),
 * et une reconduction SIGNÉE rend `renewed` — `ends_on` ne libère alors plus
 * personne, il n'y a pas de disponibilité à cette date.
 */
export type MissionAvailability =
  /** Plus rien n'est engagé au-delà d'aujourd'hui. */
  | { kind: 'now'; certainty: Exclude<MissionAvailabilityCertainty, 'renouvelee'> }
  /** Le premier jour LIBRE, `YYYY-MM-DD`. */
  | { kind: 'from'; on: string; certainty: Exclude<MissionAvailabilityCertainty, 'renouvelee'> }
  /** Aucune fin saisie, ou illisible. On ne devine pas. */
  | { kind: 'unknown' }
  /** #2410.60 — reconduite et SIGNÉE : pas de disponibilité à cette date. */
  | { kind: 'renewed' }

/**
 * ⚠️ **Le LENDEMAIN de `ends_on`, et c'est délibéré.** Toute la frise lit
 * `ends_on` comme le dernier jour OCCUPÉ — c'est le `+ 1` de la largeur dans
 * {@link placeMission}, « une mission d'un seul jour occupe un jour ». Annoncer
 * la disponibilité le jour même contredirait la barre dessinée juste à côté,
 * sur le même écran.
 *
 * Une fin déjà passée — ou aujourd'hui — rend `now` : plus rien n'est engagé
 * au-delà de ce jour. Sur une mission encore ouverte, c'est exactement le
 * signal qu'un responsable de staffing vient chercher ici.
 *
 * #2410.60 — et `renewalStatus` a le dernier mot. Un renouvellement SIGNÉ
 * (`renouvele`) rend `renewed` avant même de regarder `today` : la date de
 * fin n'en est plus une. Sinon, `now`/`from` porte sa `certainty` — un
 * statut absent, ouvert ou seulement annoncé reste `incertaine`, jamais
 * promu `certaine`.
 */
export function availabilityFrom(
  endsOn: string | null | undefined,
  today: string,
  renewalStatus?: RenewalStatus | null,
): MissionAvailability {
  const end = toDayNumber(endsOn)
  if (end === null) return { kind: 'unknown' }
  const now = toDayNumber(today)
  /* c8 ignore next -- `today` vient de l'horloge du lecteur, toujours lisible */
  if (now === null) return { kind: 'unknown' }
  const certainty = missionAvailabilityCertainty(renewalStatus)
  if (certainty === 'renouvelee') return { kind: 'renewed' }
  if (end <= now) return { kind: 'now', certainty }
  return { kind: 'from', on: dayToIso(end + 1), certainty }
}

// ─────────────────────────────────────────────────────────────────────────────
// LES « 30 JOURS » — #2194.3, #2194.4, #2194.28 — UN SEUL SEUIL, TROIS LECTURES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le seuil « bientôt » du Gantt — nommé UNE fois, lu trois fois (résumé des
 * fins, résumé des consultants qui se libèrent, filtre de disponibilité).
 * Trois seuils écrits séparément divergeraient au premier ajustement (GA-26).
 */
export const SOON_WINDOW_DAYS = 30

/**
 * Cette date ISO tombe-t-elle entre AUJOURD'HUI et aujourd'hui + N jours,
 * bornes comprises ?
 *
 * ⚠️ `null` (absente ou illisible) n'est JAMAIS « bientôt » — une absence ne se
 * lit pas comme une échéance proche, même en le voulant plus permissif. Même
 * principe que le reste du fichier : pas de date déguisée en 0.
 */
export function isWithinDaysFromToday(dateIso: string | null | undefined, today: string, days: number): boolean {
  if (!dateIso) return false
  const target = toDayNumber(dateIso)
  const base = toDayNumber(today)
  if (target === null || base === null) return false
  const delta = target - base
  return delta >= 0 && delta <= days
}

/** Les quatre réponses du FILTRE de disponibilité — #2194.28. */
export type AvailabilityBucket = 'now' | 'soon' | 'later' | 'unknown'

/**
 * Réduit {@link MissionAvailability} aux quatre cases d'un filtre.
 *
 * ⚠️ `renewed` tombe dans `later`, et c'est un repli DÉLIBÉRÉ, pas une
 * confusion : une reconduction signée n'a PAS de date de fin à cette échéance
 * (aucune place ne se libère), une fin connue au-delà de la fenêtre EN A une,
 * juste plus tard. Les deux répondent pareil à la question que le filtre pose
 * — « libre dans les {@link SOON_WINDOW_DAYS} jours ? » — non.
 */
export function availabilityBucket(
  availability: MissionAvailability,
  today: string,
  days: number = SOON_WINDOW_DAYS,
): AvailabilityBucket {
  switch (availability.kind) {
    case 'unknown':
      return 'unknown'
    case 'renewed':
      return 'later'
    case 'now':
      return 'now'
    case 'from':
      return isWithinDaysFromToday(availability.on, today, days) ? 'soon' : 'later'
  }
}

/** Ce dont {@link consultantsAvailableSoon} a besoin d'une mission ACTIVE —
 *  jamais l'entité complète, même principe que {@link PlannedMission}. Non
 *  exporté à dessein (GA — un type exporté sans appelant hors fichier est une
 *  promesse d'API que personne ne tient) : l'appelant construit un littéral,
 *  jamais nommé. */
type ActiveAssignment = {
  /** Les noms des personnes affectées — extraits par l'appelant
   *  (`assigneeNames`, `api.ts`) : ce fichier reste pur, sans dépendance sur
   *  la forme brute des affectations. */
  assigneeNames: readonly string[]
  endsOn: string | null
  renewalStatus?: RenewalStatus | null
}

/**
 * COMBIEN DE CONSULTANTS DISTINCTS SE LIBÈRENT BIENTÔT — #2194.4.
 *
 * ⚠️ **Ce n'est PAS un filtre sur des lignes visibles.** Une personne engagée
 * sur DEUX missions actives reste engagée tant que la PLUS TARDIVE des deux ne
 * libère personne — compter sur une seule mission à la fois annoncerait une
 * personne « bientôt disponible » alors qu'une autre mission la retient. On
 * agrège donc PAR PERSONNE avant de répondre.
 *
 * Une personne compte SEULEMENT si :
 *  - aucune de ses missions actives n'a une disponibilité `unknown` — une fin
 *    non connue engage ; on ne peut pas dire « bientôt » sur un silence ;
 *  - aucune n'est `renewed` — reconduite, donc jamais libre à cette échéance ;
 *  - et sa disponibilité la plus tardive tombe dans les N prochains jours (ou
 *    est déjà `now`).
 *
 * Les affectations sans identité se comptent par leur NOM : deux personnes
 * homonymes se confondent — un compromis déjà assumé ailleurs sur cet écran
 * (#1371).
 */
export function consultantsAvailableSoon(
  missions: readonly ActiveAssignment[],
  today: string,
  days: number = SOON_WINDOW_DAYS,
): number {
  const byPerson = new Map<string, MissionAvailability[]>()
  for (const assignment of missions) {
    const availability = availabilityFrom(assignment.endsOn, today, assignment.renewalStatus)
    for (const name of assignment.assigneeNames) {
      const list = byPerson.get(name)
      if (list) list.push(availability)
      else byPerson.set(name, [availability])
    }
  }

  let count = 0
  for (const availabilities of byPerson.values()) {
    if (availabilities.some(a => a.kind === 'unknown' || a.kind === 'renewed')) continue
    // Toutes `now` ou `from` ici. La date qui compte est la PLUS TARDIVE —
    // `now` ne la repousse jamais, seule une `from` future peut le faire.
    const latest = availabilities.reduce<string | null>((soFar, a) => {
      if (a.kind !== 'from') return soFar
      return soFar === null || a.on > soFar ? a.on : soFar
    }, null)
    if (latest === null || isWithinDaysFromToday(latest, today, days)) count += 1
  }
  return count
}

/**
 * Point propre du lot MISSIONS-A (23/10) — LA DISPONIBILITÉ DÉCLARÉE GAGNE.
 *
 * La fin de mission ne dit que quand l'engagement s'arrête ; la fiche de la personne (`available_from`,
 * saisie ou importée dans le vivier) dit quand ELLE se déclare disponible. Quand les deux existent, la
 * déclaration a le dernier mot. Rend la date ISO déclarée de la première personne affectée qui en porte une
 * lisible, sinon `null` — jamais une date devinée.
 */
export function declaredAvailability(
  personIds: readonly (string | null)[],
  availableFromById: ReadonlyMap<string, string | null>,
): string | null {
  for (const id of personIds) {
    if (!id) continue
    const declared = availableFromById.get(id) ?? null
    if (declared && toDayNumber(declared) !== null) return declared
  }
  return null
}
