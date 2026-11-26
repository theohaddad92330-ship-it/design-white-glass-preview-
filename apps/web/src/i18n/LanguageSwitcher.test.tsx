import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@bellum/ui'
import { i18n } from '@/i18n'
import { LANGUAGE_STORAGE_KEY } from '@/i18n/config'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'

function renderSwitcher(variant: 'icon' | 'inline' = 'icon') {
  return render(
    <TooltipProvider>
      <LanguageSwitcher variant={variant} />
    </TooltipProvider>,
  )
}

describe('LanguageSwitcher', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  afterEach(async () => {
    await i18n.changeLanguage('fr')
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY)
  })

  it('renders with the French aria-label by default', () => {
    renderSwitcher()
    expect(screen.getByRole('button', { name: 'Choisir la langue' })).toBeInTheDocument()
  })

  it('switches the app language to English on selection', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: 'Choisir la langue' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /English/ }))

    expect(i18n.resolvedLanguage).toBe('en')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en')
  })

  it('updates its own label after the language changes (hot switch)', async () => {
    const user = userEvent.setup()
    renderSwitcher()

    await user.click(screen.getByRole('button', { name: 'Choisir la langue' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /English/ }))

    expect(await screen.findByRole('button', { name: 'Select language' })).toBeInTheDocument()
  })

  it('switches back to French from the inline variant', async () => {
    await i18n.changeLanguage('en')
    const user = userEvent.setup()
    renderSwitcher('inline')

    await user.click(screen.getByRole('button', { name: 'Select language' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /Français/ }))

    expect(i18n.resolvedLanguage).toBe('fr')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr')
  })
})
