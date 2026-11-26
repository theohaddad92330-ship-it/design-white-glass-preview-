/**
 * #2369.9/.10/.13/.7/.8 — le socle de la mémoire de style, testé en mémoire
 * (GA-07 : le service ne touche que ses repositories).
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import type { FindOperator } from 'typeorm'
import { composeMessageStylePreviewContext, MessageStyleService, type MessageStyleCtx } from './message-style.service'

type Row = Record<string, unknown>

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    const op = expected as FindOperator<unknown> | undefined
    if (op && typeof op === 'object' && 'type' in op && op.type === 'in') {
      return (op.value as unknown[]).includes(row[key])
    }
    return row[key] === expected
  })
}

function repo(rows: Row[] = []) {
  let seq = 0
  return {
    rows,
    create: (data: Row) => ({ ...data }),
    find: jest.fn(async (opts?: { where?: Row }) => rows.filter(r => matches(r, opts?.where ?? {}))),
    findOne: jest.fn(async (opts: { where: Row }) => rows.find(r => matches(r, opts.where)) ?? null),
    save: jest.fn(async (row: Row) => {
      if (!row.id) row.id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      const now = new Date('2026-09-25T10:00:00Z')
      row.created_at ??= now
      row.updated_at = now
      if (!rows.includes(row)) rows.push(row)
      return row
    }),
  }
}

const WS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OWNER: MessageStyleCtx = { userId: '11111111-1111-4111-8111-111111111111', workspaceId: WS, role: 'sales' }
const OTHER: MessageStyleCtx = { userId: '22222222-2222-4222-8222-222222222222', workspaceId: WS, role: 'sales' }
const MANAGER: MessageStyleCtx = { userId: '33333333-3333-4333-8333-333333333333', workspaceId: WS, role: 'owner' }
const VIEWER: MessageStyleCtx = { userId: '44444444-4444-4444-8444-444444444444', workspaceId: WS, role: 'viewer' }

function build() {
  const templates = repo()
  const proposals = repo()
  const imports = repo()
  const outreachMessages = { manager: { query: jest.fn(async () => [] as Row[]) } }
  const ia = { generateMessage: jest.fn(async () => ({ success: true, data: { subject: 'Objet', body: 'Corps' } })) }
  const esnProfile = { resolveProfileData: jest.fn(async () => ({ companyName: 'Acme ESN' })) }
  const service = new MessageStyleService(
    templates as never,
    proposals as never,
    imports as never,
    outreachMessages as never,
    ia as never,
    esnProfile as never,
  )
  return { service, templates, proposals, imports, outreachMessages, ia, esnProfile }
}

const baseTemplate = {
  objective: 'Relancer un décideur silencieux',
  channel: 'email' as const,
  persona: 'DSI',
  forbidden: [],
}

// #2369.9 — l'objet Template porte objectif/canal/persona/statut/interdits/version/owner.
describe('MessageStyleService.createTemplate — #2369.9', () => {
  it('naît `draft`, version 1, owner = qui l’a créé, interdits vides par défaut', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    expect(template.status).toBe('draft')
    expect(template.version).toBe(1)
    expect(template.ownerId).toBe(OWNER.userId)
    expect(template.workspaceId).toBe(WS)
    expect(template.forbidden).toEqual([])
    expect(template.objective).toBe(baseTemplate.objective)
    expect(template.channel).toBe('email')
    expect(template.persona).toBe('DSI')
  })

  it('un spectateur (`viewer`) ne peut pas créer de template', async () => {
    const { service } = build()
    await expect(service.createTemplate(VIEWER, baseTemplate)).rejects.toThrow(ForbiddenException)
  })
})

// #2369.6 (LOT j1 26/09) — sans portée fournie, retombe sur `workspace` ; avec, la persiste telle quelle.
describe('MessageStyleService.createTemplate — #2369.6 la portée', () => {
  it('sans `scope` fourni, retombe sur `workspace` — comportement historique inchangé', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    expect(template.scope).toBe('workspace')
    expect(template.businessUnitId).toBeNull()
    expect(template.conversationId).toBeNull()
  })

  it('persiste une portée `user` telle quelle', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, { ...baseTemplate, scope: 'user' })
    expect(template.scope).toBe('user')
  })

  it('persiste `business_unit`/`conversation` avec leur identifiant désigné', async () => {
    const { service } = build()
    const BU = '55555555-5555-4555-8555-555555555555'
    const team = await service.createTemplate(OWNER, { ...baseTemplate, scope: 'business_unit', businessUnitId: BU })
    expect(team.scope).toBe('business_unit')
    expect(team.businessUnitId).toBe(BU)

    const campaign = await service.createTemplate(OWNER, {
      ...baseTemplate,
      scope: 'conversation',
      conversationId: 'account:acc-1',
    })
    expect(campaign.scope).toBe('conversation')
    expect(campaign.conversationId).toBe('account:acc-1')
  })
})

describe('MessageStyleService — lecture, isolée par espace', () => {
  it('list/get ne rendent que les templates DE CET espace', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    const listed = await service.listTemplates(OWNER)
    expect(listed.map(t => t.id)).toEqual([template.id])
    await expect(service.getTemplate({ ...OWNER, workspaceId: 'other-ws' }, template.id)).rejects.toThrow(
      NotFoundException,
    )
  })
})

// #2369.10 — cinq statuts, transition gardée par la même machine que le contrat.
describe('MessageStyleService.transitionTemplate — #2369.10', () => {
  it('applique une transition permise : draft → validated', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    const updated = await service.transitionTemplate(OWNER, template.id, 'validated')
    expect(updated.status).toBe('validated')
  })

  it('refuse un saut interdit : draft → active', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await expect(service.transitionTemplate(OWNER, template.id, 'active')).rejects.toThrow(ConflictException)
  })

  it('refuse toute transition depuis archived — état terminal', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await service.transitionTemplate(OWNER, template.id, 'archived')
    await expect(service.transitionTemplate(OWNER, template.id, 'draft')).rejects.toThrow(ConflictException)
  })

  it('le propriétaire transite son propre template avec `records:write`', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await expect(service.transitionTemplate(OWNER, template.id, 'validated')).resolves.toMatchObject({
      status: 'validated',
    })
  })

  it('un autre membre sans `team:manage` ne peut pas transiter le template d’autrui', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await expect(service.transitionTemplate(OTHER, template.id, 'validated')).rejects.toThrow(ForbiddenException)
  })

  it('un manager (`team:manage`) peut transiter le template d’un autre membre', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await expect(service.transitionTemplate(MANAGER, template.id, 'validated')).resolves.toMatchObject({
      status: 'validated',
    })
  })
})

// #2204.59-.65 (épopée #2947) — le style qu'une génération RÉELLE applique,
// pas seulement l'aperçu comparatif (#2369.11).
describe('MessageStyleService.resolveActiveTemplateForGeneration — #2204.59-.65', () => {
  it('rend le template quand il est `active`', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await service.transitionTemplate(OWNER, template.id, 'validated')
    await service.transitionTemplate(OWNER, template.id, 'active')
    const resolved = await service.resolveActiveTemplateForGeneration(OWNER, template.id)
    expect(resolved.id).toBe(template.id)
    expect(resolved.status).toBe('active')
  })

  it('refuse un template `draft` — seul `active` peut être appliqué à une génération', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await expect(service.resolveActiveTemplateForGeneration(OWNER, template.id)).rejects.toThrow(ConflictException)
  })

  it('refuse un identifiant hors de cet espace — jamais deviné appliqué', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    await service.transitionTemplate(OWNER, template.id, 'validated')
    await service.transitionTemplate(OWNER, template.id, 'active')
    await expect(
      service.resolveActiveTemplateForGeneration({ ...OWNER, workspaceId: 'other-ws' }, template.id),
    ).rejects.toThrow(NotFoundException)
  })
})

// #2204.65 — sans choix explicite, le style actif le plus proche de la situation s'applique.
describe('MessageStyleService.resolveByScope — #2204.65', () => {
  async function activate(service: MessageStyleService, ctx: MessageStyleCtx, patch: Record<string, unknown> = {}) {
    const template = await service.createTemplate(ctx, { ...baseTemplate, ...patch } as never)
    await service.transitionTemplate(ctx, template.id, 'validated')
    await service.transitionTemplate(ctx, template.id, 'active')
    return template
  }
  const target = { objective: baseTemplate.objective, channel: 'email' as const, persona: 'DSI' }

  it('le style personnel de l’appelant passe devant le style d’espace', async () => {
    const { service } = build()
    const shared = await activate(service, MANAGER)
    const mine = await activate(service, OWNER, { scope: 'user' })
    const resolved = await service.resolveByScope(OWNER, target)
    expect(resolved?.id).toBe(mine.id)
    expect((await service.resolveByScope(OTHER, target))?.id).toBe(shared.id)
  })

  it('aucun style actif correspondant : null — rien n’est deviné', async () => {
    const { service } = build()
    await service.createTemplate(OWNER, baseTemplate)
    expect(await service.resolveByScope(OWNER, target)).toBeNull()
  })

  it('un style d’un autre espace ne se résout jamais', async () => {
    const { service } = build()
    await activate(service, OWNER)
    expect(await service.resolveByScope({ ...OWNER, workspaceId: 'other-ws' }, target)).toBeNull()
  })
})

// #2369.13 — jamais une faute, une donnée fausse, un ton agressif isolé.
describe('MessageStyleService.proposeRule — #2369.13', () => {
  it('refuse une proposition portée par un signal exclu', async () => {
    const { service } = build()
    await expect(
      service.proposeRule(OWNER, { signal: 'spelling_or_grammar_fix', observation: 'Faute corrigée' }),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      service.proposeRule(OWNER, { signal: 'false_or_fabricated_data_correction', observation: 'Chiffre corrigé' }),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      service.proposeRule(OWNER, { signal: 'isolated_aggressive_tone', observation: 'Ton corrigé une fois' }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('accepte une préférence de formulation, de structure ou de ton', async () => {
    const { service, proposals } = build()
    await service.proposeRule(OWNER, { signal: 'wording_preference', observation: 'Retire les points d’exclamation' })
    expect(proposals.rows).toHaveLength(1)
  })
})

// #2369.7/.8 — proposer n'est jamais adopter ; l'adoption est un geste humain séparé.
describe('MessageStyleService — proposer ne durcit jamais seul, adopter est un geste explicite', () => {
  it('une proposition naît TOUJOURS `pending`, jamais `adopted`', async () => {
    const { service } = build()
    const proposal = await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    expect(proposal.status).toBe('pending')
    expect(proposal.decidedBy).toBeNull()
    expect(proposal.decidedAt).toBeNull()
  })

  it('lister les propositions ne les adopte pas non plus — la lecture ne décide rien', async () => {
    const { service } = build()
    await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    const listed = await service.listRuleProposals(OWNER)
    expect(listed.every(p => p.status === 'pending')).toBe(true)
  })

  it('adopter exige `team:manage` — un simple commercial ne peut pas ériger sa propre règle', async () => {
    const { service } = build()
    const proposal = await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    await expect(service.decideRuleProposal(OWNER, proposal.id, 'adopted')).rejects.toThrow(ForbiddenException)
  })

  it('un manager adopte explicitement — la proposition passe alors à `adopted`, avec décideur et date', async () => {
    const { service } = build()
    const proposal = await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    const decided = await service.decideRuleProposal(MANAGER, proposal.id, 'adopted')
    expect(decided.status).toBe('adopted')
    expect(decided.decidedBy).toBe(MANAGER.userId)
    expect(decided.decidedAt).not.toBeNull()
  })

  it('un manager peut aussi refuser — `rejected`, jamais silencieusement ignoré', async () => {
    const { service } = build()
    const proposal = await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    const decided = await service.decideRuleProposal(MANAGER, proposal.id, 'rejected')
    expect(decided.status).toBe('rejected')
  })

  it('une proposition déjà décidée ne se redécide pas', async () => {
    const { service } = build()
    const proposal = await service.proposeRule(OWNER, { signal: 'tone_preference', observation: 'Plus direct' })
    await service.decideRuleProposal(MANAGER, proposal.id, 'adopted')
    await expect(service.decideRuleProposal(MANAGER, proposal.id, 'rejected')).rejects.toThrow(ConflictException)
  })
})

// #2369.2/.3/.4/.5 (LOT SOIR 26/09) — importer pour apprentissage, analyser, restituer.
describe('MessageStyleService.importAndAnalyze — #2369.2/.3/.4/.5', () => {
  const baseImport = {
    importKind: 'email' as const,
    sourceType: 'sent_message' as const,
  }

  it('un spectateur (`viewer`) ne peut pas importer', async () => {
    const { service } = build()
    await expect(
      service.importAndAnalyze(VIEWER, { ...baseImport, rawText: 'Bonjour Julien,\nCordialement,' }),
    ).rejects.toThrow(ForbiddenException)
  })

  it('persiste l’import SANS jamais renvoyer le texte importé — le corps ne sort pas (doctrine)', async () => {
    const { service, imports } = build()
    const result = await service.importAndAnalyze(OWNER, {
      ...baseImport,
      rawText: 'Bonjour Julien,\nRavi de vous contacter.\nCordialement,',
    })
    expect(imports.rows).toHaveLength(1)
    expect(imports.rows[0]?.raw_text).toContain('Bonjour Julien')
    expect(result).not.toHaveProperty('rawText')
    expect(JSON.stringify(result)).not.toContain('Bonjour Julien')
  })

  it('restitue la longueur — toujours nommée dans « conserve »', async () => {
    const { service } = build()
    const result = await service.importAndAnalyze(OWNER, { ...baseImport, rawText: 'Un message très court.' })
    expect(result.conserve.some(line => line.includes('longueur'))).toBe(true)
  })

  it('crée une VRAIE proposition `pending` pour chaque signal proposé — réutilise #2369.7/.8, jamais une seconde écriture', async () => {
    const { service, proposals } = build()
    const result = await service.importAndAnalyze(OWNER, {
      ...baseImport,
      rawText: 'Bonjour Julien,\nRavi de vous contacter.\nCordialement,',
    })
    expect(result.propose.length).toBeGreaterThan(0)
    for (const proposal of result.propose) {
      expect(proposal.status).toBe('pending')
    }
    expect(proposals.rows).toHaveLength(result.propose.length)
  })

  it('ne propose RIEN pour un ton agressif isolé — #2369.13 s’applique même depuis l’import', async () => {
    const { service, proposals } = build()
    const result = await service.importAndAnalyze(OWNER, {
      ...baseImport,
      rawText: 'Dernière chance !!! Agissez maintenant !!! Ne ratez pas cette offre !!!',
    })
    expect(result.propose).toEqual([])
    expect(result.neReproduitPas.some(line => /agressif/.test(line))).toBe(true)
    expect(proposals.rows).toHaveLength(0)
  })
})

const PREVIEW_TARGET = { objective: 'Relancer un décideur silencieux', channel: 'email' as const }
const CONTACT = '55555555-5555-4555-8555-555555555555'

async function activeTemplate(
  service: MessageStyleService,
  ctx: MessageStyleCtx,
  overrides: { scope?: 'workspace' | 'user'; persona?: string; forbidden?: string[] } = {},
) {
  const draft = await service.createTemplate(ctx, { ...baseTemplate, ...overrides })
  await service.transitionTemplate(ctx, draft.id, 'validated')
  return service.transitionTemplate(ctx, draft.id, 'active')
}

// #2369.11 — comparer générique/espace/utilisateur/finale en réutilisant `IaClient.generateMessage`.
describe('MessageStyleService.previewCompare — #2369.11', () => {
  it('un spectateur ne peut pas comparer', async () => {
    const { service } = build()
    await expect(service.previewCompare(VIEWER, { ...PREVIEW_TARGET, contactId: CONTACT })).rejects.toThrow(
      ForbiddenException,
    )
  })

  it('refuse un canal que le générateur ne couvre pas encore, plutôt que de deviner un exemple', async () => {
    const { service } = build()
    await expect(
      service.previewCompare(OWNER, { objective: 'x', channel: 'manual', contactId: CONTACT }),
    ).rejects.toThrow(BadRequestException)
  })

  it('#3405.3 — un contact dont le compte est en NO-GO : refus nommé, aucun appel modèle', async () => {
    const { service, ia, outreachMessages } = build()
    outreachMessages.manager.query.mockResolvedValueOnce([{ sprint: 'no_go', sprint_reason: 'budget gelé' }])
    await expect(service.previewCompare(OWNER, { ...PREVIEW_TARGET, contactId: CONTACT })).rejects.toThrow(
      /NO-GO \(budget gelé\)/,
    )
    expect(ia.generateMessage).not.toHaveBeenCalled()
  })

  it('sans AUCUN template actif : `generic` génère, les trois autres couches restent `null` sans appeler l’IA', async () => {
    const { service, ia } = build()
    const results = await service.previewCompare(OWNER, { ...PREVIEW_TARGET, contactId: CONTACT })
    expect(results).toEqual([
      { layer: 'generic', templateId: null, text: 'Objet\n\nCorps' },
      { layer: 'workspace', templateId: null, text: null },
      { layer: 'user', templateId: null, text: null },
      { layer: 'final', templateId: null, text: null },
    ])
    expect(ia.generateMessage).toHaveBeenCalledTimes(1)
  })

  it('`workspace` et `final` pointent le même template — un seul appel IA pour les deux', async () => {
    const { service, ia } = build()
    const ws = await activeTemplate(service, OWNER, { scope: 'workspace' })
    const results = await service.previewCompare(OWNER, { ...PREVIEW_TARGET, contactId: CONTACT })
    expect(results.find(r => r.layer === 'workspace')).toEqual({
      layer: 'workspace',
      templateId: ws.id,
      text: 'Objet\n\nCorps',
    })
    expect(results.find(r => r.layer === 'final')).toEqual({
      layer: 'final',
      templateId: ws.id,
      text: 'Objet\n\nCorps',
    })
    // generic (sans style) + workspace/final (même template) = deux appels, jamais quatre.
    expect(ia.generateMessage).toHaveBeenCalledTimes(2)
  })

  it('la consigne de style voyage dans `context`, jamais un second paramètre IA (GA-26)', async () => {
    const { service, ia } = build()
    await activeTemplate(service, OWNER, {
      scope: 'workspace',
      persona: 'DSI grand compte',
      forbidden: ['jamais de prix'],
    })
    await service.previewCompare(OWNER, { ...PREVIEW_TARGET, contactId: CONTACT, context: 'Angle : refonte SI' })
    const calls = ia.generateMessage.mock.calls.map(
      (call: unknown[]) => (call[0] as { context?: string }).context ?? '',
    )
    expect(calls).toContain('Angle : refonte SI')
    expect(calls.some(c => c.includes('DSI grand compte') && c.includes('jamais de prix'))).toBe(true)
  })
})

// #2369.12 — les quatre taux, groupés PAR STYLE, jamais par personne.
describe('MessageStyleService.getUsageByStyle — #2369.12', () => {
  it('mappe chaque ligne SQL groupée vers les quatre taux (`computeMessageStyleUsageStats`)', async () => {
    const { service, outreachMessages } = build()
    outreachMessages.manager.query.mockResolvedValueOnce([
      {
        template_id: '11111111-1111-1111-1111-111111111111',
        template_version: 1,
        total: 4,
        modified: 1,
        validated: 2,
        responded: 1,
        unsubscribed: 0,
      },
    ])
    const usage = await service.getUsageByStyle(OWNER)
    expect(usage).toEqual([
      {
        templateId: '11111111-1111-1111-1111-111111111111',
        templateVersion: 1,
        sampleSize: 4,
        modificationRate: 0.25,
        validationRate: 0.5,
        responseRate: 0.25,
        unsubscribeRate: 0,
      },
    ])
    expect(outreachMessages.manager.query).toHaveBeenCalledWith(expect.any(String), [WS])
  })

  it('aucun message relié à un style → aucune ligne, jamais un 0 inventé', async () => {
    const { service } = build()
    expect(await service.getUsageByStyle(OWNER)).toEqual([])
  })
})

// #2947 (#2204.60/.61/.63, lot M09) — pitch, ton et signature : déclarés, jamais déduits.
describe('MessageStyleService — #2204.60/.61/.63 pitch, ton, signature', () => {
  it('non déclarés : `null`, jamais une chaîne vide ni un défaut', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, baseTemplate)
    expect(template.pitch).toBeNull()
    expect(template.tone).toBeNull()
    expect(template.signature).toBeNull()
  })

  it('déclarés : persistés tels quels', async () => {
    const { service } = build()
    const template = await service.createTemplate(OWNER, {
      ...baseTemplate,
      pitch: 'Le socle data livré en 8 semaines chez un assureur',
      tone: 'Vouvoiement, direct',
      signature: 'Claire Martin — Bellum Conseil',
    })
    expect(template.pitch).toBe('Le socle data livré en 8 semaines chez un assureur')
    expect(template.tone).toBe('Vouvoiement, direct')
    expect(template.signature).toBe('Claire Martin — Bellum Conseil')
  })
})

describe('composeMessageStylePreviewContext — #2204.60/.61/.63 atteignent la consigne', () => {
  const template = {
    id: '00000000-0000-4000-8000-000000000001',
    workspaceId: WS,
    ownerId: OWNER.userId,
    objective: 'Relancer',
    channel: 'email' as const,
    persona: 'DSI',
    status: 'active' as const,
    forbidden: [],
    version: 1,
    scope: 'workspace' as const,
    businessUnitId: null,
    conversationId: null,
    pitch: null,
    tone: null,
    signature: null,
    createdAt: '2026-10-09T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
  }

  it('sans pitch/ton/signature, la consigne est celle d’avant, à l’octet', () => {
    expect(composeMessageStylePreviewContext(undefined, template)).toBe('Style à respecter — persona : DSI.')
  })

  it('les trois champs déclarés sont nommés dans la consigne', () => {
    const context = composeMessageStylePreviewContext('Angle : data', {
      ...template,
      pitch: 'Socle data livré chez un assureur',
      tone: 'Vouvoiement, direct',
      signature: 'Claire Martin — Bellum Conseil',
    })
    expect(context).toContain('Angle : data')
    expect(context).toContain('Pitch à mettre en avant : Socle data livré chez un assureur')
    expect(context).toContain('Ton : Vouvoiement, direct')
    expect(context).toContain('Signature à recopier telle quelle en fin de message : Claire Martin — Bellum Conseil')
  })
})
