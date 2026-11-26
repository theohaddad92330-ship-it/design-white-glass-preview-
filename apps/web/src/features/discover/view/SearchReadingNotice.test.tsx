import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { SearchReadingNotice } from './SearchReadingNotice'
import { DiscoverUnreadable } from './DiscoverStates'
import { DegradedBanner } from './DegradedBanner'
import { splitDegraded } from '@/features/discover/lib/discover-coverage'
import { requestReadingFrom } from '@/features/discover/lib/discover-reading'

/**
 * #2490 / #2496 — ce que l'écran dit d'une recherche en langage naturel.
 *
 * Mesuré en production le 17/09/2026 : « ESN spécialisées cybersécurité à
 * Toulouse » rendait CARGLASS, BNP Paribas et le CNRS sous un bandeau
 * « Résultats partiels — Le modèle d'analyse — injoignable — délai dépassé ».
 * Deux faux : la liste ne répondait pas à la demande, et ce qui manquait
 * n'était pas une panne — c'était l'angle d'approche, coupé par le temps.
 *
 * L'écran dit désormais, en français clair, sur QUOI la liste est filtrée, ce
 * qui n'a PAS été pris en compte, et — quand rien n'a été reconnu — invite à
 * préciser plutôt que de montrer le registre entier.
 */

const reading = (over: Record<string, unknown> = {}) =>
  requestReadingFrom({
    reading: {
      activities: ['esn'],
      place: 'Toulouse',
      placeUnverified: false,
      notApplied: [],
      unreadable: false,
      ...over,
    },
  })

describe('SearchReadingNotice — la demande, telle qu’elle a été appliquée', () => {
  it('nomme le lieu et le secteur appliqués', () => {
    render(<SearchReadingNotice reading={reading()} />)

    expect(screen.getByText(/filtrés sur Toulouse et le numérique/i)).toBeInTheDocument()
  })

  it('dit qu’un lieu non vérifié à temps n’est cherché que dans les adresses', () => {
    render(<SearchReadingNotice reading={reading({ placeUnverified: true })} />)

    expect(screen.getByText(/résultats filtrés sur une partie de ta demande/i)).toBeInTheDocument()
    expect(screen.getByText(/« Toulouse » n’a pas pu être vérifié à temps/i)).toBeInTheDocument()
  })

  it('#3512 — nomme le métier/la techno recrutés comme un profil, jamais comme un nom', () => {
    render(
      <SearchReadingNotice
        reading={reading({ activities: [], place: 'Île-de-France', hiringProfile: 'développeurs Python' })}
      />,
    )

    expect(screen.getByText(/Profil recherché : « développeurs Python »/)).toBeInTheDocument()
    expect(screen.queryByText(/le nom « développeurs Python »/)).not.toBeInTheDocument()
  })

  it('nomme ce qui n’a pas été pris en compte', () => {
    render(<SearchReadingNotice reading={reading({ notApplied: ['développeurs', 'Python'] })} />)

    expect(screen.getByText(/non pris en compte : développeurs, Python/i)).toBeInTheDocument()
  })

  it('un secteur d’application est nommé par son libellé, jamais par son code', () => {
    render(<SearchReadingNotice reading={reading({ activities: ['aerospace'] })} />)

    expect(screen.getByText(/Aéronautique & spatial/)).toBeInTheDocument()
    expect(screen.queryByText(/aerospace/)).not.toBeInTheDocument()
  })

  it('un texte court garde ses mots non lus comme recherche par nom, et le dit', () => {
    render(
      <SearchReadingNotice reading={reading({ activities: ['retail_banking'], place: null, name: 'Populaire' })} />,
    )

    expect(screen.getByText(/le nom « Populaire »/)).toBeInTheDocument()
  })

  it('#4945.2 — « dans les Hauts-de-France » : la zone est posée, jamais dite « non reconnue » en même temps', () => {
    render(
      <SearchReadingNotice
        reading={reading({ place: null, activities: [] })}
        freetext="développeur Java dans les Hauts-de-France"
      />,
    )
    expect(screen.queryByText(/hauts-de-france/i)).toBeNull()
    // Témoin : une vraie zone inconnue reste dite.
    render(<SearchReadingNotice reading={null} freetext="java dans les Atlantides" />)
    expect(screen.getByText(/atlantides/i)).toBeInTheDocument()
  })

  it('rien à dire, rien de rendu', () => {
    const { container } = render(<SearchReadingNotice reading={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('l’angle coupé par le temps n’est pas une panne de la liste', () => {
  const degraded = [{ source: 'claude', reason: 'network_error' }]

  it('#4519.22 — sort du bandeau « Résultats partiels », SANS bandeau d’excuse (angles rédigés ou absents)', () => {
    const { faults, anglesMissing } = splitDegraded(degraded)
    render(
      <>
        <DegradedBanner degraded={faults} />
        <SearchReadingNotice reading={null} />
      </>,
    )

    expect(screen.queryByText(/résultats partiels/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/injoignable/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/modèle d’analyse/i)).not.toBeInTheDocument()
    expect(anglesMissing.length).toBeGreaterThan(0)
    expect(screen.queryByText(/rédigés à temps/i)).not.toBeInTheDocument()
  })

  it('témoin : une vraie source tombée reste dans le bandeau', () => {
    const { faults, anglesMissing } = splitDegraded([{ source: 'recherche-entreprises', reason: 'network_error' }])

    expect(faults).toHaveLength(1)
    expect(anglesMissing).toHaveLength(0)
  })
})

describe('requestReadingFrom — une trace illisible ne s’invente pas', () => {
  it('rend null sans trace ou sur une trace mal formée', () => {
    expect(requestReadingFrom({})).toBeNull()
    expect(requestReadingFrom(undefined)).toBeNull()
    expect(requestReadingFrom({ reading: 'oui' })).toBeNull()
  })

  it('ignore les valeurs qui ne sont pas des textes', () => {
    expect(requestReadingFrom({ reading: { activities: ['esn', 3], notApplied: [null, 'Python'] } })).toEqual({
      activities: ['esn'],
      place: null,
      placeUnverified: false,
      name: null,
      hiringProfile: null,
      notApplied: ['Python'],
      unreadable: false,
    })
  })
})

describe('DiscoverUnreadable — rien de reconnu, rien d’affiché', () => {
  it('invite à préciser au lieu de montrer le registre entier', () => {
    render(<DiscoverUnreadable />)

    expect(screen.getByText(/précise ta demande/i)).toBeInTheDocument()
    expect(screen.getByText(/ESN à Toulouse/)).toBeInTheDocument()
  })
})

describe('#4945.1 — une zone non reconnue dans la phrase est dite à l’écran', () => {
  it('« talend en atlantide » : « atlantide » est nommée, sans lecture serveur', () => {
    render(<SearchReadingNotice reading={null} freetext="talend en atlantide" />)

    expect(screen.getByText(/« atlantide » n’a pas été reconnu comme zone/i)).toBeInTheDocument()
  })

  it('une zone reconnue, ou un nombre nu, ne dit rien', () => {
    const { container, rerender } = render(<SearchReadingNotice reading={null} freetext="talend en occitanie" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<SearchReadingNotice reading={null} freetext="java 11" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('garde #5002 — commune ambiguë proposée', () => {
  it('« Data Nice » propose la zone et un clic la pose ; « Data Strasbourg » ne propose rien', () => {
    const onSuggestCity = vi.fn()
    const { unmount } = render(
      <SearchReadingNotice reading={null} freetext="Data Nice" onSuggestCity={onSuggestCity} />,
    )
    fireEvent.click(screen.getByTestId('city-suggestion'))
    expect(onSuggestCity).toHaveBeenCalledWith('Nice')
    unmount()
    render(<SearchReadingNotice reading={null} freetext="Data Strasbourg" onSuggestCity={onSuggestCity} />)
    expect(screen.queryByTestId('city-suggestion')).toBeNull()
  })
})

describe('lot T 2c — un nom tapé seul garde les filtres d’avant : l’écran le DIT', () => {
  const decathlon = () => requestReadingFrom({ reading: { name: 'Decathlon' } })
  it('« Decathlon — filtres conservés : Java et Hauts-de-France » + « tout effacer »', () => {
    const onClearKept = vi.fn()
    render(
      <SearchReadingNotice
        reading={decathlon()}
        freetext="Decathlon"
        keptCriteria={['Java', 'Hauts-de-France']}
        onClearKept={onClearKept}
      />,
    )
    expect(screen.getByText(/Decathlon — filtres conservés : Java et Hauts-de-France/)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('clear-kept-filters'))
    expect(onClearKept).toHaveBeenCalledTimes(1)
  })

  it('aucun filtre conservé ⇒ aucune ligne ni bouton', () => {
    render(<SearchReadingNotice reading={decathlon()} freetext="Decathlon" keptCriteria={[]} onClearKept={() => {}} />)
    expect(screen.queryByTestId('clear-kept-filters')).toBeNull()
  })
})
