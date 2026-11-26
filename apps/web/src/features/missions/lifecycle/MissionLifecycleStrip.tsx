import { Box, Text, cn } from '@bellum/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MISSION_LIFECYCLE_STAGES, missionLifecycleStage } from './missionLifecycle'
import type { MissionView } from '../api'

/**
 * Théo C missions-dossier.N1 — l'état du cycle de vie de la mission, en cinq étapes
 * (Accord › Démarrage › Mission › Passation › Clôture). Une LECTURE dérivée du statut et de la date
 * de fin : aucun chemin d'écriture, aucune seconde barre de statut. Ce n'est pas la chaîne du cash.
 *
 * Théo missions-dossier — la frise de la maquette : une étape franchie (ou en cours) porte une coche, une
 * étape à venir porte son RANG (« 4 », « 5 »). Le sens ne repose jamais sur la couleur seule : le rang, la
 * coche et `aria-current` le disent.
 */
export function MissionLifecycleStrip({ mission, now = new Date() }: { mission: MissionView; now?: Date }) {
  const { t } = useTranslation('missions')
  const current = missionLifecycleStage({ status: mission.status, endsOn: mission.ends_on }, now)
  const currentIndex = MISSION_LIFECYCLE_STAGES.indexOf(current)

  return (
    <nav aria-label={t('dossier.lifecycle.groupLabel')} className="overflow-x-auto">
      <ol className="flex w-full min-w-max items-start">
        {MISSION_LIFECYCLE_STAGES.map((stage, index) => {
          const isCurrent = stage === current
          const isDone = index < currentIndex
          const reached = isDone || isCurrent
          return (
            <li
              key={stage}
              data-stage={stage}
              data-state={isCurrent ? 'current' : isDone ? 'done' : 'todo'}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex min-w-20 flex-1 flex-col gap-2"
            >
              {/* Théo — un rond par étape relié au suivant par un filet, le libellé DESSOUS. */}
              <span className="flex items-center">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                    reached
                      ? 'border-transparent bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
                      : 'border-border text-[var(--bellum-text-muted)]',
                    isCurrent && 'ring-2 ring-[var(--bellum-text-accent)]',
                  )}
                >
                  {reached ? <Check className="size-3.5" /> : index + 1}
                </span>
                {index < MISSION_LIFECYCLE_STAGES.length - 1 ? (
                  <span
                    aria-hidden
                    className={cn('mx-2 h-px flex-1', isDone ? 'bg-[var(--accent-soft-text)]' : 'bg-border')}
                  />
                ) : null}
              </span>
              <Text
                element="span"
                size="xs"
                weight={isCurrent ? 'semibold' : 'normal'}
                color={isCurrent ? undefined : 'text-[var(--bellum-text-muted)]'}
              >
                {t(`dossier.lifecycle.stages.${stage}`)}
              </Text>
            </li>
          )
        })}
      </ol>
      <Box className="sr-only">
        {t(`dossier.lifecycle.current`, { stage: t(`dossier.lifecycle.stages.${current}`) })}
      </Box>
    </nav>
  )
}
