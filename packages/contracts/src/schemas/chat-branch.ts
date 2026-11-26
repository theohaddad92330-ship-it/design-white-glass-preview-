/**
 * #1953.11 / #1953.22 — LA PROVENANCE D'UNE BRANCHE DE CONVERSATION, PERSISTÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 16/09/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * « Modifier ma demande » étiquetait bien la réponse abandonnée — « Réponse
 * remplacée à 15:05 — conservée pour mémoire » — et rejouait la demande à la
 * suite. Après un RECHARGEMENT COMPLET de la page, zéro élément du DOM ne
 * portait plus « remplac » : les deux échanges se retrouvaient côte à côte,
 * sans rien qui dise que le second est une réédition du premier.
 *
 * La cause : `supersededAt`, `branchOf` et `dataOrigin` ne vivaient que dans
 * l'état React de `Chat.tsx`. La provenance était un état de SESSION, pas une
 * donnée — et « on archive, on ne supprime pas » ne tient pas si ce qu'on
 * archive perd, au rechargement, la seule marque qui disait qu'il a été
 * remplacé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA NATURE DE LA BRANCHE VIT ICI ET PAS DANS `apps/web`
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle voyage désormais du navigateur vers une colonne contrainte
 * (`chat_messages.branch_kind`, migration `ChatMessageBranchProvenance`) : sa
 * liste est lue par la contrainte SQL, par le schéma du corps HTTP et par
 * l'écran. Un réglage vit à UN seul endroit (GA-26), et une valeur qui voyage
 * du code vers la base voit sa contrainte élargie AVANT le code qui l'écrit
 * (GA-11 / GA-12) — la garde `check-constraints-cover-enums.spec.ts` fait le
 * rapprochement par le nom `chat_messages_branch_kind_check`.
 */

/**
 * Les trois manières de repartir d'une réponse, et rien d'autre :
 *  · `retry` — la MÊME question, verbatim ;
 *  · `angle` — la même question, plus la demande explicite d'un autre angle ;
 *  · `edit`  — la question rechargée dans la saisie, puis corrigée.
 *
 * ⚠️ Additive seulement (GA-08) : une valeur écrite en base ne se retire ni ne
 * se renomme — une ligne déjà écrite deviendrait illisible.
 */
export const CHAT_BRANCH_KINDS = ['retry', 'angle', 'edit'] as const

export type ChatBranchKind = (typeof CHAT_BRANCH_KINDS)[number]

/** Vrai pour une nature de branche connue — jamais une valeur devinée. */
export function isChatBranchKind(value: unknown): value is ChatBranchKind {
  return typeof value === 'string' && (CHAT_BRANCH_KINDS as readonly string[]).includes(value)
}
