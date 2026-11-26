import { MAX_SERIES } from '@/app/_components/charts.logic'
import type { BellumMargin, CostAggregate, CostDay, CostSpike } from '@/lib/costs'

/**
 * COÛTS — les décisions de l'écran `/couts` (#1661), séparées du placement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉCIDÉ ICI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Le SEUIL du pic n'est PAS décidé ici. Il vit côté API
 *   (`cost-alert.ts`, `COST_SPIKE_RATIO`), la file de décision (#1647) lit la
 *   même dérivation, et le montant du seuil VOYAGE dans le verdict pour que ce
 *   fichier n'ait jamais à écrire « 150 % ». Deux maisons pour un réglage, et il
 *   diverge à la première modification.
 * · Le REFUS de la marge n'est pas décidé ici non plus : `measureBellumGrossMargin`
 *   (D436) rend `blockedReason: 'currency_mismatch'`, ce fichier ne fait que le
 *   METTRE EN FRANÇAIS. Ce qui est décidé ici, c'est que le refus s'affiche AVEC
 *   sa raison et avec ce qu'il faudrait pour le lever — un tiret muet ferait
 *   chercher une panne.
 * · Aucune horloge : `libelleJour` découpe une chaîne `YYYY-MM-DD` déjà résolue
 *   dans le fuseau de la console par le SQL. Refaire la conversion ici, sur
 *   l'horloge de la machine qui rend (UTC sur Vercel), produirait une DEUXIÈME
 *   réponse à la même question — et les deux se contrediraient une nuit sur deux.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ABSENCES QUI NE SE CONFONDENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Une journée MESURÉE à 0 $ est un vrai zéro — des fournisseurs tarifés
 *     n'ont rien coûté. Elle se dessine.
 *  2. Une journée NON MESURÉE (aucune ligne, ou uniquement des lignes sans prix)
 *     n'a pas de colonne : `StackedBar` la marque en pointillés. « 0 $ » y
 *     serait une affirmation qu'on ne peut pas faire.
 *  3. Une API en panne ne passe jamais par ici : l'écran rend une erreur, pas
 *     une série vide qui se lirait comme « rien dépensé ».
 */

/** Le nom de la part qui replie les fournisseurs au-delà de ce que la pile dessine. */
export const CLE_AUTRES = 'autres'

/** `0,00 $` — le registre est en DOLLARS, et il le reste : Bellum ne convertit rien. */
const FORMAT_USD = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Un entier lisible (`1 284`). */
const FORMAT_ENTIER = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Un multiple (`×1,6`). */
const FORMAT_RATIO = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

export function formaterUsd(montant: number): string {
  return FORMAT_USD.format(montant)
}

export function formaterEntier(valeur: number): string {
  return FORMAT_ENTIER.format(valeur)
}

/**
 * `2026-09-08` → `08/09`.
 *
 * Découpage de CHAÎNE, jamais un `new Date` : la clé est déjà un jour civil
 * résolu à Paris par le SQL, et lui redonner un instant la ferait basculer d'un
 * jour dès que le fuseau change de côté de minuit.
 */
export function libelleJour(cle: string): string {
  const jour = cle.slice(8, 10)
  const mois = cle.slice(5, 7)
  return jour && mois ? `${jour}/${mois}` : cle
}

/** `01/09 → 09/09`, pour le pied du graphique. */
export function periodeDeLaSerie(byDay: readonly CostDay[]): string {
  const premier = byDay[0]
  const dernier = byDay[byDay.length - 1]
  if (!premier || !dernier) return '—'
  return `${libelleJour(premier.day)} → ${libelleJour(dernier.day)}`
}

type ColonneDeCout = { label: string; values: Readonly<Record<string, number>> }

type PileDesCouts = {
  /** Les séries empilées, du fournisseur le plus cher au moins cher. */
  keys: string[]
  labels: Record<string, string>
  categories: ColonneDeCout[]
  /** Combien de fournisseurs sont repliés sous « autres ». `0` = aucun. */
  replies: number
}

/**
 * La pile JOUR × FOURNISSEUR que `StackedBar` dessine.
 *
 * ⚠️ `StackedBar` CLAMPE ses séries à {@link MAX_SERIES}. Lui passer huit
 * fournisseurs n'en dessinerait que cinq — et le total de chaque colonne serait
 * celui de ces cinq-là, c'est-à-dire un total FAUX présenté comme un total.
 * Le repli est donc fait ICI, explicitement, et « autres » porte dans son
 * libellé le nombre de fournisseurs qu'il recouvre.
 */
export function pileDesCouts(byDay: readonly CostDay[]): PileDesCouts {
  const totalParFournisseur = new Map<string, number>()
  for (const jour of byDay) {
    if (!jour.measured) continue
    for (const [fournisseur, cout] of Object.entries(jour.perProvider)) {
      totalParFournisseur.set(fournisseur, (totalParFournisseur.get(fournisseur) ?? 0) + cout)
    }
  }

  const classes = [...totalParFournisseur.entries()].sort((a, b) => b[1] - a[1]).map(([nom]) => nom)
  const tetes = classes.length <= MAX_SERIES ? classes : classes.slice(0, MAX_SERIES - 1)
  const replies = classes.length - tetes.length
  const keys = replies > 0 ? [...tetes, CLE_AUTRES] : tetes

  const categories = byDay.map((jour): ColonneDeCout => {
    // Une journée non mesurée n'a AUCUNE série : `computeStackedColumns` en fait
    // une colonne `total: null`, dessinée en pointillés. C'est la seule façon
    // de dire « on ne sait pas » plutôt que « zéro ».
    if (!jour.measured) return { label: libelleJour(jour.day), values: {} }

    const values: Record<string, number> = {}
    let autres = 0
    for (const [fournisseur, cout] of Object.entries(jour.perProvider)) {
      if (tetes.includes(fournisseur)) values[fournisseur] = (values[fournisseur] ?? 0) + cout
      else autres += cout
    }
    if (replies > 0) values[CLE_AUTRES] = Math.round(autres * 10_000) / 10_000
    return { label: libelleJour(jour.day), values }
  })

  const labels: Record<string, string> = {}
  if (replies > 0) labels[CLE_AUTRES] = `autres (${replies} fournisseurs)`

  return { keys, labels, categories, replies }
}

/**
 * Ce que la tuile et le panneau du pic affichent.
 *
 * `valeur: null` fait écrire « — » à la tuile : c'est ce qu'on doit lire quand
 * il n'y a rien à conclure. Un « ×1,0 » de repos serait un chiffre inventé.
 */
type LectureDuPic = {
  valeur: string | null
  titre: string
  detail: string
  /** `alerte` seulement quand un pic est AVÉRÉ — jamais sur une absence de mesure. */
  ton: 'alerte' | 'calme' | 'inconnu'
}

export function lectureDuPic(pic: CostSpike): LectureDuPic {
  if (pic.spike) {
    return {
      valeur: `×${FORMAT_RATIO.format(pic.ratio)}`,
      ton: 'alerte',
      titre: `Pic de coût le ${libelleJour(pic.day)}`,
      detail:
        `${formaterUsd(pic.costUsd)} sur la journée, contre une médiane de ${formaterUsd(pic.medianUsd)} ` +
        `sur les 7 journées mesurées qui précèdent. Le seuil était à ${formaterUsd(pic.thresholdUsd)}.`,
    }
  }

  switch (pic.reason) {
    case 'not_enough_days':
      return {
        valeur: null,
        ton: 'inconnu',
        titre: 'Pic — non mesurable',
        detail:
          `${pic.observedDays} journée(s) mesurée(s) sur les ${pic.requiredDays} qu'exige la médiane. ` +
          'Une médiane qui n’existe pas ne produit AUCUNE alerte : une alarme allumée par un trou de ' +
          'données n’est plus une alarme.',
      }
    case 'baseline_is_zero':
      return {
        valeur: null,
        ton: 'inconnu',
        titre: 'Pic — non mesurable',
        detail:
          `La médiane des ${pic.observedDays} journées mesurées vaut 0 $. Tout centime dépensé serait alors ` +
          '« infiniment au-dessus » : c’est la signature d’un registre qui n’écrivait pas, pas celle d’un dérapage.',
      }
    case 'day_not_measured':
      return {
        valeur: null,
        ton: 'inconnu',
        titre: 'Pic — non mesurable',
        detail:
          `Le ${libelleJour(pic.day)} — dernière journée complète — n’a aucune ligne tarifée. ` +
          '« 0 $ dépensé » y serait une affirmation qu’on ne peut pas faire.',
      }
    case 'under_threshold':
      return {
        valeur: `×${FORMAT_RATIO.format(pic.ratio)}`,
        ton: 'calme',
        titre: `Aucun pic le ${libelleJour(pic.day)}`,
        detail:
          `${formaterUsd(pic.costUsd)} sur la journée, médiane ${formaterUsd(pic.medianUsd)} ` +
          `sur les 7 journées mesurées qui précèdent. Le seuil est à ${formaterUsd(pic.thresholdUsd)}.`,
      }
  }
}

/**
 * Ce que le bloc « marge brute » affiche — y compris quand il refuse.
 *
 * `debloquer` est ce qui distingue un refus UTILE d'un tiret muet : il dit ce
 * qu'il faudrait changer pour que le chiffre existe. Sans lui, le refus se lit
 * comme une panne, et quelqu'un finit par « réparer » en inventant un taux.
 */
type LectureDeLaMarge = {
  valeur: string | null
  titre: string
  raison: string
  /**
   * La MÊME raison, en trois mots — pour un emplacement qui n'a pas de place.
   *
   * ⚠️ Trouvé en recette le 09/09/2026 sur le cockpit : `tuileMarge` versait
   * `raison` (405 caractères, écrits pour CETTE page où ils ont la place) dans
   * le pied d'une tuile KPI large de 141 px. Mesuré : 169 px de large pour
   * 141 disponibles, et 270 px de haut contre ~90 pour ses cinq voisines — le
   * texte débordait sur la tuile suivante et se faisait couper en plein mot.
   *
   * Ce n'est pas un défaut d'affichage : c'est une donnée qui se trompe
   * d'emplacement. Les deux formes coexistent donc ici, à UN seul endroit, et
   * l'écran choisit celle que sa place autorise.
   */
  raisonCourte: string
  debloquer: string | null
}

export function lectureDeLaMarge(marge: BellumMargin | null, panne: string | null): LectureDeLaMarge {
  if (!marge) {
    return {
      valeur: null,
      titre: 'Marge brute — indisponible',
      raison: `L’API n’a pas répondu${panne ? ` : ${panne}` : ''}. Ce n’est pas « 0 % » : c’est un écran qui ne sait pas.`,
      raisonCourte: 'l’API n’a pas répondu',
      debloquer: null,
    }
  }

  if (marge.blockedReason === 'currency_mismatch') {
    return {
      valeur: null,
      titre: 'Marge brute et ratio coût/MRR — non mesurables',
      raison:
        'Le revenu de BellumAI est en EUROS (la grille des offres) ; le registre des coûts fournisseurs est en ' +
        'DOLLARS (PROVIDER_UNIT_COST_*). Bellum ne convertit rien : un taux de change appliqué à la volée change ' +
        'entre l’affichage et le prélèvement, et fait diverger la comptabilité de ce que le client a vu. ' +
        'Le ratio « coût fournisseur / MRR » est refusé pour EXACTEMENT la même raison — c’est la même division.',
      raisonCourte: 'revenus EUR, coûts USD',
      debloquer:
        'Une DEVISE UNIQUE de part et d’autre de la division. Deux chemins possibles, et un seul est à choisir : ' +
        'soit provider_costs porte aussi un montant en euros FIGÉ au moment de la dépense (jamais recalculé ' +
        'ensuite), soit la grille des offres porte un prix déclaré en dollars. Tant que les deux registres ' +
        'parlent deux devises, la division n’a pas de sens — et un repère de marché n’a personne à comparer.',
    }
  }

  if (!marge.measurability.measurable) {
    return {
      valeur: null,
      titre: 'Marge brute — pas encore mesurable',
      raison:
        `${marge.measurability.observed} compte(s) payant(s) observé(s) sur les ${marge.measurability.required} ` +
        'nécessaires. Une marge calculée sur un seul client n’est pas une marge d’entreprise.',
      raisonCourte: `${marge.measurability.observed} compte(s) payant(s) sur ${marge.measurability.required}`,
      debloquer: `${marge.measurability.missing} compte(s) payant(s) de plus sur la fenêtre.`,
    }
  }

  return {
    valeur: marge.marginRate === null ? null : `${Math.round(marge.marginRate * 100)} %`,
    titre: 'Marge brute sur coût variable',
    raison:
      'Revenu moins coût fournisseurs TARIFÉ, rapporté au revenu. C’est une marge sur coût VARIABLE, jamais une ' +
      'marge complète.',
    raisonCourte: 'sur coût variable',
    debloquer: null,
  }
}

/**
 * Ce qu'une liste BORNÉE laisse dehors — et un top 20 n'est pas un total.
 *
 * Union plutôt qu'un objet à champs nullables : quand rien n'est tronqué, il n'y
 * a pas de « coût non affiché » à zéro, il n'y a pas de coût non affiché du tout.
 */
type Bornage =
  | { borne: false; distinctes: number }
  | { borne: true; affichees: number; distinctes: number; coutNonAffiche: number }

export function bornageDeLaListe(
  lignes: readonly CostAggregate[],
  distinctes: number,
  totalTarifeUsd: number,
): Bornage {
  if (distinctes <= lignes.length) return { borne: false, distinctes }
  const affiche = lignes.reduce((somme, ligne) => somme + ligne.cost_usd, 0)
  return {
    borne: true,
    affichees: lignes.length,
    distinctes,
    // Le total de référence vient de `byProvider`, qui n'est PAS borné : la
    // différence est donc bien ce que les lignes hors liste ont coûté. Le
    // plancher à 0 ne masque rien — il absorbe le bruit des flottants.
    coutNonAffiche: Math.max(0, Math.round((totalTarifeUsd - affiche) * 10_000) / 10_000),
  }
}

/** La phrase qui dit qu'une liste est un sous-ensemble, ou rien du tout. */
export function phraseDuBornage(bornage: Bornage, nom: string): string | null {
  if (!bornage.borne) return null
  return (
    `Les ${bornage.affichees} ${nom} les plus coûteux sur ${bornage.distinctes} — ce n’est pas un total. ` +
    `${formaterUsd(bornage.coutNonAffiche)} ont été dépensés hors de cette liste.`
  )
}

/**
 * Les quatre familles que le registre écrit RÉELLEMENT, et leur nom en français.
 *
 * ⚠️ Cette carte ne s'invente pas : `ProviderCostService.record()` a quatre
 * appelants dans le dépôt, et ce sont ces quatre-là — `analysis`
 * (`analysis.worker.ts`), `chat` (`ia-proxy.controller.ts`), `enrichment`
 * (`contacts.service.ts`), `need_play` (`need-play.service.ts`). Une clé
 * inconnue s'affiche TELLE QUELLE plutôt que de recevoir un libellé deviné :
 * un joli nom sur une famille qu'on n'a pas identifiée est une donnée fictive.
 */
const ACTIONS: Readonly<Record<string, string>> = {
  analysis: 'Analyse de compte',
  enrichment: 'Enrichissement de contacts',
  need_play: 'Plan de besoin',
  chat: 'Copilote (Laura)',
}

export function libelleAction(cle: string): string {
  return ACTIONS[cle] ?? cle
}

/**
 * Les familles que l'issue nomme et que RIEN n'enregistre aujourd'hui.
 *
 * Les dire coûte une ligne ; les taire ferait lire l'absence d'une ligne
 * « messages » comme « les messages ne coûtent rien », ce qui est faux : leur
 * coût existe, il est simplement compté sous `chat` ou sous `analysis`.
 */
export const ACTIONS_NON_MESUREES: readonly string[] = [
  'Messages (comptés sous « Copilote » ou « Analyse de compte », jamais à part)',
  'Vecteurs / embeddings (aucun appelant n’enregistre de coût sous cette famille)',
]

/** Le plafond du top par outil, côté API (`TOP_ROWS`). */
const OUTILS_AFFICHES_MAX = 20

/**
 * #2442.12 — la liste par outil est bornée aux 20 plus coûteux et l'API ne rend pas le nombre d'outils
 * distincts : atteindre le plafond est le seul signe d'une troncature possible, et il se DIT.
 * Sous le plafond, rien n'est tronqué ⇒ aucune phrase.
 */
export function phraseDesOutilsBornes(lignes: readonly CostAggregate[]): string | null {
  if (lignes.length < OUTILS_AFFICHES_MAX) return null
  return `Les ${OUTILS_AFFICHES_MAX} outils les plus coûteux — la liste peut être plus longue, ce n’est pas un total.`
}
