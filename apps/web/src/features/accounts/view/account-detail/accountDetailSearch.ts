import { z } from 'zod'
import { SIGNAL_LINE_PERIODS } from '@bellum/contracts'
import {
  TAB_KEYS,
  sectionOfTab,
  subSectionAnchorId,
  type SectionId,
  type TabId,
} from './components/AccountDetailTabsBar'
import { parseDossierItemRef } from './search/dossierSearch'

/**
 * Alias d'URL → clé d'onglet canonique.
 *
 * Les clés de l'URL (`organigramme`, `coverage`, `veille`, `evaluation`) ne sont
 * PAS les libellés que le commercial lit (« Carte d'influence », « Zones
 * blanches », « Signaux », « Score »). Un lien intuitif comme `?tab=score`
 * tombait donc sur `undefined` → l'onglet par défaut, en silence. On accepte
 * les libellés visibles comme entrées, pour qu'un lien partagé tombe au bon
 * endroit et qu'un futur renommage ne casse pas les liens existants.
 *
 * #1104 — « Carte d'influence » est devenu « Organigramme » à l'écran (« je ne
 * suis pas hyper familier » avec le terme). La clé d'URL, elle, ne bouge PAS :
 * elle vit dans des liens déjà partagés. Les alias `influence` et
 * `carte-d-influence` restent donc valides — c'est exactement ce que ce tableau
 * existe pour absorber.
 *
 * #2115.30-31 — DEUX GROUPES, séparés délibérément (voir plus bas
 * `SECTION_ENTRY_ALIASES`) : celui-ci ne contient que des valeurs qui
 * précèdent les sept sections — chacune SURPREND, donc chacune est éligible à
 * la notice de migration (#2115.33, `resolveLegacyTabNotice`).
 */
const LEGACY_TAB_ALIASES: Record<string, TabId> = {
  score: 'evaluation',
  influence: 'organigramme',
  'carte-d-influence': 'organigramme',
  'carte-influence': 'organigramme',
  signaux: 'veille',
  // #3676 — « Besoins confirmés » n'est plus une sous-partie : sa lecture vit
  // dans « Signaux et besoins ». Les liens `?tab=needs` déjà partagés y aboutissent.
  needs: 'veille',
  besoins: 'veille',
  // #3677 — le sous-onglet « Programmes » a quitté Périmètres : les programmes se
  // lisent désormais avec les signaux. Le lien partagé tombe sur Signaux, avec la
  // notice de migration (jamais une page vide).
  programs: 'veille',
  programmes: 'veille',
  // « Zones blanches » était le libellé jusqu'au 02/08 (recette finale §33) : les
  // liens déjà partagés doivent continuer de tomber sur le bon onglet.
  'zones-blanches': 'coverage',
  'zone-blanche': 'coverage',
  couverture: 'coverage',
  'couverture-du-compte': 'coverage',
  'plan-action': 'plan',
  'plan-d-action': 'plan',
  apercu: 'overview',
  // #2115.30-31, #2130.79 — TROIS CLÉS RETROUVÉES PAR `git log --follow -p`
  // SUR `AccountDetailTabsBar.tsx`, qui les montre disparaître SANS que le
  // mécanisme d'alias (#1104, 02/08/2026) ne les ait jamais rattrapées : un
  // lien de mai-juillet 2026 serait tombé, en silence, sur l'onglet par
  // défaut — exactement le défaut que #1104 corrige pour les renommages
  // récents, resté ouvert pour les plus anciens.
  //  - `fiche` → `overview` : pur renommage, même libellé (« Vue d'ensemble »)
  //    des deux côtés — commit d5eb69057 (19/05/2026).
  //  - `messages` : ⚠️ N'EST PLUS UN ALIAS depuis #2115.26. Il a été alias de
  //    `plan` le temps où la section Plan d'action ne portait aucune
  //    sous-partie « messages » ; elle en porte une désormais, donc `messages`
  //    est redevenu une clé CANONIQUE de `TAB_KEYS`. Le laisser ici en plus
  //    aurait fait diverger deux lectures de la même valeur : `resolveTab`
  //    regarde `TAB_KEYS` AVANT la table d'alias (donc `messages`), pendant que
  //    `buildTabMappingTable` applique les alias APRÈS les clés canoniques
  //    (donc `plan`) — la table de correspondance aurait annoncé une
  //    destination que le routeur n'emprunte pas. Un lien `?tab=messages` de
  //    mai 2026 ouvre toujours la section Plan d'action ; il tombe maintenant
  //    sur l'ancre précise de la préparation des messages.
  //  - `notes` → `overview` : le « private notes tab » a été supprimé pour de
  //    bon (commit 8577b2b30, #118, doctrine « on archive, on ne supprime pas »
  //    pour la DONNÉE, pas pour un onglet retiré du produit) ; aucun
  //    successeur n'existe, donc l'aperçu — l'arrivée par défaut — est la
  //    destination la moins surprenante plutôt qu'un onglet fantôme.
  fiche: 'overview',
  notes: 'overview',
}

/**
 * #2115.14-20 — LES SEPT SECTIONS SONT AUSSI DES ENTRÉES (D8, 14/09/2026).
 *
 * Le commercial lit maintenant sept noms de section ; un lien écrit à la main
 * en porte un. Chacun résout vers la PREMIÈRE sous-partie de sa section —
 * exactement là où un clic sur la section atterrit. ⚠️ Les quatorze clés
 * d'onglet restent le contrat : elles ne sont ni renommées ni retirées, et
 * c'est ce qui fait qu'aucun lien déjà partagé ne casse.
 *
 * Séparées de `LEGACY_TAB_ALIASES` : ce ne sont PAS d'anciennes valeurs — elles
 * sont nées AVEC les sections, donc y atterrir n'a rien de surprenant. C'est ce
 * qui les EXCLUT de la notice de migration (#2115.33) : personne ne s'étonne
 * que `?tab=synthese` ouvre Synthèse.
 */
const SECTION_ENTRY_ALIASES: Record<string, TabId> = {
  synthese: 'overview',
  synthesis: 'overview',
  perimetres: 'sites',
  perimeters: 'sites',
  opportunites: 'veille',
  opportunities: 'veille',
  personnes: 'organigramme',
  people: 'organigramme',
  ecosysteme: 'partners',
  ecosystem: 'partners',
  'ecosysteme-acces': 'partners',
  'ecosystem-access': 'partners',
  'historique-preuves': 'missions',
  'history-proofs': 'missions',
  historique: 'history',
}

/** La table complète que `resolveTab` interroge — un seul endroit (GA-26),
 *  composée des deux groupes ci-dessus, jamais recopiée. */
const TAB_ALIASES: Record<string, TabId> = { ...LEGACY_TAB_ALIASES, ...SECTION_ENTRY_ALIASES }

/** Casse, ACCENTS, espaces et underscores gommés — partagée par `resolveTab`
 *  et `resolveLegacyTabNotice` : deux fonctions qui la refaisaient chacune de
 *  leur côté auraient pu diverger sur un cas accentué.
 *
 *  ⚠️ Les diacritiques se retirent, et ce n'est pas une coquetterie : la casse
 *  était pliée depuis le début, les accents non — un lien copié depuis un
 *  libellé lu à l'écran (« Périmètres », « Écosystème & accès ») en porte
 *  pourtant toujours, et tombait sur l'onglet par défaut sans rien dire. Même
 *  piège qu'`ILIKE`, qui plie la casse et pas les accents. */
function normalizeTabKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_]+/g, '-')
}

/** Normalise une valeur d'URL en clé d'onglet, puis résolution par alias. Une
 *  clé canonique passe telle quelle ; tout le reste (inconnu) → `undefined` =
 *  onglet par défaut. */
export function resolveTab(value: unknown): TabId | undefined {
  if (typeof value !== 'string') return undefined
  const key = normalizeTabKey(value)
  if ((TAB_KEYS as readonly string[]).includes(key)) return key as TabId
  return TAB_ALIASES[key]
}

/**
 * #3677 / #3720 (RAN, recette ND 10/10 en prod) — le routeur réécrit `?tab=programs` en `?tab=veille`
 * en VALIDANT la recherche, avant tout rendu : l'URL lue au premier rendu de l'écran dit déjà
 * `veille`, et les trois captures « au premier rendu » (notice, défilement) ne voyaient jamais
 * l'ancien lien. La validation est le seul endroit qui voit encore la valeur d'origine : elle la
 * dépose ici (valeur héritée seulement), l'écran la reprend dans une fenêtre courte.
 */
const LEGACY_ARRIVAL_WINDOW_MS = 15_000
let capturedLegacy: { notice: LegacyTabNotice; at: number } | null = null

export function capturedLegacyTabNotice(): LegacyTabNotice | undefined {
  if (!capturedLegacy) return undefined
  if (Date.now() - capturedLegacy.at > LEGACY_ARRIVAL_WINDOW_MS) {
    capturedLegacy = null
    return undefined
  }
  return capturedLegacy.notice
}

export function clearCapturedLegacyTab(): void {
  capturedLegacy = null
}

function resolveTabAndCaptureLegacy(value: unknown): TabId | undefined {
  const notice = resolveLegacyTabNotice(value)
  if (notice) capturedLegacy = { notice, at: Date.now() }
  return resolveTab(value)
}

export const accountDetailSearchSchema = z.object({
  // `preprocess` fait la traduction AVANT l'enum : un libellé intuitif devient
  // sa clé canonique, un inconnu devient `undefined` (que l'enum optionnel
  // accepte). Le `.catch` reste un dernier filet contre toute valeur hors-enum.
  tab: z.preprocess(resolveTabAndCaptureLegacy, z.enum(TAB_KEYS).optional()).catch(undefined),
  /** #2128.53 — la requête de la recherche transversale du dossier. Dans l'URL
   *  et pas dans un état React : un retour navigateur la restaure. */
  find: z.string().optional().catch(undefined),
  /** #2128.50 — l'objet ouvert depuis la recherche, `<type>:<identifiant>`. Un
   *  objet illisible disparaît au lieu d'en ouvrir un deviné. */
  item: z.preprocess(value => (parseDossierItemRef(value) ? value : undefined), z.string().optional()).catch(undefined),
  /** #4424.4 — `rdv` : le panneau « Préparer le rendez-vous » du plan arrive ouvert (lien « Préparer le RDV »). */
  prep: z.enum(['rdv']).optional().catch(undefined),
  /** Lot 764 — la période ouverte du tableau « Signaux et besoins » (`past` = Historique) : un lien de la page
   *  Signaux › Historique arrive sur le passé du compte. Valeur inconnue = la période par défaut (Actuel). */
  sp: z.enum(SIGNAL_LINE_PERIODS).optional().catch(undefined),
  /** Amorce de recherche pour l'onglet Contacts — permet à un autre écran
   *  (un besoin, une zone blanche) d'ouvrir le compte AVEC le contexte, au lieu
   *  de laisser le commercial retaper ce qu'il cherchait. */
  q: z.string().optional().catch(undefined),
  /** #2120.77 — les trois filtres de l'onglet Contacts. Sans ces clés, zod les
   *  RETIRAIT en silence : un filtre posé ne survivait ni au changement de
   *  section (l'onglet est démonté) ni au retour navigateur depuis une fiche. */
  role: z.string().optional().catch(undefined),
  entity: z.string().optional().catch(undefined),
  level: z.string().optional().catch(undefined),
  /** #3742 — filtre « Localisation » de l'onglet Contacts (`region:…`, `city:…`…). */
  place: z.string().optional().catch(undefined),
  /** #4996 L6 — le segment « Mon périmètre · Tout le compte » de l'onglet Contacts. Absent = le défaut (`mine` quand le
   *  segment est affiché). Une valeur périmée jette l'axe, jamais l'écran. */
  perimeter: z.enum(['mine', 'all']).optional().catch(undefined),
  /** #4061.b — l'état de l'onglet Organigramme (vue, direction, colonnes repliées, filtres, sélection) :
   *  dans l'URL pour que le retour d'une fiche le retrouve — voir `organigramme/orgViewState.ts`. */
  ov: z.string().optional().catch(undefined),
  od: z.string().optional().catch(undefined),
  oc: z.string().optional().catch(undefined),
  of: z.string().optional().catch(undefined),
  os: z.string().optional().catch(undefined),
})

/** #2120.77 — ce que l'onglet Contacts filtre. `'all'` et `''` sont les valeurs
 *  « aucun filtre » : elles ne s'écrivent pas dans l'URL. */
export type ContactsTabFilters = {
  search: string
  role: string
  entity: string
  level: string
  /** #3742 — `kind:valeur` (pays, région, département, ville) ; absent = aucun filtre. */
  place?: string
}

type AccountDetailSearch = z.infer<typeof accountDetailSearchSchema>

const NO_FILTER = 'all'

/** URL → filtres de l'onglet. Une clé absente rend le défaut, jamais `undefined`. */
export function contactsFiltersFromSearch(search: AccountDetailSearch): ContactsTabFilters {
  return {
    search: search.q ?? '',
    role: search.role || NO_FILTER,
    entity: search.entity || NO_FILTER,
    level: search.level || NO_FILTER,
    // #3742 — clé présente SEULEMENT quand un lieu est choisi.
    ...(search.place ? { place: search.place } : {}),
  }
}

/** Filtres → clés d'URL. Un défaut RETIRE sa clé (`undefined`) : un lien
 *  partagé sans filtre reste `?tab=contacts`, pas `?role=all&entity=all…`. */
export function contactsFiltersToSearch(
  filters: ContactsTabFilters,
): Pick<AccountDetailSearch, 'q' | 'role' | 'entity' | 'level' | 'place'> {
  const keep = (value: string) => (value && value !== NO_FILTER ? value : undefined)
  return {
    q: filters.search.trim() ? filters.search : undefined,
    role: keep(filters.role),
    entity: keep(filters.entity),
    level: keep(filters.level),
    place: keep(filters.place ?? NO_FILTER),
  }
}

/** Ce que `resolveLegacyTabNotice` rend quand la notice de migration (#2115.33)
 *  a le droit de s'afficher : la valeur brute reçue, l'onglet canonique vers
 *  lequel elle a résolu, et la section qui le contient. */
export interface LegacyTabNotice {
  readonly value: string
  readonly tab: TabId
  readonly section: SectionId
}

/**
 * #2115.33 — QUAND LA NOTICE DE MIGRATION A LE DROIT DE S'AFFICHER.
 *
 * Jamais sur une valeur déjà canonique (elle n'a pas bougé, ce n'est pas une
 * migration) ni sur un raccourci de section (né AVEC les sections, rien n'y
 * surprend) — seulement sur une valeur de `LEGACY_TAB_ALIASES` : un ancien
 * onglet qui vivait seul, et qui vit maintenant DANS une section qui n'existait
 * pas quand le lien a été partagé.
 */
export function resolveLegacyTabNotice(rawValue: unknown): LegacyTabNotice | undefined {
  if (typeof rawValue !== 'string') return undefined
  const key = normalizeTabKey(rawValue)
  const tab = LEGACY_TAB_ALIASES[key]
  if (!tab) return undefined
  return { value: key, tab, section: sectionOfTab(tab) }
}

/** Une ligne de la table de correspondance complète — voir `buildTabMappingTable`.
 *  Non exportée : seule `buildTabMappingTable` (elle, exportée) la produit, et
 *  ses consommateurs (le test, la garde GA-330) lisent la forme du tableau,
 *  jamais ce type par son nom — l'exporter serait un type que son propre
 *  fichier est seul à lire (`pnpm lint:exports:types`). */
interface TabMappingRow {
  /** La valeur `tab` reconnue dans l'URL : une clé canonique ou un alias. */
  readonly value: string
  /** L'onglet canonique vers lequel elle résout — le contrat qui ne bouge pas. */
  readonly tab: TabId
  readonly section: SectionId
  readonly anchor: string
  /** Toutes les sous-parties vivent sur la même page : le dossier compte. */
  readonly ownerPage: string
}

/** Une seule route porte les quatorze onglets — pas de page dédiée par
 *  sous-partie. Un seul endroit pour ce fait : cité ici, jamais recopié. */
const ACCOUNT_DETAIL_ROUTE = '/accounts/$id'

/**
 * #2130.79 — LA TABLE DE CORRESPONDANCE COMPLÈTE : ancien onglet → nouvelle
 * section → ancre → page propriétaire.
 *
 * CALCULÉE à partir de `TAB_KEYS`, `TAB_ALIASES`, `sectionOfTab` et
 * `subSectionAnchorId` — jamais recopiée à la main : une seconde liste écrite
 * en dur aurait pu diverger de la première alias ajouté sans l'autre mise à
 * jour. Le document `agent_docs/dossier-compte-sections-2026-09-14.md` est une
 * RETRANSCRIPTION versée au dépôt de cette même table, vérifiée — jamais
 * recopiée — par `apps/web/src/architecture/dossier-compte-migration-doc.test.ts`.
 *
 * Chaque clé canonique de `TAB_KEYS` apparaît aussi comme sa propre entrée : un
 * lien `?tab=access` est une « ancienne » URL tout autant qu'un `?tab=couverture`
 * — c'est le contrat qui ne bouge pas, pas une absence de migration.
 */
export function buildTabMappingTable(): TabMappingRow[] {
  const bySourceValue = new Map<string, TabId>()
  for (const tab of TAB_KEYS) bySourceValue.set(tab, tab)
  for (const [alias, tab] of Object.entries(TAB_ALIASES)) bySourceValue.set(alias, tab)
  return [...bySourceValue.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, tab]) => ({
      value,
      tab,
      section: sectionOfTab(tab),
      anchor: subSectionAnchorId(tab),
      ownerPage: ACCOUNT_DETAIL_ROUTE,
    }))
}
