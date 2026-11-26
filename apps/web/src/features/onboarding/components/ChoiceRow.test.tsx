import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceRow } from './ChoiceRow'

/**
 * #2088.27 — « État sélectionné très évident : fond + bord + coche +
 * contraste ». Avant ce lot, la seule ligne SÉLECTIONNÉE se distinguait par un
 * fond (`--bellum-surface-2`, partagé avec l'état hover de n'importe quelle
 * ligne) et un chevron dont la SEULE différence était la couleur — rien qui ne
 * dépende pas de la couleur seule (GA-67 : une couleur porte un état, mais un
 * état qui ne tient QUE sur une couleur échoue aussi le daltonisme).
 *
 * La coche est l'indice NON coloré : elle est absente quand la ligne n'est pas
 * choisie, présente quand elle l'est — la garde ci-dessous le prouve sans lire
 * une seule couleur.
 */
describe('ChoiceRow — état sélectionné (#2088.27)', () => {
  it("n'affiche aucune coche quand la ligne n'est pas sélectionnée", () => {
    render(<ChoiceRow label="Option A" selected={false} onClick={vi.fn()} />)
    expect(screen.queryByTestId('choice-row-check')).toBeNull()
  })

  it('affiche une coche quand la ligne EST sélectionnée', () => {
    render(<ChoiceRow label="Option A" selected onClick={vi.fn()} />)
    expect(screen.getByTestId('choice-row-check')).toBeInTheDocument()
  })

  it('layout carte : porte une bordure ACCENT quand sélectionnée, pas au repos', () => {
    // Le layout `list` vit DANS un `ChoiceList` déjà bordé (dividers
    // partagés) — lui ajouter une bordure par ligne dupliquerait le contour.
    // Une carte du grid `single` COURT (#2088.2) est en revanche ISOLÉE : rien
    // d'autre ne la délimite, donc c'est elle qui porte fond + bord + coche.
    const { rerender } = render(<ChoiceRow label="Option A" selected={false} layout="card" onClick={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Option A' })
    expect(button.className).not.toContain('accent-soft-border')

    rerender(<ChoiceRow label="Option A" selected layout="card" onClick={vi.fn()} />)
    expect(button.className).toContain('accent-soft-border')
  })

  it('annonce toujours son état via aria-pressed, même en layout carte', () => {
    render(<ChoiceRow label="Option A" selected layout="card" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Option A' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('le layout carte tient la cible tactile 44 px (GA-30)', () => {
    render(<ChoiceRow label="Option A" selected={false} layout="card" onClick={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Option A' }).className).toContain('pointer-coarse:min-h-11')
  })
})

/**
 * #2088.3 / #2087.9 — description (liste), exemple et icône (carte) : trois
 * props optionnelles, absentes tant qu'aucun choix ne les porte. Le mécanisme
 * est prouvé ICI en isolation (props synthétiques) — réparation 18/09 :
 * `lib/questions/role.test.ts` / `maturite.test.ts` le prouvent en plus sur
 * le catalogue RÉEL (`user_role`, `esn_maturity_situation`), après réfutation
 * en production le 18/09 (mécanisme câblé, aucun choix réel ne l'alimentait).
 */
describe('ChoiceRow — description, exemple, icône (#2088.3 / #2087.9)', () => {
  it("n'affiche aucune icône décorative sans iconKey (rendu historique)", () => {
    render(<ChoiceRow label="Option A" selected={false} layout="card" onClick={vi.fn()} />)
    // Le SEUL svg attendu au repos (non sélectionné, sans icône) : aucun —
    // la coche n'apparaît que sélectionné, l'icône que si `iconKey` est fournie.
    expect(screen.getByRole('button', { name: 'Option A' }).querySelector('svg')).toBeNull()
  })

  it('affiche la description sous le libellé (choix LONG, layout list)', () => {
    render(<ChoiceRow label="Option A" selected={false} onClick={vi.fn()} description="Une phrase explicative." />)
    expect(screen.getByText('Une phrase explicative.')).toBeInTheDocument()
  })

  it("affiche l'exemple sous le libellé (carte)", () => {
    render(
      <ChoiceRow
        label="Option A"
        selected={false}
        layout="card"
        onClick={vi.fn()}
        example="Ex. une PME de 20 salariés."
      />,
    )
    expect(screen.getByText('Ex. une PME de 20 salariés.')).toBeInTheDocument()
  })

  it('affiche une icône décorative quand iconKey est fournie', () => {
    render(<ChoiceRow label="Option A" selected={false} layout="card" onClick={vi.fn()} iconKey="building" />)
    const button = screen.getByRole('button', { name: 'Option A' })
    expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
  })

  it("l'icône ne remplace jamais le libellé : le nom accessible reste le texte", () => {
    render(<ChoiceRow label="Toute l'entreprise" selected={false} layout="card" onClick={vi.fn()} iconKey="building" />)
    expect(screen.getByRole('button', { name: "Toute l'entreprise" })).toBeInTheDocument()
  })
})
