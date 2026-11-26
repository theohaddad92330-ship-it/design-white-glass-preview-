import { cadencePreferredWeekdayReader } from './cadence-weekday-reader'

/**
 * #3289.29 — « préférences utilisateur » : le jour IMPOSÉ par l'espace prime sur le jour APPRIS ;
 * sans réglage, le jour appris ; sans rien, null (échéancier nominal exact).
 */
describe('cadencePreferredWeekdayReader', () => {
  const learned = (weekday: 'monday' | 'friday' | null) => ({
    forWorkspace: jest.fn(async () => ({
      channels: [{ channel: 'email', best: weekday ? { weekday } : null }],
    })),
  })
  const settings = (cadenceWeekday: string | null) => ({ effectiveFor: jest.fn(async () => ({ cadenceWeekday })) })

  it('le jour imposé prime, et le jour appris n’est même pas lu', async () => {
    const timing = learned('friday')
    const read = cadencePreferredWeekdayReader(settings('tuesday') as never, timing as never)
    expect(await read('w-1')).toBe('tuesday')
    expect(timing.forWorkspace).not.toHaveBeenCalled()
  })

  it('sans jour imposé : le jour appris', async () => {
    const read = cadencePreferredWeekdayReader(settings(null) as never, learned('monday') as never)
    expect(await read('w-1')).toBe('monday')
  })

  it('rien d’imposé, rien d’appris, ou aucun service : null — jamais un jour deviné', async () => {
    expect(await cadencePreferredWeekdayReader(settings(null) as never, learned(null) as never)('w-1')).toBeNull()
    expect(await cadencePreferredWeekdayReader(undefined, undefined)('w-1')).toBeNull()
  })

  it('une lecture du réglage en échec retombe sur le jour appris', async () => {
    const broken = { effectiveFor: jest.fn(async () => Promise.reject(new Error('db'))) }
    const read = cadencePreferredWeekdayReader(broken as never, learned('friday') as never)
    expect(await read('w-1')).toBe('friday')
  })
})
