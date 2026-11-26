import type React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemoryLedger } from '@bellum/contracts'

const forget = vi.fn()
const forgetAll = vi.fn()
const setScope = vi.fn()
let ledger: MemoryLedger | null = { entries: [], unreadableLayers: [] }
let isLoading = false
let isError = false

// Les couches DÉCLARÉES rendent un lien vers les réglages où elles se
// corrigent. Sans routeur monté, `Link` lève — on le remplace par l'ancre qu'il
// produit, ce qui est justement ce que l'écran affiche.
// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
// #4060 — l'approche des messages porte son propre réseau (session) : témoin nul, comme ReplyPreferencesSettings.
vi.mock('@/features/memory/view/MessageApproachSettings', () => ({ MessageApproachSettings: () => null }))
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useMemoryLedger: () => ({ data: ledger, isLoading, isError }),
  useForgetMemoryEntry: () => ({ mutate: forget, isPending: false }),
  useForgetAllMemory: () => ({ mutate: forgetAll, isPending: false }),
  useSetFactScope: () => ({ mutate: setScope, isPending: false }),
  // #1916.19 / #1916.23 — les gestes de ligne ; ce fichier-ci ne les exerce pas
  // (`MemoryLedgerView.lisible.test.tsx` le fait).
  useUpdateFact: () => ({ mutate: vi.fn(), isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

// #1928.9 — la section « Ta façon de travailler » monte les réglages de
// réponse, qui lisent le réseau. Sans ce double, chaque test de cet écran
// tomberait sur une requête sans client — pour une raison sans rapport.
vi.mock('@/features/memory/hooks/useReplyPreferences', () => ({
  useReplyPreferences: () => ({ data: { replyLength: 'short' }, isLoading: false, isError: false }),
  useSetReplyPreference: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #2101.13 — même raison que le double juste au-dessus : la section monte
// aussi le temps protégé, qui lit le même réseau.
vi.mock('@/features/memory/hooks/useProtectedTime', () => ({
  useProtectedTime: () => ({ data: null, isLoading: false, isError: false }),
  useSetProtectedTime: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #2101.17 — même raison que les deux doubles juste au-dessus : la section
// monte aussi les préférences d'agenda, qui lisent le même réseau.
vi.mock('@/features/memory/hooks/useAgendaPreferences', () => ({
  useAgendaPreferences: () => ({ data: {}, isLoading: false, isError: false }),
  useSetAgendaPreferences: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { MemoryLedgerView } = await import('./MemoryLedgerView')

/** Le bloc texte + badges d'une ligne du registre. */
function rowOf(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement
  if (!element) throw new Error(`aucune ligne pour « ${text} »`)
  return element
}

/**
 * La règle de transparence du tome 6 §12.1, vue de l'écran : ce que Laura garde
 * est LISIBLE et chaque ligne s'oublie. Et la nuance qui coûte cher partout
 * ailleurs dans ce dépôt : une couche ILLISIBLE n'est pas une couche vide.
 */
describe('MemoryLedgerView — la mémoire de Laura, en clair', () => {
  beforeEach(() => {
    forget.mockReset()
    forgetAll.mockReset()
    setScope.mockReset()
    isLoading = false
    isError = false
    ledger = { entries: [], unreadableLayers: [] }
  })

  /**
   * #1916.3 / #1916.21 / #1918.1 — POUR QUI une ligne vaut, et le PROPRIÉTAIRE
   * peut le changer. Un collègue lit la ligne partagée ; il n'en change pas la
   * portée — le bouton n'existe pas pour lui (le serveur refuse de toute façon).
   */
  describe('la portée de ce qui est épinglé', () => {
    const fact = (over: Partial<MemoryLedger['entries'][number]>): MemoryLedger['entries'][number] => ({
      id: 'f-x',
      layer: 'facts',
      text: 'x',
      recordedAt: '2026-09-10T09:00:00.000Z',
      accountId: null,
      detail: null,
      expiresAt: null,
      ...over,
    })

    it('chaque fait porte un badge de portée — « Toi uniquement » ou « Toute ton ESN »', () => {
      ledger = {
        entries: [
          fact({ id: 'f-mine', text: 'Mon objectif du trimestre', scope: 'user', ownedByMe: true }),
          fact({ id: 'f-esn', text: 'Jamais de freelance', scope: 'workspace', ownedByMe: false }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Mon objectif du trimestre')).getByText('Toi uniquement')).toBeInTheDocument()
      expect(within(rowOf('Jamais de freelance')).getByText('Toute ton ESN')).toBeInTheDocument()
    })

    it('le propriétaire partage sa ligne « moi » avec l’espace, d’un geste nommé', () => {
      ledger = {
        entries: [fact({ id: 'f-mine', text: 'Mon objectif du trimestre', scope: 'user', ownedByMe: true })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      const button = screen.getByRole('button', { name: 'Partager avec ton ESN : Mon objectif du trimestre' })
      // 44 px au doigt (GA-30) : c'est un geste qu'on fait aussi au téléphone.
      expect(button.className).toContain('min-h-11')
      fireEvent.click(button)
      expect(setScope).toHaveBeenCalledWith({ id: 'f-mine', scope: 'workspace' })
    })

    it('le propriétaire ramène une ligne partagée à « toi uniquement »', () => {
      ledger = {
        entries: [fact({ id: 'f-shared', text: 'Règle que j’ai posée', scope: 'workspace', ownedByMe: true })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: 'Garder pour toi uniquement : Règle que j’ai posée' }))
      expect(setScope).toHaveBeenCalledWith({ id: 'f-shared', scope: 'user' })
    })

    it('un COLLÈGUE ne voit aucun bouton de portée sur une ligne qu’il n’a pas épinglée', () => {
      ledger = {
        entries: [fact({ id: 'f-esn', text: 'Jamais de freelance', scope: 'workspace', ownedByMe: false })],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(screen.queryByRole('button', { name: /Partager avec ton ESN|Garder pour toi uniquement/ })).toBeNull()
    })

    it('#1918.7 — l’élément partagé d’un collègue : pas de bouton « Oublier » sans le droit de le retirer', () => {
      ledger = {
        entries: [
          fact({ id: 'f-esn', text: 'Jamais de freelance', scope: 'workspace', ownedByMe: false, canForget: false }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      expect(screen.getByText('Jamais de freelance')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Oublier cette ligne : Jamais de freelance' })).toBeNull()
    })

    it('#1918.7 — un manager (canForget) voit « Oublier » sur l’élément partagé d’un collègue', () => {
      ledger = {
        entries: [
          fact({ id: 'f-esn', text: 'Jamais de freelance', scope: 'workspace', ownedByMe: false, canForget: true }),
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: 'Oublier cette ligne : Jamais de freelance' }))
      expect(forget).toHaveBeenCalledWith({ layer: 'facts', id: 'f-esn' })
    })

    it('une ligne sans portée (API plus ancienne) : ni badge ni bouton — jamais une portée devinée', () => {
      ledger = { entries: [fact({ id: 'f-old', text: 'Ligne ancienne' })], unreadableLayers: [] }
      render(<MemoryLedgerView />)
      expect(within(rowOf('Ligne ancienne')).queryByText(/Toi uniquement|Toute ton ESN/)).toBeNull()
      expect(screen.queryByRole('button', { name: /Partager avec ton ESN|Garder pour toi uniquement/ })).toBeNull()
    })
  })

  it('montre le TEXTE de chaque ligne, pas une clé technique', () => {
    ledger = {
      entries: [
        {
          id: 'f-1',
          layer: 'facts',
          text: 'Le DSI décide seul chez ce client',
          recordedAt: '2026-08-20T09:00:00.000Z',
          accountId: null,
          detail: 'correction',
          expiresAt: null,
        },
        {
          id: 'general',
          layer: 'conversations',
          text: '• Utilisateur : prépare une relance\n• BellumAI : voici trois angles',
          recordedAt: '2026-08-22T09:00:00.000Z',
          accountId: null,
          detail: null,
          expiresAt: null,
        },
      ],
      unreadableLayers: [],
    }
    render(<MemoryLedgerView />)

    expect(screen.getByText('Le DSI décide seul chez ce client')).toBeInTheDocument()
    expect(screen.getByText(/prépare une relance/)).toBeInTheDocument()
    // Le qualificatif est TRADUIT, jamais rendu en clé nue.
    expect(screen.getByText('Correction')).toBeInTheDocument()
  })

  it('oublie une ligne dans SA couche', () => {
    ledger = {
      entries: [
        {
          id: 'tone',
          layer: 'preferences',
          text: 'direct',
          recordedAt: '2026-08-21T09:00:00.000Z',
          accountId: null,
          detail: 'tone',
          expiresAt: null,
        },
      ],
      unreadableLayers: [],
    }
    render(<MemoryLedgerView />)

    fireEvent.click(screen.getByRole('button', { name: /Oublier cette ligne/ }))
    expect(forget).toHaveBeenCalledWith({ layer: 'preferences', id: 'tone' })
  })

  /**
   * #1928.9 — les réglages de réponse se règlent en tête de « Ta façon de
   * travailler », et ne réapparaissent pas plus bas en ligne brute.
   */
  describe('les réglages de réponse', () => {
    it('se règlent dans la couche des préférences, sans se répéter en ligne brute', () => {
      ledger = {
        entries: [
          {
            id: 'replyLength',
            layer: 'preferences',
            text: 'short',
            recordedAt: '2026-09-12T09:00:00.000Z',
            accountId: null,
            detail: 'replyLength',
            expiresAt: null,
          },
          {
            id: 'tone',
            layer: 'preferences',
            text: 'direct',
            recordedAt: '2026-09-12T09:00:00.000Z',
            accountId: null,
            detail: 'tone',
            expiresAt: null,
          },
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)

      expect(screen.getByRole('group', { name: 'Longueur des réponses' })).toBeInTheDocument()
      // La clé technique et sa valeur brute ne s'affichent pas en ligne…
      expect(screen.queryByText('short')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Oublier cette ligne : short/ })).not.toBeInTheDocument()
      // …et la préférence libre voisine reste là, oubliable.
      expect(screen.getByText('direct')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Oublier cette ligne : direct/ })).toBeInTheDocument()
    })

    it('ne dit pas « aucune préférence » sous des réglages posés', () => {
      ledger = {
        entries: [
          {
            id: 'replyLength',
            layer: 'preferences',
            text: 'short',
            recordedAt: '2026-09-12T09:00:00.000Z',
            accountId: null,
            detail: 'replyLength',
            expiresAt: null,
          },
        ],
        unreadableLayers: [],
      }
      render(<MemoryLedgerView />)

      expect(screen.getByText('Aucune autre préférence retenue.')).toBeInTheDocument()
      expect(screen.queryByText('Aucune préférence retenue.')).not.toBeInTheDocument()
    })
  })

  it('NOMME une couche illisible au lieu de la présenter comme vide', () => {
    ledger = { entries: [], unreadableLayers: ['conversations'] }
    render(<MemoryLedgerView />)

    // La couche illisible dit qu'elle n'a pas pu être lue…
    expect(screen.getByText(/n'a pas pu être lue/)).toBeInTheDocument()
    // …et les autres, vraiment vides, disent qu'elles sont vides. #1916 — les
    // faits se lisent désormais par sections : une section vide le dit.
    expect(screen.getByText('Aucun objectif personnel retenu.')).toBeInTheDocument()
    expect(screen.queryByText('Aucun échange résumé.')).not.toBeInTheDocument()
  })

  it('ne prétend pas que Laura ne retient rien quand la lecture échoue', () => {
    ledger = null
    isError = true
    render(<MemoryLedgerView />)

    expect(screen.getByText(/pas parce que Laura ne retient rien/)).toBeInTheDocument()
    expect(screen.queryByText('Aucun objectif personnel retenu.')).not.toBeInTheDocument()
  })

  it('écrit ce que Laura ne mémorise JAMAIS — les cinq interdits du §12.2', () => {
    render(<MemoryLedgerView />)
    expect(screen.getByText('Ce que Laura ne mémorise jamais')).toBeInTheDocument()
    expect(screen.getByText(/Le contenu de tes messages/)).toBeInTheDocument()
    expect(screen.getByText(/Un secret partagé par erreur/)).toBeInTheDocument()
  })

  /**
   * LES DEUX COUCHES DÉCLARÉES — visibles, corrigeables, jamais « oubliables ».
   *
   * Le défaut qu'elles referment : le prénom et le profil de l'ESN partaient
   * dans le prompt à chaque tour, et aucun écran ne le disait.
   */
  describe('les couches déclarées', () => {
    beforeEach(() => {
      ledger = {
        entries: [
          {
            id: 'firstName',
            layer: 'identity',
            text: 'Louis',
            recordedAt: '2026-08-24T09:00:00.000Z',
            accountId: null,
            detail: 'firstName',
            expiresAt: null,
          },
          {
            id: 'companyName',
            layer: 'workspace',
            text: 'BellumAI',
            recordedAt: '2026-08-25T09:00:00.000Z',
            accountId: null,
            detail: 'companyName',
            expiresAt: null,
          },
        ],
        unreadableLayers: [],
      }
    })

    it('montre la valeur en clair, avec son libellé traduit', () => {
      render(<MemoryLedgerView />)
      expect(screen.getByText('Louis')).toBeInTheDocument()
      expect(screen.getByText('Prénom')).toBeInTheDocument()
      expect(screen.getByText('BellumAI')).toBeInTheDocument()
      expect(screen.getByText('Raison sociale')).toBeInTheDocument()
    })

    it('ne propose PAS de les oublier, et renvoie là où elles se corrigent', () => {
      render(<MemoryLedgerView />)
      // Aucune croix sur ces deux lignes : un bouton grisé sans explication
      // laisserait croire à un droit qu'on n'a pas.
      expect(screen.queryByRole('button', { name: /Oublier cette ligne : Louis/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Oublier cette ligne : BellumAI/ })).not.toBeInTheDocument()
      // Un lien vers l'endroit où elles se saisissent, et un seul par couche.
      expect(screen.getByRole('link', { name: /Modifier dans Mon compte/ })).toHaveAttribute(
        'href',
        '/settings/profile/identity',
      )
      expect(screen.getByRole('link', { name: /Modifier le profil de l'ESN/ })).toHaveAttribute(
        'href',
        '/settings/profile',
      )
    })
  })

  /**
   * « TOUT OUBLIER » — irréversible, donc jamais un clic seul.
   */
  describe('tout oublier', () => {
    it('n’efface RIEN au premier clic : il demande, et il dit ce qui part et ce qui reste', () => {
      render(<MemoryLedgerView />)

      fireEvent.click(screen.getByRole('button', { name: 'Tout oublier' }))

      expect(forgetAll).not.toHaveBeenCalled()
      const dialog = screen.getByRole('dialog', { name: 'Tout oublier ?' })
      expect(dialog).toBeInTheDocument()
      // Ce qui part, ce qui reste, et le fait que rien ne le rattrapera.
      expect(screen.getAllByText(/les faits que TU as épinglés/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/les faits épinglés par tes collègues/).length).toBeGreaterThan(0)
      // #1919 — les retours sur les réponses de Laura partent aussi, dans CET espace ;
      // une correction portée au dossier d'un compte, elle, appartient à l'équipe.
      expect(screen.getAllByText(/tes retours sur les réponses de .+ \(dans cet espace\)/).length).toBeGreaterThan(0)
      expect(
        screen.getAllByText(/les corrections que tu as portées au dossier d'un compte restent, pour l'équipe/).length,
      ).toBeGreaterThan(0)
      expect(screen.getByText(/C'est irréversible/)).toBeInTheDocument()
    })

    it('#1918.8 — la confirmation dit que tes confirmations sur les notes de l’équipe restent', () => {
      render(<MemoryLedgerView />)

      fireEvent.click(screen.getByRole('button', { name: 'Tout oublier' }))

      // Décision du 13/09 : « Tout oublier » garde ces traces d'équipe ;
      // seul l'effacement du compte les retire. Le geste le dit avant le clic.
      expect(screen.getByRole('dialog', { name: 'Tout oublier ?' })).toHaveTextContent(
        "Tes confirmations sur les notes de l'équipe restent visibles.",
      )
    })

    it('n’efface qu’après la confirmation explicite', () => {
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: 'Tout oublier' }))
      fireEvent.click(screen.getByRole('button', { name: 'Oui, tout oublier' }))
      expect(forgetAll).toHaveBeenCalledTimes(1)
    })

    it('renoncer n’efface rien', () => {
      render(<MemoryLedgerView />)
      fireEvent.click(screen.getByRole('button', { name: 'Tout oublier' }))
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }))
      expect(forgetAll).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('Théo D settings-laura (Mémoire) — structure de la maquette (contrôle 23/10)', () => {
  beforeEach(() => {
    isLoading = false
    isError = false
    ledger = { entries: [], unreadableLayers: [] }
  })

  it('un seul h1 avec l’eyebrow Personnel, « Ajouter un élément » dans l’en-tête', () => {
    render(<MemoryLedgerView />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByText('Paramètres · Personnel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter un élément' })).toBeInTheDocument()
  })

  it('« Tout oublier » est la dernière ligne du bloc « ne mémorise jamais », pas un bloc au-dessus', () => {
    render(<MemoryLedgerView />)
    const never = screen
      .getByRole('heading', { level: 2, name: /ne mémorise jamais/ })
      .closest('section') as HTMLElement
    expect(within(never).getByRole('heading', { level: 3, name: 'Tout oublier' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2, name: 'Tout oublier' })).not.toBeInTheDocument()
  })
})
