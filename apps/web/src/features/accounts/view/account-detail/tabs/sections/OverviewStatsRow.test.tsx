import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { OverviewStatsRow } from './OverviewStatsRow'

/**
 * Le KPI « Offres détectées » comptait les ANGLES d'attaque, pas les offres :
 * TF1 affichait « 1 » sous « Offres détectées » alors que la section listait 3
 * offres (restitution TF1 p9 — définir exactement chaque compteur). Le compteur
 * reflète désormais le nombre d'offres.
 */
describe('OverviewStatsRow — chaque compteur dit la vérité', () => {
  it('« Offres détectées » compte les offres, pas les angles', () => {
    render(<OverviewStatsRow offersCount={3} contactsCount={9} subsidiariesCount={74} signalsCount={6} />)
    const offersLabel = screen.getByText(/offres/i)
    // La valeur voisine du label « Offres » doit être 3 (le nombre d'offres).
    const card = offersLabel.closest('div')?.parentElement
    expect(card?.textContent).toContain('3')
  })
  // ── #1113 : « je ne peux pas cliquer dessus pour que ça m'ouvre le bon onglet » ──

  it('chaque compteur ouvre l’onglet où ses objets sont RENDUS', async () => {
    renderWithRouter(
      <OverviewStatsRow accountId="acc-1" offersCount={3} contactsCount={9} subsidiariesCount={74} signalsCount={6} />,
    )

    // Le rendu passe par une transition de routeur : on ATTEND le premier
    // compteur avant de lire les liens.
    await screen.findByText('3')
    // On lit les liens par leur VALEUR affichée : le libellé passe par i18n, et
    // un test qui dépend de la traduction casse au premier reformulage.
    const hrefOf = (value: string) => screen.getByText(value).closest('a')?.getAttribute('href') ?? ''

    // Les offres à proposer sont calculées PAR le plan et rendues dans l'onglet
    // Plan d'action — jamais dans « Projets », dont le nom est le plus proche.
    expect(hrefOf('3')).toContain('tab=plan')
    expect(hrefOf('9')).toContain('tab=contacts')
    expect(hrefOf('74')).toContain('tab=sites')
    expect(hrefOf('6')).toContain('tab=veille')
    expect(hrefOf('3')).toContain('acc-1')
  })

  it('reste inerte sans dossier — un lien mort est pire qu’une absence de lien', () => {
    render(<OverviewStatsRow offersCount={3} contactsCount={9} subsidiariesCount={74} signalsCount={6} />)

    expect(screen.getByText('3').closest('a')).toBeNull()
  })

  // #2091 — mesuré en production (SHA 06e0a6a49, fiche PAYFIT) : un compte
  // sans plan généré affichait « 0 offre détectée », qui se lit « on a
  // cherché, il n'y a rien » alors que la vérité est « on n'a pas encore
  // cherché ». Même famille pour les entités et les signaux.
  it('#2091 — un compteur NON MESURÉ ne s’affiche jamais « 0 »', () => {
    render(
      <OverviewStatsRow
        offersCount={undefined}
        contactsCount={9}
        subsidiariesCount={undefined}
        signalsCount={undefined}
      />,
    )

    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Pas encore calculé/)).toHaveLength(3)
    // Le compteur mesuré (contacts) continue de s'afficher normalement.
    expect(screen.getByText('9')).toBeInTheDocument()
  })
})
