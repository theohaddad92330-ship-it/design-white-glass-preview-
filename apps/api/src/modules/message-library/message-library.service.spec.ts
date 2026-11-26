/**
 * #3427 — le service : scoping par espace (GA-07), et sélection/rendu
 * délégués entièrement à `@bellum/contracts` (jamais redevinés ici).
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { CreateMessageLibraryEntry } from '@bellum/contracts'
import { MessageLibraryService, type MessageLibraryCtx } from './message-library.service'
import { ALL_IMPORTED_SEQUENCES, BEHAVIOR_EXAMPLES_3443 } from './message-library.seed-data'

const ALL_DEFAULTS = [...ALL_IMPORTED_SEQUENCES, ...BEHAVIOR_EXAMPLES_3443]

type Row = Record<string, unknown>

// #4158.30 — `where` peut être une LISTE (OU de conjonctions) ; une ligne sans `visibility` est partagée.
function matches(r: Row, where: Row | Row[] | undefined): boolean {
  if (Array.isArray(where)) return where.some(w => matches(r, w))
  return Object.entries(where ?? {}).every(([key, value]) =>
    key === 'visibility' ? (r.visibility ?? 'team') === value : r[key] === value,
  )
}

function repo(rows: Row[] = []) {
  let seq = 0
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    find: jest.fn(async (opts?: { where?: Row | Row[] }) => rows.filter(r => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: { where: Row | Row[] }) => rows.find(r => matches(r, opts.where)) ?? null),
    save: jest.fn(async (row: Row) => {
      if (!row.id) row.id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      const now = new Date('2026-09-30T10:00:00Z')
      row.created_at ??= now
      row.updated_at = now
      if (!rows.includes(row)) rows.push(row)
      return row
    }),
  }
}

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_WS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const WRITER: MessageLibraryCtx = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: WS, role: 'sales' }
const VIEWER: MessageLibraryCtx = { userId: '22222222-2222-4222-8222-222222222222', workspaceId: WS, role: 'viewer' }
const OTHER_SPACE: MessageLibraryCtx = {
  userId: '33333333-3333-4333-8333-333333333333',
  workspaceId: OTHER_WS,
  role: 'sales',
}

function build() {
  const entries = repo()
  const service = new MessageLibraryService(entries as never)
  return { service, entries }
}

const DRAFT: CreateMessageLibraryEntry = {
  title: 'M1 — Décideur — invitation acceptée',
  text: 'Bonjour {{Prenom}}, ravi d’échanger sur {{domaine}}.',
  origin: 'beta-feedback #3437',
  sourceDocument: 'issue-3437',
  version: 1,
  date: '2026-09-30T00:00:00.000Z',
  channel: 'linkedin_draft',
  scenarioId: 'accepted_connection',
  persona: 'decideur',
  decisionRole: 'decideur',
  stage: 'prospection',
  route: 'invitation_acceptee',
  objective: 'ouvrir une conversation sans pitch',
  expectedVariables: ['Prenom', 'domaine'],
  mandatoryFacts: [],
  claims: [],
  status: 'approuve',
  mode: 'verbatim',
  usageConstraints: [],
}

describe('MessageLibraryService', () => {
  it('refuse la création sans records:write', async () => {
    const { service } = build()
    await expect(service.create(VIEWER, DRAFT)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('crée une entrée scopée à l’espace de qui l’importe', async () => {
    const { service, entries } = build()
    const created = await service.create(WRITER, DRAFT)
    expect(created.title).toBe(DRAFT.title)
    expect(entries.rows[0]?.workspace_id).toBe(WS)
    expect(entries.rows[0]?.created_by).toBe(WRITER.userId)
  })

  it('list() ne voit jamais les entrées d’un autre espace', async () => {
    const { service } = build()
    await service.create(WRITER, DRAFT)
    await service.create(OTHER_SPACE, DRAFT)
    const mine = await service.list(WRITER)
    expect(mine).toHaveLength(1)
  })

  it('get() sur une entrée d’un autre espace : 404, jamais une fuite', async () => {
    const { service } = build()
    const created = await service.create(OTHER_SPACE, DRAFT)
    await expect(service.get(WRITER, created.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('select() délègue à selectApprovedTemplate — jamais par ressemblance de texte', async () => {
    const { service } = build()
    const decoy: CreateMessageLibraryEntry = { ...DRAFT, scenarioId: 'dormant_connection' }
    await service.create(WRITER, decoy)
    const target = await service.create(WRITER, DRAFT)
    const trace = await service.select(WRITER, {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(trace.selectedId).toBe(target.id)
  })

  it('render() substitue verbatim quand l’entrée est prête', async () => {
    const { service } = build()
    const entry = await service.create(WRITER, DRAFT)
    const result = await service.render(WRITER, entry.id, { Prenom: 'Julie', domaine: 'cloud' })
    expect(result).toEqual({
      ok: true,
      text: 'Bonjour Julie, ravi d’échanger sur cloud.',
      variablesSubstituted: { Prenom: 'Julie', domaine: 'cloud' },
    })
  })

  it('render() refuse (409) une entrée bloquée par la règle absolue — jamais un texte partiel', async () => {
    const { service } = build()
    const entry = await service.create(WRITER, {
      ...DRAFT,
      claims: [{ kind: 'client', statement: 'référence Renault', verifiedFactId: null }],
    })
    await expect(service.render(WRITER, entry.id, { Prenom: 'Julie', domaine: 'cloud' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('render() refuse (400) une variable manquante — jamais une valeur devinée', async () => {
    const { service } = build()
    const entry = await service.create(WRITER, DRAFT)
    await expect(service.render(WRITER, entry.id, { Prenom: 'Julie' })).rejects.toBeInstanceOf(BadRequestException)
  })

  describe('confirmMandatoryFact (#3439.1)', () => {
    const FACTS = ['identité du référent', 'accord de citation']
    const referral = () => ({ ...DRAFT, mandatoryFacts: FACTS })

    it('refuse sans records:write', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, referral())
      await expect(service.confirmMandatoryFact(VIEWER, entry.id, FACTS[0])).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('enregistre qui et quand, et lève le blocage seulement quand TOUS sont confirmés', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, referral())
      await expect(service.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).rejects.toBeInstanceOf(
        ConflictException,
      )

      const half = await service.confirmMandatoryFact(WRITER, entry.id, FACTS[0])
      expect(half.factConfirmations).toEqual([
        { fact: FACTS[0], confirmedBy: WRITER.userId, confirmedAt: expect.any(String) },
      ])
      await expect(service.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).rejects.toBeInstanceOf(
        ConflictException,
      )

      await service.confirmMandatoryFact(WRITER, entry.id, FACTS[1])
      await expect(service.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).resolves.toMatchObject({
        ok: true,
      })
    })

    it('refuse (400) un fait que l’entrée ne déclare pas — jamais une confirmation devinée', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, referral())
      await expect(service.confirmMandatoryFact(WRITER, entry.id, 'autre chose')).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })

    it('est idempotent : reconfirmer ne duplique pas et garde le premier confirmant', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, referral())
      await service.confirmMandatoryFact(WRITER, entry.id, FACTS[0])
      const again = await service.confirmMandatoryFact({ ...WRITER, userId: 'autre' }, entry.id, FACTS[0])
      expect(again.factConfirmations).toHaveLength(1)
      expect(again.factConfirmations?.[0]?.confirmedBy).toBe(WRITER.userId)
    })

    it('persiste : un autre service sur le même stockage (rechargement dur) relit les confirmations, et rien ne se perd', async () => {
      const { service, entries } = build()
      const entry = await service.create(WRITER, referral())
      await service.confirmMandatoryFact(WRITER, entry.id, FACTS[0])
      await service.confirmMandatoryFact(WRITER, entry.id, FACTS[1])
      expect(entries.save).toHaveBeenCalled()

      // Un rechargement ne garde rien en mémoire : seul le stockage répond.
      const reloaded = new MessageLibraryService(entries as never)
      const [read] = await reloaded.list(WRITER)
      expect(read?.factConfirmations?.map(c => c.fact)).toEqual(FACTS)
      expect(read?.factConfirmations?.every(c => c.confirmedBy === WRITER.userId)).toBe(true)
      await expect(reloaded.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).resolves.toMatchObject({
        ok: true,
      })
    })

    it('404 sur une entrée d’un autre espace', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, referral())
      await expect(service.confirmMandatoryFact(OTHER_SPACE, entry.id, FACTS[0])).rejects.toBeInstanceOf(
        NotFoundException,
      )
    })
  })
})

describe('MessageLibraryService.importDefaults — #3427, la bibliothèque d’un espace réel n’est plus vide', () => {
  it('importe les séquences livrées dans l’espace du demandeur, et rien dans un autre', async () => {
    const { service, entries } = build()
    const first = await service.importDefaults(WRITER)
    expect(first.imported).toBe(ALL_DEFAULTS.length)
    expect(first.alreadyThere).toBe(0)
    expect(entries.rows.every(row => row.workspace_id === WS)).toBe(true)
    expect(await service.list(OTHER_SPACE)).toEqual([])
  })

  it('est idempotent : un second import ne duplique rien', async () => {
    const { service, entries } = build()
    await service.importDefaults(WRITER)
    const second = await service.importDefaults(WRITER)
    expect(second.imported).toBe(0)
    expect(second.alreadyThere).toBe(ALL_DEFAULTS.length)
    expect(entries.rows).toHaveLength(ALL_DEFAULTS.length)
  })

  it('refuse un lecteur (records:write) et n’écrit rien', async () => {
    const { service, entries } = build()
    await expect(service.importDefaults(VIEWER)).rejects.toThrow(ForbiddenException)
    expect(entries.rows).toHaveLength(0)
  })
})

describe('MessageLibraryService.selectBehavior — #3443', () => {
  it('après l’import, l’appel à froid d’un responsable Data se retrouve par critères structurés, en comportement seulement', async () => {
    const { service } = build()
    await service.importDefaults(WRITER)
    const out = await service.selectBehavior(WRITER, {
      channel: 'call_brief',
      scenarioId: 'cold_approach',
      persona: 'manager',
    })
    expect(out.examples).toHaveLength(1)
    expect(out.examples[0]).toMatchObject({ usage: 'behavior_only', unverifiedClaims: ['références comparables'] })
    // Les modèles verbatim de la même bibliothèque ne sortent jamais par cette porte.
    const verbatimOnly = await service.selectBehavior(WRITER, {
      channel: 'linkedin_draft',
      scenarioId: 'accepted_connection',
      persona: 'decideur',
    })
    expect(verbatimOnly.examples).toEqual([])
  })
})

describe('MessageLibraryService — les séquences livrées sont servies à Laura (#3437, #3438, #3440)', () => {
  const ACCEPTED = { channel: 'linkedin_draft', scenarioId: 'accepted_connection' } as const

  it('une bibliothèque neuve est posée à la première lecture, et rend l’ouverture M1 mot pour mot', async () => {
    const { service, entries } = build()
    const trace = await service.select(VIEWER, { ...ACCEPTED, persona: 'decideur' })
    expect(entries.rows.length).toBe(ALL_DEFAULTS.length)
    expect(trace.selectedId).not.toBeNull()
    const entry = await service.get(VIEWER, trace.selectedId as string)
    expect(entry.step).toBe('M1')
    expect(entry.text).toContain('Content d’être connectés ! En parcourant votre profil')
    expect(entry.status).toBe('approuve')
  })

  it('l’étape demandée est servie : M2 puis M3 d’un manager, chacun son texte', async () => {
    const { service } = build()
    const m2 = await service.select(WRITER, { ...ACCEPTED, persona: 'manager', step: 'M2' })
    const m3 = await service.select(WRITER, { ...ACCEPTED, persona: 'manager', step: 'M3' })
    expect((await service.get(WRITER, m2.selectedId as string)).text).toContain('onboarding culturel')
    expect((await service.get(WRITER, m3.selectedId as string)).text).toContain('profil rare, contexte tendu')
  })

  it('NON — M2 du décideur (« divisé par deux », non sourcé) n’est jamais servi, et se nomme écarté', async () => {
    const { service } = build()
    const trace = await service.select(WRITER, { ...ACCEPTED, persona: 'decideur', step: 'M2' })
    expect(trace.selectedId).toBeNull()
    expect(trace.rejected[0]).toMatchObject({
      title: 'M2 — Décideur — invitation acceptée',
      matchesCriteria: true,
      // #3437 (recette 03/10) — l'écart NOMME le chiffre non sourcé.
      reason: expect.stringContaining('« divisé par deux le délai »'),
    })
  })

  it('la connexion dormante et l’approche à froid sont servies aussi', async () => {
    const { service } = build()
    const dormant = await service.select(WRITER, {
      channel: 'linkedin_draft',
      scenarioId: 'dormant_connection',
      persona: 'decideur',
      step: 'M1',
    })
    const cold = await service.select(WRITER, {
      channel: 'linkedin_draft',
      scenarioId: 'cold_approach',
      persona: 'decideur',
      step: 'invitation',
    })
    expect(dormant.selectedId).not.toBeNull()
    expect(cold.selectedId).not.toBeNull()
  })

  it('la pose est unique et par espace : une seconde lecture ne duplique rien, un autre espace a la sienne', async () => {
    const { service, entries } = build()
    await service.select(WRITER, { ...ACCEPTED, persona: 'decideur' })
    await service.select(WRITER, { ...ACCEPTED, persona: 'manager' })
    expect(entries.rows.length).toBe(ALL_DEFAULTS.length)
    await service.select(OTHER_SPACE, { ...ACCEPTED, persona: 'decideur' })
    expect(entries.rows.length).toBe(ALL_DEFAULTS.length * 2)
  })

  it('NON — un espace dont la bibliothèque a déjà une ligne n’est pas rempli d’office', async () => {
    const { service, entries } = build()
    await service.create(WRITER, DRAFT)
    await service.select(WRITER, { ...ACCEPTED, persona: 'operationnel' })
    expect(entries.rows.length).toBe(1)
  })

  describe('confirmMessageClaim (#3437 / #3438, recette 03/10)', () => {
    const CLAIMS = [{ kind: 'chiffre' as const, statement: '6 semaines → 5 jours', verifiedFactId: null }]
    const review = () => ({ ...DRAFT, claims: CLAIMS, status: 'a_revoir' as const })

    it('refuse sans records:write', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, review())
      await expect(service.confirmClaim(VIEWER, entry.id, 0)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('trace qui et quand, rend l’entrée servable, et le texte approuvé se rend alors mot pour mot', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, review())
      await expect(service.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).rejects.toBeInstanceOf(
        ConflictException,
      )
      const confirmed = await service.confirmClaim(WRITER, entry.id, 0)
      expect(confirmed.status).toBe('approuve')
      expect(confirmed.claims[0]?.verifiedFactId).toContain(`confirmed-by:${WRITER.userId}@`)
      await expect(service.render(WRITER, entry.id, { Prenom: 'J', domaine: 'c' })).resolves.toMatchObject({ ok: true })
    })

    it('refuse (400) un index hors liste', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, review())
      await expect(service.confirmClaim(WRITER, entry.id, 4)).rejects.toBeInstanceOf(BadRequestException)
    })

    it('404 sur une entrée d’un autre espace', async () => {
      const { service } = build()
      const entry = await service.create(WRITER, review())
      await expect(service.confirmClaim(OTHER_SPACE, entry.id, 0)).rejects.toBeInstanceOf(NotFoundException)
    })
  })
})

// #4158.30 — partagé avec l'équipe / personnel.
describe('MessageLibraryService — partagé / personnel (#4158.30)', () => {
  const AUTHOR = WRITER
  const COLLEAGUE: MessageLibraryCtx = {
    userId: '44444444-4444-4444-8444-444444444444',
    workspaceId: WS,
    role: 'sales',
  }

  it('un exemple personnel est invisible du collègue — liste, lecture par id et sélection', async () => {
    const { service } = build()
    const created = await service.create(AUTHOR, { ...DRAFT, visibility: 'personal' })
    expect(created.visibility).toBe('personal')
    expect(created.createdBy).toBe(AUTHOR.userId)

    const mine = (await service.list(AUTHOR)).map(e => e.id)
    expect(mine).toContain(created.id)
    const theirs = (await service.list(COLLEAGUE)).map(e => e.id)
    expect(theirs).not.toContain(created.id)
    await expect(service.get(COLLEAGUE, created.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('par défaut un exemple est partagé : le collègue le voit', async () => {
    const { service } = build()
    const created = await service.create(AUTHOR, DRAFT)
    expect(created.visibility).toBe('team')
    expect((await service.list(COLLEAGUE)).map(e => e.id)).toContain(created.id)
  })

  it('setVisibility : l’auteur partage, puis le collègue le voit', async () => {
    const { service } = build()
    const created = await service.create(AUTHOR, { ...DRAFT, visibility: 'personal' })
    const shared = await service.setVisibility(AUTHOR, created.id, 'team')
    expect(shared.visibility).toBe('team')
    expect((await service.list(COLLEAGUE)).map(e => e.id)).toContain(created.id)
  })

  it('setVisibility : un collègue ne reprend pas l’exemple partagé d’un autre — 403', async () => {
    const { service } = build()
    const created = await service.create(AUTHOR, DRAFT)
    await expect(service.setVisibility(COLLEAGUE, created.id, 'personal')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('setVisibility : un autre espace reçoit un 404', async () => {
    const { service } = build()
    const created = await service.create(AUTHOR, DRAFT)
    await expect(service.setVisibility(OTHER_SPACE, created.id, 'personal')).rejects.toBeInstanceOf(NotFoundException)
  })
})
