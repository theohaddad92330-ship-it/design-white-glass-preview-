import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CreateFeedbackDto } from './dto/feedback.dto'
import { FeedbackController } from './feedback.controller'
import type { FeedbackService } from './feedback.service'

/**
 * #1960.12 — CE QUE L'AUTEUR D'UN SIGNALEMENT REÇOIT.
 *
 * Le contrôleur rendait `github_issue_url` : un lien vers un ticket d'un dépôt
 * PRIVÉ, qu'un client final ne peut pas ouvrir, sous le nom d'un outil tiers.
 * `GET /feedback` rendait la ligne ENTIÈRE — lien du ticket, lien de la capture
 * sur la branche d'actifs du même dépôt, liens des pièces jointes, journaux.
 *
 * L'auteur reçoit désormais une RÉFÉRENCE (le numéro, lisible, à citer à
 * l'équipe) et aucun lien. `github_issue_number` garde son nom de champ sur le
 * POST : le widget déjà ouvert dans un onglet le lit sous ce nom pendant le
 * déploiement, et le renommer lui ferait annoncer « aucun numéro attribué » à
 * tort.
 *
 * #1960.10 — le GET nourrit « Mes signalements ». Il n'avait aucun lecteur dans
 * l'application : il prend la forme de ce que l'écran lit — `reference` et
 * `status` —, sans nom d'outil, et plus rien d'autre.
 */
describe('FeedbackController — #1960.12 aucun lien vers le dépôt privé', () => {
  const PRIVATE = 'github.com/Bellum-AI'

  const row = {
    id: 'fb-1',
    user_id: 'u-1',
    account_id: null,
    created_at: new Date('2026-09-12T10:00:00.000Z'),
    category: 'bug',
    message: 'Mon CRM est déconnecté',
    user_email: 'dev@bellum.ai',
    page_url: 'https://app.example/chat?…',
    user_agent: 'jsdom',
    console_logs: '[t] ERROR: session expirée',
    error_logs: null,
    element_context: null,
    client_context: { attachments: [{ name: 'a.png', url: `https://${PRIVATE}/repo/blob/feedback-assets/a.png` }] },
    screenshot: 'data:image/png;base64,AAAA',
    screenshot_url: `https://${PRIVATE}/repo/blob/feedback-assets/screenshot.png`,
    reuse_scope: 'tenant_private',
    github_issue_number: 913,
    github_issue_url: `https://${PRIVATE}/repo/issues/913`,
  } as unknown as BetaFeedbackEntity

  const service = {
    create: jest.fn().mockResolvedValue(row),
    listMineWithStatus: jest.fn().mockResolvedValue([{ row, status: 'in_progress' }]),
  }
  // Hors démonstration : le refus en salle de démo a sa propre spec
  // (`feedback-demo-refusal.spec.ts`).
  const workspaceContext = { isDemoWorkspace: jest.fn().mockResolvedValue(false) } as unknown as WorkspaceContextService
  const controller = new FeedbackController(service as unknown as FeedbackService, workspaceContext)
  const user = { userId: 'u-1' } as CurrentUserPayload

  it('POST rend la référence du signalement, jamais le lien du ticket', async () => {
    const created = await controller.create(user, { category: 'bug', message: 'x' } as CreateFeedbackDto)

    expect(created).toEqual({ id: 'fb-1', created_at: row.created_at, github_issue_number: 913 })
    expect(JSON.stringify(created)).not.toContain(PRIVATE)
  })

  it('POST rend une référence nulle quand aucun ticket n’a été ouvert — jamais un numéro inventé', async () => {
    service.create.mockResolvedValueOnce({ ...row, github_issue_number: null, github_issue_url: null })

    const created = await controller.create(user, { category: 'bug', message: 'x' } as CreateFeedbackDto)

    expect(created.github_issue_number).toBeNull()
  })

  it('#1960.10 — GET rend ses signalements : référence et état, sans lien, capture, journaux, adresse ni nom d’outil', async () => {
    const listed = await controller.listMine(user)

    expect(listed.items).toEqual([
      {
        id: 'fb-1',
        created_at: row.created_at,
        category: 'bug',
        message: 'Mon CRM est déconnecté',
        reference: 913,
        status: 'in_progress',
      },
    ])
    const json = JSON.stringify(listed)
    expect(json).not.toContain(PRIVATE)
    expect(json).not.toContain('https://')
    expect(json).not.toContain('base64')
    expect(json).not.toContain('session expirée')
    expect(json).not.toContain('dev@bellum.ai')
    expect(json).not.toMatch(/github/i)
  })

  it('#1960.10 — GET lit l’auteur dans le JETON ; la limite est le seul paramètre accepté', async () => {
    await controller.listMine({ userId: 'u-1' } as CurrentUserPayload, '10')

    expect(service.listMineWithStatus).toHaveBeenLastCalledWith('u-1', 10)
  })

  it('#1960.10 — GET rend « état indisponible » en null, jamais un état deviné', async () => {
    service.listMineWithStatus.mockResolvedValueOnce([{ row: { ...row, github_issue_number: null }, status: null }])

    const listed = await controller.listMine(user)

    expect(listed.items[0]).toMatchObject({ reference: null, status: null })
  })

  // ⚠️ La garde LIT quelque chose : la ligne de test porte bien les trois liens
  // privés que le contrôleur doit retenir — sans eux, `not.toContain` serait
  // vert sur une ligne qui n'en a jamais eu.
  it('le corpus du test porte bien les liens que le contrôleur doit retenir', () => {
    expect(JSON.stringify(row).split(PRIVATE)).toHaveLength(4)
  })
})
