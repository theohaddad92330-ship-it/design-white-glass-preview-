import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { RoleBadge } from './RoleBadge'
import { RoleHint } from './RoleHint'

const DEFINITION = 'personne susceptible de freiner ou refuser l’achat — souvent pas le profil le plus recherché'

describe('#4985 — « Bloqueur » s’explique, au clavier comme à la souris', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le badge Bloqueur prend le focus au clavier et dit ce qu’est un bloqueur', async () => {
    render(<RoleBadge role="blocker" />)
    await userEvent.tab()
    const trigger = screen.getByText('Bloqueur').closest('[data-slot="tooltip-trigger"]') as HTMLElement
    expect(trigger).toHaveFocus()
    expect((await screen.findAllByText(DEFINITION, { exact: false })).length).toBeGreaterThan(0)
  })

  it('un autre rôle n’ajoute aucun arrêt de tabulation (rien n’est expliqué à tort)', () => {
    render(<RoleHint role="champion">Champion</RoleHint>)
    expect(screen.getByText('Champion').closest('[data-slot="tooltip-trigger"]')).toBeNull()
  })
})
