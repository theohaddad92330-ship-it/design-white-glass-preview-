import { useCallback, useEffect, useRef, useState } from 'react'
import { requestEmailDraft } from '../campaign-sample'

/**
 * Théo C sequences-assistant — LES MESSAGES S'OUVRENT DÉJÀ RÉDIGÉS.
 *
 * À l'étape Messages, chaque touche e-mail montre un texte écrit par Laura pour la personne d'aperçu (jamais un
 * champ vide) : éditable, avec « Régénérer ». La demande part toute seule, une fois par (personne, touche), et
 * jamais à l'ouverture de l'assistant — seulement quand l'étape est affichée. Rien n'est envoyé : ces textes sont
 * un aperçu ; chaque destinataire reçoit sa version dans À traiter, à valider.
 *
 * `context` dit à Laura ce que cette touche doit faire (objectif pour la première, relance pour les suivantes) ;
 * un texte déjà retouché à la main repart avec, pour qu'une régénération garde le ton de la personne.
 */

export type JourneyDraft =
  | { state: 'loading' }
  | { state: 'ready'; subject: string; body: string; edited: boolean }
  | { state: 'error' }

type Request = { index: number; context: string }

export function draftKey(contactId: string, index: number): string {
  return `${contactId}:${index}`
}

export function useJourneyDrafts({
  enabled,
  contactId,
  requests,
}: {
  enabled: boolean
  contactId: string | null
  /** Les touches e-mail à rédiger : leur rang et ce que Laura doit en faire. */
  requests: readonly Request[]
}) {
  const [drafts, setDrafts] = useState<Record<string, JourneyDraft>>({})
  const asked = useRef(new Set<string>())
  // Le dernier appelé gagne : une régénération lancée pendant une autre ne la laisse pas écraser le résultat.
  const generation = useRef(new Map<string, number>())

  const run = useCallback(
    async (id: string, index: number, context: string, keep?: { subject: string; body: string }) => {
      const key = draftKey(id, index)
      const ticket = (generation.current.get(key) ?? 0) + 1
      generation.current.set(key, ticket)
      setDrafts(current => ({ ...current, [key]: { state: 'loading' } }))
      const withText = keep?.body.trim()
        ? `${context}\n\nPars de ce texte, en gardant mon ton :\n${keep.body}`
        : context
      const draft = await requestEmailDraft(id, withText)
      if (generation.current.get(key) !== ticket) return
      setDrafts(current => ({
        ...current,
        [key]: draft ? { state: 'ready', subject: draft.subject, body: draft.body, edited: false } : { state: 'error' },
      }))
    },
    [],
  )

  const signature = requests.map(request => `${request.index}`).join(',')
  useEffect(() => {
    if (!enabled || !contactId) return
    for (const request of requests) {
      const key = draftKey(contactId, request.index)
      if (asked.current.has(key)) continue
      asked.current.add(key)
      void run(contactId, request.index, request.context)
    }
    // `requests` est lu à travers `signature` : un contexte qui change ne relance pas une demande déjà faite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, contactId, signature, run])

  const edit = useCallback((id: string, index: number, patch: Partial<{ subject: string; body: string }>) => {
    const key = draftKey(id, index)
    setDrafts(current => {
      const existing = current[key]
      if (!existing || existing.state !== 'ready') return current
      return { ...current, [key]: { ...existing, ...patch, edited: true } }
    })
  }, [])

  const regenerate = useCallback(
    (id: string, index: number, context: string) => {
      const key = draftKey(id, index)
      const existing = drafts[key]
      const keep = existing?.state === 'ready' && existing.edited ? existing : undefined
      void run(id, index, context, keep)
    },
    [drafts, run],
  )

  return { drafts, edit, regenerate }
}
