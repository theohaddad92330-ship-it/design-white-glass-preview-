import type {
  ConversationSummaryView,
  MemoryForgetAllResult,
  MemoryItem,
  MemoryItemHistory,
  MemoryItemKind,
  MemoryItemOrigin,
  MemoryItemReassignableScope,
  MemoryItemScope,
  MemoryLayer,
  MemoryLedger,
  ReplyMemoryUses,
} from '@bellum/contracts'
import { replyMemoryUsesSchema } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Durable copilot "long memory" (Théo P2) — the web client for the NestJS
 * `/memory` endpoints. Pinned facts are team-scoped server-side; preferences are
 * per-user. Responses are read defensively (`res?.facts ?? []`) so demo mode's
 * benign `{}` fallback never crashes the memory UI.
 *
 * La forme est celle du contrat PARTAGÉ `MemoryItem` (restitution V2 §20) :
 * nature, origine et échéance en plus du fait et de sa portée. L'API ne renvoie
 * jamais un élément expiré — la liste est ce que le copilote lit réellement.
 */
export type PinnedFact = MemoryItem

export const memoryKeys = {
  all: ['memory'] as const,
  facts: (accountId?: string | null, conversationId?: string | null) =>
    ['memory', 'facts', accountId ?? 'all', conversationId ?? 'no-thread'] as const,
  preferences: () => ['memory', 'preferences'] as const,
  /** Le registre complet — les quatre couches, pour l'écran Réglages › Mémoire. */
  ledger: () => ['memory', 'ledger'] as const,
  /** #1916.23 — l'historique d'UN élément, lu à l'ouverture seulement. */
  history: (id: string) => ['memory', 'history', id] as const,
  /**
   * #1916.24 — la mémoire consultée pour UNE réponse, lue à l'ouverture du
   * panneau seulement. Sous `memory` : oublier ou modifier un élément invalide
   * aussi ce qu'on relira sous une réponse.
   */
  replyUses: (messageId: string) => ['memory', 'replyUses', messageId] as const,
  /** #1955.30 — le résumé du fil OUVERT ; la clé porte les deux mêmes bornes que le service (`conversationKey`). */
  summary: (conversationId?: string | null, accountId?: string | null) =>
    ['memory', 'summary', conversationId ?? 'general', accountId ?? 'none'] as const,
}

export const memoryApi = {
  listFacts: async (accountId?: string | null, conversationId?: string | null): Promise<PinnedFact[]> => {
    // ⚠️ `URLSearchParams` et non une concaténation : une clé de fil peut porter
    // un `&` ou un `=`, et une requête coupée rendrait 400 là où on lit un vide.
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    // #1918.5 — le FIL ouvert, quand il y en a un : il est ce qui rend lisibles
    // les mémoires « cette conversation », et RIEN d'autre ne les rend.
    if (conversationId) params.set('conversationId', conversationId)
    // ⚠️ `toString()` et non `params.size` : jsdom n'implémente pas `size`, et
    // `undefined > 0` est FAUX — la requête partait sans son `accountId`, ce qui
    // ressemble exactement à une lecture d'espace entier.
    const query = params.toString()
    const qs = query ? `?${query}` : ''
    const res = await apiFetch<{ facts?: PinnedFact[] }>({ path: `/memory/facts${qs}` })
    return res?.facts ?? []
  },

  /**
   * Épingle un élément. `kind`, `origin` et `expiresAt` sont OPTIONNELS et ne
   * sont envoyés que renseignés : sans eux, le serveur applique ses défauts
   * historiques (un fait, épinglé à la main, sans échéance).
   */
  pinFact: async (input: {
    fact: string
    accountId?: string | null
    kind?: MemoryItemKind
    origin?: MemoryItemOrigin
    expiresAt?: string | null
    /** #1917.3 — pour qui l'élément vaut. Les écrans neufs l'envoient toujours. */
    scope?: MemoryItemScope
    /** #1918.2 — le périmètre visé par `scope: 'business_unit'`. Le serveur
     *  vérifie l'appartenance : ce champ désigne, il n'autorise pas. */
    businessUnitId?: string | null
    /** #1918.5 — le fil visé par `scope: 'conversation'`. */
    conversationId?: string | null
  }): Promise<PinnedFact | null> => {
    const res = await apiFetch<{ fact?: PinnedFact }>({
      path: '/memory/facts',
      method: 'POST',
      body: {
        fact: input.fact,
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.kind ? { kind: input.kind } : {}),
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
        ...(input.scope ? { scope: input.scope } : {}),
        ...(input.businessUnitId ? { businessUnitId: input.businessUnitId } : {}),
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      },
    })
    return res?.fact ?? null
  },

  /**
   * #1916.24 — les éléments de mémoire qui étaient dans le contexte d'une réponse,
   * tels que le lecteur a le droit de les voir. Une forme illisible (repli `{}` du
   * mode démo, API inattendue) JETTE : l'écran dit « n'a pas pu être relue », il
   * ne dit jamais « aucun élément ».
   */
  getReplyUses: async (messageId: string): Promise<ReplyMemoryUses> => {
    const res = await apiFetch<unknown>({ path: `/memory/reply-uses/${encodeURIComponent(messageId)}` })
    const parsed = replyMemoryUsesSchema.safeParse(res)
    if (!parsed.success) throw new Error('Mémoire consultée illisible')
    return parsed.data
  },

  unpinFact: (id: string): Promise<void> =>
    apiFetch<void>({ path: `/memory/facts/${encodeURIComponent(id)}`, method: 'DELETE' }),

  /**
   * #1916.21 — change la portée d'un élément que TU as épinglé. Le serveur
   * refuse (404) la ligne d'un collègue : l'écran ne propose de toute façon ce
   * geste qu'au propriétaire (`ownedByMe`).
   */
  setFactScope: async (id: string, scope: MemoryItemReassignableScope): Promise<PinnedFact | null> => {
    const res = await apiFetch<{ fact?: PinnedFact }>({
      path: `/memory/facts/${encodeURIComponent(id)}/scope`,
      method: 'PATCH',
      body: { scope },
    })
    return res?.fact ?? null
  },

  /**
   * #1916.19 / #1916.22 — modifie le texte et/ou l'échéance. Seules les clés
   * PRÉSENTES partent : `expiresAt: null` retire l'échéance, une clé absente ne
   * touche à rien. Le serveur décide qui a le droit (auteur ; manager sur un
   * élément partagé) — l'écran n'offre le geste que si `canEdit`.
   *
   * #1962.19 — `confirm: true` CONFIRME une note de Laura sans réécrire son
   * texte : un geste dédié, porté par le MÊME corps.
   */
  updateFact: async (
    id: string,
    patch: { fact?: string; expiresAt?: string | null; confirm?: true },
  ): Promise<PinnedFact | null> => {
    const res = await apiFetch<{ fact?: PinnedFact }>({
      path: `/memory/facts/${encodeURIComponent(id)}`,
      method: 'PATCH',
      body: {
        ...(patch.fact !== undefined ? { fact: patch.fact } : {}),
        ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
        ...(patch.confirm !== undefined ? { confirm: patch.confirm } : {}),
      },
    })
    return res?.fact ?? null
  },

  /**
   * #1916.23 — l'histoire d'un élément. Une réponse illisible n'est PAS un
   * historique vide (« rien n'a changé ») : on rend `null`, et l'écran dit qu'il
   * n'a pas pu lire.
   */
  getFactHistory: async (id: string): Promise<MemoryItemHistory | null> => {
    const res = await apiFetch<MemoryItemHistory>({ path: `/memory/facts/${encodeURIComponent(id)}/history` })
    if (!res || !Array.isArray(res.entries)) return null
    return { entries: res.entries }
  },

  /**
   * TOUT ce que Laura garde, en clair (T6 §12.1). Une réponse illisible n'est
   * PAS un registre vide : sans lignes ET sans couche déclarée illisible,
   * l'écran dirait « Laura ne retient rien », ce qui serait faux. On rend donc
   * `null` — l'écran sait dire « je n'ai pas pu lire ».
   */
  getLedger: async (): Promise<MemoryLedger | null> => {
    const res = await apiFetch<MemoryLedger>({ path: '/memory/ledger' })
    if (!res || !Array.isArray(res.entries)) return null
    return { entries: res.entries, unreadableLayers: res.unreadableLayers ?? [] }
  },

  /** Oublie UNE ligne, dans sa couche. */
  forgetLedgerEntry: (layer: MemoryLayer, id: string): Promise<void> =>
    apiFetch<void>({
      path: `/memory/ledger/${layer}/${encodeURIComponent(id)}`,
      method: 'DELETE',
    }),

  /**
   * TOUT oublier — ce qui est à MOI, jamais ce qu'un collègue a épinglé.
   *
   * ⚠️ Une réponse illisible n'est PAS « rien n'est parti » : le serveur a pu
   * effacer avant que la réponse se perde. On rend alors `null`, et l'écran dit
   * qu'il ne sait pas — c'est « non mesuré n'est jamais 0 » sur le geste le plus
   * irréversible de l'écran.
   */
  forgetAll: async (): Promise<MemoryForgetAllResult | null> => {
    const res = await apiFetch<MemoryForgetAllResult>({ path: '/memory/ledger', method: 'DELETE' })
    if (!res || typeof res.forgotten !== 'number') return null
    return { forgotten: res.forgotten, failedLayers: res.failedLayers ?? [] }
  },

  getPreferences: async (): Promise<Record<string, unknown>> => {
    const res = await apiFetch<{ preferences?: Record<string, unknown> }>({ path: '/memory/preferences' })
    return res?.preferences ?? {}
  },

  patchPreferences: async (preferences: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const res = await apiFetch<{ preferences?: Record<string, unknown> }>({
      path: '/memory/preferences',
      method: 'PATCH',
      body: { preferences },
    })
    return res?.preferences ?? {}
  },

  /**
   * #1955.30 — le résumé roulant du fil OUVERT, avec sa date. `null` = aucune
   * ligne vivante pour ce fil — jamais une chaîne vide qui se lirait comme un
   * résumé « vide » plutôt qu'absent.
   */
  getConversationSummary: async (args: {
    conversationId?: string | null
    accountId?: string | null
  }): Promise<ConversationSummaryView> => {
    const qs = new URLSearchParams()
    if (args.conversationId) qs.set('conversationId', args.conversationId)
    if (args.accountId) qs.set('accountId', args.accountId)
    const suffix = qs.toString() ? `?${qs.toString()}` : ''
    const res = await apiFetch<{ summary?: ConversationSummaryView }>({ path: `/memory/summary${suffix}` })
    return res?.summary ?? null
  },

  /**
   * #1955.31 — « une correction humaine gagne toujours » (CLAUDE.md). Le
   * serveur refuse (404) de corriger un fil sans résumé — ce n'est pas une
   * création déguisée ; l'écran n'appelle ce geste que si un résumé existe déjà.
   */
  correctConversationSummary: async (args: {
    conversationId?: string | null
    accountId?: string | null
    summary: string
  }): Promise<ConversationSummaryView> => {
    const res = await apiFetch<{ summary?: ConversationSummaryView }>({
      path: '/memory/summary',
      method: 'PATCH',
      body: {
        summary: args.summary,
        ...(args.conversationId ? { conversationId: args.conversationId } : {}),
        ...(args.accountId ? { accountId: args.accountId } : {}),
      },
    })
    return res?.summary ?? null
  },
}
