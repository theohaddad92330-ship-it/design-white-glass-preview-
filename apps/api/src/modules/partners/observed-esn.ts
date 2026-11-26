import type { AccountPartner, MarketEsnObserved, PartnerEvidenceOrigin } from '@bellum/contracts'
import { marketMatchKey } from '../market-memory/market-company-key'

/**
 * Une société de services OBSERVÉE autour d'un compte, confrontée à ce que
 * l'espace sait déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ON NE FUSIONNE PAS, ET POURQUOI ON NE DOUBLONNE PAS NON PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet porte déjà deux natures de preuve : ce qu'un humain a DÉCLARÉ, et ce
 * que l'analyse a DÉTECTÉ dans des sources actuelles. L'observation en est une
 * troisième, et elle ne se range dans aucune des deux :
 *
 * · Elle ne remplace pas la détection. Une détection dit « une source actuelle
 *   suggère que cette société intervient » ; une observation dit « des parcours
 *   relient les deux organisations ». Écraser l'une par l'autre perdrait
 *   l'information qui distingue « aujourd'hui » de « structurellement ».
 * · Elle ne s'ajoute pas non plus en double. Voir « ALTEN » deux fois dans une
 *   même liste, une fois détectée et une fois observée, se lit comme deux
 *   sociétés — c'est le défaut que la ligne `alsoKnown` évite.
 *
 * Quand les deux CONCORDENT, on le dit : c'est l'information la plus forte de
 * l'écran, deux chemins indépendants qui pointent au même endroit. Quand elles
 * DIVERGENT, les deux restent — aucune ne l'emporte, et c'est au commercial de
 * trancher avec ce qu'il sait.
 *
 * ⚠️ Une observation n'est jamais une présence actuelle. Elle ouvre un chemin
 * POTENTIEL à qualifier, jamais un « accès rang 2 connu ».
 */
export interface ObservedEsnLine extends MarketEsnObserved {
  /**
   * Vrai quand cette société est DÉJÀ dans la liste de l'espace — déclarée par
   * quelqu'un ou détectée par l'analyse. Les deux sources concordent alors, et
   * l'écran le dit au lieu d'afficher la même société deux fois.
   */
  readonly alsoKnown: boolean
}

/**
 * Confronte les observations à ce que l'espace connaît déjà.
 *
 * Le rapprochement passe par LA MÊME normalisation que le reste de la mémoire
 * marché : « Groupe SII » et « SII » sont la même société, et les afficher
 * séparément produirait exactement le doublon qu'on cherche à éviter.
 *
 * L'ordre du corpus est conservé — il est déjà trié par nombre de parcours, et
 * re-trier ici ferait une seconde source de vérité sur l'ordre.
 */
export function markObservedAgainstKnown(
  observed: readonly MarketEsnObserved[],
  knownNames: readonly string[],
): ObservedEsnLine[] {
  const known = new Set(knownNames.map(name => marketMatchKey(name)).filter(key => key.length > 0))

  return observed.map(entry => ({
    ...entry,
    alsoKnown: known.has(marketMatchKey(entry.esnName)),
  }))
}

/**
 * #1605 — UNE LIGNE PAR ESN, TOUTES SES PREUVES CONSERVÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA CHANGE PAR RAPPORT AU DOCBLOC CI-DESSUS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * #1579 raisonnait ainsi : « fusionner perdrait ce qui distingue AUJOURD'HUI de
 * STRUCTURELLEMENT, donc on garde deux listes et un drapeau `alsoKnown` ». Le
 * souci était juste ; la conclusion était une première approximation.
 *
 * Le retour #1605 donne la bonne forme : **on fusionne la LIGNE, on garde les
 * PREUVES**. « ALTEN » apparaît une fois, en portant simultanément « déclarée
 * par ton équipe », « observation Bellum » et « source actuelle ». Rien n'est
 * perdu — c'est même la seule forme qui MONTRE que trois chemins indépendants
 * pointent au même endroit, ce que deux listes séparées obligeaient à déduire.
 *
 * ⚠️ **Une déclaration humaine n'est jamais remplacée par une observation.** Le
 * nom affiché reste celui de la ligne du portefeuille — le corpus écrit
 * « SOCIETE GENERALE », le commercial a tapé « SG », et c'est le sien qui reste.
 * Doctrine du dépôt, et le retour le redemande explicitement.
 *
 * ⚠️ Le rapprochement passe par LA MÊME normalisation que le reste de la mémoire
 * marché (`marketMatchKey`) : une seconde dérivation divergerait de la première.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1590.7 — CETTE FUSION RESTE CÔTÉ TYPESCRIPT, ET C'EST UNE DÉCISION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour #1590 demande la même fusion « observée + détectée » un cran plus
 * haut, DANS le producteur (`apps/ia/app/services/esn_presence.py`,
 * `build_esn_presence`) : « ESN observée ET détectée → une seule entrée,
 * certitude montée, pas de doublon » (son test T7). Elle ne s'y fera pas, et
 * la raison tient en quatre points — la même décision est écrite dans le
 * fichier Python, pour qu'elle ne se re-propose pas d'un seul côté.
 *
 * 1. **Le résultat demandé est DÉJÀ livré, ici, en aval.** `build_esn_presence`
 *    écrit `raw_analysis.esnPresence` → `AccountsService.seedDetectedPartners`
 *    en fait des lignes `account_partners` (`source = 'analysis'`) →
 *    `PartnersService.landscape` appelle cette fonction. « Une seule entrée,
 *    pas de doublon » est exactement ce que fait `mergePartnerEvidence`, et sur
 *    une entrée STRICTEMENT plus large que celle du producteur : elle voit
 *    aussi ce qu'un humain a DÉCLARÉ, que le service IA n'a pas.
 *
 * 2. **« Certitude montée » serait une PERTE d'information ici.** `_certainty`
 *    côté Python écrase trois corroborations en un mot (forte / moyenne /
 *    faible) ; `evidence_origins` les NOMME une par une
 *    (`workspace_declared`, `market_observation`, `current_inference`) et
 *    l'écran lit la liste. Remonter la fusion, ce serait remplacer « trois
 *    chemins indépendants pointent au même endroit » par « forte ».
 *
 * 3. **Fusionner en amont promouvrait une OBSERVATION en DÉTECTION.** Une
 *    entrée de `esnPresence` devient une ligne `account_partners` en
 *    `source = 'analysis'`, que cette fonction traduit ensuite en
 *    `current_inference` — « une source ACTUELLE suggère que cette société
 *    intervient ». C'est faux d'une observation de parcours, et le docblock
 *    ci-dessus le dit : « une observation n'est jamais une présence actuelle ».
 *    Le corpus n'a pas de dates ; il ne peut pas fonder un « aujourd'hui ».
 *
 * 4. **Porter `marketMatchKey` en Python serait une TROISIÈME recopie
 *    manuelle, moins gardable que les précédentes.** #1799 a payé deux
 *    implémentations divergentes du filtre de plausibilité ; la parité s'y
 *    prouve en comparant le TEXTE de chaque regex
 *    (`apps/ia/tests/test_esn_presence_ts_parity.py`), et `\p{Ll}` a déjà
 *    forcé une exception documentée. `marketMatchKey` n'est pas une regex :
 *    c'est un PIPELINE (NFD, retrait des diacritiques, ponctuation repliée)
 *    plus un ensemble de treize mots de structure. Aucune comparaison
 *    textuelle ne le garde ; seule une recopie à la main le porterait, et
 *    c'est précisément ce que #1799 interdit d'ajouter. Le service IA n'a par
 *    ailleurs pas le corpus — il ne reçoit que la couverture d'UNE entreprise
 *    — donc la clé n'y servirait qu'à se dédoublonner lui-même, jamais à la
 *    jointure pour laquelle elle existe.
 *
 * Le test `#1590.7` de `merge-partner-evidence.spec.ts` tient la PRÉMISSE de
 * cette décision : le jour où cette fusion cesserait de rapprocher deux
 * variantes du même nom, la raison n°1 tomberait — et le test le dirait avant
 * que quiconque re-propose le portage.
 */
export interface PartnerEvidence {
  readonly evidence_origins: PartnerEvidenceOrigin[]
  /** `null` — et jamais `0` — quand le corpus n'observe pas cette société. */
  readonly market_observation_count: number | null
}

export function mergePartnerEvidence<T extends Pick<AccountPartner, 'name' | 'source'>>(
  partners: readonly T[],
  observed: readonly MarketEsnObserved[],
): { partners: (T & PartnerEvidence)[]; unmatched: ObservedEsnLine[] } {
  const observedByKey = new Map<string, MarketEsnObserved>()
  for (const entry of observed) {
    const key = marketMatchKey(entry.esnName)
    // Le corpus est déjà dédupliqué par clé ; en cas de collision on garde la
    // PREMIÈRE, qui est la plus observée (l'ordre du corpus est conservé).
    if (key.length > 0 && !observedByKey.has(key)) observedByKey.set(key, entry)
  }

  const matched = new Set<string>()
  const merged = partners.map(partner => {
    const key = marketMatchKey(partner.name)
    const hit = key.length > 0 ? observedByKey.get(key) : undefined
    if (hit) matched.add(key)

    const origins: PartnerEvidenceOrigin[] = []
    // L'ordre est celui de la FORCE de la preuve, pas celui de l'alphabet : une
    // déclaration humaine passe devant, et l'écran lit la liste dans l'ordre.
    if (partner.source === 'declared') origins.push('workspace_declared')
    if (hit) origins.push('market_observation')
    if (partner.source === 'analysis') origins.push('current_inference')

    return {
      ...partner,
      evidence_origins: origins,
      market_observation_count: hit ? hit.persons : null,
    }
  })

  // Ce que le corpus observe et que l'espace ne connaît PAS encore : ce sont les
  // seules lignes qui restent dans le bloc « observées ». Une société déjà dans
  // la liste n'y réapparaît plus — c'est le doublon que le retour vise.
  const unmatched: ObservedEsnLine[] = observed
    .filter(entry => {
      const key = marketMatchKey(entry.esnName)
      return key.length === 0 || !matched.has(key)
    })
    .map(entry => ({ ...entry, alsoKnown: false }))

  return { partners: merged, unmatched }
}
