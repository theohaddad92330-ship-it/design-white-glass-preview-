import { Body, Controller, Post, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { InvalidPhoneArchiveService, type InvalidPhoneArchiveOutcome } from '../contacts/invalid-phone-archive.service'
import { AdminInvalidPhoneArchiveDto } from './dto/admin-invalid-phone-archive.dto'

/**
 * #3850.1 (lot V04, 08/10) — LE GESTE D'OPÉRATEUR de l'archivage ciblé des
 * téléphones déjà en base qui n'ont pas la forme d'un numéro. Même famille
 * que {@link AdminContactReachabilityCatchupController} : préfixe
 * `internal/admin`, même {@link InternalSecretGuard}. C'est la SEULE porte
 * d'entrée : rien d'autre dans le dépôt n'appelle `runArchive`, ni boot ni
 * routine. Coupé par l'interrupteur `contacts.invalid_phone_archive`.
 */
@Controller('internal/admin/contact-invalid-phone-archive')
@UseGuards(InternalSecretGuard)
export class AdminInvalidPhoneArchiveController {
  constructor(private readonly archive: InvalidPhoneArchiveService) {}

  /** Lecture seule — chiffre l'ampleur AVANT de lancer `run`. */
  @Post('preview')
  async preview(@Query('limit') limit?: string): Promise<{ concerned: number }> {
    const rows = await this.archive.listConcerned(limit ? Number(limit) : undefined)
    return { concerned: rows.length }
  }

  @Post()
  run(@Body() dto: AdminInvalidPhoneArchiveDto): Promise<InvalidPhoneArchiveOutcome> {
    return this.archive.runArchive(dto.actor ?? 'backoffice', dto.limit)
  }
}
