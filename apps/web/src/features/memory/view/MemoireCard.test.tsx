import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PinnedFact } from '@/features/memory/api'
import { chooseOption } from '@/test/select'

const pinMutate = vi.fn()
const memoryAdded = vi.hoisted(() => vi.fn())
let facts: PinnedFact[] = []

// #1918.2 / #1918.5 — les portées PROPOSABLES sont lues par l'API (les
// périmètres que la personne porte) : ces suites montent le composant sans
// fournisseur, et le défaut rendu ici est celui du contrat sans contexte —
// les deux portées durables, exactement ce que l'écran offrait avant ce lot.
vi.mock('@/features/memory/hooks/useMemoryScopeOptions', () => ({
  useMemoryScopeOptions: () => [{ scope: 'user' }, { scope: 'workspace' }],
}))
// #1946.11 — le traceur, doublé pour OBSERVER (la vraie implémentation est inerte sans sa variable).
vi.mock('@/lib/product-tracker', () => ({ trackMemoryAdded: memoryAdded }))
vi.mock('@/features/memory/hooks/usePinnedFacts', () => ({
  usePinnedFacts: () => ({ data: facts, isLoading: false, isError: false }),
}))
vi.mock('@/features/memory/hooks/usePinFact', () => ({
  usePinFact: () => ({ mutate: pinMutate, isPending: false }),
}))
vi.mock('@/features/memory/hooks/useUnpinFact', () => ({
  useUnpinFact: () => ({ mutate: vi.fn(), isPending: false }),
}))

const { MemoireCard } = await import('./MemoireCard')

const item = (over: Partial<PinnedFact>): PinnedFact => ({
  id: 'm-1',
  fact: 'Budget IT voté',
  accountId: null,
  kind: 'fact',
  origin: 'manual',
  scope: 'workspace',
  ownedByMe: true,
  canForget: true,
  expiresAt: null,
  createdAt: '2026-07-23T08:00:00.000Z',
  ...over,
})

/**
 * L'objet MemoryItem complet (restitution V2 §20) vu de l'écran : on choisit la
 * NATURE et, si on veut, une ÉCHÉANCE. Rien n'est affiché pour les valeurs par
 * défaut — un badge « Fait / Épinglé à la main » n'apprendrait rien.
 */
describe('MemoireCard — nature, origine, échéance (V2 §20)', () => {
  beforeEach(() => {
    pinMutate.mockReset()
    facts = []
  })

  it('pins a plain fact with no deadline by default (comportement historique)', () => {
    render(<MemoireCard accountId={null} />)
    fireEvent.change(screen.getByLabelText('Épingler un fait à la mémoire'), { target: { value: 'DSI = décideur' } })
    fireEvent.click(screen.getByLabelText('Épingler'))

    expect(pinMutate).toHaveBeenCalledWith(
      // #1917.3 — la portée part TOUJOURS, choisie : « toi uniquement » par défaut.
      // #1918.2 / #1918.5 — rien n'est DÉSIGNÉ : ni périmètre, ni fil.
      {
        fact: 'DSI = décideur',
        accountId: null,
        kind: 'fact',
        expiresAt: null,
        scope: 'user',
        businessUnitId: null,
        conversationId: null,
      },
      expect.anything(),
    )
  })

  /**
   * #1946.11 / #3775.4 — l'épinglage rapide a quitté la barre : le geste « ajouter » vit ICI, et c'est ici que la
   * mesure se tient. Au SUCCÈS seulement, et l'écran seul — jamais le fait.
   */
  it('#1946.11 — un ajout RÉUSSI dit l’écran, jamais le fait épinglé', () => {
    memoryAdded.mockClear()
    pinMutate.mockImplementation((_input: unknown, options: { onSuccess?: () => void }) => options.onSuccess?.())
    render(<MemoireCard accountId={null} />)
    fireEvent.change(screen.getByLabelText('Épingler un fait à la mémoire'), {
      target: { value: 'Je relance le mardi' },
    })
    fireEvent.click(screen.getByLabelText('Épingler'))
    expect(memoryAdded).toHaveBeenCalledTimes(1)
    expect(memoryAdded).toHaveBeenCalledWith('/chat')
  })

  it('#1946.11 — un ajout qui n’aboutit pas n’émet rien', () => {
    memoryAdded.mockClear()
    pinMutate.mockImplementation(() => {})
    render(<MemoireCard accountId={null} />)
    fireEvent.change(screen.getByLabelText('Épingler un fait à la mémoire'), {
      target: { value: 'Je relance le mardi' },
    })
    fireEvent.click(screen.getByLabelText('Épingler'))
    expect(pinMutate).toHaveBeenCalled()
    expect(memoryAdded).not.toHaveBeenCalled()
  })

  it('#1917.3 — la portée se choisit avant d’épingler, et « Toute ton ESN » part telle quelle', () => {
    render(<MemoireCard accountId={null} />)
    expect(screen.getByRole('radio', { name: 'Toi uniquement' })).toBeChecked()
    fireEvent.change(screen.getByLabelText('Épingler un fait à la mémoire'), {
      target: { value: 'Nous ne proposons jamais de freelance' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Toute ton ESN' }))
    fireEvent.click(screen.getByLabelText('Épingler'))

    expect(pinMutate).toHaveBeenCalledWith(expect.objectContaining({ scope: 'workspace' }), expect.anything())
  })

  it('#1918.1 — chaque ligne dit pour qui elle vaut', () => {
    facts = [
      item({ id: 'm-perso', fact: 'Mon objectif du trimestre', scope: 'user' }),
      item({ id: 'm-esn', fact: 'Jamais de freelance', scope: 'workspace', ownedByMe: false }),
    ]
    render(<MemoireCard accountId={null} />)
    expect(within(pinnedRow('Mon objectif du trimestre')).getByText('Toi uniquement')).toBeInTheDocument()
    expect(within(pinnedRow('Jamais de freelance')).getByText('Toute ton ESN')).toBeInTheDocument()
  })

  /**
   * #1918.7 — un élément PARTAGÉ ne se retire que par son auteur ou un manager.
   * Le serveur calcule `canForget` pour l'appelant et reste la vraie garde ;
   * l'écran n'offre pas un geste qui serait refusé.
   */
  it('#1918.7 — pas de croix sur l’élément partagé d’un collègue quand on n’a pas le droit de le retirer', () => {
    facts = [
      item({ id: 'm-esn', fact: 'Jamais de freelance', scope: 'workspace', ownedByMe: false, canForget: false }),
      item({ id: 'm-mine', fact: 'Ma règle', scope: 'workspace', ownedByMe: true, canForget: true }),
    ]
    render(<MemoireCard accountId={null} />)
    expect(screen.getAllByRole('button', { name: 'Retirer ce fait' })).toHaveLength(1)
    expect(
      within(pinnedRow('Jamais de freelance').parentElement as HTMLElement).queryByRole('button', {
        name: 'Retirer ce fait',
      }),
    ).toBeNull()
  })

  it('#1918.7 — un manager (canForget) garde la croix sur l’élément partagé d’un collègue', () => {
    facts = [item({ id: 'm-esn', fact: 'Jamais de freelance', scope: 'workspace', ownedByMe: false, canForget: true })]
    render(<MemoireCard accountId={null} />)
    expect(screen.getByRole('button', { name: 'Retirer ce fait' })).toBeInTheDocument()
  })

  it('une ligne venue d’une API plus ancienne (sans portée) n’affiche AUCUNE portée devinée', () => {
    const legacy = { ...item({ fact: 'Ligne ancienne' }) } as Partial<PinnedFact>
    delete legacy.scope
    facts = [legacy as PinnedFact]
    render(<MemoireCard accountId={null} />)
    const row = within(pinnedRow('Ligne ancienne'))
    expect(row.queryByText('Toi uniquement')).not.toBeInTheDocument()
    expect(row.queryByText('Toute ton ESN')).not.toBeInTheDocument()
  })

  it('lets the user pick the nature and a deadline, sent as the END of that day', async () => {
    render(<MemoireCard accountId="a-1" />)
    fireEvent.change(screen.getByLabelText('Épingler un fait à la mémoire'), { target: { value: 'Pas de régie' } })
    // Le menu n'est plus un `<select>` natif : `fireEvent.change` n'y fait
    // rien du tout — il faut l'OUVRIR puis cliquer l'option. Sans ce geste,
    // le test passait avec la valeur par défaut et croyait vérifier un choix.
    await chooseOption(screen.getByRole('combobox', { name: 'Nature de ce que Bellum retient' }), 'correction')
    fireEvent.change(screen.getByLabelText("Valable jusqu'au (facultatif)"), { target: { value: '2026-08-31' } })
    fireEvent.click(screen.getByLabelText('Épingler'))

    expect(pinMutate).toHaveBeenCalledWith(
      {
        fact: 'Pas de régie',
        accountId: 'a-1',
        kind: 'correction',
        // « valable jusqu'au 31 août » : le 31 compte encore.
        expiresAt: '2026-08-31T23:59:59.999Z',
        // Décision de Louis (12/09) : la CORRECTION D'UN COMPTE vaut par défaut
        // pour tout l'espace — seul cas où le défaut n'est pas « moi ».
        scope: 'workspace',
        // #1918.2 / #1918.5 — rien n'est DÉSIGNÉ : ni périmètre, ni fil.
        businessUnitId: null,
        conversationId: null,
      },
      expect.anything(),
    )
  })

  /**
   * Un fait épinglé est du TEXTE LIBRE : rien n'empêche d'y coller trois
   * phrases. Sans repli, une seule ligne de mémoire poussait le reste de la
   * liste — et le bouton « oublier » — hors de la modale.
   *
   * Le texte reste ENTIER dans le DOM : il est replié (`line-clamp-2`), jamais
   * tronqué. « Voir plus » ne va donc rien rechercher, et un lecteur d'écran
   * lit le fait complet quel que soit l'état du bouton.
   */
  it('replie un fait long à deux lignes, et « Voir plus » le déplie', () => {
    const long = `Le référencement passe par la centrale d'achat du groupe, ${'qui arbitre chaque trimestre '.repeat(4).trim()}`
    facts = [item({ fact: long })]
    render(<MemoireCard accountId={null} />)

    const text = screen.getByText(long)
    expect(text.className).toContain('line-clamp-2')

    fireEvent.click(screen.getByRole('button', { name: 'Voir plus' }))
    expect(screen.getByText(long).className).not.toContain('line-clamp-2')

    fireEvent.click(screen.getByRole('button', { name: 'Voir moins' }))
    expect(screen.getByText(long).className).toContain('line-clamp-2')
  })

  it('un fait court n’a PAS de « Voir plus » — un bouton qui ne masque rien est du bruit', () => {
    facts = [item({ fact: 'Budget IT voté' })]
    render(<MemoireCard accountId={null} />)
    expect(screen.queryByRole('button', { name: 'Voir plus' })).not.toBeInTheDocument()
  })

  /**
   * Le panneau vit dans une MODALE, qui porte déjà le titre. `headless` retire
   * le cadre et l'entête plutôt que d'écrire « Ce que Bellum garde en tête »
   * deux fois de suite (loi 4 du tome 7) — et surtout plutôt que de dupliquer
   * le panneau, ce qui aurait divergé au premier changement.
   */
  it('en mode headless, ni cadre ni titre — mais tout le reste', () => {
    facts = [item({})]
    const { container } = render(<MemoireCard accountId={null} headless />)
    expect(screen.queryByText('Ce que Bellum garde en tête')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Épingler un fait à la mémoire')).toBeInTheDocument()
    expect(screen.getByText('Budget IT voté')).toBeInTheDocument()
    expect(container.querySelector('[class*="rounded-xl"]')).toBeNull()
  })

  it('badges only what SAYS something — nothing for a hand-pinned undated fact', () => {
    facts = [item({})]
    render(<MemoireCard accountId={null} />)

    // Le badge est cherché DANS la ligne du fait : le sélecteur de nature du
    // formulaire porte les mêmes libellés dans ses <option>.
    const row = within(pinnedRow('Budget IT voté'))
    expect(row.queryByText('Fait')).not.toBeInTheDocument()
    expect(row.queryByText('Épinglé à la main')).not.toBeInTheDocument()
  })

  // #1962.22 — Réglages › Mémoire (`MemoryFactRow.tsx`) affiche déjà la date
  // d'enregistrement (`memoryLedger.recordedAt`) ; la modale du chat ne
  // l'affichait pas du tout. Contrairement aux badges de nature/origine, elle
  // ne dépend d'aucune valeur par défaut : elle est toujours montrée.
  it('#1962.22 — la date d’enregistrement est visible, même pour un fait par défaut', () => {
    facts = [item({})]
    render(<MemoireCard accountId={null} />)

    const row = within(pinnedRow('Budget IT voté'))
    expect(row.getByText(/Retenu le/)).toBeInTheDocument()
  })

  it('hides an item whose deadline has passed, even from a stale client cache', () => {
    facts = [item({ id: 'm-old', fact: 'Gel des budgets', expiresAt: '2000-01-01T00:00:00.000Z' }), item({})]
    render(<MemoireCard accountId={null} />)

    expect(screen.queryByText('Gel des budgets')).not.toBeInTheDocument()
    expect(screen.getByText('Budget IT voté')).toBeInTheDocument()
  })

  it('shows the nature, the origin and the deadline when they differ from the defaults', () => {
    // ⚠️ L'échéance est RELATIVE à maintenant, jamais une date en dur.
    //
    // Le composant masque — à raison — un fait dont l'échéance est passée : le
    // test juste au-dessus le PROUVE. Une date fixe transforme donc celui-ci en
    // bombe à retardement, qui explose le jour où elle devient le passé, et qui
    // accuse alors le composant d'un défaut qu'il n'a pas.
    //
    // Mesuré le 01/09/2026 : `2026-08-31` était devenu hier, `main` était rouge,
    // et rien ne l'avait signalé — la CI est sélective, et aucune PR n'avait
    // touché ce dossier depuis.
    const encoreValable = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    facts = [item({ kind: 'preference', origin: 'copilot', expiresAt: encoreValable })]
    render(<MemoireCard accountId={null} />)

    const row = within(pinnedRow('Budget IT voté'))
    expect(row.getByText('Préférence')).toBeInTheDocument()
    expect(row.getByText('Note de Laura — à vérifier')).toBeInTheDocument()
    expect(row.getByText(/Jusqu'au/)).toBeInTheDocument()
  })
})

/** La ligne rendue d'un élément épinglé (le bloc texte + badges). */
function pinnedRow(text: string): HTMLElement {
  const element = screen.getByText(text).parentElement
  if (!element) throw new Error(`no pinned row for "${text}"`)
  return element
}
