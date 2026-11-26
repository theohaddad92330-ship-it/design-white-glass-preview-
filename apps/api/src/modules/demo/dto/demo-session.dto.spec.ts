import { demoSessionSchema } from './demo-session.dto'

describe('demoSessionSchema — #4291 J la variante de démo', () => {
  it('accepte les deux profils d’espace livrés, et l’absence (la démo d’avant)', () => {
    expect(demoSessionSchema.parse({ profile: 'forfait_conseil' }).profile).toBe('forfait_conseil')
    expect(demoSessionSchema.parse({ profile: 'staffing' }).profile).toBe('staffing')
    expect(demoSessionSchema.parse({}).profile).toBeUndefined()
  })

  it('refuse une variante inconnue avant tout bail', () => {
    expect(demoSessionSchema.safeParse({ profile: 'regie' }).success).toBe(false)
  })
})
