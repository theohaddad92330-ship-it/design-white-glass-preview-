import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3356.2 (LAU-UI-309) — les petits boutons de la barre de saisie (retirer,
 * relancer, fermer) avaient un état hover mais AUCUN état focus : au clavier,
 * la barre n'était pas un seul composant. Ils partagent maintenant `CHAT_SURFACE.focusRing`,
 * comme les pastilles voisines.
 */
describe('barre de saisie — état focus uniforme (#3356.2)', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/features/chat/view/Chat.tsx'), 'utf8')
  const ICON_BUTTON = 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11'

  it('chaque bouton icône à hover porte aussi le focus partagé', () => {
    const lines = source.split('\n')
    const bare = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line, index }) =>
          line.includes(ICON_BUTTON) &&
          !lines
            .slice(index, index + 3)
            .join('')
            .includes('focusRing'),
      )
    expect(bare.map(({ index }) => index + 1)).toEqual([])
  })
})
