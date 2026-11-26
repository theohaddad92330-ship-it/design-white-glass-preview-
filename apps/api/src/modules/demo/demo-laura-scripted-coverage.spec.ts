import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_LAURA_SCRIPTED_COVERAGE } from './demo-coverage'

/**
 * Décision Louis 12/10 (lot DEMO-PRODUIT) — Laura reste SCRIPTÉE en démo. La raison
 * s'écrit à un seul endroit lisible (le moteur `demo-turn.ts`) et se cite ici : la garde
 * rougit si l'un des deux perd la phrase, ou si le moteur disparaît.
 */
const REASON =
  'Laura reste scriptée en démo — zéro coût IA par visite et démo stable en réunion ; le cas hors script ne fabrique rien.'

describe('Laura scriptée en démo (décision Louis 12/10)', () => {
  const demoTurn = readFileSync(join(__dirname, '../../../../web/src/features/chat/api/demo-turn.ts'), 'utf8')

  it('le moteur scripté existe et porte la raison, en tête de fichier', () => {
    expect(demoTurn.length).toBeGreaterThan(1000)
    expect(demoTurn.slice(0, 6000)).toContain(REASON)
    expect(demoTurn.slice(0, 6000)).toContain('Décision Louis 12/10')
  })

  it('la couverture est classée SEEDÉE et cite la même raison', () => {
    expect(DEMO_LAURA_SCRIPTED_COVERAGE.state).toBe('seede')
    expect(DEMO_LAURA_SCRIPTED_COVERAGE.reason).toContain(REASON)
    expect(DEMO_LAURA_SCRIPTED_COVERAGE.reason).toContain('demo-turn.ts')
  })
})
