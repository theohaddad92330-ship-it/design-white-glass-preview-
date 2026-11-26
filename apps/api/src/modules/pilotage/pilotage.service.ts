import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  BTMMP_AXES,
  DECIDED_STAGES,
  FOCUS_STALE_DAYS,
  SPRINT_EVENTS,
  TRIAGED_STAGES,
  decisionRoleSchema,
  deriveAccountStrategy5P,
  isReexaminationDue,
  nextReviewCondition,
  parseAccountAnalysis,
  reactivationOptions,
  projectStageInSql,
  shouldSwitch,
  type AccountStrategy5PContactInput,
  type AccountStrategy5PMissionInput,
  type AccountStrategy5PPartnerInput,
  type FocusReviewSignal,
  type PilotageInputs,
  type PilotageReport,
  type ReviewSignals,
  evaluatePilotageChain,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Marge et DSO de la chaîne, lus dans Finance par le CONTRÔLEUR (exempté du cliquet GA-07). */
export type FinanceInputs = Pick<PilotageInputs, 'marginPercent' | 'dsoDays'>

/**
 * KPI de chaîne (annexe méthodo p24) — « mesurer la chaîne, pas seulement le
 * volume ». Ce service AGRÈGE la donnée déjà produite (funnel contacts, besoins
 * matérialisés + leur qualification BTMMP, comptes clients actifs, corrections
 * utilisateur) en métriques brutes, puis délègue au calcul DÉTERMINISTE partagé
 * `evaluatePilotageChain` (dans `@bellum/contracts`, testé sans base) qui pose
 * les seuils d'alerte par maillon.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DE CE FICHIER (défaut trouvé en recette live le 27/08)
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` ne veut dire qu'UNE chose : la source n'a pas répondu. Un comptage qui
 * revient à zéro est une MESURE et sort `0`. Les deux se ressemblaient parce que
 * chaque lecture finissait par un `?? 0` : une requête en échec affirmait
 * « aucun client actif », ce que personne ne pouvait distinguer d'un espace qui
 * n'a effectivement aucun client.
 *
 * Corollaire : chaque source est lue SÉPARÉMENT. Un `consultants` indisponible
 * ne doit pas effacer les sept autres maillons — c'est la leçon de la vue
 * Qualité, où un `Promise.all` faisait disparaître les huit lignes parce qu'une
 * seule requête avait raté.
 */
@Injectable()
export class PilotageService {
  private readonly logger = new Logger(PilotageService.name)

  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ProjectEntity)
    private readonly opportunities: Repository<ProjectEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async getChain(userId: string, knownWorkspaceId?: string, finance?: FinanceInputs): Promise<PilotageReport> {
    try {
      // P5 (29/09) — le contrôleur a déjà résolu l'espace actif : le lui faire
      // refaire coûtait 1 à 3 requêtes de plus sur un appel à 1,6-2,9 s.
      const workspaceId = knownWorkspaceId ?? (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
      return await this.getChainForWorkspace(workspaceId, finance)
    } catch (error) {
      this.logger.error('getChain error', { error })
      // Dégradation gracieuse : une chaîne vide plutôt qu'une 500 — le pilotage
      // ne doit jamais casser l'app. Sur ce repli, TOUS les maillons remontent
      // `non_mesure` ET aucun ne porte de chiffre : on n'a rien lu, donc on
      // n'affirme rien. Alerter ici serait l'inverse de l'honnêteté — on ferait
      // chercher un décrochage commercial là où il n'y a qu'une base injoignable.
      return evaluatePilotageChain(UNREAD_INPUTS)
    }
  }

  /**
   * La même chaîne, pour un espace déjà résolu.
   *
   * Elle existe pour la photo mensuelle des stocks : le balayage tourne sans
   * utilisateur, et il doit photographier EXACTEMENT le chiffre que l'écran
   * affiche. Repasser par une seconde requête « équivalente » aurait été le
   * défaut classique du dépôt — deux dérivations pour une question, qui
   * divergent au premier correctif appliqué d'un seul côté.
   *
   * ⚠️ Elle ne rattrape RIEN : une source illisible remonte `null`, et
   * l'appelant n'écrit alors aucune ligne. Un repli à zéro figerait un faux
   * zéro pour toujours — une photo ne se refait pas le mois suivant.
   */
  async getChainForWorkspace(workspaceId: string, finance?: FinanceInputs): Promise<PilotageReport> {
    const inputs = await this.gatherInputs(workspaceId)
    return evaluatePilotageChain(finance ? { ...inputs, ...finance } : inputs)
  }

  /**
   * Une source, lue ou pas.
   *
   * Rend `null` quand la requête échoue OU ne rend aucune ligne. Les deux cas
   * disent la même chose au rapport : on ne sait pas. C'est le seul endroit du
   * service où l'on a le droit de perdre la distinction, donc le seul à
   * surveiller.
   */
  private async readRow<T>(source: string, run: () => Promise<T[]>): Promise<T | null> {
    try {
      const [row] = await run()
      return row ?? null
    } catch (error) {
      this.logger.error(`pilotage: source ${source} illisible`, { error })
      return null
    }
  }

  private async gatherInputs(workspaceId: string): Promise<PilotageInputs> {
    // Funnel contacts — une seule agrégation sans GROUP BY (comme dashboard-roi).
    //
    // ⚠️ `meetings` NE VIENT PAS d'un agenda. C'est le nombre de fiches contact
    // que le commercial a lui-même basculées en `meeting`, dans une table du
    // produit toujours lisible : aucun connecteur ne s'interpose, donc « 0 »
    // n'est jamais un « 0 rendez-vous parce que l'agenda n'est pas branché ».
    // Lu ⇒ c'est un zéro MESURÉ et il s'affiche. Non lu ⇒ `null`.
    const contactRowPromise = this.readRow<{
      total: number
      contacted: number
      replied: number
      meeting: number
      emailsSent: number
    }>('contacts', () =>
      this.contacts.query(
        `SELECT
           COUNT(*)::int                                          AS "total",
           COUNT(*) FILTER (WHERE user_status = 'contacted')::int AS "contacted",
           COUNT(*) FILTER (WHERE user_status = 'replied')::int   AS "replied",
           COUNT(*) FILTER (WHERE user_status = 'meeting')::int   AS "meeting",
           COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL)::int AS "emailsSent"
         FROM contacts WHERE workspace_id = $1`,
        [workspaceId],
      ),
    )

    // Besoins. Le « qualifié » réutilise EXACTEMENT la règle du contrat (les 6
    // axes BTMMP) via un filtre SQL équivalent — pas une seconde définition.
    //
    // ⚠️ Les deux populations comptées ici ne sont plus « les besoins ouverts ».
    //   • `triaged` = ce qu'un HUMAIN a pris en charge — `TRIAGED_STAGES`, du
    //     contrat (D37). L'intake (`detected`, `potential`) en est retiré : une
    //     analyse qui détecte quarante projets gonflerait le dénominateur du
    //     taux de qualification et le ferait chuter toute seule — le pipeline
    //     serait puni de faire son travail. Cette raison-là vaut ICI, et c'est
    //     pourquoi ce n'est pas `LIVE_STAGES` : « en jeu » répond à « reste-t-il
    //     quelque chose à faire ? », pas à « quelqu'un s'en occupe-t-il ? ».
    //   • `qualified` est restreint à cette même population, sans quoi un besoin
    //     GAGNÉ au BTMMP complet comptait au numérateur et pas au dénominateur,
    //     et le taux pouvait dépasser 100 %.
    //   • `decided` = les besoins dont l'ISSUE est connue — `DECIDED_STAGES`. Un
    //     besoin en veille n'a pas d'issue, il n'y entre pas.
    //
    // ⚠️ Les deux listes se DEMANDENT au contrat. Elles étaient calculées ici
    // par complément (`NOT IN (intake ∪ clos)`) : le résultat était le même,
    // mais un dixième stade ajouté demain y serait entré en silence.
    const btmmpFullPredicate = BTMMP_AXES.map(axis => `COALESCE(btrim(btmmp->>'${axis}'), '') <> ''`).join(' AND ')
    const triaged = projectStageInSql('stage', TRIAGED_STAGES)
    const needRowPromise = this.readRow<{
      triaged: number
      qualified: number
      btmmp_known: number
      decided: number
      converted: number
    }>('opportunities', () =>
      this.opportunities.query(
        `SELECT
           COUNT(*) FILTER (WHERE ${triaged})::int AS "triaged",
           COUNT(*) FILTER (WHERE ${triaged}
                              AND btmmp IS NOT NULL AND ${btmmpFullPredicate})::int AS "qualified",
           COUNT(*) FILTER (WHERE ${triaged} AND btmmp IS NOT NULL)::int AS "btmmp_known",
           COUNT(*) FILTER (WHERE ${projectStageInSql('stage', DECIDED_STAGES)})::int AS "decided",
           COUNT(*) FILTER (WHERE stage = 'won')::int AS "converted"
         FROM opportunities WHERE workspace_id = $1`,
        [workspaceId],
      ),
    )

    // Comptes clients actifs + corrections utilisateur (org_rejected_items) —
    // la « qualité Bellum » p24. Corrections = un proxy honnête de « faux
    // contacts / taux de correction ».
    // Le compte des SIGNAUX voyage avec cette requête : il se lit dans la même
    // table, sur la colonne `recent_signals` — celle-là même que l'écran Veille
    // dénombre. Ce chiffre était écrit `0` en dur, avec le statut « ok » : côté
    // écran, « Signaux 0 » s'affichait à côté de « 2044 contacts ciblés », et se
    // lisait « nous n'avons aucun signal » alors que la Veille en comptait 116.
    // `jsonb_typeof` garde le compte juste si une ligne ancienne porte autre
    // chose qu'un tableau (un objet, ou `null`) : une valeur illisible ne
    // gonfle rien et ne fait pas tomber la requête.
    //
    // ⚠️ `activeClients` : `commercial_status` porte toujours une valeur, et un
    // compte qui n'est pas marqué `customer` n'est pas un client. « Aucun client
    // actif » est donc un FAIT dès que la requête revient, et il sort `0`.
    const accountRowPromise = this.readRow<{ activeClients: number; rejected: number; signals: number }>(
      'accounts',
      () =>
        this.contacts.query(
          `SELECT
             COUNT(*) FILTER (WHERE commercial_status = 'customer')::int         AS "activeClients",
             COALESCE(SUM(jsonb_array_length(COALESCE(org_rejected_items, '[]'::jsonb))), 0)::int AS "rejected",
             COALESCE(SUM(
               CASE WHEN jsonb_typeof(recent_signals) = 'array' THEN jsonb_array_length(recent_signals) ELSE 0 END
             ), 0)::int AS "signals"
           FROM accounts WHERE workspace_id = $1 AND status <> 'deleted'`,
          [workspaceId],
        ),
    )

    // Vivier poussable (annexe p22) — consultants disponibles maintenant.
    //
    // ⚠️ `availability` n'est jamais NULL : elle vaut `inconnu` par défaut, et
    // l'entité pose la règle — « `inconnu` n'est JAMAIS présenté comme
    // disponible ». Un vivier de vingt consultants dont personne n'a renseigné
    // sa disponibilité comptait donc `0` poussables, ce qui se lit « je n'ai
    // personne à pousser » alors que la vérité est « je ne sais pas ». D'où le
    // seul cas où ce chiffre vaut `null` : des consultants existent, et pas un
    // seul ne porte de disponibilité lisible. Un vivier VIDE, lui, reste `0` —
    // c'est une mesure, et le contrat l'affiche.
    const benchRowPromise = this.readRow<{ total: number; known: number; bench: number }>('consultants', () =>
      this.contacts.query(
        `SELECT
           COUNT(*)::int                                          AS "total",
           COUNT(*) FILTER (WHERE availability <> 'inconnu')::int AS "known",
           COUNT(*) FILTER (WHERE availability IN ('immediate','sous_1_mois'))::int AS "bench"
         FROM consultants WHERE workspace_id = $1`,
        [workspaceId],
      ),
    )

    // P5 (29/09 — `GET /pilotage/chain` mesuré à 1,6-2,9 s) : quatre lectures
    // INDÉPENDANTES (contacts, besoins, comptes, consultants) s'enchaînaient. Chacune
    // est déjà isolée par `readRow` (jamais de rejet, `null` si illisible) : les
    // lancer ensemble ne change rien à la doctrine « une source en panne
    // n'efface pas les autres ».
    const [contactRow, needRow, accountRow, benchRow] = await Promise.all([
      contactRowPromise,
      needRowPromise,
      accountRowPromise,
      benchRowPromise,
    ])

    return {
      contactsTargeted: contactRow?.total ?? null,
      signals: accountRow?.signals ?? null,
      // « Profils poussés » reste NON MESURÉ, et c'est un choix. La seule trace
      // en base est `consultant_push_feedback`, qui n'enregistre que les pushes
      // ayant reçu un retour : les compter donnerait un nombre plus petit que la
      // réalité, sans que rien ne le dise. Un sous-comptage silencieux est pire
      // qu'un « non mesuré » assumé — il se prend pour une mesure.
      profilesPushed: null,
      emailsSent: contactRow?.emailsSent ?? null,
      replied: contactRow?.replied ?? null,
      meetings: contactRow?.meeting ?? null,
      // #4191 R22 — aucun besoin pris en charge ne porte le moindre BTMMP : la qualification n'a pas été
      // SAISIE, ce n'est pas un taux de 0 % mesuré (doctrine : « non mesuré » n'est jamais « 0 »).
      needsQualified: needRow && needRow.triaged > 0 && needRow.btmmp_known === 0 ? null : (needRow?.qualified ?? null),
      needsTriaged: needRow?.triaged ?? null,
      needsDecided: needRow?.decided ?? null,
      benchAvailable: pushableBench(benchRow),
      conversions: needRow?.converted ?? null,
      marginBand: null, // TJM/marge/DSO non captés → non mesuré (jamais inventé)
      activeClients: accountRow?.activeClients ?? null,
      rejectedItems: accountRow?.rejected ?? null,
      totalContacts: contactRow?.total ?? null,
    }
  }

  /**
   * #3262.24-28 (épopée #3262, lot R11 29/09) — LES SIGNAUX DE REVUE, POUR LA
   * BANDE DE DÉCISION (`DecisionStrip.tsx`).
   *
   * Quatre faits déjà calculables ailleurs, jamais agrégés ni affichés :
   *
   *  - `staleFocusCount` : des comptes `focus` (tome 5) depuis plus de
   *    {@link FOCUS_STALE_DAYS} — la MÊME cadence que nomme déjà l'évènement
   *    `thirty_days_idle` (`SPRINT_EVENTS`, `@bellum/contracts`), jamais un
   *    second seuil recopié en dur (GA-26).
   *  - `noGoToRevisitCount` : des comptes écartés (`priority_gate = 'parked'`)
   *    dont le délai de réexamen est écoulé — `isReexaminationDue` (déjà
   *    testé, `@bellum/contracts`), appliqué ici à `gate_reason`/
   *    `gate_decided_at`, jamais recalculé.
   *  - `accountsWithoutOwnerCount` : `assigned_to IS NULL`, la MÊME colonne
   *    que `ManagerService.coverageMap`/`BriefingService.buildAccountsWithoutOwner`.
   *  - `accountsWithoutDateCount` : `relationship_memory.nextReviewAt` absent,
   *    la MÊME lecture que la fiche compte.
   *  - `accountsWithoutMovementCount` (#3262.24, épopée #3284, ce lot) : des
   *    comptes de la file EXÉCUTION (`SPRINT_LANE_LEVELS.execution` —
   *    `extension`/`volume`, `@bellum/contracts`) sans activité
   *    (`activities.occurred_at`) depuis plus de {@link FOCUS_STALE_DAYS}, ou
   *    sans aucune activité connue. **Tranché sans Louis** : « actif » = la
   *    file EXÉCUTION, jamais la file ARBITRAGE (`focus`/`no_go`/`watch`/
   *    `partner_route`) — ces comptes-là sont déjà couverts par
   *    `staleFocusCount`/`noGoToRevisitCount` et compter deux fois le même
   *    compte sous deux cartes différentes serait trompeur. Le seuil réutilise
   *    `FOCUS_STALE_DAYS` (GA-26, même cadence que `thirty_days_idle`), jamais
   *    un second chiffre inventé pour la même question.
   *
   * `null` = la lecture a échoué, jamais un zéro deviné (règle de tête de ce
   * fichier). Un compte archivé ou supprimé n'entre dans AUCUN des cinq —
   * une revue qui ne peut plus se produire n'attend aucune décision.
   */
  async reviewSignals(workspaceId: string): Promise<ReviewSignals> {
    const scopeSql = `workspace_id = $1 AND status <> 'deleted' AND commercial_status <> 'archived'`

    const countsRow = await this.readRow<{
      staleFocusCount: number
      accountsWithoutOwnerCount: number
      accountsWithoutDateCount: number
      accountsWithoutMovementCount: number
    }>('accounts (review signals)', () =>
      this.contacts.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE sprint = 'focus' AND sprint_entered_at < now() - ($2 || ' days')::interval
           )::int AS "staleFocusCount",
           COUNT(*) FILTER (WHERE assigned_to IS NULL)::int AS "accountsWithoutOwnerCount",
           COUNT(*) FILTER (
             WHERE relationship_memory IS NULL OR relationship_memory ->> 'nextReviewAt' IS NULL
           )::int AS "accountsWithoutDateCount",
           COUNT(*) FILTER (
             WHERE sprint IN ('extension', 'volume')
               AND (last_movement.occurred_at IS NULL OR last_movement.occurred_at < now() - ($2 || ' days')::interval)
           )::int AS "accountsWithoutMovementCount"
         FROM accounts
         LEFT JOIN (
           SELECT account_id, MAX(occurred_at) AS occurred_at
           FROM activities
           WHERE account_id IS NOT NULL
           GROUP BY account_id
         ) last_movement ON last_movement.account_id = accounts.id
         WHERE ${scopeSql}`,
        [workspaceId, FOCUS_STALE_DAYS],
      ),
    )

    let noGoToRevisitCount: number | null
    try {
      const parkedRows = await this.contacts.query<
        Array<{ gate_reason: string | null; gate_decided_at: string | null }>
      >(`SELECT gate_reason, gate_decided_at FROM accounts WHERE ${scopeSql} AND priority_gate = 'parked'`, [
        workspaceId,
      ])
      const now = new Date()
      noGoToRevisitCount = parkedRows.filter(row =>
        isReexaminationDue(row.gate_reason, row.gate_decided_at, now),
      ).length
    } catch (error) {
      this.logger.error('pilotage: source accounts (no-go à revisiter) illisible', { error })
      noGoToRevisitCount = null
    }

    // #3407.5 — « veille à réveiller » : un signal arrivé depuis l'entrée en veille.
    let watchToWakeCount: number | null
    try {
      const watchRows = await this.contacts.query<Array<{ watchToWakeCount: number }>>(
        `SELECT COUNT(*)::int AS "watchToWakeCount"
           FROM accounts a
          WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'
            AND a.sprint = 'watch' AND a.sprint_entered_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM opportunities o
               WHERE o.account_id = a.id AND o.kind = 'signal' AND o.archived_at IS NULL
                 AND o.lifecycle_status IN ('nouveau', 'confirme')
                 AND o.first_detected_at > a.sprint_entered_at
            )`,
        [workspaceId],
      )
      watchToWakeCount = watchRows[0]?.watchToWakeCount ?? null
    } catch (error) {
      this.logger.error('pilotage: source accounts (veille à réveiller) illisible', { error })
      watchToWakeCount = null
    }

    const { strategyNoGoCount, strategyBlockedCount } = await this.strategyReadinessCounts(workspaceId, scopeSql)

    return {
      staleFocusCount: countsRow?.staleFocusCount ?? null,
      accountsWithoutOwnerCount: countsRow?.accountsWithoutOwnerCount ?? null,
      accountsWithoutDateCount: countsRow?.accountsWithoutDateCount ?? null,
      accountsWithoutMovementCount: countsRow?.accountsWithoutMovementCount ?? null,
      noGoToRevisitCount,
      strategyNoGoCount,
      strategyBlockedCount,
      watchToWakeCount,
    }
  }

  /**
   * #3277.5 (épopée #3277, lot E22 30/09) — Pilotage devient le cinquième
   * appelant nommé d'`AccountStrategy5P` (avec la fiche Compte et Laura,
   * #3277.1). `deriveAccountStrategy5P` est LA dérivation canonique
   * (`account-strategy-5p.ts`) — appelée telle quelle, jamais recopiée : une
   * lecture en masse (deux requêtes) plutôt qu'un appel par compte, pour ne
   * pas transformer un portefeuille de plusieurs milliers de comptes en
   * autant de requêtes (N+1) — `AccountStrategy5PService.strategyFor` reste
   * la maison canonique pour un SEUL compte (fiche Compte, Laura).
   */
  private async strategyReadinessCounts(
    workspaceId: string,
    scopeSql: string,
  ): Promise<{ strategyNoGoCount: number | null; strategyBlockedCount: number | null }> {
    try {
      const accountRows = await this.contacts.query<Array<{ id: string; raw_analysis: unknown }>>(
        `SELECT id, raw_analysis FROM accounts WHERE ${scopeSql}`,
        [workspaceId],
      )
      const accountIds = accountRows.map(row => row.id)
      const contactRows =
        accountIds.length === 0
          ? []
          : await this.contacts.query<
              Array<{
                account_id: string
                id: string
                full_name: string
                decision_role: string | null
                title: string | null
              }>
            >(
              `SELECT account_id, decision_role, id, full_name, title FROM contacts WHERE account_id = ANY($1) AND deleted_at IS NULL`,
              [accountIds],
            )

      // #3277.6/.7 — mêmes missions que `AccountStrategy5PService` (P4 REX /
      // consultant, P5 client existant) : une requête groupée, jamais N.
      const missionRows =
        accountIds.length === 0
          ? []
          : await this.contacts.query<
              Array<{ account_id: string; label: string; status: string; full_name: string | null }>
            >(
              `SELECT m.account_id, m.label, m.status, c.full_name
                 FROM missions m
                 LEFT JOIN mission_assignments ma ON ma.mission_id = m.id
                 LEFT JOIN consultants c ON c.id = ma.consultant_id
                WHERE m.workspace_id = $1 AND m.account_id = ANY($2)`,
              [workspaceId, accountIds],
            )
      const missionsByAccount = new Map<string, Map<string, AccountStrategy5PMissionInput>>()
      for (const row of missionRows) {
        const perAccount = missionsByAccount.get(row.account_id) ?? new Map<string, AccountStrategy5PMissionInput>()
        const key = `${row.label}\u0000${row.status}`
        const entry = perAccount.get(key) ?? { label: row.label, status: row.status, consultants: [] as string[] }
        if (row.full_name) (entry.consultants as string[]).push(row.full_name)
        perAccount.set(key, entry)
        missionsByAccount.set(row.account_id, perAccount)
      }

      // #3277.7 — les ESN détectées par compte (`partner`, `rank_2`), non écartées.
      const partnerRows =
        accountIds.length === 0
          ? []
          : await this.contacts.query<Array<{ account_id: string } & AccountStrategy5PPartnerInput>>(
              `SELECT ap.account_id, ap.name, ap.rank, ap.relationship, ap.source, ap.placements
                 FROM account_partners ap
                WHERE ap.workspace_id = $1 AND ap.account_id = ANY($2) AND ap.dismissed_at IS NULL`,
              [workspaceId, accountIds],
            )
      const partnersByAccount = new Map<string, AccountStrategy5PPartnerInput[]>()
      for (const row of partnerRows) {
        partnersByAccount.set(row.account_id, [
          ...(partnersByAccount.get(row.account_id) ?? []),
          {
            name: row.name,
            rank: row.rank,
            relationship: row.relationship,
            source: row.source,
            placements: row.placements,
          },
        ])
      }

      const contactsByAccount = new Map<string, AccountStrategy5PContactInput[]>()
      for (const row of contactRows) {
        const list = contactsByAccount.get(row.account_id) ?? []
        list.push({
          id: row.id,
          full_name: row.full_name,
          decision_role: decisionRoleSchema.safeParse(row.decision_role).data ?? null,
          title: row.title,
        })
        contactsByAccount.set(row.account_id, list)
      }

      let strategyNoGoCount = 0
      let strategyBlockedCount = 0
      for (const account of accountRows) {
        const { readiness } = deriveAccountStrategy5P({
          accountId: account.id,
          analysis: parseAccountAnalysis(account.raw_analysis),
          contacts: contactsByAccount.get(account.id) ?? [],
          partners: partnersByAccount.get(account.id) ?? [],
          missions: [...(missionsByAccount.get(account.id)?.values() ?? [])],
        })
        if (readiness === 'NO_GO') strategyNoGoCount += 1
        else if (readiness === 'BLOCKED') strategyBlockedCount += 1
      }
      return { strategyNoGoCount, strategyBlockedCount }
    } catch (error) {
      this.logger.error('pilotage: readiness AccountStrategy5P illisible', { error })
      return { strategyNoGoCount: null, strategyBlockedCount: null }
    }
  }

  /**
   * #3262.23 (épopée #3284, lot P05 29/09) — LA PHRASE DE LAURA, sur UN
   * compte nommé plutôt qu'agrégée : la MÊME règle que `staleFocusCount`
   * (ci-dessus), appliquée à un seul compte pour que Laura puisse la dire
   * dans le chat (« ce compte traîne-t-il ? »).
   *
   * Relaie `shouldSwitch('focus', 'thirty_days_idle')` (`@bellum/contracts`)
   * TEL QUEL — aucune seconde règle de stagnation, aucun compteur inventé
   * (le « six actions sans nouvelle information » de la spec verbatim n'est
   * mesuré nulle part : `sprint_entered_at` est ce qui EST mesuré).
   *
   * `null` = compte introuvable dans l'espace (supprimé, archivé, ou d'un
   * autre espace). `applicable: false` = le compte n'est pas EN Focus, ou sa
   * date d'entrée est inconnue : la question ne se pose pas, ce n'est ni un
   * zéro ni une stagnation niée.
   */
  async focusReviewForAccount(
    workspaceId: string,
    accountId: string,
    now: Date = new Date(),
  ): Promise<FocusReviewSignal | null> {
    const row = await this.readRow<{
      company_name: string
      sprint: string | null
      sprint_entered_at: string | null
      priority_gate: string | null
      gate_reason: string | null
      gate_decided_at: string | null
      next_review_at: string | null
    }>('accounts (focus review)', () =>
      this.contacts.query(
        `SELECT company_name, sprint, sprint_entered_at, priority_gate, gate_reason, gate_decided_at,
                relationship_memory ->> 'nextReviewAt' AS next_review_at
           FROM accounts
           WHERE workspace_id = $1 AND id = $2 AND status <> 'deleted' AND commercial_status <> 'archived'`,
        [workspaceId, accountId],
      ),
    )
    if (!row) return null

    // #3262.20 / #3262.21 — les deux unifications écrites au lot R11 n'avaient aucun
    // appelant : elles se lisent ici, dans la réponse que Laura relaie.
    const review = nextReviewCondition({
      gateReason: row.gate_reason,
      gateDecidedAt: row.gate_decided_at,
      relationshipMemoryNextReviewAt: row.next_review_at,
    })
    const nextReview =
      review.dueAt && review.source ? { dueAt: review.dueAt.toISOString(), source: review.source } : null
    const reactivable = row.priority_gate === 'parked' || row.sprint === 'no_go' || row.sprint === 'watch'
    const reactivation = reactivable
      ? SPRINT_EVENTS.flatMap(event => {
          const options = reactivationOptions(
            event,
            row.sprint as Parameters<typeof reactivationOptions>[1],
            row.priority_gate,
          )
          if (!options.sprintSwitch && !options.gateReopeningEligible) return []
          return [
            {
              event,
              suggestedLevel: options.sprintSwitch?.to ?? null,
              reason: options.sprintSwitch?.reason ?? null,
              reopensGate: options.gateReopeningEligible,
            },
          ]
        })
      : []

    if (row.sprint !== 'focus' || !row.sprint_entered_at) {
      return {
        applicable: false,
        companyName: row.company_name,
        stale: null,
        daysInFocus: null,
        recommendation: null,
        suggestedLevel: null,
        nextReview,
        reactivation,
      }
    }

    const enteredAt = new Date(row.sprint_entered_at)
    const daysInFocus = Math.floor((now.getTime() - enteredAt.getTime()) / (24 * 60 * 60 * 1000))
    const stale = daysInFocus >= FOCUS_STALE_DAYS
    const decision = stale ? shouldSwitch('focus', 'thirty_days_idle') : null

    return {
      applicable: true,
      companyName: row.company_name,
      stale,
      daysInFocus,
      recommendation: decision?.reason ?? null,
      suggestedLevel: decision?.to ?? null,
      nextReview,
      reactivation,
    }
  }
}

/**
 * Combien de consultants sont poussables MAINTENANT — ou `null` quand la
 * question n'a pas de réponse lisible. Voir le commentaire de la requête.
 */
function pushableBench(row: { total: number; known: number; bench: number } | null): number | null {
  if (row == null) return null
  if (row.total > 0 && row.known === 0) return null
  return row.bench
}

/** Aucune source n'a répondu. Pas un seul chiffre ne sort — surtout pas zéro. */
const UNREAD_INPUTS: PilotageInputs = {
  contactsTargeted: null,
  signals: null,
  profilesPushed: null,
  emailsSent: null,
  replied: null,
  meetings: null,
  needsQualified: null,
  needsTriaged: null,
  needsDecided: null,
  benchAvailable: null,
  conversions: null,
  marginBand: null,
  activeClients: null,
  rejectedItems: null,
  totalContacts: null,
}
