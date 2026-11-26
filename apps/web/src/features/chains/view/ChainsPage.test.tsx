import type { Chain } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { ChainsPage } from './ChainsPage'

// La coque de page tire la session et la navigation ; ce n'est pas ce qu'on
// teste ici, et ses dépendances noieraient le seul point observé — la requête.
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

/**
 * CE QUE CES TESTS PROUVENT (#1503, #1507).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCRAN N'ÉCRIT PLUS RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Les positions se dérivent des objets métier. « Démarrer un parcours »,
 * « Avancer » et « Abandonner » ont disparu parce que le geste qu'ils portaient
 * n'existe plus — et c'est la première chose vérifiée ici, sur les REQUÊTES et
 * pas sur l'absence d'un libellé : un bouton retiré de l'écran mais dont le
 * chemin d'écriture subsiste réapparaîtrait au premier chantier suivant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON NE SAIT PAS PLACER, ON LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un dossier « à déterminer » est compté, atteignable et porte SA raison. Le
 * ranger à l'étape 1 remplirait la première colonne de dossiers dont personne ne
 * sait rien — un compteur juste sur un filtre faux.
 */

const fetchMock = vi.mocked(apiFetch)

const CHAIN: Chain = {
  key: 'ouverture_compte',
  label: { fr: 'Ouverture de compte', en: 'Account opening' },
  purpose: { fr: 'Du premier signal à une action structurée.', en: 'From first signal to a structured action.' },
  domain: 'acquisition',
  subjectType: 'account',
  steps: [
    {
      position: 1,
      label: { fr: 'Compte détecté', en: 'Account detected' },
      actor: 'agent',
      expectedOutput: { fr: 'Un dossier existe', en: 'A file exists' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      position: 2,
      label: { fr: 'Analyse lancée', en: 'Analysis run' },
      actor: 'user',
      expectedOutput: { fr: 'Un dossier complet', en: 'A complete file' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      position: 3,
      label: { fr: 'Compte au portefeuille', en: 'Account in portfolio' },
      actor: 'user',
      expectedOutput: { fr: 'Un compte suivi', en: 'A tracked account' },
      automationLevel: 'n1_prepare',
      requiredCapability: null,
      outsideTool: false,
    },
    {
      // Un geste HORS OUTIL : il ne doit pas apparaître dans le fil, et c'est
      // vérifié plus bas. Aucune table ne le porte, donc aucune position ne
      // pourrait l'atteindre — l'afficher promettrait une étape inaccessible.
      position: 4,
      label: { fr: 'Introduction obtenue', en: 'Introduction obtained' },
      actor: 'user',
      expectedOutput: { fr: 'Un nom qui ouvre la porte', en: 'A name that opens the door' },
      automationLevel: 'n0_advice',
      requiredCapability: null,
      outsideTool: true,
    },
  ],
  gates: [
    {
      afterPosition: 2,
      gate: 'account_priority',
      question: { fr: 'Ce compte entre-t-il au portefeuille ?', en: 'Does this account enter the portfolio?' },
      yesTargetPosition: 3,
      noTargetPosition: 1,
      reasonRequired: true,
    },
  ],
  returnLoop: {
    fr: 'Un signal nouveau ramène le dossier à l’analyse pour rafraîchir le plan.',
    en: 'A new signal sends the file back to analysis to refresh the plan.',
  },
}

const BOARD = {
  lanes: [
    {
      chain: CHAIN,
      positions: [
        { position: 1, count: 0, medianDaysAtPosition: null, awaiting: 0 },
        { position: 2, count: 1, medianDaysAtPosition: 8.4, awaiting: 1 },
        { position: 3, count: 0, medianDaysAtPosition: null, awaiting: 0 },
      ],
      gates: [{ afterPosition: 2, waiting: 1 }],
      total: 1,
      awaitingDecision: 1,
      stalled: 1,
      undetermined: [{ reason: 'unmapped_status', count: 2 }],
    },
  ],
}

const PLACED = {
  subjectId: 'acc-1',
  label: 'Acme Industrie',
  movedAt: '2026-08-29T09:00:00.000Z',
  days: 8.4,
  derivation: {
    kind: 'at' as const,
    position: 2,
    blockedGate: 'account_priority' as const,
    gateReason: null,
    evidence: [
      { position: 1, fact: 'fact.ouverture_compte.1', at: '2026-08-20T09:00:00.000Z', count: null },
      { position: 2, fact: 'fact.ouverture_compte.2', at: '2026-08-29T09:00:00.000Z', count: null },
    ],
  },
}

const UNPLACEABLE = {
  subjectId: 'acc-2',
  label: 'Vieux dossier',
  movedAt: null,
  days: null,
  derivation: { kind: 'undetermined' as const, reason: 'unmapped_status' as const, evidence: [] },
}

type FetchArgs = { path: string; method?: string; body?: unknown }

/** Route les appels par CHEMIN : c'est ce qui rend le test lisible et ce qui
 *  permet d'affirmer qu'un chemin précis a été appelé, pas « un appel ». */
function routeBy(overrides: Record<string, unknown> = {}) {
  fetchMock.mockImplementation((args: unknown) => {
    const { path } = args as FetchArgs
    for (const [prefix, value] of Object.entries(overrides)) {
      if (path.startsWith(prefix)) return Promise.resolve(value)
    }
    if (path === '/chains/board') return Promise.resolve(BOARD)
    if (path.includes('undetermined=true')) return Promise.resolve({ items: [UNPLACEABLE] })
    if (path.includes('/position/')) return Promise.resolve({ items: [PLACED] })
    return Promise.resolve({})
  })
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ChainsPage />
    </QueryClientProvider>,
  )
}

/** Tous les chemins appelés — « aucun appel sur ce préfixe » est la réponse
 *  qu'on veut pouvoir affirmer, et un `find` la rendrait indistincte d'un
 *  appel réussi. */
function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([args]) => (args as FetchArgs).path)
}

describe('ChainsPage — les parcours sont DÉRIVÉS', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    routeBy()
  })

  it('affiche le fil avec les NOMS métier, jamais des numéros', async () => {
    renderPage()
    expect(await screen.findByText('Compte détecté')).toBeInTheDocument()
    // Deux fois : dans le fil, et dans le KPI « étape où l'on attend le plus ».
    expect(screen.getAllByText('Analyse lancée')).toHaveLength(2)
    expect(screen.getByText('Compte au portefeuille')).toBeInTheDocument()
  })

  it('n’affiche PAS les gestes hors outil dans le fil', async () => {
    // Ils ne peuvent pas être atteints par une dérivation : aucune table ne les
    // porte. Les mettre dans le fil promettrait une étape que rien ne franchit,
    // et le dossier semblerait bloqué à l'avant-dernière pour toujours.
    renderPage()
    await screen.findByText('Compte détecté')
    expect(screen.queryByText('Introduction obtenue')).not.toBeInTheDocument()
  })

  it('l’écran n’a plus AUCUN chemin d’écriture de position', async () => {
    // La preuve porte sur les REQUÊTES, pas sur l'absence d'un libellé : un
    // bouton retiré dont le chemin subsiste revient au premier chantier suivant.
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Analyse lancée/ }))
    await screen.findByText('Acme Industrie')

    const paths = calledPaths()
    expect(paths.some(path => path === '/chains/runs')).toBe(false)
    expect(paths.some(path => path.includes('/advance'))).toBe(false)
    expect(paths.some(path => path.includes('/abandon'))).toBe(false)
    expect(paths.some(path => path.includes('/subjects'))).toBe(false)
    // Et aucune méthode d'écriture n'est partie, quel que soit le chemin.
    expect(fetchMock.mock.calls.some(([args]) => (args as FetchArgs).method === 'POST')).toBe(false)
  })

  it('ouvre les dossiers d’une étape et EXPLIQUE pourquoi ils y sont', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Analyse lancée/ }))
    expect(await screen.findByText('Acme Industrie')).toBeInTheDocument()

    // #1507 §4 : « chaque changement d'étape doit être explicable ».
    await user.click(screen.getByRole('button', { name: 'Pourquoi ?' }))
    expect(await screen.findByText(/le compte existe dans ton portefeuille/)).toBeInTheDocument()
    expect(screen.getByText(/une analyse a été lancée/)).toBeInTheDocument()
  })

  it('compte et OUVRE les dossiers qu’il ne sait pas placer, avec leur raison', async () => {
    const user = userEvent.setup()
    renderPage()
    const trigger = await screen.findByRole('button', { name: /2 à déterminer/ })
    await user.click(trigger)

    expect(await screen.findByText('Vieux dossier')).toBeInTheDocument()
    // La raison, pas seulement l'aveu : sans elle, l'utilisateur n'a aucun geste.
    expect(screen.getByText(/aucune étape du parcours ne décrit/)).toBeInTheDocument()
  })

  it('une étape VIDE dit qu’elle est vide — elle n’affiche pas « 0 jour »', async () => {
    renderPage()
    await screen.findByText('Compte détecté')
    // « Aucun dossier ici » et « zéro jour d'attente » sont deux faits
    // différents, et l'un des deux serait faux.
    expect(screen.getAllByText('aucun').length).toBeGreaterThan(0)
    expect(screen.queryByText(/0 j$/)).not.toBeInTheDocument()
  })

  it('un échec de lecture ne se rend jamais comme « aucun parcours »', async () => {
    fetchMock.mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(screen.getByText(/n’ont pas pu être chargés/)).toBeInTheDocument())
  })
})
