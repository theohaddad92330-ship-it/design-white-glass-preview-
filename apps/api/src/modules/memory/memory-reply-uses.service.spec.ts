import { ChatReplyMemoryUseEntity } from '../../database/entities/chat-reply-memory-use.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import { MemoryReplyUsesService } from './memory-reply-uses.service'

/**
 * #1916.18 / #1916.24 — la trace des éléments de mémoire envoyés à Laura.
 *
 * Ces tests lisent les CLAUSES réellement passées à la base (portée, espace,
 * personne) : une trace mal bornée montrerait l'élément privé d'un collègue.
 */

const WS = 'ws-1'
const ME = 'user-me'
const COLLEAGUE = 'user-colleague'

function build() {
  const uses: MockRepository<ChatReplyMemoryUseEntity> = createMockRepository<ChatReplyMemoryUseEntity>()
  const service = new MemoryReplyUsesService(uses as never)
  return { uses, service, qb: uses._qb }
}

function whereClauses(qb: ReturnType<typeof build>['qb']): string[] {
  return [...qb.where.mock.calls, ...qb.andWhere.mock.calls].map(call => String(call[0]))
}

describe('MemoryReplyUsesService.captureTurn — ce qui était dans le contexte d’un tour', () => {
  it('écrit UNE ligne par élément envoyé, sans contenu, et rend le tour émis par le serveur', async () => {
    const { uses, service } = build()
    const turnId = await service.captureTurn({
      userId: ME,
      workspaceId: WS,
      surface: 'chat',
      factIds: ['f-1', 'f-2', 'f-1'],
    })
    expect(turnId).toMatch(/^[0-9a-f-]{36}$/)
    const [rows] = uses.insert.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(rows).toEqual([
      { workspace_id: WS, user_id: ME, turn_id: turnId, surface: 'chat', message_id: null, fact_id: 'f-1' },
      { workspace_id: WS, user_id: ME, turn_id: turnId, surface: 'chat', message_id: null, fact_id: 'f-2' },
    ])
  })

  it('aucun élément envoyé : aucune écriture, aucun tour', async () => {
    const { uses, service } = build()
    expect(await service.captureTurn({ userId: ME, workspaceId: WS, surface: 'chat', factIds: [] })).toBeNull()
    expect(uses.insert).not.toHaveBeenCalled()
  })

  it('une écriture ratée ne casse pas la réponse : pas de tour, donc aucune trace annoncée', async () => {
    const { uses, service } = build()
    uses.insert.mockRejectedValueOnce(new Error('db down'))
    expect(await service.captureTurn({ userId: ME, workspaceId: WS, surface: 'chat', factIds: ['f-1'] })).toBeNull()
  })

  it('purge les tours du chat jamais rattachés de CETTE personne, et seulement les siens', async () => {
    const { service, qb } = build()
    await service.captureTurn({ userId: ME, workspaceId: WS, surface: 'chat', factIds: ['f-1'] })
    const clauses = whereClauses(qb)
    expect(qb.delete).toHaveBeenCalled()
    expect(clauses).toEqual(expect.arrayContaining(['user_id = :user', 'surface = :surface', 'message_id IS NULL']))
    expect(clauses.some(clause => clause.includes('created_at <'))).toBe(true)
  })

  it('une réponse d’assistant externe est rattachée d’emblée : aucune purge à faire', async () => {
    const { uses, service, qb } = build()
    await service.captureTurn({ userId: ME, workspaceId: WS, surface: 'externalAssistant', factIds: ['f-1'] })
    expect(qb.delete).not.toHaveBeenCalled()
    const [rows] = uses.insert.mock.calls[0] as [Array<Record<string, unknown>>]
    expect(rows[0]).toMatchObject({ surface: 'externalAssistant', message_id: null })
  })
})

describe('MemoryReplyUsesService.attachTurn — rattacher un tour à la réponse enregistrée', () => {
  it('borne l’écriture au tour, à la personne, à l’espace, au chat, et aux lignes encore libres', async () => {
    const { service, qb } = build()
    qb.execute.mockResolvedValueOnce({ affected: 2 })
    const attached = await service.attachTurn({ turnId: 't-1', messageId: 'm-1', userId: ME, workspaceId: WS })
    expect(attached).toBe(2)
    expect(qb.set).toHaveBeenCalledWith({ message_id: 'm-1' })
    expect(whereClauses(qb)).toEqual([
      'turn_id = :turn',
      'user_id = :user',
      'workspace_id = :ws',
      'surface = :surface',
      'message_id IS NULL',
    ])
  })

  it('un nombre illisible n’est pas zéro : `null`', async () => {
    const { service, qb } = build()
    qb.execute.mockResolvedValueOnce({})
    expect(await service.attachTurn({ turnId: 't-1', messageId: 'm-1', userId: ME, workspaceId: WS })).toBeNull()
  })
})

describe('MemoryReplyUsesService.readForMessage — ce qu’un lecteur voit sous une réponse', () => {
  const rows = [
    {
      fact_id: 'f-shared',
      fact: 'Ne propose plus de régie pure',
      scope: 'workspace',
      kind: 'correction',
      origin: 'manual',
      account_id: null,
      expires_at: null,
      owner_id: COLLEAGUE,
    },
    {
      fact_id: 'f-mine',
      fact: 'Mon objectif du trimestre',
      scope: 'user',
      kind: 'fact',
      origin: 'manual',
      account_id: null,
      expires_at: new Date('2099-01-01T00:00:00.000Z'),
      owner_id: ME,
    },
    {
      fact_id: 'f-private',
      fact: 'Objectif perso de ma collègue',
      scope: 'user',
      kind: 'fact',
      origin: 'manual',
      account_id: null,
      expires_at: null,
      owner_id: COLLEAGUE,
    },
    {
      fact_id: null,
      fact: null,
      scope: null,
      kind: null,
      origin: null,
      account_id: null,
      expires_at: null,
      owner_id: null,
    },
  ]

  it('montre les éléments partagés et les SIENS, compte l’élément privé d’un collègue et l’élément retiré', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce(rows)
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['f-shared', 'f-mine'])
    expect(read.consulted[1]).toEqual({
      id: 'f-mine',
      text: 'Mon objectif du trimestre',
      scope: 'user',
      kind: 'fact',
      origin: 'manual',
      accountId: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
    expect(read.privateCount).toBe(1)
    expect(read.removedCount).toBe(1)
  })

  // #3229 (recette prod 30/09) — « Mémoire consultée » affichait deux fois le
  // même fait. `captureTurn` déduplique déjà PAR TOUR (`new Set`), mais rien
  // n'empêche deux tours (deux `turn_id`, ex. une relance) de s'être vu
  // attacher au MÊME message : la ligne SQL brute portait alors deux fois le
  // même `fact_id`. Ce n'est jamais une fusion de deux faits DIFFÉRENTS
  // (interdite) — seule la RÉPÉTITION d'un même `fact_id` déjà vu est retirée.
  it('#3229 — un fact_id présent sur deux lignes (deux tours attachés au même message) ne sort qu’une fois', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce([
      rows[0],
      { ...rows[0] }, // même fact_id, ligne dupliquée (second tour attaché au même message)
      rows[1],
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['f-shared', 'f-mine'])
  })

  // #3229 (passe B, 30/09) — la recette a revu « refusent les CV anonymisés » et
  // « 6 semaines / centrale d'achat » DEUX fois : deux `fact_id` DIFFÉRENTS
  // portant le même texte (le fait a été saisi deux fois). Les deux éléments
  // restent dans Réglages › Mémoire (on ne fusionne jamais) ; sous UNE réponse,
  // le même texte, au même niveau, sur le même compte, ne se lit qu'une fois.
  it('#3229 — deux éléments DIFFÉRENTS au texte identique ne s’affichent qu’une fois sous la réponse', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce([
      rows[0],
      { ...rows[0], fact_id: 'f-shared-bis', fact: `  ${rows[0].fact?.toUpperCase()} ` },
      rows[1],
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['f-shared', 'f-mine'])
  })

  it('#3229 — NON : même texte mais autre compte ou autre niveau = deux faits, les deux restent', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce([
      { ...rows[0], account_id: 'acc-1' },
      { ...rows[0], fact_id: 'f-other-account', account_id: 'acc-2' },
      { ...rows[0], fact_id: 'f-other-scope', account_id: 'acc-1', scope: 'user', owner_id: ME },
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['f-shared', 'f-other-account', 'f-other-scope'])
  })

  // #3229 (recette prod 01/10) — les quasi-doublons vus à l'écran : un fragment
  // contenu dans une phrase plus longue, et « six »/« 6 » + « compter »/« comptez ».
  it('#3229 — les quasi-doublons de la recette ne se lisent qu’une fois, la phrase la plus complète reste', async () => {
    const { service, qb } = build()
    const base = { ...rows[0], scope: 'workspace' as const, owner_id: null }
    qb.getRawMany.mockResolvedValueOnce([
      { ...base, fact_id: 'a', fact: '— nom et prénom exigés' },
      { ...base, fact_id: 'b', fact: 'Ils refusent les CV anonymisés : nom et prénom exigés' },
      { ...base, fact_id: 'c', fact: 'Il faut compter six semaines (centrale d’achat)' },
      { ...base, fact_id: 'd', fact: 'Comptez 6 semaines, centrale d’achat' },
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['b', 'c'])
  })

  it('#3229 — NON : une négation ou un autre sujet fait deux faits (rien n’est fusionné à tort)', async () => {
    const { service, qb } = build()
    const base = { ...rows[0], scope: 'workspace' as const, owner_id: null }
    qb.getRawMany.mockResolvedValueOnce([
      { ...base, fact_id: 'a', fact: 'Appeler le DSI en priorité chaque semaine' },
      { ...base, fact_id: 'b', fact: 'Ne pas appeler le DSI en priorité chaque semaine' },
      { ...base, fact_id: 'c', fact: 'compter six semaines' },
      { ...base, fact_id: 'd', fact: 'compter douze semaines' },
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted.map(item => item.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('NON — le texte d’un élément « Toi uniquement » d’un collègue ne sort JAMAIS, même dans le JSON', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce(rows)
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    const wire = JSON.stringify(read)
    expect(wire).not.toContain('Objectif perso de ma collègue')
    expect(wire).not.toContain('f-private')
    expect(wire).not.toContain(COLLEAGUE)
  })

  it('le même fil lu par la collègue : c’est MON élément privé qui devient un compte', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce(rows)
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: COLLEAGUE })
    expect(read.consulted.map(item => item.id)).toEqual(['f-shared', 'f-private'])
    expect(JSON.stringify(read)).not.toContain('Mon objectif du trimestre')
    expect(read.privateCount).toBe(1)
  })

  /**
   * #1918.2 / #1918.5 — ce compte secondaire ne rejoue PAS la logique de
   * membre d'une BU ni le filtre de conversation : par prudence, un élément
   * « ma BU » ou « cette conversation » d'un collègue reste un COMPTE, jamais
   * un texte, exactement comme un élément « Toi uniquement ».
   */
  it('NON — un élément « ma BU » ou « cette conversation » d’un collègue reste un compte, jamais un texte', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce([
      {
        fact_id: 'f-team',
        fact: 'Périmètre BU de ma collègue',
        scope: 'business_unit',
        kind: 'fact',
        origin: 'manual',
        account_id: null,
        expires_at: null,
        owner_id: COLLEAGUE,
      },
      {
        fact_id: 'f-thread',
        fact: 'Contexte de conversation de ma collègue',
        scope: 'conversation',
        kind: 'fact',
        origin: 'manual',
        account_id: null,
        expires_at: null,
        owner_id: COLLEAGUE,
      },
    ])
    const read = await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(read.consulted).toEqual([])
    expect(read.privateCount).toBe(2)
    const wire = JSON.stringify(read)
    expect(wire).not.toContain('Périmètre BU de ma collègue')
    expect(wire).not.toContain('Contexte de conversation de ma collègue')
  })

  it('borne la lecture au message ET à l’espace du lecteur', async () => {
    const { service, qb } = build()
    await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    expect(whereClauses(qb)).toEqual(expect.arrayContaining(['u.message_id = :message', 'u.workspace_id = :ws']))
  })

  /**
   * #2439.10 — UNE MÉMOIRE OUBLIÉE NE REVIENT PAS PAR LE PANNEAU DE
   * TRANSPARENCE (décision de Louis du 21/09/2026).
   *
   * Cette lecture JOINT `memory_pinned_facts` pour relire le TEXTE de l'élément
   * consulté. Tant que « oublier » supprimait la ligne, la jointure ne trouvait
   * rien et l'élément comptait comme « retiré depuis » (`removedCount`). Depuis
   * que l'oubli ARCHIVE, la ligne existe toujours : sans `archived_at IS NULL`
   * DANS la condition de jointure, le texte d'une mémoire oubliée réapparaîtrait
   * sous la réponse — exactement la réapparition que l'archivage doit empêcher.
   *
   * La condition porte la borne, pas un `where` : un `where` sur une jointure
   * GAUCHE éliminerait la LIGNE DE TRACE elle-même, et l'élément oublié ne
   * serait plus compté du tout au lieu d'être compté comme retiré.
   */
  it('NON — un élément OUBLIÉ (archivé) est joint comme absent : il compte comme retiré, son texte ne sort pas', async () => {
    const { service, qb } = build()
    await service.readForMessage({ messageId: 'm-1', workspaceId: WS, viewerId: ME })
    const conditions = qb.leftJoin.mock.calls.map(call => String(call[2]))
    expect(conditions).toHaveLength(1)
    expect(conditions[0]).toContain('f.archived_at IS NULL')
  })
})

describe('MemoryReplyUsesService.countsForMessages — le compte par réponse, en UNE requête', () => {
  it('rend un compte par message lu ; un message sans ligne vaut 0 mesuré', async () => {
    const { service, qb } = build()
    qb.getRawMany.mockResolvedValueOnce([{ message_id: 'm-1', uses: '3' }])
    const counts = await service.countsForMessages({ workspaceId: WS, messageIds: ['m-1', 'm-2'] })
    expect(counts.get('m-1')).toBe(3)
    expect(counts.get('m-2')).toBe(0)
    expect(qb.getRawMany).toHaveBeenCalledTimes(1)
    expect(whereClauses(qb)).toEqual(expect.arrayContaining(['u.workspace_id = :ws']))
  })

  it('aucun message : aucune requête', async () => {
    const { uses, service } = build()
    expect((await service.countsForMessages({ workspaceId: WS, messageIds: [] })).size).toBe(0)
    expect(uses.createQueryBuilder).not.toHaveBeenCalled()
  })
})

describe('MemoryReplyUsesService.consultationsFor — « consulté dans N réponses » pour le lecteur', () => {
  it('compte, date et donne la conversation la plus récente ; un élément sans trace vaut 0 mesuré', async () => {
    const { service, qb } = build()
    qb.getRawMany
      .mockResolvedValueOnce([{ fact_id: 'f-1', replies: '4', last_at: new Date('2026-09-12T10:00:00.000Z') }])
      .mockResolvedValueOnce([{ fact_id: 'f-1', account_id: 'acc-1', conversation_id: 'account-acc-1' }])
    const map = await service.consultationsFor({ workspaceId: WS, viewerId: ME, factIds: ['f-1', 'f-2'] })
    expect(map.get('f-1')).toEqual({
      replies: 4,
      lastAt: '2026-09-12T10:00:00.000Z',
      lastConversation: { accountId: 'acc-1', conversationId: 'account-acc-1' },
    })
    expect(map.get('f-2')).toEqual({ replies: 0, lastAt: null, lastConversation: null })
  })

  it('NON — une réponse d’assistant externe d’un AUTRE membre ne se compte pas, et un fil hors de l’espace ne s’ouvre pas', async () => {
    const { service, qb } = build()
    await service.consultationsFor({ workspaceId: WS, viewerId: ME, factIds: ['f-1'] })
    const clauses = whereClauses(qb).join('\n')
    expect(clauses).toContain("u.surface = 'externalAssistant' AND u.user_id = :viewer")
    expect(clauses).toContain('m.workspace_id = :ws')
  })

  it('une réponse d’assistant externe se compte, sans conversation à ouvrir', async () => {
    const { service, qb } = build()
    qb.getRawMany
      .mockResolvedValueOnce([{ fact_id: 'f-1', replies: 1, last_at: '2026-09-12T10:00:00.000Z' }])
      .mockResolvedValueOnce([])
    const map = await service.consultationsFor({ workspaceId: WS, viewerId: ME, factIds: ['f-1'] })
    expect(map.get('f-1')).toEqual({ replies: 1, lastAt: '2026-09-12T10:00:00.000Z', lastConversation: null })
  })
})

describe('MemoryReplyUsesService.forgetForUser — « Tout oublier »', () => {
  it('supprime les traces de CETTE personne dans CET espace, pas celles d’un collègue', async () => {
    const { uses, service } = build()
    await service.forgetForUser({ userId: ME, workspaceId: WS })
    expect(uses.delete).toHaveBeenCalledWith({ user_id: ME, workspace_id: WS })
  })
})
