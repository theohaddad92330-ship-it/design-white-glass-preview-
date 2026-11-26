import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TalentSelectionBar } from './TalentSelectionBar'

function renderBar(over: Partial<Parameters<typeof TalentSelectionBar>[0]> = {}) {
  const props = {
    count: 2,
    onClear: vi.fn(),
    onArchive: vi.fn(),
    archivePending: false,
    onExport: vi.fn(),
    exportAllowed: true,
    ...over,
  }
  render(<TalentSelectionBar {...props} />)
  return props
}

/**
 * #2662.1 à .3 — la barre de sélection.
 *
 * ⚠️ Le témoin le plus important de ce fichier : AUCUN libellé « Supprimer »
 * n'existe nulle part sur cette barre — la décision produit (QCM Louis,
 * 21/09/2026) est sélection + ARCHIVAGE + export, jamais une suppression.
 */
describe('TalentSelectionBar', () => {
  it('ne rend RIEN sur une sélection vide', () => {
    const { container } = render(
      <TalentSelectionBar
        count={0}
        onClear={() => {}}
        onArchive={() => {}}
        archivePending={false}
        onExport={() => {}}
        exportAllowed
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * #2081.14 — l'export est une SORTIE de données (décision Louis 19/09/2026) :
   * masqué, pas seulement désactivé, quand la règle d'espace le réserve aux
   * administrateurs — même patron que `ContactsSelectionBar.tsx`.
   */
  it('masque « Exporter » quand `exportAllowed` est faux, mais garde l’archivage', () => {
    renderBar({ exportAllowed: false })
    expect(screen.queryByRole('button', { name: 'Exporter la sélection (CSV)' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Archiver la sélection' })).not.toBeNull()
  })

  it('annonce le compte de la sélection', () => {
    renderBar({ count: 3 })
    expect(screen.getByText('3 profils sélectionnés')).not.toBeNull()
  })

  /**
   * #3781 — « supprimer » n'existe QUE comme l'effacement RGPD (c67), derrière
   * `onErase`. Sans lui (démonstration : la salle est partagée), le mot ne
   * figure nulle part sur la barre.
   */
  it('n’écrit « Supprimer » QUE si l’appelant fournit `onErase` (absent en démonstration)', () => {
    renderBar()
    expect(screen.queryByText(/supprimer/i)).toBeNull()
  })

  it('propose « Supprimer définitivement » quand `onErase` est fourni, et ne l’appelle qu’au clic', () => {
    const onErase = vi.fn()
    const props = renderBar({ onErase })
    expect(onErase).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer définitivement' }))
    expect(onErase).toHaveBeenCalledTimes(1)
    // Archiver reste le geste voisin, jamais remplacé.
    expect(screen.getByRole('button', { name: 'Archiver la sélection' })).not.toBeNull()
    expect(props.onArchive).not.toHaveBeenCalled()
  })

  it('appelle `onArchive` au clic sur « Archiver la sélection », jamais `onClear` ni `onExport`', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Archiver la sélection' }))
    expect(props.onArchive).toHaveBeenCalledTimes(1)
    expect(props.onClear).not.toHaveBeenCalled()
    expect(props.onExport).not.toHaveBeenCalled()
  })

  it('appelle `onExport` au clic sur « Exporter la sélection (CSV) »', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Exporter la sélection (CSV)' }))
    expect(props.onExport).toHaveBeenCalledTimes(1)
  })

  it('appelle `onClear` au clic sur « Tout désélectionner »', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }))
    expect(props.onClear).toHaveBeenCalledTimes(1)
  })

  it('désactive le bouton d’archivage et montre « Archivage… » pendant la mutation', () => {
    renderBar({ archivePending: true })
    const button = screen.getByRole('button', { name: /Archivage…/ })
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  // #3781 (recette prod 08-09/10) — « Tout sélectionner » ne prenait que la page
  // (20) et rien ne disait qu'il y en avait 186 : on le NOMME, et un geste lève la limite.
  it('#3781 — nomme ce que la sélection laisse dehors et propose de tout sélectionner (jusqu’à 500)', () => {
    const onSelectAll = vi.fn()
    renderBar({ count: 20, total: 186, onSelectAll })
    fireEvent.click(screen.getByRole('button', { name: 'Sélectionner les 186 profils' }))
    expect(onSelectAll).toHaveBeenCalledTimes(1)
  })

  it('#3781 — au-delà de 500, le bouton dit 500 (la borne d’un lot), jamais le total', () => {
    renderBar({ count: 20, total: 900, onSelectAll: vi.fn() })
    expect(screen.getByRole('button', { name: 'Sélectionner 500 profils sur 900' })).not.toBeNull()
  })

  it('#3781 — rien à proposer quand toute la liste est déjà sélectionnée', () => {
    renderBar({ count: 186, total: 186, onSelectAll: vi.fn() })
    expect(screen.queryByRole('button', { name: /Sélectionner/ })).toBeNull()
  })
})
