import { z } from 'zod'
import { actionChannelSchema } from './actions.js'
import { actionRiskSchema } from './action-os.js'

/**
 * L'OBJET VISÉ par une demande en attente — le bloc COMMUN aux quatre files de
 * validation (#2200/#2201, lot ACT2, suite de #2200/#2201 ACT1) : les
 * approbations d'un run (`ApprovalRequestView`), les écritures ERP
 * (`AtsWriteRequestView`), les écritures CRM (`CrmWriteRequestView`) et les
 * relances automatiques (`PlaybookApproval`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SEUL BLOC, ET PAS QUATRE CHAMPS RECOPIÉS QUATRE FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * ACT1 avait mesuré que #2200.10/.11/.12/.17 et #2201.21 tenaient tous à la
 * même absence : aucune des quatre vues ne porte le compte, le contact, le
 * propriétaire, le canal ou le niveau de risque. Écrire le champ quatre fois
 * l'aurait fait diverger au premier ajout — exactement le défaut que la
 * doctrine reproche déjà aux énumérations recopiées (`apps/web/.../api.ts:17-20`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAQUE CHAMP EST UN FAIT, OU `null` — JAMAIS DEVINÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` porte deux sens distincts selon le type de demande, et c'est
 * délibéré : pour une écriture ERP, `accountId`/`accountName` sont `null` par
 * NATURE (un TJM ou une mission ne vise ni compte ni contact bellum) ; pour une
 * écriture CRM, ils peuvent être `null` par ABSENCE DE MESURE (le lien vers
 * notre compte interne n'est pas encore tracé). Les deux se lisent pareil à
 * l'écran — « non renseigné » — ce qui est exactement ce que #2200.10/.11
 * demandent : ne JAMAIS inventer un nom.
 *
 * `channel` réutilise `actionChannelSchema` (le vocabulaire déjà établi par le
 * journal, `actions.ts`) plutôt que d'en inventer un second qui diverge.
 * `risk` réutilise `actionRiskSchema` (déjà déclaré par pas de workflow,
 * `action-os.ts:118`) — jamais une probabilité, un niveau NOMMÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `source` (#2855) — QUI/QUOI A COMPOSÉ LA PROPOSITION, JAMAIS UN RECALCUL
 * ─────────────────────────────────────────────────────────────────────────────
 * #2201.14 : aucune des quatre vues ne disait d'où venait une écriture de
 * SYSTÈME — quel compte rendu, quel appel, quelle routine. `kind` est une
 * NATURE fermée (comme `channel`/`risk`), pas une prose : le libellé affiché se
 * traduit côté client depuis `kind`, jamais depuis une chaîne posée par le
 * serveur (i18n FR/EN, même discipline que `channel`). `ref` est l'identifiant
 * de l'objet source QUAND IL EXISTE — optionnel : un libellé seul, sans
 * référence, reste une provenance réelle plutôt qu'une provenance inventée.
 * `null` = un geste direct de la personne, ou une provenance non encore tracée
 * — les deux se lisent « non renseigné », jamais une valeur devinée.
 */
export const WRITE_SOURCE_KINDS = ['meeting_note', 'call', 'routine', 'mcp'] as const
export const writeSourceSchema = z
  .object({
    kind: z.enum(WRITE_SOURCE_KINDS),
    ref: z.string().optional(),
  })
  .nullable()
export type WriteSource = z.infer<typeof writeSourceSchema>

export const writeRequestTargetSchema = z.object({
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
  contactId: z.string().nullable(),
  contactName: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  channel: actionChannelSchema.nullable(),
  risk: actionRiskSchema.nullable(),
  source: writeSourceSchema,
})
export type WriteRequestTarget = z.infer<typeof writeRequestTargetSchema>

/** Un bloc entièrement vide — le repli sûr pour une demande d'avant ce champ. */
export const EMPTY_WRITE_REQUEST_TARGET: WriteRequestTarget = {
  accountId: null,
  accountName: null,
  contactId: null,
  contactName: null,
  ownerId: null,
  ownerName: null,
  channel: null,
  risk: null,
  source: null,
}
