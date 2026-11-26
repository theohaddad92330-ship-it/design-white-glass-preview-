import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { MailerModule } from '../mailer/mailer.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { ContactStopController } from './contact-stop.controller'
import { ContactStopService } from './contact-stop.service'

/**
 * L'arrêt d'un contact — « ne me contactez plus ».
 *
 * Module autonome (Craft rule #7) : le retirer retire la PORTE, pas le produit.
 * Il ne réimplémente rien — la suppression d'adresse reste celle du `mailer`,
 * qui annule déjà les séquences actives de la personne.
 *
 * ⚠️ `MailerModule` est importé, pas recopié : sans cette ligne, l'injection de
 * `SuppressionService` échoue au DÉMARRAGE et nulle part avant (GA-42), et
 * l'arrêt ne retirerait plus le moyen — la moitié qui compte.
 */
@Module({
  imports: [WorkspaceModule, MailerModule, TypeOrmModule.forFeature([ContactStopEntity, ContactEntity])],
  controllers: [ContactStopController],
  providers: [ContactStopService],
  exports: [ContactStopService],
})
export class ContactStopModule {}
