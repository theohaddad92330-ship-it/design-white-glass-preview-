import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { CRM_DEAL_SIGNAL_KINDS, type CrmDealSignalKind, type RecentSignal } from '@bellum/contracts'
import { CrmDealFactEntity } from '../../database/entities/crm-deal-fact.entity'

/** Le CRM est nommé par sa CAPACITÉ, jamais par son éditeur (`crm-presence.ts`). */
const CRM_SOURCE_LABEL = 'Votre CRM'

/** Au-delà, la veille se noie : les vingt affaires les plus récentes suffisent. */
const MAX_SIGNALS = 20

type Row = { kind: CrmDealSignalKind; evidence: string; occurred_at: Date | string }

/**
 * Lot 762 P5 — une ligne de l'HISTORIQUE des signaux CRM d'un compte : le statut du registre et les dates
 * sont RENDUS (jamais filtrés) pour que l'écran puisse dire « résolu » / « échu » au lieu de taire la ligne.
 */
export type CrmSignalHistoryLine = {
  kind: CrmDealSignalKind
  evidence: string
  /** Date du FAIT (YYYY-MM-DD) — clôture, dernière activité. */
  date: string
  /** Statut du registre ; `null` = ligne antérieure à la colonne (jamais devinée). */
  status: string | null
  /** Échéance du registre ; `null` = aucune. Une échéance passée n'exclut PAS la ligne. */
  expires_at: string | null
}

type HistoryRow = Row & { status: string | null; expires_at: Date | string | null }

/**
 * #3918.b (lot M01, 09/10/2026) — LE lecteur des signaux CRM d'un compte.
 *
 * `canonical_trigger_events` n'était lu par AUCUN écran : les affaires
 * perdues, dormantes et à renouveler que `CrmDealSignalsSweeper` consigne
 * restaient invisibles. Ce service les rend dans la forme que la veille du
 * compte lit déjà (`RecentSignal`), pour qu'elles passent par LE lecteur
 * unique des signaux côté web (`buildAccountWatchData`, filtres, compteurs,
 * sources) — jamais une seconde liste à part.
 *
 * Rattachement : `payload.accountId`, posé par la jointure deal → compte
 * (#3918.a, id société / SIREN / domaine, jamais le nom). Un deal non rattaché
 * n'apparaît sous AUCUN compte. La date est celle du FAIT (clôture, dernière
 * activité), jamais celle du balayage.
 *
 * Lecture brute via le dépôt du module : le registre appartient au module
 * `trigger-registry`, ce lecteur n'en importe pas le service (frontières).
 */
@Injectable()
export class CrmAccountSignalsService {
  constructor(
    @InjectRepository(CrmDealFactEntity)
    private readonly facts: Repository<CrmDealFactEntity>,
  ) {}

  /**
   * #3918.2 (r40) — combien d'affaires du CRM sont RATTACHÉES à ce compte (jointure #3918.a). Zéro ne veut pas
   * dire « pas de signal » : ça veut dire « rien à lire », et la veille doit pouvoir le DIRE (jamais un blanc muet).
   */
  async linkedDealCount(workspaceId: string, accountId: string): Promise<number> {
    const rows = await this.facts.manager.query<{ n: string | number }[]>(
      `SELECT count(*) AS n FROM crm_deal_facts WHERE workspace_id = $1 AND account_id = $2`,
      [workspaceId, accountId],
    )
    return Number(rows[0]?.n ?? 0)
  }

  /**
   * Lot 762 P5 — l'historique COMPLET des signaux CRM rattachés à un compte, SANS le filtre `expires_at > now()`
   * ni `status <> 'resolved'` ni plafond de 20 : un signal échu ou résolu est de l'historique, pas du bruit.
   * Plus récents d'abord. La lecture courante (`forAccount`) est INCHANGÉE.
   */
  async historyForAccount(workspaceId: string, accountId: string): Promise<CrmSignalHistoryLine[]> {
    const rows = await this.facts.manager.query<HistoryRow[]>(
      `SELECT DISTINCT ON (e.kind, e.payload->>'subjectId')
              e.kind, e.payload->>'evidence' AS evidence, e.occurred_at, e.status, e.expires_at
         FROM canonical_trigger_events e
         JOIN accounts acc ON acc.id::text = e.payload->>'accountId'
                          AND acc.workspace_id = e.workspace_id
                          AND acc.status <> 'deleted'
        WHERE e.workspace_id = $1
          AND e.payload->>'accountId' = $2
          AND e.kind = ANY($3::text[])
        ORDER BY e.kind, e.payload->>'subjectId', e.created_at DESC`,
      [workspaceId, accountId, [...CRM_DEAL_SIGNAL_KINDS]],
    )
    return rows
      .filter(row => typeof row.evidence === 'string' && row.evidence.trim().length > 0)
      .sort((a, b) => Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)))
      .map(row => ({
        kind: row.kind,
        evidence: row.evidence,
        date: new Date(row.occurred_at).toISOString().slice(0, 10),
        status: row.status ?? null,
        expires_at: row.expires_at == null ? null : new Date(row.expires_at).toISOString(),
      }))
  }

  async forAccount(workspaceId: string, accountId: string): Promise<RecentSignal[]> {
    const rows = await this.facts.manager.query<Row[]>(
      `SELECT DISTINCT ON (e.kind, e.payload->>'subjectId')
              e.kind, e.payload->>'evidence' AS evidence, e.occurred_at
         FROM canonical_trigger_events e
         JOIN accounts acc ON acc.id::text = e.payload->>'accountId'
                          AND acc.workspace_id = e.workspace_id
                          AND acc.status <> 'deleted'
        WHERE e.workspace_id = $1
          AND e.payload->>'accountId' = $2
          AND e.kind = ANY($3::text[])
          -- #3915.2 — péremption et statut du registre, ici où l'écran lit : un
          -- événement résolu ou échu ne ressort pas ; une ligne antérieure à la
          -- colonne (NULL) reste lue, jamais devinée périmée.
          AND e.status IS DISTINCT FROM 'resolved'
          AND (e.expires_at IS NULL OR e.expires_at > now())
        ORDER BY e.kind, e.payload->>'subjectId', e.created_at DESC`,
      [workspaceId, accountId, [...CRM_DEAL_SIGNAL_KINDS]],
    )
    return rows
      .filter(row => typeof row.evidence === 'string' && row.evidence.trim().length > 0)
      .sort((a, b) => Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)))
      .slice(0, MAX_SIGNALS)
      .map(row => ({
        id: null,
        signal: row.evidence,
        source: CRM_SOURCE_LABEL,
        source_ref: null,
        // Aucun lien public : la preuve vit dans le CRM du client, jamais une URL devinée.
        url: null,
        source_kind: null,
        type: row.kind,
        date: new Date(row.occurred_at).toISOString().slice(0, 10),
        sales_implication: null,
        impact: null,
        // Le fait est daté et vient d'être relu dans le CRM : il est COURANT,
        // même ancien (« perdue il y a 8 mois » est précisément le signal).
        freshness: 'current',
      }))
  }
}
