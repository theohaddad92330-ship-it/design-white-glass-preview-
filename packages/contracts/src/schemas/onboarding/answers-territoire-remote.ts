import { z } from 'zod'

/**
 * #2036.2 (#2847, modèle de territoire à 7 axes) — le remote accepté et les
 * déplacements, un axe DISTINCT de `geo_zones` (Temps 1, qui dit où l'ESN
 * PROSPECTE) — même principe que `growth_target_zones` (#2036.9,
 * `answers-profil.ts`) et `company_locations` (`answers-implantation.ts`) :
 * ne jamais fusionner deux axes de territoire dans la même liste de choix.
 *
 * Colonne ADDITIVE, `text[]` par défaut vide (migration 1796321380100) : le
 * questionnaire ne bloque jamais, une question passée reste `[]`.
 *
 * Les 6 autres axes que #2036 demande (agences/régions/pays séparés,
 * secteurs locaux, comptes réservés/groupe, règles territoriales, périmètre
 * exclusif/partagé, « je peux intervenir ») restent un changement de MODÈLE
 * (nouvelles tables, nouvel écran) — hors de ce fichier, qui ne porte que
 * l'axe additif.
 */
export const TERRITOIRE_REMOTE_ANSWER_FIELDS = {
  remote_and_travel_scope: z.array(z.string()).catch([]),
}
