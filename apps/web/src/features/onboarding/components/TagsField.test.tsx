import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagsField } from './TagsField'

/**
 * #2002 (la famille) — « [le bouton] est trop petit », le même défaut au fond
 * du questionnaire.
 *
 * La croix qui retire une référence n'avait AUCUNE dimension : une icône de
 * 14 px, sans marge intérieure, donc une cible de 14 px au doigt — la « croix
 * de fermeture à 24 px » que `button.tsx` nomme déjà, en pire. Elle ne passe
 * pas par `Button`, donc le plancher posé dans les tailles du système ne
 * l'atteignait pas.
 *
 * ⚠️ jsdom ne mesure pas : on lit les classes. Pour une cible CARRÉE il en
 * faut deux (hauteur ET largeur) — un `min-h` seul laisse un trait de 14 px
 * de large.
 */
describe('TagsField — la croix de retrait est un geste, pas une décoration', () => {
  it('#2002 — atteint 44 px dans les DEUX dimensions au doigt (GA-30)', () => {
    render(<TagsField values={['Acme']} onChange={vi.fn()} />)

    const remove = screen.getByRole('button', { name: /Acme/ })
    expect(remove.className).toContain('pointer-coarse:min-h-11')
    expect(remove.className).toContain('pointer-coarse:min-w-11')
  })
})

/**
 * #2088.19 — « Tags libres : exemple ». Optionnel : absent tant qu'aucune
 * question réelle ne porte `Question.exampleKey` (kind 'tags') — jamais un nom
 * d'entreprise réel suggéré comme référence (docblock en tête de ce fichier).
 */
describe('TagsField — exemple de forme (#2088.19)', () => {
  it("n'affiche rien sans `example` (rendu historique)", () => {
    render(<TagsField values={[]} onChange={vi.fn()} />)
    expect(screen.queryByText(/Nom du client/)).toBeNull()
  })

  it('affiche l’exemple à côté du conseil de saisie', () => {
    render(<TagsField values={[]} onChange={vi.fn()} example="Ex. « Nom du client, secteur »." />)
    expect(screen.getByText('Ex. « Nom du client, secteur ».')).toBeInTheDocument()
  })

  it("masque l'exemple une fois le plafond atteint — le conseil devient « retire pour en ajouter »", () => {
    render(<TagsField values={['A']} onChange={vi.fn()} max={1} example="Ex. « Nom du client, secteur »." />)
    expect(screen.queryByText('Ex. « Nom du client, secteur ».')).toBeNull()
  })
})

/**
 * #2540 — Ludovic (call bêta 17/09) a créé sa société il y a quelques
 * semaines : zéro client, zéro mission, aucun témoignage. `optional: true`
 * (#2059.7) débloque déjà « Continuer » sur une liste vide, mais rien ne le
 * DISAIT à l'écran — l'utilisateur ne pouvait pas savoir que laisser le champ
 * vide était un choix accepté, pas un oubli qui allait le bloquer plus tard.
 */
describe('TagsField — champ facultatif VIDE : le choix de ne rien ajouter est dit (#2540)', () => {
  it("n'affiche aucune réassurance quand le champ n'est pas facultatif", () => {
    render(<TagsField values={[]} onChange={vi.fn()} />)
    expect(screen.queryByText(/laisser ce champ vide/i)).toBeNull()
  })

  it('un champ facultatif VIDE affiche que le laisser vide est un choix valable', () => {
    render(<TagsField values={[]} onChange={vi.fn()} optional />)
    expect(screen.getByText(/laisser ce champ vide/i)).toBeInTheDocument()
  })

  it('la réassurance disparaît dès qu’une entrée existe — plus rien à rassurer', () => {
    render(<TagsField values={['Acme']} onChange={vi.fn()} optional />)
    expect(screen.queryByText(/laisser ce champ vide/i)).toBeNull()
  })

  // #2540 — un « Je n'en ai pas encore » EXPLICITE, pas seulement un champ vide.
  it("propose « Je n'en ai pas encore » sur un champ facultatif vide, et le confirme au clic", () => {
    render(<TagsField values={[]} onChange={vi.fn()} optional />)
    const none = screen.getByRole('button', { name: /Je n'en ai pas encore/i })
    expect(none).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(none)
    expect(screen.getByRole('button', { name: /Noté/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it("n'affiche pas ce bouton sur un champ obligatoire ni sur un champ déjà rempli", () => {
    const { rerender } = render(<TagsField values={[]} onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Je n'en ai pas encore/i })).toBeNull()
    rerender(<TagsField values={['Acme']} onChange={vi.fn()} optional />)
    expect(screen.queryByRole('button', { name: /Je n'en ai pas encore/i })).toBeNull()
  })
})
