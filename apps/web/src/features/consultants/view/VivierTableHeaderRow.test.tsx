import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VivierTableHeaderRow } from './VivierTableHeaderRow'
import { vivierColumnsFor } from './vivierTableColumns'

/**
 * #2737 (rouverte par Louis le 25/09/2026) — UN EN-TÊTE TIENT SUR UNE LIGNE.
 *
 * Historique : #2500 (en-têtes qui se chevauchaient) → `truncate` ; #2500.1
 * (six en-têtes tronqués à 1 440 px) → `break-words`. Ce dernier coupait les
 * mots LETTRE PAR LETTRE dans une colonne de 3 % (« Co/m/pl/ét/ud/e »). Le
 * défaut était la largeur, pas la classe : chaque colonne a désormais un
 * plancher en pixels qui tient son en-tête, et une colonne sans place
 * DISPARAÎT au lieu d'écraser son libellé. L'en-tête est donc sur une ligne,
 * avec ellipse de secours et libellé complet au survol.
 *
 * La mise en page réelle (aucun en-tête sur deux lignes, à 900, 1 100, 1 280
 * et 1 512 px) se MESURE dans `e2e/tests/web/vivier-table-layout.spec.ts` —
 * jsdom ne calcule aucune largeur.
 */
describe('VivierTableHeaderRow — un en-tête sur UNE ligne, jamais coupé dans un mot (#2737)', () => {
  it('chaque en-tête reste sur une ligne, sans jamais couper un mot', () => {
    render(
      <table>
        <VivierTableHeaderRow />
      </table>,
    )
    for (const heading of screen.getAllByRole('columnheader')) {
      expect(heading.className).toMatch(/\bwhitespace-nowrap\b/)
      expect(heading.className).not.toMatch(/\bbreak-words\b|\bbreak-all\b/)
    }
  })

  it('porte le libellé complet en `title` — et intégralement dans le texte affiché', () => {
    render(
      <table>
        <VivierTableHeaderRow />
      </table>,
    )
    const follow = screen.getByText('Suivi')
    expect(follow.getAttribute('title')).toBe('Suivi')
    const location = screen.getByText('Localisation')
    expect(location.getAttribute('title')).toBe('Localisation')
  })

  it('« Actions » reste nommée pour le lecteur d’écran, sans voler la place d’un bouton', () => {
    render(
      <table>
        <VivierTableHeaderRow />
      </table>,
    )
    expect(screen.getByText('Actions')).toHaveClass('sr-only')
  })
})

/**
 * #2737 — l'entête ne rend QUE les colonnes choisies pour la largeur mesurée,
 * avec leur part. Sait dire NON : à 700 px, séniorité n'est pas rendue ; sans
 * mesure, elle l'est.
 */
describe('VivierTableHeaderRow — les colonnes du conteneur mesuré (#2737)', () => {
  it('à 700 px, rend les colonnes obligatoires et pas « Suivi » (Théo C talents-vivier.R3)', () => {
    render(
      <table>
        <VivierTableHeaderRow columns={vivierColumnsFor(700)} />
      </table>,
    )
    expect(screen.getByText('Personne / expertise')).toBeInTheDocument()
    expect(screen.getByText('Disponibilité & planning')).toBeInTheDocument()
    expect(screen.getByText('Compétences déclarées')).toBeInTheDocument()
    expect(screen.queryByText('Séniorité')).toBeNull()
  })

  it('sans mesure, rend toutes les colonnes, et leurs parts font 100 %', () => {
    render(
      <table>
        <VivierTableHeaderRow />
      </table>,
    )
    expect(screen.getByText('Suivi')).toBeInTheDocument()
    const total = screen
      .getAllByRole('columnheader')
      .reduce((sum, heading) => sum + Number.parseFloat(heading.style.width), 0)
    expect(Math.abs(total - 100)).toBeLessThan(0.05)
  })
})

/**
 * #2662.1 — LA SÉLECTION GLOBALE, dans la colonne « Nom ».
 *
 * Trois états, jamais un booléen : rien coché, tout coché, et l'ÉTAT
 * INDÉTERMINÉ (certaines lignes cochées, pas toutes) — un booléen unique
 * aurait forcé à mentir sur l'un des deux bords.
 */
describe('VivierTableHeaderRow — la sélection globale (#2662.1)', () => {
  it('rend une case DÉCOCHÉE par défaut', () => {
    render(
      <table>
        <VivierTableHeaderRow />
      </table>,
    )
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false')
  })

  it('rend l’état INDÉTERMINÉ quand `someSelected` est vrai, jamais confondu avec « tout »', () => {
    render(
      <table>
        <VivierTableHeaderRow someSelected />
      </table>,
    )
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('mixed')
  })

  it('rend TOUT coché quand `allSelected` est vrai', () => {
    render(
      <table>
        <VivierTableHeaderRow allSelected />
      </table>,
    )
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true')
  })

  it('appelle `onToggleAll(true)` au clic quand rien n’est coché', () => {
    const onToggleAll = vi.fn()
    render(
      <table>
        <VivierTableHeaderRow onToggleAll={onToggleAll} />
      </table>,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleAll).toHaveBeenCalledWith(true)
  })

  it('appelle `onToggleAll(false)` au clic quand tout est déjà coché', () => {
    const onToggleAll = vi.fn()
    render(
      <table>
        <VivierTableHeaderRow allSelected onToggleAll={onToggleAll} />
      </table>,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggleAll).toHaveBeenCalledWith(false)
  })
})
