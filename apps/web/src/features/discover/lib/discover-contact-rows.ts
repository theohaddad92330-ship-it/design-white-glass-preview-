import type { BuyerRoleFamilyKey, ContactListItem, ContactStatus, CoverageLevel, DecisionRole } from '@bellum/contracts'
import { resolveBuyerRoleFamilyFromTitle, resolveContactLevel } from '@bellum/contracts'

/* ------------------------------------------------------------------ */
/*  #2165.7 / #2166.15-.25 — DES PERSONNES comme type de résultat.      */
/*                                                                     */
/*  La source de personnes, ici, est l'ESPACE LUI-MÊME — les contacts   */
/*  déjà collectés. Ce n'est pas un repli faute de mieux : aller        */
/*  chercher des personnes ailleurs supposerait de se faire passer pour */
/*  un navigateur humain ou un utilisateur connecté, et la doctrine le  */
/*  refuse (« pas de scraping », tome 2). Une recherche de personnes    */
/*  qui rendrait des noms venus d'ailleurs serait donc soit fausse,     */
/*  soit interdite.                                                    */
/*                                                                     */
/*  ⚠️ CRITÈRES PROTÉGÉS : `photo_url` existe sur la source et n'est     */
/*  PAS repris ici. La ligne ne porte que ce qui décrit un RÔLE dans    */
/*  une organisation. L'interdit porte sur l'usage classant, et une     */
/*  liste de personnes EST un classement — la photo n'y entre pas.      */
/* ------------------------------------------------------------------ */

/** #2166.25 — ce qu'une ligne de personne ne sait pas, nommé. */
type DiscoverContactUnknown = 'location' | 'expertise' | 'level' | 'jobFreshness' | 'reason'

export interface DiscoverContactRow {
  id: string
  /** #2166.15 — la personne. */
  fullName: string
  /** #2166.16 — son entreprise. `null` = contact à qualifier (#1473). */
  company: string | null
  /** #2166.17 — sa fonction, telle qu'elle a été collectée. */
  title: string | null
  /** #2166.18 — l'entité / la filiale, quand elle est connue. */
  entity: string | null
  /** #2166.20 — le rôle commercial (taxonomie MEDDIC), jamais deviné. */
  decisionRole: DecisionRole | null
  /**
   * #2165.35 (17/09/2026) — le NIVEAU hiérarchique, déduit UNE FOIS de
   * l'intitulé de poste (et du rôle décisionnel en repli) par le référentiel
   * PARTAGÉ `resolveContactLevel` (`@bellum/contracts`, GA-26) — le MÊME que
   * la matrice de couverture des comptes. `null` = « niveau inconnu », jamais
   * deviné par ressemblance.
   */
  level: CoverageLevel | null
  /**
   * #2165.37 (17/09/2026) — le domaine d'EXPERTISE, déduit UNE FOIS de
   * l'intitulé de poste par le référentiel PARTAGÉ des onze familles de rôles
   * acheteurs (`resolveBuyerRoleFamilyFromTitle`, GA-26). `null` = « expertise
   * inconnue », jamais devinée.
   */
  expertise: BuyerRoleFamilyKey | null
  /**
   * #2166.22 — « une coordonnée EXISTE », jamais la coordonnée elle-même.
   *
   * Afficher l'adresse dans une liste de découverte la ferait sortir d'un
   * écran de travail vers une capture d'écran, un export, un message. Le
   * commercial ouvre la fiche quand il en a besoin.
   */
  channels: { email: boolean; phone: boolean }
  /**
   * #2165.38 — le LIEU DE TRAVAIL de cette personne, tel qu'il a été collecté
   * (`ContactListItem.location`, alimenté par l'enrichissement).
   *
   * `null` = INCONNU, et la ligne le DIT (`unknown` porte `'location'`). Jamais
   * rabattu sur le siège de l'entreprise : le siège est un fait sur
   * l'organisation, pas sur la personne, et les confondre revient à affirmer où
   * quelqu'un travaille sans l'avoir constaté.
   */
  location: string | null
  /** #2166.23 — la raison de la présence de cette personne, collectée. */
  reason: string | null
  /**
   * #2166.21 / #2166.24 — la PROVENANCE, pas un verdict.
   *
   * Décision Louis du 15/09 : on NOMME ce qu'on sait — « poste vu le <date>,
   * source <la source> ». Aucun résultat ne dit « vérifié », et ce qui n'est
   * pas confirmé est NOMMÉ non confirmé, jamais rendu faux.
   */
  provenance: { sourceTag: ContactListItem['source_tag'] | null; seenAt: string | null }
  /** #2166.25 — ce qui manque sur cette ligne. */
  unknown: DiscoverContactUnknown[]
  /** #2165.41 — où en est la relation de l'espace avec cette personne. */
  relation: ContactStatus
  accountId: string | null
}

/**
 * #3819 — ce que la ligne LIT d'une personne : la liste de contacts de l'espace
 * ET la source unique `POST /contacts/call-list` portent ces champs (la seconde
 * sans l'étiquette de source, calculée ailleurs). Une forme, deux sources.
 */
type DiscoverPersonSource = Pick<
  ContactListItem,
  | 'id'
  | 'full_name'
  | 'company_name'
  | 'title'
  | 'entity'
  | 'decision_role'
  | 'email'
  | 'phone'
  | 'why_contact'
  | 'user_status'
  | 'account_id'
> &
  Partial<Pick<ContactListItem, 'location' | 'source_tag' | 'last_enrichment_at'>>

/** #2165.38 — un lieu COLLECTÉ, ou `null`. Une chaîne blanche n'est pas un
 *  lieu : la rendre telle quelle ferait afficher un vide comme une valeur. */
function collectedLocation(item: DiscoverPersonSource): string | null {
  const text = (item.location ?? '').trim()
  return text || null
}

function contactUnknowns(
  item: DiscoverPersonSource,
  level: CoverageLevel | null,
  expertise: BuyerRoleFamilyKey | null,
): DiscoverContactUnknown[] {
  const unknown: DiscoverContactUnknown[] = []
  // #2165.38 (18/09/2026) — la localisation N'EST PLUS inconditionnellement
  // inconnue : `ContactListItem` porte désormais le lieu de travail COLLECTÉ,
  // la même colonne que la fiche. Elle n'est nommée manquante que lorsqu'elle
  // l'est vraiment — et elle n'est JAMAIS devinée depuis le siège de
  // l'entreprise, qui n'est pas l'endroit où la personne travaille.
  if (collectedLocation(item) === null) unknown.push('location')
  // #2165.37 (17/09/2026) — l'expertise est désormais DÉDUITE une fois du
  // poste (référentiel partagé) : elle n'est nommée manquante que lorsque
  // rien n'a pu être déduit, jamais par défaut.
  if (expertise === null) unknown.push('expertise')
  // #2165.35 (17/09/2026) — même règle pour le niveau hiérarchique.
  if (level === null) unknown.push('level')
  if (!item.last_enrichment_at) unknown.push('jobFreshness')
  if (!item.why_contact) unknown.push('reason')
  return unknown
}

export function contactRowsFrom(items: readonly DiscoverPersonSource[]): DiscoverContactRow[] {
  return items.map(item => {
    const level = resolveContactLevel({ title: item.title, decisionRole: item.decision_role })
    const expertise = resolveBuyerRoleFamilyFromTitle(item.title)
    return {
      id: item.id,
      fullName: item.full_name,
      company: item.company_name,
      title: item.title,
      entity: item.entity,
      decisionRole: item.decision_role,
      level,
      expertise,
      channels: { email: Boolean(item.email), phone: Boolean(item.phone) },
      // #2165.38 — le lieu collecté, ou `null` (inconnu). Jamais le siège.
      location: collectedLocation(item),
      reason: item.why_contact,
      provenance: { sourceTag: item.source_tag ?? null, seenAt: item.last_enrichment_at ?? null },
      unknown: contactUnknowns(item, level, expertise),
      relation: item.user_status,
      accountId: item.account_id,
    }
  })
}

/**
 * Les filtres de personnes que les faits déjà rendus permettent d'exprimer
 * (#2165.34 fonction · #2165.35 niveau · #2165.36 entité · #2165.37 expertise
 * · #2165.39 coordonnées · #2165.40 poste daté · #2165.41 relation ·
 * #2294.2 nombre max, 18/09/2026 — une taille de LISTE, jamais un critère
 * qui exclut UNE personne).
 *
 * ⚠️ #2165.38 (DÉCISION Louis 18/09/2026) — la LOCALISATION était refusée ici
 * (16/09) au motif qu'aucune donnée de lieu n'existait sur une personne. Le
 * motif était exact de la LISTE et faux de la DONNÉE : `location` vivait sur la
 * fiche (`contactSchema.location`, alimentée par l'enrichissement) et la
 * projection de liste la jetait. Elle voyage désormais, et le filtre porte sur
 * le lieu COLLECTÉ de la personne — jamais sur le siège de son entreprise, qui
 * décrirait l'adresse du SIÈGE et pas celle où elle travaille : deux faits
 * différents. Une personne sans lieu connu n'est donc jamais rattrapée par un
 * filtre de lieu ; elle reste « localisation inconnue » (`row.unknown`).
 *
 * ⚠️ Ville et pays sont les DEUX SEULES exceptions nommées à l'interdit des
 * critères protégés (registre de doctrine, c58) : aucun autre attribut d'une
 * personne ne pèse dans ce classement.
 *
 * ⚠️ #2165.35 / #2165.37 (DÉCISION Louis 17/09/2026) — niveau et expertise
 * étaient refusés ici (16/09) au motif qu'aucun des deux n'existait sur la
 * source et que les déduire d'un intitulé serait une taxonomie inventée. Ce
 * n'en est plus une : les deux dérivations vivent à un seul endroit
 * (`resolveContactLevel` / `resolveBuyerRoleFamilyFromTitle`,
 * `@bellum/contracts`, GA-26), PARTAGÉ avec la matrice de couverture des
 * comptes — pas recodées pour ce filtre. Une valeur non déduite reste
 * « niveau inconnu » / « expertise inconnue » (`row.unknown`), jamais devinée.
 *
 * ⚠️ #2165.40 (DÉCISION Louis 15/09/2026) — « emploi vérifié » n'existe pas :
 * aucune source de vérification hors réseau pro (`doctrine-registry.ts:1939`).
 * Le filtre ne porte donc jamais ce mot ; il resserre sur ceux dont la
 * provenance porte une DATE (« poste daté »), jamais sur un verdict.
 */
export interface DiscoverContactFilters {
  /** Texte libre cherché dans la FONCTION. Vide = aucune contrainte. */
  title: string
  /** Texte libre cherché dans l'entité / la filiale. */
  entity: string
  /** #2165.39 — ne garder que les personnes joignables (e-mail ou téléphone). */
  reachableOnly: boolean
  /** #2165.41 — l'état de la relation de l'espace. `any` = toutes. */
  relation: ContactStatus | 'any'
  /** #2165.35 — le niveau hiérarchique déduit du poste. `any` = toutes. */
  level: CoverageLevel | 'any'
  /** #2165.37 — le domaine d'expertise déduit du poste. `any` = toutes. */
  expertise: BuyerRoleFamilyKey | 'any'
  /**
   * #2165.38 — texte libre cherché dans le LIEU DE TRAVAIL collecté de la
   * personne (ville, pays). Vide = aucune contrainte. Une personne dont le lieu
   * est inconnu ne matche jamais : on ne devine pas où elle travaille.
   */
  location: string
  /**
   * #2151.55 / #2166.49 — texte libre cherché dans l'ENTREPRISE. Posé par
   * « Trouver les commerciaux » / « Chercher les contacts » depuis un
   * résultat compte : un candidat de Découvrir n'a pas toujours de fiche
   * compte (`accountId`), donc le rapprochement se fait par NOM, pas par
   * identifiant.
   */
  company: string
  /**
   * #2166.57 (23/09/2026) — texte libre à PLUSIEURS valeurs (OR), posé par
   * « Chercher les contacts » depuis une SÉLECTION de N candidats. Séparé de
   * `company` ci-dessus (qui reste à une seule valeur, appelants existants
   * inchangés : #2151.55/#2166.49 et les champs de saisie de
   * `CallListResults`/`ProjectionResults`) pour ne pas élargir un contrat
   * partagé — DÉCISION tranchée sans Louis, la plus sûre des deux options du
   * registre (élargir `company` en liste aurait cassé les 2 appelants
   * existants). `[]` = aucune contrainte.
   */
  companies: string[]
  /**
   * #2294.2 (18/09/2026) — « nombre max » : un plafond sur la LISTE rendue,
   * appliqué EN DERNIER (`filterContactRows`), jamais un critère qui exclut
   * une personne en particulier ni un score. `'any'` = pas de plafond.
   */
  maxResults: number | 'any'
  /**
   * #2165.40 — DÉCISION Louis 15/09 : « poste vu le <date>, source <la
   * source> », jamais « vérifié ». Ce filtre ne garde donc PAS « les postes
   * vérifiés » (aucun ne l'est) mais ceux dont la provenance porte une DATE
   * (`row.provenance.seenAt`) — le négatif exact de `unknown.jobFreshness`.
   */
  datedOnly: boolean
  /**
   * #2621.1 — la bascule « monde ». `false` (défaut) : Découvrir reste au pays
   * du workspace (second paramètre de `filterContactRows`). `true` : la
   * contrainte de pays disparaît — connues ET inconnues comprises, comme
   * avant ce lot.
   */
  worldwide: boolean
  /**
   * #2294.2 (24/09/2026) — « fraîcheur minimale » : le 12e et dernier des 12
   * filtres nommés (LAU-FINAL-035). Distinct de `datedOnly` (#2165.40, « a une
   * date, n'importe laquelle ») : ici un SEUIL en jours depuis
   * `provenance.seenAt` (= `last_enrichment_at`). `'any'` = aucune contrainte.
   * Une ligne sans date connue ne matche JAMAIS un seuil — même prudence que
   * `location`/`level` : l'inconnu n'est pas rattrapé.
   */
  minFreshnessDays: number | 'any'
  /**
   * La date de référence pour `minFreshnessDays`, ISO. Absente = `new Date()`
   * au moment de l'appel — un paramètre explicite existe pour que ce filtre,
   * comme le reste du fichier, reste TESTABLE sans horloge cachée.
   */
  now?: string
}

export function emptyContactFilters(): DiscoverContactFilters {
  return {
    title: '',
    entity: '',
    reachableOnly: false,
    relation: 'any',
    level: 'any',
    expertise: 'any',
    company: '',
    // #2166.57 — vide = aucune contrainte de sélection multi-entreprises.
    companies: [],
    // #2165.38 — vide = aucune contrainte de lieu.
    location: '',
    maxResults: 'any',
    datedOnly: false,
    // #2621.1 — éteinte par défaut : Découvrir reste au pays du workspace.
    worldwide: false,
    // #2294.2 — vide = aucune contrainte de fraîcheur.
    minFreshnessDays: 'any',
  }
}

/** #2294.2 — l'âge en jours de `seenAt` par rapport à `nowIso`, ou `null` si
 *  `seenAt` est inconnu (jamais deviné). */
function ageInDays(seenAt: string | null, nowIso: string): number | null {
  if (!seenAt) return null
  const seen = new Date(seenAt).getTime()
  const now = new Date(nowIso).getTime()
  if (Number.isNaN(seen) || Number.isNaN(now)) return null
  return (now - seen) / (1000 * 60 * 60 * 24)
}

function includesLoose(haystack: string | null, needle: string): boolean {
  if (!needle.trim()) return true
  return (haystack ?? '').toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase())
}

/**
 * #2621.1 — `workspaceCountryName` est le nom EXACT que le marché de l'espace
 * attend dans `location` (`MARKET_COUNTRY_NAMES`, `@bellum/contracts`) —
 * `null`/`undefined` tant que le marché n'est pas encore résolu, auquel cas
 * aucune contrainte n'est posée (jamais un blocage silencieux pendant le
 * chargement).
 */
/**
 * #4634 (décision Louis 26/10/2026) — « les critères partent dans la RECHERCHE, côté serveur, pas un post-filtre
 * d'affichage ». Filtrer « Fonction = DSI » sur les 50 lignes déjà tirées gardait les DSI de 50 lignes arbitraires,
 * pas les DSI de l'espace.
 *
 * Seuls partent les critères qui ont un jumeau EXACT au contrat `GET /contacts` (`contactListQuerySchema`) : même
 * colonne, même geste (ILIKE pour les textes, égalité pour la relation = `contacts.user_status`, que la ligne lit
 * déjà — `relation: item.user_status`). Les autres AFFINENT la liste trouvée, et le volet le dit
 * (`contactsResult.refinesOnly`) :
 *  - niveau : `resolveContactLevel` (c_level / n1 / n2) n'est pas `hierarchyLevel` (`computeHierarchyLevel`, sept
 *    paliers) — envoyer l'un pour l'autre rendrait une autre liste que celle que le libellé promet ;
 *  - expertise : `resolveBuyerRoleFamilyFromTitle` n'est pas la colonne `contacts.family` du classifieur d'import ;
 *  - joignable (e-mail OU téléphone) : `channel` n'a pas cette valeur ;
 *  - poste daté, fraîcheur, monde entier, sélection multi-entreprises : aucun jumeau au contrat ;
 *  - nombre max : une taille de LISTE, plafonnée en dernier (#2294.2), jamais un critère.
 * Un contrat d'API non vérifiable ne se devine pas (doctrine).
 */
export interface DiscoverPeopleSearchCriteria {
  title?: string
  company?: string
  entity?: string
  location?: string
  userStatus?: ContactStatus
}

export function peopleSearchCriteria(filters: DiscoverContactFilters): DiscoverPeopleSearchCriteria {
  const criteria: DiscoverPeopleSearchCriteria = {}
  const title = filters.title.trim()
  const company = filters.company.trim()
  const entity = filters.entity.trim()
  const location = filters.location.trim()
  if (title) criteria.title = title
  if (company) criteria.company = company
  if (entity) criteria.entity = entity
  if (location) criteria.location = location
  if (filters.relation !== 'any') criteria.userStatus = filters.relation
  return criteria
}

export function filterContactRows(
  rows: DiscoverContactRow[],
  filters: DiscoverContactFilters,
  workspaceCountryName?: string | null,
  /** #4634 — `searched` : la liste vient de `GET /contacts` qui a DÉJÀ appliqué `peopleSearchCriteria` — ils ne
   *  se réappliquent pas sur les lignes tirées. Absent (liste d'appels, entreprises de la recherche) : ils affinent. */
  options: { searched?: boolean } = {},
): DiscoverContactRow[] {
  const searched = options.searched === true
  const matched = rows.filter(row => {
    if (!searched) {
      if (!includesLoose(row.title, filters.title)) return false
      if (!includesLoose(row.entity, filters.entity)) return false
      if (!includesLoose(row.company, filters.company)) return false
      if (!includesLoose(row.location, filters.location)) return false
      if (filters.relation !== 'any' && row.relation !== filters.relation) return false
    }
    // #2166.57 — OR entre les entreprises de la sélection ; vide = pas de contrainte.
    if (filters.companies.length > 0 && !filters.companies.some(name => includesLoose(row.company, name))) return false
    // #2165.38 — sur le lieu de la PERSONNE uniquement (ci-dessus, ou `contact.location` au serveur, #4634).
    // `row.location === null` (inconnu) ne matche aucun lieu demandé : une ligne dont on ignore le lieu
    // sort du filtre, elle n'y entre pas par une déduction sur son entreprise.
    // #2621.1 — le pays du workspace par défaut : une localisation INCONNUE
    // n'est jamais rattrapée comme « dans le pays » (même prudence que
    // `filters.location` ci-dessus, même helper — GA-26).
    if (!filters.worldwide && workspaceCountryName && !includesLoose(row.location, workspaceCountryName)) return false
    if (filters.reachableOnly && !row.channels.email && !row.channels.phone) return false
    if (filters.level !== 'any' && row.level !== filters.level) return false
    if (filters.expertise !== 'any' && row.expertise !== filters.expertise) return false
    if (filters.datedOnly && !row.provenance.seenAt) return false
    // #2294.2 — un seuil de fraîcheur, jamais rattrapé par une date inconnue.
    if (filters.minFreshnessDays !== 'any') {
      const age = ageInDays(row.provenance.seenAt, filters.now ?? new Date().toISOString())
      if (age === null || age > filters.minFreshnessDays) return false
    }
    return true
  })
  // #2294.2 — le plafond s'applique EN DERNIER, sur la liste déjà filtrée par
  // les autres critères : c'est une taille de liste, pas un critère de plus.
  return filters.maxResults === 'any' ? matched : matched.slice(0, filters.maxResults)
}

/**
 * #3819 (démo Ludovic 08/10) — le périmètre « pays de l'espace » ne s'applique
 * qu'à la recherche de personnes LIBRE. Quand la liste vient des entreprises de
 * la recherche (liste d'appels), ces entreprises posent déjà le périmètre : un
 * filtre de pays en plus écartait toute personne sans lieu collecté (onglet
 * Contacts à 0 alors que la liste d'appels en comptait 10).
 */
export function contactCountryScope(fromCompanySearch: boolean, workspaceCountryName: string | null): string | null {
  return fromCompanySearch ? null : workspaceCountryName
}
