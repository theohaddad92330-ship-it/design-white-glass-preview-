import type { DiscoverCandidate, DiscoverNeedFilters, DiscoverNeedNature } from '@bellum/contracts'
import { candidateMatchesNeedFilters } from '../ia-proxy/discover-space-past-needs'

/**
 * #4793.1 / #4791.2 (Louis 31/10/2026) — LA BASE COMMUNE FABRIQUE DES CANDIDATS, en salle de démonstration.
 *
 * Le vrai chemin (`DiscoverSourcesService.commonBaseCandidates` → `_with_common_base`, `apps/ia/.../discover.py`)
 * fait entrer dans la liste les comptes de la base commune qui correspondent aux critères, chacun portant son besoin
 * DATÉ (récent ou historique). La salle rejoue cette FORME avec TROIS comptes FICTIFS aux besoins HISTORIQUES datés
 * (« Besoin Java, mars 2025 »), rangés sous les comptes de la recherche. Aucune source nommée (#4791.4). SIREN de
 * démo : sept zéros de tête et clé de Luhn fausse (aucun SIREN officiel ne leur ressemble).
 * Coverage : `DEMO_DISCOVER_COMMON_BASE_COVERAGE`.
 */

function demoMonthDay(monthsAgo: number): string {
  const day = new Date(Date.now())
  day.setUTCDate(12)
  day.setUTCMonth(day.getUTCMonth() - monthsAgo)
  return day.toISOString().slice(0, 10)
}

const DEMO_COMMON_BASE: ReadonlyArray<{
  siren: string
  name: string
  city: string
  sector: string
  nafCode: string
  need: string
  monthsAgo: number
  nature: DiscoverNeedNature
}> = [
  {
    siren: '000000092',
    name: 'Mutuelle des Trois Vallées (démo)',
    city: 'Lille',
    sector: 'Assurance',
    nafCode: '65.12Z',
    need: 'Java',
    monthsAgo: 19,
    nature: 'mission',
  },
  {
    siren: '000000093',
    name: 'Transports Côte d’Opale (démo)',
    city: 'Boulogne-sur-Mer',
    sector: 'Transports routiers de fret',
    nafCode: '49.41A',
    need: 'SAP',
    monthsAgo: 31,
    nature: 'projet',
  },
  {
    siren: '000000094',
    name: 'Énergies du Ternois (démo)',
    city: 'Arras',
    sector: 'Production d’électricité',
    nafCode: '35.11Z',
    need: 'Data engineering',
    monthsAgo: 8,
    nature: 'mission',
  },
  // #5203 — des besoins RÉCENTS aussi, pour que le filtre « Récents » ait du contenu en salle.
  {
    siren: '000000095',
    name: 'Groupe Hospitalier du Littoral (démo)',
    city: 'Dunkerque',
    sector: 'Activités hospitalières',
    nafCode: '86.10Z',
    need: 'Java',
    monthsAgo: 3,
    nature: 'recrutement',
  },
  {
    siren: '000000096',
    name: 'Caisse Régionale des Flandres (démo)',
    city: 'Lille',
    sector: 'Banque',
    nafCode: '64.19Z',
    need: 'SAP',
    monthsAgo: 2,
    nature: 'recrutement',
  },
]

/** La réponse de démo de Découvrir, avec les comptes de la base commune (dédoublonnés par SIREN), sous les autres. */
export function withDemoCommonBase<T extends { candidates: unknown[] }>(
  response: T,
  filters: DiscoverNeedFilters = {},
): T {
  const known = new Set(response.candidates.map(c => String((c as { siren?: unknown })?.siren ?? '')))
  const now = new Date()
  const added: DiscoverCandidate[] = DEMO_COMMON_BASE.filter(row => !known.has(row.siren))
    // #5203 — mêmes filtres de besoins que le vrai chemin (`candidateMatchesNeedFilters`) : ils RETIRENT.
    .filter(row =>
      candidateMatchesNeedFilters(
        { observedNeed: { label: row.need, date: demoMonthDay(row.monthsAgo), nature: row.nature } },
        filters,
        now,
      ),
    )
    .map(row => ({
      name: row.name,
      siren: row.siren,
      nafCode: row.nafCode,
      sector: row.sector,
      city: row.city,
      department: null,
      headcountRange: null,
      creationDate: null,
      // Le score de la salle reste la somme de ses facteurs (`demo-no-model.spec.ts`) : un seul, le besoin observé.
      score: 20,
      scoreFactors: [{ label: 'Besoin observé sur ton métier', points: 20, evidence: row.need }],
      signals: [],
      angle: null,
      suggestedRoles: [],
      portfolioState: 'new',
      accountId: null,
      sources: [],
      observedNeed: { label: row.need, date: demoMonthDay(row.monthsAgo), nature: row.nature },
      // #4793.1 (recette 01/11) — la salle MONTRE le repère « Repéré dans la base commune » (aucune source nommée).
      fromCommonBase: true,
    }))
  if (added.length === 0) return response
  return { ...response, candidates: [...response.candidates, ...added] }
}
