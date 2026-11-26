import type { BusinessCurrent, BusinessMonth, MonthlyClientMovement, TreasuryView } from '@/lib/business-metrics'
import type { BellumMargin } from '@/lib/costs'
import { lectureDeLaMarge } from '@/app/couts/couts.logic'
import { formaterEuros, libelleMois, metriquesDerivees } from '@/app/revenus/revenus.logic'
import { libelleRunway } from '@/app/revenus/tresorerie/tresorerie.logic'

/**
 * Ce que le cockpit business CALCULE, séparé de ce qu'il rend (#1646).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE DÉRIVATION VIT À UN SEUL ENDROIT (GA-26) — CE QUE CE FICHIER RÉUTILISE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le MRR, la marge, le burn et le runway sont DÉJÀ calculés ailleurs :
 *  - `metriquesDerivees` (`@/app/revenus/revenus.logic`) pour le taux d'attrition
 *    (churn logo) — mêmes refus, mêmes phrases, mêmes gardes contre un mois sans
 *    terme de comparaison.
 *  - `lectureDeLaMarge` (`@/app/couts/couts.logic`) pour la marge brute — y
 *    compris le refus RÉEL en production (`currency_mismatch`, D436).
 *  - `libelleRunway` (`@/app/revenus/tresorerie/tresorerie.logic`) pour le
 *    runway et sa phrase de refus.
 * Ce fichier ne les refait JAMAIS : il les appelle et met en forme ce qu'ils
 * rendent. Les seules choses NOUVELLES ici sont : le pourcentage de variation
 * d'une tuile (qui n'existe nulle part ailleurs dans ce dépôt), et le refus du
 * tableau des mouvements par client (#1646.4 — voir plus bas).
 */

/**
 * Ce qu'une tuile du cockpit affiche — jamais moins que sa période.
 *
 * Local : chaque fonction `tuile*` ci-dessous l'exporte par TRANSITIVITÉ (son
 * type de retour), mais rien n'importe `TuileCockpit` PAR SON NOM ailleurs —
 * l'écran spread directement `{...tuileMrr(...)}` dans `<KpiTile>`. Un type
 * exporté sans lecteur qui l'importe est celui que knip refuse.
 */
type TuileCockpit = {
  label: string
  value: string | number | null
  /** `null` = non mesuré. JAMAIS 0 % par défaut — `KpiTile`/`Delta` le rendent « non mesuré », pas une stagnation. */
  delta: number | null
  period: string
}

/**
 * La variation en % entre une valeur ACTUELLE et une valeur DE RÉFÉRENCE.
 *
 * ⚠️ `null` dès qu'un terme manque OU que la référence n'est pas STRICTEMENT
 * positive : diviser par une base nulle ou négative ne produirait pas un
 * pourcentage lisible, ça produirait un nombre qui en a l'air. Question qui
 * tranche (doctrine) : si cette valeur est absente, « 0 % » est-il VRAI ?
 */
export function pourcentageVariation(actuel: number | null, reference: number | null): number | null {
  if (actuel == null || reference == null || reference <= 0) return null
  return ((actuel - reference) / reference) * 100
}

/** MRR — la position du MOMENT (`current`), le delta vs le dernier mois FIGÉ. */
export function tuileMrr(current: BusinessCurrent, dernier: BusinessMonth | null): TuileCockpit {
  return {
    label: 'MRR',
    value: formaterEuros(current.mrrCents),
    delta: pourcentageVariation(current.mrrCents, dernier?.mrrEndCents ?? null),
    period: dernier ? `vs ${libelleMois(dernier.month)}` : 'aucun mois figé pour comparer',
  }
}

/** Clients — le compte du MOMENT, le delta vs le dernier mois FIGÉ. */
export function tuileClients(current: BusinessCurrent, dernier: BusinessMonth | null): TuileCockpit {
  return {
    label: 'Clients',
    value: current.customers,
    delta: pourcentageVariation(current.customers, dernier?.customersEnd ?? null),
    period: dernier ? `vs ${libelleMois(dernier.month)}` : 'aucun mois figé pour comparer',
  }
}

/**
 * Taux d'attrition — le churn logo du dernier mois FIGÉ, réutilisé depuis
 * `metriquesDerivees` (une seule entrée y correspond : `cle === 'churn_logo'`).
 *
 * ⚠️ Le DELTA reste TOUJOURS `null`, et c'est un choix documenté plutôt qu'un
 * oubli : le calculer demanderait de reconstruire, en dehors de
 * `metriquesDerivees`, la même division (clients partis ÷ clients au début) sur
 * le mois qui PRÉCÈDE le dernier mois figé — une SECONDE dérivation du même
 * calcul, que GA-26 interdit. « Non mesuré » reste vrai : ce dépôt n'a nulle
 * part ailleurs un delta de churn mois/mois à réutiliser.
 */
export function tuileAttrition(series: readonly BusinessMonth[]): TuileCockpit {
  const dernier = series[series.length - 1] ?? null
  const metriques = metriquesDerivees(series)
  const churn = metriques.find(metrique => metrique.cle === 'churn_logo')
  const valeur = churn?.valeur ?? { mesure: false as const, raison: 'Non mesurable : aucun mois figé.' }
  // ⚠️ Le pied d'une tuile fait 141 px. La raison de `/revenus` est écrite pour
  // une page, pas pour un pied : « Non mesurable : aucun mois figé. La série
  // commence au premier instantané. » y rend 73 caractères et casse la rangée.
  // On garde la CAUSE, la phrase complète reste sur /revenus. Même défaut que
  // `tuileMarge`, trouvé par la garde et pas à l'œil : deux occurrences.
  const causeCourte = 'aucun mois figé'
  return {
    label: 'Taux d’attrition',
    value: valeur.mesure ? valeur.texte : null,
    delta: null,
    // ⚠️ Narrowé sur `valeur.mesure` SEUL : un `&&` composé avec `dernier`
    // empêcherait TypeScript de discriminer l'union dans la branche « sinon »
    // (elle resterait `{mesure:true}|{mesure:false}`, et `.raison` n'existerait
    // plus dessus). `dernier` non nul est garanti par construction quand
    // `valeur.mesure` est vrai — `metriquesDerivees` ne mesure jamais le churn
    // logo sans dernier mois.
    period: valeur.mesure ? (dernier ? libelleMois(dernier.month) : '') : causeCourte,
  }
}

/**
 * Marge brute — réutilise `lectureDeLaMarge` (D436) telle quelle, y compris son
 * refus RÉEL en production (`currency_mismatch` : le revenu est en EUR, les
 * coûts fournisseurs en USD, et Bellum ne convertit rien).
 *
 * ⚠️ Le DELTA reste TOUJOURS `null` : l'endpoint ne rend qu'une FENÊTRE
 * glissante (30 jours par défaut), jamais une série de mesures comparables —
 * il n'existe rien à soustraire d'un mois à l'autre.
 */
export function tuileMarge(marge: BellumMargin | null, panne: string | null): TuileCockpit {
  const lecture = lectureDeLaMarge(marge, panne)
  return {
    label: 'Marge brute',
    value: lecture.valeur,
    delta: null,
    // ⚠️ La forme COURTE, jamais `raison` : ce pied de tuile fait 141 px, et
    // la raison longue est écrite pour la page /couts, où elle a la place.
    // Mesuré en recette : 405 caractères y rendaient 270 px de haut contre ~90
    // pour les cinq tuiles voisines, en débordant sur la suivante.
    period: lecture.raisonCourte,
  }
}

/** Burn — le dernier mois de trésorerie SAISI, le delta vs le mois précédent. */
export function tuileBurn(treasury: TreasuryView): TuileCockpit {
  const dernier = treasury.months.at(-1) ?? null
  const avantDernier = treasury.months.at(-2) ?? null
  return {
    label: 'Burn',
    value: formaterEuros(dernier?.burnCents ?? null),
    delta: pourcentageVariation(dernier?.burnCents ?? null, avantDernier?.burnCents ?? null),
    period: dernier ? libelleMois(dernier.month) : 'aucun mois saisi',
  }
}

/**
 * Runway — réutilise `libelleRunway` telle quelle.
 *
 * ⚠️ Le DELTA reste TOUJOURS `null` : le runway est une mesure PONCTUELLE
 * (solde ÷ burn moyen glissant des 3 derniers mois), pas une série de runways
 * passés. Le recalculer à une date antérieure redériverait `runwayMonths`, qui
 * vit côté API et n'est pas exposé ici — une seconde dérivation, interdite par
 * GA-26.
 */
export function tuileRunway(treasury: TreasuryView): TuileCockpit {
  const lecture = libelleRunway(treasury.runway)
  return {
    label: 'Runway',
    value: lecture.valeur,
    delta: null,
    period: lecture.note,
  }
}

/* ───────────────────────── #1646.6 — les mouvements par client ───────────────────────── */

/**
 * Les quatre natures d'un mouvement de MRR, telles que l'API les nomme déjà
 * (`mrr-movements.ts`).
 */
type MouvementNature = 'nouveau' | 'expansion' | 'contraction' | 'attrition'

export const LIBELLES_MOUVEMENT: Record<MouvementNature, string> = {
  nouveau: 'Nouveau',
  expansion: 'Expansion',
  contraction: 'Contraction',
  attrition: 'Attrition',
}

/**
 * Une ligne du tableau des mouvements, prête pour l'écran : Client · Type ·
 * Montant · Date (#1646.6, ce que l'issue demandait après le refus honnête de
 * #1646.4 — voir l'historique git pour `lectureDesMouvements`, retirée
 * maintenant que l'endpoint existe côté API : `GET
 * internal/admin/business-metrics/movements/:month`, `BusinessMetricsService
 * .monthlyClientMovements`).
 */
type LigneMouvementAffichee = {
  client: string
  nature: MouvementNature
  montant: string
  date: string
}

/** `client: null` (aucun espace ni profil connu pour le sujet facturé) devient
 *  un texte NOMMÉ — jamais un identifiant technique brut affiché à l'écran. */
export function ligneMouvementAffichee(mouvement: MonthlyClientMovement): LigneMouvementAffichee {
  return {
    client: mouvement.client ?? 'Client non identifié',
    nature: mouvement.nature,
    montant: formaterEuros(mouvement.montantCents),
    date: libelleMois(mouvement.month),
  }
}

/**
 * Le message à afficher À LA PLACE du tableau, ou `null` s'il faut rendre le
 * tableau (des lignes existent, ou le mois est mesuré et vraiment sans
 * mouvement).
 *
 * Trois refus, trois phrases DISTINCTES — se lire pareil ferait « non mesuré »
 * et « mesuré, rien à signaler » se confondre, exactement ce que la doctrine
 * interdit :
 *  1. Aucun mois jamais figé.
 *  2. Le dernier mois figé est le PREMIER de la série (`mrrStartCents ===
 *     null`) : aucun mois précédent pour comparer, donc aucun mouvement n'est
 *     MESURABLE ce mois-ci — pas la même chose qu'un mois mesuré sans
 *     mouvement.
 *  3. Le mois a un précédent, et le tableau est vide : mesuré, rien à
 *     signaler.
 */
export function messageMouvementsVides(
  dernier: BusinessMonth | null,
  lignes: readonly MonthlyClientMovement[],
): string | null {
  if (!dernier) {
    return 'Aucun mois figé — le tableau des mouvements apparaîtra au premier instantané, sur /revenus.'
  }
  if (dernier.mrrStartCents === null) {
    return 'Premier mois figé de la série : aucun mois précédent pour comparer, donc aucun mouvement n’est mesurable ce mois-ci.'
  }
  if (lignes.length === 0) {
    return 'Aucun mouvement mesuré ce mois-ci — aucun client parti, arrivé ou dont l’offre a changé.'
  }
  return null
}
