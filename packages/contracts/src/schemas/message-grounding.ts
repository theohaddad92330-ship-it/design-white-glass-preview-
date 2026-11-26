import { z } from 'zod'

/**
 * #4524.2 — « Sur quoi Laura s'appuie » : le choix du commercial au-dessus de « Générer », tel qu'il voyage
 * du navigateur au moteur de rédaction (`POST /ia/message` → `apps/ia/app/services/message_grounding.py`).
 *
 * - `facts` : les signaux du compte et les signaux/besoins du contact COCHÉS. Le message s'appuie sur eux seuls.
 * - `free_angle` : « Angle libre » — aucun fait imposé ; l'angle tapé par le commercial pilote seul.
 *
 * Clé absente = la génération d'avant, à l'octet près. Aucun fait n'est inventé : un fait est lu du dossier,
 * avec sa preuve quand on l'a.
 */
const groundingFactSchema = z
  .object({
    kind: z.enum(['account_signal', 'contact_signal', 'contact_need']),
    label: z.string().trim().min(1).max(300),
    proof: z.string().trim().max(300).nullish(),
    /** #4977 — « job_offer » : ce signal du compte est l'OFFRE d'emploi (poste, ville) ; absent = un signal ordinaire. */
    topic: z.literal('job_offer').optional(),
  })
  .strict()

export const messageGroundingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('facts'), facts: z.array(groundingFactSchema).min(1).max(12) }).strict(),
  z.object({ mode: z.literal('free_angle') }).strict(),
])

export type MessageGrounding = z.infer<typeof messageGroundingSchema>
