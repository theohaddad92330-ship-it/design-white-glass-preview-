import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MESSAGE_MATRIX } from './message-matrix.js'
import { OUTREACH_PERSONAS } from './outreach-scenarios.js'
import { relationshipStateSchema } from './sales-context.js'

/**
 * #2371 — la garde de parité de la matrice du message : TS (la donnée) ↔ le
 * miroir JSON que lit le moteur Python (`apps/ia/app/knowledge/message_matrix.py`).
 *
 * Le miroir est comparé EN ENTIER, pas clé par clé : une consigne de stade
 * retouchée d'un seul côté changerait le texte que Claude reçoit sans que l'écran
 * ni le contrôle avant envoi ne le sachent. En cas d'écart, le message d'échec
 * donne le JSON attendu, à recopier tel quel dans le miroir.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const MIRROR_PY = monorepoFile('apps/ia/app/knowledge/message_matrix.py')
const mirrorSource = readFileSync(MIRROR_PY, 'utf8')

/** Le JSON littéral entre les deux marqueurs du miroir Python. */
function mirrorJson(): unknown {
  const match = mirrorSource.match(/_MATRIX_JSON = r"""([\s\S]*?)"""/)
  expect(match, `\`_MATRIX_JSON = r"""…"""\` introuvable dans ${MIRROR_PY}`).not.toBeNull()
  return JSON.parse(match?.[1] ?? 'null')
}

describe('#2371 — matrice du message persona × stade × objectif', () => {
  it('LIT vraiment le miroir Python (sinon la garde est borgne)', () => {
    const mirror = mirrorJson() as { stages?: Record<string, unknown> }
    expect(Object.keys(mirror.stages ?? {}).length).toBeGreaterThan(5)
  })

  it('le miroir Python est IDENTIQUE à la donnée TS', () => {
    const expected = JSON.parse(JSON.stringify(MESSAGE_MATRIX))
    expect(mirrorJson(), `Recopier dans _MATRIX_JSON :\n${JSON.stringify(MESSAGE_MATRIX, null, 2)}`).toEqual(expected)
  })

  it('chaque stade du contrat a sa ligne, le froid compris — explicitement nul', () => {
    expect(Object.keys(MESSAGE_MATRIX.stages).sort()).toEqual([...relationshipStateSchema.options].sort())
    expect(MESSAGE_MATRIX.stages.froid).toBeNull()
  })

  it('le persona est celui du contrat, pas une copie', () => {
    expect(MESSAGE_MATRIX.personas).toBe(OUTREACH_PERSONAS)
  })

  it('chaque objectif a sa prémisse (ou null), et une prémisse ne nomme que des stades du contrat', () => {
    expect(Object.keys(MESSAGE_MATRIX.objectivePremises).sort()).toEqual([...MESSAGE_MATRIX.objectives].sort())
    const stages = new Set<string>(relationshipStateSchema.options)
    for (const premise of Object.values(MESSAGE_MATRIX.objectivePremises)) {
      for (const stage of premise ?? []) expect(stages.has(stage), stage).toBe(true)
    }
  })

  it('deux stades ne portent jamais la même consigne (sinon la matrice ne personnalise rien)', () => {
    const musts = Object.values(MESSAGE_MATRIX.stages).flatMap(entry => (entry ? [entry.must] : []))
    expect(new Set(musts).size).toBe(musts.length)
  })

  it('aucun critère protégé ne pèse dans la matrice (doctrine)', () => {
    const text = JSON.stringify(MESSAGE_MATRIX).toLowerCase()
    for (const word of ['âge', 'genre', 'origine', 'nationalit', 'photo', 'adresse', 'sexe', 'religion']) {
      expect(text.includes(word), word).toBe(false)
    }
  })
})
