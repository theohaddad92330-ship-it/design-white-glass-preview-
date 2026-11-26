import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import {
  SegmentCatchupService,
  type SegmentCatchupDimension,
  type SegmentCatchupOutcome,
} from '../analysis/segment-catchup.service'
import { AdminSegmentCatchupDto } from './dto/admin-segment-catchup.dto'

/**
 * #AF (18/09/2026) — LE GESTE D'OPÉRATEUR qui déclenche le rattrapage ciblé du
 * segment contacts (#2543 : couverture des contacts, servie et vérifiée en
 * production le 18/09/2026, mais qui n'atteint jamais un compte déjà
 * analysé sans être rejouée).
 *
 * Même famille que {@link AdminAnalysesController} : préfixe
 * `internal/admin`, même {@link InternalSecretGuard} (secret d'en-tête, aucun
 * JWT utilisateur) — cross-tenant par construction, le garde est ce qui
 * sépare cette route de tous les comptes de tous les espaces. Il ne doit
 * jamais être retiré.
 *
 * #AF.4 — c'est la SEULE porte d'entrée du rattrapage. Rien d'autre dans le
 * dépôt n'appelle `SegmentCatchupService.runCatchup` : ni un
 * `onApplicationBootstrap`, ni une routine planifiée. Même appelée ici, la
 * course reste coupée si l'interrupteur `accounts.contacts_segment_catchup`
 * (kill-switches.ts) est posé.
 */
@Controller('internal/admin/segment-catchup')
@UseGuards(InternalSecretGuard)
export class AdminSegmentCatchupController {
  constructor(private readonly catchup: SegmentCatchupService) {}

  /** Lecture seule — les comptes concernés, sans rien déclencher. Sert à
   *  chiffrer l'ampleur AVANT de lancer `runCatchup`. */
  @Post('contacts/preview')
  async preview(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage lui-même — voir le docblock de la classe. */
  @Post('contacts')
  run(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runCatchup(dto.actor ?? 'backoffice', dto.limit, dto.account_ids)
  }

  // ── #2543.7 (18/09/2026) ────────────────────────────────────────────────
  // Les trois segments qui rejoignent contacts maintenant qu'ils portent
  // chacun leur date de collecte (migration `1795712345678`). Routes
  // littérales séparées, comme `contacts`/`contacts/preview` ci-dessus —
  // jamais un paramètre de route, pour ne rien faire deviner à Nest sur
  // l'ordre de résolution entre un segment et un futur chemin `contacts/...`.

  /** Lecture seule — les comptes concernés du segment signaux. */
  @Post('signals/preview')
  async previewSignals(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccountsForSegment('signals', limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage du segment signaux (Phase 1 recherche). */
  @Post('signals')
  runSignals(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.runSegment('signals', dto)
  }

  // ── #2887.11 (Louis 16-17/10) ───────────────────────────────────────────
  // Le rattrapage « partenaire actif » (#2371.4) : les SEULS comptes dont le SIREN est celui d'un
  // partenaire de l'espace avec des placements en cours. Jamais tout le parc.

  /** Lecture seule — les comptes « partenaire actif » concernés. */
  @Post('signals/partner-placements/preview')
  async previewPartnerPlacements(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listPartnerPlacementAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage « partenaire actif » (rejeu du segment signaux, comptes partenaires seulement). */
  @Post('signals/partner-placements')
  runPartnerPlacements(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runPartnerPlacementCatchup(dto.actor ?? 'backoffice', dto.limit)
  }

  // ── #4327 (19/10/2026) ──────────────────────────────────────────────────
  // Le rattrapage des FILIALES (Fortuneo absente d'Arkéa) : les seuls comptes qui portent un graphe
  // capitalistique, jamais tout le parc. Rejeu du segment signaux (la recherche Phase 1 écrit `subsidiaries`).

  /** Lecture seule — les comptes concernés par le rattrapage des filiales. */
  @Post('signals/subsidiaries/preview')
  async previewSubsidiaries(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listSubsidiaryAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage des filiales (rejeu du segment signaux, comptes à graphe seulement). */
  @Post('signals/subsidiaries')
  runSubsidiaries(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runSubsidiaryCatchup(dto.actor ?? 'backoffice', dto.limit)
  }

  // ── #4687 (28/10/2026) ──────────────────────────────────────────────────
  // Le rattrapage de l'HISTORIQUE INTERNE : les seuls comptes d'un espace qui avait une connexion BoondManager
  // quand ils ont été collectés. Rejeu du segment signaux avec relecture de l'historique, jamais tout le parc.

  /** Lecture seule — les comptes concernés par le rattrapage de l'historique interne. */
  @Post('signals/ats-history/preview')
  async previewAtsHistory(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listAtsHistoryAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage de l'historique interne (rejeu du segment signaux, comptes d'espaces branchés seulement). */
  @Post('signals/ats-history')
  runAtsHistory(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runAtsHistoryCatchup(dto.actor ?? 'backoffice', dto.limit)
  }

  // ── #4732 (29/10/2026) ──────────────────────────────────────────────────
  // Le rattrapage des RACHATS ET FUSIONS : les seuls comptes dont le registre porte un acte de rapprochement
  // des douze derniers mois. Rejeu du segment signaux, jamais tout le parc.

  /** Lecture seule — les comptes concernés par le rattrapage des rachats et fusions. */
  @Post('signals/mergers/preview')
  async previewMergers(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listMergerAccounts(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage des rachats et fusions (rejeu du segment signaux, comptes concernés seulement). */
  @Post('signals/mergers')
  runMergers(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runMergerCatchup(dto.actor ?? 'backoffice', dto.limit)
  }

  /** Lecture seule — les comptes concernés du segment entités. */
  @Post('entities/preview')
  async previewEntities(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccountsForSegment('entities', limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage du segment entités (Phase 3 organigramme). */
  @Post('entities')
  runEntities(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.runSegment('entities', dto)
  }

  /** Lecture seule — les comptes concernés du segment stratégie. */
  @Post('strategy/preview')
  async previewStrategy(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccountsForSegment('strategy', limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage du segment stratégie (Phase 4 plan). */
  @Post('strategy')
  runStrategy(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.runSegment('strategy', dto)
  }

  // ── #2118.51 (18/09/2026) ───────────────────────────────────────────────
  // Le CINQUIÈME segment : la lecture du dossier en sept axes (#2118). Route
  // littérale séparée (`dossier-read`), même principe que les quatre autres —
  // jamais un paramètre de route.

  /** Lecture seule — les comptes concernés du segment « lecture en sept axes ». */
  @Post('dossier-read/preview')
  async previewDossierRead(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.catchup.listConcernedAccountsForSegment('dossier_read', limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  /** Le rattrapage du segment « lecture en sept axes » (Phase 4 plan, même
   *  chemin on-demand `replan` que `strategy` ci-dessus). */
  @Post('dossier-read')
  runDossierRead(@Body() dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.runSegment('dossier_read', dto)
  }

  private runSegment(dimension: SegmentCatchupDimension, dto: AdminSegmentCatchupDto): Promise<SegmentCatchupOutcome> {
    return this.catchup.runSegmentCatchup(dto.actor ?? 'backoffice', dimension, dto.limit)
  }
}
