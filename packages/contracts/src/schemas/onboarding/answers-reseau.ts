import { z } from 'zod'

/**
 * Le réseau personnel DÉCLARÉ à l'onboarding — #2045.1/.2/.4/.6/.7 (lot B,
 * 22/09/2026).
 *
 * `canaux.ts` (#2048) nomme QUINZE portes d'entrée, dont quatre reposent sur
 * un réseau personnel plutôt qu'une prospection active : « Anciens clients »,
 * « Anciens collègues », « Partenaires et rang 2 », « Recommandation »
 * (`ENTRY_CHANNEL_VALUES`, `answers-canaux.ts`). Aucune de ces quatre portes
 * ne dit sa TAILLE — la question du retour (#2045) est exactement celle-là :
 * combien de personnes, approximativement, dans chacun de ces réservoirs.
 * `warm_relations_count_band` (#2045.6) répond à la même question pour un
 * cinquième réservoir, transversal aux quatre portes : les relations jugées
 * « chaudes », quel que soit le canal par lequel elles sont arrivées.
 *
 * Cinq colonnes, toutes des BANDES DE VALEUR — jamais un nombre exact
 * (même règle que `answers-vivier.ts` : personne ne connaît son chiffre au
 * profil près). Réutilise `VIVIER_COUNT_BAND_CHOICES` telle quelle (GA-26) :
 * les mêmes sept marches (« 0 » à « 200+ ») disent aussi bien un vivier de
 * consultants qu'un réseau d'anciens clients — un second référentiel de
 * bandes divergerait dès le premier ajustement.
 *
 * `.nullable().optional()` comme le reste du profil progressif : une clé
 * ABSENTE d'un ancien payload reste assignable à `EsnAnswers`, une question
 * jamais posée ne devient jamais une valeur devinée (« non mesuré n'est
 * jamais 0 »).
 *
 * ⚠️ #2045.6 n'est PAS un doublon de `accounts_relationship_status` [PQ]
 * (`profile-questionnaire.ts`) : celle-ci est un ÉTAT catégoriel (« RDV déjà
 * obtenu », « Compte dormant », « Mixte »…) sur la relation DOMINANTE, jamais
 * un COMPTE. Le registre le nomme lui-même « approche », pas « déjà là » —
 * les deux questions répondent à des questions différentes (GA-26 protège
 * contre une VALEUR dupliquée, pas contre deux axes voisins).
 *
 * Trois voies de #2045 restent HORS de ce fichier, à dessein :
 * - #2045.3 (consultants), #2045.9 (comptes déjà travaillés) sont déjà
 *   couvertes par `consultant_size` et `portfolio_size` — les reposer ici
 *   ferait deux questions pour la même réponse (GA-26) ;
 * - #2045.5 (contacts CRM) est une lecture API d'un connecteur branché,
 *   jamais une question déclarative (cf. #2031.5) ;
 * - #2045.8 (missions passées) vient de `modules/capitalisation`, un COMPTE
 *   réel, pas une estimation déclarée — une bande inventerait un chiffre que
 *   le produit sait déjà compter exactement.
 */
export const RESEAU_ANSWER_FIELDS = {
  // #2045.1 — « Anciens clients » (`ENTRY_CHANNEL_VALUES`), en taille.
  former_clients_count_band: z.string().nullable().optional(),
  // #2045.2 — « Anciens collègues ».
  former_colleagues_count_band: z.string().nullable().optional(),
  // #2045.4 — « Partenaires et rang 2 ».
  partners_count_band: z.string().nullable().optional(),
  // #2045.7 — « Recommandation » : les personnes qui pourraient recommander,
  // pas les recommandations déjà reçues (`entry_channels_last_starts` compte
  // celles-ci ailleurs).
  referrers_count_band: z.string().nullable().optional(),
  // #2045.6 — les relations jugées CHAUDES, transversales aux quatre portes
  // ci-dessus. Distinct de `accounts_relationship_status` [PQ] : un COMPTE,
  // pas un état.
  warm_relations_count_band: z.string().nullable().optional(),
}
