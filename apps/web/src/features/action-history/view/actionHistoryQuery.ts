import {
  actionChannelSchema,
  actionHistoryCategorySchema,
  type ActionHistoryCategory,
  type ActionHistoryQuery,
} from '@bellum/contracts'
import type { ActiveFilter } from '@bellum/ui'
import { isActionHistoryTabKey, type ActionHistoryTabKey } from './actionHistoryPresentation'

export const PAGE_SIZE = 25

/** Les paramètres d'URL de `/actions` — la seule source de vérité des filtres :
 *  un journal filtré doit rester partageable par simple copie du lien. Non
 *  exporté : les appelants passent l'objet `search` du routeur. */
type ActionHistorySearch = {
  category?: ActionHistoryTabKey
  type?: ActionHistoryCategory
  status?: string
  period?: ActionHistoryQuery['period']
  account?: string
  member?: string
  // #2200.38 — canal (LinkedIn, e-mail, téléphone, RDV, autre) : la donnée
  // arrive déjà sur chaque ligne, seul le filtre manquait.
  channel?: ActionHistoryQuery['channel']
}

export function buildActiveFilters(search: ActionHistorySearch): ActiveFilter[] {
  const filters: ActiveFilter[] = []
  // Le rang d'onglets de catégorie (§L4, 30/08/2026) est retiré de l'écran : un
  // lien partagé avant ce retrait (`?category=analysis`) doit continuer à
  // filtrer ET à se voir — la chip « type » reprend ce rôle. `all`/`since` sont
  // des modes transversaux, jamais une catégorie. Une chip « type » explicite
  // garde la priorité.
  const type = search.type ?? (isActionHistoryCategory(search.category) ? search.category : undefined)
  if (type) filters.push({ id: 'type', value: type })
  if (search.status) filters.push({ id: 'status', value: search.status })
  if (search.period) filters.push({ id: 'period', value: search.period })
  if (search.account?.trim()) filters.push({ id: 'account', value: search.account })
  if (search.member) filters.push({ id: 'member', value: search.member })
  if (search.channel) filters.push({ id: 'channel', value: search.channel })
  return filters
}

export function buildHistoryQuery(category: ActionHistoryTabKey, filters: ActiveFilter[]): ActionHistoryQuery {
  const map = new Map(filters.map(filter => [filter.id, filter.value]))
  const account = map.get('account')?.trim()
  return {
    type: readCategoryFilter(category, map.get('type')),
    status: map.get('status'),
    period: readPeriodFilter(map.get('period')),
    // Recherche libre côté serveur (`ILIKE` sur le nom du compte) : le commercial
    // tape « decathlon », pas un UUID qu'il n'a aucun moyen de connaître.
    ...(account ? { account } : {}),
    // Le membre est l'AUTEUR de l'action — l'id vient de la liste des membres de
    // l'espace, jamais d'une saisie libre.
    ...(map.get('member') ? { actorId: map.get('member') } : {}),
    channel: readChannelFilter(map.get('channel')),
    limit: PAGE_SIZE,
  }
}

/**
 * Traduit l'état complet des chips en patch d'URL. Toute clé absente des chips
 * est explicitement remise à `undefined` : sans ça, retirer une chip laissait le
 * paramètre dans l'URL et le filtre continuait de s'appliquer au rechargement.
 */
export function searchPatchFromFilters(filters: ActiveFilter[]): ActionHistorySearch {
  const map = new Map(filters.map(filter => [filter.id, filter.value]))
  const account = map.get('account')?.trim()
  return {
    period: readPeriodFilter(map.get('period')),
    status: map.get('status') || undefined,
    type: asActionHistoryCategory(map.get('type')),
    account: account || undefined,
    member: map.get('member') || undefined,
    channel: readChannelFilter(map.get('channel')),
  }
}

function asActionHistoryCategory(value: string | undefined): ActionHistoryCategory | undefined {
  const parsed = actionHistoryCategorySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function readCategoryFilter(
  category: ActionHistoryTabKey,
  filterValue: string | undefined,
): ActionHistoryCategory | undefined {
  // Les onglets transversaux (`all`, `since`) ne portent pas de type : c'est la
  // chip « type » qui décide. Un onglet-catégorie prime, lui, sur la chip.
  if (category === 'all' || category === 'since') {
    return isActionHistoryCategory(filterValue) ? filterValue : undefined
  }
  return category
}

function isActionHistoryCategory(value: string | undefined): value is ActionHistoryCategory {
  // `all` et `since` sont des onglets, jamais des types d'action serveur : les
  // exclure évite d'envoyer un `type=since` que le contrat serveur rejetterait.
  return Boolean(value && value !== 'all' && value !== 'since' && isActionHistoryTabKey(value))
}

// #2200.38 — un canal inconnu (URL bricolée, valeur périmée) n'est jamais
// envoyé au serveur plutôt que de risquer un 400 sur toute la page.
function readChannelFilter(value: string | undefined): ActionHistoryQuery['channel'] {
  const parsed = actionChannelSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

function readPeriodFilter(value: string | undefined): ActionHistoryQuery['period'] {
  // Period is an optional, user-added filter chip. With no chip selected we send
  // no date window so the full history shows — defaulting to '7d' here silently
  // hid every action older than a week (and made the page look empty).
  if (value === '7d' || value === '30d' || value === '90d') return value
  return undefined
}
