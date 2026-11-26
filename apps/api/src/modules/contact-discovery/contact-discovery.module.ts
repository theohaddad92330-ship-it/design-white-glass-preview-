import { Module } from '@nestjs/common'
import { AccountsModule } from '../accounts/accounts.module'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { ContactsModule } from '../contacts/contacts.module'
import { CreditsModule } from '../credits/credits.module'
import { IaModule } from '../ia/ia.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContactDiscoveryController } from './contact-discovery.controller'
import { ContactDiscoveryService } from './contact-discovery.service'

/**
 * #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts sur une
 * sélection de comptes.
 *
 * Module autonome (Craft rule #7) : le retirer retire uniquement cette
 * capacité — ni la collecte de contacts normale (`ContactsModule`), ni le
 * rejeu d'un axe déjà analysé (`AnalysisModule`) n'en dépendent.
 */
@Module({
  imports: [AccountsModule, BusinessUnitModule, ContactsModule, CreditsModule, IaModule, WorkspaceModule],
  controllers: [ContactDiscoveryController],
  providers: [ContactDiscoveryService],
  exports: [ContactDiscoveryService],
})
export class ContactDiscoveryModule {}
