import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bellum/ui'

/**
 * #2509 — « corrige la modale, le bouton dépasse ».
 *
 * Mesuré en production sur « Nouvelle conversation » (/chat, `ScopeDialog`) :
 * `DialogContent` (`max-w-xl`) mesurait 576×900 dans une fenêtre de 805 de
 * haut, à `y = −47` — la fenêtre débordait des deux côtés, et son pied de
 * boutons sortait de l'écran, hors d'atteinte au clic comme au clavier.
 *
 * `DialogContent` (`packages/ui`, la fenêtre PARTAGÉE — 76 appelants) n'avait
 * AUCUNE borne de hauteur : n'importe quel contenu plus long que l'écran
 * débordait, quel que soit l'appelant. Ce contrat vaut donc pour TOUTE
 * fenêtre du produit, pas seulement `ScopeDialog`.
 */
describe('DialogContent — contrat de hauteur (#2509)', () => {
  it('borne sa hauteur à la fenêtre et défile en entier plutôt que de déborder', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Fermer">
          <DialogHeader>
            <DialogTitle>Titre</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <div>corps</div>
          <DialogFooter>
            <button type="button">Confirmer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog')
    // `max-h-*` : un plafond ne peut PAS rendre une boîte plus haute que le
    // viewport — c'est la forme que `le-document-ne-defile-jamais.test.ts`
    // (GA-256) laisse déjà passer sans exception nommée.
    // SIMON-FIX — le plafond retranche aussi le bandeau d'incarnation (0 hors incarnation).
    expect(dialog.className).toMatch(/max-h-\[calc\(100dvh-2rem(-var\(--impersonation-banner-height,0px\))?\)\]/)
    // Sans défilement, le plafond coupe le pied de boutons plutôt que de le
    // rendre atteignable : les deux vont nécessairement ensemble.
    expect(dialog.className).toMatch(/overflow-y-auto/)
  })

  it('le bouton du pied reste dans le DOM de la fenêtre — atteignable en faisant défiler', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Fermer">
          <DialogHeader>
            <DialogTitle>Titre</DialogTitle>
          </DialogHeader>
          <div style={{ height: '2000px' }}>corps très long</div>
          <DialogFooter>
            <button type="button">Confirmer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )
    // jsdom ne calcule aucune géométrie (jsdom ne peint rien) : la preuve
    // possible ici est que le bouton reste un DESCENDANT du même conteneur
    // borné et défilant — jamais hors de son DOM, comme un `position: fixed`
    // sur un pied de page l'aurait détaché.
    const dialog = screen.getByRole('dialog')
    const button = screen.getByRole('button', { name: 'Confirmer' })
    expect(dialog).toContainElement(button)
  })

  it('sait dire NON — le contenu adopté avant #2509 ne porte ni plafond ni défilement', () => {
    // Témoin destructif : la classe TELLE QU'ELLE ÉTAIT mesurée en production
    // (build `26.09.17-ts1789638092+git4a97c51f24`) ne portait ni l'un ni
    // l'autre — c'est exactement ce qui laissait 900 px déborder de 805.
    const avant =
      'fixed left-[50%] top-[50%] z-overlay grid w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border bg-[var(--bellum-surface-1)] p-6 shadow-lg duration-200 rounded-xl max-w-xl'
    expect(avant).not.toMatch(/max-h-\[calc\(100dvh-2rem(-var\(--impersonation-banner-height,0px\))?\)\]/)
    expect(avant).not.toMatch(/overflow-y-auto/)
  })
})
