import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NoteEntity } from '../../database/entities/note.entity'
import { AtsModule } from '../ats/ats.module'
import { AtsCredentialsService } from '../ats/ats-credentials.service'
import { GoogleModule } from '../google/google.module'
import { MicrosoftModule } from '../microsoft/microsoft.module'
import { NotionModule } from '../notion/notion.module'
import { ATS_CONFIG_SOURCE, type AtsConfigSource } from './ats-config-source'
import { ZeroLayerService } from './zero-layer.service'

/**
 * Couche zéro — traces internes de l'ESN (annexe méthodo p8). Module autonome
 * (règle #7) : le retirer supprime la lecture Drive/Notion/Gmail/Outlook/ATS
 * sans toucher au CRM (déjà branché ailleurs) ni au reste du pipeline.
 *
 * Il n'importe QUE des modules d'intégration existants — il n'en crée aucun, et
 * n'a pas de contrôleur : ce n'est pas une fonctionnalité de plus, c'est la
 * lecture de celles qui sont déjà connectées. La seule table qu'il touche est
 * `notes`, qu'il LIT (#1088) et dont il n'est pas propriétaire.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NoteEntity]), GoogleModule, NotionModule, MicrosoftModule, AtsModule],
  providers: [
    ZeroLayerService,
    // #4687 — jamais `useExisting` : la forme du port est vérifiée à la compilation par le type de retour.
    {
      provide: ATS_CONFIG_SOURCE,
      useFactory: (credentials: AtsCredentialsService): AtsConfigSource => credentials,
      inject: [AtsCredentialsService],
    },
  ],
  exports: [ZeroLayerService],
})
export class ZeroLayerModule {}
