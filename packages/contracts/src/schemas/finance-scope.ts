import { z } from 'zod'

/**
 * QUI regarde ces chiffres, et sur quel périmètre (D1 · 26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six lectures financières étaient sous `finance:read`, que ni `sales` ni
 * `sales_ops` ne portent : un commercial ne pouvait pas voir le chiffre
 * d'affaires qu'il a lui-même produit. Lui donner `finance:read` aurait ouvert,
 * du même geste, la marge de ses collègues et le coût chargé des consultants —
 * qui relève de la paie.
 *
 * D'où une permission séparée, `finance:read:own`, et une PORTÉE qui
 * l'accompagne. Sans la portée, la permission serait un renommage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'EST « MON » PÉRIMÈTRE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Une mission est dans mon périmètre si **je la porte** (`missions.owner_id`)
 * OU si **le compte m'est attribué** (`accounts.assigned_to`).
 *
 * Les deux, et pas un seul : une mission créée depuis un projet gagné n'a
 * souvent aucun propriétaire, et le commercial qui a vendu le compte doit voir
 * ce qu'elle rapporte ; à l'inverse, une mission qui m'est confiée sur le compte
 * d'un collègue reste la mienne — c'est moi qui la délivre.
 *
 * ⚠️ Une mission que **personne** ne porte, sur un compte attribué à personne,
 * est **hors de tout périmètre**. Elle n'entre dans le total de personne — et
 * c'est exactement ce qui rend cette portée dangereuse si on la tait : sur un
 * espace où rien n'est attribué, un commercial verrait « 0 € », ce qui se lit
 * « je n'ai rien vendu » alors que la vérité est « rien ne m'est rattaché ».
 *
 * Elle est donc COMPTÉE et NOMMÉE ({@link FinanceScopeInfo.outsideAnyPortfolio}),
 * comme les lignes sans montant le sont déjà.
 */
export const FINANCE_SCOPE_KINDS = ['workspace', 'own'] as const
export const financeScopeKindSchema = z.enum(FINANCE_SCOPE_KINDS)
export type FinanceScopeKind = (typeof FINANCE_SCOPE_KINDS)[number]

/** Ce que l'écran reçoit pour savoir ce qu'il montre. */
export const financeScopeInfoSchema = z.object({
  kind: financeScopeKindSchema,
  /**
   * Missions rattachées à personne — ni propriétaire, ni compte attribué.
   *
   * `null` sur la portée « espace » : là, il n'y a rien hors périmètre, et
   * afficher « 0 hors périmètre » serait du bruit permanent.
   */
  outsideAnyPortfolio: z.number().int().nonnegative().nullable(),
})
export type FinanceScopeInfo = z.infer<typeof financeScopeInfoSchema>

/**
 * La portée résolue côté serveur. `userId` n'est présent que sur `own`.
 *
 * Le type est une UNION et non un objet à champ facultatif : un `userId`
 * oublié sur une portée `own` rendrait le chiffre de l'espace entier à
 * quelqu'un qui n'y a pas droit, et le compilateur ne dirait rien.
 */
export type FinanceScope =
  | { kind: 'workspace'; workspaceId: string }
  | { kind: 'own'; workspaceId: string; userId: string }

/**
 * La clause SQL qui restreint une requête à un périmètre, et ses paramètres.
 *
 * PURE, et unique : les QUATRE lectures qui savent restreindre l'appellent
 * toutes, à travers dix requêtes. Recopier la condition dans dix endroits
 * garantirait qu'un des dix l'oublie — et l'oubli serait invisible, parce
 * qu'une portée trop LARGE rend simplement un chiffre plus gros, qui a l'air
 * juste. ⚠️ Ce n'est pas théorique : la ligne « espéré » du prévisionnel
 * portait sa propre condition, écrite à la main, et elle avait perdu le volet
 * `owner_id` — un projet porté sur le compte d'un collègue sortait du
 * prévisionnel (corrigé le 28/08/2026).
 *
 * ⚠️ Ce paragraphe disait « les SIX lectures financières l'appellent toutes ».
 * C'était faux dans les deux sens : trois des sept routes financières ne
 * l'appellent pas et ne doivent pas (la capacité décrit l'ÉQUIPE, la marge par
 * canal compare les canaux de l'ESPACE, le délai de paiement est une médiane à
 * plancher d'observations), et les quatre autres l'appellent depuis dix
 * requêtes, pas six. Corrigé le 28/08/2026 — un décompte faux dans une doctrine
 * se recopie.
 *
 * `missionAlias` est l'alias de la table portant `owner_id` et `account_id`
 * dans la requête appelante — `missions` la plupart du temps, `opportunities`
 * pour la ligne « espéré » du prévisionnel, qui porte les deux mêmes colonnes.
 * `nextParam` est l'index du prochain paramètre libre (`$3` si la requête en
 * utilise déjà deux) — le SQL du dépôt est en paramètres positionnels.
 */
export function financeScopeClause(
  scope: FinanceScope,
  missionAlias: string,
  nextParam: number,
): { sql: string; params: string[] } {
  if (scope.kind === 'workspace') return { sql: '', params: [] }
  return {
    // `EXISTS` et non une jointure : une jointure sur `accounts` dupliquerait
    // les lignes si un compte apparaissait deux fois, et un SUM dupliqué est un
    // chiffre d'affaires faux.
    sql:
      ` AND (${missionAlias}.owner_id = $${nextParam}::uuid` +
      ` OR EXISTS (SELECT 1 FROM accounts a WHERE a.id = ${missionAlias}.account_id AND a.assigned_to = $${nextParam}::uuid))`,
    params: [scope.userId],
  }
}

/**
 * Combien de missions ne sont dans le périmètre de PERSONNE.
 *
 * Requête séparée et non un `FILTER` ajouté aux six autres : le nombre est le
 * même pour toutes, et le calculer six fois ferait six occasions de diverger.
 */
export const UNASSIGNED_MISSIONS_SQL = `
  SELECT COUNT(*)::text AS count
    FROM missions m
   WHERE m.workspace_id = $1
     AND m.owner_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM accounts a WHERE a.id = m.account_id AND a.assigned_to IS NOT NULL
     )`
