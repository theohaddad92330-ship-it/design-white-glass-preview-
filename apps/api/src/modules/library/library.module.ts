import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { LibraryItemEntity } from '../../database/entities/library-item.entity'
import { AuthModule } from '../auth/auth.module'
import { WorkspaceModule } from '../workspace/workspace.module'
import { LibraryController } from './library.controller'
import { LibraryService } from './library.service'

/**
 * Knowledge library (templates & playbooks) CRUD. Imports {@link WorkspaceModule}
 * to resolve the caller's active workspace (team scope) and {@link AuthModule}
 * for the JWT guard. Registered directly in `AppModule`.
 */
@Module({
  imports: [AuthModule, WorkspaceModule, TypeOrmModule.forFeature([LibraryItemEntity])],
  controllers: [LibraryController],
  providers: [LibraryService],
})
export class LibraryModule {}
