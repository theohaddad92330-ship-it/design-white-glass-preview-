import type { TalentRow } from './talent.js'
import { talentCompleteness } from './talent.js'
import { CONSULTANT_AVAILABILITIES } from './consultant.js'

/**
 * Théo C talents-vivier — ce que la LISTE du vivier lit d'une ligne, calculé une seule fois.
 *
 * Deux lectures pures, partagées par le tableau, les cartes et le panneau d'axes :
 *
 *  - {@link talentScore} — le score /100 de la fiche, JAMAIS nu (Q14, doctrine « un score n'est
 *    jamais nu ») : ses quatre axes sont nommés, et un axe non évaluable SORT du dénominateur au
 *    lieu de compter zéro (GA-18 / GA-19). Il range la fiche, il ne classe pas la personne : aucun
 *    critère protégé n'y entre (ni photo, ni âge, ni genre, ni origine).
 *  - {@link vivierAvailability} — la disponibilité DÉCLARÉE (datée) et le planning de missions,
 *    deux informations distinctes ; la déclaration gagne sur le planning quand elle existe.
 */

/** Au-delà, une confirmation de disponibilité est « périmée » — le seuil du matching (`pushable.ts`). */
const AVAILABILITY_FRESH_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
/** Sous ce nombre d'axes évaluables, la fiche n'a pas de score — comme le score d'un compte (`account-score.ts`). */
const TALENT_SCORE_MIN_AXES = 2
/** Ce que la fiche peut DÉCLARER — « inconnu » et une valeur hors domaine ne sont pas une déclaration. */
const DECLARATIONS: ReadonlySet<string> = new Set(CONSULTANT_AVAILABILITIES.filter(value => value !== 'inconnu'))

export type TalentScoreAxisKey = 'file' | 'skills' | 'availability' | 'feedback'

export type TalentScoreInput = Pick<
  TalentRow,
  'fullName' | 'skillCount' | 'staffing' | 'tjm' | 'hasCv' | 'reviewStatus'
> & {
  provenSkillCount?: number | null
  availabilityCheckedAt?: string | null
}

export type TalentScore = {
  /** `null` = non évaluable (aucun axe ne l'est), jamais 0. */
  value: number | null
  axes: { key: TalentScoreAxisKey; score: number | null }[]
  evaluable: number
}

export function talentScore(row: TalentScoreInput, now: Date): TalentScore {
  // Une fiche à relire n'a été lue par personne : sa complétude serait celle d'une extraction brute.
  const file = row.reviewStatus === 'needs_review' ? null : talentCompleteness(row).score
  // Prouvées = mission ou entretien (`isSkillSourceProven`) ; sans compétence, rien à évaluer.
  const skills =
    row.skillCount > 0 && row.provenSkillCount != null
      ? Math.round((100 * Math.min(row.provenSkillCount, row.skillCount)) / row.skillCount)
      : null
  const checked = row.availabilityCheckedAt ? new Date(row.availabilityCheckedAt).getTime() : Number.NaN
  const availability = Number.isNaN(checked)
    ? null
    : (now.getTime() - checked) / DAY_MS <= AVAILABILITY_FRESH_DAYS
      ? 100
      : 50
  // Aucun retour de mission n'est lisible ici : ceux de la fiche mission peuvent être privés (#2412.10).
  const feedback = null

  const axes: TalentScore['axes'] = [
    { key: 'file', score: file },
    { key: 'skills', score: skills },
    { key: 'availability', score: availability },
    { key: 'feedback', score: feedback },
  ]
  const scored = axes.flatMap(axis => (axis.score === null ? [] : [axis.score]))
  return {
    // #4500 — sous deux axes évaluables, pas de score (doctrine du 13/10/2026) : l'axe connu reste dans `axes`.
    value:
      scored.length < TALENT_SCORE_MIN_AXES
        ? null
        : Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length),
    axes,
    evaluable: scored.length,
  }
}

export type VivierAvailabilityStatus = 'declared' | 'upcoming' | 'in_mission' | 'available' | 'to_reconfirm' | 'unknown'

export type VivierAvailabilityInput = Pick<TalentRow, 'declaredAvailability' | 'staffing' | 'lastMission'> & {
  declaredAvailableFrom?: string | null
  availabilityCheckedAt?: string | null
}

export type VivierAvailability = {
  status: VivierAvailabilityStatus
  /** La date du badge (`YYYY-MM-DD`) : annoncée, ou de démarrage. */
  date: string | null
  /** Le jour de la dernière déclaration / confirmation (`YYYY-MM-DD`). */
  declaredOn: string | null
  confirmedOn: string | null
  /** Le planning de missions, en ligne secondaire. `endsOn: null` = fin non prévue. */
  planning: { endsOn: string | null; client: string | null } | null
}

const day = (value: string | null | undefined): string | null => (value ? value.slice(0, 10) : null)

export function vivierAvailability(row: VivierAvailabilityInput, now: Date): VivierAvailability {
  const announced = day(row.declaredAvailableFrom)
  const checked = day(row.availabilityCheckedAt)
  const client = row.lastMission?.accountName ?? row.lastMission?.label ?? null
  const busy = row.staffing.availability === 'busy' || row.staffing.availability === 'busy_open_ended'
  // En mission sans mission lisible sur la ligne : le planning se NOMME sans fin prévue, il ne se tait pas.
  const planning = busy ? { endsOn: day(row.lastMission?.endsOn), client } : null
  const today = now.toISOString().slice(0, 10)

  if (row.declaredAvailability === 'a_confirmer') {
    return { status: 'to_reconfirm', date: announced, declaredOn: null, confirmedOn: checked, planning }
  }
  // Une date annoncée ÉCHUE (aujourd'hui ou avant) n'annonce plus rien : « disponible » se lit alors sur
  // la confirmation, pas sur une date passée.
  if (announced && announced > today) {
    return { status: 'declared', date: announced, declaredOn: checked, confirmedOn: null, planning }
  }
  const startsOn = day(row.lastMission?.startsOn)
  if (!busy && startsOn && startsOn > today) {
    return {
      status: 'upcoming',
      date: startsOn,
      declaredOn: null,
      confirmedOn: null,
      planning: { endsOn: day(row.lastMission?.endsOn), client },
    }
  }
  // #4500 — une déclaration NON datée gagne aussi (« la disponibilité déclarée gagne sur la déduite ») :
  // seules « immédiate » hors mission (confirmée) et une déclaration qui dit déjà la mission laissent parler le planning.
  const declared = row.declaredAvailability
  const agreesWithPlanning = busy ? declared === 'en_mission' || declared === 'indisponible' : declared === 'immediate'
  if (DECLARATIONS.has(declared) && !agreesWithPlanning) {
    return { status: 'declared', date: null, declaredOn: checked, confirmedOn: null, planning }
  }
  if (busy) return { status: 'in_mission', date: null, declaredOn: null, confirmedOn: null, planning }
  if (declared === 'immediate') {
    return { status: 'available', date: null, declaredOn: null, confirmedOn: checked, planning: null }
  }
  return { status: 'unknown', date: null, declaredOn: null, confirmedOn: null, planning: null }
}
