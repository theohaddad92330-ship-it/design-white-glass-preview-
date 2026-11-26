import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IMPORT_CONTENT_MAX_CHARS, importApplySchema, importDryRunSchema } from '@bellum/contracts'

/**
 * Le fichier d'import doit POUVOIR ARRIVER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TEST GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 14/08/2026, une bêta-testeuse n'a réussi à importer qu'un seul compte. La
 * moitié de la cause a été corrigée le jour même — `/rfp` et l'import CSV de
 * contacts ont reçu leur exemption de limite de corps. L'assistant d'import
 * générique, lui, ne l'a jamais reçue : son schéma acceptait vingt millions de
 * caractères derrière un transport à 1 Mo. Le refus tombait donc AVANT le
 * pipeline Nest, en 413 sans corps JSON — un échec que l'écran ne peut pas
 * expliquer parce qu'il ne reçoit rien à lire.
 *
 * Deux bornes doivent rester d'accord, et rien ne les tenait ensemble :
 *  - le montage express dans `main.ts`, qui décide ce qui ARRIVE ;
 *  - le plafond du contrat, qui décide ce qui est ACCEPTÉ.
 * Une borne applicative au-dessus de la borne de transport ne protège personne :
 * elle décrit un refus que le serveur n'atteint jamais.
 */

const MAIN_TS = join(__dirname, '..', '..', 'main.ts')

function readMain(): string {
  return readFileSync(MAIN_TS, 'utf8')
}

/** `'12mb'` → 12 582 912. Les seules unités utilisées par `main.ts`. */
function toBytes(limit: string): number {
  const match = /^(\d+)(kb|mb)$/i.exec(limit)
  if (!match) throw new Error(`Limite illisible : ${limit}`)
  const scale = match[2]?.toLowerCase() === 'mb' ? 1024 * 1024 : 1024
  return Number(match[1]) * scale
}

describe('la limite de corps de l’assistant d’import', () => {
  it('lit bien `main.ts` — sinon elle ne garderait rien', () => {
    // Un chemin faux rendrait cette garde verte en ne regardant aucune ligne.
    const source = readMain()
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('express.json')
    expect(source).toContain("app.use(express.json({ limit: '1mb' }))")
  })

  it('monte `/import` au-dessus du plafond que le contrat accepte', () => {
    const source = readMain()
    const mount = /app\.use\('\/import',\s*express\.json\(\{\s*limit:\s*'([^']+)'/.exec(source)
    expect(mount).not.toBeNull()
    const limit = mount?.[1]
    expect(limit).toBeDefined()
    // Un cran au-dessus : l'échappement JSON d'un CSV (guillemets, sauts de
    // ligne) pèse plus que le texte brut qu'il transporte.
    expect(toBytes(limit as string)).toBeGreaterThan(IMPORT_CONTENT_MAX_CHARS)
  })

  it('monte l’exemption AVANT le parseur global — sinon elle ne sert à rien', () => {
    // Le premier `json()` qui correspond au chemin parse ; le second voit un
    // corps déjà lu et ne fait rien. Monté après, le plafond de 1 Mo gagne et
    // l'exemption devient décorative.
    const source = readMain()
    const specific = source.indexOf("app.use('/import',")
    const global = source.indexOf("app.use(express.json({ limit: '1mb' }))")
    expect(specific).toBeGreaterThan(-1)
    expect(global).toBeGreaterThan(-1)
    expect(specific).toBeLessThan(global)
  })
})

describe('le plafond de contenu, des deux côtés de l’import', () => {
  const atCeiling = 'a'.repeat(IMPORT_CONTENT_MAX_CHARS)

  it('accepte un fichier à la borne exacte', () => {
    expect(importDryRunSchema.safeParse({ content: atCeiling }).success).toBe(true)
  })

  it('refuse au-delà, et DIT le poids maximal', () => {
    const result = importDryRunSchema.safeParse({ content: `${atCeiling}a` })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('8 Mo')
    }
  })

  it('borne aussi l’écriture — sinon la simulation se contourne par l’étape suivante', () => {
    expect(importApplySchema.safeParse({ content: `${atCeiling}a` }).success).toBe(false)
    expect(importApplySchema.safeParse({ available: ['account'] }).success).toBe(true)
  })

  it('refuse un `available` qui n’est pas un objet d’import connu', () => {
    // Le corps de `apply` n'était pas validé du tout : il était TYPÉ, ce qui ne
    // borne rien à l'exécution.
    expect(importApplySchema.safeParse({ available: ['comptes'] }).success).toBe(false)
  })
})
