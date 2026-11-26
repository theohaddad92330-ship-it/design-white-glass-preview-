import { CRM_PROVIDER_READ_SCOPE, type CrmProvider } from './crm-adapter.js'
import { CRM_FIRST_IMPORT_OBJECTS } from './crm-first-import.js'

/**
 * #4290.18 — le contrat entre les objets d'un CRM tiers et les nôtres : ce qu'une REPRISE alimente, famille par
 * famille. Une reprise ne dit jamais « tout importé » (#4051) : chaque famille est reprise, ou NOMMÉE non reprise
 * avec sa raison. Prérequis Exteam (onboarding 19/10) : son Zoho porte comptes, contacts ET besoins ; aucun ne doit
 * se perdre en silence.
 *
 * `needs` (les besoins clients) : aucun CRM ne les relit — le nom de leur module est propre à chaque client (module
 * personnalisé chez Zoho) et un contrat d'API non vérifiable ne se devine pas. Ils passent par un fichier
 * (l'import universel connaît le type `need`).
 *
 * Ce qui est LU vient de `CRM_PROVIDER_READ_SCOPE` et de rien d'autre (garde GA-26) : ce fichier ne déclare aucun
 * périmètre, il le relit.
 */
export const CRM_IMPORT_FAMILIES = [...CRM_FIRST_IMPORT_OBJECTS, 'needs'] as const
type CrmImportFamily = (typeof CRM_IMPORT_FAMILIES)[number]

/**
 * `not_in_read_scope` : le CRM l'expose peut-être, la lecture ne la demande pas ;
 * `file_only` : aucune lecture de CRM ne la porte — elle s'importe par fichier.
 */
const CRM_IMPORT_UNREAD_REASONS = ['not_in_read_scope', 'file_only'] as const
type CrmImportUnreadReason = (typeof CRM_IMPORT_UNREAD_REASONS)[number]

type CrmImportFamilyCoverage =
  | { family: CrmImportFamily; read: true }
  | { family: CrmImportFamily; read: false; reason: CrmImportUnreadReason }

export function crmImportCoverage(provider: CrmProvider): CrmImportFamilyCoverage[] {
  const scope: readonly string[] = CRM_PROVIDER_READ_SCOPE[provider]
  return CRM_IMPORT_FAMILIES.map(family => {
    if (family === 'needs') return { family, read: false, reason: 'file_only' }
    if (scope.includes(family)) return { family, read: true }
    return { family, read: false, reason: 'not_in_read_scope' }
  })
}

/**
 * Les familles qu'une reprise de `provider` NE reprend PAS, à dire sous son bilan. Les propriétaires n'y figurent
 * pas : ils attribuent des fiches, ils n'en sont pas une famille (même règle que la note de lecture des Intégrations).
 */
export function crmImportUnread(
  provider: CrmProvider,
): Array<{ family: CrmImportFamily; reason: CrmImportUnreadReason }> {
  return crmImportCoverage(provider).flatMap(entry =>
    entry.read || entry.family === 'owners' ? [] : [{ family: entry.family, reason: entry.reason }],
  )
}
