import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { DiscoverEmpty, DiscoverError, DiscoverUnverifiable } from './DiscoverStates'

/**
 * #2136 — un client bêta a lu l'état « non vérifiable » comme une panne.
 * Le markup capturé pointait bien `DiscoverUnverifiable` (icône HelpCircle sur
 * un fond d'avertissement), pas `DiscoverError`. Rien n'avait planté — c'est
 * la PERCEPTION qui trompait : un point d'interrogation sur fond ambre parle
 * le même langage visuel qu'une alerte. Ce fichier verrouille le correctif :
 * une icône neutre pour cet état honnête, distincte de la VRAIE panne.
 *
 * ⚠️ Le TON (le fond `var(--warning-soft-bg)` / `var(--info-soft-bg)`) ne se
 * vérifie PAS ici : jsdom (cssstyle) rejette silencieusement toute valeur de
 * style contenant `var(...)`, quelle que soit la propriété — `style={{ color:
 * 'var(--x)' }}` rend un attribut `style` VIDE, sur un `<div>` comme sur un
 * `<svg>`, qu'il y ait une régression ou non. Un test qui comparerait cet
 * attribut serait TOUJOURS vert : une garde borgne. Le signal fiable en jsdom
 * est l'IDENTITÉ de l'icône (sa classe `lucide-*`, une chaîne plate, pas du
 * CSS) et le libellé rendu.
 */
describe('DiscoverUnverifiable — se lit comme un résultat honnête, pas une panne (#2136)', () => {
  it('ne porte plus l’icône « point d’interrogation » — la régression exacte du retour client', () => {
    const { container } = render(<DiscoverUnverifiable entries={[]} onRetry={vi.fn()} />)

    expect(container.querySelector('.lucide-help-circle')).not.toBeInTheDocument()
  })

  it('porte une icône neutre (Info), pas celle de la panne (Radar)', () => {
    const { container } = render(<DiscoverUnverifiable entries={[]} onRetry={vi.fn()} />)

    expect(container.querySelector('.lucide-info')).toBeInTheDocument()
    expect(container.querySelector('.lucide-radar')).not.toBeInTheDocument()
  })

  it('le libellé se lit comme un résultat honnête, jamais comme une panne', () => {
    render(<DiscoverUnverifiable entries={[]} onRetry={vi.fn()} />)

    expect(screen.getByText(/résultat non vérifiable/i)).toBeInTheDocument()
    expect(screen.getByText(/pas une panne/i)).toBeInTheDocument()
  })

  it('reste distinct de DiscoverError, qui garde son icône de VRAIE panne (Radar)', () => {
    const { container: error } = render(<DiscoverError onRetry={vi.fn()} />)

    // `DiscoverError` ne doit JAMAIS perdre son icône de panne au passage.
    expect(error.querySelector('.lucide-radar')).toBeInTheDocument()
    expect(error.querySelector('.lucide-info')).not.toBeInTheDocument()
    expect(screen.getByText(/la recherche a échoué/i)).toBeInTheDocument()
  })
})

/**
 * #2535.1 — l'écran affichait TOUJOURS « Le service n'a pas pu être joint »,
 * même quand le serveur classait la VRAIE cause (délai dépassé à 45 s pendant
 * qu'une autre analyse tournait, panne amont, critères refusés). Ce test
 * verrouille la DISTINCTION : passer le `code` de l'erreur change la phrase.
 */
describe('DiscoverError — la vraie raison du serveur, pas un message générique (#2535.1)', () => {
  it('nomme le délai dépassé quand le serveur code `discover_timeout`', () => {
    render(<DiscoverError onRetry={vi.fn()} error={new ApiError('x', 503, 'discover_timeout')} />)
    expect(screen.getByText(/prend plus de temps que prévu/i)).toBeInTheDocument()
    expect(screen.queryByText(/n['’]a pas pu être joint/i)).not.toBeInTheDocument()
  })

  it('nomme la panne amont quand le serveur code `discover_upstream_error`', () => {
    render(<DiscoverError onRetry={vi.fn()} error={new ApiError('x', 503, 'discover_upstream_error')} />)
    expect(screen.getByText(/temporairement indisponible/i)).toBeInTheDocument()
  })

  it('nomme les critères refusés quand le serveur code `discover_invalid_filters`', () => {
    render(<DiscoverError onRetry={vi.fn()} error={new ApiError('x', 422, 'discover_invalid_filters')} />)
    expect(screen.getByText(/critères/i)).toBeInTheDocument()
  })

  it('retombe sur le message générique sans code (panne réseau) ou sans erreur passée', () => {
    render(<DiscoverError onRetry={vi.fn()} />)
    expect(screen.getByText(/n['’]a pas pu être joint/i)).toBeInTheDocument()
  })

  it('propose toujours le geste « Réessayer »', () => {
    render(<DiscoverError onRetry={vi.fn()} error={new ApiError('x', 503, 'discover_timeout')} />)
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })
})

/**
 * #2550.1 — zéro résultat distingue trois causes ICI (la quatrième, « source
 * en panne », est un état DISTINCT — `DiscoverUnverifiable`, rendu à la place
 * de `DiscoverEmpty` par `Discover.tsx` — jamais mélangée à celui-ci).
 */
describe('DiscoverEmpty — trois causes nommées, pas un « aucune entreprise » générique (#2550.1)', () => {
  it('nomme le secteur non appliqué plutôt que « aucune entreprise »', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="sectorUnsupported" />)
    expect(screen.getAllByText(/secteur/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Aucune entreprise ne correspond')).not.toBeInTheDocument()
  })

  it('nomme les filtres empilés plutôt que « aucune entreprise »', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="filtersNarrow" />)
    expect(screen.getAllByText(/filtres/i).length).toBeGreaterThan(0)
    expect(screen.queryByText('Aucune entreprise ne correspond')).not.toBeInTheDocument()
  })

  it('garde le message par défaut sans raison plus précise (repli honnête)', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="noMatch" />)
    expect(screen.getByText('Aucune entreprise ne correspond')).toBeInTheDocument()
  })

  it('sans prop `reason` (appelants existants), retombe sur le message par défaut', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} />)
    expect(screen.getByText('Aucune entreprise ne correspond')).toBeInTheDocument()
  })
})

// #4400.1 — l'état vide dit aussi les termes ÉTENDUS qui ont été essayés.
describe('DiscoverEmpty — #4400.1 dit les termes étendus essayés', () => {
  it('« archi cyber » : le zéro nomme « architecte » et « cybersécurité »', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="skillsNoMatch" skills="archi cyber" />)
    expect(screen.getByText(/Aucune entreprise ne montre « archi cyber »/)).toBeInTheDocument()
    const tried = screen.getByTestId('empty-expanded-terms')
    expect(tried).toHaveTextContent('architecte')
    expect(tried).toHaveTextContent('cybersécurité')
  })

  it('un mot sans abréviation connue : aucune ligne « essayé aussi » (jamais un synonyme deviné)', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="skillsNoMatch" skills="java" />)
    expect(screen.queryByTestId('empty-expanded-terms')).not.toBeInTheDocument()
  })
})

describe('#4419.6 — plusieurs compétences se lisent « Java, Vue »', () => {
  it('une saisie collée « Java,Vue » est nommée avec une espace après la virgule', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="skillsNoMatch" skills="Java,Vue" />)
    expect(screen.getByText(/Aucune entreprise ne montre « Java, Vue »/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Java,Vue')
  })
})

// #4436.3 (recette R23g) — « /discover aéronautique » vide SANS état : une recherche sans résultat montre toujours un état vide
// qui le dit, avec un geste (élargir) — jamais une zone blanche.
describe('DiscoverEmpty — une recherche sans résultat n’est jamais une zone blanche (#4436.3)', () => {
  it.each(['noMatch', 'filtersNarrow', 'allSetAside', 'sectorUnsupported', 'skillsNoMatch'] as const)(
    'cause %s : un texte visible ET un geste pour élargir',
    reason => {
      const onWiden = vi.fn()
      const { container } = render(
        <DiscoverEmpty onWiden={onWiden} onSwitchToSignals={vi.fn()} reason={reason} skills="aéronautique" />,
      )
      expect((container.textContent ?? '').trim().length).toBeGreaterThan(20)
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    },
  )
})

// #4627 — tous les comptes trouvés écartés : l'écran ne dit pas « trop de filtres » quand il n'y en a pas.
describe('DiscoverEmpty — tous écartés (#4627)', () => {
  it('ne parle pas de filtres empilés et dit que les comptes trouvés sont écartés', () => {
    render(<DiscoverEmpty onWiden={vi.fn()} onSwitchToSignals={vi.fn()} reason="allSetAside" />)
    expect(screen.queryByText(/filtres empilés/i)).not.toBeInTheDocument()
    expect(screen.getByText(/écartés/i)).toBeInTheDocument()
  })
})
