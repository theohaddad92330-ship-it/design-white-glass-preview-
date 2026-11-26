import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { AuthModule } from '../auth/auth.module'
import { StorageModule } from '../storage/storage.module'
import { StorageService } from '../storage/storage.service'
import { OUTREACH_ASSET_STORAGE } from './module-tokens'
import { WorkspaceModule } from '../workspace/workspace.module'
import { OutreachAssetController } from './outreach-asset.controller'
import { OutreachAssetService } from './outreach-asset.service'

/**
 * Outreach asset catalog CRUD (#2838). Imports {@link WorkspaceModule} to
 * resolve the caller's active workspace (team scope) and {@link AuthModule}
 * for the JWT guard. Registered directly in `AppModule`.
 */
@Module({
  // #3699.6 — `StorageModule` : le fichier réel d'un asset vit dans le stockage partagé.
  imports: [AuthModule, WorkspaceModule, StorageModule, TypeOrmModule.forFeature([OutreachAssetEntity])],
  controllers: [OutreachAssetController],
  providers: [
    // #3699.6 — le stockage par jeton (GA-07), jamais le service importé.
    { provide: OUTREACH_ASSET_STORAGE, useExisting: StorageService },
    OutreachAssetService,
  ],
})
export class OutreachAssetModule {}
