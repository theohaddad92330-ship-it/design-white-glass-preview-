import { describe, expect, it } from 'vitest'
import {
  MESSAGE_STYLE_SCOPE_PRIORITY,
  MESSAGE_STYLE_TEMPLATE_STATUSES,
  checkMessageStyleTemplateTransition,
  compareMessageStyleLayers,
  computeMessageStyleUsageStats,
  createMessageStyleTemplateSchema,
  messageStyleTemplateSchema,
  messageStyleThreadKey,
  resolveMessageStyleTemplate,
  type MessageStyleTemplate,
} from './message-style.js'

// #2369.9 — l'objet Template porte objectif/canal/persona/statut/interdits/version/owner.
describe('messageStyleTemplateSchema — les sept attributs de #2369.9', () => {
  const valid = {
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    ownerId: '33333333-3333-3333-3333-333333333333',
    objective: 'Relancer un décideur silencieux depuis 15 jours',
    channel: 'email',
    persona: 'Décideur IT, grand compte',
    status: 'draft',
    forbidden: ['jamais de superlatif', 'jamais de prix'],
    version: 1,
    scope: 'workspace' as const,
    businessUnitId: null,
    conversationId: null,
    // #2947 — pitch, ton et signature : `null` = non déclarés, jamais devinés.
    pitch: null,
    tone: null,
    signature: null,
    createdAt: '2026-09-25T10:00:00.000Z',
    updatedAt: '2026-09-25T10:00:00.000Z',
  }

  it('accepte un template complet', () => {
    expect(messageStyleTemplateSchema.parse(valid)).toEqual(valid)
  })

  it('exige les sept attributs — objectif, canal, persona, statut, interdits, version, owner', () => {
    for (const key of ['objective', 'channel', 'persona', 'status', 'forbidden', 'version', 'ownerId']) {
      const { [key]: _omitted, ...rest } = valid as Record<string, unknown>
      expect(messageStyleTemplateSchema.safeParse(rest).success, key).toBe(false)
    }
  })

  it('la version est un entier strictement positif — jamais 0 (GA-18)', () => {
    expect(messageStyleTemplateSchema.safeParse({ ...valid, version: 0 }).success).toBe(false)
    expect(messageStyleTemplateSchema.safeParse({ ...valid, version: -1 }).success).toBe(false)
  })

  it('le canal réutilise le vocabulaire de outreach — pas un second enum (GA-26)', () => {
    // #2370 (V10-F) — `sms` est devenu un canal réel ; l'inconnu se teste sur `fax`.
    expect(messageStyleTemplateSchema.safeParse({ ...valid, channel: 'fax' }).success).toBe(false)
    expect(messageStyleTemplateSchema.safeParse({ ...valid, channel: 'linkedin' }).success).toBe(true)
  })

  it('naît sans interdit accepté — un tableau vide reste un tableau, jamais absent', () => {
    expect(messageStyleTemplateSchema.safeParse({ ...valid, forbidden: [] }).success).toBe(true)
  })
})

describe('createMessageStyleTemplateSchema — la création ne porte ni statut ni version ni owner', () => {
  it('un statut fourni à la création est ignoré — il naît toujours `draft` côté serveur', () => {
    const result = createMessageStyleTemplateSchema.safeParse({
      objective: 'Ouvrir un compte dormant',
      channel: 'linkedin',
      persona: 'RH',
      status: 'active',
    })
    expect(result.success).toBe(true)
    if (result.success) expect('status' in result.data).toBe(false)
  })

  it('interdits par défaut à liste vide, jamais deviné', () => {
    const result = createMessageStyleTemplateSchema.parse({
      objective: 'Ouvrir un compte dormant',
      channel: 'linkedin',
      persona: 'RH',
    })
    expect(result.forbidden).toEqual([])
  })

  it('#2369.6 — sans portée précisée, aucun `scope` ne part : le comportement historique (visible par tout l’espace) continue', () => {
    const result = createMessageStyleTemplateSchema.parse({
      objective: 'Ouvrir un compte dormant',
      channel: 'linkedin',
      persona: 'RH',
    })
    expect('scope' in result).toBe(false)
  })

  it('#2369.6 — une portée `business_unit` sans périmètre désigné est REFUSÉE, même forme que createMemoryItemSchema', () => {
    expect(
      createMessageStyleTemplateSchema.safeParse({
        objective: 'Ouvrir un compte dormant',
        channel: 'linkedin',
        persona: 'RH',
        scope: 'business_unit',
      }).success,
    ).toBe(false)
    expect(
      createMessageStyleTemplateSchema.safeParse({
        objective: 'Ouvrir un compte dormant',
        channel: 'linkedin',
        persona: 'RH',
        scope: 'business_unit',
        businessUnitId: '44444444-4444-4444-4444-444444444444',
      }).success,
    ).toBe(true)
  })

  it('#2369.6 — une portée `conversation` sans fil désigné est REFUSÉE', () => {
    expect(
      createMessageStyleTemplateSchema.safeParse({
        objective: 'Ouvrir un compte dormant',
        channel: 'linkedin',
        persona: 'RH',
        scope: 'conversation',
      }).success,
    ).toBe(false)
    expect(
      createMessageStyleTemplateSchema.safeParse({
        objective: 'Ouvrir un compte dormant',
        channel: 'linkedin',
        persona: 'RH',
        scope: 'conversation',
        conversationId: 'general',
      }).success,
    ).toBe(true)
  })
})

/**
 * #2369.6 (LOT j1 26/09) — LA PRIORITÉ FIXE : campagne (fil) > moi > équipe >
 * tout l'espace. `équipe` désigne `business_unit`, `campagne` désigne
 * `conversation` — réutilisés depuis `MemoryItemScope`, jamais un second enum.
 */
describe('resolveMessageStyleTemplate — la priorité fixe de #2369.6', () => {
  const USER_A = 'a1111111-1111-1111-1111-111111111111'
  const USER_B = 'b2222222-2222-2222-2222-222222222222'
  const BU = 'c3333333-3333-3333-3333-333333333333'

  function template(overrides: Partial<MessageStyleTemplate>): MessageStyleTemplate {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      ownerId: USER_A,
      objective: 'Relancer un décideur silencieux',
      channel: 'email',
      persona: 'Décideur IT',
      status: 'active',
      forbidden: [],
      version: 1,
      scope: 'workspace',
      businessUnitId: null,
      conversationId: null,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
      ...overrides,
    }
  }

  const TARGET = { objective: 'Relancer un décideur silencieux', channel: 'email' as const }

  it('l’ordre fixe va du plus spécifique au plus général', () => {
    expect(MESSAGE_STYLE_SCOPE_PRIORITY).toEqual(['conversation', 'user', 'business_unit', 'workspace'])
  })

  it('sans rien de plus précis, le style `workspace` sert de défaut', () => {
    const ws = template({ scope: 'workspace' })
    expect(resolveMessageStyleTemplate([ws], TARGET, { userId: USER_B })).toEqual(ws)
  })

  it('un style « moi » l’emporte sur « tout l’espace », pour SON auteur seulement', () => {
    const ws = template({ scope: 'workspace' })
    const mine = template({ id: '99999999-9999-9999-9999-999999999999', scope: 'user', ownerId: USER_A })
    expect(resolveMessageStyleTemplate([ws, mine], TARGET, { userId: USER_A })).toEqual(mine)
    // Pour un AUTRE utilisateur, le style « moi » de USER_A ne s'applique pas : retombe sur workspace.
    expect(resolveMessageStyleTemplate([ws, mine], TARGET, { userId: USER_B })).toEqual(ws)
  })

  it('un style « équipe » (business_unit) l’emporte sur « tout l’espace », mais cède devant « moi »', () => {
    const ws = template({ scope: 'workspace' })
    const team = template({ id: '88888888-8888-8888-8888-888888888888', scope: 'business_unit', businessUnitId: BU })
    const mine = template({ id: '99999999-9999-9999-9999-999999999999', scope: 'user', ownerId: USER_A })
    expect(resolveMessageStyleTemplate([ws, team], TARGET, { userId: USER_B, businessUnitId: BU })).toEqual(team)
    expect(resolveMessageStyleTemplate([ws, team, mine], TARGET, { userId: USER_A, businessUnitId: BU })).toEqual(mine)
  })

  it('un style « campagne » (ce fil précis) l’emporte sur TOUT le reste', () => {
    const ws = template({ scope: 'workspace' })
    const mine = template({ id: '99999999-9999-9999-9999-999999999999', scope: 'user', ownerId: USER_A })
    const thisThread = template({
      id: '77777777-7777-7777-7777-777777777777',
      scope: 'conversation',
      conversationId: 'account:acc-1',
    })
    expect(
      resolveMessageStyleTemplate([ws, mine, thisThread], TARGET, {
        userId: USER_A,
        conversationId: 'account:acc-1',
      }),
    ).toEqual(thisThread)
  })

  it('un style « équipe »/« campagne » d’un AUTRE périmètre/fil ne s’applique jamais — jamais déduit', () => {
    const otherTeam = template({ scope: 'business_unit', businessUnitId: 'zzzzzzzz-0000-0000-0000-000000000000' })
    const otherThread = template({
      id: '66666666-6666-6666-6666-666666666666',
      scope: 'conversation',
      conversationId: 'account:other',
    })
    expect(
      resolveMessageStyleTemplate([otherTeam, otherThread], TARGET, {
        userId: USER_B,
        businessUnitId: BU,
        conversationId: 'account:acc-1',
      }),
    ).toBeNull()
  })

  it('rien n’est `active` (ou rien ne matche l’objectif/canal) → `null`, jamais une erreur ni un style deviné', () => {
    const draftOnly = template({ status: 'draft' })
    const otherObjective = template({ objective: 'Un autre objectif' })
    expect(resolveMessageStyleTemplate([draftOnly, otherObjective], TARGET, { userId: USER_A })).toBeNull()
    expect(resolveMessageStyleTemplate([], TARGET, { userId: USER_A })).toBeNull()
  })
})

// #2369.10 — cinq statuts (draft/validated/active/deprecated/archived), cycle gardé.
describe('checkMessageStyleTemplateTransition — le cycle à cinq statuts de #2369.10', () => {
  it('porte EXACTEMENT les cinq statuts, dans cet ordre (GA-08 — jamais réordonné)', () => {
    expect(MESSAGE_STYLE_TEMPLATE_STATUSES).toEqual(['draft', 'validated', 'active', 'deprecated', 'archived'])
  })

  it('le chemin nominal : draft → validated → active → deprecated → archived', () => {
    expect(checkMessageStyleTemplateTransition('draft', 'validated')).toEqual({ ok: true })
    expect(checkMessageStyleTemplateTransition('validated', 'active')).toEqual({ ok: true })
    expect(checkMessageStyleTemplateTransition('active', 'deprecated')).toEqual({ ok: true })
    expect(checkMessageStyleTemplateTransition('deprecated', 'archived')).toEqual({ ok: true })
  })

  it('un déprécié se réactive — l’usage n’est pas figé pour toujours', () => {
    expect(checkMessageStyleTemplateTransition('deprecated', 'active')).toEqual({ ok: true })
  })

  it('archivé est un état terminal — on archive, on ne supprime pas, mais on ne ressuscite pas ici', () => {
    for (const to of MESSAGE_STYLE_TEMPLATE_STATUSES) {
      expect(checkMessageStyleTemplateTransition('archived', to)).toEqual({ ok: false, reason: 'not_allowed' })
    }
  })

  it('un brouillon ne saute jamais directement à actif — la validation ne se saute pas', () => {
    expect(checkMessageStyleTemplateTransition('draft', 'active')).toEqual({ ok: false, reason: 'not_allowed' })
  })

  it('refuse un état inconnu plutôt que de deviner', () => {
    expect(checkMessageStyleTemplateTransition('draft', 'made_up' as never)).toEqual({
      ok: false,
      reason: 'not_allowed',
    })
    expect(checkMessageStyleTemplateTransition('made_up' as never, 'draft')).toEqual({
      ok: false,
      reason: 'unknown_state',
    })
  })

  it('chaque statut a une issue déclarée — aucun n’est un cul-de-sac silencieux hors archived', () => {
    for (const status of MESSAGE_STYLE_TEMPLATE_STATUSES) {
      if (status === 'archived') continue
      const reachable = MESSAGE_STYLE_TEMPLATE_STATUSES.filter(to => checkMessageStyleTemplateTransition(status, to).ok)
      expect(reachable.length, status).toBeGreaterThan(0)
    }
  })
})

// #2369.11 — comparer générique / espace / utilisateur / finale, sans deviner une couche absente.
describe('compareMessageStyleLayers — les quatre couches de #2369.11', () => {
  const USER_A = 'a1111111-1111-1111-1111-111111111111'
  const USER_B = 'b2222222-2222-2222-2222-222222222222'

  function template(overrides: Partial<MessageStyleTemplate>): MessageStyleTemplate {
    return {
      id: '11111111-1111-1111-1111-111111111111',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      ownerId: USER_A,
      objective: 'Relancer un décideur silencieux',
      channel: 'email',
      persona: 'Décideur IT',
      status: 'active',
      forbidden: [],
      version: 1,
      scope: 'workspace',
      businessUnitId: null,
      conversationId: null,
      createdAt: '2026-09-25T10:00:00.000Z',
      updatedAt: '2026-09-25T10:00:00.000Z',
      ...overrides,
    }
  }

  const TARGET = { objective: 'Relancer un décideur silencieux', channel: 'email' as const }

  it('toujours les quatre couches, dans cet ordre — `generic` en premier, jamais un template deviné', () => {
    const layers = compareMessageStyleLayers([], TARGET, { userId: USER_A })
    expect(layers.map(l => l.layer)).toEqual(['generic', 'workspace', 'user', 'final'])
    expect(layers[0]).toEqual({ layer: 'generic', template: null })
    for (const layer of layers) {
      if (layer.layer !== 'generic') expect(layer.template).toBeNull()
    }
  })

  it('espace et utilisateur se lisent chacun séparément, sans attendre `final`', () => {
    const ws = template({ scope: 'workspace' })
    const mine = template({ id: '99999999-9999-9999-9999-999999999999', scope: 'user', ownerId: USER_A })
    const layers = compareMessageStyleLayers([ws, mine], TARGET, { userId: USER_A })
    expect(layers.find(l => l.layer === 'workspace')?.template).toEqual(ws)
    expect(layers.find(l => l.layer === 'user')?.template).toEqual(mine)
    // `final` : « moi » l'emporte sur « tout l'espace » (#2369.6), donc `final` = mine, pas ws.
    expect(layers.find(l => l.layer === 'final')?.template).toEqual(mine)
  })

  it('un style « moi » d’un AUTRE utilisateur ne remplit pas la couche `user` de celui-ci', () => {
    const ws = template({ scope: 'workspace' })
    const theirs = template({ id: '99999999-9999-9999-9999-999999999999', scope: 'user', ownerId: USER_A })
    const layers = compareMessageStyleLayers([ws, theirs], TARGET, { userId: USER_B })
    expect(layers.find(l => l.layer === 'user')?.template).toBeNull()
    expect(layers.find(l => l.layer === 'final')?.template).toEqual(ws)
  })

  it('sans style « moi », `final` retombe sur `workspace` — jamais nul par excès de prudence', () => {
    const ws = template({ scope: 'workspace' })
    const layers = compareMessageStyleLayers([ws], TARGET, { userId: USER_B })
    expect(layers.find(l => l.layer === 'user')?.template).toBeNull()
    expect(layers.find(l => l.layer === 'final')?.template).toEqual(ws)
  })
})

// #2369.12 — un dénominateur de zéro sort le taux du calcul, jamais un `0`.
describe('computeMessageStyleUsageStats — les quatre taux, jamais 0 sur un dénominateur vide (GA-18/19)', () => {
  const BASE = { templateId: '11111111-1111-1111-1111-111111111111', templateVersion: 1 }

  it('calcule les quatre taux sur un groupe non vide', () => {
    const stats = computeMessageStyleUsageStats({
      ...BASE,
      total: 4,
      modified: 1,
      validated: 2,
      responded: 1,
      unsubscribed: 0,
    })
    expect(stats).toEqual({
      templateId: BASE.templateId,
      templateVersion: 1,
      sampleSize: 4,
      modificationRate: 0.25,
      validationRate: 0.5,
      responseRate: 0.25,
      unsubscribeRate: 0,
    })
  })

  it('un groupe à zéro message ne rend AUCUN taux à 0 — chacun est `null` (non mesuré)', () => {
    const stats = computeMessageStyleUsageStats({
      ...BASE,
      total: 0,
      modified: 0,
      validated: 0,
      responded: 0,
      unsubscribed: 0,
    })
    expect(stats.sampleSize).toBe(0)
    expect(stats.modificationRate).toBeNull()
    expect(stats.validationRate).toBeNull()
    expect(stats.responseRate).toBeNull()
    expect(stats.unsubscribeRate).toBeNull()
  })
})

describe('#2204.65 — messageStyleThreadKey : le « fil » du composer est celui du contact', () => {
  const contactId = '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'

  it('est stable, et accepté par la portée « fil » à la création', () => {
    expect(messageStyleThreadKey(contactId)).toBe(`contact:${contactId}`)
    expect(messageStyleThreadKey(contactId)).toBe(messageStyleThreadKey(contactId))
    const created = createMessageStyleTemplateSchema.safeParse({
      objective: 'Relancer',
      channel: 'email',
      persona: 'DSI',
      scope: 'conversation',
      conversationId: messageStyleThreadKey(contactId),
    })
    expect(created.success).toBe(true)
  })

  it('deux contacts, deux fils — jamais le même', () => {
    expect(messageStyleThreadKey(contactId)).not.toBe(messageStyleThreadKey('11111111-1111-4111-8111-111111111111'))
  })

  it('tient dans les 200 caractères de `conversationId`', () => {
    expect(messageStyleThreadKey(contactId).length).toBeLessThanOrEqual(200)
  })
})
