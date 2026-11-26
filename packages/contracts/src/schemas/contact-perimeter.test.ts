import { describe, expect, it } from 'vitest'
import { contactPerimeterQuerySchema } from './contact-perimeter.js'

describe('contactPerimeterQuerySchema (#4996 L4)', () => {
  it('accepte mine, all et l’absence du paramètre', () => {
    expect(contactPerimeterQuerySchema.safeParse({ perimeter: 'mine' }).success).toBe(true)
    expect(contactPerimeterQuerySchema.safeParse({ perimeter: 'all' }).success).toBe(true)
    expect(contactPerimeterQuerySchema.safeParse({}).success).toBe(true)
  })

  it('refuse une valeur inconnue (la garde dit NON)', () => {
    expect(contactPerimeterQuerySchema.safeParse({ perimeter: 'zone' }).success).toBe(false)
  })
})
