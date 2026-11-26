import { z } from 'zod'

/**
 * #2036.8 (#2847, modèle de territoire à 7 axes) — #2036 demande de
 * « distinguer : Je peux intervenir / Je possède déjà des relations / Je
 * souhaite développer » et de « ne pas transformer une zone souhaitée en
 * capacité avérée ».
 *
 * V1 tranché sans Louis (26/09/2026, lot `feat/reste-r4-26-09`) : le registre
 * du 25/09 classait ce point comme dépendant du modèle à 3 axes de #2036.1
 * (agences/régions/pays séparés) — exact pour un croisement PAR ZONE, qui
 * reste un changement de modèle (nouvel écran hiérarchique), hors de cette
 * v1. #2036 ne demande pas explicitement ce croisement : une posture
 * DÉCLARÉE au niveau du territoire pris dans son ensemble reste une lecture
 * valide de la demande, et distingue déjà — c'est le seul invariant non
 * négociable de #2036 — la capacité avérée de l'intention, dans le même
 * catalogue FERMÉ, jamais fusionnées.
 *
 * Catalogue FERMÉ (pas de `allowOther`) : trois postures, jamais un texte
 * libre — même règle que `remote_and_travel_scope` (#2036.2). Colonne
 * ADDITIVE, `text[]` par défaut vide (migration 1796321504100).
 */
export const TERRITOIRE_CAPACITE_ANSWER_FIELDS = {
  zone_capability_status: z.array(z.string()).catch([]),
}
