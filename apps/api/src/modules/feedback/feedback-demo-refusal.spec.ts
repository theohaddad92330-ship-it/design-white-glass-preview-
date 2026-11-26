import { BadRequestException } from '@nestjs/common'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CreateFeedbackDto } from './dto/feedback.dto'
import { FeedbackController } from './feedback.controller'
import { FeedbackService } from './feedback.service'
import { GithubIssueService } from './github-issue.service'

/**
 * #1960.10 — UN VISITEUR DE DÉMONSTRATION N'OUVRE JAMAIS UN VRAI TICKET.
 *
 * Le widget est monté pour toute session connectée, salle de démonstration
 * comprise, et `POST /feedback` n'avait que le garde JWT : un visiteur qui
 * essayait le bouton ouvrait un ticket RÉEL dans le service de l'équipe, et sa
 * ligne entrait dans la file de tri du back-office comme un vrai retour.
 *
 * Même doctrine que le dépôt de document (`rag.controller.ts`) : refus AVANT
 * toute écriture. Le test monte le VRAI service et le VRAI client du service de
 * tickets, intégration allumée : sans le refus, la création écrirait une ligne
 * et partirait sur le réseau — et ces deux assertions tomberaient.
 */
describe('#1960.10 — POST /feedback refusé en salle de démonstration', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    process.env.FEEDBACK_GITHUB_TOKEN = 'tok'
    process.env.FEEDBACK_GITHUB_REPO = 'Bellum-AI/bellum-monorepo'
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ number: 913, html_url: 'https://github.com/o/r/issues/913' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
  })

  function build(isDemo: boolean) {
    const repo = createMockRepository<BetaFeedbackEntity>()
    repo.save.mockImplementation(async (row: BetaFeedbackEntity) => ({
      ...row,
      id: 'fb-1',
      created_at: new Date('2026-09-13T10:00:00.000Z'),
    }))
    const service = new FeedbackService(
      repo as never,
      createMockRepository<WorkspaceMemberEntity>() as never,
      createMockRepository<WorkspaceEntity>() as never,
      new GithubIssueService(),
    )
    const isDemoWorkspace = jest.fn().mockResolvedValue(isDemo)
    const workspaceContext = { isDemoWorkspace } as unknown as WorkspaceContextService
    return { controller: new FeedbackController(service, workspaceContext), repo, isDemoWorkspace }
  }

  const user = { userId: 'visitor-1' } as CurrentUserPayload
  const dto = { category: 'bug', message: 'Le bouton ne fait rien' } as CreateFeedbackDto

  // NON : ni ligne, ni appel réseau.
  it('refuse, AVANT toute écriture et tout appel au service de tickets', async () => {
    const { controller, repo, isDemoWorkspace } = build(true)

    const refusal = controller.create(user, dto)

    await expect(refusal).rejects.toBeInstanceOf(BadRequestException)
    await expect(refusal).rejects.toThrow(
      'Le signalement est désactivé dans l’espace de démonstration : il entrerait dans la file de l’équipe comme un vrai retour. Dans un espace réel, il part avec son contexte et se suit dans Réglages › Mes signalements.',
    )
    expect(isDemoWorkspace).toHaveBeenCalledWith('visitor-1')
    expect(repo.create).not.toHaveBeenCalled()
    expect(repo.save).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Témoin : hors démonstration, rien ne change — la ligne s'écrit, le ticket part.
  // Sans ce témoin, un refus posé pour TOUT LE MONDE rendrait le test du dessus vert.
  it('témoin — hors démonstration, le signalement s’écrit et le ticket part', async () => {
    const { controller, repo } = build(false)

    const created = await controller.create(user, dto)

    expect(created.github_issue_number).toBe(913)
    expect(repo.save).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalled()
  })
})
