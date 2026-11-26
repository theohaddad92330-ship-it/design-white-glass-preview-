import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE,
  autoMergeSurvivor,
  duplicatePairKey,
  isAutoMergeable,
  type DuplicateScanView,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import {
  findAccountDuplicatePairs,
  findDuplicatePairs,
  findSameSirenAccountPairs,
  findSetAsideAccountPairs,
  normalizeName,
  type DuplicatePair,
} from '../crm/crm-duplicates'
import { GovernanceService } from './governance.service'
import { killSwitchCut } from '../../common/kill-switches'

/**
 * Ce qui REMPLIT la liste des doublons.
 *
 * L'écran de gouvernance était complet — table `duplicate_pairs`, lecture,
 * bouton de décision, traductions — sauf le producteur :
 * `GovernanceService.proposeDuplicates()` n'était appelé de nulle part. La liste
 * était donc vide en production pour toujours, ce qui se lit « aucun doublon »
 * alors que ça voulait dire « personne ne cherche ». C'est le même défaut que la
 * file d'intervention avant son balayeur, et aucune suite de tests verte ne le
 * voit : tout le chemin de lecture fonctionne parfaitement sur zéro ligne.
 *
 * La détection elle-même n'est pas réécrite : c'est `findDuplicatePairs`, la
 * fonction pure déjà testée qui sert la routine d'hygiène CRM. Deux détecteurs
 * finiraient par proposer des rapprochements différents sur les mêmes fiches,
 * et l'utilisateur n'aurait aucun moyen de savoir lequel croire. Sa règle la
 * plus importante voyage avec elle : deux homonymes chez DEUX sociétés
 * différentes ne sont jamais rapprochés.
 *
 * **Portée : les contacts, et les comptes au NOM IDENTIQUE (#3490).** Les clés
 * des contacts — l'adresse, puis le nom À SOCIÉTÉ ÉGALE — ne décrivent pas une
 * entreprise : rapprocher deux comptes sur « un nom qui ressemble » proposerait
 * de fusionner « ACME » et « ACME Services », très souvent deux entités
 * réelles. Les comptes ne se rapprochent donc QUE sur l'égalité stricte du nom
 * normalisé (accents, casse, ponctuation : « Société Générale » / « Societe
 * Generale ») — jamais sur un nom contenu dans l'autre. Le rapprochement se
 * PROPOSE ; le rattachement reste un geste humain (`absorbAccount`).
 *
 * Interrupteur d'urgence : `DUPLICATES_SWEEP_DISABLED=true`.
 */
/** Dite à l'écran telle quelle (le panneau affiche `reason`) : une raison, pas un code. */
const ACCOUNT_SAME_NAME_REASON = 'Même nom, à l’accent ou à la casse près'
/** #4016 L6 — la raison d'une paire CERTAINE (≥ 0,99), dite telle quelle à l'écran. */
const CONTACT_CERTAIN_REASON = 'Même adresse et même nom'
/** #4016 L6 (15/10/2026) — la raison d'une paire de COMPTES certaine : le même SIREN, rien d'autre. */
const ACCOUNT_SAME_SIREN_REASON = 'Même SIREN'

/**
 * #4016 L6 — ⚠️⚠️ RENVERSEMENT DATÉ de c37 (Louis 11/10/2026) : la paire
 * CERTAINE, celle qui se fusionne sans clic.
 *
 * Le détecteur pur (`findDuplicatePairs`) n'est pas réécrit : il sert aussi la
 * routine d'hygiène du CRM externe, où rien ne se fusionne. La certitude se
 * décide ICI, sur une paire « même adresse » (0,95) dont les deux NOMS sont
 * aussi identiques (normalisés, non vides) et dont les sociétés ne se
 * contredisent pas (égales, ou absentes d'un côté). Deux fiches à la même
 * adresse chez deux sociétés NOMMÉES différentes restent une proposition :
 * c'est l'erreur qu'un CRM commercial ne pardonne pas. La date de naissance
 * n'entre dans AUCUNE clé (c58/c37, critère protégé).
 */
function certainty(pair: DuplicatePair): number {
  if (pair.reason !== 'same_email') return pair.confidence
  const leftName = normalizeName(pair.left.name)
  if (!leftName || leftName !== normalizeName(pair.right.name)) return pair.confidence
  const leftCompany = normalizeName(pair.left.company)
  const rightCompany = normalizeName(pair.right.company)
  if (leftCompany && rightCompany && leftCompany !== rightCompany) return pair.confidence
  return DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE
}

type AutoMergeInput = Parameters<GovernanceService['autoMergeContacts']>[1][number]
type ProposalInput = Parameters<GovernanceService['proposeDuplicates']>[1][number]

/** Ce qu'un balayage de périmètre a regardé, trouvé et écrit. */
type SweepResult = {
  examined: number
  detected: number
  known: number
  proposed: number
  /** #4016 L6 — paires fusionnées automatiquement (≥ 0,99) par ce passage. */
  autoMerged?: number
  setAside?: number
  /** #3490 (Y22) — les écartés nommés, et les paires de même nom dont un compte est écarté. */
  setAsideAccounts?: NonNullable<DuplicateScanView['setAsideAccounts']>
  setAsidePairs?: NonNullable<DuplicateScanView['setAsidePairs']>
}

/** #3490 — un passage qui n'a pas eu lieu se NOMME : `null` laissait l'écran muet. */
function notScanned(skipped: 'disabled' | 'demo'): DuplicateScanView {
  return {
    accountsExamined: null,
    contactsExamined: null,
    pairsDetected: 0,
    alreadyKnown: 0,
    failed: false,
    skipped,
    at: new Date().toISOString(),
  }
}

@Injectable()
export class DuplicatesSweeper {
  private readonly logger = new Logger(DuplicatesSweeper.name)

  /** #4471 — la taille d'une PAGE de lecture (curseur `(created_at, id)`) : une requête ne ramène jamais
   *  plus, quel que soit l'espace. */
  private static readonly READ_PAGE_SIZE = 5000
  /** #4471 — le PLAFOND de fiches examinées (contacts, puis comptes) par espace et par passage. Il ne
   *  borne plus ce qu'on VOIT à 5 000 lignes (l'espace de prod en compte 41 000 : le reste n'était jamais
   *  comparé) mais la MÉMOIRE : des lignes légères (id, nom, e-mail, société, date), tenues une fois.
   *  La détection reste bornée par seau (`DETECTION_CAP`) ; au-delà du plafond, le passage le DIT. */
  static readonly MAX_EXAMINED_PER_WORKSPACE = 100_000
  /** #4471 — la borne de TEMPS de lecture, par espace, par périmètre (contacts, comptes) et par passage.
   *  Coupé, le passage le journalise (lignes lues) et le suivant REPREND après la dernière ligne vue. */
  private static readonly READ_BUDGET_MS = 90_000
  /** Surchargeables par les tests (horloge, borne) — jamais par la configuration. */
  private readBudgetMs = DuplicatesSweeper.READ_BUDGET_MS
  private now: () => number = () => Date.now()
  /** Où reprendre, par `espace:périmètre` (mémoire du processus) — absent = repartir de la tête. */
  private readonly resumeFrom = new Map<string, { at: Date | string; id: string }>()
  /** #3490 (Y22) — combien de comptes écartés se NOMMENT à l'écran (le total réel reste dans `accountsSetAside`). */
  private static readonly SET_ASIDE_LISTED = 50
  /** Paires proposées par espace et par passage. Une liste de doublons qui ne
   *  se vide jamais ne s'ouvre plus. */
  private static readonly PAIRS_PER_WORKSPACE = 25
  /** Paires DÉTECTÉES avant de retirer celles que la base connaît (#3490) : le
   *  plafond d'écriture ci-dessus ne s'applique qu'APRÈS ce retrait. */
  private static readonly DETECTION_CAP = 1000

  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly governance: GovernanceService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /** Dernier balayage à la demande, par espace (mémoire du processus). */
  private readonly lastRefresh = new Map<string, number>()
  /** Son RAPPORT : ce que le passage a examiné, rendu tel quel dans la fenêtre de 5 minutes. */
  private readonly lastScan = new Map<string, DuplicateScanView>()
  private static readonly REFRESH_EVERY_MS = 5 * 60 * 1000

  /**
   * #3490 — balaie l'espace QUAND L'UTILISATEUR OUVRE la liste.
   *
   * Seul le cron de 05:40 produisait les paires : un compte créé ou analysé
   * après lui (« Societe Generale » à côté de « Société Générale ») restait
   * invisible jusqu'au lendemain, et l'écran disait « Aucun doublon en attente ».
   * Borné à un passage par espace et par 5 minutes ; une panne ne casse jamais
   * la lecture (la liste s'affiche, sans les paires neuves).
   *
   * Rend le RAPPORT du passage (recette Y13 : « Aucun doublon en attente »
   * restait muet sur ce qui avait été regardé). `null` = rien n'a été balayé
   * (démonstration, interrupteur posé) — l'écran ne prétend alors rien.
   */
  async refreshWorkspace(workspaceId: string, options: { force?: boolean } = {}): Promise<DuplicateScanView | null> {
    if (killSwitchCut('crm.duplicates_sweep')) return notScanned('disabled')
    try {
      const now = Date.now()
      const last = this.lastRefresh.get(workspaceId)
      // `force` : un geste humain vient de changer les comptes comparés
      // (désarchiver, rattacher) — la fenêtre de 5 minutes ne le couvre pas.
      if (!options.force && last !== undefined && now - last < DuplicatesSweeper.REFRESH_EVERY_MS) {
        return this.lastScan.get(workspaceId) ?? null
      }
      // Même règle que le cron : jamais d'écriture dans un espace de démonstration.
      const demo = await this.contacts.manager.query<{ is_demo: boolean }[]>(
        `SELECT is_demo FROM workspaces WHERE id = $1`,
        [workspaceId],
      )
      if (demo[0]?.is_demo) return notScanned('demo')
      // Le jeton de 5 minutes ne se pose qu'APRÈS un balayage réussi : une
      // panne passagère ne doit pas figer « Aucun doublon en attente » (#3490,
      // recette Y9 — la paire SG n'est jamais venue).
      const { scan } = await this.sweepWorkspace(workspaceId)
      this.lastScan.set(workspaceId, scan)
      if (!scan.failed) this.lastRefresh.set(workspaceId, now)
      return scan
    } catch (error) {
      this.logger.error('Balayage des doublons à la lecture en échec', { error })
      return {
        accountsExamined: null,
        contactsExamined: null,
        pairsDetected: 0,
        alreadyKnown: 0,
        failed: true,
        at: new Date().toISOString(),
      }
    }
  }

  /** 05:40 Europe/Paris — avant la file d'intervention de 06:10, pour que le
   *  responsable trouve les deux remplies en ouvrant son cockpit. */
  @Cron('40 5 * * *', { name: 'duplicates-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:duplicates.sweep')
  async runDailySweep(): Promise<void> {
    await withSingletonLock(this.locks, 'duplicates-sweep', async () => {
      await this.sweep()
    })
  }

  /**
   * Balaye et propose. Rend le nombre de paires RÉELLEMENT ajoutées.
   *
   * L'écart avec le nombre de paires détectées est le nombre de paires déjà
   * connues ou déjà tranchées — et c'est une information : un balayage qui
   * détecte trente doublons et n'en ajoute aucun veut dire que rien de neuf
   * n'est arrivé, pas qu'il est en panne.
   */
  async sweep(): Promise<number> {
    if (killSwitchCut('crm.duplicates_sweep')) {
      this.logger.log('Balayage des doublons désactivé (DUPLICATES_SWEEP_DISABLED=true)')
      return 0
    }

    const workspaces = await this.contacts.manager.query<{ workspace_id: string }[]>(
      `SELECT DISTINCT c.workspace_id
         FROM contacts c
         JOIN workspaces w ON w.id = c.workspace_id AND w.is_demo = false
        WHERE c.workspace_id IS NOT NULL
       UNION
       SELECT DISTINCT a.workspace_id
         FROM accounts a
         JOIN workspaces w ON w.id = a.workspace_id AND w.is_demo = false
        WHERE a.workspace_id IS NOT NULL`,
    )

    let proposed = 0
    for (const { workspace_id: workspaceId } of workspaces) {
      try {
        const startedAt = Date.now()
        const { proposed: workspaceProposed, scan } = await this.sweepWorkspace(workspaceId)
        proposed += workspaceProposed
        // #4471.7 — le coût se LIT au journal du cron, espace par espace : durée et fiches lues (un périmètre
        // illisible reste `null`, jamais « 0 »). Aucune valeur de fiche : des comptes et des durées seulement.
        this.logger.log('Balayage des doublons — espace balayé', {
          workspaceId,
          durationMs: Date.now() - startedAt,
          contactsExamined: scan.contactsExamined,
          accountsExamined: scan.accountsExamined,
          failed: scan.failed,
        })
      } catch (error) {
        // Un espace isolé : une fiche illisible chez un client ne doit pas
        // priver tous les autres de leur détection.
        this.logger.error('Détection de doublons en échec pour un espace', { error, workspaceId })
      }
    }
    this.logger.log(`Détection de doublons terminée — ${proposed} paire(s) proposée(s)`)
    return proposed
  }

  /**
   * Contacts ET comptes sont deux balayages INDÉPENDANTS (#3490, recette Y9).
   * Enchaînés sans garde, une lecture de contacts en échec emportait les
   * comptes : « Société Générale » / « Societe Generale » ne se proposait
   * jamais, et rien ne le disait. Le passage dit s'il est INCOMPLET (`failed`)
   * sans perdre les paires déjà proposées, et RAPPORTE ce qu'il a examiné
   * (un périmètre illisible reste `null` : non mesuré, jamais « 0 »).
   */
  private async sweepWorkspace(workspaceId: string): Promise<{ proposed: number; scan: DuplicateScanView }> {
    const scan: DuplicateScanView = {
      accountsExamined: null,
      accountsSetAside: null,
      contactsExamined: null,
      pairsDetected: 0,
      alreadyKnown: 0,
      failed: false,
      at: new Date().toISOString(),
    }
    let proposed = 0
    for (const [scope, run] of [
      ['contacts', () => this.sweepContacts(workspaceId)],
      ['comptes', () => this.sweepAccounts(workspaceId)],
    ] as const) {
      try {
        const result = await run()
        proposed += result.proposed
        scan.pairsDetected += result.detected
        scan.alreadyKnown += result.known
        scan.autoMerged = (scan.autoMerged ?? 0) + (result.autoMerged ?? 0)
        if (scope === 'contacts') {
          scan.contactsExamined = result.examined
        } else {
          scan.accountsExamined = result.examined
          scan.accountsSetAside = result.setAside ?? 0
          scan.setAsideAccounts = result.setAsideAccounts ?? []
          scan.setAsidePairs = result.setAsidePairs ?? []
        }
      } catch (error) {
        this.logger.error(`Balayage des doublons (${scope}) en échec`, { error, workspaceId })
        scan.failed = true
      }
    }
    return { proposed, scan }
  }

  /** #3490 — les dossiers déjà rattachés (`merged_into_id`) ou archivés sortent :
   *  proposer de rattacher ce qui l'est déjà ferait revenir un doublon réglé. */
  private async sweepAccounts(workspaceId: string): Promise<SweepResult> {
    const all = await this.readAllPages<{
      id: string
      name: string | null
      siren?: string | null
      created_at?: Date | string
      set_aside?: boolean
      merged?: boolean
    }>(
      `SELECT a.id, a.company_name AS name, a.siren, a.created_at,
              (a.merged_into_id IS NOT NULL OR COALESCE(a.status, '') = 'archived') AS set_aside,
              (a.merged_into_id IS NOT NULL) AS merged
         FROM accounts a
        WHERE a.workspace_id = $1
          AND ($2::timestamptz IS NULL OR (a.created_at, a.id) < ($2::timestamptz, $3::uuid))
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $4`,
      workspaceId,
      'comptes',
    )
    // Rattachés ou archivés : écartés du rapprochement, mais COMPTÉS — la liste
    // /accounts les montre encore, et « 67 examinés » sans eux se lisait comme
    // « les deux Société Générale ont été comparées » (#3490, recette Y20) — et
    // NOMMÉS (recette Y22 : « 2 comptes » sans nom ne se vérifie pas).
    const rows = all.filter(row => !row.set_aside)
    const setAside = all.length - rows.length
    const asideRows = all.filter(row => row.set_aside)
    const setAsideAccounts = asideRows.slice(0, DuplicatesSweeper.SET_ASIDE_LISTED).map(row => ({
      id: row.id,
      name: row.name?.trim() || '—',
      status: row.merged ? ('merged' as const) : ('archived' as const),
    }))
    const setAsidePairs =
      asideRows.length > 0
        ? findSetAsideAccountPairs(
            all.map(row => ({
              id: row.id,
              name: row.name,
              setAside: row.set_aside ? (row.merged ? ('merged' as const) : ('archived' as const)) : null,
            })),
            DuplicatesSweeper.SET_ASIDE_LISTED,
          )
        : []
    // #4016 L6 (15/10/2026) — même SIREN = même personne morale : fusion SEULE
    // (archive de l'absorbé, journal), jamais sur un nom. Le reste se propose.
    const sirenFound = findSameSirenAccountPairs(rows, DuplicatesSweeper.DETECTION_CAP)
    const { fresh: sirenFresh, known: sirenKnown } = await this.withoutKnown(workspaceId, 'account', sirenFound)
    const autoMergeOn = !killSwitchCut('crm.duplicates_auto_merge')
    const createdAt = new Map(rows.map(row => [row.id, toIso(row.created_at)]))
    const certain: Parameters<GovernanceService['autoMergeAccounts']>[1][number][] = []
    const sirenProposals: ProposalInput[] = []
    for (const pair of sirenFresh) {
      const leftAt = createdAt.get(pair.left.id)
      const rightAt = createdAt.get(pair.right.id)
      if (autoMergeOn && leftAt && rightAt) {
        certain.push({
          leftId: pair.left.id,
          rightId: pair.right.id,
          reason: ACCOUNT_SAME_SIREN_REASON,
          confidence: DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE,
          ...autoMergeSurvivor({ id: pair.left.id, createdAt: leftAt }, { id: pair.right.id, createdAt: rightAt }),
        })
      } else {
        sirenProposals.push({
          entityType: 'account' as const,
          leftId: pair.left.id,
          rightId: pair.right.id,
          reason: ACCOUNT_SAME_SIREN_REASON,
          confidence: DUPLICATE_AUTO_MERGE_MIN_CONFIDENCE,
        })
      }
    }
    const autoMerged = certain.length ? await this.governance.autoMergeAccounts(workspaceId, certain) : 0
    if (autoMerged) this.logger.log(`Comptes de même SIREN fusionnés dans Bellum — ${autoMerged}`, { workspaceId })
    const sirenKeys = new Set(sirenFound.map(pair => duplicatePairKey(pair.left.id, pair.right.id)))
    const detected = findAccountDuplicatePairs(rows, DuplicatesSweeper.DETECTION_CAP).filter(
      pair => !sirenKeys.has(duplicatePairKey(pair.left.id, pair.right.id)),
    )
    const { fresh: pairs, known } = await this.withoutKnown(workspaceId, 'account', detected)
    // Compteurs dans le journal : seul moyen de lire, en recette, « 25 comptes
    // examinés, 0 paire » (donnée) contre « 0 compte examiné » (périmètre).
    this.logger.log(
      `Doublons de comptes — ${rows.length} examiné(s), ${detected.length} paire(s) dont ${known} déjà connue(s)`,
      { workspaceId },
    )
    const proposals: ProposalInput[] = [
      ...sirenProposals,
      ...pairs.map(pair => ({
        entityType: 'account' as const,
        leftId: pair.left.id,
        rightId: pair.right.id,
        reason: ACCOUNT_SAME_NAME_REASON,
        confidence: pair.confidence,
      })),
    ]
    const proposed = proposals.length ? await this.governance.proposeDuplicates(workspaceId, proposals) : 0
    return {
      examined: rows.length,
      detected: detected.length + sirenFound.length,
      known: known + sirenKnown,
      proposed,
      autoMerged,
      setAside,
      setAsideAccounts,
      setAsidePairs,
    }
  }

  private async sweepContacts(workspaceId: string): Promise<SweepResult> {
    // Les fiches ÉCARTÉES sont exclues : proposer de fusionner un contact
    // supprimé ou anonymisé ferait ressortir à l'écran quelqu'un qu'on venait
    // justement de retirer.
    const rows = await this.readAllPages<{
      id: string
      name: string | null
      email: string | null
      company: string | null
      created_at?: Date | string
    }>(
      `SELECT c.id, c.full_name AS name, c.email, a.company_name AS company, c.created_at
         FROM contacts c
         LEFT JOIN accounts a ON a.id = c.account_id
        WHERE c.workspace_id = $1
          AND c.deleted_at IS NULL
          AND c.hidden = false
          AND c.anonymized_at IS NULL
          AND ($2::timestamptz IS NULL OR (c.created_at, c.id) < ($2::timestamptz, $3::uuid))
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT $4`,
      workspaceId,
      'contacts',
    )
    if (rows.length < 2) return { examined: rows.length, detected: 0, known: 0, proposed: 0 }

    const detected = findDuplicatePairs(rows, DuplicatesSweeper.DETECTION_CAP)
    const { fresh: pairs, known } = await this.withoutKnown(workspaceId, 'contact', detected)
    if (!pairs.length) return { examined: rows.length, detected: detected.length, known, proposed: 0 }

    // #4016 L6 — les paires CERTAINES (≥ 0,99) se fusionnent, dans Bellum
    // seulement ; les autres restent des propositions. L'interrupteur rend les
    // certaines à la proposition : rien ne se perd, un humain tranche.
    const autoMergeOn = !killSwitchCut('crm.duplicates_auto_merge')
    const createdAt = new Map(rows.map(row => [row.id, toIso(row.created_at)]))
    const certain: AutoMergeInput[] = []
    const proposals: ProposalInput[] = []
    for (const pair of pairs) {
      const confidence = certainty(pair)
      const leftAt = createdAt.get(pair.left.id)
      const rightAt = createdAt.get(pair.right.id)
      if (autoMergeOn && isAutoMergeable(confidence) && leftAt && rightAt) {
        certain.push({
          leftId: pair.left.id,
          rightId: pair.right.id,
          reason: CONTACT_CERTAIN_REASON,
          confidence,
          ...autoMergeSurvivor({ id: pair.left.id, createdAt: leftAt }, { id: pair.right.id, createdAt: rightAt }),
        })
        continue
      }
      proposals.push({
        entityType: 'contact' as const,
        leftId: pair.left.id,
        rightId: pair.right.id,
        reason: isAutoMergeable(confidence) ? CONTACT_CERTAIN_REASON : pair.reason,
        confidence,
      })
    }

    const autoMerged = certain.length ? await this.governance.autoMergeContacts(workspaceId, certain) : 0
    const proposed = proposals.length ? await this.governance.proposeDuplicates(workspaceId, proposals) : 0
    if (autoMerged) this.logger.log(`Doublons certains fusionnés dans Bellum — ${autoMerged}`, { workspaceId })
    return { examined: rows.length, detected: detected.length, known, proposed, autoMerged }
  }

  /**
   * #4471 — lit TOUT l'espace, page par page, par curseur `(created_at, id)` : un `LIMIT 5000` sec ne
   * comparait que les 5 000 fiches les plus récentes d'un espace qui en compte 41 000, et un doublon dont
   * une moitié était plus ancienne ne se proposait jamais. Chaque requête reste bornée à
   * `READ_PAGE_SIZE` ; la mémoire l'est à `MAX_EXAMINED_PER_WORKSPACE` (au-delà : on le dit, jamais en silence).
   */
  private async readAllPages<T extends { id: string; created_at?: Date | string }>(
    sql: string,
    workspaceId: string,
    scope: 'contacts' | 'comptes',
  ): Promise<T[]> {
    const rows: T[] = []
    const resumeKey = `${workspaceId}:${scope}`
    const resume = this.resumeFrom.get(resumeKey)
    let cursorAt: Date | string | null = resume?.at ?? null
    let cursorId: string | null = resume?.id ?? null
    const startedAt = this.now()
    for (;;) {
      const page: T[] = await this.contacts.manager.query<T[]>(sql, [
        workspaceId,
        cursorAt,
        cursorId,
        DuplicatesSweeper.READ_PAGE_SIZE,
      ])
      rows.push(...page)
      const last = page[page.length - 1]
      // Page courte = fin de l'espace. Une dernière ligne sans date ne se pagine pas : on s'arrête (jamais de boucle).
      if (!last || page.length < DuplicatesSweeper.READ_PAGE_SIZE || !last.created_at) {
        this.resumeFrom.delete(resumeKey) // fin de l'espace : le prochain passage repart de la tête
        return rows
      }
      if (rows.length >= DuplicatesSweeper.MAX_EXAMINED_PER_WORKSPACE) {
        this.logger.warn(
          `Doublons (${scope}) — plafond mémoire atteint : ${rows.length} fiche(s) examinée(s), le reste de l'espace n'est pas comparé`,
          { workspaceId },
        )
        return rows
      }
      if (this.now() - startedAt >= this.readBudgetMs) {
        this.resumeFrom.set(resumeKey, { at: last.created_at, id: last.id })
        this.logger.warn(
          `Doublons (${scope}) — borne de temps atteinte : ${rows.length} ligne(s) lue(s), le passage suivant reprend après la dernière`,
          { workspaceId },
        )
        return rows
      }
      cursorAt = last.created_at
      cursorId = last.id
    }
  }

  /**
   * #3490 — retire les paires que la base CONNAÎT (en attente ou déjà tranchées),
   * PUIS applique le plafond d'écriture. Plafonner avant ce retrait affamait les
   * paires neuves : les 25 premières détectées étaient déjà en base, `ON CONFLICT
   * DO NOTHING` ne leur faisait rien, et aucune paire suivante n'était jamais
   * essayée — « Aucun doublon en attente » pour toujours.
   */
  private async withoutKnown<P extends { left: { id: string }; right: { id: string } }>(
    workspaceId: string,
    entityType: 'account' | 'contact',
    detected: P[],
  ): Promise<{ fresh: P[]; known: number }> {
    if (!detected.length) return { fresh: [], known: 0 }
    const rows = await this.contacts.manager.query<{ pair_key: string }[]>(
      `SELECT pair_key FROM duplicate_pairs WHERE workspace_id = $1 AND entity_type = $2`,
      [workspaceId, entityType],
    )
    const stored = new Set(rows.map(row => row.pair_key))
    const fresh = detected.filter(pair => !stored.has(duplicatePairKey(pair.left.id, pair.right.id)))
    return { fresh: fresh.slice(0, DuplicatesSweeper.PAIRS_PER_WORKSPACE), known: detected.length - fresh.length }
  }
}

/** Une date de création lue en base (Date ou chaîne selon le pilote) ; `null` si illisible — jamais devinée. */
function toIso(value: Date | string | undefined): string | null {
  if (!value) return null
  const at = value instanceof Date ? value : new Date(value)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}
