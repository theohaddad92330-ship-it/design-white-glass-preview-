import type { AccountMissions, ActionPlanItem, Activity, Contact, ProjectReadRow, Proof } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { WatchSignal } from '@/features/accounts/model/watch'
import type { GraphEntity } from '../components/entities/entityTypes'
import { buildDossierSearchItems } from './dossierSearchIndex'

/**
 * #2128.34-43 — L'INDEX LIT CE QUE LE DOSSIER A DÉJÀ CHARGÉ, DIX TYPES.
 *
 * Les formes d'entrée sont celles des lectures existantes (mêmes types de
 * contrat, mêmes extracteurs) : l'index n'invente ni champ ni valeur, et un
 * objet sans libellé n'entre pas — une ligne vide ne se retrouve pas.
 */
const contact = {
  id: 'c1',
  full_name: 'Sarah Martin',
  title: 'DSI',
  entity: 'Siège',
  updated_at: '2026-09-01',
} as Contact
const entity: GraphEntity = {
  id: 'e1',
  name: 'ACME Services',
  type: 'filiale',
  parent: null,
  region: 'Lyon',
  level: 1,
  actionable: true,
  source: 'analysis',
  scopeKind: 'commercial',
}
const signal = {
  id: 's1',
  signal: 'Levée de fonds',
  category: 'finance',
  date: '2026-08-20',
  source: 'presse',
} as unknown as WatchSignal
const project = {
  id: 'p1',
  label: 'Migration cloud',
  kind: 'project',
  stage: 'qualified',
  updated_at: '2026-07-01',
} as ProjectReadRow
const need = {
  id: 'n1',
  label: 'Renfort data',
  kind: 'project',
  stage: 'confirmed',
  updated_at: '2026-07-02',
} as ProjectReadRow
const missions = {
  active: [{ missionId: 'm1', label: 'Refonte ERP', roleTitle: 'Chef de projet', startedOn: '2026-05-01' }],
  past: [{ missionId: 'm2', label: 'Audit SI', roleTitle: null, startedOn: null }],
} as unknown as AccountMissions
const planItem = {
  id: 'a1',
  label: 'Relancer la DSI',
  reason: 'Levée de fonds',
  due_date: '2026-09-20',
} as ActionPlanItem
const proof = { id: 'pr1', claim: 'REX datalake', detail: null, created_at: '2026-06-01' } as Proof
const activity = { id: 'h1', subject: 'Appel avec Sarah', kind: 'call', occurredAt: '2026-09-02T09:00:00Z' } as Activity

const EMPTY = {
  contacts: [],
  entities: [],
  signals: [],
  sourceLabel: () => null,
  projects: undefined,
  missions: undefined,
  planItems: undefined,
  proofs: undefined,
  history: undefined,
}

describe('buildDossierSearchItems (#2128.34-43)', () => {
  it('rend les dix types à partir des lectures du dossier', () => {
    const items = buildDossierSearchItems({
      contacts: [contact],
      entities: [entity],
      signals: [signal],
      sourceLabel: source => (source === 'presse' ? 'Presse' : null),
      projects: [project, need],
      missions,
      planItems: [planItem],
      proofs: [proof],
      history: [activity],
    })
    const kinds = new Set(items.map(item => item.kind))
    expect([...kinds].sort()).toEqual(
      ['action', 'contact', 'entity', 'history', 'mission', 'need', 'project', 'proof', 'signal', 'source'].sort(),
    )
    expect(items).toContainEqual({
      kind: 'contact',
      id: 'c1',
      label: 'Sarah Martin',
      context: 'DSI · Siège',
      date: '2026-09-01',
    })
    expect(items).toContainEqual({
      kind: 'mission',
      id: 'm1',
      label: 'Refonte ERP',
      context: 'Chef de projet',
      date: '2026-05-01',
    })
    expect(items).toContainEqual({ kind: 'mission', id: 'm2', label: 'Audit SI', context: null, date: null })
    expect(items).toContainEqual({ kind: 'source', id: 'Presse', label: 'Presse', context: null, date: '2026-08-20' })
    expect(items).toContainEqual({
      kind: 'history',
      id: 'h1',
      label: 'Appel avec Sarah',
      context: null,
      date: '2026-09-02T09:00:00Z',
    })
  })

  it('range un besoin CONFIRMÉ en besoin, jamais deux fois (en projet aussi)', () => {
    const items = buildDossierSearchItems({ ...EMPTY, projects: [project, need] })
    expect(items.filter(item => item.id === 'n1').map(item => item.kind)).toEqual(['need'])
    expect(items.filter(item => item.id === 'p1').map(item => item.kind)).toEqual(['project'])
  })

  it('n’indexe pas un objet sans libellé, ni une source que l’écran ne sait pas nommer', () => {
    const items = buildDossierSearchItems({
      ...EMPTY,
      history: [{ ...activity, subject: null }],
      signals: [signal],
      sourceLabel: () => null,
    })
    expect(items.map(item => item.kind)).toEqual(['signal'])
  })

  it('une lecture pas encore arrivée rend une liste vide, pas une erreur', () => {
    expect(buildDossierSearchItems(EMPTY)).toEqual([])
  })
})
