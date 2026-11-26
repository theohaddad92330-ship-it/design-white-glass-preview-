import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Confirmation OBLIGATOIRE pour une suppression irréversible d'utilisateur
 * (#1664.2).
 *
 * Avant ce lot, `DELETE /internal/admin/users/:userId` n'exigeait RIEN : la
 * seule confirmation vivait dans le composant React de `dashboard-manager`
 * (taper "SUPPRIMER"), donc n'importe quel appel direct — porteur du secret
 * interne, sans passer par l'écran — supprimait le compte sans confirmation.
 * Le mot exact est le MÊME que celui que la console fait taper à l'opérateur
 * (`CONFIRM_WORD` dans `delete-user.tsx`) : ce n'est pas un partage de code
 * entre les deux apps, juste la même valeur tenue aux deux bouts pour qu'un
 * appel direct doive porter la même intention que l'écran.
 *
 * `z.literal` (pas `z.string().min(1)`) : un mot APPROXIMATIF ou en minuscule
 * ne doit pas passer — voir `admin-users-delete.controller.e2e.spec.ts`.
 */
export const deleteUserSchema = z.object({
  confirm: z.literal('SUPPRIMER'),
})
export class DeleteUserDto extends createZodDto(deleteUserSchema) {}
