import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { formatDate } from '@/lib/locale'
import { assigneesOf, type MissionView } from '../api'
import { availabilityFrom } from '../planning'
import { MissionLifecycleStrip } from '../lifecycle/MissionLifecycleStrip'
import { useUpdateMission } from './mission-panel.api'

/**
 * Théo missions-planning — LE COUP D'ŒIL sur une mission, depuis une barre, une
 * ligne ou un jalon : la personne, les dates, le cycle de vie, et quatre gestes.
 *
 * Il ne remplace rien : « Plus de détails » ouvre le panneau complet
 * (`MissionDetailPanel`) qui porte tous les gestes de la mission, et « Ouvrir le
 * dossier complet » mène au dossier.
 *
 * ⚠️ La disponibilité s'écrit avec sa certitude : une fin prévue n'est PAS une
 * disponibilité confirmée (« Fin prévue ≠ disponibilité confirmée »).
 */
export function PlanningPeekDialog({
  mission,
  today,
  onClose,
  onMore,
}: {
  mission: MissionView
  today: string
  onClose: () => void
  onMore: () => void
}) {
  const { t } = useTranslation('missions')
  const [moving, setMoving] = useState(false)
  const people = assigneesOf(mission)
  const first = people[0]
  const availability = availabilityFrom(mission.ends_on, today, mission.renewal_status)
  const date = (iso: string | null | undefined) =>
    iso ? (formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) ?? iso) : null

  return (
    <>
      <Dialog open={!moving} onOpenChange={open => !open && onClose()}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mission.label || t('planning.unnamedMission')}</DialogTitle>
            <DialogDescription>{mission.accountName ?? t('unknownAccount')}</DialogDescription>
          </DialogHeader>

          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            {first ? (
              <Box className="flex items-center gap-3">
                <ContactAvatar name={first.fullName} photoUrl={first.photoUrl} size="md" />
                <Box className="min-w-0">
                  {first.id ? (
                    <Link to="/consultants/$id" params={{ id: first.id }} className="font-medium hover:underline">
                      {people.map(person => person.fullName).join(' · ')}
                    </Link>
                  ) : (
                    <Text element="span" weight="medium">
                      {people.map(person => person.fullName).join(' · ')}
                    </Text>
                  )}
                  {mission.role_title ? (
                    <Text size="sm" color="text-[var(--bellum-text-muted)]">
                      {mission.role_title}
                    </Text>
                  ) : null}
                </Box>
              </Box>
            ) : (
              <Text size="sm" color="text-[var(--bellum-text-muted)]">
                {t('table.unstaffed')}
              </Text>
            )}

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Box>
                <dt className="text-xs text-[var(--bellum-text-muted)]">{t('planning.screen.peek.start')}</dt>
                <dd className="font-medium">{date(mission.started_on) ?? t('planning.bar.shortOpenStart')}</dd>
              </Box>
              <Box>
                <dt className="text-xs text-[var(--bellum-text-muted)]">{t('planning.screen.peek.end')}</dt>
                <dd className="font-medium">{date(mission.ends_on) ?? t('planning.availability.unknown')}</dd>
              </Box>
            </dl>

            <MissionLifecycleStrip mission={mission} />
          </section>

          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {availability.kind === 'from'
              ? t(
                  availability.certainty === 'incertaine'
                    ? 'planning.screen.peek.afterFromUncertain'
                    : 'planning.screen.peek.afterFrom',
                  { date: date(availability.on) },
                )
              : availability.kind === 'now'
                ? t('planning.screen.peek.afterNow')
                : t('planning.screen.peek.afterUnknown')}
          </Text>

          <Box className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="secondary" className="pointer-coarse:min-h-11">
              <Link to="/missions/$id" params={{ id: mission.id }}>
                {t('planning.screen.peek.prepareClientReview')}
              </Link>
            </Button>
            <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setMoving(true)}>
              {t('planning.screen.peek.editDates')}
            </Button>
            <Button asChild variant="outline" className="pointer-coarse:min-h-11">
              <Link to="/missions/cra">{t('planning.screen.peek.seeTimesheets')}</Link>
            </Button>
            {first?.id ? (
              <Button asChild variant="outline" className="pointer-coarse:min-h-11">
                <Link to="/consultants/$id/reverse-market" params={{ id: first.id }}>
                  {t('planning.rowMenu.reverseMarket', { name: first.fullName })}
                </Link>
              </Button>
            ) : null}
          </Box>

          <DialogFooter>
            <Button type="button" variant="ghost" className="pointer-coarse:min-h-11" onClick={onMore}>
              {t('planning.screen.peek.more')}
            </Button>
            <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
              {t('planning.screen.peek.back')}
            </Button>
            <Button asChild className="pointer-coarse:min-h-11">
              <Link to="/missions/$id" params={{ id: mission.id }}>
                {t('planning.screen.peek.openDossier')}
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {moving ? <MoveDialog mission={mission} onDone={() => setMoving(false)} /> : null}
    </>
  )
}

/**
 * missions-planning.N5 — « DÉPLACER LA MISSION » : un déplacement se valide.
 * Rien n'est écrit avant « Valider le déplacement » ; l'affectation, les
 * relevés et le bon de commande sont relus côté serveur (même écrivain que le
 * glissement d'une barre et le champ de date du panneau).
 */
function MoveDialog({ mission, onDone }: { mission: MissionView; onDone: () => void }) {
  const { t } = useTranslation('missions')
  const update = useUpdateMission(mission.id)
  const [startedOn, setStartedOn] = useState(mission.started_on ?? '')
  const [endsOn, setEndsOn] = useState(mission.ends_on ?? '')
  const endBeforeStart = Boolean(startedOn && endsOn && endsOn < startedOn)
  const unchanged = startedOn === (mission.started_on ?? '') && endsOn === (mission.ends_on ?? '')
  const ready = Boolean(startedOn) && !endBeforeStart && !unchanged

  return (
    <Dialog open onOpenChange={open => !open && onDone()}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('planning.screen.move.title')}</DialogTitle>
          <DialogDescription>{t('planning.screen.move.intro')}</DialogDescription>
        </DialogHeader>
        <Box className="grid gap-4 sm:grid-cols-2">
          <Box className="space-y-1">
            <label htmlFor="planning-move-start" className="text-sm font-medium">
              {t('planning.screen.move.start')}
            </label>
            <Input
              id="planning-move-start"
              type="date"
              value={startedOn}
              onChange={event => setStartedOn(event.target.value)}
            />
          </Box>
          <Box className="space-y-1">
            <label htmlFor="planning-move-end" className="text-sm font-medium">
              {t('planning.screen.move.end')}
            </label>
            <Input
              id="planning-move-end"
              type="date"
              value={endsOn}
              onChange={event => setEndsOn(event.target.value)}
            />
          </Box>
        </Box>
        {endBeforeStart ? (
          <Text role="alert" size="sm" color="text-[var(--danger-soft-text)]">
            {t('planning.screen.move.endBeforeStart')}
          </Text>
        ) : null}
        <Text size="sm" color="text-[var(--bellum-text-muted)]">
          {t('planning.screen.move.availabilityNote')}
        </Text>
        <DialogFooter>
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={onDone}>
            {t('planning.screen.move.cancel')}
          </Button>
          <Button
            type="button"
            className="pointer-coarse:min-h-11"
            disabled={!ready || update.isPending}
            onClick={() => update.mutate({ startedOn, ...(endsOn ? { endsOn } : {}) }, { onSuccess: onDone })}
          >
            {t('planning.screen.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
