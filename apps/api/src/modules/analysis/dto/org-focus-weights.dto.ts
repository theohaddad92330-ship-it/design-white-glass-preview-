import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { orgFocusWeightsSchema } from '@bellum/contracts'

/**
 * Body de `POST /analysis/org-focus-weights` — le focus du plan de l'espace.
 *
 * Le schéma vient du CONTRAT : axes fermés, bornes 0-20. Un axe inconnu ou une
 * valeur hors borne est refusée en 400 plutôt que silencieusement rabotée — un
 * réglage qu'on croit posé et qui ne l'est pas se découvre trois plans plus tard.
 */
export class OrgFocusWeightsDto extends createZodDto(z.object({ weights: orgFocusWeightsSchema })) {}
