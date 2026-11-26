/**
 * LA FORME DE LA CLAUSE DE PÉRIMÈTRE — écrite UNE fois, pour tous les dialectes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le cloisonnement de périmètre s'applique désormais à deux familles de
 * requêtes qui ne s'écrivent pas pareil : les listes, en QueryBuilder TypeORM
 * (paramètres NOMMÉS, `:...businessUnitIds`), et le détail d'un compte, en SQL
 * brut (paramètres POSITIONNELS, `$3`). Écrire la règle deux fois, c'est
 * garantir qu'un jour l'une des deux perdra sa seconde moitié — et « une
 * dérivation vit à un seul endroit » (GA-26) est exactement la loi que ça
 * enfreindrait.
 *
 * Ce qui vit ici est la FORME de la règle, c'est-à-dire la part qui peut
 * diverger : les trois branches et leur ordre. Ce qui reste à l'appelant est la
 * syntaxe de liaison des paramètres, qui ne porte aucune décision.
 *
 * ⚠️ Les trois branches, et ce que chacune évite :
 *  1. `null` → AUCUNE clause. Le membre voit tout l'espace : c'est le défaut
 *     historique, et le chemin doit rester byte-identique à ce qu'il était.
 *  2. Liste VIDE → `IS NULL`, surtout pas une clause absente. « Il ne porte
 *     aucun périmètre » n'est pas « il voit tout » ; c'est l'erreur qui
 *     ouvrirait l'espace entier au premier membre mal configuré.
 *  3. Sinon → `IN (…) OR IS NULL`. La seconde moitié n'est pas décorative : un
 *     compte sans périmètre reste visible de qui le voyait avant, sinon tout le
 *     portefeuille historique s'évanouirait le jour du déploiement.
 */
export type BusinessUnitScopeClause = { businessUnitIds: readonly string[]; includeUnassigned: true } | null

/**
 * La clause SQL du cloisonnement, ou `null` quand il n'y a rien à filtrer.
 *
 * @param column l'expression de colonne, qualifiée par l'alias de la requête
 *   appelante (`account.business_unit_id`, `a.business_unit_id`…).
 * @param idsExpression ce qui s'écrit ENTRE LES PARENTHÈSES du `IN` — la seule
 *   part qui dépende du dialecte. `:...businessUnitIds` en QueryBuilder,
 *   `SELECT unnest($3::uuid[])` en SQL brut.
 */
export function businessUnitScopeClause(
  scope: BusinessUnitScopeClause,
  column: string,
  idsExpression: string,
): string | null {
  if (!scope) return null
  if (scope.businessUnitIds.length === 0) return `${column} IS NULL`
  return `(${column} IN (${idsExpression}) OR ${column} IS NULL)`
}
