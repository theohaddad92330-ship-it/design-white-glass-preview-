import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SectorPicker } from './SectorPicker'

/**
 * #2466 — « mettre sur trois colonnes, ça prend bcp trop de hauteur » (retour
 * bêta du 16/09/2026, pointé sur le rail de Découvrir : 372 px de haut pour
 * 847 de large, c'est-à-dire une colonne de texte dans un écran qui en tenait
 * trois).
 *
 * Pourquoi une garde plutôt qu'un simple commit : une règle de mise en page qui
 * n'est pas gardée redevient une opinion en trois semaines, et celle-ci est
 * INVISIBLE en jsdom — aucun test de rendu ne mesure une hauteur, donc rien
 * n'aurait empêché le prochain passage de remettre `flex flex-col`.
 *
 * #2652 — cette grille comptait ses colonnes sur un palier de FENÊTRE
 * (`sm:grid-cols-2 lg:grid-cols-3`), alors qu'elle vit dans `Group()`
 * (`FilterRail.tsx`), qui divise déjà la modale sur ce même signal : à `lg`,
 * une puce héritait d'~65 px de large, un mot par ligne. Elle compte
 * maintenant ses colonnes sur sa largeur RÉELLE (`auto-fit`/`minmax`), qui ne
 * dépend plus de la fenêtre — ni d'un empilement forcé sous un palier fixe.
 * Tenu aussi par la garde d'architecture GA-373
 * (`une-colonne-se-mesure-a-son-conteneur.test.ts`), qui refuse la
 * COMPOSITION de deux grilles à palier de fenêtre, pas seulement cette
 * occurrence.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('#2466 — les groupes de secteurs se posent en colonnes', () => {
  function conteneur(): HTMLElement {
    render(<SectorPicker selected={[]} onChange={() => {}} />)
    // Le premier groupe est rendu : sans lui, la garde lirait un corpus vide et
    // serait verte pour rien.
    const groupes = screen.getAllByRole('button')
    expect(groupes.length).toBeGreaterThan(0)
    const premier = groupes[0].closest('div[class*="grid"], div[class*="flex-col"]')
    expect(premier).not.toBeNull()
    // Le conteneur des GROUPES est le parent de la carte d'un groupe.
    const racine = premier!.parentElement
    expect(racine).not.toBeNull()
    return racine as HTMLElement
  }

  it('plusieurs colonnes en large — dimensionnées par le CONTENU, jamais un empilement', () => {
    const racine = conteneur()
    expect(racine.className).toContain('grid')
    expect(racine.className).toContain('grid-cols-[repeat(auto-fit,minmax(200px,1fr))]')
  })

  it('#2652 — LE TÉMOIN : plus aucun palier de FENÊTRE sur ce conteneur', () => {
    const classes = conteneur().className
    expect(classes).not.toContain('sm:grid-cols-')
    expect(classes).not.toContain('lg:grid-cols-')
    expect(classes).not.toContain('md:grid-cols-')
  })
})
