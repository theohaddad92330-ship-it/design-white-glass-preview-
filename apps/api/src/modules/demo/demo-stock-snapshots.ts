import {
  METRIC_SNAPSHOT_DENOMINATOR,
  STOCK_METRIC_PROVENANCE,
  monthsBackLastDay,
  type StockMetricKey,
} from '@bellum/contracts'

/**
 * Les photos mensuelles de la salle de démonstration (D2 / D49 du 26/08,
 * étendues le 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS MOIS, ET PAS UN
 * ─────────────────────────────────────────────────────────────────────────────
 * Une seule photo suffisait tant que l'écran ne savait comparer que « la valeur
 * d'aujourd'hui » à « la photo du mois dernier ». Depuis que la lecture de
 * série existe (`seriesFor` + `metricDelta`), **une variation se calcule entre
 * DEUX PHOTOS** — et avec un seul mois semé, chaque écran de la démonstration
 * répondrait `no_previous_snapshot`, c'est-à-dire « non mesuré ».
 *
 * Ce serait juste, et catastrophique en réunion : un prospect verrait « non
 * mesuré » partout et conclurait que le produit ne sait pas mesurer. Trois mois
 * donnent deux variations consécutives, donc une TENDANCE lisible — ce que les
 * maquettes montrent.
 *
 * ⚠️ Les dates sont CALCULÉES à chaque semis, jamais écrites en dur. Une date
 * figée cesserait d'être « le mois dernier » au premier changement de mois, la
 * lecture ne trouverait plus rien, et la démonstration retomberait muette sans
 * qu'aucun test ne rougisse — le défaut « code juste, jamais RE-exécuté », en
 * pire, parce qu'ici c'est la DONNÉE qui périme.
 *
 * ⚠️ Ces valeurs sont FICTIVES, comme tout le contenu de la salle. Elles ne
 * sortent pas d'une mesure et ne sont écrites que sur l'espace de
 * démonstration : le balayage mensuel, lui, ne photographie jamais que ce que
 * les dérivations rendent. C'est la même frontière que pour les trois dossiers
 * d'exemple — la salle est un décor assumé, la production ne l'est pas.
 */

/** Une photo d'un mois : la valeur, et la population sur laquelle elle porte. */
type DemoStockMonth = Record<StockMetricKey, { value: number; denominator: number | null }>

/**
 * L'histoire que la salle raconte, du plus ANCIEN au plus RÉCENT.
 *
 * Elle est cohérente à dessein : une équipe qui grandit (le portefeuille et le
 * vivier montent) ET qui rattrape sa qualité de donnée (les listes de travail
 * baissent). Deux courbes qui vont dans le même sens ne montreraient qu'une
 * moitié du produit.
 *
 * ⚠️ Les dénominateurs suivent la même histoire : le portefeuille passe de 34 à
 * 42 comptes suivis. C'est ce qui rend la démonstration honnête — « 9 comptes
 * sans prochaine action sur 34 » puis « 7 sur 42 » est une AMÉLIORATION que le
 * seul compteur ferait passer pour un statu quo.
 *
 * ⚠️ `benchAvailable` et `activeClients` n'ont PAS de dénominateur, ici comme
 * en production : leur dérivation (`gatherInputs`) rend des dénombrements nus.
 * En inventer un pour faire joli en démonstration serait montrer une capacité
 * que le produit n'a pas.
 *
 * ⚠️ QUATRE exceptions au mouvement, À DESSEIN (#3298 reste, 30/09/2026) :
 * `talents_unknown_availability`, `missions_without_cost`,
 * `missions_without_end_date` et `contacts_without_email` gardent la MÊME
 * valeur sur les trois mois. Ce sont, mot pour mot, les indicateurs `watch`
 * des trois points d'ordre du jour de la revue mensuelle (« Moyens : vivier et
 * intercontrat », « Tableau de bord du mois », « Qualité des données »,
 * `ritual.ts`) — le seul rituel du catalogue dont au moins un point observe un
 * compteur de stock. Sans ce plateau, aucun rituel de la salle ne peut jamais
 * afficher le verdict `no_measurable_effect` (`detectRitualEffectiveness`) :
 * la revue trimestrielle n'observe aucun compteur (`watch: []` partout), et la
 * revue mensuelle voyait jusqu'ici ses QUATRE indicateurs bouger — jamais
 * `no_measurable_effect`, jamais démontrable en salle. Les dénominateurs, eux,
 * continuent de grandir (le portefeuille reste honnête) : seul le NUMÉRATEUR
 * — ce que `metricDelta` compare pour un compteur `count` — reste figé.
 */
const DEMO_MONTHS: readonly DemoStockMonth[] = [
  // Il y a trois mois — le point de départ.
  {
    benchAvailable: { value: 2, denominator: null },
    activeClients: { value: 1, denominator: null },
    accounts_without_next_action: { value: 11, denominator: 34 },
    contacts_without_email: { value: 52, denominator: 180 },
    projects_without_amount: { value: 9, denominator: 14 },
    missions_without_end_date: { value: 4, denominator: 9 },
    needs_without_skills: { value: 6, denominator: 11 },
    // Figé (#3298 reste) : voir le docblock au-dessus de `DEMO_MONTHS`.
    talents_unknown_availability: { value: 7, denominator: 22 },
    missions_without_cost: { value: 5, denominator: 9 },
    needs_without_positioning: { value: 7, denominator: 11 },
    timesheets_to_validate: { value: 9, denominator: 14 },
    invoices_ready: { value: 4, denominator: 9 },
    talents_available: { value: 4, denominator: 22 },
  },
  // Il y a deux mois — le portefeuille s'ouvre, la qualité commence à monter.
  {
    benchAvailable: { value: 3, denominator: null },
    activeClients: { value: 1, denominator: null },
    accounts_without_next_action: { value: 9, denominator: 38 },
    contacts_without_email: { value: 52, denominator: 195 },
    projects_without_amount: { value: 7, denominator: 15 },
    missions_without_end_date: { value: 4, denominator: 10 },
    needs_without_skills: { value: 5, denominator: 12 },
    talents_unknown_availability: { value: 7, denominator: 24 },
    missions_without_cost: { value: 5, denominator: 10 },
    needs_without_positioning: { value: 5, denominator: 12 },
    timesheets_to_validate: { value: 6, denominator: 16 },
    invoices_ready: { value: 6, denominator: 10 },
    talents_available: { value: 5, denominator: 24 },
  },
  // Le mois DERNIER — la base de comparaison que les deux écrans de pilotage
  // lisent déjà (`baselineFor`), inchangée dans son rôle.
  {
    benchAvailable: { value: 3, denominator: null },
    activeClients: { value: 1, denominator: null },
    accounts_without_next_action: { value: 5, denominator: 42 },
    contacts_without_email: { value: 52, denominator: 210 },
    projects_without_amount: { value: 6, denominator: 16 },
    missions_without_end_date: { value: 4, denominator: 11 },
    needs_without_skills: { value: 4, denominator: 13 },
    talents_unknown_availability: { value: 7, denominator: 26 },
    missions_without_cost: { value: 5, denominator: 11 },
    // Les besoins orphelins baissent PENDANT que les besoins ouverts montent
    // (11 → 13) : c'est exactement l'histoire que le dénominateur existe pour
    // rendre lisible, et un compteur nu la ferait passer pour un statu quo.
    needs_without_positioning: { value: 3, denominator: 13 },
    timesheets_to_validate: { value: 4, denominator: 18 },
    // Les factures prêtes MONTENT, et c'est une bonne nouvelle : la préparation
    // avance. Le sens de lecture n'est pas le même que sur les listes de
    // travail juste au-dessus — la démonstration montre donc les deux.
    invoices_ready: { value: 8, denominator: 11 },
    talents_available: { value: 7, denominator: 26 },
  },
]

/** Combien de mois la salle porte. Deux au minimum, sinon aucune variation. */
export const DEMO_SNAPSHOT_MONTHS = DEMO_MONTHS.length

/** Une ligne à semer. NON exportée : elle n'est consommée que dans ce fichier —
 *  les appelants lisent les valeurs, jamais le type (règle knip du dépôt). */
type DemoStockSnapshotRow = {
  workspaceId: string
  takenOn: string
  metricKey: string
  value: number
  provenance: string
  denominator: number | null
}

/**
 * Les lignes à écrire pour un espace de démonstration.
 *
 * Le mois le plus récent porte le dernier jour du mois écoulé — exactement le
 * jour que le balayage mensuel écrirait —, et les précédents remontent d'un
 * mois chacun. Le décalage passe par `monthsBackLastDay` (contrats) plutôt que
 * par une arithmétique locale : reculer d'un mois depuis le 31 janvier donne le
 * 3 mars si on le fait naïvement.
 */
export function demoStockSnapshotRows(workspaceId: string, now: Date = new Date()): DemoStockSnapshotRow[] {
  return DEMO_MONTHS.flatMap((month, index) => {
    // Le DERNIER élément du tableau est le mois le plus récent (`monthsBack` = 1).
    const monthsBack = DEMO_MONTHS.length - index
    const takenOn = monthsBackLastDay(now, monthsBack)
    return Object.entries(month).map(([metricKey, point]) => ({
      workspaceId,
      takenOn,
      metricKey,
      value: point.value,
      provenance: STOCK_METRIC_PROVENANCE[metricKey as StockMetricKey],
      // Une population que la production ne saurait pas lire n'est pas inventée
      // ici non plus — le registre dit lesquelles n'en ont pas.
      denominator: METRIC_SNAPSHOT_DENOMINATOR[metricKey as StockMetricKey] === null ? null : point.denominator,
    }))
  })
}
