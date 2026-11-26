import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { SectorPicker } from './SectorPicker'

/**
 * #2652.1 — « clarifier la lecture du bloc secteurs dans Tous les filtres ».
 *
 * Deux passes précédentes (#2466, #2506) ont réglé la hauteur du bloc FERMÉ
 * (grille 3 colonnes) et la taille des pastilles. Le bug déposé le 18/09,
 * APRÈS ces deux passes, portait sur la lecture d'un groupe OUVERT : sa liste
 * de secteurs restait confinée dans le tiers de largeur de sa case de grille,
 * ce qui empilait une colonne de texte étroite et dense — exactement le motif
 * que #2466 avait déjà corrigé pour la grille elle-même, mais pas propagé au
 * contenu déplié.
 *
 * Un groupe ouvert (dépli manuel OU auto-ouvert par la recherche) s'étale
 * donc sur toute la largeur de la grille : sa liste de secteurs respire au
 * lieu de s'empiler sur un tiers d'écran.
 *
 * #2652 — la grille ne compte plus ses colonnes sur un palier de fenêtre fixe
 * (`sm:grid-cols-2 lg:grid-cols-3`), donc « toute la largeur » ne se dit plus
 * `sm:col-span-2 lg:col-span-3` (un span qui suppose CE nombre de colonnes) :
 * `col-span-full` s'étale sur n'importe quel nombre de colonnes que l'auto-fit
 * pose réellement.
 */

afterEach(cleanup)

describe('#2652.1 — un groupe de secteurs ouvert prend toute la largeur', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un groupe fermé reste confiné à sa case de grille', () => {
    render(<SectorPicker selected={[]} onChange={() => {}} />)
    const chevrons = screen.getAllByRole('button', { expanded: false })
    expect(chevrons.length).toBeGreaterThan(0)
    const carte = chevrons[0].closest('div[class*="flex-col"]')
    expect(carte).not.toBeNull()
    expect(carte!.className).not.toContain('col-span')
  })

  it('déplier un groupe lui donne toute la largeur de la grille (col-span-full)', () => {
    render(<SectorPicker selected={[]} onChange={() => {}} />)
    const chevron = screen.getAllByRole('button', { expanded: false })[0]
    const carte = chevron.closest('div[class*="flex-col"]')!

    fireEvent.click(chevron)

    expect(carte.className).toContain('col-span-full')
  })

  it('un groupe auto-ouvert par la recherche prend aussi toute la largeur', () => {
    render(<SectorPicker selected={[]} onChange={() => {}} />)
    const recherche = screen.getByLabelText(/secteur/i, { selector: 'input' })

    fireEvent.change(recherche, { target: { value: 'santé' } })

    const chevronsOuverts = screen.queryAllByRole('button', { expanded: true })
    // Pendant une recherche le chevron manuel disparaît (l'ouverture devient
    // automatique) — c'est la case du GROUPE qui porte la preuve. Le libellé
    // du SECTEUR (pas celui du groupe, qui matche aussi « santé ») est unique.
    const carte = screen.getByText('Santé & hôpitaux').closest('div[class*="flex-col"]')
    expect(carte).not.toBeNull()
    expect(carte!.className).toContain('col-span-full')
    // Rien ne doit rester manuellement `aria-expanded=false` pendant la recherche.
    expect(chevronsOuverts).toHaveLength(0)
  })
})
