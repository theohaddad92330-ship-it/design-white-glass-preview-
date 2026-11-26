import { Switch, Text } from '@bellum/ui'
import { SettingsBlock, SettingsItem, SettingsNote } from '../components/SettingsBlocks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CHAT_EVAL_SAMPLING_KEY, chatEvalSamplingApi } from '@/features/settings/lib/chat-eval-sampling-api'

/**
 * #2899 / #2443.10 / #2278.9 — RÉGLAGES › LAURA — AMÉLIORER AVEC DES CONVERSATIONS ANONYMISÉES.
 *
 * Opt-in PAR ESPACE. Un réglage vit à un seul endroit (GA-26) : ici, pas une seconde fois dans
 * les préférences personnelles. Tout membre le LIT ; propriétaire ou administrateur seul le
 * change (l'API le re-vérifie). L'écran DIT ce qui est versé (la demande, anonymisée) et ce qui
 * ne l'est jamais (le corps d'un message), et que décocher efface ce qui a été versé.
 *
 * #4173 (retour bêta 14/10/2026) — ALLUMÉ par défaut (revirement assumé, 3 jours après la
 * décision du 11/10/2026) pour tout espace qui n'a pas déjà tranché ; migration `1796530329276`
 * pour les espaces déjà existants.
 */
export function ChatEvalSamplingSection() {
  const { t } = useTranslation('workspaceRules')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: CHAT_EVAL_SAMPLING_KEY,
    queryFn: () => chatEvalSamplingApi.get(),
    retry: false,
    staleTime: 0,
  })

  const update = useMutation({
    mutationFn: (enabled: boolean) => chatEvalSamplingApi.update({ enabled }),
    onSuccess: setting => {
      queryClient.setQueryData(CHAT_EVAL_SAMPLING_KEY, setting)
      toast.success(t('lauraEvalSampling.saved'))
    },
    onError: () => toast.error(t('lauraEvalSampling.saveFailed')),
  })

  // Une lecture en échec ou en cours n'affiche RIEN : ni « activé » ni « désactivé » inventé.
  const setting = query.data
  if (!setting || typeof setting.enabled !== 'boolean') return null

  return (
    <SettingsBlock
      title={t('lauraEvalSampling.label')}
      description={t('lauraEvalSampling.description')}
      testId="eval-sampling-block"
    >
      <SettingsItem
        title={t('lauraEvalSampling.rowTitle')}
        description={t('lauraEvalSampling.rowDescription')}
        control={
          setting.canEdit ? (
            <Switch
              aria-label={t('lauraEvalSampling.rowTitle')}
              checked={setting.enabled}
              disabled={update.isPending}
              onCheckedChange={checked => update.mutate(checked)}
            />
          ) : (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {setting.enabled ? t('lauraEvalSampling.on') : t('lauraEvalSampling.off')}
            </Text>
          )
        }
      />
      <SettingsNote className="mt-4">{t('lauraEvalSampling.never')}</SettingsNote>
    </SettingsBlock>
  )
}
