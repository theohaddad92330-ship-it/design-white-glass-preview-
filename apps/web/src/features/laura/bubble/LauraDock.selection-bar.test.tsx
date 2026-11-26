import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SelectionBar } from '@/features/accounts/view/accounts-list/SelectionBar'
import { LauraDock } from './LauraDock'

/**
 * Défaut MESURÉ en production (f9f23f887, 24/09/2026, recette #2157.10) : sur
 * `/accounts`, avec 2 comptes cochés, le bouton « Créer une cible » de la
 * barre de sélection (`SelectionBar.tsx`, fixée en bas d'écran, `z-40`) était
 * ENTIÈREMENT recouvert par le composer flottant de Laura (`z-widget`, 80) —
 * même bandeau bas d'écran, clic bloqué.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FAMILLE, ET LE MÉCANISME RETENU
 * ─────────────────────────────────────────────────────────────────────────
 * Toute barre d'actions FIXÉE en bas d'écran est exposée dès qu'une amorce
 * Laura (le rond, ou la ligne agrandie de `LauraIntroBar`) flotte au même
 * endroit — `SelectionBar.tsx` (`/accounts`) est la seule du dépôt qui soit
 * réellement `fixed` à ce jour (les barres de sélection de `/contacts`,
 * `/discover`, `/consultants`, des besoins et de l'onglet Contacts d'un
 * dossier vivent dans le flux normal de la page, pas en position `fixed`).
 *
 * Même doctrine que GA-205 (tiroirs vs. widget de retour) : PAS de montée de
 * z-index (`z-widget` doit rester au-dessus du contenu ordinaire), PAS de
 * correctif barre par barre (il se ré-oublierait à la prochaine barre
 * flottante écrite sans connaître ce défaut). Une barre de sélection
 * flottante s'enregistre auprès d'un compteur partagé
 * (`useRegisterSelectionBarOpen`, `packages/ui/src/hooks/use-selection-bar-open.ts`)
 * et `LauraDock` s'efface (rond ET ligne agrandie) tant que ce compteur est
 * > 0 — GA-386.
 *
 * jsdom ne mesure aucun pixel : cette garde prouve la RÈGLE (la barre publie
 * sa présence, le composer la consomme), pas une position à l'écran.
 */
function Harness() {
  const [selecting, setSelecting] = useState(true)
  return (
    <>
      <button type="button" onClick={() => setSelecting(value => !value)}>
        toggle-selection
      </button>
      {selecting ? (
        <SelectionBar
          count={2}
          onCompare={() => {}}
          onCreateTarget={() => {}}
          onRefreshSignals={() => {}}
          onRefreshContacts={() => {}}
          onDiscoverContacts={() => {}}
          onAnalyzeBatch={() => {}}
          onClear={() => {}}
        />
      ) : null}
      <LauraDock />
    </>
  )
}

describe('LauraDock cède le bandeau bas à une barre de sélection flottante ouverte', () => {
  it('le rond s’efface tant que la barre de /accounts est montée, et revient une fois retirée', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Harness />)

    // La barre existe bien, et son bouton est atteignable dans l'arbre — ce
    // que jsdom peut prouver, contrairement au recouvrement visuel lui-même.
    expect(await screen.findByRole('button', { name: /créer une cible/i })).toBeInTheDocument()

    const trigger = screen.getByRole('button', { name: /ouvrir/i, hidden: true })
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)

    await user.click(screen.getByRole('button', { name: 'toggle-selection' }))
    expect(trigger.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/)

    await user.click(screen.getByRole('button', { name: 'toggle-selection' }))
    expect(trigger.className).toMatch(/(?:^|\s)hidden(?:\s|$)/)
  })
})
