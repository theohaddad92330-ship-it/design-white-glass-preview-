/**
 * #2490 / #2496 — la LECTURE de la demande en langage naturel, telle que le
 * moteur l'a appliquée (`query.reading`, `apps/ia/app/routers/discover.py`).
 *
 * Avant, la phrase tapée partait telle quelle dans le plein-texte du registre :
 * « ESN spécialisées cybersécurité à Toulouse » rendait CARGLASS, BNP Paribas et
 * le CNRS (production, 17/09/2026). Le moteur lit désormais la demande (lieu,
 * secteur, type d'entreprise) et rend ici ce qu'il en a fait — l'écran le DIT,
 * pour que la liste se lise avec ses vrais critères.
 *
 * La trace voyage dans `query` (un enregistrement libre du contrat) : une trace
 * absente ou mal formée rend `null`, jamais une lecture inventée.
 */
export interface DiscoverRequestReading {
  /** `esn` ou des codes de secteur d'application (`aerospace`…). */
  activities: string[]
  /** Le lieu appliqué, tel qu'il s'affiche (« Toulouse », « Île-de-France »). */
  place: string | null
  /** Le lieu n'a pas pu être vérifié à temps : il est cherché dans les adresses. */
  placeUnverified: boolean
  /** Un texte court : ses mots non lus restent une recherche par raison sociale. */
  name: string | null
  /** #3512 — le métier/la techno recrutés (« développeurs Python ») : lus, jamais un nom. */
  hiringProfile: string | null
  /** Les mots de la demande qui n'ont PAS filtré la liste. */
  notApplied: string[]
  /** Rien de reconnu, rien de coché : aucune liste n'a été cherchée. */
  unreadable: boolean
}

const texts = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []

export function requestReadingFrom(query: Record<string, unknown> | undefined): DiscoverRequestReading | null {
  const raw = query?.reading
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const reading = raw as Record<string, unknown>
  return {
    activities: texts(reading.activities),
    place: typeof reading.place === 'string' && reading.place.trim() ? reading.place : null,
    placeUnverified: reading.placeUnverified === true,
    name: typeof reading.name === 'string' && reading.name.trim() ? reading.name : null,
    hiringProfile:
      typeof reading.hiringProfile === 'string' && reading.hiringProfile.trim() ? reading.hiringProfile : null,
    notApplied: texts(reading.notApplied),
    unreadable: reading.unreadable === true,
  }
}
