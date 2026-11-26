/**
 * Le corps JSON:API de `POST /api/actions` (#4692).
 *
 * Forme PROUVÉE le 02/11/2026 sur l'instance de test BoondManager (UI web, réponse 200, contact fictif) — ce n'est pas
 * une forme devinée. Réserve : capturée avec l'auth de l'UI web, pas encore rejouée en X-Jwt-Client / OAuth2
 * (`agent_docs/boond-marketplace-contrats.md`, Q6).
 *
 * Deux règles : le `typeOf` est un identifiant de l'INSTANCE (lu au dictionnaire par connexion, #4690 — jamais écrit
 * ici) ; le texte du commercial est ÉCHAPPÉ, `text` est du HTML côté Boond.
 */

export type BoondActionInput = {
  /** Valeur du dictionnaire `setting.action.contact` de l'instance (numérique en chaîne). */
  typeOf: string
  title: string
  /** Texte brut du commercial — échappé ici. */
  text: string
  startDate: string | Date
  endDate?: string | Date
  /** Fuseau lu au dictionnaire de l'instance (`setting.timezone`). */
  timezone: string
  contactId: string
  /** Ressource Boond du responsable principal ; `null` = inconnue, relation omise. */
  mainManagerId: string | null
  /** Société du contact ; `null` = inconnue, relation omise. */
  companyId: string | null
}

const ONE_HOUR_MS = 60 * 60 * 1000

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Texte brut → HTML Boond : tout est échappé, seuls les retours à la ligne deviennent `<br>`. */
function toHtml(text: string): string {
  return `<div>${escapeHtml(text.trim()).replace(/\r?\n/g, '<br>')}</div>`
}

function iso(value: string | Date, label: string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} illisible : « ${String(value)} »`)
  return date
}

export function buildActionBody(input: BoondActionInput): Record<string, unknown> {
  if (!/^\d+$/.test(input.typeOf))
    throw new Error(`typeOf « ${input.typeOf} » non numérique : identifiant d'instance attendu`)
  const start = iso(input.startDate, 'startDate')
  const end = input.endDate ? iso(input.endDate, 'endDate') : new Date(start.getTime() + ONE_HOUR_MS)

  const relationships: Record<string, unknown> = {
    dependsOn: { data: { type: 'contact', id: input.contactId } },
    ...(input.mainManagerId ? { mainManager: { data: { type: 'resource', id: input.mainManagerId } } } : {}),
    ...(input.companyId ? { company: { data: { type: 'company', id: input.companyId } } } : {}),
    file: { data: null },
    createdBy: { data: null },
    positioning: { data: null },
    delivery: { data: null },
  }

  return {
    data: {
      type: 'action',
      attributes: {
        typeOf: Number(input.typeOf),
        title: input.title,
        text: toHtml(input.text),
        location: '',
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        startTimezone: input.timezone,
        endTimezone: input.timezone,
        synchronizeWithAdvancedAppCalendar: false,
        relationType: 'parent',
        guests: [],
      },
      relationships,
    },
  }
}
