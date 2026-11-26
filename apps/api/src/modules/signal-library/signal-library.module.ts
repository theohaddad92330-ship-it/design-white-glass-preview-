import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { WorkspaceModule } from '../workspace/workspace.module'
import { SignalLibraryController } from './signal-library.controller'
import { SignalLibraryService } from './signal-library.service'
import { SignalUserStateEntity } from './signal-user-state.entity'
import { SignalWatchEntity } from './signal-watch.entity'

/** Théo A signaux — états personnels des signaux et veilles par compte. Autonome (règle #7) : le retirer retire les routes. */
@Module({
  imports: [TypeOrmModule.forFeature([SignalUserStateEntity, SignalWatchEntity]), WorkspaceModule],
  controllers: [SignalLibraryController],
  providers: [SignalLibraryService],
})
export class SignalLibraryModule {}
