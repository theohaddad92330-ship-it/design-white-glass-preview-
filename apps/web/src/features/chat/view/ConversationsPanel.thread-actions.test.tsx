import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

/**
 * #1955.2 / #1955.7 / #1955.8 / #1955.15-.23 — LE MENU D'UN FIL APPELLE
 * VRAIMENT LES ROUTES, et la recherche voit tout l'historique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EXISTE À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré sur `origin/main` le 16/09/2026 : `GET chat/threads/search`,
 * `GET chat/threads/export.md|.pdf|.json` et `POST chat/threads/duplicate`
 * étaient montées, servies en production, testées côté API — et
 * `git grep "threads/export" apps/web/src` ne rendait RIEN. Treize points de
 * registre « livrés » que personne ne pouvait toucher : le motif que la
 * doctrine du dépôt nomme elle-même, « du code juste que personne n'appelle ».
 *
 * D'où la forme de ces tests : ils ne mockent PAS `agentChatApi`. Ils mockent la
 * porte HTTP (`apiFetch`) et le téléchargeur (`downloadDocument`), laissent
 * tourner le vrai client, et lisent LE CHEMIN qui part. Un test qui se
 * contenterait de vérifier qu'une fonction du feature a été appelée serait vert
 * le jour où cette fonction viserait la mauvaise route — c'est précisément le
 * défaut qu'on répare ici.
 *
 * `ConversationsPanel.test.tsx` garde l'autre moitié (la liste, le renommage) et
 * mocke `agentChatApi` : les deux fichiers ne peuvent pas partager un mock, d'où
 * la séparation.
 */

const api = vi.hoisted(() => ({ fetch: vi.fn() }))
const download = vi.hoisted(() => ({ file: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => api.fetch(...args) }))
// Le téléchargeur DÉJÀ livré (`features/documents/api.ts`) : la capacité
// réutilise le mécanisme de l'app, elle n'en invente pas un troisième.
vi.mock('@/features/documents/api', () => ({ downloadDocument: (...args: unknown[]) => download.file(...args) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toasts.success(...args),
    error: (...args: unknown[]) => toasts.error(...args),
  },
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))
// #1910.8 — le hook réel lit le profil (donc la session) ; ce fichier parle des
// gestes sur un fil, pas de qui l'a ouvert.
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => null }))

type LinkProps = { to: string; search?: Record<string, unknown>; children?: ReactNode } & Record<string, unknown>

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: LinkProps) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    )
  },
}))

const { ConversationsPanel } = await import('./ConversationsPanel')

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 't1',
  account_id: null,
  conversation_id: 'c-1',
  title: 'Angle RSE chez LATECOERE',
  created_at: '2026-09-10T10:00:00Z',
  last_message_at: '2026-09-12T10:00:00Z',
  ...over,
})

/** Ce que rend `apiFetch` selon le chemin demandé — la vraie forme de chaque route. */
function serve(routes: Record<string, unknown>) {
  api.fetch.mockImplementation((args: { path: string }) => {
    const hit = Object.entries(routes).find(([prefix]) => args.path.startsWith(prefix))
    if (!hit) return Promise.reject(new Error(`Route non servie: ${args.path}`))
    return Promise.resolve(hit[1])
  })
}

/** Les chemins qui sont réellement partis vers l'API. */
const paths = (): string[] => api.fetch.mock.calls.map(call => (call[0] as { path: string }).path)

async function openThreadMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Options de la conversation' }))
}

beforeEach(() => {
  localStorage.clear()
  api.fetch.mockReset()
  download.file.mockReset()
  download.file.mockResolvedValue(undefined)
  toasts.success.mockReset()
  toasts.error.mockReset()
})

describe('#1955.7 / #1955.8 — le menu du fil propose Exporter et Dupliquer', () => {
  it('les deux gestes rejoignent leur famille, dans le menu qui porte déjà Renommer / Ranger / Retirer', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    render(<ConversationsPanel />)
    await openThreadMenu()

    // La famille au complet : la capacité ne s'invente pas un emplacement.
    // #2430.9 — « Supprimer » est devenu « Retirer » : le geste archive ses
    // messages désormais, il ne les efface plus.
    for (const label of ['Renommer', 'Dupliquer', 'Exporter', 'Ranger', 'Retirer']) {
      expect(screen.getByRole('button', { name: label }), label).toBeInTheDocument()
    }
  })

  it('« Exporter » propose ses TROIS formats, et chacun est un bouton — ce qui se clique se tabule (GA-35)', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))

    for (const label of ['Markdown (.md)', 'PDF (.pdf)', 'Copie structurée (.json)']) {
      const entry = screen.getByRole('button', { name: label })
      expect(entry, label).toBeInTheDocument()
      // Un `<div onClick>` n'a ni tabulation, ni Entrée, ni annonce.
      expect(entry.tagName, label).toBe('BUTTON')
      expect(entry.getAttribute('type'), label).toBe('button')
    }
  })
})

describe('#1955.15 / #1955.16 / #1955.17 — exporter appelle LA BONNE ROUTE', () => {
  it('« Markdown » télécharge `chat/threads/export.md` pour CE fil', async () => {
    serve({ '/ia/chat/history': { items: [thread({ conversation_id: 'c-42', account_id: null })] } })
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('button', { name: 'Markdown (.md)' }))

    await waitFor(() => expect(download.file).toHaveBeenCalledTimes(1))
    const [path, fallbackName] = download.file.mock.calls[0] as [string, string]
    expect(path).toContain('/ia/chat/threads/export.md')
    expect(path).toContain('conversationId=c-42')
    // Le nom réel vient de `Content-Disposition` ; celui-ci n'est qu'un repli.
    expect(fallbackName).toMatch(/\.md$/)
  })

  it('les trois formats visent trois routes DISTINCTES — pas la même trois fois', async () => {
    serve({ '/ia/chat/history': { items: [thread({ conversation_id: 'c-7' })] } })
    render(<ConversationsPanel />)

    for (const [label, expected] of [
      ['Markdown (.md)', 'export.md'],
      ['PDF (.pdf)', 'export.pdf'],
      ['Copie structurée (.json)', 'export.json'],
    ] as const) {
      await openThreadMenu()
      await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
      await userEvent.click(screen.getByRole('button', { name: label }))
      await waitFor(() => expect(download.file).toHaveBeenCalled())
      expect((download.file.mock.calls.at(-1) as [string, string])[0], label).toContain(`/ia/chat/threads/${expected}`)
    }
    expect(download.file).toHaveBeenCalledTimes(3)
  })

  it('sait dire NON — un export qui échoue le DIT, il ne fait pas semblant', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    download.file.mockRejectedValue(new Error('503'))
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    await userEvent.click(screen.getByRole('button', { name: 'PDF (.pdf)' }))

    await waitFor(() => expect(toasts.error).toHaveBeenCalled())
    expect(toasts.success).not.toHaveBeenCalled()
  })
})

describe('#1943.11 — « Retirer » un fil NOMME une permission insuffisante, elle ne se devine pas', () => {
  it("un rôle insuffisant se DIT — la phrase du serveur remplace le refus générique « Échec de l'action »", async () => {
    // Le contrôleur (`ia-proxy.controller.ts`) lève cette phrase EXACTE quand
    // ni l'auteur du fil ni `team:manage` ne portent le geste — un 403 ordinaire,
    // pas une session morte (celle-ci ne déclenche `onAuthExpired` que sur 401).
    api.fetch.mockImplementation((args: { path: string }) => {
      if (args.path === '/ia/chat/history') return Promise.resolve({ items: [thread()] })
      if (args.path === '/ia/chat/threads/delete') {
        return Promise.reject(new ApiError('Rôle insuffisant pour cette action', 403))
      }
      return Promise.reject(new Error(`Route non servie: ${args.path}`))
    })
    window.confirm = () => true
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith('Rôle insuffisant pour cette action'))
  })

  it('sans phrase exploitable, le refus générique reste — jamais un « une erreur est survenue » deviné à sa place', async () => {
    api.fetch.mockImplementation((args: { path: string }) => {
      if (args.path === '/ia/chat/history') return Promise.resolve({ items: [thread()] })
      if (args.path === '/ia/chat/threads/delete') return Promise.reject(new Error(''))
      return Promise.reject(new Error(`Route non servie: ${args.path}`))
    })
    window.confirm = () => true
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }))

    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("L'action n'a pas pu être enregistrée."))
  })
})

describe('#1955.8 — dupliquer crée un fil INDÉPENDANT, et n’altère pas l’original', () => {
  it('appelle `POST chat/threads/duplicate` sur le fil visé', async () => {
    serve({
      '/ia/chat/history': { items: [thread({ conversation_id: 'c-9', account_id: null })] },
      '/ia/chat/threads/duplicate': { conversationId: 'c-neuf', accountId: null, messages: 4 },
    })
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))

    await waitFor(() => expect(paths()).toContain('/ia/chat/threads/duplicate'))
    const call = api.fetch.mock.calls.find(
      entry => (entry[0] as { path: string }).path === '/ia/chat/threads/duplicate',
    ) as [{ method: string; body: { conversationId: string | null; accountId: string | null } }]
    expect(call[0].method).toBe('POST')
    expect(call[0].body).toEqual({ conversationId: 'c-9', accountId: null })
  })

  it('n’ALTÈRE PAS le fil d’origine — aucune écriture d’archivage, de titre ni de suppression', async () => {
    serve({
      '/ia/chat/history': { items: [thread({ conversation_id: 'c-9', title: 'Angle RSE chez LATECOERE' })] },
      '/ia/chat/threads/duplicate': { conversationId: 'c-neuf', accountId: null, messages: 4 },
    })
    render(<ConversationsPanel />)
    await openThreadMenu()
    await userEvent.click(screen.getByRole('button', { name: 'Dupliquer' }))
    await waitFor(() => expect(toasts.success).toHaveBeenCalled())

    // Le fil source est toujours là, sous son titre.
    expect(screen.getByText('Angle RSE chez LATECOERE')).toBeInTheDocument()
    // Et rien d'autre que la lecture et la duplication n'est parti.
    for (const forbidden of ['/ia/chat/threads/archive', '/ia/chat/threads/title', '/ia/chat/threads/delete']) {
      expect(paths(), forbidden).not.toContain(forbidden)
    }
  })

  it('rien n’écrit tout seul — sans le clic, aucune duplication', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    render(<ConversationsPanel />)
    await screen.findByText('Angle RSE chez LATECOERE')
    await openThreadMenu()
    expect(paths()).not.toContain('/ia/chat/threads/duplicate')
  })
})

describe('#1955.2 — la recherche interroge TOUT l’historique, par le champ qui existe déjà', () => {
  const six = Array.from({ length: 6 }, (_, index) =>
    thread({ id: `t${index}`, conversation_id: `c-${index}`, title: `Sujet ${index}` }),
  )

  it('le champ « Rechercher… » appelle `chat/threads/search` — il ne filtre plus seulement la page chargée', async () => {
    serve({
      '/ia/chat/history': { items: six },
      '/ia/chat/threads/search': {
        items: [thread({ id: 't-vieux', conversation_id: 'c-vieux', title: 'Un fil hors de la page chargée' })],
      },
    })
    render(<ConversationsPanel />)
    await userEvent.type(await screen.findByRole('searchbox'), 'vieux')

    await waitFor(() => expect(paths().some(path => path.startsWith('/ia/chat/threads/search'))).toBe(true))
    const searchPath = paths().find(path => path.startsWith('/ia/chat/threads/search')) as string
    expect(searchPath).toContain('q=vieux')
    // Le fil qui n'était PAS dans la page chargée apparaît.
    expect(await screen.findByText('Un fil hors de la page chargée')).toBeInTheDocument()
  })

  it('un seul champ — la recherche serveur ne pose pas un SECOND champ à côté (GA-26)', async () => {
    serve({ '/ia/chat/history': { items: six }, '/ia/chat/threads/search': { items: [] } })
    render(<ConversationsPanel />)
    await screen.findByRole('searchbox')
    expect(screen.getAllByRole('searchbox')).toHaveLength(1)
  })

  it('une recherche SANS résultat rend une PHRASE, jamais un « 0 »', async () => {
    serve({ '/ia/chat/history': { items: six }, '/ia/chat/threads/search': { items: [] } })
    render(<ConversationsPanel />)
    await userEvent.type(await screen.findByRole('searchbox'), 'zzzz')

    const sentence = await screen.findByText(/Aucune conversation ne contient/)
    expect(sentence).toBeInTheDocument()
    expect(sentence.textContent).toContain('zzzz')
    // « Non mesuré » n'est jamais « 0 » : un chiffre nu ici se lirait « zéro
    // résultat sur zéro fil », alors que la phrase dit ce qui a été cherché.
    expect(sentence.textContent).not.toMatch(/\b0\b/)
  })

  it('sait dire NON — une recherche serveur en panne ne vide pas la liste du filtre local', async () => {
    api.fetch.mockImplementation((args: { path: string }) => {
      if (args.path.startsWith('/ia/chat/history')) return Promise.resolve({ items: six })
      return Promise.reject(new Error('boom'))
    })
    render(<ConversationsPanel />)
    await userEvent.type(await screen.findByRole('searchbox'), 'Sujet 3')

    // Le filtre local tient encore : le fil visible reste visible.
    expect(await screen.findByText('Sujet 3')).toBeInTheDocument()
  })
})

describe('GA-30 — les trois gestes sont atteignables AU DOIGT, pas seulement au survol', () => {
  it('le bouton du menu est VISIBLE en pointeur grossier — un téléphone n’a pas de survol', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    render(<ConversationsPanel />)
    const trigger = await screen.findByRole('button', { name: 'Options de la conversation' })

    // Mesuré : la règle était `opacity-0 group-hover/thread:opacity-100`. Sur un
    // téléphone (`ConversationsDrawer` monte LA MÊME liste), aucun survol
    // n'existe : le bouton restait invisible. La variante `pointer-coarse:` le
    // rend visible sans rien changer au pointeur fin.
    expect(trigger.className).toContain('pointer-coarse:opacity-100')
    // Et la cible fait 44 px au doigt.
    expect(trigger.className).toContain('pointer-coarse:min-h-11')
    expect(trigger.className).toContain('pointer-coarse:min-w-11')
  })

  it('les entrées du menu portent la même cible de 44 px que leurs voisines', async () => {
    serve({ '/ia/chat/history': { items: [thread()] } })
    render(<ConversationsPanel />)
    await openThreadMenu()
    for (const label of ['Dupliquer', 'Exporter']) {
      expect(screen.getByRole('button', { name: label }).className, label).toContain('pointer-coarse:min-h-11')
    }
  })
})
