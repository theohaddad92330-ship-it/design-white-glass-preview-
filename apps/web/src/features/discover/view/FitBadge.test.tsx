import { render, screen } from '@testing-library/react'
import { FitBadge, ScoreFitBadge } from './FitBadge'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * `fitTierFor` rendait un palier unique — un mot, sans rien qui dise d'où il
 * vient. Ce fichier verrouille deux choses : le palier existant continue de
 * s'afficher SEUL quand personne ne passe le candidat (zéro régression sur
 * les deux appelants existants, `CandidateCard`/`CandidateRow`, hors du
 * périmètre de ce chantier) ; et, quand le candidat est fourni, ses cinq axes
 * NOMMÉS apparaissent à côté — y compris ceux qu'on ne peut pas évaluer.
 */
function candidate(over: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    score: 60,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: [],
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...over,
  }
}

describe('FitBadge', () => {
  it('affiche le palier seul quand aucun candidat n’est fourni — comportement inchangé', () => {
    const { container } = render(<FitBadge tier="high" />)
    expect(screen.getByText('Fit élevé')).toBeInTheDocument()
    // Rien d'autre : pas de bloc d'axes ajouté sans candidat à décomposer.
    expect(container.querySelectorAll('span, div')).toHaveLength(1)
  })

  it('nomme les axes mesurés ET ceux hors de portée quand le candidat est fourni', () => {
    render(<FitBadge tier="medium" candidate={candidate({ portfolioState: 'customer' })} />)

    expect(screen.getByText('Fit moyen')).toBeInTheDocument()
    // Sujets et Maturité : mesurés par défaut (aucun bloc non évalué).
    expect(screen.getByText('Sujets')).toBeInTheDocument()
    expect(screen.getByText('Maturité')).toBeInTheDocument()
    // Mission et Appétence : jamais mesurables au stade Découvrir, nommés
    // avec leur raison plutôt que simplement absents.
    expect(screen.getByText(/Taille de mission/)).toBeInTheDocument()
    expect(screen.getByText(/Appétence externe/)).toBeInTheDocument()
    expect(screen.getByText(/non mesurée au stade Découvrir/)).toBeInTheDocument()
  })

  it('note le précédent au maximum quand le compte est déjà client', () => {
    render(<FitBadge tier="medium" candidate={candidate({ portfolioState: 'customer' })} />)
    // 0 (Sujets, aucun facteur) + 0 (Maturité, aucun facteur) + 15 (Précédent, client) = 15/70
    expect(screen.getByText('15/70 · 2 axe(s) non évaluable(s)')).toBeInTheDocument()
    // O.3 (LOICFIX, 20/10) — chaque axe porte sa note sur son maximum, puis sa raison.
    expect(screen.getByText('15/15')).toBeInTheDocument()
    expect(screen.getByText(/— déjà client/)).toBeInTheDocument()
  })

  it('dit qu’il n’y a pas assez d’éléments plutôt que d’afficher un chiffre, sous le minimum d’axes mesurés', () => {
    render(<FitBadge tier="low" candidate={candidate({ scoreUnmeasured: ['signals', 'it_surface'] })} />)
    // Il ne reste que « Précédent » mesuré (1 < 3) : pas de score affiché.
    expect(screen.getByText(/pas assez d.{1,2}éléments/)).toBeInTheDocument()
    // Pas de score GLOBAL (« n/max · … ») ; les axes, eux, gardent leur note sur leur maximum (O.3).
    expect(screen.queryByText(/^\d+\/\d+ ·/)).not.toBeInTheDocument()
    // Les axes restent nommés malgré l'absence de score.
    expect(screen.getByText(/Sujets/)).toBeInTheDocument()
  })
})

// #3551 (recette 03/10) — toute note a son libellé.
describe('ScoreFitBadge — un score affiché porte toujours un libellé de fit', () => {
  it('nomme le palier faible « Fit faible » (25/100)', () => {
    render(<ScoreFitBadge candidate={candidate({ score: 25, scoreMax: 100 })} />)
    expect(screen.getByText('Fit faible')).toBeTruthy()
  })

  it('un score sans maximum mesurable est nommé « Fit non évalué », jamais nu', () => {
    render(<ScoreFitBadge candidate={candidate({ score: 25, scoreMax: null })} />)
    expect(screen.getByText('Fit non évalué')).toBeTruthy()
  })

  it('sans score, aucun libellé', () => {
    const { container } = render(<ScoreFitBadge candidate={candidate({ score: null, scoreMax: null })} />)
    expect(container.textContent).toBe('')
  })
})
