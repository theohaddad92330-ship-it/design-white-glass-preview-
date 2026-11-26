/**
 * Les colonnes de la liste des missions — la liste CANONIQUE, et la seule.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMMENT ELLES ONT ÉTÉ CHOISIES
 * ─────────────────────────────────────────────────────────────────────────
 * Par ce qu'elles font DÉCIDER, et seulement parmi ce que la donnée porte
 * vraiment. `GET /delivery/missions` rend la mission à plat, plus `renewal`,
 * `risks` et — sous `finance:read` — `marginPercent` ; on y a ajouté le nom du
 * compte et les affectations, deux lectures que le board faisait déjà.
 *
 * Il y en a SEIZE depuis le 01/11/2026, où « Satisfaction » s'est ajoutée
 * (#2408.33, L15) — quinze depuis le 19/09/2026, où « Manager » l'avait
 * précédée (#2195.12) — quatorze depuis le 17/09/2026, où « Owner » l'avait précédée
 * (#2195.13), treize depuis le 16/09/2026, où « Reconduction » l'avait
 * précédée (#2195.20, .22 à .29), douze depuis le 04/09/2026, où « Prochaine
 * action » l'avait précédée avant elle (#1354, #1355, #1357). La liste de ce qui a été refusé compte
 * autant, parce qu'un tableau à quinze colonnes dont quatre sont vides est pire
 * qu'un tableau à treize — et parce que chaque refus dit ce qu'il faudrait pour
 * l'ouvrir :
 *
 *  - **le TJM** (`daily_rate`) : la donnée est là, mais elle sort de l'API
 *    SANS `finance:read` — seule la marge DÉRIVÉE est retirée. En faire une
 *    colonne transformerait une fuite latente en fonctionnalité. À rouvrir le
 *    jour où le service la retire comme il retire `marginPercent`.
 *    ⚠️ Ce n'est PAS une contradiction avec la colonne « Marge » ci-dessous, et
 *    deux relectures s'y sont trompées : le prix de VENTE est visible — un
 *    commercial en a besoin pour négocier — et ce sont les ENTRÉES de la marge
 *    (le coût chargé) et la marge elle-même qui sont gardées.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA ONZIÈME — « Marge », ouverte le 28/08/2026 par la décision D43
 * ─────────────────────────────────────────────────────────────────────────
 * Elle a longtemps été le refus le plus coûteux de cette liste. Le champ
 * existait, il était correctement retiré sans `finance:read`, et il serait la
 * colonne la plus utile — mais il se calculait sur `missions.daily_cost`,
 * alors que le produit fait saisir le coût chargé dans
 * `mission_commercial_terms.loaded_daily_cost_cents`. Le formulaire de la
 * fiche écrit la SECONDE table ; rien dans l'application n'écrivait la
 * première. La colonne aurait donc dit « coût chargé non renseigné » sur des
 * missions dont la FICHE affiche « 32 % de marge » : deux écrans en
 * contradiction sur la même mission, un défaut neuf plutôt qu'une absence.
 *
 * Ce qui lui manquait était un ARBITRAGE — quelle table fait foi ? — et non un
 * branchement. Louis a tranché : les conditions commerciales. La dérivation
 * les lit désormais, et les deux écrans passent par le même noyau
 * (`missionMargin`), donc rendent le même nombre. La colonne s'ouvre avec la
 * réponse, pas avant.
 *
 * ⚠️ Et depuis D45 · 26/08, `marginPercent` n'est plus RETIRÉ sans le droit : il
 * vaut `null`, présent et vide. La colonne ne peut donc plus déduire du silence
 * qu'il s'agit d'une absence de mesure — c'est `canReadFinance`, rendu à côté de
 * la liste, qui distingue « pas ton périmètre » de « coût chargé non renseigné ».
 * Une colonne qui afficherait la même chose pour les deux serait exactement le
 * défaut que D45 · 26/08 corrige.
 *  - **le contact de facturation** (`billing_contact_id`), **le besoin
 *    d'origine** (`opportunity_id`), **l'entité juridique**
 *    (`legal_entity_id`) : l'API ne rend que des identifiants. (L'entité
 *    juridique a depuis son FILTRE, #2408.40 : `legalEntityName`, résolu en
 *    lot côté serveur — `legalEntityCounts`, `filters.ts`.) Une
 *    colonne d'UUID ne fait décider personne, et inventer un libellé serait
 *    pire. Il leur manque une résolution de nom GROUPÉE, comme celle écrite
 *    pour le compte puis pour le porteur (`ownersOf`) et le manager
 *    (`managersOf`) — le patron existe, personne ne l'a rejoué pour l'entité
 *    juridique.
 *  - **le secteur / le domaine** (`application_sector_codes`,
 *    `primary_domain_code`) : des CODES, pas des libellés. Il leur manque le
 *    référentiel.
 *  - **« prêt à facturer »** et **le relevé du mois** (#2408.29, .30, .31) :
 *    ils vivent sur `/delivery/invoice-readiness` et `/delivery/timesheets`,
 *    qui portent tous deux un MOIS. Les fondre ici obligerait la liste à
 *    choisir un mois en silence, et une colonne dont personne ne connaît la
 *    période est une colonne qu'on lit de travers. Statut CRA, montant préparé
 *    et statut de règlement sont déjà des COLONNES à part entière — sur
 *    `/missions/facturation` (`InvoiceReadinessTable.tsx`) pour les deux
 *    premières, sur `/missions/encaissements` (`CollectionsPage.tsx`) pour la
 *    troisième — chacune sur SON mois, jamais recopiée ici sans lui.
 *  - **la satisfaction** (#2408.33, #2408.51) : refusée jusqu'au 31/10/2026
 *    faute d'un résumé PAR MISSION sur la liste. ROUVERTE (L15) : la liste
 *    porte désormais `satisfaction` (niveau déclaré, #2408.16) — colonne
 *    `satisfaction` en fin de liste, filtre `satisfactionCounts`.
 *  - **la BU / agence** (#2408.39, #2408.40) : `MissionView.businessUnitName`
 *    (BU de la mission si transférée, sinon celle du compte porteur) porte
 *    désormais un FILTRE (`MissionBusinessUnitFilter`, `businessUnitCounts`),
 *    pas une colonne — même geste que devise/canal ci-dessous.
 *
 *    **Le partenaire intermédiaire** (#2408.52) et **la devise** (#2408.53),
 *    listés ici jusqu'au 27/09, ONT depuis leur filtre : `channel` et
 *    `currency` remontent tous deux sur `GET /delivery/missions` depuis
 *    `mission_commercial_terms` (`DeliveryService.commercialTermsByMission`),
 *    même table, même porte `finance:read` que `poNumber`/`requiresPo` —
 *    `MissionChannelFilter`/`MissionCurrencyFilter` (`MissionsToolbar.tsx`).
 *    Aucune COLONNE n'a été ajoutée pour autant : un filtre resserre une
 *    liste déjà lisible, une colonne demande un ordre de grandeur et une
 *    largeur qui n'ont pas été cadrés ici — deux gestes différents.
 */
export const MISSION_COLUMN_KEYS = [
  /** Le nom de la mission — et la porte vers sa fiche. */
  'mission',
  /** Chez QUI. La première question qu'on se pose devant une ligne. */
  'account',
  /** Le rôle cherché, distinct du nom de la mission. */
  'role',
  /** Qui est dessus aujourd'hui — ou personne, ce qui est une alerte. */
  'staffing',
  'status',
  /** La fin prévue et sa fenêtre de renouvellement. */
  'endsOn',
  /** Régie, forfait, recrutement — ce qui décide si un relevé est même attendu. */
  'contractKind',
  /** Ce qui cloche, calculé — jamais saisi. */
  'risks',
  /**
   * CE QU'IL RESTE À FAIRE, en LIEN (#1354, #1355, #1357).
   *
   * Juste après « Risques », et ce n'est pas un détail de mise en page : le
   * retour qui l'a demandée pointait littéralement les pastilles
   * « Renouvellement non engagé » et « Sans date de fin » — des alertes sans
   * porte de sortie. La porte se lit dans la même bande de l'œil que l'alerte,
   * ou elle ne se lit pas.
   *
   * Sa valeur vient du SERVEUR (`activeMissionNextAction`), jamais d'un calcul
   * refait ici : « la valeur doit provenir de l'action existante, jamais être
   * inventée localement » (#1357), et une seconde échelle d'urgence
   * divergerait de celle des alertes au premier ajout (GA-26).
   */
  'nextAction',
  'startedOn',
  /** Depuis combien de temps la mission est dans son statut actuel. */
  'stageAge',
  /**
   * Ce que la mission rapporte — sous `finance:read`, et TROIS états.
   *
   * La clé ABSENTE dit « pas ton périmètre », `null` dit « aucun coût chargé
   * saisi », un nombre dit la marge. Les replier l'un sur l'autre écrirait
   * « 0 % » là où la vérité est « on ne sait pas ».
   */
  'margin',
  /**
   * OÙ EN EST LA RECONDUCTION — #2195.20, .22 à .29 (16/09/2026).
   *
   * ⚠️ AJOUTÉE EN FIN DE LISTE, jamais au milieu. Cette liste est PERSISTÉE
   * dans la préférence de colonnes de chaque utilisateur : y insérer une valeur
   * au milieu ne casse rien de visible, mais la règle est la même que pour une
   * énumération de base (GA-08) et elle vaut ici pour une raison précise — le
   * jour où cette préférence se stockera par RANG plutôt que par nom, une
   * insertion au milieu décalerait les choix de tout le monde en silence.
   *
   * ⚠️ À ne pas confondre avec 'status', plus haut, qui est le statut de la
   * MISSION. Les deux vivent sur la même ligne : une mission `active` peut
   * porter une reconduction `fin_confirmee`, et c'est exactement l'information
   * qui manquait à l'écran de décision.
   *
   * ⚠️ Ce n'est PAS une probabilité, et la colonne ne peut pas en devenir une :
   * les huit valeurs nomment un ÉVÉNEMENT ou une ÉCHÉANCE, jamais une chance
   * (#2195.25, doctrine `c26_probabilite`).
   */
  'renewalStatus',
  /**
   * LE PORTEUR (`owner_id`) — #2195.13 (17/09/2026).
   *
   * ⚠️ AJOUTÉE EN FIN, comme `renewalStatus` juste au-dessus (GA-08 appliqué
   * à cette liste PERSISTÉE). Refusée depuis le 04/09 faute d'une résolution
   * de nom GROUPÉE (`ownersOf`, `delivery.service.ts`) — l'UUID nu ne fait
   * décider personne. Optionnelle, PAS dans les colonnes par défaut : la même
   * mesure de largeur que « Reconduction » (80 rem, `MissionsTable.test.tsx`)
   * s'applique, et un dixième champ par défaut la dépasserait.
   */
  'owner',
  /**
   * LE MANAGER (des consultants affectés) — #2195.12 (19/09/2026).
   *
   * ⚠️ AJOUTÉE EN FIN, comme `owner` juste au-dessus (GA-08 appliqué à cette
   * liste PERSISTÉE). Refusée jusqu'ici faute d'une résolution GROUPÉE à
   * TROIS sauts (mission → `mission_assignments` → `consultants.manager_id`
   * → `consultants.full_name`, `DeliveryService.managersOf`) — un manager de
   * mission n'existait tout simplement pas côté API. Optionnelle, PAS dans
   * les colonnes par défaut, même mesure de largeur que « Owner ».
   */
  'manager',
  /**
   * #2408.33 — LA SATISFACTION DÉCLARÉE (contrat Louis 31/10/2026).
   *
   * ⚠️ AJOUTÉE EN FIN (GA-08 appliqué à cette liste PERSISTÉE). Rouverte le
   * jour où la liste porte un résumé PAR MISSION : `GET /delivery/missions`
   * rend `satisfaction` (dernier niveau déclaré de chaque rail,
   * `missionSatisfactionOf`). Les deux rails restent séparés, jamais fondus ;
   * un rail sans niveau se lit « non mesuré ». Optionnelle, PAS par défaut :
   * même mesure de largeur que « Owner ».
   */
  'satisfaction',
] as const

export type MissionColumnKey = (typeof MISSION_COLUMN_KEYS)[number]

/**
 * Ce qui s'affiche tant que personne n'a choisi.
 *
 * Huit sur quatorze : un tableau qu'on ouvre pour la première fois doit tenir dans
 * un écran de portable, et cette borne est MESURÉE (80 rem, `MissionsTable.test.tsx`).
 * Les cinq autres se cochent — elles ne sont pas moins utiles, elles sont moins
 * universelles.
 *
 * ⚠️ **« Marge » en fait partie, et c'est un choix.** L'argument contraire est
 * réel : sans `finance:read`, la cellule dit « hors périmètre » sur chaque
 * ligne, ce qui est du bruit pour un siège `viewer` ou `recruiter`. Il perd
 * quand même, parce que le défaut le plus fréquent de ce dépôt est « du code
 * juste, calculé, testé, que personne n'appelle » — et une colonne livrée que
 * personne ne coche en serait la version exacte. Elle a été refusée pendant
 * des mois faute d'un arbitrage ; la livrer masquée reviendrait à la refuser
 * une fois de plus, plus discrètement. Elle se décoche en un clic.
 */
/**
 * Les colonnes NÉES après qu'un utilisateur a pu enregistrer son choix.
 *
 * ⚠️ Ce n'est PAS la liste des défauts, et la distinction est le tout du
 * correctif : une préférence enregistrée avant qu'une colonne existe ne la
 * contient pas, et la rendre telle quelle masque la colonne neuve à **tous ceux
 * qui ont déjà ouvert l'écran** — mesuré en production le 04/09/2026, où
 * « Prochaine action » n'atteignait aucun bêta-testeur.
 *
 * On n'ajoute donc QUE ce qui figure ici, jamais les défauts entiers : une
 * colonne que l'utilisateur a vue et décochée reste décochée.
 *
 * Quand une colonne est ajoutée au produit, on l'ajoute ici EN MÊME TEMPS.
 * `column-preference-lists-new-columns.test.ts` le vérifie.
 */
export const MISSION_COLUMNS_ADDED_SINCE: readonly MissionColumnKey[] = [
  // #1354, #1355, #1357 (04/09/2026) — la prochaine action de chaque mission.
  'nextAction',
  // ⚠️ `renewalStatus` (#2195.20, 16/09/2026) n'y est PAS, et c'est cohérent :
  // cette liste ne réinjecte que des colonnes affichées PAR DÉFAUT, et celle-ci
  // ne l'est pas — la mesure de largeur de `MissionsTable.test.tsx` ne le
  // permet pas (voir sa raison dans `DEFAULT_MISSION_COLUMNS`). L'écran de
  // décision de renouvellement la rend VERROUILLÉE de son côté, donc personne
  // ne la manque là où elle est le sujet.
  //
  // ⚠️ `owner` (#2195.13, 17/09/2026) n'y est PAS non plus, même raison :
  // optionnelle, pas par défaut — un choix de colonnes déjà enregistré ne la
  // manque pas, il ne l'avait simplement jamais vue proposée.
  //
  // ⚠️ `manager` (#2195.12, 19/09/2026) n'y est PAS non plus, même raison
  // qu'`owner` juste au-dessus.
] as const

// #4191 (recette 3, F2) — « Compte » n'est plus une colonne PAR DÉFAUT : la cellule Mission le porte en
// ligne secondaire (sous le titre) tant que la colonne n'est pas cochée. 192 px rendus au tableau, à
// 1440-1520 px, sans retirer l'information. Cochée, la colonne reprend sa place (jamais deux fois, GA-26).
export const DEFAULT_MISSION_COLUMNS: readonly MissionColumnKey[] = [
  'mission',
  'staffing',
  'status',
  'endsOn',
  'risks',
  // #1354, #1355, #1357 — cochée par défaut, parce qu'une colonne d'action
  // livrée MASQUÉE est exactement le défaut qu'on répare : du calcul juste que
  // personne ne voit. Elle se décoche en un clic.
  'nextAction',
  'margin',
] as const

/**
 * #4191 (recette 15/10, D4) — LA LARGEUR À PARTIR DE LAQUELLE LES DÉFAUTS COMPLETS TIENNENT.
 *
 * Mesuré en recette : à 1280-1440 px, huit colonnes par défaut tronquaient
 * l'échéance, le consultant et la marge (« Éché… », « Yanis… »). Sous cette
 * largeur, les défauts perdent leurs deux colonnes SECONDAIRES — « Risques » et
 * « Prochaine action », lisibles sur la fiche et cochables d'un clic — plutôt
 * que de couper le texte des autres. Un choix enregistré par l'utilisateur
 * gagne toujours.
 */
export const WIDE_TABLE_MIN_PX = 1440

export const COMPACT_MISSION_COLUMNS: readonly MissionColumnKey[] = DEFAULT_MISSION_COLUMNS.filter(
  key => key !== 'risks' && key !== 'nextAction',
)

/**
 * ⚠️ POURQUOI « Reconduction » N'EST PAS DANS LES DÉFAUTS — #2195.20, 16/09/2026.
 *
 * Ce n'est pas un oubli, et surtout pas le défaut « colonne livrée masquée »
 * que le commentaire de `nextAction` ci-dessus dénonce. La raison est une
 * MESURE : `MissionsTable.test.tsx` borne la somme des largeurs des colonnes
 * par défaut à 80 rem, parce que 76 rem ont rempli exactement 1 213 px de zone
 * défilante dans un vrai navigateur. Neuf colonnes par défaut dépasseraient
 * cette mesure, et jsdom ne sait pas la refaire — un chiffre qu'on relèverait
 * sans re-mesurer serait une garde qui invente sa règle au lieu de la protéger.
 *
 * Ce qui remplace le défaut, et qui vaut mieux : l'écran de décision de
 * renouvellement la déclare VERROUILLÉE (`useMissionColumns(['renewalStatus'])`).
 * Là où elle est le sujet, elle est toujours là et ne se décoche pas ; ailleurs,
 * elle se coche comme les quatre autres colonnes optionnelles.
 */

/**
 * La colonne qu'on ne masque pas.
 *
 * Une ligne sans le nom de sa mission n'est plus une ligne : on ne sait plus de
 * quoi les autres cellules parlent. Le sélecteur la montre cochée et
 * désactivée, plutôt que de l'omettre — l'absence se lirait comme un oubli.
 */
export const PINNED_MISSION_COLUMN: MissionColumnKey = 'mission'

/** Une clé venue du stockage (ou d'une version plus ancienne) est-elle encore connue ? */
export function isMissionColumnKey(value: unknown): value is MissionColumnKey {
  return typeof value === 'string' && (MISSION_COLUMN_KEYS as readonly string[]).includes(value)
}
