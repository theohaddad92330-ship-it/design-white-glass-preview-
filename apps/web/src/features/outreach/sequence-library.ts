import type { SequenceTemplate } from '@bellum/contracts'

/** Le fichier voyage en base64 dans un JSON (le serveur borne à 4 Mo). */
export const SEQUENCE_LIBRARY_MAX_FILE_BYTES = 4 * 1024 * 1024

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** « J+0 · J+3 · J+7 » — la cadence d'un modèle, dans l'ordre. */
export function cadenceLabel(template: Pick<SequenceTemplate, 'steps'>): string {
  return template.steps.map(step => `J+${step.delay_days}`).join(' · ')
}

/**
 * Les messages des variables qui BLOQUENT une étape (`payload.blocked_variables`,
 * posé par le serveur à la préparation). Absent ou mal formé = aucune : on ne
 * lit jamais le corps pour deviner.
 */
export function blockedVariablesOf(payload: Record<string, unknown> | null | undefined): string[] {
  const raw = payload?.['blocked_variables']
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}
