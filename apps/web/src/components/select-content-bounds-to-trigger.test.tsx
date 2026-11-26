import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SelectField } from '@bellum/ui'

/**
 * #3712 — recette prod 08/10 : le menu déroulant du select « Associer à un
 * projet » (`ContactAssociateProject.tsx`) s'ouvrait à ~1480 px de large.
 *
 * Cause : `SelectContent` (`packages/ui/src/components/select.tsx`) ne posait
 * qu'un `min-w-[var(--radix-select-trigger-width)]` sur son viewport — AUCUNE
 * borne haute. Un libellé d'option long (un nom de projet, de compte…) faisait
 * grandir tout le menu à sa largeur de contenu, bien au-delà du déclencheur
 * qui l'a ouvert — ni le natif ni aucun autre menu Radix du produit n'a ce
 * défaut, parce qu'aucun des deux ne pose de `min-w` SANS son pendant `max-w`.
 *
 * ⚠️ CE TEST VIT DANS `apps/web` : `packages/ui` n'a ni vitest ni
 * `@testing-library/react` (voir `select-field.test.tsx`). jsdom ne calcule
 * aucune vraie largeur ; la preuve porte donc sur la classe Tailwind qui BORNE
 * la largeur, pas sur un pixel mesuré.
 */

afterEach(cleanup)

const LONG_LABEL =
  'Bank as a Service — refonte complète du middleware de paiement interbancaire pour la direction des opérations groupe'

describe('SelectContent se borne à son déclencheur, même avec un libellé long (#3712)', () => {
  it('le viewport du menu porte une largeur MAX liée au déclencheur, pas seulement une largeur MIN', async () => {
    render(
      <SelectField
        ariaLabel="Projet"
        value=""
        onChange={vi.fn()}
        options={[{ value: 'p1', label: LONG_LABEL }]}
        placeholder="Choisir un projet"
      />,
    )

    await userEvent.click(screen.getByRole('combobox'))
    await screen.findByRole('option', { name: LONG_LABEL })

    const viewport = document.querySelector('[data-radix-select-viewport]')
    expect(viewport).not.toBeNull()
    expect(viewport!.className).toContain('min-w-[var(--radix-select-trigger-width)]')
    expect(viewport!.className).toContain('max-w-[var(--radix-select-trigger-width)]')
  })
})
