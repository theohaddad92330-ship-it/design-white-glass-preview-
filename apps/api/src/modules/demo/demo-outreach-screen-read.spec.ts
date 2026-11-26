import { seatName } from './demo-seat-names'
import type { FindOperator } from 'typeorm'
import { OutreachMessageService, type OutreachCtx } from '../outreach/outreach-message.service'
import { DEMO_DELIVERY_CARRIER_ACCOUNT, DEMO_DELIVERY_CLIENT, DEMO_OUTREACH_MESSAGES } from './demo-dataset'

/**
 * #3420 (recette prod 02/10, Y20) — « le semis n'arrive pas à l'écran ».
 *
 * Les gardes précédentes lisaient le JEU DE DONNÉES ; celle-ci lit ce que la
 * fiche contact lit : `OutreachMessageService.list(contact)` sur des lignes
 * posées comme `seedOutreachMessages` les pose (statut, version courante, compte
 * du contact). Ce que l'écran montre pour Directeur technique — entité numérique voyageurs — « Validé » sans
 * aucun motif, « Il manque une preuve » sur le message à relire, jamais « ne cite
 * rien du compte » — est donc prouvé de bout en bout côté serveur.
 */
type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const op = expected as FindOperator<unknown> | undefined
    if (op && typeof op === 'object' && 'type' in op && op.type === 'in')
      return (op.value as unknown[]).includes(row[key])
    return row[key] === expected
  })
}

function repo(rows: Row[] = []) {
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    find: jest.fn(async (opts?: { where?: Row }) => rows.filter(r => matches(r, opts?.where ?? {}))),
    findOne: jest.fn(async (opts: { where: Row }) => rows.find(r => matches(r, opts.where)) ?? null),
    save: jest.fn(async (row: Row) => row),
  }
}

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER = '11111111-1111-4111-8111-111111111111'
const ACCOUNT = '44444444-4444-4444-8444-444444444444'
const CONTACT = '33333333-3333-4333-8333-333333333333'
const NAME = seatName('Directeur technique — entité numérique voyageurs')
const at = new Date('2026-10-03T08:00:00Z')

function readFerdinand(opts: { center?: boolean } = {}) {
  const account = DEMO_DELIVERY_CARRIER_ACCOUNT
  const entries = DEMO_OUTREACH_MESSAGES.filter(entry => entry.contact === NAME)
  const messageRows: Row[] = []
  const versionRows: Row[] = []
  entries.forEach((entry, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
    const versions = [
      { kind: 'template', ...entry.template },
      { kind: 'personalized', subject: entry.subject, body: entry.body },
      ...(entry.edit ? [{ kind: 'user_edit', ...entry.edit }] : []),
    ]
    messageRows.push({
      id,
      workspace_id: WS,
      user_id: OWNER,
      contact_id: CONTACT,
      channel: 'email',
      intent: entry.intent,
      source: entry.source,
      status: entry.status,
      current_version: versions.length,
      approval: null,
      reason: null,
      sequence_id: null,
      created_at: at,
      updated_at: at,
    })
    versions.forEach((version, i) =>
      versionRows.push({ message_id: id, version: i + 1, ...version, author: null, created_at: at }),
    )
  })
  const service = new OutreachMessageService(
    repo(messageRows) as never,
    repo(versionRows) as never,
    repo() as never,
    repo() as never,
    repo([
      {
        id: CONTACT,
        workspace_id: WS,
        full_name: NAME,
        title: 'DSI',
        email: 'f.aumont@nova.example',
        account_id: ACCOUNT,
        // Le statut SEMÉ de la fiche (`meeting`) : sans lui, le serveur juge la fiche « new » et rate le scénario relationnel (#3420, X76).
        user_status: DEMO_DELIVERY_CLIENT.contacts.find(c => c.full_name === NAME)?.user_status ?? null,
      },
    ]) as never,
    repo([
      {
        id: ACCOUNT,
        workspace_id: WS,
        company_name: account.company_name,
        sector: account.sector,
        recent_signals: (account as { recent_signals?: unknown[] }).recent_signals ?? [],
        raw_analysis: (DEMO_DELIVERY_CLIENT as { analysis?: unknown }).analysis ?? {},
      },
    ]) as never,
    repo() as never,
    repo() as never,
    repo() as never,
    repo() as never,
  )
  const ctx: OutreachCtx = { userId: OWNER, workspaceId: WS, role: 'sales' }
  // `center` : le centre d'approbation lit le MÊME objet, sans filtre de contact (#2366.1).
  return service.list(ctx, async () => new Set<string>(), undefined, opts.center ? undefined : CONTACT)
}

describe('fiche Directeur technique — entité numérique voyageurs — ce que l’écran lit (#3420)', () => {
  it('porte trois messages : un « Validé », deux « À relire »', async () => {
    const messages = await readFerdinand()
    expect(messages.map(m => m.status).sort()).toEqual(['approved', 'needs_review', 'needs_review'])
  })

  it('le « Validé » ne porte aucun motif de qualité', async () => {
    const approved = (await readFerdinand()).find(m => m.status === 'approved')
    expect(approved?.blockers).toEqual([])
  })

  it('« Il manque une preuve » est lu sur le message « Notre consultant est disponible… »', async () => {
    const proof = (await readFerdinand()).find(m => m.body.includes('Notre consultant est disponible dès lundi'))
    expect(proof?.blockers).toContain('unverifiable_claim')
  })

  it('aucun message ne dit « ne cite rien du compte »', async () => {
    for (const message of await readFerdinand()) expect(message.blockers).not.toContain('scope_unclear')
  })

  it('#3420 — chaque motif affiché est juste : exactement un motif par message à relire', async () => {
    const reviewing = (await readFerdinand()).filter(m => m.status === 'needs_review')
    const byBody = (needle: string) => reviewing.find(m => m.body.includes(needle))?.blockers
    expect(byBody('Databricks')).toEqual(['unverified_tech_claim'])
    expect(byBody('Notre consultant est disponible')).toEqual(['unverifiable_claim'])
  })

  it('#3420 — le centre d’approbation montre les deux messages dans « bloqué »', async () => {
    const blocked = (await readFerdinand({ center: true })).filter(m => m.view === 'blocked')
    expect(blocked.map(m => m.subject).sort()).toEqual([
      'Un consultant pour votre équipe plateforme',
      'Votre plateforme data',
    ])
  })
})
