import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { NoteEntity } from '../../database/entities/note.entity'
import { GoogleService } from '../google/google.service'
import { MicrosoftService } from '../microsoft/microsoft.service'
import { NotionService } from '../notion/notion.service'
import { accountNotesSource, MAX_NOTES_CITED, type AccountNote } from './account-notes'
import { ATS_CONFIG_SOURCE, type AtsConfigSource } from './ats-config-source'
import { BoondManagerClient } from './boondmanager.client'
import {
  accountSearchTerms,
  formatInternalHistory,
  type ZeroLayerFinding,
  type ZeroLayerSource,
} from './zero-layer-format'

/**
 * Couche zéro — les outils internes de l'ESN (annexe méthodo p8).
 *
 * La p8 énumère les endroits où dort l'historique d'un compte : le CRM, l'ATS,
 * le Drive, les e-mails, les notes, les CV déjà envoyés. Le CRM était branché
 * (`CrmReadService`) ; ce service branche les autres, et rend UN bloc de texte
 * que le pipeline injecte dans les prompts au même titre.
 *
 * Trois règles, non négociables parce que ce texte finit dans un prompt Claude :
 *
 *   1. **Zéro par défaut.** Une source non configurée / non connectée ne fait
 *      AUCUN appel réseau et n'écrit rien. Sans aucune intégration — le cas de
 *      l'immense majorité des workspaces — ce service rend `undefined` et le run
 *      est byte-identique à ce qu'il était avant la feature.
 *   2. **Une source qui tombe ne fait pas tomber l'analyse.** Chaque source est
 *      isolée : erreur, lenteur, token périmé → cette source rend `[]`, les
 *      autres continuent. Une analyse ne doit jamais échouer parce qu'un Drive
 *      était indisponible.
 *   3. **On cite, on n'interprète pas.** Un titre de document, une date, un
 *      expéditeur. Jamais « le compte semble actif » — c'est au commercial de
 *      lire ce que ça veut dire.
 */
/**
 * Les termes qui désignent un CV dans un NOM de fichier.
 *
 * Volontairement courts et peu nombreux : chercher « compétences » ou
 * « profil » remonterait la moitié d'un Drive d'ESN. Ce qu'on cherche est le
 * fichier qu'un recruteur vient de déposer, et il s'appelle « CV_… ».
 */
const CV_FILENAME_TERMS = ['CV', 'resume', 'curriculum'] as const

@Injectable()
export class ZeroLayerService {
  private readonly logger = new Logger(ZeroLayerService.name)

  constructor(
    @Optional() private readonly google?: GoogleService,
    @Optional() private readonly notion?: NotionService,
    @Optional() private readonly microsoft?: MicrosoftService,
    // Un REPOSITORY et non un service : lire les notes n'a pas à faire entrer
    // un module de plus dans les dépendances de la couche zéro (GA-07), et
    // `TypeOrmModule.forFeature([NoteEntity])` est déclaré côté module (GA-20).
    //
    // En DERNIÈRE position à dessein : les specs construisent ce service à la
    // main, positionnellement, et l'insérer devant aurait rendu `google` là où
    // le code attend un repository — un décalage que le compilateur attrape
    // ici, mais que rien n'attraperait sur un paramètre de même type.
    @Optional() @InjectRepository(NoteEntity) private readonly notes?: Repository<NoteEntity>,
    // #4687 — les identifiants ATS de l'ESPACE. Absent (specs à constructeur nu) ⇒ pas d'ATS, jamais l'environnement
    // lu en douce : une seule résolution existe, et c'est celle de ce port.
    @Optional() @Inject(ATS_CONFIG_SOURCE) private readonly atsConfig?: AtsConfigSource,
  ) {}

  /**
   * Les traces internes sur ce compte, prêtes à être injectées — ou `undefined`
   * quand il n'y a rien d'HONNÊTE à dire.
   *
   * `undefined` couvre tous les cas d'ignorance : aucune intégration connectée,
   * aucune trouvaille, toutes les sources en échec. C'est ce qui garantit
   * l'additivité — la clé ne part pas, le prompt ne bouge pas.
   */
  async describeInternalHistory(
    userId: string,
    account: {
      companyName: string
      domain?: string | null
      /**
       * Le compte lui-même, quand l'appelant le connaît — c'est ce qui permet
       * de citer les notes écrites dessus (#1088). Optionnel : un appelant qui
       * ne le passe pas obtient exactement le bloc d'avant.
       */
      accountId?: string | null
      workspaceId?: string | null
    },
  ): Promise<string | undefined> {
    const terms = accountSearchTerms(account)
    // ⚠️ Les notes ne dépendent PAS des termes de recherche : elles sont
    // attachées à l'identifiant du compte. Sortir avant de les lire parce que le
    // nom est trop court les perdrait sans que rien ne le dise.
    const notesSource = await this.fromAccountNotes(account.accountId ?? null, account.workspaceId ?? null)
    if (terms.length === 0) {
      return formatInternalHistory(notesSource ? [notesSource] : [])
    }

    const sources = await Promise.all([
      this.fromDrive(userId, terms),
      this.fromNotion(userId, terms),
      this.fromGmail(userId, account.domain ?? null),
      this.fromOutlook(userId, terms),
      this.fromAts(terms, account.workspaceId ?? null),
    ])

    return formatInternalHistory(
      [notesSource, ...sources].filter((source): source is ZeroLayerSource => source !== null),
    )
  }

  /**
   * Les notes de l'équipe sur ce compte (#1082, #1083, #1088).
   *
   * Contrairement aux autres sources, elle ne dépend d'AUCUNE intégration : ces
   * notes sont écrites dans Bellum. Elle reste néanmoins isolée comme les
   * autres — une lecture en échec rend `null` et le run continue : une analyse
   * ne tombe jamais parce qu'une note était illisible.
   *
   * Épinglées d'abord, puis les plus récentes : c'est l'ordre de l'écran, et
   * deux ordres pour la même liste finiraient par diverger.
   */
  private async fromAccountNotes(
    accountId: string | null,
    workspaceId: string | null,
  ): Promise<ZeroLayerSource | null> {
    // Un identifiant absent se refuse AVANT la lecture : TypeORM IGNORE une
    // condition `undefined` et rendrait les notes de n'importe quel compte.
    if (!this.notes || !accountId || !workspaceId) return null
    try {
      const rows = await this.notes.manager.query<
        Array<{
          body: string
          createdAt: Date | string
          firstName: string | null
          lastName: string | null
          fromAccount: string | null
        }>
      >(
        // #3895 — aussi les notes d'une autre entité du groupe qui DISENT valoir ici.
        `SELECT n.body, n.created_at AS "createdAt", p.first_name AS "firstName", p.last_name AS "lastName",
                CASE WHEN n.entity_id <> $1 THEN origin.company_name END AS "fromAccount"
           FROM notes n
           LEFT JOIN profiles p ON p.user_id = n.user_id
           LEFT JOIN accounts origin ON origin.id = n.entity_id AND origin.workspace_id = n.workspace_id
          WHERE n.entity_type = 'account' AND n.workspace_id = $2
            AND (n.entity_id = $1 OR $1 = ANY(n.also_applies_to_account_ids))
          ORDER BY n.pinned DESC, n.created_at DESC
          LIMIT $3`,
        [accountId, workspaceId, MAX_NOTES_CITED],
      )
      const notes: AccountNote[] = rows.map(row => ({
        body: row.body,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        // Un auteur non résolu reste `null` : mieux vaut une note sans nom
        // qu'un nom deviné à côté d'une phrase que quelqu'un devra assumer.
        author: [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null,
        fromAccount: row.fromAccount,
      }))
      return accountNotesSource(notes)
    } catch (error) {
      this.logger.warn('Account notes lookup failed — the run proceeds without them', {
        error: error instanceof Error ? error.message : String(error),
        accountId,
      })
      return null
    }
  }

  /**
   * Exécute une source en l'isolant complètement.
   *
   * Volontairement muet en `warn` plutôt qu'en `error` : une intégration non
   * connectée lève ici (les services `require*` throwent), et ce n'est PAS une
   * anomalie — c'est le cas nominal. Alerter dessus noierait les vraies pannes.
   */
  private async safely(key: string, run: () => Promise<ZeroLayerFinding[]>): Promise<ZeroLayerFinding[]> {
    try {
      return await run()
    } catch (error) {
      this.logger.debug(`Zero-layer source "${key}" unavailable — skipped`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /** Documents internes (Drive) : propositions, comptes rendus, CV envoyés. */
  /**
   * Les CV repérés dans l'espace documentaire (PDF 3, D17).
   *
   * ───────────────────────────────────────────────────────────────────────────
   * CE QUE CETTE MÉTHODE NE FAIT PAS
   * ───────────────────────────────────────────────────────────────────────────
   * Elle n'ingère RIEN. Un CV avalé sans que personne le sache créerait des
   * fiches dans le vivier — avec les données personnelles qui vont avec — sur la
   * seule foi d'un nom de fichier. Elle SIGNALE, et l'import reste un geste.
   *
   * La recherche porte sur des termes de nom de fichier, pas sur le contenu :
   * chercher « CV » dans le contenu de tout un Drive remonterait chaque compte
   * rendu qui mentionne le mot. Les CV, eux, s'appellent presque toujours
   * « CV_… » ou « resume… », et c'est la seule heuristique honnête ici.
   *
   * Chaque source est isolée : un Drive indisponible ne fait pas tomber
   * l'autre, et l'absence de connecteur rend une liste vide sans un appel.
   */
  async findRecentCvs(
    userId: string,
    maxAgeDays = 7,
    now: Date = new Date(),
  ): Promise<{ title: string; source: string; modifiedAt: string | null }[]> {
    const since = new Date(now.getTime() - maxAgeDays * 86_400_000)
    const found: { title: string; source: string; modifiedAt: string | null }[] = []

    for (const term of CV_FILENAME_TERMS) {
      const fromDrive = await this.safely('drive-cv', async () => {
        if (!this.google || !(await this.google.hasCapability(userId, 'drive'))) return []
        const page = await this.google.listDriveFiles(userId, { search: term, pageSize: 10 })
        return (page.files ?? [])
          .filter(file => file.name)
          .map(file => ({ title: file.name as string, date: file.modifiedTime ?? null, detail: 'drive' }))
      })
      for (const entry of fromDrive) {
        found.push({ title: entry.title, source: 'drive', modifiedAt: entry.date ?? null })
      }

      const fromOneDrive = await this.safely('onedrive-cv', async () => {
        if (!this.microsoft) return []
        const files = await this.microsoft.searchFiles(userId, { query: term, maxResults: 10 })
        return files
          .filter(file => file.name)
          .map(file => ({ title: file.name, date: file.modifiedAt ?? null, detail: 'onedrive' }))
      })
      for (const entry of fromOneDrive) {
        found.push({ title: entry.title, source: 'onedrive', modifiedAt: entry.date ?? null })
      }
    }

    // La borne d'âge est appliquée ICI et non dans la requête : ni Drive ni
    // Graph ne filtrent sur une date dans une recherche par nom, et un filtre
    // que le serveur ignore produirait une liste qui a l'air filtrée.
    //
    // Un fichier SANS date de modification est GARDÉ : « je ne sais pas quand »
    // n'est pas « c'est vieux », et écarter les non datés ferait disparaître
    // exactement les dépôts d'un connecteur qui ne renseigne pas le champ.
    const recent = found.filter(entry => {
      if (!entry.modifiedAt) return true
      const at = Date.parse(entry.modifiedAt)
      return Number.isNaN(at) || at >= since.getTime()
    })

    // Dédoublonné par titre : le même fichier remonte sur « CV » et sur « cv_ ».
    const seen = new Set<string>()
    return recent.filter(entry => {
      const key = entry.title.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  private async fromDrive(userId: string, terms: string[]): Promise<ZeroLayerSource | null> {
    if (!this.google) return null
    const findings = await this.safely('drive', async () => {
      if (!(await this.google!.hasCapability(userId, 'drive'))) return []
      const out: ZeroLayerFinding[] = []
      for (const term of terms) {
        const page = await this.google!.listDriveFiles(userId, { search: term, pageSize: 5 })
        for (const file of page.files ?? []) {
          // Un fichier sans nom exploitable n'est pas citable — on le saute
          // plutôt que de lui coller un libellé de remplacement.
          if (!file.name) continue
          out.push({ title: file.name, date: file.modifiedTime ?? null, detail: 'Google Drive' })
        }
      }
      return out
    })
    return { key: 'drive', label: 'Documents internes (Google Drive)', findings: dedupe(findings) }
  }

  /** Notes et comptes rendus (Notion). */
  private async fromNotion(userId: string, terms: string[]): Promise<ZeroLayerSource | null> {
    if (!this.notion) return null
    const findings = await this.safely('notion', async () => {
      const out: ZeroLayerFinding[] = []
      for (const term of terms) {
        const pages = await this.notion!.listPages(userId, term)
        for (const page of pages.slice(0, 5)) {
          // Pas de date : la recherche Notion n'en rend pas, et en fabriquer une
          // (date du jour, date d'ingestion) inventerait de l'ancienneté.
          out.push({ title: page.title, detail: page.type === 'database' ? 'base Notion' : 'page Notion' })
        }
      }
      return out
    })
    return { key: 'notion', label: 'Notes internes (Notion)', findings: dedupe(findings) }
  }

  /**
   * Échanges e-mail (Gmail) — cherchés par DOMAINE, pas par contact connu : la
   * question de la couche zéro est « quelqu'un ici parle-t-il déjà à cette
   * boîte ? », pas « ai-je écrit à cette personne ? ».
   *
   * Sans domaine, la source est sautée : chercher par nom d'entreprise dans une
   * boîte mail ramène surtout des newsletters.
   */
  private async fromGmail(userId: string, domain: string | null): Promise<ZeroLayerSource | null> {
    if (!this.google || !domain) return null
    const findings = await this.safely('gmail', async () => {
      if (!(await this.google!.hasCapability(userId, 'gmailRead'))) return []
      const messages = await this.google!.listGmailWithDomain(userId, { domain, maxResults: 5 })
      return messages.map(message => ({
        title: message.subject || '(sans objet)',
        date: message.date ?? null,
        detail: message.from ?? null,
      }))
    })
    return { key: 'gmail', label: 'Échanges e-mail (Gmail)', findings }
  }

  /** Échanges e-mail (Outlook / Microsoft 365). */
  private async fromOutlook(userId: string, terms: string[]): Promise<ZeroLayerSource | null> {
    if (!this.microsoft) return null
    const findings = await this.safely('outlook', async () => {
      const out: ZeroLayerFinding[] = []
      for (const term of terms) {
        const messages = await this.microsoft!.searchMailbox(userId, { term, maxResults: 5 })
        for (const message of messages) {
          out.push({
            title: message.subject || '(sans objet)',
            date: message.receivedAt,
            detail: message.from,
          })
        }
      }
      return out
    })
    return { key: 'outlook', label: 'Échanges e-mail (Outlook)', findings: dedupe(findings) }
  }

  /**
   * ATS BoondManager — l'ERP des ESN françaises, cité nommément p8.
   *
   * Les identifiants sont ceux de l'ESPACE du compte analysé (#4687), résolus par la même fonction que l'écran
   * `/integrations` : la ligne `ats_connections` de l'espace, l'environnement à défaut de ligne. Un espace non branché
   * (et sans repli serveur) ne fait AUCUN appel à l'éditeur, et les identifiants d'un autre espace ne sont jamais lus.
   * Une résolution en échec (jeton illisible, base indisponible) vaut « pas d'ATS » : l'analyse continue.
   */
  private async fromAts(terms: string[], workspaceId: string | null): Promise<ZeroLayerSource | null> {
    if (!this.atsConfig) return null
    let config: Awaited<ReturnType<AtsConfigSource['resolveForWorkspace']>>
    try {
      config = await this.atsConfig.resolveForWorkspace(workspaceId)
    } catch (error) {
      this.logger.debug('Zero-layer source "ats" unavailable — skipped', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
    if (!config) return null

    const findings = await this.safely('ats', async () => {
      const client = new BoondManagerClient(config)
      const out: ZeroLayerFinding[] = []
      for (const term of terms) {
        const companies = await client.findCompanies(term)
        // Une seule société par terme : au-delà, le rattachement devient une
        // supposition, et une supposition injectée dans un prompt est un fait.
        const best = companies[0]
        if (!best) continue
        out.push(...(await client.describeCompany(best.id, best.name)))
        break
      }
      return out
    })
    return { key: 'ats', label: 'ATS (BoondManager)', findings }
  }
}

/** Dédoublonne sur le titre : deux termes de recherche ramènent souvent le même
 *  document, et le citer deux fois lui donnerait un poids qu'il n'a pas. */
function dedupe(findings: ZeroLayerFinding[]): ZeroLayerFinding[] {
  const seen = new Set<string>()
  const out: ZeroLayerFinding[] = []
  for (const finding of findings) {
    const key = finding.title.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(finding)
  }
  return out
}
