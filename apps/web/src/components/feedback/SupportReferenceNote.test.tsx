import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import { SupportReferenceNote } from './SupportReferenceNote'
import { rememberSupportReference } from '@/lib/support-reference'

/**
 * #2442.5 — la référence support s'affiche sur un écran d'erreur.
 *
 * Doctrine : « on n'affiche pas ce qu'on n'a pas » — dans une LISTE, une
 * absence ne fait AUCUNE ligne. Ici l'absence de référence ne fait donc ni
 * ligne, ni tiret, ni « — ».
 */
describe('#2442.5 — la référence support à l’écran', () => {
  beforeEach(() => rememberSupportReference(null))

  it('affiche la référence de la dernière erreur de l’API', () => {
    rememberSupportReference('BLM-3F2A1B4C')
    render(<SupportReferenceNote />)
    expect(screen.getByText(/BLM-3F2A1B4C/)).toBeInTheDocument()
  })

  it('n’affiche RIEN sans référence — une absence ne fait aucune ligne', () => {
    const { container } = render(<SupportReferenceNote />)
    expect(container).toBeEmptyDOMElement()
  })

  it('SAIT DIRE NON — une référence mal formée n’atteint jamais l’écran', () => {
    rememberSupportReference('<img src=x onerror=alert(1)>')
    const { container } = render(<SupportReferenceNote />)
    expect(container).toBeEmptyDOMElement()
  })

  it('la référence est SÉLECTIONNABLE — elle se lit au téléphone et se colle dans un ticket', () => {
    rememberSupportReference('BLM-3F2A1B4C')
    render(<SupportReferenceNote />)
    const value = screen.getByText('BLM-3F2A1B4C')
    expect(value.className).toContain('select-all')
  })
})
