import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GeoPerimeterField } from './GeoPerimeterField'

// #2163.9 (Monde), #2163.10 (Pays) et #2163.11 (Région) — `geo_perimeter`/
// `geo_areas` étaient déclarés et testés côté contrat sans aucun appelant web.
describe('GeoPerimeterField (#2163.9, #2163.10, #2163.11)', () => {
  it('cadrage analyse (15/10) — « Où ? » : France d’abord, puis Europe, Monde, Pays, Région, Ville', () => {
    render(<GeoPerimeterField value={undefined} onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    const labels = screen.getAllByRole('button').map(button => button.textContent)
    expect(labels).toEqual(['France', 'Europe', 'Monde', 'Pays', 'Région', 'Ville / site'])
    // « International » redisait « Monde » (aucune restriction) : retiré de l'écran.
    expect(screen.queryByRole('button', { name: 'International' })).not.toBeInTheDocument()
  })

  it('un clic sur « Monde » appelle onChange avec la valeur du contrat', () => {
    const onChange = vi.fn()
    render(<GeoPerimeterField value="france" onChange={onChange} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Monde' }))
    expect(onChange).toHaveBeenCalledWith('world')
  })

  it('ne montre le champ des zones QUE pour « Région »', () => {
    const { rerender } = render(
      <GeoPerimeterField value="france" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Régions ou zones')).not.toBeInTheDocument()

    rerender(<GeoPerimeterField value="region" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    expect(screen.getByLabelText('Régions ou zones')).toBeInTheDocument()
  })

  it('une zone saisie remonte à geo_areas', () => {
    const onGeoAreasChange = vi.fn()
    render(<GeoPerimeterField value="region" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={onGeoAreasChange} />)
    const field = screen.getByLabelText('Régions ou zones')
    fireEvent.change(field, { target: { value: 'Île-de-France' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onGeoAreasChange).toHaveBeenCalledWith(['Île-de-France'])
  })

  it('« Pays » (#2163.10) réutilise le sélecteur de pays existant, défaut FR sans geo_areas', () => {
    render(<GeoPerimeterField value="country" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('FR')
  })

  it('affiche le pays déjà choisi dans geo_areas[0]', () => {
    render(<GeoPerimeterField value="country" onChange={vi.fn()} geoAreas={['CH']} onGeoAreasChange={vi.fn()} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('CH')
  })
})

// #2163.12 « Ville / site » — `matches_geo` (scope_filter.py) porte
// maintenant la granularité ville ; ce champ en est le SEUL appelant web.
describe('GeoPerimeterField — « Ville / site » (#2163.12)', () => {
  it('montre le champ des villes QUE pour « Ville / site » — jamais pour Région', () => {
    const { rerender } = render(
      <GeoPerimeterField value="region" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Villes ou sites')).not.toBeInTheDocument()

    rerender(<GeoPerimeterField value="city" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    expect(screen.getByLabelText('Villes ou sites')).toBeInTheDocument()
  })

  it('une ville saisie remonte à geo_areas', () => {
    const onGeoAreasChange = vi.fn()
    render(<GeoPerimeterField value="city" onChange={vi.fn()} geoAreas={[]} onGeoAreasChange={onGeoAreasChange} />)
    const field = screen.getByLabelText('Villes ou sites')
    fireEvent.change(field, { target: { value: 'Lyon' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(onGeoAreasChange).toHaveBeenCalledWith(['Lyon'])
  })

  it('un clic sur « Ville / site » appelle onChange avec la valeur du contrat', () => {
    const onChange = vi.fn()
    render(<GeoPerimeterField value="france" onChange={onChange} geoAreas={[]} onGeoAreasChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ville / site' }))
    expect(onChange).toHaveBeenCalledWith('city')
  })
})
