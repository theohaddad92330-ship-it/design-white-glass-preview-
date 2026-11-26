import { FindOperator, getMetadataArgsStorage } from 'typeorm'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { createMockRepository } from '../../database/test-utils'
import { MemoryService } from './memory.service'

/**
 * Un résumé de conversation appartient à la PERSONNE, jamais à l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `conversation_summaries` portait un index unique `(workspace_id,
 * conversation_id)` et se lisait sur ce même couple. Le web envoie
 * `conversation_id = "general"` pour le fil par défaut (`Chat.tsx`,
 * `GENERAL_CONVERSATION_ID`). Dans un espace à plusieurs sièges — une ESN a
 * plusieurs business managers — les membres partageaient donc UNE ligne : deux
 * extraits de 200 caractères par échange, écrits à chaque message
 * (`memory.service.ts`, `TURN_SNIPPET_MAX`), relus au tour suivant et injectés
 * dans le prompt système sous « Résumé de la conversation jusqu'ici »
 * (`apps/ia/app/prompts/bellum_advisor.py`, `_format_memory`).
 *
 * Deux raisons de le refuser, et la seconde tient même sans la première :
 *
 * 1. **D65** — le CORPS des messages ne sort jamais vers un humain NI vers le
 *    modèle, ni vers le copilote, ni vers un autre membre de l'espace. La règle
 *    avait été pensée pour la messagerie ; la porte ouverte était ici.
 * 2. Les extraits sont préfixés « • Utilisateur : » — une attribution à la
 *    PREMIÈRE personne. Le modèle s'entendait donc dire que l'appelant avait
 *    écrit les mots d'un collègue. Ce n'est pas seulement une fuite, c'est une
 *    fausseté injectée dans le prompt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE, ET COMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne vérifie pas une signature de fonction — une signature ne dit pas ce
 * qu'une requête filtre. Elle rejoue le scénario à DEUX utilisateurs contre un
 * dépôt en mémoire qui applique VRAIMENT son `where` (et refuse un `findOne`
 * sans `where`, comme le motif rouge `find({})`). Retirer `user_id` du filtre de
 * lecture fait tomber le test qui compte.
 *
 * Qu'elle LIT quelque chose : le premier test exige que l'auteur RETROUVE son
 * propre résumé. Si le faux dépôt cessait de stocker ou de rendre quoi que ce
 * soit, l'isolation deviendrait vraie par vacuité — et ce test-là tomberait.
 */

/** Ce que le faux dépôt garde en mémoire — la ligne, telle que la base la voit. */
type Row = ConversationSummaryEntity

/**
 * Dépôt TypeORM simulé qui HONORE son `where`.
 *
 * `createMockRepository` rend `null` quoi qu'on lui demande : il ne peut pas
 * prouver une isolation, puisqu'il ne lit rien. Celui-ci filtre pour de vrai,
 * et simule aussi l'index unique de la base — sans quoi la garde pourrait
 * décrire un schéma que Postgres refuserait.
 */
class FakeSummaryStore {
  readonly rows: Row[] = []
  private sequence = 1

  private matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([column, expected]) => {
      const actual = (row as unknown as Record<string, unknown>)[column]
      if (expected instanceof FindOperator) {
        if (expected.type === 'isNull') return actual === null || actual === undefined
        throw new Error(`opérateur non simulé : ${expected.type}`)
      }
      return actual === expected
    })
  }

  async findOne(options: { where?: Record<string, unknown> }): Promise<Row | null> {
    const where = options?.where
    if (!where || Object.keys(where).length === 0) {
      // Le motif rouge exact : une lecture non bornée. On la fait échouer ici
      // plutôt que de la laisser rendre la ligne d'un collègue.
      throw new Error('findOne sans where — lecture non bornée')
    }
    return this.rows.find(row => this.matches(row, where)) ?? null
  }

  create(partial: Partial<Row>): Row {
    return { ...partial } as Row
  }

  async save(row: Row): Promise<Row> {
    const existing = row.id ? this.rows.find(candidate => candidate.id === row.id) : undefined
    if (existing) {
      Object.assign(existing, row)
      return existing
    }
    const inserted = { ...row, id: `cs-${this.sequence++}` } as Row
    const live = (candidate: Row): boolean => this.superseded(candidate) === null
    const clash = this.rows.some(
      candidate =>
        live(candidate) &&
        live(inserted) &&
        candidate.user_id === inserted.user_id &&
        candidate.workspace_id === inserted.workspace_id &&
        candidate.conversation_id === inserted.conversation_id,
    )
    if (clash) {
      throw new Error('duplicate key value violates unique constraint "conversation_summaries_owner_uidx"')
    }
    this.rows.push(inserted)
    return inserted
  }

  /** `superseded_at` lu sans supposer que la colonne existe déjà sur le type. */
  private superseded(row: Row): Date | null {
    const value = (row as unknown as Record<string, unknown>)['superseded_at']
    return value instanceof Date ? value : null
  }
}

const ALICE = 'user-alice'
const BOB = 'user-bob'
const WORKSPACE = 'ws-esn'
/** Ce que le web envoie pour le fil par défaut (`Chat.tsx`). */
const GENERAL = 'general'

function buildService(store: FakeSummaryStore): MemoryService {
  // Ordre du constructeur : faits épinglés · préférences · résumés · traces
  // d'intervention · profils · résolveur de profil ESN. Les quatre derniers
  // sont arrivés avec le registre de mémoire et ses deux couches déclarées ; ce
  // test ne les sollicite pas, mais une dépendance manquante ferait planter le
  // service à la construction — pas là où le test regarde.
  return new MemoryService(
    createMockRepository() as never,
    createMockRepository() as never,
    store as never,
    createMockRepository() as never,
    createMockRepository() as never,
    { resolveProfileData: jest.fn().mockResolvedValue({}), resolveContext: jest.fn() } as never,
    // #1916.23 — le journal des gestes sur un élément épinglé : non sollicité ici.
    createMockRepository() as never,
  )
}

describe("l'isolation des résumés de conversation entre deux membres du même espace", () => {
  let store: FakeSummaryStore
  let memory: MemoryService

  beforeEach(() => {
    store = new FakeSummaryStore()
    memory = buildService(store)
  })

  it("lit un corpus non vide — l'auteur retrouve SON propre résumé", async () => {
    // Sans cette assertion, l'isolation serait vraie par vacuité : un dépôt qui
    // ne rend jamais rien ne laisse jamais fuir non plus.
    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
      userMessage: 'Je négocie 620 € par jour chez ACME',
      assistantReply: 'Voici comment tenir ce tarif.',
    })

    const own = await memory.getConversationSummary({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })

    expect(own).toContain('620 € par jour chez ACME')
    expect(store.rows).toHaveLength(1)
  })

  it('un second membre du même espace ne lit pas le résumé du premier', async () => {
    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
      userMessage: 'Je négocie 620 € par jour chez ACME',
      assistantReply: 'Voici comment tenir ce tarif.',
    })

    const seenByBob = await memory.getConversationSummary({
      userId: BOB,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })

    expect(seenByBob).toBeNull()
  })

  it('chacun écrit dans SA ligne : deux lignes, aucun mot de traverse', async () => {
    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
      userMessage: 'Je négocie 620 € par jour chez ACME',
      assistantReply: 'Voici comment tenir ce tarif.',
    })
    await memory.appendConversationTurn({
      userId: BOB,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
      userMessage: 'Mon rendez-vous chez BETA a glissé',
      assistantReply: 'Voici une relance.',
    })

    const alice = await memory.getConversationSummary({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })
    const bob = await memory.getConversationSummary({
      userId: BOB,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })

    expect(store.rows).toHaveLength(2)
    expect(alice).toContain('620 € par jour chez ACME')
    expect(alice).not.toContain('BETA')
    expect(bob).toContain('BETA')
    expect(bob).not.toContain('620')
  })

  it("le fil d'un COMPTE est lui aussi personnel (la clé dérivée ne rattrape rien)", async () => {
    // `conversationKey` retombe sur `account:<uuid>` quand le fil n'est pas
    // nommé : cette clé-là est tout aussi partagée entre les membres.
    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: 'acc-1',
      conversationId: null,
      userMessage: 'Le DSI de ce compte me doit une réponse',
      assistantReply: 'Voici la relance.',
    })

    const seenByBob = await memory.getConversationSummary({
      userId: BOB,
      workspaceId: WORKSPACE,
      accountId: 'acc-1',
      conversationId: null,
    })

    expect(seenByBob).toBeNull()
  })

  it("une ligne d'AVANT la correction n'est plus lue, même par son premier auteur", async () => {
    // Filtrer sur `user_id` ne suffisait pas : `user_id` ne désigne que le
    // PREMIER auteur de la ligne partagée. Sans `superseded_at`, Alice
    // continuerait de relire les mots de Bob dans sa propre ligne.
    store.rows.push({
      id: 'cs-legacy',
      user_id: ALICE,
      workspace_id: WORKSPACE,
      account_id: null,
      conversation_id: GENERAL,
      summary: '• Utilisateur : Mon rendez-vous chez BETA a glissé',
      // #1927.10 — une ligne d'avant la colonne n'a aucun état du fil.
      thread_state: null,
      superseded_at: new Date('2026-08-29T00:00:00Z'),
      // #2439.10 — jamais OUBLIÉE par sa personne : c'est `superseded_at` seul
      // qui doit suffire à la faire taire, et c'est ce que ce test prouve.
      archived_at: null,
      updated_at: new Date('2026-08-29T00:00:00Z'),
    })

    const read = await memory.getConversationSummary({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })
    expect(read).toBeNull()

    // …et la ligne archivée ne bloque pas la suivante : l'index unique est
    // partiel, la nouvelle ligne naît à côté sans collision.
    await memory.appendConversationTurn({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
      userMessage: 'Je reprends chez ACME',
      assistantReply: 'Voici la suite.',
    })

    const fresh = await memory.getConversationSummary({
      userId: ALICE,
      workspaceId: WORKSPACE,
      accountId: null,
      conversationId: GENERAL,
    })
    expect(fresh).toContain('Je reprends chez ACME')
    expect(fresh).not.toContain('BETA')
    // On archive, on ne supprime pas : la ligne d'avant est toujours là.
    expect(store.rows).toHaveLength(2)
    expect(store.rows.find(row => row.id === 'cs-legacy')?.summary).toContain('BETA')
  })

  it("l'index unique déclaré par l'entité porte la personne", () => {
    const indices = getMetadataArgsStorage().indices.filter(index => index.target === ConversationSummaryEntity)
    // Corpus non vide : si l'entité perdait ses index, la boucle ci-dessous ne
    // vérifierait plus rien en restant verte.
    expect(indices.length).toBeGreaterThan(0)
    for (const index of indices.filter(candidate => candidate.unique)) {
      expect(index.columns).toContain('user_id')
    }
  })
})
