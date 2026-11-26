import type { Row, Table } from './table'
import type { TextRewrite } from './text-rules'

/**
 * Le PLAN d'un compte : pour chaque onglet du classeur, vers quel(s) champ(s)
 * du contrat `CommercialBrief` ses lignes vont. Table DÉCLARATIVE — un onglet
 * du classeur absent du plan, ou un onglet du plan absent du classeur, ou une
 * colonne que le plan ne lit pas sans la déclarer dans `dropped`, fait échouer
 * la conversion : c'est une erreur, pas un oubli.
 */

export type PersonRole = 'decision_maker' | 'manager' | 'contact' | 'external' | 'alumni'
export type PriceChannel = 'direct' | 'msp' | 'portage' | 'framework' | 'sector_reference'

export type PersonDraft = {
  name?: string
  function?: string
  entity?: string
  department?: string
  manager?: string
  city?: string
  email?: string
  mobile?: string
  phone?: string
  linkedin?: string
  hook?: string
  reliability?: string
}
export type SiteDraft = {
  name: string
  city: string
  kind: 'headquarters' | 'secondary' | 'industrial' | 'other'
  why?: string
  reliability?: string
}
export type EntityDraft = {
  name: string
  nature?: string
  status: 'active' | 'exited'
  /** ISO-2 ; absent = pays non précisé par le classeur. */
  country?: string
  note?: string
  reliability?: string
}
export type EsnDraft = {
  name: string
  evidence_level: 'confirmed' | 'observed' | 'hint'
  proof: string
  perimeter?: string
  reliability?: string
}
export type PriceDraft = {
  label: string
  amount_eur_per_day: number
  channel: PriceChannel
  note?: string
  reliability?: string
}

/** Ligne qui n'entre pas dans le champ visé (hors France, périmètre sorti, ligne sans donnée…) :
 *  elle n'est PAS perdue, elle va dans une section `<onglet>-non-retenus` avec son motif. */
type Rest = { rest: string }

/** Outils de lecture de champ, qui comptent ce qu'ils écartent (rapport de couverture). */
export type Fields = {
  /** Coordonnée téléphonique : au moins 6 chiffres, jamais une date ni un libellé (« Faux numéro »). */
  phone: (value: string | undefined, label: string) => string | undefined
  /** Une ou plusieurs adresses (séparées par « | »), seulement ce qui contient « @ ». */
  email: (...values: (string | undefined)[]) => string | undefined
  /** Texte affiché non vide, espaces internes normalisés. */
  name: (value: string | undefined) => string | undefined
  /** Premier texte non vide. */
  first: (...values: (string | undefined)[]) => string | undefined
  /** Texte assemblé, valeurs vides et « — » ignorées. */
  join: (separator: string, ...values: (string | undefined)[]) => string | undefined
  /** Adresse de profil : la cible du lien, sinon le texte s'il est lui-même une URL. */
  link: (row: Row, header: string) => string | undefined
  /** Compte une valeur écartée par le plan, avec sa raison. */
  skip: (reason: string) => void
}

type SectionOptions = { key?: string }

export type PeoplePlan = {
  role: PersonRole | ((row: Row) => PersonRole)
  /** `add` : une ligne = une personne. `merge` : si la personne existe déjà (même nom, onglets de base d'abord), on lui ajoute le rôle et les champs manquants. */
  mode: 'add' | 'merge'
  map: (row: Row, fields: Fields, table: Table) => PersonDraft | Rest
  /** Garde aussi l'onglet entier en section (colonnes que le contrat ne porte pas). */
  also?: SectionOptions
}

export type SheetPlan = {
  sheet: string
  /** Colonnes volontairement retirées, avec la raison. Jamais lues par un champ. */
  dropped?: Record<string, string>
  cockpit?: true
  fiche?: true
  section?: SectionOptions
  sites?: { map: (row: Row, fields: Fields) => SiteDraft | Rest }
  entities?: { map: (row: Row, fields: Fields) => EntityDraft | Rest }
  esn?: { map: (row: Row, fields: Fields) => EsnDraft | Rest }
  people?: PeoplePlan
  prices?: { map: (row: Row, fields: Fields) => PriceDraft | readonly PriceDraft[] | null }
  guardrails?: true
  /** Garde-fous lus dans un onglet qui n'est pas GARDE-FOUS (ABB : trois règles suisses de REGLES SUISSE). `null` = ligne ignorée. */
  guardrailRows?: { map: (row: Row) => { point: string; detail: string } | null }
  /** Onglet reconnu mais volontairement non lu (couche : identique à l'onglet du compte de base). Raison obligatoire. */
  skip?: string
}

/**
 * Une COUCHE ajoutée à un compte (démo Thélio 06/10/2026 : BPCE + Toulouse). UN seul compte, UN seul JSON : le classeur
 * du compte de base est converti seul ; le classeur de la couche l'est à part (ses onglets PROPRES seulement — ceux
 * qui sont identiques à ceux du compte de base portent `skip` : reconnus puis ignorés), puis `applyLayer` AJOUTE le
 * résultat : personnes / entités / sites dédoublonnés, garde-fous préfixés, sections `<key>-…`, cockpit de la couche
 * en section `cockpit-<key>`.
 */
export type LayerPlan = {
  /** Préfixe des sections et clé du cockpit : `toulouse` → `toulouse-…`, `cockpit-toulouse`. */
  key: string
  /** Libellé affiché (garde-fous « Toulouse — … », couverture « [Toulouse] … »). */
  label: string
  /** Département posé sur les personnes que la couche apporte (jamais écrasé sur une personne déjà connue). */
  department: string
  source: string
  /** Début attendu du titre du COCKPIT de la couche, en majuscules du classeur. */
  titlePrefix: string
  rewrites: readonly TextRewrite[]
  sheets: readonly SheetPlan[]
}

/**
 * Un compte lu dans un SECOND classeur (Sanofi : « QuickSort » + « Lyon », démo clients 04/10/2026).
 * Le premier classeur (`AccountPlan.sheets`) est la base ; chaque onglet du second doit être CLASSÉ
 * ici, sinon la conversion échoue — jamais un onglet ignoré en silence.
 */
export type SupplementPlan = {
  /** Nom du second classeur, dans le même dossier que le premier (ou `AccountPlan.sourceDir`). */
  source: string
  /** Le COCKPIT du second classeur, rendu en section (indicateurs, rubriques, graphiques) : les 6 KPI du compte restent ceux de la base. */
  cockpit?: { key: string; title: string }
  /** Onglets gardés entiers, dans une section à clé propre. */
  sections?: readonly { sheet: string; key: string; title?: string }[]
  /** Onglets dont seules les lignes ABSENTES de la section de base `into` s'y ajoutent. */
  missingRows?: readonly { sheet: string; into: string }[]
  /** Onglets du second classeur → onglet de la base qui porte déjà les mêmes lignes ; vérifié, échoue sinon. */
  identical?: Readonly<Record<string, string>>
}

export type AccountPlan = {
  slug: string
  /** Périmètre du brief : `france` (défaut) ou `suisse` (ABB Suisse, décision Louis 04/10/2026 : pays des sites CH). */
  scope?: 'france' | 'suisse'
  /**
   * Tuiles du bandeau COCKPIT écartées, NOMMÉES (libellé du classeur) avec leur raison : une tuile écrite à la main
   * dans le classeur peut contredire le reste du brief. Un libellé qui ne se trouve pas dans le COCKPIT fait échouer
   * la conversion — jamais une règle morte.
   */
  droppedKpis?: readonly { label: string; value: string | number; reason: string }[]
  /** Couches ajoutées au compte (BPCE + Toulouse). */
  layers?: readonly LayerPlan[]
  /** Interne : plan d'une COUCHE (pas de fiche compte ni de siège à lire). */
  layer?: true
  /** Nom du compte (`account_name`). */
  name: string
  /** Début attendu du titre du COCKPIT, en majuscules du classeur. */
  titlePrefix: string
  source: string
  /** Dossier des classeurs, relatif à `agent_docs/sources/` ; sinon le dossier de `--source-dir`. */
  sourceDir?: string
  /** Second classeur du même compte (voir {@link SupplementPlan}). */
  supplements?: readonly SupplementPlan[]
  headquarters: {
    /** Libellé du champ de FICHE COMPTE qui porte le siège. */
    champ: string
    label: string
    city: string
    address?: string
  }
  /** Noms de la source (entité OU département) qui désignent un périmètre sorti du groupe. */
  exitedAliases: { aliases: readonly string[]; nature: string; note: string }
  rewrites: readonly TextRewrite[]
  sheets: readonly SheetPlan[]
  /** Entités sorties qui ne figurent dans aucun onglet d'entités (ex. Reichshoffen) : dérivées d'une ligne de la source. */
  derivedEntities?: (tables: ReadonlyMap<string, Table>) => EntityDraft[]
  /** Sites lus dans une ligne de FICHE COMPTE quand le classeur n'a pas d'onglet de sites (Naval Group Indret). */
  derivedSites?: (tables: ReadonlyMap<string, Table>) => SiteDraft[]
  /** Prix lus dans un texte (Engie), vérifiés contre les phrases du classeur. */
  derivedPrices?: (text: (sheet: string) => string) => PriceDraft[]
}
