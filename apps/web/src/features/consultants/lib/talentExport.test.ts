import { describe, expect, it } from 'vitest'
import type { TalentRow } from '@bellum/contracts'
import { generateTalentCSV } from './talentExport'

/** `toCsv` (lib/csv.ts) préfixe un BOM UTF-8 (Excel). Écrit par code plutôt
 *  que collé dans une regex : un caractère BOM littéral y déclenche
 *  `no-irregular-whitespace` (ESLint le lit comme un espace invisible). */
const BOM = String.fromCharCode(0xfeff)
function stripBom(csv: string): string {
  return csv.startsWith(BOM) ? csv.slice(BOM.length) : csv
}

function row(over: Partial<TalentRow> = {}): TalentRow {
  return {
    id: 'c1',
    kind: 'consultant',
    fullName: 'Yanis Berthier',
    title: 'Ingénieur plateforme',
    seniority: 'senior',
    declaredAvailability: 'inconnu',
    staffing: { availability: 'available', loadPercent: 0, freeFrom: null, assignments: 0 },
    tjm: 620,
    financeVisible: false,
    contractType: 'cdi',
    engagementKind: 'salarie',
    zones: ['Lyon'],
    lastMission: null,
    submissions: { open: 0, total: 0 },
    source: null,
    lastContactAt: '2026-09-12T08:00:00.000Z',
    archivedAt: null,
    reviewStatus: 'qualified',
    topSkills: [{ skill: 'kubernetes', label: 'Kubernetes', level: 'expert', source: 'declared' }],
    skillCount: 1,
    hasCv: false,
    workMode: 'hybride',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

/**
 * #2662.3 — l'export CSV de la sélection.
 *
 * ⚠️ Une valeur ABSENTE reste une case VIDE, jamais un « 0 » ni un tiret de
 * remplissage (gardes GA-18/GA-19) : c'est ce que la moitié « profil
 * incomplet » de ces tests prouve, ligne par ligne.
 */
describe('generateTalentCSV', () => {
  it('porte les en-têtes du tableau, dans le même ordre que les colonnes visibles', () => {
    const csv = generateTalentCSV([row()])
    const [headerLine] = stripBom(csv).split('\n')
    expect(headerLine).toBe(
      [
        // Théo C talents-vivier — les en-têtes du tableau ont été renommés ; le CSV les suit.
        'Personne / expertise',
        'Titre',
        'Compétences déclarées',
        'Séniorité',
        'Localisation',
        'Statut',
        'Disponibilité & planning',
        'TJM',
        'Télétravail',
        'Contrat',
        'Dernière interaction',
      ]
        .map(header => `"${header}"`)
        .join(','),
    )
  })

  it('remplit une ligne complète avec les valeurs RÉELLES de la fiche', () => {
    const csv = generateTalentCSV([row()])
    const [, dataLine] = stripBom(csv).split('\n')
    expect(dataLine).toBe(
      [
        'Yanis Berthier',
        'Ingénieur plateforme',
        'Kubernetes',
        'Senior',
        'Lyon',
        'Consultant',
        'Disponible',
        '620',
        'Hybride',
        'Salarié',
        '2026-09-12',
      ]
        .map(value => `"${value}"`)
        .join(','),
    )
  })

  it('laisse une case VIDE pour chaque champ absent — jamais « 0 », jamais un tiret', () => {
    const csv = generateTalentCSV([
      row({
        title: null,
        seniority: 'inconnu',
        zones: [],
        tjm: null,
        workMode: null,
        engagementKind: 'inconnu',
        lastContactAt: null,
        topSkills: [],
      }),
    ])
    const [, dataLine] = stripBom(csv).split('\n')
    const cells = dataLine?.split(',') ?? []
    // Colonnes : nom(0) titre(1) compétences(2) séniorité(3) localisation(4)
    // statut(5) disponibilité(6) tjm(7) télétravail(8) contrat(9) dernier contact(10)
    expect(cells[1]).toBe('""')
    expect(cells[2]).toBe('""')
    expect(cells[3]).toBe('""')
    expect(cells[4]).toBe('""')
    expect(cells[7]).toBe('""')
    expect(cells[8]).toBe('""')
    expect(cells[9]).toBe('""')
    expect(cells[10]).toBe('""')
    // Aucun zéro de remplissage nulle part sur cette ligne.
    expect(dataLine).not.toContain('"0"')
  })

  it('dit « Nom non renseigné » plutôt que d’exporter un nom de fichier déposé', () => {
    const csv = generateTalentCSV([row({ fullName: 'cv_anonyme_louis_ai-engineer-node_gw.pdf' })])
    const [, dataLine] = stripBom(csv).split('\n')
    expect(dataLine).toContain('"Nom non renseigné"')
  })

  it('rend une seule ligne d’en-tête sur une sélection vide', () => {
    const csv = generateTalentCSV([])
    expect(stripBom(csv).split('\n')).toHaveLength(1)
  })
})
