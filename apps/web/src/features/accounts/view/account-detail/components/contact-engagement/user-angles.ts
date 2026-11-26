import { apiFetch } from '@/lib/api'

/** #4739 — un angle d'approche écrit à la main (≠ angles calculés du dossier), personnel à son auteur. */
export type UserAngle = { id: string; title: string; content: string; archived: boolean }

type UserAngleInput = { title: string; content: string }

export const userAnglesApi = {
  list: () => apiFetch<UserAngle[]>({ path: '/user-angles', method: 'GET' }),
  create: (input: UserAngleInput) => apiFetch<UserAngle>({ path: '/user-angles', method: 'POST', body: input }),
  update: (id: string, input: Partial<UserAngleInput>) =>
    apiFetch<UserAngle>({ path: `/user-angles/${id}`, method: 'PATCH', body: input }),
  /** « Retirer » archive côté serveur — on ne supprime pas. */
  archive: (id: string) => apiFetch<void>({ path: `/user-angles/${id}`, method: 'DELETE' }),
}
