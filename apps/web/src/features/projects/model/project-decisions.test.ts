import { describe, expect, it } from 'vitest'
import { decisionChecklist } from './project-decisions'

const base = {
  hasBrief: false,
  hasTargetBudget: false,
  contacts: [] as { role: string; name: string }[],
}

describe('projects-fiche.N1/N2 — « Ce qui reste à décider »', () => {
  it('trois points, chacun avec son état — rien de déduit sans source', () => {
    const items = decisionChecklist(base)
    expect(items.map(i => i.key)).toEqual(['scope', 'budget', 'decider'])
    expect(items.every(i => i.state === 'open')).toBe(true)
  })

  it('un brief enregistré ferme le périmètre ; une cible existe mais ne vaut pas accord client', () => {
    const items = decisionChecklist({ ...base, hasBrief: true, hasTargetBudget: true })
    expect(items[0]).toMatchObject({ key: 'scope', state: 'done' })
    // Une cible n'est pas un accord : le budget reste à confirmer.
    expect(items[1]).toMatchObject({ key: 'budget', state: 'partial' })
  })

  it('un interlocuteur sans rôle décisionnel : son pouvoir de décision reste à qualifier', () => {
    const items = decisionChecklist({ ...base, contacts: [{ role: 'utilisateur', name: 'Nathalie Garnier' }] })
    expect(items[2]).toMatchObject({ key: 'decider', state: 'partial' })
  })

  it('un décideur relié ferme l’accès au décideur et le nomme', () => {
    const items = decisionChecklist({ ...base, contacts: [{ role: 'decideur', name: 'Marc Lefèvre' }] })
    expect(items[2]).toMatchObject({ key: 'decider', state: 'done', who: 'Marc Lefèvre' })
  })

  it('« Calculer la marge » n’est proposé que si l’économie est saisissable — jamais un taux inventé', () => {
    expect(decisionChecklist(base).find(i => i.key === 'budget')?.canComputeMargin).toBe(true)
  })
})
