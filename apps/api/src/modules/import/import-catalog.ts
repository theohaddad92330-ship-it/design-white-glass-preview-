import { IMPORT_SOURCES, universalImportAliasTable, type ImportObject, type ImportSource } from '@bellum/contracts'

/**
 * Ce que chaque source APPORTE, colonne par colonne.
 *
 * Le catalogue vit dans le CODE, comme celui des workflows, des routines et des
 * chaînes — et pour la même raison : une source d'import éditable sans revue est
 * un chemin d'écriture non gouverné vers la base d'un client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES ALIAS ET PAS DOUZE PARSEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * Douze parseurs écrits à la main, ce sont douze bugs, et le douzième se
 * découvre chez un client en train de reprendre sa base. Une source est donc un
 * DESCRIPTEUR — ses alias de colonnes, ses champs obligatoires, son objet cible
 * — et un seul moteur les lit toutes. Ajouter une treizième source, c'est
 * ajouter une entrée ici : aucun code nouveau, donc aucun bug nouveau.
 *
 * Les alias sont écrits sous leur forme NORMALISÉE (sans accent, sans casse,
 * ponctuation en `_`), parce que c'est la seule forme qui rapproche « Adresse
 * e-mail », « adresse_email » et « ADRESSE E-MAIL » — les trois orthographes que
 * produisent trois exports du même outil.
 */

type ImportSourceDefinition = ImportSource & {
  /** Alias de colonne NORMALISÉ → champ interne. */
  aliases: Readonly<Record<string, string>>
  /** Les champs sans lesquels une ligne ne veut rien dire. */
  required: readonly string[]
  /** Ce que l'assistant DIT importer, et ce qu'il dit ne pas importer (§7.4, étape 1). */
  imports: readonly string[]
  skips: readonly string[]
  /** Où trouver le fichier chez l'éditeur — la phrase qui évite un aller-retour au support. */
  howTo: string
}

/** Les alias partagés : ils reviennent dans presque tous les exports. */
const IDENTITY = {
  email: 'email',
  e_mail: 'email',
  adresse_e_mail: 'email',
  adresse_email: 'email',
  courriel: 'email',
  nom: 'name',
  nom_complet: 'name',
  full_name: 'name',
  name: 'name',
  prenom: 'firstName',
  first_name: 'firstName',
  last_name: 'lastName',
  telephone: 'phone',
  tel: 'phone',
  phone: 'phone',
  mobile: 'phone',
  phone_number: 'phone',
} as const

const COMPANY = {
  societe: 'company',
  entreprise: 'company',
  company: 'company',
  company_name: 'company',
  raison_sociale: 'company',
  siren: 'siren',
  siret: 'siren',
  domaine: 'domain',
  domain: 'domain',
  site_web: 'domain',
  website: 'domain',
  url: 'domain',
  // #4053.3 (recette prod 14/10) — le PROFIL de la société : « Secteur d'activité », « Nombre
  // d'employés » et « Ville » finissaient en « Colonnes non rattachées » alors que le compte porte
  // secteur, effectif et siège. Posés ici, ils valent pour TOUTE source qui parle d'une société.
  secteur: 'sector',
  secteur_d_activite: 'sector',
  secteur_activite: 'sector',
  industrie: 'sector',
  industry: 'sector',
  sector: 'sector',
  effectif: 'employees',
  effectifs: 'employees',
  nombre_d_employes: 'employees',
  nombre_employes: 'employees',
  employees: 'employees',
  headcount: 'employees',
  ville: 'headquarters',
  city: 'headquarters',
  siege: 'headquarters',
  localisation: 'headquarters',
} as const

const ROLE = { fonction: 'title', poste: 'title', title: 'title', job_title: 'title' } as const

const DATES = {
  date_debut: 'startDate',
  start_date: 'startDate',
  date_de_debut: 'startDate',
  date_fin: 'endDate',
  end_date: 'endDate',
  date_de_fin: 'endDate',
  date: 'date',
} as const

const MONEY = { tjm: 'dailyRate', taux_journalier: 'dailyRate', montant: 'amount', amount: 'amount' } as const

/**
 * #2159.26 — la colonne « Tags » d'un export CRM (décision Louis 19/09/2026).
 *
 * Elle n'avait aucun alias : elle finissait dans « colonnes ignorées », et le
 * classement que l'équipe avait construit dans son ancien outil restait
 * derrière. Le champ `tags` existe désormais sur les contacts ET les comptes ;
 * la cellule est découpée et normalisée par `normalizeTags` à l'écriture.
 *
 * ⚠️ `labels` (pluriel) seulement : `label` (singulier) est le LIBELLÉ d'un
 * projet, un autre champ.
 */
const TAGS = {
  tags: 'tags',
  tag: 'tags',
  etiquettes: 'tags',
  etiquette: 'tags',
  labels: 'tags',
  mots_cles: 'tags',
  mot_cle: 'tags',
  keywords: 'tags',
} as const

/**
 * M2.1 (Meyer 20/10) — un export de CONTACTS d'un outil de gestion (« Email 1 », « Société - Nom », « Téléphone 1 »,
 * « Société - Référence interne »…) lu par le Wizard avec la MÊME table d'alias que l'import universel : les alias
 * viennent du registre des contrats, traduits ici vers les noms de champ du Wizard — jamais une seconde table copiée
 * (un réglage vit à un seul endroit, GA-26). Mesuré avant : 4/38 en-têtes rattachés, 0 ligne exploitable.
 */
const UNIVERSAL_TO_WIZARD_CONTACT_FIELD: Readonly<Record<string, string>> = {
  full_name: 'name',
  first_name: 'firstName',
  last_name: 'lastName',
  title: 'title',
  email: 'email',
  phone: 'phone',
  linkedin_url: 'linkedin_url',
  company: 'company',
  tags: 'tags',
  source_ref: 'sourceRef',
  company_ref: 'companyRef',
  company_sector: 'sector',
  company_employees: 'employees',
  company_city: 'headquarters',
  company_status: 'companyStatus',
}

function crmContactAliases(): Readonly<Record<string, string>> {
  const aliases: Record<string, string> = {}
  for (const [alias, universalKey] of Object.entries(universalImportAliasTable('contact'))) {
    const field = UNIVERSAL_TO_WIZARD_CONTACT_FIELD[universalKey]
    if (field) aliases[alias] = field
  }
  return aliases
}

const CRM_CONTACT = crmContactAliases()

const BY_KEY: Readonly<Record<string, Omit<ImportSourceDefinition, keyof ImportSource>>> = {
  hubspot_export: {
    aliases: {
      ...IDENTITY,
      ...COMPANY,
      ...ROLE,
      ...DATES,
      ...TAGS,
      // M2.1 (Meyer 20/10) — l'export de contacts d'un outil de gestion : table du planner universel.
      ...CRM_CONTACT,
      proprietaire: 'owner',
      owner: 'owner',
    },
    required: ['email'],
    imports: ['contacts', 'sociétés', 'affaires', 'notes'],
    skips: ['les propriétés personnalisées du portail', 'les pièces jointes'],
    howTo: 'Dans ton CRM : Contacts › Exporter › « Toutes les propriétés », format CSV.',
  },
  boondmanager_export: {
    aliases: { ...IDENTITY, ...COMPANY, ...ROLE, ...DATES, ...MONEY, stack: 'skills', competences: 'skills' },
    required: ['name'],
    imports: ['consultants', 'besoins', 'missions', 'clients'],
    skips: ['les documents joints', 'les éléments de paie'],
    howTo: 'Dans ton ERP : la liste concernée › Exporter › XLSX.',
  },
  /**
   * L'ancien CRM, colonne par colonne (LEGACY-005).
   *
   * Les 38 colonnes du fichier sont TOUTES écrites ici, y compris les 31 que le
   * produit ne sait pas recevoir. C'est le point de ce descripteur : la
   * simulation les listera dans « colonnes ignorées », l'opérateur verra
   * exactement ce qui reste dans l'ancien outil, et personne ne découvrira six
   * mois plus tard qu'un périmètre technique ou une date de dernière mise à jour
   * ont disparu en silence.
   *
   * Les rattacher au champ le plus proche serait pire que de ne pas les
   * rattacher : `provenance_detail` n'est pas une note, `agence` n'est pas une
   * équipe Bellum, et un rapprochement approximatif sur 17 387 lignes produit
   * une base qu'on ne peut plus démêler.
   *
   * ⚠️ Fichier en CP1252 avec un point-virgule — Excel français par défaut. Le
   * décodage côté navigateur le gère déjà (`decode-file.ts`) ; c'est écrit ici
   * pour que l'opérateur ne cherche pas pourquoi les accents sont cassés.
   */
  salesconnect_legacy_export: {
    aliases: {
      // M2.1 (Meyer 20/10) — la reconnaissance d'un export de contacts : société, secteur, effectif, ville de la
      // société, références source. Les sept colonnes de LEGACY-005 ci-dessous restent écrites à la main et gagnent.
      ...CRM_CONTACT,
      // Les sept colonnes que le produit sait recevoir.
      nom: 'lastName',
      prenom: 'firstName',
      fonction: 'title',
      societe_nom: 'company',
      email_1: 'email',
      telephone_1: 'phone',
      responsable_manager: 'owner',
    },
    required: ['email'],
    imports: ['contacts', 'sociétés', 'le propriétaire de chaque fiche'],
    skips: [
      'les 31 autres colonnes de l’ancien outil — elles sont LISTÉES dans le rapport, pas devinées',
      'les emails et téléphones secondaires : une fiche porte une adresse principale',
      'les dates de création et de mise à jour de l’ancien CRM',
      'le périmètre technique, les domaines et les outils déclarés dans l’ancien outil',
    ],
    howTo:
      'Exporte la liste complète depuis l’ancien CRM, en CSV. Le fichier sort en CP1252 avec des point-virgules : dépose-le tel quel.',
  },
  crm_generic_export: {
    aliases: { ...IDENTITY, ...COMPANY, ...ROLE, ...TAGS, ...CRM_CONTACT },
    required: ['email'],
    imports: ['comptes', 'contacts', 'opportunités'],
    skips: ['les champs propres à ton outil, qu’aucun équivalent ne reçoit'],
    howTo: 'Exporte tes contacts en CSV depuis ton outil, en gardant les en-têtes.',
  },
  ats_export: {
    aliases: { ...IDENTITY, ...ROLE, ...DATES },
    required: ['name'],
    imports: ['candidats', 'positionnements'],
    skips: ['les CV eux-mêmes — dépose-les séparément'],
    howTo: 'Exporte la liste des candidats en CSV.',
  },
  talent_pool: {
    aliases: { ...IDENTITY, ...ROLE, ...MONEY, stack: 'skills', competences: 'skills', disponibilite: 'availableFrom' },
    required: ['name'],
    imports: ['consultants', 'compétences déclarées'],
    skips: ['le coût chargé — il se saisit avec la permission finance'],
    howTo: 'Ton fichier de vivier, une ligne par consultant.',
  },
  missions: {
    // #2732.1 — les intitulés qu'un fichier de missions porte vraiment (SKAIZen) : poste, intitulé, libellé, client.
    aliases: {
      ...IDENTITY,
      ...COMPANY,
      ...DATES,
      ...MONEY,
      role: 'role',
      poste: 'role',
      intitule: 'role',
    },
    // #2732.1 — société ET rôle : sans intitulé il n'y a pas de mission à écrire (le rôle est son libellé). C'est aussi
    // ce qui distingue ce fichier d'un export de comptes (société seule) pour le classeur du copilote.
    required: ['company', 'role'],
    // #2732.1 — la mission s'ÉCRIT (rattachée à un compte déjà connu). Les affectations de consultants, elles, ne se
    // devinent pas d'un nom : elles se posent depuis la mission — on le dit, on ne le promet pas.
    imports: ['missions', 'TJM'],
    skips: [
      'les affectations de consultants — elles se posent depuis la mission',
      'les relevés d’activité — ils se déposent mois par mois',
    ],
    howTo: 'Une ligne par mission, avec le client et les dates.',
  },
  contacts_only: {
    aliases: { ...IDENTITY, ...COMPANY, ...ROLE, ...TAGS, ...CRM_CONTACT },
    required: ['email'],
    imports: ['contacts'],
    skips: ['tout le reste — cette source ne crée que des contacts'],
    howTo: 'Un CSV avec au moins une colonne d’adresse e-mail.',
  },
  accounts_only: {
    aliases: {
      ...COMPANY,
      ...TAGS,
      nom: 'company',
      name: 'company',
      site: 'domain',
      // #3753.1 — un ciblage DÉJÀ fait par l'ESN : le tier (A/B/C), sa raison, et
      // ses hypothèses (problématiques, projets IT). Ils alimentent une liste
      // cible, jamais le compte lui-même ; aucun n'est un score (doctrine c26).
      tier: 'tier',
      tiering: 'tier',
      priorite: 'tier',
      priority: 'tier',
      raison_du_tiering: 'selection_reason',
      raison: 'selection_reason',
      reason: 'selection_reason',
      problematiques_adressables: 'addressable_issues',
      projets_it_a_venir: 'upcoming_it_projects',
    },
    required: ['company'],
    imports: ['comptes', 'une liste cible (tier A/B/C, raison, problématiques) si le fichier en porte'],
    skips: ['les contacts — importe-les ensuite'],
    howTo: 'Un CSV avec la raison sociale, et si possible le SIREN ou le domaine.',
  },
  projects: {
    aliases: { ...COMPANY, ...DATES, ...MONEY, libelle: 'label', label: 'label', etape: 'stage' },
    required: ['company', 'label'],
    imports: ['projets'],
    skips: ['les besoins — ils se créent depuis le projet'],
    howTo: 'Une ligne par projet, avec le compte et le libellé.',
  },
  // #2850 (#2148.25, reste 27/09) — un export « Deals » de CRM tiers
  // (HubSpot, Pipedrive…) route vers `project`, MÊME OBJET que `projects`
  // ci-dessus : aucun objet « deal » distinct dans le contrat (voir
  // `WRITABLE_IMPORT_OBJECTS`, `packages/contracts/src/schemas/import.ts`).
  // Alias propres au vocabulaire « deal », en plus de ceux de `projects`.
  deals_export: {
    aliases: {
      ...COMPANY,
      ...DATES,
      ...MONEY,
      deal_name: 'label',
      nom_affaire: 'label',
      opportunity_name: 'label',
      affaire: 'label',
      libelle: 'label',
      label: 'label',
      deal_stage: 'stage',
      stade: 'stage',
      etape: 'stage',
      stage: 'stage',
      close_date: 'endDate',
      date_cloture: 'endDate',
    },
    required: ['company', 'label'],
    imports: ['affaires (deals)'],
    skips: ['les besoins — ils se créent depuis le projet'],
    howTo: 'Une ligne par affaire, avec le compte et son intitulé.',
  },
  notes: {
    aliases: { ...IDENTITY, ...COMPANY, ...DATES, note: 'body', contenu: 'body' },
    required: ['company'],
    imports: ['notes rattachées à un compte'],
    skips: ['les pièces jointes'],
    howTo: 'Une ligne par note, avec le compte auquel elle se rattache.',
  },
  activity_history: {
    aliases: { ...IDENTITY, ...COMPANY, ...DATES, type: 'kind', canal: 'channel' },
    required: ['company', 'date'],
    imports: ['activités datées'],
    skips: ['le CORPS des messages — il ne quitte pas la messagerie'],
    howTo: 'Une ligne par activité, avec sa date.',
  },
  cv_bulk: {
    aliases: {},
    required: [],
    imports: ['CV — un talent par document lisible'],
    skips: ['les documents illisibles, listés un par un'],
    howTo: 'Une archive ZIP de CV. Chaque document lisible devient un talent à relire.',
  },
  // #2078.29 — le devis, la NDA, le contrat cadre d'un besoin (`need_documents`,
  // `kind`/`name`/`status` NOT NULL). SIMULÉ, pas écrit : `document` n'est pas
  // dans `WRITABLE_IMPORT_OBJECTS` — un import CSV n'a pas de moyen de
  // résoudre le LIBELLÉ d'un besoin vers son UUID, et l'inventer serait deviner
  // un chemin d'écriture plutôt que le mesurer.
  need_documents: {
    aliases: {
      besoin: 'need',
      need: 'need',
      role: 'need',
      type: 'kind',
      nature: 'kind',
      kind: 'kind',
      nom: 'name',
      document: 'name',
      titre: 'name',
      name: 'name',
      statut: 'status',
      status: 'status',
      etape: 'status',
    },
    required: ['name', 'kind'],
    imports: ['documents de besoin (devis, NDA, contrats cadre) suivis, avec leur statut'],
    skips: ['le FICHIER lui-même — seul le suivi (nature, nom, statut) est repris'],
    howTo: 'Une ligne par document de besoin, avec le besoin auquel il se rattache.',
  },
  // #2078.29 — le témoignage client (`testimonials`, `quote` NOT NULL).
  // SIMULÉ, pas écrit : `reference` n'est pas dans `WRITABLE_IMPORT_OBJECTS` —
  // « publiable » exige un accord écrit (`testimonialProblems`), et une ligne
  // de tableur ne prouve jamais cet accord.
  testimonials: {
    aliases: {
      citation: 'quote',
      temoignage: 'quote',
      quote: 'quote',
      quote_text: 'quote',
      auteur: 'author_name',
      author: 'author_name',
      author_name: 'author_name',
      nom_auteur: 'author_name',
      fonction_auteur: 'author_title',
      author_title: 'author_title',
      ...COMPANY,
      consentement: 'consent_reference',
      accord: 'consent_reference',
      reference_accord: 'consent_reference',
      consent_reference: 'consent_reference',
    },
    required: ['quote'],
    imports: ['témoignages client, avec leur citation et leur auteur si connu'],
    skips: [
      'la validation « publiable » — elle exige la référence d’un accord écrit, relue à la main, jamais déduite d’une colonne',
    ],
    howTo: 'Une ligne par témoignage, avec la citation et si possible l’auteur et le compte.',
  },
  // #2148.19 — l'appel d'offres décrit un BESOIN à pourvoir (`need`), comme
  // `need_documents`/`boondmanager_export`. `need` a rejoint `WRITABLE_IMPORT_
  // OBJECTS` depuis (lot c3 26/09, #2148.25) : `ImportWriterService.writeNeeds`
  // écrit sur compte déjà connu, sans deviner de rattachement fin vers une
  // mission — écarte sinon, jamais une mise à jour ou un doublon deviné.
  // #2850 (07/10) — `besoin`/`besoins`/`need` reconnus comme alias de `title` :
  // un export de BESOINS n'a pas forcément l'intitulé d'appel d'offres.
  tender_records: {
    aliases: {
      ...COMPANY,
      ...DATES,
      intitule: 'title',
      objet: 'title',
      titre: 'title',
      title: 'title',
      besoin: 'title',
      besoins: 'title',
      need: 'title',
      reference_ao: 'reference',
      numero_ao: 'reference',
      reference: 'reference',
      date_limite: 'deadline',
      deadline: 'deadline',
      echeance: 'deadline',
      competence: 'skills',
      competences: 'skills',
      stack: 'skills',
      profil: 'skills',
    },
    required: ['title'],
    imports: ['appels d’offres, avec leur intitulé, l’échéance et le compte si connu'],
    skips: ['le mémoire technique et les pièces jointes — seul le suivi (intitulé, échéance, compte) est repris'],
    howTo: 'Une ligne par appel d’offres, avec son intitulé et sa date limite de réponse.',
  },
  // #2148.19 — un référentiel interne (méthodologies, argumentaires, études de
  // cas) est un DOCUMENT consultable, même famille que `testimonials`
  // (`reference`). SIMULÉ, pas écrit : `reference` n'est pas dans
  // `WRITABLE_IMPORT_OBJECTS`, même refus que les témoignages.
  internal_directory: {
    aliases: {
      titre: 'title',
      title: 'title',
      nom: 'title',
      domaine: 'domain_area',
      domain_area: 'domain_area',
      categorie: 'domain_area',
      description: 'summary',
      resume: 'summary',
      summary: 'summary',
      auteur: 'author_name',
      author_name: 'author_name',
      proprietaire: 'author_name',
    },
    required: ['title'],
    imports: ['entrées de référentiel interne, avec leur titre et leur domaine si connu'],
    skips: ['le FICHIER lui-même — seul le suivi (titre, domaine, résumé) est repris'],
    howTo: 'Une ligne par entrée de référentiel, avec son titre.',
  },
}

export const IMPORT_CATALOG: readonly ImportSourceDefinition[] = IMPORT_SOURCES.map(source => ({
  ...source,
  ...(BY_KEY[source.key] ?? { aliases: {}, required: [], imports: [], skips: [], howTo: '' }),
}))

export function findImportSource(key: string): ImportSourceDefinition | undefined {
  return IMPORT_CATALOG.find(source => source.key === key)
}

/** L'objet PRINCIPAL d'une source — le premier de sa liste, donc le plus amont. */
export function primaryObject(source: ImportSourceDefinition): ImportObject {
  return source.objects[0] as ImportObject
}

/**
 * Les champs auxquels une colonne PEUT être rattachée, pour cette source.
 *
 * L'étape 3 du §7.4 — « Corriger » — demande que l'utilisateur puisse rattacher
 * une colonne qu'aucun alias n'a reconnue. Pour cela, l'écran a besoin de la
 * liste des champs recevables ; et cette liste ne peut venir que d'ici, parce
 * que c'est ici que vivent les alias.
 *
 * ⚠️ On dérive, on ne recopie pas. Une seconde liste écrite à la main dans le
 * client divergerait au premier alias ajouté, et l'écran proposerait alors un
 * champ que le moteur d'écriture ne connaît pas — une colonne rattachée à un
 * champ fantôme se perd en silence, ce qui est exactement le mode d'échec que
 * tout le §7 combat.
 *
 * Et on n'expose PAS les alias : ce sont des ORTHOGRAPHES acceptées, pas des
 * champs. Les envoyer au client l'inviterait à refaire `proposeMapping` de son
 * côté — une dérivation vit à un seul endroit.
 */
export function receivableFields(source: ImportSourceDefinition): string[] {
  return [...new Set(Object.values(source.aliases))].sort()
}
