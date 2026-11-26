import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ReplyFamilyRetry } from './ReplyFamilyRetry'
import { AccountMapCard } from './AccountMapCard'

/**
 * #3758 — le repli texte d'une famille connue se DIT et se relance en carte ;
 * une famille servie en carte, ou aucune famille, ne montre rien. La carte de
 * cartographie dit sa couverture et se lit « partielle » quand elle déclare un manque.
 */

describe('#3758 — ReplyFamilyRetry', () => {
  it('un repli texte propose de refaire en carte, avec la phrase de SA famille', async () => {
    await i18n.changeLanguage('fr')
    const onRetry = vi.fn()
    renderWithRouter(
      <ReplyFamilyRetry
        family={{ family: 'account_map', outcome: 'text_fallback' }}
        content="Voici la cartographie."
        onRetry={onRetry}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Refaire en carte' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0]?.[0]).toContain('cartographie')
  })

  it.each([
    [undefined],
    [{ family: 'account_map' as const, outcome: 'structured' as const }],
    [{ family: 'generic_rich_answer' as const, outcome: 'text_fallback' as const }],
  ])('rien ne s’affiche pour %j', family => {
    const { container } = renderWithRouter(
      <ReplyFamilyRetry family={family} content="Texte." onRetry={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

describe('#3758 — AccountMapCard', () => {
  const block = {
    type: 'account_map' as const,
    title: undefined,
    coverage: 'Comptes enregistrés sur le département 34.',
    groups: [{ label: 'Montpellier', items: [{ name: 'Alpha Industrie', href: undefined, detail: 'Siège régional' }] }],
    not_covered: undefined,
    source: undefined,
  }

  it('dit sa couverture, nomme ses groupes, et n’est pas « partielle » sans manque déclaré', async () => {
    await i18n.changeLanguage('fr')
    renderWithRouter(<AccountMapCard block={block} />)
    expect(await screen.findByText(/Comptes enregistrés sur le département 34/)).toBeInTheDocument()
    expect(await screen.findByText(/Montpellier · 1/)).toBeInTheDocument()
    await screen.findByText(/Montpellier/)
    expect(screen.queryByText('Cartographie partielle')).toBeNull()
  })

  it('se lit « partielle » et NOMME ce qu’elle ne couvre pas', async () => {
    await i18n.changeLanguage('fr')
    renderWithRouter(<AccountMapCard block={{ ...block, not_covered: ['Les comptes non enregistrés.'] }} />)
    expect(await screen.findByText('Cartographie partielle')).toBeInTheDocument()
    expect(await screen.findByText(/Les comptes non enregistrés\./)).toBeInTheDocument()
  })
})
