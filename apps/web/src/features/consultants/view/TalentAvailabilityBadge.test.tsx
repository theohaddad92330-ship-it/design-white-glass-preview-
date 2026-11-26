import { describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { TalentRow } from '@bellum/contracts'
import { TalentAvailabilityBadge } from './TalentAvailabilityBadge'

/**
 * Ce que le vivier DIT de la disponibilité de quelqu'un.
 *
 * Trois gardes, chacune contre une phrase fausse affichée à un commercial. Ce
 * composant est monté dans la vraie ligne de liste — la leçon du PDF 2 : un
 * composant testé isolément peut être inerte une fois monté, donc on vérifie
 * ici le RENDU, pas le calcul (qui a ses propres tests dans `@bellum/contracts`).
 */
function row(over: Partial<TalentRow> = {}): TalentRow {
  return {
    id: 'c1',
    kind: 'consultant',
    fullName: 'Yanis Berthier',
    title: 'Ingénieur plateforme',
    seniority: 'senior',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'unknown', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 620,
    financeVisible: false,
    contractType: 'cdi',
    engagementKind: 'salarie',
    zones: [],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: null,
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [],
    skillCount: 0,
    hasCv: false,
    workMode: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('TalentAvailabilityBadge', () => {
  it('ne conclut PAS quand rien n’est connu — ni déclaration, ni affectation', () => {
    cleanup()
    render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'inconnu' })} />)
    // « À confirmer », jamais « Disponible » : une base vide n'est pas une disponibilité.
    expect(screen.getByText('À confirmer')).toBeInTheDocument()
    expect(screen.queryByText('Disponible')).not.toBeInTheDocument()
  })

  it('aucune affectation mais une déclaration : la déclaration fait foi, MARQUÉE comme telle (Louis 23/10/2026)', () => {
    cleanup()
    render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'immediate' })} />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(/gagne sur le planning/)).toBeInTheDocument()
    // Le planning ne sait rien : il n'est pas cité, jamais « Planning : À confirmer ».
    expect(screen.queryByText(/Planning : /)).not.toBeInTheDocument()
  })

  it('#3488 — disponibilité jamais saisie : « non déclarée », pas « la fiche dit « Non renseignée » »', () => {
    cleanup()
    render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'inconnu' })} />)
    expect(screen.getByText('non déclarée')).toBeInTheDocument()
    expect(screen.queryByText(/la fiche dit/)).not.toBeInTheDocument()
  })

  it('montre la date de libération plutôt qu’un simple « occupé »', () => {
    cleanup()
    render(
      <TalentAvailabilityBadge
        row={row({ staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 } })}
      />,
    )
    expect(screen.getAllByText(/30\/11\/2026/).length).toBeGreaterThan(0)
  })

  it('n’invente aucune fin quand l’affectation n’en a pas', () => {
    cleanup()
    render(
      <TalentAvailabilityBadge
        row={row({
          staffing: { availability: 'busy_open_ended', loadPercent: 100, freeFrom: null, assignments: 1 },
        })}
      />,
    )
    expect(screen.getByText('En mission, sans date de fin')).toBeInTheDocument()
  })

  it('la disponibilité DÉCLARÉE gagne sur le planning, qui reste nommé à côté (Louis 23/10/2026)', () => {
    cleanup()
    // Décision Louis (lot TALENTS-REPRISE) : la déclaration de la personne
    // l'emporte ; le planning de missions reste lisible, jamais caché, jamais
    // présenté comme une erreur « à corriger ».
    render(
      <TalentAvailabilityBadge
        row={row({
          declaredAvailability: 'immediate',
          staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 },
        })}
      />,
    )
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(/gagne sur le planning/)).toBeInTheDocument()
    expect(screen.getByText(/Planning : En mission jusqu’au/)).toBeInTheDocument()
    expect(screen.queryByText(/à corriger/)).not.toBeInTheDocument()
  })

  it('ne crie pas quand la fiche et les affectations s’accordent', () => {
    cleanup()
    render(
      <TalentAvailabilityBadge
        row={row({
          declaredAvailability: 'immediate',
          staffing: { availability: 'available', loadPercent: 0, freeFrom: '2026-08-20', assignments: 2 },
        })}
      />,
    )
    expect(screen.queryByText(/à corriger/)).not.toBeInTheDocument()
  })

  /**
   * La provenance — piège n°2 du PDF 22, ticket BEL-ATS-003.
   *
   * ⚠️ Elle est VISIBLE, pas au survol. Le document la voulait « au survol » ;
   * au clavier et au toucher il n'y a pas de survol, et un `title=` n'est
   * atteignable ni au doigt ni à la tabulation. Une ligne toujours affichée est
   * l'« autrement » le plus simple : elle ne demande aucun geste, elle est lue
   * par un lecteur d'écran dans l'ordre du document, et le composant en rendait
   * déjà une dans deux de ses branches.
   */
  describe('la provenance dit d’où sort la valeur', () => {
    it('distingue ce qui est DÉCLARÉ de ce qui est DÉDUIT', () => {
      // #3672 revient sur le libellé « saisi par quelqu'un », délibérément ; ce qui tient :
      // le déclaré garde sa propre étiquette (« Information de ton équipe »), le déduit n'en emprunte aucune.
      cleanup()
      render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'immediate' })} />)
      // Aucune affectation : la source est la fiche, saisie par quelqu'un.
      expect(screen.getByText(/Information de ton équipe/)).toBeInTheDocument()
      expect(screen.getByText(/la fiche le déclare/)).toBeInTheDocument()
    })

    it('nomme la mission qui court, avec sa date', () => {
      cleanup()
      render(
        <TalentAvailabilityBadge
          row={row({ staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-09-30', assignments: 1 } })}
        />,
      )
      expect(screen.getByText(/une mission court jusqu’au 30\/09\/2026/)).toBeInTheDocument()
      // Déduit des affectations, jamais « Information de ton équipe ».
      expect(screen.queryByText(/Information de ton équipe/)).not.toBeInTheDocument()
    })

    it('n’annonce AUCUNE libération sur une affectation sans fin', () => {
      cleanup()
      render(
        <TalentAvailabilityBadge
          row={row({
            staffing: { availability: 'busy_open_ended', loadPercent: 100, freeFrom: null, assignments: 1 },
          })}
        />,
      )
      expect(screen.getByText(/aucune libération annoncée/)).toBeInTheDocument()
    })

    it('dit « source inconnue » plutôt qu’un défaut plausible', () => {
      cleanup()
      render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'inconnu' })} />)
      expect(screen.getByText(/source inconnue/)).toBeInTheDocument()
      expect(screen.queryByText(/la fiche le déclare/)).not.toBeInTheDocument()
    })
  })

  /**
   * #2186.9 — CHAQUE ÉTAT DÉCLARÉ PORTE SA SOURCE.
   *
   * `consultants.source` (d'où vient la FICHE) existait déjà, testé et
   * affiché sur l'onglet Profil/Consentement — mais jamais relié à l'endroit
   * où la disponibilité DÉCLARÉE s'affiche. Un commercial qui lit « la fiche
   * dit disponible » ne pouvait pas savoir si c'était une saisie manuelle ou
   * une extraction de CV jamais relue.
   */
  describe('#2186.9 — l’origine de la fiche accompagne la valeur DÉCLARÉE', () => {
    it('nomme l’origine quand elle est connue', () => {
      cleanup()
      render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'immediate', source: 'cv' })} />)
      expect(screen.getByText('CV déposé')).toBeInTheDocument()
    })

    it('dit « origine non renseignée » plutôt qu’un défaut plausible', () => {
      cleanup()
      render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'immediate', source: null })} />)
      expect(screen.getByText('Origine non renseignée')).toBeInTheDocument()
    })
  })

  /**
   * #2500 (BLOQUANT, mesuré en prod le 17/09/2026) — « À coDfismer » : dans la
   * colonne étroite du vivier, le badge et le texte déclaratif débordaient sur
   * la colonne voisine. La ligne flex n'avait pas `min-w-0` (`min-width: auto`
   * sur un enfant de flex, cause racine notée dans `index.css`), le texte pas
   * de `truncate`. Cette garde sait dire NON : elle échoue sans ces classes.
   */
  describe('la ligne ne déborde jamais sur la colonne voisine (#2500)', () => {
    it('#3488 — le texte déclaratif se lit EN ENTIER (retour à la ligne, pas de troncature)', () => {
      cleanup()
      const { container } = render(<TalentAvailabilityBadge row={row({ declaredAvailability: 'inconnu' })} />)
      const declared = screen.getByText('non déclarée')
      expect(declared.className).not.toMatch(/\btruncate\b/)
      expect(declared.className).toMatch(/\bbreak-words\b/)
      // Le parent flex direct rétrécit (`min-w-0`) ET passe à la ligne : le
      // texte ne déborde pas sur la colonne voisine, et ne se coupe pas.
      expect(declared.parentElement?.className).toMatch(/\bmin-w-0\b/)
      expect(declared.parentElement?.className).toMatch(/\bflex-wrap\b/)
      expect(container.querySelector('.flex.min-w-0.flex-col')).not.toBeNull()
      // #2500.1 (mesuré en recette le 17/09/2026) — une cellule tronquée porte
      // TOUJOURS son texte complet en `title`, même patron que le reste de la
      // ligne (`VivierTableRow.tsx`).
      expect(declared.getAttribute('title')).toBe(declared.textContent)
    })

    it('tronque la ligne « Planning : … » sous une déclaration', () => {
      cleanup()
      render(
        <TalentAvailabilityBadge
          row={row({
            declaredAvailability: 'immediate',
            staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 },
          })}
        />,
      )
      const contradiction = screen.getByText(/Planning : /)
      expect(contradiction.className).toMatch(/\btruncate\b/)
      expect(contradiction.parentElement?.className).toMatch(/\bmin-w-0\b/)
      // #2500.1 — voir ci-dessus.
      expect(contradiction.getAttribute('title')).toBe(contradiction.textContent)
    })
  })
})

/**
 * #2737 — dans une LIGNE du vivier, la disponibilité tient sur UNE ligne : le
 * badge et ce que la fiche déclare. La provenance et la source, qui faisaient
 * monter la ligne à trois étages, passent dans l'infobulle — jamais perdues.
 */
describe('TalentAvailabilityBadge — densité « ligne » (#2737)', () => {
  it('tient sur une seule ligne et garde provenance et source au survol', () => {
    const { container } = render(<TalentAvailabilityBadge density="row" row={row({ source: null })} />)
    const line = container.firstElementChild as HTMLElement
    expect(line.className).toMatch(/\bmin-w-0\b/)
    expect(line.className).not.toMatch(/\bflex-col\b/)
    const title = line.getAttribute('title') ?? ''
    expect(title).toContain('À confirmer')
    expect(title).toContain('source inconnue')
    expect(title).toContain('Origine non renseignée')
    expect(screen.queryByText('source inconnue')).toBeNull()
    cleanup()
  })

  it('déclarée : le badge dit la déclaration, la ligne secondaire nomme le planning (tronquée, jamais masquée)', () => {
    render(
      <TalentAvailabilityBadge
        density="row"
        row={row({
          declaredAvailability: 'immediate',
          staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 },
        })}
      />,
    )
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    const planning = screen.getByText(/Planning : En mission jusqu’au/)
    expect(planning.className).toMatch(/\btruncate\b/)
    expect(screen.queryByText(/à corriger/)).toBeNull()
    cleanup()
  })

  it('sans déclaration, le planning reste seul juge', () => {
    render(
      <TalentAvailabilityBadge
        density="row"
        row={row({ staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-11-30', assignments: 1 } })}
      />,
    )
    expect(screen.getByText(/En mission jusqu’au/)).toBeInTheDocument()
    expect(screen.queryByText(/gagne sur le planning/)).toBeNull()
    cleanup()
  })
})
