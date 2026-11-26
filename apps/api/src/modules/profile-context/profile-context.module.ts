import { Module, forwardRef } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProfileContextRevisionEntity } from '../../database/entities/profile-context-revision.entity'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AuthModule } from '../auth/auth.module'
import { EsnProfileReaderModule } from '../esn-profile/esn-profile-reader.module'
import { EsnProfileWorkspaceResolver } from '../esn-profile/esn-profile-workspace.resolver'
import { TasksModule } from '../tasks/tasks.module'
import { TasksService } from '../tasks/tasks.service'
import { ToolRegistryModule } from '../tool-registry/tool-registry.module'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { ANSWER_META_READER } from './answer-meta.port'
import { AUDIT_MOVE_TASK_WRITER, type AuditMoveTaskWriter } from './audit-move-task.port'
import { BUSINESS_UNITS_READER } from './business-units.port'
import { CONNECTED_TOOLS_READER } from './connected-tools.port'
import { ProfileContextController } from './profile-context.controller'
import { ProfileContextService } from './profile-context.service'
import { ProfileContextRevisionService } from './profile-context-revision.service'
import { ProfilerGateway } from './profiler.gateway'
import { ProfilerProgressController } from './profiler-progress.controller'
import { ProfilerProgressService } from './profiler-progress.service'
import { SKIPPED_QUESTIONS_READER } from './skipped-questions.port'
import { WORKSPACE_ID_READER } from './workspace-id.port'

@Module({
  imports: [
    forwardRef(() => AuthModule),
    ToolRegistryModule,
    // #2009.7 — module DÉPENDANCE-LIBRE (voir son docblock) : il n'importe
    // pas `ProfileContextModule`, donc l'importer ici ne crée aucun cycle.
    // C'est exactement le cas d'usage pour lequel il a été séparé
    // d'`EsnProfileModule`.
    EsnProfileReaderModule,
    // #2074.16 — sens unique : `TasksModule` n'importe pas `ProfileContextModule`
    // (ni transitivement), donc aucun cycle, aucun `forwardRef`.
    TasksModule,
    TypeOrmModule.forFeature([ProfileEntity, ProfileContextRevisionEntity]),
  ],
  controllers: [ProfileContextController, ProfilerProgressController],
  providers: [
    // #2007.8 — le câblage du port : c'est ICI, et nulle part ailleurs, que la
    // construction du contexte de profil et le registre d'outils se
    // connaissent. La traduction « outil connecté → nom affichable » vit donc
    // au point de montage de l'application, pas dans un service qui irait
    // chercher celui d'un autre module (GA-07).
    {
      provide: CONNECTED_TOOLS_READER,
      inject: [ToolRegistryService],
      useFactory: (registry: ToolRegistryService) => ({
        listConnected: async (userId: string): Promise<string[]> => {
          const tools = await registry.list(userId)
          return tools.filter(tool => tool.status === 'connected').map(tool => tool.display_name)
        },
      }),
    },
    // #2009.7 — même montage que le port ci-dessus, câblé cette fois sur le
    // résolveur d'espace de travail (module `esn-profile`, lu en LECTURE
    // SEULE via `EsnProfileReaderModule`) : c'est ICI, et nulle part
    // ailleurs, que la clé d'idempotence et la résolution de workspace se
    // connaissent (GA-07).
    {
      provide: WORKSPACE_ID_READER,
      inject: [EsnProfileWorkspaceResolver],
      useFactory: (resolver: EsnProfileWorkspaceResolver) => ({
        resolveWorkspaceId: async (userId: string): Promise<string | null> => {
          const context = await resolver.resolveContext(userId)
          return context.workspaceId
        },
      }),
    },
    // #2007.6/#2007.7/#2007.10/#2007.12 — même montage, câblé sur la même
    // ressource que le port workspace ci-dessus (`EsnProfileWorkspaceResolver`),
    // pour la carte de provenance/statut des réponses.
    {
      provide: ANSWER_META_READER,
      inject: [EsnProfileWorkspaceResolver],
      useFactory: (resolver: EsnProfileWorkspaceResolver) => ({
        resolveAnswerMeta: (userId: string) => resolver.resolveAnswerMeta(userId),
      }),
    },
    // #2007.11 — même montage que le port `ANSWER_META_READER` ci-dessus, câblé
    // sur la même ressource (`EsnProfileWorkspaceResolver`), pour les clés
    // passées volontairement.
    {
      provide: SKIPPED_QUESTIONS_READER,
      inject: [EsnProfileWorkspaceResolver],
      useFactory: (resolver: EsnProfileWorkspaceResolver) => ({
        resolveSkippedQuestionKeys: (userId: string) => resolver.resolveSkippedQuestionKeys(userId),
      }),
    },
    // #2007.3 / #2009.8 — même montage : le périmètre PORTÉ, lu par la même
    // requête bornée (espace actif + utilisateur) que les prompts d'analyse
    // (#2118.9). C'est ICI que la clé du Profileur et la couche BU se
    // connaissent (GA-07).
    {
      provide: BUSINESS_UNITS_READER,
      inject: [EsnProfileWorkspaceResolver],
      useFactory: (resolver: EsnProfileWorkspaceResolver) => ({
        resolveCarriedBusinessUnits: (userId: string) => resolver.resolveCarriedBusinessUnits(userId),
      }),
    },
    // #2074.16 — même montage que les ports ci-dessus : c'est ICI, et nulle part
    // ailleurs, que la décision d'audit et les tâches se connaissent (GA-07).
    {
      provide: AUDIT_MOVE_TASK_WRITER,
      inject: [TasksService],
      useFactory: (tasks: TasksService): AuditMoveTaskWriter => ({
        createOnce: (userId, task) => tasks.createOnceFromAuditMove(userId, task),
      }),
    },
    ProfileContextService,
    ProfileContextRevisionService,
    ProfilerGateway,
    ProfilerProgressService,
    InternalSecretGuard,
  ],
  exports: [ProfileContextService, ProfilerProgressService],
})
export class ProfileContextModule {}
