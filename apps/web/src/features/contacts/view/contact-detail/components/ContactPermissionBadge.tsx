import { hasPermission } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'

/**
 * #2150.60 — « la fiche Contact conserve les permissions. »
 *
 * `hasPermission(role, 'records:write')` est la source UNIQUE (GA-26) : les
 * trois écritures de `ContactsController` (`updateStatus`, `updateNote`,
 * `setHidden`) exigent déjà `records:write` côté serveur
 * (contacts.write-permissions.spec.ts, #2084.24). Ce badge ne recalcule
 * rien — il en tire l'affichage.
 *
 * Silencieux quand le rôle PEUT écrire : c'est le cas courant, et une
 * bannière « tu peux modifier » sur chaque fiche ne dirait rien (même
 * principe qu'`effectiveExtraPermissions`, packages/contracts/workspace.ts —
 * seule l'EXCEPTION se nomme). Silencieux aussi tant que le rôle n'est pas
 * résolu : deviner un refus qu'on n'a pas mesuré serait un faux « lecture
 * seule ».
 */
export function ContactPermissionBadge() {
  const { t } = useTranslation('contacts')
  const { team } = useTeam()
  const role = team?.workspace.role
  if (!role || hasPermission(role, 'records:write')) return null

  return (
    <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="contact-permission-readonly">
      {t('permission.readOnly')}
    </Text>
  )
}
