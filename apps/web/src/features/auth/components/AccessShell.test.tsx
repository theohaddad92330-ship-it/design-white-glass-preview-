import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AccessShell } from './AccessShell'

/**
 * La structure de la maquette `onboarding-accueil`, dans l'ordre : barre haute,
 * en-tête de page (surtitre, h1, phrase) HORS de la carte, bandeau, carte
 * (corps | itinéraire), ligne de Laura. Le test dit NON si un bloc change de
 * place ou si le titre retourne dans la carte.
 */
describe("AccessShell — la coque des écrans d'accès", () => {
  it("pose l'en-tête de page avant la carte, puis la ligne de Laura", () => {
    render(
      <AccessShell
        kicker="Connexion"
        title="Se connecter"
        lead="Accède à tes comptes."
        notice={<span>Invitation de Marc</span>}
        aside={<aside>itinéraire</aside>}
      >
        <form aria-label="formulaire" />
      </AccessShell>,
    )
    const main = screen.getByRole('main')
    const heading = screen.getByTestId('access-heading')
    const card = screen.getByTestId('access-card')
    const laura = screen.getByTestId('access-laura')
    const order = [heading, screen.getByRole('note'), card, laura]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(within(heading).getByRole('heading', { level: 1, name: 'Se connecter' })).toBeTruthy()
    expect(within(heading).getByText('Connexion').className).toMatch(/uppercase/)
    expect(within(card).queryByRole('heading', { level: 1 })).toBeNull()
    expect(within(card).getByRole('form', { name: 'formulaire' })).toBeTruthy()
    expect(within(card).getByText('itinéraire')).toBeTruthy()
    expect(main.contains(laura)).toBe(true)
    expect(screen.getByRole('banner')).toBeTruthy()
  })

  it("se passe d'en-tête, de bandeau et de colonne quand l'écran n'en a pas", () => {
    render(
      <AccessShell>
        <p>Chargement</p>
      </AccessShell>,
    )
    expect(screen.queryByTestId('access-heading')).toBeNull()
    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.queryByRole('complementary')).toBeNull()
  })
})
