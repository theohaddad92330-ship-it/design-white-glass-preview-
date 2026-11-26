import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TabMigrationNotice } from './TabMigrationNotice'

beforeEach(() => {
  window.sessionStorage.clear()
})

/**
 * #2115.33 — INFO DE MIGRATION SEULEMENT SI UTILE.
 *
 * La décision QUAND l'afficher vit dans `accountDetailSearch.ts`
 * (`resolveLegacyTabNotice`) — ici, seulement le rendu et la mémorisation.
 */
describe('TabMigrationNotice', () => {
  it('affiche « section › sous-section » quand une sous-partie précise est fournie', () => {
    render(<TabMigrationNotice sectionLabel="Synthèse" subSectionLabel="Score" dismissKey="score" />)
    expect(screen.getByText("Cet onglet s'appelle maintenant Synthèse › Score.")).toBeInTheDocument()
  })

  it('#2115.44 — omet la sous-partie quand la section n’en a qu’une : le nom ne se répète pas', () => {
    render(<TabMigrationNotice sectionLabel="Plan d'action" dismissKey="messages" />)
    expect(screen.getByText("Cet onglet s'appelle maintenant Plan d'action.")).toBeInTheDocument()
    expect(screen.queryByText(/›/)).not.toBeInTheDocument()
  })

  it('se ferme au clic, et le mémorise pour la session (sessionStorage)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <TabMigrationNotice sectionLabel="Synthèse" subSectionLabel="Score" dismissKey="score" />,
    )
    expect(screen.getByText(/Synthèse/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByText(/Synthèse/)).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('bellum.tab-migration-notice.dismissed.score')).toBe('1')

    // Un REMONTAGE avec la MÊME clé reste fermé — c'est la mémorisation « par
    // session », pas seulement « pendant que le composant est monté ».
    unmount()
    render(<TabMigrationNotice sectionLabel="Synthèse" subSectionLabel="Score" dismissKey="score" />)
    expect(screen.queryByText(/Synthèse/)).not.toBeInTheDocument()
  })

  it('sait dire NON : une clé de fermeture DIFFÉRENTE ne mémorise rien pour celle-ci', () => {
    window.sessionStorage.setItem('bellum.tab-migration-notice.dismissed.score', '1')
    render(
      <TabMigrationNotice sectionLabel="Personnes" subSectionLabel="Couverture du compte" dismissKey="couverture" />,
    )
    expect(screen.getByText(/Personnes/)).toBeInTheDocument()
  })

  it('un `sessionStorage` qui jette (navigation privée, quota) ne casse pas le rendu', async () => {
    const getItem = vi.spyOn(window.sessionStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const user = userEvent.setup()
      render(<TabMigrationNotice sectionLabel="Synthèse" subSectionLabel="Score" dismissKey="score" />)
      expect(screen.getByText(/Synthèse/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Fermer' }))
      expect(screen.queryByText(/Synthèse/)).not.toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})

afterEach(() => {
  window.sessionStorage.clear()
})
