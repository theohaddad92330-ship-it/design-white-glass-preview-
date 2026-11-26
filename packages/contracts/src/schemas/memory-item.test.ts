import { describe, expect, it } from 'vitest'
import {
  createMemoryItemSchema,
  defaultMemoryScope,
  isMemoryItemExpired,
  memoryItemKinds,
  memoryItemOriginSchema,
  memoryItemSchema,
  memoryItemScopes,
  offerableMemoryScopes,
  updateMemoryItemScopeSchema,
} from './memory-item.js'

const NOW = Date.UTC(2026, 6, 23)

/**
 * #1918.1 / #1917.3 — LA PORTÉE d'un élément de mémoire : pour la personne
 * seule (`user`) ou pour tout l'espace (`workspace`). Décision de Louis du
 * 12/09/2026 : la portée est demandée à la confirmation, défaut « moi », SAUF la
 * correction d'un compte, dont le défaut est « mon espace ».
 */
describe('portée d’un élément de mémoire (#1918.1)', () => {
  it('nomme quatre portées, les deux premières INCHANGÉES et les neuves EN FIN (GA-08)', () => {
    expect(memoryItemScopes).toEqual(['user', 'workspace', 'business_unit', 'conversation'])
  })

  it('le corps d’épinglage accepte une portée, et la refuse inconnue plutôt que de stocker du texte libre', () => {
    expect(createMemoryItemSchema.parse({ fact: 'x', scope: 'user' }).scope).toBe('user')
    expect(createMemoryItemSchema.parse({ fact: 'x', scope: 'workspace' }).scope).toBe('workspace')
    expect(() => createMemoryItemSchema.parse({ fact: 'x', scope: 'team' })).toThrow()
  })

  it('le corps d’épinglage ne porte AUCUN propriétaire : l’identité vient du jeton, jamais du corps', () => {
    const parsed = createMemoryItemSchema.parse({ fact: 'x', scope: 'user', userId: 'u-autre', ownerId: 'u-autre' })
    expect(parsed).not.toHaveProperty('userId')
    expect(parsed).not.toHaveProperty('ownerId')
  })

  it('changer la portée n’accepte QUE la portée — rien d’autre ne se glisse dans ce corps', () => {
    expect(updateMemoryItemScopeSchema.parse({ scope: 'workspace' })).toEqual({ scope: 'workspace' })
    expect(() => updateMemoryItemScopeSchema.parse({})).toThrow()
    expect(() => updateMemoryItemScopeSchema.parse({ scope: 'workspace', fact: 'réécrit' })).toThrow()
  })

  it('défaut « moi » pour un fait, une préférence, une note — avec ou sans compte', () => {
    expect(defaultMemoryScope({})).toBe('user')
    expect(defaultMemoryScope({ kind: 'fact', accountId: 'acc-1' })).toBe('user')
    expect(defaultMemoryScope({ kind: 'preference', accountId: null })).toBe('user')
    // Une correction SANS compte n'est pas « la correction d'un compte » : elle
    // peut être un objectif personnel — défaut « moi ».
    expect(defaultMemoryScope({ kind: 'correction', accountId: null })).toBe('user')
  })

  it('défaut « mon espace » pour la correction d’un compte', () => {
    expect(defaultMemoryScope({ kind: 'correction', accountId: 'acc-1' })).toBe('workspace')
  })

  /**
   * #1962.5 — « Règle d'ESN » est la SEULE nature dont le nom dit déjà qu'elle
   * est partagée : la proposer « toi uniquement » ferait mentir son étiquette.
   * Ce n'est qu'un défaut — la personne garde le choix sur la carte.
   */
  it('défaut « mon espace » pour une règle d’ESN, avec ou sans compte (#1962.5)', () => {
    expect(defaultMemoryScope({ kind: 'workspace_rule' })).toBe('workspace')
    expect(defaultMemoryScope({ kind: 'workspace_rule', accountId: 'acc-1' })).toBe('workspace')
  })

  it('les natures ajoutées par #1962 restent « moi » par défaut — sauf la règle d’ESN', () => {
    expect(defaultMemoryScope({ kind: 'sourced_observation', accountId: 'acc-1' })).toBe('user')
    expect(defaultMemoryScope({ kind: 'hypothesis' })).toBe('user')
    expect(defaultMemoryScope({ kind: 'temporary_context' })).toBe('user')
  })

  it('la forme renvoyée porte la portée ET « est-ce le mien ? », jamais l’identifiant du propriétaire', () => {
    const item = memoryItemSchema.parse({
      id: 'm-1',
      fact: 'x',
      accountId: null,
      kind: 'fact',
      origin: 'manual',
      scope: 'user',
      ownedByMe: true,
      canForget: true,
      expiresAt: null,
      createdAt: '2026-07-23T08:00:00.000Z',
    })
    expect(item.scope).toBe('user')
    expect(item.ownedByMe).toBe(true)
    // #1918.7 — le droit de RETIRER est calculé par le serveur pour l'appelant
    // (auteur, ou manager sur un élément partagé) : l'écran ne devine aucun rôle.
    expect(item.canForget).toBe(true)
    expect(Object.keys(memoryItemSchema.shape)).not.toContain('userId')
  })
})

describe('createMemoryItemSchema (V2 §20 — nature, origine, expiration)', () => {
  it('accepts the historical shape (fact only) — kind/origin/expiry are optional', () => {
    const parsed = createMemoryItemSchema.parse({ fact: '  Budget IT voté  ' })
    expect(parsed).toEqual({ fact: 'Budget IT voté' })
  })

  it('accepts a preference, a correction and an expiry date', () => {
    const parsed = createMemoryItemSchema.parse({
      fact: 'Ne jamais proposer de régie',
      kind: 'correction',
      origin: 'copilot',
      expiresAt: '2026-12-31T23:00:00.000Z',
    })
    expect(parsed.kind).toBe('correction')
    expect(parsed.origin).toBe('copilot')
    expect(parsed.expiresAt).toBe('2026-12-31T23:00:00.000Z')
  })

  it('rejects an unknown nature or origin rather than storing free text', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', kind: 'rumeur' })).toThrow()
    expect(() => createMemoryItemSchema.parse({ fact: 'x', origin: 'linkedin' })).toThrow()
  })

  it('rejects an empty fact (a whitespace-only pin is not a memory)', () => {
    expect(() => createMemoryItemSchema.parse({ fact: '   ' })).toThrow()
  })

  it('rejects an unparseable expiry rather than keeping a date nobody can read', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', expiresAt: 'fin d’année' })).toThrow()
  })
})

describe('memoryItemSchema (wire shape)', () => {
  it('carries the nature, the origin and the deadline', () => {
    const item = memoryItemSchema.parse({
      id: 'm-1',
      fact: 'DSI = décideur',
      accountId: null,
      kind: 'fact',
      origin: 'manual',
      scope: 'workspace',
      ownedByMe: false,
      canForget: false,
      expiresAt: null,
      createdAt: '2026-07-23T08:00:00.000Z',
    })
    expect(item.kind).toBe('fact')
    expect(item.origin).toBe('manual')
  })
})

describe('memoryItemKinds / origins', () => {
  /**
   * #1962.2/.5/.7/.9/.10 — SEPT NATURES, ET L'ORDRE DES TROIS PREMIÈRES NE BOUGE PAS.
   *
   * GA-08 : un enum LIVRÉ n'insère jamais au milieu — `kind` est écrit en base
   * (`memory_pinned_facts.kind`) et relu par le prompt. Les quatre natures
   * ajoutées arrivent EN FIN ; les trois d'avant gardent leur rang, donc chaque
   * ligne déjà écrite garde son sens.
   */
  it('garde les trois natures d’origine en tête, dans leur ordre', () => {
    expect(memoryItemKinds.slice(0, 3)).toEqual(['fact', 'preference', 'correction'])
  })

  it('nomme les huit natures, les cinq nouvelles ajoutées EN FIN (GA-08)', () => {
    // #2260 — `goal` (objectif) arrive après les quatre du #1962, toujours en fin.
    expect(memoryItemKinds).toEqual([
      'fact',
      'preference',
      'correction',
      'workspace_rule',
      'sourced_observation',
      'hypothesis',
      'temporary_context',
      'goal',
    ])
  })

  /**
   * #1962.2 — la huitième catégorie que l'issue demande, « note de Laura, à
   * vérifier », n'est PAS une nature : c'est l'origine `copilot` non confirmée,
   * qui existe déjà et que le registre affiche. Une nature de plus la
   * dédoublerait, et deux endroits diraient la même chose — un seul y répond.
   */
  it('ne dédouble pas « note de Laura » en nature : c’est une ORIGINE, elle reste une origine', () => {
    expect(memoryItemKinds).not.toContain('copilot_note')
    expect(memoryItemOriginSchema.options).toContain('copilot')
  })

  it('refuse une nature inconnue plutôt que de stocker du texte libre', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', kind: 'rumeur' })).toThrow()
    expect(createMemoryItemSchema.parse({ fact: 'x', kind: 'hypothesis' }).kind).toBe('hypothesis')
  })

  it('names the three provenances: hand-pinned, copilot answer, analysed dossier', () => {
    expect(memoryItemOriginSchema.options).toEqual(['manual', 'copilot', 'analysis'])
  })
})

describe('isMemoryItemExpired', () => {
  it('never expires an item without a deadline (the historical behaviour)', () => {
    expect(isMemoryItemExpired(null, NOW)).toBe(false)
    expect(isMemoryItemExpired(undefined, NOW)).toBe(false)
  })

  it('expires an item whose deadline has passed', () => {
    expect(isMemoryItemExpired('2026-07-22T00:00:00.000Z', NOW)).toBe(true)
  })

  it('keeps an item whose deadline is still ahead', () => {
    expect(isMemoryItemExpired('2026-07-24T00:00:00.000Z', NOW)).toBe(false)
  })

  it('does NOT expire on a date it could not read (never a guessed expiry)', () => {
    expect(isMemoryItemExpired('bientôt', NOW)).toBe(false)
  })
})

/**
 * #1918.2 / #1918.5 — LES DEUX PORTÉES AJOUTÉES EN FIN, et le témoin qui compte :
 * les deux anciennes se comportent EXACTEMENT comme avant.
 */
describe('portée « mon périmètre » et portée « cette conversation » (#1918.2 / #1918.5)', () => {
  it('TÉMOIN — sans contexte, on n’offre que les deux portées d’avant, dans le même ordre', () => {
    expect(offerableMemoryScopes({})).toEqual([{ scope: 'user' }, { scope: 'workspace' }])
  })

  it('offre « cette conversation » UNIQUEMENT dans un fil, et en dernier', () => {
    expect(offerableMemoryScopes({ conversationId: 'general' })).toEqual([
      { scope: 'user' },
      { scope: 'workspace' },
      { scope: 'conversation', conversationId: 'general' },
    ])
    // Un fil vide n'est pas un fil : on n'offre pas une portée qui ne désigne rien.
    expect(offerableMemoryScopes({ conversationId: '   ' })).toEqual([{ scope: 'user' }, { scope: 'workspace' }])
  })

  it('offre UN choix PAR PÉRIMÈTRE PORTÉ, nommé — jamais un « mon équipe » qui ne désigne personne', () => {
    expect(
      offerableMemoryScopes({
        businessUnits: [
          { id: 'bu-1', name: 'Agence Lyon' },
          { id: 'bu-2', name: 'Practice Data' },
        ],
      }),
    ).toEqual([
      { scope: 'user' },
      { scope: 'workspace' },
      { scope: 'business_unit', businessUnitId: 'bu-1', businessUnitName: 'Agence Lyon' },
      { scope: 'business_unit', businessUnitId: 'bu-2', businessUnitName: 'Practice Data' },
    ])
  })

  it('ne porte AUCUN périmètre ⇒ aucune portée d’équipe offerte (une portée qui ne filtre rien ne s’affiche pas)', () => {
    expect(offerableMemoryScopes({ businessUnits: [] })).toEqual([{ scope: 'user' }, { scope: 'workspace' }])
    expect(offerableMemoryScopes({ businessUnits: null })).toEqual([{ scope: 'user' }, { scope: 'workspace' }])
  })

  it('une portée qui DÉSIGNE quelqu’un exige sa désignation dès le corps de la requête', () => {
    expect(() => createMemoryItemSchema.parse({ fact: 'x', scope: 'conversation' })).toThrow()
    expect(createMemoryItemSchema.parse({ fact: 'x', scope: 'conversation', conversationId: 'general' }).scope).toBe(
      'conversation',
    )
    expect(() => createMemoryItemSchema.parse({ fact: 'x', scope: 'business_unit' })).toThrow()
    expect(
      createMemoryItemSchema.parse({
        fact: 'x',
        scope: 'business_unit',
        businessUnitId: '11111111-1111-4111-8111-111111111111',
      }).scope,
    ).toBe('business_unit')
  })

  it('TÉMOIN — les deux portées d’avant n’exigent toujours aucune désignation', () => {
    expect(createMemoryItemSchema.parse({ fact: 'x', scope: 'user' }).scope).toBe('user')
    expect(createMemoryItemSchema.parse({ fact: 'x', scope: 'workspace' }).scope).toBe('workspace')
    expect(createMemoryItemSchema.parse({ fact: 'x' }).scope).toBeUndefined()
  })

  it('changer la portée d’un élément DÉJÀ épinglé ne peut pas le rattacher à un fil ni à un périmètre', () => {
    expect(() => updateMemoryItemScopeSchema.parse({ scope: 'conversation' })).toThrow()
    expect(() => updateMemoryItemScopeSchema.parse({ scope: 'business_unit' })).toThrow()
    // TÉMOIN — les deux portées durables restent échangeables comme avant.
    expect(updateMemoryItemScopeSchema.parse({ scope: 'user' })).toEqual({ scope: 'user' })
    expect(updateMemoryItemScopeSchema.parse({ scope: 'workspace' })).toEqual({ scope: 'workspace' })
  })

  it('TÉMOIN — le défaut proposé est INCHANGÉ : aucune des deux neuves n’est un défaut', () => {
    expect(defaultMemoryScope({})).toBe('user')
    expect(defaultMemoryScope({ kind: 'correction', accountId: 'a-1' })).toBe('workspace')
    expect(defaultMemoryScope({ kind: 'workspace_rule' })).toBe('workspace')
  })
})
