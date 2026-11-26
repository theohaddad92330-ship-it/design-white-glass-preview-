import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Operator provisions a DEMO workspace (demo mode C1) for a dedicated demo
// user. `ownerUserId` must be a real profile — the service 404s otherwise, and
// 409s when the user's workspace already holds real dossiers (fail closed:
// a typo can never flip a customer workspace into free-demo mode).
export const createDemoWorkspaceSchema = z.object({
  ownerUserId: z.string().guid(),
  /** Display name of the demo space (defaults to « Démo Bellum »). */
  name: z.string().min(1).max(120).optional(),
  /** Crée le profil du compte démo s'il n'existe pas encore (le profil est créé
   *  paresseusement au premier chargement de l'app). Réservé au provisioning
   *  one-shot ; absent = 404 sur profil manquant, comportement inchangé. */
  ensureProfile: z.boolean().optional(),
})
export class CreateDemoWorkspaceDto extends createZodDto(createDemoWorkspaceSchema) {}
