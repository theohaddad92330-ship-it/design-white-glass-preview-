import type { CreateLostDealRex, LostDealRex } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * BEL-SC-243 — REX PERTE (#3272.1), côté web.
 *
 * Un module SÉPARÉ de `features/projects/api.ts` : le reste de ce fichier
 * porte le CYCLE DE VIE d'une opportunité (étape, montant, risques…), ce REX
 * est un objet de CAPITALISATION qui s'y RATTACHE (`/capitalisation/...`),
 * jamais une propriété du projet lui-même.
 */
export const lostDealRexApi = {
  create(input: CreateLostDealRex): Promise<LostDealRex> {
    return apiFetch<LostDealRex, CreateLostDealRex>({
      path: '/capitalisation/lost-deal-rex',
      method: 'POST',
      body: input,
    })
  },
  /** #3295 (reste) — le seul appelant de `GET .../lost-deal-rex` : jusqu'ici
   *  testé côté API, jamais lu par aucun écran. */
  listForProject(projectId: string): Promise<{ items: LostDealRex[] }> {
    return apiFetch<{ items: LostDealRex[] }>({
      path: `/capitalisation/projects/${projectId}/lost-deal-rex`,
      method: 'GET',
    })
  },
}
