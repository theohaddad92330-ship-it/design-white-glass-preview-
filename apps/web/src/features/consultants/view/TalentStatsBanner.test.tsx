import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { stats } = vi.hoisted(() => ({ stats: vi.fn() }))
vi.mock('../hooks', () => ({ useTalentStats: () => stats() }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}))

const { TalentStatsBanner } = await import('./TalentStatsBanner')

const FULL_STATS = {
  total: 7,
  availableNow: 3,
  availabilityUnknownCount: 0,
  enrichedPercent: 71,
  incompleteCount: 4,
  refreshedThisWeekPercent: 42,
  lastUpdatedAt: '2026-08-30T00:00:00.000Z',
}

beforeEach(() => {
  stats.mockReset().mockReturnValue({ data: FULL_STATS, isLoading: false })
})
afterEach(cleanup)

/**
 * #3162 (retour bêta, 28/09/2026) — Louis : « supprime[le dépliable « Voir le
 * détail »], et ajoute les infos au hover sur les petites cases du haut ». Le
 * détail (tendance, complétude, raisons de non-mesure) qui vivait dans les
 * cinq cartes du dépliable se lit désormais au SURVOL — et au FOCUS clavier,
 * puisque le déclencheur (Radix `Tooltip`) répond aux deux — de la pastille
 * qui le concerne. `aria-label` reste le nom accessible court de la
 * pastille (`getByLabelText` la trouve par ce même préfixe, GA-32) ; hover
 * ET focus mènent au même `role="tooltip"` (`findByRole`).
 */
async function hoverPastille(label: string) {
  const trigger = screen.getByLabelText(new RegExp(`^${label} :`))
  await userEvent.hover(trigger)
  return screen.findByRole('tooltip')
}

/**
 * Le bandeau de statistiques du vivier (écran Vivier, PDF-22 §01).
 *
 * ⚠️ AUCUN chiffre ne s'invente : la maquette montre une tendance (« +8% ce
 * mois ») qu'aucune donnée du dépôt ne mesure. La tuile du total le DIT —
 * « état courant, sans historique » — plutôt que de se taire (31/08/2026,
 * second lot).
 */
describe('TalentStatsBanner', () => {
  it('affiche les comptes réels rendus par le serveur', () => {
    render(<TalentStatsBanner />)
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Disponibles maintenant :/)).toHaveTextContent('3')
  })

  // Théo C talents-vivier.R2 — décision Louis 22/10 : « profils enrichis » REVIENT, comme FILTRE cliquable
  // (il avait rejoint Réglages › Mes données le 19/10, #4349 V.1). « Mis à jour » reste dans Réglages.
  it('« Profils enrichis » est une tuile-filtre (total − sous le seuil), « Mis à jour » reste dans Réglages', () => {
    render(<TalentStatsBanner />)
    expect(screen.getByLabelText(/^Profils enrichis :/)).toHaveTextContent('3')
    expect(screen.queryByText('Mis à jour')).not.toBeInTheDocument()
    expect(screen.queryByText('71 %')).not.toBeInTheDocument()
  })

  // #3488 (recette Y20) — « 1 · non mesuré · 0 % · 1 » : quatre pastilles sans libellé.
  it('chaque pastille se NOMME à l’écran, pas seulement à l’infobulle', () => {
    render(<TalentStatsBanner />)
    // KEVIN-FIX K.2 : « Fiches sous le seuil » ; V.1 : enrichis / mis à jour vivent dans Réglages › Mes données.
    for (const label of ['Talents dans le vivier', 'Disponibles maintenant', 'Fiches sous le seuil']) {
      expect(screen.getByText(label)).toBeVisible()
    }
  })

  // #3162 — plus de dépliable : les pastilles portent les chiffres clés dès
  // le premier rendu, et RIEN d'autre n'est masqué derrière un clic.
  describe('pastilles seules, jamais de dépliable (#3162)', () => {
    it('aucun bouton « Voir le détail » — le dépliable a disparu', () => {
      render(<TalentStatsBanner />)
      expect(screen.queryByRole('button', { name: 'Voir le détail' })).not.toBeInTheDocument()
    })

    it('les pastilles portent les chiffres clés sans aucune interaction', () => {
      render(<TalentStatsBanner />)
      expect(screen.getByText('7')).toBeInTheDocument()
      expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('une pastille sans détail supplémentaire (fiches incomplètes) ne porte aucune infobulle', () => {
      render(<TalentStatsBanner />)
      const trigger = screen.getByLabelText(/^Fiches sous le seuil :/)
      // Ni tabulable ni « cursor-help » : rien à révéler, donc rien à déclencher.
      expect(trigger).not.toHaveAttribute('tabindex')
    })

    it('le focus clavier révèle la même infobulle que le survol — GA-32/GA-35', async () => {
      render(<TalentStatsBanner />)
      // Premier élément tabulable de l'écran : la première pastille qui
      // porte une infobulle.
      await userEvent.tab()
      expect(screen.getByLabelText(/^Talents dans le vivier :/)).toHaveFocus()
      expect(await screen.findByRole('tooltip')).toHaveTextContent('état courant, sans historique')
    })
  })

  // #2182.10 — le résumé « Fiches incomplètes » : un COMPTE, jamais un
  // pourcentage — l'écran demande explicitement cette tuile, à côté de
  // « Profils enrichis » qui en est le pourcentage complémentaire.
  it('#2182.10 — affiche le compte des fiches incomplètes', () => {
    render(<TalentStatsBanner />)
    expect(screen.getByLabelText(/^Fiches sous le seuil :/)).toBeInTheDocument()
    // #3162 — plus de carte dupliquant la valeur : la pastille la porte UNE
    // seule fois (loi 4 du tome 7 — rien n'apparaît deux fois sous la même forme).
    expect(screen.getAllByText('4').length).toBe(1)
  })

  // #1800 retirait les favoris (aucune source). Théo C talents-vivier.A12 (Louis 22/10) les rétablit : la tuile
  // les COMPTE quand le serveur répond, et dit « non mesuré » avant — jamais un zéro de chargement.
  it('A12 — la tuile « Profils favoris » compte, ou dit « non mesuré », jamais 0', () => {
    const { rerender } = render(<TalentStatsBanner />)
    expect(screen.getByLabelText(/^Profils favoris :/)).toHaveTextContent('non mesuré')
    rerender(<TalentStatsBanner favoriteCount={2} />)
    expect(screen.getByLabelText(/^Profils favoris :/)).toHaveTextContent('2')
  })

  it('R2 — chaque tuile-filtre pose son filtre, et le retire quand il est déjà posé', async () => {
    const onFilter = vi.fn()
    const chip = (label: string) =>
      within(screen.getByRole('group', { name: `Filtrer le vivier : ${label}` })).getByRole('button')
    const { rerender } = render(<TalentStatsBanner onFilter={onFilter} />)
    await userEvent.click(chip('Disponibles maintenant'))
    expect(onFilter).toHaveBeenLastCalledWith({ derived: 'available' })
    await userEvent.click(chip('Fiches sous le seuil'))
    expect(onFilter).toHaveBeenLastCalledWith({ completeness: 'incomplete' })
    await userEvent.click(chip('Profils favoris'))
    expect(onFilter).toHaveBeenLastCalledWith({ favorite: 'mine' })
    rerender(<TalentStatsBanner onFilter={onFilter} query={{ derived: 'available' }} />)
    const active = chip('Disponibles maintenant')
    expect(active).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(active)
    expect(onFilter).toHaveBeenLastCalledWith({ derived: undefined })
  })

  it('ne rend rien pendant le chargement — jamais un zéro de chargement', () => {
    stats.mockReturnValue({ data: undefined, isLoading: true })
    const { container } = render(<TalentStatsBanner />)
    expect(container.textContent).toBe('')
  })

  it('n’invente AUCUNE tendance — « +8% ce mois » n’apparaît nulle part', () => {
    const { container } = render(<TalentStatsBanner />)
    expect(container.textContent).not.toMatch(/\+\d+\s*%/)
  })

  it('dit « état courant, sans historique » sous le total, plutôt que de se taire', async () => {
    // La maquette montre une tendance sous CETTE tuile précisément. Se taire
    // s'y lirait comme un oubli — l'infobulle porte désormais ce texte
    // honnête du dépôt pour « aucune photo mensuelle, et il n'y en aura
    // jamais une sans un dixième indicateur ».
    render(<TalentStatsBanner />)
    const tooltip = await hoverPastille('Talents dans le vivier')
    expect(tooltip).toHaveTextContent('état courant, sans historique')
  })

  // #1839 — « Disponibles maintenant : 0 » était un zéro ORPHELIN : rien ne
  // disait combien de fiches n'ont aucune affectation enregistrée, donc une
  // disponibilité dérivée non mesurable. Trois cas : mesuré (compagnon à 0,
  // silencieux), partiellement mesuré (compagnon affiché), et le zéro qui en
  // résulte doit rester DISTINGUABLE d'un silence.
  describe('#1839 — le compagnon de « Disponibles maintenant »', () => {
    it('affiche combien de fiches n’ont AUCUNE affectation enregistrée — la disponibilité dérivée non mesurable', () => {
      render(<TalentStatsBanner />)
      // rien à afficher par défaut : `availabilityUnknownCount` vaut 0 dans FULL_STATS
      expect(screen.queryByText(/sans affectation enregistrée/)).not.toBeInTheDocument()
    })

    it('un « 0 disponible » orphelin devient lisible : l’infobulle dit combien de fiches ne sont pas mesurables', async () => {
      // ⚠️ `total` fait partie de la paire : les deux comptes portent sur la
      // MÊME population, donc 20 fiches muettes supposent au moins 20 fiches.
      stats.mockReturnValue({
        data: { ...FULL_STATS, total: 30, availableNow: 0, availabilityUnknownCount: 20 },
        isLoading: false,
      })
      render(<TalentStatsBanner />)
      // La phrase est la MÊME, mais elle est désormais portée par la même
      // dérivation de complétude (`deriveCompleteness`, GA-26), au survol.
      const tooltip = await hoverPastille('Disponibles maintenant')
      expect(tooltip).toHaveTextContent(/20 fiches sans affectation enregistrée — disponibilité non mesurable/)
    })

    it('un vrai zéro reste silencieux : toute la population est mesurable', () => {
      stats.mockReturnValue({
        data: { ...FULL_STATS, availableNow: 0, availabilityUnknownCount: 0 },
        isLoading: false,
      })
      render(<TalentStatsBanner />)
      expect(screen.queryByText(/sans affectation enregistrée/)).not.toBeInTheDocument()
    })

    it('un seul profil non mesurable se dit au singulier', async () => {
      stats.mockReturnValue({
        data: { ...FULL_STATS, availabilityUnknownCount: 1 },
        isLoading: false,
      })
      render(<TalentStatsBanner />)
      const tooltip = await hoverPastille('Disponibles maintenant')
      expect(tooltip).toHaveTextContent(/1 fiche sans affectation enregistrée — disponibilité non mesurable/)
    })

    // #1839, second tour — LE « 0 » RESTE NU, ET SON DÉNOMINATEUR EST AMBIGU.
    //
    // Mesuré en production le 10/09/2026 : « Disponibles maintenant · 0 · 20
    // fiches sans affectation enregistrée » sur 30 talents. « 0 sur les 10
    // fiches mesurables » est VRAI ; « 0 sur 30 » est FAUX — et c'est le
    // second que l'œil lit si le chiffre n'est pas accompagné de son
    // dénominateur. L'infobulle doit donc dire sur COMBIEN elle calcule.
    describe('le dénominateur du chiffre', () => {
      it('dit sur combien de fiches la disponibilité a pu être calculée — jamais un « 0 » nu', async () => {
        stats.mockReturnValue({
          data: { ...FULL_STATS, total: 30, availableNow: 0, availabilityUnknownCount: 20 },
          isLoading: false,
        })
        render(<TalentStatsBanner />)
        const tooltip = await hoverPastille('Disponibles maintenant')
        expect(tooltip).toHaveTextContent('Calculé sur 10 fiches du vivier sur 30 — 33 %.')
      })

      it('NOMME ce qui est sorti du dénominateur, plutôt que de le laisser deviner', async () => {
        stats.mockReturnValue({
          data: { ...FULL_STATS, total: 30, availableNow: 0, availabilityUnknownCount: 20 },
          isLoading: false,
        })
        render(<TalentStatsBanner />)
        // Le dénominateur ET ce qui en est sorti vivent dans la MÊME
        // infobulle, en un seul geste — c'est lui qui empêche de lire
        // « 0 sur 30 » (faux) à la place de « 0 sur 10 » (vrai).
        const tooltip = await hoverPastille('Disponibles maintenant')
        expect(tooltip).toHaveTextContent('Calculé sur 10 fiches du vivier sur 30 — 33 %.')
        expect(tooltip).toHaveTextContent('Hors du calcul : 20 fiches sans affectation enregistrée')
      })

      it('SAIT DIRE NON : quand tout le vivier est mesurable, il n’y a rien à exclure', async () => {
        // FULL_STATS : 7 fiches, 0 muette. La phrase devient « les 7 » — un
        // « 100 % » serait du bruit, et une exclusion vide se lirait comme un
        // défaut d'affichage.
        render(<TalentStatsBanner />)
        const tooltip = await hoverPastille('Disponibles maintenant')
        expect(tooltip).toHaveTextContent('Calculé sur les 7 fiches du vivier.')
        expect(tooltip).not.toHaveTextContent(/Hors du calcul/)
      })
    })

    // Un cran plus loin : quand la population ENTIÈRE se tait, il n'y a plus
    // de dénominateur du tout. Dire « calculé sur 0 fiches sur 30 » sous un
    // grand « 0 » resterait une affirmation sur du vide — un axe non évaluable
    // sort du dénominateur, et quand tous en sortent il n'y a plus de mesure.
    // La pastille dit « non mesuré », comme sa voisine « Profils enrichis »
    // sans talent à mesurer.
    describe('quand la population entière se tait', () => {
      const ALL_SILENT = { ...FULL_STATS, total: 30, availableNow: 0, availabilityUnknownCount: 30 }

      it('dit « non mesuré » au lieu d’un zéro que personne ne peut vérifier', async () => {
        stats.mockReturnValue({ data: ALL_SILENT, isLoading: false })
        render(<TalentStatsBanner />)
        const tooltip = await hoverPastille('Disponibles maintenant')
        expect(tooltip).toHaveTextContent(/non mesuré — aucune affectation enregistrée sur les 30 fiches/)
      })

      it('n’écrit NULLE PART le « 0 » orphelin de la mesure de production', () => {
        stats.mockReturnValue({ data: ALL_SILENT, isLoading: false })
        render(<TalentStatsBanner />)
        expect(screen.queryByText('0')).toBeNull()
      })

      it('ne redit pas deux fois la même chose : la raison porte le compte, le compagnon se retire', () => {
        // Loi 4 du tome 7 — rien n'apparaît deux fois sous la même forme avec
        // le même contenu.
        stats.mockReturnValue({ data: ALL_SILENT, isLoading: false })
        render(<TalentStatsBanner />)
        expect(screen.queryByText(/30 fiches sans affectation enregistrée/)).toBeNull()
      })

      it('SAIT DIRE NON : une part mesurable, même petite, rend le chiffre — 0 sur 10 fiches lisibles est un fait', () => {
        stats.mockReturnValue({
          data: { ...FULL_STATS, total: 30, availableNow: 0, availabilityUnknownCount: 20 },
          isLoading: false,
        })
        render(<TalentStatsBanner />)
        expect(screen.getByText('0')).toBeInTheDocument()
        expect(screen.queryByText(/aucune affectation enregistrée sur les/)).toBeNull()
      })

      it('un vivier VIDE reste un fait : zéro talent, zéro disponible, aucun silence', () => {
        stats.mockReturnValue({
          data: { ...FULL_STATS, total: 0, availableNow: 0, availabilityUnknownCount: 0 },
          isLoading: false,
        })
        render(<TalentStatsBanner />)
        // Deux tuiles à zéro (le total et la disponibilité) : c'est une
        // réponse, pas une absence — un espace neuf ne doit pas envoyer
        // chercher une panne.
        expect(screen.getAllByText('0').length).toBe(2)
      })
    })
  })

  it('#3488 — vivier actif à 0 mais liste de profils archivés dessous : le bandeau se tait, jamais « 0 · non mesuré »', () => {
    stats.mockReturnValue({
      data: {
        ...FULL_STATS,
        total: 0,
        availableNow: 0,
        enrichedPercent: null,
        incompleteCount: 0,
        lastUpdatedAt: null,
      },
      isLoading: false,
    })
    const { container } = render(<TalentStatsBanner listTotal={32} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('#3488 — vivier réellement vide (liste vide aussi) : le bandeau garde son comportement', () => {
    stats.mockReturnValue({
      data: {
        ...FULL_STATS,
        total: 0,
        availableNow: 0,
        enrichedPercent: null,
        incompleteCount: 0,
        lastUpdatedAt: null,
      },
      isLoading: false,
    })
    const { container } = render(<TalentStatsBanner listTotal={0} />)
    expect(container).not.toBeEmptyDOMElement()
  })
})
