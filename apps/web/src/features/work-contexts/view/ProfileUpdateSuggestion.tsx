import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { Box, Button, Text } from '@bellum/ui'
import { useSaveEsnProfile } from '@/features/profile/hooks/useSaveEsnProfile'
import { useWorkContextProfileSuggestion } from '../hooks'

/**
 * #2455.6 — « Mise à jour du profil principal jamais automatique, diff
 * affiché ». `GET /work-contexts/:id/profile-suggestion` (API) ne calcule
 * qu'un diff PUR (`suggestProfileUpdateFromUsage`, aucune écriture) —
 * `WorkContextsService` ne touche jamais `profiles`/`esn_profiles` (#2455.8).
 * Cet écran est le SEUL endroit qui peut écrire `target_sectors` sur le
 * profil principal, et seulement sur le clic explicite « Appliquer » :
 * ni le montage, ni un re-rendu, ni la simple présence de la suggestion
 * n'écrivent quoi que ce soit tant que le geste n'a pas eu lieu.
 */
export function ProfileUpdateSuggestion({ contextId }: { contextId: string }) {
  const { t } = useTranslation('workContexts')
  const { data } = useWorkContextProfileSuggestion(contextId, true)
  const save = useSaveEsnProfile()
  const [dismissed, setDismissed] = useState(false)
  const [applied, setApplied] = useState(false)

  const suggestion = data?.suggestion ?? null
  if (!suggestion || dismissed || applied) return null

  async function onApply() {
    if (!suggestion) return
    try {
      await save.mutateAsync({ target_sectors: suggestion.suggested })
      setApplied(true)
      toast.success(t('profileSuggestion.applied'))
    } catch {
      toast.error(t('profileSuggestion.failed'))
    }
  }

  return (
    <Box className="mt-2 space-y-1.5 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 py-2">
      <Text size="xs" weight="medium">
        {t('profileSuggestion.title')}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-1.5">
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {suggestion.current.length > 0 ? suggestion.current.join(', ') : t('profileSuggestion.none')}
        </Text>
        <ArrowRight className="h-3 w-3 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
        <Text size="xs">{suggestion.suggested.join(', ')}</Text>
      </Box>
      <Box display="flex" className="gap-2">
        <Button size="sm" variant="outline" onClick={() => void onApply()} disabled={save.isPending}>
          {t('profileSuggestion.apply')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          {t('profileSuggestion.dismiss')}
        </Button>
      </Box>
    </Box>
  )
}
