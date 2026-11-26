import { z } from 'zod'

/**
 * #3712 — les vrais dossiers associés à UNE personne : compte, entité, puis
 * projets, besoins et missions réellement liés à elle (`GET /contacts/:id/associations`).
 *
 * Doctrine de l'issue :
 *  - le lien repose sur l'IDENTITÉ de l'objet (une clé), jamais sur un
 *    rapprochement par nom ; un rattachement à l'entreprise n'associe pas la
 *    personne à tous les projets du compte ;
 *  - `basis` distingue ce qui est DOCUMENTÉ (une ligne `project_contacts`, un
 *    besoin qui la nomme interlocuteur) de ce qui est seulement DÉCLARÉ
 *    (un rôle de facturation) — jamais « confirmé » par un libellé importé ;
 *  - l'emploi actuel n'est « actuel » que s'il a été VÉRIFIÉ (`employment_verified_at`) ;
 *    un contact historique n'est pas présenté comme toujours en poste ;
 *  - une absence ne fait aucune ligne (pas de carte à zéro).
 */
export const CONTACT_ASSOCIATION_KINDS = ['project', 'need', 'mission'] as const
export const contactAssociationKindSchema = z.enum(CONTACT_ASSOCIATION_KINDS)

export const CONTACT_ASSOCIATION_BASES = ['documented', 'declared'] as const
export const contactAssociationBasisSchema = z.enum(CONTACT_ASSOCIATION_BASES)

export const CONTACT_EMPLOYMENT_STATES = ['current', 'historical', 'to_verify'] as const
export const contactEmploymentStateSchema = z.enum(CONTACT_EMPLOYMENT_STATES)

export const contactAssociationItemSchema = z.object({
  kind: contactAssociationKindSchema,
  id: z.string().guid(),
  name: z.string(),
  /** L'état métier tel que stocké (stade du projet, statut du besoin ou de la mission). */
  state: z.string(),
  /** Le rôle documenté de la personne sur cet objet, ou `null` quand le lien n'en porte pas. */
  role: z.string().nullable(),
  /** Tous les rôles de la personne sur cet objet (une mission peut en porter plusieurs). Absent = `role` seul. */
  roles: z.array(z.string()).optional(),
  basis: contactAssociationBasisSchema,
  /** Pour un besoin : le projet qui le porte, quand il en a un (le lien mène à l'objet exact). */
  project_id: z.string().guid().nullable(),
})
export type ContactAssociationItem = z.infer<typeof contactAssociationItemSchema>

export const contactAssociationsSchema = z.object({
  contact_id: z.string().guid(),
  account: z.object({ id: z.string().guid(), name: z.string() }).nullable(),
  /** L'entité du compte à laquelle la personne est rattachée (clé validée), ou `null`. */
  entity: z.object({ id: z.string().guid(), name: z.string() }).nullable(),
  /** Le LIBELLÉ d'entité écrit par la source, quand il n'y a pas de clé — « déclaré », non confirmé. */
  entity_label: z.string().nullable(),
  employment: contactEmploymentStateSchema,
  items: z.array(contactAssociationItemSchema),
})
export type ContactAssociations = z.infer<typeof contactAssociationsSchema>

/** Ordre de lecture : projets d'abord, puis besoins, puis missions ; documenté avant déclaré. */
const KIND_ORDER: Record<ContactAssociationItem['kind'], number> = { project: 0, need: 1, mission: 2 }
const BASIS_ORDER: Record<ContactAssociationItem['basis'], number> = { documented: 0, declared: 1 }

export function sortContactAssociations(items: readonly ContactAssociationItem[]): ContactAssociationItem[] {
  return [...items].sort(
    (a, b) => BASIS_ORDER[a.basis] - BASIS_ORDER[b.basis] || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  )
}

/**
 * L'emploi actuel : `historical` si le cycle de vie le dit, `current` seulement
 * si l'emploi a été vérifié (par un fournisseur qui reconfirme ou une correction
 * humaine), sinon `to_verify` — un libellé importé ou enrichi ne confirme rien.
 */
export function contactEmploymentState(input: {
  lifecycle_state: string | null | undefined
  employment_verified_at: string | Date | null | undefined
}): z.infer<typeof contactEmploymentStateSchema> {
  if (input.lifecycle_state === 'historique') return 'historical'
  return input.employment_verified_at ? 'current' : 'to_verify'
}
