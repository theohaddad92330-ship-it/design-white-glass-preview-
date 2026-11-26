import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SHARED_BASE_MIN_WORKSPACES } from '@bellum/contracts'
import { MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE } from '../modules/analytics/message-learning-signals'

/**
 * #3989.f — les deux seuils de l'apprentissage GLOBAL des messages vivent en TS
 * (source) ET en Python (miroir, `shared_message_learning.py`). Un miroir sans
 * test de parité dérive en silence : changer le 3 d'un côté ferait lire à l'IA
 * des cellules que la base n'a pas le droit de sortir (k-anonymat), ou refuser
 * des règles que l'API accepte.
 */
const IA_FILE = join(__dirname, '..', '..', '..', 'ia', 'app', 'services', 'shared_message_learning.py')

/** Lit une constante entière `NOM = <n>` au niveau module du fichier Python. */
function pythonIntConstant(source: string, name: string): number | null {
  const found = new RegExp(`^${name}\\s*=\\s*(\\d+)\\s*(?:#.*)?$`, 'm').exec(source)
  return found ? Number(found[1]) : null
}

describe('#3989.f — seuils de l’apprentissage global : le miroir Python égale la source TS', () => {
  const python = readFileSync(IA_FILE, 'utf8')

  it('le seuil d’échantillon d’une règle (5) est le même des deux côtés', () => {
    expect(pythonIntConstant(python, 'SHARED_LEARNING_MIN_COUNT')).toBe(MESSAGE_LEARNING_RULE_PROPOSAL_MIN_SAMPLE)
  })

  it('le nombre d’espaces minimal (3) est le même des deux côtés', () => {
    expect(pythonIntConstant(python, '_MIN_WORKSPACES')).toBe(SHARED_BASE_MIN_WORKSPACES)
  })

  it('sait dire NON : un miroir divergent ou absent n’est pas pris pour égal', () => {
    expect(pythonIntConstant('_MIN_WORKSPACES = 2\n', '_MIN_WORKSPACES')).not.toBe(SHARED_BASE_MIN_WORKSPACES)
    expect(pythonIntConstant('# rien\n', '_MIN_WORKSPACES')).toBeNull()
    expect(pythonIntConstant('X_MIN_WORKSPACES = 3\n', '_MIN_WORKSPACES')).toBeNull()
  })
})
