import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT, DEMO_LONG_LAURA_THREAD } from './demo-dataset'

/**
 * #3192 (recette prod 02/10) — « aucun fil de 10+ tours » : le contrôle de
 * densité de réponse ne se voit que sur un fil chargé. La salle sème un fil de
 * onze tours sur le compte phare, dont la dernière question est une relance
 * MICRO (« Et X… ? ») qui reçoit DEUX phrases, après des réponses nettement plus
 * longues. Sait dire NON : un fil trop court, ou une réponse MICRO bavarde,
 * fait rougir la garde.
 */
const sentences = (text: string): number => text.split(/(?<=[.!?])\s+/).filter(part => part.trim().length > 0).length

describe('#3192 — un fil Laura de 10+ tours en démo', () => {
  const { turns } = DEMO_LONG_LAURA_THREAD

  it('porte au moins dix tours (question + réponse)', () => {
    expect(turns.length).toBeGreaterThanOrEqual(10)
  })

  it('est tenu sur le compte phare de la salle', () => {
    expect(DEMO_LONG_LAURA_THREAD.accountName).toBe(DEMO_DELIVERY_CLIENT.account.company_name)
  })

  it('la relance MICRO finale tient en deux phrases, sans « Verdict » ni « Pourquoi »', () => {
    const last = turns[turns.length - 1]
    expect(last?.question).toMatch(/^Et .+\?$/)
    expect(sentences(last?.answer ?? '')).toBeLessThanOrEqual(2)
    expect(last?.answer).not.toMatch(/Verdict|Pourquoi/)
  })

  it('les premiers tours sont, eux, développés — la densité se VOIT', () => {
    const longest = Math.max(...turns.slice(0, -1).map(turn => sentences(turn.answer)))
    expect(longest).toBeGreaterThanOrEqual(4)
  })

  it('est réellement écrit par le semis (jamais une constante que personne n’appelle)', () => {
    const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
    expect(seed).toContain('DEMO_LONG_LAURA_THREAD')
  })
})
