import { useEffect, useRef } from 'react'
import type { Contact } from '@bellum/contracts'
import { contactsApi } from '@/features/contacts/api'

type ResumableMutation = {
  mutate: (input: { contact: Contact; accountCompanyName: string; resume: true }) => void
  isPending: boolean
}

/**
 * #4063.1 — l'état « en cours » survit à la navigation. Le suivi vit dans une mutation liée au
 * composant : quitter la fiche le perdait, alors que le job continue côté serveur. Au retour,
 * on sonde UNE fois l'état du job ; s'il est en vol (`queued`/`running`), on reprend le suivi
 * (même toast, même bouton « en cours », même résultat) SANS nouveau POST — donc aucun second
 * débit. `unknown`/`done`/erreur de sonde : rien n'est repris, rien n'est deviné (le résultat
 * déjà écrit sur la fiche s'affiche par la fiche elle-même).
 */
export function useResumeEnrichment({
  contact,
  orgName,
  mutation,
  enabled = true,
}: {
  contact: Contact
  orgName: string
  mutation: ResumableMutation
  /** #4331.2 — `false` : un autre montage de la fiche porte déjà la reprise. */
  enabled?: boolean
}): void {
  const probedFor = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // Un démontage avant la réponse ne doit pas empêcher la prochaine tentative.
      probedFor.current = null
    }
  }, [])
  const { mutate, isPending } = mutation
  useEffect(() => {
    if (!enabled || isPending || !orgName || probedFor.current === contact.id) return
    probedFor.current = contact.id
    contactsApi
      .enrichmentStatus(contact.id)
      .then(status => {
        if (!mounted.current) return
        if (status.state === 'queued' || status.state === 'running') {
          mutate({ contact, accountCompanyName: orgName, resume: true })
        }
      })
      .catch(() => {
        // Une sonde muette n'est pas un état : on ne conclut rien.
      })
  }, [enabled, contact, orgName, isPending, mutate])
}
