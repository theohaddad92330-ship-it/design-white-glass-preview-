import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import frImport from '@/i18n/locales/fr/importWizard.json'
import enImport from '@/i18n/locales/en/importWizard.json'
import { SOURCE_FAMILIES, UNLOCKED_BY_FAMILY, familyOfSource } from './unlocked'

/**
 * #1452 — « CE QUE CES DONNÉES VONT DÉBLOQUER » NE DOIT PAS DEVENIR UNE AFFICHE.
 *
 * Le retour pose lui-même la contrainte : *« Ne promettre que les usages
 * réellement branchés dans le produit. »* Une promesse qui ne mène nulle part
 * n'a rien pour la démentir — c'est exactement comme ça qu'un produit se met à
 * mentir poliment, et personne ne s'en aperçoit avant une réunion.
 *
 * Ce fichier tient donc trois choses, et il faut les trois :
 *  1. chaque famille RANGÉE a une promesse (sinon un écran choisit une source
 *     et le bloc disparaît sans un mot) ;
 *  2. chaque promesse pointe une route qui EXISTE sur le disque ;
 *  3. chaque promesse est ÉCRITE, dans les deux langues.
 */
const ROUTES_DIR = join(process.cwd(), 'src/routes')

/** Traduit `/contacts` en le fichier de route qui le sert. */
function routeExists(path: string): boolean {
  const segments = path.replace(/^\//, '').split('/')
  const candidates = [
    join(ROUTES_DIR, `${segments.join('/')}.tsx`),
    join(ROUTES_DIR, segments.join('/'), 'index.tsx'),
    join(ROUTES_DIR, `${segments.join('.')}.tsx`),
  ]
  return candidates.some(candidate => existsSync(candidate))
}

describe('les promesses de l’import mènent quelque part', () => {
  /**
   * ⚠️ LA PREUVE QUE CETTE GARDE LIT QUELQUE CHOSE.
   *
   * Un corpus vide rendrait les trois tests suivants verts sans rien vérifier —
   * le défaut « garde borgne » payé six fois dans ce dépôt en deux jours.
   */
  it('lit un corpus réel : des familles, des promesses, et des routes', () => {
    expect(SOURCE_FAMILIES.length).toBeGreaterThanOrEqual(3)
    expect(Object.keys(UNLOCKED_BY_FAMILY).length).toBeGreaterThanOrEqual(3)
    expect(readdirSync(ROUTES_DIR).length).toBeGreaterThan(10)
  })

  it('chaque famille rangée a une promesse — aucune ne tombe dans le vide', () => {
    const orphans = SOURCE_FAMILIES.map(family => family.key).filter(key => !UNLOCKED_BY_FAMILY[key])
    expect(orphans, 'familles sans « ce que ça débloque »').toEqual([])
  })

  it('chaque promesse pointe une route qui EXISTE', () => {
    const broken = Object.entries(UNLOCKED_BY_FAMILY).flatMap(([family, entries]) =>
      entries.filter(entry => !routeExists(entry.to)).map(entry => `${family}.${entry.key} → ${entry.to}`),
    )
    expect(broken, 'promesses sans destination').toEqual([])
  })

  it('chaque promesse est écrite, en français ET en anglais', () => {
    const catalogues: [string, Record<string, unknown>][] = [
      ['fr', frImport as Record<string, unknown>],
      ['en', enImport as Record<string, unknown>],
    ]
    const missing: string[] = []
    for (const [lang, catalogue] of catalogues) {
      const unlocked = catalogue.unlocked as Record<string, Record<string, string>> | undefined
      for (const [family, entries] of Object.entries(UNLOCKED_BY_FAMILY)) {
        for (const entry of entries) {
          if (!unlocked?.[family]?.[entry.key]) missing.push(`${lang}:unlocked.${family}.${entry.key}`)
        }
      }
      if (!unlocked?.title) missing.push(`${lang}:unlocked.title`)
    }
    expect(missing, 'promesses non traduites').toEqual([])
  })
})

describe('la famille d’une source', () => {
  it('retrouve la famille sous laquelle la carte est RANGÉE', () => {
    expect(familyOfSource('hubspot_export')).toBe('legacyTool')
    expect(familyOfSource('cv_bulk')).toBe('talent')
    expect(familyOfSource('notes')).toBe('business')
  })

  /**
   * ⚠️ La MÊME réponse que le regroupement des cartes. Deux réponses à « à
   * quelle famille appartient cette source » feraient qu'une carte serait rangée
   * ici et promise là — et personne ne verrait laquelle des deux a raison.
   */
  it('range une source inconnue comme le fait le regroupement : dans la dernière', () => {
    const last = SOURCE_FAMILIES[SOURCE_FAMILIES.length - 1]?.key
    expect(familyOfSource('un_export_qui_n_existe_pas_encore')).toBe(last)
  })
})
