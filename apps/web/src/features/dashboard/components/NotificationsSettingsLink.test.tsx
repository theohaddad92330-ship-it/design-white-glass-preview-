import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { NotificationsSettingsLink } from './NotificationsSettingsLink'

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

/**
 * `#2018.5` — LES NOTIFICATIONS À L'ACCUEIL, SANS DUPLICATION.
 *
 * Décision de Louis du 18/09/2026 : l'accueil ne redemande jamais les
 * préférences de notification (module `notifications`, GA-26) — il RENVOIE
 * vers `/settings/notifications`. Ce test garde exactement ça : un lien, et
 * aucun interrupteur, aucune lecture de préférence sur cette carte.
 */
describe('#2018.5 — NotificationsSettingsLink', () => {
  it('renvoie vers les préférences de notification existantes, sans les redemander', async () => {
    renderWithRouter(<NotificationsSettingsLink />)

    const link = await screen.findByRole('link', { name: /notification/i })
    expect(link).toHaveAttribute('href', '/settings/notifications')
    // Aucune préférence ne se règle ici — GA-26, un réglage vit à un seul endroit.
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
