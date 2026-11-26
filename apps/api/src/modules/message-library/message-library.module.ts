import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { MessageLibraryEntryEntity } from '../../database/entities/message-library-entry.entity'
import { MessageLibraryTraceEntity } from '../../database/entities/message-library-trace.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { MessageLibraryController } from './message-library.controller'
import { MessageLibraryService } from './message-library.service'

/**
 * #3427 — module autonome (Craft rule #7) : le retirer coupe la bibliothèque
 * d'exemples commerciaux, sans rien casser d'autre — aucun autre module n'y
 * écrit ni ne la lit encore (branchement Laura reporté, voir le commentaire
 * de livraison sur #3427).
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([MessageLibraryEntryEntity, MessageLibraryTraceEntity])],
  controllers: [MessageLibraryController],
  providers: [MessageLibraryService],
  exports: [MessageLibraryService],
})
export class MessageLibraryModule {}
