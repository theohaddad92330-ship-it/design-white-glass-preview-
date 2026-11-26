import { z } from 'zod'
import { normaliseEmail, normaliseHeader } from './import-engine.js'
import type { DryRunReport, ImportObject } from './import.js'
import { SYNC_PROVIDERS, type SyncProvider } from './sync.js'
import { IMPORT_FILE_MAX_BYTES } from './import-limits.js'

/**
 * L'IMPORT UNIVERSEL — n'importe quel nombre de lignes, n'importe quel type.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'EXIGENCE (Louis, 27/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « L'import de Bellum doit accepter N'IMPORTE QUEL NOMBRE de lignes et
 * N'IMPORTE QUEL TYPE de données (contacts, comptes, besoins, missions,
 * consultants, factures… tout ce que le CRM/ERP du client contient). Bellum ne
 * BLOQUE JAMAIS un utilisateur — si c'est trop gros, c'est à Bellum de
 * s'organiser. »
 *
 * Ce qui existait et bloquait : l'import de contacts de la fiche compte
 * (`ImportContactsDialog`, 5 champs, `MAX_ROWS = 500` — la ligne 501 était
 * tronquée), l'assistant d'import (`/import/*`, texte dans le corps JSON,
 * plafonné à `IMPORT_CONTENT_MAX_CHARS` = 8 Mo et écrit DANS la requête HTTP).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER TIENT — UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · la taille d'un PAQUET d'écriture ({@link UNIVERSAL_IMPORT_CHUNK_ROWS}) et
 *    celle d'une PART d'envoi ({@link UNIVERSAL_IMPORT_PART_BYTES}) — l'écran,
 *    le contrôleur et le worker lisent ces deux nombres, aucun ne les recopie ;
 *  · le REGISTRE des types ({@link UNIVERSAL_IMPORT_REGISTRY}) : un type se
 *    déclare par son schéma de champs, et c'est tout ce qu'il faut pour qu'il
 *    se mappe, se valide et se rapporte. Ajouter « factures » demain, c'est une
 *    entrée ici + un écrivain côté API — aucun parseur nouveau ;
 *  · la correspondance colonne → champ, et surtout ce qu'on fait d'une colonne
 *    SANS champ d'accueil : elle part dans `extra` (jsonb), jamais à la poubelle.
 *
 * Ce registre est PAR TYPE (« un fichier de contacts, d'où qu'il vienne ») ; le
 * catalogue de l'assistant (`apps/api/src/modules/import/import-catalog.ts`)
 * est PAR SOURCE (« l'export de tel éditeur »). Deux axes différents : le
 * premier sert le fichier qu'aucun catalogue ne connaît. Les normalisations et
 * les clés de dédoublonnage restent celles du moteur (`import-engine.ts`) —
 * elles ne sont pas recopiées ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT DATÉ — L'IMPORT DE BESOINS PAR FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 18/09/2026, l'import CSV/XLSX de BESOINS avait été ÉCARTÉ (les besoins
 * arrivent par e-mail, par l'AO, par le connecteur ; un fichier de besoins
 * n'était pas un geste mesuré). Le 27/09/2026, l'exigence de Louis ci-dessus le
 * RÉOUVRE : « tout ce que le CRM/ERP du client contient » comprend ses besoins.
 * Le type `need` est donc DÉCLARÉ ci-dessous. Ce renversement est écrit pour
 * être lu, pas effacé — comme `c74_campagne_etiquette_mono_contact`.
 */

/* ------------------------------------------------------------------ */
/*  Les deux réglages — un seul endroit                                */
/* ------------------------------------------------------------------ */

/**
 * Les lignes d'un PAQUET. Un paquet s'écrit dans UNE transaction avec son point
 * de reprise : un job interrompu reprend au dernier paquet VALIDÉ, jamais au
 * milieu d'un paquet, jamais depuis zéro. 500 = l'ancien plafond de la fiche
 * compte, qui devient l'unité de travail au lieu d'être la limite.
 */
export const UNIVERSAL_IMPORT_CHUNK_ROWS = 500

/**
 * La taille d'une PART d'envoi, en octets bruts. Le fichier part en morceaux
 * (upload fractionné) : aucun plafond de fichier côté produit, et chaque part
 * tient sous la limite de corps de la route `/import` (`main.ts`, 12 Mo — le
 * base64 pèse un tiers de plus que l'octet).
 */
export const UNIVERSAL_IMPORT_PART_BYTES = 4 * 1024 * 1024

/* ------------------------------------------------------------------ */
/*  Formats, types, statuts                                           */
/* ------------------------------------------------------------------ */

export const UNIVERSAL_IMPORT_FORMATS = ['csv', 'xlsx', 'json'] as const
export const universalImportFormatSchema = z.enum(UNIVERSAL_IMPORT_FORMATS)
export type UniversalImportFormat = z.infer<typeof universalImportFormatSchema>

/** Le format déduit du nom de fichier — `.tsv`/`.txt` sont du texte délimité. `null` = inconnu, dit. */
export function universalImportFormatOf(filename: string): UniversalImportFormat | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv'
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl') return 'json'
  return null
}

/** Les types déclarés. L'ordre est celui des dépendances (§7.3) : les comptes avant les contacts. */
export const UNIVERSAL_IMPORT_TYPES = ['account', 'contact', 'need', 'mission', 'talent'] as const
export const universalImportTypeSchema = z.enum(UNIVERSAL_IMPORT_TYPES)
export type UniversalImportType = z.infer<typeof universalImportTypeSchema>

/**
 * `uploading` → les parts arrivent ; `queued` → lancé ; `processing` → un
 * worker écrit ; `done` ; `failed` → toutes les tentatives épuisées, REPRENABLE
 * depuis le dernier paquet validé (un timeout n'est pas un échec définitif).
 * Liste gardée par la contrainte `universal_import_jobs_status_check` (GA-12).
 */
export const UNIVERSAL_IMPORT_STATUSES = ['uploading', 'queued', 'processing', 'done', 'failed'] as const
/**
 * #4422.1 — un envoi resté `uploading` au-delà de ce délai est INTERROMPU (l'onglet fermé, la connexion coupée) :
 * l'historique le dit « interrompu » au lieu d'un « Fichier en cours d'envoi » éternel. Un seul endroit (GA-26).
 * Dérivé à la lecture — la ligne n'est jamais supprimée ni réécrite.
 */
export const UNIVERSAL_IMPORT_UPLOAD_STALE_MS = 30 * 60 * 1000

export const universalImportStatusSchema = z.enum(UNIVERSAL_IMPORT_STATUSES)
export type UniversalImportStatus = z.infer<typeof universalImportStatusSchema>

/**
 * Les raisons d'écarter une ligne — liste FERMÉE, pour que le rapport s'additionne.
 * `write_failed` : la base a refusé la ligne (contrainte) — nommée, pas avalée.
 */
export const UNIVERSAL_IMPORT_REJECT_REASONS = [
  'missing_required_field',
  'unknown_company',
  'type_not_writable',
  'write_failed',
  // Théo B c4-assistant-import.N1 — « Ne pas importer » choisi par l'humain sur cette ligne, à la vérification.
  'skipped_by_user',
] as const
export const universalImportRejectReasonSchema = z.enum(UNIVERSAL_IMPORT_REJECT_REASONS)
export type UniversalImportRejectReason = z.infer<typeof universalImportRejectReasonSchema>

/**
 * #4053.1 / #4052.3 — ce qui reste « À RAPPROCHER » : rien n'est inventé ni fusionné, tout est nommé.
 *  · `company_to_validate` : un contact dont la société n'a NI référence source NI fiche au même nom — la
 *    société est PROPOSÉE (rapport), jamais créée (décision Louis 12/10, #4053) ; le contact attend ;
 *  · `unknown_company_ref` : une référence société inconnue, SANS nom pour la nommer — jamais une société
 *    fictive ; le contact attend ;
 *  · `probable_duplicate_account` : une référence NEUVE dont le nom normalisé est celui d'un compte déjà
 *    relié à une AUTRE référence (homonyme, autre site) — le compte est créé (le CRM dit deux entités),
 *    le rapprochement est PROPOSÉ avec la fiche homonyme, jamais fusionné ;
 *  · `title_changed` (#4051.7) : une personne DÉJÀ connue dont le titre diffère — la correction est proposée
 *    (ancien → nouveau titre, source), jamais appliquée ni créée en double.
 */
export const UNIVERSAL_IMPORT_RECONCILE_REASONS = [
  'company_to_validate',
  'unknown_company_ref',
  'probable_duplicate_account',
  'title_changed',
] as const

/**
 * Le sort d'une ligne qui n'est pas un simple « importée ». `to_reconcile` (#4051.2) : ni doublon ni rejet —
 * un rattachement que Bellum ne tranche pas seul. Liste gardée par `universal_import_issues_kind_check` (GA-12).
 */
export const UNIVERSAL_IMPORT_ISSUE_KINDS = ['duplicate', 'rejected', 'to_reconcile'] as const
export type UniversalImportIssueKind = (typeof UNIVERSAL_IMPORT_ISSUE_KINDS)[number]

/* ------------------------------------------------------------------ */
/*  Le registre typé                                                   */
/* ------------------------------------------------------------------ */

type UniversalImportField = {
  key: string
  /** Sans lui, la ligne ne veut rien dire — elle est rejetée avec `missing_required_field`. */
  required: boolean
  /** Alias sous forme NORMALISÉE (`normaliseHeader`) : sans accent, sans casse, `_`. */
  aliases: readonly string[]
}

type UniversalImportTypeDefinition = {
  fields: readonly UniversalImportField[]
  /**
   * L'écriture est-elle branchée ? `false` = le type se DÉCLARE (mapping,
   * validation, rapport), et chaque ligne est rejetée NOMMÉMENT
   * (`type_not_writable`) plutôt que de rendre un succès muet.
   */
  writable: boolean
}

/** #4052.1 — les en-têtes d'une RÉFÉRENCE source, sous forme normalisée (`normaliseHeader`). */
const SOURCE_REF_ALIASES = [
  'id',
  'reference',
  'ref',
  'reference_crm',
  'id_crm',
  'crm_id',
  'external_id',
  'identifiant',
] as const
const COMPANY_REF_ALIASES = [
  'company_ref',
  // MEYER-IMPORT M.1 — BoondManager : « Société - Référence interne »
  'societe_reference_interne',
  'societe_reference',
  'societe_ref',
  'id_societe',
  'reference_societe',
  'ref_societe',
  'societe_id',
  'company_id',
  'account_id',
  'id_compte',
  'reference_compte',
] as const

const f = (key: string, aliases: readonly string[], required = false): UniversalImportField => ({
  key,
  required,
  aliases: [key, ...aliases],
})

/**
 * Le registre. Un type NOUVEAU = une entrée ici (son schéma de champs) + un
 * écrivain côté API ; le parseur, le job, le mapping et le rapport sont communs.
 *
 * Comptes, contacts, besoins et consultants/candidats sont ÉCRITS (27/09/2026).
 * `mission` est DÉCLARÉ, pas encore écrit : une mission lie un consultant, un
 * compte et une période — la rattacher sur des libellés de fichier
 * reviendrait à deviner lequel des consultants homonymes elle staffe. Ses
 * lignes se mappent, se rapportent, et sont rejetées NOMMÉMENT
 * (`type_not_writable`) plutôt que de rendre un succès muet.
 */
export const UNIVERSAL_IMPORT_REGISTRY: Readonly<Record<UniversalImportType, UniversalImportTypeDefinition>> = {
  account: {
    writable: true,
    fields: [
      f(
        'company_name',
        [
          'company',
          'societe',
          'entreprise',
          'raison_sociale',
          'nom_societe',
          'nom_de_la_societe',
          'nom_entreprise',
          'account',
          'compte',
          'client',
        ],
        true,
      ),
      f('siren', ['siret', 'numero_siren']),
      f('website', ['domain', 'domaine', 'site', 'site_web', 'site_internet', 'url']),
      f('sector', ['secteur', 'industrie', 'industry', 'secteur_activite']),
      f('employees', ['effectif', 'effectifs', 'headcount', 'taille', 'nombre_employes']),
      f('headquarters', ['siege', 'ville', 'city', 'hq', 'localisation']),
      f('phone', ['telephone', 'tel', 'standard']),
      f('address', ['adresse', 'adresse_postale']),
      f('tags', ['tag', 'etiquettes', 'etiquette', 'labels', 'mots_cles']),
      // #4426.1 — le tiering ESN (A/B/C) et sa raison : le tier se pose en étiquette « Tier X », la raison reste lisible.
      f('tier', ['tiering', 'tiering_a_b_c', 'tier_a_b_c']),
      f('tier_reason', ['raison_du_tiering', 'raison_tiering', 'motif_du_tiering']),
      // #4052.1 — la clé du CRM d'origine, bornée à l'espace ET à la source : ni un SIREN, ni un nom.
      f('source_ref', [...SOURCE_REF_ALIASES, ...COMPANY_REF_ALIASES]),
      // #4055.5 — les autres noms de la société (`|` ou `;` entre deux) : ils rapprochent une fiche connue, jamais ne la renomment.
      f('company_alias', [
        'alias',
        'aliases',
        'alias_societe',
        'autres_noms',
        'autre_nom',
        'nom_commercial',
        'also_known_as',
      ]),
    ],
  },
  contact: {
    writable: true,
    fields: [
      f('full_name', ['name', 'nom', 'nom_complet', 'fullname', 'contact', 'prenom_nom'], true),
      f('first_name', ['prenom', 'firstname']),
      f('last_name', ['nom_de_famille', 'lastname', 'surname']),
      f('title', ['titre', 'poste', 'fonction', 'job', 'job_title', 'position', 'role']),
      f('email', [
        'e_mail',
        'mail',
        'courriel',
        'adresse_email',
        'adresse_e_mail',
        'email_address',
        'email_1',
        'e_mail_1',
      ]),
      f('phone', ['telephone', 'tel', 'mobile', 'portable', 'numero', 'phone_number', 'telephone_1', 'tel_1']),
      f('linkedin_url', ['linkedin', 'profil_linkedin', 'lien_linkedin', 'url_linkedin']),
      // MEYER-IMPORT M.1 — BoondManager : « Société - Nom » (le « - » devient `_` à la normalisation).
      f('company', ['societe', 'entreprise', 'company_name', 'raison_sociale', 'compte', 'account', 'societe_nom']),
      f('tags', ['tag', 'etiquettes', 'etiquette', 'labels', 'mots_cles']),
      // #4052.1 — la référence du contact ET celle de sa société dans le CRM d'origine.
      f('source_ref', [
        ...SOURCE_REF_ALIASES,
        'reference_interne',
        'id_contact',
        'reference_contact',
        'ref_contact',
        'contact_id',
      ]),
      f('company_ref', COMPANY_REF_ALIASES),
      // #4053.3 — les colonnes SOCIÉTÉ d'un export contacts alimentent le compte CRÉÉ. Le statut société
      // (client / prospect) reste un fait de la source, dans `extra` du compte — jamais une relation chaude.
      f('company_sector', [
        'secteur',
        'societe_secteur',
        'secteur_societe',
        'industry',
        'industrie',
        'secteur_activite',
        'secteur_d_activite',
      ]),
      f('company_employees', [
        'effectif',
        'societe_effectif',
        'effectif_societe',
        'effectifs',
        'headcount',
        'nombre_d_employes',
        'nombre_employes',
        'taille_societe',
      ]),
      f('company_city', ['ville', 'societe_ville', 'ville_societe', 'city', 'company_city']),
      f('company_status', [
        'societe_etat',
        'societe_statut',
        'statut_societe',
        'type_societe',
        'statut_client',
        'company_type',
      ]),
    ],
  },
  need: {
    writable: true,
    fields: [
      f('title', ['intitule', 'besoin', 'libelle', 'poste', 'label'], true),
      f('company', ['societe', 'entreprise', 'client', 'compte', 'account']),
      f('start_date', ['date_debut', 'date_de_debut', 'debut', 'demarrage']),
      f('daily_rate', ['tjm', 'taux_journalier', 'budget']),
      f('skills', ['competences', 'stack', 'technologies']),
      f('location', ['lieu', 'localisation', 'ville']),
    ],
  },
  mission: {
    writable: false,
    fields: [
      f('title', ['intitule', 'mission', 'libelle', 'label'], true),
      f('company', ['societe', 'entreprise', 'client', 'compte', 'account']),
      f('consultant', ['consultant', 'intervenant', 'ressource']),
      f('start_date', ['date_debut', 'date_de_debut', 'debut']),
      f('end_date', ['date_fin', 'date_de_fin', 'fin']),
      f('daily_rate', ['tjm', 'taux_journalier', 'prix_de_vente']),
    ],
  },
  talent: {
    writable: true,
    fields: [
      f('full_name', ['name', 'nom', 'nom_complet', 'consultant', 'candidat'], true),
      f('title', ['titre', 'poste', 'fonction', 'profil']),
      f('email', ['e_mail', 'mail', 'courriel']),
      f('phone', ['telephone', 'tel', 'mobile']),
      f('skills', ['competences', 'stack', 'technologies']),
      f('daily_rate', ['tjm', 'taux_journalier']),
      f('available_from', ['disponibilite', 'disponible_le', 'date_disponibilite']),
    ],
  },
}

/** Les clés de champ d'un type, dans l'ordre du registre — ce que l'écran propose dans ses listes. */
export function universalImportFieldKeys(type: UniversalImportType): string[] {
  return UNIVERSAL_IMPORT_REGISTRY[type].fields.map(field => field.key)
}

/* ------------------------------------------------------------------ */
/*  Mapping : en-tête → champ, ou `null` = conservé dans `extra`        */
/* ------------------------------------------------------------------ */

/**
 * M2.1 (Meyer 20/10) — la table d'alias du planner universel, rendue telle quelle à qui veut la lire : `{ alias
 * normalisé: clé de champ }`, le premier champ à revendiquer un alias le garde. Le Wizard (`ImportWizard`) la
 * traduit vers ses propres noms de champ au lieu d'en recopier une seconde (un réglage vit à un seul endroit, GA-26).
 */
export function universalImportAliasTable(type: UniversalImportType): Record<string, string> {
  const table: Record<string, string> = {}
  for (const field of UNIVERSAL_IMPORT_REGISTRY[type].fields) {
    for (const alias of field.aliases) if (!(alias in table)) table[alias] = field.key
  }
  return table
}

/**
 * `{ [en-tête du fichier]: clé de champ | null }`. `null` n'est PAS « ignoré » :
 * c'est « conservé dans `extra` sous son en-tête d'origine ».
 */
export const universalImportMappingSchema = z.record(z.string().max(500), z.string().max(100).nullable())
export type UniversalImportMapping = z.infer<typeof universalImportMappingSchema>

/**
 * La proposition automatique — alias FR+EN sans accent. Un champ n'est pris
 * qu'UNE fois (la première colonne qui le revendique) : une seconde colonne
 * « E-mail » part dans `extra`, elle n'écrase pas la première. Aucun repli
 * positionnel : une colonne non reconnue n'est jamais devinée.
 */
export function proposeUniversalMapping(headers: readonly string[], type: UniversalImportType): UniversalImportMapping {
  const byAlias = new Map<string, string>()
  for (const field of UNIVERSAL_IMPORT_REGISTRY[type].fields) {
    for (const alias of field.aliases) if (!byAlias.has(alias)) byAlias.set(alias, field.key)
  }
  const normalised = headers.map(normaliseHeader)
  // MEYER-IMPORT M.1 — un « Prénom » à côté d'un « Nom » : « Nom » est le NOM DE FAMILLE (BoondManager), le nom
  // complet se compose (validateUniversalRow) ; sans « Prénom », « Nom » reste le nom complet.
  if ((type === 'contact' || type === 'talent') && normalised.some(n => n === 'prenom' || n === 'firstname')) {
    byAlias.set('nom', 'last_name')
  }
  const taken = new Set<string>()
  const claimed = new Map<string, string | null>()
  // Une colonne « Société - … » réclame son champ AVANT une colonne nue du même nom (la « Ville » du contact
  // ne prend pas la place de « Société - Ville ») ; à égalité, l'ordre du fichier.
  const order = headers
    .map((header, index) => ({ header, index, key: normalised[index] as string }))
    .sort((a, b) => Number(b.key.startsWith('societe_')) - Number(a.key.startsWith('societe_')) || a.index - b.index)
  for (const { header, key } of order) {
    const field = byAlias.get(key)
    if (field && !taken.has(field)) {
      claimed.set(header, field)
      taken.add(field)
    } else if (!claimed.has(header)) {
      claimed.set(header, null)
    }
  }
  const mapping: UniversalImportMapping = {}
  for (const header of headers) mapping[header] = claimed.get(header) ?? null
  return mapping
}

/**
 * #4426.4 — ces en-têtes parlent-ils du type importé ? Oui quand chaque champ OBLIGATOIRE du type a sa colonne
 * (un contact se compose aussi de Prénom + Nom). Sert à choisir l'onglet d'un classeur : « Synthèse » (un titre,
 * un tableau croisé) ne reconnaît rien, le tableau des comptes reconnaît « Nom de la société ».
 */
export function universalImportHeadersRecognised(headers: readonly string[], type: UniversalImportType): boolean {
  if (headers.length === 0) return false
  const mapped = new Set(Object.values(proposeUniversalMapping(headers, type)))
  const composed = (type === 'contact' || type === 'talent') && mapped.has('last_name')
  return UNIVERSAL_IMPORT_REGISTRY[type].fields
    .filter(field => field.required)
    .every(field => mapped.has(field.key) || (composed && field.key === 'full_name'))
}

/**
 * #5224 — ce que le produit croit lire dans une feuille. `type` : celui que les ALIAS du registre reconnaissent
 * (chaque champ obligatoire a sa colonne) ; en cas de plusieurs types reconnus, celui dont le registre revendique le
 * plus de colonnes — jamais une vraisemblance, jamais un score affiché. `null` : rien n'est reconnu, ou deux types
 * restent à égalité (`candidates` les nomme) — la feuille n'est alors jamais rangée dans un défaut, l'humain tranche.
 * `columns` : les en-têtes du fichier sur lesquels la proposition s'appuie, dans l'ordre du fichier.
 */
export type UniversalImportDetection = {
  type: UniversalImportType | null
  columns: string[]
  candidates: UniversalImportType[]
}

export function detectUniversalImportType(headers: readonly string[]): UniversalImportDetection {
  const claimed = (type: UniversalImportType): string[] => {
    const mapping = proposeUniversalMapping(headers, type)
    return headers.filter(header => mapping[header] != null)
  }
  const recognised = UNIVERSAL_IMPORT_TYPES.filter(type => universalImportHeadersRecognised(headers, type)).map(
    type => ({
      type,
      columns: claimed(type),
    }),
  )
  const most = Math.max(0, ...recognised.map(found => found.columns.length))
  const leaders = recognised.filter(found => found.columns.length === most)
  const [only] = leaders
  if (leaders.length === 1 && only) return { type: only.type, columns: only.columns, candidates: [only.type] }
  return { type: null, columns: [], candidates: leaders.map(found => found.type) }
}

/**
 * #5224 — l'ordre d'écriture des feuilles : celui des dépendances (`UNIVERSAL_IMPORT_TYPES`, les comptes avant les
 * contacts), jamais celui du classeur. À type égal, l'ordre du fichier est gardé.
 */
export function orderUniversalSheetPlans<T extends { type?: UniversalImportType | undefined }>(
  plans: readonly T[],
  fallback?: UniversalImportType,
): T[] {
  const rank = (plan: T): number => {
    const type = plan.type ?? fallback
    return type ? UNIVERSAL_IMPORT_TYPES.indexOf(type) : UNIVERSAL_IMPORT_TYPES.length
  }
  return plans
    .map((plan, index) => ({ plan, index }))
    .sort((a, b) => rank(a.plan) - rank(b.plan) || a.index - b.index)
    .map(({ plan }) => plan)
}

/**
 * Refuse un mapping qui vise un champ INCONNU du type, ou deux colonnes sur le
 * même champ. `null` quand il est valide ; sinon la raison, en clair.
 */
export function universalMappingError(mapping: UniversalImportMapping, type: UniversalImportType): string | null {
  const known = new Set(universalImportFieldKeys(type))
  const seen = new Set<string>()
  for (const [header, field] of Object.entries(mapping)) {
    if (field === null) continue
    if (!known.has(field)) return `Champ inconnu pour ce type : « ${field} » (colonne « ${header} »).`
    if (seen.has(field)) return `Deux colonnes visent le même champ « ${field} ».`
    seen.add(field)
  }
  return null
}

/** Une ligne découpée : les champs connus d'un côté, TOUT le reste de l'autre. */
export type UniversalSplitRow = { fields: Record<string, string>; extra: Record<string, string> }

/**
 * Découpe une ligne selon le mapping. Une cellule VIDE ne produit rien — ni
 * champ, ni entrée `extra` : une absence ne fait aucune ligne (doctrine « on
 * n'affiche pas ce qu'on n'a pas »), et surtout jamais un « 0 ». Une colonne
 * absente du mapping (en-tête apparu après la prévisualisation) part dans
 * `extra` : rien n'est jeté.
 */
export function splitUniversalRow(
  record: Readonly<Record<string, string>>,
  mapping: UniversalImportMapping,
): UniversalSplitRow {
  const fields: Record<string, string> = {}
  const extra: Record<string, string> = {}
  for (const [header, raw] of Object.entries(record)) {
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) continue
    const field = mapping[header] ?? null
    if (field) fields[field] = value
    else extra[header] = value
  }
  return { fields, extra }
}

/* ------------------------------------------------------------------ */
/*  Validation par ligne (Zod)                                         */
/* ------------------------------------------------------------------ */

const cell = z.string().trim().min(1).max(5_000)

/**
 * Le schéma Zod d'une ligne d'un type : chaque champ est une cellule texte
 * bornée, les obligatoires sont requis. Construit depuis le registre — il ne
 * peut pas diverger de lui.
 */
function rowSchemaOf(type: UniversalImportType): z.ZodType<Record<string, string>> {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of UNIVERSAL_IMPORT_REGISTRY[type].fields) shape[field.key] = field.required ? cell : cell.optional()
  return z.object(shape).strip() as unknown as z.ZodType<Record<string, string>>
}

const ROW_SCHEMAS = Object.fromEntries(UNIVERSAL_IMPORT_TYPES.map(type => [type, rowSchemaOf(type)])) as Record<
  UniversalImportType,
  z.ZodType<Record<string, string>>
>

export type UniversalRowVerdict =
  | { ok: true; fields: Record<string, string>; extra: Record<string, string> }
  | { ok: false; reason: UniversalImportRejectReason; detail: string }

/**
 * Le verdict d'une ligne, AVANT toute écriture.
 *
 * Deux dérivations, et seulement celles-là :
 *  · un contact sans `full_name` mais avec prénom + nom reçoit « Prénom Nom » ;
 *  · un e-mail illisible ne devient pas un e-mail : sa valeur BRUTE part dans
 *    `extra` sous son en-tête (on ne jette rien, on n'invente rien), et la
 *    ligne continue sans e-mail.
 */
export function validateUniversalRow(
  type: UniversalImportType,
  split: UniversalSplitRow,
  mapping: UniversalImportMapping,
): UniversalRowVerdict {
  const fields = { ...split.fields }
  const extra = { ...split.extra }
  if (type === 'contact' || type === 'talent') {
    if (!fields['full_name']) {
      const composed = [fields['first_name'], fields['last_name']].filter(Boolean).join(' ').trim()
      if (composed) fields['full_name'] = composed
    }
  }
  if (fields['email'] !== undefined) {
    const email = normaliseEmail(fields['email'])
    if (email) fields['email'] = email
    else {
      const header = Object.keys(mapping).find(key => mapping[key] === 'email') ?? 'email'
      extra[header] = fields['email']
      delete fields['email']
    }
  }
  const parsed = ROW_SCHEMAS[type].safeParse(fields)
  if (!parsed.success) {
    const missing = UNIVERSAL_IMPORT_REGISTRY[type].fields.filter(field => field.required && !fields[field.key])
    const detail =
      missing.length > 0 ? missing.map(field => field.key).join(', ') : (parsed.error.issues[0]?.message ?? '')
    return { ok: false, reason: 'missing_required_field', detail }
  }
  return { ok: true, fields: parsed.data, extra }
}

/* ------------------------------------------------------------------ */
/*  Entrées / sorties HTTP                                             */
/* ------------------------------------------------------------------ */

/**
 * #2927 (#2159.54/.55) — LA PORTÉE d'un import de contacts : `workspace` (ceux de l'équipe, comportement
 * historique) ou `personal` (toi seul). Un contact personnel s'écrit dans SA table (`personal_contacts`),
 * que AUCUN lecteur de `contacts` ne touche : la confidentialité tient par construction, pas par un filtre
 * à poser sur chaque chemin de lecture.
 */
export const UNIVERSAL_IMPORT_SCOPES = ['workspace', 'personal'] as const
export const universalImportScopeSchema = z.enum(UNIVERSAL_IMPORT_SCOPES)
export type UniversalImportScope = z.infer<typeof universalImportScopeSchema>

/** `POST /import/universal/jobs` — ouvre un job, AVANT l'envoi des parts. */
export const universalImportCreateSchema = z
  .object({
    type: universalImportTypeSchema,
    filename: z.string().trim().min(1).max(300),
    /** Le nombre de parts qui vont suivre. Pas de plafond de LIGNES : c'est le fichier qui se découpe. */
    // #3666.9 (Louis 15/10/2026) — la limite annoncée de 1 Go, relue par l'API : pas une part de plus.
    parts: z
      .number()
      .int()
      .min(1)
      .max(Math.ceil(IMPORT_FILE_MAX_BYTES / UNIVERSAL_IMPORT_PART_BYTES)),
    /** Le compte de la fiche d'où l'import part — les contacts s'y rattachent. Vérifié dans l'espace. */
    accountId: z.string().guid().nullable().optional(),
    /** Absent = `workspace`. `personal` n'existe que pour les contacts. */
    scope: universalImportScopeSchema.optional(),
    /**
     * #4052.2 — le CRM d'où vient le fichier (« HubSpot », « BoondManager »…). Il borne les références
     * source : la même référence chez deux CRM ne désigne pas la même fiche. Absent = « fichier ».
     */
    sourceSystem: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .refine(input => input.scope !== 'personal' || input.type === 'contact', {
    message: 'La portée personnelle n’existe que pour les contacts.',
    path: ['scope'],
  })
export type UniversalImportCreateInput = z.infer<typeof universalImportCreateSchema>

/** `PUT /import/universal/jobs/:id/parts/:index` — une part, en base64. */
export const universalImportPartSchema = z.object({
  dataB64: z
    .string()
    .min(1)
    // Un cran au-dessus de 4/3 × la part : le base64 arrondit au multiple de 4.
    .max(Math.ceil((UNIVERSAL_IMPORT_PART_BYTES * 4) / 3) + 8),
})

/**
 * Théo B c4-assistant-import.R3 — combien de lignes la vérification détaille une à une (le reste est COMPTÉ, jamais
 * tu). Un seul endroit : l'API borne la réponse, l'écran pagine dedans, le lancement n'accepte pas plus de « écartées ».
 */
export const UNIVERSAL_IMPORT_VERIFY_ROW_CAP = 500

/** Le sort PRÉVU d'une ligne, avant tout import (c4-assistant-import.R3). */
export const UNIVERSAL_IMPORT_ROW_VERDICTS = ['create', 'complete', 'duplicate', 'invalid', 'to_reconcile'] as const
export type UniversalImportRowVerdict = (typeof UNIVERSAL_IMPORT_ROW_VERDICTS)[number]

export type UniversalImportVerifiedRow = {
  /** Le numéro de ligne DU FICHIER (l'en-tête est la ligne 1). */
  line: number
  verdict: UniversalImportRowVerdict
  /** Le nom lu sur la ligne ; `null` quand la ligne n'en a pas — jamais un libellé inventé. */
  label: string | null
  /** La raison nommée d'un verdict autre que « créer » (`missing_required_field`, `duplicate`, `title_changed`…). */
  reason: string | null
  /** Une fiche existante proposée (doublon, complétion) ; jamais fusionnée. */
  existingId: string | null
}

/** Le plan d'un fichier, lu SANS rien écrire — le rapport de la vérification. */
export type UniversalImportVerification = {
  total: number
  toCreate: number
  toComplete: number
  /** Doublons, lignes invalides et rattachements à valider : tout ce qui n'entre pas tel quel. */
  discarded: number
  rows: UniversalImportVerifiedRow[]
  /** Le détail ligne à ligne est borné ({@link UNIVERSAL_IMPORT_VERIFY_ROW_CAP}) ; les compteurs, eux, couvrent tout. */
  truncated: boolean
  /** Les colonnes dont l'en-tête signale une donnée sensible : jamais importées sans toi. */
  sensitiveColumns: string[]
  /** Contacts qui arriveraient sans base légale documentée (les créations d'un fichier de contacts). */
  withoutLegalBasis: number
  /** #5223 — le même plan, VENTILÉ par feuille quand le dépôt en lit plusieurs. Absent pour une seule feuille. */
  sheets?: Array<{ name: string; total: number; toCreate: number; toComplete: number; discarded: number }>
}

/**
 * #5223 — les feuilles d'un classeur lues par UN dépôt : chacune garde SA correspondance de colonnes (deux feuilles
 * n'ont pas les mêmes en-têtes). Une feuille ne figure qu'une fois ; une liste vide n'est pas un choix.
 */
export const universalImportSheetPlanSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mapping: universalImportMappingSchema,
  /**
   * #5224 — le type de CETTE feuille, proposé par le produit et corrigé par l'humain (sa correction gagne).
   * Absent = le type du dépôt.
   */
  type: universalImportTypeSchema.optional(),
})
export type UniversalImportSheetPlan = z.infer<typeof universalImportSheetPlanSchema>

const universalImportSheetPlansSchema = z
  .array(universalImportSheetPlanSchema)
  .min(1)
  .max(64)
  .refine(plans => new Set(plans.map(plan => plan.name)).size === plans.length, {
    message: 'Une feuille ne se lit qu’une fois.',
  })

/** `POST /import/universal/jobs/:id/start` — le mapping VALIDÉ par l'humain. */
export const universalImportStartSchema = z.object({
  mapping: universalImportMappingSchema,
  /** #4426.4 — l'onglet d'un classeur XLSX choisi par l'humain. Absent = le choix automatique. */
  sheet: z.string().trim().min(1).max(200).nullable().optional(),
  /** #5223 — PLUSIEURS feuilles, chacune avec son mapping. Présent, il remplace `sheet` et `mapping`. */
  sheets: universalImportSheetPlansSchema.optional(),
  // Théo B c4-assistant-import.N1 — les lignes que l'humain a décidé de NE PAS importer à la vérification.
  skipLines: z.array(z.number().int().min(2)).max(UNIVERSAL_IMPORT_VERIFY_ROW_CAP).optional(),
  // Théo B c4.N2 — « Organiser l'arrivée » se dit APRÈS le dépôt : qui voit les contacts, et le CRM d'origine.
  scope: universalImportScopeSchema.optional(),
  sourceSystem: z.string().trim().min(1).max(80).nullable().optional(),
})

/** `POST /import/universal/jobs/:id/verify` — le mapping à vérifier, sans rien écrire. */
export const universalImportVerifySchema = z.object({
  mapping: universalImportMappingSchema,
  sheet: z.string().trim().min(1).max(200).nullable().optional(),
  sheets: universalImportSheetPlansSchema.optional(),
  scope: universalImportScopeSchema.optional(),
  sourceSystem: z.string().trim().min(1).max(80).nullable().optional(),
})

/** `POST /import/universal/jobs/:id/preview` — l'onglet à prévisualiser, quand l'humain en change. */
export const universalImportPreviewSchema = z.object({
  sheet: z.string().trim().min(1).max(200).nullable().optional(),
})

/** Ce que rend la prévisualisation : en-têtes, proposition, quelques lignes. */
export type UniversalImportPreview = {
  headers: string[]
  mapping: UniversalImportMapping
  sample: Record<string, string>[]
  fields: string[]
  /** #4426.4 — les onglets d'un classeur (nom + lignes de données) et celui qui est lu. Absent hors XLSX. */
  sheets?: Array<{
    name: string
    rows: number
    recognised?: boolean
    /** #5224 — ce que le produit croit y lire, avec ses colonnes ; absent quand rien n'est reconnu (jamais un défaut). */
    detected?: { type: UniversalImportType; columns: string[] }
    /** #5224 — deux types à égalité : nommés, jamais tranchés au jugé. */
    candidates?: UniversalImportType[]
  }>
  sheet?: string | null
}

/** L'état d'un job, tel que l'écran et la passerelle temps réel le lisent. */
export type UniversalImportJobState = {
  id: string
  type: UniversalImportType
  status: UniversalImportStatus
  filename: string
  /** `null` tant que la lecture n'est pas finie — jamais un 0 inventé. */
  totalRows: number | null
  processedRows: number
  imported: number
  duplicates: number
  rejected: number
  error: string | null
  /** #2927 — où les lignes atterrissent. */
  scope: UniversalImportScope
  /** #4051.2 — les rattachements que Bellum ne tranche pas seul (rapport, avec leur raison). */
  toReconcile: number
  /** #4051.1 — le bilan PAR FAMILLE (un fichier contacts crée aussi des comptes, #4053). */
  breakdown: UniversalImportBreakdown
  /**
   * #4051.1 — les fiches versées dans la base d'ÉQUIPE que Laura lit (comptes, contacts). `null` quand ce
   * n'est pas mesurable ici (import personnel, besoins, consultants) — jamais un 0 inventé.
   */
  queryableByLaura: number | null
  /** #4052.2 — le CRM d'origine déclaré, tel que saisi. `null` = non dit. */
  sourceSystem: string | null
  /** #5223 — le bilan PAR FEUILLE d'un dépôt multi-feuilles. Absent pour une seule feuille (jamais une liste vide). */
  sheets?: UniversalImportSheetReport[]
}

/**
 * #5223 — ce qu'UNE feuille d'un dépôt a fait. `totalRows` reste `null` tant que la feuille n'est pas lue jusqu'au
 * bout (jamais un 0 inventé) ; `committedRows` est son point de reprise : une feuille `done` ne se rejoue pas.
 */
export type UniversalImportSheetReport = {
  name: string
  /** #5224 — ce que la feuille a été lue COMME. Absent pour un dépôt d'avant : celui du job. */
  type?: UniversalImportType
  done: boolean
  totalRows: number | null
  committedRows: number
  created: number
  duplicates: number
  rejected: number
  toReconcile: number
  /** Les écarts de cette feuille, comptés PAR RAISON. */
  reasons: UniversalImportReasonCount[]
}

/** #5223 — la feuille telle que le job la PERSISTE : son rapport et sa correspondance de colonnes. */
export type UniversalImportSheetPass = UniversalImportSheetReport & { mapping: UniversalImportMapping }

/**
 * MEYER-IMPORT M.2 (#4051) — une RAISON comptée : « 1025 lignes écartées » ne se lit jamais sans elle. `reason` est
 * une valeur de `UNIVERSAL_IMPORT_REJECT_REASONS` (kind `rejected`) ou de `UNIVERSAL_IMPORT_RECONCILE_REASONS`
 * (kind `to_reconcile`) — l'écran traduit, la liste reste fermée.
 */
export type UniversalImportReasonCount = { kind: 'rejected' | 'to_reconcile'; reason: string; count: number }

/** #4051.1 — ce qu'un lot a fait d'UNE famille d'objets. Une absence n'est jamais écrite « 0 » à l'écran. */
export type UniversalImportFamilyCounts = {
  /** Fiches neuves écrites. */
  created: number
  /** Fiches existantes RECONNUES par leur référence source (complétées sans écraser) ou reliées à elle. */
  matched: number
  duplicates: number
  rejected: number
  toReconcile: number
  /**
   * #4051.8 — lignes dont la coordonnée (e-mail / téléphone) est DÉJÀ dans l'espace. Optionnel : un lot
   * d'avant ne le porte pas, et une absence n'est jamais écrite « 0 ».
   */
  alreadyKnown?: number
  /**
   * #4051.5 (18/10) — les personnes DISTINCTES que le lot a résolues (créées, reconnues ou déjà connues), à ne pas
   * confondre avec les lignes. Optionnel : un lot d'avant, ou une famille sans personne, ne le porte pas — absent,
   * il ne s'écrit jamais « 0 ».
   */
  distinctPeople?: number
  /** #4051.5 — les comptes (entités) distincts que le lot a résolus. Même règle : absent = non calculé. */
  resolvedAccounts?: number
}

/**
 * #4051.2 — les familles que le BILAN dit, au-delà des cinq types de fichier : les CV (import en masse de
 * consultants) et les documents (base de connaissance). Chacune a son propre chemin d'import ; le bilan a la
 * même forme pour toutes, rendu par le même composant.
 */
export const IMPORT_REPORT_EXTRA_FAMILIES = ['cv', 'document'] as const
export type ImportReportFamily = UniversalImportType | (typeof IMPORT_REPORT_EXTRA_FAMILIES)[number]

export type UniversalImportBreakdown = Partial<Record<ImportReportFamily, UniversalImportFamilyCounts>>

/** #4051.1 — une famille vide de compteurs, point de départ d'une addition. */
export function emptyUniversalImportFamilyCounts(): UniversalImportFamilyCounts {
  return { created: 0, matched: 0, duplicates: 0, rejected: 0, toReconcile: 0 }
}

/**
 * #4051.1 — la famille d'un écart du rapport. Seul l'homonyme de société touche les COMPTES depuis un fichier
 * d'un autre type ; tout le reste appartient au type du lot. Dérivé de la raison : aucune colonne de plus.
 */
export function universalImportFamilyOfIssue(jobType: UniversalImportType, reason: string): UniversalImportType {
  return reason === 'probable_duplicate_account' ? 'account' : jobType
}

/* ------------------------------------------------------------------ */
/*  #4052 — références source : bornées à l'espace ET à la source       */
/* ------------------------------------------------------------------ */

/**
 * #4052.2 — UNE notion de référence source par espace : `sync_links` (posée par les connecteurs CRM).
 * Un export d'un CRM que nous connectons (HubSpot, Salesforce…) range sa référence sous CE fournisseur,
 * brute — le connecteur et le fichier se reconnaissent. Tout autre CRM range la sienne sous `csv`,
 * PRÉFIXÉE par le nom de sa source : deux CRM ne se confondent jamais. Une référence n'est ni un SIREN,
 * ni un nom, ni une preuve de hiérarchie ou de statut client — et ne donne aucun droit hors de l'espace.
 */
export type UniversalImportSource = { provider: SyncProvider; namespace: string | null }

export function universalImportSourceOf(sourceSystem: string | null | undefined): UniversalImportSource {
  const slug = (sourceSystem ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  const known = SYNC_PROVIDERS.find(provider => provider !== 'csv' && provider === slug)
  if (known) return { provider: known, namespace: null }
  return { provider: 'csv', namespace: slug || 'fichier' }
}

/** La clé stockée (`sync_links.external_id`) d'une référence lue dans le fichier. */
export function universalImportSourceRefKey(source: UniversalImportSource, ref: string): string {
  const trimmed = ref.trim()
  return source.namespace ? `${source.namespace}:${trimmed}` : trimmed
}

/** #2927 — un contact PERSONNEL, tel que son propriétaire (et lui seul) le lit. */
export type PersonalContact = {
  id: string
  accountId: string
  fullName: string
  title: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  createdAt: string
}

/** #2927 — le résultat de « Partager avec l'équipe » : la fiche d'équipe, et si elle existait déjà (même e-mail). */
export type PersonalContactShare = { contactId: string; alreadyKnown: boolean }

/** L'évènement Socket.IO de progression, et son nom — une seule écriture. */
export const UNIVERSAL_IMPORT_SOCKET_EVENTS = {
  join: 'universal-import:join',
  leave: 'universal-import:leave',
  progress: 'universal-import:progress',
} as const

/** Une ligne du rapport téléchargeable (doublon proposé ou ligne rejetée). */
export type UniversalImportIssue = {
  row: number
  kind: UniversalImportIssueKind
  reason: string
  /** Pour un doublon : la fiche EXISTANTE proposée — jamais fusionnée. */
  existingId: string | null
  label: string | null
}

/** Le rapport en CSV (`;`, lisible par Excel FR). Le numéro de ligne est celui du FICHIER (en-tête = 1). */
export function universalImportIssuesToCsv(issues: readonly UniversalImportIssue[]): string {
  const esc = (value: string | number | null): string => {
    const text = value === null ? '' : String(value)
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = ['ligne;sort;raison;fiche_existante;libelle']
  for (const issue of issues) {
    lines.push([issue.row, issue.kind, issue.reason, issue.existingId, issue.label].map(esc).join(';'))
  }
  return `${lines.join('\n')}\n`
}

/**
 * #4051 — le bilan PAR FAMILLE d'un passage de l'assistant de reprise, dérivé du rapport qu'il affiche déjà
 * (jamais un second calcul) pour que les deux chemins d'import — l'import universel de /contacts et
 * l'assistant de /settings/import — rendent LE MÊME bilan, par le même composant.
 *
 *  · `created` / `matched` : ce que l'écriture a posé / reconnu et complété (`updated`) ;
 *  · `toReconcile` : les lignes SANS société, « à valider » (#4053.1) ;
 *  · `duplicates` : doublons dans le fichier et doublons PROPOSÉS (jamais fusionnés) ;
 *  · `rejected` : tout le reste de ce qui est écarté, avec sa raison au rapport.
 *
 * `null` pour un objet que l'import universel ne connaît pas (projet…) : il garde ses compteurs globaux,
 * on n'invente pas une famille.
 */
export function wizardImportBreakdown(
  object: ImportObject,
  written: { created: number; updated: number },
  report: DryRunReport,
): UniversalImportBreakdown | null {
  if (!(UNIVERSAL_IMPORT_TYPES as readonly string[]).includes(object)) return null
  const toReconcile = report.skipped.filter(row => row.reason === 'company_to_validate').length
  const inFile = report.skipped.filter(row => row.reason === 'duplicate_in_file').length
  const rejected = report.skipped.length - toReconcile - inFile
  return {
    [object as UniversalImportType]: {
      created: written.created,
      matched: written.updated,
      duplicates: inFile + report.possibleDuplicates.length,
      rejected,
      toReconcile,
    },
  }
}

/**
 * #4051.2 — le bilan d'un lot de CV, dérivé du compte par issue que le lot porte déjà (jamais un second calcul) :
 * créés ; mis à jour (reconnus, complétés) ; « à rapprocher » = fiches en exception, avec leur raison au rapport ;
 * échoués = illisibles ou trop gros. Les fichiers qui n'étaient pas des CV ne sont pas un échec : ils ne comptent pas.
 * `{}` quand aucun fichier n'a produit d'issue — jamais une famille à zéro.
 */
export function cvBatchBreakdown(summary: {
  created: number
  auto_updated: number
  exception: number
  too_big: number
  failed: number
}): UniversalImportBreakdown {
  const counts: UniversalImportFamilyCounts = {
    created: summary.created,
    matched: summary.auto_updated,
    duplicates: 0,
    rejected: summary.failed + summary.too_big,
    toReconcile: summary.exception,
  }
  const any = counts.created + counts.matched + counts.rejected + counts.toReconcile > 0
  return any ? { cv: counts } : {}
}

/** #4051.2 — le bilan d'un dépôt de documents : déposés ; échoués. `{}` quand rien n'a été tenté. */
export function documentUploadBreakdown(outcome: { done: number; failed: number }): UniversalImportBreakdown {
  if (outcome.done + outcome.failed === 0) return {}
  return {
    document: {
      created: outcome.done,
      matched: 0,
      duplicates: 0,
      rejected: outcome.failed,
      toReconcile: 0,
    },
  }
}
