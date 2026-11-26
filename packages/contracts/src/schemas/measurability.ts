import { z } from 'zod'

/**
 * MESURABLE, PAS ENCORE MESURABLE — et de combien il manque.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION DE LOUIS (21/08), ET CE QU'ELLE CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt sait déjà dire « non mesuré » plutôt qu'afficher un zéro : c'est la
 * règle qui traverse le pilotage, le matching, la marge et les scores de
 * mission. Elle est bonne, et elle a un angle mort — **elle ne dit pas
 * pourquoi, ni quand ça viendra.**
 *
 * Un DSO calculé sur trois factures n'est pas un DSO : le publier ferait
 * prendre une décision sur du bruit. Mais un écran muet fait chercher une
 * panne, et l'utilisateur finit par conclure que la fonction ne marche pas.
 *
 * Ce module rend la troisième réponse : « non mesurable — 3 factures sur les 10
 * nécessaires ». L'utilisateur sait que ça vient, et ce qu'il doit faire pour
 * que ça vienne.
 */

/** Ce qu'on a, ce qu'il faut, et ce qui manque. */
export interface Measurability {
  measurable: boolean
  observed: number
  required: number
  /** Combien d'observations manquent. `0` dès que c'est mesurable. */
  missing: number
}

/** La même forme, en zod, pour les réponses qui la transportent sur le fil. */
export const measurabilitySchema = z.object({
  measurable: z.boolean(),
  observed: z.number().int().nonnegative(),
  required: z.number().int().positive(),
  missing: z.number().int().nonnegative(),
})

export function measurability(observed: number, required: number): Measurability {
  const safeObserved = Number.isFinite(observed) ? Math.max(0, Math.trunc(observed)) : 0
  const safeRequired = Math.max(1, Math.trunc(required))
  return {
    measurable: safeObserved >= safeRequired,
    observed: safeObserved,
    required: safeRequired,
    missing: Math.max(0, safeRequired - safeObserved),
  }
}

/**
 * Les seuils, par indicateur.
 *
 * Ils sont bas — dix factures, cinq missions — et c'est délibéré : le but est
 * d'écarter le bruit des tout premiers jours, pas d'attendre une significativité
 * statistique qu'un outil commercial n'atteindra jamais. Un seuil trop haut
 * produirait le même écran muet, avec une excuse en plus.
 */
export const MEASURABILITY_THRESHOLDS = {
  /** Délai de paiement moyen. Trois factures ne font pas une tendance. */
  dso: 10,
  /** Part du vivier en intercontrat. */
  benchRate: 5,
  /** Taux de transformation d'un positionnement. */
  submissionWinRate: 10,
  /** Marge moyenne d'un portefeuille de missions. */
  averageMargin: 5,
  /**
   * Délai médian entre l'envoi d'un positionnement et le premier retour.
   *
   * Ajouté le 26/08 : `medianDaysToFeedback` publiait une médiane dès le
   * PREMIER retour, avec l'autorité d'un « jours médians ». Un délai médian sur
   * deux observations n'est pas une mesure, c'est une anecdote — et celle-là
   * s'affiche à côté d'un taux d'acceptation qui, lui, refuse de se calculer
   * sans dénominateur.
   *
   * Cinq, comme l'intercontrat et la marge : le plus bas des seuils du produit,
   * parce que le but est d'écarter le bruit des premiers jours, pas d'attendre
   * une significativité qu'un outil commercial n'atteindra jamais.
   */
  submissionFeedbackDelay: 5,
  /**
   * Missions CLOSES nécessaires avant d'estimer un délai jusqu'à la première
   * facture (PDF 2 §7.4, `BEL-ACC-107` PR4).
   *
   * « `estimatedDays` est null tant que l'espace n'a pas 10 missions closes. On
   * ne devine pas un délai médian sur 2 observations. »
   *
   * ⚠️ DIX et non cinq, contrairement à ses voisins les plus bas, et la source
   * le fixe elle-même. La raison tient au CHEMIN mesuré : les autres seuils
   * portent sur UNE observation (une facture, un positionnement) ; celui-ci
   * porte sur huit étapes enchaînées, dont la dernière est une facture émise.
   * Une médiane par étape sur cinq missions serait une médiane sur cinq
   * anecdotes, et le total les additionnerait — huit fois le bruit.
   *
   * Même valeur que {@link dso}, et pourtant une entrée à part : ce sont DEUX
   * questions différentes (« combien de jours pour être payé » regarde l'aval,
   * « combien de jours jusqu'à la facture » regarde tout l'amont), et les
   * fusionner ferait bouger l'une le jour où quelqu'un règle l'autre.
   */
  firstEuroDelay: 10,
} as const
export type MeasurableIndicator = keyof typeof MEASURABILITY_THRESHOLDS

/**
 * LA PART DE CE QU'ON N'A PAS SU MESURER, en pourcentage — ou `null`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE DÉRIVATION EXISTE, ET POURQUOI ELLE VIT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux des cibles du PDF 5 §13.3 portent sur notre propre IGNORANCE — « marge
 * non mesurée < 10 % », « missions non mesurables < 20 % ». Elles ne disent rien
 * de la santé de l'ESN : elles disent à quel point les AUTRES chiffres méritent
 * d'être crus. Un espace dont 60 % des missions n'ont pas de coût saisi affiche
 * une marge qui ne décrit pas l'espace, et c'est le seul indicateur capable de
 * le dire.
 *
 * Les calculs comptaient déjà les deux populations — `aggregateMargin` rend
 * `measured` et `unmeasured` depuis des semaines. Ce qui manquait, c'est le
 * RATIO, et surtout son refus :
 *
 * ⚠️ **Zéro mission sur zéro n'est pas « 0 % non mesuré ».** C'est le piège
 * exact, et il est retors parce que le zéro tombe du bon côté : un espace vide
 * afficherait « 0 % de marge non mesurée · cible < 10 % » en VERT, c'est-à-dire
 * « nos données sont parfaites », alors qu'il n'y a rien à mesurer. Le
 * dénominateur nul rend `null`, et l'écran écrit « non mesuré ».
 *
 * Elle vit à UN seul endroit (GA-26) : deux chemins qui refont la même division
 * divergent — l'un arrondira, l'autre pas, et deux écrans donneront deux
 * pourcentages pour la même question.
 */
/**
 * UN QUOTIENT, OU RIEN — la seule division du produit, et ses trois refus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE (recette live du 30/08/2026, écran `/pilotage`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois chemins refaisaient la même division, et ils divergeaient exactement là
 * où c'était le plus dangereux :
 *
 *  - la chaîne commerciale ARRONDISSAIT au centième (`Math.round(x * 100) / 100`)
 *    avant de rendre son taux. Douze corrections sur deux mille cinq cents
 *    contacts en ressortaient à `0` — un zéro qu'aucune mesure n'avait produit.
 *    À l'écran : « Taux de correction **0 %** » à deux centimètres de
 *    « Éléments corrigés **12** ». Les deux chiffres de la MÊME carte se
 *    contredisaient, et c'est l'arrondi qui mentait ;
 *  - le pipeline du CRM ne l'arrondissait pas (`won / decided`) ;
 *  - le taux d'intercontrat encore autrement.
 *
 * Trois divisions, trois règles de bord, et un seul énoncé métier. « Une
 * dérivation vit à un seul endroit — deux chemins qui la refont divergent »
 * (GA-26) : celle-ci vit ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS REFUS, ET CE QU'ILS NE DISENT PAS PAREIL
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **dénominateur NUL** — « 0 % de réponse » sur un espace qui n'a jamais
 *     envoyé un message n'est pas une mesure, c'est une division par rien ;
 *  2. **un terme NON LU** — un taux dont on ignore un terme est une opinion ;
 *  3. **une entrée absurde** (`NaN`, infini) — une erreur de lecture ne se
 *     transforme pas en pourcentage.
 *
 * ⚠️ **Elle n'ARRONDIT pas, et c'est le point.** Arrondir est une décision
 * d'AFFICHAGE : c'est l'écran qui sait s'il a la place d'écrire « 0,48 % »,
 * « < 1 % » ou « 0 % ». Une dérivation qui arrondit détruit l'information avant
 * que quiconque ait pu choisir, et le zéro qu'elle fabrique est indiscernable
 * d'un zéro vrai.
 *
 * ⚠️ Et le refus symétrique est tout aussi important : **un numérateur nul sur
 * un dénominateur réel vaut bien `0`.** « 0 sur 12 besoins pris en charge » est
 * une mesure — c'est même exactement le décrochage que la chaîne existe pour
 * crier. Rendre `null` « par prudence » effacerait une information que l'espace
 * connaît parfaitement.
 */
export function measuredRate(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (numerator == null || denominator == null) return null
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator <= 0) return null
  return numerator / denominator
}

export function unmeasuredShare(measured: number, unmeasured: number): number | null {
  if (!Number.isFinite(measured) || !Number.isFinite(unmeasured)) return null
  const safeMeasured = Math.max(0, Math.trunc(measured))
  const safeUnmeasured = Math.max(0, Math.trunc(unmeasured))
  const total = safeMeasured + safeUnmeasured
  if (total === 0) return null
  return Number(((safeUnmeasured / total) * 100).toFixed(1))
}

/**
 * Le délai moyen de paiement, sur les factures RÉELLEMENT payées.
 *
 * Trois refus portés par le calcul, et chacun évite un chiffre faux :
 *
 * 1. **Une facture non payée n'entre pas.** Elle n'a pas de délai — elle a un
 *    retard, ce qui est une autre question. L'inclure avec « aujourd'hui » comme
 *    date de paiement ferait monter le DSO chaque jour sans qu'aucun fait
 *    nouveau ne se produise.
 * 2. **Une facture sans date d'émission ou sans date de paiement n'entre pas**,
 *    et elle est COMPTÉE à part : un historique mal daté ne doit pas se lire
 *    comme un historique court.
 * 3. **Un délai négatif est écarté** (payée avant d'être émise) : c'est une
 *    erreur de saisie, et la moyenne d'une erreur reste une erreur.
 *
 * Un QUATRIÈME refus vit en amont, dans la requête, et il est nommé sur
 * `DsoResult.disputed` ci-dessous.
 */
export interface PaidInvoice {
  invoicedAt: string | null
  paidAt: string | null
}

export interface DsoResult {
  /** `null` tant que le seuil n'est pas atteint — jamais un chiffre provisoire. */
  days: number | null
  measurability: Measurability
  /** Factures écartées faute de dates exploitables. Comptées, jamais absorbées. */
  undatable: number
  /**
   * Factures écartées parce que le client CONTESTE — comptées, jamais absorbées.
   *
   * L'exclusion est juste et vit dans le `WHERE` de la requête : le temps qu'une
   * facture contestée met à être réglée mesure la durée d'une négociation, pas
   * la ponctualité d'un client. Elle porte sur l'OUVERTURE du litige et jamais
   * sur sa levée — lever un litige ne réécrit pas le temps qu'il a fait perdre.
   *
   * Ce qui manquait, c'est de le DIRE. Une médiane muette sur ce qu'elle a sorti
   * ment dans les deux sens : la facture contestée gonflerait le délai alors que
   * le client n'a rien à payer tant que le litige dure, et la sortir en silence
   * cache de l'argent qui ne rentre pas.
   *
   * ⚠️ `null` = **on n'a pas su compter**, et c'est un état à part entière.
   * `0` = **aucune facture contestée**, qui est une mesure VRAIE et se lit comme
   * telle. Les écrire pareil ferait dire « rien à signaler » à une lecture
   * ratée — le défaut exact que `undatable` avait déjà appris à éviter.
   */
  disputed: number | null
}

/**
 * Ce que le calcul n'a pas pu voir, et qu'il doit pourtant nommer.
 *
 * ⚠️ `disputed` est REQUIS, et ce n'est pas une rigueur gratuite. Les factures
 * contestées sont retirées par le SQL : `computeDso` ne peut pas les déduire de
 * ses entrées, et un paramètre optionnel se serait fait oublier au premier
 * appelant ajouté — « paramètre déclaré, jamais passé » est un défaut déjà payé
 * dans ce dépôt. Le type pose donc la question à chaque appelant : **combien en
 * as-tu sorties ?** `null` est une réponse recevable ; l'absence de réponse, non.
 *
 * NON exporté : il n'est consommé que dans ce fichier, et le dépôt interdit
 * d'exporter un type qui ne sort pas — les appelants le satisfont par sa forme.
 */
interface DsoExclusions {
  required?: number
  disputed: number | null
}

export function computeDso(invoices: readonly PaidInvoice[], exclusions: DsoExclusions): DsoResult {
  const required = exclusions.required ?? MEASURABILITY_THRESHOLDS.dso
  // Un compte négatif ou absurde n'est pas « zéro contestée » : c'est une
  // lecture qu'on ne sait pas interpréter, donc `null`.
  const disputed =
    exclusions.disputed === null || !Number.isFinite(exclusions.disputed) || exclusions.disputed < 0
      ? null
      : Math.trunc(exclusions.disputed)
  const delays: number[] = []
  let undatable = 0
  for (const invoice of invoices) {
    if (!invoice.paidAt) continue // impayée : un retard, pas un délai
    const issued = invoice.invoicedAt ? Date.parse(invoice.invoicedAt) : Number.NaN
    const paid = Date.parse(invoice.paidAt)
    if (Number.isNaN(issued) || Number.isNaN(paid)) {
      undatable += 1
      continue
    }
    const days = Math.round((paid - issued) / 86_400_000)
    if (days < 0) {
      undatable += 1
      continue
    }
    delays.push(days)
  }
  // ⚠️ Le seuil porte sur ce qui est CALCULÉ, jamais sur ce qui est écarté :
  // trente factures contestées ne rendent pas mesurable un DSO qui n'a qu'une
  // observation. Les compter ici ferait publier une médiane sur une facture.
  const state = measurability(delays.length, required)
  if (!state.measurable) return { days: null, measurability: state, undatable, disputed }
  // MÉDIANE et non moyenne : une facture payée à 180 jours après relance
  // judiciaire déplacerait une moyenne de plusieurs semaines et ferait croire à
  // une dégradation générale. Même arbitrage que le temps de réponse du §12.
  const sorted = [...delays].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle]
  return { days: median, measurability: state, undatable, disputed }
}
