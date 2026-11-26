import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { buildWatchlistItems, groupWatchlistByAccount } from './watchlist'

const A = (n: number) => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const sig = (n: number, company: string, label: string, type: string): AccountSignalItem => ({
  id: `s${n}`,
  account_id: A(n),
  account_created_at: day(200),
  account_score: 8,
  company_name: company,
  date: day(n),
  label,
  sector: 'Services',
  source: 'Offre',
  type,
})
const itProfile = {
  placedRoles: ['développeur', 'data engineer', 'devops', 'chef de projet IT'],
  noGoSectors: [],
}
const rows = (type: string) => [
  sig(1, 'Latecoere', 'Contrôleur de gestion', type),
  sig(2, 'Sopra', 'Développeur Java', type),
  sig(3, 'ACTIA', 'Gestion administrative', type),
  sig(4, 'TotalEnergies', 'Hôte(sse) de vente', type),
]

describe('#4403.1 — /mes-cibles marque et range le hors métier, quel que soit le TYPE du signal', () => {
  it.each(['Recrutement', 'hiring', "Offre d'emploi", 'Emploi', 'Offre de poste recrutement'])(
    'type « %s » : IT en tête, hors métier marqué en bas',
    type => {
      const groups = groupWatchlistByAccount(buildWatchlistItems(rows(type)), itProfile)
      expect(groups.map(g => g.companyName)[0]).toBe('Sopra')
      const flagged = groups.filter(g => g.outOfTrade).map(g => g.companyName)
      expect(flagged.sort()).toEqual(['ACTIA', 'Latecoere', 'TotalEnergies'])
      expect(groups.slice(-3).every(g => g.outOfTrade)).toBe(true)
    },
  )

  it('profil qui place chez ses clients : le hors métier de SUPPORT est marqué, le reste ne l’est pas', () => {
    const placeur = { ...itProfile, recruitsForClients: true }
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        sig(1, 'Latecoere', 'Contrôleur de gestion', 'Recrutement'),
        sig(2, 'Sopra', 'Développeur Java', 'Recrutement'),
      ]),
      placeur,
    )
    expect(groups.find(g => g.companyName === 'Sopra')?.outOfTrade).toBe(false)
  })

  it('métiers seulement DÉDUITS : même verdict', () => {
    const deduced = {
      placedRoles: [],
      noGoSectors: [],
      inferredPlacedRoles: [{ role: 'Développeur', terms: ['développeur', 'java', 'devops', 'data'] }],
    }
    const groups = groupWatchlistByAccount(buildWatchlistItems(rows('Recrutement')), deduced)
    expect(
      groups
        .filter(g => g.outOfTrade)
        .map(g => g.companyName)
        .sort(),
    ).toEqual(['ACTIA', 'Latecoere', 'TotalEnergies'])
  })
})
