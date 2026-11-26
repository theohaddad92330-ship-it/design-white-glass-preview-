import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { SourceChip } from './SourceChip'

// Théo A — « SOURCES CLIQUABLES, VISIBLES DIRECTEMENT » (Louis 22/10).
describe('SourceChip', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('le site d’origine est visible sur la carte, lien externe sécurisé, nommé « Ouvrir la source : <site> »', () => {
    render(<SourceChip sources={[{ url: 'https://www.lesechos.fr/tech/article-1', publishedAt: '2026-10-14' }]} />)
    const link = screen.getByRole('link', { name: 'Ouvrir la source : lesechos.fr' })
    expect(link).toHaveAttribute('href', 'https://www.lesechos.fr/tech/article-1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.className).toContain('min-h-11')
    expect(link).toHaveTextContent('lesechos.fr')
  })

  it('la date de publication à côté, quand on l’a', () => {
    render(<SourceChip sources={[{ url: 'https://www.lesechos.fr/a', publishedAt: '2026-10-14' }]} />)
    expect(screen.getByText(/14\/10\/2026|14 oct/)).toBeInTheDocument()
  })

  it('le clic sur la source n’ouvre PAS le détail de la carte', () => {
    const onCard = vi.fn()
    render(
      <div onClick={onCard}>
        <SourceChip sources={[{ url: 'https://www.lesechos.fr/a' }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('link'))
    expect(onCard).not.toHaveBeenCalled()
  })

  it('plusieurs sources : la plus récente visible + « +N sources » qui les liste', () => {
    render(
      <SourceChip
        sources={[
          { url: 'https://vieux.example/a', publishedAt: '2026-01-02' },
          { url: 'https://recent.example/b', publishedAt: '2026-10-12' },
          { url: 'https://milieu.example/c', publishedAt: '2026-05-05' },
        ]}
      />,
    )
    expect(screen.getByRole('link', { name: 'Ouvrir la source : recent.example' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /vieux\.example/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+2 sources' }))
    expect(screen.getByRole('link', { name: 'Ouvrir la source : milieu.example' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ouvrir la source : vieux.example' })).toBeInTheDocument()
  })

  it('pas d’URL connue = pas de lien, rien d’inventé', () => {
    const { container } = render(<SourceChip sources={[{ url: null }, { url: '' }, { url: undefined }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('refuse ce qui n’est pas http(s) et notre fournisseur intermédiaire', () => {
    const { container } = render(
      <SourceChip sources={[{ url: 'javascript:alert(1)' }, { url: 'https://app.apollo.io/#/people/1' }]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('doublons : la même page citée deux fois ne fait qu’une source', () => {
    render(<SourceChip sources={[{ url: 'https://a.example/x' }, { url: 'https://a.example/x' }]} />)
    expect(screen.queryByRole('button', { name: /sources/ })).not.toBeInTheDocument()
  })
})
