import { useCopiedFlash } from '@bellum/ui'
import { act, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * L'accusé « Copié » ne survit pas à son écran (#1152).
 *
 * Sept endroits posaient `setTimeout(() => setCopied(false), …)` sans jamais
 * garder la poignée. Copier puis quitter l'écran avant la fin du délai laissait
 * un `setState` s'exécuter sur un composant démonté. En production : un
 * avertissement React et un minuteur qui survit. En test : l'erreur tombe APRÈS
 * le démontage de l'environnement, et vitest sort en 1 alors que les 423
 * fichiers sont verts — c'est ce qui rendait `Test (Web)` intermittent, avec un
 * échec que rien ne désignait.
 */

function Copier({ ms }: { ms: number }) {
  const [copied, flash] = useCopiedFlash(ms)
  return (
    <button type="button" onClick={flash}>
      {copied ? 'copié' : 'copier'}
    </button>
  )
}

describe('useCopiedFlash — le minuteur meurt avec son écran', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('montre puis retire l’accusé au bout du délai', () => {
    render(<Copier ms={1500} />)
    act(() => screen.getByRole('button').click())
    expect(screen.getByRole('button')).toHaveTextContent('copié')

    act(() => void vi.advanceTimersByTime(1500))
    expect(screen.getByRole('button')).toHaveTextContent('copier')
  })

  it('annule le minuteur au démontage — le cas qui cassait la CI', () => {
    const { unmount } = render(<Copier ms={1800} />)
    act(() => screen.getByRole('button').click())
    expect(vi.getTimerCount()).toBe(1)

    unmount()
    // Zéro minuteur en attente : plus rien ne peut écrire sur un composant parti.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('réarme plutôt que de laisser le premier délai éteindre le second', () => {
    render(<Copier ms={1000} />)
    act(() => screen.getByRole('button').click())
    act(() => void vi.advanceTimersByTime(800))
    act(() => screen.getByRole('button').click())

    // 300 ms après la SECONDE copie : le premier délai est passé, l'accusé tient.
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.getByRole('button')).toHaveTextContent('copié')
  })
})

/**
 * Le cliquet de FAMILLE. Le hook ne vaut que si personne ne réécrit le motif à
 * la main — c'est ainsi que les sept copies étaient nées.
 */
describe('aucun accusé « Copié » ne repose sur un minuteur libre', () => {
  const ROOT = resolve(__dirname, '../../../..')
  const SUSPECTS = [
    'apps/web/src/features/chat/view/ShareConversation.tsx',
    'apps/web/src/features/accounts/hooks/useShareDialog.ts',
    'apps/web/src/features/accounts/view/account-detail/components/contact-engagement/EngagementMessage.tsx',
    'apps/web/src/components/DevStatusBar.tsx',
    'packages/ui/src/molecules/copy-field.tsx',
  ]

  it('lit un corpus réel — sinon la garde est borgne', () => {
    // Une garde qui balaie une liste vide, ou des fichiers vides, passe au vert
    // sans rien vérifier. On prouve donc que le corpus existe ET qu'il parle
    // bien de copie.
    // 7 jusqu'au 04/09/2026, 6 depuis : `features/dashboard/components/cockpit/
    // NextBestActionCard.tsx` n'a pas perdu son accusé de copie, il a DISPARU
    // avec l'onglet « Équipe » de `/dashboard` (#1457). Le compte ne baisse
    // que quand un porteur disparaît — jamais quand il cesse d'utiliser le hook.
    // 5 depuis le 05/10/2026 : `ContactIcebreakers.tsx` a DISPARU de la fiche
    // Contact (#3689, générateur concurrent de l'éditeur commun).
    expect(SUSPECTS.length).toBe(5)
    for (const path of SUSPECTS) {
      const source = readFileSync(resolve(ROOT, path), 'utf8')
      expect(source.length).toBeGreaterThan(200)
      expect(source).toMatch(/useCopiedFlash/)
    }
  })

  it('aucun ne rappelle un setter de copie depuis un setTimeout', () => {
    const guilty = SUSPECTS.filter(path =>
      /setTimeout\(\s*\(\)\s*=>\s*setCopied/.test(readFileSync(resolve(ROOT, path), 'utf8')),
    )
    expect(guilty).toEqual([])
  })
})
