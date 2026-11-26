import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { TrendLine } from './TrendLine'

/**
 * LA dérivation d'écart du produit. Quatre tuiles du tableau de bord et quatre
 * totaux de l'écran manager la traversent : si elle se trompe, elle se trompe
 * partout — ce qui est justement l'intérêt d'un seul endroit.
 *
 * Les trois cas mesurés ne sont pas de la cosmétique. `previous = 0` interdit
 * TOUT pourcentage (« +100 % » sur une base nulle est un chiffre fabriqué), et
 * deux fenêtres vides se disent « aucun ce mois-ci » plutôt que « +0 % », qui
 * affirmerait qu'on a mesuré une stabilité.
 */
describe('TrendLine — trois états mesurés, et deux façons de se taire', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend un pourcentage quand la base de comparaison existe', () => {
    render(<TrendLine showCurrent trend={{ state: 'measured', current: 15, previous: 10 }} />)

    expect(screen.getByText(/15 ce mois-ci/)).toBeInTheDocument()
    expect(screen.getByText(/\+50 % vs mois précédent/)).toBeInTheDocument()
  })

  it('sous une base de 10, le delta absolu parle par défaut — le pourcentage avec l’option', () => {
    const { rerender } = render(<TrendLine showCurrent trend={{ state: 'measured', current: 6, previous: 4 }} />)
    expect(screen.getByText(/\+2/)).toBeInTheDocument()
    expect(screen.queryByText(/50 %/)).not.toBeInTheDocument()

    rerender(<TrendLine showCurrent keepPercentUnderSmallBase trend={{ state: 'measured', current: 6, previous: 4 }} />)
    expect(screen.getByText(/\+50 % vs mois précédent/)).toBeInTheDocument()
  })

  it('rend une BAISSE, avec son signe — un mois plus creux se dit', () => {
    render(<TrendLine showCurrent trend={{ state: 'measured', current: 5, previous: 10 }} />)

    expect(screen.getByText(/5 ce mois-ci/)).toBeInTheDocument()
    expect(screen.getByText(/−50 % vs mois précédent/)).toBeInTheDocument()
  })

  it("n'invente aucun pourcentage quand le mois précédent est à zéro", () => {
    render(<TrendLine showCurrent trend={{ state: 'measured', current: 6, previous: 0 }} />)

    expect(screen.getByText(/6 ce mois-ci/)).toBeInTheDocument()
    expect(screen.getByText(/rien le mois précédent/)).toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  it('#3544.3 : « 2 892 ce mois-ci » porte le séparateur de milliers du total', () => {
    render(<TrendLine showCurrent trend={{ state: 'measured', current: 2892, previous: 2000 }} />)
    expect(screen.getByText(/2[\u202f\u00a0 ]892 ce mois-ci/)).toBeInTheDocument()
  })

  it('dit « aucun ce mois-ci » plutôt que « stable » quand les deux fenêtres sont vides', () => {
    render(<TrendLine showCurrent trend={{ state: 'measured', current: 0, previous: 0 }} />)

    expect(screen.getByText('aucun ce mois-ci')).toBeInTheDocument()
    expect(screen.queryByText(/stable/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
  })

  /**
   * Un STOCK n'a pas de tendance recalculable : son état courant est écrasé à
   * chaque écriture et aucune fenêtre ne retrouve le mois dernier. On le DIT,
   * au lieu d'afficher un zéro qui se lirait « stable ».
   */
  it("nomme l'absence d'historique pour un compteur d'état, sans chiffre", () => {
    render(<TrendLine showCurrent trend={{ state: 'stock' }} />)

    expect(screen.getByText('état courant, sans historique')).toBeInTheDocument()
    expect(screen.queryByText(/\d/)).not.toBeInTheDocument()
  })

  it('ne rend RIEN quand il n y a ni mesure ni raison à donner', () => {
    const { container } = render(<TrendLine showCurrent trend={{ state: 'silent' }} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('rend les mêmes trois états en anglais', async () => {
    await i18n.changeLanguage('en')

    const { rerender } = render(<TrendLine showCurrent trend={{ state: 'measured', current: 15, previous: 10 }} />)
    expect(screen.getByText(/15 this month/)).toBeInTheDocument()
    expect(screen.getByText(/\+50% vs last month/)).toBeInTheDocument()

    rerender(<TrendLine showCurrent trend={{ state: 'measured', current: 6, previous: 0 }} />)
    expect(screen.getByText(/none last month/)).toBeInTheDocument()

    rerender(<TrendLine showCurrent trend={{ state: 'measured', current: 0, previous: 0 }} />)
    expect(screen.getByText('none this month')).toBeInTheDocument()

    rerender(<TrendLine showCurrent trend={{ state: 'stock' }} />)
    expect(screen.getByText('current state, no history')).toBeInTheDocument()
  })

  /**
   * « Une tendance se lit sans la couleur seule. » Le signe est dans le TEXTE
   * (`+` / `−`), pas seulement dans la classe : un lecteur daltonien, une
   * capture en noir et blanc et un lecteur d'écran lisent le même fait.
   */
  it('porte le sens dans le texte, pas seulement dans la couleur', () => {
    const { rerender } = render(<TrendLine showCurrent trend={{ state: 'measured', current: 15, previous: 10 }} />)
    expect(screen.getByText(/\+50 %/).textContent).toContain('+')

    rerender(<TrendLine showCurrent trend={{ state: 'measured', current: 5, previous: 10 }} />)
    expect(screen.getByText(/−50 %/).textContent).toContain('−')
  })
})
