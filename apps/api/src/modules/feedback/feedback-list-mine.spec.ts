import type { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import type { WorkspaceEntity } from '../../database/entities/workspace.entity'
import type { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { createMockRepository } from '../../database/test-utils'
import { FeedbackService } from './feedback.service'
import type { GithubIssueService, IssueProgress } from './github-issue.service'

/**
 * #1960.10 — « MES SIGNALEMENTS » : CE QUE LA LECTURE A LE DROIT DE RENDRE.
 *
 * La page liste les signalements de la PERSONNE. `beta_feedback` ne porte pas
 * de `workspace_id` : le cloisonnement passe par l'auteur, et c'est le plus
 * fermé possible — aucun collègue, aucun gestionnaire de l'espace ne lit le
 * signalement d'un autre sans une décision écrite qui n'existe pas.
 *
 * Le dépôt de test FILTRE vraiment par `where.user_id` : un service qui
 * oublierait le filtre rendrait les lignes du collègue, et le test serait rouge.
 */

type Row = Pick<BetaFeedbackEntity, 'id' | 'user_id' | 'created_at' | 'category' | 'message' | 'github_issue_number'>

const ROWS: Row[] = [
  {
    id: 'fb-mine-1',
    user_id: 'u-1',
    created_at: new Date('2026-09-12T10:00:00.000Z'),
    category: 'bug',
    message: 'Mon CRM est déconnecté',
    github_issue_number: 913,
  },
  {
    id: 'fb-mine-2',
    user_id: 'u-1',
    created_at: new Date('2026-09-11T10:00:00.000Z'),
    category: 'autre',
    message: 'Aucun numéro attribué',
    github_issue_number: null,
  },
  {
    id: 'fb-colleague',
    user_id: 'u-2',
    created_at: new Date('2026-09-12T11:00:00.000Z'),
    category: 'bug',
    message: 'Le signalement d’un collègue du même espace',
    github_issue_number: 777,
  },
  {
    id: 'fb-operator',
    user_id: null,
    created_at: new Date('2026-09-12T12:00:00.000Z'),
    category: 'bug',
    message: 'Un signalement du back-office',
    github_issue_number: 778,
  },
]

function repoFilteringByAuthor(rows: Row[] = ROWS) {
  const repo = createMockRepository<BetaFeedbackEntity>()
  repo.find.mockImplementation(async (options: { where?: { user_id?: unknown } }) =>
    rows.filter(row => row.user_id === options.where?.user_id),
  )
  return repo
}

function githubReading(progress: Map<number, IssueProgress> | null) {
  const issueProgress = jest.fn().mockResolvedValue(progress)
  return { github: { issueProgress } as unknown as GithubIssueService, issueProgress }
}

const OPEN_UNTOUCHED: IssueProgress = {
  state: 'open',
  stateReason: null,
  assigned: false,
  labels: ['beta-feedback', 'feedback:bug'],
  humanComment: false,
}

function serviceWith(repo: ReturnType<typeof repoFilteringByAuthor>, github: GithubIssueService): FeedbackService {
  return new FeedbackService(
    repo as never,
    createMockRepository<WorkspaceMemberEntity>() as never,
    createMockRepository<WorkspaceEntity>() as never,
    github,
  )
}

describe('#1960.10 — FeedbackService.listMineWithStatus', () => {
  it('ne rend QUE les signalements de l’appelant — jamais ceux d’un collègue ni d’un opérateur', async () => {
    const { github } = githubReading(new Map([[913, OPEN_UNTOUCHED]]))

    const reports = await serviceWith(repoFilteringByAuthor(), github).listMineWithStatus('u-1')

    expect(reports.map(report => report.row.id)).toEqual(['fb-mine-1', 'fb-mine-2'])
  })

  it('ne demande l’état QUE des références de l’appelant — celle d’un collègue ne part jamais', async () => {
    const { github, issueProgress } = githubReading(new Map())

    await serviceWith(repoFilteringByAuthor(), github).listMineWithStatus('u-1')

    expect(issueProgress).toHaveBeenCalledTimes(1)
    expect(issueProgress).toHaveBeenCalledWith([913])
    expect(JSON.stringify(issueProgress.mock.calls)).not.toMatch(/777|778/)
  })

  it('lit la base par l’AUTEUR, et ne charge ni capture, ni journaux, ni liens, ni adresse', async () => {
    const repo = repoFilteringByAuthor()
    const { github } = githubReading(new Map())

    await serviceWith(repo, github).listMineWithStatus('u-1')

    const options = repo.find.mock.calls[0]?.[0] as { where: unknown; select: string[] }
    expect(options.where).toEqual({ user_id: 'u-1' })
    expect(options.select).toEqual(['id', 'created_at', 'category', 'message', 'github_issue_number'])
  })

  it('traduit l’état lu ; un signalement sans référence reste « état indisponible »', async () => {
    const { github } = githubReading(new Map([[913, OPEN_UNTOUCHED]]))

    const reports = await serviceWith(repoFilteringByAuthor(), github).listMineWithStatus('u-1')

    expect(reports.map(report => [report.row.id, report.status])).toEqual([
      ['fb-mine-1', 'received'],
      ['fb-mine-2', null],
    ])
  })

  // NON : un service de tickets muet (éteint, injoignable) n'est pas une file
  // d'attente. « Reçu » par défaut dirait qu'un signalement corrigé attend.
  it('service de tickets muet → état indisponible, JAMAIS « reçu »', async () => {
    const { github } = githubReading(null)

    const reports = await serviceWith(repoFilteringByAuthor(), github).listMineWithStatus('u-1')

    expect(reports.map(report => report.status)).toEqual([null, null])
  })

  it('aucune référence parmi ses signalements → aucune lecture du service de tickets', async () => {
    const { github, issueProgress } = githubReading(new Map())
    const repo = repoFilteringByAuthor([{ ...ROWS[1]!, user_id: 'u-3' }])

    const reports = await serviceWith(repo, github).listMineWithStatus('u-3')

    expect(reports).toHaveLength(1)
    expect(issueProgress).not.toHaveBeenCalled()
  })
})
