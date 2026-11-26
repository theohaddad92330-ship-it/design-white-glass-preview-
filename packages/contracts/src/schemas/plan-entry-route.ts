/**
 * #3423.8 — LA VOIE D'ENTRÉE DU PLAN, une seule lecture.
 *
 * L'onglet Plan du compte affiche la voie d'entrée de l'angle RECOMMANDÉ (à défaut, le premier) lu
 * dans `raw_analysis` : angles saisis (`user_attack_angles`) puis angles générés (`angles`),
 * persona d'entrée (`entry_contact_persona`) avant `entry_point`. Laura, à « Par où j'ouvre ce
 * compte ? », relit CETTE fonction — jamais une seconde dérivation de la même grandeur (GA-26).
 * Sans angle ou sans voie renseignée : `null` (non mesuré), jamais une voie devinée.
 */
export function readPlanEntryRoute(rawAnalysis: unknown): string | null {
  const raw = asRecord(rawAnalysis)
  if (!raw) return null
  const angles = [...asArray(raw['user_attack_angles']), ...asArray(raw['angles'])]
    .map(asRecord)
    .filter((angle): angle is Record<string, unknown> => angle !== null)
    // Même filtre que l'écran : un angle sans titre ni description n'existe pas.
    .filter(angle => text(angle['title']) !== '' || text(angle['strategy'] ?? angle['description']) !== '')
  const angle = angles.find(candidate => candidate['is_recommended'] === true) ?? angles[0] ?? null
  if (!angle) return null
  const route = text(angle['entry_contact_persona'] ?? angle['entry_point'])
  return route === '' ? null : route
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}
