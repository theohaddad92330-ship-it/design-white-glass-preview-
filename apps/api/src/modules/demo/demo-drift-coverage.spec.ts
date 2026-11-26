import { detectMissionDrift, type MissionMonth } from '@bellum/contracts'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * PARITÉ DÉMO DU DÉTECTEUR DE DÉRIVE (PDF 5 §7.2, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ET CE QU'ELLE ÉVITE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un écran livré mais vide en démo se découvre en réunion, pas en CI. »
 *
 * Le piège précis ici : la salle porte UN relevé par mission. Avec un seul mois,
 * `detectMissionDrift` rend `unmeasurable` sur TOUTES les missions — ce qui est
 * juste, et ce qui ne montre jamais l'alerte. Une garde qui se contenterait de
 * vérifier « le panneau a des données » serait verte sur cette salle-là.
 *
 * Celle-ci REJOUE le vrai détecteur sur les valeurs réellement semées, et exige
 * un verdict `drifting`. Elle attrape donc les deux régressions qui comptent :
 * quelqu'un qui retire l'historique, et quelqu'un qui l'aplatit au point que
 * plus aucun signal ne se déclenche.
 */

type DriftMonth = {
  months_ago: number
  days: number
  expected_days: number
  validated_days_ago: number | null
}

/** Ce que la simulation a besoin de lire, et rien de plus. */
type DriftEntry = { history: DriftMonth[]; timesheet: { days: number; expected_days: number } }

/**
 * La mission de la salle qui porte un historique — il n'en faut qu'UNE.
 *
 * ⚠️ Construit par une BOUCLE et non par `filter` + prédicat de type : les
 * relevés du jeu forment une union de littéraux (chaque mission a son propre
 * statut), et un prédicat qui rétrécit vers `{ days; expected_days }` n'est pas
 * assignable à cette union. `tsc -p tsconfig.json` le refuse — et c'est le
 * contrôle que `turbo check-types` ne lance PAS sur les tests de l'API : vert en
 * local, rouge en CI.
 */
function missionsWithHistory(): DriftEntry[] {
  const entries: DriftEntry[] = []
  for (const mission of DEMO_DELIVERY_CLIENT.missions) {
    const history = (mission as { driftHistory?: DriftMonth[] }).driftHistory ?? []
    if (history.length === 0 || mission.timesheet === null) continue
    entries.push({
      history,
      timesheet: { days: mission.timesheet.days, expected_days: mission.timesheet.expected_days },
    })
  }
  return entries
}

/**
 * Ce que le service construira réellement, reproduit sur les valeurs du jeu.
 *
 * ⚠️ `daysToSubmit` et `satisfaction` sont `null` ici comme ils le sont en
 * production — le dépôt n'a ni date de remise, ni donnée de satisfaction. Les
 * remplir dans la simulation ferait passer la garde sur une salle qui, en vrai,
 * ne déclenche rien.
 */
function toMonths(entry: DriftEntry): MissionMonth[] {
  // Un mois de référence FIXE : le détecteur ne lit que l'ORDRE des périodes et
  // les écarts de dates, jamais « aujourd'hui ». Ancrer la simulation sur une
  // date en dur rend le test déterministe, là où `new Date()` le ferait changer
  // de verdict au passage d'un mois court.
  const anchor = Date.UTC(2026, 8, 1)
  const day = 86_400_000

  const months: MissionMonth[] = entry.history.map(month => {
    const period = new Date(Date.UTC(2026, 8 - month.months_ago, 1))
    const closes = Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1)
    const validatedAt = month.validated_days_ago === null ? null : anchor - month.validated_days_ago * day
    return {
      period: `${period.getUTCFullYear()}-${String(period.getUTCMonth() + 1).padStart(2, '0')}`,
      expectedDays: month.expected_days,
      declaredDays: month.days,
      daysToSubmit: null,
      daysToClientValidation: validatedAt === null ? null : Math.max(0, Math.round((validatedAt - closes) / day)),
      satisfaction: null,
      disputed: false,
    }
  })

  // Le relevé COURANT occupe le mois précédent — c'est lui qui complète la
  // série de trois mois consécutifs.
  months.push({
    period: '2026-08',
    expectedDays: entry.timesheet.expected_days,
    declaredDays: entry.timesheet.days,
    daysToSubmit: null,
    daysToClientValidation: null,
    satisfaction: null,
    disputed: false,
  })
  return months
}

describe('parité démo — la mission qui dérape', () => {
  const withHistory = missionsWithHistory()

  it('la garde LIT quelque chose — au moins une mission porte un historique', () => {
    // Sans ce témoin, tout ce qui suit passerait sur une liste vide.
    expect(withHistory.length).toBeGreaterThanOrEqual(1)
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
  })

  it('la salle DÉCLENCHE réellement l’alerte — pas seulement « on ne sait pas lire »', () => {
    const verdicts = withHistory.map(entry => detectMissionDrift(toMonths(entry)))
    const drifting = verdicts.filter(verdict => verdict.kind === 'drifting')
    expect(drifting.length).toBeGreaterThanOrEqual(1)
  })

  it('DEUX signaux au moins se déclenchent — un seul ne suffirait pas à alerter', () => {
    const verdict = withHistory.map(entry => detectMissionDrift(toMonths(entry))).find(v => v.kind === 'drifting')
    expect(verdict?.kind).toBe('drifting')
    if (verdict?.kind === 'drifting') {
      expect(verdict.signals).toEqual(expect.arrayContaining(['growing_day_gap', 'slow_client_validation']))
      expect(verdict.months).toBeGreaterThanOrEqual(3)
    }
  })

  it('NOMME les deux signaux que ce dépôt ne sait pas mesurer — la salle montre l’honnêteté', () => {
    // C'est la moitié du produit : un prospect doit voir que le détecteur DIT
    // ce qu'il n'a pas regardé, au lieu de laisser croire à cinq signaux.
    const verdict = withHistory.map(entry => detectMissionDrift(toMonths(entry))).find(v => v.kind === 'drifting')
    expect(verdict?.unmeasurable).toEqual(expect.arrayContaining(['late_timesheet', 'satisfaction_drop']))
  })

  it('n’utilise AUCUN mois contesté — `disputed` reste un état qu’aucun clic n’atteint', () => {
    // `demo-coverage.ts` refuse d'en semer un, et pour une bonne raison : le
    // module de livraison n'écrit que `rejected`. Deux entrées du même dossier
    // qui se contrediraient seraient pires qu'un signal manquant.
    for (const entry of withHistory) {
      for (const month of entry.history) {
        expect(month).not.toHaveProperty('status', 'disputed')
      }
    }
  })
})
