import { appLocale } from './locale'

/**
 * Des centimes en euros, dans la langue de l'APP.
 *
 * `new Intl.NumberFormat(undefined, …)` suit la locale du RUNTIME, pas celle de
 * l'application : un utilisateur français dont le navigateur est en anglais
 * lisait « €12,500 » là où l'écran dit « Produit ce mois ». Six écrans
 * recopiaient ce même `formatCents` local — c'est la CI, qui tourne en `en-US`,
 * qui l'a fait sortir.
 *
 * Le couple de locales vit dans `locale.ts` — GA-26, un réglage à un seul
 * endroit ; le recopier ici les ferait diverger le jour d'une troisième langue.
 *
 * Les décimales sont retirées : sur un bloc qui porte quatre chiffres, les
 * centimes d'un chiffre d'affaires mensuel n'apprennent rien et volent la place
 * du chiffre lui-même.
 *
 * ⚠️ Ce formateur suppose un montant MESURÉ. Une valeur absente ne s'affiche
 * jamais « 0 € » : c'est à l'appelant de rendre « Non mesuré » avant d'appeler.
 */
export function formatCents(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(appLocale(), {
    style: 'currency',
    // #2425 — un montant dans SA devise : deux devises ne se convertissent
    // jamais ici, chacune s'affiche avec son propre symbole.
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}
