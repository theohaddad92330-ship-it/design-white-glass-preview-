import { DATA_SOURCE_LABEL_KEYS } from '@/lib/data-source-label'
import type { DiscoverDegradedSource } from './discover-types'

/**
 * Trie `degraded[]` par NATURE — quatre affirmations très différentes que le
 * backend range volontairement dans un seul tableau.
 *
 * Elles arrivent ensemble, délibérément côté IA : un client qui ne connaît pas
 * encore `coverage` ou `kind` doit quand même apprendre ce qui s'est passé.
 * Mais les AFFICHER ensemble, dans le bandeau ambre « une source est tombée »,
 * revient à énoncer des choses fausses :
 *
 * - `not-examined` (#649) — ranger des entreprises jamais regardées à côté
 *   d'homonymies tranchées leur attribue un verdict jamais rendu ;
 * - `capability` — `unsupported_filters` dit *results broader than requested* :
 *   la source A répondu, elle n'a pas su exprimer un critère, donc elle a rendu
 *   un SUR-ensemble. « N'a pas répondu » et « liste incomplète » sont deux faux,
 *   et le second est même à l'envers ;
 * - `no-match` — « rien ne correspond » est une réponse, pas une panne. C'est
 *   le cas COURANT du waterfall (Pappers ne matche rien, gouv.fr rend 24
 *   lignes) : le peindre en ambre faisait du bandeau un bruit permanent.
 *
 * - `ambiguous` (#1766) — plusieurs entités du registre portent le même nom et
 *   aucune ne domine. La source A RÉPONDU, parfaitement : c'est NOUS qui
 *   n'avons pas su trancher, et aucun SIREN n'a été inventé. Le peindre en
 *   ambre lui faisait dire « une source n'a pas pu répondre », ce qui est faux
 *   — même famille de défaut que les trois précédentes, trouvée en creusant le
 *   retour client du 09/09 ;
 * - `unmeasured` (#2165.28 / #2165.30) — un filtre serveur mémoire marché
 *   (« technologies observées », « recours externe observé ») a écarté des
 *   comptes dont la donnée est INCONNUE, pas fausse : ni une panne, ni un
 *   compte qui « ne correspond pas ». Doctrine c65 (GA-259) : le peindre en
 *   ambre laisserait croire à une source tombée là où c'est juste une donnée
 *   qui manque pour CE compte.
 *
 * Ce qui reste — `faults` — est ce qui est réellement cassé, et doit rester
 * bruyant : c'est la raison d'être du mécanisme (#631, un rate-limit rendu
 * comme un fait de marché).
 *
 * **Le défaut est fail-loud** : une entrée sans `kind`, ou avec un `kind` qu'on
 * ne connaît pas, est une panne. Sous-alerter coûte plus cher que sur-alerter,
 * donc toute raison future reste dans le bandeau tant que personne ne l'a
 * classée. Le tri porte sur `kind`, JAMAIS sur le texte de `reason`.
 */
/** Sources d'OFFRES d'emploi (identifiants machine émis par l'IA). Elles ne PRODUISENT
 *  aucun candidat : elles ne font que garnir des cartes déjà rendues. */
const JOBS_SOURCES = new Set(['france_travail', 'france-travail', 'apec', 'job_aggregators'])

/** DISCOVER-PARTIEL-2 (16/10) — sources qui garnissent une CARTE (avis de marchés, annonces légales,
 *  levées, presse, offres fusionnées) : comme les offres, elles n'enlèvent aucune entreprise. Leur panne
 *  ne dit donc jamais « la liste est incomplète » : une phrase neutre à part (`cardFaults`). Le registre
 *  qui PRODUIT la liste, lui, reste une panne, sous sa propre famille. */
const CARD_SOURCES = new Set(['boamp', 'eu_tenders', 'bodacc', 'funding_feed', 'press', 'offers'])

/** #3901 — raison DIFFÉRÉE : nous avons cessé d'attendre (notre limiteur de débit ou notre
 *  budget de temps). Rien n'a échoué chez la source ; la ligne « offres en cours » le dit. */
const DEFERRED_REASONS = new Set(['time_budget'])

/** #4677 — la moisson de signaux des cartes (`discover-signals`). Son DÉLAI n'enlève aucune entreprise :
 *  elle finit en arrière-plan, la carte porte « signaux en cours ». Seule une vraie panne est dite. */
const SIGNALS_HARVEST_SOURCE = 'discover-signals'

export function splitDegraded(
  degraded: readonly DiscoverDegradedSource[],
  /** #4677 — `volumeReached` : « volume demandé atteint » est affiché ; un DÉLAI ne peut pas dire « partiel »
   *  au-dessus d'une liste qui a tenu son volume (deux affirmations qui ne sont pas vraies ensemble). */
  options: { volumeReached?: boolean } = {},
): {
  faults: DiscoverDegradedSource[]
  ambiguities: DiscoverDegradedSource[]
  notExamined: DiscoverDegradedSource | null
  capabilities: DiscoverDegradedSource[]
  unmeasured: DiscoverDegradedSource[]
  anglesMissing: DiscoverDegradedSource[]
  /** #3901 — offres vraiment illisibles (erreur, 4xx/5xx, réseau) : aucune entreprise en moins. */
  jobsFaults: DiscoverDegradedSource[]
  /** DISCOVER-PARTIEL-2 — données de cartes (marchés publics…) vraiment illisibles : aucune entreprise en moins. */
  cardFaults: DiscoverDegradedSource[]
} {
  const faults: DiscoverDegradedSource[] = []
  const ambiguities: DiscoverDegradedSource[] = []
  const capabilities: DiscoverDegradedSource[] = []
  const unmeasured: DiscoverDegradedSource[] = []
  const anglesMissing: DiscoverDegradedSource[] = []
  const jobsFaults: DiscoverDegradedSource[] = []
  const cardFaults: DiscoverDegradedSource[] = []
  let notExamined: DiscoverDegradedSource | null = null

  for (const entry of degraded) {
    if (entry.reason === 'time_budget') {
      if (entry.source.trim().toLowerCase() === SIGNALS_HARVEST_SOURCE && entry.kind === undefined) continue
      // Les offres et données de cartes en délai sont déjà absorbées plus bas : seul le registre est concerné.
      if (options.volumeReached && entry.kind === undefined) continue
    }
    // #2496 — le MODÈLE ne produit jamais la liste, seulement l'angle
    // d'approche (« le registre produit la liste, le LLM ne produit que
    // l'angle »). Son absence n'enlève donc aucune entreprise : la ranger dans
    // les pannes affichait « Résultats partiels — le modèle d'analyse —
    // injoignable » au-dessus d'une liste complète (production, 17/09/2026).
    // Tri sur la SOURCE, pas sur le texte de `reason`.
    if (DATA_SOURCE_LABEL_KEYS[entry.source.trim().toLowerCase()] === 'analysisModel') anglesMissing.push(entry)
    // #3901 — une source d'OFFRES n'enlève aucune entreprise de la liste. DIFFÉRÉE par notre
    // propre cadence : elle s'absorbe (la ligne « offres en cours » la porte, tant qu'il reste
    // des cartes non cherchées). Vraiment tombée : son propre seau, sa propre phrase — jamais
    // « la liste est incomplète » (production, 15/10/2026).
    else if (JOBS_SOURCES.has(entry.source.trim().toLowerCase()) && entry.kind === undefined) {
      if (!DEFERRED_REASONS.has(entry.reason)) jobsFaults.push(entry)
    } else if (CARD_SOURCES.has(entry.source.trim().toLowerCase()) && entry.kind === undefined) {
      if (!DEFERRED_REASONS.has(entry.reason)) cardFaults.push(entry)
    } else if (entry.kind === 'not-examined') notExamined = entry
    else if (entry.kind === 'capability') capabilities.push(entry)
    // #1766 — un verdict rendu sur la DONNÉE, pas une panne de réseau.
    else if (entry.kind === 'ambiguous') ambiguities.push(entry)
    // #2613 — ce seau ABSORBE, il n'affiche plus. Décision de Louis du
    // 20/09/2026 : le bandeau qui comptait ces comptes écartés a été retiré
    // (« on affiche pas ce qu'on a pas »). Le tri, lui, reste indispensable :
    // sans cette branche, un filtre serveur sur donnée inconnue retomberait
    // dans `faults` et serait peint en panne ambre — ce qu'interdit GA-259
    // (#2165.28 / #2165.30). Ne pas afficher n'est pas la même chose que ne
    // pas classer.
    else if (entry.kind === 'unmeasured') unmeasured.push(entry)
    // `no-match` n'est ni l'un ni l'autre : une réponse négative n'est pas un
    // incident, et le nombre de résultats affichés la raconte déjà.
    else if (entry.kind !== 'no-match') faults.push(entry)
  }

  return { faults, ambiguities, notExamined, capabilities, unmeasured, anglesMissing, jobsFaults, cardFaults }
}

/**
 * #1766 — CE QUI EMPÊCHE DE CONCLURE, et qui n'est donc PAS une réponse sur les
 * filtres de l'utilisateur.
 *
 * Deux natures, un seul effet : une source tombée (`faults`) n'a rien pu dire ;
 * une homonymie non tranchée (`ambiguities`) a été regardée sans qu'on puisse
 * l'attribuer. Dans les deux cas la bonne phrase est « je n'ai rien pu
 * vérifier », jamais « rien ne correspond à ce que tu cherches ».
 *
 * La dérivation vit ICI, à un seul endroit : l'écran la consulte deux fois (le
 * bandeau à masquer, l'état à rendre) et deux calculs qui divergeraient
 * rendraient à nouveau les deux ensemble — le défaut exact du 09/09.
 */
export function unverifiableReasons(split: ReturnType<typeof splitDegraded>): DiscoverDegradedSource[] {
  return [...split.faults, ...split.ambiguities]
}
