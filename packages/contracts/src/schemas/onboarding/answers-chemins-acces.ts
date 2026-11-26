import { z } from 'zod'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * Chemins d'accès — lot L17 (#2044).
 *
 * #2044.1 → #2044.13 (les onze « voies » nommées par l'issue) et #2044.14/.15
 * (résultats / coût en temps par voie) NE SONT PAS ici : ils pointent sur le
 * catalogue canonique {@link ENTRY_CHANNEL_VALUES} et les champs
 * `entry_channels_used` / `entry_channels_last_starts` / `entry_channels_time_split`
 * (`./answers-canaux.ts`, issue #2048, lot L19) — GA-26, un catalogue de
 * canaux ne se recopie pas. Voir le rapport du lot pour la correspondance
 * exacte des treize voies.
 *
 * Ce qui manquait à #2048 pour couvrir #2044 en entier — trois axes
 * complémentaires, tous optionnels comme le reste du Temps 1 :
 */
export const CHEMINS_ACCES_ANSWER_FIELDS = {
  // #2044.16 — sur quel(s) canal/canaux le pipeline dépend le plus (celui sans
  // lequel il s'arrêterait). Catalogue partagé avec `entry_channels_used`.
  entry_channels_dependency: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
  // #2044.18 — prérequis d'accès (accréditation, budget minimum, relation
  // existante...). Texte libre : contrairement aux canaux eux-mêmes, la liste
  // des prérequis n'a pas de catalogue fermé.
  entry_channels_prerequisites: z.array(z.string()).max(PROFILE_ANSWER_MAX_MULTI).optional(),
  // #2044.19 — canaux sur lesquels une limite est atteinte (temps, volume,
  // contacts disponibles). Catalogue partagé avec `entry_channels_used`.
  entry_channels_saturation: z
    .array(z.string())
    .max(PROFILE_ANSWER_MAX_MULTI * 2)
    .optional(),
}

/**
 * #2044.17 (fréquence par voie active) et #2044.20 (comparaison, « sans voie
 * universellement meilleure ») ne sont PAS ici :
 *  - .17 demanderait une saisie PAR canal sélectionné (une fréquence propre à
 *    chacun) — le vocabulaire de `Question` (`lib/questions/types.ts`) n'a que
 *    des questions à choix PLATS, pas de forme « une valeur par item coché » ;
 *    construire cette forme est un lot d'infrastructure UI à part. Trois
 *    canaux sur treize ont déjà leur fréquence (`weekly_calls`/`weekly_emails`/
 *    `weekly_linkedin`) — c'est ce que l'evidence du registre appelle
 *    « couvre 3 voies sur 13 ».
 *  - .20 est un moteur de comparaison côté audit, hors périmètre fichiers de
 *    ce lot (aucun fichier `apps/api`/`apps/ia` dans le mandat L17).
 * Voir le rapport du lot.
 */
