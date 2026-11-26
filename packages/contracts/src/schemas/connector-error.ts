import { z } from 'zod'

/**
 * L'échec d'une lecture de connecteur, dit d'une seule façon.
 *
 * Le PDF 7 tient en une phrase : « une erreur se remarque, une liste vide se
 * croit ». Sa conséquence technique est ce fichier.
 *
 * Le 16/08/2026, trois pannes de production ont eu la même cause : le statut
 * disait « connecté » et la donnée ne venait pas. Le correctif d'alors (PR #936)
 * a posé des messages honnêtes, mais **module par module** : `files_scope_missing`
 * chez Microsoft, `crm_missing_scope` chez HubSpot, `agenda_provider_api_disabled`
 * chez l'agenda, rien du tout chez Google Drive. Trois vocabulaires, aucun ne
 * nommant la portée manquante, et — le plus coûteux — tous portés par un champ
 * `reason` que le client ne lit pas : `api-error.ts` n'a jamais lu que `code`.
 * Le correctif était donc invisible à l'écran.
 *
 * Une liste FERMÉE — cinq codes à l'origine, six depuis #1836 — parce que
 * chacun appelle un geste DIFFÉRENT :
 *
 *  - `not_connected` — il n'y a rien à réparer, il y a quelque chose à brancher.
 *  - `scope_missing` — ne repassera JAMAIS tout seul. Un jeton OAuth ne gagne
 *    pas une portée après coup : il faut reconnecter. Dire « réessaie dans un
 *    moment » ici est un mensonge qui coûte une journée.
 *  - `provider_api_disabled` — l'API est éteinte côté projet du fournisseur.
 *    Ni une panne ni une portée : une case à cocher dans une console, par
 *    l'opérateur. C'est la panne n°1 du 16/08 (Google Calendar).
 *  - `provider_unavailable` — le fournisseur ne répond pas. Celui-là, et lui
 *    seul, mérite « réessaie ».
 *  - `rate_limited` — trop de demandes. On continue en arrière-plan.
 *  - `authorization_expired` — la connexion EXISTE et elle est morte : le
 *    consentement a été retiré, le mot de passe a changé, l'application a été
 *    désinstallée, ou le jeton de rafraîchissement a disparu. Ajouté le
 *    10/09/2026 (#1836), EN FIN de liste — GA-08 interdit d'insérer au milieu.
 *
 *    ⚠️ Il ne se confond avec aucun des cinq, et c'est pour ça qu'il existe.
 *    `not_connected` dirait « il y a quelque chose à brancher » alors que
 *    l'écran Intégrations montre la ligne connectée — le mensonge exact du
 *    16/08. `scope_missing` NOMMERAIT des portées, et en inventer pour un
 *    consentement retiré envoie déclarer chez le fournisseur ce qui y est déjà.
 *    `provider_unavailable` dirait « réessaie dans un moment » devant quelque
 *    chose qui ne repassera JAMAIS sans l'utilisateur : c'est le défaut mesuré
 *    sur `/pilotage`, où un 503 nu se lisait « le produit est cassé ».
 *
 *    Le mot n'est pas neuf non plus : `capabilityStateValues` et les routines
 *    l'emploient déjà pour cette situation exacte. Deux vocabulaires pour une
 *    question sont le défaut que ce fichier a été écrit pour clore.
 *
 * `scopes` est le point qui distingue ce contrat de ce qu'il remplace : la
 * portée est NOMMÉE. « Il me manque l'accès aux fichiers » n'apprend rien à
 * l'opérateur qui doit la déclarer chez le fournisseur ; « il me manque
 * `Files.Read.All` » lui dit exactement quoi cocher.
 */
export const CONNECTOR_ERROR_CODES = [
  'not_connected',
  'scope_missing',
  'provider_api_disabled',
  'provider_unavailable',
  'rate_limited',
  // #1836 — en FIN de liste, jamais au milieu (GA-08).
  'authorization_expired',
] as const
export const connectorErrorCodeSchema = z.enum(CONNECTOR_ERROR_CODES)
export type ConnectorErrorCode = z.infer<typeof connectorErrorCodeSchema>

/**
 * Le corps d'erreur qu'un connecteur rend, quel que soit le connecteur.
 *
 * `code` ET `reason` portent la même valeur. Ce n'est pas une redondance
 * d'inattention : `code` est ce que le navigateur lit (`api-error.ts`), `reason`
 * est ce que les journaux et les alertes lisent depuis PR #936. Les faire
 * diverger recréerait exactement le trou qu'on vient de boucher.
 */
export const connectorErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string().min(1),
  code: connectorErrorCodeSchema,
  /** Miroir de `code` — voir le commentaire ci-dessus. */
  reason: connectorErrorCodeSchema,
  /** Le connecteur concerné (`google`, `microsoft`, `hubspot`…). */
  provider: z.string().min(1),
  /** La capacité qui a échoué (`documents`, `mail`, `calendar`…), quand elle est connue. */
  capability: z.string().min(1).nullable(),
  /**
   * Les portées manquantes, NOMMÉES telles que le fournisseur les écrit.
   * Vide pour tout code autre que `scope_missing` — on n'invente pas une portée
   * pour une panne réseau.
   */
  scopes: z.array(z.string()),
  /** Le message montré à l'utilisateur, en français (repli si le client ne traduit pas). */
  message: z.string().min(1),
})
export type ConnectorErrorBody = z.infer<typeof connectorErrorSchema>

/** Le code HTTP qu'un code d'erreur entraîne. Seul le débit sort du 503. */
export function connectorErrorStatus(code: ConnectorErrorCode): 429 | 503 {
  return code === 'rate_limited' ? 429 : 503
}

/**
 * Le geste à faire, en une phrase, par code.
 *
 * Le PDF exige que `exact_action` « dise le geste, pas un code ». Ces phrases
 * sont le repli serveur ; le web les retraduit depuis `code` + `scopes`, ce qui
 * est la seule façon de les servir aussi en anglais.
 */
export function connectorErrorAction(code: ConnectorErrorCode, scopes: readonly string[] = []): string {
  switch (code) {
    case 'not_connected':
      return 'Connecte cet outil depuis Intégrations.'
    case 'scope_missing':
      return scopes.length > 0
        ? `Reconnecte cet outil en accordant ${scopes.join(', ')} — un accès déjà donné ne s’élargit pas tout seul.`
        : 'Reconnecte cet outil : un accès déjà donné ne s’élargit pas tout seul.'
    case 'provider_api_disabled':
      return 'L’accès est éteint côté fournisseur. Il faut l’activer là-bas avant que la lecture reprenne.'
    case 'provider_unavailable':
      return 'Rien n’est perdu : réessaie dans un moment.'
    case 'rate_limited':
      return 'Trop de demandes d’un coup. Je continue en arrière-plan.'
    // #1836 — la connexion existe et elle est morte : le geste est « reconnecte »,
    // et il est le SEUL qui répare. « Réessaie » ne réparait rien.
    case 'authorization_expired':
      return 'Reconnecte-le depuis Intégrations : une autorisation expirée ne se renouvelle pas toute seule.'
  }
}

/**
 * Une recherche de connecteur qui a RÉELLEMENT eu lieu.
 *
 * `searched: true` est le champ qui coûte le moins et rapporte le plus de tout
 * ce chantier. Un tableau vide ne dit pas s'il n'y avait rien ou si on n'avait
 * pas le droit de regarder ; ce drapeau tranche, et `scanned` donne la phrase
 * que l'écran affiche (« j'ai cherché dans 1 240 fichiers »).
 *
 * `scanned` vaut `null` quand le fournisseur ne dit pas combien il a parcouru —
 * ce qui est le cas de la plupart. Inventer un nombre serait pire que ne rien
 * dire : quelqu'un finirait par s'en servir pour conclure que sa base est vide.
 */
export function connectorSearchResultSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    /** Toujours `true` : une réponse 200 signifie que la recherche est partie. */
    searched: z.literal(true),
    /** Nombre d'objets réellement parcourus, ou `null` quand le fournisseur ne le dit pas. */
    scanned: z.number().int().nonnegative().nullable(),
  })
}

/** La forme d'une recherche de connecteur, côté TypeScript. */
export type ConnectorSearchResult<T> = {
  items: T[]
  searched: true
  scanned: number | null
}

/**
 * Enveloppe une liste de résultats en réponse QUALIFIÉE.
 *
 * À employer partout où un connecteur cherche. Le coût est d'un mot ; le
 * bénéfice est qu'un zéro résultat cesse d'être indiscernable d'un refus.
 */
export function connectorSearchResult<T>(items: T[], scanned: number | null = null): ConnectorSearchResult<T> {
  return { items, searched: true, scanned }
}
