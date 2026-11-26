import type { CaseBuyingModel, CaseOrganisation, CaseStrategy } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Les retours d'expérience d'un espace.
 *
 * ⚠️ Les formes sont écrites ICI et non importées de `@bellum/contracts` : le
 * paquet de contrats n'a pas encore de schéma pour cette lecture d'espace
 * (`proof.ts` ne décrit que la ligne `rex_entries`, pas la vue « ce qui attend
 * + ce qui est recueilli »). C'est une DETTE nommée, pas un choix : la même
 * forme vit à deux endroits tant que le schéma n'y est pas, et deux copies
 * divergent. Le miroir exact vit dans `capitalisation.service.ts`.
 */
export type PendingRexRow = {
  mission_id: string
  label: string
  account_id: string | null
  /** `null` = cet espace ne porte pas ce compte. Jamais un nom de remplissage. */
  account_label: string | null
  ended_on: string | null
}

export type CollectedRexRow = {
  id: string
  mission_id: string
  mission_label: string | null
  account_id: string | null
  account_label: string | null
  summary: string
  what_worked: string | null
  what_failed: string | null
  // #2424.3 — trois des quinze champs nommés (équipe, compétences,
  // contraintes) : douze autres restent à trancher avec la liste réelle.
  team: string | null
  skills: string | null
  constraints: string | null
  // #3210.2 (épopée #3246) — sept des douze champs restants (offre, expertise,
  // voie d'accès, première porte, preuve mobilisée, durée du cycle, partenaire).
  offer: string | null
  expertise: string | null
  access_path: string | null
  first_door: string | null
  proof_used: string | null
  cycle_duration: string | null
  partner: string | null
  // #3246 (lot W9 + lot cloud 14/10) — vocabulaires FERMÉS (`@bellum/contracts`, `case-dimensions`).
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
  collected_at: string
}

export type WorkspaceRex = {
  pending: PendingRexRow[]
  collected: CollectedRexRow[]
}

/** Ce qu'un humain écrit en revenant de mission. Aucun champ n'est calculé. */
type CollectRexInput = {
  mission_id: string
  account_id: string | null
  summary: string
  what_worked: string | null
  what_failed: string | null
  team: string | null
  skills: string | null
  constraints: string | null
  offer: string | null
  expertise: string | null
  access_path: string | null
  first_door: string | null
  proof_used: string | null
  cycle_duration: string | null
  partner: string | null
  strategy: CaseStrategy | null
  buying_model: CaseBuyingModel | null
  organisation: CaseOrganisation | null
}

/** La clé de cache, importée par l'écran ET par son test : recopiée à la main,
 *  elle finit par désigner deux entrées et l'écran ne se rafraîchit plus. */
export const REX_KEY = ['capitalisation-rex'] as const

export const rexApi = {
  workspace(): Promise<WorkspaceRex> {
    return apiFetch<WorkspaceRex>({ path: '/capitalisation/rex' })
  },

  /** Le geste HUMAIN qui pose un retour. Rien ne l'écrit tout seul : un retour
   *  d'expérience inventé par un système ne rapporte l'expérience de personne. */
  collect(input: CollectRexInput): Promise<{ id: string }> {
    return apiFetch<{ id: string }, CollectRexInput>({ path: '/capitalisation/rex', method: 'POST', body: input })
  },
}
