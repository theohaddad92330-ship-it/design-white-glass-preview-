import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #2637.1 (21/09/2026) — LE GESTE D'OPÉRATEUR qui déclenche le rattrapage
// automatique des rôles manquants. Même convention que
// `AdminSegmentCatchupDto` : `actor` trace QUI a déclenché le lot, `limit`
// borne le nombre de comptes rejoués en un appel — jamais tout le parc.
// ⚠️ Pas de `maxAttempts` ici : le plafond de reprises par compte
// (`MISSING_ROLES_CATCHUP_MAX_ATTEMPTS`) n'est PAS configurable par HTTP —
// un enrichissement dépense le crédit du client, la borne ne se relève pas
// d'un appel pressé.
export const adminMissingRolesCatchupSchema = z.object({
  actor: z.string().max(200).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})
export class AdminMissingRolesCatchupDto extends createZodDto(adminMissingRolesCatchupSchema) {}
