import { userRoleFramesTeam, type PlaybookStade, type WorkspaceRole } from '@bellum/contracts'
import { Box, FilterChips, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'

/**
 * #3414 (recette 30/09) — « LIRE COMME » : la salle de démonstration ne porte
 * qu'UN rôle, donc la lecture « recruteur » du brief (`briefing-role-order.ts`)
 * ne s'y voyait jamais. Ce sélecteur laisse un visiteur lire le MÊME brief dans
 * l'ordre de quatre rôles. L'ORDRE seul change, jamais le contenu (doctrine
 * CLAUDE.md) ; le serveur n'honore le paramètre qu'en salle de démo.
 *
 * Décision Louis 12/10 — « Lire comme » DANS LE PRODUIT : un compte dont le rôle
 * déclaré ENCADRE (dirigeant, direction commerciale, management — `userRoleFramesTeam`)
 * reçoit les mêmes puces qu'en démo ; il lit le brief de son équipe dans l'ordre d'un
 * autre rôle. Les autres gardent la ligne du rôle déclaré. Le choix est un état d'écran
 * (jamais persisté, le rôle déclaré en Réglages ne bouge pas) ; l'ordre seul change (c76).
 * Rangée de chips partagée (`FilterChips`, GA-249), comme `ResearchExpansionCallout.tsx`.
 */
export const READ_AS_ROLES = ['owner', 'admin', 'sales', 'recruiter'] as const satisfies readonly WorkspaceRole[]

export function ReadAsPicker({
  value,
  onChange,
  declaredRole = null,
  stade = null,
}: {
  value: WorkspaceRole | null
  onChange: (role: WorkspaceRole | null) => void
  /** Le rôle déclaré dans Réglages › Profil (« Ton rôle »), pour la ligne hors démo. */
  declaredRole?: string | null
  /** #3386 (Louis 11/10) — le stade de la combinaison rôle × stade qui ordonne la page ; `null` = aucune ligne. */
  stade?: PlaybookStade | null
}) {
  const { t } = useTranslation('briefing')
  const isDemo = useIsDemo()
  // #3386 — la combinaison active se NOMME (rôle × stade) : sans elle, rien ne dit
  // pourquoi deux ESN de tailles différentes n'ouvrent pas sur le même bloc.
  // Stade inconnu → aucune ligne, jamais un stade deviné (GA-18).
  const stadeLine = stade ? (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]" data-testid="read-as-stade">
      {t('readAs.stadeLabel')} : {t(`readAs.stade.${stade}`)}
    </Text>
  ) : null
  // #3386 (recette Z7 05/10, 0 élément « Lire comme ») — hors démo, un vrai compte ne se
  // déguise pas, mais le contrôle doit rester ATTEIGNABLE : la ligne dit quelle lecture
  // est active (le rôle déclaré, qui réordonne les blocs — c76) et mène au réglage.
  // décision Louis 12/10 — la démo garde le sélecteur pour tous les rôles ; le produit l'ouvre aux rôles qui encadrent.
  if (!isDemo && !userRoleFramesTeam(declaredRole)) {
    return (
      <Box className="flex flex-wrap items-center gap-2" data-testid="read-as-profile">
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('readAs.label')} : {declaredRole?.trim() ? declaredRole : t('readAs.standardOrder')}
        </Text>
        {stadeLine}
        <Link
          to="/settings/profile/identity"
          className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('readAs.change')}
        </Link>
      </Box>
    )
  }
  return (
    <Box className="flex flex-wrap items-center gap-2">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('readAs.label')}
      </Text>
      <FilterChips
        size="sm"
        ariaLabel={t('readAs.label')}
        options={READ_AS_ROLES.map(role => ({ value: role, label: t(`readAs.role.${role}`) }))}
        value={value}
        clearable
        onChange={next => onChange(next ?? null)}
      />
      {stadeLine}
    </Box>
  )
}
