import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { McpAccessIntentEntity } from '../../database/entities/mcp-access-intent.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { McpAccessIntentsController } from './mcp-access-intents.controller'
import { McpAccessIntentsService } from './mcp-access-intents.service'

/** Théo D settings-outils.N1 — le cadre d'un nouvel accès. Indépendant : le retirer ne casse rien (règle n°7). */
@Module({
  imports: [TypeOrmModule.forFeature([McpAccessIntentEntity]), WorkspaceModule],
  controllers: [McpAccessIntentsController],
  providers: [McpAccessIntentsService],
})
export class McpAccessIntentsModule {}
