import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { memoryItemObjectTypeSchema } from '@bellum/contracts'
import { DEMO_MEMORY_OBJECT_COVERAGE } from './demo-coverage'
import { DEMO_MEMORY_FACTS } from './demo-dataset'

/**
 * #2260.7 — LA DÉMO MONTRE L'OBJET VISÉ D'UN ÉLÉMENT DE MÉMOIRE (craft rule n°9).
 *
 * Le badge nommé et cliquable (contact / besoin / consultant / mission) vit sur
 * Réglages › Mémoire de Laura. Une salle de démonstration sans élément visant
 * chacun des quatre types montrerait un écran livré, mais dont cette capacité
 * ne se voit jamais.
 *
 * Ce que la garde exige :
 *  · chaque type du CONTRAT est classé dans `demo-coverage.ts` (un type ajouté
 *    demain sans réponse fait rougir) ;
 *  · un type classé « seedée » l'est RÉELLEMENT dans le jeu — un élément dont
 *    `object.type` vaut ce type ;
 *  · le semis ÉCRIT les quatre colonnes : sans elles, aucun badge n'apparaît
 *    jamais en démonstration.
 */
describe('#2260.7 — l’objet visé d’un élément de mémoire en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const insertAt = seedSource.indexOf('INSERT INTO memory_pinned_facts')
  const insert = seedSource.slice(insertAt, insertAt + 900)

  it('lit un corpus non vide — le jeu porte au moins un élément avec un objet visé', () => {
    expect(DEMO_MEMORY_FACTS.some(item => item.object != null)).toBe(true)
  })

  it('chaque type du contrat est classé — seedé, ou vide à dessein avec sa raison', () => {
    expect(Object.keys(DEMO_MEMORY_OBJECT_COVERAGE).sort()).toEqual([...memoryItemObjectTypeSchema.options].sort())
    for (const entry of Object.values(DEMO_MEMORY_OBJECT_COVERAGE)) {
      expect(entry.reason.trim().length).toBeGreaterThan(40)
    }
  })

  it('chaque type classé « seedé » est porté par au moins un élément du jeu', () => {
    for (const type of memoryItemObjectTypeSchema.options) {
      if (DEMO_MEMORY_OBJECT_COVERAGE[type]?.state !== 'seede') continue
      expect({
        type,
        seeded: DEMO_MEMORY_FACTS.some(item => item.object?.type === type),
      }).toEqual({ type, seeded: true })
    }
  })

  it('le semis écrit les quatre colonnes de désignation', () => {
    expect(insert).toContain('contact_id')
    expect(insert).toContain('need_id')
    expect(insert).toContain('consultant_id')
    expect(insert).toContain('mission_id')
  })
})
