/**
 * Rattacher un dossier en double à celui qu'on garde (#1111).
 *
 * « J'ai lancé plus tôt ce matin deux analyses, sur KLESIA et KLESIA ADP. C'est
 * la même chose, simplement des entités. Ce serait bien de pouvoir "fusionner"
 * deux prospects / clients en un seul compte. »
 *
 * ── Pourquoi RATTACHER et non fusionner ──────────────────────────────────
 *
 * Trente-sept tables portent un `account_id`. Les repointer toutes est un
 * chantier dont chaque ligne est irréversible, et plusieurs portent des index
 * d'unicité qu'un repointage aveugle violerait — c'est exactement l'incident
 * #983, où un renommage de contact a fait tomber trois runs d'affilée sur une
 * violation de `idx_contacts_account_normalized_name`.
 *
 * Or « KLESIA ADP » n'est pas un doublon de « KLESIA » : c'est une ENTITÉ de
 * KLESIA, et le modèle porte déjà cet objet (`account_entities`, « une
 * subdivision du CLIENT »). Le geste juste n'est donc pas de fondre deux
 * dossiers, c'est de dire lequel est la subdivision de l'autre.
 *
 * Ce qui BOUGE : les contacts — le seul objet qu'un commercial a réellement
 * besoin de retrouver sur le compte gardé — et une entité créée pour l'accueil.
 * Ce qui RESTE : tout le reste, sur le dossier archivé, qui demeure lisible.
 * Rien n'est supprimé, et l'écran le DIT avant le clic : ce qui reste n'est pas
 * perdu, il est ailleurs, et on sait où.
 *
 * ── Les trois refus ──────────────────────────────────────────────────────
 *
 * Chacun est NOMMÉ. Un refus muet sur un geste irréversible fait recommencer.
 */

/** Ce qu'on sait d'un compte pour décider. */
export type AbsorbAccount = {
  id: string
  companyName: string
  siren: string | null
  website: string | null
  status: string
  mergedIntoId: string | null
}

/** Ce qu'on sait d'un contact pour décider s'il peut bouger. */
type AbsorbContact = {
  id: string
  fullName: string
}

export type AbsorbRefusal =
  | 'same_account' //        rattacher un dossier à lui-même
  | 'already_merged' //      il a déjà été rattaché — ce n'est plus un doublon
  | 'target_merged' //       la cible a elle-même été rattachée ailleurs
  | 'target_archived' //     on ne rattache pas à un dossier qu'on a rangé

export type AbsorbPlan = {
  /** Les contacts qui rejoignent le compte gardé. */
  movedContactIds: string[]
  /**
   * Ceux qui RESTENT, avec la raison. Un homonyme déjà présent sur le compte
   * gardé est la MÊME personne : le déplacer violerait l'unicité par nom, et
   * l'écraser effacerait la fiche la plus renseignée des deux.
   */
  keptContacts: Array<{ id: string; fullName: string; reason: 'already_there' }>
  /** L'entité d'accueil à créer sur le compte gardé. */
  entity: { name: string; kind: 'subsidiary'; siren: string | null; domain: string | null }
}

/**
 * Clé d'identité d'un contact — MIROIR de l'index d'unicité que la base porte
 * sur `(account_id, nom normalisé)`. C'est cet index qui a fait tomber trois
 * runs en #983 ; on le respecte AVANT d'écrire plutôt que d'apprendre son
 * existence par une 23505.
 */
function contactKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Le refus, ou `null` quand le rattachement est possible. */
export function refuseAbsorb(absorbed: AbsorbAccount, kept: AbsorbAccount): AbsorbRefusal | null {
  if (absorbed.id === kept.id) return 'same_account'
  if (absorbed.mergedIntoId) return 'already_merged'
  if (kept.mergedIntoId) return 'target_merged'
  // Rattacher à un dossier archivé produirait une chaîne d'archives : la
  // personne cliquerait, et les deux dossiers seraient rangés.
  if (kept.status === 'archived' || kept.status === 'deleted') return 'target_archived'
  return null
}

/**
 * Ce que le rattachement fera, calculé AVANT d'écrire.
 *
 * Pur : c'est ce qui permet à la prévisualisation de montrer exactement ce que
 * l'écriture fera — et non une approximation qui divergerait au premier
 * ajustement. Même discipline que la simulation de l'assistant d'import.
 */
export function planAbsorb(args: {
  absorbed: AbsorbAccount
  absorbedContacts: readonly AbsorbContact[]
  keptContacts: readonly AbsorbContact[]
}): AbsorbPlan {
  const present = new Set(args.keptContacts.map(c => contactKey(c.fullName)))
  const movedContactIds: string[] = []
  const keptContacts: AbsorbPlan['keptContacts'] = []

  for (const contact of args.absorbedContacts) {
    const key = contactKey(contact.fullName)
    if (!key || present.has(key)) {
      keptContacts.push({ id: contact.id, fullName: contact.fullName, reason: 'already_there' })
      continue
    }
    // Deux homonymes DANS le dossier absorbé : le second resterait aussi, pour
    // la même raison — l'unicité porte sur le compte d'arrivée.
    present.add(key)
    movedContactIds.push(contact.id)
  }

  return {
    movedContactIds,
    keptContacts,
    entity: {
      name: args.absorbed.companyName,
      // `subsidiary` et non `unknown` : le geste de l'utilisateur EST
      // l'affirmation que ce dossier est une subdivision de l'autre. C'est la
      // seule chose que ce clic déclare, et on ne la dilue pas.
      kind: 'subsidiary',
      siren: args.absorbed.siren,
      domain: args.absorbed.website,
    },
  }
}
