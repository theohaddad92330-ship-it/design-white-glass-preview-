import { Switch, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { SettingsBlock, SettingsNote } from '@/features/settings/components/SettingsBlocks'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'
import { TEAM_KEY } from '@/features/team/hooks/useTeam'

/**
 * L'opt-in de la donnée communautaire (tome 2 §5.3, décision D51).
 *
 * Décoché par défaut, révocable à tout moment, et propriétaire uniquement — le
 * serveur le tient, cet écran ne fait que refléter la même règle. C'est le seul
 * autre réglage du produit, avec le cloisonnement de portefeuille, qui décide de
 * ce qui SORT de l'espace.
 *
 * Le texte dit les deux moitiés du marché, parce qu'une seule serait un piège :
 * ce qui remonte (des faits d'accessibilité, jamais un nom, jamais un TJM) et ce
 * qu'on reçoit en échange (ce que trois espaces confirment). Un espace qui ne
 * contribue pas ne consomme pas.
 */
export function CommunitySharingCard({ sharing, canManage }: { sharing: boolean; canManage: boolean }) {
  const { t } = useTranslation('team')
  const qc = useQueryClient()

  const toggle = useMutation<{ sharing: boolean }, Error, boolean>({
    mutationFn: next =>
      apiFetch<{ sharing: boolean }, { sharing: boolean }>({
        path: '/workspaces/community-sharing',
        method: 'PATCH',
        body: { sharing: next },
      }),
    onSuccess: result => {
      // La clé du cache d'équipe, IMPORTÉE et jamais recopiée : une clé
      // ré-écrite à la main (« ['workspace', 'team'] ») n'invalide rien, le
      // réglage reste affiché à sa valeur d'avant, et le clic suivant renvoie
      // la même valeur au serveur. Trouvé en recette live du tome 2.
      qc.invalidateQueries({ queryKey: TEAM_KEY })
      toast.success(result.sharing ? t('community.enabled') : t('community.disabled'))
    },
    onError: error => toast.error(t('community.failed'), { description: error.message }),
  })

  return (
    <SettingsBlock
      title={t('community.title')}
      description={t('community.help')}
      testId="community-sharing"
      action={
        /* #1849 — le titre du bloc nomme l'interrupteur, déjà traduit. */
        <Switch
          aria-label={t('community.title')}
          checked={sharing}
          disabled={!canManage || toggle.isPending}
          onCheckedChange={checked => toggle.mutate(checked)}
        />
      }
    >
      <SettingsNote>{t('community.never')}</SettingsNote>
      {!canManage && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('community.ownerOnly')}
        </Text>
      )}
    </SettingsBlock>
  )
}
