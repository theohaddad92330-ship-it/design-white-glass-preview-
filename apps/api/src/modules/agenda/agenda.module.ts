import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { GoogleModule } from '../google/google.module'
import { MicrosoftModule } from '../microsoft/microsoft.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AGENDA_BACKENDS } from './agenda-backend'
import { AgendaController } from './agenda.controller'
import { AgendaService } from './agenda.service'
import { GoogleAgendaBackend } from './google-agenda.backend'
import { MicrosoftAgendaBackend } from './microsoft-agenda.backend'

/**
 * La capacité « agenda ». Module autonome (règle #7) : aucune table à lui,
 * aucune dépendance métier, et le retirer ne casse ni Google ni Microsoft. Il
 * lit deux colonnes de `profiles` — l'agenda choisi — parce que ce choix doit
 * valoir pour le brief et les routines, pas seulement pour l'écran ouvert.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProfileEntity]), GoogleModule, MicrosoftModule, WorkspaceModule],
  controllers: [AgendaController],
  providers: [
    GoogleAgendaBackend,
    MicrosoftAgendaBackend,
    AgendaService,
    {
      provide: AGENDA_BACKENDS,
      useFactory: (google: GoogleAgendaBackend, microsoft: MicrosoftAgendaBackend) => [google, microsoft],
      inject: [GoogleAgendaBackend, MicrosoftAgendaBackend],
    },
  ],
  exports: [AgendaService],
})
export class AgendaModule {}
