import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Contact } from '@bellum/contracts'

/**
 * Keep the address bar on the contact's canonical id.
 *
 * Deduplication merges two rows and deletes the loser, so a URL a rep had
 * bookmarked — or pasted into an email to a colleague — pointed at an id that no
 * longer existed and rendered « Contact introuvable » for a person who was still
 * there under a new id. The API now resolves the retired id and answers with the
 * survivor plus `merged_from`; this rewrites the URL so a reload, a copy-paste
 * or a browser Back lands on the id that will keep working.
 *
 * `replace` on purpose: the dead id must not stay in the history stack, or Back
 * walks straight into the page we just recovered from.
 */
export function useMergedContactRedirect(contact: Contact | undefined, requestedId: string): void {
  const navigate = useNavigate()
  const survivorId = contact?.merged_from ? contact.id : undefined

  useEffect(() => {
    if (!survivorId || survivorId === requestedId) return
    void navigate({ to: '/contacts/$id', params: { id: survivorId }, replace: true })
  }, [survivorId, requestedId, navigate])
}
