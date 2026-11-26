import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PORTABLE_OBJECTS, TABLE_SCOPES, portableTables, withheldFromExport } from '@bellum/contracts'
import { tableInventory } from '../modules/privacy/table-inventory'

/**
 * GA-245 — « CE QUE VOUS N'EMPORTEZ PAS » EST DÉRIVÉ, JAMAIS RÉDIGÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * PDF 7 §9.2, ticket `BEL-INT-608` PR1 : « La section "CE QUE VOUS N'EMPORTEZ
 * PAS" est OBLIGATOIRE, avec sa raison en une ligne. »
 *
 * Le danger n'est pas qu'elle manque — on la remarquerait. C'est qu'elle
 * PÉRIME : trois puces écrites une fois, un objet ajouté six semaines plus
 * tard, et la page continue de promettre l'exhaustivité. Rien ne casse, rien ne
 * rougit, et c'est la page qu'on montre à un dirigeant pour qu'il nous confie
 * son CRM.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. CHAQUE table du registre de portée est classée exactement une fois :
 *     emportée, ou retenue dans un groupe qui dit pourquoi ;
 *  2. aucune table PARTAGÉE n'est déclarée exportable — le référentiel mutualisé
 *     n'est à personne, l'emporter serait le vendre ;
 *  3. chaque objet exportable existe VRAIMENT dans ce que le service construit,
 *     lu dans son code — sans quoi l'écran promettrait un fichier vide ;
 *  4. le compteur de chaque objet existe, sinon l'écran afficherait « non
 *     mesuré » pour un objet parfaitement mesurable ;
 *  5. les raisons sont traduites, FR et EN.
 *
 * ⚠️ Ce qu'elle NE vérifie pas : que la raison soit juste. Une garde protège une
 * règle, elle ne l'invente pas — la justesse d'une phrase se relit, elle ne se
 * teste pas.
 */

const SERVICE = join(__dirname, '..', 'modules', 'privacy', 'privacy-export.service.ts')
const PORTABILITY = join(__dirname, '..', 'modules', 'privacy', 'privacy-portability.service.ts')
const WEB_LOCALES = join(__dirname, '..', '..', '..', 'web', 'src', 'i18n', 'locales')

/** Le fichier sans ses commentaires, positions préservées — un commentaire qui
 *  CITE une clé ne doit pas passer pour une clé rendue. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
}

/** Les clés du `return { … }` final de `buildExport` — ce que l'API rend VRAIMENT. */
function exportPayloadKeys(): string[] {
  const code = codeOnly(readFileSync(SERVICE, 'utf8'))
  const block = code.slice(code.lastIndexOf('return {'))
  return [...block.matchAll(/(^|\n)\s{6}([A-Za-z][A-Za-z0-9_]*)\s*[,:]/g)].map(match => match[2] as string)
}

/** Les clés du dictionnaire de compteurs du service de portabilité. */
function counterKeys(): string[] {
  const code = codeOnly(readFileSync(PORTABILITY, 'utf8'))
  const start = code.indexOf('const own = { user_id: userId }')
  const block = code.slice(start, code.indexOf('\n  }', start))
  return [...block.matchAll(/(^|\n)\s+([A-Za-z][A-Za-z0-9_]*)\s*:\s*\(\)\s*=>/g)].map(match => match[2] as string)
}

function catalogue(lang: 'fr' | 'en'): Record<string, unknown> {
  return JSON.parse(readFileSync(join(WEB_LOCALES, lang, 'myData.json'), 'utf8')) as Record<string, unknown>
}

function at(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], source)
}

describe('GA-245 — la section « ce que vous n’emportez pas » est dérivée', () => {
  it('la garde LIT quelque chose — un corpus vide la rendrait verte pour toujours', () => {
    expect(Object.keys(TABLE_SCOPES).length).toBeGreaterThan(20)
    // L'inventaire COMPLET — c'est LUI que l'écran classe, pas les seules
    // exceptions du registre écrit.
    expect(Object.keys(tableInventory()).length).toBeGreaterThan(100)
    expect(PORTABLE_OBJECTS.length).toBeGreaterThan(0)
    expect(exportPayloadKeys().length).toBeGreaterThan(5)
    expect(counterKeys().length).toBeGreaterThan(5)
    expect(withheldFromExport(tableInventory()).length).toBeGreaterThan(0)
  })

  it('chaque table de l’inventaire est classée exactement une fois', () => {
    const inventory = tableInventory()
    const seen = new Map<string, number>()
    for (const table of portableTables()) seen.set(table, (seen.get(table) ?? 0) + 1)
    for (const group of withheldFromExport(inventory)) {
      for (const table of group.tables) seen.set(table, (seen.get(table) ?? 0) + 1)
    }
    const unclassified = Object.keys(inventory).filter(table => !seen.has(table))
    const twice = [...seen].filter(([, count]) => count > 1).map(([table]) => table)
    expect(unclassified).toEqual([])
    expect(twice).toEqual([])
  })

  it('aucune table PARTAGÉE n’est déclarée exportable', () => {
    const shared = new Set(
      Object.entries(tableInventory())
        .filter(([, scope]) => scope.category === 'shared')
        .map(([table]) => table),
    )
    expect(shared.size).toBeGreaterThan(0)
    expect(portableTables().filter(table => shared.has(table))).toEqual([])
  })

  it('chaque objet exportable est produit par le service d’export', () => {
    const produced = new Set(exportPayloadKeys())
    const promised = PORTABLE_OBJECTS.map(object => object.payloadKey)
    expect(promised.filter(key => !produced.has(key))).toEqual([])
  })

  it('chaque objet exportable sait se compter — sinon l’écran dirait « non mesuré » à tort', () => {
    const counters = new Set(counterKeys())
    expect(PORTABLE_OBJECTS.map(object => object.payloadKey).filter(key => !counters.has(key))).toEqual([])
  })

  it('chaque raison et chaque libellé est traduit, FR et EN', () => {
    const missing: string[] = []
    for (const lang of ['fr', 'en'] as const) {
      const words = catalogue(lang)
      for (const object of PORTABLE_OBJECTS) {
        if (typeof at(words, object.labelKey) !== 'string') missing.push(`${lang} · ${object.labelKey}`)
      }
      for (const group of withheldFromExport(tableInventory())) {
        if (typeof at(words, group.reasonKey) !== 'string') missing.push(`${lang} · ${group.reasonKey}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('la garde sait dire NON — sur un corpus délibérément cassé', () => {
    // 1. Une table du registre qui ne tombe nulle part.
    const orphan = withheldFromExport({ orpheline: { category: 'scoped', by: 'own_row', reason: 'x' } }, new Set())
    expect(orphan.flatMap(group => group.tables)).toContain('orpheline')
    const noBucket = withheldFromExport({}, new Set())
    expect(noBucket).toEqual([])

    // 2. Une table PARTAGÉE promue exportable : elle disparaîtrait de la
    //    section, et c'est exactement ce que le test n°3 attrape.
    const sharedTable = Object.entries(TABLE_SCOPES).find(([, scope]) => scope.category === 'shared')?.[0] as string
    const cheated = withheldFromExport(tableInventory(), new Set([...portableTables(), sharedTable]))
    expect(cheated.flatMap(group => group.tables)).not.toContain(sharedTable)

    // 3. Un objet promis que le service ne produit pas.
    expect(new Set(exportPayloadKeys()).has('workspaceSecrets')).toBe(false)
  })

  it('la garde ne prend PAS une clé citée dans un commentaire pour une clé rendue', () => {
    const commented = codeOnly('      // workspaceSecrets: leaked,\n      contacts,')
    expect(commented).not.toContain('workspaceSecrets')
    expect(commented).toContain('contacts,')
    const raw = '// abc\n      contacts,'
    expect(codeOnly(raw)).toHaveLength(raw.length)
  })
})
