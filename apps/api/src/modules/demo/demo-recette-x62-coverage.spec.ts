import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_RECETTE_X62_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * Lot X62 (02/10) — les amorces scriptées qui rejouent les cas de recette
 * vivent côté web (`demo-chat-script.ts`) ; cette garde, côté API, rougit si
 * l'une disparaît, et si la carte « Aujourd'hui » perd son compte (SNCF).
 */
const SCRIPT = readFileSync(join(__dirname, '../../../../web/src/features/demo/demo-chat-script.ts'), 'utf8')

describe('couverture démo — cas de recette rejouables (lot X62)', () => {
  it.each(['p-group-too-broad', 'p-message-quality-check', 'p-tone-vs-decision-role', 'p-action-reoriented'])(
    'l’amorce %s existe dans le script de la salle',
    id => {
      expect(SCRIPT).toContain(`id: '${id}'`)
    },
  )

  it('SNCF reste parmi les trois premiers dossiers : la carte « Aujourd’hui » porte le résultat déclaré', () => {
    expect(DEMO_DOSSIERS.slice(0, 3).map(dossier => dossier.account.company_name)).toContain('SNCF')
  })

  it('classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_RECETTE_X62_COVERAGE.state).toBe('seede')
    expect(DEMO_RECETTE_X62_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
