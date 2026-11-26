import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { observeSpan } from '../../common/observability-span'

/**
 * #2442.4 (épopée #2879, lot M10 09/10) — le span « connecteur » côté API.
 *
 * Tout ce qu'un outil de Laura lit d'un connecteur de la personne (messagerie,
 * agenda, CRM, documents) entre par le pont `internal/copilot` — la contrepartie
 * du span `connector` du service IA (`bellum_api._post/_get`). L'opération est
 * le NOM DU GESTE (méthode du contrôleur, en snake_case), jamais un contenu.
 */
@Injectable()
export class ConnectorSpanInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const operation = context
      .getHandler()
      .name.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
    return from(observeSpan('connector', operation, () => lastValueFrom(next.handle(), { defaultValue: undefined })))
  }
}
