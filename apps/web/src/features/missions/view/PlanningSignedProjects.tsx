import { Box, Dialog, DialogContent, DialogDescription, DialogTitle, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { WonMissionDetail } from '@/features/projects/view/WonMissionDetail'
import { signedProjectsForPlanning } from '../signed-projects'

/**
 * #4291.8 / #4270.4 — les projets SIGNÉS se suivent ici. Rien tant qu'aucun projet n'est signé (on n'affiche pas ce
 * qu'on n'a pas).
 *
 * #4291.8 (Louis 02/11) — /projects y renvoie désormais : le clic d'une ligne ouvre ICI le suivi du projet
 * (`WonMissionDetail`, jadis atteint par `WonMissionTracking` sur /projects), jamais un aller-retour vers /projects.
 */
export function PlanningSignedProjects() {
  // #4291.8 — revient sur #4291.8 (Louis 02/11 : « liste aussi en régie ») : plus de filtre forfait / conseil,
  // même composant et même rendu dans tout espace.
  return <SignedProjectsList />
}

function SignedProjectsList() {
  const { t } = useTranslation('missions', { keyPrefix: 'planning.signedProjects' })
  const { t: tc } = useTranslation('common')
  const projects = useProjects(true)
  const signed = signedProjectsForPlanning(projects.data ?? [])
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? projects.data?.find(project => project.id === openId) : undefined
  if (signed.length === 0) return null
  return (
    <section
      aria-label={t('title', { count: signed.length })}
      className="space-y-2"
      data-testid="planning-signed-projects"
    >
      <Box>
        <Text element="h2" size="lg" weight="semibold">
          {t('title', { count: signed.length })}
        </Text>
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('subtitle')}
        </Text>
      </Box>
      <ul className="space-y-1">
        {signed.map(entry => (
          <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <button type="button" onClick={() => setOpenId(entry.id)} className="min-h-11 text-left font-medium">
              {entry.companyName ? `${entry.companyName} — ${entry.label}` : entry.label}
            </button>
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {entry.signedOn
                ? t('signedOn', { date: formatDate(entry.signedOn, { dateStyle: 'medium' }) })
                : t('signedOnUnknown')}
            </Text>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onOpenChange={next => (next ? null : setOpenId(null))}>
        <DialogContent closeLabel={tc('actions.close')} className="max-w-xl">
          <DialogTitle className="sr-only">{open?.label ?? ''}</DialogTitle>
          <DialogDescription className="sr-only">{t('detailDescription')}</DialogDescription>
          {open ? <WonMissionDetail project={open} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
