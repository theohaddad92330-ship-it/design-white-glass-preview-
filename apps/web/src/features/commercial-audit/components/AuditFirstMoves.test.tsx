import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { auditMovesFrom, type AuditContradiction, type AuditMoveDecisions } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { apiFetch } from '@/lib/api'
import { AuditFirstMoves } from './AuditFirstMoves'

const apiFetchMock = vi.mocked(apiFetch)

/**
 * #2074.10-.15 / #2090.7 / #2074.16 — la carte des PREMIERS MOUVEMENTS.
 *
 * Ces tests disent NON à quatre choses : à une carte remplie quand il n'y a
 * rien à proposer, à une page BellumAI affichée quand le geste ne vise aucun
 * objet, à un responsable ou une échéance que l'audit n'a jamais su, et à un
 * mouvement présenté comme VALIDÉ alors qu'aucune décision n'a été prise.
 * #2074.16 en ajoute un cinquième : au clic sur « Valider », l'appel PART
 * (`POST /profile-context/audit-move-decision`) et le badge change.
 *
 * `renderWithRouter` monte un `RouterProvider` (async) : la première requête
 * de chaque test passe par `findBy*`, les suivantes peuvent rester en `getBy*`.
 */
const NO_DECISIONS: AuditMoveDecisions = {}

function contradiction(overrides: Partial<AuditContradiction> = {}): AuditContradiction {
  return {
    ruleId: 'tooManySimultaneousMarkets',
    facts: [],
    tension: 'Quatre secteurs visés pour une personne à temps partiel.',
    possibleExplanation: null,
    questionToValidate: null,
    consequenceIfUnaddressed: null,
    recommendation: 'Geler deux secteurs jusqu’à la fin du trimestre.',
    indicator: 'Nombre de secteurs réellement travaillés',
    confidence: 'single_source',
    ...overrides,
  }
}

describe('AuditFirstMoves — #2074.10-.15 / #2090.7', () => {
  it('NOMME l’absence quand aucune rupture ne permet de proposer un mouvement', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([])} decisions={NO_DECISIONS} />)
    expect(await screen.findByText(/Aucun mouvement ne peut être proposé/)).toBeInTheDocument()
    expect(screen.queryByTestId('audit-move')).not.toBeInTheDocument()
  })

  it('rend le genre, l’objet, la raison et le résultat attendu du mouvement dérivé', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    expect(await screen.findByText('Une décision de pilotage')).toBeInTheDocument()
    expect(screen.getByText('Geler deux secteurs jusqu’à la fin du trimestre.')).toBeInTheDocument()
    expect(screen.getByText(/Quatre secteurs visés/)).toBeInTheDocument()
    expect(screen.getByText(/Nombre de secteurs réellement travaillés/)).toBeInTheDocument()
  })

  it('n’affiche AUCUNE page quand le geste ne vise aucun objet canonique', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    await screen.findByTestId('audit-move')
    expect(screen.queryByTestId('audit-move-page')).not.toBeInTheDocument()
  })

  it('affiche la page propriétaire quand la règle vise un objet', async () => {
    renderWithRouter(
      <AuditFirstMoves
        moves={auditMovesFrom([contradiction({ ruleId: 'contactWithoutFollowUpDate' })])}
        decisions={NO_DECISIONS}
      />,
    )
    expect(await screen.findByTestId('audit-move-page')).toHaveTextContent('Contacts')
  })

  it('rend AU PLUS trois mouvements, un par genre', async () => {
    const moves = auditMovesFrom([
      contradiction({ ruleId: 'objectivesAboveCapacity' }),
      contradiction({ ruleId: 'contactWithoutFollowUpDate' }),
      contradiction({ ruleId: 'keyAccountsWithoutAccessPath' }),
      contradiction({ ruleId: 'feedbackNotRecorded' }),
    ])
    renderWithRouter(<AuditFirstMoves moves={moves} decisions={NO_DECISIONS} />)
    await screen.findAllByTestId('audit-move')
    expect(screen.getAllByTestId('audit-move')).toHaveLength(3)
  })

  it('dit que le mouvement est PROPOSÉ tant qu’aucune décision n’a été prise', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    expect(await screen.findByText('Proposé')).toBeInTheDocument()
    expect(screen.getByText(/avant qu’il devienne une action/)).toBeInTheDocument()
  })

  it('n’affiche NI responsable NI échéance — l’audit n’en a aucune source', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    await screen.findByTestId('audit-move')
    expect(screen.queryByText(/Responsable/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Échéance/i)).not.toBeInTheDocument()
  })
})

// #2074.16 — « L'utilisateur VALIDE ou MODIFIE avant création dans Actions ».
describe('AuditFirstMoves — #2074.16 « Valider » / « Modifier » / « Écarter »', () => {
  it('propose les trois boutons de décision par mouvement, tant qu’aucune n’a été prise', async () => {
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    expect(await screen.findByRole('button', { name: 'Valider ce mouvement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Modifier ce mouvement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Écarter ce mouvement' })).toBeInTheDocument()
  })

  it('au clic sur « Valider », POST /profile-context/audit-move-decision avec le ruleId du mouvement', async () => {
    const move = auditMovesFrom([contradiction()])[0]
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'succeeded',
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: { [move!.ruleId]: { status: 'valide', decidedAt: '2026-09-22T20:00:00.000Z' } },
    })
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={NO_DECISIONS} />)
    const user = userEvent.setup()
    const validateButton = await screen.findByRole('button', { name: 'Valider ce mouvement' })

    await user.click(validateButton)

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/profile-context/audit-move-decision',
      method: 'POST',
      // #2074.16 — l'objet montré part avec la décision : il devient la tâche dans Actions.
      body: {
        ruleId: move!.ruleId,
        status: 'valide',
        subject: move!.subject,
        reason: move!.reason,
        expectedResult: move!.expectedResult ?? undefined,
      },
    })
  })

  it('une décision déjà prise se lit sur le badge — la reco humaine gagne sur le statut PROPOSÉ dérivé', async () => {
    const move = auditMovesFrom([contradiction()])[0]
    const decisions: AuditMoveDecisions = {
      [move!.ruleId]: { status: 'ecarte', decidedAt: '2026-09-22T20:00:00.000Z' },
    }
    renderWithRouter(<AuditFirstMoves moves={auditMovesFrom([contradiction()])} decisions={decisions} />)
    expect(await screen.findByText('Écarté')).toBeInTheDocument()
    expect(screen.queryByText('Proposé')).not.toBeInTheDocument()
    // Les trois boutons restent affichés — un second geste REMPLACE le premier.
    expect(screen.getByRole('button', { name: 'Valider ce mouvement' })).toBeInTheDocument()
  })
})
