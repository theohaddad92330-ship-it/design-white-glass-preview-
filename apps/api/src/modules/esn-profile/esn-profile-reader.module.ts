import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceActiveSelectionEntity } from '../../database/entities/workspace-active-selection.entity'
import { EsnProfileReader } from './esn-profile-reader.service'
import { EsnProfileWorkspaceResolver } from './esn-profile-workspace.resolver'

/**
 * Lightweight, dependency-free module exposing {@link EsnProfileReader} and
 * the {@link EsnProfileWorkspaceResolver} it resolves through. Kept separate
 * from {@link EsnProfileModule} so a consumer that only needs to READ the
 * onboarding answers (the analysis pipeline) doesn't transitively import
 * Auth / Mailer / ProfileContext. The workspace/member repositories are
 * registered here (repos only — NOT the WorkspaceModule, which drags Mailer)
 * so resolution can find the workspace's canonical company profile.
 *
 * ⚠️ `WorkspaceActiveSelectionEntity` est là depuis le 07/09/2026 : sans elle, le
 * résolveur ne voyait pas l'espace CHOISI et retombait sur l'espace personnel
 * vide que le déclencheur d'inscription donne à chacun — un associé qui rejoint
 * l'ESN d'un collègue se voyait reposer les douze questions de l'onboarding.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      EsnProfileEntity,
      WorkspaceEntity,
      WorkspaceMemberEntity,
      WorkspaceActiveSelectionEntity,
    ]),
  ],
  providers: [EsnProfileReader, EsnProfileWorkspaceResolver],
  exports: [EsnProfileReader, EsnProfileWorkspaceResolver],
})
export class EsnProfileReaderModule {}
