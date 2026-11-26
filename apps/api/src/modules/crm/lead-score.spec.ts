import { rankLeads, scoreEngagement, type EngagementSignals } from './lead-score'

const NONE: EngagementSignals = {
  daysSinceLastActivity: null,
  notes: null,
  contacted: null,
  emailOpens: null,
  emailClicks: null,
  associatedDeals: null,
}

describe('scoreEngagement', () => {
  it('rend null — pas zéro — quand aucun signal n’est lisible', () => {
    // « Zéro » se lit « ce lead est froid ». La vérité est « on ne sait rien ».
    const result = scoreEngagement(NONE)
    expect(result.score).toBeNull()
    expect(result.band).toBe('unknown')
    expect(result.signalsUsed).toBe(0)
  })

  it('un signal manquant sort du score ET du maximum', () => {
    // Portail sans e-mail marketing : les ouvertures ne sont pas renseignées.
    // Le contact ne doit pas être puni pour une fonction que son ESN n’utilise pas.
    const withOpens = scoreEngagement({ ...NONE, daysSinceLastActivity: 0, emailOpens: 0 })
    const withoutOpens = scoreEngagement({ ...NONE, daysSinceLastActivity: 0 })
    expect(withoutOpens.score).toBe(100)
    expect(withOpens.score).toBeLessThan(100)
    expect(withoutOpens.signalsUsed).toBe(1)
    expect(withOpens.signalsUsed).toBe(2)
  })

  it('la récence décroît sur trente jours et s’arrête là', () => {
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 0 }).score).toBe(100)
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 15 }).score).toBe(50)
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 30 }).score).toBe(0)
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 400 }).score).toBe(0)
  })

  it('sature les compteurs — deux cents notes ne valent pas dix fois vingt', () => {
    const twenty = scoreEngagement({ ...NONE, notes: 20 })
    const twoHundred = scoreEngagement({ ...NONE, notes: 200 })
    expect(twenty.score).toBe(twoHundred.score)
    expect(twenty.score).toBe(100)
  })

  it('classe en chaud / tiède / froid selon le score', () => {
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 0 }).band).toBe('hot')
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 15 }).band).toBe('warm')
    expect(scoreEngagement({ ...NONE, daysSinceLastActivity: 25 }).band).toBe('cold')
  })

  it('explique chaque composante retenue', () => {
    const result = scoreEngagement({ ...NONE, daysSinceLastActivity: 0, associatedDeals: 2 })
    expect(result.components.map(c => c.key).sort()).toEqual(['deals', 'recency'])
    expect(result.components.every(c => c.points <= c.max)).toBe(true)
  })

  it('est stable — deux appels sur la même entrée rendent le même score', () => {
    const signals: EngagementSignals = {
      daysSinceLastActivity: 7,
      notes: 3,
      contacted: 2,
      emailOpens: 4,
      emailClicks: 1,
      associatedDeals: 1,
    }
    expect(scoreEngagement(signals)).toEqual(scoreEngagement(signals))
  })
})

describe('rankLeads', () => {
  const contact = (id: string, signals: EngagementSignals) => ({
    id,
    name: id,
    email: `${id}@example.test`,
    company: 'ACME',
    signals,
  })

  it('classe du plus chaud au plus froid', () => {
    const ranked = rankLeads(
      [
        contact('froid', { ...NONE, daysSinceLastActivity: 28 }),
        contact('chaud', { ...NONE, daysSinceLastActivity: 1 }),
        contact('tiede', { ...NONE, daysSinceLastActivity: 15 }),
      ],
      10,
    )
    expect(ranked.map(l => l.id)).toEqual(['chaud', 'tiede', 'froid'])
  })

  it('renvoie les non mesurables en fin de liste plutôt que de les masquer', () => {
    const ranked = rankLeads([contact('inconnu', NONE), contact('chaud', { ...NONE, daysSinceLastActivity: 0 })], 10)
    expect(ranked.map(l => l.id)).toEqual(['chaud', 'inconnu'])
    expect(ranked[1]?.score).toBeNull()
  })

  it('respecte la borne demandée', () => {
    const many = Array.from({ length: 30 }, (_, i) => contact(`c${i}`, { ...NONE, daysSinceLastActivity: i }))
    expect(rankLeads(many, 5)).toHaveLength(5)
  })
})
