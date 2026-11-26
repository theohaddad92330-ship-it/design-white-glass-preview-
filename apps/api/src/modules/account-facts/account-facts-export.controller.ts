import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { accountFactsExportRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { DataExit } from '../workspace/data-exit.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountFactsExportService } from './account-facts-export.service'

class AccountFactsExportDto extends createZodDto(accountFactsExportRequestSchema) {}

/**
 * #4073.1 — POST parce que la liste d'identifiants tient mal dans une URL ;
 * c'est une LECTURE (`@WorkspaceRead`), la même que la fiche des comptes.
 */
@Controller('account-facts')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class AccountFactsExportController {
  constructor(private readonly exportCells: AccountFactsExportService) {}

  @Post('export-cells')
  // #2081.14 — une SORTIE de données : la règle d'espace « qui peut exporter » la tient.
  @DataExit()
  @WorkspaceRead()
  cells(@CurrentUser() user: CurrentUserPayload, @Body() body: AccountFactsExportDto) {
    return this.exportCells.cellsFor(user.userId, body.accountIds)
  }
}
