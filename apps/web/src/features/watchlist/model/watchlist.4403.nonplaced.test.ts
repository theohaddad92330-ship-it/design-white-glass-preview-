import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import { isOutOfTradeHiring } from '@/features/discover/lib/discover-hiring-domain'
import { buildWatchlistItems, groupWatchlistByAccount } from './watchlist'

// #4403.1 — recette PROD 22/10 : « Facteur » et « Hôte de vente » en signal de tête sur un profil IT, sans marque.
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const sig = (n: number, company: string, label: string, importance?: 'high'): AccountSignalItem => ({
  id: `s${n}`,
  account_id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  account_created_at: day(200),
  account_score: 8,
  company_name: company,
  date: day(n),
  label,
  sector: 'Services',
  source: 'Offre',
  type: 'Recrutement',
  ...(importance ? { importance } : {}),
})
const placeur = { placedRoles: ['développeur', 'data engineer'], noGoSectors: [], recruitsForClients: true }
const sansMetier = { placedRoles: [], noGoSectors: [] }
const profilIt = { placedRoles: ['développeur', 'data engineer'], noGoSectors: [] }

describe('#4403.1 — un poste que nulle ESN ne place est marqué hors métier quel que soit le profil', () => {
  it.each([
    ['placeur en CDI', placeur],
    ['profil sans métier', sansMetier],
    ['profil IT', profilIt],
  ])('« Facteur » et « Hôte de vente » sont marqués — %s', (_name, profile) => {
    expect(isOutOfTradeHiring({ type: 'hiring', label: 'CDD Facteur H/F' }, profile)).toBe(true)
    expect(isOutOfTradeHiring({ type: 'hiring', label: 'Hôte de vente' }, profile)).toBe(true)
  })

  it('NON : un vrai poste IT n’est marqué sur aucun profil, et sans profil seul le poste non placé est marqué', () => {
    for (const profile of [placeur, sansMetier, profilIt])
      expect(isOutOfTradeHiring({ type: 'hiring', label: 'Développeur Java' }, profile)).toBe(false)
    // sans profil lu : un poste que nulle ESN ne place est marqué quand même (#4403.1, prod 23/10), un poste IT jamais.
    expect(isOutOfTradeHiring({ type: 'hiring', label: 'CDD Facteur H/F' }, undefined)).toBe(true)
    expect(isOutOfTradeHiring({ type: 'hiring', label: 'Développeur Java' }, undefined)).toBe(false)
  })

  it('le facteur « important » ne passe jamais en tête devant le poste IT, même pour un placeur', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([sig(1, 'La Poste', 'CDD Facteur H/F', 'high'), sig(2, 'Sopra', 'Développeur Java')]),
      placeur,
    )
    expect(groups.map(g => g.companyName)).toEqual(['Sopra', 'La Poste'])
    expect(groups[1]?.outOfTrade).toBe(true)
  })
})
