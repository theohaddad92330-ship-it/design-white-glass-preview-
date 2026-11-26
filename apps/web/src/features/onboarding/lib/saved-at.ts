/**
 * #2026.2 — « Enregistré à 14 h 32 », l'horodatage rendu visible de
 * l'autosauvegarde locale déjà en place (#2026.1, `onboardingStore.ts`).
 *
 * ⚠️ Même piège que `claim-notice.ts` (corrigé le 15/09) : `toLocaleTimeString()`
 * nu écrit l'heure dans la locale du NAVIGATEUR, pas celle que l'app affiche —
 * un utilisateur en `fr` sur un navigateur réglé `en-US` verrait « 2:32 PM » sur
 * un écran en français. La langue vient donc de `i18n.language`, jamais du
 * runtime, et le mapping suit celui déjà posé par `chat-quota-text.ts`.
 *
 * `iso` absent ou illisible → `null`, jamais une heure devinée (« non mesuré
 * n'est jamais 0 », appliqué au temps).
 */
export function formatSavedAt(iso: string | null, language: string): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  try {
    return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
  } catch {
    return null
  }
}
