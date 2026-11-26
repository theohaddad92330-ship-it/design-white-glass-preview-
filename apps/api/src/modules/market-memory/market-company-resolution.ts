import { MARKET_MEMORY_MIN_PATHS } from '@bellum/contracts'

/**
 * L'ARBITRE UNIQUE du rapprochement entre un compte et la mémoire marché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI L'A RENDU NÉCESSAIRE (#1617)
 * ─────────────────────────────────────────────────────────────────────────────
 * `match_key` et `website_domain` portent des index NON UNIQUES sur 60 067
 * entreprises (`1791743186247-MarketMemory.ts:91,94`). Les deux chemins de
 * lecture faisaient pourtant chacun un choix SILENCIEUX quand plusieurs lignes
 * répondaient :
 *
 *   · `resolve()` appelait `findOne({ where: { matchKey } })` — la PREMIÈRE
 *     ligne rendue par la base, sans `ORDER BY`, donc sans garantie ;
 *   · `pathsFor()` écrasait `best.set(ref, …)` à chaque ligne — la DERNIÈRE.
 *
 * Les deux lectures du même compte pouvaient donc désigner deux entreprises
 * différentes. C'est la forme la plus coûteuse du défaut « deux lectures qui
 * divergent », déjà payée deux fois sur ce module (2873db015, e067ab929) — sauf
 * qu'ici aucune des deux n'était CHOISIE : c'était l'ordre de lecture.
 *
 * Le retour le dit mieux que nous : **« une mauvaise jointure est pire qu'une
 * absence de donnée »**. L'erreur est invisible, elle se propage dans un prompt,
 * et elle ressort en réunion sous la forme d'une affirmation fausse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une ambiguïté qu'on ne sait pas trancher ne se tranche pas au hasard, elle
 * se DIT.** Un côté ambigu ne contribue rien ; l'autre côté, s'il tranche, est
 * retenu ; et l'ambiguïté écartée voyage avec le résultat pour que le rapport
 * « résolutions à revoir » puisse la compter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #1617 DEMANDE ET QUE LA DONNÉE NE PERMET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour pose une hiérarchie à cinq échelons : SIREN → identifiant de
 * registre + pays → domaine canonique → identifiant LinkedIn → nom. Le corpus
 * n'en porte que deux :
 *
 *   · pas de SIREN, pas d'identifiant de registre — `market_company_signal` ne
 *     porte aucune de ces colonnes ;
 *   · pas d'identifiant LinkedIn — les trois fichiers du corpus qui portent une
 *     URL de profil ne sont PAS importés, et ce refus est gardé.
 *
 * Le seul échelon supplémentaire réellement disponible est le **pays**, et il
 * sert : deux « CGI » dans deux pays ne sont pas la même entreprise. Le reste de
 * la hiérarchie ne s'invente pas — un identifiant qu'on n'a pas ne départage
 * rien, et prétendre l'appliquer donnerait une fausse assurance.
 *
 * ⚠️ L'ARBITRAGE MESURÉ RESTE EN VIGUEUR, ET IL CONTREDIT LE RETOUR. #1617 pose
 * « domaine > nom » comme un ordre fixe. La production a montré l'inverse sur CE
 * corpus : `group.bnpparibas` y est porté par une filiale à 1 parcours pendant
 * que la maison mère, à 282, porte un autre domaine. **Un candidat sous le seuil
 * ne porte aucune information** — le préférer jette un signal réel pour du
 * silence. La règle mesurée tient donc, et c'est délibéré.
 */

/** Une ligne du corpus, réduite à ce dont l'arbitrage a besoin. */
export interface MarketCandidate {
  readonly companyKey: string
  readonly companyName: string
  readonly matchKey: string
  readonly websiteDomain: string | null
  readonly country: string | null
  readonly pathsTotal: number
}

/** Ce qui n'a pas pu être départagé, et sur quel côté. */
interface MarketAmbiguity {
  readonly on: 'domain' | 'name'
  readonly candidates: number
}

/**
 * Le résultat d'un rapprochement — trois états, jamais un `null` muet.
 *
 * `unresolved` (personne ne répond) et `ambiguous` (plusieurs répondent) se
 * rendaient tous les deux `null` avant ce lot, ce qui est exactement la
 * confusion que le produit refuse ailleurs : « pas couvert » n'est pas « pas
 * lu ». Un compte non couvert est un fait sur le marché ; un compte ambigu est
 * un défaut de NOTRE rapprochement, et lui seul appelle une revue humaine.
 */
export type MarketResolution =
  | {
      readonly status: 'resolved'
      readonly companyKey: string
      readonly strength: 'domain' | 'inferred'
      /**
       * #1756 — PAR QUEL CÔTÉ le rapprochement a été fait.
       *
       * Distinct de `strength`, qui dit sa FORCE : `name` et `alias` sont tous
       * deux `inferred`, et pourtant ils ne se valent pas. Un alias est une
       * équivalence DÉCIDÉE par un humain ou par un pack de données, donc une
       * APPROXIMATION qu'il faut pouvoir compter à part — un lot qui rapproche
       * enfin des comptes doit pouvoir dire COMBIEN il en rapproche par
       * approximation, sinon on ne saura jamais si la table d'alias aide ou
       * dérive.
       */
      readonly matchedOn: 'domain' | 'name' | 'alias'
      readonly pathsTotal: number
      /** L'ambiguïté écartée sur l'AUTRE côté, s'il y en avait une. */
      readonly ambiguityDropped: MarketAmbiguity | null
    }
  | { readonly status: 'ambiguous'; readonly ambiguity: MarketAmbiguity }
  | { readonly status: 'unresolved' }
  /**
   * ⚠️ Le quatrième état, et il n'est PAS de trop : le service garantit à ses
   * appelants qu'il ne jette jamais. Sans lui, une panne de lecture retomberait
   * sur `unresolved` — c'est-à-dire « le marché ne connaît pas ce compte », une
   * affirmation, alors qu'on n'a rien lu. C'est la même distinction que
   * `MarketMemoryRead` tient déjà : « pas couvert » n'est pas « pas lu ».
   */
  | { readonly status: 'unavailable'; readonly reason: string }

/** Ce que l'appelant sait du compte en plus de son nom et de son site. */
interface MarketResolutionHints {
  /** Le pays du compte, dans n'importe quelle casse. Absent = on ne devine pas. */
  readonly country?: string | null
}

/** Un pays comparable — la casse et les espaces ne distinguent pas deux pays. */
function foldCountry(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

type Narrowed = { readonly pick: MarketCandidate | null; readonly ambiguity: MarketAmbiguity | null }

/**
 * Un seul candidat, ou l'aveu qu'on ne sait pas lequel.
 *
 * Le pays est le seul départage supplémentaire disponible, et il ne s'applique
 * QUE si l'appelant le connaît : départager sur un pays deviné reviendrait à
 * fabriquer la certitude qu'on cherche à mesurer.
 */
function narrow(candidates: readonly MarketCandidate[], on: 'domain' | 'name', hints: MarketResolutionHints): Narrowed {
  if (candidates.length === 0) return { pick: null, ambiguity: null }
  if (candidates.length === 1) return { pick: candidates[0]!, ambiguity: null }

  const country = foldCountry(hints.country)
  if (country) {
    const sameCountry = candidates.filter(row => foldCountry(row.country) === country)
    if (sameCountry.length === 1) return { pick: sameCountry[0]!, ambiguity: null }
  }

  return { pick: null, ambiguity: { on, candidates: candidates.length } }
}

/**
 * L'arbitrage, appliqué aux DEUX chemins de lecture — `resolve` et `pathsFor`.
 *
 * ⚠️ Cette fonction est le SEUL endroit où le choix se fait. Deux chemins qui le
 * referaient divergeraient, et c'est exactement le défaut que ce module a déjà
 * payé : le tableau de bord affichait 282 parcours sur un compte dont l'onglet
 * Partenaires ne montrait aucune société observée.
 */
export function resolveMarketCompany(
  byDomain: readonly MarketCandidate[],
  byName: readonly MarketCandidate[],
  hints: MarketResolutionHints,
  /**
   * #1756 — LE TROISIÈME CANDIDAT, en DERNIER dans la signature comme dans
   * l'ordre de préférence.
   *
   * Optionnel et en fin de liste pour rester strictement ADDITIF : aucun appel
   * existant ne change, et une omission vaut « pas d'alias », c'est-à-dire le
   * comportement d'avant ce lot. L'ordre de préférence, lui, ne se lit PAS dans
   * la signature — il est écrit dans le corps, à un seul endroit.
   */
  byAlias: readonly MarketCandidate[] = [],
): MarketResolution {
  const domain = narrow(byDomain, 'domain', hints)
  const name = narrow(byName, 'name', hints)

  const domainCovered = (domain.pick?.pathsTotal ?? 0) >= MARKET_MEMORY_MIN_PATHS
  const nameCovered = (name.pick?.pathsTotal ?? 0) >= MARKET_MEMORY_MIN_PATHS

  // 1. les deux couverts → le domaine ; 2. un seul couvert → lui ;
  // 3. aucun couvert → le domaine s'il existe. La règle mesurée en production.
  const chosen: { row: MarketCandidate; strength: 'domain' | 'inferred'; matchedOn: 'domain' | 'name' } | null =
    domain.pick
      ? domainCovered || !nameCovered
        ? { row: domain.pick, strength: 'domain', matchedOn: 'domain' }
        : { row: name.pick!, strength: 'inferred', matchedOn: 'name' }
      : name.pick
        ? { row: name.pick, strength: 'inferred', matchedOn: 'name' }
        : null

  if (chosen) {
    // L'ambiguïté de l'AUTRE côté n'annule pas un rapprochement qui, lui,
    // tranche — mais elle se garde : c'est ce que le rapport « à revoir » compte.
    const dropped = chosen.strength === 'domain' ? name.ambiguity : domain.ambiguity
    return {
      status: 'resolved',
      companyKey: chosen.row.companyKey,
      strength: chosen.strength,
      matchedOn: chosen.matchedOn,
      pathsTotal: chosen.row.pathsTotal,
      ambiguityDropped: dropped,
    }
  }

  // Aucun côté ne tranche. Le domaine se rapporte en premier : c'est la
  // prétention la plus forte, donc celle dont l'ambiguïté mérite d'être vue.
  //
  // ⚠️ #1756 — L'AMBIGUÏTÉ PASSE AVANT L'ALIAS, et c'est délibéré. Un alias ne
  // TRANCHE jamais entre deux candidats qui se disputent déjà : « plusieurs
  // répondent » resterait vrai, et un rapprochement qui tranche au nom d'une
  // équivalence déclarée serait exactement la mauvaise jointure que ce module
  // refuse depuis #1617 — « pire qu'une absence de donnée ».
  const ambiguity = domain.ambiguity ?? name.ambiguity
  if (ambiguity) return { status: 'ambiguous', ambiguity }

  // #1756 — L'ALIAS NE RATTRAPE QUE LE SILENCE TOTAL : zéro candidat des deux
  // côtés, le cas très exact de « SG SOCIETE GENERALE ». C'est aussi ce qui rend
  // ce lot additif — la seule issue qui change est `unresolved` → `resolved`.
  //
  // ⚠️ Il DÉSIGNE ou il se tait : deux entreprises visées par un même alias ne
  // se départagent pas ici. Le stockage a le droit d'enregistrer cette
  // ambiguïté-là (l'index est non unique, à dessein) ; la lecture n'a pas le
  // droit d'en choisir une. Le journal, lui, la compte — voir
  // `MarketMemoryService.reportResolutions`.
  const aliasPick = byAlias.length === 1 ? byAlias[0]! : null
  if (aliasPick) {
    return {
      status: 'resolved',
      companyKey: aliasPick.companyKey,
      // La force reste FAIBLE : une équivalence déclarée n'est pas un domaine
      // racine partagé. `matchedOn` dit ce que `strength` ne peut pas dire.
      strength: 'inferred',
      matchedOn: 'alias',
      pathsTotal: aliasPick.pathsTotal,
      ambiguityDropped: null,
    }
  }

  return { status: 'unresolved' }
}
