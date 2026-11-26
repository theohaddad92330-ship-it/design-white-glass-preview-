/**
 * GA-378 — fermer un panneau modal rend le focus à qui l'a ouvert (#2436.4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ VÉRIFIÉ AVANT D'ÉCRIRE CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────
 * `Dialog`/`Sheet`/`AlertDialog` (`packages/ui/src/components/dialog.tsx`,
 * `sheet.tsx`, `alert-dialog.tsx`) enveloppent `@radix-ui/react-dialog`, qui
 * restaure le focus sur le déclencheur PAR DÉFAUT à la fermeture — sans code
 * produit à écrire, tant que personne n'appelle `event.preventDefault()`
 * dans `onCloseAutoFocus`. Un grep sur tout le dépôt
 * (`onCloseAutoFocus|onOpenAutoFocus`) trouve NEUF appelants ; six ne posent
 * que `onOpenAutoFocus` (laisser le focus au champ de recherche à
 * l'ouverture — comportement voulu), deux popovers de recherche
 * (`EsnNameField.tsx`, `CompanySearchField.tsx`) posent AUSSI
 * `onCloseAutoFocus={e => e.preventDefault()}` — mais leur `onOpenAutoFocus`
 * est ÉGALEMENT prévenu : le focus ne quitte jamais le champ de saisie, donc
 * il n'y a rien à restaurer — et `ScopeDialog.tsx` (#3697) redirige
 * EXPLICITEMENT vers le composer du fil qu'elle vient d'ouvrir/changer,
 * jamais vers le déclencheur : la prop reste absente par défaut (la modale
 * ne rompt jamais seule GA-378), c'est `Chat.tsx`, seul appelant, qui la
 * fournit. Aucun des trois ne casse la règle sans la nommer.
 *
 * Cette garde le prouve pour le cas GÉNÉRIQUE (`Dialog`) plutôt que de
 * FAIRE CONFIANCE au comportement par défaut d'une librairie tierce sans
 * jamais le rejouer : une mise à jour de `@radix-ui/react-dialog` qui
 * changerait ce défaut ferait tomber ce test, pas seulement un commentaire.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Button, Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@bellum/ui'

function Example() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Ouvrir</Button>
      </DialogTrigger>
      <DialogContent closeLabel="Fermer">
        <DialogTitle>Titre de test</DialogTitle>
        <DialogClose asChild>
          <Button>Confirmer</Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

describe('GA-378 — Dialog restaure le focus à la fermeture', () => {
  it('le focus revient sur le déclencheur après fermeture par Échap', async () => {
    const user = userEvent.setup()
    render(<Example />)

    const trigger = screen.getByRole('button', { name: 'Ouvrir' })
    await user.click(trigger)
    expect(await screen.findByText('Titre de test')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    // Radix restaure le focus de façon asynchrone (après l'animation de
    // sortie) : `findBy`/`waitFor` implicite via une assertion qui reflow —
    // on relit `document.activeElement` après que le dialogue a disparu.
    expect(screen.queryByText('Titre de test')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('le focus revient sur le déclencheur après un clic sur le bouton de fermeture', async () => {
    const user = userEvent.setup()
    render(<Example />)

    const trigger = screen.getByRole('button', { name: 'Ouvrir' })
    await user.click(trigger)
    const confirm = await screen.findByRole('button', { name: 'Confirmer' })
    await user.click(confirm)

    expect(screen.queryByText('Titre de test')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})
