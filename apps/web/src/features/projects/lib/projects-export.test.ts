import type { ProjectRow } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildProjectsCsv, projectsExportColumns } from './projects-export'

const label = (key: string) => key
const base = {
  id: 'p-1',
  account_id: 'a-1',
  company_name: 'Sopra Steria',
  label: 'Refonte SI',
  stage: 'qualification',
  stage_entered_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-15T10:00:00.000Z',
  expected_close_on: '2026-12-15',
  owner_id: 'u-1',
  owner_name: 'Claire Martin',
  amount_cents: 1250000,
  source: null,
  next_action: { title: 'Appeler la DSI', due_on: '2026-10-25' },
} as unknown as ProjectRow

const parse = (csv: string): string[][] =>
  csv
    .replace('﻿', '')
    .split('\n')
    .map(line => line.split('","').map(cell => cell.replace(/^"|"$/g, '')))

const ctx = {
  header: label,
  stageLabel: (stage: string) => `étape:${stage}`,
  originOf: () => null,
  ownerName: (_id: string | null) => 'Claire Martin',
  now: new Date('2026-10-21T00:00:00.000Z'),
}

describe('#4295.14 — l’export de la liste filtrée des affaires', () => {
  it('porte toujours l’affaire, le compte, l’étape et les dates, plus les colonnes visibles', () => {
    expect(projectsExportColumns(['owner'])).toEqual([
      'project',
      'account',
      'stage',
      'owner',
      'stageEnteredOn',
      'lastActivityOn',
      'expectedCloseOn',
    ])
  })

  it('garde l’ordre canonique et n’ajoute que ce qui est visible', () => {
    expect(projectsExportColumns(['age', 'amount', 'nextAction', 'origin'])).toEqual([
      'project',
      'account',
      'stage',
      'origin',
      'amount',
      'nextAction',
      'nextActionDueOn',
      'stageEnteredOn',
      'lastActivityOn',
      'expectedCloseOn',
      'ageDays',
    ])
  })

  it('exporte une ligne par affaire de la liste donnée, valeurs lues telles quelles', () => {
    const csv = buildProjectsCsv([base], ['owner', 'amount', 'nextAction'], ctx)
    const [head, row] = parse(csv)
    expect(head).toEqual([
      'project',
      'account',
      'stage',
      'owner',
      'amount',
      'nextAction',
      'nextActionDueOn',
      'stageEnteredOn',
      'lastActivityOn',
      'expectedCloseOn',
    ])
    expect(row).toEqual([
      'Refonte SI',
      'Sopra Steria',
      'étape:qualification',
      'Claire Martin',
      '12500',
      'Appeler la DSI',
      '2026-10-25',
      '2026-10-01',
      '2026-10-15',
      '2026-12-15',
    ])
  })

  it('NON : une valeur absente reste une cellule vide, jamais « 0 »', () => {
    const empty = {
      ...base,
      amount_cents: null,
      next_action: null,
      expected_close_on: null,
      company_name: null,
    } as ProjectRow
    const [, row] = parse(buildProjectsCsv([empty], ['amount', 'nextAction', 'age'], { ...ctx, ownerName: () => null }))
    expect(row).toContain('')
    expect(row?.[1]).toBe('')
    expect(row?.[3]).toBe('')
    expect(row).not.toContain('0')
  })

  it('NON : une liste vide ne produit que l’en-tête (aucune ligne inventée)', () => {
    expect(parse(buildProjectsCsv([], [], ctx))).toHaveLength(1)
  })

  it('NON : une cellule qui commence par = est neutralisée (injection de formule)', () => {
    const csv = buildProjectsCsv([{ ...base, label: '=HYPERLINK("x")' } as ProjectRow], [], ctx)
    expect(csv).toContain(`'=HYPERLINK`)
  })

  it('compte l’âge en jours dans l’étape quand la colonne est visible', () => {
    const [, row] = parse(buildProjectsCsv([base], ['age'], ctx))
    expect(row?.at(-1)).toBe('19')
  })
})
