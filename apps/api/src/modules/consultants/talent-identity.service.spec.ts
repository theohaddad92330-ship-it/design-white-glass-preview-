import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { TalentIdentityDecisionEntity } from '../../database/entities/talent-identity-decision.entity'
import { TalentIdentityService, type IdentityRow } from './talent-identity.service'

const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const A = 'a0000000-0000-4000-8000-00000000000a'
const B = 'b0000000-0000-4000-8000-00000000000b'
const C = 'c0000000-0000-4000-8000-00000000000c'

function row(over: Partial<IdentityRow> & { id: string }): IdentityRow {
  return {
    workspace_id: WS,
    full_name: 'Yanis Berthier',
    email: null,
    phone: null,
    public_profile_url: null,
    location: null,
    employer: null,
    title: null,
    review_status: 'needs_review',
    created_at: '2026-09-01T10:00:00.000Z',
    document_hashes: [],
    experience_keys: [],
    external_ids: [],
    ...over,
  }
}

type Decision = {
  id: string
  talent_id: string
  other_talent_id: string | null
  action: string
  state: string
  reason: string | null
  assignee_id: string | null
  assignee_name: string | null
  decided_by_name: string | null
  created_at: string
  undone_at: string | null
  document_ids: string[]
}

function makeService(opts: { identities?: IdentityRow[]; decisions?: Decision[]; members?: string[] } = {}) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM consultants c')) return opts.identities ?? []
    if (sql.includes('FROM talent_identity_decisions d')) return opts.decisions ?? []
    if (sql.includes('FROM workspace_members')) return (opts.members ?? []).map(user_id => ({ user_id }))
    if (sql.startsWith('INSERT INTO consultant_documents')) return [{ id: 'copied-1' }]
    if (sql.startsWith('INSERT INTO talent_identity_decisions')) {
      return [{ id: 'decision-1', created_at: '2026-09-17T08:00:00.000Z' }]
    }
    if (sql.startsWith('UPDATE talent_identity_decisions')) return [[{ id: 'decision-1', document_ids: [] }], 1]
    return []
  })
  const decisions = { manager: { query } } as unknown as Repository<TalentIdentityDecisionEntity>
  return { service: new TalentIdentityService(decisions), calls }
}

describe('TalentIdentityService — #2327', () => {
  it('#2327.23 — ne charge QUE les fiches de l’espace', async () => {
    const { service, calls } = makeService()
    await service.findForCandidate(WS, { fullName: 'X', email: null, phone: null, lastEmployer: null })
    const load = calls.find(call => call.sql.includes('FROM consultants c'))
    expect(load?.sql).toContain('c.workspace_id = $1')
    expect(load?.params).toEqual([WS])
  })

  it('#2327.6 — l’employeur porté (partenaire) arrive jusqu’à la comparaison', async () => {
    const { service } = makeService({
      identities: [row({ id: A, full_name: 'Marie Dupont', employer: 'Partenaire Delta' })],
    })
    const found = await service.findForCandidate(WS, {
      fullName: 'Marie Dupont',
      email: null,
      phone: null,
      lastEmployer: 'partenaire delta',
    })
    expect(found[0]).toMatchObject({ talentId: A, reason: 'same_name_same_employer' })
  })

  describe('reportForTalent — les doublons d’une fiche existante', () => {
    it('rapproche sur les signaux STOCKÉS (profil public, documents, expériences)', async () => {
      const { service } = makeService({
        identities: [
          row({ id: A, email: 'a@example.fr', public_profile_url: 'https://example.org/in/yb' }),
          row({ id: B, full_name: 'Autre', email: 'b@example.fr', public_profile_url: 'example.org/in/YB/' }),
          row({ id: C, full_name: 'Personne', document_hashes: [] }),
        ],
      })
      const report = await service.reportForTalent(WS, A)
      expect(report.items.map(item => [item.talentId, item.reason])).toEqual([[B, 'same_public_profile']])
      // Une clé forte ET un nom contradictoire : « données contradictoires ».
      expect(report.state).toBe('conflicting')
    })

    it('404 quand la fiche n’est pas dans l’espace', async () => {
      const { service } = makeService({ identities: [row({ id: B })] })
      await expect(service.reportForTalent(WS, A)).rejects.toBeInstanceOf(NotFoundException)
    })

    it('#2327.12 — « pas la même personne » est MÉMORISÉ : la paire ne revient plus', async () => {
      const { service } = makeService({
        identities: [row({ id: A }), row({ id: B })],
        decisions: [decision({ talent_id: B, other_talent_id: A, action: 'keep_separate', reason: 'same_name' })],
      })
      const report = await service.reportForTalent(WS, A)
      expect(report.items).toEqual([])
      expect(report.state).toBe('new')
    })

    it('« ignorer » revient quand un signal PLUS FORT apparaît', async () => {
      const ignored = decision({ talent_id: A, other_talent_id: B, action: 'ignore', reason: 'same_name' })
      const memeNom = makeService({ identities: [row({ id: A }), row({ id: B })], decisions: [ignored] })
      expect((await memeNom.service.reportForTalent(WS, A)).items).toEqual([])

      const memeAdresse = makeService({
        identities: [row({ id: A, email: 'y@example.fr' }), row({ id: B, email: 'y@example.fr' })],
        decisions: [ignored],
      })
      const report = await memeAdresse.service.reportForTalent(WS, A)
      expect(report.items.map(item => item.reason)).toEqual(['same_email'])
    })

    it('« attribuer » garde la proposition visible, avec sa décision', async () => {
      const assigned = decision({
        talent_id: A,
        other_talent_id: B,
        action: 'assign_to_recruiter',
        assignee_id: USER,
        assignee_name: 'Camille',
      })
      const { service } = makeService({ identities: [row({ id: A }), row({ id: B })], decisions: [assigned] })
      const report = await service.reportForTalent(WS, A)
      expect(report.items[0]?.decision).toMatchObject({ action: 'assign_to_recruiter', assigneeName: 'Camille' })
    })
  })

  describe('decide', () => {
    it('refuse une paire dont une fiche n’est pas dans l’espace', async () => {
      const { service } = makeService({ identities: [row({ id: A })] })
      await expect(
        service.decide(WS, USER, A, { otherTalentId: B, action: 'keep_separate', assigneeId: null }),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('refuse d’attribuer à quelqu’un hors de l’espace', async () => {
      const { service } = makeService({ identities: [row({ id: A }), row({ id: B })], members: [] })
      await expect(
        service.decide(WS, USER, A, { otherTalentId: B, action: 'assign_to_recruiter', assigneeId: USER }),
      ).rejects.toThrow('membre')
    })

    it('#2327.21 — garde la RÈGLE et l’état au moment de décider', async () => {
      const { service, calls } = makeService({ identities: [row({ id: A }), row({ id: B })] })
      const decided = await service.decide(WS, USER, A, { otherTalentId: B, action: 'ignore', assigneeId: null })
      const insert = calls.find(call => call.sql.startsWith('INSERT INTO talent_identity_decisions'))
      expect(insert?.params).toEqual([WS, A, B, 'ignore', 'ignored', 'same_name', null, USER, []])
      expect(decided).toMatchObject({ action: 'ignore', state: 'ignored', reason: 'same_name' })
    })

    it('#2327.17 — « mettre à jour » COPIE les documents de B sur A, sans écraser un champ', async () => {
      const { service, calls } = makeService({ identities: [row({ id: A }), row({ id: B })] })
      await service.decide(WS, USER, A, { otherTalentId: B, action: 'update_existing', assigneeId: null })
      const copy = calls.find(call => call.sql.startsWith('INSERT INTO consultant_documents'))
      expect(copy?.sql).toContain('SELECT')
      expect(copy?.params).toEqual([A, WS, USER, B])
      // Aucune écriture sur la fiche elle-même.
      expect(calls.some(call => /UPDATE consultants\b/.test(call.sql))).toBe(false)
      // Le journal dit quelle règle a produit la copie.
      const audit = calls.find(call => call.sql.startsWith('INSERT INTO record_field_audit'))
      expect(audit?.params).toEqual([WS, A, 'documents', null, '1', USER, 'talent_identity.update_existing:same_name'])
    })

    it('ne supprime jamais rien, quelle que soit l’action', async () => {
      for (const action of ['keep_separate', 'update_existing', 'ignore'] as const) {
        const { service, calls } = makeService({ identities: [row({ id: A }), row({ id: B })] })
        await service.decide(WS, USER, A, { otherTalentId: B, action, assigneeId: null })
        expect(calls.some(call => /\bDELETE\b/i.test(call.sql))).toBe(false)
      }
    })
  })

  it('#2327.25 — annuler DATE la décision et archive les copies, sans rien effacer', async () => {
    const { service, calls } = makeService()
    await service.undo(WS, USER, 'decision-1')
    const update = calls.find(call => call.sql.startsWith('UPDATE talent_identity_decisions'))
    expect(update?.sql).toContain('undone_at = now()')
    expect(update?.params).toEqual([USER, 'decision-1', WS])
    expect(calls.some(call => /\bDELETE\b/i.test(call.sql))).toBe(false)
  })
})

/**
 * Incident boucle API (05/10/2026) — un import ZIP de 688 CV relisait le
 * vivier ENTIER (jusqu'à 5 000 fiches) une fois PAR CV. L'index d'un lot le
 * lit une fois, et apprend les fiches que le lot crée lui-même : deux CV de la
 * même personne dans la même archive se reconnaissent toujours.
 */
describe('openCandidateIndex — le vivier lu UNE fois par lot (05/10/2026)', () => {
  const candidate = (over: Partial<{ email: string | null; phone: string | null; documentHashes: string[] }> = {}) => ({
    fullName: null,
    email: null,
    phone: null,
    lastEmployer: null,
    ...over,
  })

  it('(e) une seule lecture du vivier pour N recherches, mêmes réponses que `findForCandidate`', async () => {
    const identities = [row({ id: A, email: 'a@example.fr' }), row({ id: B, phone: '+33 6 12 34 56 78' })]
    const { service, calls } = makeService({ identities })
    const index = await service.openCandidateIndex(WS)
    const one = index.find(candidate({ email: 'A@example.fr' }))
    const two = index.find(candidate({ phone: '06 12 34 56 78' }))
    index.find(candidate({ email: 'personne@example.fr' }))

    expect(calls.filter(call => call.sql.includes('FROM consultants c'))).toHaveLength(1)
    expect(one).toEqual(await service.findForCandidate(WS, candidate({ email: 'A@example.fr' })))
    expect(two).toEqual(await service.findForCandidate(WS, candidate({ phone: '06 12 34 56 78' })))
    expect(one[0]).toMatchObject({ talentId: A })
    expect(two[0]).toMatchObject({ talentId: B })
  })

  it('(e) une fiche CRÉÉE par le lot est retrouvée par un CV suivant du même lot', async () => {
    const { service } = makeService({ identities: [] })
    const index = await service.openCandidateIndex(WS)
    expect(index.find(candidate({ email: 'jean@example.fr' }))).toEqual([])
    index.remember(C, { email: 'jean@example.fr', phone: null, documentHashes: ['h1'], experienceKeys: [] })
    expect(index.find(candidate({ email: 'jean@example.fr' }))[0]).toMatchObject({ talentId: C })
  })

  it('(e) un document RATTACHÉ par le lot ajoute son empreinte à la fiche existante', async () => {
    const { service } = makeService({ identities: [row({ id: A, document_hashes: ['h-old'] })] })
    const index = await service.openCandidateIndex(WS)
    index.remember(A, { documentHashes: ['h-new'], experienceKeys: [] })
    expect(index.find(candidate({ documentHashes: ['h-new'] }))[0]).toMatchObject({ talentId: A })
    expect(index.find(candidate({ documentHashes: ['h-old'] }))[0]).toMatchObject({ talentId: A })
  })
})

function decision(over: Partial<Decision>): Decision {
  return {
    id: 'd1',
    talent_id: A,
    other_talent_id: B,
    action: 'keep_separate',
    state: 'new',
    reason: 'same_name',
    assignee_id: null,
    assignee_name: null,
    decided_by_name: 'Louis',
    created_at: '2026-09-10T10:00:00.000Z',
    undone_at: null,
    document_ids: [],
    ...over,
  }
}
