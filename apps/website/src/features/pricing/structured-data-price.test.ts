import { describe, expect, it } from 'vitest'
import type { LiveCatalogCopy } from './live-prices'
import { structuredDataEntryPrice } from './structured-data-price'

/**
 * Le défaut, vu sur la page d'accueil en production : `entryPriceDigits ?? '119'`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CHIFFRE FAISAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'était visible nulle part sur la page — il ne partait que dans la donnée
 * structurée `Offer.price`, c'est-à-dire vers Google, qui l'indexe et peut
 * l'afficher dans ses résultats. Quand la requête catalogue échouait, le site
 * annonçait donc **119 €** au monde entier, alors que 119 € est le prix de
 * `starter`, RETIRÉ DE LA VENTE le 27/08 (`selfServe: false`). Le seul palier
 * achetable est Growth à 199 €.
 *
 * Un prix faux dans un résultat de recherche ne se corrige pas en rechargeant
 * la page : il reste indexé, et c'est lui que le prospect a lu avant d'arriver.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÉPARATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun chiffre n'est écrit dans le code. Le prix publié vient, dans l'ordre :
 *
 *   1. du catalogue live (le prix que l'opérateur a posé au back-office) ;
 *   2. à défaut, de LA CARTE QUE LE VISITEUR A SOUS LES YEUX — la même chaîne
 *      du catalogue de messages que la section Tarifs affiche. La donnée
 *      structurée ne peut donc plus contredire la page qui la porte ;
 *   3. à défaut, de RIEN : le nœud `offers` disparaît du JSON-LD.
 *
 * Le troisième cas est le seul honnête. Un prix qu'on ne sait plus lire n'a pas
 * de valeur de repli : « absent » est vrai, « 0 » serait faux, et un montant
 * deviné serait une promesse commerciale que Stripe ne tiendrait pas.
 */

/** Le catalogue live tel que l'API le rend quand elle répond. */
const LIVE: LiveCatalogCopy = {
  prices: [{ monthly: '199 €', annual: '159 €' }],
  seats: ['—'],
  seatLabel: '—',
  seatUniform: true,
  entryPriceDigits: '199',
}

/** Le catalogue live quand la requête échoue : `EMPTY`. */
const DOWN: LiveCatalogCopy = {
  prices: [],
  seats: [],
  seatLabel: '—',
  seatUniform: true,
  entryPriceDigits: null,
}

/** Les trois cartes de la page d'accueil, dans leur ordre d'affichage. */
const CARDS = [
  { name: 'Free', price: '0 €' },
  { name: 'Growth', price: '199 €' },
  { name: 'Entreprise', price: 'Sur devis' },
]

describe('le prix publié dans la donnée structurée', () => {
  it('est celui du catalogue live quand l’API répond', () => {
    expect(structuredDataEntryPrice(LIVE, CARDS)).toBe('199')
  })

  it('retombe sur la carte que le visiteur lit, pas sur un chiffre écrit en dur', () => {
    // C'est LE test du défaut : sans catalogue live, la page annonçait 119 €.
    expect(structuredDataEntryPrice(DOWN, CARDS)).toBe('199')
  })

  it('joint la carte par son NOM, jamais par son rang', () => {
    // La carte Free est en première position et vaut « 0 € ». Une jointure par
    // rang publierait « gratuit » comme prix d'entrée — le même défaut de
    // décalage qui avait fait afficher « Free 119 € » en production.
    expect(structuredDataEntryPrice(DOWN, [...CARDS].reverse())).toBe('199')
  })

  it('n’émet aucun prix plutôt qu’un prix inventé', () => {
    // Catalogue live muet ET carte introuvable : le nœud `offers` disparaît.
    expect(structuredDataEntryPrice(DOWN, [{ name: 'Free', price: '0 €' }])).toBeNull()
    expect(structuredDataEntryPrice(DOWN, [])).toBeNull()
    expect(structuredDataEntryPrice(DOWN, null)).toBeNull()
    expect(structuredDataEntryPrice(DOWN, undefined)).toBeNull()
    expect(structuredDataEntryPrice(DOWN, 'Sur devis')).toBeNull()
  })

  it('ne publie JAMAIS « 0 » — une valeur absente n’est pas une valeur nulle', () => {
    // Doctrine du dépôt. Un `Offer.price: "0"` annoncerait le produit gratuit
    // à un moteur de recherche ; « pas d'offre » est la seule réponse vraie.
    expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price: '0 €' }])).toBeNull()
    expect(structuredDataEntryPrice({ ...DOWN, entryPriceDigits: '0' }, [])).toBeNull()
  })

  it('traite un « 0 » live comme illisible et redescend d’un cran', () => {
    // Un catalogue qui rend 0 est cassé, pas gratuit. On ne publie donc pas ce
    // zéro — mais on ne jette pas non plus la source suivante : la carte que le
    // visiteur lit reste vraie. C'est la cascade, appliquée jusqu'au bout.
    expect(structuredDataEntryPrice({ ...DOWN, entryPriceDigits: '0' }, CARDS)).toBe('199')
  })

  it('lit les quatre écritures du prix servies par le site', () => {
    // fr/de écrivent « 199 € », en « €199 », nl « € 199 ». Le rang du signe
    // change, le nombre non.
    for (const price of ['199 €', '€199', '€ 199', '199 € HT']) {
      expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price }])).toBe('199')
    }
  })

  it('accepte un millier groupé par une espace, insécable comprise', () => {
    // Les trois espaces que le site emploie : normale, insécable, fine.
    for (const space of [' ', '\u00a0', '\u202f']) {
      expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price: `1${space}200 €` }])).toBe('1200')
    }
  })

  it('refuse un séparateur qu’il ne sait pas lire plutôt que de deviner', () => {
    // « 1.199 € » groupe les milliers en allemand et vaut un peu plus d'un
    // euro en anglais. Les quatre langues du site ne s'accordent pas, donc la
    // seule lecture sûre est de ne pas lire — et de ne rien publier.
    expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price: '1.199 €' }])).toBeNull()
    expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price: '199,00 €' }])).toBeNull()
  })

  it('survit à une carte malformée sans jeter', () => {
    // Le catalogue de messages est édité à la main. Une forme inattendue doit
    // coûter une offre en moins, jamais une page d'accueil en erreur 500.
    expect(structuredDataEntryPrice(DOWN, [null, 42, { name: 'Growth' }, { price: '199 €' }])).toBeNull()
    expect(structuredDataEntryPrice(DOWN, [{ name: 'Growth', price: 42 }])).toBeNull()
  })
})
