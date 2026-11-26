/**
 * #4044 — le lieu d'un contact tel que la COLLECTE l'a lu (`raw_data`), projeté pour la liste HTTP
 * d'un compte, qui ne sert plus le blob entier (GA-297). Mêmes clés que `excludeOutsideGeoPerimeter`
 * (`contacts.service.ts`) : l'écran et l'écartement jugent le périmètre sur le même lieu.
 * Aucune clé lisible ⇒ `null` : un lieu absent ne prouve rien, il n'est jamais deviné.
 */
export type ContactPlaceView = { country: string | null; city: string | null; organization: string | null }

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function contactPlaceOf(rawData: Record<string, unknown> | null | undefined): ContactPlaceView | null {
  if (!rawData) return null
  const apollo = rawData['apolloDetails']
  const organization =
    apollo && typeof apollo === 'object' ? text((apollo as { organization?: unknown }).organization) : null
  const place = { country: text(rawData['country']), city: text(rawData['city']), organization }
  return place.country || place.city || place.organization ? place : null
}
