import type { TalentRow } from '@bellum/contracts'

/**
 * D'OÙ sort la disponibilité affichée — la source ET la date (doctrine
 * `Provenance`, PDF 5 §1.4, PDF 22 §01 piège n°2, BEL-ATS-003).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `TalentAvailabilityBadge` dérivait déjà correctement l'état, et montrait le
 * déclaratif quand il ne pouvait pas conclure. Ce qu'il n'exposait NULLE PART,
 * c'est d'où venait la valeur affichée.
 *
 * Le piège que ça ouvre est précis : « disponible » DÉDUIT d'une absence
 * d'affectation et « disponible » DÉCLARÉ par la personne sont deux faits
 * différents. Le premier dit « notre base ne connaît aucune mission en cours »,
 * le second dit « cette personne a dit oui ». Les confondre envoie un
 * commercial positionner quelqu'un qui n'a rien promis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉLIBÉRÉMENT ABSENT
 * ─────────────────────────────────────────────────────────────────────────
 *  - **aucun repli plausible.** Sans affectation ET sans déclaration, la
 *    réponse est `unknownSource` — « source inconnue ». Écrire « la fiche le
 *    déclare » sur une fiche qui ne déclare rien fabriquerait une provenance.
 *  - **aucune date inventée.** Une déclaration sans date sort avec
 *    `observedAt: null` ; on ne la date pas d'aujourd'hui, ce qui ferait
 *    passer pour fraîche une information dont on ignore l'âge.
 *  - **aucune libération déduite d'une affectation sans fin** : `openEnded`
 *    ne porte pas de date, et c'est le point du ⚠️ de §1.4.
 *
 * La dérivation de l'ÉTAT vit dans `deriveStaffing` (`@bellum/contracts`) et
 * n'est pas refaite ici : ce fichier ne répond qu'à « d'où ça sort ».
 */
type StaffingProvenance =
  /** Lue dans les AFFECTATIONS — calculée, donc `pipeline` au sens de la primitive. */
  | {
      kind: 'derived'
      detail: 'busyUntil' | 'openEnded' | 'activeNoEnd' | 'noneRunning' | 'interruptionUnconfirmed'
      observedAt: string | null
    }
  /** Lue sur la FICHE — saisie par quelqu'un, donc `human`. */
  | { kind: 'declared'; detail: 'card'; observedAt: string | null }
  /** Ni l'un ni l'autre. Ça se dit, ça ne se devine pas. */
  | { kind: 'unknownSource' }

export function staffingProvenance(row: TalentRow): StaffingProvenance {
  const { availability, freeFrom } = row.staffing

  if (availability === 'unknown') {
    // Aucune affectation enregistrée : la seule source possible est la fiche.
    if (row.declaredAvailability === 'inconnu' || !row.declaredAvailability) return { kind: 'unknownSource' }
    return { kind: 'declared', detail: 'card', observedAt: row.updatedAt || null }
  }

  if (availability === 'busy_open_ended') return { kind: 'derived', detail: 'openEnded', observedAt: null }

  // #3068 — interruption déclarée, pas encore confirmée : aucune date connue,
  // même patron que `openEnded` (aucune libération n'est annoncée).
  if (availability === 'a_confirmer') return { kind: 'derived', detail: 'interruptionUnconfirmed', observedAt: null }

  if (availability === 'available') return { kind: 'derived', detail: 'noneRunning', observedAt: freeFrom }

  // `busy` et `partial` : une affectation court. Avec sa fin, on la nomme ;
  // sans elle, on dit qu'on ne la connaît pas — jamais qu'il n'y en a pas.
  return freeFrom
    ? { kind: 'derived', detail: 'busyUntil', observedAt: freeFrom }
    : { kind: 'derived', detail: 'activeNoEnd', observedAt: null }
}
