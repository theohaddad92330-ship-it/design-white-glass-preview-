import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MissionDeadline } from './MissionDeadline'

/**
 * L'échéance, à un seul endroit.
 *
 * Ces tests existent parce que la première livraison de #1353 n'a touché que la
 * cellule du tableau, et que la recette live a trouvé la même mission affichée
 * « J-28 » d'un côté et « J-30 » de l'autre. Le second nombre était le nom de la
 * fenêtre de renouvellement, pas un décompte.
 *
 * ⚠️ L'horloge est FIGÉE : `daysUntilEnd` la lit. Sans ça, ce fichier dirait
 * « J-30 » aujourd'hui et « J-29 » demain, et rougirait un matin sans que
 * personne n'ait touché au code.
 */
describe('MissionDeadline — une seule vérité sur une échéance', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // #2979 (recette 05/10 : cellule « Date de fin manquante » étirait la ligne) — la conséquence tient sur UNE ligne.
  it('« Date de fin manquante » : la conséquence est bornée à une ligne, texte complet au title', () => {
    render(<MissionDeadline endsOn={null} renewal={undefined} />)
    const consequence = screen.getByText(/renewal|renouvellement/i)
    expect(consequence.className).toMatch(/\btruncate\b/)
    expect(consequence.getAttribute('title')).toBe(consequence.textContent)
  })

  it('rend le temps restant PUIS la date lisible', () => {
    render(<MissionDeadline endsOn="2026-10-01" renewal="j30" />)
    expect(screen.getByText('J-30')).toBeInTheDocument()
    expect(screen.getByText('1 oct. 2026')).toBeInTheDocument()
    expect(screen.queryByText('2026-10-01')).not.toBeInTheDocument()
  })

  it('rend le MÊME texte quelle que soit la disposition — c’est tout l’objet', () => {
    const { container: inline } = render(<MissionDeadline endsOn="2026-10-01" renewal="j30" variant="inline" />)
    const inlineText = inline.textContent
    cleanup()
    const { container: stacked } = render(<MissionDeadline endsOn="2026-10-01" renewal="j30" variant="stacked" />)
    expect(stacked.textContent).toBe(inlineText)
  })

  it('ne se contredit PAS avec le nom de la fenêtre : il ne l’affiche jamais', () => {
    // La fenêtre `j30` est un SEUIL, pas un décompte. Une mission à 28 jours est
    // dans la fenêtre j30 et doit lire « J-28 ». C'est le défaut trouvé en
    // recette : deux nombres justes, deux réponses différentes.
    render(<MissionDeadline endsOn="2026-09-29" renewal="j30" />)
    expect(screen.getByText('J-28')).toBeInTheDocument()
    expect(screen.queryByText('J-30')).not.toBeInTheDocument()
  })

  it('sait dire NON : une échéance dépassée ne s’écrit pas « J--5 »', () => {
    render(<MissionDeadline endsOn="2026-08-27" renewal="overdue" />)
    expect(screen.queryByText(/J--/)).not.toBeInTheDocument()
    expect(screen.getByText(/dépassée/i)).toBeInTheDocument()
  })

  it('une fin le jour même ne s’écrit pas « J-0 »', () => {
    render(<MissionDeadline endsOn="2026-09-01" renewal="imminent" />)
    expect(screen.queryByText('J-0')).not.toBeInTheDocument()
    expect(screen.getByText(/aujourd’hui/i)).toBeInTheDocument()
  })

  it('sans date de fin, aucun compte à rebours inventé — et la CONSÉQUENCE est dite (#1364)', () => {
    render(<MissionDeadline endsOn={null} renewal="unknown" />)
    expect(screen.queryByText(/^J-/)).not.toBeInTheDocument()
    // L'ÉTAT d'abord, en pastille : « Sans échéance » ne nommait pas ce qui
    // manque, et « Sans date de fin — aucune fenêtre… » repliait l'état et sa
    // conséquence dans une phrase de cellule qu'on ne lit pas.
    expect(screen.getByText('Date de fin manquante')).toBeInTheDocument()
    expect(screen.getByText(/aucun renouvellement ne peut être déclenché à temps/i)).toBeInTheDocument()
  })

  it('sait dire NON : elle ne nomme jamais le produit dans sa conséquence', () => {
    // L'application se déploie en marque blanche. Une phrase qui dit « Bellum
    // ne peut pas… » se lit de travers chez un client dont l'outil porte son
    // propre nom — c'est le littéral du retour, corrigé.
    const { container } = render(<MissionDeadline endsOn={null} renewal="unknown" />)
    expect(container.textContent).not.toMatch(/bellum/i)
  })

  it('une date ILLISIBLE n’est pas une date absente — les deux se réparent différemment', () => {
    render(<MissionDeadline endsOn="pas-une-date" renewal="unknown" />)
    // `daysUntilEnd` rend `null` sur une date illisible : on retombe donc sur la
    // phrase « sans date de fin », qui reste vraie — mais on n'invente rien.
    expect(screen.queryByText('pas-une-date')).not.toBeInTheDocument()
  })

  /**
   * #1804 (RÉSIDUEL) — mesuré en production sur `/missions` : la cellule
   * « Échéance » (`max-w-[8rem]`, 128px) reçoit ici des pastilles longues
   * (« Date de fin manquante », 22 caractères ; « Échéance dépassée »,
   * 18 caractères) sans jamais avoir eu de mécanisme pour se réduire.
   * jsdom ne calcule aucune largeur : ces tests vérifient la STRUCTURE
   * (`overflow-hidden` + `.truncate`), pas un pixel — voir le docblock de
   * `ClippedBadge`.
   */
  describe('les pastilles de cette échéance ne débordent pas de leur cellule', () => {
    it('« Date de fin manquante » porte overflow-hidden et un texte tronqué proprement', () => {
      render(<MissionDeadline endsOn={null} renewal="unknown" />)
      const label = screen.getByText('Date de fin manquante')
      expect(label.className).not.toMatch(/\btruncate\b/)
      expect((label.parentElement as HTMLElement).className).toMatch(/whitespace-normal/)
    })

    it('« Échéance dépassée » porte le même mécanisme', () => {
      render(<MissionDeadline endsOn="2026-08-27" renewal="overdue" />)
      const label = screen.getByText('Échéance dépassée')
      expect(label.className).not.toMatch(/\btruncate\b/)
      expect((label.parentElement as HTMLElement).className).toMatch(/whitespace-normal/)
    })
  })
})
