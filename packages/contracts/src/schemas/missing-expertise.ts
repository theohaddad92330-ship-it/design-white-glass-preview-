import { expectedWorkingDaysInWindow } from './mission.js'

/**
 * LE DÉTECTEUR D'EXPERTISE MANQUANTE — PDF 4 (ATS) §8.4.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Trois besoins refusés sur la même compétence en un trimestre, et personne ne
 * fait le lien. »
 *
 * Le dépôt compte déjà les refus — `CrmKpisService.overview()` rend
 * `unstaffableByReason`, un `GROUP BY staffable_reason`. Il les compte donc par
 * MOTIF (« compétence absente du vivier » × 47) et jamais par COMPÉTENCE : la
 * donnée existe, l'axe d'agrégation non. Savoir que 47 besoins sont partis faute
 * de profil ne dit pas lequel recruter ; savoir que trois sont partis sur
 * Kubernetes le dit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ « CA NON ADRESSÉ » EST UN MONTANT, DONC UNE PROMESSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois règles de chiffrage de la source, tenues une par une par les tests :
 *
 *  1. **On chiffre à partir des TJM cibles RÉELLEMENT saisis** — jamais une
 *     moyenne de marché. Un montant inventé est pire que pas de montant : il se
 *     recopie dans un comité de direction et personne ne sait plus d'où il sort.
 *  2. **Un besoin sans TJM n'entre pas dans le calcul** — il est compté à part.
 *  3. **On écrit « CA non adressé », jamais « CA perdu »** — on ne sait pas si on
 *     l'aurait gagné, et le dire autrement serait une probabilité déguisée.
 *
 * Et un quatrième refus, propre à ce dépôt : **on ne devine pas la durée**. La
 * source illustre son chiffre « sur des missions de 12 mois », mais douze mois
 * posés par défaut sur un besoin qui n'en porte pas serait exactement la moyenne
 * de marché que la règle 1 interdit. Un besoin sans `durationMonths` ou sans
 * `startOn` est compté à part, comme celui sans TJM.
 *
 * Les jours ouvrés viennent du CALENDRIER RÉEL (`expectedWorkingDaysInWindow`,
 * déjà utilisé par le CRA), mois par mois — pas d'un « 20 jours par mois » qui
 * serait une invention de plus, et qui ferait diverger ce calcul de celui des
 * relevés d'activité.
 *
 * ⚠️ Aucun montant ne sort d'ici sans passer par `redactFinance` côté service :
 * un CA non adressé est une donnée financière (D45).
 */

/** Les deux seuils du §8.4. Un réglage vit à un seul endroit (GA-26). */
export const MISSING_EXPERTISE_THRESHOLDS = {
  /** « 3 refus sur la même compétence canonique ». */
  refusalsOnSameSkill: 3,
  /** « en 90 jours » — le trimestre de la source, en jours pour être calculable. */
  windowDays: 90,
} as const

/** Un besoin fermé faute de profil, déjà canonicalisé par l'appelant. */
export interface RefusedNeed {
  needId: string
  title: string
  /**
   * Les compétences du besoin, passées par `canonicalSkill()`.
   *
   * La canonicalisation est faite AVANT, côté service, parce que le référentiel
   * d'alias vit dans l'API (il apprend des alias approuvés par un admin) et que
   * ce module doit rester pur. « k8s », « kube » et « kubernetes » sont la même
   * absence dans le vivier ; comptés séparément, aucun n'atteint jamais trois.
   */
  canonicalSkills: readonly string[]
  /** Quand le besoin a été refusé. `null` = date non lue, le besoin est écarté. */
  refusedAt: string | null
  /** TJM cible saisi, en centimes. `null` = jamais deviné. */
  targetDayRateCents: number | null
  /** Date de démarrage prévue. Sans elle, aucun calendrier à parcourir. */
  startOn: string | null
  /** Durée prévue. Sans elle, un €/jour ne devient jamais un €. */
  durationMonths: number | null
}

export interface MissingExpertise {
  /** La compétence canonique. */
  skill: string
  refusedCount: number
  needs: readonly { needId: string; title: string; refusedAt: string }[]
}

export interface UnaddressedRevenue {
  /**
   * Le CA non adressé, en centimes. `null` = aucun besoin chiffrable.
   *
   * ⚠️ JAMAIS `0` : zéro euro se lit « il n'y a rien à gagner », l'inverse exact
   * du message. `null` se lit « je ne peux pas le chiffrer », et l'écran affiche
   * alors « trois refus sur cette compétence » — le commercial conclut.
   */
  amountCents: number | null
  /** Somme des TJM cibles saisis, en centimes. La première moitié de la phrase. */
  cumulativeDayRateCents: number | null
  /** Besoins réellement entrés dans le montant. */
  countedNeeds: number
  /** Comptés à PART, jamais absorbés : ils nomment ce qu'il faut compléter. */
  withoutRate: number
  withoutDuration: number
}

/**
 * Ce que l'API rend : la compétence, ses refus, et — peut-être — un montant.
 *
 * ⚠️ `revenueState` existe pour une raison précise, et c'est le piège classique
 * du dépôt : `redactFinance` met les montants à `null` quand l'appelant n'a pas
 * `finance:read`, et `unaddressedRevenueCents` vaut DÉJÀ `null` quand aucun
 * besoin n'est chiffrable. Les deux `null` sont indiscernables, et ils ne disent
 * pas du tout la même chose — « tu n'as pas le droit de voir » n'est pas « je ne
 * peux pas le calculer ». Un troisième champ les sépare, et il ne passe pas par
 * la rédaction : connaître l'ÉTAT d'un montant n'est pas connaître le montant.
 */
export interface MissingExpertiseReport {
  skill: string
  refusedCount: number
  needs: readonly { needId: string; title: string; refusedAt: string }[]
  /** `null` = non chiffrable OU masqué. C'est `revenueState` qui tranche. */
  unaddressedRevenueCents: number | null
  cumulativeDayRateCents: number | null
  revenueState: 'measured' | 'not_chiffrable' | 'hidden'
  /** Ce qui est entré dans le montant, et ce qui a été compté à PART. */
  countedNeeds: number
  withoutRate: number
  withoutDuration: number
}

function readableInstant(value: string | null): number | null {
  if (value === null) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/** Le premier jour du mois, `n` mois après `startOn`, en « YYYY-MM ». */
function monthKey(start: Date, offset: number): string {
  const at = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1))
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Combien de jours ouvrés une fenêtre de `months` mois porte réellement.
 *
 * `null` dès qu'un seul mois n'est pas lisible : un total amputé d'un mois se
 * lirait comme un total, et sous-estimerait le CA non adressé sans le dire.
 */
function workingDaysOver(startOn: string, months: number): number | null {
  const start = new Date(`${startOn.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime())) return null
  if (!Number.isFinite(months) || months <= 0) return null
  let total = 0
  for (let offset = 0; offset < Math.trunc(months); offset += 1) {
    const days = expectedWorkingDaysInWindow(`${monthKey(start, offset)}-01`, { startedOn: null, endsOn: null })
    if (days === null) return null
    total += days
  }
  return total
}

/**
 * Le chiffrage. Pur, et il refuse plus souvent qu'il n'accepte — c'est le point.
 */
export function unaddressedRevenueCents(needs: readonly RefusedNeed[]): UnaddressedRevenue {
  let amountCents: number | null = null
  let cumulativeDayRateCents: number | null = null
  let countedNeeds = 0
  let withoutRate = 0
  let withoutDuration = 0

  for (const need of needs) {
    const rate = need.targetDayRateCents
    if (rate === null || !Number.isFinite(rate) || rate <= 0) {
      withoutRate += 1
      continue
    }
    // Le TJM cumulé se lit même quand la durée manque : c'est un €/jour, il ne
    // suppose aucun calendrier.
    cumulativeDayRateCents = (cumulativeDayRateCents ?? 0) + rate

    if (need.startOn === null || need.durationMonths === null) {
      withoutDuration += 1
      continue
    }
    const days = workingDaysOver(need.startOn, need.durationMonths)
    if (days === null) {
      withoutDuration += 1
      continue
    }
    amountCents = (amountCents ?? 0) + rate * days
    countedNeeds += 1
  }

  return { amountCents, cumulativeDayRateCents, countedNeeds, withoutRate, withoutDuration }
}

/**
 * Les compétences sur lesquelles l'ESN a refusé assez de besoins pour que ce
 * soit un fait et non une coïncidence.
 *
 * `now` est passé et jamais lu de l'horloge : une fenêtre glissante non
 * injectable est intestable, et celle-ci décide d'un message au dirigeant.
 */
export function detectMissingExpertise(needs: readonly RefusedNeed[], now: Date): MissingExpertise[] {
  const floor = now.getTime() - MISSING_EXPERTISE_THRESHOLDS.windowDays * 86_400_000
  const bySkill = new Map<string, { needId: string; title: string; refusedAt: string }[]>()

  for (const need of needs) {
    const at = readableInstant(need.refusedAt)
    // Une date non lue ne devient pas « aujourd'hui » : elle ferait entrer dans
    // la fenêtre un refus d'il y a deux ans.
    if (at === null || at < floor || at > now.getTime()) continue

    // Un même besoin ne compte qu'une fois par compétence, même si la
    // compétence est listée deux fois sur la fiche.
    for (const skill of new Set(need.canonicalSkills)) {
      const key = skill.trim()
      if (key.length === 0) continue
      const bucket = bySkill.get(key) ?? []
      bucket.push({ needId: need.needId, title: need.title, refusedAt: new Date(at).toISOString() })
      bySkill.set(key, bucket)
    }
  }

  const found: MissingExpertise[] = []
  for (const [skill, bucket] of bySkill) {
    if (bucket.length < MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill) continue
    found.push({
      skill,
      refusedCount: bucket.length,
      needs: [...bucket].sort((a, b) => b.refusedAt.localeCompare(a.refusedAt)),
    })
  }
  // Le plus de refus d'abord : c'est la compétence à recruter en premier.
  return found.sort((a, b) => b.refusedCount - a.refusedCount || a.skill.localeCompare(b.skill))
}
