import { Body, Controller, Get, Header, HttpCode, Post, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common'
import type { Response } from 'express'
import { Throttle } from '@nestjs/throttler'
import {
  PORTABLE_FORMATS,
  type ExportHistoryEntry,
  type PortabilityManifest,
  type PortableFormat,
} from '@bellum/contracts'
import { ClearRefreshCookieInterceptor } from '../../common/interceptor/refresh-cookie.interceptor'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { PrivacyDeletionService, type DeletionSummary } from './privacy-deletion.service'
import { PrivacyExportAuditService } from './privacy-export-audit.service'
import { PrivacyExportService, type PrivacyExport } from './privacy-export.service'
import { PrivacyPortabilityService } from './privacy-portability.service'
import { PrivacyRetentionService, type RetentionPolicy } from './privacy-retention.service'

/**
 * RGPD self-serve endpoints. Everything is JWT-guarded and STRICTLY scoped to
 * the authenticated user (`CurrentUser`) — never a workspace or another tenant.
 */
@Controller('privacy')
@UseGuards(JwtGuard)
// ⚠️ `@PersonalScope` sur la CLASSE, et c'est ici qu'il est juste : les cinq
// routes de ce contrôleur servent, sans exception, la donnée de CELUI QUI
// APPELLE (`@CurrentUser`) — jamais celle d'un espace ni d'un tiers. La matrice
// de permissions n'a rien à leur accorder : un droit qu'il faudrait donner à
// tous les rôles, `viewer` compris, ne garde rien. GA-05 les comptait comme
// « nues » ; elles étaient DÉCLARABLES, pas oubliées.
@PersonalScope()
export class PrivacyController {
  constructor(
    private readonly exportService: PrivacyExportService,
    private readonly portabilityService: PrivacyPortabilityService,
    private readonly deletionService: PrivacyDeletionService,
    private readonly retentionService: PrivacyRetentionService,
    // #2439.15 — journalise chaque export, plutôt qu'une dépendance des deux
    // services d'export existants : ni l'un ni l'autre ne connaît l'appelant
    // HTTP, seul le contrôleur le lit (`@CurrentUser`).
    private readonly exportAudit: PrivacyExportAuditService,
  ) {}

  /**
   * Le manifeste de « Mes données » (PDF 7 §9.2) — ce que j'emporte, avec son
   * nombre de lignes, et ce que je n'emporte pas, avec sa raison.
   *
   * Borné au demandeur comme tout le reste de ce contrôleur : le nombre de
   * contacts d'un collègue n'est pas une information anodine.
   */
  @Get('portability')
  async portability(@CurrentUser() user: CurrentUserPayload): Promise<PortabilityManifest> {
    return this.portabilityService.buildManifest(user.userId)
  }

  /**
   * UN objet, en CSV ou en JSON.
   *
   * `@Res()` SANS `passthrough` — c'est-à-dire qu'on écrit la réponse
   * nous-mêmes : le corps est un fichier déjà sérialisé, et le laisser passer
   * par le sérialiseur de Nest ré-encoderait le CSV en chaîne JSON, guillemets
   * compris.
   *
   * Plus serré que le débit global : une boucle sur les dix objets est une
   * extraction de masse, et c'est le seul endroit où elle se voit.
   */
  @Get('export/object')
  @Throttle({ 'default-1m': { limit: 20, ttl: 60_000 } })
  async exportObject(
    @CurrentUser() user: CurrentUserPayload,
    @Query('object') object: string,
    @Query('format') format: string,
    @Res() res: Response,
  ): Promise<void> {
    // Un format inconnu ne retombe pas en silence sur JSON : l'utilisateur a
    // cliqué sur un bouton précis, lui rendre l'autre fichier serait un mensonge
    // discret. Absent = `json`, qui est le format complet.
    const wanted: PortableFormat = (PORTABLE_FORMATS as readonly string[]).includes(format)
      ? (format as PortableFormat)
      : 'json'
    const file = await this.portabilityService.exportObject(user.userId, object, wanted)
    // #2439.15 — journalisé APRÈS un export réussi seulement : un objet
    // introuvable ou un format refusé ne doit jamais compter comme un accès.
    await this.exportAudit.recordObjectExport(user.userId, object, wanted)
    res.setHeader('Content-Type', file.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`)
    res.send(file.body)
  }

  /**
   * Droit d'accès + portabilité (art. 15 & 20) — a full JSON copy of the user's
   * own data. `Content-Disposition` hints a filename for a direct browser save;
   * the SPA also re-downloads the parsed JSON itself.
   *
   * #2439.15 — LE GARDE-FOU ANTI-EXPORTS-MASSIFS manquait ici : cette route
   * rend la TOTALITÉ des données personnelles en un aller-retour, et n'avait
   * jamais d'autre limite que le débit global de l'API (120/min) — un compte
   * compromis pouvait donc aspirer un export complet toutes les secondes.
   * Même plafond que `delete-account`, la seule autre route de ce contrôleur
   * dont un abus est aussi coûteux.
   */
  @Get('export')
  @Header('Content-Disposition', 'attachment; filename="bellum-export.json"')
  @Throttle({ 'default-1m': { limit: 5, ttl: 60_000 } })
  async export(@CurrentUser() user: CurrentUserPayload): Promise<PrivacyExport> {
    const payload = await this.exportService.buildExport(user.userId)
    // #2439.15 — journalisé APRÈS un export réussi : un accès qui a échoué
    // avant d'atteindre les données n'est pas un accès aux données.
    await this.exportAudit.recordFullExport(user.userId)
    return payload
  }

  /**
   * #2439.7/.8/.17 — « Mes exports » : la catégorie « exports » du NO-GO,
   * rendue avec exactement ce que `privacy_export_audit_log` journalise
   * depuis #2439.15 — jamais une ligne inventée pour qui n'a encore rien
   * exporté (un tableau vide).
   */
  @Get('export/history')
  async exportHistory(@CurrentUser() user: CurrentUserPayload): Promise<ExportHistoryEntry[]> {
    return this.exportAudit.listRecentForUser(user.userId)
  }

  /** The documented retention policy — surfaced read-only for the settings UI. */
  @Get('retention')
  getRetention(): RetentionPolicy {
    return this.retentionService.getRetentionPolicy()
  }

  /**
   * Droit à l'effacement (art. 17) — anonymise the account. Requires the
   * `confirm: "SUPPRIMER"` phrase (enforced by the DTO). Clears the session
   * cookies on the way out so the browser is signed out immediately.
   */
  @Post('delete-account')
  @HttpCode(200)
  // Tighter than the global 60/min — this is a destructive, rarely-legitimate-in-bulk action.
  @Throttle({ 'default-1m': { limit: 5, ttl: 60_000 } })
  @UseInterceptors(ClearRefreshCookieInterceptor)
  async deleteAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: DeleteAccountDto,
  ): Promise<DeletionSummary> {
    return this.deletionService.deleteAccount(user.userId, dto.confirm)
  }
}
