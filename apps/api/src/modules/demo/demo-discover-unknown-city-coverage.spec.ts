import { demoDiscoverResponse } from './demo-scripts'

/**
 * #3876 — « les lieux inconnus restent inconnus », EN DÉMONSTRATION.
 *
 * Recette prod 09/10 : « carte sans ville non trouvée ; cartes avec ville affichent
 * PARIS · 75 » — le cas absent n'existait pas sous la main du recetteur. La salle
 * porte donc UNE carte dont le registre ne publie aucune commune : `city` et
 * `department` valent `null` (jamais une chaîne vide, jamais une ville devinée), et
 * `CandidateRow.tsx` n'y rend aucune puce « ville · département ».
 */
type Row = { name: string; city: string | null; department: string | null }
const rows = (query: Record<string, unknown> = {}): Row[] => demoDiscoverResponse(query).candidates as Row[]

describe('#3876 — une carte de /discover sans commune connue', () => {
  it('exactement une carte porte city ET department à null', () => {
    const unknown = rows().filter(row => row.city === null && row.department === null)
    expect(unknown.map(row => row.name)).toEqual(['Cévennes Défense Systèmes (démo)'])
  })

  it('aucune autre carte ne porte une chaîne vide à la place d’un lieu inconnu', () => {
    for (const row of rows()) {
      expect(row.city === null || row.city.trim().length > 0).toBe(true)
      expect(row.department === null || row.department.trim().length > 0).toBe(true)
    }
  })

  it('un filtre de département ne retient jamais la carte sans lieu : un lieu inconnu n’est dans aucun département', () => {
    expect(rows({ department: '59' }).map(row => row.name)).not.toContain('Cévennes Défense Systèmes (démo)')
    expect(rows().map(row => row.name)).toContain('Cévennes Défense Systèmes (démo)')
  })
})
