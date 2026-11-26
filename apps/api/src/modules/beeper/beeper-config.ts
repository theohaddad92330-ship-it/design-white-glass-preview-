/**
 * #4406.1 — Beeper Desktop : AUCUNE clé neuve. Le client OAuth s'obtient par enregistrement
 * dynamique (RFC 7591) auprès du Beeper Desktop de l'utilisateur ; il ne manque au serveur que
 * l'adresse où Beeper renverra le navigateur : `<API_PUBLIC_URL>/beeper/callback`.
 *
 * Sans `API_PUBLIC_URL` = no-op : le connecteur n'est pas proposé (aucun appel réseau).
 */
export type BeeperConfig = {
  redirectUri: string
  frontendUrl: string
}

export function readBeeperConfig(): BeeperConfig | null {
  const api = process.env['API_PUBLIC_URL']?.trim().replace(/\/+$/, '')
  if (!api) return null
  return {
    redirectUri: `${api}/beeper/callback`,
    frontendUrl: process.env['FRONTEND_URL']?.trim() || 'http://localhost:3000',
  }
}

/** Délai court : Beeper tourne sur un poste, derrière un tunnel — s'il ne répond pas vite, il est injoignable. */
export const BEEPER_TIMEOUT_MS = 5_000
