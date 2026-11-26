import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NoteEntity } from '../../database/entities/note.entity'
import { PlanFeaturesModule } from '../plan-features/plan-features.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AccountClaimBus } from './account-claim.bus'
import { AccountClaimListener } from './account-claim.listener'
import { DiscoverCandidateNotesController } from './discover-candidate-notes.controller'
import { DiscoverCandidateNotesService } from './discover-candidate-notes.service'

/**
 * #2151.59 — les notes de terrain sur un candidat de Découvrir.
 *
 * Module autonome (règle #7) — le retirer supprime la capacité sans toucher à
 * Découvrir lui-même ni au CRM natif. Réutilise `NoteEntity` (`CrmCoreModule`
 * la déclare aussi ; TypeORM tolère la double déclaration de la même entité
 * dans deux modules `forFeature`) plutôt qu'un module neuf couplé au CRM —
 * un candidat Découvrir n'est PAS un objet du CRM tant qu'il n'est pas devenu
 * un compte, et `NotesService` (générique) exige que sa cible existe déjà en
 * base (`assertEntityBelongsToWorkspace`), ce qu'un candidat ne peut pas
 * satisfaire.
 *
 * `AccountClaimBus` est EXPORTÉ (GA-07, 18/09/2026) : `AccountsModule` émet
 * dessus « ce candidat est devenu un compte » pour la reprise à la
 * conversion, sans importer `DiscoverCandidateNotesService` — voir le
 * docblock de `account-claim.bus.ts`. `AccountClaimListener` s'y abonne et
 * fait l'appel à sa place. `DiscoverCandidateNotesService` n'a donc plus
 * besoin d'être exporté.
 */
@Module({
  imports: [PlanFeaturesModule, WorkspaceModule, TypeOrmModule.forFeature([NoteEntity])],
  controllers: [DiscoverCandidateNotesController],
  providers: [DiscoverCandidateNotesService, AccountClaimBus, AccountClaimListener],
  exports: [AccountClaimBus],
})
export class DiscoverNotesModule {}
