import { Controller, Get, UseGuards } from '@nestjs/common'
import type { PersonalCockpitResponse } from '@bellum/contracts'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { PersonalScope } from '../../common/decorator/personal-scope.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { PersonalCockpitService } from './personal-cockpit.service'

/**
 * Le tableau de bord ne sert QUE le cockpit personnel de l'appelant.
 *
 * #1457 — deux routes vivaient ici, `GET kpis` et `GET roi`, et elles servaient
 * des agrégats d'ESPACE (comptes, contacts, activité de la semaine, entonnoir)
 * en ne portant que `JwtGuard`. Leur unique lecteur était l'onglet « Équipe » de
 * `/dashboard`, un second cockpit d'équipe qui doublait celui de `/team` —
 * lequel passe, lui, par la permission `team:manage` et le garde de permissions
 * d'espace. L'onglet supprimé, les routes le sont aussi : une porte d'équipe
 * sans écran n'a pas à survivre à celui qui la lisait.
 *
 * ⚠️ `@PersonalScope` et non une permission d'espace, et c'est le retrait de ces
 * deux routes qui le rend VRAI : tout ce qui reste est porté par `user.userId`
 * et ne peut rien rendre d'un collègue. La question du marqueur — « un autre
 * membre de l'espace pourrait-il voir quelque chose grâce à cette route ? » —
 * se répondait « oui » tant que `kpis` et `roi` étaient là. Elle se répond
 * « non » aujourd'hui. Ce contrôleur sort donc de la liste figée de GA-05.
 */
@Controller('dashboard')
@PersonalScope()
@UseGuards(JwtGuard)
export class DashboardController {
  constructor(private readonly personalCockpitService: PersonalCockpitService) {}

  /** Personal cockpit (roadmap §5 — seat value). STRICTLY scoped to the caller
   *  inside their active workspace: my accounts, my relances, my priorities, my
   *  messages. The team view lives on `/manager/team-stats`, behind
   *  `team:manage`. */
  @Get('me')
  getPersonalCockpit(@CurrentUser() user: CurrentUserPayload): Promise<PersonalCockpitResponse> {
    return this.personalCockpitService.getPersonalCockpit(user.userId)
  }
}
