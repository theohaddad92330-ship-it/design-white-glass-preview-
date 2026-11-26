import { dataforgeAccountAccessSchema } from '@bellum/contracts'
import { DEMO_ANALYSED_ACCOUNTS } from './demo-dataset'
import { demoDataforgeAccessOf } from './demo-dataforge-access'

describe('Démo — Accès au compte · Base commune (lot 776)', () => {
  it('le compte Renault porte le bloc, conforme au contrat', () => {
    const renault = DEMO_ANALYSED_ACCOUNTS.find(account => account.company_name === 'Renault')!
    const seeded = (renault.raw_analysis as Record<string, unknown>)['dataforge_access']
    expect(dataforgeAccountAccessSchema.safeParse(seeded).success).toBe(true)
    expect(seeded).toEqual(demoDataforgeAccessOf('Renault'))
  })

  it('un autre compte n’en porte pas : une absence, jamais un bloc de zéros', () => {
    const others = DEMO_ANALYSED_ACCOUNTS.filter(account => account.company_name !== 'Renault')
    expect(others.length).toBeGreaterThan(0)
    for (const account of others) {
      expect((account.raw_analysis as Record<string, unknown>)['dataforge_access']).toBeUndefined()
    }
  })
})
