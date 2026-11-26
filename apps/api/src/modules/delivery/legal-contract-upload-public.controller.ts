import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { createZodDto } from 'nestjs-zod'
import { depositLegalContractUploadSchema } from '@bellum/contracts'
import { LegalContractUploadLinkService } from './legal-contract-upload-link.service'
import { LegalContractUploadTokenGuard } from './legal-contract-upload-token.guard'

class DepositLegalContractUploadDto extends createZodDto(depositLegalContractUploadSchema) {}

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — LA PORTE PUBLIQUE : un contact
 * EXTERNE (client, partenaire), SANS compte BellumAI, dépose une pièce sur un
 * contrat de mission depuis le lien que son commercial lui a envoyé
 * lui-même — le copilote ne l'envoie jamais (doctrine : il prépare, le
 * commercial envoie).
 *
 * Gardée par {@link LegalContractUploadTokenGuard} — ni `JwtGuard` ni
 * `WorkspacePermissionGuard` n'ont de sens ici : l'appelant n'est ni un
 * utilisateur ni un service à nous. Chaque route porte aussi son propre
 * `@Throttle` : c'est une surface PUBLIQUE, et un jeton de 256 bits rend le
 * brute-force déjà impraticable, mais une porte de dépôt reste une porte
 * d'écriture — elle se borne comme les autres (`demo.controller.ts`,
 * `oauth.controller.ts`).
 */
@Controller('public/legal-contract-uploads')
@UseGuards(LegalContractUploadTokenGuard)
export class LegalContractUploadPublicController {
  constructor(private readonly links: LegalContractUploadLinkService) {}

  @Get(':token')
  @Throttle({ 'default-1m': { limit: 20, ttl: 60_000 } })
  async status(@Param('token') token: string) {
    // Le garde a déjà vérifié que ce jeton est VALIDE (ni introuvable, ni
    // expiré, ni révoqué) — cette résolution ne peut donc rendre que `valid`.
    return this.links.resolvePublic(token)
  }

  @Post(':token')
  @Throttle({ 'default-1m': { limit: 10, ttl: 60_000 } })
  async deposit(@Param('token') token: string, @Body() body: DepositLegalContractUploadDto) {
    const today = new Date().toISOString().slice(0, 10)
    return this.links.deposit(token, body, today)
  }
}
