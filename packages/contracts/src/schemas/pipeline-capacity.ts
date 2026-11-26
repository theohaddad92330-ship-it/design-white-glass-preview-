import { z } from 'zod'

/**
 * #2325.27-.31 — LE VOLUME DE DOSSIERS ACTIFS RESPECTE-T-IL CE QUE L'ESPACE
 * PEUT VRAIMENT PORTER ?
 *
 * Décision tranchée le 25/09/2026 (registre `chat-lot3`, #2325.27-.31 restaient
 * `retenu` faute d'un agrégat d'équipe dans `ProjectPipelineService`) : un
 * module PUR, séparé de `pipelineHealth` (#2324/#2325), qui compare le volume
 * de dossiers actifs à QUATRE bornes réelles — jamais une cinquième forme du
 * diagnostic de pipe, jamais une pondération, jamais une probabilité.
 *
 * Quatre signaux, chacun MESURÉ ou explicitement NON ÉVALUABLE — jamais un
 * zéro deviné (GA-18/GA-19) :
 *
 *  · `capacity` (.27/.28) — la taille d'équipe ET le temps commercial déclaré
 *    ne sont PAS deux entrées séparées à l'écran : elles se composent en UNE
 *    seule capacité (heures/semaine ÷ {@link HOURS_PER_ACTIVE_DOSSIER_PER_WEEK}),
 *    alerte si le volume de dossiers actifs la dépasse.
 *  · `sectorFit` (.29) — alerte si plus de la moitié des dossiers actifs dont
 *    le secteur est connu sortent des secteurs prioritaires déclarés.
 *  · `needsCoverage` (.30) — alerte si les besoins ouverts dépassent le double
 *    des dossiers actifs « de présentation » (le pipe est sous-staffé).
 *  · `staffingAvailability` (.31) — alerte si les besoins ouverts dépassent le
 *    nombre de consultants disponibles sous 30 jours.
 *
 * Chaque entrée vient d'une donnée RÉELLE, jamais inventée : membres actifs de
 * l'espace, tranche de temps commercial hebdomadaire déclarée à l'onboarding
 * (`WEEKLY_SALES_TIME_BANDS`, réponse PERSONNELLE — `weekly_sales_time_residual`,
 * `TEMPS_PERSONAL_ANSWER_KEYS`), secteurs prioritaires déclarés
 * (`esn_profiles.priority_sectors`), besoins ouverts et consultants disponibles
 * sous 30 jours (`consultants.available_from`). Une entrée absente sort l'axe du
 * dénominateur — elle ne produit JAMAIS d'alerte.
 */

/**
 * LE RÉGLAGE UNIQUE — combien d'heures de temps commercial hebdomadaire un
 * dossier actif consomme, en moyenne, pour rester porté correctement.
 *
 * Réglage produit tranché 25/09/2026 (Louis) : UN seul endroit (GA-26), jamais
 * recopié ailleurs. Une valeur, jamais un intervalle : le produit n'affiche
 * aucune fourchette de confiance sur ce chiffre-là, seulement la conséquence
 * (dépassement ou non) qu'il produit une fois appliqué.
 */
export const HOURS_PER_ACTIVE_DOSSIER_PER_WEEK = 1.5

/**
 * La borne BASSE, en heures, de chaque tranche de {@link WEEKLY_SALES_TIME_BANDS}
 * (`onboarding/answers-temps.ts`) — dans le MÊME ordre, à l'octet près.
 * `null` = la tranche ne dit rien de mesurable (« Je ne sais pas ») : le membre
 * sort du calcul, il n'entre jamais pour 0 heure.
 *
 * « Moins de 2 heures par semaine » vaut 0 : sa borne BASSE, littéralement — le
 * capacité calculée ici est un PLANCHER, jamais une moyenne optimiste.
 */
const WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS: readonly (number | null)[] = [0, 0, 2, 5, 10, 20, null]

/** `null` = bande absente, ou hors du catalogue connu (jamais devinée). */
export function weeklySalesTimeBandLowerBoundHours(band: string | null | undefined): number | null {
  if (!band) return null
  const index = (WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS_LABELS as readonly string[]).indexOf(band)
  if (index === -1) return null
  return WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS[index] ?? null
}

// Recopiées à l'octet près depuis `WEEKLY_SALES_TIME_BANDS`
// (`onboarding/answers-temps.ts`) — ce module ne les importe pas : l'importer
// depuis `packages/contracts` vers lui-même n'est pas un cycle, mais coupler ce
// calcul de capacité au CATALOGUE COMPLET des dix questions du Temps 1 (charge
// concurrente, créneaux, variabilité…) pour trois mots recopiés serait la
// dépendance disproportionnée que GA-26 cherche à éviter. La garde
// `pipeline-capacity.test.ts` vérifie que les deux restent identiques mot pour
// mot.
export const WEEKLY_SALES_TIME_BAND_LOWER_BOUND_HOURS_LABELS = [
  'Aucune heure dans une semaine ordinaire',
  'Moins de 2 heures par semaine',
  '2 à 5 heures par semaine',
  '5 à 10 heures par semaine',
  '10 à 20 heures par semaine',
  'Plus de 20 heures par semaine',
  'Je ne sais pas',
] as const

export type PipelineCapacityMember = {
  /** `weekly_sales_time_residual` de CE membre — `null`/absent = non déclaré. */
  weeklySalesTimeResidualBand: string | null
}

export type PipelineCapacitySignal =
  | { measured: false }
  | {
      measured: true
      alert: boolean
    }

export type PipelineCapacitySignals = {
  /** #2325.27/.28 — Σ membres × borne basse ÷ réglage, comparée au volume actif. */
  capacity:
    | { measured: false }
    | {
        measured: true
        alert: boolean
        /** Dossiers actifs que l'équipe peut porter, au réglage produit courant. */
        capacityDossiers: number
        /** Sur combien de membres ce calcul porte — jamais tous s'ils n'ont pas
         *  tous déclaré leur temps résiduel. */
        measuredMembers: number
        totalMembers: number
      }
  /** #2325.29 — plus de la moitié des dossiers actifs (à secteur connu) hors
   *  secteurs prioritaires. */
  sectorFit:
    | { measured: false }
    | {
        measured: true
        alert: boolean
        outsidePriorityCount: number
        /** Dossiers actifs dont le secteur est connu — le dénominateur réel. */
        knownSectorCount: number
      }
  /** #2325.30 — besoins ouverts > 2 × dossiers actifs « de présentation ». */
  needsCoverage:
    | { measured: false }
    | {
        measured: true
        alert: boolean
        openNeedsCount: number
        presentationDossiersCount: number
      }
  /** #2325.31 — besoins ouverts > consultants disponibles sous 30 jours. */
  staffingAvailability:
    | { measured: false }
    | {
        measured: true
        alert: boolean
        openNeedsCount: number
        consultantsAvailableSoonCount: number
      }
}

export type PipelineCapacityInput = {
  /** Dossiers actifs de l'espace — le même dénominateur que #2325.1-.26
   *  (`TRIAGED_STAGES`, `opportunity-pipeline-health.ts`). */
  activeDossiersCount: number
  /** #2325.27 — les membres ACTIFS de l'espace, chacun avec sa tranche
   *  déclarée (#2325.28). Un tableau vide = axe non évaluable, jamais 0. */
  members: readonly PipelineCapacityMember[]
  /** #2325.29 — les secteurs prioritaires déclarés à l'onboarding
   *  (`esn_profiles.priority_sectors`). Vide = non déclaré, axe non évaluable. */
  prioritySectors: readonly string[]
  /** #2325.29 — le secteur de CHAQUE dossier actif, `null` quand il n'est pas
   *  connu (le dossier sort alors du dénominateur, jamais compté « hors »). */
  activeDossierSectors: readonly (string | null)[]
  /** #2325.30/.31 — besoins ouverts de l'espace. `null` = non mesuré. */
  openNeedsCount: number | null
  /** #2325.30 — dossiers actifs à l'étape « profils soumis » (présentation
   *  client). `null` = non mesuré. */
  presentationDossiersCount: number | null
  /** #2325.31 — consultants disponibles sous 30 jours (`available_from`).
   *  `null` = non mesuré. */
  consultantsAvailableSoonCount: number | null
}

function capacitySignal(
  activeDossiersCount: number,
  members: readonly PipelineCapacityMember[],
): PipelineCapacitySignals['capacity'] {
  const measuredHours = members
    .map(member => weeklySalesTimeBandLowerBoundHours(member.weeklySalesTimeResidualBand))
    .filter((hours): hours is number => hours !== null)

  if (measuredHours.length === 0) return { measured: false }

  const totalHours = measuredHours.reduce((sum, hours) => sum + hours, 0)
  const capacityDossiers = totalHours / HOURS_PER_ACTIVE_DOSSIER_PER_WEEK

  return {
    measured: true,
    alert: activeDossiersCount > capacityDossiers,
    capacityDossiers,
    measuredMembers: measuredHours.length,
    totalMembers: members.length,
  }
}

function sectorFitSignal(
  prioritySectors: readonly string[],
  activeDossierSectors: readonly (string | null)[],
): PipelineCapacitySignals['sectorFit'] {
  if (prioritySectors.length === 0) return { measured: false }

  const knownSectors = activeDossierSectors.filter((sector): sector is string => sector !== null)
  if (knownSectors.length === 0) return { measured: false }

  const outsidePriorityCount = knownSectors.filter(sector => !prioritySectors.includes(sector)).length

  return {
    measured: true,
    alert: outsidePriorityCount / knownSectors.length > 0.5,
    outsidePriorityCount,
    knownSectorCount: knownSectors.length,
  }
}

function needsCoverageSignal(
  openNeedsCount: number | null,
  presentationDossiersCount: number | null,
): PipelineCapacitySignals['needsCoverage'] {
  if (openNeedsCount === null || presentationDossiersCount === null) return { measured: false }
  return {
    measured: true,
    alert: openNeedsCount > 2 * presentationDossiersCount,
    openNeedsCount,
    presentationDossiersCount,
  }
}

function staffingAvailabilitySignal(
  openNeedsCount: number | null,
  consultantsAvailableSoonCount: number | null,
): PipelineCapacitySignals['staffingAvailability'] {
  if (openNeedsCount === null || consultantsAvailableSoonCount === null) return { measured: false }
  return {
    measured: true,
    alert: openNeedsCount > consultantsAvailableSoonCount,
    openNeedsCount,
    consultantsAvailableSoonCount,
  }
}

/** LE CALCUL PUR — voir le docblock en tête de fichier pour les quatre axes. */
export function pipelineCapacity(input: PipelineCapacityInput): PipelineCapacitySignals {
  return {
    capacity: capacitySignal(input.activeDossiersCount, input.members),
    sectorFit: sectorFitSignal(input.prioritySectors, input.activeDossierSectors),
    needsCoverage: needsCoverageSignal(input.openNeedsCount, input.presentationDossiersCount),
    staffingAvailability: staffingAvailabilitySignal(input.openNeedsCount, input.consultantsAvailableSoonCount),
  }
}

export const pipelineCapacitySignalSchema = z.union([
  z.object({ measured: z.literal(false) }),
  z.object({ measured: z.literal(true), alert: z.boolean() }).passthrough(),
])
