import type { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'
import type { CreateFeedbackDto } from './dto/feedback.dto'
import { FeedbackService } from './feedback.service'
import type { GithubIssueService } from './github-issue.service'

/**
 * #1960.7 — AUCUN JETON D'ADRESSE NE PART DANS UN TICKET, QUEL QUE SOIT LE NAVIGATEUR.
 *
 * Le navigateur retire désormais la VALEUR des requêtes et des ancres de la page
 * et du fil des gestes (`apps/web/src/features/feedback/safeUrl.ts`). Mais la
 * porte, c'est l'API : un onglet chargé AVANT ce déploiement envoie encore
 * `window.location.href` entier et `pathname + search` dans le fil des gestes —
 * pendant des jours pour un onglet qu'on ne recharge pas. Sans ce second
 * verrou, `?t=` du lien de démonstration, `code`/`state` d'un retour OAuth ou
 * `#access_token=` partiraient dans le ticket ET dans la ligne lue par le
 * back-office.
 *
 * La PRÉSENCE d'une requête ou d'une ancre se dit (`?…`, `#…`) — l'absence d'un
 * paramètre peut être la cause du bug —, jamais leur contenu.
 */
describe('#1960.7 — les adresses d’un signalement perdent leurs jetons côté serveur', () => {
  const SECRETS = ['demo-link-secret', 'access-token-abc', 'invite-token-xyz', 'oauth-code-123', 'state-999', 'share-k']

  const legacyDto = {
    category: 'bug',
    message: 'La page reste blanche',
    pageUrl: 'https://app.bellum-ai.com/demo?t=demo-link-secret#access_token=access-token-abc',
    breadcrumbs: [
      { time: '10:00:00', type: 'navigation', label: '/invite/accept?token=invite-token-xyz' },
      { time: '10:00:05', type: 'click', label: 'Relancer' },
    ],
    networkFailures: [
      {
        time: '10:00:06',
        method: 'GET',
        url: 'https://api.bellum-ai.com/crm/callback?code=oauth-code-123&state=state-999',
        status: 401,
      },
    ],
    elementContext: {
      sourceFile: null,
      sourceChain: [],
      componentStack: [],
      selector: 'a',
      tagName: 'a',
      elementId: null,
      classes: null,
      role: null,
      ariaLabel: null,
      text: 'Ouvrir le partage',
      href: '/share/abc#k=share-k',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      viewport: { width: 1440, height: 900, dpr: 2 },
    },
  } as unknown as CreateFeedbackDto

  function build() {
    const repo = createMockRepository<BetaFeedbackEntity>()
    const github = {
      enabled: true,
      createIssue: jest.fn().mockResolvedValue({ number: 7, url: 'https://example.test/issues/7' }),
      uploadAsset: jest.fn().mockResolvedValue(null),
      codeExcerpt: jest.fn().mockResolvedValue(null),
    } as unknown as GithubIssueService
    const service = new FeedbackService(
      repo as never,
      createMockRepository<WorkspaceMemberEntity>() as never,
      createMockRepository<WorkspaceEntity>() as never,
      github,
    )
    return { service, repo, github }
  }

  // La garde LIT quelque chose : sans les jetons dans le corpus, `not.toContain`
  // serait vert sur un signalement qui n'en a jamais porté.
  it('le corpus du test porte bien les six jetons', () => {
    const serialized = JSON.stringify(legacyDto)
    for (const secret of SECRETS) expect(serialized).toContain(secret)
  })

  // NON : un envoi d'onglet ancien, jetons compris.
  it('ni le ticket ni la ligne enregistrée ne portent la valeur d’une requête ou d’une ancre', async () => {
    const { service, repo, github } = build()

    await service.create('u-1', legacyDto)

    const { title, body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { title: string; body: string }
    const row = (repo.create as jest.Mock).mock.calls[0][0] as Record<string, unknown>
    const sent = JSON.stringify({ title, body, row })
    for (const secret of SECRETS) expect(sent).not.toContain(secret)

    // La présence, elle, se dit — dans le ticket comme dans la ligne.
    expect(body).toContain('https://app.bellum-ai.com/demo?…#…')
    expect(body).toContain('/invite/accept?…')
    expect(body).toContain('https://api.bellum-ai.com/crm/callback?…')
    expect(row['page_url']).toBe('https://app.bellum-ai.com/demo?…#…')
  })

  // Témoin : ce qui n'a rien à retirer passe tel quel — une adresse déjà
  // expurgée par le navigateur récent, une page sans requête, un clic.
  it('témoin — une adresse sans jeton, ou déjà expurgée, et un libellé de clic passent tels quels', async () => {
    const { service, repo, github } = build()

    await service.create('u-1', {
      category: 'bug',
      message: 'x',
      pageUrl: 'https://app.bellum-ai.com/accounts?…',
      breadcrumbs: [
        { time: '10:00:00', type: 'navigation', label: '/integrations' },
        { time: '10:00:01', type: 'click', label: 'Voir ?détails #2' },
      ],
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('- Page : https://app.bellum-ai.com/accounts?…')
    expect(body).toContain('navigation : /integrations')
    expect(body).toContain('clic : Voir ?détails #2')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ page_url: 'https://app.bellum-ai.com/accounts?…' }),
    )
  })
})
