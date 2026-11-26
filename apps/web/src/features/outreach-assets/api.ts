import type { CreateOutreachAsset, OutreachAsset, StorageUploadInput, UpdateOutreachAsset } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2838 — client HTTP du catalogue d'assets outreach (`/outreach-assets`).
 * Le catalogue existe côté API (CRUD complet, testé, seedé en démo, lazy via
 * `OutreachAssetService.ensureSeeded`). #3699.6 — le fichier réel d'un asset se
 * dépose et se retire ici (`/outreach-assets/:id/file`) : c'est la bibliothèque
 * des documents joignables à un e-mail individuel.
 */
export const outreachAssetsApi = {
  list(): Promise<OutreachAsset[]> {
    return apiFetch<OutreachAsset[]>({ path: '/outreach-assets' })
  },
  create(input: CreateOutreachAsset): Promise<OutreachAsset> {
    return apiFetch<OutreachAsset, CreateOutreachAsset>({ path: '/outreach-assets', method: 'POST', body: input })
  },
  update(id: string, patch: UpdateOutreachAsset): Promise<OutreachAsset> {
    return apiFetch<OutreachAsset, UpdateOutreachAsset>({
      path: `/outreach-assets/${id}`,
      method: 'PATCH',
      body: patch,
    })
  },
  /** #3699.6 — rattache le fichier RÉEL d'un asset (document joignable à un e-mail). */
  attachFile(id: string, upload: StorageUploadInput): Promise<OutreachAsset> {
    return apiFetch<OutreachAsset, StorageUploadInput>({
      path: `/outreach-assets/${id}/file`,
      method: 'POST',
      body: upload,
    })
  },
  /** #3699.6 — retire le fichier : l'asset reste, annoncé sans fichier. */
  detachFile(id: string): Promise<OutreachAsset> {
    return apiFetch<OutreachAsset>({ path: `/outreach-assets/${id}/file`, method: 'DELETE' })
  },
  delete(id: string): Promise<void> {
    return apiFetch<void>({ path: `/outreach-assets/${id}`, method: 'DELETE' })
  },
}
