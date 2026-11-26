import { describe, expect, it } from 'vitest'
import { readSkillSearch, skillSearchLabel } from './discover-skill-evidence.js'

// #4419.1 — le contrat skillSearch partagé IA → web : chaque étape de la recherche par compétence est comptée.
const hdf = {
  skills: ['Java', 'Vue'],
  offersBySource: { france_travail: 11, adzuna: 4, cache: 0 },
  calls: { france_travail: 10, adzuna: 2, cache: 2 },
  harvestCached: false,
  sourcesCut: 0,
  offersSeen: 10,
  offersRejected: { anonymous: 1, tooOld: 1, internship: 1, skillAbsent: 1, outsideTrade: 0, outsideZone: 1 },
  employerGroups: 9,
  beyondCap: 0,
  resolutionFailures: { homonym: 1, registrySilent: 0, publicAdministration: 1, unavailable: 0 },
  unresolvedEmployers: 2,
  notAttempted: 1,
  outsideZone: 1,
  employersFound: 5,
  intermediaries: 2,
  accountsFound: 3,
  outsideHeadcount: 0,
  deadlineCut: true,
  emptyCause: null,
}

describe('#4419.1 — query.skillSearch', () => {
  it('lit les compteurs par étape posés par le service IA', () => {
    const search = readSkillSearch({ skillSearch: hdf })
    expect(search?.notAttempted).toBe(1)
    expect(search?.resolutionFailures?.homonym).toBe(1)
    expect(search?.offersRejected?.outsideZone).toBe(1)
    expect(search?.deadlineCut).toBe(true)
  })

  it('lit le compteur PAR SOURCE (reçues, retenues, rejets, payés, cache, non tentés)', () => {
    const sources = {
      theirstack: { received: 3, kept: 2, rejected: { skillAbsent: 1 }, paid: 1, cached: 0, notAttempted: 0 },
      adzuna: { received: 0, kept: 0, rejected: {}, paid: 0, cached: 0, notAttempted: 0, pagesFailed: 3 },
    }
    const search = readSkillSearch({ skillSearch: { ...hdf, sources } })
    expect(search?.sources?.theirstack?.paid).toBe(1)
    expect(search?.sources?.adzuna?.pagesFailed).toBe(3)
  })

  it("lit encore une réponse d'avant #4419 (compteurs neufs absents)", () => {
    const legacy = { skills: ['SAP'], offersSeen: 3, employersFound: 1, unresolvedEmployers: 0, intermediaries: 0 }
    const search = readSkillSearch({ skillSearch: legacy })
    expect(search?.skills).toEqual(['SAP'])
    expect(search?.notAttempted).toBeUndefined()
  })

  it('#4419.8 — lit `more` : une liste courte que la recherche n’a pas finie de lire', () => {
    expect(readSkillSearch({ skillSearch: { ...hdf, more: true } })?.more).toBe(true)
    expect(readSkillSearch({ skillSearch: hdf })?.more).toBeUndefined()
  })

  it('#4420 — lit la matrice de couverture (causes, filtré, filtres silencieux)', () => {
    const coverage = {
      causes: { noKey: 2, quota: 1, http4xx: 0, cache: 1 },
      bySource: { adzuna: { noKey: 1 } },
      filtered: { outsideTrade: 4, outsideZone: 2 },
      silentFilters: ['france_travail'],
    }
    const search = readSkillSearch({ skillSearch: { ...hdf, coverage } })
    expect(search?.coverage?.causes.noKey).toBe(2)
    expect(search?.coverage?.silentFilters).toEqual(['france_travail'])
    expect(readSkillSearch({ skillSearch: hdf })?.coverage).toBeUndefined()
  })

  it('sait dire NON : hors recherche par compétence, ou un payload illisible, rien', () => {
    expect(readSkillSearch({})).toBeNull()
    expect(readSkillSearch(undefined)).toBeNull()
    expect(readSkillSearch({ skillSearch: { skills: [] } })).toBeNull()
    expect(readSkillSearch({ skillSearch: { ...hdf, notAttempted: -1 } })).toBeNull()
  })

  it('nomme plusieurs compétences avec une virgule ET une espace (« Java, Vue », jamais « Java,Vue »)', () => {
    expect(skillSearchLabel(['Java', 'Vue'])).toBe('Java, Vue')
    expect(skillSearchLabel(['Java,Vue'])).toBe('Java, Vue')
    expect(skillSearchLabel([' SAP '])).toBe('SAP')
  })
})
