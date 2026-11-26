import type { OutreachSequenceStatus } from './outreach-sequence.js'

/**
 * #2325.35 — LE SOUS-ENSEMBLE DONT {@link detectContactSolicitationCollisions}
 * A RÉELLEMENT BESOIN. Même geste que {@link StaffingCollisionCandidate}
 * (`staffing-collision.ts`) : l'appelant qui ne lit QUE les séquences n'a pas à
 * reconstituer un objet complet — la fonction reste PURE.
 */
export type ContactSolicitationCandidate = {
  id: string
  contactId: string
  contactName: string | null
  status: OutreachSequenceStatus
}

/**
 * #2325.35 — « DÉTECTE LES MÊMES CONTACTS SOLLICITÉS [ailleurs] ».
 *
 * Même définition que {@link detectStaffingCollisions} (`staffing-collision.ts`,
 * #2325.34), transposée du consultant au contact : DEUX séquences d'outreach
 * ACTIVES sur la MÊME personne, lancées par des affaires ou des commerciaux
 * distincts ou non — cette fonction ne lit JAMAIS `user_id` (l'auteur de la
 * séquence), pour la MÊME raison de doctrine que #2325.34 : détecter une
 * collision ENTRE COMMERCIAUX demanderait un suivi d'activité PAR PERSONNE, ce
 * que « l'analytique mesure le produit, jamais la personne » interdit. Le
 * signal utile est opérationnel — cette personne reçoit-elle deux cadences à la
 * fois ? — jamais un reproche entre deux commerciaux.
 *
 * `paused`/`completed`/`cancelled` ne comptent pas : une séquence arrêtée ne
 * sollicite plus personne — la compter ferait remonter un conflit qui n'existe
 * plus.
 *
 * Déterministe, sans effet de bord, et vide quand il n'y a rien : une liste
 * vide veut dire « aucune collision parmi CE QU'ON A LU », jamais « aucune
 * collision dans l'espace ».
 */
export type ContactSolicitationCollision = {
  contactId: string
  contactName: string | null
  /** Les séquences actives qui visent la même personne, au moins deux. */
  sequenceIds: readonly string[]
}

function isActive(sequence: ContactSolicitationCandidate): boolean {
  return sequence.status === 'active'
}

export function detectContactSolicitationCollisions(
  sequences: readonly ContactSolicitationCandidate[],
): ContactSolicitationCollision[] {
  const byContact = new Map<string, ContactSolicitationCandidate[]>()
  for (const sequence of sequences) {
    if (!isActive(sequence)) continue
    const bucket = byContact.get(sequence.contactId)
    if (bucket) bucket.push(sequence)
    else byContact.set(sequence.contactId, [sequence])
  }

  const collisions: ContactSolicitationCollision[] = []
  for (const [contactId, bucket] of byContact) {
    // DEUX séquences DISTINCTES, pas une seule relue deux fois.
    if (bucket.length < 2) continue
    collisions.push({
      contactId,
      contactName: bucket.find(sequence => sequence.contactName)?.contactName ?? null,
      sequenceIds: bucket.map(sequence => sequence.id),
    })
  }
  return collisions
}
