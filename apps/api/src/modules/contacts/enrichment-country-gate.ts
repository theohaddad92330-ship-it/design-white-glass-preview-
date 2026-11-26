/**
 * #2297.16 — un pays non vérifié ou non couvert par la cascade d'enrichissement
 * ne doit jamais déclencher un appel fournisseur payant. `ENRICHMENT_ALLOWED_COUNTRIES`
 * (API, optionnelle, `agent_docs/env-reference.md`) porte la liste blanche de
 * codes pays (`account.registry_country`), séparés par des virgules — même
 * forme que `SMS_ALLOWED_COUNTRY_CODES` (`notifications/sms/sms-sender.ts`).
 *
 * Sans clé = no-op STRICT (doctrine CLAUDE.md) : la garde reste OUVERTE,
 * chemin byte-identique à avant elle — aucun compte existant (la plupart n'ont
 * jamais résolu de `registry_country`) ne se retrouve bloqué par un réglage
 * que personne n'a posé.
 */

/** `null` = réglage absent ou vide, la garde ne se pose pas. */
export function resolveAllowedEnrichmentCountries(raw: string | undefined): readonly string[] | null {
  const value = (raw ?? '').trim()
  if (!value) return null
  const codes = value
    .split(',')
    .map(code => code.trim().toUpperCase())
    .filter(Boolean)
  return codes.length > 0 ? codes : null
}

/**
 * `allowed === null` : la garde n'est pas posée — toujours vrai (no-op strict).
 * Posée, un pays absent (compte jamais résolu par un registre) ou hors liste
 * est refusé : « vérifié » et « compatible » sont la MÊME question ici, comme
 * l'exige #2297.16 — on ne devine jamais un pays pour laisser passer l'appel.
 */
export function isEnrichmentCountryAllowed(
  registryCountry: string | null | undefined,
  allowed: readonly string[] | null,
): boolean {
  if (allowed === null) return true
  const country = (registryCountry ?? '').trim().toUpperCase()
  if (!country) return false
  return allowed.includes(country)
}
