import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { BlockStateNotice } = await import('./BlockState')

/**
 * #1901.2 — LA PAGE DIT LE MÊME FAIT QUE LE BRIEF, ET ELLE NE LE DISAIT PAS.
 *
 * `providerDisabled` comparait `reason` à `agenda_provider_api_disabled`. Le
 * producteur (`connectorFailure`, `apps/api/src/common/connector-error.ts:74`)
 * pose `reason: input.code`, donc **`provider_api_disabled`** : le prédicat
 * était toujours faux en production, et l'écran envoyait « réessaie dans un
 * moment » pour un accès que personne n'allait rouvrir. Il était invisible
 * parce que la fixture de `briefing.service.spec.ts` inventait la valeur.
 *
 * Deux conséquences mesurées : la phrase « éteint côté fournisseur » de
 * l'agenda ne s'affichait jamais, et celle de la MESSAGERIE — qui existe en
 * FR et en EN — n'avait aucun chemin du tout, puisque le prédicat ne nommait
 * que l'agenda.
 */
describe('#1901.2 — « éteint côté fournisseur » à l’écran', () => {
  it('le dit pour l’agenda, sur la raison que le produit émet', () => {
    render(<BlockStateNotice state="unavailable" capability="agenda" reason="provider_api_disabled" />)

    expect(screen.getByText(/éteint côté fournisseur/)).toBeInTheDocument()
    // Le geste change avec le fait : on n'envoie pas « réessayer », on envoie
    // vérifier l'accès.
    expect(screen.getByRole('link', { name: "Vérifier l'accès" })).toHaveAttribute('href', '/integrations')
  })

  it('le dit pour la MESSAGERIE aussi — sa phrase existait sans aucun chemin pour l’atteindre', () => {
    render(<BlockStateNotice state="unavailable" capability="mailbox" reason="provider_api_disabled" />)

    expect(screen.getByText(/éteint côté fournisseur/)).toBeInTheDocument()
  })

  it('LE TÉMOIN — une panne ordinaire garde « réessaie dans un moment », et aucun lien', () => {
    render(<BlockStateNotice state="unavailable" capability="agenda" reason="agenda_status_failed" />)

    expect(screen.getByText(/réessaie dans un moment/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('un bloc SERVI n’affiche rien du tout', () => {
    const { container } = render(<BlockStateNotice state="ready" capability="agenda" reason={null} />)

    expect(container).toBeEmptyDOMElement()
  })
})

/**
 * #2111.40 — LE BOUTON NOMME CE QU'IL CONNECTE.
 *
 * « Connecter » seul ne dit pas QUOI : sur un écran qui porte déjà deux
 * capacités déconnectées côte à côte, le même mot répété deux fois ne les
 * distingue pas. Le lien reste le même (`/settings/integrations`), seul le
 * libellé nomme la capacité.
 */
describe('#2111.40 — le CTA de connexion nomme sa capacité', () => {
  it('dit « Connecter ma messagerie » pour la messagerie non connectée', () => {
    render(<BlockStateNotice state="not_connected" capability="mailbox" reason={null} />)

    expect(screen.getByRole('link', { name: 'Connecter ma messagerie' })).toBeInTheDocument()
  })

  it('dit « Connecter mon agenda » pour l’agenda non connecté', () => {
    render(<BlockStateNotice state="not_connected" capability="agenda" reason={null} />)

    expect(screen.getByRole('link', { name: 'Connecter mon agenda' })).toBeInTheDocument()
  })
})
