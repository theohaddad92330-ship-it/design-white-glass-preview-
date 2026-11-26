import { describe, expect, it } from 'vitest'
import {
  OUR_SUPPLIERS,
  accountFactsExportCells,
  emptyAccountFactsExportCells,
  supplierNamesIn,
  type TargetListItem,
} from '@bellum/contracts'
import {
  targetListAccountIds,
  targetListExportFilename,
  targetListItemsCsv,
  type TargetListExportLabels,
} from './target-list-export'

describe('targetListExportFilename — #2157.46', () => {
  it('slugifie le nom (accents, casse, ponctuation) et date le fichier', () => {
    expect(targetListExportFilename({ name: 'Banques régionales — T4' }, 'cible', Date.parse('2026-09-26'))).toBe(
      'cible-banques-regionales-t4-2026-09-26.csv',
    )
  })

  it('un nom sans caractère alphanumérique retombe sur « sans-nom », jamais un fichier sans nom', () => {
    expect(targetListExportFilename({ name: '——' }, 'cible', Date.parse('2026-09-26'))).toBe(
      'cible-sans-nom-2026-09-26.csv',
    )
  })
})

describe('#4073.1 — les faits du compte dans le CSV de la liste', () => {
  const labels: TargetListExportLabels = {
    kind: 'Type',
    label: 'Fiche',
    sublabel: 'Détail',
    priority: 'Priorité',
    owner: 'Responsable',
    workStatus: 'Statut',
    provenance: 'Provenance',
    nextAction: 'Action suivante',
    selectionReason: 'Pourquoi',
    kindLabel: { account: 'Compte', contact: 'Contact' },
    priorityLabel: () => 'Haute',
    workStatusLabel: () => 'À faire',
    provenanceLabel: () => 'Ajout manuel',
    ownerNone: 'Personne',
    ownerUnknown: 'Ancien membre',
    facts: {
      lastHiring: 'Dernier recrutement',
      lastNeed: 'Dernier besoin',
      lastSignal: 'Dernier signal',
      dealWon: 'Affaire gagnée',
      dealLost: 'Affaire perdue',
      mission: 'Mission',
    },
  }
  const item = (over: Partial<TargetListItem>): TargetListItem =>
    ({
      id: 'i1',
      target_list_id: 'l1',
      kind: 'account',
      ref_id: 'acc-1',
      label: 'Sanofi',
      sublabel: null,
      selection_reason: null,
      priority: null,
      owner_user_id: null,
      work_status: 'to_do',
      provenance: 'manual',
      refreshed_at: null,
      removed_at: null,
      removal_reason: null,
      next_action: null,
      ...over,
    }) as TargetListItem
  const cells = { ...emptyAccountFactsExportCells(), lastHiring: '2026-03-02 — Architecte cloud' }
  const parse = (csv: string) => (csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv).trim().split(/\r?\n/)

  it('sans faits, le fichier garde exactement ses colonnes d’avant', () => {
    const [header] = parse(targetListItemsCsv([item({})], [], labels))
    expect(header).not.toContain('Dernier recrutement')
  })

  it('avec faits : six colonnes en plus, remplies pour un compte, VIDES pour un contact et un compte sans fait', () => {
    const csv = targetListItemsCsv(
      [
        item({}),
        item({ id: 'i2', ref_id: 'acc-2', label: 'Orange' }),
        item({ id: 'i3', kind: 'contact', ref_id: 'c1' }),
      ],
      [],
      labels,
      { 'acc-1': cells, 'acc-2': emptyAccountFactsExportCells() },
    )
    const [header, a, b, c] = parse(csv)
    expect(header).toContain('Dernier recrutement')
    expect(header).toContain('Mission')
    expect(a).toContain('2026-03-02 — Architecte cloud')
    for (const line of [b, c]) {
      expect(line).not.toContain('2026-')
      expect(line).not.toMatch(/(^|,)"?0"?(,|$)/)
      expect(line.endsWith(',""'.repeat(6))).toBe(true)
    }
  })

  it('#4073.2 — le fichier entier ne nomme aucun fournisseur ni outil, même quand un libellé en portait un', () => {
    for (const { name } of OUR_SUPPLIERS) {
      const dirty = accountFactsExportCells([
        { kind: 'signal', date: '2026-04-01', label: `Levée vue chez ${name}`, weight: 1, ageDays: 3 },
        { kind: 'need', date: '2026-02-01', label: `${name} — refonte SI`, weight: 1, ageDays: 3 },
      ])
      const csv = targetListItemsCsv([item({})], [], labels, { 'acc-1': dirty })
      expect(supplierNamesIn(csv)).toEqual([])
    }
  })

  it('targetListAccountIds ne demande que les comptes vivants, une fois chacun', () => {
    expect(
      targetListAccountIds([
        item({}),
        item({ id: 'i2' }),
        item({ id: 'i3', ref_id: 'acc-3', removed_at: '2026-09-01T00:00:00.000Z' }),
        item({ id: 'i4', kind: 'contact', ref_id: 'c1' }),
      ]),
    ).toEqual(['acc-1'])
  })
})
