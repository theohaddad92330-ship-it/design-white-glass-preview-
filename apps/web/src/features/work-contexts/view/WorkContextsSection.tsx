import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { Archive, Layers, Play } from 'lucide-react'
import { Badge, Box, Button, Text } from '@bellum/ui'
import type { WorkContext } from '@bellum/contracts'
import { useActiveWorkContextStore } from '../activeWorkContextStore'
import { useActivateWorkContext, useArchiveWorkContext, useWorkContexts } from '../hooks'
import { CreateWorkContextDialog } from './CreateWorkContextDialog'
import { ProfileUpdateSuggestion } from './ProfileUpdateSuggestion'
import { SaveWorkContextButton } from './SaveWorkContextButton'

/**
 * #2455 — « Mon activité » : créer des VARIANTES de profil (marché, offre,
 * secteurs…) sans jamais modifier le profil principal (#2455.1). Cette
 * section porte deux des trois parcours d'entrée demandés :
 *  - « Depuis Mon activité » : le formulaire principal de cette section ;
 *  - « Depuis Mission ponctuelle » : le bouton dédié ci-dessous, à `status:
 *    temporaire` — le troisième parcours (missions) est un chantier séparé
 *    en vol cette vague (voir brief), donc ce bouton reste ICI plutôt que
 *    d'aller toucher `features/missions/*`.
 * Le troisième parcours (« Depuis un résultat ») vit sur l'écran vivier
 * (`SaveWorkContextButton` mounted dans `mes-cibles`).
 */
export function WorkContextsSection() {
  const { t } = useTranslation('workContexts')
  const { data, isLoading } = useWorkContexts()
  const [createOpen, setCreateOpen] = useState(false)
  const activate = useActivateWorkContext()
  const archive = useArchiveWorkContext()
  const activeStore = useActiveWorkContextStore()
  const navigate = useNavigate()

  const items = data?.items ?? []

  async function onActivate(context: WorkContext) {
    try {
      const result = await activate.mutateAsync(context.context_id)
      activeStore.activate({ id: result.work_context.context_id, name: result.work_context.name })
      toast.success(t('activate.success', { name: result.work_context.name }))
      // #2455.5 — nouvelle conversation, le fil d'origine reste intact.
      void navigate({ to: '/chat', search: { new: '1' } })
    } catch {
      toast.error(t('activate.failed'))
    }
  }

  async function onArchive(context: WorkContext) {
    try {
      await archive.mutateAsync(context.context_id)
      toast.success(t('archive.success'))
    } catch {
      toast.error(t('archive.failed'))
    }
  }

  return (
    <SettingsBlock
      label={t('section.title')}
      description={t('section.subtitle')}
      actions={
        <>
          <SaveWorkContextButton
            label={t('entryPoints.oneOffMission')}
            defaultStatus="temporaire"
            activateAfterCreate
          />
          <Button size="sm" icon={Layers} onClick={() => setCreateOpen(true)}>
            {t('entryPoints.fromActivity')}
          </Button>
        </>
      }
    >
      <Box className="space-y-2 px-5 py-4 sm:px-6">
        {isLoading ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('section.loading')}
          </Text>
        ) : items.length === 0 ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('section.empty')}
          </Text>
        ) : (
          <Box className="space-y-2">
            {items.map(context => (
              <Box key={context.context_id} className="rounded-control border border-[var(--bellum-border)] px-3 py-2">
                <Box display="flex" className="items-center justify-between gap-3">
                  <Box className="min-w-0">
                    <Box display="flex" className="items-center gap-2">
                      <Text size="sm" weight="medium" className="truncate">
                        {context.name}
                      </Text>
                      <Badge variant="secondary">{t(`status.${context.status}`)}</Badge>
                      <Badge variant="outline">{t(`visibility.${context.visibility}`)}</Badge>
                    </Box>
                    {context.sectors.length > 0 && (
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {context.sectors.join(', ')}
                      </Text>
                    )}
                  </Box>
                  <Box display="flex" className="shrink-0 gap-1">
                    <Button variant="ghost" size="sm" icon={Play} onClick={() => void onActivate(context)}>
                      {t('activate.action')}
                    </Button>
                    {context.status !== 'archive' && (
                      <Button variant="ghost" size="sm" icon={Archive} onClick={() => void onArchive(context)}>
                        {t('archive.action')}
                      </Button>
                    )}
                  </Box>
                </Box>
                {context.visibility === 'personal' && <ProfileUpdateSuggestion contextId={context.context_id} />}
              </Box>
            ))}
          </Box>
        )}
      </Box>
      <CreateWorkContextDialog open={createOpen} onOpenChange={setCreateOpen} />
    </SettingsBlock>
  )
}
