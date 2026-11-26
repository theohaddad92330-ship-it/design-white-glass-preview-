/**
 * #4792 (épopée #4791) — LE LECTEUR COMMUN DE NOTRE BASE : le contrat.
 *
 * Quatre surfaces posent la MÊME question — « quoi, dans notre base, correspond à ces critères ? » —
 * Découvrir, Laura, l'analyse et Signaux. Écrite quatre fois, cette question aurait quatre réponses
 * différentes dans trois semaines ; elle vit donc à UN seul endroit (garde GA-26), et ce fichier en
 * porte la forme pour que l'API, le service IA et l'écran lisent le même mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE CONTRAT PROMET
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois familles — les COMPTES, les BESOINS (besoins enregistrés et offres collectées), les
 * CONSULTANTS — et, sur CHAQUE ligne, deux champs qui ne sont jamais facultatifs :
 *
 *  - `source` : de quelle nature de ligne elle vient ({@link BASE_READER_SOURCES}) ;
 *  - `collectedAt` : la DATE DE COLLECTE de cette ligne.
 *
 * Sans ces deux champs, l'appelant ne peut pas dire « de quand » date ce qu'il montre — et la doctrine
 * du dépôt l'exige (un fait périmé redevient inconnu, il ne disparaît pas ; tant qu'un compte n'est pas
 * rejoué, son écran DIT que sa collecte est antérieure).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE CONTRAT REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **Aucune probabilité, aucun score.** Le lecteur rend des lignes et leur date ; le rang est l'affaire
 *    de l'appelant, et une chance de closing n'existe nulle part (doctrine, refusée six fois).
 *  - **Aucune donnée inventée.** Une absence ne fait AUCUNE ligne ; une valeur absente vaut `null`,
 *    jamais `0` ni une chaîne vide (gardes GA-18 / GA-19).
 *  - **Aucune fenêtre par défaut.** La période est un CRITÈRE, jamais un réglage caché : c'est
 *    exactement le défaut mesuré dans Découvrir (90 jours posés puis refiltrés à la même valeur) qui
 *    rendait invisible ce que la base portait déjà. Sans `from`/`to`, la base entière est lisible.
 *  - **Aucun crédit.** Relire ce qui est DÉJÀ stocké ne débite rien (doctrine
 *    `c145_historique_stocke_se_lit_sans_credit`) : un crédit ne se débite que sur un appel NEUF à une
 *    source externe, et ce lecteur n'en fait aucun.
 *  - **Aucune famille non demandée.** Une famille absente de la réponse n'est pas une famille vide :
 *    `undefined` dit « pas demandée », `total: 0` dit « demandée, rien trouvé ».
 */

/**
 * Les trois familles. Ajouts EN FIN (GA-08).
 *
 * ⚠️ Un TYPE, pas une liste de valeurs — et c'est délibéré : ce fichier ne porte QUE des types, pour
 * qu'un appelant puisse lire le contrat sans charger `@bellum/contracts` à l'exécution. L'ordre de
 * restitution et les deux plafonds de pagination vivent côté API, à un seul endroit
 * (`apps/api/src/modules/base-reader/base-reader.limits.ts`) — même patron que
 * `needs-history.limits.ts` (#4759), pour la même raison : un plafond se relève là où il se mesure.
 */
export type BaseReaderFamily = 'accounts' | 'needs' | 'consultants'

/**
 * La NATURE de la ligne rendue — ce qui, dans notre base, a produit cette ligne.
 *
 * ⚠️ Ce n'est PAS le fournisseur qui a collecté la donnée, et ça ne le sera jamais : « nos fournisseurs
 * ne se nomment jamais » (doctrine). On nomme la nature de l'enregistrement, pas le prestataire.
 *
 *  - `account_record` : la fiche du compte elle-même (`accounts`) ;
 *  - `registered_need` : un besoin ENREGISTRÉ dans l'espace (`project_needs`) — dit, saisi ou importé ;
 *  - `collected_offer` : une offre COLLECTÉE et historisée pour un compte (`signal_history`, recrutement) ;
 *  - `consultant_record` : la fiche du consultant (`consultants`) ;
 *  - `consultant_experience` : une expérience déclarée sur un CV autorisé (`consultant_experiences`).
 */
export type BaseReaderSource =
  'account_record' | 'registered_need' | 'collected_offer' | 'consultant_record' | 'consultant_experience'

/**
 * LES CRITÈRES. Chacun est OPTIONNEL et chacun RESTREINT : aucun critère ne fait « tout rendre » par
 * surprise, et un critère posé qui ne correspond à rien rend zéro ligne plutôt que la liste entière.
 *
 * ⚠️ `terms` et les lieux sont du TEXTE, pas des identifiants résolus : la base stocke les lieux en
 * texte libre (`accounts.headquarters`, `project_needs.location`, `consultants.location`), donc un
 * lieu se RAPPROCHE, il ne se résout pas. Un département donné par son code (« 59 ») rapproche aussi
 * la forme parenthésée (« Lille (59) ») — c'est la seule tolérance, et elle est écrite.
 */
export interface BaseReaderCriteria {
  /** Métier ou compétence, tels que la personne les nomme (« Java », « architecte SI »). */
  terms: string[]
  /** La ville. */
  city: string | null
  /** Départements — code (« 59 ») ou nom (« Nord »). */
  departments: string[]
  /** Régions — libellé (« Hauts-de-France »). */
  regions: string[]
  /** La PÉRIODE, sur la date de collecte de la ligne. `null` des deux côtés = aucune fenêtre. */
  from: string | null
  to: string | null
  /** Les familles demandées. Vide = les trois. */
  families: BaseReaderFamily[]
  /** Restreindre à des comptes déjà résolus (l'analyse d'UN compte, par exemple). Vide = aucun filtre. */
  accountIds: string[]
  /**
   * #4794 — écarte les ESN FRANCHES (code d'activité 62.0x hors 62.09Z) des comptes et des besoins : « les comptes
   * qui prennent des développeurs » sont des utilisateurs, pas des ESN. Un code absent ou ambigu n'écarte rien
   * (ne pas connaître le code n'est pas être une ESN). Absent = aucune exclusion.
   */
  excludeEsn?: boolean
  limit: number
  offset: number
}

/** Ce que porte CHAQUE ligne, sans exception : sa nature et la date de sa collecte. */
export interface BaseReaderProvenance {
  source: BaseReaderSource
  /**
   * La date de collecte de la ligne, en ISO. `null` = la base ne la porte pas — jamais une date devinée
   * ni « aujourd'hui » par défaut (un fait sans date n'est pas un fait d'aujourd'hui).
   */
  collectedAt: string | null
}

export interface BaseReaderAccountRow extends BaseReaderProvenance {
  accountId: string
  companyName: string
  /** `null` = non renseigné. */
  sector: string | null
  /** Le lieu TEL QU'ÉCRIT sur la fiche (siège, puis adresse). `null` = la fiche n'en porte aucun. */
  place: string | null
  siren: string | null
  /** Le périmètre (BU) du compte. `null` = aucun périmètre — un état valide, pas une donnée manquante. */
  businessUnitId: string | null
}

export interface BaseReaderNeedRow extends BaseReaderProvenance {
  /** L'identité de la ligne quand c'est un besoin enregistré ; `null` pour une offre collectée. */
  needId: string | null
  accountId: string
  accountName: string | null
  title: string
  /** Les compétences citées par le besoin. Vide = le besoin n'en nomme aucune. */
  skills: string[]
  /**
   * Le lieu. Pour un besoin ENREGISTRÉ, le sien (`project_needs.location`). Pour une offre COLLECTÉE,
   * celui du COMPTE (son siège) : la ligne d'historique n'en porte aucun, et attribuer un lieu à
   * l'offre sans le dire serait une donnée inventée. `null` = aucun lieu connu.
   */
  place: string | null
  /** Le statut du besoin enregistré ; `null` pour une offre collectée (elle n'en a pas). */
  status: string | null
}

export interface BaseReaderConsultantRow extends BaseReaderProvenance {
  consultantId: string
  fullName: string | null
  title: string | null
  place: string | null
  /** Les zones déclarées (mobilité comprise). Vide = aucune déclarée. */
  zones: string[]
  /** Les compétences de la fiche. Vide = aucune. */
  skills: string[]
  /**
   * L'expérience qui a fait correspondre la fiche, quand la correspondance vient de là
   * (`source: 'consultant_experience'`). `null` quand la fiche elle-même correspond.
   */
  experience: { client: string | null; role: string | null; from: string | null; to: string | null } | null
  /**
   * Le LIEU D'UNE MISSION RÉALISÉE qui a fait correspondre le lieu demandé — « qui a bossé à Lille ? ».
   *
   * `null` dit que le lieu vient de la FICHE (sa ville, ses zones déclarées), pas d'une mission : les
   * deux réponses sont vraies mais elles ne disent pas la même chose, et les confondre ferait passer
   * une mobilité déclarée pour une mission faite. Les expériences de CV, elles, ne portent AUCUN lieu
   * en base : un lieu ne peut donc jamais venir de là.
   */
  missionPlace: string | null
}

/** Une page d'une famille. `total` compte ce qui correspond, pas ce que la page rend. */
export interface BaseReaderPage<Row> {
  total: number
  offset: number
  limit: number
  hasMore: boolean
  rows: Row[]
}

/**
 * La réponse. Une famille non demandée est ABSENTE (`undefined`) ; une famille demandée qui ne trouve
 * rien est présente avec `total: 0` et `rows: []`. Les confondre dirait « rien dans la base » là où la
 * vérité est « je n'ai pas regardé ».
 */
export interface BaseReaderResult {
  readAt: string
  accounts?: BaseReaderPage<BaseReaderAccountRow>
  needs?: BaseReaderPage<BaseReaderNeedRow>
  consultants?: BaseReaderPage<BaseReaderConsultantRow>
}
