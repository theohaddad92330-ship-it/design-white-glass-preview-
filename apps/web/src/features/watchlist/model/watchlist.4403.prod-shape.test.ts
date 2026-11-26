import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems, groupWatchlistByAccount } from './watchlist'

// #4403.1 — RÉFUTÉ en recette PROD 23/10 : /mes-cibles → 0 « hors métier », « Contrôleur de gestion »,
// « Front Office Agent », « Chargé de Clientèle » mêlés aux postes IT d'un profil IT. Forme des données de prod :
// la CATÉGORIE du signal est absente (`type: null` → « Signal »), le poste n'a aucun métier classé. La ligne n'était
// donc jamais lue comme un recrutement, et le prédicat hors métier ne s'y appliquait pas.
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const sig = (n: number, company: string, label: string, extra: Partial<AccountSignalItem> = {}): AccountSignalItem => ({
  id: `s${n}`,
  account_id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  account_created_at: day(200),
  account_score: 8,
  company_name: company,
  date: day(n),
  label,
  sector: 'Services',
  source: 'Offre',
  type: null,
  ...extra,
})
const profilIt = { placedRoles: ['développeur', 'data engineer'], noGoSectors: [] }

describe('#4403.1 — catégorie absente : une offre reste une offre, et le hors métier s’y applique', () => {
  it('non-IT marqué « hors métier » et rangé en bas, IT en tête', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        sig(1, 'Crédit Nord', 'Contrôleur de gestion', { source_kind: 'job' }),
        sig(2, 'Hôtel Lumière', 'Front Office Agent', { source_kind: 'job' }),
        sig(3, 'Banque Est', 'Chargé de Clientèle H/F'),
        sig(4, 'Sopra', 'Développeur Java', { source_kind: 'job' }),
      ]),
      profilIt,
    )
    expect(groups.map(g => g.companyName)).toEqual(['Sopra', 'Crédit Nord', 'Hôtel Lumière', 'Banque Est'])
    expect(groups.map(g => g.outOfTrade === true)).toEqual([false, true, true, true])
  })

  it('NON : un signal sans catégorie qui n’est pas une offre n’est jamais marqué', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([sig(1, 'Crédit Nord', 'Nouveau directeur financier', { source_kind: 'press' })]),
      profilIt,
    )
    expect(groups[0]?.outOfTrade).toBe(false)
  })
})

describe('#4403.1 — sait dire NON : une mention « CDI » dans un article typé n’en fait pas une offre', () => {
  it('un signal de presse qui parle d’embauches n’est pas marqué', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([sig(1, 'Crédit Nord', 'Le groupe annonce 200 CDI en 2027', { type: 'Presse' })]),
      profilIt,
    )
    expect(groups[0]?.outOfTrade).toBe(false)
  })
})
