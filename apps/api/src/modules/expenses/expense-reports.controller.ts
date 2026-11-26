import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import {
  can,
  expenseReportListQuerySchema,
  rejectExpenseReportSchema,
  type ExpenseReportAttachmentView,
  type SignedDownload,
  saveExpenseReportSchema,
  storageUploadSchema,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { StorageService } from '../storage/storage.service'
import { ExpenseReportsService } from './expense-reports.service'

class ExpenseReportListQueryDto extends createZodDto(expenseReportListQuerySchema) {}
class RejectExpenseReportDto extends createZodDto(rejectExpenseReportSchema) {}
class UploadAttachmentDto extends createZodDto(storageUploadSchema) {}
class SaveExpenseReportDto extends createZodDto(saveExpenseReportSchema) {}

/**
 * LES NOTES DE FRAIS (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DROIT, ET POURQUOI IL EST COUPÉ EN DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * **Lire** (`finance:read` OU `records:write`) : l'écran répond d'abord à une
 * question d'ORGANISATION — quinze notes attendent une décision, de qui, pour
 * quel client, sur quel mois. Fermer la porte à qui n'a pas `finance:read`
 * cacherait cette file entière à ceux qui la font avancer. Les MONTANTS, eux,
 * ne passent pas : sans `finance:read`, ils sortent à `null` — présents et
 * vides, jamais à zéro (D45) — et `canReadFinance` voyage avec la réponse pour
 * que l'écran distingue « pas le droit » de « pas mesuré ».
 *
 * **Décider** (`finance:write`) : valider une note engage un remboursement ET
 * corrige la marge de la mission. C'est exactement le poids de « marquer un
 * mois facturé », qui porte déjà ce droit-là.
 *
 * **Déposer** (`records:write`, 31/08/2026) : saisir sa note n'engage rien —
 * c'est une DEMANDE, que quelqu'un d'autre décidera. Exiger `finance:write`
 * pour la déposer fermerait la porte à tous ceux qui se déplacent et n'ont
 * aucune raison de voir la marge : le recruteur qui va sur site, le commercial
 * qui prend un train. C'est aussi la raison pour laquelle « soumettre » et
 * « retirer » vivent du même côté : ce sont deux gestes du DÉPOSANT sur sa
 * propre demande, pas deux décisions.
 *
 * Chaque route déclare sa permission — GA-05 compte les routes nues, et une
 * route neuve qui en ajouterait une ferait monter un cliquet qui ne doit que
 * descendre.
 */
@Controller('expenses/reports')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ExpenseReportsController {
  constructor(
    private readonly reports: ExpenseReportsService,
    private readonly workspaceContext: WorkspaceContextService,
    // ⚠️ Le stockage est injecté ICI et pas dans le service, et ce n'est pas
    // une commodité : un domaine n'appelle pas le service d'un autre (GA-07).
    // Le contrôleur est l'endroit où les deux se rencontrent — il a déjà
    // tranché le droit, ce que ni l'un ni l'autre ne sait faire.
    private readonly storage: StorageService,
  ) {}

  /**
   * Un seul endroit résout l'espace ET le droit financier — le service n'a pas
   * à connaître le module Workspace (règle §3.2, garde GA-07).
   *
   * `can(role, extra, …)` et jamais `hasPermission(role, …)` : le second ignore
   * les droits accordés membre par membre, et deux chemins qui lisent le même
   * droit différemment font voir la marge sur un écran et pas sur l'autre.
   */
  private async scope(
    userId: string,
  ): Promise<{ workspaceId: string; canReadFinance: boolean; canWriteFinance: boolean }> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return {
      workspaceId,
      canReadFinance: can(role, extra, 'finance:read'),
      // #1827 — qui n'a pas `finance:write` peut quand même déposer un
      // justificatif, mais sur SA note et tant qu'elle n'est pas décidée.
      canWriteFinance: can(role, extra, 'finance:write'),
    }
  }

  @Get()
  @RequirePermission('finance:read', 'records:write')
  async list(@CurrentUser() user: CurrentUserPayload, @Query() query: ExpenseReportListQueryDto) {
    const { workspaceId, canReadFinance } = await this.scope(user.userId)
    return this.reports.list(workspaceId, query, canReadFinance)
  }

  @Get(':id')
  @RequirePermission('finance:read', 'records:write')
  async detail(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId, canReadFinance } = await this.scope(user.userId)
    // `today` est passé par le contrôleur pour que la vérification automatique
    // reste une fonction PURE, donc rejouable à l'identique dans un test.
    return this.reports.detail(workspaceId, id, canReadFinance, new Date().toISOString().slice(0, 10))
  }

  /**
   * DÉPOSE une note — elle naît en BROUILLON, jamais directement dans la file.
   *
   * Deux gestes séparés (créer, puis soumettre) parce que le libellé promet ce
   * qui va se passer : « Enregistrer » range, « Soumettre » envoie à quelqu'un.
   * Les fondre ferait partir des notes à demi saisies au premier clic.
   */
  @Post()
  @RequirePermission('records:write')
  async create(@CurrentUser() user: CurrentUserPayload, @Body() body: SaveExpenseReportDto) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.save(workspaceId, user.userId, null, body)
  }

  /** MODIFIE une note tant qu'elle n'est pas décidée. */
  @Put(':id')
  @RequirePermission('records:write')
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SaveExpenseReportDto,
  ) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.save(workspaceId, user.userId, id, body)
  }

  /** SOUMET le brouillon — il entre dans la file du valideur, daté. */
  @Post(':id/submit')
  @RequirePermission('records:write')
  async submit(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.submit(workspaceId, id)
  }

  /** RETIRE une note soumise par erreur — elle redevient un brouillon. */
  @Post(':id/withdraw')
  @RequirePermission('records:write')
  async withdraw(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.withdraw(workspaceId, id)
  }

  /** VALIDE — et pousse les frais dans la marge de la mission, une seule fois. */
  @Post(':id/validate')
  @RequirePermission('finance:write')
  async validate(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.validate(workspaceId, user.userId, id)
  }

  /**
   * REFUSE. Le motif est exigé par le DTO, donc par le SERVEUR — un champ grisé
   * côté écran n'est pas une garantie, un appel direct le contournerait. Le
   * corps est `.strict()` : rien d'autre que `reason` n'entre.
   */
  @Post(':id/reject')
  @RequirePermission('finance:write')
  async reject(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectExpenseReportDto,
  ) {
    const { workspaceId } = await this.scope(user.userId)
    return this.reports.reject(workspaceId, user.userId, id, body.reason)
  }

  /**
   * DÉPOSE un justificatif (31/08/2026).
   *
   * Deux écritures, dans cet ordre, et un retour en arrière :
   *  1. les OCTETS partent au stockage, qui applique ses bornes (taille, type,
   *     quota) et rend un objet rangé ;
   *  2. la LIGNE de justificatif rattache l'objet à la note ;
   *  3. si (2) échoue, (1) est DÉFAIT. Sans ce retour en arrière, le quota de
   *     l'espace enflerait sans qu'aucune ligne ne le dise, et personne ne
   *     saurait quels octets effacer.
   *
   * `finance:write` : ajouter une pièce à un dossier, c'est préparer la
   * décision de remboursement qui suivra — c'est le même poids que la prendre.
   *
   * #1827 (09/09/2026) — cette porte a été mesurée trop étroite pour son flux.
   * L'écran fait désormais COMMENCER une note de frais par le dépôt de ses
   * justificatifs, et celui qui a la pile de tickets est un commercial :
   * `sales`, `sales_ops`, `member` et `recruiter` portent `records:write` mais
   * pas `finance:write`, donc chacun d'eux se prenait un 403 sur son propre
   * dépôt. Voir une marge et déposer son ticket de péage ne sont pas le même
   * geste — c'est exactement l'argument que le rôle `finance` porte déjà en
   * commentaire dans le registre des rôles.
   *
   * L'élargissement est BORNÉ, et par deux verrous distincts :
   *   - il faut que la note soit LA SIENNE (`bearer_user_id`), vérifié ci-dessous ;
   *   - il faut qu'elle ne soit pas encore DÉCIDÉE — ce second verrou existait
   *     déjà dans `attach()`, et ne bouge pas.
   * Qui porte `finance:write` garde l'accès inchangé, sur toutes les notes.
   */
  @Post(':id/attachments')
  @RequirePermission('records:write', 'finance:write')
  async upload(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UploadAttachmentDto,
  ): Promise<ExpenseReportAttachmentView> {
    const { workspaceId, canWriteFinance } = await this.scope(user.userId)
    // #1827 — le contrôle de propriété passe AVANT le stockage : sans lui, un
    // refus laisserait derrière lui un objet stocké que plus personne ne
    // référence, et on ne saurait pas quels octets effacer.
    if (!canWriteFinance) await this.reports.assertBearerIs(workspaceId, id, user.userId)
    const stored = await this.storage.put({
      workspaceId,
      domain: 'expense_receipt',
      fileName: body.fileName,
      contentType: body.contentType,
      fileB64: body.fileB64,
      uploadedBy: user.userId,
      today: new Date().toISOString().slice(0, 10),
    })
    try {
      return await this.reports.attach(workspaceId, id, {
        objectId: stored.id,
        fileName: stored.fileName,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        retentionUntil: stored.retentionUntil,
      })
    } catch (error) {
      // Les octets repartent, PUIS la vraie erreur remonte : la masquer ferait
      // chercher au mauvais endroit.
      await this.storage.remove(workspaceId, stored.id)
      throw error
    }
  }

  /**
   * OUVRE un justificatif — une URL signée qui vit cinq minutes.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI `finance:read` ICI, ALORS QUE LA LECTURE DU DOSSIER NE L'EXIGE PAS
   * ─────────────────────────────────────────────────────────────────────────
   * L'écran est lisible sans `finance:read` — la file, les porteurs, les mois —
   * et ce sont les MONTANTS qui passent la porte, sortis à `null` (D45). Or un
   * justificatif est une facture : l'ouvrir, c'est lire le montant. Rendre le
   * fichier à qui n'a pas le droit de voir le total défairait la rédaction en
   * un clic — la garder sur le seul champ JSON serait une porte fermée à côté
   * d'une fenêtre ouverte.
   *
   * ⚠️ L'URL n'est signée qu'APRÈS que la note a été retrouvée DANS l'espace
   * du demandeur. Le stockage, lui, ne sait pas ce qu'est une note de frais —
   * c'est ce qui interdit de lui confier la vérification.
   */
  @Get(':id/attachments/:attachmentId/download')
  @RequirePermission('finance:read')
  async download(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<SignedDownload> {
    const { workspaceId, canReadFinance } = await this.scope(user.userId)
    // Ceinture et bretelles : la permission ci-dessus et le droit résolu ici
    // sont lus par deux chemins (rôle vs droits accordés membre par membre), et
    // c'est `can(...)` qui fait foi partout ailleurs dans ce contrôleur.
    if (!canReadFinance) {
      throw new ForbiddenException('Un justificatif porte le montant : il demande le droit de voir les montants.')
    }
    const objectId = await this.reports.attachmentObjectId(workspaceId, id, attachmentId)
    if (!objectId) {
      // La pièce EXISTE, mais nous ne détenons pas ses octets. Le message le
      // DIT — « introuvable » tout court enverrait chercher une pièce qui est
      // pourtant à l'écran. L'écran, lui, n'offre aucun bouton dans ce cas :
      // ce chemin est une ceinture, pas un parcours.
      throw new NotFoundException('Ce justificatif est référencé, mais son fichier n’est pas stocké ici.')
    }
    return this.storage.signedUrlFor(workspaceId, objectId)
  }
}
