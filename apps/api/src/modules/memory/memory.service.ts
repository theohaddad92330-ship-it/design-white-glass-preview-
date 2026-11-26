import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  MEMORY_LAYERS,
  MEMORY_SURFACES,
  type AnalysisProfileData,
  type ConversationSummaryView,
  type ConversationThreadState,
  conversationSummarySections,
  conversationThreadStateSchema,
  findIntervention,
  isDeclaredMemoryLayer,
  isMemoryItemExpired,
  type MemoryForgetAllResult,
  type MemoryItem,
  type MemoryItemEvent,
  type MemoryItemHistory,
  type MemoryItemKind,
  type MemoryItemObjectInput,
  type MemoryItemOrigin,
  type MemoryItemScope,
  type MemoryLayer,
  type MemoryLedger,
  type MemoryLedgerEntry,
  type MemorySurface,
  type WorkspaceRole,
  redactMemoryFact,
} from '@bellum/contracts'
import { ConversationSummaryEntity } from '../../database/entities/conversation-summary.entity'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { MemoryFactEventEntity } from '../../database/entities/memory-fact-event.entity'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { EsnProfileWorkspaceResolver } from '../esn-profile/esn-profile-workspace.resolver'
import { resolveWorkspaceAuthors } from '../../common/workspace-authors'
import {
  objectColumnFor,
  objectColumnsFor,
  objectLinkOf,
  resolveMemoryObjectNames,
  withResolvedName,
} from './memory-object-links'

/** Wire shape for a pinned fact (no `user_id`/`workspace_id` leakage). Aligned
 *  on the shared `MemoryItem` contract (restitution V2 §20). */
export type PinnedFact = MemoryItem

/** Args for the rolling per-conversation summary update after a chat exchange. */
export type RecordTurnArgs = {
  userId: string
  workspaceId: string
  accountId: string | null
  conversationId: string | null
  userMessage: string
  assistantReply: string
  /**
   * #1927.10 — l'état structuré du fil RENDU par ce tour, déjà validé
   * (`parseThreadState`). Absent ou `null` = le tour n'en a rendu aucun (service
   * IA d'avant #1927, état vide, lecture refusée) : la colonne n'est PAS
   * touchée. Un tour muet n'efface jamais ce que les précédents ont établi — un
   * effacement est un geste (supprimer le fil, oublier la ligne), pas un effet
   * de bord.
   */
  threadState?: ConversationThreadState | null
}

/**
 * #1927 — LA lecture de l'état du fil, dans les DEUX sens : ce que le service IA
 * rend avant qu'on l'écrive, et ce que la base rend avant qu'on le renvoie.
 *
 * Une valeur illisible — forme d'une autre version, colonne corrompue, service
 * IA plus récent que ce schéma — vaut `null` : « aucun état connu », jamais un
 * état deviné ni une erreur qui ferait tomber le tour. Le schéma est une LISTE
 * BLANCHE : une clé inconnue est retirée, donc rien d'autre que des
 * identifiants, des libellés, des critères et des questions n'est stocké (D65).
 */
export function parseThreadState(raw: unknown): ConversationThreadState | null {
  const parsed = conversationThreadStateSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** Keep the summary bounded: last N turns' worth of lines, hard char ceiling. */
const SUMMARY_MAX_LINES = 20
const SUMMARY_MAX_CHARS = 2000
const TURN_SNIPPET_MAX = 200

/** Combien de traces d'intervention le registre montre. Au-delà, l'écran
 *  deviendrait un journal ; la mémoire de Laura, elle, ne regarde que le passé
 *  récent (§5.3 du PDF 10). */
const LEDGER_TRACE_LIMIT = 50

/**
 * COUCHE 1 — L'IDENTITÉ. Les clés du profil résolu qui décrivent LA PERSONNE.
 *
 * Elles partent dans le prompt du copilote à chaque tour (`ChatContextService`
 * → `profileData`), et le §12 de `analysis.ts` dit lui-même pourquoi : « ton et
 * niveau de conseil du copilote ». Le prénom, lui, ne vient pas de là mais de
 * `profiles.first_name` — il a sa propre ligne.
 *
 * La ligne de partage avec la couche 2 est « QUI je suis » contre « QUELLE
 * société je vends » : `sellerRole` décrit la personne, `positioning` décrit
 * l'ESN. Ce n'est PAS la ligne de partage technique du profil (le partage
 * canonique/overlay de `ESN_PERSONAL_ANSWER_KEYS`, qui range `personas` et
 * `avgTJM` du côté « personnel » parce que le membre peut les surcharger) : une
 * personne qui lit « ce que Laura sait de moi » cherche son rôle, pas le panier
 * moyen de sa société.
 *
 * ⚠️ Ni langue, ni fuseau, ni ancienneté : rien ne les fait entrer dans un
 * prompt aujourd'hui. Les afficher ferait croire qu'ils voyagent — un registre
 * qui liste ce qui n'est pas lu ment dans l'autre sens.
 */
const IDENTITY_PROFILE_KEYS = [
  'sellerRole',
  'proactivity',
  'sellerGoal',
  'monthlyTarget',
  'portfolioSize',
  'accountsRelationshipStatus',
  'salesBlockers',
  'mainChallenge',
] as const satisfies readonly (keyof AnalysisProfileData)[]

/**
 * COUCHE 2 — L'ESPACE. Ce que le copilote sait de l'ESN à chaque tour.
 *
 * Même source (`EsnProfileReader.resolveProfileData`), même prompt. On y trouve
 * la raison sociale, la taille, les offres, les secteurs, le positionnement, la
 * zone, et le PORTEFEUILLE d'offre — le « wedge » de la source, qui porte ici
 * ses libellés français (`offerPortfolioNames`) et non ses codes : « en clair »
 * veut dire lisible sans traduction mentale.
 *
 * ⚠️ Le PALIER d'abonnement n'y est pas : rien ne le met dans un prompt. Les
 * CONNECTEURS non plus — leur état vit à un seul endroit, Réglages ›
 * Intégrations, qui est la seule surface où le produit a le droit de NOMMER un
 * éditeur. Le libellé de la couche y renvoie.
 */
const WORKSPACE_PROFILE_KEYS = [
  'companyName',
  'size',
  'salesTeamSize',
  'positioning',
  'offers',
  'sectors',
  'geoZone',
  'targetCompanyTypes',
  'staffingModel',
  'offerPortfolioNames',
  'personas',
  'noGoSectors',
  'salesCycle',
  'avgTJM',
  'references',
  'dealSize',
  'targetMargin',
  'rampUpCapacity',
  'goToMarketChannels',
] as const satisfies readonly (keyof AnalysisProfileData)[]

/**
 * Une valeur de profil, rendue lisible — ou `null` quand il n'y a rien à lire.
 *
 * ⚠️ Une liste VIDE, une chaîne blanche et un `0` ne produisent PAS de ligne.
 * « Non mesuré n'est jamais 0 » : une ligne « Offres : — » ferait croire que le
 * copilote lit un profil vide alors qu'il ne lit rien du tout.
 */
function renderProfileValue(value: unknown): string | null {
  if (Array.isArray(value)) {
    const labels = value.map(item => String(item).trim()).filter(item => item.length > 0)
    return labels.length > 0 ? labels.join(' · ') : null
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (value === true) return 'true'
  return null
}

/**
 * Les lignes d'une couche DÉCLARÉE, dans l'ordre des clés.
 *
 * `detail` porte la CLÉ — l'écran la traduit (`memoryLedger.detail.<clé>`) et
 * retombe sur la clé brute si le catalogue est plus vieux que le champ. `text`
 * porte la VALEUR, mot pour mot : « en clair » veut dire lisible sans
 * traduction mentale.
 */
function toDeclaredEntries(
  layer: MemoryLayer,
  keys: readonly (keyof AnalysisProfileData)[],
  profileData: AnalysisProfileData,
  recordedAt: string,
): MemoryLedgerEntry[] {
  const entries: MemoryLedgerEntry[] = []
  for (const key of keys) {
    const text = renderProfileValue(profileData[key])
    // Un champ non renseigné ne produit AUCUNE ligne : afficher « Offres : — »
    // ferait croire que le copilote lit un profil vide, alors qu'il ne reçoit
    // simplement rien sur ce champ.
    if (!text) continue
    entries.push({ id: key, layer, text, recordedAt, accountId: null, detail: key, expiresAt: null })
  }
  return entries
}

/** Une valeur de préférence, rendue lisible. Une chaîne se lit telle quelle ;
 *  le reste passe par JSON — jamais « [object Object] », qui ne dit rien. */
function renderPreference(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * #1918.1 — la portée d'un corps qui n'en porte PAS : celle qu'avait tout
 * épinglage avant ce lot. Un onglet ouvert avant le déploiement continue
 * d'épingler ce que son écran lui promet (« partagé avec ton espace ») ; les
 * écrans neufs envoient toujours une portée choisie (`defaultMemoryScope`).
 * C'est aussi le défaut SQL de la migration `1792800070000`.
 */
const SCOPE_WHEN_ABSENT: MemoryItemScope = 'workspace'

/**
 * #1918.8 — décision du 13/09 : une « Préférence » envoyée SANS portée reçoit
 * le défaut que les écrans proposent (`defaultMemoryScope` : « Toi uniquement »).
 * Un onglet ouvert avant le déploiement ne doit jamais partager par accident ce
 * que l'écran aurait gardé privé — en confidentialité, le défaut prudent gagne.
 * Les autres natures gardent {@link SCOPE_WHEN_ABSENT}.
 */
function scopeWhenAbsent(kind: MemoryItemKind | undefined): MemoryItemScope {
  // #1918.8 — défaut serveur = écran
  return kind === 'preference' ? 'user' : SCOPE_WHEN_ABSENT
}

/**
 * #1918.1 — CE QUE L'APPELANT PEUT VOIR : les éléments partagés avec l'espace,
 * et les siens. Écrit UNE fois par forme de requête : avec l'alias `f` pour une
 * lecture, sans alias pour une suppression (TypeORM n'aliase pas la table d'un
 * `DELETE`). Le paramètre `:viewer` est TOUJOURS l'utilisateur authentifié.
 */
const VISIBLE_TO_VIEWER = visibleToViewer('f.')
const VISIBLE_TO_VIEWER_UNALIASED = visibleToViewer('')

/**
 * #1918.2 / #1918.5 — CE QUE L'APPELANT ATTEINT EN PLUS DES DEUX PORTÉES DURABLES.
 *
 * Deux portées de plus ne se lisent pas sans contexte : une mémoire d'ÉQUIPE
 * n'est visible que de qui porte le périmètre, une mémoire de FIL que dans son
 * fil. Les deux arrivent du BORD (le contrôleur, le tour de chat), jamais
 * devinées ici.
 *
 * ⚠️ **Absentes = rien de plus, jamais tout.** Un appelant sans périmètre
 * résolu ne voit AUCUNE mémoire d'équipe ; un appel hors d'un fil n'en voit
 * aucune de fil. C'est l'unique repli acceptable : l'erreur inverse — « je n'ai
 * pas pu résoudre, donc je montre tout » — est celle qui ouvre un espace entier
 * sans qu'un écran change d'apparence.
 */
type ViewerReach = {
  /**
   * #1918.2 — les périmètres que l'appelant PORTE (`business_unit_members`),
   * déjà bornés à son espace. ⚠️ C'est l'APPARTENANCE, jamais
   * `business_unit_access` : ce dernier répond à « qui a le droit de voir les
   * données d'un périmètre » et vaut `workspace` par défaut — s'en servir ici
   * rendrait « ma BU » lisible par tout l'espace, c'est-à-dire exactement la
   * promesse que #1918.2 refuse de trahir.
   */
  businessUnitIds?: readonly string[]
  /** #1918.5 — la clé du fil courant ({@link conversationKey}). Absente : aucun fil. */
  conversationKey?: string | null
}

/**
 * #1918.1 / #1918.2 / #1918.5 — CE QUE L'APPELANT PEUT VOIR, en une clause.
 *
 * Écrite pour les deux formes de requête du dépôt : avec l'alias `f` pour une
 * lecture, sans alias pour une suppression ou une mise à jour (TypeORM
 * n'aliase pas la table d'un `DELETE`). Le paramètre `:viewer` est TOUJOURS
 * l'utilisateur authentifié.
 *
 * ⚠️ TÉMOIN — sans `reach`, la clause rendue est celle d'avant ce lot à la
 * sémantique près : `scope = 'workspace' OR (scope = 'user' AND user_id =
 * :viewer)`. L'ancienne s'écrivait `scope = 'workspace' OR user_id = :viewer`,
 * ce qui était équivalent tant que la colonne ne portait que deux valeurs — et
 * ne l'est plus : sans la borne de portée, un élément de FIL ou d'ÉQUIPE
 * remonterait dans l'écran de Réglages de son auteur, où il n'a rien à faire.
 */
function visibleToViewer(prefix: 'f.' | '', reach: ViewerReach = {}): string {
  const branches = [`${prefix}scope = 'workspace'`, `(${prefix}scope = 'user' AND ${prefix}user_id = :viewer)`]
  if (reach.businessUnitIds && reach.businessUnitIds.length > 0) {
    branches.push(`(${prefix}scope = 'business_unit' AND ${prefix}business_unit_id IN (:...viewerUnits))`)
  }
  if (reach.conversationKey) {
    branches.push(
      `(${prefix}scope = 'conversation' AND ${prefix}user_id = :viewer AND ${prefix}conversation_id = :viewerThread)`,
    )
  }
  return `(${branches.join(' OR ')})`
}

/** Les paramètres que {@link visibleToViewer} attend — les mêmes clés, au même endroit. */
function viewerReachParams(userId: string, reach: ViewerReach = {}): Record<string, unknown> {
  const params: Record<string, unknown> = { viewer: userId }
  if (reach.businessUnitIds && reach.businessUnitIds.length > 0) params['viewerUnits'] = [...reach.businessUnitIds]
  if (reach.conversationKey) params['viewerThread'] = reach.conversationKey
  return params
}
/** #1918.7 — ce que l'appelant a ÉPINGLÉ lui-même (sans alias : une suppression). */
const AUTHORED_BY_VIEWER_UNALIASED = 'user_id = :viewer'

/**
 * #2439.10 — UNE MÉMOIRE OUBLIÉE EST ARCHIVÉE, PAS DÉTRUITE — et une ligne
 * archivée ne se lit plus (décision de Louis du 21/09/2026).
 *
 * Deux formes du même prédicat, comme {@link VISIBLE_TO_VIEWER} juste au-dessus :
 * avec l'alias `f` pour une lecture, sans alias pour une écriture (TypeORM
 * n'aliase pas la table d'un `UPDATE`). La troisième forme, pour les requêtes
 * par CRITÈRE d'objet, est {@link NOT_ARCHIVED} — `archived_at: IsNull()`.
 *
 * ⚠️ Il s'ajoute à CHAQUE lecture des trois tables archivables, pas seulement à
 * celles de l'écran : une mémoire oubliée qui ressort dans un prompt, un
 * registre ou un compteur est pire que pas de correctif du tout.
 */
const NOT_ARCHIVED_ALIASED = 'f.archived_at IS NULL'
const NOT_ARCHIVED_UNALIASED = 'archived_at IS NULL'

/** La même borne pour une requête par critère (`where: { … }`). */
const NOT_ARCHIVED = { archived_at: IsNull() } as const

/**
 * #1918.7 — LES MANAGERS DE L'ESPACE, pour la mémoire. Décision de Louis du
 * 13/09/2026 : un élément PARTAGÉ avec l'ESN ne se retire que par son auteur ou
 * un porteur de l'un de ces rôles. Même liste que les autres gestes réservés
 * aux managers du dépôt (`assertRole(…, ['owner', 'admin'])` —
 * `workspace-brand.service.ts`, `workspace-market.service.ts`). Le rôle est
 * celui que rend `WorkspaceContextService.resolveActiveWorkspace`, la même
 * résolution que `WorkspacePermissionGuard` — jamais une valeur du corps.
 */
const MEMORY_SHARED_FORGET_ROLES: readonly WorkspaceRole[] = ['owner', 'admin']

/** Sans rôle connu, on applique la règle du membre simple : on échoue FERMÉ. */
function isMemoryManager(role: WorkspaceRole | undefined): boolean {
  return role !== undefined && MEMORY_SHARED_FORGET_ROLES.includes(role)
}

/** L'appelant d'une lecture : qui il est, et son rôle d'espace quand on le connaît. */
type MemoryViewer = { userId: string; role?: WorkspaceRole }

/**
 * #1918.1 (masquage) — décision de Louis du 15/09/2026 : un fait est masqué
 * QUAND, ET SEULEMENT QUAND, `scope === 'workspace'` ET `ownedByMe === false`.
 * L'auteur voit toujours son texte entier ; une mémoire `user` n'est JAMAIS
 * masquée — elle ne sort pas de son auteur, la question ne se pose pas.
 *
 * Masque d'AFFICHAGE seulement (voir `redactMemoryFact`, `@bellum/contracts`) :
 * la ligne stockée n'est jamais réécrite, et cette fonction ne décide QUE
 * quand appliquer le masque, jamais comment.
 */
function shouldRedact(scope: MemoryItemScope, ownedByMe: boolean): boolean {
  return scope === 'workspace' && !ownedByMe
}

function toWireFact(row: MemoryPinnedFactEntity, viewer: MemoryViewer): PinnedFact {
  const scope = row.scope ?? SCOPE_WHEN_ABSENT
  const ownedByMe = row.user_id === viewer.userId
  return {
    id: row.id,
    fact: shouldRedact(scope, ownedByMe) ? redactMemoryFact(row.fact) : row.fact,
    accountId: row.account_id,
    // Les lignes antérieures à la migration `1788241633084` n'ont pas encore été
    // relues par TypeORM avec les nouvelles colonnes dans un test/mock : on
    // retombe sur les DÉFAUTS de la migration, jamais sur une valeur devinée.
    kind: row.kind ?? 'fact',
    origin: row.origin ?? 'manual',
    // #1918.1 — même règle : le défaut de la migration `1792800070000`.
    scope,
    // #1918.2 — le périmètre visé, pour que l'écran le NOMME depuis la liste
    // qu'il a déjà. `?? null` : une ligne relue sans la colonne (mock, onglet
    // ancien) ne désigne aucun périmètre — jamais un identifiant deviné.
    businessUnitId: row.business_unit_id ?? null,
    // #2260.7 — L'OBJET VISÉ, STRUCTURELLEMENT : le type et l'id, lus depuis les
    // quatre colonnes de la ligne. `name` part `null` ici — cette fonction reste
    // SYNCHRONE, la résolution du nom exige une requête ; {@link withResolvedName}
    // la complète juste après, par lot, chez CHAQUE appelant (#2260.7).
    object: withResolvedName(objectLinkOf(row), new Map()),
    // #1916.21 — un booléen calculé pour l'appelant, jamais l'identifiant du
    // propriétaire : l'écran n'a besoin que de savoir s'il peut changer la portée.
    ownedByMe,
    // #1918.7 — la MÊME règle que `unpinFact`, calculée pour l'appelant.
    canForget: mayChangeFact(row, viewer),
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    // Q1 (13/09) — une note de Laura confirmée par une personne. `?? null` : une
    // ligne relue sans la colonne (mock, onglet ancien) n'est pas « confirmée ».
    confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
  }
}

/** Ce dont la résolution a besoin d'une connexion — la même forme que {@link resolveMemoryObjectNames}. */
type ObjectNameRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

/**
 * #2260.7 — COMPLÈTE le NOM de l'objet visé sur un LOT d'éléments déjà mis en
 * forme par `toWireFact` — la résolution est asynchrone (une requête), la mise
 * en forme ne l'est pas.
 *
 * Batché : au plus quatre requêtes pour TOUT le lot (`resolveMemoryObjectNames`
 * regroupe par type), jamais une par ligne. Aucun lien dans le lot : aucune
 * requête (repli rapide, le cas le plus fréquent — la plupart des éléments ne
 * visent aucun objet).
 */
async function attachObjectNames(
  runner: ObjectNameRunner,
  workspaceId: string,
  items: readonly PinnedFact[],
): Promise<PinnedFact[]> {
  if (!items.some(item => item.object)) return [...items]
  const names = await resolveMemoryObjectNames(
    runner,
    workspaceId,
    items.map(item => (item.object ? { type: item.object.type, id: item.object.id } : null)),
  )
  return items.map(item =>
    item.object ? { ...item, object: withResolvedName({ type: item.object.type, id: item.object.id }, names) } : item,
  )
}

/**
 * #1918.7 / #1916.19 / #1916.22 — QUI PEUT CHANGER un élément qu'il voit : son
 * auteur, toujours ; sur un élément PARTAGÉ, un manager de l'espace aussi. La
 * même règle pour RETIRER et pour MODIFIER, écrite une fois (décision de Louis du
 * 13/09 : « pour un élément partagé, la même règle que la suppression »). Elle
 * ne dit rien de ce que l'appelant VOIT : l'élément « moi » d'un collègue est
 * écarté avant, par la lecture ({@link VISIBLE_TO_VIEWER}).
 */
function mayChangeFact(row: MemoryPinnedFactEntity, viewer: MemoryViewer): boolean {
  const scope = row.scope ?? SCOPE_WHEN_ABSENT
  return row.user_id === viewer.userId || (scope === 'workspace' && isMemoryManager(viewer.role))
}

/**
 * #1916.18 / #1916.24 — OÙ LAURA SE SERT DE CET ÉLÉMENT AUJOURD'HUI.
 *
 * Un élément non échu est rendu par `listFacts`, dont les deux seuls lecteurs
 * vers un modèle sont le chat (`POST /ia/chat`) et la question d'un assistant
 * externe (`ask_bellum`), tous deux via `ChatContextService.loadMemory` — la
 * liste et ses citations vivent au contrat (`MEMORY_SURFACES`). Échu, il n'est
 * plus lu par personne : le tableau VIDE dit « non utilisé par Laura
 * aujourd'hui », et l'écran le montre avec sa date. On ne calcule pas une
 * « influence » par réponse : aucune trace ne dit quelle réponse a lu quel
 * élément, et on n'invente pas ce qu'on n'a pas mesuré.
 */
function factSurfaces(row: MemoryPinnedFactEntity, nowMs: number): MemorySurface[] {
  return isMemoryItemExpired(row.expires_at ? row.expires_at.toISOString() : null, nowMs) ? [] : [...MEMORY_SURFACES]
}

/** Une échéance en texte d'historique : ISO 8601, ou `null` = sans échéance. */
function expiryValue(date: Date | null): string | null {
  return date ? date.toISOString() : null
}

/**
 * Normalise un texte pour la comparaison de DOUBLONS uniquement — jamais pour
 * l'affichage ni pour l'écriture, le fait est toujours stocké mot pour mot.
 * Attrape un doublon strict et un doublon qui ne diffère que par la casse, les
 * espaces ou la PONCTUATION (« : », « — », « - », virgules, points…).
 * Volontairement PAS plus loin : voir la doc de `findDuplicateFact`.
 */
function normalisedForDuplicateCheck(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,;:!?'"«»()\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * #1905.13 — CE QUI MANQUE SE VOIT. La marque d'une coupe, un caractère : elle
 * repart dans le prompt, donc elle doit dire « il en manque » sans ouvrir de
 * fausse section ni ressembler à du contenu.
 */
const SUMMARY_ELISION = '\u2026'

/**
 * #1905.13 — UN TEXTE BORNÉ PAR ÉLÉMENT, JAMAIS AU MILIEU D'UN MOT.
 *
 * `slice(0, n)` tombe où il tombe. Sur « SIRET 55204944701905 » il rend
 * « 552049447 », et le modèle reçoit un identifiant ENTIER et FAUX — pire qu'un
 * identifiant absent, parce que rien ne dit qu'il est incomplet. On coupe donc
 * au dernier ESPACE : le mot entamé sort en entier, et {@link SUMMARY_ELISION}
 * NOMME la perte. Un texte sans aucun espace avant la borne ne laisse rien à
 * garder — on rend la seule marque, jamais un fragment.
 */
function boundToWord(text: string, limit: number): string {
  if (text.length <= limit) return text
  // -2 : la place de la marque et de l'espace qui l'annonce.
  const head = text.slice(0, Math.max(0, limit - 2))
  const cut = head.lastIndexOf(' ')
  const kept = cut > 0 ? head.slice(0, cut) : ''
  return kept ? `${kept} ${SUMMARY_ELISION}` : SUMMARY_ELISION
}

function snippet(text: string): string {
  return boundToWord(text.replace(/\s+/g, ' ').trim(), TURN_SNIPPET_MAX)
}

/**
 * Deterministic rolling-summary heuristic — NO LLM call (Théo P2 asks for a
 * best-effort/non-blocking summary; a synchronous LLM summarise would block the
 * chat response). We append one compact line per side of the exchange and keep
 * the tail. A smarter LLM condensation can replace `nextSummary` later behind a
 * flag; the storage/wiring stays the same.
 */
export function nextSummary(previous: string, userMessage: string, assistantReply: string): string {
  const user = snippet(userMessage)
  const assistant = snippet(assistantReply)
  const lines = [
    previous.trim(),
    user ? `• Utilisateur : ${user}` : '',
    assistant ? `• BellumAI : ${assistant}` : '',
  ].filter(line => line.length > 0)
  const joined = lines.join('\n')
  const kept = joined.split('\n').slice(-SUMMARY_MAX_LINES)
  // #1905.5 — LE PLAFOND SE TIENT PAR TOUR, JAMAIS AU MILIEU D'UN.
  //
  // `kept.slice(kept.length - SUMMARY_MAX_CHARS)` coupait la ligne de tête en
  // plein texte : le modèle recevait un fragment SANS sa puce ni son étiquette
  // de rôle, donc une phrase dont il ne savait plus qui l'avait dite — et,
  // ligne d'utilisateur oblige, parfois la moitié d'un identifiant. Un tour
  // entier qui sort est une perte NOMMÉE ; un tour coupé est une phrase FAUSSE.
  // On retire donc des LIGNES ENTIÈRES par la tête (les plus anciennes), et le
  // tour qui vient d'avoir lieu survit toujours.
  while (kept.length > 1 && kept.join('\n').length > SUMMARY_MAX_CHARS) kept.shift()
  // Une ligne HÉRITÉE de l'ancienne coupe peut à elle seule dépasser le
  // plafond : elle se borne par MOT, depuis son DÉBUT — sa puce et son rôle
  // restent lisibles, et ce qui manque est annoncé.
  if (kept.length === 1) kept[0] = boundToWord(kept[0], SUMMARY_MAX_CHARS)
  return kept.join('\n')
}

/**
 * Durable copilot memory (Théo P2): user-pinned facts, per-user preferences and
 * a rolling per-conversation summary. Facts are team-scoped by `workspace_id`
 * (created-by kept on `user_id`); preferences AND conversation summaries are
 * personal (per `user_id`). All writes stamp identity from the JWT-resolved
 * caller — never a body value.
 *
 * La ligne de partage n'est pas arbitraire : un fait épinglé est un geste
 * DÉLIBÉRÉ de partage vers l'équipe, un résumé de conversation est dérivé en
 * silence de ce qu'une personne a écrit. Le second ne traverse donc pas les
 * sièges (D65).
 */
@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(MemoryPinnedFactEntity)
    private readonly facts: Repository<MemoryPinnedFactEntity>,
    @InjectRepository(UserPreferenceEntity)
    private readonly preferences: Repository<UserPreferenceEntity>,
    @InjectRepository(ConversationSummaryEntity)
    private readonly summaries: Repository<ConversationSummaryEntity>,
    // La trace des interventions proactives — la SEULE ligne de la « couche 5 »
    // du tome 6 qui existe vraiment : « ce qu'il a refusé, et quand ». Elle est
    // écrite par le module Laura ; on la LIT et on sait l'oublier, on ne touche
    // pas à son écriture.
    @InjectRepository(LauraInterventionEntity)
    private readonly interventions: Repository<LauraInterventionEntity>,
    // COUCHE 1 — le prénom. Il est lu à chaque tour par
    // `ChatContextService.resolveFirstName` et entre dans le prompt sous
    // « LA PERSONNE À QUI TU PARLES ». On le LIT ici, on ne l'écrit jamais :
    // il se corrige dans Réglages › Mon compte.
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    // COUCHES 1 et 2 — le profil résolu, celui-là même que le copilote reçoit.
    // On passe par le résolveur PARTAGÉ et non par une lecture maison :
    // la fusion « profil canonique de l'espace + surcouche personnelle » est
    // une dérivation, et une dérivation vit à un seul endroit. Deux chemins qui
    // la refont divergent, et l'écran de transparence montrerait alors autre
    // chose que ce qui part réellement dans le prompt.
    // Il rend AUSSI les deux lignes de profil brutes (`resolveContext`), dont on
    // ne garde que la DATE : `resolveProfileData` rend des valeurs, pas le jour
    // où elles ont été saisies, et on ne fabrique pas un « retenu aujourd'hui »
    // pour un champ écrit en mars.
    private readonly esnProfile: EsnProfileWorkspaceResolver,
    // #1916.23 — le journal des gestes sur un élément épinglé. Injecté EN
    // DERNIER : un paramètre inséré au milieu décalerait chaque construction
    // positionnelle des specs, sans que rien ne jette.
    @InjectRepository(MemoryFactEventEntity)
    private readonly events: Repository<MemoryFactEventEntity>,
  ) {}

  /**
   * Une écriture d'élément ET son geste journalisé, ou rien : un texte réécrit
   * sans trace ferait mentir l'historique, une trace sans écriture raconterait un
   * geste qui n'a pas eu lieu.
   */
  private inTransaction<T>(
    work: (repos: {
      facts: Repository<MemoryPinnedFactEntity>
      events: Repository<MemoryFactEventEntity>
    }) => Promise<T>,
  ): Promise<T> {
    return this.facts.manager.transaction(em =>
      work({ facts: em.withRepository(this.facts), events: em.withRepository(this.events) }),
    )
  }

  /** L'élément `id` tel que l'appelant le VOIT dans son espace (#1918.1), ou `null`. */
  private visibleFact(id: string, workspaceId: string, userId: string): Promise<MemoryPinnedFactEntity | null> {
    return (
      this.facts
        .createQueryBuilder('f')
        .where('f.id = :id', { id })
        .andWhere('f.workspace_id = :ws', { ws: workspaceId })
        // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
        .andWhere(NOT_ARCHIVED_ALIASED)
        .andWhere(VISIBLE_TO_VIEWER, { viewer: userId })
        .getOne()
    )
  }

  /**
   * Un geste à journaliser, estampillé de l'espace RÉSOLU et de son auteur (le
   * jeton). `workspaceId` est celui de la lecture qui a trouvé la ligne — jamais
   * une valeur de remplissage.
   */
  private eventRow(
    events: Repository<MemoryFactEventEntity>,
    workspaceId: string,
    row: MemoryPinnedFactEntity,
    actorUserId: string,
    event: MemoryItemEvent,
    previousValue: string | null,
    newValue: string | null,
  ): MemoryFactEventEntity {
    return events.create({
      workspace_id: workspaceId,
      fact_id: row.id,
      actor_user_id: actorUserId,
      event,
      previous_value: previousValue,
      new_value: newValue,
    })
  }

  /**
   * Épingle un élément de mémoire. `kind` / `origin` / `expiresAt` sont
   * optionnels et retombent sur les défauts historiques (`fact`, `manual`, pas
   * d'échéance) : un appelant qui les ignore épingle exactement ce qu'il
   * épinglait avant. Une échéance illisible n'est PAS stockée — on ne périme
   * rien sur une date qu'on n'a pas su lire.
   *
   * ⚠️ Mesuré en production le 10/09/2026 sur `/settings/memory` : trois faits
   * rendus SIX lignes, deux paires ne différant que par la ponctuation, la
   * troisième un doublon à l'octet près — parce qu'AUCUNE vérification n'avait
   * lieu avant l'insertion. Un texte déjà épingé (même normalisé) NE CRÉE PAS
   * une seconde ligne : on rend la ligne EXISTANTE. Ce n'est pas une fusion de
   * deux objets métier (la doctrine l'interdit) — il n'y a jamais eu qu'un seul
   * objet, on empêche seulement son doublon de naître. `pin_memory_fact`
   * (#1793, la proposition de Laura) passe par CETTE même méthode : la corriger
   * ici protège les deux appelants (le geste manuel et celui de Laura), pas un
   * chemin en plus.
   */
  async pinFact(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    fact: string
    kind?: MemoryItemKind
    origin?: MemoryItemOrigin
    expiresAt?: string | null
    /** #1918.1 — une des quatre portées, validée au DTO. Absente ⇒ {@link scopeWhenAbsent} (#1918.8). */
    scope?: MemoryItemScope
    /** #1918.5 — le fil visé quand `scope = 'conversation'` ; avec `accountId`,
     *  il donne la clé par {@link conversationKey}. */
    conversationId?: string | null
    /** #1918.2 — le périmètre visé quand `scope = 'business_unit'`. */
    businessUnitId?: string | null
    /** #1918.2 — les périmètres que l'appelant PORTE, résolus au bord. Ce champ
     *  AUTORISE ; `businessUnitId` ne fait que désigner. */
    businessUnitIds?: readonly string[]
    /**
     * #2260.7 — L'OBJET VISÉ : contact, besoin, consultant ou mission, à côté
     * d'`accountId`. `null`/absent = aucun objet visé, le comportement
     * historique. Aucune vérification d'appartenance ici (contrairement à
     * `businessUnitId`) : ces quatre référentiels sont déjà bornés à l'espace
     * par LEUR propre porte d'écriture — celle-ci ne fait que DÉSIGNER.
     */
    object?: MemoryItemObjectInput | null
  }): Promise<PinnedFact> {
    const fact = args.fact.trim()
    const scope = args.scope ?? scopeWhenAbsent(args.kind)
    // #1918.2 / #1918.5 — la DÉSIGNATION n'est retenue que pour la portée qui
    // la demande : un `conversationId` envoyé avec « toi uniquement » ne
    // rattache rien (l'écran de chat l'envoie toujours, quelle que soit la
    // portée choisie), et une colonne remplie sans portée mentirait sur ce que
    // la ligne est.
    const conversation = scope === 'conversation' ? conversationKey(args.accountId, args.conversationId) : null
    const businessUnitId = scope === 'business_unit' ? (args.businessUnitId ?? null) : null
    if (scope === 'business_unit') {
      // #1918.2 — ON N'ÉPINGLE PAS POUR UNE ÉQUIPE DONT ON N'EST PAS. Le corps
      // DÉSIGNE un périmètre ; ce qui AUTORISE est l'appartenance, résolue au
      // bord depuis `business_unit_members`. Sans ce contrôle, n'importe quel
      // membre écrirait dans la mémoire de n'importe quelle agence.
      if (!businessUnitId || !(args.businessUnitIds ?? []).includes(businessUnitId)) {
        throw new ForbiddenException("Ce périmètre n'est pas l'un des vôtres.")
      }
    }
    const duplicate = await this.findDuplicateFact({
      workspaceId: args.workspaceId,
      userId: args.userId,
      accountId: args.accountId,
      fact,
      scope,
      conversationKey: conversation,
      businessUnitId,
      object: args.object ?? null,
    })
    if (duplicate) {
      const wired = toWireFact(duplicate, { userId: args.userId })
      return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
    }

    // #2260.7 — L'OBJET VISÉ, écrit dans SA colonne — les trois autres à
    // `null` (contrainte `memory_pinned_facts_object_single_check`, posée
    // AVANT ce code par la migration `1795694318557`, GA-11 / GA-12).
    const objectColumns = objectColumnsFor(args.object)
    const row = this.facts.create({
      // Le PROPRIÉTAIRE : l'utilisateur authentifié (`CurrentUser`), jamais un
      // champ du corps — le DTO n'en porte aucun.
      user_id: args.userId,
      workspace_id: args.workspaceId,
      account_id: args.accountId,
      fact,
      kind: args.kind ?? 'fact',
      origin: args.origin ?? 'manual',
      // #1917.3 — la portée choisie à la confirmation.
      scope,
      // #1918.5 / #1918.2 — ce que la portée DÉSIGNE, `null` pour les deux
      // portées durables : la contrainte SQL dit la même chose (`1795204871293`).
      conversation_id: conversation,
      business_unit_id: businessUnitId,
      expires_at: parseExpiry(args.expiresAt),
      ...objectColumns,
    })
    const wired = toWireFact(await this.facts.save(row), { userId: args.userId })
    return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
  }

  /**
   * Un fait déjà épinglé, MÊME PORTÉE (compte, ou global), qui ne diffère du
   * nouveau que par la casse, les espaces ou un séparateur (« : », « — »,
   * « - »). Bornée à la comparaison de deux chaînes — elle n'attrape PAS un
   * doublon qui change de VOCABULAIRE (« six » contre « 6 ») : une
   * normalisation numérique irait au-delà de « empêcher une insertion en
   * double », et resterait fragile (elle devrait connaître tous les nombres en
   * lettres du français). Les faits EXPIRÉS ne comptent pas : un fait périmé
   * qu'on ré-épingle n'est pas un doublon, c'est une confirmation qu'il tient
   * toujours.
   */
  private async findDuplicateFact(args: {
    workspaceId: string
    userId: string
    accountId: string | null
    fact: string
    scope: MemoryItemScope
    /** #1918.5 — la clé du fil visé, `null` hors de la portée « conversation ». */
    conversationKey?: string | null
    /** #1918.2 — le périmètre visé, `null` hors de la portée « équipe ». */
    businessUnitId?: string | null
    /** #2260.7 — l'objet visé, `null` = aucun. */
    object?: MemoryItemObjectInput | null
  }): Promise<MemoryPinnedFactEntity | null> {
    const target = normalisedForDuplicateCheck(args.fact)
    if (!target) return null
    const qb = this.facts
      .createQueryBuilder('f')
      .where('f.workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('(f.expires_at IS NULL OR f.expires_at > now())')
      // #2439.10 — une mémoire OUBLIÉE n'est pas un doublon : sans cette borne,
      // ré-épingler un texte oublié rendrait la ligne archivée (donc un 409, ou
      // une résurrection silencieuse) au lieu d'en créer une neuve.
      .andWhere(NOT_ARCHIVED_ALIASED)
      // #1918.1 — un doublon est de la MÊME portée. Sans cette borne, épingler
      // pour soi un texte déjà partagé rendait la ligne partagée (la demande
      // « moi » n'était pas tenue) — et l'inverse rendait une ligne privée.
      .andWhere('f.scope = :scope', { scope: args.scope })
    // #1918.1 — et un doublon « moi » est le SIEN : sans cette borne, épingler
    // le même texte qu'un élément « moi » d'un collègue RENDAIT la ligne du
    // collègue (son identifiant, son existence) au lieu d'en créer une.
    // #1918.5 — une mémoire de FIL est elle aussi la SIENNE, et celle de CE fil :
    // sans ces deux bornes, épingler la même phrase dans deux conversations
    // rendrait la ligne de la première, donc une mémoire attachée au mauvais fil.
    if (args.scope === 'user' || args.scope === 'conversation') {
      qb.andWhere('f.user_id = :viewer', { viewer: args.userId })
    }
    if (args.scope === 'conversation') {
      qb.andWhere('f.conversation_id = :conv', { conv: args.conversationKey })
    }
    // #1918.2 — et un doublon d'équipe est celui du MÊME périmètre : la même
    // règle qu'une agence voisine peut poser sans écraser celle d'à côté.
    if (args.scope === 'business_unit') {
      qb.andWhere('f.business_unit_id = :bu', { bu: args.businessUnitId })
    }
    if (args.accountId) qb.andWhere('f.account_id = :acc', { acc: args.accountId })
    else qb.andWhere('f.account_id IS NULL')
    // #2260.7 — et un doublon d'OBJET est celui du MÊME objet : sans cette
    // borne, épingler le même texte pour deux contacts distincts rendrait la
    // ligne du premier — une mémoire attachée au mauvais contact.
    if (args.object) {
      qb.andWhere(`f.${objectColumnFor(args.object.type)} = :objectId`, { objectId: args.object.id })
    } else {
      qb.andWhere('f.contact_id IS NULL AND f.need_id IS NULL AND f.consultant_id IS NULL AND f.mission_id IS NULL')
    }
    const candidates = await qb.getMany()
    return candidates.find(row => normalisedForDuplicateCheck(row.fact) === target) ?? null
  }

  /**
   * Retire un élément. Borné par l'espace ET, depuis #1918.1, par ce que
   * l'appelant peut VOIR : l'élément « moi uniquement » d'un collègue est hors
   * d'atteinte, même avec son identifiant.
   *
   * #1918.7 — décision de Louis du 13/09/2026 : un élément PARTAGÉ ne se retire
   * que par son AUTEUR ou un MANAGER de l'espace ({@link MEMORY_SHARED_FORGET_ROLES}).
   * Avant, n'importe quel membre retirait la règle d'un collègue. Le critère est
   * DANS la requête de suppression (un membre simple : `user_id` = lui ; un
   * manager : ce qu'il voit), pour qu'aucun changement de portée ne se glisse
   * entre une vérification et la suppression.
   *
   * Quand rien n'est parti, une lecture dit POURQUOI, et seulement sur ce que
   * l'appelant voit déjà :
   *  · ligne visible (l'élément partagé d'un collègue) → 403, le code du dépôt
   *    pour « pas le droit » (`WorkspacePermissionGuard`, `assertRole`) ;
   *  · ligne invisible (absente, autre espace, « moi » d'un collègue — y compris
   *    pour un manager : la portée privée gagne sur le rôle) → 404, qui ne dit
   *    pas qu'elle existe.
   */
  async unpinFact(args: { id: string; workspaceId: string; userId: string; role?: WorkspaceRole }): Promise<void> {
    const manager = isMemoryManager(args.role)
    // #1962.28 — le texte, lu AVANT la suppression : il sert à en retirer la
    // trace du résumé roulant, juste après. Lecture SANS le filtre de
    // visibilité — rien n'en sort vers l'appelant, et la permission reste
    // tenue par la suppression elle-même qui suit : un texte qu'on n'a pas pu
    // supprimer (0 ligne affectée) ne fait l'objet d'aucune récriture.
    const target = await this.facts.findOne({ where: { id: args.id, workspace_id: args.workspaceId } })
    // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026).
    // Un UPDATE, plus un DELETE : même critère qu'avant — donc les mêmes 403 et
    // 404 —, plus `archived_at IS NULL`, pour qu'un second oubli sur la même
    // ligne réponde 404 au lieu d'un succès qui n'a rien changé.
    const result = await this.facts
      .createQueryBuilder()
      .update()
      .set({ archived_at: new Date() })
      .where('id = :id', { id: args.id })
      .andWhere('workspace_id = :ws', { ws: args.workspaceId })
      .andWhere(NOT_ARCHIVED_UNALIASED)
      .andWhere(manager ? VISIBLE_TO_VIEWER_UNALIASED : AUTHORED_BY_VIEWER_UNALIASED, { viewer: args.userId })
      .execute()
    if (result.affected) {
      if (target?.fact) await this.redactFactFromSummaries(args.workspaceId, target.fact)
      return
    }

    // Un manager a déjà tenté tout ce qu'il voit : rien de visible n'existe.
    if (!manager && (await this.isVisibleToViewer(args))) {
      throw new ForbiddenException("Seul son auteur ou un manager de l'espace peut retirer cet élément partagé.")
    }
    throw new NotFoundException('Fait épinglé introuvable')
  }

  /**
   * #1962.28 — NOTE SUPPRIMÉE NE REVIENT PAS VIA LE RÉSUMÉ.
   *
   * `conversation_summaries.summary` est un texte DÉTERMINISTE ({@link nextSummary}),
   * pas régénéré par un modèle : sans ce retrait, la phrase d'un fait oublié y
   * resterait pour toujours, et `getConversationSummary` la relirait au tour
   * suivant comme si l'oubli n'avait jamais eu lieu — exactement la fuite que
   * la suppression réelle (#1916.25 / #1962.26) ferme déjà côté `listFacts`.
   *
   * Retrait par ÉGALITÉ EXACTE du texte épinglé, jamais un fragment plus
   * large : un remplacement plus permissif emporterait autre chose que ce que
   * la personne a demandé d'oublier. Porté à l'ESPACE entier (comme la portée
   * `workspace` d'un fait partagé) : un fait partagé a pu être mentionné dans
   * la conversation de N'IMPORTE quel membre.
   */
  private async redactFactFromSummaries(workspaceId: string, factText: string): Promise<void> {
    const text = factText.trim()
    if (!text) return
    // #2439.10 — une ligne ARCHIVÉE n'est plus relue : la réécrire ne
    // protégerait rien et modifierait une archive.
    const rows = await this.summaries.find({ where: { workspace_id: workspaceId, ...NOT_ARCHIVED } })
    for (const row of rows) {
      if (!row.summary || !row.summary.includes(text)) continue
      const redacted = row.summary.split(text).join('')
      await this.summaries.update(row.id, { summary: redacted })
    }
  }

  /**
   * #1918.7 — cet élément existe-t-il dans CET espace, parmi ce que l'appelant
   * peut voir (partagé, ou le sien) ? Sert seulement à choisir entre 403 et 404
   * quand une suppression n'a rien retiré.
   *
   * Méthode à part, et non en ligne dans `unpinFact` : collée juste sous la
   * suppression SANS alias, cette lecture AVEC alias (`f.id`) tombait dans la
   * fenêtre de `database/query-builder-alias.spec.ts`, qui interdit un prédicat
   * préfixé sur un query builder créé sans alias — la forme exacte qui a cassé
   * la phase classify le 17/08. (Ce commentaire ne recopie pas l'appel nu : la
   * garde lit le source ligne à ligne, commentaires compris.)
   */
  private async isVisibleToViewer(args: { id: string; workspaceId: string; userId: string }): Promise<boolean> {
    const row = await this.facts
      .createQueryBuilder('f')
      .where('f.id = :id', { id: args.id })
      .andWhere('f.workspace_id = :ws', { ws: args.workspaceId })
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
      .andWhere(NOT_ARCHIVED_ALIASED)
      .andWhere(VISIBLE_TO_VIEWER, { viewer: args.userId })
      .getOne()
    return row !== null
  }

  /**
   * #1916.21 — CHANGER LA PORTÉE d'un élément, par son PROPRIÉTAIRE seul.
   *
   * La borne est dans le critère de la requête (`user_id` = l'appelant), pas
   * dans une vérification préalable : un collègue reçoit le même 404 qu'un
   * identifiant inexistant, et ne peut ni privatiser une règle partagée qu'il
   * n'a pas posée, ni apprendre qu'un élément personnel existe.
   */
  async setFactScope(args: {
    id: string
    workspaceId: string
    userId: string
    scope: MemoryItemScope
  }): Promise<PinnedFact> {
    // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
    // une ligne oubliée ne se re-porte plus, elle répond 404 comme une absente.
    const owned = { id: args.id, workspace_id: args.workspaceId, user_id: args.userId, ...NOT_ARCHIVED }
    const row = await this.facts.findOne({ where: owned })
    if (!row) throw new NotFoundException('Élément de mémoire introuvable')
    const previous = row.scope ?? SCOPE_WHEN_ABSENT
    // #1916.23 — redemander la portée actuelle ne change rien : rien ne s'écrit,
    // ni dans la ligne ni dans l'historique.
    if (previous === args.scope) {
      const wired = toWireFact(row, { userId: args.userId })
      return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
    }
    await this.inTransaction(async ({ facts, events }) => {
      // Le critère reste `owned` : un collègue n'atteint jamais la ligne.
      const result = await facts.update(owned, { scope: args.scope })
      if (!result.affected) throw new NotFoundException('Élément de mémoire introuvable')
      await events.save(
        this.eventRow(events, args.workspaceId, row, args.userId, 'scope_changed', previous, args.scope),
      )
    })
    const wired = toWireFact({ ...row, scope: args.scope }, { userId: args.userId })
    return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
  }

  /**
   * #1916.19 / #1916.22 — MODIFIER LE TEXTE ET/OU L'ÉCHÉANCE d'un élément.
   *
   * Qui : la règle de la suppression (#1918.7, {@link mayChangeFact}) — l'auteur ;
   * sur un élément partagé, un manager aussi. Sur ce que l'appelant voit
   * seulement : l'élément « moi » d'un collègue est un 404, manager comprise, et
   * un autre espace aussi. Le critère est répété DANS la requête d'écriture,
   * pour qu'aucun changement de portée ne se glisse entre la vérification et
   * l'écriture.
   *
   * Une correction humaine gagne : le texte réécrit est ce que Laura relit au
   * tour suivant (`listFacts` est sa seule lecture). Un texte qui DOUBLE un autre
   * élément de même portée est refusé (409) — le doublon est le défaut mesuré
   * le 10/09 en production, il ne revient pas par la modification.
   *
   * L'échéance : `null` la retire ; une date passée ou illisible est refusée
   * (400) — « ajouter une échéance » ne périme pas un élément d'un clic. Un
   * élément ÉCHU dont on repousse l'échéance redevient lu.
   *
   * Chaque changement effectif est journalisé avec son AUTEUR, dans la même
   * transaction que l'écriture (#1916.23). Rien de changé : rien d'écrit.
   */
  async updateFact(args: {
    id: string
    workspaceId: string
    userId: string
    /** Le rôle d'espace RÉSOLU de l'appelant (jamais un champ du corps). */
    role?: WorkspaceRole
    fact?: string
    expiresAt?: string | null
    /** #1962.19 — confirmer une note de Laura SANS réécrire son texte. */
    confirm?: boolean
  }): Promise<PinnedFact> {
    const viewer: MemoryViewer = { userId: args.userId, role: args.role }
    const row = await this.visibleFact(args.id, args.workspaceId, args.userId)
    if (!row) throw new NotFoundException('Élément de mémoire introuvable')
    if (!mayChangeFact(row, viewer)) {
      throw new ForbiddenException("Seul son auteur ou un manager de l'espace peut modifier cet élément partagé.")
    }

    const patch: Partial<Pick<MemoryPinnedFactEntity, 'fact' | 'expires_at' | 'confirmed_at' | 'confirmed_by'>> = {}
    const changes: Array<{ event: MemoryItemEvent; previous: string | null; next: string | null }> = []

    if (args.fact !== undefined) {
      const text = args.fact.trim()
      if (!text) throw new BadRequestException('Le texte d’un élément de mémoire ne peut pas être vide.')
      if (text !== row.fact) {
        const duplicate = await this.findDuplicateFact({
          workspaceId: args.workspaceId,
          // Pas `row.user_id` : il vaut `null` après l'effacement d'un compte
          // (#1939). L'appelant suffit — un doublon « moi » ne se cherche que sur
          // une ligne « moi », et une telle ligne n'est visible, donc modifiable,
          // que par son propriétaire (`visibleFact`) : c'est lui.
          userId: args.userId,
          accountId: row.account_id,
          fact: text,
          scope: row.scope ?? SCOPE_WHEN_ABSENT,
        })
        if (duplicate && duplicate.id !== row.id) {
          throw new ConflictException('Un élément identique existe déjà dans cette mémoire.')
        }
        patch.fact = text
        changes.push({ event: 'text_changed', previous: row.fact, next: text })
        // Q1 (décision de Louis du 13/09) — une personne qui RÉÉCRIT le texte
        // d'une note de Laura la confirme : « Confirmée par <prénom> », et Laura
        // la range avec les faits déclarés. L'origine n'est PAS réécrite. Le
        // dernier à réécrire est le confirmateur : le libellé répond du texte
        // actuel, l'historique garde chaque geste. Une échéance seule ne
        // confirme rien — une date dit jusqu'à quand, pas que c'est vrai.
        if ((row.origin ?? 'manual') === 'copilot') {
          patch.confirmed_at = new Date()
          patch.confirmed_by = args.userId
        }
      }
    }

    if (args.expiresAt !== undefined) {
      const next = args.expiresAt === null ? null : parseExpiry(args.expiresAt)
      if (args.expiresAt !== null && !next) throw new BadRequestException('Cette échéance n’a pas pu être lue.')
      if (next && next.getTime() <= Date.now()) {
        throw new BadRequestException('Une échéance se pose dans le futur.')
      }
      if (expiryValue(next) !== expiryValue(row.expires_at)) {
        patch.expires_at = next
        changes.push({ event: 'expiry_changed', previous: expiryValue(row.expires_at), next: expiryValue(next) })
      }
    }

    // #1962.19 — CONFIRMER une note de Laura sans réécrire son texte : un geste
    // DÉDIÉ, distinct du côté-effet de la réécriture ci-dessus (Q1, 13/09). Rien
    // à journaliser à part : `confirmed_at`/`confirmed_by` se lisent sur la
    // ligne elle-même, la même raison que « created » n'a pas d'entrée dans
    // `memory_fact_events` (#1916.23). Sur un fait DÉCLARÉ ou déjà confirmé :
    // no-op silencieux, jamais une erreur pour un geste qui ne change rien.
    if (args.confirm === true && (row.origin ?? 'manual') === 'copilot' && !row.confirmed_at) {
      patch.confirmed_at = new Date()
      patch.confirmed_by = args.userId
    }

    if (changes.length === 0 && patch.confirmed_at === undefined) {
      const wired = toWireFact(row, viewer)
      return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
    }

    await this.inTransaction(async ({ facts, events }) => {
      const result = await facts
        .createQueryBuilder()
        .update()
        .set(patch)
        .where('id = :id', { id: args.id })
        .andWhere('workspace_id = :ws', { ws: args.workspaceId })
        // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
        .andWhere(NOT_ARCHIVED_UNALIASED)
        .andWhere(isMemoryManager(args.role) ? VISIBLE_TO_VIEWER_UNALIASED : AUTHORED_BY_VIEWER_UNALIASED, {
          viewer: args.userId,
        })
        .execute()
      if (!result.affected) throw new NotFoundException('Élément de mémoire introuvable')
      await events.save(
        changes.map(change =>
          this.eventRow(events, args.workspaceId, row, args.userId, change.event, change.previous, change.next),
        ),
      )
    })
    const wired = toWireFact({ ...row, ...patch }, viewer)
    return (await attachObjectNames(this.facts.manager, args.workspaceId, [wired]))[0]
  }

  /**
   * #1916.23 — L'HISTOIRE d'un élément que l'appelant VOIT : sa création (lue
   * sur la ligne — date, auteur, texte d'origine), puis chaque geste journalisé,
   * du plus ancien au plus récent, avec le PRÉNOM de qui l'a fait.
   *
   * Le texte d'origine est l'« avant » du premier `text_changed` quand il y en a
   * un ; sinon c'est le texte actuel. Aucun identifiant ne sort : les auteurs sont
   * résolus parmi les membres de l'espace, et un auteur inconnu est `null`.
   */
  async factHistory(args: { id: string; workspaceId: string; userId: string }): Promise<MemoryItemHistory> {
    const row = await this.visibleFact(args.id, args.workspaceId, args.userId)
    if (!row) throw new NotFoundException('Élément de mémoire introuvable')
    const steps = (
      await this.events.find({
        where: { fact_id: row.id, workspace_id: args.workspaceId },
        order: { created_at: 'ASC' },
      })
    ).sort((a, b) => a.created_at.getTime() - b.created_at.getTime())
    const authors = await resolveWorkspaceAuthors(this.facts.manager, args.workspaceId, [
      row.user_id,
      ...steps.map(step => step.actor_user_id),
    ])
    const originalText = steps.find(step => step.event === 'text_changed')?.previous_value ?? row.fact
    // #1918.1 (masquage) — MÊME règle que `toWireFact` : l'historique d'un
    // élément PARTAGÉ est lisible par tout membre de l'espace (`visibleFact`),
    // donc un secret collé par erreur puis corrigé resterait lisible dans
    // l'« avant » d'un `text_changed` si seul `toWireFact` masquait.
    const scope = row.scope ?? SCOPE_WHEN_ABSENT
    const mask = shouldRedact(scope, row.user_id === args.userId)
    const redact = (value: string | null): string | null => (mask && value ? redactMemoryFact(value) : value)
    return {
      entries: [
        {
          event: 'created',
          at: row.created_at.toISOString(),
          // #1939 — un auteur effacé (`user_id` null) est inconnu, jamais deviné.
          author: row.user_id ? (authors.get(row.user_id) ?? null) : null,
          previousValue: null,
          newValue: redact(originalText),
        },
        ...steps.map(step => ({
          event: step.event,
          at: step.created_at.toISOString(),
          author: step.actor_user_id ? (authors.get(step.actor_user_id) ?? null) : null,
          previousValue: redact(step.previous_value),
          newValue: redact(step.new_value),
        })),
      ],
    }
  }

  /**
   * Facts for the workspace, newest first. When `accountId` is given, returns
   * the global (account-less) facts AND that account's facts — the set the
   * copilot should remember on an active account.
   *
   * Les éléments EXPIRÉS sont exclus ici, et donc partout : c'est la SEULE
   * lecture de la mémoire (la carte « Mémoire » comme le contexte du copilote,
   * `ChatContextService.loadMemory`, passent par cette méthode). Un fait daté
   * cesse d'exister pour le copilote à l'instant où son échéance passe —
   * « un fait épinglé est vrai pour toujours » était le défaut relevé par
   * l'audit V2 §20.
   *
   * #1918.1 — ⚠️ `userId` est OBLIGATOIRE, et c'est la garantie : la lecture ne
   * rend que les éléments PARTAGÉS avec l'espace et ceux que l'APPELANT a
   * épinglés. Ses appelants, tous passés par ce paramètre (le compilateur refuse
   * un appel qui l'oublie) :
   *  · `MemoryController.listFacts` — `GET /memory/facts` (carte Mémoire, barre) ;
   *  · `MemoryService.ledgerFacts` → `readLedger` — `GET /memory/ledger` (écran
   *    Réglages › Mémoire) ET le pont copilote `laura/memory-ledger` (outil
   *    `get_memory` de Laura) ;
   *  · `ChatContextService.loadMemory` — le contexte envoyé au modèle (chat web
   *    et `ask_bellum` du MCP).
   * Avant ce lot, `workspace_id` seul : l'élément personnel de chacun partait
   * dans le prompt de tous.
   */
  async listFacts(args: {
    workspaceId: string
    userId: string
    accountId?: string | null
    /** #1918.7 — le rôle d'espace RÉSOLU de l'appelant, pour `canForget`. Absent
     *  (contexte du modèle) : règle du membre simple. Ne filtre RIEN. */
    role?: WorkspaceRole
    /** #1918.2 — les périmètres PORTÉS par l'appelant. Absents : aucune mémoire
     *  d'équipe n'est lue (repli fermé — voir {@link ViewerReach}). */
    businessUnitIds?: readonly string[]
    /**
     * #1918.5 — LE FIL COURANT, quand la lecture en a un : le tour de chat et
     * l'écran de mémoire OUVERT DANS un fil. Sa clé est dérivée ICI, par la
     * même fonction que l'écriture et que la suppression du fil — trois
     * dérivations de la même clé divergeraient (GA-26).
     */
    thread?: { accountId: string | null; conversationId: string | null }
  }): Promise<PinnedFact[]> {
    const rows = await this.readVisibleFacts({
      workspaceId: args.workspaceId,
      userId: args.userId,
      accountId: args.accountId,
      includeExpired: false,
      reach: {
        businessUnitIds: args.businessUnitIds,
        conversationKey: args.thread ? conversationKey(args.thread.accountId, args.thread.conversationId) : null,
      },
    })
    const wired = rows.map(row => toWireFact(row, { userId: args.userId, role: args.role }))
    return attachObjectNames(this.facts.manager, args.workspaceId, wired)
  }

  /**
   * LA requête de lecture des éléments épinglés — écrite une fois, pour que
   * l'écran et le contexte du modèle ne puissent pas diverger sur ce que
   * l'appelant VOIT (#1918.1).
   *
   * `includeExpired` n'est vrai que pour la vue ÉCRAN du registre (#1916.22) :
   * un élément échu « redevient inconnu avec sa date », il ne disparaît pas de
   * l'écran — mais il ne part plus jamais au modèle, et `listFacts` (la lecture
   * du copilote) ne le demande donc jamais.
   */
  private readVisibleFacts(args: {
    workspaceId: string
    userId: string
    accountId?: string | null
    includeExpired: boolean
    reach?: ViewerReach
  }): Promise<MemoryPinnedFactEntity[]> {
    const qb = this.facts
      .createQueryBuilder('f')
      .where('f.workspace_id = :ws', { ws: args.workspaceId })
      // #1918.1 — un élément « moi uniquement » n'atteint JAMAIS un autre membre.
      // #1918.2 / #1918.5 — et un élément d'ÉQUIPE ou de FIL n'atteint que qui
      // porte le périmètre, ou que le fil où il a été écrit.
      .andWhere(visibleToViewer('f.', args.reach), viewerReachParams(args.userId, args.reach))
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
      // une mémoire oubliée est INCONNUE de l'écran comme du modèle, y compris
      // dans la vue `includeExpired` du registre — un élément ÉCHU reste
      // affiché avec sa date, un élément OUBLIÉ ne s'affiche plus du tout.
      .andWhere(NOT_ARCHIVED_ALIASED)
    if (!args.includeExpired) qb.andWhere('(f.expires_at IS NULL OR f.expires_at > now())')
    if (args.accountId) {
      qb.andWhere('(f.account_id IS NULL OR f.account_id = :acc)', { acc: args.accountId })
    }
    return qb.orderBy('f.created_at', 'DESC').limit(200).getMany()
  }

  async getPreferences(userId: string): Promise<Record<string, unknown>> {
    const row = await this.preferences.findOne({ where: { user_id: userId } })
    return row?.preferences ?? {}
  }

  /** Shallow-merge `patch` into the existing bag (upsert on first write). */
  async patchPreferences(userId: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.preferences.findOne({ where: { user_id: userId } })
    const merged = { ...(existing?.preferences ?? {}), ...patch }
    if (existing) {
      existing.preferences = merged
      await this.preferences.save(existing)
    } else {
      await this.preferences.save(this.preferences.create({ user_id: userId, preferences: merged }))
    }
    return merged
  }

  /**
   * Le résumé roulant de CETTE personne sur ce fil.
   *
   * ⚠️ `user_id` est la première borne, et ce n'est pas décoratif : la lecture
   * s'est longtemps faite sur `(workspace_id, conversation_id)` seuls, alors que
   * le web envoie `conversation_id = "general"` pour le fil par défaut. Tous les
   * membres d'un espace lisaient donc la même ligne, et les extraits de ce qu'un
   * collègue avait écrit à Laura entraient dans le prompt de chacun — ce que D65
   * interdit. `superseded_at IS NULL` écarte en plus les lignes écrites sous
   * l'ancienne portée, qui mélangent plusieurs auteurs sans qu'on puisse les
   * démêler.
   */
  async getConversationSummary(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId?: string | null
  }): Promise<string | null> {
    const row = await this.summaries.findOne({
      where: this.summaryScope(args.userId, args.workspaceId, conversationKey(args.accountId, args.conversationId)),
    })
    const summary = row?.summary?.trim()
    return summary ? summary : null
  }

  /**
   * #1955.30 — LE MÊME résumé que `getConversationSummary`, avec sa date : le
   * registre (`ledger`) le montrait déjà, mais nulle part dans `/chat`, là où
   * la personne travaille — voir la trace #1955 pour la distinction entre les
   * deux écrans. Même borne (`summaryScope`), même repli « vide = aucune
   * ligne » : un résumé blanc n'est pas une mémoire, `getConversationSummary`
   * ne le sert pas non plus au modèle.
   */
  async getConversationSummaryDetail(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId?: string | null
  }): Promise<ConversationSummaryView> {
    const row = await this.summaries.findOne({
      where: this.summaryScope(args.userId, args.workspaceId, conversationKey(args.accountId, args.conversationId)),
    })
    if (!row) return null
    const summary = row.summary?.trim()
    if (!summary) return null
    return {
      summary,
      updatedAt: row.updated_at.toISOString(),
      // #1955.24-.28 — la MÊME ligne, par catégorie : l'état structuré que Laura
      // écrit à chaque tour, lu comme donnée non fiable (`parseThreadState`).
      sections: conversationSummarySections(parseThreadState(row.thread_state)),
    }
  }

  /**
   * #1955.31 — « Une correction humaine gagne toujours, quelle que soit sa
   * date » (CLAUDE.md, doctrine « Ce qui n'écrit pas tout seul »). Le texte
   * remplace la ligne VIVANTE et rien d'autre : `appendConversationTurn` relit
   * cette même ligne au tour suivant et bâtit dessus, la correction survit
   * donc au prochain échange au lieu d'être effacée par lui.
   *
   * Aucune ligne à corriger ⇒ 404 : on ne CRÉE pas un résumé qui n'a jamais
   * existé sous couvert d'une « correction » — ce serait inventer une mémoire
   * (doctrine « JAMAIS de donnée fictive »).
   */
  async correctConversationSummary(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId?: string | null
    summary: string
  }): Promise<NonNullable<ConversationSummaryView>> {
    const key = conversationKey(args.accountId, args.conversationId)
    const existing = await this.summaries.findOne({
      where: this.summaryScope(args.userId, args.workspaceId, key),
    })
    if (!existing) throw new NotFoundException('Résumé de conversation introuvable')
    // Même plafond que le résumé généré (`nextSummary`) : une correction plus
    // longue que ce que le prompt accepterait romprait la même promesse.
    existing.summary = boundToWord(args.summary.trim(), SUMMARY_MAX_CHARS)
    const saved = await this.summaries.save(existing)
    return {
      summary: saved.summary,
      updatedAt: saved.updated_at.toISOString(),
      // #1955.24-.28 — corriger le texte ne touche pas l'état structuré.
      sections: conversationSummarySections(parseThreadState(saved.thread_state)),
    }
  }

  /**
   * #1927.10 — L'ÉTAT STRUCTURÉ de CE fil, pour CETTE personne : la même ligne,
   * la même borne que le résumé (`summaryScope`). Relu à la réouverture du fil et
   * renvoyé au service IA, qui y résout « lui », « ce compte », « le deuxième ».
   * Illisible ou absent ⇒ `null` (`parseThreadState`).
   */
  async getConversationThreadState(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId?: string | null
  }): Promise<ConversationThreadState | null> {
    const row = await this.summaries.findOne({
      where: this.summaryScope(args.userId, args.workspaceId, conversationKey(args.accountId, args.conversationId)),
    })
    return parseThreadState(row?.thread_state)
  }

  /**
   * #1927.10 — un fil « supprimé » emporte ce que Laura en avait retenu : son
   * résumé roulant et son état structuré, pour CHAQUE membre de l'espace.
   *
   * Ce geste (`ChatMessagesService.deleteThread`) est bornée par l'ESPACE —
   * les fils sont une ressource d'équipe. ⚠️ #2430.9 (20/09/2026) : les
   * MESSAGES du fil ne disparaissent plus, ils s'archivent (`archived_at`) ;
   * cette mémoire-CI reste, elle, effacée pour de bon — un résumé roulant est
   * un DÉRIVÉ recalculable, pas le contenu du fil. Laisser la ligne d'un
   * collègue ferait revenir dans son prompt les extraits et les objets d'un
   * fil rangé, au premier message écrit sous la même clé (« general » en
   * particulier). Les lignes ARCHIVÉES (`superseded_at`) partent aussi : ce
   * sont des extraits du même fil.
   *
   * La clé est dérivée EXACTEMENT comme à l'écriture (`conversationKey`) ; on
   * compte AVANT d'effacer, comme `forgetMine` (un `affected` absent ne doit pas
   * se lire « rien n'est parti »).
   */
  async forgetConversation(args: {
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): Promise<number> {
    const scope = {
      workspace_id: args.workspaceId,
      conversation_id: conversationKey(args.accountId, args.conversationId),
    }
    // #2439.10 — le compte rendu est celui des lignes VIVANTES : une ligne déjà
    // oubliée par sa personne (`archived_at`) ne se re-compte pas comme
    // « oubliée à l'instant ». Le DELETE, lui, reste SANS cette borne — c'est la
    // même exception assumée que ci-dessous : ce qui part avec un fil rangé part
    // en entier, archives comprises, parce qu'une ligne laissée sous la clé
    // `general` reviendrait dans le prompt du prochain message.
    const count = await this.summaries.count({ where: { ...scope, ...NOT_ARCHIVED } })
    await this.summaries.delete(scope)
    // #1918.5 — « UNE CONVERSATION TEMPORAIRE » : ce qui a été épinglé POUR CE
    // FIL part avec lui. La règle n'est pas neuve et ne se réécrit pas ici —
    // c'est celle du document « fil seul » (#1954,
    // `ChatThreadDocumentsService.deleteForThread`, décision de Louis du
    // 12/09/2026 : « conservé tant que le fil existe, supprimé avec lui »).
    // Elle se branche au MÊME endroit que l'oubli du résumé, pour qu'un fil
    // supprimé n'ait jamais qu'un seul chemin d'oubli.
    //
    // ⚠️ `scope: 'conversation'` est dans le critère, pas seulement dans la
    // sélection : sans lui, un `conversation_id` resté sur une ligne
    // re-rattachée à l'espace emporterait une mémoire DURABLE. Et « on archive,
    // on ne supprime pas » ne s'y oppose pas : le seul élément détruit est
    // celui dont l'étiquette dit qu'il ne survit pas au fil — la même exception
    // assumée que la suppression du fil lui-même.
    await this.facts.delete({ ...scope, scope: 'conversation' })
    return count
  }

  /* ------------------------------------------------------------------ */
  /*  Le registre — la règle de transparence du tome 6 §12.1             */
  /* ------------------------------------------------------------------ */

  /**
   * TOUT ce que Laura garde, en clair, ligne à ligne.
   *
   * « L'utilisateur voit cette mémoire, en clair, dans un écran dédié, et peut
   * en supprimer n'importe quelle ligne. Une mémoire invisible est une mémoire
   * dangereuse. » (T6 §12.1)
   *
   * Deux des quatre couches étaient exactement cela avant cet écran : les
   * PRÉFÉRENCES (`user_preferences`) et le RÉSUMÉ DE CONVERSATION
   * (`conversation_summaries`) étaient relus à chaque tour par
   * `ChatContextService.loadMemory`, et aucun écran ne les montrait ni ne
   * permettait de les effacer.
   *
   * ⚠️ Chaque couche est lue SÉPARÉMENT, et un échec NOMME sa couche au lieu de
   * la rendre vide. Une couche vide et une couche illisible se ressemblent à
   * l'écran, et la seconde se lirait « Laura ne retient rien » — une phrase
   * fausse et rassurante. C'est la règle « non mesuré n'est jamais 0 »,
   * appliquée à une mémoire.
   */
  async readLedger(args: {
    userId: string
    workspaceId: string
    role?: WorkspaceRole
    /**
     * #1916 — `screen` : la vue de Réglages › Mémoire de Laura. Elle ajoute, sur
     * les faits, la nature, l'origine, l'AUTEUR, le droit de modifier, les
     * surfaces, et les éléments ÉCHUS avec leur date. Absente : la vue que lit
     * l'outil `get_memory` de Laura, INCHANGÉE — aucune identité n'entre dans
     * un prompt, et un élément échu n'est plus une mémoire qu'elle relit.
     */
    view?: 'screen'
    /** #1918.2 — les périmètres que l'appelant PORTE, résolus au bord. Absents :
     *  aucune mémoire d'équipe n'entre dans le registre (repli fermé). */
    businessUnitIds?: readonly string[]
  }): Promise<MemoryLedger> {
    const unreadableLayers: MemoryLayer[] = []
    const entries: MemoryLedgerEntry[] = []

    const layers: Array<[MemoryLayer, () => Promise<MemoryLedgerEntry[]>]> = [
      // #1918.1 — l'APPELANT borne la couche : l'élément « moi » d'un collègue
      // n'est ni dans son écran, ni dans ce que `get_memory` rend à Laura.
      [
        'facts',
        () =>
          args.view === 'screen'
            ? this.ledgerFactsForScreen(args.userId, args.workspaceId, args.role, args.businessUnitIds)
            : this.ledgerFacts(args.userId, args.workspaceId, args.role, args.businessUnitIds),
      ],
      ['preferences', () => this.ledgerPreferences(args.userId)],
      ['conversations', () => this.ledgerConversations(args.userId, args.workspaceId)],
      ['refusals', () => this.ledgerRefusals(args.userId)],
      // Les deux couches DÉCLARÉES. Elles ne sont pas retenues en silence — la
      // personne les a écrites — mais elles partent dans le prompt à chaque
      // tour, et rien ne le disait. « Une mémoire invisible est une mémoire
      // dangereuse » vaut aussi pour un champ qu'on a soi-même saisi ailleurs.
      ['identity', () => this.ledgerIdentity(args.userId)],
      ['workspace', () => this.ledgerWorkspace(args.userId)],
    ]

    for (const [layer, read] of layers) {
      try {
        entries.push(...(await read()))
      } catch {
        unreadableLayers.push(layer)
      }
    }

    return { entries, unreadableLayers }
  }

  /**
   * Oublie UNE ligne. La portée est celle de la couche : un fait et un résumé
   * appartiennent à l'espace, une préférence et une trace appartiennent à la
   * personne. Une ligne absente — ou d'un autre espace — lève un 404 : un
   * « supprimé » sur une ligne qu'on n'a pas touchée est le pire des retours.
   */
  async forgetLedgerEntry(args: {
    userId: string
    workspaceId: string
    layer: MemoryLayer
    id: string
    /** #1918.7 — le rôle d'espace RÉSOLU de l'appelant (couche `facts`). */
    role?: WorkspaceRole
  }): Promise<void> {
    // Une couche DÉCLARÉE ne s'oublie pas : elle se corrige là où elle se
    // saisit. Effacer `companyName` depuis l'écran de mémoire viderait le
    // profil de l'ESN pour toute l'équipe — une configuration détruite sous
    // couvert d'oubli. Ce n'est PAS un 404 : la ligne existe, et c'est le geste
    // qui n'a pas de sens ici.
    if (isDeclaredMemoryLayer(args.layer)) {
      throw new BadRequestException(
        'Cette information est déclarée dans ton profil : elle se corrige dans les réglages, elle ne s’oublie pas.',
      )
    }

    switch (args.layer) {
      case 'facts':
        // #1918.1 — même borne que la lecture : ce que l'appelant peut voir.
        // #1918.7 — et un élément partagé : son auteur ou un manager.
        return this.unpinFact({ id: args.id, workspaceId: args.workspaceId, userId: args.userId, role: args.role })

      case 'preferences': {
        const row = await this.preferences.findOne({ where: { user_id: args.userId } })
        if (!row || !(args.id in (row.preferences ?? {}))) {
          throw new NotFoundException('Préférence introuvable')
        }
        // La clé DISPARAÎT du sac. Pas un `null`, pas un marqueur : une clé
        // laissée à `null` continuerait d'être relue par le copilote.
        const { [args.id]: _removed, ...kept } = row.preferences
        row.preferences = kept
        await this.preferences.save(row)
        return
      }

      case 'conversations': {
        // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026).
        //
        // ⚠️ Sans `user_id`, cette écriture porterait sur la ligne de CHAQUE
        //    membre pour cette clé de conversation : oublier son propre fil
        //    emportait celui des autres. La portée s'écrit en entier ici, jamais
        //    par héritage d'une méthode voisine.
        // `archived_at IS NULL` (via {@link NOT_ARCHIVED}) fait du second oubli
        // un 404, comme l'était l'oubli d'une ligne déjà partie.
        const result = await this.summaries.update(
          {
            user_id: args.userId,
            workspace_id: args.workspaceId,
            conversation_id: args.id,
            superseded_at: IsNull(),
            ...NOT_ARCHIVED,
          },
          { archived_at: new Date() },
        )
        if (!result.affected) throw new NotFoundException('Résumé de conversation introuvable')
        return
      }

      case 'refusals': {
        // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
        const result = await this.interventions.update(
          { id: args.id, user_id: args.userId, ...NOT_ARCHIVED },
          { archived_at: new Date() },
        )
        if (!result.affected) throw new NotFoundException('Trace introuvable')
        return
      }

      default:
        // Une couche inconnue ne se devine pas : on ne va surtout pas chercher
        // dans une cinquième table « au cas où ».
        throw new NotFoundException('Couche de mémoire inconnue')
    }
  }

  /**
   * TOUT OUBLIER — le geste global, et la seule portée qu'il puisse avoir.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI « CE QUI EST À MOI » ET PAS « CET ESPACE »
   * ─────────────────────────────────────────────────────────────────────────
   * La suppression LIGNE À LIGNE d'un fait est bornée par l'espace
   * (`unpinFact({ id, workspaceId })`) : n'importe quel membre peut retirer un
   * fait épinglé par un collègue. C'est voulu — un fait épinglé est un geste
   * délibéré de partage vers l'équipe, et on le retire en le regardant.
   *
   * Reprendre cette borne pour un bouton unique viderait le portefeuille de
   * faits de TOUTE l'ESN d'un clic, depuis un écran intitulé « ma mémoire ».
   * C'est la même requête, ce n'est pas le même geste : personne ne peut
   * consentir à effacer ce qu'il n'a pas vu. La portée du bouton est donc
   * `user_id` — mes faits, mes préférences, mes résumés, mes traces. Ce qu'un
   * collègue a épinglé survit, et l'écran l'annonce AVANT de demander.
   *
   * ⚠️ Irréversible. Le compte rendu NOMME toute couche qui n'a pas pu être
   * vidée : « 12 lignes oubliées » est un nombre vrai qui se lit comme un
   * succès complet, et on ne laisse personne croire qu'il a fini.
   *
   * Les couches DÉCLARÉES (`identity`, `workspace`) ne sont pas visées — elles
   * sont dérivées de la liste du contrat, jamais recopiées ici : une septième
   * couche oubliable ajoutée demain serait prise en charge, ou NOMMÉE en échec,
   * mais jamais sautée en silence.
   */
  async forgetAll(args: { userId: string; workspaceId: string }): Promise<MemoryForgetAllResult> {
    // #1919 — les retours sur les réponses de Laura, AVANT les couches : ils ne
    // sont pas une couche du registre, donc pas nommables dans `failedLayers`.
    // Un échec ici arrête le geste avant toute suppression irréversible.
    let forgotten = await this.forgetReplyFeedback(args)
    const failedLayers: MemoryLayer[] = []

    for (const layer of MEMORY_LAYERS) {
      if (isDeclaredMemoryLayer(layer)) continue
      try {
        forgotten += await this.forgetMine(layer, args)
      } catch {
        failedLayers.push(layer)
      }
    }

    return { forgotten, failedLayers }
  }

  /**
   * #1919 — MES retours sur les réponses de Laura, dans CET espace.
   *
   * Par le gestionnaire de connexion, pas par un dépôt injecté : aucun
   * constructeur ni aucun module ne bouge pour une table qui n'appartient pas à
   * la mémoire (elle vit dans `account-feedback`). Compté AVANT d'effacer, même
   * raison que `forgetMine`.
   */
  private async forgetReplyFeedback(args: { userId: string; workspaceId: string }): Promise<number> {
    const rows = (await this.facts.manager.query(
      `SELECT count(*)::int AS count FROM chat_reply_feedback WHERE user_id = $1 AND workspace_id = $2`,
      [args.userId, args.workspaceId],
    )) as Array<{ count: number }>
    const count = Number(rows[0]?.count ?? 0)
    if (count > 0) {
      await this.facts.manager.query(`DELETE FROM chat_reply_feedback WHERE user_id = $1 AND workspace_id = $2`, [
        args.userId,
        args.workspaceId,
      ])
    }
    return count
  }

  /**
   * Vide UNE couche pour CETTE personne, et rend le nombre de lignes parties.
   *
   * On compte AVANT d'effacer plutôt que de lire `affected` : le pilote peut
   * rendre `null`, et un `?? 0` transformerait « je ne sais pas » en « rien
   * n'est parti ». Pour les préférences, la ligne du registre est la CLÉ, pas
   * la rangée : le compte est celui des clés du sac.
   */
  private async forgetMine(layer: MemoryLayer, args: { userId: string; workspaceId: string }): Promise<number> {
    switch (layer) {
      case 'facts': {
        // Les DEUX bornes. Sans `user_id`, ce DELETE emporterait ce qu'un
        // collègue a épinglé.
        const scope = { user_id: args.userId, workspace_id: args.workspaceId }
        // #2439.10 — on ne compte que les lignes VIVANTES : une mémoire déjà
        // oubliée ligne à ligne ne se re-compte pas dans « tout oublier ». Le
        // DELETE garde la portée entière (archives comprises) : « tout » est
        // tout, et ce bouton-ci est le geste global, confirmé, que l'écran
        // annonce comme définitif.
        const count = await this.facts.count({ where: { ...scope, ...NOT_ARCHIVED } })
        await this.facts.delete(scope)
        return count
      }

      case 'preferences': {
        const row = await this.preferences.findOne({ where: { user_id: args.userId } })
        const count = Object.keys(row?.preferences ?? {}).length
        // La rangée entière part : une rangée à sac vide continuerait d'être
        // lue par le copilote, et ne dirait rien de plus qu'une absence.
        if (row) await this.preferences.delete({ user_id: args.userId })
        return count
      }

      case 'conversations': {
        // Y compris les résumés ARCHIVÉS (`superseded_at` renseigné) : ils
        // restent des extraits de ce que cette personne a écrit. Un « tout
        // oublier » qui en laisserait derrière lui serait un « tout » faux.
        const scope = { user_id: args.userId, workspace_id: args.workspaceId }
        // #2439.10 — les lignes VIVANTES seulement au compteur, tout au DELETE.
        const count = await this.summaries.count({ where: { ...scope, ...NOT_ARCHIVED } })
        await this.summaries.delete(scope)
        return count
      }

      case 'refusals': {
        const scope = { user_id: args.userId }
        // #2439.10 — les lignes VIVANTES seulement au compteur, tout au DELETE.
        const count = await this.interventions.count({ where: { ...scope, ...NOT_ARCHIVED } })
        await this.interventions.delete(scope)
        return count
      }

      default:
        // Une couche oubliable qu'on ne sait pas vider est NOMMÉE en échec par
        // l'appelant. Elle n'est jamais sautée en silence : c'est exactement la
        // différence entre « rien à faire » et « je n'ai pas su le faire ».
        throw new Error(`Couche de mémoire non prise en charge par « tout oublier » : ${layer}`)
    }
  }

  /**
   * COUCHE 1 — CE QUE LAURA SAIT DE LA PERSONNE.
   *
   * Le prénom vient de `profiles`, le reste du profil résolu — exactement les
   * deux lectures que `ChatContextService` fait à chaque tour. Aucune ligne
   * n'est fabriquée : un champ vide ne produit rien.
   *
   * La DATE est celle de la ligne de profil dont la valeur vient. Sans ligne de
   * profil, il n'y a pas de valeur non plus : la question ne se pose pas.
   */
  private async ledgerIdentity(userId: string): Promise<MemoryLedgerEntry[]> {
    const [profileRow, profileData, context] = await Promise.all([
      this.profiles.findOne({ where: { user_id: userId } }),
      this.esnProfile.resolveProfileData(userId),
      this.esnProfile.resolveContext(userId),
    ])

    const entries: MemoryLedgerEntry[] = []

    const firstName = (profileRow?.first_name ?? '').trim()
    if (firstName) {
      entries.push({
        id: 'firstName',
        layer: 'identity',
        text: firstName,
        recordedAt: (profileRow?.updated_at ?? profileRow?.created_at ?? new Date()).toISOString(),
        accountId: null,
        detail: 'firstName',
        expiresAt: null,
      })
    }

    // La surcouche personnelle gagne sur le profil de la société pour ces
    // champs-là — on date donc sur la ligne personnelle quand elle existe.
    const recordedAt = (context.ownRow?.updated_at ?? context.canonicalRow?.updated_at ?? null)?.toISOString() ?? null
    if (recordedAt) {
      entries.push(...toDeclaredEntries('identity', IDENTITY_PROFILE_KEYS, profileData, recordedAt))
    }

    return entries
  }

  /**
   * COUCHE 2 — CE QUE LAURA SAIT DE L'ESN.
   *
   * Le profil de l'espace, tel qu'il part dans le prompt. Il est DÉCLARÉ, donc
   * partagé : un collègue lit les mêmes lignes, parce que c'est le même profil
   * de société. Rien n'est fabriqué, et un profil non rempli ne rend rien.
   */
  private async ledgerWorkspace(userId: string): Promise<MemoryLedgerEntry[]> {
    const [profileData, context] = await Promise.all([
      this.esnProfile.resolveProfileData(userId),
      this.esnProfile.resolveContext(userId),
    ])
    // Les champs de SOCIÉTÉ viennent toujours de la ligne canonique quand elle
    // existe (`mergeWorkspaceAnswers`) : c'est donc sa date qu'on affiche.
    const recordedAt = (context.canonicalRow?.updated_at ?? context.ownRow?.updated_at ?? null)?.toISOString() ?? null
    if (!recordedAt) return []
    return toDeclaredEntries('workspace', WORKSPACE_PROFILE_KEYS, profileData, recordedAt)
  }

  /** Les faits — la MÊME lecture que celle du copilote, expirés exclus, bornée à
   *  ce que l'appelant peut voir (#1918.1). */
  private async ledgerFacts(
    userId: string,
    workspaceId: string,
    role?: WorkspaceRole,
    businessUnitIds?: readonly string[],
  ): Promise<MemoryLedgerEntry[]> {
    const rows = await this.listFacts({ workspaceId, userId, role, businessUnitIds })
    return rows.map(row => this.factEntry(row))
  }

  /**
   * #1916.13 / .16 / .18 / .22 / .24 — les faits tels que Réglages › Mémoire de
   * Laura les MONTRE, à la personne qui regarde :
   *  · les éléments ÉCHUS aussi, avec leur date (« on archive, on ne supprime
   *    pas ») — et leurs surfaces VIDES : Laura ne s'en sert plus ;
   *  · la nature et l'origine en clair, d'où l'écran tire la section et le
   *    « pourquoi » ;
   *  · l'AUTEUR, en prénom + avatar, résolu parmi les membres de l'espace —
   *    jamais un identifiant ni une adresse ; `null` quand il est inconnu ;
   *  · le droit de MODIFIER, par la même règle que le droit d'oublier.
   * La lecture est la même porte que celle du copilote ({@link readVisibleFacts}) :
   * rien de ce qu'un collègue garde pour lui n'y entre.
   */
  private async ledgerFactsForScreen(
    userId: string,
    workspaceId: string,
    role?: WorkspaceRole,
    businessUnitIds?: readonly string[],
  ): Promise<MemoryLedgerEntry[]> {
    const viewer: MemoryViewer = { userId, role }
    // #1918.2 — les périmètres PORTÉS arrivent du bord ; #1918.5 — aucun fil :
    // Réglages › Mémoire n'est pas une conversation, et n'y liste donc aucune
    // mémoire de fil (la même règle que « jamais listé dans Connaissances »
    // pour un document joint, #1954).
    const rows = await this.readVisibleFacts({ workspaceId, userId, includeExpired: true, reach: { businessUnitIds } })
    // Les auteurs ET les confirmateurs (Q1) : une seule lecture de la règle d'auteur.
    const authors = await resolveWorkspaceAuthors(this.facts.manager, workspaceId, [
      ...rows.map(row => row.user_id),
      ...rows.map(row => row.confirmed_by),
    ])
    const nowMs = Date.now()
    // #2260.7 — l'OBJET VISÉ, résolu par LOT pour tout le registre — une seule
    // volée de requêtes (au plus quatre), pas une par ligne. L'ordre de
    // `attachObjectNames` suit celui de `wires` : le zip avec `rows` reste valide.
    const wires = rows.map(row => toWireFact(row, viewer))
    const resolvedWires = await attachObjectNames(this.facts.manager, workspaceId, wires)
    return rows.map((row, index) => {
      const wire = resolvedWires[index]
      return {
        ...this.factEntry(wire),
        kind: wire.kind,
        origin: wire.origin,
        // #1939 — un auteur effacé (`user_id` null) est inconnu, jamais deviné.
        author: row.user_id ? (authors.get(row.user_id) ?? null) : null,
        // Q1 — qui a confirmé la note ; `null` si elle ne l'est pas, ou si le
        // confirmateur n'est plus connu (la confirmation, elle, reste).
        confirmedBy: row.confirmed_at && row.confirmed_by ? (authors.get(row.confirmed_by) ?? null) : null,
        canEdit: mayChangeFact(row, viewer),
        surfaces: factSurfaces(row, nowMs),
      }
    })
  }

  /** Une ligne de faits du registre — la forme commune aux deux vues (écran, outil de Laura). */
  private factEntry(row: PinnedFact): MemoryLedgerEntry {
    return {
      id: row.id,
      layer: 'facts' as const,
      text: row.fact,
      recordedAt: row.createdAt,
      accountId: row.accountId,
      // #1962.17/.18 — une conclusion de Laura jamais confirmée par la personne
      // (`origin: 'copilot'`) ne s'affiche plus comme un fait « comme les
      // autres ». Elle retombe sur `kind: 'fact'` par défaut faute d'une
      // quatrième valeur d'énumération SQL (ce lot n'en ouvre pas) — c'est
      // pourquoi `origin` PRIME sur `kind` ici : le badge dit « note de Laura
      // — à vérifier » (i18n `memoryLedger.detail.copilotNote`) quelle que
      // soit la nature stockée, avant de retomber sur la nature par défaut
      // (« fait ») qui, elle, n'ajoute rien.
      // Q1 (13/09) — une note CONFIRMÉE par une personne n'est plus « à vérifier » :
      // `confirmedNote`, pour l'écran comme pour l'outil `get_memory` de Laura.
      detail:
        row.origin === 'copilot'
          ? row.confirmedAt
            ? 'confirmedNote'
            : 'copilotNote'
          : row.kind === 'fact'
            ? null
            : row.kind,
      expiresAt: row.expiresAt,
      // #1916.3 — pour qui la ligne vaut ; #1916.21 — si l'appelant peut la changer.
      scope: row.scope,
      // #1918.2 — QUEL périmètre, quand c'en est un. L'écran le nomme.
      businessUnitId: row.businessUnitId ?? null,
      // #2260.7 — L'OBJET VISÉ, déjà RÉSOLU par l'appelant (`listFacts` ou
      // `ledgerFactsForScreen`, tous deux passés par `attachObjectNames`).
      object: row.object ?? null,
      ownedByMe: row.ownedByMe,
      // #1918.7 — l'écran n'offre « Oublier » que si l'appelant en a le droit.
      canForget: row.canForget,
      // #1962.22 — QUAND la note a été confirmée, au même titre que QUI
      // (`confirmedBy`, posé par l'appelant de `factEntry`, `ledgerFactsForScreen`).
      confirmedAt: row.confirmedAt,
    }
  }

  /**
   * Les préférences — une LIGNE PAR CLÉ, parce que la règle dit « supprimer
   * n'importe quelle ligne » : effacer le sac entier pour retirer un réglage
   * n'est pas une suppression ligne à ligne.
   */
  private async ledgerPreferences(userId: string): Promise<MemoryLedgerEntry[]> {
    const row = await this.preferences.findOne({ where: { user_id: userId } })
    const bag = row?.preferences ?? {}
    // Une seule date pour tout le sac — c'est la seule que la table porte. On
    // ne fabrique pas une date par clé.
    const recordedAt = (row?.updated_at ?? new Date()).toISOString()
    return Object.entries(bag).map(([key, value]) => ({
      id: key,
      layer: 'preferences' as const,
      text: renderPreference(value),
      recordedAt,
      accountId: null,
      detail: key,
      expiresAt: null,
    }))
  }

  /**
   * Les résumés de conversation — le texte EXACT que le copilote relit au tour
   * suivant, deux extraits de 200 caractères par échange.
   *
   * ⚠️ Portée d'ESPACE, et c'est ce que `getConversationSummary` lit : dans un
   * espace à plusieurs sièges, les membres partagent la ligne « general ». Le
   * registre montre donc exactement ce que le copilote a sous les yeux — le
   * masquer recréerait la mémoire invisible que cet écran existe pour supprimer.
   * Que cette portée DOIVE être personnelle est une question ouverte : elle se
   * tranche sur le chemin d'écriture, pas en cachant la ligne ici.
   */
  /**
   * ⚠️ Le fil de conversation est PERSONNEL, et il faut le lire comme il s'écrit.
   *
   * Cette méthode lisait `{ workspace_id }` seul, écrite quand la table portait
   * encore une ligne par espace. Depuis que `summaryScope` ajoute la personne,
   * une lecture plus large que l'écriture rendrait à l'écran « ta mémoire » les
   * extraits d'un collègue — c'est-à-dire la fuite que la portée vient de
   * fermer, ressortie par l'écran qui devait la rendre visible.
   *
   * `superseded_at` filtre aussi les lignes ARCHIVÉES : elles ne nourrissent
   * plus le modèle, elles n'ont donc rien à faire dans ce que le produit
   * présente comme sa mémoire vivante.
   */
  private async ledgerConversations(userId: string, workspaceId: string): Promise<MemoryLedgerEntry[]> {
    const rows = await this.summaries.find({
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
      where: { user_id: userId, workspace_id: workspaceId, superseded_at: IsNull(), ...NOT_ARCHIVED },
    })
    return (
      rows
        // Un résumé vide n'est pas une ligne de mémoire : le copilote ne le lit
        // pas non plus (`getConversationSummary` rend `null`).
        .filter(row => (row.summary ?? '').trim().length > 0)
        .map(row => ({
          id: row.conversation_id,
          layer: 'conversations' as const,
          text: row.summary.trim(),
          recordedAt: row.updated_at.toISOString(),
          accountId: row.account_id,
          detail: null,
          expiresAt: null,
        }))
    )
  }

  /**
   * Les traces d'intervention — « ce qu'il a refusé, et quand » (T6 §12.1).
   * Le TEXTE vient du catalogue, qui vit dans le code : une trace plus ancienne
   * que le catalogue rend sa clé, jamais une phrase inventée.
   */
  private async ledgerRefusals(userId: string): Promise<MemoryLedgerEntry[]> {
    const rows = await this.interventions.find({
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026)
      where: { user_id: userId, ...NOT_ARCHIVED },
      order: { created_at: 'DESC' },
      take: LEDGER_TRACE_LIMIT,
    })
    return rows.map(row => ({
      id: row.id,
      layer: 'refusals' as const,
      text: findIntervention(row.intervention_key)?.action ?? row.intervention_key,
      recordedAt: (row.reacted_at ?? row.created_at).toISOString(),
      accountId: null,
      detail: row.reaction,
      expiresAt: null,
    }))
  }

  /** Append one exchange to the rolling summary (deterministic, best-effort). */
  async appendConversationTurn(args: RecordTurnArgs): Promise<void> {
    const key = conversationKey(args.accountId, args.conversationId)
    const existing = await this.summaries.findOne({
      where: this.summaryScope(args.userId, args.workspaceId, key),
    })
    const summary = nextSummary(existing?.summary ?? '', args.userMessage, args.assistantReply)
    // #1927.10 — l'état structuré s'écrit sur la MÊME ligne, dans le même geste :
    // le résumé et l'état d'un fil ne peuvent pas diverger de portée. Sans état
    // rendu par ce tour, la colonne n'est pas touchée (voir `RecordTurnArgs`).
    const threadState = args.threadState ?? null
    if (existing) {
      existing.summary = summary
      if (threadState) existing.thread_state = threadState
      await this.summaries.save(existing)
    } else {
      await this.summaries.save(
        this.summaries.create({
          user_id: args.userId,
          workspace_id: args.workspaceId,
          account_id: args.accountId,
          conversation_id: key,
          summary,
          ...(threadState ? { thread_state: threadState } : {}),
        }),
      )
    }
  }

  /**
   * LA borne d'un résumé de conversation, écrite une seule fois : la personne,
   * son espace, son fil — et seulement les lignes vivantes. Lecture et écriture
   * la partagent, pour qu'aucune des deux ne puisse dériver sans l'autre (une
   * écriture plus large que la lecture recréerait la ligne partagée).
   */
  private summaryScope(userId: string, workspaceId: string, conversationKeyValue: string) {
    return {
      user_id: userId,
      workspace_id: workspaceId,
      conversation_id: conversationKeyValue,
      superseded_at: IsNull(),
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
      // un résumé oublié ne repart ni au modèle, ni à l'écran, et le tour
      // suivant en écrit un NEUF au lieu de reprendre celui qui a été oublié.
      ...NOT_ARCHIVED,
    }
  }
}

/**
 * Stable conversation key: the web sends synthetic thread ids ("general",
 * "account-<uuid>"); other callers may send none. Fall back to an account-scoped
 * or global key so every exchange maps to exactly one summary row.
 */
function conversationKey(accountId: string | null, conversationId?: string | null): string {
  const raw = (conversationId ?? '').trim()
  if (raw) return raw
  return accountId ? `account:${accountId}` : 'general'
}

/** ISO 8601 → `Date`. Absent / illisible ⇒ pas d'échéance : on ne périme jamais
 *  un fait sur une date qu'on n'a pas su lire (règle « jamais de donnée
 *  inventée » appliquée dans le sens conservateur). */
function parseExpiry(value: string | null | undefined): Date | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms) : null
}
