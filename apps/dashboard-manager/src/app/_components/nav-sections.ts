/**
 * Le rail à 6 sections du back-office (#1644).
 *
 * ⚠️ CE QUI A ÉTÉ TENU DE #1644, ET CE QUI NE POUVAIT PAS L'ÊTRE
 * L'issue liste sous chaque section des entrées qui n'existent PAS encore —
 * « Adoption / Usage / Rétention » (#1683, #1685, #1658), « Audit » (#1666).
 * « Trésorerie » a rejoint le rail le 07/09/2026 avec l'écran de #1649, et
 * « MRR » le même jour avec celui de #1651. « Adoption » (issue 1657.2 / issue
 * 1685) a rejoint « Produit » le 10/09/2026 — exactement comme annoncé ici. Les
 * afficher avant leur écran aurait produit un rail dont un tiers des liens mène
 * à un 404 : un lien mort apprend à l'opérateur à se méfier du rail entier.
 * Le rail porte donc les écrans QUI EXISTENT, rangés dans les six sections que
 * l'issue nomme. Chaque nouvelle route du palier prendra sa place ici.
 *
 * ⚠️ AUCUNE ROUTE NE BOUGE. #1644 demande que « toutes les routes actuelles
 * REDIRIGENT vers leur nouvelle place » : c'est déjà le cas et ça le reste —
 * /users, /esn, /teams, /usage, /offres, /couts, /run et / redirigent depuis
 * la consolidation précédente. Le rail ne fait que REGROUPER des liens ; il ne
 * renomme ni ne déplace aucune URL, donc aucun signet ne casse. `/clients`
 * existe toujours et répond toujours : ce qui a changé le 07/09/2026, c'est le
 * lien que cette section pointe, pas la route qu'il quittait.
 *
 * Loi 4 du tome 7 — rien n'apparaît deux fois avec le même contenu : chaque
 * DESTINATION (chemin + vue) n'est listée qu'une fois. « Utilisateurs » et
 * « Espaces » sont deux vues distinctes de l'écran Clients, pas un doublon de
 * son lien : c'est pourquoi le lien nu « Clients » n'existe plus.
 */

type NavItem = { href: string; label: string }
type NavSection = { id: string; label: string; icon: string; items: NavItem[] }

/** Toujours visible, jamais dans une section — la règle explicite de #1644. */
export const COCKPIT: NavItem & { icon: string } = {
  href: '/monitoring?view=cockpit',
  label: 'Cockpit',
  icon: '◆',
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'revenus',
    label: 'Revenus',
    icon: '€',
    items: [
      // #1651 — le MRR décomposé, la série 12 mois, les métriques dérivées.
      // C'était l'entrée « MRR » que #1644 listait sans pouvoir l'afficher :
      // la route n'existait pas. Elle existe depuis le 07/09/2026.
      { href: '/revenus', label: 'Revenus (MRR)' },
      // #1652 — la bascule annoncée par #1651 a eu lieu le 07/09/2026. Ce n'est
      // pas un renommage de libellé : c'est un AUTRE écran, à une autre URL, qui
      // remplace le lien nu vers `/clients` dans cette section — un tableau
      // dense avec le MRR, les sièges, les crédits et le score de santé.
      // Les deux VUES de l'ancien écran (`?view=users`, `?view=esn`) restent où
      // elles étaient, dans « Administration » : elles répondent à une autre
      // question (« qui est ce compte ? ») que celle de cette section
      // (« combien rapporte ce client ? »), et rien n'est perdu.
      { href: '/revenus/clients', label: 'Clients' },
      // #4467 — la consommation de crédits par espace ET par utilisateur : le SEUL
      // endroit où elle se voit (les crédits sont implicites côté client, #4468).
      { href: '/revenus/clients/consommation', label: 'Consommation' },
      { href: '/facturation', label: 'Facturation' },
      // #1649 — la trésorerie de l'entreprise. Réservée au propriétaire
      // (`ECRANS_PROPRIETAIRE`) : le rail l'affiche, la porte refuse l'entrée à
      // qui n'y a pas droit. C'est le même compromis que /facturation, déjà là.
      { href: '/revenus/tresorerie', label: 'Trésorerie' },
    ],
  },
  {
    id: 'produit',
    label: 'Produit',
    icon: '◈',
    items: [
      // #1682/#1683-#1688 — l'écran qui dit ce que le traceur produit mesure
      // VRAIMENT (usage par écran, parcours, friction, demande non couverte)
      // et ce qu'il ne mesure PAS ENCORE faute d'émetteur câblé — jamais
      // confondu avec « zéro cas ». La lecture existait côté API depuis le
      // 09/09/2026 (quatre routes internes) sans aucune page qui la consomme.
      { href: '/produit', label: 'Analytique produit' },
      // issue 1657.2 / issue 1685 — « quelles fonctions du palier ne sont
      // jamais utilisées, payées quand même ». C'était l'entrée « Adoption »
      // que ce fichier listait sans pouvoir l'afficher : la route n'existait
      // pas. Une fonction = une fonction GATÉE PAR L'OFFRE (Growth vs
      // Entreprise), pas une action d'écran ni un écran du catalogue produit.
      { href: '/produit/adoption', label: 'Adoption' },
      { href: '/changelog', label: 'Changelog' },
      // #1658 — la rétention par cohortes. « Actif » y veut dire une action
      // VALIDÉE, pas une connexion : c'est la distinction que l'écran porte, et
      // elle est gardée côté API (le service refuse `last_seen_at`).
      { href: '/retention', label: 'Rétention' },
      // #1686 — l'entonnoir d'onboarding par cohorte. Seul retour de la série
      // /produit livrable sans le traceur front de #1682 : ses événements
      // existent déjà. Une cohorte trop jeune pour avoir atteint une étape dit
      // « non mesurée », jamais « 0 % », et le seuil de masquage est celui de
      // la rétention (COHORT_MIN_SPACES), pas un second.
      { href: '/produit/onboarding', label: 'Onboarding' },
      // #1949.23 — décision Louis 13/09 batch 12 : les demandes que Laura n'a pas
      // su router, en trace ANONYME (texte masqué, aucun utilisateur, aucun
      // espace), lues au-dessus d'un plancher de cinq occurrences distinctes.
      { href: '/produit/laura-non-compris', label: 'Laura — non compris' },
      // #3223.4 (#3198) — le raisonnement commercial de Laura, dix taux sur le trafic réel.
      { href: '/produit/raisonnement', label: 'Raisonnement de Laura' },
      // #3391 — les derniers tours de Laura, point d'entrée du replay
      // (/chat-turn/<id>) : outils appelés, jamais le texte dans la liste.
      { href: '/produit/laura-tours', label: 'Laura — derniers tours' },
      // #3544.4 — le diagnostic des REX (auteur, date, texte identique).
      { href: '/produit/rex', label: 'REX — diagnostic' },
      // #3586 — la synchro du Drive interne vers le corpus de Laura (déplacé du web le 05/10).
      { href: '/produit/drive-interne', label: 'Drive interne' },
      // issue 2076.13 — la recette produit des verdicts « première preuve »,
      // lue seulement sur les espaces qui ont ouvert le partage (GA-47).
      { href: '/produit/premiere-preuve', label: 'Première preuve' },
      { href: '/feedback', label: 'Feedback' },
      // #2706 — Théo (CEO, 22/09/2026) : les prospects qui ont lancé la démo
      // depuis le formulaire d'accès (#2705), pour les lire, les trier et les
      // recontacter sans ouvrir la base à la main.
      { href: '/prospects', label: 'Prospects' },
    ],
  },
  {
    id: 'technique',
    label: 'Technique',
    icon: '⚙',
    items: [
      { href: '/monitoring?view=runs', label: 'Analyses' },
      { href: '/health', label: 'Santé système' },
      { href: '/queues', label: 'Files (BullMQ)' },
      // Supervision de l'infra (30/09/2026) — onglet Runners CI (Grafana Cloud).
      { href: '/supervision', label: 'Supervision' },
      // #1622 — le jeu de vérité terrain de la mémoire marché : juger un cas
      // à la main, et les six métriques calculées sur les jugements courants.
      { href: '/verite-terrain', label: 'Vérité terrain (mémoire marché)' },
      // #1661 — les coûts fournisseurs sortent de Facturation : « c'est de la
      // technique, pas du revenu ». La route existait déjà (elle redirigeait),
      // donc aucun signet ne casse, et `?view=fournisseurs` redirige ici.
      // Réservée au propriétaire (ECRANS_PROPRIETAIRE), même compromis que
      // /facturation et /revenus/tresorerie, déjà au rail.
      { href: '/couts', label: 'Coûts fournisseurs' },
      // #1676.2 — les dépendances DU MANAGER (Stripe, Supabase, Slack, Resend,
      // Vercel, GitHub) : distinct de « Santé système » (les dépendances DU
      // PRODUIT) et d'« Intégrations » (les connecteurs DU PRODUIT CLIENT).
      { href: '/dependances-manager', label: 'Dépendances du manager' },
      // #1678.3 — le runbook opérateur. Rangé ici plutôt qu'en lien racine
      // (comme Cockpit) : la garde `rail-et-environnement.test.ts` fixe le
      // rail à CINQ sections et vérifie qu'aucune destination n'apparaît deux
      // fois (loi 4 du tome 7) — l'ajouter en item plutôt qu'en constante à
      // part le fait passer par cette même garde sans la modifier.
      { href: '/runbook', label: 'Runbook' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    icon: '☰',
    items: [
      // #1664 — le tableau dense remplace la liste éparse de `/clients?view=users`,
      // qui REDIRIGE ici depuis le 07/09/2026. Deux listes d'utilisateurs ne
      // coexistent pas : la seconde cesserait d'être maintenue sans qu'on le voie.
      { href: '/users', label: 'Utilisateurs' },
      { href: '/clients?view=esn', label: 'Espaces (ESN)' },
      // #1666 — le journal d'audit unique du back-office. C'était l'entrée
      // « Audit » que #1644 listait sans pouvoir l'afficher : la route
      // n'existait pas. Elle existe depuis le 07/09/2026.
      { href: '/audit', label: 'Audit' },
      // #1671 — l'état de sécurité. Distinct du journal d'audit (#1666) : celui-ci
      // dit ce qu'un opérateur a FAIT, celui-là dit qui a tenté d'ENTRER. Les
      // trois signaux d'anomalie (rafale d'échecs, pays jamais vu, connexion
      // entre 1 h et 6 h) étaient calculés sans aucun appelant avant ce lot.
      { href: '/securite', label: 'Sécurité' },
      // #1665.2 — qui a incarné quel client, depuis quand, combien de temps,
      // pourquoi. Le POST de démarrage existait déjà (#1670) ; aucun GET
      // n'exposait les sessions avant ce lot.
      { href: '/impersonations', label: 'Impersonations' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: '⌗',
    items: [
      { href: '/flags', label: 'Feature flags' },
      // #3274.5 (épopée #3274) — la gouvernance du corpus méthode
      // (`packages/contracts/src/schemas/method-corpus.ts`) n'avait aucun
      // écran ni endpoint avant ce lot.
      { href: '/method-corpus', label: 'Corpus méthode' },
      { href: '/banners', label: 'Bandeaux' },
      { href: '/integrations', label: 'Intégrations' },
      { href: '/api', label: 'API · requêtes' },
      { href: '/laura-site', label: 'Laura · Site' },
    ],
  },
]

/**
 * L'environnement servi, lu depuis la variable que Vercel pose déjà (#1675).
 *
 * Une console qui peut supprimer un compte doit dire EN PERMANENCE si elle
 * parle à la production — c'est la protection la moins chère contre l'erreur
 * humaine. Une valeur inconnue rend `null` : on ne DEVINE pas « production »,
 * ce serait le mensonge le plus coûteux des trois.
 */
export type Environment = { key: 'prod' | 'staging' | 'local'; label: string; token: string }

export function resolveEnvironment(value: string | undefined): Environment | null {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'production':
      return { key: 'prod', label: 'PROD', token: 'var(--red)' }
    case 'preview':
    case 'staging':
      return { key: 'staging', label: 'STAGING', token: 'var(--amber)' }
    case 'development':
    case 'local':
      return { key: 'local', label: 'LOCAL', token: 'var(--muted)' }
    default:
      return null
  }
}
