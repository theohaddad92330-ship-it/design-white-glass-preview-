import { canonicalSequenceStatus, type OutreachSequence, type OutreachSequenceCanonicalStatus } from '@bellum/contracts'
import { campaignModeLabel, displayStatusOf } from './sequences-cockpit'
import { groupByAudience } from './sequences-audience'

/**
 * Théo C sequences-liste — LES FILTRES DE « TES CAMPAGNES », tous à choix multiple (décision Louis 23/10).
 *
 * L'état d'abord (le filtre de la maquette), puis, sous « Plus de filtres », la campagne, le modèle et le compte
 * (notre maquette validée : f-statut · f-modele · f-compte · f-plus). Dans une famille, les cases cochées
 * s'additionnent (OU) ; entre familles, elles se composent (ET). Un ensemble vide = la famille ne filtre pas.
 * Une option n'existe que si une ligne la porte : jamais un compte « (aucun) » inventé pour les lignes sans compte.
 */

export type SequenceListFilters = {
  states: ReadonlySet<OutreachSequenceCanonicalStatus>
  campaigns: ReadonlySet<string>
  models: ReadonlySet<string>
  accounts: ReadonlySet<string>
}

export const NO_FILTERS: SequenceListFilters = {
  states: new Set(),
  campaigns: new Set(),
  models: new Set(),
  accounts: new Set(),
}

type FilterOption = { value: string; label: string; count: number }

const passes = (wanted: ReadonlySet<string>, value: string | null): boolean =>
  wanted.size === 0 || (value !== null && wanted.has(value))

export function filterSequences(
  sequences: readonly OutreachSequence[],
  filters: SequenceListFilters,
  now: Date,
): OutreachSequence[] {
  return sequences.filter(
    sequence =>
      passes(filters.states, canonicalSequenceStatus(sequence.status, displayStatusOf(sequence, now))) &&
      passes(filters.campaigns, sequence.campaign_label?.trim() || null) &&
      passes(filters.models, sequence.template_key) &&
      passes(filters.accounts, sequence.account_name),
  )
}

export function activeFilterCount(filters: SequenceListFilters): number {
  return filters.states.size + filters.campaigns.size + filters.models.size + filters.accounts.size
}

function countBy(values: readonly (readonly [string, string] | null)[]): FilterOption[] {
  const counts = new Map<string, FilterOption>()
  for (const entry of values) {
    if (!entry) continue
    const [value, label] = entry
    const current = counts.get(value)
    counts.set(value, { value, label, count: current ? current.count + 1 : 1 })
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Les options de « Plus de filtres », la plus fournie en tête. La campagne garde `campaignOptions` (campaign-label). */
export function filterOptions(sequences: readonly OutreachSequence[]): {
  models: FilterOption[]
  accounts: FilterOption[]
} {
  return {
    models: countBy(
      sequences.map(sequence => {
        const label = campaignModeLabel(sequence)
        return sequence.template_key && label ? ([sequence.template_key, label] as const) : null
      }),
    ),
    accounts: countBy(
      sequences.map(sequence =>
        sequence.account_name ? ([sequence.account_name, sequence.account_name] as const) : null,
      ),
    ),
  }
}

/**
 * « 5 campagnes · 2 actives, 1 planifiée » : une campagne est une LIGNE d'audience (plusieurs personnes réunies par
 * leur étiquette, ou une séquence seule). Elle est ACTIVE quand une de ses cadences en cours a déjà une étape faite,
 * PLANIFIÉE quand ses cadences en cours n'ont encore rien fait (le premier message est à venir). Les deux mots se
 * lisent sur les étapes — jamais devinés.
 */
export function campaignSummary(
  sequences: readonly OutreachSequence[],
  now: Date,
): { campaigns: number; active: number; scheduled: number } {
  const rows = groupByAudience(sequences, now)
  let active = 0
  let scheduled = 0
  for (const row of rows) {
    const running = (row.kind === 'group' ? row.members : [row.sequence]).filter(member => member.status === 'active')
    if (running.length === 0) continue
    if (running.some(member => member.steps.some(step => step.status === 'done'))) active += 1
    else scheduled += 1
  }
  return { campaigns: rows.length, active, scheduled }
}
