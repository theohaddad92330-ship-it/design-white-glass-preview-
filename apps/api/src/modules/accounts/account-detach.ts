/**
 * Détacher deux dossiers qu'on avait rattachés (#1111).
 *
 * ── Pourquoi ce module existe ────────────────────────────────────────────
 *
 * Le rattachement (`account-absorb.ts`) était livré sans retour arrière. Deux
 * conséquences, l'une visible et l'autre pas :
 *
 *  - `accounts.merged_into_id` était ÉCRITE et jamais relue. La migration qui
 *    l'a créée dit pourtant sa raison d'être en toutes lettres — « dire à
 *    l'écran : ce dossier a été rattaché à KLESIA, au lieu de laisser un compte
 *    archivé sans explication ». Cet écran n'existait pas.
 *  - Le rattachement écrase `status` et `commercial_status` par `'archived'`.
 *    L'état d'avant ne survivait nulle part, si bien qu'un « détacher » écrit
 *    sur cette base aurait dû CHOISIR un statut de retour — donc en inventer un.
 *
 * D'où les colonnes de la migration `1790280000001`, et ce module qui les lit.
 *
 * ── Ce que le détachement fait, et ce qu'il ne fait pas ──────────────────
 *
 * Il DÉFAIT le geste, il ne fabrique rien : le dossier retrouve le statut qu'il
 * avait, ses contacts reviennent, le lien est effacé. Ce qui n'avait pas bougé
 * n'a pas à revenir. Un lien dont l'état d'avant n'a pas été enregistré est
 * refusé À VOIX HAUTE plutôt que restitué au jugé — « JAMAIS de donnée
 * fictive » vaut aussi pour un statut.
 */

/** Ce qu'on sait d'un dossier rattaché pour décider s'il peut être détaché. */
export type DetachAccount = {
  id: string
  /** Le dossier auquel celui-ci a été rattaché, ou `null`. */
  mergedIntoId: string | null
  /** Le statut d'analyse d'AVANT le rattachement. `null` = jamais enregistré. */
  previousStatus: string | null
  /** Le statut commercial d'AVANT. `null` = il n'y en avait pas. */
  previousCommercialStatus: string | null
  /** L'entité d'accueil créée sur le compte gardé, seul repère des contacts
   *  qui ont bougé. */
  hostEntityId: string | null
}

/** Ce qu'on sait d'un contact pour décider s'il peut revenir. */
type DetachContact = {
  id: string
  fullName: string
}

export type DetachRefusal =
  /** Ce dossier n'est rattaché à rien — il n'y a rien à défaire. */
  | 'not_linked'
  /**
   * Le lien a été posé avant que l'état d'avant soit enregistré (migration
   * `1790280000001`). Le rendre exigerait de choisir un statut : on refuse, et
   * on le dit. Un refus muet ferait recommencer ; un statut inventé ferait pire.
   */
  | 'link_predates_reversal'

export type DetachPlan = {
  /** Les contacts qui retournent sur le dossier détaché. */
  returnedContactIds: string[]
  /**
   * Ceux qui RESTENT sur le compte gardé, avec la raison. Un homonyme déjà
   * présent sur le dossier rendu est la MÊME personne : le ramener violerait
   * l'unicité par nom, et l'écraser effacerait la fiche la plus renseignée.
   */
  keptContacts: Array<{ id: string; fullName: string; reason: 'name_taken' }>
  /** Le statut d'analyse RENDU — celui qu'on avait enregistré, pas un choix. */
  restoredStatus: string
  /** Le statut commercial rendu, ou `null` quand il n'y en avait pas. */
  restoredCommercialStatus: string | null
}

/**
 * Clé d'identité d'un contact — MIROIR de l'index d'unicité que la base porte
 * sur `(account_id, nom normalisé)`, et copie délibérée de celle de
 * `account-absorb.ts` : les deux sens du geste doivent compter les homonymes
 * de la même façon, sinon un aller-retour ne rend pas ce qu'il a pris.
 */
function contactKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Le refus, ou `null` quand le détachement est possible. */
export function refuseDetach(account: DetachAccount): DetachRefusal | null {
  if (!account.mergedIntoId) return 'not_linked'
  // L'entité d'accueil peut manquer sans empêcher le retour : elle conditionne
  // le retour des CONTACTS, pas celui du statut. Laisser un dossier archivé
  // pour toujours parce qu'aucun contact n'a bougé serait une punition.
  if (!account.previousStatus) return 'link_predates_reversal'
  return null
}

/**
 * Ce que le détachement fera, calculé AVANT d'écrire.
 *
 * Pur, comme `planAbsorb` : c'est ce qui permet à la prévisualisation de
 * montrer exactement ce que l'écriture fera, et non une approximation qui
 * divergerait au premier ajustement.
 *
 * À n'appeler qu'après un {@link refuseDetach} qui rend `null` — le statut
 * rendu vient de `previousStatus`, et il n'y a pas de repli.
 */
export function planDetach(args: {
  account: DetachAccount
  /** Les contacts actuellement portés par l'entité d'accueil. */
  hostedContacts: readonly DetachContact[]
  /** Les contacts déjà présents sur le dossier qu'on détache. */
  homeContacts: readonly DetachContact[]
}): DetachPlan {
  const present = new Set(args.homeContacts.map(contact => contactKey(contact.fullName)))
  const returnedContactIds: string[] = []
  const keptContacts: DetachPlan['keptContacts'] = []

  for (const contact of args.hostedContacts) {
    const key = contactKey(contact.fullName)
    if (!key || present.has(key)) {
      keptContacts.push({ id: contact.id, fullName: contact.fullName, reason: 'name_taken' })
      continue
    }
    // Deux homonymes PARMI les contacts qui reviennent : le second reste aussi,
    // pour la même raison — l'unicité porte sur le compte d'arrivée.
    present.add(key)
    returnedContactIds.push(contact.id)
  }

  return {
    returnedContactIds,
    keptContacts,
    // `previousStatus` est garanti non nul par `refuseDetach` ; le `?? ''` ne
    // s'exécute jamais, il évite juste d'affirmer au compilateur ce qu'il ne
    // peut pas vérifier.
    restoredStatus: args.account.previousStatus ?? '',
    restoredCommercialStatus: args.account.previousCommercialStatus,
  }
}
