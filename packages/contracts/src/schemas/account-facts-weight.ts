import type { AccountFact } from './account-facts.js'

/**
 * #4069.2 — LA décote des faits du compte. UN module, partagé par tous les
 * consommateurs (GA-26 : un réglage vit à un seul endroit).
 *
 * Décision Louis 12/10 : **aucune coupure d'âge**, une décote ; **un besoin
 * récurrent = signal fort**.
 *
 *  - Décote HYPERBOLIQUE `1 / (1 + âge / 365)` : un fait d'un an pèse la
 *    moitié d'un fait du jour, un fait de dix ans pèse encore (≈ 0,09). Une
 *    exponentielle aurait écrasé la décennie à zéro en pratique — exactement
 *    la coupure que la décision refuse.
 *  - Récurrence : un fait de même nature et de même libellé normalisé, revu à
 *    des JOURS DISTINCTS, gagne +50 % par retour (plafonné à ×3, pour qu'un
 *    signal ressassé par une source bavarde n'écrase pas tout le reste). Le
 *    même fait lu deux fois le même jour par deux lectures n'est PAS une
 *    récurrence.
 *  - Toutes les natures partent du même poids (1) : tranché sans Louis — un
 *    barème par nature serait une opinion non gardée ; l'ordre ne vient que de
 *    l'âge et de la récurrence.
 *
 * Le poids est un RANG relatif, jamais une probabilité : il ne s'affiche pas.
 */
const ACCOUNT_FACT_HALF_WEIGHT_DAYS = 365
const RECURRENCE_BONUS = 0.5
const RECURRENCE_MAX_MULTIPLIER = 3
const DAY_MS = 86_400_000

export function accountFactAgeDays(date: string, asOf: Date): number {
  const t = Date.parse(date)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((asOf.getTime() - t) / DAY_MS))
}

export function accountFactDecay(ageDays: number): number {
  return 1 / (1 + Math.max(0, ageDays) / ACCOUNT_FACT_HALF_WEIGHT_DAYS)
}

function recurrenceKey(fact: Pick<AccountFact, 'kind' | 'label'>): string {
  const label = fact.label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return `${fact.kind}|${label}`
}

/**
 * Pèse et ordonne des faits bruts : les plus pesants d'abord, à poids égal les
 * plus récents. Une date illisible écarte le fait (un fait du socle est
 * toujours daté) — jamais une date devinée.
 */
export function weighAccountFacts(
  raw: ReadonlyArray<Omit<AccountFact, 'weight' | 'ageDays'>>,
  asOf: Date,
): AccountFact[] {
  const dated = raw.filter(f => Number.isFinite(Date.parse(f.date)))
  const days = new Map<string, Set<string>>()
  for (const f of dated) {
    const key = recurrenceKey(f)
    const set = days.get(key) ?? new Set<string>()
    set.add(new Date(Date.parse(f.date)).toISOString().slice(0, 10))
    days.set(key, set)
  }
  return dated
    .map(f => {
      const ageDays = accountFactAgeDays(f.date, asOf)
      const occurrences = days.get(recurrenceKey(f))?.size ?? 1
      const multiplier = Math.min(RECURRENCE_MAX_MULTIPLIER, 1 + RECURRENCE_BONUS * (occurrences - 1))
      return { ...f, ageDays, weight: accountFactDecay(ageDays) * multiplier }
    })
    .sort((a, b) => b.weight - a.weight || a.ageDays - b.ageDays)
}

/**
 * #4072 — l'âge d'un fait en mots (« il y a 14 mois »), UN seul endroit pour
 * Laura (#4071) et les écrans : un fait ancien se dit toujours daté.
 */
export function accountFactAgePhrase(ageDays: number): string {
  if (ageDays < 1) return "aujourd'hui"
  if (ageDays < 31) return `il y a ${ageDays} jour${ageDays > 1 ? 's' : ''}`
  if (ageDays < 731) {
    const months = Math.max(1, Math.round(ageDays / 30.44))
    return `il y a ${months} mois`
  }
  const years = Math.floor(ageDays / 365.25)
  return `il y a ${years} an${years > 1 ? 's' : ''}`
}
