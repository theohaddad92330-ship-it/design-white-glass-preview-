import { FeedbackService } from './feedback.service'
import { GithubIssueService } from './github-issue.service'
import { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository, type MockRepository } from '../../database/test-utils'
import type { CreateFeedbackDto } from './dto/feedback.dto'

/**
 * ⚠️ `firstHumanResponses` rend `null` par défaut, et c'est le bon défaut :
 * « je n'ai pas pu regarder ». Un double qui rendrait une carte vide ferait
 * passer une intégration éteinte pour un dépôt où personne n'a jamais répondu.
 */
function makeGithub(
  issue: { number: number; url: string } | null,
  screenshotUrl: string | null = null,
  excerpt: { path: string; line: number; ref: string; snippet: string } | null = null,
  firstResponses: Map<number, string> | null = null,
) {
  return {
    enabled: issue != null,
    createIssue: jest.fn().mockResolvedValue(issue),
    // #1792 — généralisation de l'ancien `uploadScreenshot` : même mock, même
    // rôle (contrôler ce que le dépôt de la CAPTURE rend), nouvelle forme
    // `{url, kind}`. Les tests d'ATTACHMENTS ci-dessous surchargent cet appel
    // au cas par cas avec `mockResolvedValueOnce`/`mockImplementation`.
    uploadAsset: jest.fn().mockResolvedValue(screenshotUrl ? { url: screenshotUrl, kind: 'png' } : null),
    codeExcerpt: jest.fn().mockResolvedValue(excerpt),
    firstHumanResponses: jest.fn().mockResolvedValue(firstResponses),
  } as unknown as GithubIssueService
}

/**
 * Les deux repositories que #1658.2 ajoute — l'espace qui a remonté se résout
 * par l'AUTEUR, `beta_feedback` n'ayant pas de `workspace_id`. Portée module :
 * les trente constructions du fichier les passent toutes.
 */
const members = createMockRepository<WorkspaceMemberEntity>()
const workspaces = createMockRepository<WorkspaceEntity>()

const APP_CONTEXT = {
  buildVersion: '26.08.14-ts1789000000+a1b2c3d4e5',
  environment: 'prod',
  route: '/integrations',
  theme: 'dark' as const,
  language: 'fr',
  timeZone: 'Europe/Paris',
  online: true,
  viewport: '1800×1042 @2x',
}

const ELEMENT_CONTEXT = {
  sourceFile: 'apps/web/src/features/accounts/Card.tsx:42:7',
  sourceChain: ['apps/web/src/routes/dashboard.tsx:12:3'],
  componentStack: ['AccountCard', 'Dashboard'],
  selector: 'div > button:nth-of-type(2)',
  tagName: 'button',
  elementId: null,
  classes: 'btn primary',
  role: null,
  ariaLabel: 'Relancer',
  text: 'Relancer',
  href: null,
  rect: { x: 10, y: 20, width: 120, height: 32 },
  viewport: { width: 1440, height: 900, dpr: 2 },
}

describe('FeedbackService', () => {
  let repo: MockRepository<BetaFeedbackEntity>

  beforeEach(() => {
    repo = createMockRepository<BetaFeedbackEntity>()
  })

  it('persists feedback scoped to the caller (userId from token, not body)', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    const dto = {
      category: 'bug',
      message: 'ça plante',
      accountId: 'acc-1',
      pageUrl: '/accounts',
      userEmail: 'x@y.z',
    } as CreateFeedbackDto
    await service.create('user-1', dto)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', account_id: 'acc-1', category: 'bug', message: 'ça plante' }),
    )
    expect(repo.save).toHaveBeenCalled()
  })

  it('stores the GitHub issue number/url when the integration opens one', async () => {
    const github = makeGithub({ number: 42, url: 'https://github.com/o/r/issues/42' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    await service.create('user-1', { category: 'metier', message: 'trop de contacts' } as CreateFeedbackDto)
    expect(github.createIssue).toHaveBeenCalled()
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ github_issue_number: 42, github_issue_url: 'https://github.com/o/r/issues/42' }),
    )
  })

  it('still persists feedback when GitHub is disabled (issue null)', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await service.create('user-1', { category: 'autre', message: 'idée' } as CreateFeedbackDto)
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ github_issue_number: null, github_issue_url: null, account_id: null }),
    )
    expect(repo.save).toHaveBeenCalled()
  })

  it('puts the pointed element and its source line in the issue body', async () => {
    const github = makeGithub({ number: 7, url: 'https://github.com/o/r/issues/7' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'le bouton ne fait rien',
      elementContext: ELEMENT_CONTEXT,
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Élément pointé')
    expect(body).toContain('apps/web/src/features/accounts/Card.tsx:42:7')
    expect(body).toContain('AccountCard ← Dashboard')
    expect(body).toContain('div > button:nth-of-type(2)')
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ element_context: ELEMENT_CONTEXT }))
  })

  // #3895.1 (retour bêta ADD-SANOFI-09) — un markup coupé à la troncature
  // cliente (`MAX_HTML`, apps/web) doit se NOMMER dans l'issue, sinon un
  // extrait de recette (un long fil de conversation, un tableau) se lit comme
  // l'élément complet.
  it('#3895.1 — nomme un markup tronqué dans le corps de l’issue', async () => {
    const github = makeGithub({ number: 11, url: 'https://github.com/o/r/issues/11' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'le fil est coupé',
      elementContext: { ...ELEMENT_CONTEXT, html: '<div>…</div>', htmlTruncated: true },
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('tronqué')
  })

  it('#3895.1 — ne dit rien quand le markup est complet', async () => {
    const github = makeGithub({ number: 12, url: 'https://github.com/o/r/issues/12' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'ok',
      elementContext: { ...ELEMENT_CONTEXT, html: '<div>…</div>', htmlTruncated: false },
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).not.toContain('tronqué')
  })

  it('says the source is unknown rather than inventing one when the element is unstamped', async () => {
    const github = makeGithub({ number: 9, url: 'https://github.com/o/r/issues/9' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'composant tiers cassé',
      elementContext: { ...ELEMENT_CONTEXT, sourceFile: null, sourceChain: [] },
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('- Source : _inconnue (élément non estampillé)_')
    expect(body).not.toContain('Card.tsx')
    // The rest of the identity still gets through — that's what makes it findable.
    expect(body).toContain('div > button:nth-of-type(2)')
  })

  // Le chaînon manquant : sans identifiant de corrélation, un « 500 » dans une
  // issue oblige à fouiller une journée de logs serveur ; avec, on ouvre la
  // trace exacte.
  it('joint les requêtes en échec avec leur identifiant de corrélation', async () => {
    const github = makeGithub({ number: 11, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'rien ne charge',
      networkFailures: [
        {
          time: '2026-08-14T18:00:00.000Z',
          method: 'GET',
          url: 'https://api.bellum-ai.com/accounts',
          status: 500,
          error: null,
          durationMs: 412,
          correlationId: 'a58136ff-a39f-4e85-9d9c-f40e83764b81',
        },
      ],
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Requêtes en échec')
    expect(body).toContain('| 500 | 412 ms | a58136ff-a39f-4e85-9d9c-f40e83764b81 |')
  })

  it('laisse la case corrélation VIDE quand l’en-tête n’était pas lisible', async () => {
    const github = makeGithub({ number: 12, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'coupure',
      networkFailures: [
        {
          time: '2026-08-14T18:00:00.000Z',
          method: 'POST',
          url: 'https://api.bellum-ai.com/feedback',
          status: null,
          error: 'Failed to fetch',
          durationMs: 30,
          correlationId: null,
        },
      ],
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('| Failed to fetch | 30 ms |  |')
  })

  it('joint le fil des dernières actions et l’état de l’app', async () => {
    const github = makeGithub({ number: 13, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'écran vide',
      breadcrumbs: [
        { time: '2026-08-14T17:59:00.000Z', type: 'navigation', label: '/accounts' },
        { time: '2026-08-14T17:59:30.000Z', type: 'click', label: 'Enrichir (Card.tsx:42:7)' },
      ],
      appContext: APP_CONTEXT,
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Fil des dernières actions')
    expect(body).toContain('clic : Enrichir (Card.tsx:42:7)')
    expect(body).toContain('- Build : `26.08.14-ts1789000000+a1b2c3d4e5` (prod)')
    expect(body).toContain('Thème : dark · Langue : fr · Fuseau : Europe/Paris')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ client_context: expect.objectContaining({ appContext: APP_CONTEXT }) }),
    )
  })

  // La ligne 42 d'aujourd'hui n'est pas la ligne 42 du build que la personne
  // avait sous les yeux : l'extrait se lit au commit du build, ou pas du tout.
  it('lit le code AU COMMIT du build affiché', async () => {
    const github = makeGithub({ number: 14, url: 'u' }, null, {
      path: 'apps/web/src/features/accounts/Card.tsx',
      line: 42,
      ref: 'a1b2c3d4e5',
      snippet: '>   42 |   const x = 1',
    })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'bouton mort',
      elementContext: ELEMENT_CONTEXT,
      appContext: APP_CONTEXT,
    } as unknown as CreateFeedbackDto)

    expect(github.codeExcerpt).toHaveBeenCalledWith('apps/web/src/features/accounts/Card.tsx:42:7', 'a1b2c3d4e5')
    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Code — `apps/web/src/features/accounts/Card.tsx:42` au commit `a1b2c3d4e5`')
    expect(body).toContain('>   42 |   const x = 1')
  })

  it('ne réclame aucun code quand la version du build ne porte pas de commit', async () => {
    const github = makeGithub({ number: 15, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'depuis mon poste',
      elementContext: ELEMENT_CONTEXT,
      appContext: { ...APP_CONTEXT, buildVersion: 'dev' },
    } as unknown as CreateFeedbackDto)

    expect(github.codeExcerpt).toHaveBeenCalledWith('apps/web/src/features/accounts/Card.tsx:42:7', null)
    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).not.toContain('### Code —')
  })

  it('n’écrit aucun contexte client quand le navigateur n’avait rien à dire', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await service.create('user-1', { category: 'autre', message: 'idée' } as CreateFeedbackDto)
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ client_context: null }))
  })

  it('met l’écran dans le titre et cite le message', async () => {
    const github = makeGithub({ number: 16, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'le bouton ne fait rien',
      appContext: APP_CONTEXT,
    } as unknown as CreateFeedbackDto)

    const { title, body } = (github.createIssue as jest.Mock).mock.calls[0][0] as {
      title: string
      body: string
    }
    // Une liste d'issues qui commencent toutes par `[beta:bug]` ne se trie pas.
    expect(title).toBe('[beta:bug] /integrations — le bouton ne fait rien')
    expect(body).toContain('> le bouton ne fait rien')
  })

  it('retombe sur l’URL de page quand le contexte applicatif manque', async () => {
    const github = makeGithub({ number: 17, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'cassé',
      pageUrl: 'https://app.bellum-ai.com/accounts/42',
    } as CreateFeedbackDto)

    const { title } = (github.createIssue as jest.Mock).mock.calls[0][0] as { title: string }
    expect(title).toBe('[beta:bug] /accounts/42 — cassé')
  })

  it('joint les commandes pour retrouver le code et le markup réel', async () => {
    const github = makeGithub({ number: 18, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'bouton mort',
      elementContext: {
        ...ELEMENT_CONTEXT,
        componentStack: ['OAuthProviderCard', 'IntegrationCenterPage'],
        grepTokens: ['Reconnecter'],
        descriptor: 'button.btn[data-testid="reconnect"]',
        html: '<button class="btn" disabled>Reconnecter</button>',
      },
      appContext: APP_CONTEXT,
    } as unknown as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Localiser le code')
    expect(body).toContain('rg -n "function OAuthProviderCard" apps/web/src packages/ui/src')
    expect(body).toContain(`rg -n "createFileRoute('/integrations')" apps/web/src/routes`)
    // Le markup montre ce qu'aucun sélecteur ne dit — ici un `disabled`.
    expect(body).toContain('<button class="btn" disabled>Reconnecter</button>')
    expect(body).toContain('- Identité : `button.btn[data-testid="reconnect"]`')
  })

  it('joint l’état de l’issue à chaque retour, pour le back-office', async () => {
    const github = makeGithub({ number: 1, url: 'u' })
    ;(github as unknown as { listIssues: jest.Mock }).listIssues = jest
      .fn()
      .mockResolvedValue([
        { number: 913, state: 'closed', title: 't', url: 'u', comments: 2, updatedAt: 'x', closedAt: 'y', labels: [] },
      ])
    repo.find = jest.fn().mockResolvedValue([
      { id: 'a', github_issue_number: 913 },
      { id: 'b', github_issue_number: 999 }, // issue supprimée / hors label
      { id: 'c', github_issue_number: null }, // retour sans issue
    ]) as never
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    const { items, issuesAvailable } = await service.listAllWithIssues()

    expect(issuesAvailable).toBe(true)
    expect(items[0]?.issue?.state).toBe('closed')
    expect(items[1]?.issue).toBeNull()
    expect(items[2]?.issue).toBeNull()
  })

  // Sans ce drapeau, un jour de panne GitHub, l'écran afficherait « aucun retour
  // traité » et on rouvrirait des retours déjà réglés.
  it('dit qu’il n’a pas pu regarder plutôt que de conclure « aucun traité »', async () => {
    const github = makeGithub({ number: 1, url: 'u' })
    ;(github as unknown as { listIssues: jest.Mock }).listIssues = jest.fn().mockResolvedValue(null)
    repo.find = jest.fn().mockResolvedValue([{ id: 'a', github_issue_number: 913 }]) as never
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    const { items, issuesAvailable } = await service.listAllWithIssues()

    expect(issuesAvailable).toBe(false)
    expect(items[0]?.issue).toBeNull()
  })

  it('signe la réponse de son auteur — sinon elle sort sous l’identité du bot', async () => {
    const github = makeGithub({ number: 1, url: 'u' })
    const addComment = jest.fn().mockResolvedValue(true)
    ;(github as unknown as { addComment: jest.Mock }).addComment = addComment
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.commentOnIssue(913, 'On corrige demain.', 'Louis')

    expect(addComment).toHaveBeenCalledWith(913, 'On corrige demain.\n\n— Louis (via le back-office)')
  })

  it('dit d’où vient la réponse sans inventer QUI l’a écrite', async () => {
    const github = makeGithub({ number: 1, url: 'u' })
    const addComment = jest.fn().mockResolvedValue(true)
    ;(github as unknown as { addComment: jest.Mock }).addComment = addComment
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.commentOnIssue(913, 'Corrigé.', '   ')

    expect(addComment).toHaveBeenCalledWith(913, 'Corrigé.\n\n— via le back-office')
  })

  it('uploads the screenshot and embeds it in the issue', async () => {
    const github = makeGithub({ number: 8, url: 'u' }, 'https://github.com/o/r/blob/feedback-assets/a.png?raw=1')
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'cassé',
      screenshot: 'data:image/png;base64,zzz',
    } as CreateFeedbackDto)

    // #1792 — le préfixe data-URL est retiré AVANT d'appeler le chemin
    // généralisé : `uploadAsset` reçoit du base64 brut, jamais le préfixe.
    expect(github.uploadAsset).toHaveBeenCalledWith('zzz', 'image/png', 'screenshot.png')
    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('![capture](https://github.com/o/r/blob/feedback-assets/a.png?raw=1)')
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ screenshot_url: 'https://github.com/o/r/blob/feedback-assets/a.png?raw=1' }),
    )
  })

  // #1792 — une valeur qui ne ressemble PAS à ce que la capture produit
  // (n'importe quel data-URL) ne doit JAMAIS partir vers GitHub : c'est le
  // même filtre que l'ancien `DATA_URL_PNG`, déplacé ici puisque `screenshot`
  // reste un champ de CE service, généralisé au dépôt de pièces.
  it('n’envoie rien à GitHub quand le champ `screenshot` hérité n’a pas la forme attendue', async () => {
    const github = makeGithub({ number: 20, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'cassé',
      screenshot: 'https://evil.example/x.png',
    } as CreateFeedbackDto)

    expect(github.uploadAsset).not.toHaveBeenCalled()
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ screenshot_url: null }))
  })

  it('still reports when the screenshot upload fails', async () => {
    const github = makeGithub({ number: 9, url: 'u' }, null)
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'cassé',
      screenshot: 'data:image/png;base64,zzz',
    } as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('Disponible dans le dashboard-manager')
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ screenshot_url: null }))
  })

  /**
   * #1792 — UNE IMAGE JOINTE, EN PLUS DE LA CAPTURE.
   *
   * `screenshot` et `attachments` cohabitent : la capture automatique reste
   * son propre appel `uploadAsset`, la pièce choisie le sien — même mécanique,
   * deux invocations distinctes, jamais confondues.
   */
  describe('pièces jointes', () => {
    it('dépose une pièce jointe et l’EMBED dans l’issue (image)', async () => {
      const github = makeGithub({ number: 30, url: 'u' })
      ;(github.uploadAsset as jest.Mock).mockResolvedValueOnce({
        url: 'https://github.com/o/r/blob/feedback-assets/attachments/2026-09-09/x.png?raw=1',
        kind: 'png',
      })
      const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

      await service.create('user-1', {
        category: 'bug',
        message: 'contexte externe',
        attachments: [{ name: 'contexte.png', mimeType: 'image/png', dataBase64: 'zzz' }],
      } as unknown as CreateFeedbackDto)

      expect(github.uploadAsset).toHaveBeenCalledWith('zzz', 'image/png', 'contexte.png')
      const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
      expect(body).toContain('### Pièces jointes')
      expect(body).toContain(
        '![contexte.png](https://github.com/o/r/blob/feedback-assets/attachments/2026-09-09/x.png?raw=1)',
      )
    })

    it('LIE (sans embed) un PDF ou un texte — GitHub ne les rend pas inline', async () => {
      const github = makeGithub({ number: 31, url: 'u' })
      ;(github.uploadAsset as jest.Mock).mockResolvedValueOnce({
        url: 'https://github.com/o/r/blob/feedback-assets/attachments/2026-09-09/y.pdf?raw=1',
        kind: 'pdf',
      })
      const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

      await service.create('user-1', {
        category: 'metier',
        message: 'devis joint',
        attachments: [{ name: 'devis.pdf', mimeType: 'application/pdf', dataBase64: 'zzz' }],
      } as unknown as CreateFeedbackDto)

      const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
      expect(body).toContain(
        '- [devis.pdf](https://github.com/o/r/blob/feedback-assets/attachments/2026-09-09/y.pdf?raw=1)',
      )
      expect(body).not.toContain('![devis.pdf]')
    })

    /**
     * ⚠️ « JAMAIS un lien mort ni une pièce fantôme » — un dépôt qui rate DOIT
     * se nommer dans l'issue, jamais disparaître.
     */
    it('nomme une pièce dont le DÉPÔT a échoué — jamais un lien mort, jamais un silence', async () => {
      const github = makeGithub({ number: 32, url: 'u' })
      ;(github.uploadAsset as jest.Mock).mockResolvedValueOnce(null)
      const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

      await service.create('user-1', {
        category: 'bug',
        message: 'photo jointe',
        attachments: [{ name: 'suspect.png', mimeType: 'image/png', dataBase64: 'zzz' }],
      } as unknown as CreateFeedbackDto)

      const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
      expect(body).toContain('### Pièces jointes')
      expect(body).toContain("⚠️ suspect.png — n'a pas pu être déposée.")
      // Le signalement part quand même — un échec de dépôt ne bloque rien.
      expect(github.createIssue).toHaveBeenCalled()
    })

    it('boucle sur PLUSIEURS pièces, dans l’ordre, et mélange succès et échec sans en perdre une', async () => {
      const github = makeGithub({ number: 33, url: 'u' })
      const mock = github.uploadAsset as jest.Mock
      mock
        .mockResolvedValueOnce({
          url: 'https://github.com/o/r/blob/feedback-assets/attachments/a.png?raw=1',
          kind: 'png',
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          url: 'https://github.com/o/r/blob/feedback-assets/attachments/c.txt?raw=1',
          kind: 'txt',
        })
      const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

      await service.create('user-1', {
        category: 'bug',
        message: 'trois pièces',
        attachments: [
          { name: 'a.png', mimeType: 'image/png', dataBase64: 'aaa' },
          { name: 'b.png', mimeType: 'image/png', dataBase64: 'bbb' },
          { name: 'c.txt', mimeType: 'text/plain', dataBase64: 'ccc' },
        ],
      } as unknown as CreateFeedbackDto)

      expect(mock).toHaveBeenNthCalledWith(1, 'aaa', 'image/png', 'a.png')
      expect(mock).toHaveBeenNthCalledWith(2, 'bbb', 'image/png', 'b.png')
      expect(mock).toHaveBeenNthCalledWith(3, 'ccc', 'text/plain', 'c.txt')
      const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
      expect(body).toContain('![a.png](https://github.com/o/r/blob/feedback-assets/attachments/a.png?raw=1)')
      expect(body).toContain("⚠️ b.png — n'a pas pu être déposée.")
      expect(body).toContain('- [c.txt](https://github.com/o/r/blob/feedback-assets/attachments/c.txt?raw=1)')
    })

    it('garde les métadonnées des pièces (nom + lien) en base — jamais le contenu', async () => {
      const github = makeGithub({ number: 34, url: 'u' })
      ;(github.uploadAsset as jest.Mock).mockResolvedValueOnce({
        url: 'https://github.com/o/r/blob/feedback-assets/attachments/a.png?raw=1',
        kind: 'png',
      })
      const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

      await service.create('user-1', {
        category: 'bug',
        message: 'une pièce',
        attachments: [{ name: 'a.png', mimeType: 'image/png', dataBase64: 'CECI-NE-DOIT-PAS-VOYAGER-EN-BASE' }],
      } as unknown as CreateFeedbackDto)

      const row = repo.create.mock.calls[0]?.[0] as { client_context?: Record<string, unknown> }
      expect(row.client_context).toMatchObject({
        attachments: [{ name: 'a.png', url: 'https://github.com/o/r/blob/feedback-assets/attachments/a.png?raw=1' }],
      })
      expect(JSON.stringify(row.client_context)).not.toContain('CECI-NE-DOIT-PAS-VOYAGER-EN-BASE')
    })

    it('sans pièce jointe, `attachments` n’apparaît pas dans le contexte — comme avant #1792', async () => {
      const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
      await service.create('user-1', { category: 'autre', message: 'idée' } as CreateFeedbackDto)
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ client_context: null }))
    })
  })

  it('keeps the tail of the buffers and flags truncation', async () => {
    const github = makeGithub({ number: 10, url: 'u' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', {
      category: 'bug',
      message: 'boom',
      errorLogs: `${'x'.repeat(6000)}DERNIERE_ERREUR`,
      consoleLogs: 'log tranquille',
    } as CreateFeedbackDto)

    const { body } = (github.createIssue as jest.Mock).mock.calls[0][0] as { body: string }
    expect(body).toContain('### Erreurs récentes')
    expect(body).toContain('DERNIERE_ERREUR')
    expect(body).toContain('… (début tronqué)')
    expect(body).toContain('### Logs console')
  })

  it('lists all feedback for the internal view, capped', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await service.listAll(9999)
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { created_at: 'DESC' }, take: 200 }))
  })

  it('enregistre la portée la plus fermée, et l’ÉCRIT dans l’issue', async () => {
    // Addendum Stelya §20 : « ses réponses ne doivent pas devenir un avantage
    // direct pour ses concurrents ». Un retour se réutilise sur décision, jamais
    // par omission — et une colonne que personne ne voit ne protège rien, d'où
    // la mention dans le corps de l'issue.
    const github = makeGithub({ number: 7, url: 'https://github.com/o/r/issues/7' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    await service.create('user-1', { category: 'metier', message: 'nos zones' } as CreateFeedbackDto)

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ reuse_scope: 'tenant_private' }))
    const body = (github.createIssue as jest.Mock).mock.calls[0]?.[0]?.body as string
    expect(body).toContain('privée à cet espace')
    expect(body).toContain('ANONYMISÉ')
  })
})

/**
 * UN SIGNALEMENT VENU DU BACK-OFFICE.
 *
 * L'opérateur qui voit un défaut dans le back-office devait jusqu'alors rouvrir
 * l'application cliente et refaire le geste ailleurs. Ce qui se teste ici n'est
 * pas le formulaire : c'est qu'on n'ATTRIBUE le retour à personne.
 */
describe('FeedbackService — le retour d’un opérateur', () => {
  let repo: MockRepository<BetaFeedbackEntity>

  beforeEach(() => {
    repo = createMockRepository<BetaFeedbackEntity>()
  })

  const OPERATOR_DTO = {
    category: 'bug',
    message: 'La liste des ESN affiche deux fois la même ligne.',
    pageUrl: 'https://backoffice/clients?view=esn',
  } as CreateFeedbackDto

  /**
   * ⚠️ LA RÈGLE. Un opérateur s'authentifie en Basic Auth devant le back-office :
   * il n'a pas de profil Bellum. Lui en inventer un ferait porter le retour par
   * quelqu'un qui ne l'a pas écrit — sur une table qui sert d'historique, c'est
   * une falsification.
   */
  it('n’attribue le retour à AUCUN utilisateur', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))

    await service.create(null, OPERATOR_DTO, 'louis')

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }))
  })

  it('garde le nom de l’opérateur — l’auteur reste DIT, ailleurs', async () => {
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))

    await service.create(null, OPERATOR_DTO, 'louis')

    const row = repo.create.mock.calls[0]?.[0] as { client_context?: Record<string, unknown> }
    expect(row.client_context).toMatchObject({ source: 'backoffice', operator: 'louis' })
  })

  /**
   * Le tri du chantier lit ces étiquettes. Un retour d'opérateur ne se traite pas
   * comme un retour de bêta-testeur : il n'y a personne à qui répondre.
   */
  it('étiquette l’issue « beta-backoffice », en plus des deux habituelles', async () => {
    const github = makeGithub({ number: 42, url: 'https://github.com/x/y/issues/42' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create(null, OPERATOR_DTO, 'louis')

    expect(github.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['beta-feedback', 'feedback:bug', 'beta-backoffice'] }),
    )
  })

  it('nomme l’opérateur dans le corps de l’issue, et ne prétend aucun utilisateur', async () => {
    const github = makeGithub({ number: 42, url: 'https://github.com/x/y/issues/42' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create(null, OPERATOR_DTO, 'louis')

    const body = (github.createIssue as jest.Mock).mock.calls[0][0].body as string
    expect(body).toContain('Opérateur (back-office) : louis')
    expect(body).not.toContain('Utilisateur :')
  })

  /**
   * ⚠️ La preuve que cette garde sait dire NON dans l'autre sens : un retour de
   * bêta-testeur ne DOIT PAS gagner l'étiquette ni la source du back-office.
   */
  it('ne marque PAS « back-office » un retour de bêta-testeur', async () => {
    const github = makeGithub({ number: 7, url: 'https://github.com/x/y/issues/7' })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)

    await service.create('user-1', { ...OPERATOR_DTO, appContext: APP_CONTEXT } as CreateFeedbackDto)

    expect(github.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['beta-feedback', 'feedback:bug'] }),
    )
    const row = repo.create.mock.calls[0]?.[0] as { client_context?: Record<string, unknown>; user_id?: unknown }
    expect(row.user_id).toBe('user-1')
    expect(row.client_context).not.toHaveProperty('source')
  })
})

/**
 * La capture d'écran ne voyage plus dans la LISTE (07/09/2026).
 *
 * MESURÉ EN PRODUCTION, pas déduit : l'écran des retours du back-office rendait
 * **34,7 Mo d'HTML** en 5,6 s, dont **32,6 Mo — 94 % du poids** — de captures en
 * base64 inlinées, une par retour, 181 en tout, TOUTES dans un `<details>`
 * replié que personne n'ouvre. La page suivante la plus lourde de la console
 * fait 391 Ko.
 *
 * ⚠️ Le coût venait du TRANSPORT, pas de l'affichage : la carte est un composant
 * client, et Next sérialise l'intégralité de ses props dans la charge utile.
 * Ne pas rendre l'`<img>` n'aurait rien économisé — c'est la donnée qui devait
 * cesser de voyager. C'est cette moitié-là que ce test tient.
 */
describe('listAllWithIssues — la capture ne voyage plus dans la liste', () => {
  function repoAvecLignes(lignes: Partial<BetaFeedbackEntity>[]) {
    const r = createMockRepository<BetaFeedbackEntity>()
    ;(r.find as jest.Mock).mockResolvedValue(lignes)
    return r
  }

  const CAPTURE = `data:image/png;base64,${'A'.repeat(400)}`

  /** `listAllWithIssues` interroge AUSSI GitHub — le double factice le dit. */
  function githubSansIssues() {
    return { ...(makeGithub(null) as object), listIssues: jest.fn().mockResolvedValue([]) } as never
  }

  it('LIT quelque chose — la liste rend bien les retours', async () => {
    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', github_issue_number: null, screenshot_url: CAPTURE } as never]) as never,
      members as never,
      workspaces as never,
      githubSansIssues(),
    )
    const { items } = await service.listAllWithIssues(10)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('a')
  })

  it('SAIT DIRE NON — ni `screenshot` ni `screenshot_url` ne sortent', async () => {
    const service = new FeedbackService(
      repoAvecLignes([
        { id: 'a', github_issue_number: null, screenshot_url: CAPTURE } as never,
        { id: 'b', github_issue_number: null, screenshot: CAPTURE } as never,
      ]) as never,
      members as never,
      workspaces as never,
      githubSansIssues(),
    )
    const { items } = await service.listAllWithIssues(10)

    // La preuve la plus directe : le poids sérialisé. 32,6 Mo se cachaient là.
    const serialise = JSON.stringify(items)
    expect(serialise).not.toContain('base64')
    expect(serialise.length).toBeLessThan(1000)

    for (const item of items) {
      expect(item).not.toHaveProperty('screenshot')
      expect(item).not.toHaveProperty('screenshot_url')
    }
  })

  it('mais la liste DIT qu’il y en a une — sinon l’écran ne saurait pas quoi proposer', async () => {
    const service = new FeedbackService(
      repoAvecLignes([
        { id: 'a', github_issue_number: null, screenshot_url: CAPTURE } as never,
        { id: 'b', github_issue_number: null, screenshot: CAPTURE } as never,
        { id: 'c', github_issue_number: null } as never,
      ]) as never,
      members as never,
      workspaces as never,
      githubSansIssues(),
    )
    const { items } = await service.listAllWithIssues(10)
    expect(items.map(i => i.has_screenshot)).toEqual([true, true, false])
  })

  /**
   * #1792 (bug trouvé en chemin, 09/09) — MÊME TRAITEMENT que la capture : le
   * lien réel (potentiellement une donnée personnelle, une capture d'écran
   * client) ne voyage pas dans la liste, seul un booléen dit qu'il y en a. Le
   * lien se demande à part, sur `attachmentsFor` / `:id/attachments`.
   */
  it('la liste DIT qu’il y a des pièces jointes, sans en transporter le lien', async () => {
    const service = new FeedbackService(
      repoAvecLignes([
        {
          id: 'a',
          github_issue_number: null,
          client_context: { attachments: [{ name: 'contexte.png', url: 'https://x/contexte.png?raw=1' }] },
        } as never,
        { id: 'b', github_issue_number: null, client_context: { appContext: { route: '/x' } } } as never,
        { id: 'c', github_issue_number: null, client_context: null } as never,
      ]) as never,
      members as never,
      workspaces as never,
      githubSansIssues(),
    )
    const { items } = await service.listAllWithIssues(10)

    expect(items.map(i => i.has_attachments)).toEqual([true, false, false])
    // La preuve directe : ni le nom ni le lien ne se retrouvent dans la liste.
    expect(JSON.stringify(items)).not.toContain('contexte.png')
    // Le reste du contexte client, lui, n'est pas touché par le retrait.
    expect(items[1]?.client_context).toEqual({ appContext: { route: '/x' } })
  })
})

describe('screenshotFor — la capture d’UN retour, à la demande', () => {
  it('préfère le BASE64 au miroir GitHub — c’est le seul des deux qui s’affiche', async () => {
    // ⚠️ L'entité le dit depuis l'origine : `screenshot` est « rendered in the
    // dashboard-manager », `screenshot_url` est « mirrored to the GitHub repo so
    // the ISSUE can embed it ». Le miroir est un blob de dépôt PRIVÉ : il ne
    // s'affiche que là où le lecteur est authentifié chez GitHub.
    // Mesuré en production le 07/09/2026 : cinq captures sur cinq rendaient une
    // `<img>` avec `naturalWidth === 0`. Aucune ne s'est jamais affichée.
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      screenshot_url: 'https://github.com/org/repo/blob/x.png?raw=1',
      screenshot: 'data:image/png;base64,AAAA',
    })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.screenshotFor('id-1')).resolves.toBe('data:image/png;base64,AAAA')
  })

  it('retombe sur le miroir quand le base64 manque — une capture partielle vaut mieux qu’aucune', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ screenshot_url: 'https://x/y.png', screenshot: null })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.screenshotFor('id-1')).resolves.toBe('https://x/y.png')
  })

  it('sait dire NON — un retour inconnu, ou sans capture, rend `null` et rien d’autre', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue(null)
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.screenshotFor('inconnu')).resolves.toBeNull()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ screenshot_url: null, screenshot: null })
    await expect(service.screenshotFor('id-2')).resolves.toBeNull()
  })
})

/**
 * #1792 (bug trouvé en chemin, 09/09) — LES PIÈCES JOINTES D'UN RETOUR, à la
 * demande, EXACTEMENT comme `screenshotFor` : l'écran back-office affichait
 * déjà la capture via un endpoint dédié, l'équivalent pour les pièces
 * n'existait pas — une colonne écrite (`client_context.attachments`) que
 * personne ne lisait.
 */
describe('attachmentsFor — les pièces jointes d’UN retour, à la demande', () => {
  it('rend les pièces telles que stockées — nom et lien, jamais le contenu', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      client_context: { attachments: [{ name: 'a.png', url: 'https://github.com/o/r/blob/x/a.png?raw=1' }] },
    })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.attachmentsFor('id-1')).resolves.toEqual([
      { name: 'a.png', url: 'https://github.com/o/r/blob/x/a.png?raw=1' },
    ])
  })

  it('garde un échec de dépôt NOMMÉ — `url: null`, jamais un lien mort inventé', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      client_context: { attachments: [{ name: 'suspect.png', url: null }] },
    })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.attachmentsFor('id-1')).resolves.toEqual([{ name: 'suspect.png', url: null }])
  })

  it('sait dire NON — un retour inconnu rend `null`, un retour sans pièce rend `[]`', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue(null)
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.attachmentsFor('inconnu')).resolves.toBeNull()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ client_context: null })
    await expect(service.attachmentsFor('id-2')).resolves.toEqual([])
  })

  it('ignore une forme malformée plutôt que de la faire remonter telle quelle', async () => {
    const repo = createMockRepository<BetaFeedbackEntity>()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ client_context: { attachments: 'pas-un-tableau' } })
    const service = new FeedbackService(repo as never, members as never, workspaces as never, makeGithub(null))
    await expect(service.attachmentsFor('id-3')).resolves.toEqual([])
  })
})

/**
 * #1658.2 — LE DÉLAI DE RÉPONSE ET L'ESPACE QUI A REMONTÉ.
 *
 * Les deux moitiés que l'écran n'avait pas : quand quelqu'un a répondu, et chez
 * qui le retour a été écrit. Chacune porte sa distinction « je n'ai pas pu
 * regarder » — sans elle, une intégration éteinte se lirait « personne n'a
 * jamais répondu », ce qui est le mensonge le plus coûteux de cet écran.
 */
describe('listAllWithIssues — le délai de réponse et l’espace (#1658.2)', () => {
  function repoAvecLignes(lignes: Partial<BetaFeedbackEntity>[]) {
    const r = createMockRepository<BetaFeedbackEntity>()
    ;(r.find as jest.Mock).mockResolvedValue(lignes)
    return r
  }

  function githubAvecReponses(premieres: Map<number, string> | null) {
    return {
      ...(makeGithub(null) as object),
      listIssues: jest.fn().mockResolvedValue([]),
      firstHumanResponses: jest.fn().mockResolvedValue(premieres),
    } as never
  }

  function membresVides() {
    const m = createMockRepository<WorkspaceMemberEntity>()
    ;(m.find as jest.Mock).mockResolvedValue([])
    return m
  }

  it('rend la date de la première réponse HUMAINE, par numéro d’issue', async () => {
    const service = new FeedbackService(
      repoAvecLignes([
        { id: 'a', user_id: null, github_issue_number: 42 } as never,
        { id: 'b', user_id: null, github_issue_number: 43 } as never,
      ]) as never,
      membresVides() as never,
      workspaces as never,
      githubAvecReponses(new Map([[42, '2026-09-05T10:00:00.000Z']])),
    )
    const { items, responsesAvailable } = await service.listAllWithIssues(10)

    expect(responsesAvailable).toBe(true)
    expect(items[0]?.first_response_at).toBe('2026-09-05T10:00:00.000Z')
    // Une issue absente de la carte est une issue SANS réponse humaine : un
    // fait, pas une lacune — et `responsesAvailable` dit qu'on a bien regardé.
    expect(items[1]?.first_response_at).toBeNull()
  })

  it('DISTINGUE « personne n’a répondu » de « je n’ai pas pu regarder »', async () => {
    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', user_id: null, github_issue_number: 42 } as never]) as never,
      membresVides() as never,
      workspaces as never,
      githubAvecReponses(null),
    )
    const { items, responsesAvailable } = await service.listAllWithIssues(10)

    expect(responsesAvailable).toBe(false)
    expect(items[0]?.first_response_at).toBeNull()
  })

  it('un retour SANS issue n’a pas de délai — il n’y a nulle part où répondre', async () => {
    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', user_id: null, github_issue_number: null } as never]) as never,
      membresVides() as never,
      workspaces as never,
      githubAvecReponses(new Map([[42, '2026-09-05T10:00:00.000Z']])),
    )
    const { items } = await service.listAllWithIssues(10)
    expect(items[0]?.first_response_at).toBeNull()
  })

  it('rend TOUS les espaces de l’auteur — l’ambiguïté se dit, elle ne se tranche pas', async () => {
    // `beta_feedback` n'a pas de `workspace_id` : un auteur membre de deux
    // espaces rend le rattachement ambigu. En choisir un enverrait l'opérateur
    // chez le mauvais client sans jamais le lui dire.
    const membres = createMockRepository<WorkspaceMemberEntity>()
    ;(membres.find as jest.Mock).mockResolvedValue([
      { user_id: 'u1', workspace_id: 'w1' },
      { user_id: 'u1', workspace_id: 'w2' },
    ])
    const espaces = createMockRepository<WorkspaceEntity>()
    ;(espaces.find as jest.Mock).mockResolvedValue([
      { id: 'w1', name: 'ESN Alpha' },
      { id: 'w2', name: 'ESN Beta' },
    ])

    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', user_id: 'u1', github_issue_number: null } as never]) as never,
      membres as never,
      espaces as never,
      githubAvecReponses(null),
    )
    const { items } = await service.listAllWithIssues(10)

    expect(items[0]?.workspaces).toEqual([
      { id: 'w1', name: 'ESN Alpha' },
      { id: 'w2', name: 'ESN Beta' },
    ])
  })

  it('un retour du BACK-OFFICE n’appartient à aucun espace — et rend `null`, pas une liste vide', async () => {
    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', user_id: null, github_issue_number: null } as never]) as never,
      membresVides() as never,
      workspaces as never,
      githubAvecReponses(null),
    )
    const { items } = await service.listAllWithIssues(10)
    // `null` : il n'y a pas d'auteur, donc pas d'espace à chercher. `[]` se
    // lirait « cet auteur n'est dans aucun espace », ce qui est autre chose.
    expect(items[0]?.workspaces).toBeNull()
  })

  it('n’invente pas de nom pour un espace disparu dont l’adhésion traîne', async () => {
    const membres = createMockRepository<WorkspaceMemberEntity>()
    ;(membres.find as jest.Mock).mockResolvedValue([{ user_id: 'u1', workspace_id: 'supprime' }])
    const espaces = createMockRepository<WorkspaceEntity>()
    ;(espaces.find as jest.Mock).mockResolvedValue([])

    const service = new FeedbackService(
      repoAvecLignes([{ id: 'a', user_id: 'u1', github_issue_number: null } as never]) as never,
      membres as never,
      espaces as never,
      githubAvecReponses(null),
    )
    const { items } = await service.listAllWithIssues(10)
    expect(items[0]?.workspaces).toBeNull()
  })
})

// #2444.10 — CORRECTION LIVRÉE, NOTIFIE UNE FOIS.
describe('notifyResolvedReports — la correction livrée notifie, une seule fois', () => {
  function repoAvecCandidats(rows: Partial<BetaFeedbackEntity>[]) {
    const r = createMockRepository<BetaFeedbackEntity>()
    ;(r.find as jest.Mock).mockResolvedValue(rows)
    return r
  }

  function githubAvecProgress(progress: Map<number, Record<string, unknown>> | null) {
    return { ...(makeGithub(null) as object), issueProgress: jest.fn().mockResolvedValue(progress) } as never
  }

  it('un ticket CORRIGÉ (fermé COMPLETED) notifie son auteur et marque la ligne', async () => {
    const repo = repoAvecCandidats([{ id: 'a', user_id: 'u1', github_issue_number: 42, notified_fixed_at: null }])
    const github = githubAvecProgress(
      new Map([[42, { state: 'closed', stateReason: 'COMPLETED', assigned: true, labels: [], humanComment: true }]]),
    )
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    const notify = jest.fn().mockResolvedValue(undefined)

    const notified = await service.notifyResolvedReports(notify)

    expect(notified).toBe(1)
    expect(notify).toHaveBeenCalledWith('u1', 42)
    expect(repo.update).toHaveBeenCalledWith('a', { notified_fixed_at: expect.any(Date) })
  })

  it('SAIT DIRE NON — un ticket encore OUVERT ne notifie personne', async () => {
    const repo = repoAvecCandidats([{ id: 'a', user_id: 'u1', github_issue_number: 42, notified_fixed_at: null }])
    const github = githubAvecProgress(
      new Map([[42, { state: 'open', stateReason: null, assigned: false, labels: [], humanComment: false }]]),
    )
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    const notify = jest.fn().mockResolvedValue(undefined)

    const notified = await service.notifyResolvedReports(notify)

    expect(notified).toBe(0)
    expect(notify).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('un ticket fermé SANS SUITE (NOT_PLANNED) n’est pas une correction — pas de notification', async () => {
    const repo = repoAvecCandidats([{ id: 'a', user_id: 'u1', github_issue_number: 42, notified_fixed_at: null }])
    const github = githubAvecProgress(
      new Map([[42, { state: 'closed', stateReason: 'NOT_PLANNED', assigned: true, labels: [], humanComment: false }]]),
    )
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    const notify = jest.fn().mockResolvedValue(undefined)

    expect(await service.notifyResolvedReports(notify)).toBe(0)
    expect(notify).not.toHaveBeenCalled()
  })

  it('sans candidat, n’appelle même pas GitHub', async () => {
    const repo = repoAvecCandidats([])
    const github = githubAvecProgress(null)
    const service = new FeedbackService(repo as never, members as never, workspaces as never, github)
    const notify = jest.fn().mockResolvedValue(undefined)

    expect(await service.notifyResolvedReports(notify)).toBe(0)
    expect((github as unknown as { issueProgress: jest.Mock }).issueProgress).not.toHaveBeenCalled()
  })
})
