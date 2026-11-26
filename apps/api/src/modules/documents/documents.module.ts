import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { ContactsModule } from '../contacts/contacts.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { DocumentsController } from './documents.controller'
import { DocumentsService } from './documents.service'

/**
 * Les livrables bureautiques. Module autonome (règle #7) : aucune table, il ne
 * fait que mettre en page ce que les autres modules savent déjà lire.
 */
@Module({
  // `BusinessUnitModule` : le contrôleur résout le périmètre de l'appelant
  // avant tout export — un téléchargement porte le même cloisonnement que l'écran.
  imports: [AccountsModule, BusinessUnitModule, ContactsModule, WorkspaceModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
