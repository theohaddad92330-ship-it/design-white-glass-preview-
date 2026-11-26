import type { MarketResolution } from './market-company-resolution'

/**
 * #1617.4 — CE QU'UN HUMAIN A DÉCIDÉ D'UN RAPPROCHEMENT, ET COMMENT ÇA GAGNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST PUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `MarketReviewQueue.tsx` écrivait, avant ce lot, que « relation corrigée par
 * utilisateur » n'avait AUCUN mécanisme dans le produit. C'était exact : la
 * résolution se recalculait à chaque lecture, et la décision d'un humain
 * n'était gardée nulle part.
 *
 * La contrainte qui donne sa forme à la solution : **la mémoire marché est
 * PARTAGÉE entre des espaces qui sont des concurrents**. Une correction ne peut
 * donc pas réécrire l'observation commune — elle vit dans une table SCOPÉE, et
 * elle se SUPERPOSE à la lecture au moment de lire. Le registre des tables
 * l'avait déjà posé pour `market_company_signal` : « une correction d'espace
 * PRIME sur l'observation partagée sans jamais la réécrire ».
 *
 * Ce fichier ne lit ni base ni réseau : il porte la RÈGLE, et rien d'autre.
 * C'est ce qui la rend testable seule, et vérifiable sans monter un module.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CAS LIMITE QUI NE SE DEVINE PAS : `unavailable`
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux sens de l'override ne traitent pas la panne de la même façon, et
 * c'est délibéré :
 *
 * · POSITIF sur `unavailable` → il gagne. L'humain a désigné une entreprise ;
 *   ce fait ne dépend pas de notre capacité à lire le corpus ce matin.
 * · NÉGATIF sur `unavailable` → il ne gagne PAS. Un rejet écarte une lecture, et
 *   il n'y a rien à écarter quand on n'a rien lu. Rendre `unresolved` ici
 *   transformerait une panne en affirmation sur le marché — exactement ce que
 *   le quatrième état de `MarketResolution` a été créé pour empêcher.
 */

/** L'ambiguïté, reprise du type du calcul plutôt que redéclarée (GA-26). */
type Ambiguity = Extract<MarketResolution, { status: 'ambiguous' }>['ambiguity']

/**
 * Un rapprochement APRÈS passage de la revue humaine.
 *
 * ⚠️ C'est un type DISTINCT de `MarketResolution`, et c'est délibéré : le calcul
 * ne produit JAMAIS `'manual'`, ni un comptage inconnu. Élargir `MarketResolution`
 * aurait forcé cinq lecteurs du module à traiter des valeurs qu'ils ne peuvent
 * pas recevoir — une union qui ment sur ce qui peut arriver coûte plus cher
 * qu'un type de plus. Seuls les chemins qui LISENT la revue voient celui-ci.
 *
 * Les deux élargissements, tous deux en FIN d'union (GA-08) :
 * · `strength` / `matchedOn` gagnent `'manual'` — la décision d'un humain n'est
 *   ni un domaine ni une inférence, et c'est la provenance la plus forte ;
 * · `pathsTotal` gagne `null` — on connaît l'entreprise, pas son comptage.
 *   ⚠️ `null` n'est pas `0` : le seuil se teste `!== null && >= MIN`, jamais
 *   `(pathsTotal ?? 0) >= MIN`, qui ferait taire le compte qu'on vient de
 *   rattacher.
 */
type ReviewedResolution =
  | {
      readonly status: 'resolved'
      readonly companyKey: string
      readonly strength: 'domain' | 'inferred' | 'manual'
      readonly matchedOn: 'domain' | 'name' | 'alias' | 'manual'
      readonly pathsTotal: number | null
      readonly ambiguityDropped: Ambiguity | null
    }
  | Exclude<MarketResolution, { status: 'resolved' }>

/**
 * Une décision humaine sur le rapprochement d'UN compte, dans UN espace.
 *
 * Deux sens seulement, et jamais un troisième : soit l'humain désigne
 * l'entreprise du corpus qui correspond, soit il dit que la lecture proposée
 * n'est pas la bonne. « Je ne sais pas » n'est pas une décision — c'est l'état
 * par défaut, et il s'exprime par l'ABSENCE de ligne.
 */
export type MarketResolutionOverride =
  | {
      readonly kind: 'confirmed'
      /** La clé du corpus que l'humain a désignée. */
      readonly marketCompanyKey: string
      readonly reviewedAt: Date
      readonly reviewedBy: string
    }
  | {
      readonly kind: 'dismissed'
      readonly reviewedAt: Date
      readonly reviewedBy: string
    }

/**
 * Superpose une décision humaine à un rapprochement calculé.
 *
 * ⚠️ Rend l'objet d'ENTRÉE, à l'identité près, quand il n'y a rien à
 * superposer. Ce n'est pas une micro-optimisation : c'est la garantie qu'un
 * chemin sans revue est byte-identique au chemin d'avant ce lot.
 *
 * ⚠️ Ne porte JAMAIS `reviewedBy` dans son résultat. La résolution est un objet
 * de fait marché ; y faire voyager l'identité de qui a cliqué mélangerait une
 * personne à une observation, et cette information a sa place sur la ligne
 * stockée, pas ici.
 */
export function applyResolutionOverride(
  computed: MarketResolution,
  override: MarketResolutionOverride | null,
): ReviewedResolution {
  if (override === null) return computed

  if (override.kind === 'dismissed') {
    // Une panne n'est pas une lecture : il n'y a rien à écarter.
    if (computed.status === 'unavailable') return computed
    return { status: 'unresolved' }
  }

  // Le comptage ne se garde que s'il porte sur la MÊME entreprise. Sinon il est
  // inconnu — et « non mesuré » n'est jamais « 0 » : un zéro ici passerait sous
  // le seuil de couverture et ferait taire un compte que l'humain vient
  // justement de rattacher.
  const pathsTotal =
    computed.status === 'resolved' && computed.companyKey === override.marketCompanyKey ? computed.pathsTotal : null

  return {
    status: 'resolved',
    companyKey: override.marketCompanyKey,
    strength: 'manual',
    matchedOn: 'manual',
    pathsTotal,
    ambiguityDropped: null,
  }
}
