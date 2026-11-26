import {
  ACCOUNT_ENTITY_KINDS,
  ACCOUNT_LIST_HEADLINE_FILTERS,
  COMMERCIAL_LIFECYCLE_VALUES,
  accountSortKeySchema,
} from '@bellum/contracts'
import { z } from 'zod'
import { STATUS_CONFIG } from '@/features/accounts/view/accounts-list/types'

/**
 * Search params bookmarkables :
 *   - `q`      → recherche texte
 *   - `status` → filtre statut
 *   - `sort`   → tri
 *   - `sector` → ILIKE secteur
 *   - `score`  → bucket priority_score (`high|medium|low`)
 *   - `gate`   → porte de priorité G1 (`pending|prioritised|parked`)
 */
const SCORE_BUCKETS = ['high', 'medium', 'low'] as const
// Onglets « À suivre » / « Opportunités » (Théo p.39) : tri commercial persistant,
// distinct du `status` d'analyse.
// #4498 — dérivé du contrat, comme `ENTITY_KIND_KEYS` : « Filtrer mon portefeuille » range aussi par
// « En ouverture » et « En veille » (`opening`, `dormant`), que `GET /accounts` accepte déjà ; une liste écrite
// à la main les jetait en silence par le `catch`.
const LIFECYCLE_KEYS = ['all', ...COMMERCIAL_LIFECYCLE_VALUES] as const
// La porte de PRIORITÉ (G1). Miroir de `PRIORITY_GATES` du contrat — un `catch`
// sur une valeur inconnue plutôt qu'une page en erreur : un lien partagé qui
// porterait une valeur périmée doit ouvrir la liste, pas un écran cassé.
const GATE_KEYS = ['all', 'pending', 'prioritised', 'parked'] as const
// Le TYPE d'entité porté par le compte. Dérivé du contrat plutôt que recopié :
// une liste écrite à la main ici resterait en arrière le jour où le vocabulaire
// gagne un type, et le filtre le refuserait en silence.
const ENTITY_KIND_KEYS = ['all', ...ACCOUNT_ENTITY_KINDS] as [string, ...string[]]

/**
 * #4498.a — un axe se coche à plusieurs : l'URL porte un scalaire (un seul choix, les liens d'avant) ou une
 * liste (deux choix ou plus). Une valeur périmée jette l'axe (`catch`), jamais l'écran.
 */
function oneOrMany<T extends z.ZodType<string>>(schema: T) {
  return z
    .union([schema, z.array(schema).min(1)])
    .optional()
    .catch(undefined)
}

export const accountsSearchSchema = z.object({
  q: z.string().optional(),
  // #4886 — `canceled` est un statut d'analyse (axe « échecs » avec `error`) : sans lui ici, le lien « Voir les échecs »
  // jetait l'axe entier. #4941.1 — il a désormais sa propre entrée STATUS_CONFIG, donc plus de valeur à part.
  status: oneOrMany(z.enum(['all', ...(Object.keys(STATUS_CONFIG) as [string, ...string[]])])),
  lifecycle: oneOrMany(z.enum(LIFECYCLE_KEYS)),
  /**
   * #2627.1 — LE TRI VIENT DU CONTRAT, il ne se recopie plus.
   *
   * Cette ligne portait sa propre liste de quatre clés
   * (`name_asc|name_desc|date_asc|date_desc`) quand le contrat en portait six.
   * Le `.catch(undefined)` ci-dessous jetait donc `score_asc`/`score_desc`
   * **en silence** : l'en-tête « Score /10 » appelait bien le tri, l'URL ne
   * changeait pas, la liste ne bougeait pas, et rien n'avertissait. Mesuré en
   * production le 21/09/2026, avec témoin sur « Dernière analyse » qui, lui,
   * marchait.
   *
   * C'est exactement ce que `ENTITY_KIND_KEYS` dit quelques lignes plus bas :
   * une liste écrite à la main ici reste en arrière et refuse la nouveauté en
   * silence. Elle est donc dérivée, comme lui.
   */
  sort: accountSortKeySchema.optional().catch(undefined),
  sector: oneOrMany(z.string()),
  // #2159.26 — l'étiquette filtrée, dans l'URL : la puce d'une fiche y mène.
  tag: oneOrMany(z.string()),
  score: oneOrMany(z.enum(SCORE_BUCKETS)),
  gate: oneOrMany(z.enum(GATE_KEYS)),
  /**
   * LA LENTILLE (26/08/2026) — sous quel angle on regarde le portefeuille.
   *
   * Absente = l'angle COMMERCIAL, celui de toujours : « ce compte vaut-il mon
   * temps ? ». `delivery` = l'angle de l'ops : « peut-on facturer ce client ? ».
   * `effort` = « combien d'énergie je mets sur quel compte cette semaine ? » —
   * l'ancien écran `/accounts/sprints`, devenu une vue (#1318, décision de
   * Louis du 02/09). Le moteur d'allocation ne bouge pas ; seul son
   * emplacement change, et la route d'origine redirige ici.
   *
   * ⚠️ Une lentille et non un écran neuf : ce sont les MÊMES comptes, les mêmes
   * filtres, la même URL — seules deux colonnes changent. Un second écran aurait
   * dupliqué les filtres, la pagination et la recherche, et les deux auraient
   * divergé au premier ajout. C'est aussi ce que la source demande en toutes
   * lettres : « Ce n'est pas une page neuve. »
   *
   * Dans l'URL, donc partageable : « regarde les comptes qu'on ne peut pas
   * facturer » se envoie en un lien. `catch` sur une valeur inconnue — un lien
   * périmé ouvre le portefeuille, jamais un écran cassé.
   */
  // #4088.8 — `lists` : les listes de cibles, qui ont quitté `/mes-cibles` (même motif de lentille).
  lens: z.enum(['delivery', 'effort', 'lists', 'followed']).optional().catch(undefined),
  /**
   * LE TYPE D'ENTITÉ (31/08/2026) — le « Type d'organisation » de la maquette,
   * dit dans NOTRE vocabulaire.
   *
   * Miroir d'`ACCOUNT_ENTITY_KINDS` du contrat, avec un `catch` : un lien
   * partagé qui porterait une valeur périmée ouvre la liste, jamais un écran en
   * erreur — même règle que `status` et `gate` au-dessus.
   */
  entityKind: oneOrMany(z.enum(ENTITY_KIND_KEYS)),
  /** #4498.c — Historique documenté (`with|without`) et Références autorisées (`only`), filtrés par le SERVEUR. */
  documentedHistory: z.enum(['with', 'without']).optional().catch(undefined),
  authorizedReferences: z.enum(['only']).optional().catch(undefined),
  /**
   * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE, dans l'URL donc partageable.
   *
   * Une des trois métriques DÉCISIONNELLES du bandeau (`ACCOUNT_LIST_HEADLINE_FILTERS`) —
   * jamais `followed` : cliquer ce chiffre-là ramène au portefeuille complet,
   * il ne filtre rien. `catch` sur une valeur périmée : un lien partagé ouvre
   * le portefeuille, jamais un écran cassé — même règle que `status`/`gate`.
   */
  headline: z.enum(ACCOUNT_LIST_HEADLINE_FILTERS).optional().catch(undefined),
  /**
   * #1575.1 — LE CINQUIÈME COMPTEUR, dans l'URL donc partageable.
   *
   * `'covered'` restreint aux comptes que la mémoire marché couvre. SÉPARÉ de
   * `headline` : les trois métriques décisionnelles rejouent le prédicat SQL
   * qui les compte, celle-ci passe par une liste d'identifiants arbitrée en
   * TypeScript sur les tables d'un autre module (`accountListQuerySchema`).
   * `catch` comme les autres : un lien périmé ouvre le portefeuille, jamais un
   * écran cassé.
   */
  marketCovered: z.enum(['all', 'covered']).optional().catch(undefined),
  /** #2150.13 — la vue « À actualiser » (`freshness=stale`). `catch` comme les autres. */
  freshness: z.enum(['all', 'stale']).optional().catch(undefined),
  /**
   * #2150.14/.18 — « MES FAVORIS », RÉTABLI (revirement assumé de #1800,
   * Louis 15/09/2026). `'mine'` restreint aux comptes personnellement mis en
   * favori par l'appelant. `catch` comme les autres axes de vue : un lien
   * partagé qui porterait une valeur périmée ouvre le portefeuille, jamais un
   * écran cassé.
   */
  favorite: z.enum(['all', 'mine']).optional().catch(undefined),
  /**
   * #2150.15 — « PORTÉS PAR UN COLLÈGUE ». `'teammate'` exclut le portefeuille
   * personnel de l'appelant — un compte LIBRE (non attribué) n'y entre pas.
   * #4158.25 — `'mine'` : « MES COMPTES » (responsable OU co-équipier actif).
   */
  ownership: z.enum(['all', 'teammate', 'mine']).optional().catch(undefined),
  /** #4526.3 — la puce « Mon CRM » (`only`), dans l'URL, combinable avec les onglets. `catch` comme les autres. */
  crm: z.enum(['only']).optional().catch(undefined),
  /** #4597.1 — la puce « Importés » (`only`), dans l'URL, combinable avec les onglets. `catch` comme les autres. */
  imported: z.enum(['only']).optional().catch(undefined),
  /** #4597.3 — « voir les N comptes » depuis Imports & sources : l'identifiant du job d'import, jamais sa date. */
  importJob: z.string().guid().optional().catch(undefined),
  /** Refonte Théo — la présentation du portefeuille : tableau (absent, le défaut) ou cartes. Dans l'URL, partageable. */
  layout: z.enum(['cards']).optional().catch(undefined),
  page: z.string().optional(),
})
