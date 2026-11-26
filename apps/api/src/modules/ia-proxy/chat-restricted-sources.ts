import { toolFamilyValues, type ConnectedTool, type ToolFamily } from '@bellum/contracts'

/**
 * #3775.2b — « marquer côté serveur les messages issus d'une source à accès
 * restreint, et le dire sur Partager. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'« ACCÈS RESTREINT » VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Une connexion PERSONNELLE (`ConnectedTool.owner === 'user'`, `tool-registry.ts`)
 * — jamais visible par un autre membre de l'espace (PDF 7, BEL-INT-604 ; voir
 * `common/util/personal-connection.ts` : « une boîte mail est personnelle, un
 * CRM est d'espace »). Un collègue qui ouvre un fil partagé peut donc lire un
 * extrait tiré d'une boîte mail qu'il ne peut pas lui-même ouvrir — c'est
 * exactement l'écart que le ticket nomme : « Partager un lien ne partage pas
 * les identifiants d'un connecteur ; un extrait sensible déjà écrit n'est pas
 * protégé par la fermeture de sa source. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAR FAMILLE, PAS PAR FOURNISSEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * Une source citée (`context.sources[].kind`) ne porte que sa NATURE (« email »,
 * « crm »…), jamais l'identifiant du connecteur consulté — `apps/ia` ne le
 * relaie pas plus loin. On ne devine pas LEQUEL des outils de cette famille a
 * été lu : si l'APPELANT a au moins une connexion personnelle dans cette
 * famille, la source en cause EST POTENTIELLEMENT la sienne, et le risque
 * (un extrait personnel lu par un collègue) pèse plus qu'un faux positif
 * (une source en fait tirée d'un CRM d'espace du même nom de famille).
 */

/** Les familles pour lesquelles l'appelant n'a qu'une connexion PERSONNELLE. */
export function restrictedToolFamilies(tools: readonly ConnectedTool[]): ReadonlySet<ToolFamily> {
  const families = new Set<ToolFamily>()
  for (const tool of tools) {
    if (tool.owner === 'user' && (toolFamilyValues as readonly string[]).includes(tool.family)) {
      families.add(tool.family)
    }
  }
  return families
}

/**
 * Pose `restricted: true` sur chaque source dont la nature (`kind`) tombe
 * dans une famille personnelle de l'appelant — jamais `restricted: false` :
 * une source qui n'y tombe pas en reste simplement DÉPOURVUE (#GA-18/19, une
 * absence ne s'affiche jamais « 0 »/« non »).
 *
 * `context` voyage BRUT (`z.unknown()`, posé par `apps/ia`) jusqu'à ce point :
 * cette fonction ne devine aucune forme qu'elle ne reconnaît pas — rendue
 * telle quelle, c'est `persistedChatContext` qui décidera ensuite de ce qui
 * survit à l'écriture.
 */
export function markRestrictedSources(context: unknown, restrictedFamilies: ReadonlySet<ToolFamily>): unknown {
  if (restrictedFamilies.size === 0) return context
  if (typeof context !== 'object' || context === null) return context
  const sources = (context as { sources?: unknown }).sources
  if (!Array.isArray(sources)) return context
  let changed = false
  const marked = sources.map(source => {
    if (typeof source !== 'object' || source === null) return source
    const kind = (source as { kind?: unknown }).kind
    if (typeof kind !== 'string' || !restrictedFamilies.has(kind as ToolFamily)) return source
    changed = true
    return { ...source, restricted: true }
  })
  return changed ? { ...context, sources: marked } : context
}
