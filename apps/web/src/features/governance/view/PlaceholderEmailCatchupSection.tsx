import { Button, Text } from '@bellum/ui'
import { MailX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'
import { usePlaceholderEmailCatchup } from '../api'

/**
 * #4599.4 — « Adresses gabarit » sur `/contacts/imports`, à côté des doublons (l'écran de qualité de la base depuis
 * le 14/10). Mesuré en prod le 31/10 : 10 fiches « prenom.nom@… » restaient en base, faute de porte. Ici l'admin de
 * l'espace COMPTE d'abord (simulation, rien n'est écrit), puis vide explicitement, borné à 100 par geste.
 *
 * Seuls propriétaire et admin voient le geste ; le serveur le re-vérifie (`POST /contacts/placeholder-email-catchup`).
 * Aucun appel au montage : la simulation part d'un clic, jamais seule.
 */
export function PlaceholderEmailCatchupSection() {
  const { t } = useTranslation('governance')
  const { team } = useTeam()
  const role = team?.workspace?.role
  const catchup = usePlaceholderEmailCatchup()
  if (role !== 'owner' && role !== 'admin') return null

  const outcome = catchup.data
  return (
    <section
      aria-labelledby="placeholder-emails-title"
      className="flex flex-wrap items-center gap-3 rounded-card border border-[var(--bellum-border)] bg-card px-4 py-3"
    >
      <MailX className="size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <h2 id="placeholder-emails-title" className="text-sm font-semibold">
          {t('placeholderEmails.title')}
        </h2>
        <Text element="p" size="sm" color="text-muted-foreground">
          {t('placeholderEmails.hint')}
        </Text>
        {catchup.isError ? (
          <Text element="p" size="sm" role="alert">
            {t('placeholderEmails.error')}
          </Text>
        ) : outcome?.dry_run ? (
          <Text element="p" size="sm" weight="medium">
            {outcome.cleared === 0
              ? t('placeholderEmails.none')
              : t('placeholderEmails.simulated', { count: outcome.cleared }) +
                (outcome.skipped > 0 ? t('placeholderEmails.kept', { count: outcome.skipped }) : '')}
          </Text>
        ) : outcome ? (
          <Text element="p" size="sm" weight="medium" role="status">
            {t('placeholderEmails.done', { count: outcome.cleared })}
            {outcome.limit_reached ? ` ${t('placeholderEmails.remaining')}` : ''}
          </Text>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="soft"
          size="sm"
          className="min-h-11"
          isLoading={catchup.isPending && catchup.variables?.dryRun !== false}
          onClick={() => catchup.mutate({ dryRun: true })}
        >
          {t('placeholderEmails.simulate')}
        </Button>
        {/* L'exécution n'existe qu'APRÈS une simulation qui a compté au moins une fiche. */}
        {outcome?.dry_run && outcome.cleared > 0 ? (
          <Button
            type="button"
            variant="black"
            size="sm"
            className="min-h-11"
            isLoading={catchup.isPending}
            onClick={() => catchup.mutate({ dryRun: false })}
          >
            {outcome.cleared > outcome.limit
              ? t('placeholderEmails.executeBounded', { limit: outcome.limit, count: outcome.cleared })
              : t('placeholderEmails.execute', { count: outcome.cleared })}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
