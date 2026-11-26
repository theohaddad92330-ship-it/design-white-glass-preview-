/**
 * Les trois rôles du back-office et ce que chacun a le droit de faire (#1669).
 *
 * POURQUOI TROIS RÔLES
 * « Trois personnes n'ont pas les mêmes besoins » : le propriétaire (offres,
 * facturation, suppression), l'opérateur (le quotidien du support) et le
 * lecteur (un associé, un investisseur, un stagiaire — aucune action).
 *
 * ⚠️ LE RÔLE VIT DANS `DM_ALLOWED_EMAILS`, PAS DANS UNE DEUXIÈME VARIABLE
 * `DM_ALLOWED_EMAILS="theo@x:owner,louis@x:operator,stagiaire@x:viewer"`.
 * Un réglage vit à un seul endroit (GA-26) : deux listes qui divergent
 * donneraient une adresse autorisée sans rôle, ou un rôle sans autorisation, et
 * personne ne saurait laquelle des deux fait foi.
 *
 * ⚠️ LE RÔLE SE RELIT À CHAQUE REQUÊTE, JAMAIS DEPUIS LE COOKIE
 * Le cookie de session ne porte que l'e-mail. Rétrograder quelqu'un prend donc
 * effet au déploiement suivant, sans attendre qu'il se déconnecte — un rôle
 * recopié dans un jeton signé survivrait huit heures à la décision de le
 * retirer.
 *
 * ⚠️ ABSENTE ≠ VIDE — c'est la distinction qui rend ce lot livrable sans risque.
 * Variable ABSENTE : la couche d'identité est inerte, le chemin est
 * byte-identique à celui d'avant (Basic Auth seul). Variable POSÉE mais ne
 * donnant aucune adresse : 503, parce qu'une configuration écrite qui ne dit
 * rien est une erreur, pas un mode (#1668, T4).
 */

export type Role = 'owner' | 'operator' | 'viewer'

/** L'ordre de force. `viewer` ne peut rien de ce que `operator` peut, etc. */
const RANG: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 }

/**
 * Ce qu'une route ou un écran EXIGE.
 *
 * Les neuf premières sont les lignes de la matrice de #1669, mot pour mot. Les
 * suivantes couvrent les routes que la matrice ne nomme pas : chacune a reçu le
 * plancher le plus étroit qui ne casse pas le geste, et la liste est commentée
 * dans l'issue pour qu'un désaccord se voie.
 */
export type Capability =
  // — Les lignes de la matrice —
  | 'impersonate' // Impersonate
  | 'credits.grant' // Créditer un espace
  | 'users.suspend' // Suspendre un utilisateur
  | 'users.delete' // Supprimer un utilisateur
  | 'offers.write' // Modifier une offre
  | 'invoices.write' // Générer une facture (= enregistrer celle de la compta)
  | 'treasury.read' // Voir la trésorerie
  | 'treasury.write' // Saisir un mois de trésorerie (#1649) — la matrice ne le nomme pas
  | 'audit.read' // Lire le journal d'audit
  // — Ce que la matrice ne nomme pas —
  | 'users.plan' // changer le palier d'un utilisateur (≠ modifier l'offre)
  | 'users.resetLink' // émettre un lien de réinitialisation
  | 'clients.provision' // créer un client
  // #2643.1 — l'envoi de l'e-mail d'activation du propriétaire est un GESTE
  // séparé de la création elle-même : la décision de Louis du 20/09/2026 est
  // justement que l'un ne déclenche jamais l'autre tout seul.
  | 'clients.owner_invitation.send' // envoyer/relancer l'e-mail d'activation
  | 'workspaces.write' // renommer un espace, ajouter/retirer un membre
  | 'banners.write' // écrire un bandeau produit
  | 'queues.write' // rejouer, retirer, purger un job BullMQ
  | 'analyses.run' // lancer une analyse depuis la console
  | 'analyses.stop' // arrêter une analyse en cours
  | 'feedback.read' // lire les commentaires d'un signalement
  | 'feedback.write' // commenter / fermer un signalement
  | 'email.reveal' // révéler une adresse masquée (#1670.4)
  | 'issue.report' // signaler un défaut DE LA CONSOLE
  // #1622 — le jeu de vérité terrain de la mémoire marché. Même paire que
  // 'feedback.read'/'feedback.write' : lire un jugement ou une métrique n'a
  // pas la même gravité que d'en écrire un.
  | 'ground_truth.read' // voir les jugements et les métriques
  | 'ground_truth.write' // juger un cas (un des six labels)
  // #2706 — les prospects du formulaire de démo. Même plancher que
  // 'feedback.read' : une lecture qui expose des PII de contact (e-mail,
  // téléphone), aucune action, aucun geste sur un client.
  | 'leads.read' // lire les prospects issus de la démo
  // #2445.12 (épopée #2766, lot SRC5 28/09 soir) — journaliser une action
  // prise ou une communication tenue sur un incident connecteur.
  | 'incidents.write' // journaliser une action / communication sur un incident
  // #2975 / #2440.82 (épopée #2975) — déclarer qu'une destination de routage
  // fournisseur a été réévaluée. Même plancher que 'queues.write' : un geste
  // opérateur routine, jamais réservé au propriétaire.
  | 'model_routing.write' // déclarer une destination de routage évaluée

/** Le rôle MINIMUM que chaque capacité exige. */
export const CAPACITES: Record<Capability, Role> = {
  // La matrice de #1669, ligne par ligne.
  impersonate: 'operator',
  'credits.grant': 'operator',
  'users.suspend': 'operator',
  'users.delete': 'owner',
  'offers.write': 'owner',
  'invoices.write': 'owner',
  'treasury.read': 'owner',
  // Saisir le solde bancaire de l'entreprise n'est pas moins sensible que le
  // lire : même plancher, sans discussion.
  'treasury.write': 'owner',
  'audit.read': 'operator',
  // Le reste : « aucune action » pour un viewer est la règle qui tranche.
  'users.plan': 'operator',
  'users.resetLink': 'operator',
  'clients.provision': 'operator',
  'clients.owner_invitation.send': 'operator',
  'workspaces.write': 'operator',
  'banners.write': 'operator',
  'queues.write': 'operator',
  'analyses.run': 'operator',
  'analyses.stop': 'operator',
  'feedback.read': 'viewer',
  'feedback.write': 'operator',
  'email.reveal': 'operator',
  // Signaler un défaut de la console n'est pas une action sur un client : un
  // lecteur qui voit un écran cassé doit pouvoir le dire.
  'issue.report': 'viewer',
  // Même plancher que 'feedback.read'/'feedback.write' : voir le jeu de
  // vérité terrain n'expose aucune donnée client, juger un cas est un geste
  // qui écrit — routine, comme 'queues.write'.
  'ground_truth.read': 'viewer',
  'ground_truth.write': 'operator',
  'leads.read': 'viewer',
  // Même plancher que 'queues.write'/'analyses.stop' : un geste opérateur
  // routine, jamais réservé au propriétaire.
  'incidents.write': 'operator',
  'model_routing.write': 'operator',
}

export function peut(role: Role, capacite: Capability): boolean {
  return RANG[role] >= RANG[CAPACITES[capacite]]
}

/**
 * Les écrans de TRÉSORERIE, fermés à tout ce qui n'est pas `owner`.
 *
 * Les quatre chemins sont le MÊME écran : `/couts`, `/offres` et `/usage`
 * redirigent vers `/facturation?view=…` depuis la consolidation précédente. La
 * porte est posée sur les quatre pour que le refus soit immédiat plutôt
 * qu'après un rebond — un refus qui arrive après une redirection se lit comme
 * un bug de navigation.
 *
 * ⚠️ Arbitrage de Louis du 07/09/2026, plus large que la matrice de #1669 :
 * elle dit « Lire un écran ✓✓✓ » et ne nomme que la trésorerie en exception.
 * Fermer `/offres` en LECTURE est sa décision, pas la demande de l'issue.
 *
 * ⚠️ `/revenus/tresorerie` (#1649) s'y ajoute le 07/09/2026, et c'est le seul
 * des cinq qui soit littéralement « la trésorerie » de la matrice : le solde
 * bancaire de l'entreprise, ses dépenses, son runway.
 *
 * ⚠️ `/revenus` ENTIER s'y ajoute le 07/09/2026 (#1651) — arbitrage de Louis,
 * confirmé le jour même. La note d'hier disait « on ne ferme pas d'avance un
 * écran qu'on n'a pas vu » : on l'a vu, c'est le chiffre d'affaires de la boîte,
 * il se ferme. Le préfixe couvre donc `/revenus` et `/revenus/tresorerie` d'un
 * seul geste — cette dernière reste listée à part parce que la raison de la
 * fermer n'est pas la même, et qu'une entrée qui disparaît emporte sa raison.
 */
export const ECRANS_PROPRIETAIRE = [
  '/facturation',
  '/couts',
  '/offres',
  '/usage',
  '/revenus',
  '/revenus/tresorerie',
  // 30/09/2026 (Louis, chantier supervision) : la charge de l'infra et de la base
  // de production. Le préfixe couvre `/supervision/*` ; même compromis que
  // /couts au rail (visible, la porte refuse l'entrée à l'opérateur).
  '/supervision',
] as const

/**
 * Ce qui reste OUVERT sous un préfixe fermé. L'exception gagne sur le préfixe.
 *
 * ⚠️ POURQUOI CETTE LISTE EXISTE, ET POURQUOI ELLE EST NOMMÉE
 * `estUnEcranProprietaire` compare un chemin à ses préfixes
 * (`startsWith('/revenus/')`). Fermer `/revenus` fermerait donc AUSSI
 * `/revenus/clients` — l'écran de support quotidien (#1652), celui qui remplace
 * `/clients` dans le rail, et que l'opérateur ouvre dix fois par jour. Il
 * n'expose pas le chiffre d'affaires de BellumAI : il expose les clients de
 * BellumAI, ce que l'opérateur a toujours eu le droit de voir. Le fermer serait
 * une régression d'accès silencieuse, arrivée par un effet de bord de préfixe et
 * pas par une décision.
 *
 * La liste est explicite plutôt qu'une comparaison exacte sur `/revenus`, parce
 * qu'une comparaison exacte serait un piège inverse : `/revenus/quoi-que-ce-soit`
 * s'ouvrirait tout seul le jour où quelqu'un ajoute un écran. Ici, chaque
 * ouverture est un geste écrit — et le jour où `/revenus/clients` deviendra
 * sensible, il suffira de retirer sa ligne.
 */
const OUVERTS_MALGRE_LE_PREFIXE = ['/revenus/clients'] as const

function couvertPar(bases: readonly string[], chemin: string): boolean {
  return bases.some(base => chemin === base || chemin.startsWith(`${base}/`))
}

export function estUnEcranProprietaire(chemin: string): boolean {
  // L'exception se lit EN PREMIER : la plus spécifique gagne, sinon le préfixe
  // `/revenus` l'avalerait avant qu'on ait pu la lire.
  if (couvertPar(OUVERTS_MALGRE_LE_PREFIXE, chemin)) return false
  return couvertPar(ECRANS_PROPRIETAIRE, chemin)
}

/**
 * L'état de la liste d'accès. Trois états, jamais deux — voir l'avertissement
 * « ABSENTE ≠ VIDE » en tête de fichier.
 */
export type ListeDacces = { etat: 'absente' } | { etat: 'vide' } | { etat: 'active'; roles: ReadonlyMap<string, Role> }

function estUnRole(valeur: string): valeur is Role {
  return valeur === 'owner' || valeur === 'operator' || valeur === 'viewer'
}

/** Normalise une adresse pour la comparaison : minuscules, sans espaces. */
export function normaliserEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Lit `DM_ALLOWED_EMAILS`.
 *
 * Une entrée sans suffixe `:role` vaut `operator` — décision de Louis du
 * 07/09/2026. Ni verrouillée dehors (ce que `viewer` ferait d'une faute de
 * frappe), ni en droit de supprimer un compte (ce que `owner` ferait).
 * Un suffixe ILLISIBLE (`louis@x:admin`) est traité comme absent : on ne devine
 * pas un rôle, et refuser toute la liste pour une faute fermerait la console.
 */
export function lireListeDacces(brut: string | undefined): ListeDacces {
  if (brut === undefined) return { etat: 'absente' }

  const roles = new Map<string, Role>()
  for (const entree of brut.split(',')) {
    const [emailBrut = '', roleBrut = ''] = entree.split(':')
    const email = normaliserEmail(emailBrut)
    if (!email.includes('@')) continue
    const role = roleBrut.trim().toLowerCase()
    roles.set(email, estUnRole(role) ? role : 'operator')
  }

  if (roles.size === 0) return { etat: 'vide' }
  return { etat: 'active', roles }
}

/**
 * Ce que l'écran de connexion doit RACONTER — trouvé en recette live le
 * 07/09/2026, pas par un test.
 *
 * `/login` affichait son formulaire et une alerte rouge « SUPABASE_URL manque »
 * sur un environnement où `DM_ALLOWED_EMAILS` n'est **pas posée**, c'est-à-dire
 * où la couche d'identité est éteinte À DESSEIN. Il annonçait une panne là où
 * il n'y avait qu'un interrupteur au repos — et une console qui crie au loup sur
 * son écran d'entrée est exactement ce qui fait ignorer la vraie alerte.
 *
 * Les trois états sont distincts et se DISENT :
 *  - `eteinte`        : rien à configurer, rien de cassé, le Basic Auth garde seul ;
 *  - `mal_configuree` : la liste est posée mais la vérification est impossible ;
 *  - `prete`          : on peut se connecter.
 */
type EtatConnexion = 'eteinte' | 'mal_configuree' | 'prete'

export function etatDeLaConnexion(etatListe: ListeDacces['etat'], manquantes: readonly string[]): EtatConnexion {
  // L'interrupteur d'abord : sans lui, ce qui manque « côté serveur » n'est pas
  // un défaut, c'est une couche qu'on n'a pas allumée.
  if (etatListe === 'absente') return 'eteinte'
  return manquantes.length > 0 ? 'mal_configuree' : 'prete'
}
