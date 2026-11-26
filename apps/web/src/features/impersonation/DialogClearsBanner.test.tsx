/**
 * SIMON-FIX (vu en passant c) — recette Simon 20/10 : sur « Changer ce que Laura lit » et « Pistes rapides »,
 * le titre était collé SOUS le bandeau d'incarnation et la croix de fermeture à ~10 px du bord.
 *
 * Deux promesses de la fenêtre partagée (`packages/ui/src/components/dialog.tsx`, UNE seule — GA-26) :
 *  - elle se pose sous le bandeau d'incarnation (`--impersonation-banner-height`, publiée par le bandeau) ;
 *  - sa croix est une cible de 44 px, dégagée du bord, au pointeur fin comme au doigt.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '@bellum/ui'

function open() {
  render(
    <Dialog open>
      <DialogContent closeLabel="Fermer">
        <DialogTitle>Pistes rapides</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  return { dialog: screen.getByRole('dialog'), close: screen.getByRole('button', { name: 'Fermer' }) }
}

describe('Dialog — dégage le bandeau d’incarnation et offre une vraie cible de fermeture', () => {
  it('sa position et sa hauteur maximale déduisent la hauteur du bandeau', () => {
    const { dialog } = open()
    expect(dialog.className).toContain('--impersonation-banner-height')
    expect(dialog.className).toMatch(/top-\[calc\(50%\+var\(--impersonation-banner-height/)
    expect(dialog.className).toMatch(/max-h-\[calc\(100dvh-2rem-var\(--impersonation-banner-height/)
  })

  it('la croix mesure 44 px (size-11) et ne colle pas au bord', () => {
    const { close } = open()
    expect(close.className).toContain('size-11')
    expect(close.className).toContain('right-2')
    expect(close.className).not.toMatch(/(^|\s)size-8(\s|$)/)
  })
})
