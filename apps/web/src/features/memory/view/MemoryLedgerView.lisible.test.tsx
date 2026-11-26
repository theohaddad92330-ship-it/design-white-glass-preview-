import type React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryItemHistory, MemoryLedger, MemoryLedgerEntry } from '@bellum/contracts'

const forget = vi.fn()
const forgetAll = vi.fn()
const setScope = vi.fn()
const updateFact = vi.fn()
const historyRequests: Array<string | null> = []
let history: MemoryItemHistory | undefined
let ledger: MemoryLedger | null = { entries: [], unreadableLayers: [] }

// #1928.9 — les réglages de réponse ouvrent la section « Préférences
// personnelles » et portent leur propre réseau (`useReplyPreferences` → React
// Query → session). Ils ont leur suite (`ReplyPreferencesSettings.test.tsx`) ;
// ici un témoin nul, pour que CE fichier garde ce qu'il vise.
// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
// #4060 — l'approche des messages porte son propre réseau (session) : témoin nul, comme ReplyPreferencesSettings.
vi.mock('@/features/memory/view/MessageApproachSettings', () => ({ MessageApproachSettings: () => null }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@/features/memory/view/ReplyPreferencesSettings', () => ({ ReplyPreferencesSettings: () => null }))
// #2867 (LOT c10 clôture 26/09) — le temps protégé porte, lui aussi, son propre réseau (`useProtectedTime` → session) : même témoin nul, pour la même raison que `ReplyPreferencesSettings` juste au-dessus.
vi.mock('@/features/memory/view/ProtectedTimeSettings', () => ({ ProtectedTimeSettings: () => null }))
vi.mock('@/features/memory/view/AgendaPreferencesSettings', () => ({ AgendaPreferencesSettings: () => null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useMemoryLedger: () => ({ data: ledger, isLoading: false, isError: false }),
  useForgetMemoryEntry: () => ({ mutate: forget, isPending: false }),
  useForgetAllMemory: () => ({ mutate: forgetAll, isPending: false }),
  useSetFactScope: () => ({ mutate: setScope, isPending: false }),
  useUpdateFact: () => ({ mutate: updateFact, isPending: false }),
  useFactHistory: (id: string | null) => {
    historyRequests.push(id)
    return { data: id ? history : undefined, isLoading: false, isError: false }
  },
}))

const { MemoryLedgerView } = await import('./MemoryLedgerView')

const FUTURE = '2099-12-31T23:59:59.999Z'
const PAST = '2026-08-31T23:59:59.999Z'

function fact(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'f-x',
    layer: 'facts',
    text: 'x',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: { firstName: 'Alice', avatarUrl: null },
    surfaces: ['chat', 'externalAssistant'],
    ...over,
  }
}

/** Le groupe d'une section, retrouvé par son titre. */
function section(title: string): HTMLElement {
  const element = screen.getByText(title).closest('section')
  if (!element) throw new Error(`aucune section « ${title} »`)
  return element
}

/** Le bloc d'une ligne : son texte, ses badges, sa provenance, ses gestes. */
function rowOf(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement
  if (!element) throw new Error(`aucune ligne pour « ${text} »`)
  return element
}

describe('MemoryLedgerView — une mémoire qui dit pourquoi, pour qui, d’où, et ce qu’elle change (#1916)', () => {
  beforeEach(() => {
    for (const mock of [forget, forgetAll, setScope, updateFact]) mock.mockReset()
    historyRequests.length = 0
    history = undefined
    ledger = { entries: [], unreadableLayers: [] }
  })

  describe('#1916.6 / .7 / .9 / .10 / .11 — des sections, lues sur la ligne', () => {
    it('range chaque élément dans SA section, dans l’ordre du retour', () => {
      ledger = {
        entries: [
          fact({ id: 'p', text: 'Messages courts', kind: 'preference' }),
          { ...fact({}), id: 'tone', layer: 'preferences', text: 'direct', detail: 'tone', kind: undefined },
          fact({ id: 'o', text: 'Trois signatures à Toulouse' }),
          fact({ id: 'r', text: 'Jamais de freelance', scope: 'workspace' }),
          fact({ id: 'a', text: 'Le référencement se rejoue en fin d’année', accountId: 'acc-1' }),
          fact({ id: 'c', text: 'Ne propose plus de régie pure', kind: 'correction', scope: 'workspace' }),
          fact({ id: 't', text: 'Priorité à la Haute-Garonne', expiresAt: FUTURE }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)

      const titles = [
        'Préférences personnelles',
        'Objectifs personnels',
        "Règles de l'ESN",
        "Contexte d'un compte",
        'Corrections terrain',
        'Documents de référence',
        'Éléments temporaires',
      ]
      const positions = titles.map(title => {
        const node = screen.getByText(title)
        return Array.from(document.body.querySelectorAll('*')).indexOf(node)
      })
      expect([...positions].sort((a, b) => a - b)).toEqual(positions)

      expect(within(section('Préférences personnelles')).getByText('Messages courts')).toBeInTheDocument()
      expect(within(section('Préférences personnelles')).getByText('direct')).toBeInTheDocument()
      expect(within(section('Objectifs personnels')).getByText('Trois signatures à Toulouse')).toBeInTheDocument()
      expect(within(section("Règles de l'ESN")).getByText('Jamais de freelance')).toBeInTheDocument()
      expect(
        within(section("Contexte d'un compte")).getByText('Le référencement se rejoue en fin d’année'),
      ).toBeInTheDocument()
      expect(within(section('Corrections terrain')).getByText('Ne propose plus de régie pure')).toBeInTheDocument()
      expect(within(section('Éléments temporaires')).getByText('Priorité à la Haute-Garonne')).toBeInTheDocument()
    })

    it('une section vide le DIT en toutes lettres — jamais un zéro', () => {
      render(<MemoryLedgerView />)
      expect(within(section('Objectifs personnels')).getByText('Aucun objectif personnel retenu.')).toBeInTheDocument()
      expect(within(section('Corrections terrain')).getByText('Aucune correction terrain.')).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/\b0 (élément|ligne)/)
    })

    it('une couche illisible ne se lit pas « rien ici » dans les sections qu’elle nourrit', () => {
      ledger = { entries: [], unreadableLayers: ['facts'] }
      render(<MemoryLedgerView />)
      expect(within(section('Objectifs personnels')).queryByText('Aucun objectif personnel retenu.')).toBeNull()
      expect(within(section('Objectifs personnels')).getByText(/n'a pas pu être lue/)).toBeInTheDocument()
    })

    it('« Documents de référence » renvoie vers la base de connaissance, là où vivent les documents', () => {
      render(<MemoryLedgerView />)
      const link = within(section('Documents de référence')).getByRole('link', {
        name: /Ouvrir la base de connaissance/,
      })
      expect(link.getAttribute('href')).toBe('/settings/knowledge')
      expect(link.className).toContain('min-h-11')
    })
  })

  describe('#1916.13 / .16 / .2 — d’où il vient, qui l’a posé, pourquoi il est retenu', () => {
    it('dit « par toi » sur ce que TU as épinglé, et le prénom d’un collègue sur le sien', () => {
      ledger = {
        entries: [
          fact({ id: 'mine', text: 'Mon objectif' }),
          fact({
            id: 'theirs',
            text: 'Règle de Julie',
            scope: 'workspace',
            ownedByMe: false,
            author: { firstName: 'Julie', avatarUrl: null },
          }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Mon objectif')).getByText('Épinglé par toi')).toBeInTheDocument()
      expect(within(rowOf('Règle de Julie')).getByText('Épinglé par Julie')).toBeInTheDocument()
    })

    it('une réponse de Laura enregistrée est dite telle quelle, et reste « à vérifier »', () => {
      ledger = {
        entries: [fact({ id: 'n', text: 'Note', origin: 'copilot', detail: 'copilotNote' })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Note')).getByText(/Retenu d'une réponse de Laura, enregistré par toi/)).toBeInTheDocument()
      expect(within(rowOf('Note')).getByText(/jamais confirmée/)).toBeInTheDocument()
    })

    it('un auteur INCONNU n’est jamais deviné : la provenance se dit sans prénom', () => {
      ledger = {
        entries: [fact({ id: 'u', text: 'Règle orpheline', scope: 'workspace', ownedByMe: false, author: null })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Règle orpheline')).getByText('Épinglé à la main')).toBeInTheDocument()
    })

    it('une correction dit pourquoi elle pèse : elle passe avant tout', () => {
      ledger = {
        entries: [fact({ id: 'c', text: 'Pas de régie', kind: 'correction', scope: 'workspace' })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Pas de régie')).getByText(/passer avant tout/)).toBeInTheDocument()
    })
  })

  describe('#1916.18 / .24 — une conséquence visible, ou « non utilisé aujourd’hui »', () => {
    it('nomme où Laura s’en sert — et seulement ces endroits', () => {
      ledger = { entries: [fact({ id: 's', text: 'En service' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      const row = within(rowOf('En service'))
      expect(row.getByText(/Où Laura s'en sert/)).toBeInTheDocument()
      expect(row.getByText('ses réponses dans le chat')).toBeInTheDocument()
      expect(row.getByText(/ton assistant IA externe/)).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/Découvrir|brief du matin/)
    })

    it('un élément sur un compte précise qu’il ne pèse pas ailleurs', () => {
      ledger = { entries: [fact({ id: 'a', text: 'Sur un compte', accountId: 'acc-1' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      expect(
        within(rowOf('Sur un compte')).getByText(/Sur un autre compte, Laura ne s'en sert pas/),
      ).toBeInTheDocument()
    })

    it('un élément ÉCHU reste, avec sa date, marqué « non utilisé par Laura aujourd’hui »', () => {
      ledger = {
        entries: [fact({ id: 'e', text: 'Congés d’août', expiresAt: PAST, surfaces: [] })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      const row = within(rowOf('Congés d’août'))
      expect(row.getByText(/Non utilisé par Laura aujourd'hui/)).toBeInTheDocument()
      expect(row.getByText(/31 août 2026/)).toBeInTheDocument()
      expect(row.queryByText(/Où Laura s'en sert/)).toBeNull()
    })

    it('sans surfaces servies (API plus ancienne), rien n’est affirmé — ni usage, ni non-usage', () => {
      ledger = { entries: [fact({ id: 'o', text: 'Ancienne API', surfaces: undefined })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      const row = within(rowOf('Ancienne API'))
      expect(row.queryByText(/Où Laura s'en sert/)).toBeNull()
      expect(row.queryByText(/Non utilisé par Laura/)).toBeNull()
    })
  })

  describe('#1916.19 — modifier le texte', () => {
    it('ouvre le texte en édition et enregistre le nouveau texte', () => {
      ledger = { entries: [fact({ id: 'f-1', text: 'Trois signatures' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      const button = screen.getByRole('button', { name: 'Modifier : Trois signatures' })
      expect(button.className).toContain('min-h-11')
      fireEvent.click(button)
      const field = screen.getByLabelText("Texte de l'élément")
      expect((field as HTMLTextAreaElement).value).toBe('Trois signatures')
      fireEvent.change(field, { target: { value: 'Quatre signatures' } })
      fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
      expect(updateFact).toHaveBeenCalledWith({ id: 'f-1', fact: 'Quatre signatures' }, expect.anything())
    })

    it('n’offre pas le geste à qui n’a pas le droit (collègue sur un élément partagé)', () => {
      ledger = {
        entries: [
          fact({ id: 'f-2', text: 'Règle', scope: 'workspace', ownedByMe: false, canEdit: false, canForget: false }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(screen.queryByRole('button', { name: /Modifier/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /échéance/ })).toBeNull()
    })
  })

  describe('#1916.22 — ajouter une échéance après coup', () => {
    it('pose une échéance à la FIN du jour choisi', () => {
      ledger = { entries: [fact({ id: 'f-3', text: 'Priorité Toulouse' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter une échéance : Priorité Toulouse' }))
      fireEvent.change(screen.getByLabelText("Valable jusqu'au"), { target: { value: '2099-10-31' } })
      fireEvent.click(screen.getByRole('button', { name: "Enregistrer l'échéance" }))
      expect(updateFact).toHaveBeenCalledWith({ id: 'f-3', expiresAt: '2099-10-31T23:59:59.999Z' }, expect.anything())
    })

    it('sur un élément déjà daté : changer, ou retirer l’échéance', () => {
      ledger = { entries: [fact({ id: 'f-4', text: 'Daté', expiresAt: FUTURE })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: "Changer l'échéance : Daté" }))
      fireEvent.click(screen.getByRole('button', { name: "Retirer l'échéance" }))
      expect(updateFact).toHaveBeenCalledWith({ id: 'f-4', expiresAt: null }, expect.anything())
    })
  })

  describe('#1916.23 — voir l’historique', () => {
    it('ne lit l’historique qu’à l’ouverture, puis raconte chaque geste avec son auteur', () => {
      history = {
        entries: [
          {
            event: 'created',
            at: '2026-09-01T09:00:00.000Z',
            author: { firstName: 'Alice', avatarUrl: null },
            previousValue: null,
            newValue: 'Texte d’origine',
          },
          {
            event: 'text_changed',
            at: '2026-09-05T09:00:00.000Z',
            author: { firstName: 'Carol', avatarUrl: null },
            previousValue: 'Texte d’origine',
            newValue: 'Texte précisé',
          },
          {
            event: 'scope_changed',
            at: '2026-09-06T09:00:00.000Z',
            author: null,
            previousValue: 'user',
            newValue: 'workspace',
          },
        ],
      }
      ledger = { entries: [fact({ id: 'f-5', text: 'Texte précisé' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      expect(historyRequests.every(id => id === null)).toBe(true)

      const toggle = screen.getByRole('button', { name: 'Historique : Texte précisé' })
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      fireEvent.click(toggle)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(historyRequests).toContain('f-5')

      expect(screen.getByText(/Créé par Alice le 1 sept\. 2026/)).toBeInTheDocument()
      expect(screen.getByText(/Texte modifié par Carol le 5 sept\. 2026/)).toBeInTheDocument()
      // Auteur inconnu : la date, jamais un prénom deviné.
      expect(screen.getByText(/Portée changée le 6 sept\. 2026/)).toBeInTheDocument()
    })
  })
})
