import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { memoryItemScopes } from '@bellum/contracts'
import { DEMO_MEMORY_SCOPE_COVERAGE } from './demo-coverage'
import { DEMO_MEMORY_FACTS } from './demo-dataset'

/**
 * #1918.1 — LA DÉMO MONTRE LES DEUX PORTÉES DE LA MÉMOIRE (craft rule n°9).
 *
 * Le badge « Toi uniquement » / « Toute ton ESN » et le geste « Partager avec ton
 * ESN » vivent sur Réglages › Mémoire de Laura. Une salle de démonstration dont
 * tous les éléments seraient d'une seule portée montrerait un badge qui ne varie
 * jamais — c'est-à-dire aucune des deux choses que la portée existe pour dire.
 *
 * Ce que la garde exige :
 *  · chaque portée du CONTRAT est classée dans `demo-coverage.ts` (une portée
 *    ajoutée demain sans réponse fait rougir) ;
 *  · une portée classée « seedée » l'est RÉELLEMENT dans le jeu ;
 *  · au moins un élément par portée ne dépend d'AUCUN compte — le semis saute
 *    proprement un élément dont le compte est introuvable, et une portée qui ne
 *    tiendrait qu'à lui disparaîtrait sans qu'aucun test ne tombe ;
 *  · le semis ÉCRIT la colonne : sans elle, la base retombe sur `workspace` et
 *    « moi » disparaît en silence de la salle.
 */
describe('#1918.1 — la portée de la mémoire en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const insertAt = seedSource.indexOf('INSERT INTO memory_pinned_facts')
  const insert = seedSource.slice(insertAt, insertAt + 800)

  it('lit un corpus non vide — le jeu ET l’écriture du semis', () => {
    expect(DEMO_MEMORY_FACTS.length).toBeGreaterThan(0)
    expect(insertAt).toBeGreaterThan(-1)
  })

  it('chaque portée du contrat est classée — seedée, ou vide à dessein avec sa raison', () => {
    expect(Object.keys(DEMO_MEMORY_SCOPE_COVERAGE).sort()).toEqual([...memoryItemScopes].sort())
    for (const entry of Object.values(DEMO_MEMORY_SCOPE_COVERAGE)) {
      expect(entry.reason.trim().length).toBeGreaterThan(40)
    }
  })

  it('chaque portée classée « seedée » est portée par au moins un élément SANS compte', () => {
    for (const scope of memoryItemScopes) {
      if (DEMO_MEMORY_SCOPE_COVERAGE[scope]?.state !== 'seede') continue
      expect({
        scope,
        seededWithoutAccount: DEMO_MEMORY_FACTS.some(item => item.scope === scope && item.company === null),
      }).toEqual({ scope, seededWithoutAccount: true })
    }
  })

  it('le semis écrit la portée, pour le PROPRIÉTAIRE de la salle — celui sous lequel le visiteur est connecté', () => {
    expect(insert).toMatch(
      // #2260.7 — les QUATRE colonnes de désignation d'objet suivent, AJOUTÉES
      // EN FIN de liste (voir `DemoSeedService`).
      /\(user_id, workspace_id, account_id, fact, kind, origin, scope, business_unit_id, expires_at, created_at,\s*contact_id, need_id, consultant_id, mission_id\)/,
    )
    expect(insert).toContain('item.scope')
    // Un élément « moi » semé pour quelqu'un d'autre serait INVISIBLE du
    // visiteur : c'est précisément la règle que la portée pose.
    expect(insert).toContain('ownerUserId')
  })
})
