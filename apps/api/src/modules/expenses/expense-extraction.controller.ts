import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { storageUploadSchema } from '@bellum/contracts'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ExpenseExtractionService, type ExpenseReceiptExtraction } from './expense-extraction.service'

class ExtractReceiptDto extends createZodDto(storageUploadSchema) {}

/**
 * LA LECTURE AUTOMATIQUE D'UN JUSTIFICATIF (#1827.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DROIT : LE MÊME QUE DÉPOSER, ET RIEN DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `records:write` OU `finance:write` — exactement la porte que
 * `expense-reports.controller.ts` ouvre pour CRÉER un brouillon (la route
 * « POST expenses/reports »). Proposer des champs à partir d'un justificatif
 * n'engage rien de plus que de les taper à la main : rien n'est écrit ici, ni
 * en base ni au stockage. C'est pourquoi cette route n'a PAS besoin du second
 * verrou (propriété de la note,
 * note non décidée) qui borne `POST /expenses/reports/:id/attachments` — ce
 * verrou existe parce que CETTE route-là écrit un objet dans le stockage
 * rattaché à une note précise ; celle-ci ne rattache rien à personne, et peut
 * même être appelée AVANT qu'aucune note n'existe (le dépôt-d'abord de
 * #1827.1 propose la lecture dès le premier fichier déposé).
 *
 * Corps réutilisé tel quel (`storageUploadSchema`) : c'est EXACTEMENT ce que
 * `toUploadInput()` (`AttachmentDeposit.tsx`) produit déjà pour l'envoi réel —
 * aucun second mécanisme de conversion fichier → base64 côté écran.
 */
@Controller('expenses/receipts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ExpenseExtractionController {
  constructor(private readonly extraction: ExpenseExtractionService) {}

  @Post('extract')
  @RequirePermission('records:write', 'finance:write')
  async extract(@Body() body: ExtractReceiptDto): Promise<ExpenseReceiptExtraction> {
    return this.extraction.extract(body)
  }
}
