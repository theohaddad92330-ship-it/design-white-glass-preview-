import { describe, expect, it } from 'vitest'
import type { TalentRow } from '@bellum/contracts'
import { staffingProvenance } from './staffingProvenance'

/**
 * D'où sort la disponibilité affichée — la question du piège n°2 du PDF 22.
 *
 * « Disponible » DÉDUIT d'une absence d'affectation et « disponible » DÉCLARÉ
 * par la personne sont deux faits différents. Les confondre envoie un commercial
 * positionner quelqu'un qui n'a rien promis. Ces tests fixent la frontière.
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
    updatedAt: '2026-08-12T09:30:00.000Z',
    ...over,
  }
}

describe('staffingProvenance', () => {
  it('DÉCLARÉE quand aucune affectation n’est enregistrée — avec la date de la fiche', () => {
    // « la fiche le déclare, le 12/08 » (PDF 5 §1.4, ligne 1 du tableau).
    const provenance = staffingProvenance(row({ declaredAvailability: 'immediate' }))
    expect(provenance).toEqual({ kind: 'declared', detail: 'card', observedAt: '2026-08-12T09:30:00.000Z' })
  })

  it('DÉDUITE quand une mission court jusqu’à une date connue', () => {
    // « une mission court jusqu’au 30/09 » (ligne 2 du tableau).
    const provenance = staffingProvenance(
      row({ staffing: { availability: 'busy', loadPercent: 100, freeFrom: '2026-09-30', assignments: 1 } }),
    )
    expect(provenance).toEqual({ kind: 'derived', detail: 'busyUntil', observedAt: '2026-09-30' })
  })

  it('DÉDUITE, sans date, quand l’affectation court sans fin connue', () => {
    // « affectation sans date de fin — aucune libération annoncée » (ligne 4).
    // ⚠️ Une affectation sans date de fin n'annonce JAMAIS une libération.
    const provenance = staffingProvenance(
      row({ staffing: { availability: 'busy_open_ended', loadPercent: 100, freeFrom: null, assignments: 1 } }),
    )
    expect(provenance).toEqual({ kind: 'derived', detail: 'openEnded', observedAt: null })
  })

  it('DÉDUITE, sans date, quand une affectation est active sans fin lisible', () => {
    // « affectation active, date de fin inconnue » (ligne 3). Ce cas ne sort pas
    // de `deriveStaffing` — il sort d'une ligne construite autrement, et il ne
    // doit pas retomber en silence sur la ligne 2, qui annoncerait une date.
    const provenance = staffingProvenance(
      row({ staffing: { availability: 'partial', loadPercent: 60, freeFrom: null, assignments: 1 } }),
    )
    expect(provenance).toEqual({ kind: 'derived', detail: 'activeNoEnd', observedAt: null })
  })

  it('DÉDUITE quand des affectations existent mais qu’aucune ne court', () => {
    // Ce n'est PAS le même fait que « la fiche le déclare » : ici on a regardé
    // les affectations, et elles disent que la personne est libre.
    const provenance = staffingProvenance(
      row({ staffing: { availability: 'available', loadPercent: 0, freeFrom: '2026-09-01', assignments: 3 } }),
    )
    expect(provenance).toEqual({ kind: 'derived', detail: 'noneRunning', observedAt: '2026-09-01' })
  })

  it('dit « source inconnue » plutôt qu’un défaut plausible', () => {
    // Aucune affectation ET une fiche qui ne déclare rien : il n'y a pas de
    // source. Écrire « la fiche le déclare » ici serait inventer une provenance.
    const provenance = staffingProvenance(row({ declaredAvailability: 'inconnu' }))
    expect(provenance).toEqual({ kind: 'unknownSource' })
  })

  it('dit « source inconnue » quand la fiche déclare sans porter de date', () => {
    // La provenance est la source ET la date. Une date absente ne se remplace
    // pas par aujourd'hui — ce serait dater une déclaration qu'on n'a pas datée.
    const provenance = staffingProvenance(row({ declaredAvailability: 'immediate', updatedAt: '' }))
    expect(provenance).toEqual({ kind: 'declared', detail: 'card', observedAt: null })
  })
})
