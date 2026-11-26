import { Module } from '@nestjs/common'
import { CommonAccountResolverService } from './common-account-resolver.service'

/**
 * Lot 793 — le référentiel pivot des identifiants d'entreprise (`common_account_links`), en LECTURE seule. Écrit par
 * le script opérateur `ingest:common-account-links` ; ce module ne fait que résoudre. Table vide = aucun rattachement
 * de plus, la lecture d'avant ce lot.
 */
@Module({
  providers: [CommonAccountResolverService],
  exports: [CommonAccountResolverService],
})
export class CommonAccountsModule {}
