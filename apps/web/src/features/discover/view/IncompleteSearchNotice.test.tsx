import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IncompleteSearchNotice } from './IncompleteSearchNotice'
import { DISCOVER_INCOMPLETE_SEARCH_THRESHOLD } from '@/features/discover/lib/discover-incomplete-search'

// #2614.2 — le bandeau « recherche incomplète » ne parle que sous le seuil
// documenté (`isSearchIncomplete`), jamais sur l'état vide (0) ni sans mesure
// (`null`) : `git grep "recherche incomplète"` ne rendait aucun appelant
// écran avant ce lot (la fonction existait, mais rien ne l'affichait).
describe('IncompleteSearchNotice — #2614.2', () => {
  it('rend rien si la recherche a trouvé assez de comptes', () => {
    const { container } = render(
      <IncompleteSearchNotice matched={DISCOVER_INCOMPLETE_SEARCH_THRESHOLD} axis={null} onWiden={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('rend rien sur l’état vide (0 — DiscoverEmpty répond déjà)', () => {
    const { container } = render(<IncompleteSearchNotice matched={0} axis={null} onWiden={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rend rien sans mesure (matched null) — jamais un « incomplet » deviné', () => {
    const { container } = render(<IncompleteSearchNotice matched={null} axis={null} onWiden={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sous le seuil : nomme le compte trouvé et propose d’élargir', () => {
    render(<IncompleteSearchNotice matched={2} axis={null} onWiden={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/2/)
  })

  it('le bouton déclenche onWiden — l’action, pas une simple mention', () => {
    const onWiden = vi.fn()
    render(<IncompleteSearchNotice matched={1} axis={null} onWiden={onWiden} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onWiden).toHaveBeenCalledTimes(1)
  })
})

// #3814.3 — « sortie maigre » propose UN élargissement PRÉCIS (zone, effectif
// ou compétence) quand une contrainte réelle est posée, jamais une cible
// inventée quand `axis` est `null` (texte générique d'origine).
describe('IncompleteSearchNotice — #3814.3, élargissement précis', () => {
  it('sans axe posé : garde le texte générique, n’invente pas de cible', () => {
    render(<IncompleteSearchNotice matched={2} axis={null} onWiden={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toMatch(/recherche/i)
  })

  it('nomme la zone quand elle est la contrainte posée', () => {
    render(<IncompleteSearchNotice matched={2} axis="zone" onWiden={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toMatch(/zone/i)
  })

  it('nomme l’effectif quand il est la contrainte posée', () => {
    render(<IncompleteSearchNotice matched={2} axis="headcount" onWiden={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toMatch(/effectif/i)
  })

  it('nomme la compétence quand elle est la contrainte posée', () => {
    render(<IncompleteSearchNotice matched={2} axis="skills" onWiden={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toMatch(/compétence/i)
  })
})

// #4420.4 (recette prod 25/10, Java + Fintech → 2 entreprises) — le nombre écarté par un critère se COMPTE et se dit
// quand il est mesuré ; « probablement » est interdit si on peut compter ; sinon « non mesuré ».
describe('IncompleteSearchNotice — #4420.4, les écartés se comptent', () => {
  it('dit « N écartées par la taille » quand le compte est mesuré, sans « probablement »', () => {
    render(<IncompleteSearchNotice matched={2} axis="headcount" discarded={{ headcount: 7 }} onWiden={vi.fn()} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/7 entreprises écartées par la taille/)
    expect(text).not.toMatch(/probablement/i)
  })

  it('un compte mesuré à zéro se dit aussi (« aucune »)', () => {
    render(<IncompleteSearchNotice matched={2} axis="headcount" discarded={{ headcount: 0 }} onWiden={vi.fn()} />)
    const text = screen.getByRole('status').textContent ?? ''
    expect(text).toMatch(/Aucune entreprise écartée par la taille/)
    expect(text).not.toMatch(/probablement/i)
  })

  it('sans mesure : « non mesuré », jamais « probablement » ni un zéro', () => {
    for (const axis of ['zone', 'headcount', 'skills'] as const) {
      const { unmount } = render(<IncompleteSearchNotice matched={2} axis={axis} onWiden={vi.fn()} />)
      const text = screen.getByRole('status').textContent ?? ''
      expect(text).toMatch(/non mesuré/i)
      expect(text).not.toMatch(/probablement/i)
      unmount()
    }
  })

  it('ajoute les écartées hors secteur quand elles sont comptées', () => {
    render(<IncompleteSearchNotice matched={2} axis={null} discarded={{ sector: 4 }} onWiden={vi.fn()} />)
    expect(screen.getByRole('status').textContent).toMatch(/4 entreprises écartées hors secteur/)
  })
})
