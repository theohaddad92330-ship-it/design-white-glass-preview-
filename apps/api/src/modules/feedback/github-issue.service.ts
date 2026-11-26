import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'

const GITHUB_API = 'https://api.github.com'
/** Lignes affichées de part et d'autre de la ligne pointée. */
const CODE_EXCERPT_RADIUS = 8
/**
 * Le label qui fait d'une issue un retour de bêta — posé à la création
 * (`creationLabels`, `report-status.ts`), lu par le listing ci-dessous.
 */
export const FEEDBACK_LABEL = 'beta-feedback'
const ISSUES_PER_PAGE = 100
const COMMENTS_PER_PAGE = 100

/**
 * #1960.10 — combien de tickets une page « Mes signalements » lit en UN appel.
 * Cinquante : la page en demande autant par défaut, et au-delà la requête
 * grossit sans qu'un auteur ait jamais écrit autant de signalements.
 */
const ISSUE_PROGRESS_MAX = 50
/**
 * #1960.10 — combien de temps un état lu reste servi sans relire. Une minute :
 * assez pour qu'aller et revenir sur la page ne relise pas, assez court pour
 * qu'une fermeture faite à l'instant se voie au rechargement suivant.
 */
const ISSUE_PROGRESS_TTL_MS = 60_000
const ISSUE_STATE_REASONS = ['COMPLETED', 'NOT_PLANNED', 'DUPLICATE', 'REOPENED'] as const

/** Ce que la requête de {@link GithubIssueService.issueProgress} rend, par ticket. */
type GraphqlIssueProgressNode = {
  state?: string
  stateReason?: string | null
  assignees?: { totalCount?: number } | null
  labels?: { nodes?: ({ name?: string } | null)[] } | null
  comments?: { nodes?: ({ author?: { __typename?: string } | null } | null)[] } | null
}

/**
 * Un nœud lu → ce qu'on sait du traitement. `null` quand l'état lui-même est
 * illisible : on ne devine pas « ouvert ». Une raison de fermeture que l'on ne
 * connaît pas ne devient pas une raison — elle vaut `null`.
 */
function toIssueProgress(node: GraphqlIssueProgressNode): IssueProgress | null {
  const state = node.state === 'OPEN' ? 'open' : node.state === 'CLOSED' ? 'closed' : null
  if (!state) return null
  return {
    state,
    stateReason: ISSUE_STATE_REASONS.find(reason => reason === node.stateReason) ?? null,
    assigned: (node.assignees?.totalCount ?? 0) > 0,
    labels: (node.labels?.nodes ?? []).map(label => label?.name ?? '').filter(Boolean),
    // Un robot qui commente (le lien-retour automatique) n'a pris personne en main.
    humanComment: (node.comments?.nodes ?? []).some(comment => comment?.author?.__typename === 'User'),
  }
}

/**
 * Combien de commentaires on parcourt par issue pour y trouver la première
 * réponse HUMAINE (#1658.2).
 *
 * Vingt, et le nombre n'est pas arbitraire : le seul robot qui commente les
 * retours en poste UN (le lien-retour), et un fil de retour qui dépasserait
 * dix-neuf réponses de robots avant la première humaine n'existe pas. Monter à
 * cent ferait grossir la réponse d'un facteur cinq pour ne rien trouver de plus.
 */
const COMMENTS_SCANNED_PER_ISSUE = 20

/** Ce que la requête GraphQL de {@link GithubIssueService.firstHumanResponses} rend. */
type GraphqlIssueNode = {
  number: number
  comments?: { nodes?: ({ createdAt?: string; author?: { __typename?: string } | null } | null)[] }
}

type IssueState = 'open' | 'closed' | 'all'

/** L'état d'un retour côté GitHub, tel que le back-office l'affiche. */
export type IssueSummary = {
  number: number
  state: 'open' | 'closed'
  title: string
  url: string
  comments: number
  updatedAt: string
  closedAt: string | null
  labels: string[]
}

export type IssueComment = {
  id: number
  author: string | null
  body: string
  createdAt: string
}

/**
 * #1960.10 — ce que le ticket dit de son TRAITEMENT, pour « Mes signalements ».
 *
 * La matière première de `reportStatusOf` (`report-status.ts`) — la seule
 * traduction vers ce que l'auteur lit. Aucun titre, aucun corps, aucun lien :
 * ce qui sort d'ici ne sert qu'à dériver un état.
 */
export type IssueProgress = {
  state: 'open' | 'closed'
  /** `null` quand le service n'en donne pas, ou en donne une qu'on ne connaît pas. */
  stateReason: 'COMPLETED' | 'NOT_PLANNED' | 'DUPLICATE' | 'REOPENED' | null
  assigned: boolean
  labels: string[]
  /** Au moins un commentaire d'un HUMAIN — un robot n'est pas une prise en main. */
  humanComment: boolean
}

type GithubIssueRaw = {
  number: number
  title: string
  state: 'open' | 'closed'
  html_url: string
  comments: number
  updated_at: string
  closed_at: string | null
  labels?: ({ name?: string } | string)[]
  pull_request?: unknown
}

type GithubCommentRaw = {
  id: number
  user: { login: string } | null
  body: string | null
  created_at: string
}

// #1792 — LA LISTE BLANCHE QUI DÉCIDE L'EXTENSION ÉCRITE SUR LE DISQUE.
//
// ─────────────────────────────────────────────────────────────────────────
// POURQUOI CE N'EST PAS LE `mimeType` DÉCLARÉ
// ─────────────────────────────────────────────────────────────────────────
// Le DTO (`dto/feedback.dto.ts`) filtre déjà `mimeType` contre une liste
// explicite — mais ce filtre porte sur ce que le NAVIGATEUR prétend, et le
// navigateur est falsifiable (un client modifié peut envoyer n'importe quel
// `mimeType` à côté de n'importe quel contenu). L'AUTORITÉ est donc ici : la
// SIGNATURE OCTETS du contenu réellement déposé, jamais le champ déclaré, et
// jamais le nom de fichier (`filenameHint`) — qui ne sert QUE d'indication
// dans le message de commit, texte, jamais un chemin.
export type AttachmentKind = 'png' | 'jpg' | 'gif' | 'webp' | 'pdf' | 'txt'

const EXTENSION_BY_KIND: Record<AttachmentKind, string> = {
  png: 'png',
  jpg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  pdf: 'pdf',
  txt: 'txt',
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** `<script`, `<svg`, `<html`… — un document actif ne se glisse pas sous `.txt`. */
const ACTIVE_MARKUP = /<\s*(script|svg|html|iframe|object|embed)\b/i

/** Le contenu décodé ressemble-t-il à du texte lisible, sans document actif ? */
function isPlainText(bytes: Buffer): boolean {
  if (bytes.length === 0) return false
  for (const byte of bytes) {
    // Tabulation/LF/CR acceptés ; tout autre caractère de contrôle (et 0x7F)
    // signe un binaire, pas du texte — un exécutable ne passe pas ce test.
    const isControl = byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d
    if (isControl || byte === 0x7f) return false
  }
  const text = bytes.toString('utf8')
  // Un aller-retour UTF-8 qui ne redonne pas les MÊMES octets signe un binaire
  // que `toString` a maquillé en remplaçant les séquences invalides.
  if (!Buffer.from(text, 'utf8').equals(bytes)) return false
  if (ACTIVE_MARKUP.test(text)) return false
  return true
}

/**
 * LISTE BLANCHE, jamais liste noire — images, PDF, texte brut. Aucun
 * exécutable, aucun HTML, aucun SVG : un SVG est un document actif, il porte
 * du script, et il se lirait comme « du texte » sans le filtre ci-dessus.
 *
 * `null` = rejeté. Ni le `mimeType` déclaré ni le nom de fichier n'entrent en
 * ligne de compte : seule la forme réelle du contenu décide.
 */
function sniffAttachmentKind(bytes: Buffer): AttachmentKind | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length >= 6 && /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'))) return 'gif'
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp'
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf'
  if (isPlainText(bytes)) return 'txt'
  return null
}

/** Un nom de fichier ne doit jamais injecter une ligne dans un log ou un message de commit. */
function sanitizeForLog(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim()
}

function toIssueSummary(issue: GithubIssueRaw): IssueSummary {
  return {
    number: issue.number,
    state: issue.state,
    title: issue.title,
    url: issue.html_url,
    comments: issue.comments,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    labels: (issue.labels ?? []).map(label => (typeof label === 'string' ? label : (label.name ?? ''))).filter(Boolean),
  }
}
/** `chemin/fichier.tsx:86:9` — tel que l'estampille le plugin Vite du build. */
const SOURCE_LOCATION = /^([\w./@-]+):(\d+)(?::\d+)?$/

/**
 * Découpe `fichier:ligne:colonne` en un chemin sûr et un numéro de ligne.
 *
 * Le chemin part dans une URL d'API sur NOTRE dépôt : il est validé plutôt que
 * concaténé. Un chemin absolu ou remontant (`..`) est refusé — non pas qu'il soit
 * exploitable ici, mais parce qu'une valeur venue du client qui compose une URL
 * doit toujours être bornée à ce qu'elle prétend être.
 */
function parseSourceLocation(location: string): { path: string; line: number } | null {
  const match = SOURCE_LOCATION.exec(location.trim())
  if (!match?.[1] || !match[2]) return null
  const path = match[1]
  if (path.startsWith('/') || path.includes('..')) return null
  const line = Number(match[2])
  return Number.isFinite(line) && line > 0 ? { path, line } : null
}

/**
 * Opens a GitHub issue for a beta feedback submission, and mirrors the
 * screenshot into the repository so the issue can embed it. Optional
 * integration: disabled (no-op, returns null) unless both
 * `FEEDBACK_GITHUB_TOKEN` and `FEEDBACK_GITHUB_REPO` (``owner/repo``) are set.
 * Read straight from `process.env` so it needs no config-schema change and
 * stays a pure add-on.
 */
@Injectable()
export class GithubIssueService {
  private readonly logger = new Logger(GithubIssueService.name)
  private readonly token = process.env.FEEDBACK_GITHUB_TOKEN ?? ''
  private readonly repo = process.env.FEEDBACK_GITHUB_REPO ?? ''
  /** Orphan branch holding report screenshots — kept out of the code history. */
  private readonly assetBranch = process.env.FEEDBACK_GITHUB_ASSET_BRANCH ?? 'feedback-assets'
  /**
   * #1960.10 — les états lus récemment, par numéro de ticket. En mémoire du
   * processus : une minute de fraîcheur ne mérite ni table ni Redis, et deux
   * répliques qui relisent chacune une fois ne coûtent qu'un appel de plus.
   */
  private readonly progressCache = new Map<number, { progress: IssueProgress; readAt: number }>()

  get enabled(): boolean {
    return Boolean(this.token && this.repo)
  }

  async createIssue(input: {
    title: string
    body: string
    labels?: string[]
  }): Promise<{ number: number; url: string } | null> {
    if (!this.enabled) return null
    try {
      const res = await this.request(`/repos/${this.repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title: input.title, body: input.body, labels: input.labels }),
      })
      if (!res.ok) {
        this.logger.error('GitHub issue creation failed', { status: res.status })
        return null
      }
      const data = (await res.json()) as { number: number; html_url: string }
      return { number: data.number, url: data.html_url }
    } catch (error) {
      // Never let a failed issue block the feedback from being stored.
      this.logger.error('GitHub issue creation error', { error })
      return null
    }
  }

  /**
   * L'état courant des issues de retour, en UN appel (label + `state=all`).
   *
   * La distinction qui porte toute la lecture du back-office : `null` signifie
   * « je n'ai pas pu regarder » (intégration éteinte, GitHub indisponible),
   * `[]` signifie « il n'y en a aucune ». Rendre `[]` dans les deux cas ferait
   * afficher « aucun retour traité » un jour de panne GitHub.
   */
  async listIssues(state: IssueState = 'all', perPage = ISSUES_PER_PAGE): Promise<IssueSummary[] | null> {
    if (!this.enabled) return null
    try {
      const query = `labels=${encodeURIComponent(FEEDBACK_LABEL)}&state=${state}&per_page=${perPage}&sort=updated&direction=desc`
      const res = await this.request(`/repos/${this.repo}/issues?${query}`)
      if (!res.ok) {
        this.logger.warn('GitHub issue listing failed', { status: res.status })
        return null
      }
      const raw = (await res.json()) as GithubIssueRaw[]
      // L'endpoint `issues` rend AUSSI les pull requests : une PR n'est pas un
      // retour, et la compter fausserait tous les compteurs de l'écran.
      return raw.filter(issue => !issue.pull_request).map(toIssueSummary)
    } catch (error) {
      this.logger.warn('GitHub issue listing error', { error })
      return null
    }
  }

  /**
   * #1658.2 — LA PREMIÈRE RÉPONSE HUMAINE de chaque retour, en UN appel.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI GRAPHQL, ALORS QUE TOUT LE RESTE DE CE FICHIER EST EN REST
   * ─────────────────────────────────────────────────────────────────────────
   * Le délai de réponse demande, par retour, la date du premier commentaire.
   * En REST il n'y a que deux chemins, et aucun ne tient :
   *  · un appel PAR issue — mesuré le 07/09/2026 : **100 issues portent le
   *    label, et les 100 ont au moins un commentaire.** Cent appels pour
   *    afficher une colonne, à chaque ouverture de l'écran ;
   *  · le balayage des commentaires du DÉPÔT (`/issues/comments`) — il rend
   *    aussi ceux des 1 700 pull requests, donc une pagination sans rapport
   *    avec le sujet.
   * GraphQL répond exactement à la question posée, pour cent issues, en une
   * requête. C'est la seule raison de son existence ici.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * ⚠️ UN ROBOT N'EST PAS UNE RÉPONSE
   * ─────────────────────────────────────────────────────────────────────────
   * Chaque issue de retour reçoit dans la minute un lien-retour automatique
   * (`linear-code[bot]`, `author.__typename === 'Bot'`). Le compter ferait
   * afficher « répondu en 3 min » sur des retours que personne n'a lus — un
   * chiffre faux vaut moins que pas de chiffre. Seuls les commentaires d'un
   * `User` comptent.
   *
   * `null` = « je n'ai pas pu regarder » (intégration éteinte, GitHub muet),
   * jamais « aucune réponse ». C'est la même distinction que {@link listIssues},
   * et l'écran l'affiche telle quelle plutôt que d'annoncer un délai inventé.
   * Une issue ABSENTE de la carte rendue est, elle, une issue sans réponse
   * humaine — ce qui est un fait, pas une lacune.
   */
  async firstHumanResponses(): Promise<Map<number, string> | null> {
    if (!this.enabled) return null
    const [owner, name] = this.repo.split('/')
    if (!owner || !name) return null

    const query = `query($owner:String!,$name:String!,$label:String!,$issues:Int!,$comments:Int!){
      repository(owner:$owner,name:$name){
        issues(labels:[$label],first:$issues,states:[OPEN,CLOSED],orderBy:{field:UPDATED_AT,direction:DESC}){
          nodes{ number comments(first:$comments){ nodes{ createdAt author{ __typename } } } }
        }
      }
    }`

    try {
      const res = await fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            owner,
            name,
            label: FEEDBACK_LABEL,
            issues: ISSUES_PER_PAGE,
            comments: COMMENTS_SCANNED_PER_ISSUE,
          },
        }),
      })
      if (!res.ok) {
        this.logger.warn('GitHub first-response listing failed', { status: res.status })
        return null
      }
      const payload = (await res.json()) as {
        data?: { repository?: { issues?: { nodes?: GraphqlIssueNode[] } } }
        errors?: unknown[]
      }
      // Une réponse GraphQL peut être 200 ET porter des erreurs, avec des nœuds
      // partiels. Les lire quand même produirait une carte incomplète
      // indiscernable d'une carte complète : « pas répondu » s'afficherait sur
      // des retours répondus. On préfère « je n'ai pas pu regarder ».
      if (payload.errors?.length) {
        this.logger.warn('GitHub first-response listing returned errors', { count: payload.errors.length })
        return null
      }

      const premieres = new Map<number, string>()
      for (const node of payload.data?.repository?.issues?.nodes ?? []) {
        const humain = (node.comments?.nodes ?? [])
          .map(comment => (comment?.author?.__typename === 'User' ? comment.createdAt : null))
          .filter((date): date is string => Boolean(date))
          .sort()[0]
        if (humain) premieres.set(node.number, humain)
      }
      return premieres
    } catch (error) {
      this.logger.warn('GitHub first-response listing error', { error })
      return null
    }
  }

  /**
   * #1960.10 — CE QUE LE TICKET DIT DE SON TRAITEMENT, pour « Mes signalements ».
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI UNE LECTURE, ET PAS UNE COLONNE EN BASE
   * ─────────────────────────────────────────────────────────────────────────
   * L'état ne change pas seulement depuis le back-office : un ticket se ferme
   * aussi depuis le service lui-même, par une fusion qui le référence, par un
   * tri à la main. Une colonne écrite par le seul back-office mentirait dès la
   * première fermeture faite ailleurs — et aucun webhook n'existe pour la tenir
   * à jour. Le back-office lit déjà l'état en direct (`listIssues`) : ce sont
   * les mêmes principes, pour un lecteur de plus.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * BORNÉE, EN UN APPEL, AVEC UN CACHE COURT
   * ─────────────────────────────────────────────────────────────────────────
   *  - UNE requête GraphQL pour toutes les références d'une page (alias
   *    `i0…iN`), au plus {@link ISSUE_PROGRESS_MAX} — pas un appel par ligne ;
   *  - les numéros voyagent en VARIABLES, jamais collés dans le texte ;
   *  - rien que ce qui sert à dériver un état : ni titre, ni corps, ni lien ;
   *  - une lecture RÉUSSIE se garde {@link ISSUE_PROGRESS_TTL_MS} ; un échec
   *    jamais — la lecture suivante réessaie.
   *
   * `null` = « je n'ai pas pu regarder » (intégration éteinte : AUCUN appel ;
   * service injoignable ; erreur globale). Une référence ABSENTE de la carte
   * rendue est un ticket qu'on n'a pas pu lire (erreur ciblée, ticket supprimé
   * ou transféré). Dans les deux cas l'écran dit « état indisponible » — jamais
   * « reçu ».
   */
  async issueProgress(numbers: readonly number[]): Promise<Map<number, IssueProgress> | null> {
    if (!this.enabled) return null
    const [owner, name] = this.repo.split('/')
    if (!owner || !name) return null

    const wanted = [...new Set(numbers.filter(number => Number.isInteger(number) && number > 0))].slice(
      0,
      ISSUE_PROGRESS_MAX,
    )
    const now = Date.now()
    for (const [number, entry] of this.progressCache) {
      if (now - entry.readAt >= ISSUE_PROGRESS_TTL_MS) this.progressCache.delete(number)
    }

    const known = new Map<number, IssueProgress>()
    const toRead: number[] = []
    for (const number of wanted) {
      const cached = this.progressCache.get(number)
      if (cached) known.set(number, cached.progress)
      else toRead.push(number)
    }
    if (toRead.length === 0) return known

    const declarations = toRead.map((_, index) => `$n${index}: Int!`).join(', ')
    const fields = toRead
      .map(
        (_, index) =>
          `i${index}: issue(number: $n${index}) { state stateReason assignees(first: 1) { totalCount } ` +
          `labels(first: 20) { nodes { name } } comments(first: ${COMMENTS_SCANNED_PER_ISSUE}) { nodes { author { __typename } } } }`,
      )
      .join(' ')
    const query = `query($owner: String!, $name: String!, ${declarations}) { repository(owner: $owner, name: $name) { ${fields} } }`
    const variables: Record<string, string | number> = { owner, name }
    toRead.forEach((number, index) => {
      variables[`n${index}`] = number
    })

    const unreadable = (): Map<number, IssueProgress> | null => (known.size > 0 ? known : null)
    try {
      const res = await fetch(`${GITHUB_API}/graphql`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      })
      if (!res.ok) {
        this.logger.warn('GitHub issue progress read failed', { status: res.status, count: toRead.length })
        return unreadable()
      }
      const payload = (await res.json()) as {
        data?: { repository?: Record<string, GraphqlIssueProgressNode | null> | null } | null
        errors?: { path?: (string | number)[] }[]
      }

      // Une erreur CIBLÉE (`path: ['repository', 'i3']`) ne rend inconnu que son
      // ticket ; une erreur sans chemin (quota, jeton) rend tout illisible —
      // lire les nœuds quand même produirait une page où « indisponible » et
      // « lu » se ressembleraient.
      const erroredAliases = new Set<string>()
      for (const error of payload.errors ?? []) {
        const alias = error.path?.[0] === 'repository' ? error.path[1] : undefined
        if (typeof alias !== 'string') {
          this.logger.warn('GitHub issue progress read returned errors', { count: payload.errors?.length ?? 0 })
          return unreadable()
        }
        erroredAliases.add(alias)
      }
      const repository = payload.data?.repository
      if (!repository) return unreadable()

      toRead.forEach((number, index) => {
        const alias = `i${index}`
        const node = repository[alias]
        if (!node || erroredAliases.has(alias)) return
        const progress = toIssueProgress(node)
        if (!progress) return
        this.progressCache.set(number, { progress, readAt: now })
        known.set(number, progress)
      })
      return known
    } catch (error) {
      this.logger.warn('GitHub issue progress read error', { error })
      return unreadable()
    }
  }

  /** Ferme ou rouvre une issue. `false` = rien n'a bougé côté GitHub. */
  async setIssueState(issueNumber: number, state: 'open' | 'closed'): Promise<boolean> {
    if (!this.enabled) return false
    try {
      const res = await this.request(`/repos/${this.repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({ state }),
      })
      if (!res.ok) this.logger.warn('GitHub issue state change failed', { status: res.status, issueNumber })
      return res.ok
    } catch (error) {
      this.logger.warn('GitHub issue state change error', { error, issueNumber })
      return false
    }
  }

  /** Ajoute un commentaire. `false` = le commentaire n'est pas parti. */
  async addComment(issueNumber: number, body: string): Promise<boolean> {
    if (!this.enabled) return false
    try {
      const res = await this.request(`/repos/${this.repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      })
      if (!res.ok) this.logger.warn('GitHub comment failed', { status: res.status, issueNumber })
      return res.ok
    } catch (error) {
      this.logger.warn('GitHub comment error', { error, issueNumber })
      return false
    }
  }

  /** Le fil de discussion. `null` = indisponible, `[]` = pas de commentaire. */
  async listComments(issueNumber: number): Promise<IssueComment[] | null> {
    if (!this.enabled) return null
    try {
      const res = await this.request(`/repos/${this.repo}/issues/${issueNumber}/comments?per_page=${COMMENTS_PER_PAGE}`)
      if (!res.ok) {
        this.logger.warn('GitHub comment listing failed', { status: res.status, issueNumber })
        return null
      }
      const raw = (await res.json()) as GithubCommentRaw[]
      return raw.map(comment => ({
        id: comment.id,
        author: comment.user?.login ?? null,
        body: comment.body ?? '',
        createdAt: comment.created_at,
      }))
    } catch (error) {
      this.logger.warn('GitHub comment listing error', { error, issueNumber })
      return null
    }
  }

  /**
   * #1792 — DÉPOSE UNE PIÈCE (capture automatique OU pièce jointe choisie) sur
   * la branche d'actifs existante et rend une URL qui s'affiche/s'ouvre dans
   * l'issue. Généralise l'ancien `uploadScreenshot` : même branche, même
   * mécanique de commit — un seul chemin, pas un second qui diverge.
   *
   * `dataBase64` est le contenu BRUT (sans préfixe `data:...;base64,`).
   * `mimeType` n'est qu'une INDICATION du client — falsifiable, jamais
   * l'autorité. `filenameHint` ne sert QUE pour le message de commit
   * (assaini, tronqué) : un nom de fichier ne construit JAMAIS le chemin
   * déposé. Le chemin est composé d'un identifiant généré ICI et de
   * l'extension que {@link sniffAttachmentKind} dérive du contenu — un
   * `../../evil.png` ou tout autre nom piégé y est donc totalement inerte.
   *
   * Retourne `null` quand l'intégration est éteinte, quand le contenu ne
   * correspond à AUCUN type accepté (liste blanche), ou sur tout échec
   * réseau — jamais un lien mort ni une pièce fantôme dans l'issue : c'est à
   * l'appelant de le dire dans le corps (voir `FeedbackService`).
   */
  async uploadAsset(
    dataBase64: string,
    mimeType: string,
    filenameHint: string,
  ): Promise<{ url: string; kind: AttachmentKind } | null> {
    if (!this.enabled) return null
    const bytes = Buffer.from(dataBase64, 'base64')
    const kind = sniffAttachmentKind(bytes)
    if (!kind) {
      this.logger.warn('GitHub asset upload rejected — unrecognised or disallowed content', {
        declaredMimeType: mimeType,
        filenameHint: sanitizeForLog(filenameHint).slice(0, 120),
      })
      return null
    }
    try {
      if (!(await this.ensureAssetBranch())) return null

      // Ni le nom ni le `mimeType` du client n'entrent dans ce chemin.
      const path = `attachments/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${EXTENSION_BY_KIND[kind]}`
      const res = await this.request(`/repos/${this.repo}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `chore(feedback): attachment ${path} (${sanitizeForLog(filenameHint).slice(0, 120)})`,
          content: dataBase64,
          branch: this.assetBranch,
        }),
      })
      if (!res.ok) {
        this.logger.error('GitHub asset upload failed', { status: res.status })
        return null
      }
      // `?raw=1` renders the blob (or opens it) from inside the issue body.
      return { url: `https://github.com/${this.repo}/blob/${this.assetBranch}/${path}?raw=1`, kind }
    } catch (error) {
      this.logger.error('GitHub asset upload error', { error })
      return null
    }
  }

  /**
   * Les lignes de code autour de celle qui a été pointée.
   *
   * Le rapport porte déjà `fichier:ligne:colonne` (estampillé au build). Ouvrir
   * ce fichier reste un aller-retour, et surtout : la ligne 86 d'aujourd'hui
   * n'est pas la ligne 86 du build que la personne avait sous les yeux. D'où le
   * `ref` — le SHA extrait de la version du build. Quand il est absent ou
   * inconnu du dépôt (build local, commit non poussé), on ne lit RIEN plutôt que
   * de coller la version d'aujourd'hui en la faisant passer pour la sienne.
   *
   * Renvoie `null` en cas d'échec : un extrait manquant ne doit jamais empêcher
   * l'issue de s'ouvrir.
   */
  async codeExcerpt(
    location: string,
    ref: string | null,
    radius = CODE_EXCERPT_RADIUS,
  ): Promise<{ path: string; line: number; ref: string; snippet: string } | null> {
    if (!this.enabled || !ref) return null
    const parsed = parseSourceLocation(location)
    if (!parsed) return null
    try {
      const res = await this.request(`/repos/${this.repo}/contents/${parsed.path}?ref=${encodeURIComponent(ref)}`)
      if (!res.ok) {
        this.logger.warn('GitHub code excerpt unavailable', { status: res.status })
        return null
      }
      const data = (await res.json()) as { content?: string; encoding?: string }
      if (!data.content || data.encoding !== 'base64') return null
      const lines = Buffer.from(data.content, 'base64').toString('utf8').split('\n')
      const from = Math.max(1, parsed.line - radius)
      const to = Math.min(lines.length, parsed.line + radius)
      const snippet = lines
        .slice(from - 1, to)
        .map((text, index) => {
          const number = from + index
          // Le curseur `>` sur la ligne pointée : sans lui, il faut compter les
          // lignes pour retrouver celle dont on parle.
          return `${number === parsed.line ? '>' : ' '} ${String(number).padStart(4)} | ${text}`
        })
        .join('\n')
      return { path: parsed.path, line: parsed.line, ref, snippet }
    } catch (error) {
      this.logger.warn('GitHub code excerpt failed', { error })
      return null
    }
  }

  /** Creates the asset branch off the default branch the first time it's needed. */
  private async ensureAssetBranch(): Promise<boolean> {
    const existing = await this.request(`/repos/${this.repo}/git/ref/heads/${this.assetBranch}`)
    if (existing.ok) return true
    if (existing.status !== 404) {
      this.logger.error('GitHub asset branch lookup failed', { status: existing.status })
      return false
    }

    const repoRes = await this.request(`/repos/${this.repo}`)
    if (!repoRes.ok) return false
    const { default_branch: defaultBranch } = (await repoRes.json()) as { default_branch: string }

    const headRes = await this.request(`/repos/${this.repo}/git/ref/heads/${defaultBranch}`)
    if (!headRes.ok) return false
    const head = (await headRes.json()) as { object: { sha: string } }

    const created = await this.request(`/repos/${this.repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${this.assetBranch}`, sha: head.object.sha }),
    })
    if (!created.ok) {
      this.logger.error('GitHub asset branch creation failed', { status: created.status })
      return false
    }
    return true
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${GITHUB_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  }
}
