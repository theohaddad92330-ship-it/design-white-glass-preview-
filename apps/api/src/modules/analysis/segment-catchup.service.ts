import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { isFailure, type Result } from '@bellum/utils'
import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH, segmentCapabilityAt } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { killSwitchCut } from '../../common/kill-switches'
import { AnalysisOnDemandService, type OnDemandFailure } from './analysis-ondemand.service'

type ConcernedAccount = { id: string; user_id: string; contacts_collected_at: Date | null }

/**
 * #2543.7 (18/09/2026) — les TROIS segments qui rejoignent contacts (#AF.2)
 * maintenant qu'ils portent chacun leur date de collecte (migration
 * `1795712345678`). `contacts` reste sur son propre chemin dédié ci-dessous —
 * livré et recetté (#AF), il n'est pas ré-écrit par ce lot (ZÉRO régression).
 *
 * #2118.51 (18/09/2026) — `dossier_read` REJOINT ce type. Cinquième segment,
 * distinct de `strategy` : ce n'est pas la stratégie (angle/mode d'entrée)
 * qui est datée ici, c'est la lecture du dossier en sept axes (#2118). Les
 * deux réutilisent le MÊME chemin on-demand (`replan`, ci-dessous) parce que
 * Phase 4 produit les deux d'un seul appel — mais une future capacité sur
 * L'UN des deux ne doit jamais dater l'autre (GA-26 : chacun son réglage).
 *
 * #2298.4 (19/09/2026, lot I3) — `access_relation` REJOINT ce type, SIXIÈME
 * segment. Contrairement aux cinq autres, ce rattrapage est GRATUIT : il ne
 * passe par AUCUN chemin payant (`refreshResearch`/`enrichOrganigram`/
 * `replan`/`enrichContacts`), voir `enrichSegment` ci-dessous et
 * `AnalysisOnDemandService.recalculateRelationAxis`.
 */
export type SegmentCatchupDimension = 'signals' | 'entities' | 'strategy' | 'dossier_read' | 'access_relation'

/** Colonne de date de collecte de chaque segment — même forme que
 *  `contacts_collected_at`, un nom par segment, GA-26 (un réglage vit à un
 *  seul endroit : celui-ci). */
const SEGMENT_COLLECTED_AT_COLUMN: Readonly<Record<SegmentCatchupDimension, string>> = {
  signals: 'signals_collected_at',
  entities: 'entities_collected_at',
  strategy: 'strategy_collected_at',
  dossier_read: 'dossier_read_collected_at',
  // #2298.4 — colonne DÉDIÉE (`addressability_relation_collected_at`), jamais
  // `signals_collected_at` : ce rattrapage ne passe pas par une recherche
  // complète, réutiliser cette colonne ferait croire au contraire (voir le
  // docblock de la migration `1795716734279`).
  access_relation: 'addressability_relation_collected_at',
}

/** Un interrupteur PAR SEGMENT (jamais un seul pour les cinq) — couper le
 *  rattrapage des signaux ne doit jamais couper celui des entités, de la
 *  stratégie ou de la lecture en sept axes. kill-switches.ts, GA-84/GA-85. */
const SEGMENT_KILL_SWITCH: Readonly<Record<SegmentCatchupDimension, string>> = {
  signals: 'accounts.signals_segment_catchup',
  entities: 'accounts.entities_segment_catchup',
  strategy: 'accounts.strategy_segment_catchup',
  dossier_read: 'accounts.dossier_read_segment_catchup',
  access_relation: 'accounts.access_relation_segment_catchup',
}

/** Les comptes CONCERNÉS par le rattrapage d'un segment générique — même forme
 *  que `ConcernedAccount`, `collected_at` générique plutôt que
 *  `contacts_collected_at` (une colonne différente selon le segment). */
type SegmentConcernedAccount = { id: string; user_id: string; collected_at: Date | null }

export type SegmentCatchupOutcome = {
  /** Comptes CONCERNÉS trouvés — jamais tout le parc, borné par `limit`. */
  scanned: number
  launched: number
  failed: number
  /** L'interrupteur d'arrêt a coupé la course : rien n'a été exécuté. */
  cut: boolean
}

/**
 * #AF — LE RATTRAPAGE CIBLÉ PAR SEGMENT (décision Louis, 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne RECOLLECTE rien lui-même. Le segment `contacts` est DÉJÀ rejouable
 * seul — `AnalysisOnDemandService.enrichContacts`, le même chemin que le
 * bouton « Enrichir contacts » d'un commercial (#2125.50-56/#2318). Ce
 * service n'ajoute qu'une chose : le CIBLAGE (#AF.2) — quels comptes sont
 * concernés — et le DÉCLENCHEMENT en lot borné (#AF.4), jamais automatique.
 *
 * En réutilisant `enrichContacts` tel quel, ce lot hérite SANS RIEN
 * réécrire :
 *  - la correction humaine protégée par `applyFieldUpdates`
 *    (`ContactsService.bulkInsert` → `mergeSeedInto`) ;
 *  - le garde-fou démo (`enrichContacts` refuse sur un compte de démo — zéro
 *    appel réseau) ;
 *  - zéro crédit débité : ce chemin ne passe PAS par `AnalysisRefreshService`
 *    (qui débite `targeted_refresh`) — corriger notre propre défaut de
 *    collecte n'est pas un achat que le client doit payer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #AF.4 — JAMAIS AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────
 * Aucun `onApplicationBootstrap`, aucun cron. Seul un appel EXPLICITE
 * (`AdminSegmentCatchupController`, `internal/admin/segment-catchup`, geste
 * d'opérateur) atteint `runCatchup`. Coupe-circuit
 * `accounts.contacts_segment_catchup` (kill-switches.ts, GA-84/GA-85) : même
 * appelé, un interrupteur coupé n'exécute rien — le geste d'urgence si la
 * liste des comptes concernés devait un jour peser sur une base bien plus
 * grande qu'aujourd'hui.
 */
/**
 * #4036.D4 (décision Louis 15/10/2026) — le rattrapage « partenaire actif » (#2887) passe par le
 * segment `signals` et ne vise que les comptes CONSULTÉS ou SUIVIS dans les 90 derniers jours
 * (compte modifié, ou échange daté). Les autres ne sont pas oubliés : ils sont rejoués à leur
 * prochaine ouverture, et leur écran DIT « collecte antérieure » d'ici là (doctrine « un
 * correctif de collecte rattrape l'existant », ciblé, jamais tout le parc).
 */
/**
 * #4687 — la capacité « l'historique interne lit la connexion de l'ESPACE ». `at` = l'instant du lot ; il se resserre
 * sur le déploiement API réel s'il est plus tardif (un `at` trop TÔT déclarerait « à jour » un compte collecté entre
 * le lot et le déploiement). `commit: null` : la bascule tient au déploiement, aucun SHA isolé ne la porte.
 */
export const ATS_HISTORY_BY_WORKSPACE_CAPABILITY = {
  issue: '#4687',
  commit: null,
  at: '2026-10-28T11:55:00.000Z',
  why: "l'historique interne d'une analyse lit la connexion BoondManager de l'espace du compte — avant, il lisait la variable d'environnement globale et restait vide pour un client qui avait branché son ERP",
} as const

/**
 * #4732 — la capacité « un rachat / une fusion publié au registre devient un fait de la fiche compte ET un fait
 * fort de la carte Découvrir ». `at` = l'instant de la fusion de #4769 (2026-10-29T01:07:15Z) ; il se resserre sur le
 * déploiement API/IA réel s'il est plus tardif (un `at` trop TÔT déclarerait « à jour » un compte collecté entre le
 * lot et le déploiement). Constante PROPRE, hors du registre `SEGMENT_CAPABILITY_HISTORY` : l'y inscrire avancerait la
 * bascule du segment `signals` de TOUS les comptes, y compris ceux qui n'ont aucun acte de rapprochement.
 */
export const MERGER_SIGNALS_CAPABILITY = {
  issue: '#4732',
  commit: '7d39faafcb403557139cf200b4ba5906c35d579a',
  at: '2026-10-29T01:07:15.000Z',
  why: 'un acte de vente, cession, fusion, absorption, scission, rachat ou apport partiel est un signal typé « acquisition » — avant, il restait une ligne de vie légale',
} as const

const RECENT_ACTIVITY_CLAUSE = `AND (
            updated_at >= now() - interval '90 days'
            OR EXISTS (
              SELECT 1 FROM activities act
               WHERE act.account_id = accounts.id
                 AND act.occurred_at >= now() - interval '90 days'
            )
          )`

@Injectable()
export class SegmentCatchupService {
  private readonly logger = new Logger(SegmentCatchupService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly onDemand: AnalysisOnDemandService,
  ) {}

  /**
   * Les comptes CONCERNÉS par le rattrapage du segment contacts — lecture
   * seule. Bornée par `limit` : « ciblé, jamais massif » (#AF.2) n'est pas
   * qu'une promesse de comportement, c'est une borne de requête.
   *
   * Double lecture délibérée : le SQL fait le premier tri (jamais charger
   * tout le parc), `isSegmentCollectionStale` — LA MÊME fonction que l'écran
   * relit pour son aveu de fraîcheur (#AF.3, GA-26 un seul endroit décide) —
   * tranche le dernier mot.
   */
  async listConcernedAccounts(limit = 200, onlyAccountIds?: readonly string[]): Promise<ConcernedAccount[]> {
    const capabilityAt = SEGMENT_CAPABILITY_EPOCH.contacts
    // Aucune capacité datée pour ce segment : rien n'est « concerné » — se
    // taire plutôt que de deviner une date.
    if (!capabilityAt) return []
    // #4923.15 — le rattrapage COMMENCE par des comptes NOMMÉS (L'Oréal, Decathlon,
    // AXA de l'espace de Julien Laszlo) : une liste restreint la requête à ces
    // comptes, elle ne l'élargit jamais. Liste vide ⇒ rien (jamais « tout »).
    // Absente ⇒ requête byte-identique.
    if (onlyAccountIds !== undefined && onlyAccountIds.length === 0) return []
    const restrict = onlyAccountIds !== undefined
    const rows = await this.accounts.manager.query<ConcernedAccount[]>(
      `SELECT id, user_id, contacts_collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (contacts_collected_at IS NULL OR contacts_collected_at < $1)${restrict ? '\n          AND id = ANY($3::uuid[])' : ''}
        ORDER BY updated_at ASC
        LIMIT $2`,
      restrict ? [capabilityAt, limit, onlyAccountIds] : [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.contacts_collected_at, capabilityAt))
  }

  /**
   * Le rattrapage lui-même — voir le docblock de la classe pour ce qu'il
   * hérite en réutilisant `enrichContacts`.
   *
   * `operatorUserId` ne sert qu'à la TRACE (qui a déclenché ce lot, journalisé
   * ci-dessous) : chaque compte est rejoué AU NOM DE SON PROPRIÉTAIRE
   * (`row.user_id`) — jamais un compte lu ou écrit pour un autre espace que
   * le sien. Un compte qui échoue n'arrête pas les autres (même borne que
   * `backfillDetectedPartners`) ; l'échec se journalise avec son motif.
   */
  async runCatchup(
    operatorUserId: string,
    limit = 200,
    onlyAccountIds?: readonly string[],
  ): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut('accounts.contacts_segment_catchup')) {
      this.logger.log('Rattrapage contacts coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }

    const rows = await this.listConcernedAccounts(limit, onlyAccountIds)
    let launched = 0
    let failed = 0
    for (const row of rows) {
      try {
        const outcome = await this.onDemand.enrichContacts(row.id, row.user_id, undefined)
        if (isFailure(outcome)) {
          failed += 1
          this.logger.warn('Rattrapage contacts échoué pour un compte', {
            accountId: row.id,
            problem: outcome.problem,
          })
        } else {
          launched += 1
        }
      } catch (error) {
        failed += 1
        this.logger.warn('Rattrapage contacts échoué pour un compte', { accountId: row.id, error })
      }
    }
    this.logger.log('Rattrapage contacts terminé', { operatorUserId, scanned: rows.length, launched, failed })
    return { scanned: rows.length, launched, failed, cut: false }
  }

  /**
   * #2543.7 — miroir générique de `listConcernedAccounts`, pour les segments
   * signals/entities/strategy. Même double lecture délibérée (SQL borné +
   * `isSegmentCollectionStale` qui tranche en dernier), même garde-fou :
   * aucune capacité datée pour ce segment (`SEGMENT_CAPABILITY_EPOCH[dimension]`
   * absent) ⇒ `[]`, jamais une date devinée.
   */
  async listConcernedAccountsForSegment(
    dimension: SegmentCatchupDimension,
    limit = 200,
  ): Promise<SegmentConcernedAccount[]> {
    const capabilityAt = SEGMENT_CAPABILITY_EPOCH[dimension]
    if (!capabilityAt) return []
    const column = SEGMENT_COLLECTED_AT_COLUMN[dimension]
    const rows = await this.accounts.manager.query<SegmentConcernedAccount[]>(
      `SELECT id, user_id, ${column} AS collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (${column} IS NULL OR ${column} < $1)
          -- rejeu signaux 10/10 — un espace démo ne se rattrape pas (145 comptes figés en precondition_failed)
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = accounts.workspace_id AND w.is_demo = true)
          ${dimension === 'signals' ? RECENT_ACTIVITY_CLAUSE : ''}
        ORDER BY updated_at ASC
        LIMIT $2`,
      [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.collected_at, capabilityAt))
  }

  /**
   * #2543.7 — miroir générique de `runCatchup`. Rejoue UNIQUEMENT le segment
   * demandé (`enrichSegment` ci-dessous n'appelle jamais qu'UN des trois
   * chemins on-demand) — un rejeu de signaux ne touche jamais entités ni
   * stratégie. Interrupteur PROPRE à ce segment (`SEGMENT_KILL_SWITCH`) :
   * couper l'un ne coupe pas les autres.
   */
  async runSegmentCatchup(
    operatorUserId: string,
    dimension: SegmentCatchupDimension,
    limit = 200,
  ): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut(SEGMENT_KILL_SWITCH[dimension])) {
      this.logger.log(`Rattrapage ${dimension} coupé par interrupteur — rien exécuté`, { operatorUserId, dimension })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }

    const rows = await this.listConcernedAccountsForSegment(dimension, limit)
    return this.replay(operatorUserId, dimension, rows)
  }

  /**
   * #2887.11 (Louis 16-17/10) — LE RATTRAPAGE « PARTENAIRE ACTIF » (#2371.4), CIBLÉ SUR SES SEULS COMPTES.
   *
   * Le stade ne concerne qu'un compte dont le SIREN est celui d'un partenaire de l'espace qui porte des
   * placements EN COURS (même rapprochement que `RelationAxisReaderService.activePartnerPlacements` : SIREN
   * uniquement, jamais le nom, même espace). Les autres comptes n'ont rien à y gagner : ils ne sont PAS
   * rejoués (doctrine « un correctif de collecte rattrape l'existant », ciblé, jamais tout le parc).
   * « Concerné » se décide sur la date de collecte du segment contre la date de CETTE capacité (#2371.4),
   * pas contre l'epoch du segment — une capacité plus récente (BODACC, presse) ne rejoue pas ces comptes.
   * Jamais automatique : geste d'opérateur (`AdminSegmentCatchupController`).
   */
  async listPartnerPlacementAccounts(limit = 200): Promise<SegmentConcernedAccount[]> {
    const capabilityAt = segmentCapabilityAt('signals', '#2371.4')
    if (!capabilityAt) return []
    const rows = await this.accounts.manager.query<SegmentConcernedAccount[]>(
      `SELECT id, user_id, signals_collected_at AS collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (signals_collected_at IS NULL OR signals_collected_at < $1)
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = accounts.workspace_id AND w.is_demo = true)
          AND accounts.siren IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM partner_relations pr
             WHERE pr.workspace_id = accounts.workspace_id
               AND pr.siren = regexp_replace(accounts.siren, '\\s', '', 'g')
               AND pr.placements_active > 0
          )
        ORDER BY updated_at ASC
        LIMIT $2`,
      [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.collected_at, capabilityAt))
  }

  /** #2887.11 — le rejeu du segment signaux, limité aux comptes de {@link listPartnerPlacementAccounts}. */
  async runPartnerPlacementCatchup(operatorUserId: string, limit = 200): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut(SEGMENT_KILL_SWITCH.signals)) {
      this.logger.log('Rattrapage partenaire actif coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }
    const rows = await this.listPartnerPlacementAccounts(limit)
    return this.replay(operatorUserId, 'signals', rows)
  }

  /**
   * #4327 (19/10/2026) — LE RATTRAPAGE DES FILIALES, CIBLÉ SUR LES COMPTES QUI PORTENT UN GRAPHE.
   *
   * Avant ce correctif, le registre REMPLAÇAIT les filiales nommées par le web : une filiale indirecte ou
   * connue par son nom commercial (Fortuneo pour Arkéa) manquait. Seuls les comptes dont le dossier porte un
   * graphe capitalistique (`raw_analysis.corporate_graph`) peuvent y gagner ; les autres ne sont PAS rejoués.
   * « Concerné » se décide sur la date de collecte du segment contre la date de CETTE capacité (#4327).
   * Jamais automatique : geste d'opérateur (`AdminSegmentCatchupController`).
   */
  async listSubsidiaryAccounts(limit = 200): Promise<SegmentConcernedAccount[]> {
    const capabilityAt = segmentCapabilityAt('signals', '#4327')
    if (!capabilityAt) return []
    const rows = await this.accounts.manager.query<SegmentConcernedAccount[]>(
      `SELECT id, user_id, signals_collected_at AS collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (signals_collected_at IS NULL OR signals_collected_at < $1)
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = accounts.workspace_id AND w.is_demo = true)
          AND accounts.siren IS NOT NULL
          AND jsonb_typeof(accounts.raw_analysis->'corporate_graph') = 'object'
        ORDER BY updated_at ASC
        LIMIT $2`,
      [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.collected_at, capabilityAt))
  }

  /** #4327 — le rejeu du segment signaux, limité aux comptes de {@link listSubsidiaryAccounts}. */
  async runSubsidiaryCatchup(operatorUserId: string, limit = 200): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut(SEGMENT_KILL_SWITCH.signals)) {
      this.logger.log('Rattrapage filiales coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }
    const rows = await this.listSubsidiaryAccounts(limit)
    return this.replay(operatorUserId, 'signals', rows)
  }

  /**
   * #4687 (28/10/2026) — LE RATTRAPAGE DE L'HISTORIQUE INTERNE, CIBLÉ SUR LES ESPACES QUI AVAIENT UNE CONNEXION BOOND.
   *
   * Avant ce correctif, la couche zéro d'une analyse lisait BoondManager par variable d'environnement globale et
   * ignorait la connexion saisie par le client : l'« historique interne » (opportunités en cours, CV déjà envoyés)
   * restait vide. Seuls les comptes d'un espace qui avait une connexion VIVANTE au moment de leur dernière collecte
   * peuvent y gagner ; les autres ne sont PAS rejoués (jamais tout le parc).
   *
   * « Concerné » se décide sur la date de collecte du segment (`signals_collected_at`, la recherche Phase 1 est
   * l'unique consommatrice de l'historique interne) contre la date de CE correctif, jamais sur un symptôme. C'est une
   * constante PROPRE, hors du registre `SEGMENT_CAPABILITY_HISTORY` : l'y inscrire avancerait la bascule du segment
   * `signals` de TOUS les comptes de tous les espaces, y compris ceux qui n'ont aucun ATS.
   *
   * Jamais automatique : geste d'opérateur (`AdminSegmentCatchupController`). Rejeu du segment seul, via
   * `refreshResearch` + relecture de l'historique : ni plan, ni contacts, ni organigramme, ni crédit.
   */
  async listAtsHistoryAccounts(limit = 200): Promise<SegmentConcernedAccount[]> {
    const capabilityAt = ATS_HISTORY_BY_WORKSPACE_CAPABILITY.at
    const rows = await this.accounts.manager.query<SegmentConcernedAccount[]>(
      `SELECT id, user_id, signals_collected_at AS collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (signals_collected_at IS NULL OR signals_collected_at < $1)
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = accounts.workspace_id AND w.is_demo = true)
          AND EXISTS (
            SELECT 1 FROM ats_connections ac
             WHERE ac.workspace_id = accounts.workspace_id
               AND (ac.auth_mode <> 'oauth2' OR ac.access_token_enc IS NOT NULL)
               AND ac.created_at <= COALESCE(accounts.signals_collected_at, accounts.created_at)
          )
        ORDER BY updated_at ASC
        LIMIT $2`,
      [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.collected_at, capabilityAt))
  }

  /** #4687 — le rejeu du segment signaux AVEC l'historique interne, limité aux comptes de {@link listAtsHistoryAccounts}. */
  async runAtsHistoryCatchup(operatorUserId: string, limit = 200): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut(SEGMENT_KILL_SWITCH.signals)) {
      this.logger.log('Rattrapage historique interne coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }
    const rows = await this.listAtsHistoryAccounts(limit)
    return this.replay(operatorUserId, 'signals', rows, { internalHistory: true })
  }

  /**
   * #4732 (29/10/2026) — LE RATTRAPAGE DES RACHATS ET FUSIONS, CIBLÉ SUR LES COMPTES QUI EN PORTENT UN.
   *
   * Seuls les comptes dont le registre public (`public_registry_announcements`, même SIREN) porte, sur les douze
   * derniers mois, une vente/cession ou un acte qui NOMME une fusion, absorption, scission, un rachat ou un apport
   * partiel peuvent y gagner ; les autres ne sont PAS rejoués (jamais tout le parc). « Concerné » se décide sur la
   * date de collecte du segment (`signals_collected_at`) contre la date de CE correctif, jamais sur un symptôme.
   * Jamais automatique : geste d'opérateur (`AdminSegmentCatchupController`). Rejeu du segment signaux seul : ni
   * plan, ni contacts, ni organigramme. Une correction humaine n'est pas touchée (le rejeu ne l'écrase pas).
   */
  async listMergerAccounts(limit = 200): Promise<SegmentConcernedAccount[]> {
    const capabilityAt = MERGER_SIGNALS_CAPABILITY.at
    const rows = await this.accounts.manager.query<SegmentConcernedAccount[]>(
      `SELECT id, user_id, signals_collected_at AS collected_at
         FROM accounts
        WHERE status <> 'deleted'
          AND (signals_collected_at IS NULL OR signals_collected_at < $1)
          AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = accounts.workspace_id AND w.is_demo = true)
          AND accounts.siren IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public_registry_announcements pra
             WHERE pra.siren = accounts.siren
               AND pra.published_on >= now() - interval '12 months'
               AND (pra.kind = 'sale'
                    OR pra.family_label ~* '(fusion|absorption|scission|rachat|apport partiel)')
          )
        ORDER BY updated_at ASC
        LIMIT $2`,
      [capabilityAt, limit],
    )
    return rows.filter(row => isSegmentCollectionStale(row.collected_at, capabilityAt))
  }

  /** #4732 — le rejeu du segment signaux, limité aux comptes de {@link listMergerAccounts}. */
  async runMergerCatchup(operatorUserId: string, limit = 200): Promise<SegmentCatchupOutcome> {
    if (killSwitchCut(SEGMENT_KILL_SWITCH.signals)) {
      this.logger.log('Rattrapage rachats et fusions coupé par interrupteur — rien exécuté', { operatorUserId })
      return { scanned: 0, launched: 0, failed: 0, cut: true }
    }
    const rows = await this.listMergerAccounts(limit)
    return this.replay(operatorUserId, 'signals', rows)
  }

  private async replay(
    operatorUserId: string,
    dimension: SegmentCatchupDimension,
    rows: SegmentConcernedAccount[],
    options: { internalHistory?: boolean } = {},
  ): Promise<SegmentCatchupOutcome> {
    let launched = 0
    let failed = 0
    for (const row of rows) {
      try {
        const outcome = await this.enrichSegment(dimension, row.id, row.user_id, options)
        if (isFailure(outcome)) {
          failed += 1
          this.logger.warn(`Rattrapage ${dimension} échoué pour un compte`, {
            accountId: row.id,
            problem: outcome.problem,
          })
        } else {
          launched += 1
        }
      } catch (error) {
        failed += 1
        this.logger.warn(`Rattrapage ${dimension} échoué pour un compte`, { accountId: row.id, error })
      }
    }
    this.logger.log(`Rattrapage ${dimension} terminé`, {
      operatorUserId,
      dimension,
      scanned: rows.length,
      launched,
      failed,
    })
    return { scanned: rows.length, launched, failed, cut: false }
  }

  /** UN seul des cinq chemins on-demand selon le segment demandé — jamais
   *  deux, jamais l'analyse entière (#2543.7, doctrine « par segment »).
   *
   *  #2118.51 — `dossier_read` rejoue `replan`, le MÊME appel que `strategy` :
   *  Phase 4 est l'unique endroit qui produit `evaluation.dossier_read`, donc
   *  la « ré-analyse de données déjà présentes » qui rattrape la lecture en
   *  sept axes EST un replan — sans re-collecte externe, exactement comme le
   *  docblock de la classe le prévoit pour `strategy`.
   *
   *  #2298.4 — `access_relation` rejoue `recalculateRelationAxis`, le SEUL
   *  chemin des cinq qui n'est PAS un des quatre chemins on-demand payants
   *  décrits par le docblock de la classe : aucun crédit, aucun appel
   *  sortant (missions/agenda/e-mails déjà en base, CRM délibérément absent
   *  — voir le docblock de `AnalysisOnDemandService.recalculateRelationAxis`). */
  private async enrichSegment(
    dimension: SegmentCatchupDimension,
    accountId: string,
    userId: string,
    options: { internalHistory?: boolean } = {},
  ): Promise<Result<unknown, OnDemandFailure>> {
    switch (dimension) {
      case 'signals':
        return options.internalHistory
          ? this.onDemand.refreshResearch(accountId, userId, options)
          : this.onDemand.refreshResearch(accountId, userId)
      case 'entities':
        return this.onDemand.enrichOrganigram(accountId, userId)
      case 'strategy':
      case 'dossier_read':
        return this.onDemand.replan(accountId, userId, undefined)
      case 'access_relation':
        return this.onDemand.recalculateRelationAxis(accountId, userId)
    }
  }
}
