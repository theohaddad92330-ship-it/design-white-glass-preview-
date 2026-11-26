import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { NewEventDialog } from './NewEventDialog'

/**
 * #3788.5 — recette 07/10, /briefing?plan=… : le dialogue annonçait « Valider
 * envoie une invitation à … » alors que la démo refuse ensuite l'écriture, au
 * clic sur « Créer » (toast du serveur : « Cet espace est une démonstration :
 * l'agenda s'y consulte, il ne s'y écrit pas »). En démo, le dialogue le dit
 * D'EMBLÉE, et le geste qui échouerait de toute façon n'est même pas proposé
 * — jamais une promesse d'écriture qu'on sait déjà refusée.
 */
const h = vi.hoisted(() => ({ isDemo: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => h.isDemo }))

describe('NewEventDialog — en démonstration (#3788.5)', () => {
  const slot = { start: '2026-09-24T10:00:00.000Z', end: '2026-09-24T10:30:00.000Z', minutes: 30 }

  async function open() {
    await i18n.changeLanguage('fr')
    const onCreate = vi.fn()
    render(
      <NewEventDialog
        slot={slot}
        language="fr"
        pending={false}
        allowCustomReminder={false}
        allowRecurrence={false}
        writableCalendars={[]}
        defaults={{ summary: 'Point client', guests: 'client@acme.fr' }}
        onCreate={onCreate}
        onCancel={() => {}}
      />,
    )
    return onCreate
  }

  it("dit d'emblée que la pose n'est pas possible, jamais qu'une invitation partira", async () => {
    h.isDemo = true
    await open()
    expect(screen.queryByText(/envoie une invitation/)).not.toBeInTheDocument()
    expect(screen.getByText(/l'agenda s'y consulte, il ne s'y écrit pas/)).toBeInTheDocument()
  })

  it('désactive la création — un geste qui échouerait de toute façon ne se propose pas', async () => {
    h.isDemo = true
    await open()
    expect(screen.getByRole('button', { name: 'Créer' })).toBeDisabled()
  })

  it('hors démo, le comportement normal (invitation annoncée) reste inchangé', async () => {
    h.isDemo = false
    await open()
    expect(screen.getByText(/envoie une invitation/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Créer' })).toBeEnabled()
  })
})
