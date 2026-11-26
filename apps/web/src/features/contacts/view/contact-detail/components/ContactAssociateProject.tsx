import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PROJECT_CONTACT_ROLES, type ProjectContactRole } from '@bellum/contracts'
import { Box, Button, SelectField, Text } from '@bellum/ui'
import { UserPlus } from 'lucide-react'
import { useContactProjectLink } from '@/features/contacts/hooks/useContactProjectLink'
import { useProjects } from '@/features/projects/hooks/useProjects'

/**
 * #3712.5 — « Associer à un projet » depuis la fiche.
 *
 * Les projets proposés sont CEUX DU COMPTE de la personne (le serveur refuse
 * un autre compte) et jamais ceux déjà associés : proposer l'existant ferait
 * écrire un rôle par-dessus un rôle déjà choisi, en silence. Aucun projet à
 * proposer ⇒ aucun bouton (une absence ne fait aucune ligne).
 */
export function ContactAssociateProject({
  contactId,
  accountId,
  linkedProjectIds,
}: {
  contactId: string
  accountId: string
  linkedProjectIds: readonly string[]
}) {
  const { t } = useTranslation('contacts')
  const { t: tProjects } = useTranslation('projects')
  const { data: projects } = useProjects()
  const { link } = useContactProjectLink(contactId)
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [role, setRole] = useState<ProjectContactRole>(PROJECT_CONTACT_ROLES[0])

  const available = useMemo(() => {
    const linked = new Set(linkedProjectIds)
    return (projects ?? []).filter(project => project.account_id === accountId && !linked.has(project.id))
  }, [projects, accountId, linkedProjectIds])

  if (available.length === 0) return null

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-1.5 pointer-coarse:min-h-11"
        onClick={() => setOpen(true)}
      >
        <UserPlus className="size-4" aria-hidden />
        {t('associations.associate.open')}
      </Button>
    )
  }

  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <SelectField
        ariaLabel={t('associations.associate.projectPlaceholder')}
        value={projectId}
        onChange={setProjectId}
        placeholder={t('associations.associate.projectPlaceholder')}
        // #3712.4 — les titres de dossier passent à la ligne dans le menu au lieu d'être tronqués.
        options={available.map(project => ({ value: project.id, label: project.label, wrap: true }))}
        size="sm"
        className="w-full min-w-40"
      />
      <SelectField
        ariaLabel={t('associations.associate.rolePlaceholder')}
        value={role}
        onChange={next => setRole(next as ProjectContactRole)}
        placeholder={t('associations.associate.rolePlaceholder')}
        options={PROJECT_CONTACT_ROLES.map(key => ({ value: key, label: tProjects(`detailContacts.roles.${key}`) }))}
        size="sm"
        className="w-full min-w-32"
      />
      <Button
        type="button"
        size="sm"
        variant="black"
        disabled={!projectId || link.isPending}
        isLoading={link.isPending}
        onClick={() =>
          link.mutate(
            { projectId, role },
            {
              onSuccess: () => {
                setProjectId('')
                setOpen(false)
                toast.success(t('associations.associate.done'))
              },
              onError: () => toast.error(t('associations.associate.failed')),
            },
          )
        }
      >
        {t('associations.associate.submit')}
      </Button>
      <Text size="xs" color="text-muted-foreground">
        {t('associations.associate.reversible')}
      </Text>
    </Box>
  )
}
