/**
 * LIRE CE QU'ON SAIT DÉJÀ NE COÛTE RIEN — LA CLASSIFICATION, ÉCRITE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE ALORS QUE LE COMPORTEMENT ÉTAIT DÉJÀ BON
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 11/09/2026, avant la première ligne de ce lot : **aucune des sept
 * lectures ci-dessous ne débitait quoi que ce soit.** Les modules
 * `market-memory/`, `account-intelligence/`, `zero-layer/` et
 * `consultants/matching/` ne contiennent pas une seule occurrence du mot
 * « credit » ; `search_market_memory` est un outil du copilote, dont le poids
 * de grille (`copilot_message`) vaut 0.
 *
 * Le point « 0 crédit » était donc DÉJÀ VRAI. Ce fichier ne le rend pas vrai :
 * il le rend **VÉRIFIABLE**. La différence n'est pas rhétorique — un
 * comportement juste que rien ne tient redevient faux le jour où quelqu'un
 * ajoute un débit « pour être cohérent avec le reste », et personne ne le voit
 * avant le relevé d'un client. C'est très exactement ce que le dépôt a déjà
 * payé sur `refresh:<dimension>`, dont le prix AFFICHÉ et le prix DÉBITÉ
 * venaient de deux sources différentes.
 *
 * La garde qui s'appuie sur ce fichier vit côté API
 * (`architecture/market-memory-reads-are-free.spec.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FRONTIÈRE, EN UNE PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Un crédit paie du TRAVAIL NOUVEAU, jamais une lecture.** Relire une ligne
 * déjà en base ne déclenche aucun appel réseau, aucun fournisseur, aucun
 * modèle : la facturer ferait payer deux fois une donnée déjà acquise. Aller
 * demander au web ce qui est vrai AUJOURD'HUI coûte de l'argent réel, à chaque
 * fois — et c'est ce que le crédit achète.
 *
 * ⚠️ Ce fichier ne fixe AUCUN prix. Les montants sont dérivés de
 * `credit-weights.ts` à la lecture. Recopier « 1 » ou « 8 » ici fabriquerait
 * une seconde vérité qui se périmerait sans prévenir — la leçon que
 * `credit-weights.ts` porte déjà dans son propre en-tête : « un miroir juste
 * redevient faux ; un renvoi, jamais. »
 */

import { type CreditedAction, creditCostOf } from './credit-weights.js'

/** Une lecture qui ne débite rien, et la raison pour laquelle elle ne débite rien. */
export type FreeMarketRead = {
  /** L'identifiant du geste — stable, cité par la garde côté API. */
  readonly key: string
  /** Ce que l'utilisateur croit faire quand il le fait. */
  readonly label: string
  /** POURQUOI c'est gratuit. Une classification sans raison est une opinion. */
  readonly why: string
  /**
   * L'action de la grille qui la recouvre, quand il y en a une. `null` quand le
   * geste n'est pas une action facturable du tout — la majorité des cas ici :
   * une lecture n'entre pas dans une grille de facturation, elle en SORT.
   */
  readonly gridAction: CreditedAction | null
  /** Toujours 0. Écrit pour que la garde ait quelque chose à comparer. */
  readonly creditCost: 0
}

/**
 * LES SEPT LECTURES QUI NE DÉBITENT RIEN.
 *
 * L'ordre est celui du retour #1639, pour qu'une relecture croisée soit
 * possible sans traduction.
 */
export const MARKET_MEMORY_FREE_READS: readonly FreeMarketRead[] = [
  {
    key: 'market_memory_filters',
    label: 'Filtres mémoire marché',
    why: 'Un filtre restreint une liste déjà en base — il ne va rien chercher dehors. Le portefeuille est déjà payé, le corpus est déjà là.',
    gridAction: null,
    creditCost: 0,
  },
  {
    key: 'search_market_memory',
    label: 'Recherche dans la mémoire marché',
    why: "Une requête SQL sur le corpus partagé, sans aucun appel fournisseur. Exposée au copilote comme outil, elle hérite du poids d'un échange de copilote, qui est nul.",
    gridAction: 'copilot_message',
    creditCost: 0,
  },
  {
    key: 'account_intelligence_context',
    label: 'Contexte d’intelligence de compte',
    why: "Une lecture croisée de ce que l'espace sait déjà du compte. Elle n'ajoute aucune information au dossier : elle range celles qui y sont.",
    gridAction: null,
    creditCost: 0,
  },
  {
    key: 'reverse_market_structural',
    label: 'Reverse Market structurel',
    why: "Un rapprochement DÉTERMINISTE entre le vivier et le corpus, sans appel de modèle : deux exécutions rendent le même résultat. C'est ce qui le rend gratuit, et le dire est un argument.",
    gridAction: 'need_matching',
    creditCost: 0,
  },
  {
    key: 'onboarding',
    label: 'Prise en main',
    why: "Faire découvrir le produit ne se facture pas : un crédit dépensé avant la première valeur reçue est un crédit qu'on n'a pas vendu.",
    gridAction: null,
    creditCost: 0,
  },
  {
    key: 'local_affinity',
    label: 'Calcul local d’affinité',
    why: "Un recoupement entre les expertises déclarées de l'espace et les piles observées du corpus, calculé en mémoire. Rien ne sort du service.",
    gridAction: null,
    creditCost: 0,
  },
  {
    key: 'market_context_read',
    label: 'Consultation du contexte marché',
    why: "Afficher ce qui est déjà stocké. La collecte a été payée une fois, par celui qui l'a déclenchée — la relire est incluse.",
    gridAction: null,
    creditCost: 0,
  },
]

/** Un geste qui va vérifier AUJOURD'HUI, donc qui coûte. */
export type PaidMarketVerification = {
  readonly key: string
  readonly label: string
  /** L'action de la grille — la SEULE source du prix. */
  readonly gridAction: CreditedAction
  /** Le prix, dérivé de la grille à la lecture de ce module. Jamais recopié. */
  readonly creditCost: number
}

/**
 * CE QUE LE CRÉDIT ACHÈTE, EN FACE DE CHAQUE LECTURE GRATUITE.
 *
 * La paire est le message : « ce que je sais est inclus · le vérifier
 * aujourd'hui coûte X ». Affichée seule, la moitié gratuite passe pour de la
 * générosité ; affichée seule, la moitié payante passe pour une taxe.
 */
export const MARKET_MEMORY_PAID_VERIFICATIONS: readonly PaidMarketVerification[] = [
  {
    key: 'targeted_refresh',
    label: 'Vérifier un axe aujourd’hui',
    gridAction: 'targeted_refresh',
    creditCost: creditCostOf('targeted_refresh'),
  },
  {
    key: 'account_analysis',
    label: 'Analyser le compte aujourd’hui',
    gridAction: 'account_analysis',
    creditCost: creditCostOf('account_analysis'),
  },
]

/**
 * LES NOMS DES COMPTEURS — À UN SEUL ENDROIT (GA-26).
 *
 * Deux ÉVÉNEMENTS et deux PROPRIÉTÉS, et ce n'est pas un détail de forme :
 * `market_candidates_before` / `after` ne sont pas des événements, ce sont les
 * deux mesures d'un même geste. En faire deux événements distincts aurait
 * rendu impossible de les rapprocher — deux lignes séparées dans un journal
 * append-only ne se rejoignent que par une jointure qu'on aurait dû inventer.
 *
 * ⚠️ **Ces compteurs restent PAR ESPACE.** Ils comptent des candidats et des
 * gestes, jamais des euros, et ils ne s'agrègent pas entre espaces : les
 * espaces sont des ESN, donc des concurrents, et croiser leurs coûts d'accès
 * serait un échange d'informations tarifaires (`COMMUNITY_FORBIDDEN_KINDS.cost`,
 * GA-43).
 */
export const MARKET_MEMORY_TELEMETRY = {
  prefilterEvent: 'market_prefilter_used',
  paidVerificationEvent: 'paid_verification_triggered',
  candidatesBeforeProperty: 'market_candidates_before',
  candidatesAfterProperty: 'market_candidates_after',
} as const

/**
 * LE CINQUIÈME COMPTEUR, ET POURQUOI IL N'EXISTE PAS.
 *
 * Le retour demande `paid_calls_avoided`. Il n'est pas livré, et l'absence est
 * délibérée : **« évité » n'est pas une mesure, c'est une soustraction contre
 * un monde qui n'a pas eu lieu.** Pour l'écrire il faudrait savoir combien
 * d'appels payants l'utilisateur AURAIT déclenchés sans le préfiltre — or il
 * n'a jamais eu à le décider, puisque le préfiltre a tourné avant lui.
 *
 * Le chiffre serait flatteur (il compterait comme « économisé » chaque compte
 * que personne n'aurait analysé de toute façon), impossible à démentir, et il
 * finirait dans une phrase commerciale. C'est la même faute que « 72 % de
 * couverture » lu comme « 72 % externalisent » : un nombre juste sur ce qu'il
 * mesure, faux sur ce qu'on lui fait dire.
 *
 * Ce qui EST mesuré à la place est un fait vérifiable, relevé au même endroit
 * et au même instant : le nombre de candidats que le préfiltre a réellement
 * retirés AVANT que le moindre appel payant soit possible. La démonstration
 * économique se fait avec ça, ou elle ne se fait pas.
 */
export const PAID_CALLS_AVOIDED_REFUSAL = {
  counter: 'paid_calls_avoided',
  why: "Contrefactuel : il faudrait connaître les appels payants que l'utilisateur aurait déclenchés sans le préfiltre, or il n'a jamais eu à les décider.",
  measuredInstead: 'market_candidates_before − market_candidates_after',
} as const

/** Ce qu'un préfiltre a réellement fait — trois nombres, tous relevés. */
export type MarketPrefilterMeasure = {
  readonly candidatesBefore: number
  readonly candidatesAfter: number
  readonly candidatesRemoved: number
}

/** Un entier positif ou nul, et rien d'autre. */
function isCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0
}

/**
 * LA MESURE DU PRÉFILTRE, DÉRIVÉE À UN SEUL ENDROIT.
 *
 * `null` — jamais un objet à zéros — dans les trois cas où il n'y a rien à
 * mesurer :
 *
 *  · **rien en entrée.** Un portefeuille vide n'a pas été « filtré à 0 % » : il
 *    n'a pas été filtré. Rendre `{ removed: 0 }` se lirait comme « le préfiltre
 *    n'a servi à rien », qui est une affirmation, alors qu'on n'a rien observé ;
 *  · **plus de sortants que d'entrants.** Un préfiltre RETIRE. Un « −3 retirés »
 *    voyagerait jusqu'à un écran sans que rien ne le rattrape ;
 *  · **une valeur qui n'est pas un compte** (NaN, décimale, négative) — elle
 *    vient forcément d'un appelant cassé, et la propager en ferait un chiffre.
 *
 * Un préfiltre qui n'a retiré personne, LUI, rend bien `removed: 0` : on a
 * mesuré, et la réponse mesurée est zéro. C'est toute la distinction entre
 * « non mesuré » et « mesuré à zéro ».
 */
export function measureMarketPrefilter(input: {
  candidatesBefore: number
  candidatesAfter: number
}): MarketPrefilterMeasure | null {
  const { candidatesBefore, candidatesAfter } = input
  if (!isCount(candidatesBefore) || !isCount(candidatesAfter)) return null
  if (candidatesBefore === 0) return null
  if (candidatesAfter > candidatesBefore) return null
  return { candidatesBefore, candidatesAfter, candidatesRemoved: candidatesBefore - candidatesAfter }
}
