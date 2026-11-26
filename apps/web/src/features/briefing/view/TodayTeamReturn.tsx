import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Sunrise } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProfile } from '@/features/profiles/hooks/useProfile'

/**
 * Refonte Théo (A · today-equipe, `.v18-team-return`) — l'entrée de l'espace collectif
 * depuis « Aujourd'hui », et son retour : la phrase qui rappelle que lire l'équipe ne
 * change pas le rôle connecté, puis « Journée de <prénom> » vers sa propre journée.
 *
 * La journée d'un COLLÈGUE n'a pas de lien ici : le brief ne se lit que pour qui est
 * connecté (`/briefing/daily`), et un bouton qui ouvrirait la sienne à la place mentirait.
 */
export function TodayTeamReturn() {
  const { t } = useTranslation('briefing')
  const { data: profile } = useProfile()
  const name = profile?.first_name?.trim()
  return (
    <Box className="flex flex-wrap items-center justify-between gap-3">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('today.teamReturn.note')}
      </Text>
      <Link
        to="/briefing"
        className="inline-flex min-h-11 items-center gap-2 rounded-control border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-3 text-sm font-medium text-[var(--accent-soft-text)]"
      >
        <Sunrise className="size-4" aria-hidden="true" />
        {name ? t('today.teamReturn.dayOf', { name }) : t('today.teamReturn.myDay')}
      </Link>
    </Box>
  )
}
