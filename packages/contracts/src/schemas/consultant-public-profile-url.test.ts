import { describe, expect, it } from 'vitest'
import { consultantUpsertSchema } from './consultant.js'

/**
 * Bug vu en prod le 31/10/2026 (fiche talent « OCR IA Claude ») : le CV a écrit
 * `linkedin.com/in/…` SANS protocole ; l'enregistrement inline renvoie toute la
 * fiche, et `z.string().url()` la refusait — impossible de modifier le NOM.
 * #4833 n'avait fait qu'expliquer le refus ; la cause est ici.
 */
describe('consultantUpsertSchema.public_profile_url', () => {
  const parse = (public_profile_url: unknown) =>
    consultantUpsertSchema.safeParse({ full_name: 'Test', public_profile_url })

  it('une adresse sans protocole est acceptée et reçoit https://', () => {
    const r = parse('linkedin.com/in/louis-schlegel')
    expect(r.success).toBe(true)
    expect(r.success && r.data.public_profile_url).toBe('https://linkedin.com/in/louis-schlegel')
  })

  it('www. sans protocole aussi', () => {
    const r = parse('  www.linkedin.com/in/x  ')
    expect(r.success && r.data.public_profile_url).toBe('https://www.linkedin.com/in/x')
  })

  it('une adresse complète reste telle quelle', () => {
    const r = parse('http://linkedin.com/in/x')
    expect(r.success && r.data.public_profile_url).toBe('http://linkedin.com/in/x')
  })

  it('une chaîne vide vaut « absent »', () => {
    const r = parse('   ')
    expect(r.success).toBe(true)
    expect(r.success && r.data.public_profile_url).toBeNull()
  })

  it('sait dire NON : du texte qui n’est pas une adresse reste refusé', () => {
    expect(parse('pas une adresse').success).toBe(false)
    expect(parse('javascript:alert(1)').success).toBe(false)
  })
})
