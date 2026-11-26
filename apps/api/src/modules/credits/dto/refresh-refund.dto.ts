import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #2650.2 (19/09/2026) — le corps du geste d'opérateur qui rembourse les
// rafraîchissements déjà payés dans les 6 h.
//  - `workspaceId` OBLIGATOIRE : UN espace, jamais tout le parc (doctrine
//    « un correctif rattrape l'existant — ciblé ») ;
//  - `dryRun` vaut `true` par défaut : le mode réel se DEMANDE (`false`
//    explicite). Un booléen JSON strict — la chaîne "false" est refusée, elle
//    ne doit jamais devenir un vrai remboursement par coercition ;
//  - `actor` : l'identité de l'opérateur pour la trace (même convention que
//    `AdminSegmentCatchupDto`), en liste blanche — il finit dans un journal ;
//  - `.strict()` : aucun champ de plus (un montant, un propriétaire…) ne passe.
const refreshRefundSchema = z
  .object({
    workspaceId: z.string().guid(),
    dryRun: z.boolean().default(true),
    actor: z
      .string()
      .regex(/^[\p{L}\p{N}._@ -]{1,120}$/u)
      .optional(),
  })
  .strict()

export class RefreshRefundDto extends createZodDto(refreshRefundSchema) {}
