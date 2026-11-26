import { z } from 'zod'
import { STOCK_METRIC_KEYS, type StockMetricKey } from './stock-snapshot.js'

/* ------------------------------------------------------------------ */
/*  La lecture de VARIATION d'une photo mensuelle (D2 · 26/08 ·        */
/*  rouvert et tranché le 31/08/2026)                                  */
/* ------------------------------------------------------------------ */

/**
 * Ce fichier est la moitié LECTURE de la photo mensuelle. L'autre moitié —
 * quoi photographier, d'où ça sort — vit dans `stock-snapshot.ts`, et la
 * mécanique d'écriture dans `pilotage/stock-snapshot.service.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ARBITRAGE DU 31/08/2026, ET CE QU'IL RENVERSE
 * ─────────────────────────────────────────────────────────────────────────────
 * Six des dix-sept maquettes cibles affichent une variation période à période
 * (« +12 % vs mois dernier », « +3,1 pts vs N-1 »). Aucune n'avait de source :
 * la photo existante ne servait qu'UNE base — le mois précédent — à DEUX
 * écrans, et rien dans le dépôt ne savait rendre une variation.
 *
 * Louis a tranché : **on lit la variation entre deux PHOTOS, pas entre deux
 * recalculs.** Un recalcul rend « le mois dernier » rétroactivement FAUX dès
 * qu'une donnée passée est corrigée — le chiffre publié en septembre pour août
 * ne serait plus celui qu'on a publié en septembre. Une photo, elle, est
 * datée : elle dit ce qu'on savait au moment où on l'a prise.
 *
 * ⚠️ La contrepartie, et elle est réelle : une correction tardive n'entre PAS
 * dans la photo déjà prise (`ON CONFLICT DO NOTHING` — la première photo du
 * mois gagne). C'est le prix ASSUMÉ de la stabilité du chiffre publié, et non
 * un oubli. Le jour où ce prix devient trop cher pour un indicateur donné, la
 * réponse est de ne pas le photographier — pas de réécrire une photo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUE CE FICHIER TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Un mois sans photo n'est pas un mois à zéro.** Une variation qui ne
 *     peut pas se calculer rend `{ measured: false }` — un objet qui ne PORTE
 *     pas de champ `change`. Ce n'est pas une coquetterie de typage : un
 *     `change: 0` se recopie à l'écran, une clé absente ne se recopie pas.
 *  2. **Le PREMIER MOIS n'a pas de variation, et ce n'est PAS une panne.**
 *     C'est le cas `no_previous_snapshot`. Un espace créé en août n'a aucune
 *     photo de juillet : l'écran doit écrire « non mesuré », jamais « 0 % », et
 *     surtout personne ne doit ouvrir un incident. Il faut DEUX passages du
 *     balayage mensuel — donc deux mois — avant qu'une variation existe.
 *  3. **Un taux sans dénominateur vaut `null`, jamais 0 %.** Une photo de taux
 *     porte la POPULATION sur laquelle il a été calculé ; sans elle, ou sur une
 *     population vide, il n'y a pas de taux — il y a une absence de mesure.
 *
 * ⚠️ La règle n'est PAS « jamais zéro ». Deux photos égales donnent une
 * variation de zéro, et ce zéro-là est VRAI : la stabilité est une information.
 * Ce qu'on refuse, c'est le zéro qui remplace une absence.
 */

/* ------------------------------------------------------------------ */
/*  Les unités                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'une métrique MESURE — et donc comment sa variation se LIT.
 *
 * La distinction n'est pas cosmétique : la variation d'un taux se lit en
 * POINTS, jamais en pourcentage. Un taux passé de 30 % à 33 % a gagné 3 points ;
 * annoncer « +10 % » serait une seconde affirmation, vraie sur un autre calcul,
 * et fausse pour ce que l'écran montre.
 */
export const METRIC_UNITS = ['count', 'money_cents', 'ratio'] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

/**
 * L'unité dans laquelle la VARIATION s'affiche.
 *
 * `count` → « +5 ce mois » · `money_cents` → « +12 400 centimes » ·
 * `points` → « +3,1 pts ». Un taux (`ratio`) se lit donc en `points` : c'est la
 * seule unité de sortie qui n'existe pas en entrée, et c'est exprès.
 */
/**
 * Sous cette base, une variation n'affiche pas de pourcentage : l'écart absolu
 * signé parle (« +281 »), jamais « +2812 % » sur une base quasi nulle (recette
 * 14/10 et 15/10/2026, #4191 G3). UN seuil pour tout le produit : le web
 * (`describeTrend`) le lit ici, il ne le recopie pas (GA-26).
 */
export const PERCENT_MIN_BASE = 10

export type MetricChangeUnit = 'count' | 'money_cents' | 'points'

/* ------------------------------------------------------------------ */
/*  Un point photographié                                              */
/* ------------------------------------------------------------------ */

/**
 * Une photo d'une métrique, à un mois.
 *
 * `denominator` porte la POPULATION sur laquelle la valeur a été mesurée —
 * « 7 comptes sans prochaine action **sur 42 comptes suivis** ». Il est
 * facultatif pour un dénombrement (tous n'ont pas de population de référence :
 * un doublon n'est la part de rien) et OBLIGATOIRE pour un taux.
 *
 * ⚠️ Pour un `ratio`, `value` porte le TAUX DÉJÀ CALCULÉ (0-100), pas un
 * numérateur. C'est la forme qui accueille les deux familles de taux du
 * dépôt : celui qui se dérive d'un couple compté, et celui qu'une dérivation
 * rend déjà en pourcentage avec sa seule taille d'échantillon (`aggregateMargin`
 * rend `marginPercent` + `measured`, et le numérateur n'existe nulle part).
 */
export const metricPointSchema = z.object({
  /** Le mois photographié, `YYYY-MM`. */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  value: z.number(),
  /** La population mesurée. `null` = non lue — ce n'est PAS une population vide. */
  denominator: z.number().nullable().optional(),
})
export type MetricPoint = z.infer<typeof metricPointSchema>

/** Une série de photos d'UNE métrique, du plus ancien au plus récent. */
export const metricSeriesSchema = z.object({
  metricKey: z.string(),
  unit: z.enum([...METRIC_UNITS] as [MetricUnit, ...MetricUnit[]]),
  points: z.array(metricPointSchema),
})
export type MetricSeries = z.infer<typeof metricSeriesSchema>

/** Ce que rend la route de lecture — une série par métrique demandée. */
export const metricSeriesResponseSchema = z.object({
  series: z.array(metricSeriesSchema),
  /**
   * Le nombre de mois RÉELLEMENT couverts par la table pour cet espace. Zéro ou
   * un ⇒ aucune variation ne peut exister, et l'écran le sait AVANT de tenter
   * une lecture — c'est ce qui distingue « pas encore » d'une panne.
   */
  monthsCovered: z.number().int().nonnegative(),
})
export type MetricSeriesResponse = z.infer<typeof metricSeriesResponseSchema>

/* ------------------------------------------------------------------ */
/*  La variation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Pourquoi une variation n'a PAS pu être calculée. Toujours NOMMÉ — un écran
 * qui reçoit `measured: false` doit pouvoir dire LAQUELLE des raisons, sans
 * quoi « non mesuré » et « en panne » se ressemblent.
 */
export const METRIC_DELTA_GAPS = [
  /** Aucune photo du mois de référence. **Le cas du premier mois — normal.** */
  'no_previous_snapshot',
  /** Aucune photo du mois courant : le balayage n'est pas encore passé. */
  'no_current_snapshot',
  /** Un taux sans population, ou sur une population vide. Jamais « 0 % ». */
  'denominator_missing',
  /** Les deux photos ne sont pas dans l'ordre : appel fautif, pas une absence. */
  'periods_not_ordered',
] as const
export type MetricDeltaGap = (typeof METRIC_DELTA_GAPS)[number]

/**
 * La variation entre deux photos.
 *
 * ⚠️ La branche NON MESURÉE ne porte NI `change` NI `percent`. C'est
 * volontaire, et c'est ce que le typage achète : un écran ne PEUT pas lire un
 * zéro qui n'existe pas.
 */
export type MetricDelta =
  | { measured: false; gap: MetricDeltaGap }
  | {
      measured: true
      /** Comment lire `change`. */
      changeUnit: MetricChangeUnit
      /** La variation, signée, dans `changeUnit`. */
      change: number
      /**
       * La variation RELATIVE, en %, ou `null` — JAMAIS 0 quand elle est
       * inconnue. Elle vaut `null` dans exactement deux cas, tous deux
       * délibérés : une base à zéro (la division n'existe pas) et un taux (une
       * variation relative de taux n'a pas de lecture honnête).
       */
      percent: number | null
      from: MetricPoint
      to: MetricPoint
    }

/**
 * Les décimales affichées. Elles vivent ICI, et pas dans un service : deux
 * arrondis qui divergent font douter des deux chiffres.
 *
 * Une seule décimale — « +12,4 % », « +3,1 pts ». Deux suggéreraient une
 * précision que la mesure n'a pas.
 */
export const DELTA_PERCENT_DECIMALS = 1
export const DELTA_POINTS_DECIMALS = 1

/**
 * Le nombre de mois qu'une lecture de série accepte de remonter.
 *
 * 24 — deux ans. Assez pour « vs N-1 » (douze mois) plus une année de recul,
 * et borné parce qu'une série non bornée grossit d'un point par mois et par
 * indicateur pour toujours. Le seuil vit ICI, et pas dans le service : deux
 * bornes qui divergent rendraient deux écrans incomparables.
 */
export const METRIC_SERIES_MAX_MONTHS = 24

/** Arrondi à N décimales, sans le `-0` que `Math.round` produit sur `-0.04`. */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  const rounded = Math.round(value * factor) / factor
  return rounded === 0 ? 0 : rounded
}

/** Une valeur lisible : un nombre fini. `NaN` et `±∞` sont des ABSENCES. */
function readable(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Une photo exploitable, ou `null`. Une valeur illisible vaut une absence. */
function usable(point: MetricPoint | null | undefined): MetricPoint | null {
  if (!point || typeof point.month !== 'string') return null
  return readable(point.value) ? point : null
}

/**
 * LA lecture de variation du produit — pure, sans accès réseau ni horloge.
 *
 * C'est la seule porte : aucun écran ne soustrait deux photos lui-même. Deux
 * chemins qui refont cette dérivation divergeraient sur les cas de bord (base à
 * zéro, base négative, population vide), qui sont précisément ce que ce lot
 * existe pour tenir.
 *
 * @param input.unit    Ce que la métrique mesure — voir {@link METRIC_UNITS}.
 * @param input.previous La photo de RÉFÉRENCE (la plus ancienne).
 * @param input.current  La photo COMPARÉE (la plus récente).
 *
 * @example
 * const delta = metricDelta({ unit: 'count', previous: july, current: august })
 * if (!delta.measured) return <Unmeasured reason={delta.gap} />
 * return <Trend change={delta.change} percent={delta.percent} />
 */
export function metricDelta(input: {
  unit: MetricUnit
  previous: MetricPoint | null | undefined
  current: MetricPoint | null | undefined
}): MetricDelta {
  const from = usable(input.previous)
  const to = usable(input.current)

  // L'ordre compte : « pas de photo de référence » est le cas du PREMIER MOIS,
  // et c'est le message que l'écran doit montrer en priorité.
  if (!from) return { measured: false, gap: 'no_previous_snapshot' }
  if (!to) return { measured: false, gap: 'no_current_snapshot' }

  // Deux photos interverties donneraient un chiffre juste au signe près — le
  // genre d'erreur que rien à l'écran ne permet de repérer. On refuse.
  if (from.month >= to.month) return { measured: false, gap: 'periods_not_ordered' }

  if (input.unit === 'ratio') {
    // Un taux sans sa population n'est pas un taux : c'est un nombre dont on ne
    // sait pas s'il porte sur trois missions ou sur trois cents.
    const fromTotal = from.denominator
    const toTotal = to.denominator
    if (!readable(fromTotal) || !readable(toTotal) || fromTotal <= 0 || toTotal <= 0) {
      return { measured: false, gap: 'denominator_missing' }
    }
    return {
      measured: true,
      changeUnit: 'points',
      change: round(to.value - from.value, DELTA_POINTS_DECIMALS),
      // Pas de variation relative sur un taux — voir le docblock du type.
      percent: null,
      from,
      to,
    }
  }

  const change = to.value - from.value
  return {
    measured: true,
    changeUnit: input.unit,
    change,
    // Une base à zéro n'a pas de variation relative : passer de 0 à 5 n'est pas
    // « +500 % », c'est une division impossible. La variation ABSOLUE, elle,
    // reste parfaitement mesurée — d'où `measured: true` avec `percent: null`.
    //
    // ⚠️ La base NÉGATIVE se rapporte à sa valeur absolue. Une marge qui passe
    // de −100 € à −50 € s'AMÉLIORE : diviser par −100 afficherait « −50 % ».
    //
    // ⚠️ Recette 14/10 (« +2612 % » sur 8 → 217) : un COMPTEUR dont la base est
    // < 10 n'a pas non plus de variation relative qui veuille dire quelque chose.
    // Le delta absolu parle ; le pourcentage se tait (`null`), jamais arrondi.
    percent:
      from.value === 0 || (input.unit === 'count' && Math.abs(from.value) < PERCENT_MIN_BASE)
        ? null
        : round((change / Math.abs(from.value)) * 100, DELTA_PERCENT_DECIMALS),
    from,
    to,
  }
}

/**
 * Le point d'un mois donné dans une série, ou `null`.
 *
 * ⚠️ Aucun repli sur un mois voisin. Servir la photo de juin sous le libellé
 * « juillet » serait un chiffre juste sur une question qu'on n'a pas posée — et
 * rien à l'écran ne permettrait de s'en apercevoir.
 */
export function metricPointAt(series: readonly MetricPoint[], month: string): MetricPoint | null {
  return series.find(point => point.month === month) ?? null
}

/* ------------------------------------------------------------------ */
/*  Le registre : ce qui est photographié, et sur quoi                 */
/* ------------------------------------------------------------------ */

/**
 * L'unité de chaque métrique photographiée.
 *
 * Les neuf sont des DÉNOMBREMENTS aujourd'hui. Le registre existe quand même,
 * et il est exhaustif par typage : le jour où un taux ou un montant entre dans
 * la photo, il ne peut pas y entrer sans que quelqu'un ait répondu « comment se
 * lit sa variation ? ».
 */
export const METRIC_SNAPSHOT_UNIT: Record<StockMetricKey, MetricUnit> = {
  benchAvailable: 'count',
  activeClients: 'count',
  accounts_without_next_action: 'count',
  contacts_without_email: 'count',
  projects_without_amount: 'count',
  missions_without_end_date: 'count',
  needs_without_skills: 'count',
  talents_unknown_availability: 'count',
  missions_without_cost: 'count',
  needs_without_positioning: 'count',
  timesheets_to_validate: 'count',
  invoices_ready: 'count',
  talents_available: 'count',
}

/**
 * CE SUR QUOI chaque photo est calculée — sa population de référence.
 *
 * `null` veut dire « cette métrique n'est la part de RIEN », et la raison est
 * écrite à côté. C'est la différence entre un choix et un oubli : sans cette
 * table, une métrique sans dénominateur et une métrique dont on a oublié le
 * dénominateur se ressemblent.
 *
 * ⚠️ Les sept dénominateurs `hygiene` ne sont PAS une nouvelle requête. La vue
 * Qualité les calcule déjà — `HygieneLine.total`, à côté de `count` — et le
 * balayage les JETAIT. Les écrire est une extension de la photo existante, pas
 * une seconde dérivation.
 */
export const METRIC_SNAPSHOT_DENOMINATOR: Record<StockMetricKey, string | null> = {
  /* --- Chaîne de pilotage : aucune population de référence n'est lue --- */
  // `gatherInputs` rend des dénombrements NUS. Le vivier disponible n'est pas
  // rapporté à un effectif : `PilotageInputs` ne porte aucun total de
  // consultants, et en inventer un ici serait une seconde définition de
  // l'effectif — celle que `talents_unknown_availability` porte déjà, sur un
  // prédicat DIFFÉRENT (`kind = 'consultant'`).
  benchAvailable: null,
  // Idem : aucun total de comptes n'accompagne le comptage des clients actifs.
  activeClients: null,

  /* --- Hygiène des données : le total est DÉJÀ calculé et déjà servi --- */
  /** Les comptes SUIVIS (`watching`/`opportunity`/`customer`, hors supprimés).
   *  C'est le « comptes suivis » des maquettes — il n'a donc PAS de clé à lui :
   *  deux endroits pour un chiffre est exactement ce que GA-26 refuse. */
  accounts_without_next_action: 'comptes suivis',
  contacts_without_email: 'contacts de l’espace',
  projects_without_amount: 'projets en jeu',
  missions_without_end_date: 'missions actives',
  /** Les besoins encore OUVERTS — le « besoins ouverts » des maquettes, lui
   *  aussi lisible comme dénominateur plutôt que comme clé propre. */
  needs_without_skills: 'besoins ouverts',
  talents_unknown_availability: 'consultants de l’espace',
  missions_without_cost: 'missions actives',

  /* --- Stocks de travail (31/08/2026) : leur dérivation rend DÉJÀ le total --- */
  /** Les besoins OUVERTS retenus par le filtre par défaut — `counters.total`,
   *  calculé par le même `QueryBuilder` cloné que `withoutShortlist`. C'est ce
   *  qui rend « 7 besoins orphelins sur 41 » lisible : sept sur quarante et un
   *  s'améliore quand le portefeuille de besoins grandit, sept tout court non. */
  needs_without_positioning: 'besoins ouverts',
  /** Toutes les lignes du mois (mission × consultant affecté) — `summary.total`,
   *  calculé AVANT filtre, exprès. */
  timesheets_to_validate: 'relevés du mois',
  /** La somme des quatre états, qui PARTITIONNENT la population : chaque état a
   *  sa branche nommée dans `summarizeReadiness`, sans `else` fourre-tout — la
   *  somme est donc vraie par construction, pas par coïncidence. */
  invoices_ready: 'missions du mois à facturer',
  /** Tous les talents actifs de l'espace — `stats.total`, le même périmètre que
   *  celui sur lequel `availableNow` est compté. */
  talents_available: 'talents du vivier',
}

/**
 * Ce que les maquettes affichent et que le dépôt NE photographie PAS — avec,
 * pour chacun, le blocage EXACT.
 *
 * Ce registre est la moitié la plus utile du lot. Sans lui, la prochaine
 * personne qui ouvre l'écran Finance croit à un oubli, recode une photo de
 * marge à côté de celle-ci, et le dépôt gagne deux mécanismes qui divergent au
 * premier mois. Chaque entrée dit ce qu'il faudrait LEVER, pas seulement que
 * c'est absent.
 */
export const METRICS_NOT_PHOTOGRAPHED: readonly { label: string; reason: string }[] = [
  {
    label: 'marge prévisionnelle',
    reason:
      'Aucune dérivation ne la calcule. `MissionScoresService.forecast` est un prévisionnel de CA, ' +
      'volontairement NON pondéré (doctrine « aucune probabilité »), et aucun `forecastMargin` n’existe. ' +
      'Photographier supposerait de l’inventer — donc d’inventer un chiffre.',
  },
  {
    label: 'marge réalisée',
    reason:
      'La dérivation EXISTE et convient (`RevenueService.aggregate(scope, month)` → `marginPercent` + ' +
      '`measured`, soit exactement un `ratio` et sa population). Le blocage est ARCHITECTURAL : elle vit ' +
      'dans le module `delivery`, la photo dans `pilotage`, et GA-07 est à SON PLAFOND (243 imports ' +
      'service → service, 119 fichiers, zéro marge). L’y brancher demande soit un relèvement ARBITRÉ ET ' +
      'DATÉ du cliquet, soit de rendre les trois points que le docblock de GA-07 réclame depuis août ' +
      '(`routines.service`, −3 en une fois). Recopier son SQL ici serait une seconde définition de la ' +
      'marge — refusé.',
  },
  {
    label: 'encaissements validés / en attente / en retard',
    reason:
      'La seule dérivation est `summarizeCollections`, une fonction PURE qui vit dans `apps/web` et ' +
      'tourne dans le navigateur. Une routine de l’API ne peut pas l’appeler. La photographier ' +
      'supposerait de la recopier côté serveur — deux définitions de « en retard », qui divergeraient ' +
      'au premier correctif appliqué d’un seul côté. Le geste juste est de la PROMOUVOIR dans ' +
      '`@bellum/contracts` (elle est déjà pure), et c’est un lot à elle seule.',
  },
  {
    label: 'factures BLOQUÉES',
    reason:
      'Le côté PRÊT est photographié depuis le 31/08/2026 (`invoices_ready`). Le côté bloqué ne l’est ' +
      'pas, et ce n’est pas une seconde requête qui manque — c’est une question de LECTURE : ' +
      '« bloquées » monte quand on facture mieux (les prêtes partent, les bloquées restent) autant que ' +
      'quand on facture moins. Un compteur dont la hausse ne dit pas dans quel sens lire vaut mieux ' +
      'non affiché qu’affiché à côté d’une flèche. `summary.blocked` reste servi à l’écran, où le ' +
      'détail des motifs le rend lisible.',
  },
  {
    label: 'montants préparés / bloqués',
    reason:
      'Un montant est une donnée FINANCE, soumise à `redactFinance` (D45) : le photographier ferait de ' +
      'la table `stock_snapshots` un SECOND endroit où il faudrait re-tenir cette porte, sur une ligne ' +
      'que le balayage écrit sans savoir qui la lira. `invoices_ready` photographie donc les COMPTES ' +
      'seuls. ⚠️ `value` est en `integer` : 21,4 M€ en centimes, un plafond qu’un montant mensuel ' +
      'atteindrait — la colonne passerait en `bigint` AVANT le code qui l’écrit (GA-11/GA-12).',
  },
  {
    label: 'dossiers ADV incomplets',
    reason:
      'La dérivation existe et convient (`AdvService.dossiers` → `summarise().incomplete`, avec son ' +
      '`total`). Le blocage n’est PAS GA-07 : c’est que sa POPULATION est composée par le contrôleur — ' +
      'les démarrages du mois, lus par le service, PLUS les renouvellements que `AdvController` va ' +
      'chercher dans `DeliveryService.renewalsToAct` et lui passe en argument. Une photo prise depuis ' +
      'le balayage devrait refaire cette composition, donc écrire une SECONDE définition de « ce que ' +
      'l’ADV traite ce mois-ci » — et un mois où les deux définitions divergeraient produirait une ' +
      'variation qui ne mesure que notre désaccord. Le geste juste est de descendre la composition ' +
      'dans le service (elle ne dépend d’aucun geste utilisateur), et c’est un lot à elle seule.',
  },
  {
    label: 'encaissements validés / en attente / en retard',
    reason:
      'La seule dérivation est `summarizeCollections`, une fonction PURE qui vit dans `apps/web` et ' +
      'tourne dans le navigateur. Une routine de l’API ne peut pas l’appeler. La photographier ' +
      'supposerait de la recopier côté serveur — deux définitions de « en retard », qui divergeraient ' +
      'au premier correctif appliqué d’un seul côté. Le geste juste est de la PROMOUVOIR dans ' +
      '`@bellum/contracts` (elle est déjà pure), et c’est un lot à elle seule.',
  },
  {
    label: 'démarrages / renouvellements du mois (ADV)',
    reason:
      'Ce sont des FLUX, pas des stocks : `missions.started_on` et la fenêtre de renouvellement sont ' +
      'des DATES, et « les démarrages de juillet » se recalculent à volonté en bornant la fenêtre. ' +
      'Leur donner une photo créerait la seconde vérité que ce module existe pour éviter — deux ' +
      'chiffres pour la même question, dont l’un vieillit. La variation d’un flux se lit comme celle ' +
      'du cockpit (`ManagerService.monthlyTrend`) : deux fenêtres, une seule requête.',
  },
  {
    label: 'consultants en mission',
    reason:
      'Aucune dérivation ne rend ce nombre. `MissionScoresService.capacity` rend des JOURS engagés, pas ' +
      'des personnes. Les deux côtés disponibles du vivier sont photographiés (`benchAvailable`, le ' +
      'champ déclaré ; `talents_available`, le dérivé des affectations), et déduire « en mission » = ' +
      '« effectif − vivier » serait un calcul de notre invention sur deux prédicats qui ne portent pas ' +
      'sur la même population.',
  },
]

/**
 * Ce qui n'a PAS de clé propre parce qu'il en avait déjà une — sous un autre nom.
 *
 * Trois compteurs des maquettes étaient listés ci-dessus comme « non
 * photographiés », et c'était devenu FAUX le jour où la photo a gagné sa colonne
 * `denominator` : « besoins ouverts », « missions actives » et « comptes
 * suivis » sont écrits en base tous les mois, comme POPULATION de la ligne
 * d'hygiène qui les rapporte. Il ne leur manquait qu'un nom — d'où
 * `METRIC_POPULATION_KEYS`, plus bas dans ce fichier, et non six clés de plus.
 *
 * On garde la trace ICI parce que la question va se reposer : la prochaine
 * personne qui cherche « pourquoi besoins ouverts n'est pas dans
 * `STOCK_METRIC_KEYS` » doit trouver la réponse, pas le silence.
 */
export const METRICS_READ_AS_POPULATIONS: readonly { label: string; population: MetricPopulationKey }[] = [
  { label: 'comptes suivis', population: 'followed_accounts' },
  { label: 'contacts de l’espace', population: 'workspace_contacts' },
  { label: 'projets en jeu', population: 'live_projects' },
  { label: 'missions actives', population: 'active_missions' },
  { label: 'besoins ouverts', population: 'open_needs' },
  { label: 'consultants de l’espace', population: 'workspace_consultants' },
]

/** Les métriques dont la photo porte une population de référence. */
export const METRICS_WITH_DENOMINATOR: readonly StockMetricKey[] = STOCK_METRIC_KEYS.filter(
  key => METRIC_SNAPSHOT_DENOMINATOR[key] !== null,
)

/* ------------------------------------------------------------------ */
/*  Les POPULATIONS, lisibles sous leur propre nom (31/08/2026)        */
/* ------------------------------------------------------------------ */

/**
 * Six compteurs que cinq écrans demandent, et qui étaient DÉJÀ photographiés —
 * comme DÉNOMINATEURS, donc invisibles à qui cherchait une clé de métrique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE REGISTRE PLUTÔT QUE SIX CLÉS DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Besoins ouverts », « missions actives » et « comptes suivis » sont écrits
 * trois fois dans `METRICS_NOT_PHOTOGRAPHED` comme NON photographiés, avec à
 * chaque fois la même raison : leur donner une clé propre créerait un second
 * endroit pour le même chiffre (GA-26), et pour « comptes suivis » cela aurait
 * en plus recopié le prédicat partagé `ACCOUNT_HYGIENE_PREDICATES.followedAccounts`
 * (garde GA-53).
 *
 * Cette raison était juste, et elle a été lue comme « ce chiffre n'est pas
 * comparable » — ce qui est FAUX. Le `total` de chaque ligne d'hygiène est
 * photographié depuis le 31/08/2026, mois après mois, dans la colonne
 * `denominator`. Il ne manquait qu'un NOM : un écran ne peut pas demander
 * « besoins ouverts » s'il doit d'abord savoir que c'est le dénominateur de
 * `needs_without_skills`.
 *
 * Le registre est donc une INDIRECTION, pas une seconde source : il n'ajoute
 * aucune requête, aucune clé en base, aucune valeur écrite. Il nomme ce que la
 * photo contient déjà.
 *
 * ⚠️ Deux métriques partagent la population « missions actives »
 * (`missions_without_end_date` et `missions_without_cost` : même `FROM missions
 * … status = 'active'`). Une seule est déclarée SOURCE — la première —, et
 * `metricSeriesDelta` ne lit qu'elle. Déclarer les deux aurait rendu la valeur
 * dépendante de l'ordre de lecture le jour où l'une des deux requêtes échoue et
 * pas l'autre : deux chiffres pour une question, exactement ce que ce fichier
 * refuse. Le test « deux populations ne désignent jamais la même métrique » le
 * tient.
 */
export const METRIC_POPULATION_KEYS = [
  /** Les comptes SUIVIS de l'espace (`watching`/`opportunity`/`customer`). */
  'followed_accounts',
  /** Tous les contacts de l'espace. */
  'workspace_contacts',
  /** Les opportunités encore EN JEU (`LIVE_STAGES`). */
  'live_projects',
  /** Les missions `status = 'active'`. */
  'active_missions',
  /** Les besoins encore OUVERTS. */
  'open_needs',
  /** Les consultants de l'espace (`kind = 'consultant'`). */
  'workspace_consultants',
] as const
export type MetricPopulationKey = (typeof METRIC_POPULATION_KEYS)[number]

/** De quelle photo chaque population est le DÉNOMINATEUR. */
export const METRIC_POPULATION_SOURCE: Record<MetricPopulationKey, StockMetricKey> = {
  followed_accounts: 'accounts_without_next_action',
  workspace_contacts: 'contacts_without_email',
  live_projects: 'projects_without_amount',
  // ⚠️ `missions_without_cost` porte la MÊME population ; elle n'est pas
  // déclarée ici — voir le docblock ci-dessus.
  active_missions: 'missions_without_end_date',
  open_needs: 'needs_without_skills',
  workspace_consultants: 'talents_unknown_availability',
}

/**
 * La série d'une POPULATION : un point par mois où elle a été lue.
 *
 * ⚠️ Un mois dont la population n'a pas été lue SORT de la série — il n'y
 * devient pas un zéro. C'est la même règle que pour les valeurs, et elle compte
 * autant : une population à zéro voudrait dire « l'espace n'a plus aucun
 * compte », une population absente veut dire « on n'a pas regardé ».
 *
 * ⚠️ Les points rendus ne portent AUCUN `denominator`. Une population n'est la
 * part de rien : lui en donner une inventerait une seconde population de
 * référence que rien ne mesure.
 */
export function metricPopulationPoints(series: MetricSeries | null | undefined): MetricPoint[] {
  if (!series || !Array.isArray(series.points)) return []
  const out: MetricPoint[] = []
  for (const point of series.points) {
    const total = point?.denominator
    if (!readable(total)) continue
    out.push({ month: point.month, value: total })
  }
  return out
}

/**
 * Le mois `AAAA-MM` situé `back` mois avant `month`.
 *
 * ⚠️ Le calcul part du PREMIER du mois, jamais du jour courant. `Date.UTC(2026,
 * 0, 31)` reculé d'un mois donne le 3 mars : reculer un 31 dans un mois de 28
 * jours déborde, et la comparaison « vs mois dernier » désignerait alors le
 * mois d'APRÈS. Le premier du mois n'a pas ce défaut, quel que soit le mois.
 */
function shiftMonth(month: string, back: number): string {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7))
  if (!Number.isFinite(year) || !Number.isFinite(index)) return month
  return new Date(Date.UTC(year, index - 1 - back, 1)).toISOString().slice(0, 7)
}

/** Ce qu'un écran peut demander : une métrique photographiée, ou une population. */
export type MetricDeltaTarget = StockMetricKey | MetricPopulationKey

/**
 * LA lecture des écrans — d'une réponse de série à une variation affichable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE, ALORS QUE `metricDelta` EST DÉJÀ « LA SEULE PORTE »
 * ─────────────────────────────────────────────────────────────────────────────
 * `metricDelta` répond à « quelle est la variation entre CES deux photos ». Elle
 * ne dit pas LESQUELLES : trouver la série, décider quel point est « le mois
 * courant », reculer d'un mois sans déborder sur février, et refuser un mois
 * voisin. Ces quatre décisions sont exactement le genre que cinq écrans
 * referaient chacun à leur façon — et le premier qui écrirait
 * `points[points.length - 2]` afficherait « vs mois dernier » sur une photo
 * vieille de trois mois le jour où le balayage aura manqué un passage.
 *
 * Elle DÉLÈGUE la variation elle-même : aucune soustraction ici.
 *
 * @param response La réponse de `GET /pilotage/metric-series`.
 * @param target   Une métrique photographiée, ou une population nommée.
 * @param options.months De combien de mois reculer. 1 = « vs mois dernier »,
 *                       12 = « vs N-1 ». Une valeur absurde se ramène à 1.
 *
 * @example
 * const delta = metricSeriesDelta(data, 'open_needs')
 * if (!delta.measured) return <UnknownValue reason={t(`delta.gap.${delta.gap}`)} />
 */
export function metricSeriesDelta(
  response: MetricSeriesResponse | null | undefined,
  target: MetricDeltaTarget,
  options?: { months?: number },
): MetricDelta {
  // Une borne absurde ne lève pas : « non mesuré » par exception priverait
  // l'écran de TOUTE lecture pour un paramètre mal formé.
  const back = Math.max(Math.trunc(options?.months ?? 1) || 1, 1)

  const population = (METRIC_POPULATION_SOURCE as Record<string, StockMetricKey | undefined>)[target]
  const sourceKey = population ?? (target as StockMetricKey)
  const series = response?.series?.find(entry => entry?.metricKey === sourceKey) ?? null

  // ⚠️ L'unité vient de la SÉRIE, pas du registre.
  //
  // Les deux disent la même chose aujourd'hui — le serveur remplit `unit` depuis
  // `METRIC_SNAPSHOT_UNIT`. Mais la relire ici serait une SECONDE dérivation de
  // la même question, et la première version de ce code l'a payée dans le quart
  // d'heure : une série servie en `ratio` était lue en `count`, donc rendue en
  // pourcentage au lieu de points. Le registre ne sert plus que de repli, pour
  // une série qui n'aurait pas d'unité.
  //
  // Une population, elle, se lit toujours en DÉNOMBREMENT : c'est un effectif,
  // quelle que soit l'unité de la métrique dont elle est le dénominateur — le
  // « sur 42 » d'un taux compte des comptes, pas des pour-cent.
  const unit: MetricUnit = population ? 'count' : (series?.unit ?? METRIC_SNAPSHOT_UNIT[sourceKey] ?? 'count')
  // ⚠️ Trié ICI, et pas « parce que le serveur trie ». Un `ORDER BY` est une
  // propriété de la requête d'aujourd'hui ; l'ordre est une PRÉCONDITION de ce
  // calcul. Deux lignes de tri valent mieux qu'un « vs mois dernier » qui
  // désigne un autre mois le jour où quelqu'un ajoute un `UNION`.
  const points = (population ? metricPopulationPoints(series) : (series?.points ?? []))
    .slice()
    .sort((a, b) => a.month.localeCompare(b.month))

  const current = points.length > 0 ? points[points.length - 1] : null
  if (!current) return { measured: false, gap: 'no_current_snapshot' }

  return metricDelta({ unit, previous: metricPointAt(points, shiftMonth(current.month, back)), current })
}
