import { discoverBaseCriteria } from './base-matches-source'

/**
 * #4792 — les critères de Découvrir traduits pour le lecteur commun.
 *
 * ⚠️ Prouvé par DEUX valeurs ET un cas vide pour chaque champ : un critère qui ne voyage pas ferait
 * protéger les comptes les plus récents de l'espace au lieu de ceux que la recherche vise.
 */
describe('#4792 — Découvrir → le lecteur commun', () => {
  it('le métier vient des mots-clés ET des technologies observées, dédoublonnés', () => {
    const criteria = discoverBaseCriteria({ keywords: ['Java', 'Vue'], technologiesObserved: ['Java', 'SAP'] }, 100)
    expect(criteria.terms).toEqual(['Java', 'Vue', 'SAP'])
  })

  it('le LIEU voyage sous ses deux formes — au singulier et au pluriel', () => {
    const criteria = discoverBaseCriteria(
      { city: 'Lille', department: '59', departments: ['62'], region: 'Hauts-de-France', regions: ['Occitanie'] },
      100,
    )
    expect(criteria.city).toBe('Lille')
    expect(criteria.departments).toEqual(['62', '59'])
    expect(criteria.regions).toEqual(['Occitanie', 'Hauts-de-France'])
  })

  it('#4793.2 — un code RÉGION (« 32 ») devient ses départements, jamais le département « 32 » (Gers)', () => {
    const criteria = discoverBaseCriteria({ region: '32', regions: ['11'] }, 100)
    expect(criteria.regions).toEqual([])
    expect(criteria.departments).toEqual(['75', '77', '78', '91', '92', '93', '94', '95', '02', '59', '60', '62', '80'])
    expect(criteria.departments).not.toContain('32')
    // Témoin : un libellé reste un libellé, un code inconnu n'est pas deviné (il est gardé tel quel).
    expect(discoverBaseCriteria({ region: 'Occitanie' }, 100).regions).toEqual(['Occitanie'])
  })

  it('#4793.2 — les critères sont NON vides pour « développeur Java dans les Hauts-de-France » lu par le rail', () => {
    const criteria = discoverBaseCriteria({ keywords: ['Java'], region: '32' }, 100)
    expect(criteria.terms).toEqual(['Java'])
    expect(criteria.departments).toEqual(['02', '59', '60', '62', '80'])
    const lyon = discoverBaseCriteria({ keywords: ['développeur'], city: 'Lyon' }, 100)
    expect(lyon.terms).toEqual(['développeur'])
    expect(lyon.city).toBe('Lyon')
  })

  it('aucun critère ⇒ aucun critère : rien n’est deviné, et aucune famille de plus n’est lue', () => {
    const criteria = discoverBaseCriteria(undefined, 100)
    expect(criteria.terms).toEqual([])
    expect(criteria.city).toBeNull()
    expect(criteria.departments).toEqual([])
    expect(criteria.regions).toEqual([])
    expect(criteria.families).toEqual(['accounts'])
  })

  it('la PHRASE libre n’entre pas : Découvrir la lit lui-même et en tire des filtres', () => {
    const criteria = discoverBaseCriteria(
      { keywords: [], city: 'Lille' } as Parameters<typeof discoverBaseCriteria>[0],
      100,
    )
    expect(criteria.terms).toEqual([])
  })

  it('aucune fenêtre de temps n’est posée — c’est le défaut mesuré de Découvrir que le lot répare', () => {
    const criteria = discoverBaseCriteria({ city: 'Lille' }, 100)
    expect(criteria.from).toBeNull()
    expect(criteria.to).toBeNull()
  })

  it('la borne demandée voyage, et la lecture part du début', () => {
    const criteria = discoverBaseCriteria({ city: 'Lille' }, 96)
    expect(criteria.limit).toBe(96)
    expect(criteria.offset).toBe(0)
  })

  it('un lieu vide ou blanc ne fait aucun critère', () => {
    const criteria = discoverBaseCriteria({ city: '   ', departments: ['', ' '], regions: [] }, 100)
    expect(criteria.city).toBeNull()
    expect(criteria.departments).toEqual([])
  })
  it('lot R (#4519) — une expertise du référentiel part en MÉTIERS, jamais en libellé ; une compétence reste telle que tapée', () => {
    const criteria = discoverBaseCriteria({ keywords: ['Data & IA', 'Java'] }, 50)
    expect(criteria.terms).toEqual(
      expect.arrayContaining(['data engineer', 'data scientist', 'machine learning', 'Java']),
    )
    expect(criteria.terms).not.toContain('Data & IA')
    // Une expertise inconnue n'est pas traduite : jamais devinée.
    expect(discoverBaseCriteria({ keywords: ['Expertise Inventée'] }, 50).terms).toEqual(['Expertise Inventée'])
  })
})
