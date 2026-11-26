import type { WorkspaceProfile } from '@bellum/contracts'

/**
 * #4291 J (décision Louis 21/10) — LE SECOND ESPACE DÉMO, au profil forfait / conseil (#4270). Absent = la démo
 * staffing d'avant. Le choix fait sur `/demo` voyage dans la query jusqu'au formulaire `/demo/acces` (la query
 * entière y est déjà reportée, #2705.7), puis jusqu'à `POST /demo/session`.
 */
export type DemoProfile = Extract<WorkspaceProfile, 'forfait_conseil'>

const PROFILE_PARAM = 'profil'

/** Le profil porté par la query, ou `undefined` (staffing, ou valeur inconnue — jamais devinée). */
export function demoProfileFromSearch(search: string | undefined): DemoProfile | undefined {
  return new URLSearchParams(search ?? '').get(PROFILE_PARAM) === 'forfait_conseil' ? 'forfait_conseil' : undefined
}

/** La query `search`, plus le profil choisi — rien de ce qui y était n'est perdu (`?t=`, UTM). */
export function withDemoProfile(search: string, profile: DemoProfile | undefined): string {
  if (!profile) return search
  const params = new URLSearchParams(search)
  params.set(PROFILE_PARAM, profile)
  return `?${params.toString()}`
}
