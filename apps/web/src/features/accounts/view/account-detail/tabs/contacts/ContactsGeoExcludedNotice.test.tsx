import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactsGeoExcludedNotice } from './ContactsGeoExcludedNotice'

// SIMON-FIX S.18 — le motif du périmètre se lit à l'écran, avec son périmètre nommé.
describe('ContactsGeoExcludedNotice', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('nomme le nombre de contacts écartés ET le périmètre choisi', () => {
    render(<ContactsGeoExcludedNotice data={{ country: 70, perimeters: ['France'], sites: 0, areas: [] }} />)
    expect(screen.getByText('70 contacts écartés par le périmètre')).toBeInTheDocument()
    expect(screen.getByText('Hors du périmètre géographique choisi (France).')).toBeInTheDocument()
  })

  it('un seul contact : singulier', () => {
    render(<ContactsGeoExcludedNotice data={{ country: 1, perimeters: ['Europe'], sites: 0, areas: [] }} />)
    expect(screen.getByText('1 contact écarté par le périmètre')).toBeInTheDocument()
  })
})
