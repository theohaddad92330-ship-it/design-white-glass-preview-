import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  countTargetListItems,
  DEFAULT_COPILOT_NAME,
  deriveTargetListType,
  targetListsResponseSchema,
  type SessionUser,
  type TargetList,
} from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import fr from '@/i18n/locales/fr/targets.json'
import { chooseOption } from '@/test/select'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

// GA-252 — la marque passe par {{copilot}} ; l'écran l'interpole, le test aussi.
const withCopilot = (value: string) => value.replaceAll('{{copilot}}', DEFAULT_COPILOT_NAME)

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { TargetListsSection } = await import('./TargetListsSection')

const LIST_ID = '11111111-1111-4111-8111-111111111111'
const STAMP = '2026-09-01T00:00:00.000Z'
/**
 * #2156 — LE DOUBLE SE DERIVE DU CONTRAT, IL NE LE RECOPIE PAS.
 *
 * `useTargetLists` parse la reponse a la frontiere (`targetListsResponseSchema`)
 * : un double auquel il manque un champ ne fait pas echouer une assertion, il
 * fait echouer le PARSE — l'ecran reste vide et les cinq tests tombent sur
 * « Unable to find the text », ce qui ne nomme pas la cause. C'est ce qui est
 * arrive quand #2156 a fait grandir le modele d'une cible.
 *
 * Les deux valeurs derivees (`type`, `counts`) passent donc par les memes
 * fonctions que l'API (GA-26, un seul endroit), et `expectInContract` ci-dessous
 * fait dire au double « je ne suis plus au contrat » AVANT le premier rendu.
 */
const ITEMS = [
  {
    id: 'i1',
    target_list_id: LIST_ID,
    kind: 'account',
    ref_id: 'acc-1',
    label: 'Banque Alpha',
    sublabel: null,
    selection_reason: null,
    priority: 'high',
    owner_user_id: 'u2',
    work_status: 'to_review',
    provenance: 'discover',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: 'Appeler la DSI',
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
  },
  {
    id: 'i2',
    target_list_id: LIST_ID,
    kind: 'contact',
    ref_id: 'ct-1',
    label: 'Claire Martin',
    sublabel: 'Banque Alpha',
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'in_progress',
    provenance: 'manual',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
  },
] as const

const LISTS = {
  lists: [
    {
      id: LIST_ID,
      name: 'Banques régionales — T4',
      objective: 'Décrocher 3 rendez-vous DSI',
      type: deriveTargetListType(ITEMS),
      owner_user_id: null,
      team: null,
      visibility: 'workspace',
      source: 'manual',
      source_query: null,
      status: 'in_progress',
      counts: countTargetListItems(ITEMS),
      next_action: null,
      sequence_id: null,
      prospecting_session_id: null,
      created_by: 'u1',
      created_at: STAMP,
      updated_at: STAMP,
      items: ITEMS,
    },
  ],
}

/** #2156.56-.60 — une liste minimale pour peupler une VUE, sans élément à charge. */
function buildList(overrides: Partial<TargetList>): TargetList {
  return {
    id: overrides.id ?? 'v-default',
    name: overrides.name ?? 'Liste',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'manual',
    source_query: null,
    status: 'draft',
    counts: countTargetListItems([]),
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'u1',
    created_at: STAMP,
    updated_at: STAMP,
    items: [],
    ...overrides,
  }
}

const VIEW_LISTS = {
  lists: [
    buildList({ id: 'v-active', name: 'Vue Actives', status: 'in_progress', created_by: 'u1' }),
    buildList({ id: 'v-prep', name: 'Vue À préparer', status: 'to_qualify', created_by: 'u1' }),
    buildList({
      id: 'v-shared',
      name: 'Vue Partagée',
      status: 'paused',
      visibility: 'workspace',
      created_by: 'u2',
    }),
    buildList({ id: 'v-done', name: 'Vue Terminée', status: 'done', created_by: 'u1' }),
    buildList({ id: 'v-archived', name: 'Vue Archivée', status: 'archived', created_by: 'u1' }),
  ],
}

type FetchArgs = { path: string; method?: string; body?: unknown }

function mockApi(lists: unknown = LISTS) {
  apiFetch.mockImplementation(async (args?: FetchArgs) => {
    const { path, method } = args ?? { path: '' }
    if (path === '/target-lists' && (method ?? 'GET') === 'GET') return lists
    // #2151.60 — l'écran accueille désormais le plateau de la Veille : il LIT
    // deux endpoints de plus. Le repli `{}` de la fin ne convient pas — le
    // modèle attend des listes, et un objet vide fait échouer le rendu ENTIER
    // de l'écran, donc tous les tests ci-dessous sur une cause qui n'est pas la
    // leur. C'est exactement ce qui est arrivé au premier montage.
    if (path === '/accounts/signals') return []
    if (path === '/watchlist/rules') return []
    if (path === '/workspaces/members') {
      return [{ userId: 'u2', email: 'sarah@esn.test', fullName: 'Sarah Petit', role: 'member', isSelf: false }]
    }
    if (method === 'PATCH') return { ...LISTS.lists[0]!.items[0], work_status: 'done' }
    if (method === 'DELETE') return { id: 'i1' }
    return {}
  })
}

/** Le client de requêtes du harnais est partagé : un utilisateur par scénario isole le cache. */
function renderContent(userId = 'u1') {
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: userId } as SessionUser, loading: false }}>
      <TargetListsSection />
    </SessionContext.Provider>,
    '/mes-cibles',
  )
}

beforeEach(() => apiFetch.mockReset())

/**
 * Théo B c2-mes-listes — une liste se lit d'abord en CARTE ; son détail complet (éléments, statuts,
 * responsable, prochaine action) s'ouvre par « Ouvrir », dans une fenêtre.
 */
async function openDetail(name = 'Banques régionales — T4') {
  fireEvent.click(await screen.findByRole('button', { name: `Ouvrir la liste ${name}` }))
  return screen.findByRole('dialog')
}

describe('Mes cibles — #2155.13 à .22', () => {
  /**
   * La garde du DOUBLE, avant celles de l'écran. Elle sait dire NON : retirer un
   * champ du contrat de `ITEMS` la fait échouer ici, en nommant le champ, au
   * lieu de laisser cinq tests d'affichage tomber sur un écran resté vide.
   */
  it('le double de réponse est au contrat — sinon le parse de frontière vide l’écran', () => {
    expect(() => targetListsResponseSchema.parse(LISTS)).not.toThrow()
    expect(targetListsResponseSchema.parse(LISTS).lists[0]?.items).toHaveLength(2)
  })

  // #4088.8 — le bloc « listes » vit sur Comptes (lentille « Listes »), sans dépliant :
  // la garantie #2155.14, le résumé chiffré et les CTA sont écrits en clair.
  it('porte son titre de niveau 2 et dit ce qu’est une cible (#2155.13/.22, #4088.8)', async () => {
    mockApi()
    renderContent()
    expect(await screen.findByRole('heading', { level: 2, name: fr.lists.heading })).toBeInTheDocument()
    expect(screen.getByText(fr.lists.subtitle)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('la garantie #2155.14 est écrite en clair, sans « En savoir plus » (#4088.8)', async () => {
    mockApi()
    renderContent()
    await screen.findByRole('heading', { level: 2, name: fr.lists.heading })
    expect(screen.getByText(fr.page.introCanonical)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: fr.page.introCanonicalToggle })).not.toBeInTheDocument()
  })

  it('affiche l’objectif de la liste (#2155.16)', async () => {
    mockApi()
    renderContent()
    expect(await screen.findByText('Objectif : Décrocher 3 rendez-vous DSI')).toBeInTheDocument()
  })

  it('chaque élément mène à sa fiche CANONIQUE, pas à une copie (#2155.15)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    expect((await screen.findByRole('link', { name: 'Banque Alpha' })).getAttribute('href')).toBe('/accounts/acc-1')
    expect(screen.getByRole('link', { name: 'Claire Martin' }).getAttribute('href')).toBe('/contacts/ct-1')
  })

  it('montre priorité, responsable, statut de travail, provenance et action suivante (#2155.17-.21)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    expect(await screen.findByRole('combobox', { name: 'Priorité — Banque Alpha' })).toHaveTextContent('Haute')
    // Une priorité non posée se DIT, elle ne devient pas « basse ».
    expect(screen.getByRole('combobox', { name: 'Priorité — Claire Martin' })).toHaveTextContent('Non posée')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Responsable — Banque Alpha' })).toHaveTextContent('Sarah Petit'),
    )
    expect(screen.getByRole('combobox', { name: 'Statut de travail — Banque Alpha' })).toHaveTextContent('À vérifier')
    expect(screen.getByText('Découvrir')).toBeInTheDocument()
    expect(screen.getByText('Ajout manuel')).toBeInTheDocument()
    expect((screen.getByRole('textbox', { name: 'Action suivante — Banque Alpha' }) as HTMLInputElement).value).toBe(
      'Appeler la DSI',
    )
  })

  it('l’action suivante s’écrit sur l’élément de la liste quand on quitte le champ (#2155.21)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    const next = await screen.findByRole('textbox', { name: 'Action suivante — Claire Martin' })
    fireEvent.change(next, { target: { value: 'Relancer jeudi' } })
    fireEvent.blur(next)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/target-lists/${LIST_ID}/items/i2`,
          method: 'PATCH',
          body: { next_action: 'Relancer jeudi' },
        }),
      ),
    )
  })

  it('retirer un élément n’appelle que la liste — jamais la fiche (#2155.14)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    fireEvent.click(await screen.findByRole('button', { name: 'Retirer Banque Alpha de la liste' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/target-lists/${LIST_ID}/items/i1`, method: 'DELETE' }),
      ),
    )
    const paths = apiFetch.mock.calls.map(call => String((call[0] as FetchArgs).path))
    expect(paths.filter(path => path.startsWith('/accounts') || path.startsWith('/contacts'))).toEqual([])
  })

  it('sans liste, explique ce qu’on y met au lieu d’un écran muet', async () => {
    mockApi({ lists: [] })
    renderContent('u-empty')
    expect(await screen.findByText('Aucune liste pour l’instant')).toBeInTheDocument()
  })

  it('« Importer une liste » ouvre le dialogue d’import (#2156.55)', async () => {
    mockApi()
    renderContent()
    await screen.findByRole('heading', { level: 2, name: fr.lists.heading })
    fireEvent.click(screen.getByRole('button', { name: 'Importer une liste' }))
    expect(await screen.findByLabelText('Noms à retrouver, un par ligne')).toBeInTheDocument()
  })

  // #2931 — recette écran 27/09 : CTA principal rempli + secondaire à contour
  // prouvés (getComputedStyle) sur /contacts, /search, /discover ; ABSENT sur
  // /mes-cibles, où le CTA secondaire (« Importer une liste ») portait la
  // variante `ghost` (aucune bordure) au lieu de `outline` (contour), la seule
  // variante « secondaire » qui porte une bordure visible dans ce design system.
  it('le CTA secondaire « Importer une liste » porte un contour, comme sur /contacts, /search et /discover (#2931)', async () => {
    mockApi()
    renderContent()
    await screen.findByRole('heading', { level: 2, name: fr.lists.heading })
    const importButton = screen.getByRole('button', { name: 'Importer une liste' })
    // `outline` (secondaire à contour) pose la classe `border` seule dans la
    // liste des classes ; `ghost` ne la pose jamais — vérifié sur le TOKEN
    // exact, pas une sous-chaîne (`focus-visible:border-ring` la contient
    // aussi, sur TOUTES les variantes, et ne prouverait rien).
    expect(importButton.className.split(/\s+/)).toContain('border')
    // Théo c2 — la création vit dans une fenêtre, ouverte par « Créer une liste ».
    fireEvent.click(screen.getByRole('button', { name: 'Créer une liste' }))
    const createButton = await screen.findByRole('button', { name: 'Créer la liste' })
    expect(createButton.className).toMatch(/bg-black|bg-\[var\(--bellum-primary-500\)\]/)
  })

  // #2167.9 — le contrat de page exige un coût ÉVENTUEL nommé ; créer une
  // liste ne déclenche aucun appel facturé (`createList` ne pose que le nom
  // et l'objectif) : le formulaire le dit plutôt que de laisser planer le doute.
  it('annonce que créer une liste ne coûte aucun crédit (#2167.9)', async () => {
    mockApi()
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Créer une liste' }))
    expect(await screen.findByText(fr.create.costHint)).toBeInTheDocument()
  })

  it('sans liste, oriente vers Découvrir et Laura (#2156.69)', async () => {
    mockApi({ lists: [] })
    renderContent('u-empty-2')
    await screen.findByText('Aucune liste pour l’instant')
    expect(screen.getByText(withCopilot(fr.empty.description))).toBeInTheDocument()
    expect(fr.empty.description).toContain('Découvrir')
    expect(withCopilot(fr.empty.description)).toContain(DEFAULT_COPILOT_NAME)
  })
})

describe('Mes cibles — résumé chiffré et CTA secondaires de l’en-tête (#2156.51/.53/.54)', () => {
  /**
   * #2746.2 — ces trois capacités sont réelles, mais elles rejoignent le
   * dépliant « En savoir plus » (voir le docblock de `TargetListsContent`) :
   * posées en clair, elles rallongeraient l'entête au-delà des 1 à 2 lignes
   * que #2746 demande. Chaque test déplie donc AVANT de vérifier.
   */
  async function expand() {
    await screen.findByRole('heading', { level: 2, name: fr.lists.heading })
  }

  it('affiche un résumé chiffré — listes actives, contacts prêts, éléments à vérifier (#2156.51)', async () => {
    mockApi()
    renderContent()
    await expand()
    // 1 liste `in_progress`, 0 élément `ready_to_contact`, 1 élément `to_review` dans le double.
    expect(await screen.findByText('1 liste active')).toBeInTheDocument()
    // #4433.9 — une absence ne fait aucune ligne : « 0 contact prêt » n'est plus écrit (GA-18 / GA-19).
    expect(screen.queryByText(/0 contact prêt/)).not.toBeInTheDocument()
    expect(screen.getByText('1 élément à vérifier')).toBeInTheDocument()
  })

  it('#4433.9 — les vues sans liste ne portent aucun « · 0 »', async () => {
    mockApi()
    renderContent()
    await expand()
    await screen.findByText('1 liste active')
    // 1 liste `in_progress` : « Terminées » et « Archivées » n'en ont aucune.
    expect(screen.getByText('Terminées')).toBeInTheDocument()
    expect(screen.getByText('Archivées')).toBeInTheDocument()
    expect(screen.queryByText(/·\s*0\b/)).not.toBeInTheDocument()
  })

  it('ne montre pas de résumé chiffré sans aucune liste — pas de faux zéro au-dessus de l’état vide', async () => {
    mockApi({ lists: [] })
    renderContent('u-empty')
    await screen.findByText('Aucune liste pour l’instant')
    await expand()
    expect(screen.queryByText(/contact prêt/)).not.toBeInTheDocument()
  })

  it('propose « Découvrir de nouvelles pistes » vers /discover (#2156.54)', async () => {
    mockApi()
    renderContent()
    await expand()
    const link = await screen.findByRole('link', { name: 'Découvrir de nouvelles pistes' })
    expect(link.getAttribute('href')).toBe('/discover')
  })

  it('propose « Demander à Laura » — une amorce, jamais un second copilote (#2156.53)', async () => {
    mockApi()
    renderContent()
    await expand()
    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, l'amorce ouvre la bulle SUR PLACE : un bouton, plus un lien.
    expect(await screen.findByRole('button', { name: 'Demander à Laura' })).toBeInTheDocument()
  })
})

describe('Mes cibles — la carte de la liste (#2156.35-.39/.63/.65/.66)', () => {
  it('propose les 7 statuts de LISTE dans l’ordre du parcours, et écrit le changement (#2156.34-.40)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    const select = await screen.findByRole('combobox', { name: 'Statut de la liste — Banques régionales — T4' })
    expect(select).toHaveTextContent('En cours')
    await chooseOption(select, 'ready')
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/target-lists/${LIST_ID}`, method: 'PATCH', body: { status: 'ready' } }),
      ),
    )
  })

  it('affiche le responsable et l’origine de la liste (#2156.63)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    // #2156.63 — owner_user_id null : « Personne », jamais un blanc.
    expect(screen.getByText('Responsable de la liste : Personne')).toBeInTheDocument()
    expect(screen.getByText('Origine : Ajout manuel')).toBeInTheDocument()
  })

  it('affiche la progression et la fraîcheur de la liste (#2156.65)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    // counts dérivés des 2 éléments vivants du double : 0 prêt à contacter sur 2.
    expect(screen.getByText('0 sur 2 prêts à contacter')).toBeInTheDocument()
    // Les deux éléments du double ont `refreshed_at: null` — jamais revérifiée.
    expect(screen.getByText('Fraîcheur : jamais revérifiée')).toBeInTheDocument()
  })

  it('affiche et permet d’écrire la prochaine action de la LISTE, distincte de celle d’un élément (#2156.66)', async () => {
    mockApi()
    renderContent()
    await openDetail()
    const next = await screen.findByRole('textbox', { name: 'Prochaine action de la liste — Banques régionales — T4' })
    expect((next as HTMLInputElement).value).toBe('')
    fireEvent.change(next, { target: { value: 'Relancer la liste jeudi' } })
    fireEvent.blur(next)
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/target-lists/${LIST_ID}`,
          method: 'PATCH',
          body: { next_action: 'Relancer la liste jeudi' },
        }),
      ),
    )
  })
})

describe('Mes cibles — le sélecteur de vues (#2156.56-.60)', () => {
  // #2405.3 — `useTargetLists` porte un `staleTime` de 30s et le `QueryClient`
  // du harnais est un singleton PARTAGÉ par tout le fichier (voir
  // `renderWithRouter.tsx`). « Partagées avec moi » a BESOIN du MÊME id
  // visiteur ('u1') que `created_by` des 4 autres doubles de ce bloc pour
  // vérifier qu'elles s'EXCLUENT (2156.58) — donc un reset LOCAL du cache
  // avant chaque test de ce bloc, plutôt qu'un id jetable par scénario.
  beforeEach(() => resetTestQueryClient())

  it('« Toutes » (par défaut) montre les 5 listes, quel que soit leur statut', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    expect(await screen.findByText('Vue Actives')).toBeInTheDocument()
    expect(screen.getByText('Vue À préparer')).toBeInTheDocument()
    expect(screen.getByText('Vue Partagée')).toBeInTheDocument()
    expect(screen.getByText('Vue Terminée')).toBeInTheDocument()
    expect(screen.getByText('Vue Archivée')).toBeInTheDocument()
  })

  it('« Actives » ne montre que le statut in_progress (#2156.56)', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    await screen.findByText('Vue Actives')
    fireEvent.click(screen.getByRole('button', { name: /^Actives/ }))
    expect(screen.getByText('Vue Actives')).toBeInTheDocument()
    expect(screen.queryByText('Vue À préparer')).not.toBeInTheDocument()
    expect(screen.queryByText('Vue Partagée')).not.toBeInTheDocument()
    expect(screen.queryByText('Vue Terminée')).not.toBeInTheDocument()
    expect(screen.queryByText('Vue Archivée')).not.toBeInTheDocument()
  })

  it('« À préparer » montre to_qualify ET ready (#2156.57)', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    await screen.findByText('Vue Actives')
    fireEvent.click(screen.getByRole('button', { name: /^À préparer/ }))
    expect(screen.getByText('Vue À préparer')).toBeInTheDocument()
    expect(screen.queryByText('Vue Actives')).not.toBeInTheDocument()
  })

  it('« Partagées avec moi » montre une liste `workspace` créée par un AUTRE membre (#2156.58)', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    await screen.findByText('Vue Actives')
    fireEvent.click(screen.getByRole('button', { name: /^Partagées avec moi/ }))
    expect(screen.getByText('Vue Partagée')).toBeInTheDocument()
    expect(screen.queryByText('Vue Actives')).not.toBeInTheDocument()
  })

  it('« Terminées » montre le statut done (#2156.59)', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    await screen.findByText('Vue Actives')
    fireEvent.click(screen.getByRole('button', { name: /^Terminées/ }))
    expect(screen.getByText('Vue Terminée')).toBeInTheDocument()
    expect(screen.queryByText('Vue Actives')).not.toBeInTheDocument()
  })

  it('« Archivées » montre le statut archived (#2156.60)', async () => {
    mockApi(VIEW_LISTS)
    renderContent('u1')
    await screen.findByText('Vue Actives')
    fireEvent.click(screen.getByRole('button', { name: /^Archivées/ }))
    expect(screen.getByText('Vue Archivée')).toBeInTheDocument()
    expect(screen.queryByText('Vue Actives')).not.toBeInTheDocument()
  })
})

describe('Mes cibles — bascule vue tableau (#2156.67)', () => {
  // #2405.3 — même raison que le bloc « sélecteur de vues » : le cache du
  // QueryClient partagé survivrait sinon au bloc précédent.
  beforeEach(() => resetTestQueryClient())

  it('propose une bascule vers une vue tableau, cartes par défaut', async () => {
    mockApi()
    renderContent()
    await screen.findByText('Banques régionales — T4')
    expect(screen.getByRole('heading', { level: 3, name: 'Banques régionales — T4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vue tableau' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vue cartes' })).toBeInTheDocument()
  })

  it('bascule en tableau : une ligne par liste avec nom, statut, responsable et action suivante', async () => {
    mockApi()
    renderContent()
    await screen.findByText('Banques régionales — T4')
    fireEvent.click(screen.getByRole('button', { name: 'Vue tableau' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: fr.table.headerName })).toBeInTheDocument()
    const row = screen.getByText('Banques régionales — T4').closest('tr')
    expect(row).not.toBeNull()
    expect(screen.getByRole('combobox', { name: 'Statut de la liste — Banques régionales — T4' })).toHaveTextContent(
      'En cours',
    )
    // #2156.67 — le détail par élément (objectif, ajout d'un compte/contact) n'a
    // pas sa place dans un survol dense : il reste réservé à la vue cartes.
    expect(screen.queryByText('Objectif : Décrocher 3 rendez-vous DSI')).not.toBeInTheDocument()
  })

  it('revenir en vue cartes restaure le détail complet de la liste', async () => {
    mockApi()
    renderContent()
    await screen.findByText('Banques régionales — T4')
    fireEvent.click(screen.getByRole('button', { name: 'Vue tableau' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Vue cartes' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Banques régionales — T4' })).toBeInTheDocument()
    // le détail par élément (ici masqué en tableau) est de retour.
    expect(screen.getByText('Objectif : Décrocher 3 rendez-vous DSI')).toBeInTheDocument()
  })

  it('la vue tableau ne prétend jamais mesurer une progression non chargée', async () => {
    mockApi({
      lists: [
        buildList({ id: 'v-gap', name: 'Vue Non Mesurée', counts: { measured: false, gap: 'items_not_loaded' } }),
      ],
    })
    renderContent()
    await screen.findByText('Vue Non Mesurée')
    fireEvent.click(screen.getByRole('button', { name: fr.cta.viewTable }))
    const row = (await screen.findByRole('cell', { name: 'Vue Non Mesurée' })).closest('tr')
    expect(row).not.toBeNull()
    // #2156.74/GA-18/GA-19 — un compteur non chargé se NOMME, jamais « 0 ».
    expect(row).toHaveTextContent('éléments non chargés')
  })
})

describe('Mes cibles — reste utilisable avec 50 listes (#2156.74)', () => {
  beforeEach(() => resetTestQueryClient())

  it('affiche les 50 cartes sans troncature ni comportement dégradé', async () => {
    const many = {
      lists: Array.from({ length: 50 }, (_, index) =>
        buildList({ id: `bulk-${index}`, name: `Liste ${index}`, status: 'in_progress', created_by: 'u1' }),
      ),
    }
    mockApi(many)
    renderContent('u1')
    await screen.findByText('Liste 0')
    expect(screen.getByText('Liste 49')).toBeInTheDocument()
    // #2151.60 — la Veille porte aussi un h2 (« Ce qui bouge sur tes cibles ») :
    // on compte les titres de LISTE, pas tous les h2 de l'écran.
    expect(screen.getAllByRole('heading', { level: 3, name: /^Liste \d+$/ })).toHaveLength(50)
  })
})

describe('Mes cibles — reste utile à toute échelle (#2156.74)', () => {
  beforeEach(() => resetTestQueryClient())

  it('une seule liste : la page reste normale, pas d’état vide', async () => {
    mockApi({ lists: [buildList({ id: 'solo', name: 'Liste Solo' })] })
    renderContent()
    expect(await screen.findByText('Liste Solo')).toBeInTheDocument()
    expect(screen.queryByText(fr.empty.title)).not.toBeInTheDocument()
  })

  it('cinquante listes : tout s’affiche, les vues filtrent toujours correctement', async () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      buildList({ id: `bulk-${i}`, name: `Cible ${i}`, status: i % 2 === 0 ? 'in_progress' : 'done' }),
    )
    mockApi({ lists: many })
    renderContent()
    await screen.findByText('Cible 0')
    expect(screen.getByText('Cible 49')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Actives/ }))
    // Les 25 `in_progress` restent, les 25 `done` disparaissent.
    expect(screen.getByText('Cible 0')).toBeInTheDocument()
    expect(screen.queryByText('Cible 1')).not.toBeInTheDocument()
  })
})

/**
 * Théo B c2-mes-listes — la STRUCTURE : titre et phrase, type de liste (Contacts · N / Comptes · N), vues
 * de statut comptées, grille de cartes (nom, phrase, compte, « Ouvrir ») ; renommer et « supprimer la liste
 * uniquement » passent par leurs fenêtres. Ce test sait dire NON : une carte qui redevient le détail
 * complet, un type qui disparaît ou une suppression sans confirmation le font tomber.
 */
describe('Théo B c2-mes-listes — la grille de cartes', () => {
  beforeEach(() => resetTestQueryClient())

  it('titre, phrase, type de liste et une carte par liste avec son compte et « Ouvrir »', async () => {
    mockApi()
    renderContent()
    expect(await screen.findByRole('heading', { level: 2, name: 'Tes sélections de travail' })).toBeInTheDocument()
    expect(screen.getByText(fr.lists.subtitle)).toBeInTheDocument()
    const type = await screen.findByRole('group', { name: 'Type de liste' })
    expect(type).toHaveTextContent('Contacts · 1')
    expect(type).toHaveTextContent('Comptes · 1')
    const tiles = screen.getAllByTestId('target-list-tile')
    expect(tiles).toHaveLength(1)
    expect(tiles[0]).toHaveTextContent('Banques régionales — T4')
    expect(tiles[0]).toHaveTextContent('Objectif : Décrocher 3 rendez-vous DSI')
    expect(tiles[0]).toHaveTextContent(/1\s*compte · 1 contacts/)
    // La carte n'est pas le détail : aucune ligne d'élément éditable tant qu'on n'a pas ouvert.
    expect(screen.queryByRole('textbox', { name: 'Action suivante — Banque Alpha' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sélectionner des contacts' }).getAttribute('href')).toBe('/contacts')
  })

  it('renommer écrit le nom et la description par le PATCH de la liste', async () => {
    mockApi()
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Renommer la liste Banques régionales — T4' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renommer la liste' })
    fireEvent.change(dialog.querySelector('input') as HTMLInputElement, { target: { value: 'Banques — T1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: `/target-lists/${LIST_ID}`,
          method: 'PATCH',
          body: { name: 'Banques — T1', objective: 'Décrocher 3 rendez-vous DSI' },
        }),
      ),
    )
  })

  it('« Supprimer la liste uniquement » dit que les fiches restent, et ne part qu’après confirmation', async () => {
    mockApi()
    renderContent()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Supprimer la liste Banques régionales — T4 uniquement' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer la liste uniquement ?' })
    expect(dialog).toHaveTextContent('Ses fiches restent dans le répertoire')
    expect(apiFetch.mock.calls.some(call => (call[0] as FetchArgs).method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la liste' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/target-lists/${LIST_ID}`, method: 'DELETE' }),
      ),
    )
  })

  it('« Plus d’actions » ouvre le détail ou archive la liste (C2.A2)', async () => {
    mockApi()
    renderContent()
    const more = await screen.findByRole('button', { name: 'Plus d’actions sur Banques régionales — T4' })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archiver la liste' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: `/target-lists/${LIST_ID}`, method: 'PATCH', body: { status: 'archived' } }),
      ),
    )
  })

  it('une liste archivée se ressort, sans renommer ni supprimer', async () => {
    mockApi({ lists: [buildList({ id: 'arch', name: 'Salon Data 2025', status: 'archived' })] })
    renderContent()
    fireEvent.click(await screen.findByRole('button', { name: 'Ressortir' }))
    expect(screen.queryByRole('button', { name: /Renommer la liste Salon/ })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/target-lists/arch', method: 'PATCH', body: { status: 'in_progress' } }),
      ),
    )
  })
})
