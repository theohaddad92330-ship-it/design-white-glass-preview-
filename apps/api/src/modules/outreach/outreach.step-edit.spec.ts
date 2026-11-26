/**
 * #2378.5 / .6 / .7 — une séquence se retouche, garde son gabarit d'origine,
 * et se duplique pour un AUTRE contact sans toucher l'originale.
 */
import { BadRequestException } from '@nestjs/common'
import type { ContactEntity } from '../../database/entities/contact.entity'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { createMockRepository } from '../../database/test-utils'
import type { ActionRouterService } from '../action-router/action-router.service'
import type { ContactStopService } from '../contact-stop/contact-stop.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { OutreachService } from './outreach.service'

const contact = {
  id: 'c1',
  user_id: 'user-1',
  workspace_id: 'ws-1',
  account_id: null,
  full_name: 'Jean Dupont',
  email: 'jean@corp.fr',
  email_message: { subject: 'Bonjour', body: 'Brouillon préparé.' },
} as unknown as ContactEntity

const sequence = (over: Partial<OutreachSequenceEntity> = {}): OutreachSequenceEntity =>
  ({
    id: 'seq-1',
    workspace_id: 'ws-1',
    user_id: 'user-1',
    contact_id: 'c1',
    name: 'Prospection — 3 touches',
    status: 'active',
    template_key: 'prospection_3_touches',
    duplicated_from: null,
    created_at: new Date('2026-07-16T10:00:00.000Z'),
    ...over,
  }) as OutreachSequenceEntity

const step = (over: Partial<OutreachSequenceStepEntity> = {}): OutreachSequenceStepEntity =>
  ({
    id: 'step-1',
    sequence_id: 'seq-1',
    position: 0,
    due_at: new Date('2099-07-16T07:00:00.000Z'),
    kind: 'email',
    payload: { label: 'Premier contact' },
    status: 'pending',
    done_at: null,
    ...over,
  }) as OutreachSequenceStepEntity

function build() {
  const sequences = createMockRepository<OutreachSequenceEntity>()
  const steps = createMockRepository<OutreachSequenceStepEntity>()
  const contacts = createMockRepository<ContactEntity>()
  const userActions = createMockRepository<never>()
  sequences.save.mockImplementation(async (e: Partial<OutreachSequenceEntity>) => ({
    id: e.id ?? 'seq-2',
    created_at: new Date('2026-07-16T10:00:00.000Z'),
    ...e,
  }))
  let n = 0
  steps.save.mockImplementation(async (e: unknown) =>
    Array.isArray(e) ? e.map(row => ({ id: `new-${++n}`, ...row })) : { id: `new-${++n}`, ...(e as object) },
  )
  const assertMember = jest.fn().mockResolvedValue(undefined)
  const service = new OutreachService(
    sequences as never,
    steps as never,
    contacts as never,
    userActions as never,
    { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) } as never,
    { findOne: jest.fn().mockResolvedValue({}) } as never,
    {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
      assertMember,
    } as unknown as WorkspaceContextService,
    {
      dispatch: jest.fn().mockResolvedValue({ type: 'schedule_reminder', status: 'done', externalRef: 'ua-1' }),
    } as unknown as ActionRouterService,
    { verdict: jest.fn().mockResolvedValue(null) } as unknown as ContactStopService,
  )
  return { service, sequences, steps, contacts, assertMember }
}

describe('#2378.5 — modifier une étape à faire', () => {
  it('re-date et renomme une étape pending, et revalide l’espacement', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    const s1 = step()
    const s2 = step({ id: 'step-2', position: 1, due_at: new Date('2099-07-22T07:00:00.000Z') })
    steps.find.mockResolvedValue([s1, s2])
    await service.updateStep(
      'user-1',
      'seq-1',
      'step-2',
      { due_at: '2099-07-25T07:00:00.000Z', label: 'Relance' },
      true,
    )
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.due_at.toISOString()).toBe('2099-07-25T07:00:00.000Z')
    expect(saved.payload).toMatchObject({ label: 'Relance' })
  })

  it('refuse deux messages trop rapprochés après modification — mêmes gardes qu’à la création', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([
      step(),
      step({ id: 'step-2', position: 1, due_at: new Date('2099-07-22T07:00:00.000Z') }),
    ])
    await expect(
      service.updateStep('user-1', 'seq-1', 'step-2', { due_at: '2099-07-16T08:00:00.000Z' }, true),
    ).rejects.toThrow(BadRequestException)
  })

  it('une étape faite ne se modifie pas', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step({ status: 'done' })])
    await expect(service.updateStep('user-1', 'seq-1', 'step-1', { label: 'x' }, true)).rejects.toThrow(
      BadRequestException,
    )
  })

  it('#2202.33 — objectif se pose SANS écraser une note déjà présente, distinct des deux', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([
      step({ payload: { label: 'Premier contact', note: 'A déjà répondu à un mail il y a 6 mois.' } }),
    ])
    await service.updateStep(
      'user-1',
      'seq-1',
      'step-1',
      { objective: 'Obtenir un accord de principe pour un point de 20 min.' },
      true,
    )
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.payload).toMatchObject({
      label: 'Premier contact',
      note: 'A déjà répondu à un mail il y a 6 mois.',
      objective: 'Obtenir un accord de principe pour un point de 20 min.',
    })
  })

  it('retirer une étape l’ARCHIVE (skipped), elle ne disparaît pas', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step()])
    await service.removeStep('user-1', 'seq-1', 'step-1', true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.status).toBe('skipped')
    expect(saved.payload).toMatchObject({ removed_by_user: true })
    expect(steps.delete).not.toHaveBeenCalled()
  })
})

describe('#2909 (#2378.2) — déclarer le signal d’ouverture/clic, RAPPORTÉ jamais détecté', () => {
  it('déclare un signal et date la déclaration', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.findOne.mockResolvedValue(step({ engagement_signal: null, engagement_signal_at: null }))
    await service.declareEngagementSignal('user-1', 'seq-1', 'step-1', { engagement_signal: 'opened' }, true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.engagement_signal).toBe('opened')
    expect(saved.engagement_signal_at).toBeInstanceOf(Date)
  })

  it('efface une déclaration (`null`) — une correction humaine gagne toujours', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.findOne.mockResolvedValue(
      step({ engagement_signal: 'clicked', engagement_signal_at: new Date('2026-07-16T09:00:00.000Z') }),
    )
    await service.declareEngagementSignal('user-1', 'seq-1', 'step-1', { engagement_signal: null }, true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.engagement_signal).toBeNull()
    expect(saved.engagement_signal_at).toBeNull()
  })

  it('une étape déjà FAITE reste déclarable — c’est le seul endroit où rapporter ce qu’on y a observé', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.findOne.mockResolvedValue(step({ status: 'done', done_at: new Date('2026-07-16T09:00:00.000Z') }))
    await expect(
      service.declareEngagementSignal('user-1', 'seq-1', 'step-1', { engagement_signal: 'opened' }, true),
    ).resolves.toBeDefined()
  })
})

describe('#2378.6 — le gabarit d’origine se garde', () => {
  it('des étapes custom parties d’un gabarit gardent sa clé', async () => {
    const { service, sequences, contacts, steps } = build()
    contacts.findOne.mockResolvedValue(contact)
    sequences.findOne.mockResolvedValue(null)
    steps.find.mockResolvedValue([])
    await service.create(
      { contact_id: 'c1', steps: [{ kind: 'email', offset_days: 0 }], template_key: 'prospection_3_touches' },
      { userId: 'user-1', email: 'rep@esn.fr' },
      true,
    )
    const saved = sequences.save.mock.calls[0][0] as OutreachSequenceEntity
    expect(saved.template_key).toBe('prospection_3_touches')
  })
})

describe('#2378.7 — dupliquer pour un autre contact', () => {
  it('reprend les étapes à venir en custom, trace l’origine, ne touche pas l’originale', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.findOne.mockResolvedValueOnce(sequence()).mockResolvedValue(null)
    steps.find.mockResolvedValue([
      step({ due_at: new Date(Date.now() + 2 * 86_400_000) }),
      step({ id: 'step-2', position: 1, kind: 'task', due_at: new Date(Date.now() + 9 * 86_400_000) }),
    ])
    contacts.findOne.mockResolvedValue({ ...contact, id: 'c2' })
    await service.duplicate({ userId: 'user-1', email: 'rep@esn.fr' }, 'seq-1', { contact_id: 'c2' }, true)
    const copy = sequences.save.mock.calls.at(-1)?.[0] as OutreachSequenceEntity
    expect(copy.contact_id).toBe('c2')
    expect(copy.duplicated_from).toBe('seq-1')
    expect(copy.template_key).toBe('prospection_3_touches')
    // L'originale n'est jamais réécrite.
    expect(sequences.save.mock.calls.every(call => (call[0] as OutreachSequenceEntity).id !== 'seq-1')).toBe(true)
  })

  it('lot L-B — la copie garde l’UNITÉ de l’originale : jours ouvrés d’un côté, calendaires de l’autre', async () => {
    for (const unit of ['business_days', 'calendar_days'] as const) {
      const { service, sequences, steps, contacts } = build()
      sequences.findOne.mockResolvedValueOnce(sequence({ delay_unit: unit })).mockResolvedValue(null)
      // jeudi 2099-07-16 → mardi 2099-07-21 : 3 jours ouvrés, 5 jours calendaires
      steps.find.mockResolvedValue([
        step({ due_at: new Date('2099-07-16T07:00:00.000Z') }),
        step({ id: 'step-2', position: 1, kind: 'task', due_at: new Date('2099-07-21T07:00:00.000Z') }),
      ])
      contacts.findOne.mockResolvedValue({ ...contact, id: 'c2' })
      await service.duplicate({ userId: 'user-1', email: 'rep@esn.fr' }, 'seq-1', { contact_id: 'c2' }, true)
      const copy = sequences.save.mock.calls.at(-1)?.[0] as OutreachSequenceEntity
      expect(copy.delay_unit).toBe(unit)
      const saved = steps.save.mock.calls
        .map(call => call[0])
        .find(arg => Array.isArray(arg)) as OutreachSequenceStepEntity[]
      expect(saved[1]?.payload['offset_days']).toBe(unit === 'business_days' ? 3 : 5)
    }
  })

  it('refuse de dupliquer sur le même contact — une inscription ne se partage pas', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step()])
    await expect(
      service.duplicate({ userId: 'user-1', email: 'rep@esn.fr' }, 'seq-1', { contact_id: 'c1' }, true),
    ).rejects.toThrow(BadRequestException)
  })
})

describe('#3702 — écrire soi-même l’objet et le corps d’une étape e-mail sans brouillon', () => {
  it('pose email_draft (objet + corps) sur une étape e-mail qui n’en a pas', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([
      step({ payload: { label: 'Premier contact', email_draft: null, draft_available: false } }),
    ])
    await service.updateStep(
      'user-1',
      'seq-1',
      'step-1',
      { email_draft: { subject: 'Bonjour Jean', body: 'Un mot pour me présenter.' } },
      true,
    )
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.payload).toMatchObject({
      email_draft: { subject: 'Bonjour Jean', body: 'Un mot pour me présenter.', channel: 'email' },
      draft_available: true,
    })
  })

  it('refuse d’écraser un brouillon déjà préparé (il se révise dans À valider)', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([
      step({ payload: { label: 'x', email_draft: { subject: 's', body: 'b' }, draft_available: true } }),
    ])
    await expect(
      service.updateStep('user-1', 'seq-1', 'step-1', { email_draft: { subject: 'n', body: 'n' } }, true),
    ).rejects.toThrow(BadRequestException)
  })

  it('refuse un brouillon sur une étape qui n’est pas un e-mail', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step({ kind: 'reminder' })])
    await expect(
      service.updateStep('user-1', 'seq-1', 'step-1', { email_draft: { subject: 'n', body: 'n' } }, true),
    ).rejects.toThrow(BadRequestException)
  })
})

describe('lot L-B (#4165) — éditeur d’étapes : canal et délai', () => {
  it('change le CANAL d’une étape à faire et prépare la matière du geste (LinkedIn), sans rien inventer', async () => {
    const { service, sequences, steps, contacts } = build()
    sequences.findOne.mockResolvedValue(sequence())
    contacts.findOne.mockResolvedValue({
      ...contact,
      linkedin_url: 'https://linkedin.com/in/jean',
      linkedin_message: 'Bonjour Jean',
    } as unknown as ContactEntity)
    steps.find.mockResolvedValue([step({ kind: 'reminder', payload: { label: 'Rappel', note: 'à voir' } })])
    await service.updateStep('user-1', 'seq-1', 'step-1', { kind: 'linkedin_message' }, true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.kind).toBe('linkedin_message')
    expect(saved.payload).toMatchObject({
      label: 'Rappel',
      note: 'à voir',
      linkedin_draft: { body: 'Bonjour Jean', profile_url: 'https://linkedin.com/in/jean' },
    })
  })

  it('refuse de changer le canal d’une étape e-mail qui a déjà un brouillon préparé', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step({ payload: { label: 'x', draft_available: true } })])
    await expect(service.updateStep('user-1', 'seq-1', 'step-1', { kind: 'call' }, true)).rejects.toThrow(
      /brouillon préparé/,
    )
  })

  it('un délai en jours OUVRÉS recalcule l’échéance depuis la création de la séquence', async () => {
    const { service, sequences, steps } = build()
    // créée jeudi 16/07/2026 ; J+3 ouvrés = mardi 21/07
    sequences.findOne.mockResolvedValue(sequence({ delay_unit: 'business_days' }))
    steps.find.mockResolvedValue([step({ kind: 'task', due_at: new Date('2026-07-17T07:00:00.000Z') })])
    await service.updateStep('user-1', 'seq-1', 'step-1', { offset_days: 3 }, true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.due_at.toISOString()).toBe('2026-07-21T07:00:00.000Z')
    expect(saved.payload).toMatchObject({ offset_days: 3 })
  })

  it('une séquence EXISTANTE reste en jours calendaires : J+3 = dimanche glissé au lundi', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence({ delay_unit: 'calendar_days' }))
    steps.find.mockResolvedValue([step({ kind: 'task', due_at: new Date('2026-07-17T07:00:00.000Z') })])
    await service.updateStep('user-1', 'seq-1', 'step-1', { offset_days: 3 }, true)
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.due_at.toISOString()).toBe('2026-07-20T07:00:00.000Z')
  })

  it('refuse une date ET un délai ensemble', async () => {
    const { service, sequences, steps } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step()])
    await expect(
      service.updateStep('user-1', 'seq-1', 'step-1', { offset_days: 2, due_at: '2099-07-25T07:00:00.000Z' }, true),
    ).rejects.toThrow(BadRequestException)
  })
})

// #2202.36 — l'owner d'une étape : QUI la fait, nommé parmi les membres de l'espace ; null l'efface.
describe('#2202.36 — responsable (owner) d’une étape', () => {
  const MEMBER = '8a3c1d2e-1111-4222-8333-444455556666'

  it('pose le responsable après avoir vérifié qu’il est membre de l’espace', async () => {
    const { service, sequences, steps, assertMember } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step()])
    await service.updateStep('user-1', 'seq-1', 'step-1', { owner_id: MEMBER }, true)
    expect(assertMember).toHaveBeenCalledWith(MEMBER, 'ws-1')
    expect((steps.save.mock.calls[0][0] as OutreachSequenceStepEntity).payload).toMatchObject({ owner_id: MEMBER })
  })

  it('refuse un responsable étranger à l’espace : rien n’est écrit', async () => {
    const { service, sequences, steps, assertMember } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step()])
    assertMember.mockRejectedValue(new BadRequestException('Cette personne ne fait pas partie de l’espace.'))
    await expect(service.updateStep('user-1', 'seq-1', 'step-1', { owner_id: MEMBER }, true)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(steps.save).not.toHaveBeenCalled()
  })

  it('null efface le responsable (une correction humaine gagne), sans vérification', async () => {
    const { service, sequences, steps, assertMember } = build()
    sequences.findOne.mockResolvedValue(sequence())
    steps.find.mockResolvedValue([step({ payload: { label: 'Premier contact', owner_id: MEMBER } })])
    await service.updateStep('user-1', 'seq-1', 'step-1', { owner_id: null }, true)
    expect(assertMember).not.toHaveBeenCalled()
    const saved = steps.save.mock.calls[0][0] as OutreachSequenceStepEntity
    expect(saved.payload).not.toHaveProperty('owner_id')
    expect(saved.payload).toMatchObject({ label: 'Premier contact' })
  })
})
