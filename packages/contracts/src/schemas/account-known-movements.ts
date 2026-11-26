import { z } from 'zod'
import { sinceLastVisitLineSchema } from './since-last-visit.js'

/**
 * #2556 — SUR UN COMPTE DÉJÀ CONNU, AU MOINS UN FAIT NEUF, DATÉ ET SOURCÉ — OU
 * LE DIRE HONNÊTEMENT.
 *
 * Retour client (François Thomas, call bêta du 17/09/2026) : sur un compte
 * que le commercial connaît déjà, produire « quelque chose » à tout prix est
 * exactement ce qui détruit la confiance. `known: false` doit donc pouvoir se
 * lire sans qu'aucune ligne, aucune fenêtre ne l'accompagne — la page n'a même
 * pas à poser la question sur un compte non connu.
 *
 * `lines` RÉUTILISE {@link sinceLastVisitLineSchema} tel quel (GA-26) plutôt
 * que d'inventer un second vocabulaire d'état : `job_changes` et
 * `missions_moving`, simplement filtrées à CE compte au lieu de tout
 * l'espace. Les deux autres lignes du brief restent hors de ce contrat, et
 * c'est un choix, pas un oubli — `account_signals` est déjà montrée par
 * compte dans l'onglet Veille (la dupliquer ici dirait deux fois la même
 * chose, GA-26), et `replies_received` répond à « m'a-t-on répondu, à MOI »,
 * une question sur la messagerie de l'utilisateur, pas sur un compte.
 */
export const accountKnownMovementsSchema = z
  .object({
    known: z.boolean(),
    /**
     * La fenêtre RÉELLEMENT interrogée, quand `known` est vrai — `null`
     * sinon. Jamais « depuis ta dernière visite » : ce repère par utilisateur
     * n'existe pas dans le dépôt (#2556.1), et l'écran ne doit affirmer que ce
     * qu'il peut prouver. La date affichée est celle-ci, explicitement.
     */
    since: z.string().datetime({ offset: true }).nullable(),
    lines: z.array(sinceLastVisitLineSchema),
  })
  .superRefine((value, ctx) => {
    if (!value.known && (value.since !== null || value.lines.length > 0)) {
      ctx.addIssue({ code: 'custom', message: 'un compte non connu ne porte ni fenêtre ni ligne' })
    }
    if (value.known && value.since === null) {
      ctx.addIssue({ code: 'custom', path: ['since'], message: 'un compte connu porte toujours sa fenêtre' })
    }
  })
export type AccountKnownMovements = z.infer<typeof accountKnownMovementsSchema>
