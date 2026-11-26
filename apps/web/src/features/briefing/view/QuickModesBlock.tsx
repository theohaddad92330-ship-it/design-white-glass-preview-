import type { BriefingAction, DailyBriefing } from '@bellum/contracts'
import { hasPermission } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { CalendarClock, RefreshCw, Route, ShieldCheck, Target, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useTalentStats } from '@/features/consultants/hooks'
import {
  computeQuickModes,
  deriveQuickModeSignalsFromBriefing,
  guidedSessionItemVolume,
  QUICK_MODE_DURATION_MINUTES,
  type QuickMode,
  type QuickModeKey,
} from '../quick-modes'

/**
 * #2918 / #2100.1-.13 — LE SÉLECTEUR DE MODES DE TRAVAIL RAPIDES.
 *
 * Voir le docblock de `../quick-modes.ts` pour ce que ce lot livre et ce
 * qu'il ne livre pas (la session guidée derrière chaque mode reste à écrire).
 * Ce composant ne fait qu'afficher le résultat, déjà filtré, de
 * `computeQuickModes` — aucune règle de contexte n'est dupliquée ici.
 */
export function QuickModesBlock({
  data,
  allActions,
}: {
  data: DailyBriefing
  // Seul `kind` compte pour ce calcul (GA-26 — jamais un second contrat pour
  // le même objet) : `Pick` garde le composant testable sans reconstruire une
  // `BriefingAction` complète (confidence/expiresAt/context/verdict…) pour
  // chaque cas de test.
  allActions: Pick<BriefingAction, 'kind'>[] | undefined
}) {
  const { t } = useTranslation('briefing')
  const team = useTeam()
  const talentStats = useTalentStats()

  const isManager = team.team ? hasPermission(team.team.workspace.role, 'team:manage') : false
  const signals = deriveQuickModeSignalsFromBriefing({
    actions: allActions ?? [],
    agendaServed: data.agenda.state === 'ready' || data.agenda.state === 'partial',
    agendaEventCount: data.agenda.events.length,
    mailState: data.mail.state,
    mailAwaitingReplyCount: data.mail.awaitingReply.length,
    // `undefined` (requête pas encore résolue) se lit comme `null` — pas
    // encore mesuré, donc le mode positionnement reste caché (#2100.10).
    vivierCount: talentStats.data?.total ?? null,
    isManager,
  })
  const modes = computeQuickModes(signals)

  return (
    <Box className="flex min-w-0 flex-col gap-3">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('quickModes.subtitle')}
      </Text>
      <Box className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map(mode => (
          <ModeCard key={mode.key} mode={mode} />
        ))}
      </Box>
    </Box>
  )
}

const MODE_ICON: Record<QuickModeKey, React.ReactNode> = {
  prospect: <Target className="size-4" aria-hidden />,
  prepare_meetings: <CalendarClock className="size-4" aria-hidden />,
  handle_followups: <Route className="size-4" aria-hidden />,
  position_consultant: <Users className="size-4" aria-hidden />,
  secure_missions: <ShieldCheck className="size-4" aria-hidden />,
  refresh_pipe: <RefreshCw className="size-4" aria-hidden />,
}

/**
 * #2100.38 — « les objets restent dans leurs pages propriétaires » : chaque
 * mode OUVRE la page qui possède déjà ces objets, jamais une copie. La
 * préparation de rendez-vous n'a pas de page à part — elle vit sur CET écran
 * (bandeau « maintenant », plateau d'agenda) — donc `null` : la carte reste un
 * CONSTAT, pas un lien mort vers nulle part.
 */
const MODE_HREF: Record<QuickModeKey, string | null> = {
  prospect: '/discover',
  prepare_meetings: null,
  handle_followups: '/actions',
  position_consultant: '/consultants',
  secure_missions: '/missions',
  refresh_pipe: '/projects',
}

function ModeCard({ mode }: { mode: QuickMode }) {
  const { t } = useTranslation('briefing')
  const href = MODE_HREF[mode.key]
  const description =
    mode.followUpsVariant === 'crm_only'
      ? t('quickModes.modes.handle_followups.descriptionCrmOnly')
      : t(`quickModes.modes.${mode.key}.description`)
  // #2100.15 / #2100.37 (session guidée, épopée #2918) — durée fixe du mode
  // et volume d'éléments qu'elle propose, DÉRIVÉ de cette durée.
  const volume = guidedSessionItemVolume(mode.key)

  const body = (
    <>
      <Box className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
        {MODE_ICON[mode.key]}
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t(`quickModes.modes.${mode.key}.title`)}
        </Text>
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t(`quickModes.modes.${mode.key}.sessionSummary`, {
          count: volume,
          duration: QUICK_MODE_DURATION_MINUTES[mode.key],
        })}
      </Text>
      {mode.managerNote ? (
        <Badge variant="outline" className="w-fit">
          {t('quickModes.managerNote')}
        </Badge>
      ) : null}
    </>
  )

  const className = 'flex min-w-0 flex-col gap-1.5 rounded-lg border border-[var(--bellum-border)] p-3'
  if (!href) return <Box className={className}>{body}</Box>
  return (
    <Link to={href} className={`${className} hover:bg-[var(--bellum-surface-2)]`}>
      {body}
    </Link>
  )
}
