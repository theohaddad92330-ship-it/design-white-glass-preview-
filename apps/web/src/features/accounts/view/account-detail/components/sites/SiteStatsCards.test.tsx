import { cleanup, render, screen } from '@testing-library/react'
import { ObservedZoneCard } from './SiteStatsCards'

/**
 * #1608 / #1630.10 — l'empreinte de zone observée, rendue dans l'onglet Sites.
 *
 * Quatre garde-fous du retour, vérifiés MOT POUR MOT plutôt que par
 * paraphrase — c'est ce qu'un futur renommage casserait en silence sinon :
 *  1. la légende « Empreinte observée ≠ site officiel » est TOUJOURS là ;
 *  2. aucun marqueur ni vocabulaire de site OFFICIEL (pas de "siège", pas de
 *     "établissement") ne s'y glisse — ce serait confondre une observation
 *     avec un fait vérifié ;
 *  3. sous le seuil, ou ville absente : « Non mesuré », jamais « 0 » ni une
 *     zone inventée ;
 *  4. une panne de la mémoire marché SE DIT, elle ne se déguise pas en
 *     « non mesuré » — ce serait une bonne nouvelle fausse (GA-179).
 */

afterEach(() => cleanup())

describe('ObservedZoneCard — jamais un établissement officiel', () => {
  it('porte la légende obligatoire, dans les QUATRE états', () => {
    const caption = 'Empreinte observée ≠ site officiel'
    render(<ObservedZoneCard status="ok" zone={{ city: 'Lyon', region: null, country: null }} />)
    expect(screen.getByText(caption)).toBeInTheDocument()
    cleanup()

    render(<ObservedZoneCard status="ok" zone={null} />)
    expect(screen.getByText(caption)).toBeInTheDocument()
    cleanup()

    render(<ObservedZoneCard status="loading" zone={null} />)
    expect(screen.getByText(caption)).toBeInTheDocument()
    cleanup()

    render(<ObservedZoneCard status="unavailable" zone={null} />)
    expect(screen.getByText(caption)).toBeInTheDocument()
  })

  it('rend la ville, la région et le pays quand le corpus les connaît', () => {
    render(<ObservedZoneCard status="ok" zone={{ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' }} />)
    expect(screen.getByText('Lyon · Auvergne-Rhône-Alpes · France')).toBeInTheDocument()
  })

  it('rend seulement ce qui est connu — une zone PARTIELLE n’invente pas le reste', () => {
    render(<ObservedZoneCard status="ok" zone={{ city: 'Lyon', region: null, country: null }} />)
    expect(screen.getByText('Lyon')).toBeInTheDocument()
  })

  it('« Non mesuré », jamais « 0 », quand aucune zone n’est connue', () => {
    render(<ObservedZoneCard status="ok" zone={null} />)
    expect(screen.getByText('Non mesuré')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('une panne de la mémoire marché SE DIT — pas « non mesuré », pas de silence', () => {
    render(<ObservedZoneCard status="unavailable" zone={null} />)
    expect(screen.getByText('Observations du marché indisponibles')).toBeInTheDocument()
    expect(screen.queryByText('Non mesuré')).not.toBeInTheDocument()
  })

  it('l’état de chargement se distingue des deux autres', () => {
    render(<ObservedZoneCard status="loading" zone={null} />)
    expect(screen.queryByText('Non mesuré')).not.toBeInTheDocument()
    expect(screen.queryByText('Observations du marché indisponibles')).not.toBeInTheDocument()
  })

  it('n’emploie AUCUN vocabulaire de site officiel — l’interdit du retour', () => {
    render(<ObservedZoneCard status="ok" zone={{ city: 'Lyon', region: null, country: null }} />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/siège|établissement|SIRET/i)
  })
})
