import { type BusinessUnitScopeClause, businessUnitScopeClause } from '../accounts/business-unit-scope.clause'

/**
 * #4158 (complément BU) — LE PÉRIMÈTRE BU DU COCKPIT D'ÉQUIPE.
 *
 * `GET /manager/team-stats` ne portait AUCUN périmètre : un `team:manage` cloisonné à une BU lisait,
 * dans « non attribués », « doublons de couverture », « actions partagées » et « activité récente »,
 * les raisons sociales des comptes des AUTRES BU (trou trouvé par L5, complété à l'intégration).
 *
 * La RÈGLE vit dans `accounts/business-unit-scope.clause.ts` (GA-26) — ce fichier ne la réécrit pas, il
 * fournit seulement la liste d'identifiants que cette clause attend dans SQL brut. Les identifiants
 * viennent de `BusinessUnitService.scopeFor` (colonne `uuid`) ; ils sont VALIDÉS avant d'être écrits dans
 * la requête, jamais concaténés tels quels.
 *
 * Sans cloisonnement (`null`, le cas de presque tout le monde) : chaîne vide, requête byte-identique.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function idList(scope: NonNullable<BusinessUnitScopeClause>): string {
  return scope.businessUnitIds
    .map(id => {
      // Un identifiant qui n'est pas un UUID ne s'écrit JAMAIS dans la requête : on refuse (fail-closed).
      if (!UUID.test(id)) throw new Error('manager_bu_scope_invalid_id')
      return `'${id}'::uuid`
    })
    .join(', ')
}

/** ` AND (<colonne> dans le périmètre OU sans BU)` pour une colonne `business_unit_id` de `accounts`. */
export function accountScopeAnd(scope: BusinessUnitScopeClause, column: string): string {
  if (!scope) return ''
  const clause = businessUnitScopeClause(scope, column, idList(scope))
  return clause ? ` AND ${clause}` : ''
}

/**
 * ` AND (<référence de compte> est NULL OU pointe un compte du périmètre)` — pour une table qui porte
 * un `account_id` NULLABLE (`user_actions`, `contacts`) : une ligne sans compte ne nomme aucun compte et reste.
 * ⚠️ La sous-requête borne l'ESPACE avec `$1` : tout appelant du cockpit passe `workspaceId` en premier
 * paramètre (GA-46 — une lecture de `accounts` est toujours bornée par l'espace).
 */
export function accountRefScopeAnd(scope: BusinessUnitScopeClause, accountIdColumn: string): string {
  if (!scope) return ''
  const clause = businessUnitScopeClause(scope, 'scoped_account.business_unit_id', idList(scope))
  if (!clause) return ''
  return ` AND (${accountIdColumn} IS NULL OR ${accountIdColumn} IN (SELECT scoped_account.id FROM accounts scoped_account WHERE scoped_account.workspace_id = $1 AND ${clause}))`
}
