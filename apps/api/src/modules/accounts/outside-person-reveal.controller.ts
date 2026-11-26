import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Optional,
  Post,
  UseGuards,
} from '@nestjs/common'
import { isFailure, unwrap } from '@bellum/utils'
import {
  outsidePersonRevealRequestSchema,
  type OutsidePersonRevealRequest,
  type OutsidePersonRevealResponse,
} from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { AccountEntity } from '../../database/entities/account.entity'
import { JwtGuard } from '../auth/jwt.guard'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { ContactEnrichmentService } from '../contacts/contact-enrichment.service'
import { throwContactFailure } from '../contacts/contacts.controller'
import { ContactsService, isIncompleteContactName } from '../contacts/contacts.service'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { AccountsService, type AccountFailure } from './accounts.service'

/**
 * #4421.16 (décision Louis 25/10) — « Obtenir l'e-mail » sous une personne que Laura propose HORS de l'espace.
 *
 * UN appel, au clic, pour UNE personne : (a) le compte RETROUVÉ dans l'espace actif (SIREN, nom normalisé) ou, à
 * défaut, ajouté au portefeuille par le chemin EXISTANT de Découvrir (`addToPortfolio` : aucune analyse, aucun
 * crédit) ; (b) la personne devenue contact du compte par la porte de la collecte (anti-doublon #4479) ; (c)
 * l'enrichissement EXISTANT mis en file — même service, même débit que `POST contacts/:id/enrich`, l'e-mail seul,
 * débité seulement si une adresse est trouvée. L'écran suit le job par `GET contacts/:id/enrichment`.
 *
 * Rien n'est envoyé (le commercial envoie), rien n'est écrit dans un outil externe, aucune analyse ne part.
 *
 * GA-07 : c'est le CONTRÔLEUR qui compose les deux domaines (comptes, contacts), jamais un service qui importe
 * l'autre.
 */
@Controller('outside-people')
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class OutsidePersonRevealController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly contactsService: ContactsService,
    private readonly enrichmentJobs: ContactEnrichmentService,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  /**
   * Droits : `contacts:enrich` par la garde, `records:write` re-prouvé ici sur l'espace ACTIF (le décorateur lit
   * « l'une suffit » quand on en nomme deux — ce geste exige les DEUX).
   */
  @Post('reveal')
  @RequirePermission('contacts:enrich')
  @HttpCode(HttpStatus.ACCEPTED)
  async reveal(@Body() body: unknown, @CurrentUser() user: CurrentUserPayload): Promise<OutsidePersonRevealResponse> {
    const input = outsidePersonRevealRequestSchema.parse(body)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    await this.workspaceContext.assertPermission(user.userId, workspaceId, 'records:write')
    // La salle de démonstration montre le geste sans écrire : l'écran le simule, le serveur ne crée rien.
    if (await this.workspaceContext.isDemoWorkspace(user.userId)) {
      throw new HttpException(
        { message: 'En démonstration, aucune adresse n’est recherchée.', code: 'demo_reveal_blocked' },
        HttpStatus.CONFLICT,
      )
    }

    const account = await this.resolveAccount(user.userId, workspaceId, input)
    const contact = unwrap(
      await this.contactsService.ensureOutsidePerson(account.id, user.userId, {
        fullName: input.name,
        ...(input.title ? { title: input.title } : {}),
        ...(input.linkedin_url ? { linkedinUrl: input.linkedin_url } : {}),
        apolloId: input.person_ref,
      }),
      throwContactFailure,
    )
    // Un nom de famille masqué (« D. ») ne part jamais comme nom : la référence suffit à retrouver la personne.
    const [firstName = input.name, ...rest] = input.name.split(/\s+/).filter(Boolean)
    const lastName = isIncompleteContactName(input.name) ? '' : rest.join(' ')
    const job = unwrap(
      await this.enrichmentJobs.enqueue(contact.id, user.userId, {
        first_name: firstName,
        ...(lastName ? { last_name: lastName } : {}),
        organization_name: account.company_name || input.company_name,
        only: 'email',
      }),
      throwContactFailure,
    )
    return { account_id: account.id, contact_id: contact.id, job_id: job.job_id, state: job.state }
  }

  /** Le compte de l'espace ACTIF, visible de l'appelant (périmètre BU) ; sinon 404, jamais une écriture ailleurs. */
  private async resolveAccount(
    userId: string,
    workspaceId: string,
    input: OutsidePersonRevealRequest,
  ): Promise<AccountEntity> {
    const visible = async (id: string): Promise<AccountEntity> =>
      unwrap(
        await this.accountsService.findOneForWorkspace(
          id,
          workspaceId,
          await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId),
        ),
        (problem: AccountFailure) => {
          throw new NotFoundException(problem.message)
        },
      )
    if (input.account_id) return visible(input.account_id)

    const found = await this.accountsService.findInWorkspaceForOutsidePerson(workspaceId, {
      ...(input.siren ? { siren: input.siren } : {}),
      company_name: input.company_name,
    })
    if (found && found.status !== 'deleted') return visible(found.id)

    // Absent (ou supprimé) : le chemin de Découvrir l'ajoute au portefeuille — ou ressuscite CE compte supprimé.
    const added = await this.accountsService.addToPortfolio(userId, {
      company_name: found?.company_name || input.company_name,
      ...((found?.siren ?? input.siren) ? { siren: found?.siren ?? input.siren } : {}),
    })
    if (isFailure(added)) throw new HttpException(added.problem.message, HttpStatus.INTERNAL_SERVER_ERROR)
    return added.output.account
  }
}
