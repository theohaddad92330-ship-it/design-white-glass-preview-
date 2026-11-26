import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ReportStatus } from '@bellum/contracts'
import { In, IsNull, Not, Repository } from 'typeorm'
import { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { CreateFeedbackDto } from './dto/feedback.dto'
import { GithubIssueService, type AttachmentKind, type IssueComment, type IssueSummary } from './github-issue.service'
import { buildLocateCommands } from './locate-code'
import { creationLabels, reportStatusOf } from './report-status'
import { redactReportUrls } from './report-url'

const CONSOLE_LOGS_IN_ISSUE = 8000
const ERROR_LOGS_IN_ISSUE = 6000

type ElementContext = NonNullable<CreateFeedbackDto['elementContext']>
type NetworkFailure = NonNullable<CreateFeedbackDto['networkFailures']>[number]
type Breadcrumb = NonNullable<CreateFeedbackDto['breadcrumbs']>[number]
type AppContext = NonNullable<CreateFeedbackDto['appContext']>
type Attachment = NonNullable<CreateFeedbackDto['attachments']>[number]
type CodeExcerpt = { path: string; line: number; ref: string; snippet: string }
/** Une pièce jointe RÉELLEMENT déposée sur la branche d'actifs. */
type UploadedAttachment = { name: string; url: string; kind: AttachmentKind }
/** Le résultat du dépôt de TOUTES les pièces d'un signalement — voir {@link FeedbackService.uploadAttachments}. */
type AttachmentUploads = { uploaded: UploadedAttachment[]; failed: string[] }

/** `YY.MM.DD-ts1234567890+abc1234567` — le SHA est ce qui suit le `+`. */
const BUILD_COMMIT = /\+([0-9a-f]{7,40})$/

/** Le format que produit `canvas.toDataURL('image/png')` — la seule forme du champ hérité `screenshot`. */
const SCREENSHOT_DATA_URL = /^data:image\/png;base64,/

/**
 * #1792 — LE CHAMP `screenshot` PASSE PAR LE MÊME CHEMIN GÉNÉRALISÉ que les
 * pièces jointes, plutôt que d'en garder un second qui divergerait. Une
 * valeur qui ne ressemble pas à ce que la capture produit ne part JAMAIS vers
 * GitHub — sans ce filtre, `uploadAsset` ferait quand même le travail (le
 * flairage rejette le contenu qui ne correspond à rien), mais un appel réseau
 * inutile n'a pas de raison d'exister ici. `null` = rien à envoyer.
 */
function screenshotAsAsset(
  screenshot: string | null | undefined,
): { dataBase64: string; mimeType: string; name: string } | null {
  if (!screenshot || !SCREENSHOT_DATA_URL.test(screenshot)) return null
  return { dataBase64: screenshot.replace(SCREENSHOT_DATA_URL, ''), mimeType: 'image/png', name: 'screenshot.png' }
}

/** Les quatre types acceptés qui s'affichent en image plutôt qu'en lien. */
function isImageKind(kind: AttachmentKind): boolean {
  return kind === 'png' || kind === 'jpg' || kind === 'gif' || kind === 'webp'
}

/** Une pièce jointe telle que rangée dans `client_context.attachments` — nom et lien, jamais le contenu. */
type ClientContextAttachment = { name: string; url: string | null }

/**
 * Lit `client_context.attachments`, tolérant à une forme absente ou
 * malformée (un back-office et une API qui se déploient séparément peuvent se
 * croiser sur une forme plus ancienne). Une entrée qui ne ressemble pas à une
 * pièce jointe est écartée plutôt que remontée telle quelle.
 */
function attachmentsOf(clientContext: Record<string, unknown> | null | undefined): ClientContextAttachment[] {
  const raw = clientContext?.['attachments']
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is ClientContextAttachment => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as Record<string, unknown>
    return typeof candidate['name'] === 'string' && (candidate['url'] === null || typeof candidate['url'] === 'string')
  })
}

/**
 * Le chemin d'une URL de page, quand le contexte applicatif manque (rapport
 * envoyé par une version du front antérieure à ce champ). Une URL illisible rend
 * `null` : mieux vaut pas d'écran dans le titre qu'un écran faux.
 */
function routeFromUrl(pageUrl: string | null): string | null {
  if (!pageUrl) return null
  try {
    return new URL(pageUrl).pathname || null
  } catch {
    return pageUrl.startsWith('/') ? (pageUrl.split('?')[0] ?? null) : null
  }
}

/**
 * Le commit derrière la version du build web. `null` dès que la version n'en
 * porte pas (build local, `dev`) : sans commit, on ne relit aucun code — un
 * extrait pris sur la mauvaise version envoie chercher un bug là où il n'est pas.
 */
/**
 * De quelle application vient ce retour.
 *
 * Le back-office estampille sa version `back-office+<sha>` ; l'application
 * cliente écrit `YY.MM.DD-tsUNIX+<sha>`. Le préfixe n'est donc pas décoratif :
 * c'est lui qui empêche d'envoyer quelqu'un chercher dans `apps/web` le
 * composant d'un écran du back-office.
 */
function originOfBuild(buildVersion: string | null): 'web' | 'backoffice' {
  return buildVersion?.startsWith('back-office') ? 'backoffice' : 'web'
}

function commitFromBuildVersion(buildVersion: string | null): string | null {
  if (!buildVersion) return null
  return BUILD_COMMIT.exec(buildVersion.trim())?.[1] ?? null
}

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name)

  constructor(
    @InjectRepository(BetaFeedbackEntity)
    private readonly feedback: Repository<BetaFeedbackEntity>,
    // #1658.2 — LECTURE SEULE. `beta_feedback` ne porte pas de `workspace_id` :
    // le lien vers l'espace qui a remonté passe par l'auteur, donc par ces deux
    // tables. Un repository injecté doit être DÉCLARÉ dans le module (GA-20).
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly github: GithubIssueService,
  ) {}

  /**
   * Un signalement.
   *
   * ⚠️ `userId` vaut `null` quand il vient du BACK-OFFICE : un opérateur
   * s'authentifie en Basic Auth devant le back-office, il n'a pas de profil
   * Bellum. Lui en inventer un attribuerait le retour à quelqu'un qui ne l'a pas
   * écrit — sur une table d'historique, c'est une falsification. Qui l'a écrit
   * reste dit : `operator` voyage dans `client_context` et dans l'issue.
   *
   * #1960.7 — les adresses perdent la valeur de leur requête et de leur ancre
   * AVANT tout usage (titre, corps du ticket, ligne enregistrée) : le navigateur
   * récent le fait déjà, mais un onglet plus ancien envoie encore l'adresse
   * entière, et c'est ici qu'est la porte. Voir `report-url.ts`.
   */
  async create(userId: string | null, input: CreateFeedbackDto, operator?: string | null): Promise<BetaFeedbackEntity> {
    const dto = redactReportUrls(input)
    // Mirror the screenshot first so the issue body can embed it, then open the
    // issue so the stored row carries its number/url. Both are best-effort — a
    // failed/disabled integration returns null and feedback is still persisted.
    const screenshotAsset = screenshotAsAsset(dto.screenshot)
    const screenshotUpload = screenshotAsset
      ? await this.github.uploadAsset(screenshotAsset.dataBase64, screenshotAsset.mimeType, screenshotAsset.name)
      : null
    const screenshotUrl = screenshotUpload?.url ?? null
    // #1792 — les pièces choisies par la personne, en plus de la capture
    // automatique ci-dessus. Séquentiel plutôt que `Promise.all` : deux appels
    // concurrents à `ensureAssetBranch` la première fois se marcheraient dessus.
    const attachmentUploads = await this.uploadAttachments(dto.attachments ?? [])
    const excerpt = await this.resolveCodeExcerpt(dto)
    const issue = await this.github.createIssue({
      title: this.buildIssueTitle(dto),
      body: this.buildIssueBody(userId, dto, screenshotUrl, excerpt, operator ?? null, attachmentUploads),
      // ⚠️ `beta-backoffice` et non un `beta-feedback` de plus : le tri du
      // chantier lit ces étiquettes, et un retour d'opérateur ne se traite pas
      // comme un retour de bêta-testeur — il n'y a personne à qui répondre.
      // #1960.10 — écrites à UN endroit : « Mes signalements » doit savoir
      // lesquelles viennent de la création pour ne pas les lire comme un tri.
      labels: creationLabels(dto.category, Boolean(operator)),
    })

    const row = this.feedback.create({
      user_id: userId,
      account_id: dto.accountId ?? null,
      category: dto.category,
      message: dto.message,
      user_email: dto.userEmail ?? null,
      page_url: dto.pageUrl ?? null,
      user_agent: dto.userAgent ?? null,
      console_logs: dto.consoleLogs ?? null,
      error_logs: dto.errorLogs ?? null,
      element_context: dto.elementContext ?? null,
      client_context: this.clientContext(dto, operator ?? null, attachmentUploads),
      screenshot: dto.screenshot ?? null,
      screenshot_url: screenshotUrl,
      // Toujours la portée la plus fermée : un retour se réutilise sur décision,
      // jamais par omission (addendum Stelya §20.1).
      reuse_scope: 'tenant_private',
      github_issue_number: issue?.number ?? null,
      github_issue_url: issue?.url ?? null,
    })
    const saved = await this.feedback.save(row)
    this.logger.log('Beta feedback received', {
      userId,
      category: dto.category,
      accountId: dto.accountId ?? null,
      githubIssue: issue?.number ?? null,
    })
    return saved
  }

  /**
   * #1960.10 — LES SIGNALEMENTS DE L'APPELANT, et rien que ce que « Mes
   * signalements » affiche.
   *
   * ⚠️ Filtré par l'AUTEUR, et c'est le cloisonnement le plus fermé possible :
   * `beta_feedback` ne porte pas de `workspace_id`, et aucune décision écrite
   * n'ouvre à un collègue ni à un gestionnaire de l'espace le signalement d'un
   * autre. `userId` vient du jeton, jamais de la requête.
   *
   * `select` borné : la ligne entière portait la capture en base64 (plusieurs
   * centaines de kilo-octets chacune), les journaux, l'adresse, les liens du
   * dépôt privé. Rien de tout cela ne sort de la base pour cette lecture.
   */
  async listMine(userId: string, limit = 50): Promise<BetaFeedbackEntity[]> {
    return this.feedback.find({
      where: { user_id: userId },
      select: ['id', 'created_at', 'category', 'message', 'github_issue_number'],
      order: { created_at: 'DESC' },
      take: this.cap(limit),
    })
  }

  /**
   * #1960.10 — ses signalements ET leur état, traduit par {@link reportStatusOf}.
   *
   * L'état ne se demande que pour les références de l'APPELANT — celles lues
   * ci-dessus, jamais un numéro venu du client. Sans aucune référence, le
   * service de tickets n'est pas appelé. `status: null` = état indisponible :
   * pas de référence, service éteint ou muet, ticket illisible.
   */
  async listMineWithStatus(
    userId: string,
    limit?: number,
  ): Promise<{ row: BetaFeedbackEntity; status: ReportStatus | null }[]> {
    const rows = await this.listMine(userId, limit)
    const references = rows.map(row => row.github_issue_number).filter((number): number is number => number != null)
    const progress = references.length > 0 ? await this.github.issueProgress(references) : null
    return rows.map(row => ({
      row,
      status: row.github_issue_number != null ? reportStatusOf(progress?.get(row.github_issue_number)) : null,
    }))
  }

  /**
   * #2444.10 — CORRECTION LIVRÉE, NOTIFIE — UNE SEULE FOIS.
   *
   * ─────────────────────────────────────────────────────────────────────────────
   * POURQUOI `notify` EST UN PARAMÈTRE, PAS UNE INJECTION
   * ─────────────────────────────────────────────────────────────────────────────
   * `NotificationsService` vit dans un module voisin ; le composer ici forcerait
   * `FeedbackModule` à l'importer, exactement le cliquet AU PLAFOND (GA-07) que
   * `OpsWeeklyReportService` documente déjà. L'appelant périodique (le
   * balayage) fournit le port ; ce service reste sans dépendance sur les
   * notifications, testable seul.
   *
   * Candidats : un `github_issue_number` posé, aucun `notified_fixed_at` — un
   * ticket déjà notifié ne renotifie jamais, même s'il reste `fixed` d'un
   * passage à l'autre. `reportStatusOf` fait la MÊME traduction que
   * `listMineWithStatus` : seul `fixed` (fermé `COMPLETED`) notifie — un
   * `closed_unresolved` (non prévu, doublon) n'est pas une correction.
   */
  async notifyResolvedReports(notify: (userId: string, issueNumber: number) => Promise<void>): Promise<number> {
    const candidates = await this.feedback.find({
      where: { user_id: Not(IsNull()), github_issue_number: Not(IsNull()), notified_fixed_at: IsNull() },
      select: ['id', 'user_id', 'github_issue_number'],
    })
    if (candidates.length === 0) return 0
    const numbers = candidates.map(row => row.github_issue_number as number)
    const progress = await this.github.issueProgress(numbers)
    let notified = 0
    for (const candidate of candidates) {
      const issueNumber = candidate.github_issue_number as number
      if (reportStatusOf(progress?.get(issueNumber)) !== 'fixed') continue
      await notify(candidate.user_id as string, issueNumber)
      await this.feedback.update(candidate.id, { notified_fixed_at: new Date() })
      notified += 1
    }
    return notified
  }

  /** All feedback, most recent first — internal (dashboard-manager) view. */
  async listAll(limit = 100): Promise<BetaFeedbackEntity[]> {
    return this.feedback.find({ order: { created_at: 'DESC' }, take: this.cap(limit) })
  }

  /**
   * Les retours ET leur état côté GitHub (ouvert / fermé / commenté), pour le
   * back-office.
   *
   * La base sait ce qui a été REMONTÉ ; seule l'issue sait ce qui en a été
   * FAIT. Sans cette jointure, le back-office affiche indéfiniment des retours
   * déjà traités, et personne ne s'y fie plus.
   *
   * `issuesAvailable: false` est la moitié qui compte : quand GitHub ne répond
   * pas, chaque `issue` vaut `null` — exactement comme un retour sans issue.
   * L'écran doit pouvoir dire « je n'ai pas pu regarder » au lieu d'afficher
   * « aucun retour traité » un jour de panne.
   */
  async listAllWithIssues(limit = 100): Promise<{
    items: (Omit<BetaFeedbackEntity, 'screenshot' | 'screenshot_url'> & {
      issue: IssueSummary | null
      has_screenshot: boolean
      has_attachments: boolean
      first_response_at: string | null
      workspaces: { id: string; name: string }[] | null
    })[]
    issuesAvailable: boolean
    responsesAvailable: boolean
  }> {
    const rows = await this.listAll(limit)
    const [issues, premieresReponses, espacesParAuteur] = await Promise.all([
      this.github.listIssues('all'),
      this.github.firstHumanResponses(),
      this.workspacesOfAuthors(rows),
    ])
    const byNumber = new Map((issues ?? []).map(issue => [issue.number, issue]))
    return {
      // ⚠️ LA CAPTURE NE VOYAGE PLUS DANS LA LISTE (07/09/2026).
      // Mesuré en production : l'écran des retours du back-office rendait
      // **34,7 Mo d'HTML**, dont **32,6 Mo — 94 % du poids** — de captures en
      // base64 inlinées, une par retour, TOUTES dans un `<details>` replié que
      // personne n'ouvre. 5,6 s de rendu, contre 391 Ko pour la page suivante la
      // plus lourde. La liste dit désormais QU'IL Y EN A UNE ; l'image se
      // demande une par une, à l'ouverture, sur `:id/screenshot`.
      //
      // #1792 — MÊME TRAITEMENT pour les pièces jointes : `client_context`
      // porte leur lien (potentiellement une donnée personnelle, la capture
      // d'un écran client), et ce lien ne voyage pas dans la liste non plus —
      // seul `has_attachments` le dit. Le lien se demande à part, sur
      // `attachmentsFor` / `:id/attachments`, exactement comme la capture.
      items: rows.map(({ screenshot, screenshot_url, client_context, ...row }) => {
        const attachments = attachmentsOf(client_context)
        const { attachments: _attachments, ...clientContextWithoutAttachments } = client_context ?? {}
        return {
          ...row,
          client_context: client_context ? clientContextWithoutAttachments : null,
          has_screenshot: Boolean(screenshot_url ?? screenshot),
          has_attachments: attachments.length > 0,
          issue: row.github_issue_number != null ? (byNumber.get(row.github_issue_number) ?? null) : null,
          // ⚠️ `null` ne veut PAS dire la même chose selon `responsesAvailable` :
          // sans lui, « personne n'a répondu » et « GitHub n'a pas répondu » se
          // ressembleraient. L'écran lit les DEUX, comme il le fait déjà pour
          // l'état des issues.
          first_response_at:
            row.github_issue_number != null ? (premieresReponses?.get(row.github_issue_number) ?? null) : null,
          workspaces: espacesParAuteur?.get(row.user_id ?? '') ?? null,
        }
      }),
      issuesAvailable: issues !== null,
      responsesAvailable: premieresReponses !== null,
    }
  }

  /**
   * #1658.2 — LES ESPACES DE L'AUTEUR D'UN RETOUR, et pourquoi c'est au PLURIEL.
   *
   * ⚠️ **`beta_feedback` NE PORTE PAS de `workspace_id`** — mesuré le 07/09/2026,
   * zéro occurrence dans l'entité comme dans les migrations. La table porte
   * `user_id` (l'auteur) et `account_id` (le dossier concerné, souvent nul).
   *
   * Le lien vers « l'espace qui a remonté » passe donc par l'AUTEUR, et il est
   * AMBIGU par construction : un utilisateur peut appartenir à plusieurs espaces
   * (`workspace_members` est unique par PAIRE, pas par utilisateur). En choisir
   * un — le premier, le plus récent — enverrait l'opérateur sur le mauvais
   * client sans jamais le lui dire. On rend donc TOUS les espaces de l'auteur, et
   * c'est l'écran qui dit « plusieurs espaces possibles » plutôt que de trancher.
   *
   * `null` pour un retour sans auteur : un signalement du back-office n'a pas
   * d'utilisateur Bellum, il n'appartient à aucun espace. C'est un fait, pas une
   * lacune — et surtout pas une liste vide, qui se lirait « cet auteur n'est dans
   * aucun espace ».
   */
  private async workspacesOfAuthors(
    rows: readonly BetaFeedbackEntity[],
  ): Promise<Map<string, { id: string; name: string }[]> | null> {
    const auteurs = [...new Set(rows.map(row => row.user_id).filter((id): id is string => Boolean(id)))]
    if (auteurs.length === 0) return new Map()

    const liens = await this.members.find({ where: { user_id: In(auteurs) } })
    if (liens.length === 0) return new Map()

    const espaces = await this.workspaces.find({
      where: { id: In([...new Set(liens.map(lien => lien.workspace_id))]) },
    })
    const nomParEspace = new Map(espaces.map(espace => [espace.id, espace.name]))

    const parAuteur = new Map<string, { id: string; name: string }[]>()
    for (const lien of liens) {
      const nom = nomParEspace.get(lien.workspace_id)
      // Un espace supprimé dont l'adhésion traîne : on ne l'invente pas, on ne
      // le nomme pas « inconnu » — il ne rejoint simplement aucune liste.
      if (!nom) continue
      const liste = parAuteur.get(lien.user_id) ?? []
      liste.push({ id: lien.workspace_id, name: nom })
      parAuteur.set(lien.user_id, liste)
    }
    return parAuteur
  }

  /**
   * La capture d'UN retour, à la demande.
   *
   * Rendue seule parce qu'elle pèse à elle seule autant que toute la page : le
   * couple « la liste dit qu'il y en a une / l'image se demande à l'ouverture »
   * est ce qui ramène l'écran de 34,7 Mo à quelques centaines de kilo-octets.
   *
   * `null` quand le retour n'existe pas OU n'a pas de capture — l'appelant
   * n'apprend rien de plus qu'en lisant `has_screenshot` dans la liste.
   *
   * ⚠️ L'ORDRE EST `screenshot` D'ABORD, ET C'EST LE CORRECTIF.
   * Les deux colonnes ne servent pas le même lecteur, et l'entité le dit depuis
   * l'origine : « screenshot — as a data URL (**rendered in the
   * dashboard-manager**) » ; « screenshot_url — mirrored to the GitHub repo **so
   * the issue can embed it** ». Le miroir GitHub est un blob d'un dépôt PRIVÉ :
   * il s'affiche dans une issue, où le lecteur est authentifié chez GitHub, et
   * NULLE PART ailleurs.
   *
   * Mesuré en production le 07/09/2026 : les cinq premières captures de
   * `/feedback` rendaient une `<img>` vers `github.com/Bellum-AI/…?raw=1`, toutes
   * avec `naturalWidth === 0`. Aucune capture ne s'est jamais affichée dans la
   * console — l'écran lisait `screenshot_url` alors que le base64 qui, lui,
   * s'affiche, était bien stocké à côté.
   *
   * L'ironie de l'ancien chemin : ce base64 VOYAGEAIT quand même — c'étaient les
   * 32,6 Mo de la liste — pour n'être jamais rendu. Il ne part plus qu'à
   * l'ouverture d'un pli, et cette fois il s'affiche.
   */
  async screenshotFor(id: string): Promise<string | null> {
    const row = await this.feedback.findOne({ where: { id }, select: ['id', 'screenshot', 'screenshot_url'] })
    if (!row) return null
    return row.screenshot ?? row.screenshot_url ?? null
  }

  /**
   * Les pièces jointes d'UN retour, à la demande — EXACTEMENT le modèle de
   * {@link screenshotFor}.
   *
   * #1792 — `client_context.attachments` (nom + lien GitHub, jamais le
   * contenu) était écrit en base sans qu'aucun écran ne le lise : le
   * back-office affichait déjà la capture via un endpoint dédié, l'équivalent
   * pour les pièces n'existait pas.
   *
   * `null` pour un retour INEXISTANT ; `[]` pour un retour qui existe mais n'a
   * aucune pièce — les deux absences ne se confondent pas, comme partout
   * ailleurs dans ce service.
   */
  async attachmentsFor(id: string): Promise<ClientContextAttachment[] | null> {
    const row = await this.feedback.findOne({ where: { id }, select: ['id', 'client_context'] })
    if (!row) return null
    return attachmentsOf(row.client_context)
  }

  /** Ferme ou rouvre le retour côté GitHub — l'issue reste la source de vérité. */
  async setIssueState(issueNumber: number, state: 'open' | 'closed'): Promise<boolean> {
    return this.github.setIssueState(issueNumber, state)
  }

  /**
   * Répond dans le fil du retour. La réponse est SIGNÉE de son auteur : un
   * commentaire posté par le jeton de la plateforme apparaîtrait sinon sous
   * l'identité du bot, et personne ne saurait qui a répondu au client.
   */
  async commentOnIssue(issueNumber: number, body: string, author?: string | null): Promise<boolean> {
    // Sans auteur connu, on dit d'où vient la réponse sans inventer QUI l'a
    // écrite. Vérifié en prod : passer « back-office » comme auteur produisait
    // « — back-office (via le back-office) ».
    const signature = author?.trim() ? `— ${author.trim()} (via le back-office)` : '— via le back-office'
    return this.github.addComment(issueNumber, `${body}\n\n${signature}`)
  }

  /** Le fil de discussion. `null` = GitHub n'a pas répondu, `[]` = aucun message. */
  async issueComments(issueNumber: number): Promise<IssueComment[] | null> {
    return this.github.listComments(issueNumber)
  }

  private cap(limit: number): number {
    return Math.min(Math.max(Math.trunc(limit) || 1, 1), 200)
  }

  /**
   * L'écran dans le titre : une liste d'issues où tout commence par `[beta:bug]`
   * ne se trie pas. `[beta:bug] /integrations — le bouton ne fait rien` se lit,
   * se groupe et se dédoublonne d'un coup d'œil.
   */
  private buildIssueTitle(dto: CreateFeedbackDto): string {
    const head = dto.message.split('\n')[0]?.slice(0, 80) || 'Retour beta'
    const route = dto.appContext?.route ?? routeFromUrl(dto.pageUrl ?? null)
    return route ? `[beta:${dto.category}] ${route} — ${head}` : `[beta:${dto.category}] ${head}`
  }

  private buildIssueBody(
    userId: string | null,
    dto: CreateFeedbackDto,
    screenshotUrl: string | null,
    excerpt: CodeExcerpt | null,
    operator: string | null,
    attachments: AttachmentUploads,
  ): string {
    return [
      `**Catégorie** : ${dto.category}`,
      '',
      '### Message',
      // En citation : le corps d'une issue mêle du texte machine et la phrase de
      // la personne, et c'est la sienne qu'on doit pouvoir lire d'un coup d'œil.
      ...dto.message.split('\n').map(line => `> ${line}`),
      ...this.screenshotSection(dto, screenshotUrl),
      ...this.attachmentsSection(attachments),
      ...this.elementSection(dto.elementContext ?? null),
      ...this.locateSection(dto),
      ...this.codeSection(excerpt),
      ...this.networkSection(dto.networkFailures ?? []),
      ...this.breadcrumbSection(dto.breadcrumbs ?? []),
      '',
      '### Contexte',
      operator
        ? `- Opérateur (back-office) : ${operator}`
        : `- Utilisateur : ${dto.userEmail ?? '—'} (\`${userId ?? '—'}\`)`,
      `- Page : ${dto.pageUrl ?? '—'}`,
      `- Compte : ${dto.accountId ?? '—'}`,
      ...this.appContextLines(dto.appContext ?? null),
      `- User agent : ${dto.userAgent ?? '—'}`,
      ...this.logSection('Erreurs récentes', dto.errorLogs, ERROR_LOGS_IN_ISSUE),
      ...this.logSection('Logs console', dto.consoleLogs, CONSOLE_LOGS_IN_ISSUE),
      '',
      // La portée est ÉCRITE dans l'issue : celui qui la lit sait, sans avoir à
      // demander, ce qu'il a le droit d'en faire. Une colonne que personne ne
      // voit ne protège rien.
      '> ⚠️ **Réutilisation : privée à cet espace.** Ce retour peut servir à corriger le produit ;',
      '> il ne peut PAS être repris tel quel — valeurs, seuils, cibles, lexique — pour un autre client.',
      "> Un motif ANONYMISÉ peut l'être, après décision produit écrite.",
      '',
      '_Ouvert automatiquement depuis le rapport de bug in-app BellumAI._',
    ].join('\n')
  }

  /**
   * #1792 — DÉPOSE CHAQUE PIÈCE JOINTE, une par une.
   *
   * Séquentiel (pas `Promise.all`) : la première pièce déposée peut devoir
   * CRÉER la branche d'actifs (`ensureAssetBranch`), et deux créations
   * concurrentes se marcheraient dessus. Le lot est petit (`ATTACHMENTS_MAX_COUNT`
   * = 5) : le coût d'un aller-retour de plus par pièce est négligeable à côté
   * du risque d'une branche corrompue.
   *
   * Chaque échec est NOMMÉ dans `failed` plutôt qu'avalé : « produit une
   * erreur claire, jamais un lien mort ni une pièce fantôme dans le corps de
   * l'issue » — voir {@link attachmentsSection}. Un échec n'empêche jamais le
   * reste du lot, ni l'issue, ni le signalement.
   */
  private async uploadAttachments(attachments: Attachment[]): Promise<AttachmentUploads> {
    const uploaded: UploadedAttachment[] = []
    const failed: string[] = []
    for (const attachment of attachments) {
      const result = await this.github.uploadAsset(attachment.dataBase64, attachment.mimeType, attachment.name)
      if (result) uploaded.push({ name: attachment.name, url: result.url, kind: result.kind })
      else failed.push(attachment.name)
    }
    return { uploaded, failed }
  }

  /**
   * L'extrait du fichier pointé, relu AU COMMIT qui tournait dans le navigateur.
   * Sans le SHA, on ne lit rien : coller la version d'aujourd'hui sous un
   * numéro de ligne d'hier produit un extrait faux, et un extrait faux coûte
   * plus cher que pas d'extrait du tout.
   */
  private async resolveCodeExcerpt(dto: CreateFeedbackDto): Promise<CodeExcerpt | null> {
    const location = dto.elementContext?.sourceFile
    if (!location) return null
    return this.github.codeExcerpt(location, commitFromBuildVersion(dto.appContext?.buildVersion ?? null))
  }

  /**
   * Ce que la capture ne montre pas, gardé en base pour le back-office.
   *
   * #1792 — les pièces jointes n'y voyagent qu'en MÉTADONNÉES (nom + lien
   * GitHub le cas échéant), jamais le contenu : une pièce jointe peut porter
   * une donnée personnelle (capture d'un écran client), elle ne se
   * journalise pas en clair. Le contenu réel reste sur la branche d'actifs,
   * accessible uniquement via l'issue GitHub (dépôt privé, lecteur
   * authentifié) — exactement la même frontière que `screenshot_url`.
   */
  private clientContext(
    dto: CreateFeedbackDto,
    operator: string | null,
    attachments: AttachmentUploads,
  ): Record<string, unknown> | null {
    const networkFailures = dto.networkFailures ?? []
    const breadcrumbs = dto.breadcrumbs ?? []
    const appContext = dto.appContext ?? null
    const hasAttachments = attachments.uploaded.length > 0 || attachments.failed.length > 0
    const attachmentsMeta = hasAttachments
      ? [
          ...attachments.uploaded.map(a => ({ name: a.name, url: a.url })),
          ...attachments.failed.map(name => ({ name, url: null })),
        ]
      : null
    // ⚠️ La SOURCE se garde même quand tout le reste est vide : c'est elle qui
    // distingue un retour d'opérateur (personne à qui répondre, ligne sans
    // `user_id`) d'un retour de bêta-testeur, et le back-office la lit.
    if (operator) {
      return {
        source: 'backoffice',
        operator,
        appContext,
        networkFailures,
        breadcrumbs,
        ...(attachmentsMeta ? { attachments: attachmentsMeta } : {}),
      }
    }
    if (!networkFailures.length && !breadcrumbs.length && !appContext && !hasAttachments) return null
    return { appContext, networkFailures, breadcrumbs, ...(attachmentsMeta ? { attachments: attachmentsMeta } : {}) }
  }

  /**
   * Les commandes pour retrouver le code. Elles servent surtout quand
   * l'estampille de build manque (composant tiers, nœud rendu par `@bellum/ui`),
   * et restent utiles quand elle est là : elle donne le fichier, pas toujours le
   * bon endroit dedans.
   */
  private locateSection(dto: CreateFeedbackDto): string[] {
    const commands = buildLocateCommands({
      route: dto.appContext?.route ?? routeFromUrl(dto.pageUrl ?? null),
      componentStack: dto.elementContext?.componentStack ?? [],
      grepTokens: dto.elementContext?.grepTokens ?? [],
      // ⚠️ D'où vient le retour décide OÙ chercher. La version du build le dit
      // (`back-office+<sha>`), et c'est la seule source : un opérateur ne
      // choisit pas ce champ, donc il ne peut pas se tromper.
      origin: originOfBuild(dto.appContext?.buildVersion ?? null),
    })
    if (!commands.length) return []
    return ['', '### Localiser le code', '```sh', ...commands, '```']
  }

  private codeSection(excerpt: CodeExcerpt | null): string[] {
    if (!excerpt) return []
    return [
      '',
      `### Code — \`${excerpt.path}:${excerpt.line}\` au commit \`${excerpt.ref.slice(0, 10)}\``,
      '```',
      excerpt.snippet,
      '```',
    ]
  }

  /**
   * Les appels qui ont échoué. `correlationId` est la colonne qui compte : c'est
   * la clé à coller dans les logs du serveur pour retrouver CETTE requête. Quand
   * elle manque (en-tête non exposé au navigateur), la case reste vide — on ne
   * remplit pas un trou avec un tiret qui se lirait « pas de corrélation ».
   */
  private networkSection(failures: NetworkFailure[]): string[] {
    if (!failures.length) return []
    const rows = failures.map(f => {
      const status = f.status != null ? String(f.status) : (f.error ?? 'échec réseau')
      const duration = f.durationMs != null ? `${f.durationMs} ms` : ''
      return `| ${f.time} | ${f.method} | ${f.url} | ${status} | ${duration} | ${f.correlationId ?? ''} |`
    })
    return [
      '',
      '### Requêtes en échec',
      '| Heure | Méthode | URL | Statut | Durée | Corrélation |',
      '| --- | --- | --- | --- | --- | --- |',
      ...rows,
    ]
  }

  private breadcrumbSection(breadcrumbs: Breadcrumb[]): string[] {
    if (!breadcrumbs.length) return []
    const lines = breadcrumbs.map(b => `- ${b.time} — ${b.type === 'click' ? 'clic' : 'navigation'} : ${b.label}`)
    return ['', '### Fil des dernières actions', ...lines]
  }

  private appContextLines(context: AppContext | null): string[] {
    if (!context) return []
    return [
      `- Build : \`${context.buildVersion}\` (${context.environment})`,
      `- Route : ${context.route}`,
      `- Thème : ${context.theme} · Langue : ${context.language} · Fuseau : ${context.timeZone}`,
      `- Fenêtre : ${context.viewport} · Réseau : ${context.online ? 'en ligne' : 'hors ligne'}`,
    ]
  }

  private screenshotSection(dto: CreateFeedbackDto, screenshotUrl: string | null): string[] {
    if (screenshotUrl) return ['', '### Capture', `![capture](${screenshotUrl})`]
    if (dto.screenshot) return ['', '### Capture', '_Disponible dans le dashboard-manager._']
    return []
  }

  /**
   * #1792 — les pièces jointes choisies par la personne. Une image s'EMBED
   * (comme la capture), un PDF ou un fichier texte se LIE — GitHub ne les
   * rend pas inline. Un échec de dépôt ne disparaît jamais en silence : il se
   * nomme, avec le nom du fichier tel que la personne l'a choisi, jamais un
   * lien mort.
   */
  private attachmentsSection(attachments: AttachmentUploads): string[] {
    if (!attachments.uploaded.length && !attachments.failed.length) return []
    const lines = [
      ...attachments.uploaded.map(a => (isImageKind(a.kind) ? `![${a.name}](${a.url})` : `- [${a.name}](${a.url})`)),
      ...attachments.failed.map(name => `- ⚠️ ${name} — n'a pas pu être déposée.`),
    ]
    return ['', '### Pièces jointes', ...lines]
  }

  /**
   * The pointed element, headlined by the source location the web build stamps
   * on every host element — that's the line of code to open. When the stamp is
   * absent (plugin disabled via `VITE_SOURCE_TAGS=false`, or a third-party
   * component the plugin does not touch) the issue says so outright rather than
   * showing a blank that reads as "not collected" — and never guesses a path.
   */
  private elementSection(element: ElementContext | null): string[] {
    if (!element) return []
    const lines = [
      `- Source : ${element.sourceFile ? `\`${element.sourceFile}\`` : '_inconnue (élément non estampillé)_'}`,
      element.sourceChain.length ? `- Parents : ${element.sourceChain.map(s => `\`${s}\``).join(' ← ')}` : null,
      element.componentStack.length ? `- Composants : ${element.componentStack.join(' ← ')}` : null,
      `- Sélecteur : \`${element.selector}\``,
      `- Élément : \`<${element.tagName}>\`${element.elementId ? ` #${element.elementId}` : ''}`,
      element.classes ? `- Classes : \`${element.classes}\`` : null,
      element.role || element.ariaLabel
        ? `- Accessibilité : role=${element.role ?? '—'}, aria-label=${element.ariaLabel ?? '—'}`
        : null,
      element.href ? `- Lien : ${element.href}` : null,
      element.text ? `- Texte : « ${element.text} »` : null,
      element.descriptor ? `- Identité : \`${element.descriptor}\`` : null,
      `- Position : ${element.rect.width}×${element.rect.height} @ (${element.rect.x}, ${element.rect.y})`,
      `- Viewport : ${element.viewport.width}×${element.viewport.height} @${element.viewport.dpr}x`,
    ].filter((line): line is string => line !== null)

    // Le markup réel plutôt que sa description : un attribut manquant, un
    // `disabled` resté là, un conteneur qui a mangé le clic se voient dans le
    // HTML et dans rien d'autre.
    const markup = element.html
      ? [
          '',
          '<details><summary>Markup</summary>',
          '',
          '```html',
          element.html,
          '```',
          // #3895.1 — un extrait se nomme : sans cette ligne, un markup coupé
          // par la troncature cliente (long fil de conversation, tableau) se
          // lisait comme l'élément complet.
          ...(element.htmlTruncated ? ['', "⚠️ Markup tronqué : cet extrait ne porte pas l'élément complet."] : []),
          '',
          '</details>',
        ]
      : []

    return ['', '### Élément pointé', ...lines, ...markup]
  }

  /** Keeps the tail of the buffer — the lines closest to the failure. */
  private logSection(title: string, logs: string | null | undefined, cap: number): string[] {
    if (!logs) return []
    const truncated = logs.length > cap
    return [
      '',
      `### ${title}`,
      '```',
      ...(truncated ? ['… (début tronqué)'] : []),
      truncated ? logs.slice(logs.length - cap) : logs,
      '```',
    ]
  }
}
