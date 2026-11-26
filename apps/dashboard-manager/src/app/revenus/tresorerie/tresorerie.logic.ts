import type { RunwayUnavailable, TreasuryView } from '@/lib/business-metrics'
import { formaterEuros } from '../revenus.logic'

/**
 * Ce que l'écran Trésorerie CALCULE, séparé de ce qu'il rend (#1649).
 *
 * Tout est pur : aucune horloge lue, aucune requête. C'est ce qui permet de
 * tester les seuls endroits où un mensonge pourrait s'écrire — « non mesuré »
 * affiché « 0 », un montant mal lu, un runway sans sa raison.
 *
 * ⚠️ `formaterEuros` et `libelleMois` ONT DÉMÉNAGÉ D'UN CRAN, dans
 * `../revenus.logic` (#1651). Ils servaient déjà aux deux écrans de la section,
 * et un réglage — un format en est un — vit à UN seul endroit (loi 1 du tome 7,
 * GA-26). Deux copies auraient donné « 12 480 € » ici et « 12 480,00 € » là,
 * sans que personne sache laquelle fait foi. Ce fichier les IMPORTE ; il ne les
 * réexporte pas, sinon le second nom recréerait exactement le doublon qu'on
 * vient de retirer.
 */

/** Le résultat de la lecture d'un champ €. Trois états, jamais deux. */
export type MontantSaisi = { etat: 'vide' } | { etat: 'illisible' } | { etat: 'lu'; cents: number }

/**
 * Lit un montant en euros tapé à la main et le rend en CENTIMES.
 *
 * ⚠️ Un champ VIDE n'est pas zéro : il vaut « non mesuré », et c'est ce que le
 * formulaire enverra (`null`). Confondre les deux ferait dire à un mois oublié
 * qu'il n'a rien dépensé — le mensonge le plus cher de cet écran.
 *
 * Accepte ce qu'un humain tape vraiment : le symbole «\u00a0€\u00a0», la virgule
 * décimale, le point décimal, un signe négatif (un encaissement corrigé, une
 * dépense annulée), et TOUS les espaces — `\\s` couvre l'insécable U+00A0 et
 * l'insécable étroit U+202F que pose le clavier français, qu'on n'a donc pas à
 * écrire en clair (`no-irregular-whitespace` les refuserait, à raison).
 */
export function lireMontant(brut: string): MontantSaisi {
  const nettoye = brut.replace(/\s/g, '').replace(/€/g, '').replace(',', '.')
  if (nettoye === '') return { etat: 'vide' }
  if (!/^-?\d+(\.\d{1,2})?$/.test(nettoye)) return { etat: 'illisible' }
  const euros = Number(nettoye)
  if (!Number.isFinite(euros)) return { etat: 'illisible' }
  return { etat: 'lu', cents: Math.round(euros * 100) }
}

/** Centimes → la valeur brute d'un champ de saisie. `null` rend une case vide. */
export function champEuros(cents: number | null | undefined): string {
  return cents == null ? '' : String(cents / 100)
}

/**
 * Les N derniers mois, du plus récent au plus ancien, `jusqua` compris.
 *
 * Sert au sélecteur de mois du formulaire. L'ancre est un PARAMÈTRE : un test
 * qui lit l'horloge passe en septembre et échoue en octobre.
 */
export function derniersMois(jusqua: string, combien: number): string[] {
  const [anneeBrute = '', moisBrut = ''] = jusqua.split('-')
  let annee = Number(anneeBrute)
  let mois = Number(moisBrut)
  if (!Number.isInteger(annee) || !Number.isInteger(mois) || mois < 1 || mois > 12) return []

  const out: string[] = []
  for (let i = 0; i < Math.max(0, combien); i += 1) {
    out.push(`${annee}-${String(mois).padStart(2, '0')}`)
    mois -= 1
    if (mois === 0) {
      mois = 12
      annee -= 1
    }
  }
  return out
}

/**
 * Ce que la tuile « Runway » affiche, et POURQUOI quand elle n'affiche pas un
 * nombre.
 *
 * Chaque refus a sa phrase. « Non mesuré » sans sa raison apprend à ignorer la
 * tuile ; avec sa raison, il dit quoi faire — saisir un deuxième mois, relever
 * le solde.
 */
export function libelleRunway(runway: TreasuryView['runway']): { valeur: string | null; note: string } {
  if (runway === null) return { valeur: null, note: 'Aucun mois saisi.' }
  if (runway.measured) return { valeur: `${runway.months} mois`, note: 'Solde ÷ burn moyen des 3 derniers mois.' }
  return { valeur: null, note: noteDuRefus(runway.reason) }
}

/**
 * La phrase de CHAQUE refus. Exhaustif par le type : ajouter une raison côté API
 * casse la compilation ici plutôt que d'afficher un « non mesuré » muet.
 */
function noteDuRefus(raison: RunwayUnavailable): string {
  switch (raison) {
    case 'not_enough_months':
      return 'Non mesurable : il faut 2 mois saisis. Un seul mois ne fait pas une moyenne.'
    case 'no_balance':
      return 'Non mesurable : le solde bancaire du dernier mois n’est pas relevé.'
    case 'not_burning':
      return 'Non mesurable : le burn moyen est nul ou négatif sur la période — tu n’as pas brûlé de trésorerie.'
  }
}

/** Ce que la tuile « Burn moyen » affiche, et pourquoi le cas échéant. */
export function libelleBurnMoyen(moyenne: TreasuryView['averageBurn']): { valeur: string | null; note: string } {
  if (moyenne === null) return { valeur: null, note: 'Aucun mois saisi.' }
  if (moyenne.measured) {
    return { valeur: formaterEuros(moyenne.cents), note: `Moyenne sur ${moyenne.monthsUsed} mois mesurés.` }
  }
  return { valeur: null, note: 'Non mesurable : il faut 2 mois saisis.' }
}
