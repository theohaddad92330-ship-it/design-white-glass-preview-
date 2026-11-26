import { render, screen } from '@testing-library/react'
import { QualificationBadge } from './QualificationBadge'
import type { DiscoverQualification } from '../lib/discover-types'

/**
 * Le badge de qualification (addendum final p35).
 *
 * Ce qui se teste, c'est la discipline d'affichage : on ne décore pas la
 * majorité des lignes, on ne montre jamais un verdict sans son motif, et un
 * code inconnu (une raison ajoutée côté serveur avant que le web ne suive) doit
 * dégrader vers la phrase serveur — jamais vers un identifiant machine à l'écran.
 */

function qualification(over: Partial<DiscoverQualification> = {}): DiscoverQualification {
  return { verdict: 'to_verify', code: 'no_employees', reason: 'Aucun salarié déclaré.', otherCodes: [], ...over }
}

describe('badge de qualification', () => {
  it('n’affiche rien sur un compte recommandé', () => {
    // Une pastille verte sur la majorité des lignes est du bruit : ce qui
    // mérite d'être signalé, c'est l'écart.
    const { container } = render(<QualificationBadge qualification={qualification({ verdict: 'recommended' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('n’affiche rien quand la réponse ne porte pas de qualification', () => {
    // Une réponse produite avant cette fonctionnalité doit se comporter
    // exactement comme avant.
    const { container } = render(<QualificationBadge qualification={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('montre le verdict ET son motif sur un compte à vérifier', () => {
    render(<QualificationBadge qualification={qualification()} />)
    expect(screen.getByText(/À vérifier/)).toBeInTheDocument()
    expect(screen.getByText(/aucun salarié déclaré/i)).toBeInTheDocument()
  })

  it('dit pourquoi un compte est écarté — jamais un verdict nu', () => {
    render(
      <QualificationBadge
        qualification={qualification({ verdict: 'excluded', code: 'natural_person', reason: 'Personne physique.' })}
      />,
    )
    expect(screen.getByText(/Écarté/)).toBeInTheDocument()
    expect(screen.getByText(/personne physique/i)).toBeInTheDocument()
  })

  it('retombe sur la phrase serveur pour un code que le web ne connaît pas encore', () => {
    render(
      <QualificationBadge
        qualification={qualification({ code: 'brand_new_reason', reason: 'Une raison toute neuve.' })}
      />,
    )
    expect(screen.getByText(/Une raison toute neuve/)).toBeInTheDocument()
    expect(screen.queryByText(/brand_new_reason/)).not.toBeInTheDocument()
  })
})

// #4358.4 — le rattachement d'un compte à son secteur par l'activité ou le site se NOMME, même recommandé.
describe('rattachement au secteur (#4358.4)', () => {
  it('nomme « rattaché par son activité » sur un compte recommandé', () => {
    render(
      <QualificationBadge
        qualification={qualification({
          verdict: 'recommended',
          code: null,
          sectorAttachment: { sector: 'ecommerce', via: 'activity' },
        })}
      />,
    )
    expect(screen.getByText('rattaché par son activité')).toBeInTheDocument()
  })

  it('nomme « rattaché par son site » quand le site le dit', () => {
    render(
      <QualificationBadge
        qualification={qualification({
          verdict: 'recommended',
          code: null,
          sectorAttachment: { sector: 'ecommerce', via: 'site' },
        })}
      />,
    )
    expect(screen.getByText('rattaché par son site')).toBeInTheDocument()
  })
})
