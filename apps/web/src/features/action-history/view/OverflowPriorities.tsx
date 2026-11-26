import { BRIEFING_ACTIONS_SHOWN } from '@bellum/contracts'
import type { AgendaConflict, BriefingAction } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConflictDialog } from '@/features/briefing/view/ConflictDialog'
import { conflictLookupById } from '@/features/briefing/conflict-lookup'
import { PriorityCard } from '@/features/briefing/view/PriorityCard'

/**
 * #2397.6 — LES PRIORITÉS HORS TOP, SUR L'ÉCRAN ACTIONS.
 *
 * `ActionsBlock` (page « Aujourd'hui ») réplie déjà le reste dans un dépli
 * inline (#1396) — ce qui manquait, mesuré le 22/09, c'est qu'elles
 * n'atterrissaient JAMAIS sur `/actions`, alors que le point le demande
 * littéralement. Ce composant ne RECALCULE rien : même source
 * (`useAllBriefingActions`, #2107), mêmes cartes (`PriorityCard`), même rang
 * RÉEL — la renumérotation à partir de 1 ferait croire à une deuxième liste.
 *
 * #2107 (Centre d'actions, recette écran du 25/09/2026) — la source a changé
 * de `useDailyBriefing` (`GET /briefing/today`, plafonné à
 * `BRIEFING_ACTIONS_MAX`) à `useAllBriefingActions` (`GET /briefing/actions`,
 * jamais plafonné) : un genre évincé du haut de la liste (priorité 12-17 —
 * mission sans date, profil sans retour, exigence AO non couverte, compte
 * sans owner…) devient enfin visible ICI, là où il ne l'était NULLE PART.
 *
 * ⚠️ « triées par priorité, groupées par genre » (#2107) : AUCUN regroupement
 * n'est calculé ici — `priority` est une constante PAR GENRE (`briefing-actions.ts` :
 * chaque `kind` porte exactement un entier, jamais partagé avec un autre
 * genre), donc trier par priorité clusterise déjà les cartes du même genre.
 * Un second regroupement recalculerait ce que le tri du serveur donne déjà.
 *
 * ⚠️ Ne pousse rien : pas de notification, pas de badge « nouveau » — un
 * appelant qui LIT la liste, rendu seulement si l'utilisateur ouvre
 * `/actions`. C'est la moitié du point que #2397.6 garde déjà (« jamais en
 * notification ») et que ce composant ne défait pas.
 *
 * #2938 — recette écran 27/09 : une carte conflit hors du top 3 (donc rendue
 * SEULEMENT ici) n'avait aucun geste — `PriorityCard` n'ouvre `ConflictDialog`
 * que si son appelant lui passe `onOpenConflict`, et celui-ci restait
 * `undefined`. `ActionsBlock` est le SEUL autre appelant de cette carte ; ce
 * composant reprend la même mécanique (`conflictLookupById`, `ConflictDialog`)
 * plutôt que d'inventer un second geste pour la même carte (GA-26).
 */
export function OverflowPriorities({
  actions,
  conflicts = [],
}: {
  actions: BriefingAction[]
  /** #2938 — les conflits d'agenda du jour, pour la carte qui veut les montrer. */
  conflicts?: AgendaConflict[]
}) {
  const { t } = useTranslation('actions')
  const [openConflict, setOpenConflict] = useState<AgendaConflict | null>(null)
  const conflictsById = useMemo(() => conflictLookupById(conflicts), [conflicts])
  const overflow = actions.slice(BRIEFING_ACTIONS_SHOWN)
  if (overflow.length === 0) return null

  return (
    <Box className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {t('overflowPriorities.title', { count: overflow.length })}
      </Text>
      <Box className="flex flex-col gap-2">
        {overflow.map((action, index) => (
          <PriorityCard
            key={action.id}
            action={action}
            rank={BRIEFING_ACTIONS_SHOWN + index + 1}
            onOpenConflict={
              conflictsById.has(action.id) ? () => setOpenConflict(conflictsById.get(action.id) ?? null) : undefined
            }
          />
        ))}
      </Box>
      {openConflict ? <ConflictDialog conflict={openConflict} onClose={() => setOpenConflict(null)} /> : null}
    </Box>
  )
}
