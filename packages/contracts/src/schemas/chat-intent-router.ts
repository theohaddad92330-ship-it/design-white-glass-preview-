import { z } from 'zod'

// #2321 — le routeur ne redéfinit PAS le vocabulaire des demandes non routées :
// il RÉUTILISE celui qui existe (GA-26, « un réglage vit à un seul endroit »),
// avec sa contrainte SQL côté API et son écran côté back-office.
import { UNROUTED_INTENT_CATEGORIES, type UnroutedIntentCategory } from './laura-unrouted-intent.js'

/**
 * #2321 — LE ROUTEUR D'INTENTION de Laura (LAU-FINAL-062).
 *
 * ## Ce qui n'existait pas
 *
 * Mesuré le 22/09/2026, deux fois, indépendamment : **aucun compilateur `/chat`
 * n'existait**. `apps/ia/app/services/chat_tools.py` déclare soixante outils, et
 * RIEN ne lisait une demande pour décider lequel appeler — le choix restait
 * implicite au raisonnement du modèle. Le contrat de demande structuré
 * (`request-intent-contract.ts`, #2257) nommait dix-huit champs dont **deux**
 * seulement avaient un producteur déterministe. Ce module est le producteur qui
 * manquait pour quatre d'entre eux (`intention_principale`, `resultat_attendu`,
 * `objets_a_produire`, `action_souhaitee`).
 *
 * ## Ce qu'il fait, et ce qu'il ne fait pas
 *
 * Il classe une demande sur un vocabulaire de marqueurs **déclarés** (FR ET EN),
 * puis lit une table de routage. Il n'appelle aucun modèle, ne fait aucun
 * réseau, et **n'invente rien** : une demande sans marqueur n'est pas routée,
 * une intention reconnue dont la capacité manque le DIT.
 *
 * ## Les trois règles de doctrine qui le commandent
 *
 * 1. **Un intent NON DÉCLARÉ attend.** {@link UNDECLARED_CHAT_INTENT} n'ouvre
 *    aucun outil et lève `awaits_human`. C'est le jumeau exact de
 *    `UNDECLARED_INTENT_SITE` (`action-os.ts`) et de `UNDECLARED_EFFECT_REACH` :
 *    la valeur par défaut d'un routage inconnu est celle qui demande une
 *    validation humaine, jamais celle qui laisse agir.
 * 2. **Aucune PROBABILITÉ.** {@link chatIntentConfidenceSchema} a deux valeurs
 *    NOMMÉES. Le routeur ne sort jamais un nombre — ni score, ni pourcentage, ni
 *    « chance de bon routage » (refusé six fois, cf. doctrine).
 * 3. **Le copilote PRÉPARE, il n'envoie jamais.** L'étape terminale du pipeline
 *    s'appelle `preparer_le_message` et elle ATTEND ; aucune étape « envoyer »
 *    n'existe dans {@link CHAT_INTENT_PIPELINE}.
 *
 * Miroir Python : `apps/ia/app/services/compilers/intent_router.py` (parité des
 * vocabulaires tenue par `chat-intent-router.parity.test.ts`, qui lit le fichier
 * Python — deux langages, une seule liste).
 */

// ── Les dix intentions du ticket ─────────────────────────────────────────────

/**
 * Les dix intentions que le ticket énumère. L'ordre est celui du ticket ; il est
 * aussi l'ordre de départage d'une égalité de marqueurs (voir
 * {@link routeChatIntent}) — donc il ne se réordonne pas sans raison.
 */
export const CHAT_INTENT_KINDS = [
  /** #2321.1 — « je cherche du business ». */
  'chercher_du_business',
  /** #2321.2 — « j'ai une information client ». */
  'information_client',
  /** #2321.3 — « j'ai un besoin ». */
  'besoin',
  /** #2321.4 — « j'ai un profil ». */
  'profil',
  /** #2321.5 — « je veux matcher ». */
  'matcher',
  /** #2321.6 — « je veux proposer » (shortlist / push). */
  'proposer',
  /** #2321.7 — « j'ai un retour » (submission). */
  'retour',
  /** #2321.8 — « c'est signé » (vérification puis Mission). */
  'signe',
  /** #2321.9 — « j'importe mon existant » (multi-objets). */
  'importer',
  /** #2321.10 — « je ne sais pas quoi faire » (diagnostic). */
  'diagnostic',
  /**
   * #3175.3 (épopée #3215) — « comparer des options », un des six types
   * d'intention du ticket #3175 non encore câblés. AJOUTÉE À LA FIN (GA-08),
   * même règle que `submission` sur {@link CHAT_INTENT_OBJECT_KINDS} : ce
   * n'est pas l'ordre du ticket #2321 d'origine.
   */
  'comparer',
  /** #3175.3 — « trouver des contacts », deuxième des six. AJOUTÉE À LA FIN, même raison que `comparer`. */
  'trouver_contacts',
  /**
   * #3175.3 — « actualiser une information », troisième des six. RECONNUE,
   * non servie (comme `information_client` / `retour`) : aucun outil de chat
   * ne relance une analyse existante.
   */
  'actualiser',
  /**
   * #3175.3 — « choisir un périmètre », quatrième des six. Servie :
   * `resolve_account_territory` existe déjà.
   */
  'choisir_perimetre',
  /** #3175.3 (lot E1 30/09) — « challenger un compte », servie (intérêt × pénétrabilité, alternatives). */
  'challenger_un_compte',
  /** #3175.3 — « comprendre un écosystème », servie (carte de couverture, ESN observées). */
  'comprendre_ecosysteme',
] as const
export type ChatIntentKind = (typeof CHAT_INTENT_KINDS)[number]

/**
 * Le défaut. ⚠️ Il ne fait PAS partie de {@link CHAT_INTENT_KINDS} : ce n'est pas
 * une onzième intention, c'est l'absence de routage — et l'absence de routage
 * attend un humain.
 */
export const UNDECLARED_CHAT_INTENT = 'non_declaree'

export const chatIntentSchema = z.enum([...CHAT_INTENT_KINDS, UNDECLARED_CHAT_INTENT])

// ── L'objet canonique (#2321.13) ─────────────────────────────────────────────

/**
 * Les objets canoniques qu'une demande peut concerner.
 *
 * ⚠️ Les cinq premiers sont EXACTEMENT `OBJECT_KINDS` de
 * `apps/ia/app/services/chat_thread_state.py` — le vocabulaire des objets cités
 * d'un fil, déjà en service. `submission` est le SEUL ajout, et il est ajouté à
 * la fin (GA-08) : le ticket le nomme comme objet canonique, le fil ne le
 * connaissait pas encore. `consultant` tient lieu de « Talent » — c'est le nom
 * que le produit emploie partout, on n'en crée pas un second.
 */
export const CHAT_INTENT_OBJECT_KINDS = ['account', 'contact', 'consultant', 'need', 'mission', 'submission'] as const
export type ChatIntentObjectKind = (typeof CHAT_INTENT_OBJECT_KINDS)[number]

// ── Le résultat attendu (#2321.12) ───────────────────────────────────────────

/**
 * #2321.12 — le RÉSULTAT ATTENDU d'une demande, dans un vocabulaire FERMÉ.
 *
 * Une phrase libre serait de la donnée fictive dès que le routeur se trompe :
 * une valeur d'énumération, elle, se vérifie. C'est ce que les sept autres
 * compilateurs `/chat` lisent pour savoir ce qu'ils doivent rendre.
 */
export const CHAT_INTENT_RESULT_KINDS = [
  'liste_de_comptes',
  'signal_qualifie',
  'fiche_besoin',
  'fiche_profil',
  /** #2321.22 — le NO-GO du ticket : « à qui vendre ce consultant » n'est pas un matching. */
  'marche_inverse',
  'liste_de_correspondances',
  'shortlist',
  'suivi_de_soumission',
  'mission_creee',
  'plan_d_import',
  'liste_de_priorites',
  /**
   * #3175.3 — le résultat de `comparer` : ni une liste (le tri des comptes
   * les uns par rapport aux autres, pas leur simple énumération), ni
   * `liste_de_priorites` (`diagnostic` compare un portefeuille ENTIER sans
   * options nommées ; `comparer` compare des options NOMMÉES par la demande).
   */
  'comparaison_de_comptes',
  /** #3175.3 — le résultat de `trouver_contacts` : QUI approcher, distinct de `liste_de_comptes`. */
  'liste_de_contacts',
  /**
   * #3175.3 — le résultat NOMMÉ de `actualiser`, même si aucun outil ne le
   * produit encore : nommer le résultat attendu garde la table lisible en
   * symétrie avec les autres intentions.
   */
  'information_actualisee',
  /**
   * #3175.3 — le résultat de `choisir_perimetre` : QUEL niveau adresser
   * (groupe, filiale, BU…), distinct de `liste_de_priorites`.
   */
  'perimetre_recommande',
  /** #3175.3 — résultat de `challenger_un_compte` : un verdict argumenté sur la cible. */
  'compte_challenge',
  /** #3175.3 — résultat de `comprendre_ecosysteme` : ce qui entoure UN compte. */
  'ecosysteme_du_compte',
] as const
export type ChatIntentResultKind = (typeof CHAT_INTENT_RESULT_KINDS)[number]

// ── Le pipeline séquencé (#2321.18 / #2321.19) ───────────────────────────────

/**
 * #2321.18 — les étapes d'un job séquencé, DANS L'ORDRE.
 *
 * ⚠️ #2321.19 — le NO-GO du saut d'étape se tient ICI, par construction : une
 * route ne rend jamais un sous-ensemble troué de ce tuple, seulement une TRANCHE
 * CONTIGUË (voir {@link routeChatIntent}). Sauter de « j'ai un besoin » à
 * « envoie le mail » est donc impossible à exprimer.
 *
 * ⚠️ Aucune étape ne s'appelle « envoyer ». Le copilote PRÉPARE, le commercial
 * envoie — et la dernière étape attend toujours une validation.
 */
export const CHAT_INTENT_PIPELINE = [
  'qualifier_le_besoin',
  'trouver_les_profils',
  'construire_la_shortlist',
  'faire_valider_la_shortlist',
  'preparer_le_message',
] as const
export type ChatIntentStepKind = (typeof CHAT_INTENT_PIPELINE)[number]

/**
 * #2321.16 — les étapes qui ATTENDENT une validation humaine. Les deux
 * dernières : on ne pousse pas une shortlist sans qu'elle soit validée, et un
 * message préparé n'est jamais parti (doctrine, « le copilote prépare »).
 */
export const CHAT_INTENT_STEPS_AWAITING_VALIDATION = ['faire_valider_la_shortlist', 'preparer_le_message'] as const

// ── Les données déjà présentes (#2321.14) ────────────────────────────────────

/**
 * #2321.14 — les données qu'une demande peut exiger.
 *
 * ⚠️ Ce que le routeur SAIT de ces données ne vient JAMAIS du texte : l'appelant
 * passe `availableInputs`, résolu avant le tour (compte actif, objet cité par le
 * fil). Deviner « il y a un besoin » parce que le mot « besoin » est écrit
 * fabriquerait la donnée que la doctrine interdit.
 */
export const CHAT_INTENT_INPUT_KINDS = ['compte_actif', 'besoin_cite', 'consultant_cite', 'mission_citee'] as const
export type ChatIntentInputKind = (typeof CHAT_INTENT_INPUT_KINDS)[number]

// ── La certitude, en deux mots et jamais en chiffres ─────────────────────────

/**
 * Deux valeurs NOMMÉES, jamais un nombre.
 *
 * `certaine`  au moins deux marqueurs déclarés concordent.
 * `hypothese` un seul marqueur : le routeur propose, et l'écran l'affiche COMME
 *             une hypothèse, avec son motif consultable (arbitrage Louis
 *             18/09/2026 — une hypothèse peut être émise AVEC son `reasoning`,
 *             jamais présentée comme une relation établie).
 *
 * ⚠️ Pas de troisième valeur, pas de score, pas de pourcentage : la doctrine
 * refuse toute PROBABILITÉ affichée.
 */
export const chatIntentConfidenceSchema = z.enum(['certaine', 'hypothese'])

// ── La table de routage ──────────────────────────────────────────────────────

type ChatIntentRoutingEntry = {
  /** L'objet canonique concerné, ou `null` quand la demande n'en vise aucun. */
  readonly canonical_object: ChatIntentObjectKind | null
  /** Ce que la demande attend comme résultat. */
  readonly expected_result: ChatIntentResultKind
  /**
   * Les outils de chat qui SERVENT cette intention — des noms qui existent
   * réellement dans `chat_tools.py` (la garde de parité le vérifie et sait dire
   * NON). Vide = capacité absente, et la route le dit au lieu d'inventer.
   */
  readonly tools: readonly string[]
  /**
   * Ce qui manque ENCORE à cette intention, nommé. `null` quand rien ne manque.
   * Ce champ est la liste de courses des sept autres lots de compilateurs : ils
   * le passent à `null` quand ils livrent la capacité.
   */
  readonly capability_gap: string | null
  /** L'étape du pipeline que cette intention occupe, ou `null` hors pipeline. */
  readonly stage: ChatIntentStepKind | null
  /** Les données que cette intention exige pour produire son résultat. */
  readonly requires: readonly ChatIntentInputKind[]
  /** Les marqueurs déclarés — FR ET EN, normalisés (sans accent, minuscules). */
  readonly markers: readonly string[]
}

/**
 * ⚠️ LA TABLE. C'est le seul endroit où une intention se décrit (GA-26).
 *
 * Les `capability_gap` non nuls sont la mesure du 22/09/2026, faite outil par
 * outil contre `chat_tools.py` : l'intention est RECONNUE, la capacité n'existe
 * pas encore. Le routeur le dit — c'est exactement la catégorie
 * `capacite_absente` qui existe déjà, avec son écran côté back-office. Il ne
 * fabrique pas un outil qui n'est pas là.
 */
export const CHAT_INTENT_ROUTING_TABLE: Record<ChatIntentKind, ChatIntentRoutingEntry> = {
  // #2321.1 — servie : `find_accounts` / `run_account_search`.
  chercher_du_business: {
    canonical_object: 'account',
    expected_result: 'liste_de_comptes',
    tools: ['find_accounts', 'run_account_search'],
    capability_gap: null,
    stage: null,
    requires: [],
    markers: [
      'du business',
      'des prospects',
      'nouveaux clients',
      'nouveau client',
      'qui prospecter',
      'trouver des comptes',
      // #2679 (recette prod 23/09) / #3856 (BEL-LAU-1008-005, parité
      // rétablie le 08/10) — jumeau des marqueurs Python
      // (`intent_router.py`) : « Trouve-moi des comptes intéressants »
      // n'était routée QUE côté Python avant ce lot. Le tiret reste après
      // `normalize`, d'où les deux graphies.
      'trouve-moi des comptes',
      'trouve moi des comptes',
      'comptes interessants',
      'des leads',
      'new business',
      'prospects',
      'new clients',
      'who to prospect',
      'find accounts',
      'find me accounts',
      'interesting accounts',
      'leads',
    ],
  },
  // #2321.2 — RECONNUE, non servie : aucun outil ne transforme une phrase libre
  // en signal qualifié (mesure du 18/09, reconfirmée le 22/09).
  information_client: {
    canonical_object: 'account',
    expected_result: 'signal_qualifie',
    tools: [],
    capability_gap: 'qualification_d_un_signal_libre',
    stage: null,
    requires: ['compte_actif'],
    markers: [
      "j'ai appris",
      'jai appris',
      'on m’a dit',
      'on m a dit',
      "j'ai vu que",
      'jai vu que',
      'il parait que',
      'ils recrutent',
      'ils ouvrent',
      'i heard',
      'i learned',
      'i saw that',
      'they are hiring',
      'they are opening',
    ],
  },
  // #2321.3 — `find_needs` CHERCHE des besoins existants ; créer/enrichir un
  // besoin depuis un brief libre n'existe pas.
  besoin: {
    canonical_object: 'need',
    expected_result: 'fiche_besoin',
    tools: ['find_needs'],
    capability_gap: 'creation_d_un_besoin_depuis_un_brief',
    stage: 'qualifier_le_besoin',
    requires: [],
    markers: [
      "j'ai un besoin",
      'jai un besoin',
      'un besoin de',
      'ils cherchent un',
      'poste a pourvoir',
      'mission a pourvoir',
      "appel d'offres",
      'appel d offres',
      'i have a need',
      'they need a',
      'open role',
      'job opening',
      // #3864.1 (BEL-LAU-1008-013, recette bêta 08/10) — « trouve-moi des
      // besoins » ne portait AUCUN marqueur : ceux ci-dessus supposent un
      // besoin déjà connu de la personne (« j'ai un besoin »), jamais une
      // RECHERCHE. Miroir exact des marqueurs ajoutés côté Python
      // (intent_router.py) — même liste, même ordre (GA-26).
      'trouve-moi des besoins',
      'trouve moi des besoins',
      'trouve des besoins',
      'cherche-moi des besoins',
      'cherche moi des besoins',
      'cherche des besoins',
      'ou trouver des besoins',
      'quels besoins correspondent',
      'des besoins qui correspondent',
      'besoins ouverts',
      'find me needs',
      'find needs',
      'where can i find needs',
      'what needs match',
      'what open needs',
      'needs that match my expertise',
    ],
  },
  // #2321.4 — `search_talents` CHERCHE dans le vivier ; créer un Talent depuis
  // un CV déposé au fil n'est pas un outil de chat.
  profil: {
    canonical_object: 'consultant',
    expected_result: 'fiche_profil',
    tools: ['search_talents'],
    capability_gap: 'creation_d_un_talent_depuis_un_cv',
    stage: 'trouver_les_profils',
    requires: [],
    markers: [
      "j'ai un profil",
      'jai un profil',
      'un consultant',
      'un cv',
      'candidat',
      'i have a profile',
      'a consultant',
      'a cv',
      'candidate',
    ],
  },
  // #2321.5 — servie : `run_matching`.
  matcher: {
    canonical_object: 'need',
    expected_result: 'liste_de_correspondances',
    tools: ['run_matching'],
    capability_gap: null,
    stage: 'trouver_les_profils',
    requires: ['besoin_cite'],
    markers: ['matcher', 'correspondance', 'rapprocher', 'qui correspond', 'match this', 'matching', 'who fits'],
  },
  // #2321.6 — servie : `run_matching` rend la carte `consultant_shortlist`
  // (`reply_blocks.py`). Le « push » vers le client reste #2321.7.
  proposer: {
    canonical_object: 'consultant',
    expected_result: 'shortlist',
    tools: ['run_matching'],
    capability_gap: null,
    stage: 'construire_la_shortlist',
    requires: [],
    markers: ['proposer', 'shortlist', 'presenter au client', 'pousser', 'propose', 'present to the client', 'push'],
  },
  // #2321.7 — RECONNUE, non servie : `SubmissionEntity` existe côté API, aucun
  // outil de chat ne la met à jour.
  retour: {
    canonical_object: 'submission',
    expected_result: 'suivi_de_soumission',
    tools: [],
    capability_gap: 'mise_a_jour_d_une_soumission',
    stage: null,
    requires: [],
    markers: [
      "j'ai un retour",
      'jai un retour',
      'un retour du client',
      'ils ont repondu',
      'ils ont refuse',
      'ils ont accepte',
      'i have feedback',
      'feedback from the client',
      'they replied',
      'they rejected',
      'they accepted',
    ],
  },
  // #2321.8 — `search_missions` / `propose_mission_proof` existent ; la
  // vérification d'accord double puis la création de Mission, non.
  signe: {
    canonical_object: 'mission',
    expected_result: 'mission_creee',
    tools: ['search_missions', 'propose_mission_proof'],
    capability_gap: 'creation_d_une_mission_apres_accord',
    stage: null,
    requires: [],
    markers: [
      "c'est signe",
      'c est signe',
      'cest signe',
      'contrat signe',
      'bon de commande',
      'on a gagne',
      'it is signed',
      'its signed',
      'signed contract',
      'purchase order',
      'we won',
    ],
  },
  // #2321.9 — `get_import_overview` rend une VUE ; le plan multi-objets
  // (CV + contacts + besoins) n'existe pas.
  importer: {
    canonical_object: 'account',
    expected_result: 'plan_d_import',
    tools: ['get_import_overview'],
    capability_gap: 'plan_d_import_multi_objets',
    stage: null,
    requires: [],
    markers: [
      'importer',
      'mon existant',
      'reprendre mes donnees',
      'fichier excel',
      'mes cv',
      'import my',
      'my existing data',
      'migrate my',
      'excel file',
      'my cvs',
    ],
  },
  // #2321.10 — servie : `list_accounts_to_act` (priorisation, périmètre comptes).
  diagnostic: {
    canonical_object: null,
    expected_result: 'liste_de_priorites',
    tools: ['list_accounts_to_act'],
    capability_gap: null,
    stage: null,
    requires: [],
    markers: [
      'je ne sais pas',
      'par ou commencer',
      'quoi faire',
      'que faire',
      'aide moi',
      'i do not know',
      'i dont know',
      'where to start',
      'what should i do',
      'help me',
    ],
  },
  // #3175.3 (épopée #3215) — servie : `compare_accounts` existe déjà
  // (portefeuille de l'utilisateur, comptes déjà analysés). Distincte de
  // `diagnostic` : ici la demande NOMME les comptes ou options à comparer,
  // `diagnostic` compare le portefeuille entier sans rien nommer.
  comparer: {
    canonical_object: 'account',
    expected_result: 'comparaison_de_comptes',
    tools: ['compare_accounts'],
    capability_gap: null,
    stage: null,
    requires: [],
    markers: [
      'comparer ces comptes',
      'comparer mes comptes',
      'comparer les comptes',
      'quel compte attaquer en premier',
      'quel compte prioriser',
      'lequel prioriser',
      'compare these accounts',
      'compare my accounts',
      'which account first',
      'which account should i prioritize',
    ],
  },
  // #3175.3 (épopée #3215) — servie : `get_account_contacts` (compte actif
  // déjà résolu) et `search_workspace_contacts` (cross-compte, sans compte
  // actif requis) — les DEUX outils existent déjà, `requires` reste vide.
  trouver_contacts: {
    canonical_object: 'contact',
    expected_result: 'liste_de_contacts',
    tools: ['get_account_contacts', 'search_workspace_contacts'],
    capability_gap: null,
    stage: null,
    requires: [],
    markers: [
      'trouver des contacts',
      'trouve-moi des contacts',
      'trouve moi des contacts',
      'qui contacter chez',
      'les contacts de',
      'par qui je commence',
      'qui connait-on chez',
      'quel contact chez',
      'find contacts',
      'who to contact at',
      'contacts at',
      'who do i start with',
      'who do we know at',
    ],
  },
  // #3175.3 (épopée #3215) — RECONNUE, non servie : aucun outil de chat ne
  // relance une analyse existante — `refresh_account` est un écran (LAU-059),
  // jamais un outil `/chat`. Servir ce point demanderait de câbler cet écran
  // comme outil de chat, ce que ce lot ne fait pas.
  actualiser: {
    canonical_object: 'account',
    expected_result: 'information_actualisee',
    tools: [],
    capability_gap: 'relance_dune_analyse_existante_depuis_le_chat',
    stage: null,
    requires: ['compte_actif'],
    markers: [
      'actualiser ce compte',
      'actualiser les informations',
      'remettre a jour ce compte',
      'rafraichir ce compte',
      'les infos sont-elles a jour',
      'est-ce a jour',
      'update this account',
      'refresh this account',
      'is this information up to date',
      'is this information current',
    ],
  },
  // #3175.3 (épopée #3215) — servie : `resolve_account_territory` existe déjà.
  choisir_perimetre: {
    canonical_object: 'account',
    expected_result: 'perimetre_recommande',
    tools: ['resolve_account_territory'],
    capability_gap: null,
    stage: null,
    requires: ['compte_actif'],
    markers: [
      'quel perimetre',
      'quel est le bon perimetre chez',
      'par ou attaquer',
      'faut-il viser le groupe ou une filiale',
      'quelle filiale viser',
      'groupe ou filiale',
      'which perimeter',
      'which scope to target',
      'which subsidiary should i target',
      'group or subsidiary',
    ],
  },
  // #3175.3 (lot E1 30/09) — servie : intérêt × pénétrabilité + alternatives.
  challenger_un_compte: {
    canonical_object: 'account',
    expected_result: 'compte_challenge',
    tools: ['get_account_interest_penetrability', 'suggest_account_alternatives'],
    capability_gap: null,
    stage: null,
    requires: ['compte_actif'],
    markers: [
      'challenge ce compte',
      'challenger ce compte',
      'challenge cette cible',
      'challenger cette cible',
      'remets en question ce compte',
      'est-ce le bon compte',
      'est ce le bon compte',
      'est-ce que ce compte vaut',
      'avocat du diable sur ce compte',
      'challenge this account',
      'challenge this target',
      'is this the right account',
      "devil's advocate on this account",
      'devils advocate on this account',
    ],
  },
  // #3175.3 (lot E1 30/09) — servie : carte de couverture + ESN observées.
  comprendre_ecosysteme: {
    canonical_object: 'account',
    expected_result: 'ecosysteme_du_compte',
    tools: ['get_account_coverage_map', 'get_esn_on_account'],
    capability_gap: null,
    stage: null,
    requires: ['compte_actif'],
    markers: [
      'ecosysteme de ce compte',
      'ecosysteme autour de',
      "comprendre l'ecosysteme",
      'comprendre l ecosysteme',
      'qui gravite autour de',
      "cartographie de l'ecosysteme",
      'ecosystem around',
      'understand the ecosystem',
      'map the ecosystem',
      'who orbits around',
    ],
  },
}

/**
 * #2321.22 — LE NO-GO EXPLICITE DU TICKET.
 *
 * « À qui vendre ce consultant ? » n'est PAS un matching : c'est un Reverse
 * Market — la liste des comptes où positionner ce profil. Le piège est réel : la
 * phrase porte souvent aussi « proposer » ou « shortlist », et un routeur qui
 * compte les marqueurs partirait sur `run_matching`. Ces marqueurs-ci
 * COURT-CIRCUITENT le comptage.
 *
 * La cible existe déjà comme option catalogée de `propose_guided_action`
 * (route `/consultants/:id/reverse-market`) ; ce qui manquait, c'est la règle
 * qui y ENVOIE.
 */
const REVERSE_MARKET_MARKERS = [
  'a qui vendre',
  'a qui proposer ce consultant',
  'a qui le vendre',
  'sur quels comptes positionner',
  'quels comptes pour ce consultant',
  'who should i sell this consultant',
  'who to sell this consultant',
  'which accounts for this consultant',
  'where to place this consultant',
] as const

/**
 * Ce qui n'est pas de notre ressort, et qu'on ne fait donc PAS semblant de
 * router. `hors_perimetre` existe déjà comme catégorie ; elle n'avait aucun
 * producteur déterministe.
 *
 * Le seul cas que la doctrine tranche noir sur blanc : **BellumAI SUIT le
 * financier, il ne COMPTABILISE pas** (Louis 18/09/2026, #2564). Plan comptable,
 * écritures, journal : NON.
 */
const OUT_OF_SCOPE_MARKERS = [
  'plan comptable',
  'ecriture comptable',
  'ecritures comptables',
  'journal comptable',
  'bilan comptable',
  'chart of accounts',
  'accounting entry',
  'general ledger',
] as const

/**
 * #2321.19 — les marqueurs de l'étape FINALE. Ils ne sont l'intention de
 * personne : ils n'ajoutent qu'une étape au job. C'est ce qui rend le saut
 * d'étape inexprimable — demander le mail ne retire pas ce qui le précède.
 */
const MESSAGE_STAGE_MARKERS = [
  'envoie un mail',
  'envoyer un mail',
  'envoie un email',
  'un mail au client',
  'ecrire au client',
  'prepare le message',
  'send an email',
  'send a mail',
  'write to the client',
  'prepare the message',
] as const

/**
 * #2257.35 — les marqueurs DÉCLARÉS d'un travail FACULTATIF : utile, mais pas
 * nécessaire au résultat demandé. Miroir de `CHAT_INTENT_OPTIONAL_MARKERS`
 * côté Python. Posé par règle sur un marqueur écrit, jamais deviné.
 */
export const CHAT_INTENT_OPTIONAL_MARKERS = [
  'accessoirement',
  'en option',
  'facultatif',
  'optionnel',
  'si tu as le temps',
  'si possible',
  'si ca ne te prend pas trop de temps',
  'en bonus',
  'optionally',
  'optional',
  'if you have time',
  'if possible',
  'as a bonus',
  'nice to have',
] as const

// ── La route ─────────────────────────────────────────────────────────────────

/**
 * Les champs d'une route. Miroir exact de `CHAT_INTENT_ROUTE_FIELDS`
 * côté Python — un champ ajouté d'un seul côté fait échouer la garde de parité.
 */
export const CHAT_INTENT_ROUTE_FIELDS = [
  'intent',
  'confidence',
  'canonical_object',
  'expected_result',
  'starting_point',
  'known_inputs',
  'missing_inputs',
  'tools',
  'capability_gap',
  'steps',
  'produces_now',
  'awaits_validation',
  'awaits_human',
  'unrouted_category',
  'reasoning',
  // #2257.35 — les travaux facultatifs.
  'optional_steps',
  'optional_reason',
] as const

export const chatIntentRouteSchema = z.object({
  /** L'intention retenue, ou {@link UNDECLARED_CHAT_INTENT} — qui attend. */
  intent: chatIntentSchema,
  /** `certaine` ou `hypothese` — jamais un nombre. */
  confidence: chatIntentConfidenceSchema,
  /** #2321.13 — l'objet canonique concerné. `null` quand la demande n'en vise aucun. */
  canonical_object: z.enum(CHAT_INTENT_OBJECT_KINDS).nullable(),
  /** #2321.12 — le résultat attendu, dans un vocabulaire fermé. */
  expected_result: z.enum(CHAT_INTENT_RESULT_KINDS).nullable(),
  /** #2321.11 — le point de départ : le compte ACTIF, déjà résolu par l'appelant. */
  starting_point: z.string().nullable(),
  /** #2321.14 — ce que la demande exige ET que l'appelant a déjà. */
  known_inputs: z.array(z.enum(CHAT_INTENT_INPUT_KINDS)),
  /** #2321.14 — ce que la demande exige et qui manque. Nommé, jamais deviné. */
  missing_inputs: z.array(z.enum(CHAT_INTENT_INPUT_KINDS)),
  /** Les outils de chat réellement disponibles pour cette intention. */
  tools: z.array(z.string()),
  /** Ce qui manque encore à cette intention. `null` = rien ne manque. */
  capability_gap: z.string().nullable(),
  /** #2321.18 — le job séquencé : une TRANCHE CONTIGUË du pipeline. */
  steps: z.array(z.enum(CHAT_INTENT_PIPELINE)),
  /** #2321.15 — ce qui peut être produit tout de suite. */
  produces_now: z.array(z.enum(CHAT_INTENT_PIPELINE)),
  /** #2321.16 — ce qui attend une validation humaine. */
  awaits_validation: z.array(z.enum(CHAT_INTENT_PIPELINE)),
  /**
   * Vrai dès que quoi que ce soit attend un humain : demande non routée,
   * capacité absente, ou étape qui demande une validation. C'est LE champ que
   * lit un appelant qui veut savoir s'il a le droit d'agir seul.
   */
  awaits_human: z.boolean(),
  /**
   * La catégorie de non-routage, quand il y en a une — le vocabulaire EXISTANT
   * de `laura_unrouted_intents`, jamais un quatrième mot.
   */
  unrouted_category: z.enum(UNROUTED_INTENT_CATEGORIES).nullable(),
  /**
   * Le MARQUEUR DÉCLARÉ qui a déclenché la route.
   *
   * ⚠️ Jamais le texte de l'utilisateur : toujours une valeur de la table
   * ci-dessus. C'est ce qui rend le motif affichable ET journalisable sans
   * exposer le contenu d'un message (même règle que
   * `requestIntentContractForLog`).
   */
  reasoning: z.string().nullable(),
  /**
   * #2257.35 — sous-ensemble de `steps` : le travail utile mais non nécessaire
   * au résultat demandé. Jamais lancé sans geste de la personne (absent de
   * `produces_now`), ne bloque jamais le résultat principal (absent de
   * `awaits_validation` et de `awaits_human`).
   */
  optional_steps: z.array(z.enum(CHAT_INTENT_PIPELINE)),
  /** #2257.35 — le marqueur DÉCLARÉ qui a posé `optional_steps`. `null` = rien de facultatif. */
  optional_reason: z.string().nullable(),
})
export type ChatIntentRoute = z.infer<typeof chatIntentRouteSchema>

// ── La normalisation ─────────────────────────────────────────────────────────

/**
 * Minuscules, accents retirés, apostrophes typographiques ramenées à l'apostrophe
 * droite, espaces tassés. Sans ça, « C'EST SIGNÉ » et « c'est signe » seraient
 * deux demandes différentes — et la seconde seule serait routée.
 */
function normalize(message: string): string {
  return (message ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ⚠️ Un marqueur se lit sur des FRONTIÈRES DE MOT, jamais en simple sous-chaîne.
 *
 * Le défaut a été mesuré le 22/09/2026 en regardant le bloc rendu : « j'ai un
 * retour du client sur la CANDIDATURE » déclenchait le marqueur `candidat` de
 * l'intention « profil », qui ajoutait une étape « trouver les profils » à une
 * demande qui n'en parlait pas. Une sous-chaîne attrape ce qu'elle ne vise pas
 * — c'est la même faute qu'une garde qui lit la prose et accuse le bien.
 */
function matchedMarkers(haystack: string, markers: readonly string[]): string[] {
  return markers.filter(marker => {
    const needle = normalize(marker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![a-z0-9])${needle}(?![a-z0-9])`).test(haystack)
  })
}

// ── Le routeur ───────────────────────────────────────────────────────────────

/**
 * Route UNE demande. Pure, déterministe, sans réseau et sans modèle.
 *
 * @param message               le texte de la demande. Il ne sort jamais de
 *                              cette fonction : seule une route en sort.
 * @param activeAccountCompanyName  le compte ACTIF, déjà résolu par l'appelant
 *                              (#2321.11). Jamais extrait du message.
 * @param availableInputs       les données que l'appelant a DÉJÀ (#2321.14).
 *                              Jamais devinées du message.
 */
export function routeChatIntent(input: {
  message: string
  activeAccountCompanyName?: string | null
  availableInputs?: readonly ChatIntentInputKind[]
}): ChatIntentRoute {
  const text = normalize(input.message)
  const startingPoint = input.activeAccountCompanyName ?? null
  const available = input.availableInputs ?? []

  // 1. Hors périmètre d'abord : ce qu'on ne fait pas, on ne le route pas, même
  //    si la phrase porte par ailleurs un marqueur reconnu.
  const outOfScope = matchedMarkers(text, OUT_OF_SCOPE_MARKERS)
  if (outOfScope.length > 0) {
    return undeclaredRoute({ startingPoint, category: 'hors_perimetre', reasoning: outOfScope[0]! })
  }

  // 2. #2321.22 — le NO-GO court-circuite le comptage : « à qui vendre ce
  //    consultant » ne doit JAMAIS finir en simple matching.
  const reverseMarket = matchedMarkers(text, REVERSE_MARKET_MARKERS)
  if (reverseMarket.length > 0) {
    return buildRoute({
      intent: 'profil',
      entry: {
        ...CHAT_INTENT_ROUTING_TABLE.profil,
        expected_result: 'marche_inverse',
        // La cible existe déjà comme option catalogée de cet outil.
        tools: ['propose_guided_action'],
        capability_gap: null,
      },
      reasoning: reverseMarket[0]!,
      confidence: 'certaine',
      stages: ['trouver_les_profils'],
      startingPoint,
      available,
    })
  }

  // 3. Le comptage des marqueurs déclarés, intention par intention.
  const scored = CHAT_INTENT_KINDS.map(kind => ({
    kind,
    hits: matchedMarkers(text, CHAT_INTENT_ROUTING_TABLE[kind].markers),
  })).filter(entry => entry.hits.length > 0)

  if (scored.length === 0) {
    // Le défaut qui ATTEND. `certaine` parce que l'ABSENCE de marqueur est un
    // fait mesuré, pas une supposition — on est certain de ne pas savoir.
    return undeclaredRoute({ startingPoint, category: 'intention_incomprise', reasoning: null })
  }

  const best = Math.max(...scored.map(entry => entry.hits.length))
  // Égalité : le premier dans l'ordre du ticket gagne, et la route le dit en
  // se déclarant `hypothese`. On PRODUIT un premier résultat plutôt que de
  // poser une question (#2321.20 / #2321.21).
  const winner = scored.find(entry => entry.hits.length === best)!

  // 4. #2321.18 / #2321.19 — le job séquencé. Toutes les étapes évoquées par la
  //    demande, plus celle du message si elle est demandée, ramenées à une
  //    TRANCHE CONTIGUË : rien ne peut être sauté.
  const stages = new Set<ChatIntentStepKind>()
  for (const entry of scored) {
    const stage = CHAT_INTENT_ROUTING_TABLE[entry.kind].stage
    if (stage) stages.add(stage)
  }
  if (matchedMarkers(text, MESSAGE_STAGE_MARKERS).length > 0) stages.add('preparer_le_message')

  // #3856 (BEL-LAU-1008-005) — « une demande composée conserve tous ses
  // livrables » : les outils des intentions matchées MAIS NON gagnantes
  // s'ajoutent à la suite de ceux de la gagnante (dédupliqués, winner
  // d'abord) — jumeau Python de `intent_router.py`.
  const extraTools = scored
    .filter(entry => entry.kind !== winner.kind)
    .flatMap(entry => CHAT_INTENT_ROUTING_TABLE[entry.kind].tools)

  return buildRoute({
    intent: winner.kind,
    entry: CHAT_INTENT_ROUTING_TABLE[winner.kind],
    reasoning: winner.hits[0]!,
    confidence: best >= 2 ? 'certaine' : 'hypothese',
    stages: [...stages],
    startingPoint,
    available,
    extraTools,
    optionalMarker: matchedMarkers(text, CHAT_INTENT_OPTIONAL_MARKERS)[0] ?? null,
  })
}

function undeclaredRoute(args: {
  startingPoint: string | null
  category: UnroutedIntentCategory
  reasoning: string | null
}): ChatIntentRoute {
  return {
    intent: UNDECLARED_CHAT_INTENT,
    confidence: 'certaine',
    canonical_object: null,
    expected_result: null,
    starting_point: args.startingPoint,
    known_inputs: [],
    missing_inputs: [],
    tools: [],
    capability_gap: null,
    steps: [],
    produces_now: [],
    awaits_validation: [],
    // Un intent non déclaré ATTEND — jumeau d'`UNDECLARED_INTENT_SITE`.
    awaits_human: true,
    unrouted_category: args.category,
    reasoning: args.reasoning,
    optional_steps: [],
    optional_reason: null,
  }
}

function buildRoute(args: {
  intent: ChatIntentKind
  entry: ChatIntentRoutingEntry
  reasoning: string
  confidence: 'certaine' | 'hypothese'
  stages: readonly ChatIntentStepKind[]
  startingPoint: string | null
  available: readonly ChatIntentInputKind[]
  extraTools?: readonly string[]
  optionalMarker?: string | null
}): ChatIntentRoute {
  const { entry } = args

  // La tranche contiguë : du premier au dernier rang évoqué, sans trou.
  const ranks = args.stages.map(stage => CHAT_INTENT_PIPELINE.indexOf(stage)).filter(rank => rank >= 0)
  const steps: ChatIntentStepKind[] =
    ranks.length === 0 ? [] : CHAT_INTENT_PIPELINE.slice(Math.min(...ranks), Math.max(...ranks) + 1)

  // #3856 — winner d'abord, puis les outils des autres intentions matchées
  // (`extraTools`), jamais en double.
  const tools = [...entry.tools, ...(args.extraTools ?? []).filter(tool => !entry.tools.includes(tool))]

  // #2257.35 — l'étape la plus en AVAL est facultative quand un marqueur déclaré le
  // dit ET qu'elle n'est pas celle du résultat demandé (`entry.stage`) ET qu'une
  // étape nécessaire la précède : le résultat demandé n'est jamais facultatif.
  const lastStep = steps[steps.length - 1]
  const optionalSteps: ChatIntentStepKind[] =
    args.optionalMarker && steps.length > 1 && lastStep !== entry.stage ? [lastStep!] : []

  const awaiting = new Set<string>(CHAT_INTENT_STEPS_AWAITING_VALIDATION)
  const awaitsValidation = steps.filter(step => awaiting.has(step) && !optionalSteps.includes(step))
  // Sans outil, la route ne prétend RIEN produire — elle nomme son manque.
  const producesNow =
    tools.length === 0 ? [] : steps.filter(step => !awaiting.has(step) && !optionalSteps.includes(step))

  const knownInputs = entry.requires.filter(kind => args.available.includes(kind))
  const missingInputs = entry.requires.filter(kind => !args.available.includes(kind))

  return {
    intent: args.intent,
    confidence: args.confidence,
    canonical_object: entry.canonical_object,
    expected_result: entry.expected_result,
    starting_point: args.startingPoint,
    known_inputs: knownInputs,
    missing_inputs: missingInputs,
    tools,
    capability_gap: entry.capability_gap,
    steps,
    produces_now: producesNow,
    awaits_validation: awaitsValidation,
    awaits_human: tools.length === 0 || awaitsValidation.length > 0,
    // Intention reconnue mais aucun outil pour la servir : c'est exactement
    // `capacite_absente`, la catégorie qui existe déjà et qui a un écran.
    unrouted_category: tools.length === 0 ? 'capacite_absente' : null,
    reasoning: args.reasoning,
    optional_steps: optionalSteps,
    optional_reason: optionalSteps.length > 0 ? (args.optionalMarker ?? null) : null,
  }
}

/**
 * La vue JOURNALISABLE d'une route — SANS CONTENU, comme
 * `requestIntentContractForLog`. Le `reasoning` est un marqueur DÉCLARÉ, donc il
 * peut sortir tel quel ; le point de départ, lui, porte un nom de compte et
 * n'est réduit qu'à sa présence.
 */
export function chatIntentRouteForLog(route: ChatIntentRoute): Record<string, string | boolean | number> {
  return {
    intent: route.intent,
    confidence: route.confidence,
    expected_result: route.expected_result ?? 'aucun',
    canonical_object: route.canonical_object ?? 'aucun',
    capability_gap: route.capability_gap ?? 'aucun',
    unrouted_category: route.unrouted_category ?? 'aucune',
    matched_marker: route.reasoning ?? 'aucun',
    has_starting_point: route.starting_point !== null,
    awaits_human: route.awaits_human,
    steps_count: route.steps.length,
    optional_steps_count: route.optional_steps.length,
    missing_inputs_count: route.missing_inputs.length,
  }
}
