import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContextPackImportEntity } from '../../database/entities/context-pack-import.entity'
import { StorageModule } from '../storage/storage.module'
import { ContextPackOriginalsService } from './context-pack-originals.service'

/**
 * #4573 — l'original d'un import de pack, dans son PROPRE module : l'import (`UniversalImportModule`) le range et le
 * signe, l'effacement d'une personne (`ContactsModule`, c67) l'efface. `AccountsModule` importe déjà `ContactsModule` :
 * `ContactsModule` ne peut pas importer `UniversalImportModule` sans cycle — ce module-ci ne dépend que du stockage.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ContextPackImportEntity]), StorageModule],
  providers: [ContextPackOriginalsService],
  exports: [ContextPackOriginalsService],
})
export class ContextPackOriginalsModule {}
