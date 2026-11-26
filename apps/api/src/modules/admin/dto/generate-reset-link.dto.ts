import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { DEFAULT_RESET_LINK_TTL, resetLinkTtlKeySchema } from '@bellum/contracts'

/**
 * La durée de vie demandée pour un lien de réinitialisation.
 *
 * Une clé d'une liste FERMÉE, jamais un nombre de minutes : une durée libre
 * laisserait saisir une valeur que Supabase refusera à l'échange, et l'opérateur
 * ne le découvrirait qu'en voyant quelqu'un rester bloqué. Absente ⇒ 48 heures,
 * le défaut du back-office.
 */
export class GenerateResetLinkDto extends createZodDto(
  z.object({ ttl: resetLinkTtlKeySchema.default(DEFAULT_RESET_LINK_TTL) }),
) {}
