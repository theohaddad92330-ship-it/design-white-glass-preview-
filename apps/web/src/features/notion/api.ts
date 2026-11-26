import { apiFetch } from '@/lib/api'

export type NotionStatus = {
  configured: boolean
  connected: boolean
  provider?: 'notion'
  accountLabel?: string | null
  connectedAt?: string
}

export type NotionPage = {
  id: string
  title: string
  type: 'page' | 'database'
  url: string | null
}

export const notionApi = {
  status(): Promise<NotionStatus> {
    return apiFetch<NotionStatus>({ path: '/notion/status' })
  },
  /** Returns the Notion consent URL to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/notion/connect' })
  },
  disconnect(): Promise<void> {
    return apiFetch<void>({ path: '/notion', method: 'DELETE' })
  },
  /** List the pages/databases shared with the connected integration. */
  async pages(): Promise<NotionPage[]> {
    // La réponse est QUALIFIÉE depuis le PDF 7 : `searched` dit que la recherche
    // est bien partie, ce qui distingue « aucune page partagée » de « pas le
    // droit de regarder » — ce second cas arrive maintenant en 503.
    const page = await apiFetch<{ items: NotionPage[]; searched: true; scanned: number | null }>({
      path: '/notion/pages',
    })
    return page.items
  },
  /** Ingest a selected Notion page into the RAG store. */
  ingest(input: { pageId: string; title?: string; category?: string }): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>({ path: '/notion/ingest', method: 'POST', body: input })
  },
}
