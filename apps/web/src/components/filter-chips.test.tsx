import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FilterChips } from '@bellum/ui'

/**
 * LE composant de rangée de filtres — décision « F4 » du 01/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'IL REMPLACE
 * ─────────────────────────────────────────────────────────────────────────
 * Trois familles visuelles cohabitaient sur trente écrans, sans rien
 * partager :
 *   A. `<Button variant={actif ? 'default' : 'outline'}>` — h-7 ou h-8 selon
 *      l'appelant, compteur en `<Badge>` (Vivier, À réveiller, Besoins…) ;
 *   B. un `<button>` maison `rounded-full` dont l'actif est un `color-mix`
 *      à 16 % (Contacts, Veille…) ;
 *   C. un `<button>` maison `h-8 rounded-[6px]` dont la palette passe par un
 *      `style` en ligne (Découvrir).
 *
 * Aucune ne connaissait la hauteur des deux autres. C'est ce que Louis a vu
 * en recette : « c'est le deuxième ou troisième différent que je vois sur
 * tout le SaaS. »
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES QUE CE COMPOSANT PORTE, ET QUI SE VÉRIFIENT ICI
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Un compte non mesuré n'affiche RIEN, jamais « 0 ».** C'est la doctrine
 *    du dépôt appliquée à une pastille : un « 0 » affiché pendant le
 *    chargement se lit « il n'y en a aucun », ce qui est une conclusion que
 *    la donnée n'autorise pas. `count: undefined` ⇒ pas de chiffre ;
 *    `count: 0` ⇒ un vrai zéro, mesuré, affiché.
 * ⚠️ CE TEST VIT DANS `apps/web` ET NON À CÔTÉ DU COMPOSANT : `packages/ui`
 * n'a ni vitest ni `@testing-library/react`, donc un test posé là-bas ne
 * s'exécuterait nulle part — le défaut n°1 du dépôt appliqué à un test. Le
 * poser ici a un second mérite : il importe depuis `@bellum/ui`, donc il
 * vérifie aussi que le composant est bel et bien EXPORTÉ.
 *
 * 2. **Le remplissage actif est `primary-500` dans les DEUX thèmes.** Le
 *    réflexe serait de prendre l'accent du thème (`primary-300` en sombre),
 *    mais celui-ci est calibré comme couleur de TEXTE : en fond, sous du
 *    blanc, il donne 2,85:1. `primary-500` + `--bellum-on-primary` donne
 *    6,37:1 des deux côtés.
 */

afterEach(cleanup)

const SEGMENTS = [
  { value: 'soon', label: 'Bientôt disponibles', count: 1 },
  { value: 'dormant', label: 'Dormants', count: 0 },
  { value: 'revalidate', label: 'À revalider', count: 17 },
  { value: 'unknown', label: 'Jamais positionnés' },
] as const

describe('FilterChips — la rangée de filtres du produit', () => {
  it('rend une pastille par option, dans un groupe NOMMÉ', () => {
    render(<FilterChips ariaLabel="Segments du vivier" options={SEGMENTS} value="soon" onChange={vi.fn()} />)

    // Le groupe porte un nom : sans lui, un lecteur d'écran annonce quatre
    // boutons sans dire de quoi ils filtrent.
    expect(screen.getByRole('group', { name: 'Segments du vivier' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('dit lequel est actif par `aria-pressed`, et un seul à la fois', () => {
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="revalidate" onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /À revalider/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Dormants/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('affiche un compte MESURÉ, y compris quand il vaut zéro', () => {
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value={null} onChange={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Bientôt disponibles/ })).toHaveTextContent('1')
    // Un zéro mesuré est un fait : il s'affiche.
    expect(screen.getByRole('button', { name: /Dormants/ })).toHaveTextContent('0')
  })

  it('n’affiche AUCUN chiffre pour un compte non mesuré — jamais « 0 »', () => {
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value={null} onChange={vi.fn()} />)

    const chip = screen.getByRole('button', { name: /Jamais positionnés/ })
    expect(chip).toHaveTextContent('Jamais positionnés')
    expect(chip.textContent).not.toMatch(/\d/)
  })

  it('remonte le choix au clic', async () => {
    const onChange = vi.fn()
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Dormants/ }))
    expect(onChange).toHaveBeenCalledWith('dormant')
  })

  it('déselectionne au second clic quand `clearable` est posé', async () => {
    const onChange = vi.fn()
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={onChange} clearable />)

    await userEvent.click(screen.getByRole('button', { name: /Bientôt disponibles/ }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('ne déselectionne PAS sans `clearable` — une vue par défaut existe toujours', async () => {
    // Les vues de Contacts ou les segments du vivier ont toujours une
    // sélection : « aucune » n'y veut rien dire, et un clic sur l'onglet
    // courant ne doit pas vider l'écran.
    const onChange = vi.fn()
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Bientôt disponibles/ }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('se tabule et s’active au clavier — ce sont de vrais boutons', async () => {
    const onChange = vi.fn()
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={onChange} />)

    await userEvent.tab()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: /Dormants/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('dormant')
  })

  it('porte le plancher tactile de 44 px sous un pointeur grossier (GA-30)', () => {
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={vi.fn()} />)

    for (const chip of screen.getAllByRole('button')) {
      expect(chip.className).toContain('pointer-coarse:min-h-11')
    }
  })

  it('n’écrit AUCUNE couleur en dur — tout passe par les tokens (GA-248)', () => {
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={vi.fn()} />)

    for (const chip of screen.getAllByRole('button')) {
      expect(chip.className).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      expect(chip.getAttribute('style')).toBeNull()
    }
  })

  it('remplit l’actif avec `primary-500`, pas avec l’accent du thème', () => {
    // La mesure derrière ce test : `--bellum-text-accent` vaut `primary-300`
    // en sombre ; en FOND, sous du blanc, il donne 2,85:1. Le composant doit
    // donc viser `--bellum-primary-500` explicitement, et son texte
    // `--bellum-on-primary`.
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={vi.fn()} />)

    const actif = screen.getByRole('button', { name: /Bientôt disponibles/ })
    expect(actif.className).toContain('bg-[var(--bellum-primary-500)]')
    expect(actif.className).toContain('text-[var(--bellum-on-primary)]')
    expect(actif.className).not.toContain('--bellum-text-accent')
  })

  it('pose le repos sur un FOND, pas sur un contour porteur', () => {
    // Décision Q2 du 01/09 : sur fond blanc, une bordure à 1,27:1 ne peut pas
    // être la seule chose qui dit « ceci est un contrôle » (WCAG 1.4.11 exige
    // 3:1). Un fond répond à la question sans durcir le trait.
    //
    // #1824 (09/09/2026) — ce test épinglait `--bellum-surface-2`, et il a eu
    // raison de tomber : ce creux avait été calibré pour un contrôle posé sur
    // une CARTE. Sur la page nue il donnait 1,03:1 en clair et 1,30:1 en
    // sombre — mesuré en production, le bouton « Tableau » de /projects se
    // lisait comme un blanc. La règle que ce test défend n'a pas changé (le
    // repos porte un FOND) ; c'est le token qui la sert qui change, et il est
    // désormais nommé pour ça.
    render(<FilterChips ariaLabel="Segments" options={SEGMENTS} value="soon" onChange={vi.fn()} />)

    const repos = screen.getByRole('button', { name: /Dormants/ })
    expect(repos.className).toContain('bg-[var(--bellum-chip-rest)]')
    expect(repos.className).toContain('text-[var(--bellum-chip-rest-text)]')
    // Le creux d'avant ne doit plus servir de fond de pastille nulle part.
    expect(repos.className).not.toContain('bg-[var(--bellum-surface-2)]')
  })

  describe('mode multiple', () => {
    it('accepte plusieurs pastilles actives et remonte chaque bascule', async () => {
      // La Veille combine ses facettes : « nouveaux » ET « prioritaires » est
      // une question courante, et deux onglets exclusifs n'y répondaient pas.
      const onToggle = vi.fn()
      render(
        <FilterChips
          ariaLabel="Facettes"
          options={SEGMENTS}
          multiple
          values={['soon', 'dormant']}
          onToggle={onToggle}
        />,
      )

      const actifs = screen.getAllByRole('button').filter(b => b.getAttribute('aria-pressed') === 'true')
      expect(actifs).toHaveLength(2)

      await userEvent.click(screen.getByRole('button', { name: /À revalider/ }))
      expect(onToggle).toHaveBeenCalledWith('revalidate')
    })

    it('bascule aussi une pastille DÉJÀ active — c’est le retrait du filtre', async () => {
      const onToggle = vi.fn()
      render(<FilterChips ariaLabel="Facettes" options={SEGMENTS} multiple values={['soon']} onToggle={onToggle} />)

      await userEvent.click(screen.getByRole('button', { name: /Bientôt disponibles/ }))
      expect(onToggle).toHaveBeenCalledWith('soon')
    })
  })

  it('ne rend RIEN plutôt qu’un groupe vide quand il n’y a pas d’option', () => {
    // Une rangée de filtres vide occupe une hauteur et ne dit rien. Elle
    // laissait une bande grise sur les écrans dont les facettes dépendent
    // d'une donnée absente.
    const { container } = render(<FilterChips ariaLabel="Segments" options={[]} value={null} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('#2979 — « voir plus » : une rangée longue ne mange pas le panneau', () => {
    const MANY = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Agence ${i}`, count: i }))
    const collapse = { after: 4, moreLabel: (n: number) => `Voir ${n} de plus`, lessLabel: 'Voir moins' }

    it('montre les 4 premières pastilles et un bouton « Voir 8 de plus »', async () => {
      render(<FilterChips ariaLabel="BU" options={MANY} value={null} onChange={vi.fn()} collapse={collapse} />)
      expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(4)
      await userEvent.click(screen.getByRole('button', { name: 'Voir 8 de plus' }))
      expect(screen.getByRole('button', { name: /Agence 11/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Voir moins' })).toBeInTheDocument()
    })

    it('une pastille ACTIVE reste visible même au-delà du seuil', () => {
      render(<FilterChips ariaLabel="BU" options={MANY} value="v10" onChange={vi.fn()} collapse={collapse} />)
      expect(screen.getByRole('button', { name: /Agence 10/, pressed: true })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Agence 9/ })).toBeNull()
    })

    it('⚠️ SAIT DIRE NON — sous le seuil, ni repli ni bouton ; et sans `collapse`, tout est rendu comme avant', () => {
      const { rerender } = render(
        <FilterChips ariaLabel="BU" options={MANY.slice(0, 4)} value={null} onChange={vi.fn()} collapse={collapse} />,
      )
      expect(screen.queryByRole('button', { name: /de plus/ })).toBeNull()
      rerender(<FilterChips ariaLabel="BU" options={MANY} value={null} onChange={vi.fn()} />)
      expect(screen.getAllByRole('button')).toHaveLength(12)
    })
  })
})
