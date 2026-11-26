import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { SourcesStrip } = await import('./SourcesStrip')

/**
 * #2111.31 — LE CTA DIT LE GESTE QUAND IL N'Y A ENCORE RIEN À GÉRER.
 *
 * « Gérer les connexions » suppose qu'une connexion existe déjà : c'est vrai
 * une fois une source branchée, faux le premier jour. Quand LES TROIS
 * capacités sont `not_connected`, il n'y a rien à « gérer » — seulement à
 * connecter. Le lien reste le même (`/integrations`), seul le mot change
 * avec le fait qu'il décrit.
 */
describe('#2111.31 — le CTA de la bande de sources', () => {
  it('dit « Connecter mes outils » quand aucune source n’est branchée', () => {
    render(<SourcesStrip states={{ agenda: 'not_connected', mailbox: 'not_connected', tasks: 'not_connected' }} />)

    expect(screen.getByRole('link', { name: 'Connecter mes outils' })).toHaveAttribute('href', '/integrations')
    expect(screen.queryByText('Gérer les connexions')).not.toBeInTheDocument()
  })

  it('LE TÉMOIN — dès qu’une seule source répond, le libellé reste « Gérer les connexions »', () => {
    render(<SourcesStrip states={{ agenda: 'ready', mailbox: 'not_connected', tasks: 'not_connected' }} />)

    expect(screen.getByRole('link', { name: 'Gérer les connexions' })).toHaveAttribute('href', '/integrations')
  })
})

/**
 * #2098.23 — L'UTILISATEUR SAIT SI LE BRIEF EST COMPLET.
 *
 * `partial`/`ready` distinguent déjà chaque source, mais rien ne rendait de
 * VERDICT global. Un mot suffit : « Brief complet » quand les trois capacités
 * ont répondu, « Brief incomplet » sinon — jamais un chiffre inventé.
 */
describe('#2098.23 — le verdict de complétude du brief', () => {
  it('dit « Brief complet » quand les trois sources sont à jour', () => {
    render(<SourcesStrip states={{ agenda: 'ready', mailbox: 'ready', tasks: 'ready' }} />)

    expect(screen.getByText('Brief complet')).toBeInTheDocument()
  })

  it('dit « Brief incomplet » dès qu’une seule source ne répond pas totalement', () => {
    render(<SourcesStrip states={{ agenda: 'ready', mailbox: 'partial', tasks: 'ready' }} />)

    expect(screen.getByText('Brief incomplet')).toBeInTheDocument()
  })
})

/**
 * #2098.13 — LE CLIC OUVRE UN TIROIR, PAS UN LIEN MUET.
 *
 * Le retour d'origine demande sept champs (source, état, dernière synchro,
 * permission, ce que ça débloque, erreur, réparation). Le tiroir rend les
 * champs RÉELS : source, état, explication (permission + ce que ça débloque,
 * déjà rédigées ensemble côté serveur sous `state.*`), erreur technique quand
 * le serveur en rend une, la dernière lecture RÉUSSIE (#2098.9, ci-dessous),
 * et le geste de réparation.
 */
describe('#2098.13 — le tiroir de détail par source', () => {
  it('ouvre un tiroir avec le détail réel d’une source non connectée, et sa réparation', () => {
    render(<SourcesStrip states={{ agenda: 'not_connected', mailbox: 'ready', tasks: 'ready' }} />)

    fireEvent.click(screen.getByRole('button', { name: /ton agenda/ }))

    expect(screen.getByRole('link', { name: 'Connecter mon agenda' })).toHaveAttribute('href', '/integrations')
    expect(
      screen.getByText('Aucun agenda connecté. Connecte-le pour voir tes rendez-vous et tes créneaux libres ici.'),
    ).toBeInTheDocument()
    // Jamais de synchro par source inventée : cette source n'a pas de `readAt`.
    expect(screen.queryByText('Dernière lecture')).not.toBeInTheDocument()
  })

  it('rend l’erreur technique RÉELLE du serveur quand la lecture a échoué', () => {
    render(
      <SourcesStrip
        states={{ agenda: 'ready', mailbox: 'unavailable', tasks: 'ready' }}
        reasons={{ mailbox: 'provider_timeout' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ta messagerie/ }))

    expect(screen.getByText('provider_timeout')).toBeInTheDocument()
  })
})

/**
 * #2098.9 — LA FRAÎCHEUR RÉELLE, PAR SOURCE.
 *
 * `dailyBriefingSchema` ne portait qu'un `generatedAt` global : un brief avec
 * l'agenda en panne et la messagerie fraîche affichait la MÊME heure pour les
 * deux. Chaque bloc porte désormais son `readAt` propre, posé par le service
 * qui a lu CETTE source — jamais une date inventée pour une source qui n'a
 * pas répondu.
 */
describe('#2098.9 — la fraîcheur par source, dans le tiroir', () => {
  it('affiche l’heure RÉELLE de lecture quand la source a répondu', () => {
    const readIso = '2026-09-24T08:15:00.000Z'
    render(
      <SourcesStrip
        states={{ agenda: 'ready', mailbox: 'ready', tasks: 'ready' }}
        readAt={{ agenda: readIso }}
        timeZone="UTC"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /ton agenda/ }))

    // Calculée par le MÊME mécanisme que le composant (`Intl.DateTimeFormat`),
    // jamais une heure recopiée à la main : un fuseau ou un réglage locale qui
    // change ne fait pas rougir ce test pour la mauvaise raison.
    const expected = new Intl.DateTimeFormat('fr', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(
      new Date(readIso),
    )
    expect(screen.getByText('Dernière lecture')).toBeInTheDocument()
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it('n’affiche RIEN quand la source est servie mais sans `readAt` (jamais une heure devinée)', () => {
    render(<SourcesStrip states={{ agenda: 'ready', mailbox: 'ready', tasks: 'ready' }} />)

    fireEvent.click(screen.getByRole('button', { name: /ton agenda/ }))

    expect(screen.queryByText('Dernière lecture')).not.toBeInTheDocument()
  })
})
