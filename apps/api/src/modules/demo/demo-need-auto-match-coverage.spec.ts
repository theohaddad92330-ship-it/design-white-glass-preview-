import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'
import { DEMO_SEEDED_TABLES } from './demo-coverage'

/**
 * #2916 / #2399.2 (`c93_matching_auto_besoin_entrant`) — craft rule n°9 : la
 * fiche besoin dit « Matching lancé automatiquement » ; en salle de
 * démonstration, le rôle phare le montre, et la ligne existe VRAIMENT.
 */
describe('démo — un matching « lancé automatiquement » sur le rôle phare (c93)', () => {
  const seed = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('le jeu le déclare sur le rôle qui porte le rapprochement', () => {
    expect(DEMO_DELIVERY_CLIENT.needVerdict.autoLaunched).toBe(true)
    expect(DEMO_DELIVERY_CLIENT.needVerdict.entries.length).toBeGreaterThan(0)
  })

  it('le semis ÉCRIT la ligne, rattachée au run qu’il vient de poser, statut `done`', () => {
    expect(seed).toMatch(/INSERT INTO need_auto_matches \(need_id, workspace_id, user_id, status, run_id/)
    expect(seed).toMatch(/VALUES \(\$1, \$2, \$3, 'done', \$4/)
  })

  it('la table est classée SEEDÉE, jamais « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('need_auto_matches')
  })
})
