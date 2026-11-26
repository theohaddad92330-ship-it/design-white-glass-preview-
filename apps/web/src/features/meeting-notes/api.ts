import type { TranscriptionStatus } from '@bellum/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

export const meetingNotesApi = {
  status(): Promise<TranscriptionStatus> {
    return apiFetch<TranscriptionStatus>({ path: '/meeting-notes/status' })
  },
  /** #2319.57 — `recordingConsent` est EXIGÉ : l'API refuse un dépôt sans lui. */
  transcribe(body: {
    audioB64: string
    filename: string
    language?: string
    recordingConsent: true
  }): Promise<{ text: string }> {
    return apiFetch<{ text: string }>({ path: '/meeting-notes/transcribe', method: 'POST', body })
  },
  createTasks(body: {
    tasks: Array<{ subject: string; body?: string; dueAt: string }>
  }): Promise<{ created: number; failed: Array<{ subject: string; reason: string }> }> {
    return apiFetch({ path: '/meeting-notes/tasks', method: 'POST', body })
  },
  /** #2103.4 — le texte d'un document joint (PDF/Word), avant de le proposer
   *  comme matière du compte rendu. Lecture pure, aucun crédit débité. */
  extractDocument(body: { fileB64: string; filename: string }): Promise<{ text: string; partial: boolean }> {
    return apiFetch({ path: '/meeting-notes/extract-document', method: 'POST', body })
  },
}

/** La transcription est-elle activée sur ce serveur ? Demandé AVANT de proposer
 *  le dépôt d'un fichier : un bouton qui échoue au clic est pire qu'un bouton
 *  absent. */
export function useTranscriptionStatus() {
  return useQuery({
    queryKey: ['meeting-notes', 'status'],
    queryFn: meetingNotesApi.status,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useTranscribe() {
  return useMutation({ mutationFn: meetingNotesApi.transcribe })
}

export function useCreateNoteTasks() {
  return useMutation({ mutationFn: meetingNotesApi.createTasks })
}

export function useExtractMeetingDocument() {
  return useMutation({ mutationFn: meetingNotesApi.extractDocument })
}

/** Lit un fichier en base64 sans son préfixe `data:` — c'est ce que l'API attend. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Fichier illisible.'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(file)
  })
}
