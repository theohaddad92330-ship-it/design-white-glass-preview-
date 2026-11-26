import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** #3141 (27/09/2026, bêta) — le détail vit désormais dans un dépliable
 *  fermé par défaut (`CollapsedSection`) ; ce qui l'exerçait avant doit
 *  d'abord l'ouvrir. */
function openDetails(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Voir le détail' }))
}

/**
 * #2125.35-.38, .42, .46, .49 — LE MINI-PLAN, AVANT LE CLIC QUI DÉBITE.
 *
 * « Actualiser l'analyse » partait sans rien annoncer : l'écran de confirmation
 * disait ce qu'une relance conserve et ce qu'elle refait, mais jamais ce qui
 * était devenu VIEUX (ni depuis quand), ni ce qui pourrait changer, ni qu'il
 * existe un rafraîchissement moins cher quand on ne cherche que l'organisation.
 *
 * Ce que cette suite garde :
 *  · ce qui est ancien est nommé AVEC SA DATE, et une date inconnue se dit
 *    « date inconnue » — jamais une date inventée, jamais « il y a 0 jour » ;
 *  · Théo B r1-recherche (#4468) : AUCUN crédit sur les boutons de mode — le coût reste côté serveur ;
 *  · les quatre objets qu'un rafraîchissement n'écrase jamais sont nommés.
 *
 * ⚠️ « une note privée » → « tes notes manuelles » : cette branche a été
 * coupée de main AVANT le renversement délibéré de d87555661 (« « prive » ne
 * dit plus que la machine n'ecrase pas ») — « privé » reste réservé à la
 * confidentialité, la PRÉSERVATION dit désormais « notes manuelles ». Le test
 * ci-dessous tenait l'ancien libellé ; ce n'est pas une régression.
 */
describe('RefreshPlanCard', () => {
  afterEach(cleanup)

  const NOW = new Date('2026-09-15T10:00:00.000Z')

  async function renderCard(
    props: Partial<{
      freshness: Record<string, string | null>
      mode: 'full' | 'organisation'
      onModeChange: (mode: 'full' | 'organisation') => void
    }> = {},
  ) {
    const { RefreshPlanCard } = await import('./RefreshPlanCard')
    render(
      <RefreshPlanCard
        now={NOW}
        freshness={
          props.freshness ?? {
            signals: '2026-03-02T09:00:00.000Z',
            contacts: '2026-09-15T08:00:00.000Z',
            entities: null,
            strategy: '2026-03-02T09:00:00.000Z',
          }
        }
        mode={props.mode ?? 'full'}
        onModeChange={props.onModeChange ?? (() => {})}
      />,
    )
  }

  it('nomme ce qui est ANCIEN avec sa date', async () => {
    await renderCard()
    openDetails()
    const aged = screen.getByTestId('refresh-plan-aged')
    expect(aged).toHaveTextContent('Signaux')
    expect(aged).toHaveTextContent('02/03/2026')
  })

  it('un axe jamais relu se dit « date inconnue » — jamais une date inventée', async () => {
    await renderCard()
    openDetails()
    expect(screen.getByText(/date inconnue/i)).toBeInTheDocument()
  })

  it('ne range pas dans « ancien » un axe relu ce matin', async () => {
    await renderCard({ freshness: { contacts: '2026-09-15T08:00:00.000Z' } })
    openDetails()
    // #2318.3 — la date du matin apparaît maintenant AUSSI en « dernière
    // analyse » (nouveau champ, légitime) : la portée du test se resserre sur
    // le bloc « ancien » plutôt que sur tout le document.
    expect(screen.getByTestId('refresh-plan-aged')).not.toHaveTextContent('Contacts')
  })

  // Théo B r1-recherche (#4468) — sait dire NON : aucun crédit, aucun prix, aucun « non mesuré » sur les modes.
  it('n’annonce AUCUN crédit sur les boutons de mode', async () => {
    await renderCard()
    expect(screen.getByRole('button', { name: /Tout relire/ })).not.toHaveTextContent(/crédit|\d/)
    expect(screen.getByRole('button', { name: /L’organisation/ })).not.toHaveTextContent(/crédit|\d/)
  })

  it('choisir « l’organisation » remonte le mode à l’appelant', async () => {
    const onModeChange = vi.fn()
    await renderCard({ onModeChange })
    fireEvent.click(screen.getByRole('button', { name: /L’organisation/ }))
    expect(onModeChange).toHaveBeenCalledWith('organisation')
  })

  it('en mode « l’organisation », ne promet de relire QUE l’organigramme et les contacts', async () => {
    await renderCard({ mode: 'organisation' })
    openDetails()
    const reread = screen.getByTestId('refresh-plan-reread')
    expect(reread).toHaveTextContent('Entités')
    expect(reread).toHaveTextContent('Contacts')
    expect(reread).not.toHaveTextContent('Stratégie')
  })

  it('nomme les quatre choses qu’un rafraîchissement n’écrase jamais, et ce qui arrive si l’analyse échoue (aucun crédit chiffré, #4468)', async () => {
    await renderCard()
    openDetails()
    const preserved = screen.getByTestId('refresh-plan-preserved')
    expect(preserved).toHaveTextContent(/notes manuelles/i)
    expect(preserved).toHaveTextContent(/action validée/i)
    expect(preserved).toHaveTextContent(/preuve/i)
    expect(preserved).toHaveTextContent(/relation déclarée/i)
    expect(screen.getByText(/quota d’analyses n’est pas entamé/i)).toBeInTheDocument()
    // #4463 (main) — aucune règle de remboursement, aucun mot « crédit » nulle part.
    expect(screen.queryByText(/rembours|crédit/i)).not.toBeInTheDocument()
  })

  // #2318.3 — les quatre champs de préview qui manquaient au 17/09 : dernière
  // analyse, sections encore fraîches, sources consultées, durée.
  it('nomme la DERNIÈRE ANALYSE avec sa date', async () => {
    await renderCard()
    expect(screen.getByTestId('refresh-plan-last-analyzed')).toHaveTextContent('15/09/2026')
  })

  it('« dernière analyse » se dit INCONNUE, jamais une date de zéro, sans aucune fraîcheur', async () => {
    await renderCard({ freshness: {} })
    expect(screen.getByTestId('refresh-plan-last-analyzed')).toHaveTextContent(/inconnue/i)
  })

  it('nomme ce qui est encore FRAIS, distinct de ce qui est ancien', async () => {
    await renderCard({ freshness: { contacts: '2026-09-15T08:00:00.000Z' }, mode: 'organisation' })
    openDetails()
    expect(screen.getByTestId('refresh-plan-fresh')).toHaveTextContent('Contacts')
  })

  it('nomme les SOURCES CONSULTÉES par nature, jamais un nom de fournisseur', async () => {
    await renderCard()
    openDetails()
    const sources = screen.getByTestId('refresh-plan-sources')
    expect(sources).toHaveTextContent(
      /registre officiel|site de l.entreprise|offres d.emploi|actualité publique|réseau professionnel/i,
    )
    expect(sources).not.toHaveTextContent(/pappers|apollo|brave|firecrawl|linkedin/i)
  })

  it('annonce la DURÉE, en deux bornes', async () => {
    await renderCard({ mode: 'organisation' })
    openDetails()
    expect(screen.getByTestId('refresh-plan-duration')).toHaveTextContent('1')
    expect(screen.getByTestId('refresh-plan-duration')).toHaveTextContent('2')
  })

  // #3141 (27/09/2026, bêta) — le panneau était trop long : le détail se
  // replie désormais par défaut, seuls les titres et « dernière analyse »
  // restent visibles à l'arrivée.
  describe('condensé par défaut (#3141)', () => {
    it('le détail est FERMÉ à l’arrivée — rien de lui n’est dans le DOM', async () => {
      await renderCard()
      const toggle = screen.getByRole('button', { name: 'Voir le détail' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByTestId('refresh-plan-aged')).not.toBeInTheDocument()
      expect(screen.queryByTestId('refresh-plan-sources')).not.toBeInTheDocument()
      expect(screen.queryByTestId('refresh-plan-duration')).not.toBeInTheDocument()
      expect(screen.queryByTestId('refresh-plan-preserved')).not.toBeInTheDocument()
    })

    it('« dernière analyse » reste visible sans ouvrir le détail', async () => {
      await renderCard()
      expect(screen.getByTestId('refresh-plan-last-analyzed')).toBeInTheDocument()
    })

    it('ouvrir le détail le révèle ; le refermer le retire du DOM', async () => {
      await renderCard()
      openDetails()
      expect(screen.getByTestId('refresh-plan-duration')).toBeInTheDocument()
      openDetails()
      expect(screen.queryByTestId('refresh-plan-duration')).not.toBeInTheDocument()
    })
  })
})
