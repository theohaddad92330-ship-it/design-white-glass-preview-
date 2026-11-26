import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { CommercialOutcomeEntity } from '../../database/entities/commercial-outcome.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { CommercialOutcomesController } from './commercial-outcomes.controller'
import { CommercialOutcomesService } from './commercial-outcomes.service'

/**
 * Épopée #2787 — le ledger des outcomes commerciaux. Module AUTONOME (règle
 * #7) : le retirer supprime `/accounts/:id/outcomes` sans toucher au reste.
 *
 * `CommercialOutcomesService` est exporté pour que `ContactsModule` lise
 * {@link CommercialOutcomesService.incorrectContactIds} avant de classer
 * (#2126.56/.58) — sens UNIQUE : ce module n'importe jamais `ContactsModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CommercialOutcomeEntity, AccountEntity, ContactEntity]), WorkspaceModule],
  controllers: [CommercialOutcomesController],
  providers: [CommercialOutcomesService],
  exports: [CommercialOutcomesService],
})
export class OutcomesModule {}
