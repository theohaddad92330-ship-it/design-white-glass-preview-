/**
 * Le delta de méthode commerciale, et le manifeste qui dit quoi en faire.
 *
 * ## Le défaut que ce fichier ferme
 *
 * Le paquet de récupération porte un `rag_ingestion_manifest.json` : six
 * entrées typées disant, fichier par fichier, ce qui peut entrer dans la base de
 * connaissance et ce qui n'en relève pas. Le tracker de ce chantier a écrit
 * « aucun manifeste d'ingestion RAG » et a différé le sujet — c'était FAUX, le
 * manifeste était dans le paquet depuis le premier jour, et personne ne l'avait
 * ouvert. La passe inverse du certificat d'épuisement l'a trouvé.
 *
 * ## Ce que le manifeste dit, et pourquoi ça compte
 *
 * Quatre de ses six entrées portent `notRag: true` — ce sont des SPÉCIFICATIONS
 * (graine de classifieur, contrat de workflow, jeu d'évaluation), pas de la
 * connaissance à retrouver par similarité. Les ingérer ferait remonter un
 * fichier de configuration comme réponse à une question commerciale.
 *
 * Une seule entrée est de la vraie connaissance : le delta de méthode
 * ci-dessous, à dédupliquer contre le pack de connaissance existant.
 *
 * ## Pourquoi ces règles vivent en CODE et pas dans le magasin
 *
 * Elles décrivent une DISCIPLINE, pas un fait sur un compte. Une règle de
 * méthode retrouvée par similarité arriverait au hasard des mots de la question ;
 * en code, elle est citable, testable, et le prompt peut la porter en entier.
 * C'est le même arbitrage que le catalogue des workflows et celui des routines.
 */

/** Ce que le paquet autorise à ingérer, et sous quel type. */
export type IngestionEntry = {
  readonly file: string
  readonly type:
    | 'retrieval_knowledge'
    | 'classifier_seed'
    | 'template_metadata'
    | 'template_library'
    | 'workflow_spec'
    | 'eval_spec'
  /** `true` ⇒ ce fichier n'a RIEN à faire dans la base de connaissance. */
  readonly notRag: boolean
  /** Ce contre quoi dédupliquer avant d'ingérer, quand c'est de la connaissance. */
  readonly dedupeAgainst?: string
}

export const RAG_INGESTION_MANIFEST: readonly IngestionEntry[] = [
  {
    file: 'commercial_method_delta.md',
    type: 'retrieval_knowledge',
    notRag: false,
    dedupeAgainst: 'knowledge-pack-v2',
  },
  { file: 'title_taxonomy_seed.json', type: 'classifier_seed', notRag: true },
  { file: 'outreach_scenario_registry.json', type: 'template_metadata', notRag: true },
  { file: 'meeting_question_library.json', type: 'template_library', notRag: false },
  { file: 'workflow_catalog_delta.json', type: 'workflow_spec', notRag: true },
  { file: 'golden_set_candidates.json', type: 'eval_spec', notRag: true },
]

/**
 * Ce qui ne doit JAMAIS être ingéré, en toutes lettres.
 *
 * La première ligne est la plus coûteuse : l'export CRM brut, 17 387 contacts
 * avec leurs coordonnées. Le mettre dans un magasin vectoriel le rendrait
 * retrouvable par n'importe quelle question, indéfiniment, sans qu'aucun des
 * intéressés l'ait su.
 */
export const RAG_INGESTION_EXCLUDED: readonly string[] = [
  'export CRM brut',
  'doublon DATAFORGE V4',
  'anciens prompts',
  'données de compte propres à un client',
  "images d'inspiration de design",
  'ancienne grille tarifaire',
  "listes d'outils propres à un fournisseur",
]

/**
 * Les onze règles de méthode conservées, chacune sous son identifiant.
 *
 * Elles sont ÉCRITES ici et non paraphrasées : une règle reformulée à chaque
 * usage devient dix règles voisines, et plus personne ne sait laquelle fait foi.
 *
 * ## Pourquoi un identifiant, et pas seulement l'énoncé
 *
 * Ces règles sont maintenant PORTÉES par le copilote : `apps/ia/app/knowledge/
 * method_rules.py` les recopie côté Python pour en faire la quatrième source du
 * corpus citable. Une valeur recopiée à la main dans deux langages diverge
 * toujours ; ce qui l'empêche est `method-delta.parity.test.ts`, qui lit le
 * fichier Python et compare des ENSEMBLES D'IDENTIFIANTS. Comparer des chaînes
 * libres cherchées au mot ferait une garde borgne — elle trouverait les
 * commentaires.
 *
 * L'identifiant est donc le nom stable de la règle ; l'énoncé est son texte.
 */
export const METHOD_RULES: readonly { readonly id: string; readonly statement: string }[] = [
  {
    id: 'plan_de_compte_hebdomadaire',
    statement: 'Le plan de compte est une discipline hebdomadaire, pas un document figé.',
  },
  {
    id: 'haut_et_bas_en_parallele',
    statement: 'Le haut et le bas de l’organisation se travaillent en parallèle, jamais l’un après l’autre.',
  },
  {
    id: 'fil_achats_distinct_du_fil_metier',
    statement: 'Le fil achats est distinct du fil métier.',
  },
  {
    id: 'action_avec_proprietaire_date_resultat',
    statement: 'Chaque action a un propriétaire, une date, un résultat attendu et un point de contrôle.',
  },
  {
    id: 'couverture_multi_roles_niveaux_entites',
    statement: 'Une couverture de compte traverse plusieurs rôles, plusieurs niveaux et plusieurs entités.',
  },
  {
    id: 'consultant_capteur_avec_consentement',
    statement:
      'Un consultant en mission peut devenir capteur de signaux ou source d’introduction — avec son consentement et une trace.',
  },
  {
    id: 'objection_validee_puis_exploree',
    statement: 'Une objection se valide d’abord, puis s’explore par une question.',
  },
  {
    id: 'objection_contextuelle_et_sortie_respectee',
    statement:
      'La réponse à une objection s’appuie sur le contexte réel, répond à sa vraie raison, propose une étape proportionnée et accepte une sortie ferme.',
  },
  {
    id: 'ouverture_construit_une_conversation',
    statement: 'Un message d’ouverture construit une conversation ; il ne déroule pas l’offre.',
  },
  {
    id: 'non_resultat_est_un_resultat',
    statement: 'Le NON-résultat d’une action est un résultat exploitable.',
  },
  {
    id: 'quotas_historiques_sont_des_exemples',
    statement: 'Les quotas historiques sont des exemples, jamais des valeurs de produit.',
  },
]

/**
 * Les sept règles explicitement NON reprises.
 *
 * Elles sont écrites au même endroit que celles qu'on garde, et c'est
 * délibéré : un refus rangé ailleurs se perd, puis quelqu'un le réintroduit de
 * bonne foi six mois plus tard en croyant combler un manque.
 */
export const METHOD_REFUSALS: readonly { readonly id: string; readonly statement: string }[] = [
  {
    id: 'nombres_fixes_de_volumes',
    statement: 'Des nombres fixes de contacts, de messages, d’appels ou de jours.',
  },
  {
    id: 'ciblage_informatique_par_defaut',
    statement: 'Un ciblage informatique par défaut.',
  },
  {
    id: 'gabarits_recopies_mot_pour_mot',
    statement: 'Des gabarits de message recopiés mot pour mot.',
  },
  {
    id: 'promesses_de_delai_sans_engagement',
    statement: 'Des promesses de délai qui n’engagent personne.',
  },
  {
    id: 'automatisation_du_reseau_professionnel',
    statement: 'Toute automatisation du réseau professionnel.',
  },
  {
    id: 'nom_de_fournisseur_technique_dans_l_app',
    statement: 'Le nom d’un fournisseur technique dans l’application.',
  },
  {
    id: 'anciennes_statistiques_comme_reperes',
    statement: 'D’anciennes statistiques présentées comme des repères Bellum.',
  },
]

/**
 * Les énoncés seuls — DÉRIVÉS, jamais recopiés.
 *
 * Ces deux listes existaient avant les identifiants et restent l'API publique.
 * Les dériver plutôt que de les maintenir à côté est la même loi que partout
 * ailleurs : un réglage vit à un seul endroit, et deux listes qui disent la même
 * chose divergent au premier ajout.
 */
export const METHOD_RULES_KEPT: readonly string[] = METHOD_RULES.map(rule => rule.statement)

export const METHOD_RULES_REFUSED: readonly string[] = METHOD_REFUSALS.map(rule => rule.statement)

/** Ce fichier du paquet peut-il entrer dans la base de connaissance ? */
export function mayBeIngested(file: string): boolean {
  const entry = RAG_INGESTION_MANIFEST.find(item => item.file === file)
  // Un fichier ABSENT du manifeste n'est pas ingérable : le manifeste est une
  // liste d'autorisations, pas une liste d'interdictions. Le lire dans l'autre
  // sens ferait entrer tout ce que personne n'a pensé à exclure.
  return entry ? !entry.notRag : false
}
