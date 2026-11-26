import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AuditUnestablished } from './AuditUnestablished'

/**
 * Défaut du 16/09/2026 — LA PHRASE DE SECOURS N'APPARAÎT QUE QUAND ELLE EST VRAIE.
 *
 * « Tout ce que cet écran affiche a pu être établi » est la seule phrase de ce
 * bloc qui puisse MENTIR : les autres nomment une absence, celle-ci en nie une.
 * Elle a été rendue en production le 16/09/2026 sous trois blocs « non mesuré ».
 */
describe('AuditUnestablished', () => {
  it('nomme chaque entrée AVEC sa raison, et ne dit pas que tout a été établi', async () => {
    renderWithRouter(
      <AuditUnestablished
        entries={[
          { key: 'coachingInsights', reason: 'profileMissing' },
          { key: 'thirtyDayPlan', reason: 'noSourceYet' },
        ]}
      />,
    )

    expect(await screen.findByText(/la lecture de tes réponses/)).toBeInTheDocument()
    expect(screen.getByText(/ton profil ne le renseigne pas encore/)).toBeInTheDocument()
    expect(screen.getByText(/le plan à 4 semaines/)).toBeInTheDocument()
    expect(screen.getByText(/aucune source ne le produit encore/)).toBeInTheDocument()
    expect(screen.queryByText(/a pu être établi/)).not.toBeInTheDocument()
  })

  it('TÉMOIN — liste réellement vide : la phrase de secours est légitime, et le lien inutile', async () => {
    renderWithRouter(<AuditUnestablished entries={[]} />)

    expect(await screen.findByText('Tout ce que cet écran affiche a pu être établi.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Compléter mon profil/ })).not.toBeInTheDocument()
  })

  it('#2457 — nomme un bloc DÉRIVÉ (conclusion non tirée) avec sa raison COMPTÉE, jamais un « indisponible » nu', async () => {
    renderWithRouter(
      <AuditUnestablished
        entries={[
          { key: 'verdict', reason: 'notConcluded', rulesChecked: 18 },
          { key: 'priority', reason: 'notConcluded', rulesChecked: 18 },
          { key: 'maturity', reason: 'notConcluded', axesEvaluated: 2, axesTotal: 12, axesMinimum: 3 },
        ]}
      />,
    )

    expect(await screen.findByText(/le verdict/)).toBeInTheDocument()
    expect(screen.getByText(/la priorité de la semaine/)).toBeInTheDocument()
    expect(screen.getByText(/la maturité commerciale/)).toBeInTheDocument()
    // La raison NOMME le compte, jamais un pourcentage (GA-259) ni un
    // « indisponible » qui ne dirait rien.
    expect(screen.getAllByText(/18 règles de tension/)).toHaveLength(2)
    expect(screen.getByText(/2 sur 12 axes évalués/)).toBeInTheDocument()
    // Aucune probabilité, aucun taux : la doctrine « aucune probabilité »
    // (six fois refusée) ne se réintroduit pas ici.
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('n’ouvre le questionnaire que si au moins une entrée s’y répare', async () => {
    const { unmount } = renderWithRouter(
      <AuditUnestablished entries={[{ key: 'messagingStyle', reason: 'profileMissing' }]} />,
    )
    expect(await screen.findByRole('link', { name: /Compléter mon profil/ })).toBeInTheDocument()
    unmount()

    // Aucune entrée réparable côté utilisateur : proposer le questionnaire
    // serait une fausse promesse — il ne produira ni plan ni palier.
    renderWithRouter(<AuditUnestablished entries={[{ key: 'milestones', reason: 'noSourceYet' }]} />)
    expect(await screen.findByText(/les paliers/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Compléter mon profil/ })).not.toBeInTheDocument()
  })

  it('#2067 — une grandeur de l’arbitrage NOMME la réponse qui manque, et la porte du profil s’ouvre', async () => {
    renderWithRouter(
      <AuditUnestablished
        entries={[
          { key: 'activeLoadReserve', reason: 'profileMissing', missingAnswers: ['weekly_sales_time_protected'] },
          { key: 'activeLoadPartners', reason: 'profileMissing', missingAnswers: ['partners_regular_count'] },
        ]}
      />,
    )
    expect(
      await screen.findByText(/ta réserve — il manque ta réponse sur le temps que tu protèges vraiment chaque semaine/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/le nombre de partenaires à travailler — il manque ta réponse sur avec combien de partenaires/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Compléter mon profil/ })).toBeInTheDocument()
  })
})
