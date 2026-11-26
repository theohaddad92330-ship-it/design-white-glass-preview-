import type { AgendaViewMode } from '@/features/agenda/agenda-view'

/**
 * #2994 — le paramètre `?mode=` de `/briefing`, seule source du filtre de vue
 * une fois monté (voir `routes/briefing/index.tsx`). Une valeur absente ou
 * inconnue redevient `undefined` — jamais une erreur — pour que le lien par
 * défaut (`/briefing`, sans paramètre) reste toujours valide.
 */
export function parseAgendaMode(raw: unknown): AgendaViewMode | undefined {
  return raw === 'day' || raw === 'week' ? raw : undefined
}
