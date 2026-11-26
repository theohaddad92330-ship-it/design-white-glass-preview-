import { accountAnalysisSchema, groupSignalReformulations, mergeSignalLineCandidates } from '@bellum/contracts'
import { DEMO_ANALYSED_ACCOUNTS } from './demo-dataset'
import { analysisCandidates } from '../accounts/account-signal-lines.sources'
import { demoHistoricalNeedsOf } from './demo-historical-needs'

// #4760 (craft rule n°9) — la démo NOMME des besoins historiques : un écran livré mais vide se découvre en réunion.
describe('#4760 — la démo sème raw_analysis.historical_needs', () => {
  const seeded = DEMO_ANALYSED_ACCOUNTS.filter(a => (a.raw_analysis ?? {})['historical_needs'] !== undefined)

  it('au moins un compte analysé porte le bloc, conforme au contrat', () => {
    expect(seeded.length).toBeGreaterThan(0)
    for (const account of seeded) {
      expect(
        accountAnalysisSchema.safeParse({ historical_needs: account.raw_analysis?.['historical_needs'] }).success,
      ).toBe(true)
    }
  })

  it('le total est le nombre de lignes, et au moins un besoin porte une date réelle de plus de 180 jours', () => {
    for (const account of seeded) {
      const block = account.raw_analysis?.['historical_needs'] as { total: number; items: { date: string | null }[] }
      expect(block.total).toBe(block.items.length)
      const old = block.items.some(i => i.date !== null && Date.parse(i.date) < Date.parse('2026-04-01'))
      expect(old).toBe(true)
    }
  })

  it('un compte sans historique n’en porte pas la clé (une absence ne fait aucune ligne)', () => {
    const without = DEMO_ANALYSED_ACCOUNTS.filter(a => !seeded.includes(a))
    for (const account of without) expect(account.raw_analysis).not.toHaveProperty('historical_needs')
  })
})

describe('lot 771 — la démo sème une offre avec « Voir l’offre » et ses compétences', () => {
  it('le besoin démo de Renault remonte en ligne recrutement avec lien, compétences et TJM', () => {
    const block = demoHistoricalNeedsOf('Renault')
    const [offer] = analysisCandidates({ historical_needs: block }, []).filter(c => c.url)
    expect(offer).toMatchObject({ type: 'recrutement', technologies: ['AWS', 'Terraform', 'Kubernetes'], tjmEur: 650 })
    expect(offer!.url).toMatch(/^https:\/\//)
  })
})

describe('lot 773 — l’Historique de démo se lit d’un coup d’œil', () => {
  it('Renault porte au moins 6 besoins passés dont UN groupe ×2 (même fait, deux phrases), sans refonte du reste', () => {
    const candidates = analysisCandidates({ historical_needs: demoHistoricalNeedsOf('Renault') }, [])
    const lines = mergeSignalLineCandidates(candidates, new Date('2026-11-02T10:00:00Z'), { companyName: 'Renault' })
    const past = lines.filter(line => line.period === 'past')
    expect(past.length).toBeGreaterThanOrEqual(6)
    const groups = groupSignalReformulations(past, { companyName: 'Renault' })
    expect(groups.filter(group => group.members.length === 2)).toHaveLength(1)
    expect(groups.every(group => group.members.length <= 2)).toBe(true)
    expect(groups.length).toBe(past.length - 1)
  })
})

describe('lot 775 — la démo montre 3 missions observées fictives, sans identité', () => {
  const candidates = analysisCandidates({ historical_needs: demoHistoricalNeedsOf('Renault') }, [])
  const missions = candidates.filter(candidate => candidate.type === 'mission_observee')

  it('Renault porte 3 missions observées, source Mémoire marché, avec compétences et un TJM', () => {
    expect(missions).toHaveLength(3)
    expect(missions.every(mission => mission.origin === 'memoire')).toBe(true)
    expect(missions.some(mission => (mission.technologies ?? []).length > 0 && (mission.tjmEur ?? 0) > 0)).toBe(true)
  })

  it('aucune ne nomme une personne', () => {
    for (const mission of missions) expect(mission.names ?? []).toEqual([])
    const block = JSON.stringify(demoHistoricalNeedsOf('Renault')?.items.filter(item => item.source === 'market_path'))
    expect(block).not.toMatch(/@|linkedin|\+33|https?:/i)
  })

  it('le bloc reste conforme au contrat et son total est le nombre de lignes', () => {
    const block = demoHistoricalNeedsOf('Renault')!
    expect(accountAnalysisSchema.safeParse({ historical_needs: block }).success).toBe(true)
    expect(block.total).toBe(block.items.length)
  })
})
