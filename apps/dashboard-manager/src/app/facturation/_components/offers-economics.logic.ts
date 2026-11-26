import type { OfferEconomics } from '@/lib/offer-economics'

/**
 * Ce que l'écran « Offres » AFFICHE, séparé de ce qu'il rend (issue 1656).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TIENT TOUT LE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur absente rend « — », jamais « 0 ».** Et l'inverse est vrai aussi :
 * une valeur MESURÉE à zéro s'affiche « 0 » — « zéro client », « médiane de 0
 * crédit », « 0 € de MRR sur une offre qui n'a que des clients sur facture »
 * sont des faits, et les masquer cacherait l'information la plus utile de la
 * ligne. La question à se poser colonne par colonne : *si cette valeur est
 * absente, « 0 » est-il VRAI ?*
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CET ÉCRAN NE TRANCHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un taux de dépassement élevé dit deux choses opposées — soit l'offre est
 * mal calibrée, soit elle est le point de bascule vers l'offre supérieure. »
 * Le chiffre ne départage pas les deux, et un écran qui écrirait « offre mal
 * calibrée » trancherait à la place de l'opérateur avec une information qui ne
 * le permet pas. On affiche donc le taux, son dénominateur et son incertitude —
 * aucune recommandation. Un test le garde.
 *
 * Tout est pur : aucune horloge lue, aucune requête. L'environnement de test de
 * cette application est `node` (jsdom ne met rien en page), donc la décision
 * vit ici plutôt que dans le composant — même choix que `tresorerie.logic.ts`.
 */

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Centimes → « 1 791 € ». `null` rend « — », JAMAIS « 0 € ». */
export function formaterEuros(cents: number | null | undefined): string {
  return cents == null ? '—' : EUROS.format(cents / 100)
}

const CREDITS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/**
 * Un nombre de crédits, ou « — ». Une médiane MESURÉE à zéro reste « 0 crédit »
 * — c'est un fait, pas une absence.
 *
 * En français, zéro et un prennent le singulier. Et la médiane d'un nombre PAIR
 * de clients est la moyenne des deux du milieu : elle peut valoir 30,5, qu'un
 * `${valeur}` nu écrirait « 30.5 » avec un point décimal anglais.
 */
export function formaterCredits(credits: number | null | undefined): string {
  if (credits == null) return '—'
  return `${CREDITS.format(credits)} ${Math.abs(credits) < 2 ? 'crédit' : 'crédits'}`
}

/** Ce qu'une cellule dit : la valeur si elle est mesurée, et toujours sa note. */
type Cellule = { valeur: string | null; note: string }

/**
 * Combien de clients portent cette offre, et combien sont sur facture.
 *
 * Le second nombre n'est pas décoratif : un client sur facture ne fait PAS de
 * MRR (règle #1645), si bien qu'une offre à neuf clients dont deux sur facture
 * affiche un MRR de sept. Sans cette mention, le MRR aurait l'air faux.
 */
export function libelleClients(offre: OfferEconomics): string {
  if (offre.manualCustomers <= 0) return String(offre.customers)
  return `${offre.customers} (dont ${offre.manualCustomers} sur facture)`
}

/**
 * La consommation médiane du cycle en cours, ou pourquoi elle n'est pas dite.
 *
 * Sous trois clients, une médiane DÉSIGNE quelqu'un au lieu de décrire un
 * groupe : on écrit « trop peu de clients », pas un chiffre.
 */
export function libelleMedianeConsommation(offre: OfferEconomics): Cellule {
  if (offre.medianCreditsUsed === null) return { valeur: null, note: noteMedianeAbsente(offre.medianUnavailable) }
  return {
    valeur: formaterCredits(offre.medianCreditsUsed),
    note: `Cycle en cours, sur ${offre.customers} clients.`,
  }
}

/** La phrase de CHAQUE refus. Exhaustif par le type : une raison ajoutée côté
 *  API casse la compilation ici plutôt que d'afficher un « — » muet. */
function noteMedianeAbsente(raison: OfferEconomics['medianUnavailable']): string {
  switch (raison) {
    case 'no_customers':
      return 'Aucun client sur cette offre — il n’y a rien à mesurer.'
    case 'too_few_customers':
      return 'Non mesurable : trop peu de clients. Une médiane sous 3 clients désigne quelqu’un, elle ne décrit pas l’offre.'
    case null:
      return 'Non mesurable.'
  }
}

/**
 * La part des clients de l'offre qui ont atteint leur plafond de crédits.
 *
 * ⚠️ « au moins X % » tant qu'un cycle en cours peut encore basculer. Un taux
 * de 20 % relevé le 3 du mois n'est pas le taux du mois, et l'écrire sans
 * réserve en ferait un verdict.
 */
export function libelleTauxDepassement(offre: OfferEconomics): Cellule {
  if (offre.overrunRate === null) return { valeur: null, note: noteDepassementAbsent(offre.overrunUnavailable) }
  const pourcent = `${Math.round(offre.overrunRate * 100)} %`
  const denominateur =
    offre.overrunObserved !== null && offre.overrunEligible !== null
      ? `${offre.overrunObserved} clients sur ${offre.overrunEligible} ont atteint leur plafond. `
      : ''
  return {
    valeur: offre.overrunIsFloor ? `au moins ${pourcent}` : pourcent,
    note: offre.overrunIsFloor
      ? `${denominateur}Un cycle est encore ouvert : d’autres peuvent l’atteindre d’ici sa fin.`
      : `${denominateur}Tous les cycles mesurés sont refermés.`,
  }
}

function noteDepassementAbsent(raison: OfferEconomics['overrunUnavailable']): string {
  switch (raison) {
    case 'no_customers':
      return 'Aucun client sur cette offre — il n’y a rien à mesurer.'
    case 'no_cap':
      return 'Non mesurable : cette offre n’ouvre aucun plafond de crédits. Il n’y a rien à dépasser.'
    case null:
      return 'Non mesurable.'
  }
}

/**
 * Ce que la colonne « Marge » dit, et les postes qu'elle exclut.
 *
 * `mention` est ce qui tient DANS la cellule ; `note` est la raison complète,
 * écrite UNE fois sous le tableau. La même phrase répétée sur chaque ligne
 * serait la loi 4 du tome 7 violée, et illisible.
 */
type CelluleMarge = Cellule & { mention: string; exclus: readonly string[] }

/**
 * La marge — et pourquoi elle n'est JAMAIS un chiffre.
 *
 * La question est tranchée dans ce dépôt depuis D436 : le revenu est en euros
 * (la grille des offres), le registre des coûts fournisseurs est en dollars, et
 * Bellum ne convertit rien — « un taux de change appliqué à la volée fait
 * diverger la comptabilité de ce que le client a vu ». La marge GLOBALE rend
 * déjà `currency_mismatch` en production ; par offre, deux obstacles s'ajoutent
 * (le registre des coûts n'a pas de dimension « offre », et son total est un
 * plancher). Une marge inventée sur un coût deviné serait pire qu'une colonne
 * vide : elle servirait à fixer des prix.
 */
export function libelleMarge(offre: OfferEconomics): CelluleMarge {
  return {
    valeur: null,
    mention: offre.margin.blockedReason === 'no_customers' ? '—' : 'non mesurable',
    note: noteMarge(offre.margin.blockedReason),
    exclus: offre.margin.excludedCostFamilies,
  }
}

function noteMarge(raison: OfferEconomics['margin']['blockedReason']): string {
  switch (raison) {
    case 'no_customers':
      return 'Aucun client sur cette offre — il n’y a aucun coût à lui imputer.'
    case 'currency_mismatch':
      return (
        'Non mesurable : le prix de l’offre est en euros, le registre des coûts fournisseurs en dollars, ' +
        'et rien n’est converti ici. S’y ajoutent deux trous nommés : le registre des coûts ne porte pas ' +
        'l’offre (il porte l’espace de travail), et son total exclut les lignes sans prix unitaire — ' +
        'il est donc un plancher.'
      )
  }
}

/**
 * Combien de clients sont sur une offre AUJOURD'HUI — le chiffre que la
 * confirmation d'édition doit nommer.
 *
 * ⚠️ `null` quand la mesure n'a pas pu être chargée, et surtout pas `0` : une
 * confirmation qui annoncerait « 0 client concerné » parce que l'API n'a pas
 * répondu ferait croire qu'un changement de prix n'affecte personne. C'est
 * exactement l'inverse de ce que la confirmation protège.
 */
export function clientsSurLOffre(economics: readonly OfferEconomics[] | null, key: string): number | null {
  return economics?.find(offre => offre.key === key)?.customers ?? null
}

/** Une offre telle que l'éditeur la connaît, avant ou après édition. */
type OffreEditable = {
  label: string
  price: number
  accountsLimit: number
  enrichmentCredits: number
  seats: number
  extraSeatPrice: number
  features: readonly string[]
}

/** Ce qu'une sauvegarde va RÉELLEMENT faire. Non exporté : seul
 *  `resumerLesChangements` le produit, et l'éditeur le lit par inférence. */
type ChangementsDOffre = {
  /** Les libellés des champs modifiés, dans l'ordre du formulaire. */
  champs: string[]
  /** Un prix (offre ou siège) a bougé : les abonnés EN COURS y passeront à leur
   *  prochaine échéance. C'est le seul champ qui traverse la porte. */
  prixModifie: boolean
  /** Les fonctions décochées : elles sont retirées IMMÉDIATEMENT aux abonnés du
   *  palier — l'API refuse alors l'appel et l'app affiche un verrou. */
  fonctionsRetirees: string[]
}

const CHAMPS: ReadonlyArray<{ lire: (o: OffreEditable) => string | number; libelle: string }> = [
  { lire: o => o.label, libelle: 'nom' },
  { lire: o => o.price, libelle: 'prix' },
  { lire: o => o.accountsLimit, libelle: 'crédits/mois' },
  { lire: o => o.enrichmentCredits, libelle: 'enrichissements' },
  { lire: o => o.seats, libelle: 'sièges' },
  { lire: o => o.extraSeatPrice, libelle: 'prix du siège supplémentaire' },
]

/**
 * Ce qui va changer, et ce que ça touche.
 *
 * ⚠️ L'ORDRE des fonctions ne compte pas : le serveur les renvoie dans l'ordre
 * du contrat, et un `!==` sur deux tableaux déclarerait TOUTE sauvegarde
 * modifiée — la confirmation crierait au loup à chaque clic, et on apprendrait
 * à la traverser sans lire.
 */
export function resumerLesChangements(avant: OffreEditable, apres: OffreEditable): ChangementsDOffre {
  const champs = CHAMPS.filter(champ => champ.lire(avant) !== champ.lire(apres)).map(champ => champ.libelle)

  const fonctionsAvant = [...avant.features].sort()
  const fonctionsApres = [...apres.features].sort()
  const fonctionsChangees =
    fonctionsAvant.length !== fonctionsApres.length || fonctionsAvant.some((f, i) => f !== fonctionsApres[i])
  if (fonctionsChangees) champs.push('fonctions incluses')

  return {
    champs,
    prixModifie: avant.price !== apres.price || avant.extraSeatPrice !== apres.extraSeatPrice,
    fonctionsRetirees: fonctionsAvant.filter(f => !fonctionsApres.includes(f)),
  }
}

/**
 * La phrase de la confirmation : elle NOMME la conséquence.
 *
 * « Êtes-vous sûr ? » ne protège de rien — on clique oui. Ce qui protège, c'est
 * de lire combien de clients sont sur cette offre AUJOURD'HUI, juste avant de
 * la changer. C'est le même principe que la suppression d'un utilisateur, qui
 * nomme les espaces qu'elle emporte.
 *
 * ⚠️ `null` (mesure indisponible) ne se rend JAMAIS « 0 client » : une panne
 * qui se lit comme « personne n'est concerné », juste avant un changement de
 * prix, est le pire mensonge que cet écran puisse produire.
 */
export function phraseDeConfirmation(offre: string, clients: number | null): string {
  if (clients === null) {
    return `Nombre de clients sur « ${offre} » : indisponible (la mesure n’a pas pu être chargée). Ce n’est pas « aucun » : quelqu’un peut être concerné.`
  }
  if (clients === 0) return `À ce jour, aucun client n’est sur « ${offre} ».`
  return `À ce jour, ${clients} ${clients === 1 ? 'client est' : 'clients sont'} sur « ${offre} ».`
}
