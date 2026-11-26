import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * GA-386 — #2449.33 : LE NIVEAU D'ACTION NE S'AFFICHE JAMAIS EN QUATRE CHOIX
 * SOUS CHAQUE MESSAGE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre niveaux d'action du copilote (`respond_only` / `prepare` /
 * `execute` / `automate`, `copilot-action-level.ts`) sont un MANDAT pour tout
 * le fil de conversation ou tout le travail — pas un réglage qu'on repose à
 * chaque bulle. Un sélecteur à quatre choix répété sous chaque message serait
 * à la fois du bruit visuel et une fausse promesse d'indépendance message par
 * message, alors que la porte (`authorizeAtActionLevel`) raisonne sur un
 * mandat déjà résolu en amont (`resolveCtx`, `action-router.service.ts`).
 *
 * `MessageBubble` (`Chat.tsx`) est l'endroit où « sous chaque message »
 * prendrait forme si quelqu'un l'ajoutait un jour ; cette garde lit SON corps
 * — pas le fichier entier, où `ContextModeSelector` (un réglage PAR TOUR, pas
 * PAR MESSAGE, monté sous le composeur) porte légitimement `execute`/`prepare`
 * comme mots ordinaires sans être la chose visée ici.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const CHAT_TSX = join(REPO_ROOT, 'apps', 'web', 'src', 'features', 'chat', 'view', 'Chat.tsx')

/** Le corps de `function MessageBubble(...) { … }`, extrait par équilibrage d'accolades. */
function messageBubbleSource(tsx: string): string {
  const anchor = 'function MessageBubble('
  const start = tsx.indexOf(anchor)
  if (start < 0) return ''
  const bodyStart = tsx.indexOf('{', start)
  if (bodyStart < 0) return ''
  let depth = 0
  for (let i = bodyStart; i < tsx.length; i += 1) {
    if (tsx[i] === '{') depth += 1
    else if (tsx[i] === '}') {
      depth -= 1
      if (depth === 0) return tsx.slice(bodyStart + 1, i)
    }
  }
  return ''
}

/** Les quatre littéraux du niveau d'action, ENSEMBLE, dans un fragment donné —
 *  un seul mot pris isolément (« exécuter un test ») ne suffit jamais. */
function rendersFourActionLevelChoices(source: string): boolean {
  if (!source) return false
  const literals = ['respond_only', 'prepare', 'execute', 'automate']
  return literals.every(literal => source.includes(`'${literal}'`) || source.includes(`"${literal}"`))
}

describe('GA-386 — le niveau d’action n’est jamais un sélecteur à quatre choix sous chaque message', () => {
  const tsx = readFileSync(CHAT_TSX, 'utf8')

  it('LIT quelque chose — MessageBubble existe et son corps n’est pas vide', () => {
    expect(tsx).toContain('function MessageBubble(')
    expect(messageBubbleSource(tsx).length).toBeGreaterThan(200)
  })

  it('#2449.33 — MessageBubble ne rend pas les quatre niveaux d’action', () => {
    expect(rendersFourActionLevelChoices(messageBubbleSource(tsx))).toBe(false)
  })

  it('sait dire NON — les quatre littéraux ENSEMBLE dans un fragment sont REPROCHÉS', () => {
    const violation = `
      const ACTION_LEVEL_CHOICES = ['respond_only', 'prepare', 'execute', 'automate']
    `
    expect(rendersFourActionLevelChoices(violation)).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un mot isolé ne suffit pas', () => {
    // `ContextModeSelector` (réglage par tour, pas par message) et la prose
    // ordinaire emploient « prepare »/« execute » sans être les quatre niveaux.
    const benin = `const label = t('common.prepare'); await execute(job)`
    expect(rendersFourActionLevelChoices(benin)).toBe(false)
  })
})
