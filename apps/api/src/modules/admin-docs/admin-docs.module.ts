import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminDocsConnectionEntity } from '../../database/entities/admin-docs-connection.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { AdminDocsController } from './admin-docs.controller'
import { AdminDocsService } from './admin-docs.service'

/** Module autonome (règle #7) : rien n'en dépend, le retirer ne casse rien. */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([AdminDocsConnectionEntity, ProjectEntity])],
  controllers: [AdminDocsController],
  providers: [AdminDocsService],
  exports: [AdminDocsService],
})
export class AdminDocsModule {}
