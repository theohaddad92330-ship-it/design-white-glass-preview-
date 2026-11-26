import { useCallback } from 'react'
import { analysisScopeModeSchema, type AnalysisScopeMode } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4161 — LE PÉRIMÈTRE PAR DÉFAUT D'UNE ANALYSE FRAÎCHE, MÉMORISÉ PAR UTILISATEUR.
 *
 * Retour bêta 14/10 : « mon périmètre doit être appliqué par défaut sur les
 * analyses ». Avant ce lot, `scopeMode` repartait de `DEFAULT_SCOPE_MODE`
 * (« France », #3743) à CHAQUE nouvelle analyse (aucun brouillon dans l'URL) :
 * un commercial d'ESN IT & Digital devait re-choisir « IT & Digital » — ou
 * recliquer le conseil « Périmètre conseillé » (#1592.2) — à chaque société
 * cherchée.
 *
 * Cadrage analyse (15/10) — le sélecteur de périmètre et son conseil (#1592.2,
 * qui ne conseillait que « IT & Digital ») sont retirés de l'écran 1 : le mode
 * mémorisé est désormais celui DÉDUIT de « Où ? » au lancement confirmé, et il
 * se migre vers « Où ? » à l'ouverture suivante (`initialCadrage`). Ce lot
 * mémorise seulement ce que l'utilisateur a FINI par choisir (par la sélection
 * directe OU en cliquant ce conseil), pour que ce choix serve de point de
 * départ à la PROCHAINE analyse — même pattern déjà en place pour le marché
 * (`useSearchCountry.ts`, #494), ici sans le repli "marché du workspace" (le
 * périmètre n'a pas d'équivalent d'équipe, seulement le défaut `france` codé
 * dans `Search.tsx`).
 *
 * L'URL (brouillon repris, #3742) garde toujours la main : ce hook ne nomme
 * que le repli quand l'URL ne porte AUCUN périmètre.
 */
const STORAGE_PREFIX = 'bellum:search-scope:'

function readStored(userId: string | null): AnalysisScopeMode | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId)
    if (!raw) return null
    const parsed = analysisScopeModeSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function useDefaultScopeMode(): {
  /** `null` tant que rien n'a jamais été mémorisé pour cet utilisateur — l'appelant garde alors son propre repli (`france`). */
  defaultScope: AnalysisScopeMode | null
  rememberScope: (mode: AnalysisScopeMode) => void
} {
  const { user } = useSession()
  const userId = user?.id ?? null
  const defaultScope = readStored(userId)

  const rememberScope = useCallback(
    (mode: AnalysisScopeMode) => {
      if (!userId || typeof window === 'undefined') return
      try {
        window.localStorage.setItem(STORAGE_PREFIX + userId, mode)
      } catch {
        // Stockage plein ou désactivé : ne doit jamais casser le sélecteur.
      }
    },
    [userId],
  )

  return { defaultScope, rememberScope }
}
