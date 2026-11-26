import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ZodTypeAny } from 'zod'

/**
 * Toutes les portes d'authentification normalisent l'e-mail de la même façon.
 *
 * Le 14/08/2026, une bêta-testeuse a rapporté que « me connecter fonctionne
 * rarement ». La cause était un e-mail arrivant avec l'espace que pose un
 * remplissage automatique, ou la majuscule que pose un clavier mobile : sans
 * `.trim().toLowerCase()`, `.email()` refuse une adresse qui est pourtant la
 * bonne. Le correctif a été posé AU CONTRAT (`authEmail()` dans
 * `@bellum/contracts`), donc à un seul endroit — sauf pour la porte dont le DTO
 * avait recopié son schéma à la main, qui n'en a jamais rien su.
 *
 * Cette garde regarde le SCHÉMA RÉELLEMENT MONTÉ sur chaque DTO, pas le texte
 * du fichier : c'est le schéma qui valide la requête, et c'est lui qui doit
 * dire oui à « ␣Laura@Skaizen.FR␣ ». Un DTO qui recopie `z.string().email()`
 * échoue ici même si son fichier a l'air correct.
 */

const DTO_DIR = __dirname

/** Un DTO nestjs-zod, réduit à ce que la garde lit. */
type LoadedDto = { readonly file: string; readonly schema: { readonly shape?: Record<string, ZodTypeAny> } }

function loadDtos(): LoadedDto[] {
  const files = readdirSync(DTO_DIR).filter(name => name.endsWith('.dto.ts'))
  const loaded: LoadedDto[] = []
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(join(DTO_DIR, file)) as Record<string, unknown>
    for (const exported of Object.values(mod)) {
      const candidate = exported as { isZodDto?: boolean; schema?: { shape?: Record<string, ZodTypeAny> } }
      if (candidate?.isZodDto === true && candidate.schema) {
        loaded.push({ file, schema: candidate.schema })
      }
    }
  }
  return loaded
}

describe('les DTO d’authentification et l’e-mail', () => {
  const dtos = loadDtos()
  const withEmail = dtos.filter(dto => dto.schema.shape?.['email'] !== undefined)

  it('lit un corpus non vide — sinon elle ne garderait rien', () => {
    // Sans ces deux bornes, un chemin faux ou un renommage rendrait la garde
    // verte en ne regardant aucun fichier : c'est le défaut de garde le plus
    // fréquent du dépôt.
    expect(dtos.length).toBeGreaterThanOrEqual(10)
    expect(withEmail.length).toBeGreaterThanOrEqual(4)
  })

  it.each(loadDtos().filter(dto => dto.schema.shape?.['email'] !== undefined))(
    '$file accepte l’adresse telle qu’un navigateur la remplit',
    ({ schema }) => {
      const email = schema.shape?.['email']
      expect(email).toBeDefined()
      // L'espace vient d'un remplissage automatique ou d'un copier-coller depuis
      // un client de messagerie ; la majuscule, du clavier mobile.
      expect(email?.parse('  Laura@Skaizen.FR ')).toBe('laura@skaizen.fr')
    },
  )

  it('n’a aucun schéma d’authentification recopié à la main', () => {
    // Loi 1 du tome 7 (GA-26) : un réglage vit à un seul endroit. Un DTO qui
    // redéclare son `z.object` rate en silence la prochaine correction posée au
    // contrat — c'est exactement ce qui est arrivé à `/auth/request-otp`.
    const files = readdirSync(DTO_DIR).filter(name => name.endsWith('.dto.ts'))
    expect(files.length).toBeGreaterThanOrEqual(10)
    const homegrown = files.filter(name => {
      const source = readFileSync(join(DTO_DIR, name), 'utf8')
      return !source.includes("from '@bellum/contracts'")
    })
    expect(homegrown).toEqual([])
  })
})
