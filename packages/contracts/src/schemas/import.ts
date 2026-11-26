import { z } from 'zod'

/**
 * L'import de données, et surtout ce qui l'empêche de détruire une base.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE MARCHÉ SAIT DÉJÀ, ET QUE LE PDF 7 RAPPELLE (§7.1)
 * ─────────────────────────────────────────────────────────────────────────────
 * 10 à 30 % de doublons dans une base typique · 54 % des migrations en retard
 * significatif · 67 % découvrent les problèmes de qualité EN COURS DE ROUTE ·
 * nettoyer après coûte 3 à 10 fois plus cher que nettoyer avant · les champs
 * obligatoires manquants font échouer SILENCIEUSEMENT des lignes entières ·
 * l'ordre compte — les sociétés avant les contacts, sinon toutes les
 * associations sautent.
 *
 * D'où trois règles que ce fichier rend impossibles à contourner :
 *  1. **aucune écriture sans simulation ENREGISTRÉE** ;
 *  2. **l'ordre est imposé** — un import de contacts sans comptes est REFUSÉ,
 *     pas exécuté à moitié ;
 *  3. **la déduplication a lieu AVANT l'écriture**, et aucune fusion sans clic.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MOTEUR DÉCLARATIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Douze sources écrites à la main produiraient douze parseurs, donc douze bugs,
 * et le douzième se découvrirait chez un client en train de reprendre sa base.
 * Une source est donc un DESCRIPTEUR — ses alias de colonnes, ses champs
 * obligatoires, son objet cible — et un seul moteur les lit toutes.
 */

/**
 * Les objets qu'un import peut créer, dans l'ORDRE où ils doivent arriver (§7.3).
 *
 * #2078.29 — « document » et « reference » rejoignent la liste : le retour
 * client nommait trois objets (« Historique · Documents · Références »),
 * « Historique » (`activity`) était déjà là, les deux autres manquaient.
 *
 * Leur place suit leur DÉPENDANCE (`PARENT_OF`, plus bas), pas la date
 * d'ajout — cet enum n'est pas un journal, contrairement à `PROJECT_STAGES` où
 * l'index EST la progression (GA-08) : ici l'ordre sert le moteur qui refuse
 * un objet dont le parent n'est « ni dans le fichier, ni déjà en base ».
 * `document` dépend de `need` (`need_documents.need_id`, NOT NULL) : il vient
 * juste après. `reference` dépend de `account`, comme `mission` et `activity` :
 * il vient après eux, à la même place logique.
 */
export const IMPORT_ORDER = [
  'account',
  'contact',
  'project',
  'need',
  'document',
  'talent',
  'submission',
  'mission',
  'activity',
  'reference',
] as const
export const importObjectSchema = z.enum(IMPORT_ORDER)
export type ImportObject = z.infer<typeof importObjectSchema>

/**
 * Les raisons d'écarter une ligne — liste FERMÉE (§11, BEL-INT-602 PR2).
 *
 * Fermée parce qu'un rapport de simulation ne vaut que si l'on peut additionner
 * ses catégories. « 44 lignes ignorées » sans les ventiler ne dit pas s'il faut
 * corriger le fichier ou changer d'avis ; et une raison libre finit toujours par
 * devenir dix formulations du même problème.
 */
export const SKIP_REASONS = [
  'missing_required_field',
  'invalid_email',
  'invalid_date',
  'unknown_company',
  // #4053.1 — une ligne SANS société n'est jamais un compte créé ni un contact rattaché au hasard :
  // elle sort « à valider », nommée, avec les autres écarts du rapport.
  'company_to_validate',
  'unknown_owner',
  'duplicate_in_file',
  'out_of_scope_column',
] as const
export const skipReasonSchema = z.enum(SKIP_REASONS)
export type SkipReason = z.infer<typeof skipReasonSchema>

/**
 * Les 12 sources du §7.2.
 *
 * `objects` est ce que la source PEUT créer — et l'ordre y est celui de
 * {@link IMPORT_ORDER}, ce qui permet au moteur de refuser un contact dont le
 * compte n'est ni dans le fichier, ni déjà en base.
 */
export const importSourceSchema = z.object({
  key: z.string().min(1),
  /** Les objets créés, dans l'ordre imposé. */
  objects: z.array(importObjectSchema).min(1),
  /** `csv`, `xlsx` ou `zip` — ce que l'assistant accepte au dépôt. */
  format: z.enum(['csv', 'xlsx', 'zip']),
  /** MVP, V1 ou V2 : ce que le PDF promet et quand. */
  tier: z.enum(['mvp', 'v1', 'v2']),
})
export type ImportSource = z.infer<typeof importSourceSchema>

/**
 * Les formats que l'assistant sait RÉELLEMENT lire aujourd'hui.
 *
 * ⚠️ Quatre sources déclarent `xlsx` ou `zip` alors que le seul lecteur est
 * `parseDelimited` et que le champ de dépôt n'accepte que `.csv,.txt,.tsv`.
 * Quelqu'un qui choisissait « Vivier » voyait un badge XLSX, puis un sélecteur
 * de fichier qui refusait son XLSX — sans un mot d'explication.
 *
 * La carte n'est pas MASQUÉE pour autant : masquer retirerait l'information que
 * cette reprise est prévue. Elle DIT que le format n'est pas encore lu, et quoi
 * faire en attendant. C'est la règle du dépôt : une capacité manquante dégrade,
 * elle ne ferme pas.
 *
 * Une seule liste, ici, pour que le badge de la carte et l'attribut `accept` du
 * champ de dépôt ne puissent pas diverger.
 */
export const READABLE_IMPORT_FORMATS: readonly ImportSource['format'][] = ['csv']

/** Les extensions acceptées au dépôt — la forme HTML de la liste ci-dessus. */
export const IMPORT_FILE_ACCEPT = '.csv,.txt,.tsv'

/** Ce format se lit-il aujourd'hui ? */
export function isReadableImportFormat(format: ImportSource['format']): boolean {
  return READABLE_IMPORT_FORMATS.includes(format)
}

export const IMPORT_SOURCES: readonly ImportSource[] = [
  { key: 'hubspot_export', objects: ['account', 'contact', 'project', 'activity'], format: 'csv', tier: 'mvp' },
  { key: 'boondmanager_export', objects: ['account', 'need', 'talent', 'mission'], format: 'xlsx', tier: 'mvp' },
  { key: 'crm_generic_export', objects: ['account', 'contact', 'project'], format: 'csv', tier: 'mvp' },
  { key: 'ats_export', objects: ['talent', 'submission'], format: 'csv', tier: 'v1' },
  { key: 'talent_pool', objects: ['talent'], format: 'xlsx', tier: 'mvp' },
  { key: 'missions', objects: ['mission'], format: 'xlsx', tier: 'v1' },
  { key: 'contacts_only', objects: ['contact'], format: 'csv', tier: 'mvp' },
  { key: 'accounts_only', objects: ['account'], format: 'csv', tier: 'mvp' },
  { key: 'projects', objects: ['project'], format: 'csv', tier: 'v1' },
  { key: 'notes', objects: ['activity'], format: 'csv', tier: 'v1' },
  { key: 'activity_history', objects: ['activity'], format: 'csv', tier: 'v2' },
  { key: 'cv_bulk', objects: ['talent'], format: 'zip', tier: 'mvp' },
  // #2078.29 — « Documents » et « Références » du retour client. Même TIER que
  // `activity_history` : déclarées et SIMULÉES, pas encore écrites (voir
  // `WRITABLE_IMPORT_OBJECTS` plus bas — ni l'une ni l'autre n'y figure).
  { key: 'need_documents', objects: ['document'], format: 'csv', tier: 'v2' },
  { key: 'testimonials', objects: ['reference'], format: 'csv', tier: 'v2' },
  // #2148.19 — deux des trois types manquants à l'appel du catalogue de
  // l'issue #2148 (le troisième, « tableau de besoins », est une doctrine
  // EXISTANTE contraire — voir `import-catalog.ts` juste avant `tenders`).
  // Tranché sans Louis (règle du lot) : un appel d'offres décrit un besoin
  // à pourvoir, même objet cible que `need_documents`/`boondmanager_export`.
  { key: 'tender_records', objects: ['need'], format: 'csv', tier: 'v2' },
  // Un référentiel interne (méthodologies, argumentaires, études de cas) est
  // un document consultable, même famille que `testimonials` (`reference`).
  { key: 'internal_directory', objects: ['reference'], format: 'csv', tier: 'v2' },
  // #2850 (#2148.25, reste 27/09) — un export « Deals » (HubSpot, Pipedrive…)
  // n'avait AUCUNE source déclarée : sélectionner ce fichier dans l'assistant
  // était impossible, avant même la question de dédup. Le contrat n'a pas
  // d'objet `deal` distinct — `opportunities` porte déjà les affaires via
  // `project` (voir le commentaire de `WRITABLE_IMPORT_OBJECTS` ci-dessous) —
  // donc cette source route vers `project`, ÉCRIT (déjà dans la liste),
  // jamais un objet inventé. Même précédent que `tender_records` → `need`.
  { key: 'deals_export', objects: ['project'], format: 'csv', tier: 'v1' },
  /**
   * L'ancien CRM, reprise nominative (LEGACY-005).
   *
   * Une TREIZIÈME source, et non un réglage de `crm_generic_export` : ses 38
   * colonnes ont des noms à elle, son fichier est en CP1252 avec un
   * point-virgule, et sa reprise porte 17 387 contacts réels. Un export générique
   * mal deviné sur ce volume-là ne se rattrape pas à la main.
   */
  { key: 'salesconnect_legacy_export', objects: ['account', 'contact'], format: 'csv', tier: 'mvp' },
]

/**
 * Les objets dont l'import ÉCRIT réellement en base.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LISTE VIT DANS LE CONTRAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle vivait dans `ImportWriterService`, et trois endroits en avaient besoin
 * sans pouvoir l'atteindre : le refus de l'`apply`, le refus de l'annulation, et
 * l'aperçu que le copilote reçoit pour répondre « qu'est-ce que je peux
 * importer ». Le troisième ne l'avait pas : Laura ANNONÇAIT la reprise des
 * consultants, des besoins et des missions, qui se simulent et ne s'écrivent
 * pas. Un réglage vit à un seul endroit (GA-26) ; celui-ci en avait trois, dont
 * deux muets.
 *
 * ⚠️ Les objets ABSENTS de cette liste ne sont pas des oublis. Ils sont
 * déclarés, ils se simulent, et leur écriture est refusée PAR SON NOM — un
 * succès muet sur une reprise de 17 000 lignes ne se rattrape pas à la main.
 *
 * #2148.25/#2850 — LE BESOIN (`need`) REJOINT LA LISTE.
 *
 * Il ne l'a pas rejointe par confort : `DEDUP_KEYS.need` est vide PAR
 * CONCEPTION (« deux besoins identiques le même jour SONT deux besoins ») —
 * aucune décision de dédup à inventer, contrairement à `document`/`reference`
 * (ci-dessous) qui référencent un OBJET PRÉCIS qu'un import déclaratif ne sait
 * pas résoudre. Un besoin n'a qu'UNE dépendance, la même que `project` :
 * l'entreprise déjà connue de l'espace. Rien à deviner, rien à dédupliquer.
 *
 * #2148.25/#2850 (reste, 27/09) — LE TALENT (`talent`, vivier consultants/CV)
 * REJOINT LA LISTE À SON TOUR.
 *
 * Contrairement à `need`/`deal`, `DEDUP_KEYS.talent` n'est PAS vide
 * (`email`/`phone`/`name+lastEmployer`, déjà déclarées) : la clé de dédup
 * existe depuis toujours dans ce fichier, sans appelant en écriture — le motif
 * exact qui revient dans ce dépôt. Aucune dépendance de compte (`PARENT_OF`
 * n'a pas d'entrée pour `talent`) : un consultant ou un candidat existe sans
 * société rattachée, contrairement à `need`/`project`. `deal` reste HORS de
 * cette liste — pas comme un objet à part : le contrat n'a pas d'objet
 * « deal » distinct, `opportunities` porte déjà les affaires via `project`.
 *
 * #2148.25/#2850 (reste, 27/09) — LA SOURCE `deals_export` FERME LE GESTE
 * EMPÊCHÉ, SANS INVENTER D'OBJET.
 *
 * Le geste bloqué n'était pas l'écriture (jamais tentée) mais le CHOIX à
 * l'écran : aucune source déclarée ne portait `objects: ['deal']` ou
 * assimilé — un export « Deals » d'un CRM tiers était donc invisible dans
 * l'assistant d'import, avant même la question de dédup. `deals_export`
 * (ci-dessus) route ce fichier vers `project`, DÉJÀ writable, avec les alias
 * `import-catalog.ts` d'un export de deal (nom, stade, montant). Aucun
 * objet « deal » n'a rejoint `WRITABLE_IMPORT_OBJECTS` : ce serait
 * exactement l'objet inventé que ce commentaire refusait déjà.
 */
export const WRITABLE_IMPORT_OBJECTS = [
  'account',
  'contact',
  'project',
  'need',
  'talent',
  // #2732.1 + #5022.1 (recette prod 31/10, Louis) — la MISSION rejoint la liste : le fichier de missions de SKAIZen
  // se simulait et ne s'écrivait pas. Aucune contrainte SQL à élargir : `import_sessions.type` accepte déjà
  // `mission` (migration UniversalImport), les statuts posés (`active`, `ready_to_start`) sont déjà dans
  // `missions_status_check`. Rattachée à un compte DÉJÀ connu, comme `project` et `need` ; jamais de compte inventé.
  'mission',
] as const satisfies readonly ImportObject[]

/** Un objet writable, comme TYPE — ce qui rend `repoOf` exhaustif au compilateur. */
export type WritableImportObject = (typeof WRITABLE_IMPORT_OBJECTS)[number]

/**
 * Le test d'appartenance, avec le RÉTRÉCISSEMENT de type qui va avec.
 *
 * `WRITABLE_IMPORT_OBJECTS.includes(x)` ne rétrécit rien : l'appelant garde un
 * `ImportObject` et doit re-caster, ce qui rouvre exactement le trou que la
 * liste ferme. Ici le `is` fait le travail une fois.
 */
export function isWritableImportObject(object: ImportObject): object is WritableImportObject {
  return (WRITABLE_IMPORT_OBJECTS as readonly ImportObject[]).includes(object)
}

/**
 * Les clés de déduplication, dans l'ORDRE (§7.6).
 *
 * L'ordre EST la règle : la première clé qui matche décide, et les suivantes ne
 * sont pas essayées. Un SIREN identique est une certitude ; un nom normalisé
 * identique ne l'est pas — les évaluer dans l'autre sens rapprocherait deux
 * sociétés homonymes que le registre distingue.
 */
export const DEDUP_KEYS: Readonly<Record<ImportObject, readonly (readonly string[])[]>> = {
  account: [['siren'], ['domain'], ['normalizedName']],
  contact: [['email'], ['name', 'company']],
  talent: [['email'], ['phone'], ['name', 'lastEmployer']],
  mission: [['client', 'role', 'startDate', 'endDate']],
  // ⚠️ #1889 — CETTE CLÉ ÉTAIT MORTE, et son silence ne se voyait pas.
  // Elle exigeait `account` et `period` ; aucun alias du catalogue ne produit
  // l'un ou l'autre (on produit `company`, et rien ne produit `period`).
  // `dedupKeyOf('project', …)` rendait donc TOUJOURS `null` : aucun doublon
  // projet n'était jamais vu, et la simulation comptait tout en créations.
  // C'est exactement le défaut déjà payé sur les comptes (cf. `withDedupInputs`).
  //
  // `normalizedName` plutôt que `company` brut, pour la même raison que le
  // compte : « SG SOCIETE GENERALE » et « Société Générale » doivent se
  // rencontrer, et la normalisation est la SEULE qui les rapproche.
  project: [['normalizedName', 'label']],
  // Ni les besoins, ni les positionnements, ni les activités n'ont de clé
  // naturelle : deux activités identiques le même jour SONT deux activités.
  need: [],
  submission: [],
  activity: [],
  // #2078.29 — même raisonnement : un devis et une NDA identiques sur le même
  // besoin sont deux pièces distinctes (une relance en produit une seconde
  // légitime), et deux témoignages identiques d'un même compte ne sont pas
  // une erreur de saisie — un client peut écrire deux fois la même phrase.
  document: [],
  reference: [],
}

/**
 * Les règles de normalisation du §7.4 — chacune VISIBLE et DÉSACTIVABLE.
 *
 * Désactivable, et c'est important : une ESN dont les numéros internes ne sont
 * pas des téléphones verrait sa colonne massacrée par une mise au format
 * international. La règle par défaut est la bonne pour la plupart ; elle n'est
 * pas bonne pour tout le monde, et le fichier appartient au client.
 */
export const NORMALISATION_RULES = [
  'phone_international',
  'email_lowercase',
  'date_iso',
  'amount_cents',
  'legal_form',
  'domain_from_website',
] as const
export const normalisationRuleSchema = z.enum(NORMALISATION_RULES)
export type NormalisationRule = z.infer<typeof normalisationRuleSchema>

/** Le mapping colonne du fichier → champ de l'objet, modifiable et réutilisable (§7.4, étape 3). */
export const importMappingSchema = z.object({
  /** `{ "Adresse e-mail": "email" }` — la colonne telle qu'elle est ÉCRITE dans le fichier. */
  columns: z.record(z.string(), z.string()),
  /** Les colonnes volontairement ignorées. Jamais devinées : l'utilisateur les nomme. */
  ignored: z.array(z.string()).default([]),
  /** Les règles de normalisation ÉTEINTES pour cet import. */
  disabledRules: z.array(normalisationRuleSchema).default([]),
})
export type ImportMapping = z.infer<typeof importMappingSchema>

/** Une ligne écartée, avec sa raison — jamais un total muet. */
export const skippedRowSchema = z.object({
  row: z.number().int().positive(),
  reason: skipReasonSchema,
  /** Le champ en cause quand la raison en désigne un (`missing_required_field`). */
  field: z.string().nullable(),
})

/** Une paire de doublons proposée à la décision. Jamais fusionnée d'office. */
export const importDuplicateSchema = z.object({
  row: z.number().int().positive(),
  /** L'objet déjà présent, quand le doublon est contre la BASE. `null` = doublon dans le FICHIER. */
  existingId: z.string().nullable(),
  /** La clé qui a matché — c'est la RAISON, et elle se montre. */
  matchedOn: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  /**
   * #2159.39 — un CONFLIT, au sens de l'épopée : la ligne rapprochée
   * remplacerait une valeur DÉJÀ renseignée en base, jamais une simple
   * mise à jour de champs vides. `.default(false)` lit sans casser un
   * rapport enregistré avant ce champ — silence honnête, pas un conflit
   * deviné pour une session déjà simulée.
   */
  overwrites: z.boolean().default(false),
})

/**
 * Une ligne qui n'a PAS PU être écrite — un problème, jamais une décision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS `skippedRowSchema`
 * ─────────────────────────────────────────────────────────────────────────────
 * `skipped` porte une raison FERMÉE (`SKIP_REASONS`) et VOULUE : une ligne
 * écartée l'a été pour une règle connue avant même d'essayer de l'écrire — un
 * doublon, un champ obligatoire absent. Une ligne d'`errors` a franchi cette
 * étape : le moteur a essayé de l'écrire, et l'écriture a échoué — une
 * contrainte SQL, une connexion perdue. La cause n'est pas un ensemble fermé
 * (elle vient d'une base, d'un réseau), donc `message` est un texte libre, tel
 * que capturé — jamais une raison devinée ou reformulée.
 *
 * Confondre les deux fait disparaître la seconde catégorie dans le compte de la
 * première : « 12 lignes ignorées » sur un rapport qui en comptait 11 pour de
 * bonnes raisons cache la douzième, celle qui a RATÉ.
 */
export const importRowErrorSchema = z.object({
  row: z.number().int().positive(),
  /** Le message d'échec, tel que capturé côté écriture — jamais une raison devinée. */
  message: z.string().min(1),
})
export type ImportRowError = z.infer<typeof importRowErrorSchema>

/**
 * Le rapport de simulation (§7.5) — et son homologue d'EXÉCUTION.
 *
 * La même forme sert aux deux : `simulate()` la remplit sans rien écrire,
 * `apply()` retourne la même forme mise à jour de ce qui s'est RÉELLEMENT
 * passé à l'écriture. C'est ce qui permet à l'écran d'afficher un seul panneau
 * dans les deux cas.
 *
 * Il porte deux avertissements que le PDF met en évidence, et pour cause : ce
 * sont les deux seuls qui engagent quelque chose d'irréversible.
 * `overwrittenFields` dit combien de valeurs EXISTANTES seraient remplacées, et
 * `withoutLegalBasis` combien de contacts arriveraient sans base légale
 * renseignée — un import RGPD-aveugle ne se rattrape pas après coup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `errors` — AJOUTÉ EN FIN le 30/08/2026, et ce qu'il corrige
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant lui, une ligne qui échouait à l'écriture n'avait NULLE PART où aller :
 * ni `skipped` (elle n'a pas été écartée par une règle, elle a été TENTÉE), ni
 * `creations`/`updates` (elle n'a pas abouti). Le cas concret, mesuré dans
 * `writeSession` : une ligne partie sans réponse (`unknown`, voir
 * `dispatchFailureOutcome`) que l'utilisateur choisit de SAUTER plutôt que de
 * rejouer — `import.service.ts`. Une fois l'import terminé, `markApplied` ne
 * réinitialise pas `report`, mais rien n'y ajoutait cette ligne non plus : elle
 * disparaissait entre les deux, ni écrite, ni comptée en échec, ni comptée
 * nulle part — c'est le défaut exact que ce seau ferme.
 *
 * `errors` est ADDITIONNABLE avec les trois autres : `rowsRead` doit toujours
 * égaler `creations + updates + skipped.length + errors.length`. C'est pour
 * ça qu'une ligne qui échoue est RETIRÉE de `creations` ou `updates` au moment
 * où elle est ajoutée à `errors` — sinon elle serait comptée deux fois : une
 * fois pour ce qui ÉTAIT prévu, une fois pour ce qui EST arrivé.
 */
export const dryRunReportSchema = z.object({
  rowsRead: z.number().int().nonnegative(),
  creations: z.number().int().nonnegative(),
  updates: z.number().int().nonnegative(),
  /** Combien de valeurs déjà renseignées seraient ÉCRASÉES. */
  overwrittenFields: z.number().int().nonnegative(),
  duplicates: z.array(importDuplicateSchema),
  skipped: z.array(skippedRowSchema),
  /** Colonnes lues et rattachées. */
  mappedColumns: z.array(z.string()),
  /** Colonnes présentes dans le fichier et rattachées à rien — LISTÉES, jamais devinées. */
  ignoredColumns: z.array(z.string()),
  /** Champs obligatoires absents du fichier : l'import est BLOQUÉ tant qu'ils manquent. */
  missingRequiredColumns: z.array(z.string()),
  /** Contacts sans base légale renseignée (§7.5). */
  withoutLegalBasis: z.number().int().nonnegative(),
  /** Le fichier a-t-il été tronqué, et à combien. */
  truncated: z.boolean(),
  /**
   * Les lignes qui ont échoué à l'ÉCRITURE — jamais confondues avec `skipped`.
   *
   * Toujours vide à la SIMULATION : rien n'est écrit, rien ne peut y échouer.
   * `.default([])` lit sans casser un rapport enregistré avant ce champ — un
   * import déjà `applied` n'a pas à redevenir illisible.
   *
   * ⚠️ Un seau vide n'est pas la même chose qu'un import qui n'a pas encore
   * tenté d'écrire : « non mesuré n'est jamais 0 ». C'est à l'écran de porter
   * cette distinction (l'état de la session le dit), pas à ce tableau — vide
   * ici veut seulement dire « aucune ligne enregistrée en échec pour l'instant ».
   */
  errors: z.array(importRowErrorSchema).default([]),
  /**
   * Colonnes du fichier dont l'EN-TÊTE porte une catégorie de donnée sensible
   * (santé, origine, IBAN, sécurité sociale…) — #2079.7. Un signalement, pas un
   * blocage : la colonne suit le sort que le mapping lui donne. `.default([])`
   * lit sans casser un rapport enregistré avant ce champ.
   */
  sensitiveColumns: z.array(z.string()).default([]),
  /**
   * #2159.32/#2159.33 — deux lignes du MÊME fichier qui partagent un
   * TÉLÉPHONE ou un profil LINKEDIN, sans partager une clé FORTE (email,
   * nom+société). Un signal FAIBLE, jamais un motif de SKIP : `phone` a été
   * envisagé comme clé de `DEDUP_KEYS.contact` le 26/09 et écarté après
   * investigation — deux personnes différentes derrière le standard d'une
   * même société partagent souvent le même numéro, et un skip automatique
   * les ferait disparaître en silence. Les deux lignes restent CRÉÉES
   * normalement ; seul ce champ porte le signalement, à vérifier humainement
   * (doctrine « on propose, on ne fusionne jamais »). `existingId` est
   * toujours `null` ici : par construction, ce sont deux lignes du fichier,
   * jamais un rapprochement contre la base. `.default([])` lit sans casser un
   * rapport enregistré avant ce champ.
   */
  possibleDuplicates: z.array(importDuplicateSchema.omit({ existingId: true, overwrites: true })).default([]),
})
export type DryRunReport = z.infer<typeof dryRunReportSchema>

/** Les fenêtres d'annulation du §7.7. */
export const ROLLBACK_FULL_HOURS = 24
export const ROLLBACK_PARTIAL_DAYS = 7

/**
 * Un objet importé est-il encore annulable ?
 *
 * La règle qui compte est la dernière : **un objet touché par un humain après
 * l'import n'est JAMAIS annulé automatiquement.** Annuler une correction faite à
 * la main est la seule chose qu'un rollback ne doit pas pouvoir faire — elle est
 * invisible (personne ne relit un rapport d'annulation) et irréversible (la
 * correction, elle, n'est nulle part ailleurs).
 */
export function rollbackDecision(input: {
  importedAt: Date
  now: Date
  /** La dernière modification connue de l'objet, ou `null` s'il n'a pas bougé. */
  updatedAt: Date | null
  /** La provenance de la dernière écriture. `human` protège l'objet. */
  lastWriteBy: 'human' | 'connector' | 'pipeline' | 'model' | null
}): 'revert' | 'keep_touched' | 'window_closed' {
  const hours = (input.now.getTime() - input.importedAt.getTime()) / 3_600_000
  if (hours > ROLLBACK_PARTIAL_DAYS * 24) return 'window_closed'

  const touchedAfter =
    input.updatedAt !== null && input.updatedAt.getTime() > input.importedAt.getTime() && input.lastWriteBy === 'human'
  // Dans les 24 h, l'annulation est COMPLÈTE — sauf ce qu'un humain a touché.
  // Cette exception vaut dans les deux fenêtres : c'est elle qui rend
  // l'annulation sûre, pas la durée.
  if (touchedAfter) return 'keep_touched'
  return 'revert'
}

/** L'ordre imposé : cet objet peut-il être importé maintenant ? (§7.3) */
export function orderViolations(input: {
  /** Les objets que cet import va créer. */
  importing: readonly ImportObject[]
  /** Les objets DÉJÀ présents dans l'espace, ou importés plus tôt dans la session. */
  available: readonly ImportObject[]
}): ImportObject[] {
  const have = new Set(input.available)
  const violations: ImportObject[] = []
  for (const object of input.importing) {
    const parent = PARENT_OF[object]
    if (!parent) continue
    if (have.has(parent) || input.importing.includes(parent)) continue
    violations.push(object)
  }
  return violations
}

/**
 * De quoi chaque objet dépend, et rien de plus.
 *
 * Volontairement PEU de liens : un import bloqué par une dépendance qui n'en est
 * pas une se contourne en désactivant la garde, et la garde ne sert alors plus à
 * rien. Ne figurent ici que les rattachements dont l'absence perd de la donnée —
 * un contact sans compte devient orphelin, une mission sans compte aussi.
 */
const PARENT_OF: Readonly<Partial<Record<ImportObject, ImportObject>>> = {
  contact: 'account',
  project: 'account',
  // #2558.1 (18/09/2026, `ProjectNeedEntity` migration `1795711263408`) — cette
  // ligne disait `'project'` : c'était vrai avant cette migration, qui a rendu
  // `account_id` NOT NULL et `project_id` NULLABLE. Un besoin existe SANS
  // projet ; il n'existe jamais sans compte. #2148.25/#2850 (écriture réelle
  // du besoin à l'import) aurait fait respecter une dépendance déjà fausse.
  need: 'account',
  submission: 'talent',
  mission: 'account',
  activity: 'account',
  // #2078.29 — un document sans le besoin qui le porte est orphelin
  // (`need_documents.need_id` est NOT NULL) ; une référence sans compte,
  // comme une activité ou une mission.
  document: 'need',
  reference: 'account',
}

/** Les sept étapes de l'assistant (§7.4). L'écran les impose dans cet ordre. */
export const IMPORT_STEPS = ['choose_source', 'upload', 'map', 'normalise', 'deduplicate', 'simulate', 'apply'] as const
export const importStepSchema = z.enum(IMPORT_STEPS)
export type ImportStep = z.infer<typeof importStepSchema>

/**
 * L'état d'une session d'import. `applied` est terminal ; `rolled_back` aussi.
 *
 * ⚠️ `partial` a été AJOUTÉ EN FIN le 29/08/2026 (GA-08 : un enum ne perd
 * jamais de valeur et n'en insère jamais au milieu). Il nomme le seul état qui
 * existait déjà dans les faits et qu'aucune colonne ne portait : un import qui
 * s'est arrêté en cours d'écriture. Avant lui, une interruption à la ligne
 * 4 000 sur 17 000 laissait la session en `simulated`, les 4 000 lignes en base
 * et l'annulation inatteignable.
 */
export const IMPORT_SESSION_STATES = ['draft', 'simulated', 'applied', 'rolled_back', 'failed', 'partial'] as const
export const importSessionStateSchema = z.enum(IMPORT_SESSION_STATES)
export type ImportSessionState = z.infer<typeof importSessionStateSchema>

/**
 * Le plafond du fichier déposé, en caractères de texte décodé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contenu voyage en clair dans le corps JSON de `dry-run` et de `apply` —
 * l'écran décode le fichier lui-même (`decode-file.ts`, pour Windows-1252) et
 * envoie du texte. Il rencontrait donc la limite de corps GLOBALE de l'API,
 * 1 Mo, alors que le schéma du serveur, lui, en acceptait vingt millions de
 * caractères : la garde applicative était vingt fois au-dessus de ce que le
 * transport laissait passer. Entre les deux, un 413 sans corps JSON — donc
 * sans message. C'est le « import client difficile » du 14/08/2026, et la
 * reprise nominative de l'ancien CRM (17 387 contacts, 38 colonnes) ne pouvait
 * matériellement pas passer.
 *
 * La valeur vit dans le contrat parce que TROIS endroits en dépendent et
 * doivent bouger ensemble : le montage express (`apps/api/src/main.ts`, monté
 * un cran au-dessus — l'échappement JSON d'un CSV gonfle la charge), la
 * validation d'entrée, et l'écran qui doit le DIRE avant l'envoi. Un plafond
 * annoncé est un refus ; un plafond deviné est une panne.
 */
export const IMPORT_CONTENT_MAX_CHARS = 8_000_000

/** Le même plafond dit en mégaoctets, pour l'écran et pour les messages. */
export const IMPORT_CONTENT_MAX_MB = IMPORT_CONTENT_MAX_CHARS / 1_000_000

const importContent = z
  .string()
  .min(1)
  .max(IMPORT_CONTENT_MAX_CHARS, `Fichier trop volumineux (${IMPORT_CONTENT_MAX_MB} Mo maximum).`)

/** `POST /import/sessions/:id/dry-run` — simuler, sans rien écrire. */
export const importDryRunSchema = z.object({
  /** Le contenu du fichier, déjà décodé par le navigateur (voir `decode-file.ts`). */
  content: importContent,
  mapping: z.unknown().optional(),
})

/**
 * `POST /import/sessions/:id/apply` — l'écriture.
 *
 * Le corps n'était pas validé du tout : il était TYPÉ, ce qui ne borne rien à
 * l'exécution. `content` y porte le même fichier que la simulation, donc le
 * même plafond — sans quoi la borne posée sur `dry-run` se contournerait par
 * l'étape suivante.
 */
export const importApplySchema = z.object({
  available: z.array(importObjectSchema).optional(),
  content: importContent.optional(),
  /**
   * Le point de reprise CHOISI par un humain, quand la dernière ligne écrite
   * est partie sans que la réponse revienne.
   *
   * ⚠️ Borné ici à « un entier positif », et pas davantage : les deux SEULES
   * valeurs légitimes sont la ligne incertaine et la suivante, et seul le
   * service connaît laquelle — c'est lui qui refuse tout le reste. Le valider
   * ici plus finement demanderait de recopier ce savoir, donc de le faire
   * diverger.
   */
  resumeFrom: z.number().int().nonnegative().optional(),
  /**
   * #3753 — « créer une liste cible » avec les comptes du fichier (tier,
   * raison, problématiques). Comptes seulement ; AUCUNE analyse n'est lancée.
   */
  targetList: z.object({ name: z.string().trim().min(1).max(120) }).optional(),
})
