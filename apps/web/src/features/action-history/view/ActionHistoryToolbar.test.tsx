import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterDefinition } from '@bellum/ui'
import { ActionHistoryToolbar } from './ActionHistoryToolbar'

/**
 * §L4, 30/08/2026 — l'écran /actions empilait TROIS rangs de sélection avant la
 * première ligne de contenu. Le troisième — « Depuis ma connexion / Tous /
 * Analyses / … » — était un onglet (`TabNav`, la MÊME forme que la navigation de
 * section) qui ne faisait pourtant QUE filtrer le journal, et doublait la chip
 * « type » déjà proposée par ce même bandeau.
 *
 * Ce test verrouille ce qui reste : le mode « depuis ma dernière connexion »
 * devient un bouton BASCULE dans la barre d'outils — qui se présente comme un
 * filtre, pas comme un onglet — et les contrôles de filtre ordinaires
 * disparaissent tant qu'il est actif (ils n'ont aucun sens dans ce mode).
 */
describe('la barre d’outils du journal — le bouton « depuis ma connexion » remplace le rang d’onglets', () => {
  const definitions: FilterDefinition[] = [{ id: 'type', label: 'Type', options: [] }]

  it('hors mode delta : les filtres sont visibles, le bouton n’est pas actif', () => {
    render(
      <ActionHistoryToolbar
        definitions={definitions}
        onAddFilter={vi.fn()}
        hasActiveFilters={false}
        isSinceMode={false}
        onToggleSince={vi.fn()}
      />,
    )
    const toggle = screen.getByRole('button', { name: /connexion/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /7 derniers jours/i })).toBeInTheDocument()
  })

  it('en mode delta : les filtres disparaissent, le bouton est actif', () => {
    render(
      <ActionHistoryToolbar
        definitions={definitions}
        onAddFilter={vi.fn()}
        hasActiveFilters={false}
        isSinceMode
        onToggleSince={vi.fn()}
      />,
    )
    const toggle = screen.getByRole('button', { name: /connexion/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /7 derniers jours/i })).not.toBeInTheDocument()
  })

  it('cliquer sur le bouton appelle onToggleSince', async () => {
    const onToggleSince = vi.fn()
    render(
      <ActionHistoryToolbar
        definitions={definitions}
        onAddFilter={vi.fn()}
        hasActiveFilters={false}
        isSinceMode={false}
        onToggleSince={onToggleSince}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /connexion/i }))
    expect(onToggleSince).toHaveBeenCalledTimes(1)
  })
})
