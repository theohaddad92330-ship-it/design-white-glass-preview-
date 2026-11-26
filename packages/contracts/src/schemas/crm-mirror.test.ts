import { describe, expect, it } from 'vitest'
import {
  CRM_MIRROR_ACTIVITY_KINDS,
  CRM_MIRROR_DEAL_STATUSES,
  CRM_MIRROR_TABLES,
  crmMirrorActivityKind,
  crmMirrorActivitySchema,
  crmMirrorDealSchema,
  crmMirrorOwnerSchema,
  crmMirrorPipelineSchema,
} from '../index.js'

const base = {
  provider: 'pipedrive',
  externalId: '42',
  crmUpdatedAt: '2026-10-18T09:00:00.000Z',
  crmUrl: null,
  customFields: {},
  archivedAt: null,
} as const

describe('crm-mirror — le miroir des objets CRM (SYNC-A)', () => {
  it('les statuts et les types sont ceux que les CHECK SQL de la migration couvrent', () => {
    expect(CRM_MIRROR_DEAL_STATUSES).toEqual(['open', 'won', 'lost'])
    expect(CRM_MIRROR_ACTIVITY_KINDS).toEqual(['call', 'meeting', 'task', 'email', 'note'])
    expect(CRM_MIRROR_TABLES).toEqual(['crm_deals', 'crm_activities', 'crm_owners', 'crm_pipelines', 'crm_stages'])
  })

  it('une affaire : une valeur absente est null, jamais 0', () => {
    const deal = crmMirrorDealSchema.parse({
      ...base,
      title: 'Refonte SI',
      pipelineExternalId: null,
      stageExternalId: null,
      stageLabel: null,
      amount: null,
      currency: null,
      status: null,
      lostReason: null,
      crmCreatedAt: null,
      expectedCloseDate: null,
      closedAt: null,
      ownerExternalId: null,
      accountExternalId: null,
      accountId: null,
      contactExternalIds: [],
    })
    expect(deal.amount).toBeNull()
    expect(() => crmMirrorDealSchema.parse({ ...deal, status: 'pending' })).toThrow()
  })

  it('une activité ne porte JAMAIS le corps du message (doctrine c96)', () => {
    const activity = {
      ...base,
      kind: 'email',
      subject: 'Relance proposition',
      occurredAt: '2026-10-17T10:00:00.000Z',
      done: true,
      ownerExternalId: null,
      accountExternalId: null,
      accountId: null,
      contactExternalId: null,
      contactId: null,
      dealExternalId: null,
    }
    expect(crmMirrorActivitySchema.parse(activity).subject).toBe('Relance proposition')
    expect(() => crmMirrorActivitySchema.parse({ ...activity, body: 'Bonjour…' })).toThrow()
  })

  it('propriétaire et pipeline (avec ses étapes ordonnées)', () => {
    expect(crmMirrorOwnerSchema.parse({ ...base, name: 'Claire', email: null }).name).toBe('Claire')
    const pipeline = crmMirrorPipelineSchema.parse({
      ...base,
      label: 'Ventes',
      stages: [{ externalId: 's1', label: 'Qualifié', position: 0, status: 'open' }],
    })
    expect(pipeline.stages[0]?.position).toBe(0)
  })

  it('le type d’activité se normalise depuis le vocabulaire du CRM, sinon null (jamais deviné)', () => {
    expect(crmMirrorActivityKind('Call')).toBe('call')
    expect(crmMirrorActivityKind('phonecall')).toBe('call')
    expect(crmMirrorActivityKind('Event')).toBe('meeting')
    expect(crmMirrorActivityKind('meeting')).toBe('meeting')
    expect(crmMirrorActivityKind('Task')).toBe('task')
    expect(crmMirrorActivityKind('todo')).toBe('task')
    expect(crmMirrorActivityKind('Email')).toBe('email')
    expect(crmMirrorActivityKind('mail')).toBe('email')
    expect(crmMirrorActivityKind('note')).toBe('note')
    expect(crmMirrorActivityKind('Appel')).toBe('call')
    expect(crmMirrorActivityKind('Réunion')).toBe('meeting')
    expect(crmMirrorActivityKind('À faire')).toBe('task')
    expect(crmMirrorActivityKind('lunch')).toBeNull()
    expect(crmMirrorActivityKind(null)).toBeNull()
  })
})
