import { Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { MessageCircle, Search, Telescope } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #4962.1 / #4962.3 — LES TROIS ENTRÉES DE L'ARRIVÉE.
 *
 * Un commercial qui arrive sur « Ta journée » ne sait pas par où commencer : les cartes d'accueil de Laura
 * (`laura-home-grid`) vivent sur /chat, pas ici. Trois entrées NOMMÉES, chacune vers une route qui existe déjà —
 * aucun menu, aucune route, aucune permission neuve (brief du lot G) :
 *   analyser un compte → /search · trouver des comptes → /discover · parler à Laura → /chat.
 * Elles ne dépendent d'AUCUNE donnée : rien à seeder en démo, rien d'absent à afficher « 0 ».
 * Garde #4529 : /discover s'ouvre SANS zone ni contexte posés d'office — l'arrivée reste neutre.
 */
const ENTRIES = [
  { key: 'analyze', to: '/search', Icon: Search },
  { key: 'discover', to: '/discover', Icon: Telescope },
  { key: 'laura', to: '/chat', Icon: MessageCircle },
] as const

export function ArrivalEntries() {
  const { t } = useTranslation('briefing')
  return (
    <Box as="nav" aria-label={t('arrival.title')} className="grid gap-2 sm:grid-cols-3" data-testid="arrival-entries">
      {ENTRIES.map(({ key, to, Icon }) => (
        <Link
          key={key}
          to={to}
          className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-3 transition-colors hover:bg-[var(--bg-surface-hover)]"
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <Box className="flex min-w-0 flex-col gap-0.5">
            <Text size="sm" weight="semibold">
              {t(`arrival.${key}.label`)}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t(`arrival.${key}.hint`)}
            </Text>
          </Box>
        </Link>
      ))}
    </Box>
  )
}
