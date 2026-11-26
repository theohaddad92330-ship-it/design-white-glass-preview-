import { CONNECTOR_ERROR_CODES, type ConnectorErrorCode } from '@bellum/contracts'

/**
 * #1660 — « ce qui casse, vu du client — pas vu du serveur », et la règle qui
 * décide ce qui compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE : UNE ERREUR DE CAPACITÉ N'EST PAS UN INCIDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Elle est attendue et gérée. Les compter ensemble noierait les vrais. »
 *
 * ⚠️ **CETTE DISTINCTION N'EXISTAIT PAS EN CODE, ET POURTANT ELLE N'EST PAS
 * INVENTÉE ICI.** Le vocabulaire, lui, existe depuis le PDF 7 : les codes de
 * `CONNECTOR_ERROR_CODES` sont une liste FERMÉE, et son docblock explique
 * qu'ils sont plusieurs « parce que chacun appelle un geste DIFFÉRENT ». Ils
 * étaient cinq quand ce fichier a été écrit ; le sixième
 * (`authorization_expired`, #1836) est né en passant par le critère ci-dessous,
 * ce qui était exactement l'usage prévu. Les gestes se rangent d'eux-mêmes en
 * deux familles, et c'est cette lecture-là qu'on fige :
 *
 *   CAPACITÉ — il manque quelque chose, et QUELQU'UN doit le poser
 *     · `not_connected`        « il n'y a rien à réparer, il y a quelque chose
 *                                à brancher »
 *     · `scope_missing`        « ne repassera JAMAIS tout seul » — il faut
 *                                reconnecter en accordant la portée
 *     · `provider_api_disabled` « une case à cocher dans une console, par
 *                                l'opérateur »
 *     · `authorization_expired` la connexion existe et elle est MORTE —
 *                                consentement retiré, jeton de rafraîchissement
 *                                disparu. Ajouté le 10/09/2026 (#1836), et rangé
 *                                ici par le critère écrit ci-dessous : le chemin
 *                                nominal n'était PAS ouvert. Le compter en
 *                                incident ferait chercher une panne pendant que
 *                                la réponse tient en un clic de l'utilisateur.
 *
 *   INCIDENT — tout est branché, autorisé, allumé, et ça n'a pas marché
 *     · `provider_unavailable` « celui-là, et lui seul, mérite réessaie »
 *     · `rate_limited`         trop de demandes d'un coup
 *
 * Le critère qui tranche, et qui a effectivement servi au sixième (#1836) :
 * **est-ce que le chemin nominal était OUVERT ?** Si la
 * configuration manquait, c'est une capacité. Si tout était en place et que le
 * fournisseur n'a pas répondu, c'est un incident.
 *
 * ⚠️ `rate_limited` a été pesé, et il est du côté INCIDENT. Il est « attendu et
 * géré » au sens où le produit continue en arrière-plan, mais il est le seul cas
 * de cette famille où le client VOIT une dégradation alors que tout est
 * correctement branché de son côté. Le ranger en capacité rendrait invisible une
 * saturation qui est, elle, de notre responsabilité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE LISTE NE CONTIENT PAS, ET IL FAUT LE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Les erreurs JavaScript du navigateur.** L'issue nomme Sentry comme
 *     source ; Sentry est branché en ÉCRITURE dans les trois services et n'a
 *     aucun lecteur — ni jeton d'API, ni client, ni organisation déclarée dans
 *     `env-reference.md`. Les lire demanderait un identifiant qu'on n'a pas.
 *  2. **Le nombre d'occurrences.** La source ne garde que la DERNIÈRE erreur par
 *     (espace, outil, capacité) : `connector_capability_probes` est un journal
 *     de preuves, pas un compteur. On publie donc le nombre d'ESPACES touchés,
 *     qui est un fait, et jamais un nombre d'erreurs qu'on aurait deviné.
 *  3. **Les 5xx par route.** Le filtre d'exceptions les journalise (Winston, donc
 *     Sentry) et n'en persiste aucune.
 *
 * Ces trois absences sont ÉCRITES à l'écran. Un tableau qui tait ce qu'il ne
 * voit pas se lit comme un tableau complet.
 */

/** Les codes qui désignent une configuration ABSENTE, pas une panne. */
export const CAPACITY_ERROR_CODES = [
  'not_connected',
  'scope_missing',
  'provider_api_disabled',
  // #1836 — le sixième code annoncé par le docblock ci-dessus, et il passe bien
  // par ici : sans cette ligne il compterait comme incident, ce qui est le
  // défaut de défaut choisi, pas un oubli à répéter.
  'authorization_expired',
] as const

/**
 * Cette erreur est-elle une erreur de CAPACITÉ ?
 *
 * ⚠️ Un code INCONNU n'est pas une capacité. Le jour où un sixième code
 * apparaît sans passer par ici, il compte comme incident : mieux vaut un faux
 * incident qu'on regarde qu'une panne qu'on classe en « attendu » sans l'avoir
 * décidé. C'est le sens de défaut de ce fichier, et il est choisi.
 */
export function isCapacityError(code: string | null | undefined): boolean {
  return typeof code === 'string' && (CAPACITY_ERROR_CODES as readonly string[]).includes(code)
}

/** Une ligne de la source : la dernière erreur d'une capacité, dans un espace. */
export type ProbeErrorRow = {
  workspaceId: string
  /** Le VERBE de capacité (`read`, `search`, `send`…), pas un nom d'éditeur. */
  capability: string
  code: string | null
  occurredAt: Date | null
}

/** Une ligne du tableau « ce qui casse, vu du client ». */
type ClientFacingError = {
  capability: string
  /** Combien d'ESPACES distincts le constatent. Un fait, jamais une estimation. */
  workspacesAffected: number
  /** La plus récente occurrence observée, en ISO. */
  lastOccurredAt: string
  /** Les causes rencontrées, vocabulaire fermé, de la plus fréquente à la moins. */
  codes: ConnectorErrorCode[]
}

export type ClientFacingErrorReport = {
  windowDays: number
  errors: ClientFacingError[]
  /**
   * Combien de lignes ont été ÉCARTÉES parce qu'elles sont des erreurs de
   * capacité. Le nombre est publié à dessein : taire l'exclusion ferait croire
   * que rien n'a été filtré, et le premier lecteur qui compare avec l'écran des
   * intégrations conclurait que le tableau ment.
   */
  capacityErrorsExcluded: number
}

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type AggregateOptions = { now: Date; windowDays: number }

/**
 * Le tableau, à partir des dernières erreurs enregistrées.
 *
 * `now` est un PARAMÈTRE : une dérivation qui lit l'horloge passe à Paris et
 * échoue sur un exécuteur CI en UTC.
 *
 * L'ordre est celui d'un écran d'incident : ce qui touche le plus d'espaces
 * d'abord, puis le plus récent. Un opérateur ouvre cet écran pour trouver la
 * panne, pas pour lire un inventaire alphabétique.
 */
export function aggregateClientFacingErrors(
  rows: readonly ProbeErrorRow[],
  options: AggregateOptions,
): ClientFacingErrorReport {
  const cutoff = options.now.getTime() - options.windowDays * 24 * 60 * 60 * 1000
  const grouped = new Map<string, { workspaces: Set<string>; lastAt: number; codes: Map<ConnectorErrorCode, number> }>()
  let capacityErrorsExcluded = 0

  for (const row of rows) {
    const at = row.occurredAt ? row.occurredAt.getTime() : Number.NaN
    if (!Number.isFinite(at) || at < cutoff) continue
    if (isCapacityError(row.code)) {
      capacityErrorsExcluded += 1
      continue
    }
    // Un code hors du vocabulaire fermé se range en `provider_unavailable` :
    // c'est ce que la source elle-même écrit par défaut, et c'est le seul repli
    // qui ne prétende rien de plus que « ça n'a pas répondu ».
    const code: ConnectorErrorCode = (CONNECTOR_ERROR_CODES as readonly string[]).includes(row.code ?? '')
      ? (row.code as ConnectorErrorCode)
      : 'provider_unavailable'

    const entry = grouped.get(row.capability) ?? { workspaces: new Set<string>(), lastAt: at, codes: new Map() }
    entry.workspaces.add(row.workspaceId)
    entry.lastAt = Math.max(entry.lastAt, at)
    entry.codes.set(code, (entry.codes.get(code) ?? 0) + 1)
    grouped.set(row.capability, entry)
  }

  const errors: ClientFacingError[] = [...grouped.entries()]
    .map(([capability, entry]) => ({
      capability,
      workspacesAffected: entry.workspaces.size,
      lastOccurredAt: new Date(entry.lastAt).toISOString(),
      codes: [...entry.codes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code]) => code),
    }))
    .sort(
      (a, b) =>
        b.workspacesAffected - a.workspacesAffected ||
        b.lastOccurredAt.localeCompare(a.lastOccurredAt) ||
        a.capability.localeCompare(b.capability),
    )

  return { windowDays: options.windowDays, errors, capacityErrorsExcluded }
}
