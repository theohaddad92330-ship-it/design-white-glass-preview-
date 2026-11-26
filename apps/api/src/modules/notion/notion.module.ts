import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
import { WorkspaceModule } from '../workspace/workspace.module'
import { NotionController } from './notion.controller'
import { NotionService } from './notion.service'

/**
 * Notion OAuth integration. Ingests selected Notion pages/databases into the
 * existing RAG store (via the global `IaClient`). Uses its own
 * `notion_connections` table + the CRM token crypto. Fully autonomous (rule #7)
 * and inert until NOTION_* env vars are configured. `IaClient` comes from the
 * @Global() IaModule, so it needs no explicit import here.
 */
@Module({
  imports: [WorkspaceModule, TypeOrmModule.forFeature([NotionConnectionEntity])],
  controllers: [NotionController],
  providers: [NotionService],
  exports: [NotionService],
})
export class NotionModule {}
