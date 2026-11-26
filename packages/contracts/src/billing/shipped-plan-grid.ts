/**
 * LA grille tarifaire embarquée — une seule fois, pour tout le monde.
 *
 * Elle existait en trois exemplaires : les défauts serveur du catalogue
 * (`apps/api/.../plan-catalog.defaults.ts`), le miroir de l'écran Facturation
 * (`apps/web/src/lib/plans.ts`) et les chaînes des cartes du site
 * (`apps/website/messages/<locale>/pricing.json`). Trois copies d'un même
 * chiffre, c'est trois occasions de se contredire — et la contradiction se
 * découvre chez le prospect : la carte annonce un prix, Stripe en prélève un
 * autre.
 *
 * Ce fichier est la source unique de ce que le CODE embarque. Il ne décide
 * rien en production : le catalogue éditable par l'opérateur
 * (`plan_definitions`, écran Offres du backoffice) reste prioritaire partout où
 * il répond. Ce qui est ici, c'est la valeur de repli — celle qui s'affiche
 * pendant que la requête catalogue est en vol, ou si elle échoue.
 *
 * Pour changer un prix ou un quota EN PRODUCTION : le backoffice, pas ce
 * fichier. Pour changer ce que le produit embarque par défaut : ici, et
 * seulement ici — les trois surfaces suivent (les deux premières par import,
 * le site par le test de parité `shipped-plan-grid.test.ts`).
 */

/** Codes de palier de la grille embarquée. */
export const SHIPPED_PLAN_CODES = ['trial', 'starter', 'team', 'growth', 'beta', 'decouverte'] as const

export type ShippedPlanCode = (typeof SHIPPED_PLAN_CODES)[number]

/** Une ligne de la grille embarquée. */
export type ShippedPlanRow = {
  /** Nom commercial affiché tant que le catalogue live n'a pas répondu. */
  label: string
  /** Prix mensuel en CENTIMES (convention Stripe). */
  priceCents: number
  /**
   * Crédits du cycle. MONNAIE UNIQUE (23/07) : un crédit = une action, quelle
   * qu'elle soit (analyse, enrichissement, besoin). C'est la colonne que le
   * serveur appelle encore `accounts_limit`.
   */
  creditsPerCycle: number
  /** Sièges inclus avant le siège supplémentaire payant. */
  seats: number
  /**
   * Prix mensuel en CENTIMES d'UN siège au-delà de `seats` — varie par palier
   * (un siège pioche dans les crédits communs, donc il coûte plus cher sur un
   * palier plus riche).
   *
   * **`0` veut dire : ce palier ne vend PAS de siège supplémentaire.** Ce n'est
   * pas « gratuit ». Depuis la grille du 27/08, Growth est un poste de travail
   * mono-utilisateur : une deuxième personne, c'est Entreprise, donc un devis.
   * Les écrans qui parlent de sièges doivent se taire quand cette valeur est à
   * zéro, plutôt qu'afficher « +0 €/siège » — qui inviterait à un achat qui
   * n'existe pas.
   */
  extraSeatPriceCents: number
  /** `true` = achetable en self-service dans la grille publique. */
  selfServe: boolean
  /**
   * Demandes à Laura sur 24 h GLISSANTES, par personne.
   *
   * Décision Louis 13/09 batch 13 — plafond selon le plan (contre la
   * recommandation, et elle défait la règle d'avant : un seul plafond pour tout
   * le monde). La valeur vit ICI, dans la grille des plans, et nulle part
   * ailleurs (GA-26) ; l'API la lit par `chatDailyLimitOfPlan`.
   *
   * #décision Louis 15/09/2026 : Growth passe à 100.
   *
   * ⚠️ #4016 L7 — décision Louis 11/10/2026 : **le plan fait foi.**
   * `CHAT_DAILY_MESSAGE_LIMIT` n'a plus de défaut : absent, il ne bride RIEN
   * (avant, son défaut 50 rendait les 100 de Growth inopérants). Posé, il reste
   * un plafond de SÉCURITÉ optionnel de l'opérateur (le minimum des deux,
   * `effectiveChatDailyLimit`). Une valeur illisible ici (non entière, ≤ 0)
   * n'est ni « zéro demande » ni « illimité » : l'API retombe sur le plafond
   * opérateur s'il est posé, sinon sur le plus BAS de cette grille.
   *
   * Les cinq autres paliers, « à fixer par Louis » et restés à 50 (la valeur
   * vraie d'avant), reçoivent le 11/10 des valeurs GÉNÉREUSES PROPOSÉES — 100
   * pour les paliers mono-utilisateur ou verrouillés (Essai, Starter,
   * Découverte), 300 pour les paliers d'équipe (Team, Bêta) — à confirmer par
   * Louis.
   */
  chatDailyMessageLimit: number
}

/**
 * Grille embarquée au 27/08/2026 — arbitrage tarifaire de Louis, tranché.
 *
 * **TROIS cartes, dont UN SEUL palier achetable** :
 *
 *   · **Free** — la démonstration publique. Pas un plan : aucun compte, aucun
 *     crédit, aucun enrichissement. Rien à provisionner, donc rien ici.
 *   · **Growth — 199 €**, 250 crédits, **un seul utilisateur**, aucun siège
 *     supplémentaire vendable (`extraSeatPriceCents: 0`). C'est le produit
 *     entier : toutes les fonctions sont ouvertes, le levier est le volume de
 *     crédits, pas une porte fermée.
 *   · **Entreprise** — sur devis, dès le deuxième utilisateur. Pas un palier
 *     self-service : c'est `team` côté code, provisionné à la main.
 *
 * Ce que cette grille REMPLACE : Starter 119 € / Growth 249 €, deux paliers
 * self-service avec des sièges à l'unité. Le pari est inverse — un prix, tout
 * ouvert, et la négociation commence à la deuxième personne.
 *
 * ⚠️ **`starter` n'est pas supprimé, il sort de la VENTE** (`selfServe: false`).
 * Un code de palier ne disparaît jamais : des lignes en base le portent, et
 * GA-08 l'interdit. Il reste donc lisible pour les espaces qui l'ont eu, il
 * n'est simplement plus proposé.
 *
 * Ne figurent PAS dans la grille publique : `starter`, `team` (Entreprise, sur
 * devis), `trial` (essai accordé à la main), `beta` (design-partners) et
 * `decouverte` (compte créé en self-service).
 */
export const SHIPPED_PLAN_GRID: Readonly<Record<ShippedPlanCode, ShippedPlanRow>> = {
  /**
   * `trial` — ÉTAT VERROUILLÉ, plus un essai (Louis, 02/09/2026).
   *
   * Il n'y a plus d'essai gratuit : on voit le produit dans la DÉMONSTRATION
   * publique, et on travaille avec une licence. Le code de palier survit parce
   * que des lignes en base le portent (GA-08 : un enum ne perd jamais de
   * valeur) et parce que la résiliation d'un abonnement s'y rabat déjà
   * (`customer.subscription.deleted` pose `plan: 'trial'`, quota 0). Son quota
   * passe donc à zéro : le nom dit « Essai », le comportement dit « aucun
   * accès », et c'est le comportement qui compte.
   */
  trial: {
    label: 'Essai',
    priceCents: 0,
    creditsPerCycle: 0,
    seats: 3,
    extraSeatPriceCents: 2900,
    selfServe: false,
    chatDailyMessageLimit: 100, // #4016 L7 (11/10/2026) — valeur GÉNÉREUSE proposée, à confirmer par Louis
  },
  /**
   * Starter — RETIRÉ DE LA VENTE le 27/08/2026, pas supprimé.
   *
   * Le prix et le quota restent ceux qu'ont payés les espaces qui l'ont
   * souscrit ; seul `selfServe` bascule. Effacer la ligne rendrait illisibles
   * les abonnements qui la portent encore.
   */
  starter: {
    label: 'Starter',
    priceCents: 11900,
    creditsPerCycle: 80,
    seats: 1,
    extraSeatPriceCents: 3900,
    selfServe: false,
    chatDailyMessageLimit: 100, // #4016 L7 (11/10/2026) — valeur GÉNÉREUSE proposée, à confirmer par Louis
  },
  /**
   * Team / Enterprise — **sur devis**, donc jamais dans la grille publique.
   *
   * Le palier existe encore (des espaces y sont provisionnés à la main) mais il
   * n'a plus de prix affiché : une équipe de 3 à 5 commerciaux négocie son
   * enveloppe de crédits, et publier un prix fixe interdirait la négociation
   * qu'on vient d'ouvrir. `selfServe: false` le sort des cartes achetables.
   */
  team: {
    label: 'Team / Enterprise',
    priceCents: 25900,
    creditsPerCycle: 600,
    seats: 3,
    extraSeatPriceCents: 5900,
    selfServe: false,
    chatDailyMessageLimit: 300, // #4016 L7 (11/10/2026) — valeur GÉNÉREUSE proposée, à confirmer par Louis
  },
  /**
   * Growth — LE palier achetable. 199 €, 250 crédits, UN utilisateur.
   *
   * Le quota ne bouge pas en passant de 249 € à 199 € : même produit, moins
   * cher. `extraSeatPriceCents: 0` dit qu'aucun siège ne s'achète ici — la
   * deuxième personne passe par Entreprise.
   */
  growth: {
    label: 'Growth',
    priceCents: 19900,
    creditsPerCycle: 250,
    seats: 1,
    extraSeatPriceCents: 0,
    selfServe: true,
    chatDailyMessageLimit: 100, // #décision Louis 15/09/2026 — Growth à 100 (désormais effectif : #4016 L7)
  },
  // Bêta Design Partner (§11) : 119 € HT par licence et par mois, trois mois,
  // toutes les fonctions utiles ouvertes. Jamais sur l'écran public — l'offre se
  // pose à la main depuis le back-office, qui ajuste aussi les quotas au cas par
  // cas. Le volume par défaut vaut celui de Team : un partenaire de conception
  // doit pouvoir travailler ses comptes sans compter.
  beta: {
    label: 'Bêta Design Partner',
    priceCents: 11900,
    creditsPerCycle: 600,
    seats: 3,
    extraSeatPriceCents: 2900,
    selfServe: false,
    chatDailyMessageLimit: 300, // #4016 L7 (11/10/2026) — valeur GÉNÉREUSE proposée, à confirmer par Louis
  },
  decouverte: {
    label: 'Découverte',
    priceCents: 0,
    /**
     * ZÉRO crédit depuis le 02/09/2026 — c'était le dernier essai gratuit, et
     * il ne disait pas son nom.
     *
     * L'écran d'onboarding annonce « plus d'entrée gratuite » depuis le 24/07
     * (elle ne se vendait pas : présenter une fenêtre gratuite à côté d'un
     * abonnement poussait tout le monde vers la fenêtre). Le trigger de signup,
     * lui, continuait de poser 48 crédits — six dossiers réels — sur chaque
     * compte créé en self-service. Deux discours, et c'est le silencieux qui
     * gagnait.
     *
     * Ce que voit désormais un compte neuf : l'écran de choix de licence. Ce
     * qu'il peut essayer : la salle de démonstration, sans compte.
     */
    creditsPerCycle: 0,
    seats: 1,
    extraSeatPriceCents: 2900,
    selfServe: false,
    chatDailyMessageLimit: 100, // #4016 L7 (11/10/2026) — valeur GÉNÉREUSE proposée, à confirmer par Louis
  },
}

/**
 * Les paliers de la grille PUBLIQUE, dans l'ordre des cartes (site + app).
 *
 * Un SEUL depuis le 27/08. Les deux autres cartes de la page tarifs — Free et
 * Entreprise — ne sont pas des paliers : l'une est la démonstration, l'autre un
 * devis. Elles ne doivent JAMAIS être jointes à ce tableau par position ; c'est
 * exactement le défaut qui a fait afficher « Free 119 € » en production.
 */
export const PUBLIC_PLAN_ORDER = ['growth'] as const satisfies readonly ShippedPlanCode[]
