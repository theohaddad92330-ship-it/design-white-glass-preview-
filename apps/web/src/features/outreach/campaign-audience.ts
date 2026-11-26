/**
 * #1935.25 — L'AUDIENCE D'UNE CAMPAGNE PRÉPARÉE PAR LAURA, ET CE QUI EN SORT.
 *
 * L'URL que le chat ouvre (`/actions/sequences?contact_ids=…&objective=…`, lue
 * par `campaign-prefill.ts`) ne porte que des IDENTIFIANTS : l'écran doit
 * relire les fiches avant de proposer quoi que ce soit. Entre la proposition et
 * le clic, une fiche a pu être écartée, fusionnée, supprimée — et l'audience
 * n'est alors plus celle qui a été annoncée.
 *
 * LA RÈGLE QUE CE FICHIER TIENT : **un contact qui sort de l'audience est
 * NOMMÉ, avec sa raison.** Un contact qui disparaît en silence est un contact
 * qu'on croit relancé. Le moteur fait déjà ce tri côté Laura (`prepare_campaign`
 * rend un `excluded` avec son motif) ; ici c'est la relecture au moment du
 * geste, qui est le seul moment qui compte.
 *
 * ⚠️ « Pas encore lue » n'est ni « introuvable » ni « écartée » : tant qu'une
 * fiche est en attente, l'audience n'est pas connue et l'écran ne conclut rien
 * (GA-18 / GA-19 — non mesuré n'est pas mesuré à zéro). « Non lue » (erreur de
 * lecture) ne se dit pas non plus « introuvable » : on sait qu'on ne sait pas.
 */

/**
 * Ce que l'écran a besoin de savoir d'un contact de l'audience — exactement le
 * sous-ensemble que `CreateSequenceDialog` consomme, plus ce qui décide d'un
 * écart. Aucun champ n'est inventé : ce qui n'est pas lu reste absent.
 */
type CampaignAudienceContact = {
  id: string
  full_name: string
  title: string | null
  email: string | null
  /** Contact écarté, avec son motif. `null`/absent = actif. */
  excluded_at?: string | null
  exclusion_reason?: string | null
  /** #2202.23 — le porteur attribué, pour le même avertissement colleague que
   *  les autres portes de `CreateSequenceDialog` (`ContactsSelectionBar.tsx`,
   *  `ContactOutreachCard.tsx`, `ContactContent.tsx`). */
  assigned_to?: string | null
}

/** Une lecture de fiche, telle que l'écran l'a obtenue. */
export type CampaignAudienceRead =
  /** Lecture en cours : on ne sait pas encore. */
  | { id: string; state: 'pending' }
  | { id: string; state: 'read'; contact: CampaignAudienceContact }
  /** Le serveur a répondu « cette fiche n'existe pas dans ce portefeuille ». */
  | { id: string; state: 'missing' }
  /** La lecture a échoué : on ne sait pas si la fiche existe. */
  | { id: string; state: 'unreadable' }

type CampaignDroppedReason = 'opted_out' | 'missing' | 'unreadable'

export type CampaignDropped = {
  id: string
  /** Le nom quand la fiche a pu être lue — jamais inventé, jamais « Contact ». */
  fullName: string | null
  reason: CampaignDroppedReason
  /** Le motif ÉCRIT de l'écartement, quand la fiche en porte un. */
  detail: string | null
}

export type CampaignAudience = {
  /** Les contacts que la fenêtre de création reçoit, dans l'ordre de l'URL. */
  eligible: CampaignAudienceContact[]
  /** Ceux qui n'y entrent pas, chacun avec sa raison. */
  dropped: CampaignDropped[]
  /** Fiches encore en lecture — au-dessus de 0, l'audience n'est pas connue. */
  pending: number
}

/** Une chaîne vide, ou blanche, n'est pas un motif : elle vaut `null`. */
function writtenReason(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim()
  return value || null
}

export function campaignAudience(reads: readonly CampaignAudienceRead[]): CampaignAudience {
  const eligible: CampaignAudienceContact[] = []
  const dropped: CampaignDropped[] = []
  let pending = 0

  for (const entry of reads) {
    if (entry.state === 'pending') {
      pending += 1
      continue
    }
    if (entry.state === 'missing' || entry.state === 'unreadable') {
      dropped.push({ id: entry.id, fullName: null, reason: entry.state, detail: null })
      continue
    }
    // Un contact qui a demandé le silence ne rejoint JAMAIS une campagne — et
    // il se dit, avec le motif consigné le jour de l'écartement.
    if (entry.contact.excluded_at) {
      dropped.push({
        id: entry.id,
        fullName: entry.contact.full_name,
        reason: 'opted_out',
        detail: writtenReason(entry.contact.exclusion_reason),
      })
      continue
    }
    eligible.push(entry.contact)
  }

  return { eligible, dropped, pending }
}
