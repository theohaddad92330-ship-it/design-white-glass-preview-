import { Box, Text, cn } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { toast } from 'sonner'
import { PORTFOLIO_VISIBILITIES, type PortfolioVisibility } from '@bellum/contracts'
import { teamApi } from '@/features/team/api'
import { TEAM_KEY } from '@/features/team/hooks/useTeam'

/**
 * « Qui voit quels comptes » — le cloisonnement de portefeuille (décision D5).
 *
 * L'endpoint, le calcul de portée (`portfolioScopeFor`) et la colonne existent
 * depuis des mois ; ce qui manquait était l'endroit où le régler. Un réglage
 * qu'aucun écran n'atteint n'est pas un réglage : il oblige une ESN qui veut
 * cloisonner à créer un espace par commercial, c'est-à-dire à perdre l'équipe,
 * les quotas partagés et le cockpit du responsable pour une question de
 * visibilité.
 *
 * Deux points de conception, et ils tiennent l'un à l'autre :
 *
 * 1. **Un groupe de boutons radio, pas un interrupteur.** Un interrupteur est
 *    coché ou décoché — il ne sait pas dire « je ne connais pas encore la
 *    valeur ». Un `radiogroup` sans option cochée le dit, et c'est exactement
 *    l'état d'aujourd'hui : `GET /workspaces/me` ne renvoie pas ce champ (voir
 *    {@link readPortfolioVisibility}). Le jour où il le renverra, la carte
 *    s'allume sans une ligne de plus.
 * 2. **Rien n'est présenté comme actif par défaut.** Le défaut du serveur est
 *    'open' ; l'afficher comme le réglage EN COURS sans l'avoir lu mentirait à
 *    une ESN qui a cloisonné.
 *
 * Le geste reste possible pour le propriétaire même sans lecture : choisir une
 * option l'APPLIQUE, et la réponse du serveur est ce qui fait basculer la
 * carte — jamais un souvenir local.
 */
export function PortfolioVisibilityCard({
  visibility,
  canManage,
}: {
  /** Le réglage en cours tel que le serveur l'a envoyé, `null` s'il ne l'a pas envoyé. */
  visibility: PortfolioVisibility | null
  /** Propriétaire de l'espace — le seul rôle que le serveur laisse écrire. */
  canManage: boolean
}) {
  const { t } = useTranslation('team')
  const qc = useQueryClient()

  const apply = useMutation<{ visibility: PortfolioVisibility }, Error, PortfolioVisibility>({
    mutationFn: next => teamApi.setPortfolioVisibility(next),
    onSuccess: result => {
      // La clé du cache d'équipe, IMPORTÉE et jamais recopiée — une clé
      // ré-écrite à la main n'invalide rien, et l'écran garderait l'ancienne
      // valeur (le défaut trouvé en recette sur la carte voisine).
      qc.invalidateQueries({ queryKey: TEAM_KEY })
      toast.success(t(`portfolio.applied.${result.visibility}`))
    },
    onError: error => toast.error(t('portfolio.failed'), { description: error.message }),
  })

  return (
    <SettingsBlock title={t('portfolio.title')} description={t('portfolio.help')} testId="portfolio-visibility">
      {/* `div` et non `Box` : la primitive ne transporte pas `aria-label`, et un
          groupe radio sans nom accessible n'est annoncé que par ses options. */}
      <div role="radiogroup" aria-label={t('portfolio.title')} className="flex flex-col gap-2 sm:flex-row">
        {PORTFOLIO_VISIBILITIES.map(option => {
          const active = visibility === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!canManage || apply.isPending}
              onClick={() => apply.mutate(option)}
              className={cn(
                // `min-h-11` = 44 px : la cible tactile minimale (GA-30).
                'flex min-h-11 flex-1 flex-col gap-1 rounded-lg border p-3 text-left',
                'transition-colors duration-150 ease-out',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-text-accent)]',
                'disabled:cursor-not-allowed disabled:opacity-60',
                active
                  ? 'border-[var(--bellum-text-accent)] bg-[var(--bellum-surface-2)]'
                  : 'border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)]',
              )}
            >
              <Text element="span" size="sm" weight="medium">
                {t(`portfolio.options.${option}.label`)}
              </Text>
              <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                {t(`portfolio.options.${option}.help`)}
              </Text>
            </button>
          )
        })}
      </div>

      {visibility === null && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('portfolio.unreadable')}
        </Text>
      )}

      {!canManage && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('portfolio.ownerOnly')}
        </Text>
      )}
    </SettingsBlock>
  )
}
