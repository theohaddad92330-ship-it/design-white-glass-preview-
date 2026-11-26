import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SignalFreshnessLine } from './SignalFreshnessLine'

const TODAY = new Date().toISOString()

describe('SignalFreshnessLine — #3682.3/.4/.5', () => {
  it('sépare la vérification (aujourd’hui) du dernier événement utile (juin 2026)', () => {
    render(<SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: '2026-06', state: 'current' }} />)
    const text = screen.getByTestId('signal-freshness-line').textContent ?? ''
    expect(text).toMatch(/Dernière vérification : aujourd’hui/)
    expect(text).toMatch(/dernier événement utile : juin 2026/)
    expect(text).not.toMatch(/historique/)
  })

  it('cas TF1 : un fait de 2024 garde sa date, se dit historique et ne passe pas pour une actualité', () => {
    render(<SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: '2024-10', state: 'historical' }} />)
    const text = screen.getByTestId('signal-freshness-line').textContent ?? ''
    expect(text).toMatch(/oct\. 2024 \(contexte historique\)/)
    expect(text).toMatch(/Aucun élément plus récent n’a été identifié/)
  })

  it('date inconnue : aucun événement affiché, jamais la date de vérification en remplacement', () => {
    render(<SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: null, state: 'undated' }} />)
    const text = screen.getByTestId('signal-freshness-line').textContent ?? ''
    expect(text).not.toMatch(/événement utile/)
  })

  it('la fréquence de veille n’apparaît que si elle est configurée', () => {
    const { rerender } = render(
      <SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: null, state: 'none' }} cadence="daily" />,
    )
    expect(screen.getByTestId('signal-freshness-line').textContent).toMatch(/au plus une fois par jour/)
    rerender(<SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: null, state: 'none' }} cadence={null} />)
    expect(screen.getByTestId('signal-freshness-line').textContent).not.toMatch(/une fois par jour/)
  })

  // #4283.8 — la fiche d'un compte suivi dit la date de la prochaine ré-analyse ; sans suivi, rien.
  it('dit la date de la prochaine ré-analyse automatique, et rien quand elle n’est pas annoncée', () => {
    const summary = { verifiedAt: TODAY, eventDate: null, state: 'none' as const }
    const { rerender } = render(<SignalFreshnessLine summary={summary} nextReanalysisAt="2026-11-04" />)
    expect(screen.getByTestId('signal-freshness-line').textContent).toMatch(
      /Prochaine ré-analyse automatique : le 4 novembre/,
    )
    rerender(<SignalFreshnessLine summary={summary} nextReanalysisAt={null} />)
    expect(screen.getByTestId('signal-freshness-line').textContent).not.toMatch(/ré-analyse/)
  })

  it('rien de mesuré : aucune ligne', () => {
    const { container } = render(<SignalFreshnessLine summary={{ verifiedAt: null, eventDate: null, state: 'none' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  // Recette 21/10 K4 — un compte suivi sans date dit pourquoi, dans l'onglet Signal aussi.
  it('un compte suivi sans date dit pourquoi : veille suspendue', () => {
    render(
      <SignalFreshnessLine
        summary={{ verifiedAt: TODAY, eventDate: '2026-06', state: 'current' }}
        nextReanalysisAt={null}
        nextReanalysisReason="suspended"
      />,
    )
    expect(screen.getByTestId('signal-freshness-line')).toHaveTextContent('Veille suspendue')
  })

  it('sait dire NON : sans raison ni date, aucune mention de ré-analyse', () => {
    render(<SignalFreshnessLine summary={{ verifiedAt: TODAY, eventDate: '2026-06', state: 'current' }} />)
    expect(screen.getByTestId('signal-freshness-line')).not.toHaveTextContent(
      /ré-analyse|Veille suspendue|Jamais analysé/,
    )
  })
})
