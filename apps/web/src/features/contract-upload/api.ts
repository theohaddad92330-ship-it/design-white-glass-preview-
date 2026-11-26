import type { LegalContractUploadLinkPublicStatus } from '@bellum/contracts'
import { apiBase } from '@/lib/api-origin'

/**
 * #2422.6 (épopée #2869, lot R24 07/10/2026) — le CÔTÉ EXTERNE du lien signé.
 *
 * Plain `fetch` (jamais `apiFetch`) — même raison que `usePublicShare.ts` :
 * ce contact n'a pas de session, et il ne faut jamais lui laisser un Bearer
 * token à porter.
 */
export async function fetchContractUploadLinkStatus(token: string): Promise<LegalContractUploadLinkPublicStatus> {
  const res = await fetch(`${apiBase()}/public/legal-contract-uploads/${encodeURIComponent(token)}`)
  if (!res.ok) return { status: 'not_found' }
  return (await res.json()) as LegalContractUploadLinkPublicStatus
}

export async function depositContractUploadFile(
  token: string,
  file: { fileName: string; contentType: string; fileB64: string },
): Promise<{ fileName: string }> {
  const res = await fetch(`${apiBase()}/public/legal-contract-uploads/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(file),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error((body as { message?: string } | null)?.message ?? `Upload failed: ${res.status}`)
  }
  return (await res.json()) as { fileName: string }
}

/** Lit le fichier en base64 BRUT (sans le préfixe `data:...;base64,`) — même
 *  geste que `readFileAsAttachment` (`features/feedback/attachments.ts`). */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
