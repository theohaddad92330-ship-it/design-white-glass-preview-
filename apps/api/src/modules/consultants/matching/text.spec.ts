import { overlaps, sameTerm } from './text'

// #4434 (épopée #4433) — le matching vivier/besoins lit le palier « famille » du référentiel partagé : une
// compétence de la même famille est ADJACENTE (signalée, jamais comptée), jamais « la même ».
describe('#4434 — adjacence par famille du référentiel partagé', () => {
  it('Angular présent, React demandé : adjacent, pas identique', () => {
    expect(sameTerm('Angular', 'React')).toBe(false)
    expect(overlaps('Angular', 'React')).toBe(true)
  })

  it('JavaScript présent, React demandé : adjacent', () => {
    expect(overlaps('JavaScript', 'React')).toBe(true)
  })

  it('dit NON hors famille : Java présent, React demandé ne recoupe pas', () => {
    expect(overlaps('Java', 'React')).toBe(false)
    expect(overlaps('SAP', 'React')).toBe(false)
  })

  it('le même mot reste identique, pas adjacent', () => {
    expect(overlaps('reactjs', 'React')).toBe(false)
  })
})
