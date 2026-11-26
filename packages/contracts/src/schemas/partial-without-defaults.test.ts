import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { partialWithoutDefaults } from './partial-without-defaults.js'

/**
 * zod 4 — LE PIÈGE QUE CE HELPER DÉSAMORCE.
 *
 * En zod 3, `.partial()` retirait le `.default()` avec le reste : un PATCH qui
 * n'envoyait pas un champ rendait un objet SANS ce champ. En zod 4 le défaut
 * SURVIT : le champ revient rempli, le service fusionne, et la valeur écrite
 * par un humain est remplacée par le défaut — sans erreur, sans trace.
 */
describe('partialWithoutDefaults — un PATCH ne réécrit jamais un champ à son défaut', () => {
  const base = z.object({
    name: z.string().min(1),
    terms: z.array(z.string()).default([]),
    scope: z.enum(['private', 'shared']).default('private'),
  })

  it('une clé absente reste ABSENTE, même quand le champ a un défaut', () => {
    expect(partialWithoutDefaults(base).parse({ name: 'Bellum' })).toEqual({ name: 'Bellum' })
  })

  it('le `.partial()` nu, lui, REMPLIT — c’est la régression qu’on garde sous les yeux', () => {
    expect(base.partial().parse({ name: 'Bellum' })).toEqual({ name: 'Bellum', terms: [], scope: 'private' })
  })

  it('une clé envoyée garde sa valeur et sa validation', () => {
    const schema = partialWithoutDefaults(base)
    expect(schema.parse({ terms: ['java'] })).toEqual({ terms: ['java'] })
    expect(schema.safeParse({ terms: 'java' }).success).toBe(false)
    expect(schema.safeParse({ scope: 'inventé' }).success).toBe(false)
  })

  it('sait dire NON : `.strict()` est conservé, une clé inconnue est toujours refusée', () => {
    const strict = partialWithoutDefaults(base.strict())
    expect(strict.safeParse({ name: 'Bellum', inconnue: 1 }).success).toBe(false)
    expect(partialWithoutDefaults(base).safeParse({ name: 'Bellum', inconnue: 1 }).success).toBe(true)
  })

  it('conserve le `.catch()` posé SOUS le défaut — une valeur abîmée se rattrape encore', () => {
    const avecCatch = z.object({ terms: z.array(z.string()).catch([]).default([]) })
    expect(partialWithoutDefaults(avecCatch).parse({ terms: 42 })).toEqual({ terms: [] })
    expect(partialWithoutDefaults(avecCatch).parse({})).toEqual({})
  })

  it('un objet sans aucun défaut passe inchangé', () => {
    const sansDefaut = z.object({ a: z.string(), b: z.number() })
    expect(partialWithoutDefaults(sansDefaut).parse({ a: 'x' })).toEqual({ a: 'x' })
  })
})
