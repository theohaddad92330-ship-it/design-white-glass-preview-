/**
 * #1795 / #1808 / #1809 / #1813 — LE PATRON PARTAGÉ.
 *
 * Quatre retours en trente minutes disaient la même chose sur quatre écrans
 * (`/accounts`, `/pilotage/qualite`, `/team`, `/dashboard`) : replié par
 * défaut, à l'arrivée ET après un rafraîchissement. Ce fichier teste le SEUL
 * endroit où ce comportement est écrit (GA-26) — copié sur `showSimilar` de
 * Découvrir (`apps/web/src/features/discover/view/Discover.tsx:147`) : un
 * `useState(false)`, jamais lu depuis `localStorage` ni l'URL, donc jamais
 * restauré ouvert par un rafraîchissement.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollapsedSection } from './CollapsedSection'

describe('CollapsedSection — repliée par défaut, à CHAQUE montage', () => {
  it('ne rend PAS son contenu au premier rendu', () => {
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    // Patron JSX conditionnel (`{open && <X/>}`) : le contenu est ABSENT du
    // DOM, pas seulement masqué par une classe — sûr par construction, jamais
    // le piège `hidden` + `display` qui rouvre une feuille de style.
    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()
  })

  it('porte un en-tête qui est un VRAI bouton, avec aria-expanded à false', () => {
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    const toggle = screen.getByRole('button', { name: 'Section de test' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('type', 'button')
  })

  it('un clic déplie la section, et le geste tient tant qu’on reste sur l’écran', async () => {
    const user = userEvent.setup()
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    await user.click(screen.getByRole('button', { name: 'Section de test' }))

    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section de test' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('atteignable au clavier : Entrée sur l’en-tête déplie, comme un clic', async () => {
    const user = userEvent.setup()
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    await user.tab()
    expect(screen.getByRole('button', { name: 'Section de test' })).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
  })

  it('replié n’est pas retiré : refermer laisse le contenu ré-ouvrable, rien n’a disparu pour de bon', async () => {
    const user = userEvent.setup()
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    const toggle = screen.getByRole('button', { name: 'Section de test' })
    await user.click(toggle)
    expect(screen.getByText('Contenu secret')).toBeInTheDocument()

    await user.click(toggle)
    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()

    await user.click(toggle)
    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
  })

  it('un rafraîchissement (un MONTAGE NEUF) ne restaure jamais un état déplié — aucune lecture localStorage ni URL', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Section de test' }))
    expect(screen.getByText('Contenu secret')).toBeInTheDocument()

    // Un refresh démonte tout l'arbre React et le remonte à neuf : c'est ce
    // qu'un `useState` non persisté ne peut PAS survivre, contrairement à
    // `localStorage` — exactement ce que Louis a explicitement exclu.
    unmount()
    render(
      <CollapsedSection title="Section de test">
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section de test' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('affiche une description et un badge même repliée — la vue d’ensemble sans tout ouvrir', () => {
    render(
      <CollapsedSection title="Section de test" description="Ce que la section contient" badge={<span>3</span>}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(screen.getByText('Ce que la section contient')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})

/**
 * #1796.1 — LE MODE CONTRÔLÉ, FACULTATIF.
 *
 * Découvrir doit refermer son rail de recherche depuis `runSearch`, un geste
 * extérieur au bouton d'en-tête — ce que le `useState` interne ne permettait
 * pas. Ces tests couvrent le NOUVEAU comportement ; le describe ci-dessus,
 * inchangé, est la preuve que le mode NON contrôlé (les quatre écrans déjà
 * livrés) ne l'est pas devenu.
 */
describe('CollapsedSection — mode contrôlé (open / onOpenChange)', () => {
  it('`open` piloté par le parent commande le rendu, pas un `useState` interne', () => {
    const { rerender } = render(
      <CollapsedSection title="Section de test" open={true} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section de test' })).toHaveAttribute('aria-expanded', 'true')

    // Le parent referme — SANS aucun clic sur l'en-tête. C'est exactement le
    // geste de `runSearch` sur Découvrir.
    rerender(
      <CollapsedSection title="Section de test" open={false} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Section de test' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('un clic sur l’en-tête ne change PAS l’état lui-même — il notifie `onOpenChange` avec le prochain état', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <CollapsedSection title="Section de test" open={false} onOpenChange={onOpenChange}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    await user.click(screen.getByRole('button', { name: 'Section de test' }))

    expect(onOpenChange).toHaveBeenCalledWith(true)
    // Le parent n'a pas rerendu avec `open={true}` : la section reste fermée,
    // preuve que le clic ne bascule pas de `useState` interne caché.
    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans `open` posé, le composant reste NON contrôlé même avec `onOpenChange` seul', async () => {
    // Un appelant qui ne pose QUE `onOpenChange` (oubli de `open`) ne doit
    // JAMAIS se retrouver piloté malgré lui par une prop `undefined` — ce
    // test casse volontairement l'hypothèse inverse : si `openProp` devenait
    // la source de vérité dès qu'`onOpenChange` existe, ce test échouerait.
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <CollapsedSection title="Section de test" onOpenChange={onOpenChange}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    await user.click(screen.getByRole('button', { name: 'Section de test' }))

    // Non contrôlé : le clic OUVRE réellement, via le `useState` interne.
    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})

/**
 * #3376 — DÉCLENCHEUR EXTERNE (`hideTrigger`), FACULTATIF.
 *
 * Contacts avait sa carte « Filtres » (bouton 44 px pleine largeur, sa propre
 * bordure) coincée entre l'entête et la barre d'outils — « ça prend de la
 * place pour rien » (retour bêta, 30/09/2026). Son déclencheur vit désormais
 * ailleurs (`ContactsIntro`, à côté de « Traiter »), petit ; ce mode retire
 * le bouton d'en-tête d'ici, tout en gardant le CONTENU et le mode contrôlé
 * déjà prouvé ci-dessus.
 */
describe('CollapsedSection — déclencheur externe (hideTrigger)', () => {
  it('replié (`open: false`) : rien dans le DOM — jamais une carte vide', () => {
    const { container } = render(
      <CollapsedSection title="Filtres" hideTrigger open={false} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('déplié (`open: true`) : le contenu apparaît, sans AUCUN bouton d’en-tête', () => {
    render(
      <CollapsedSection title="Filtres" hideTrigger open={true} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    expect(screen.getByText('Contenu secret')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('porte le `title` comme nom accessible de la région, sous l’`id` explicite du déclencheur externe', () => {
    render(
      <CollapsedSection title="Filtres" id="external-panel" hideTrigger open={true} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )

    const region = screen.getByRole('region', { name: 'Filtres' })
    expect(region).toHaveAttribute('id', 'external-panel')
  })

  it('un clic ailleurs sur `onOpenChange` (le déclencheur externe) referme — ce composant suit `open`, il ne le décide plus', () => {
    const { rerender } = render(
      <CollapsedSection title="Filtres" hideTrigger open={true} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )
    expect(screen.getByText('Contenu secret')).toBeInTheDocument()

    rerender(
      <CollapsedSection title="Filtres" hideTrigger open={false} onOpenChange={() => {}}>
        <p>Contenu secret</p>
      </CollapsedSection>,
    )
    expect(screen.queryByText('Contenu secret')).not.toBeInTheDocument()
  })
})

// #4965.3 — revient sur #4399 (arbitrage Louis 31/10) : POUR LES SECTIONS QUI LE DEMANDENT (`persistKey`), le pli est mémorisé.
describe('CollapsedSection — #4965.3 état mémorisé par section (persistKey)', () => {
  beforeEach(() => window.localStorage.clear())

  it('replier puis remonter la section : l’état est retrouvé', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CollapsedSection title="Historique" persistKey="test.history">
        <p>Corps</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Historique' }))
    unmount()
    render(
      <CollapsedSection title="Historique" persistKey="test.history">
        <p>Corps</p>
      </CollapsedSection>,
    )
    expect(screen.getByText('Corps')).toBeInTheDocument()
  })

  it('une section ouverte par défaut, repliée par l’utilisateur, reste repliée au retour', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CollapsedSection title="Sources" persistKey="test.sources" defaultOpen>
        <p>Corps</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Sources' }))
    unmount()
    render(
      <CollapsedSection title="Sources" persistKey="test.sources" defaultOpen>
        <p>Corps</p>
      </CollapsedSection>,
    )
    expect(screen.queryByText('Corps')).not.toBeInTheDocument()
  })

  it('deux sections ne partagent pas leur état (une clé par section)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CollapsedSection title="A" persistKey="test.a">
        <p>Corps</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'A' }))
    unmount()
    render(
      <CollapsedSection title="B" persistKey="test.b">
        <p>Corps</p>
      </CollapsedSection>,
    )
    expect(screen.queryByText('Corps')).not.toBeInTheDocument()
  })

  it('sans persistKey, rien n’est écrit ni lu (le contrat #4399 tient pour les autres écrans)', async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CollapsedSection title="Libre">
        <p>Corps</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Libre' }))
    unmount()
    expect(window.localStorage.length).toBe(0)
    render(
      <CollapsedSection title="Libre">
        <p>Corps</p>
      </CollapsedSection>,
    )
    expect(screen.queryByText('Corps')).not.toBeInTheDocument()
  })

  it('un stockage qui lève ne casse pas la section', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <CollapsedSection title="Bloqué" persistKey="test.blocked">
        <p>Corps</p>
      </CollapsedSection>,
    )
    await user.click(screen.getByRole('button', { name: 'Bloqué' }))
    expect(screen.getByText('Corps')).toBeInTheDocument()
    spy.mockRestore()
  })
})
