import {
  BACKOFFICE_AUDIT_CATEGORIES,
  BACKOFFICE_AUDIT_OUTCOMES,
  type BackofficeAuditCategory,
  type BackofficeAuditOutcome,
} from '@bellum/contracts'
import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AuditJournalService, type AuditSearchQuery, type AuditSearchResult } from './audit-journal.service'
import { RecordAuditEntryDto } from './dto/audit-journal.dto'

/** Ce que l'écran d'audit lit d'un coup : la page, les comptes, et les règles. */
interface AuditJournalView extends AuditSearchResult {
  /**
   * Le plan de rétention TEL QU'IL EST APPLIQUÉ, calculé au même endroit que la
   * purge. L'écran ne le recopie pas : une promesse affichée qui vient d'une
   * autre source que celle qui l'applique finit par mentir.
   */
  retention: { category: BackofficeAuditCategory; months: number | null; cutoff: string | null }[]
  measuredAt: string
}

/**
 * LE JOURNAL D'AUDIT UNIQUE, pour le back-office opérateur (#1666).
 *
 * Même modèle de confiance que le reste d'`internal/admin` : la seule porte est
 * le secret interne, que la console attache CÔTÉ SERVEUR. Le rôle, lui, est
 * vérifié dans la console — `audit.read`, plancher `operator`
 * (`apps/dashboard-manager/src/lib/roles.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LECTURE SEULE — ET LE REFUS EST ÉCRIT ICI, PAS SEULEMENT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le test de l'issue : « tentative de suppression d'une ligne → refus ». Cacher
 * un bouton n'est pas un refus — un `curl` avec le secret interne passerait.
 * Les quatre verbes destructifs répondent donc **405**, avec la raison, et il
 * n'existe AUCUNE méthode de service derrière eux : le refus n'est pas une
 * garde qu'on peut contourner, c'est du code qui n'a jamais été écrit.
 *
 * ⚠️ Pourquoi 405 et pas 403 : 403 dit « pas toi », donc « quelqu'un d'autre
 * peut-être ». 405 dit « pas ce verbe, sur cette ressource, jamais ». C'est la
 * phrase exacte qu'on veut faire tenir — personne ne supprime, pas même le
 * propriétaire, pas même l'API.
 */
@Controller('internal/admin/audit-journal')
@UseGuards(InternalSecretGuard)
export class AuditJournalController {
  constructor(private readonly journal: AuditJournalService) {}

  /**
   * Une page du journal, avec les comptes qui empêchent un filtre de faire
   * disparaître une catégorie — voir `AuditJournalService.search`.
   */
  @Get()
  async list(@Query() query: Record<string, string | undefined>): Promise<AuditJournalView> {
    const now = new Date()
    const result = await this.journal.search(parseQuery(query))
    return {
      ...result,
      retention: this.journal.plan(now).map(window => ({
        category: window.category,
        months: window.months,
        cutoff: window.cutoff ? window.cutoff.toISOString() : null,
      })),
      measuredAt: now.toISOString(),
    }
  }

  /**
   * Écrit une opération. C'est LA porte : la console y poste chaque geste, et
   * le journal d'accès y miroite ses entrées.
   *
   * Rend `{ ok: true }` même si l'écriture a échoué — c'est une TRACE, pas une
   * porte : un opérateur ne doit pas se voir refuser un geste déjà accompli
   * parce qu'un `INSERT` a échoué. L'échec part dans Sentry côté service.
   */
  @Post()
  async record(@Body() dto: RecordAuditEntryDto): Promise<{ ok: true }> {
    await this.journal.record(dto)
    return { ok: true }
  }

  /**
   * ⚠️ LES QUATRE VERBES QUI N'EXISTENT PAS.
   *
   * Ils sont DÉCLARÉS pour pouvoir refuser explicitement : sans eux, un `DELETE`
   * recevrait un 404 de routage, qui se lit comme « cette route n'est pas encore
   * écrite » — donc comme quelque chose qu'on pourrait ajouter. Le 405 dit
   * l'inverse : la ressource existe, et elle ne se modifie pas.
   *
   * Le `:id` est accepté et JAMAIS lu : le refus ne dépend pas de la ligne visée,
   * et vérifier qu'elle existe apprendrait déjà quelque chose à qui essaie.
   */
  @Delete(['', ':id'])
  @HttpCode(405)
  refuseDelete(): { ok: false; error: string } {
    return { ok: false, error: REFUS }
  }

  @Patch([':id'])
  @HttpCode(405)
  refusePatch(): { ok: false; error: string } {
    return { ok: false, error: REFUS }
  }

  @Put([':id'])
  @HttpCode(405)
  refusePut(): { ok: false; error: string } {
    return { ok: false, error: REFUS }
  }
}

const REFUS =
  'Le journal d’audit est en lecture seule : une ligne ne se supprime ni ne se modifie, ' +
  'et aucune purge manuelle n’existe. Les rétentions (24 mois, 36 mois, permanent selon la ' +
  'catégorie) sont appliquées par un passage quotidien qui inscrit au journal ce qu’il a effacé.'

/**
 * Lit les paramètres de requête sans jamais faire confiance à leur forme.
 *
 * ⚠️ Une catégorie ou un résultat INCONNU est IGNORÉ, pas refusé. C'est la
 * lecture qui compte ici : un filtre illisible ne doit pas fermer l'écran
 * d'audit — il doit rendre le journal ENTIER. Refuser aurait fait d'une faute
 * de frappe dans une URL une page d'erreur sur le seul écran qui doit toujours
 * répondre.
 *
 * ⚠️ Et une date illisible est ignorée AUSSI, pour la même raison — mais elle
 * est ignorée en ENTIER : une borne mal lue qui deviendrait `Invalid Date`
 * ferait rendre zéro ligne à un journal plein, ce qui ressemblerait exactement
 * à « il ne s'est rien passé ».
 */
export function parseQuery(query: Record<string, string | undefined>): AuditSearchQuery {
  const category = query['category']
  const outcome = query['outcome']
  return {
    ...((BACKOFFICE_AUDIT_CATEGORIES as readonly string[]).includes(category ?? '')
      ? { category: category as BackofficeAuditCategory }
      : {}),
    ...((BACKOFFICE_AUDIT_OUTCOMES as readonly string[]).includes(outcome ?? '')
      ? { outcome: outcome as BackofficeAuditOutcome }
      : {}),
    ...(query['actorEmail']?.trim() ? { actorEmail: query['actorEmail'].trim().toLowerCase() } : {}),
    ...(query['operation']?.trim() ? { operation: query['operation'].trim() } : {}),
    ...date(query['since']),
    ...dateUntil(query['until']),
    ...(query['limit'] ? { limit: Number(query['limit']) } : {}),
    ...(query['offset'] ? { offset: Number(query['offset']) } : {}),
  }
}

function readable(raw: string | undefined): Date | null {
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function date(raw: string | undefined): { since?: Date } {
  const parsed = readable(raw)
  return parsed ? { since: parsed } : {}
}

function dateUntil(raw: string | undefined): { until?: Date } {
  const parsed = readable(raw)
  return parsed ? { until: parsed } : {}
}
