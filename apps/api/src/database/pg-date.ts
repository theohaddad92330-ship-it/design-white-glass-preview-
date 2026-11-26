import { types } from 'pg'

/**
 * L'OID PostgreSQL du type `date`. Nommé plutôt que recopié en littéral : un
 * `1082` nu dans un appel ne se relit pas, et se confond avec `1114`
 * (`timestamp`) ou `1184` (`timestamptz`) à la première lecture rapide.
 */
export const PG_DATE_OID = 1082

/**
 * UNE COLONNE `date` EST UNE CHAÎNE `YYYY-MM-DD`, sur tous les chemins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Par défaut, `pg` convertit une colonne `date` en objet `Date` à minuit
 * LOCAL. TypeORM, lui, rend une CHAÎNE quand il hydrate une entité. Les deux
 * chemins lisent les mêmes colonnes et n'en rendent pas la même chose — et
 * chaque requête brute du dépôt annonce `string` dans son type de retour.
 *
 * Le mensonge ne se voit jamais au typage (le compilateur croit l'annotation),
 * seulement à l'exécution, et seulement sur les lignes qui portent une date.
 * Ce qu'il a coûté en une journée (01/09/2026, espace réel) :
 *
 *  - `POST /needs/:id/match` et le matching inverse : **500 sur tout besoin
 *    ayant une date de démarrage** — `${need.startOn}T00:00:00Z` composait
 *    « Tue Sep 15 2026 …T00:00:00Z », donc `Invalid Date` ;
 *  - `GET /delivery/invoice-readiness/export.csv` : **500 dès qu'un mois porte
 *    une échéance** — la cellule CSV appelait `.replace()` sur un objet ;
 *  - `dueOn` rendu « 2026-08-25T00:00:00.000Z » là où le contrat annonce un
 *    JOUR : à l'ouest de Greenwich, l'écran affiche la veille ;
 *  - une borne d'affectation comparée à un `YYYY-MM-DD` : « Tue Sep 15 2026 … »
 *    est lexicographiquement SUPÉRIEUR à « 2026-09-15 », donc une personne en
 *    mission ressortait « libre ».
 *
 * ⚠️ Portée VOLONTAIREMENT étroite : seul l'OID `date`. Un `timestamptz` reste
 * un objet `Date`, parce qu'un INSTANT porte un fuseau et que tout le domaine
 * financier en dépend. Une date nue, elle, n'en a pas : lui en donner un est
 * précisément ce qui la décale d'un jour la moitié de l'année.
 *
 * ⚠️ L'inscription est GLOBALE au processus `pg` — c'est ce qui la rend fiable
 * (aucune connexion à oublier) et ce qui impose de l'appeler tôt : elle est
 * posée à l'import du module base de données ET dans la `DataSource` des
 * migrations, les deux portes par lesquelles ce dépôt ouvre une connexion.
 */
export function registerPgDateParser(): void {
  types.setTypeParser(PG_DATE_OID, value => value)
}
