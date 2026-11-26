import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { StorageModule } from '../storage/storage.module'
import { StorageService } from '../storage/storage.service'
import { OUTREACH_ASSET_STORAGE } from './module-tokens'
import { EmailAttachmentService } from './email-attachment.service'

/**
 * #3699.6 — les pièces jointes d'un envoi individuel. Module FEUILLE (son
 * entité + le stockage, aucun contrôleur, aucune garde d'auth) : `ContactsModule`
 * l'importe sans tirer le graphe d'`OutreachAssetModule`.
 */
@Module({
  imports: [StorageModule, TypeOrmModule.forFeature([OutreachAssetEntity])],
  providers: [
    // #3699.6 — le stockage par jeton (GA-07), jamais le service importé.
    { provide: OUTREACH_ASSET_STORAGE, useExisting: StorageService },
    EmailAttachmentService,
  ],
  exports: [EmailAttachmentService],
})
export class EmailAttachmentModule {}
