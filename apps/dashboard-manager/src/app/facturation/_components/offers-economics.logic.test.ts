import { describe, expect, it } from 'vitest'
import type { OfferEconomics } from '@/lib/offer-economics'
import {
  clientsSurLOffre,
  formaterCredits,
  formaterEuros,
  libelleClients,
  libelleMarge,
  libelleMedianeConsommation,
  libelleTauxDepassement,
  phraseDeConfirmation,
  resumerLesChangements,
} from './offers-economics.logic'

/**
 * Ce que l'écran « Offres » AFFICHE, séparé de ce qu'il rend (issue 1656).
 *
 * L'environnement de test de cette application est `node` : jsdom ne met rien
 * en page, donc la décision vit ici, hors du composant — même choix que
 * `delete-user-consequence.ts` et `tresorerie.logic.ts`.
 *
 * ⚠️ Le test qui tient tout le lot est celui de l'offre à 0 client : chaque
 * colonne dérivée doit rendre « — », JAMAIS « 0 ». Une marge de « 0 % » sur une
 * offre que personne n'a prise n'est pas prudente, elle est fausse.
 */

function offre(over: Partial<OfferEconomics> = {}): OfferEconomics {
  return {
    key: 'growth',
    label: 'Growth',
    priceCents: 19_900,
    creditsPerCycle: 250,
    customers: 9,
    manualCustomers: 0,
    mrrCents: 179_100,
    medianCreditsUsed: 42,
    medianUnavailable: null,
    overrunRate: 0.25,
    overrunObserved: 2,
    overrunEligible: 8,
    overrunUnavailable: null,
    overrunIsFloor: false,
    margin: {
      measurable: false,
      rate: null,
      blockedReason: 'currency_mismatch',
      excludedCostFamilies: ['hébergement', 'salaires'],
    },
    ...over,
  }
}

/** L'offre que personne n'a prise, telle que l'API la rend. */
const SANS_CLIENT = offre({
  customers: 0,
  manualCustomers: 0,
  mrrCents: null,
  medianCreditsUsed: null,
  medianUnavailable: 'no_customers',
  overrunRate: null,
  overrunObserved: null,
  overrunEligible: null,
  overrunUnavailable: 'no_customers',
  overrunIsFloor: false,
  margin: { measurable: false, rate: null, blockedReason: 'no_customers', excludedCostFamilies: [] },
})

describe('une offre à 0 client', () => {
  it('affiche « — » sur CHAQUE colonne dérivée, jamais « 0 »', () => {
    expect(formaterEuros(SANS_CLIENT.mrrCents)).toBe('—')
    expect(formaterCredits(SANS_CLIENT.medianCreditsUsed)).toBe('—')
    expect(libelleMedianeConsommation(SANS_CLIENT).valeur).toBeNull()
    expect(libelleTauxDepassement(SANS_CLIENT).valeur).toBeNull()
    expect(libelleMarge(SANS_CLIENT).valeur).toBeNull()
  })

  it('n’écrit nulle part le caractère « 0 » comme valeur', () => {
    const rendu = [
      formaterEuros(SANS_CLIENT.mrrCents),
      libelleMedianeConsommation(SANS_CLIENT).valeur,
      libelleTauxDepassement(SANS_CLIENT).valeur,
      libelleMarge(SANS_CLIENT).valeur,
    ]
    expect(rendu).toEqual(['—', null, null, null])
  })

  it('dit POURQUOI — un « — » muet apprend à ignorer la colonne', () => {
    expect(libelleMedianeConsommation(SANS_CLIENT).note).toContain('Aucun client')
    expect(libelleTauxDepassement(SANS_CLIENT).note).toContain('Aucun client')
    expect(libelleMarge(SANS_CLIENT).note).toContain('Aucun client')
  })

  it('affiche bien « 0 » pour le NOMBRE de clients — celui-là est mesuré', () => {
    // La règle porte sur les DÉRIVÉES. « Zéro client » est un fait observé, pas
    // une absence de mesure : le masquer cacherait précisément l'information.
    expect(libelleClients(SANS_CLIENT)).toBe('0')
  })
})

describe('la consommation médiane', () => {
  it('refuse de désigner quelqu’un sous 3 clients', () => {
    const res = libelleMedianeConsommation(offre({ medianCreditsUsed: null, medianUnavailable: 'too_few_customers' }))
    expect(res.valeur).toBeNull()
    expect(res.note).toContain('trop peu de clients')
  })

  it('rend la médiane en crédits quand elle est mesurée, et dit sur quoi elle porte', () => {
    // Le cycle EN COURS n'est pas fini : la note doit le dire, et nommer
    // l'effectif — une médiane sans son échantillon ne se vérifie pas.
    const res = libelleMedianeConsommation(offre({ medianCreditsUsed: 42, customers: 9 }))
    expect(res.valeur).toBe('42 crédits')
    expect(res.note).toContain('Cycle en cours')
    expect(res.note).toContain('9 clients')
  })

  it('accorde le singulier — « 1 crédit », pas « 1 crédits »', () => {
    expect(libelleMedianeConsommation(offre({ medianCreditsUsed: 1 })).valeur).toBe('1 crédit')
  })

  it('affiche une médiane de 0 crédit quand elle est MESURÉE — la moitié des clients n’a rien consommé', () => {
    // Ici « 0 » est VRAI : trois clients ou plus, et la valeur du milieu est
    // zéro. C'est le fait le plus utile de la ligne, pas une absence.
    expect(libelleMedianeConsommation(offre({ medianCreditsUsed: 0 })).valeur).toBe('0 crédit')
  })

  it('écrit la demie à la française — la médiane d’un nombre PAIR de clients tombe entre deux valeurs', () => {
    // `${30.5}` rendrait « 30.5 », avec un point décimal anglais.
    expect(libelleMedianeConsommation(offre({ medianCreditsUsed: 30.5 })).valeur).toBe('30,5 crédits')
  })
})

describe('le taux de dépassement', () => {
  it('rend un pourcentage et son dénominateur — un taux nu ne se vérifie pas', () => {
    const res = libelleTauxDepassement(offre({ overrunRate: 0.25, overrunObserved: 2, overrunEligible: 8 }))
    expect(res.valeur).toBe('25 %')
    expect(res.note).toContain('2 clients sur 8')
  })

  it('dit « au moins » tant qu’un cycle peut encore basculer', () => {
    const res = libelleTauxDepassement(offre({ overrunRate: 0.25, overrunIsFloor: true }))
    expect(res.valeur).toBe('au moins 25 %')
    expect(res.note).toContain('cycle')
  })

  it('ne tranche RIEN — aucune recommandation, dans aucun des cas', () => {
    // La règle de l'issue : « un taux élevé dit deux choses opposées ». L'écran
    // affiche le chiffre, il ne conseille pas de changer l'offre.
    const eleve = libelleTauxDepassement(offre({ overrunRate: 0.95, overrunObserved: 19, overrunEligible: 20 }))
    const bas = libelleTauxDepassement(offre({ overrunRate: 0.05, overrunObserved: 1, overrunEligible: 20 }))
    for (const rendu of [eleve, bas]) {
      const texte = `${rendu.valeur ?? ''} ${rendu.note}`.toLowerCase()
      for (const mot of ['augment', 'baiss', 'recommand', 'conseil', 'devrait', 'mal calibr', 'faudrait']) {
        expect(texte, `« ${mot} » est un conseil : cet écran ne tranche pas`).not.toContain(mot)
      }
    }
  })

  it('une offre sans plafond n’a pas un taux de 100 % — elle n’a pas de taux', () => {
    const res = libelleTauxDepassement(offre({ overrunRate: null, overrunUnavailable: 'no_cap' }))
    expect(res.valeur).toBeNull()
    expect(res.note).toContain('plafond')
  })

  it('arrondit à l’entier — un taux au dixième de pourcent sur 8 clients est une fausse précision', () => {
    expect(libelleTauxDepassement(offre({ overrunRate: 1 / 3 })).valeur).toBe('33 %')
  })
})

describe('la marge', () => {
  it('n’est JAMAIS un chiffre', () => {
    expect(libelleMarge(offre()).valeur).toBeNull()
  })

  it('nomme la devise comme cause, pas un « non disponible » muet', () => {
    const res = libelleMarge(offre())
    expect(res.note).toContain('dollars')
    expect(res.note).toContain('euros')
  })

  it('nomme aussi les postes de coût qu’aucune table du dépôt ne porte', () => {
    const res = libelleMarge(offre())
    expect(res.exclus).toEqual(['hébergement', 'salaires'])
  })

  it('distingue « non mesurable » de « — » — une offre sans client n’a même pas de coût à imputer', () => {
    expect(libelleMarge(offre()).mention).toBe('non mesurable')
    expect(libelleMarge(SANS_CLIENT).mention).toBe('—')
  })
})

describe('le nombre de clients', () => {
  it('sépare les clients sur facture — ils ne font pas de MRR, et sinon le MRR paraîtrait faux', () => {
    expect(libelleClients(offre({ customers: 9, manualCustomers: 2 }))).toBe('9 (dont 2 sur facture)')
  })

  it('accorde le singulier', () => {
    expect(libelleClients(offre({ customers: 3, manualCustomers: 1 }))).toBe('3 (dont 1 sur facture)')
  })

  it('n’ajoute rien quand personne n’est sur facture', () => {
    expect(libelleClients(offre({ customers: 9, manualCustomers: 0 }))).toBe('9')
  })
})

describe('clientsSurLOffre — ce que la confirmation d’édition doit NOMMER', () => {
  it('rend le nombre de clients de l’offre visée', () => {
    expect(clientsSurLOffre([offre({ key: 'growth', customers: 9 })], 'growth')).toBe(9)
  })

  it('rend `null` quand la mesure n’a pas pu être chargée — et surtout pas 0', () => {
    // Un « 0 client » affiché parce que l'API n'a pas répondu ferait croire
    // qu'un changement de prix n'affecte personne. C'est exactement l'inverse
    // de ce que la confirmation doit protéger.
    expect(clientsSurLOffre([], 'growth')).toBeNull()
    expect(clientsSurLOffre(null, 'growth')).toBeNull()
  })
})

describe('resumerLesChangements — ce qu’une sauvegarde va vraiment faire', () => {
  const AVANT = {
    label: 'Growth',
    price: 19_900,
    accountsLimit: 250,
    enrichmentCredits: 0,
    seats: 1,
    extraSeatPrice: 4_900,
    features: ['exports', 'chat_ai'],
  }

  it('ne voit aucun changement quand rien n’a bougé', () => {
    const res = resumerLesChangements(AVANT, { ...AVANT })
    expect(res.champs).toEqual([])
    expect(res.prixModifie).toBe(false)
    expect(res.fonctionsRetirees).toEqual([])
  })

  it('nomme les champs modifiés', () => {
    const res = resumerLesChangements(AVANT, { ...AVANT, accountsLimit: 300, label: 'Growth+' })
    expect(res.champs).toEqual(['nom', 'crédits/mois'])
  })

  it('signale un changement de PRIX — c’est le seul qui touche les abonnés en cours', () => {
    expect(resumerLesChangements(AVANT, { ...AVANT, price: 24_900 }).prixModifie).toBe(true)
    expect(resumerLesChangements(AVANT, { ...AVANT, extraSeatPrice: 5_900 }).prixModifie).toBe(true)
    expect(resumerLesChangements(AVANT, { ...AVANT, accountsLimit: 300 }).prixModifie).toBe(false)
  })

  it('nomme les fonctions RETIRÉES — elles disparaissent immédiatement chez les abonnés', () => {
    const res = resumerLesChangements(AVANT, { ...AVANT, features: ['exports'] })
    expect(res.fonctionsRetirees).toEqual(['chat_ai'])
  })

  it('ne compte pas une fonction AJOUTÉE comme un retrait', () => {
    const res = resumerLesChangements(AVANT, { ...AVANT, features: ['exports', 'chat_ai', 'discover'] })
    expect(res.fonctionsRetirees).toEqual([])
    expect(res.champs).toEqual(['fonctions incluses'])
  })

  it('ne se laisse pas tromper par l’ORDRE des fonctions', () => {
    const res = resumerLesChangements(AVANT, { ...AVANT, features: ['chat_ai', 'exports'] })
    expect(res.champs).toEqual([])
  })
})

describe('phraseDeConfirmation — elle NOMME la conséquence, jamais « êtes-vous sûr ? »', () => {
  it('dit combien de clients sont sur l’offre aujourd’hui', () => {
    expect(phraseDeConfirmation('Growth', 9)).toContain('9 clients')
  })

  it('accorde le singulier', () => {
    expect(phraseDeConfirmation('Growth', 1)).toContain('1 client ')
  })

  it('dit « aucun client » quand c’est MESURÉ à zéro', () => {
    expect(phraseDeConfirmation('Growth', 0)).toContain('aucun client')
  })

  it('⚠️ ne dit JAMAIS « 0 client » quand la mesure a échoué', () => {
    // Le défaut qui coûterait le plus cher ici : une panne de mesure qui se lit
    // comme « personne n'est concerné », juste avant de changer un prix.
    const phrase = phraseDeConfirmation('Growth', null)
    expect(phrase).toContain('indisponible')
    expect(phrase).not.toContain('aucun client')
    expect(phrase).not.toContain('0 client')
  })

  it('nomme l’offre — une confirmation qui ne dit pas SUR QUOI elle porte ne protège rien', () => {
    expect(phraseDeConfirmation('Growth', 9)).toContain('Growth')
  })
})

describe('les formats', () => {
  it('formate des centimes en euros sans décimale', () => {
    expect(formaterEuros(179_100)).toContain('791')
  })

  it('rend « — » sur un montant absent, jamais « 0 € »', () => {
    expect(formaterEuros(null)).toBe('—')
  })

  it('rend « 0 € » sur un MRR mesuré à zéro — l’offre a des clients, tous sur facture', () => {
    expect(formaterEuros(0)).toContain('0')
    expect(formaterEuros(0)).not.toBe('—')
  })
})
