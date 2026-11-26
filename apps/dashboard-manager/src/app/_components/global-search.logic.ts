/**
 * #1673.6 — LA logique de la recherche globale (⌘K). Aucun appel réseau ni DOM
 * ici : les cinq sources sont des fonctions INJECTÉES (`SearchFetchers`), câblées
 * côté serveur dans `layout.tsx` (une Server Action, sur les endpoints
 * `lib/admin.ts` / `lib/monitoring.ts` que le manager appelle déjà — jamais un
 * nouvel endpoint sous `app/api/**`, hors du périmètre de ce lot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX INTERDITS DE L'ISSUE, TENUS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. « Un email tapé en entier va DIRECTEMENT à la fiche utilisateur » —
 *     `runGlobalSearch` court-circuite la recherche générale dès que
 *     `isCompleteEmail` est vraie ET qu'un utilisateur existe à cette adresse :
 *     l'email n'est alors JAMAIS rendu dans une liste (masqué ou non), il
 *     n'existe que comme destination de navigation.
 *  2. « Aucune recherche dans le CONTENU des espaces clients » — le type
 *     `SearchFetchers` N'A que cinq champs : utilisateurs, espaces, analyses,
 *     factures, pages. Cette fonction ne reçoit jamais un accès direct à une
 *     table ou à un document ; elle ne peut composer que sur ce que ces cinq
 *     fonctions choisissent de lui rendre. Le test de l'issue («chercher un mot
 *     du contenu d'un compte rend 0 résultat ») est dans
 *     `global-search.logic.test.ts`.
 */

export type SearchCategory = 'users' | 'workspaces' | 'analyses' | 'invoices' | 'pages'

export type SearchHit = {
  id: string
  title: string
  subtitle?: string
  href: string
  category: SearchCategory
}

type SearchGroup = { category: SearchCategory; hits: SearchHit[] }

export const SEARCH_MIN_LENGTH = 2
export const MAX_PER_GROUP = 3

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Un email syntaxiquement COMPLET — pas un fragment en cours de frappe. */
export function isCompleteEmail(query: string): boolean {
  return EMAIL_RE.test(query.trim())
}

/** Un identifiant d'analyse (UUID) tapé en entier — cherché en plus du nom
 *  d'entreprise, jamais à sa place. */
export function looksLikeIdentifier(query: string): boolean {
  return UUID_RE.test(query.trim())
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const CATEGORY_ORDER: SearchCategory[] = ['users', 'workspaces', 'analyses', 'invoices', 'pages']

/** Groupe par catégorie dans un ordre FIXE, et plafonne chaque groupe à 3
 *  (#1673.6). Un groupe vide n'est pas affiché. */
export function groupResults(hits: SearchHit[]): SearchGroup[] {
  return CATEGORY_ORDER.map(category => ({
    category,
    hits: hits.filter(h => h.category === category).slice(0, MAX_PER_GROUP),
  })).filter(group => group.hits.length > 0)
}

type NavItemLike = { href: string; label: string }
type NavSectionLike = { id: string; label: string; items: NavItemLike[] }

/** Pages : recherche LOCALE sur les libellés du rail — aucun appel réseau. */
export function searchPagesLocal(query: string, sections: NavSectionLike[], extra: NavItemLike[] = []): SearchHit[] {
  const q = normalize(query)
  const items = [...extra, ...sections.flatMap(s => s.items)]
  return items
    .filter(item => normalize(item.label).includes(q))
    .map(item => ({ id: item.href, title: item.label, href: item.href, category: 'pages' as const }))
}

type InvoiceSearchSource = {
  workspaceId: string
  workspaceName: string
  invoices: { id: string; reference: string | null }[]
}

/** Factures : sur le NUMÉRO déjà chargé par `fetchManualClients()` — jamais le
 *  contenu d'un compte client.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #1673.4b — AUCUNE ROUTE DE DÉTAIL DE FACTURE N'EXISTE dans le manager, et
 * ce lot n'en crée pas une (le moins cher qui règle le plus). Le résultat
 * mène donc à `/revenus/clients` PRÉ-FILTRÉE sur l'espace qui a émis la
 * facture — le seul filtre déjà câblé côté serveur là-bas (`?search=` matche
 * `w.name`, `revenus/clients/page.tsx:52`). Et le sous-titre le DIT, avant le
 * clic : cette destination est la liste du CLIENT, pas une fiche de LA
 * facture — l'opérateur ne doit pas croire qu'un clic ouvre un document qui
 * n'existe pas.
 */
export function searchInvoicesLocal(query: string, clients: InvoiceSearchSource[]): SearchHit[] {
  const q = normalize(query)
  const hits: SearchHit[] = []
  for (const client of clients) {
    for (const invoice of client.invoices) {
      if (!invoice.reference || !normalize(invoice.reference).includes(q)) continue
      hits.push({
        id: invoice.id,
        title: invoice.reference,
        subtitle: `${client.workspaceName} · pas de fiche facture — ouvre la liste clients filtrée sur cet espace`,
        category: 'invoices',
        href: `/revenus/clients?search=${encodeURIComponent(client.workspaceName)}`,
      })
    }
  }
  return hits
}

export type SearchFetchers = {
  searchUsers: (query: string) => Promise<SearchHit[]>
  searchWorkspaces: (query: string) => Promise<SearchHit[]>
  searchAnalyses: (query: string) => Promise<SearchHit[]>
  searchInvoices: (query: string) => Promise<SearchHit[]>
  searchPages: (query: string) => Promise<SearchHit[]>
  /** Résout un email COMPLET vers un `userId`, `null` si aucun compte ne le
   *  porte. Optionnel : sans lui, un email complet suit la recherche normale. */
  resolveEmailUser?: (email: string) => Promise<string | null>
}

export type GlobalSearchResult = {
  groups: SearchGroup[]
  /** Non nul UNIQUEMENT quand l'email tapé est complet et résolu — la seule
   *  fois où cette fonction dit « va voir ailleurs » plutôt que « voici ce que
   *  j'ai trouvé ». */
  directEmailUserId: string | null
}

/**
 * LA composition. Cinq sources, un ordre, un plafond par groupe, et le
 * court-circuit de l'email complet.
 */
export async function runGlobalSearch(query: string, fetchers: SearchFetchers): Promise<GlobalSearchResult> {
  const trimmed = query.trim()
  if (trimmed.length < SEARCH_MIN_LENGTH) return { groups: [], directEmailUserId: null }

  if (isCompleteEmail(trimmed) && fetchers.resolveEmailUser) {
    const userId = await fetchers.resolveEmailUser(trimmed)
    if (userId) return { groups: [], directEmailUserId: userId }
    // Aucun compte à cette adresse : ce n'est pas un refus, c'est une
    // recherche normale qui continue — l'email pourrait exister ailleurs
    // qu'en tant qu'identifiant de connexion (aucun cas aujourd'hui, mais on
    // ne fabrique pas un échec que rien ne mesure).
  }

  const [users, workspaces, analyses, invoices, pages] = await Promise.all([
    fetchers.searchUsers(trimmed),
    fetchers.searchWorkspaces(trimmed),
    fetchers.searchAnalyses(trimmed),
    fetchers.searchInvoices(trimmed),
    fetchers.searchPages(trimmed),
  ])

  return {
    groups: groupResults([...users, ...workspaces, ...analyses, ...invoices, ...pages]),
    directEmailUserId: null,
  }
}
