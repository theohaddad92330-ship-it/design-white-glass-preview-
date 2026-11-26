import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { DataforgeAccountEntity } from '../../database/entities/dataforge-account.entity'
import { DataforgeAccountDomainEntity } from '../../database/entities/dataforge-account-domain.entity'
import { returnedRows } from '../../database/returned-rows'
import { IaClient } from '../ia/ia.client'
import { DATAFORGE_DISCARDED_COLUMNS } from './dataforge-columns'
import { killSwitchCut } from '../../common/kill-switches'

/** Ce qu'une lecture par SIREN rend — TRIÉ par tier, le D reste marqué prior. */
interface DataforgePriors {
  account: {
    sourceId: string
    name: string
    siren: string
    marketRole: string | null
    /** Seed de recherche NIVEAU COMPTE — jamais une preuve par domaine (P0 du pack). */
    procurementRouteSeed: string | null
    procurementPolicy: string | null
    researchTier: string | null
    /** La grappe du pack — deux fiches du même groupe la partagent. */
    clusterId: string | null
    /**
     * Les AUTRES fiches du pack qui portent ce SIREN. Nommées, jamais fusionnées
     * (« on PROPOSE une fusion, on ne fusionne JAMAIS ») : un consommateur qui
     * veut les rapprocher doit le décider, pas en hériter.
     */
    variantSourceIds: string[]
  }
  /** Tier A/B/C uniquement : ce qui peut nourrir un écran (avec sa policy). */
  evidence: {
    domainCode: string
    tier: string
    userClaimPolicy: string | null
    evidenceSummary: string | null
    evidenceSources: string | null
  }[]
  /** Tier D compris : la couche de PRIORS de scoring, interne uniquement. */
  priors: {
    domainCode: string
    tier: string
    sectorPriorDemandScore: number | null
    externalizableDemandScore: number | null
    commercialOpportunityScore: number | null
  }[]
}

/**
 * Ce que rend une lecture par SIREN — et « plusieurs comptes portent ce SIREN »
 * n'est PAS un cas de plus dans le même sac.
 *
 * L'index `dataforge_accounts_siren_idx` n'est pas unique et ne peut pas l'être :
 * le pack V10 livre DF-0014 et DF-0415, deux fiches du même Groupe Martin
 * Belaysoud avec le même SIREN `352463574` (40 grappes, 85 comptes — le cas est
 * généralisable). Rendre l'index unique ferait refuser une donnée VRAIE à
 * l'ingestion ; rendre une ligne au hasard donnerait les priors de l'un pour
 * ceux de l'autre. La sortie est de lire ce que le pack a déjà écrit
 * (`is_cluster_primary`) et de refuser de deviner quand ça ne tranche pas.
 */
type DataforgeSirenPriors =
  | ({ kind: 'priors' } & DataforgePriors)
  | { kind: 'ambiguous'; siren: string; sourceIds: string[]; reason: string }

/**
 * Le référentiel DATAFORGE V10 (plan du 24/08) — staging partagé + résolution.
 *
 * Trois responsabilités, dans l'ordre où elles servent :
 *  1. résoudre les SIREN manquants par lots en tâche de fond (4/1 195 comptes
 *     arrivent avec un vrai SIREN — le mapping vers les comptes Bellum se fait par
 *     SIREN, jamais par nom, doctrine tome 2) ;
 *  2. rendre les priors d'un SIREN (`priorsForSiren`) — le point d'entrée que
 *     le dé-silotage consommera ;
 *  3. dire sa couverture (`coverage`) — combien résolus, combien restent, ce
 *     qui distingue « le référentiel se remplit » de « il est vide ».
 *
 * Ce que ce service ne fait JAMAIS : exposer un Tier D comme un fait. La
 * séparation `evidence` (A/B/C) / `priors` (tout, scoring interne) est portée
 * par le TYPE de retour, pas par une convention.
 */
@Injectable()
export class DataforgeService {
  private readonly logger = new Logger(DataforgeService.name)

  constructor(
    @InjectRepository(DataforgeAccountEntity)
    private readonly accounts: Repository<DataforgeAccountEntity>,
    @InjectRepository(DataforgeAccountDomainEntity)
    private readonly domains: Repository<DataforgeAccountDomainEntity>,
    private readonly ia: IaClient,
  ) {}

  /**
   * Résolution SIREN par lots — mécanique `esn_directory` à l'identique :
   * réservation `resolving` (pas de verrou global, une réservation abandonnée
   * retombe au bout d'une demi-heure), panne de registre = le nom REDEVIENT
   * `pending`, jamais « non résolu » sur une panne.
   *
   * Décalé de 30 min du cron ESN (`11 * * * *`) pour ne pas marteler le même
   * registre au même instant. Kill-switch : `DATAFORGE_RESOLUTION_DISABLED=true`.
   *
   * **SANS VERROU :** même raison que le cron ESN dont il copie la mécanique —
   * `resolvePending` réserve son lot par `UPDATE … 'resolving' … FOR UPDATE SKIP
   * LOCKED`, donc deux répliques prennent deux lots DISJOINTS et avancent deux
   * fois plus vite. Un verrou singleton diviserait le débit par le nombre de
   * répliques pour protéger d'une collision que la base refuse déjà, et une
   * réservation abandonnée retombe seule au bout d'une demi-heure. Tenu par
   * GA-76.
   */
  @Cron('41 * * * *', { name: 'dataforge-resolution', timeZone: 'Europe/Paris' })
  async refreshResolution(): Promise<void> {
    if (killSwitchCut('referential.dataforge_resolution')) return
    const { attempted, resolved } = await this.resolvePending(25)
    if (attempted > 0) {
      this.logger.log(`Référentiel DATAFORGE : ${resolved}/${attempted} comptes résolus`)
    }
  }

  async resolvePending(limit = 25): Promise<{ attempted: number; resolved: number }> {
    const claimed = await this.accounts.query(
      `UPDATE dataforge_accounts
          SET resolution_status = 'resolving', updated_at = now()
        WHERE id IN (
          SELECT id FROM dataforge_accounts
           WHERE (resolution_status = 'pending' AND siren IS NULL)
              OR (resolution_status = 'resolving' AND updated_at < now() - interval '30 minutes')
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING id, name`,
      [Math.max(1, Math.min(limit, 50))],
    )
    // ⚠️ `returnedRows` et non `claimed[0]` : TypeORM rend `[lignes, nombre]`
    // sur un UPDATE (leçon de la recette du 21/08).
    const pending = returnedRows<{ id: string; name: string }>(claimed)
    if (pending.length === 0) return { attempted: 0, resolved: 0 }

    const response = await this.ia.esnResolve({ names: pending.map(row => row.name) })
    const byName = new Map(response.entries.map(entry => [entry.inputName, entry]))
    let resolved = 0

    for (const row of pending) {
      const entry = byName.get(row.name)
      if (!entry || entry.status === 'pending') {
        // Panne de registre : le compte REDEVIENT disponible pour le lot suivant.
        await this.accounts.update(row.id, { resolutionStatus: 'pending' })
        continue
      }
      const patch: QueryDeepPartialEntity<DataforgeAccountEntity> = {
        resolutionStatus: entry.status,
        resolutionReason: entry.reason ?? null,
      }
      if (entry.status === 'resolved') {
        Object.assign(patch, {
          siren: entry.siren ?? null,
          legalName: entry.legalName ?? null,
          nafCode: entry.nafCode ?? null,
          resolvedAt: new Date(),
        })
        resolved++
      }
      await this.accounts.update(row.id, patch)
    }
    return { attempted: pending.length, resolved }
  }

  /**
   * Le compte du pack qui porte ce SIREN — ou l'aveu qu'on ne peut pas trancher.
   *
   * Plusieurs fiches peuvent le porter légitimement (variantes de nom du même
   * groupe). Quand elles sont toutes dans la MÊME grappe, le pack a déjà désigné
   * son primaire (`is_cluster_primary`, vérifié : exactement un par grappe sur
   * les 40 grappes multi-comptes) — c'est lui qui répond. Sinon, on ne devine
   * pas : deux grappes différentes qui partagent un SIREN sont une contradiction
   * du pack, pas un choix à faire à sa place.
   */
  private resolveBySiren(
    siren: string,
    candidates: DataforgeAccountEntity[],
  ): { account: DataforgeAccountEntity; variantSourceIds: string[] } | { reason: string } | null {
    if (candidates.length === 0) return null
    const sorted = [...candidates].sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    const first = sorted[0]
    if (!first) return null
    if (sorted.length === 1) return { account: first, variantSourceIds: [] }

    const clusters = new Set(sorted.map(row => row.clusterId ?? ''))
    if (clusters.size !== 1 || clusters.has('')) {
      return { reason: `${sorted.length} comptes de grappes différentes portent ce SIREN` }
    }
    const primaries = sorted.filter(row => row.isClusterPrimary)
    if (primaries.length !== 1) {
      return { reason: `${sorted.length} comptes d’une même grappe, ${primaries.length} primaire(s) désigné(s)` }
    }
    const primary = primaries[0]
    if (!primary) return { reason: `${sorted.length} comptes, aucun primaire lisible` }
    return { account: primary, variantSourceIds: sorted.filter(row => row !== primary).map(row => row.sourceId) }
  }

  /**
   * Les priors DATAFORGE d'un SIREN — `null` quand le référentiel ne connaît
   * pas ce compte : « pas dans le pack » n'est pas « aucune demande » et le
   * consommateur ne doit pas pouvoir confondre les deux.
   *
   * Et « le pack se contredit » n'est ni l'un ni l'autre : il sort en
   * `ambiguous`, sans qu'aucune ligne de domaine n'ait été lue — lire l'une des
   * deux fiches serait déjà avoir choisi.
   */
  async priorsForSiren(siren: string): Promise<DataforgeSirenPriors | null> {
    const candidates = await this.accounts.find({ where: { siren } })
    const resolved = this.resolveBySiren(siren, candidates)
    if (resolved === null) return null
    if ('reason' in resolved) {
      return {
        kind: 'ambiguous',
        siren,
        sourceIds: candidates.map(row => row.sourceId).sort(),
        reason: resolved.reason,
      }
    }
    const { account, variantSourceIds } = resolved
    const rows = await this.domains.find({ where: { sourceId: account.sourceId } })
    const rank = (tier: string) => ['A', 'B', 'C', 'D'].indexOf(tier)
    rows.sort((a, b) => rank(a.evidenceTier) - rank(b.evidenceTier) || a.domainCode.localeCompare(b.domainCode))
    return {
      kind: 'priors',
      account: {
        sourceId: account.sourceId,
        name: account.name,
        siren,
        marketRole: account.marketRole,
        procurementRouteSeed: account.procurementRoute,
        procurementPolicy: account.procurementPolicy,
        researchTier: account.researchTier,
        clusterId: account.clusterId,
        variantSourceIds,
      },
      evidence: rows
        .filter(row => row.evidenceTier !== 'D')
        .map(row => ({
          domainCode: row.domainCode,
          tier: row.evidenceTier,
          userClaimPolicy: row.userClaimPolicy,
          evidenceSummary: row.evidenceSummary,
          evidenceSources: row.evidenceSources,
        })),
      priors: rows.map(row => ({
        domainCode: row.domainCode,
        tier: row.evidenceTier,
        sectorPriorDemandScore: row.sectorPriorDemandScore,
        externalizableDemandScore: row.externalizableDemandScore,
        commercialOpportunityScore: row.commercialOpportunityScore,
      })),
    }
  }

  /**
   * La couverture, pour le back-office : combien ingérés, résolus, par tier —
   * et, depuis le 29/08/2026, ce que l'ingestion a ÉCARTÉ.
   *
   * Trois chiffres de plus, chacun pour une question que l'opérateur ne pouvait
   * pas poser :
   *  · `domainPriorRows` — les priors de domaine V10 sont-ils vraiment entrés ?
   *    (dix-huit colonnes tombaient sans laisser de trace ; « c'est ingéré » se
   *    prouve en comptant, pas en le disant) ;
   *  · `sirenCollisions` — combien de SIREN portés par plus d'un compte du pack.
   *    C'est la mesure de l'ambiguïté que `priorsForSiren` refuse de trancher ;
   *  · `discardedColumns` — ce qu'on n'ingère pas, avec la raison. « On ne l'a
   *    pas pris » n'est utile que quand on peut voir pourquoi.
   */
  async coverage(): Promise<{
    accounts: number
    resolved: number
    pending: number
    unresolved: number
    domainRows: number
    domainPriorRows: number
    sirenCollisions: number
    byTier: Record<string, number>
    discardedColumns: { column: string; reason: string }[]
  }> {
    const [accounts, domainRows] = await Promise.all([this.accounts.count(), this.domains.count()])
    const statuses = await this.accounts.query(
      `SELECT resolution_status AS status, count(*)::int AS n FROM dataforge_accounts GROUP BY 1`,
    )
    const tiers = await this.domains.query(
      `SELECT evidence_tier AS tier, count(*)::int AS n FROM dataforge_account_domains GROUP BY 1`,
    )
    // `jsonb_exists` plutôt que l'opérateur `?`, qui se confond avec un
    // marque-place de requête selon le pilote.
    const priorRows = await this.domains.query(
      `SELECT count(*)::int AS n FROM dataforge_account_domains
        WHERE jsonb_exists(domain_payload, 'domain_taxonomy__keywords')`,
    )
    const collisions = await this.accounts.query(
      `SELECT count(*)::int AS n FROM (
         SELECT siren FROM dataforge_accounts WHERE siren IS NOT NULL GROUP BY siren HAVING count(*) > 1
       ) AS partages`,
    )
    const byStatus = new Map((statuses as { status: string; n: number }[]).map(row => [row.status, row.n]))
    return {
      accounts,
      resolved: byStatus.get('resolved') ?? 0,
      pending: (byStatus.get('pending') ?? 0) + (byStatus.get('resolving') ?? 0),
      unresolved: byStatus.get('unresolved') ?? 0,
      domainRows,
      domainPriorRows: (priorRows as { n: number }[])[0]?.n ?? 0,
      sirenCollisions: (collisions as { n: number }[])[0]?.n ?? 0,
      byTier: Object.fromEntries((tiers as { tier: string; n: number }[]).map(row => [row.tier, row.n])),
      discardedColumns: Object.entries(DATAFORGE_DISCARDED_COLUMNS).map(([column, entry]) => ({
        column,
        reason: entry.reason,
      })),
    }
  }
}
