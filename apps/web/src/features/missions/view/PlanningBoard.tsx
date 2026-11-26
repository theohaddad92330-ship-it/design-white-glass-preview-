import {
  MISSION_BOARD_COLUMNS,
  effectsForBoardMove,
  offerableProposals,
  defaultCheckedKeys,
  missionStatusForColumn,
  missionStatusMove,
  type MissionBoardCard,
  type MissionBoardColumn,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SearchEmptyState,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useMissionBoard, useMoveBoardCard } from '../api'

/**
 * Théo missions-planning.A1 — LE BOARD, TROISIÈME VUE du planning (Planning · Tableau · Board).
 *
 * Une PROJECTION au-dessus des Projets et des Missions : la vue ne possède
 * aucun état. Déplacer une carte écrit sur son objet d'origine — l'étape du
 * projet, le statut de la mission — jamais sur une troisième série d'états.
 *
 * Les douze colonnes ne tiennent pas côte à côte : seules les colonnes
 * OCCUPÉES se dessinent, les vides sont NOMMÉES en dessous (rien n'est retiré).
 * Deux règles d'affichage tiennent le reste :
 *  - une colonne sans rien de mesurable n'annonce aucun montant, jamais « 0 € » ;
 *  - les cartes sans date de fin sont COMPTÉES à côté du montant.
 */
export function PlanningBoard() {
  const { t } = useTranslation('missions')
  const { data, isLoading, isError } = useMissionBoard()
  const [pending, setPending] = useState<{ card: MissionBoardCard; to: MissionBoardColumn } | null>(null)
  const move = useMoveBoardCard()

  const byColumn = useMemo(() => {
    const map = new Map<MissionBoardColumn, MissionBoardCard[]>()
    for (const column of MISSION_BOARD_COLUMNS) map.set(column, [])
    for (const card of data?.cards ?? []) map.get(card.column)?.push(card)
    return map
  }, [data?.cards])

  if (isLoading) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-muted)]">
        {t('common:states.loading')}
      </Text>
    )
  }
  // Un échec de lecture ne se rend jamais comme « aucune mission ».
  if (isError || !data) {
    return <SearchEmptyState title={t('board.errorTitle')} description={t('board.errorDescription')} />
  }
  if (data.cards.length === 0) {
    return <SearchEmptyState title={t('board.emptyTitle')} description={t('board.emptyDescription')} />
  }

  const occupied = MISSION_BOARD_COLUMNS.filter(column => (byColumn.get(column) ?? []).length > 0)
  const emptied = MISSION_BOARD_COLUMNS.filter(column => !occupied.includes(column))

  return (
    <Box className="space-y-3" data-slot="planning-board">
      {data.intakeCount > 0 ? (
        // Les signaux détectés sont ÉCARTÉS du board mais comptés.
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('board.intake', { count: data.intakeCount })}
        </Text>
      ) : null}

      <Box className="flex gap-3 overflow-x-auto pb-2">
        {occupied.map(column => {
          const summary = data.columns.find(entry => entry.column === column)
          const cards = byColumn.get(column) ?? []
          return (
            <section
              key={column}
              aria-label={t(`board.columns.${column}`)}
              className="min-w-[15rem] shrink-0 rounded-lg border border-border bg-card/50 p-3"
            >
              <Box display="flex" className="items-baseline justify-between gap-2">
                <Text element="h3" size="sm" weight="semibold">
                  {t(`board.columns.${column}`)}
                </Text>
                {summary ? <Badge variant="default">{summary.count}</Badge> : null}
              </Box>
              {summary?.remainingRevenueCents != null || (summary && summary.withoutEndDateCount > 0) ? (
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {[
                    summary?.remainingRevenueCents != null
                      ? t('board.remaining', { value: Math.round(summary.remainingRevenueCents / 100) })
                      : null,
                    summary && summary.withoutEndDateCount > 0
                      ? t('board.withoutEndDate', { count: summary.withoutEndDateCount })
                      : null,
                  ]
                    .filter(part => part !== null)
                    .join(' · ')}
                </Text>
              ) : null}

              <Box className="mt-2 space-y-2">
                {cards.map(card => (
                  <BoardCard key={card.id} card={card} onMove={to => setPending({ card, to })} />
                ))}
              </Box>
            </section>
          )
        })}
      </Box>

      {emptied.length > 0 ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('planning.screen.board.emptyColumns', {
            list: emptied.map(column => t(`board.columns.${column}`)).join(' · '),
          })}
        </Text>
      ) : null}

      {pending ? (
        <BoardMovePanel
          card={pending.card}
          to={pending.to}
          onCancel={() => setPending(null)}
          onConfirm={({ reason, accepted }) => {
            move.mutate({
              missionId: pending.card.id,
              to: pending.to,
              reason: reason ?? undefined,
              acceptedActions: [...accepted],
            })
            setPending(null)
          }}
        />
      ) : null}
    </Box>
  )
}

function BoardCard({ card, onMove }: { card: MissionBoardCard; onMove: (to: MissionBoardColumn) => void }) {
  const { t } = useTranslation('missions')
  return (
    <Box className="rounded-md border border-border bg-card p-2">
      <Text element="p" size="sm" weight="medium" className="truncate">
        {card.source === 'mission' ? (
          <Link to="/missions/$id" params={{ id: card.id }} className="hover:underline">
            {card.label}
          </Link>
        ) : (
          card.label
        )}
      </Text>
      {card.accountName ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="truncate">
          {card.accountName}
        </Text>
      ) : null}
      <Box display="flex" className="mt-1 flex-wrap items-center gap-1">
        {/* « À staffer » plutôt qu'un blanc, qui se lirait comme un défaut
            d'affichage. */}
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {card.consultantName ?? t('board.toStaff')}
        </Text>
        {card.endsOn ? (
          <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
            · {formatDate(card.endsOn, { day: 'numeric', month: 'short', timeZone: 'UTC' }) ?? card.endsOn}
          </Text>
        ) : null}
        {card.alert ? <Badge variant="warning">{t(`board.alerts.${card.alert}`)}</Badge> : null}
      </Box>
      {card.daysInColumn !== null ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('board.daysInColumn', { count: card.daysInColumn })}
        </Text>
      ) : null}
      {/* Seules les cartes de MISSION se déplacent depuis le board : une carte
          de projet se déplace sur le pipe, qui porte ses propres effets. */}
      {card.source === 'mission' ? (
        <SelectField
          ariaLabel={t('board.moveTo')}
          value={''}
          onChange={next => {
            const value = next as MissionBoardColumn
            if (value) onMove(value)
          }}
          emptyOption={{ label: t('board.moveTo') }}
          options={MISSION_BOARD_COLUMNS.filter(column => column !== card.column).map(column => ({
            value: column,
            label: t(`board.columns.${column}`),
          }))}
          className="mt-2 w-full"
        />
      ) : (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('board.originScreen', { state: card.originState })}
        </Text>
      )}
    </Box>
  )
}

/**
 * Le panneau d'effets d'un déplacement.
 *
 * Aucune action externe n'est pré-cochée, et une action dont la capacité manque
 * est GRISÉE avec sa raison — la proposer sans le dire ferait cliquer sur un
 * bouton qui ne fait rien.
 */
function BoardMovePanel({
  card,
  to,
  onCancel,
  onConfirm,
}: {
  card: MissionBoardCard
  to: MissionBoardColumn
  onCancel: () => void
  onConfirm: (input: { reason: string | null; accepted: readonly string[] }) => void
}) {
  const { t } = useTranslation('missions')
  const effects = useMemo(() => effectsForBoardMove(card.column, to), [card.column, to])
  // Aucune capacité n'est supposée présente : les actions qui en demandent une
  // s'affichent grisées tant que l'écran ne sait pas qu'elle est là. GRISÉES et
  // non retirées — les retirer ferait croire que le produit ne sait pas les
  // faire, alors qu'il manque juste une connexion.
  const offered = useMemo(() => offerableProposals(effects.proposals, []), [effects.proposals])
  const [accepted, setAccepted] = useState<Set<string>>(() => new Set(defaultCheckedKeys(effects.proposals, [])))
  const [reason, setReason] = useState('')

  // #2407.5 — la table STRICTE des transitions de statut (decisions §9), la
  // même que l'API : un retour arrière exige son motif, un saut est refusé.
  const statusMove = useMemo(() => {
    const from = card.source === 'mission' ? missionStatusForColumn(card.column) : null
    const target = missionStatusForColumn(to)
    return from && target ? missionStatusMove(from, target) : null
  }, [card.source, card.column, to])
  const reasonRequired = effects.reasonRequired || statusMove === 'backward'
  const refused = statusMove === 'refused'
  const missingReason = reasonRequired && reason.trim().length === 0

  return (
    <Dialog open onOpenChange={open => !open && onCancel()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('board.move.title', { column: t(`board.columns.${to}`) })}</DialogTitle>
          <DialogDescription>{card.label}</DialogDescription>
        </DialogHeader>

        {effects.createsMission ? (
          <Text element="p" size="sm" color="text-[var(--warning-soft-text)]">
            {t('board.move.createsMission')}
          </Text>
        ) : null}

        {offered.length > 0 ? (
          <Box className="space-y-1">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
              {t('board.move.proposals')}
            </Text>
            {offered.map(({ proposal, disabled, missingCapability }) => (
              <Box key={proposal.key} display="flex" className="items-center gap-2">
                <Checkbox
                  checked={accepted.has(proposal.key)}
                  disabled={disabled}
                  onCheckedChange={() =>
                    setAccepted(previous => {
                      const next = new Set(previous)
                      if (next.has(proposal.key)) next.delete(proposal.key)
                      else next.add(proposal.key)
                      return next
                    })
                  }
                />
                <Text size="sm" color={disabled ? 'text-[var(--bellum-text-muted)]' : undefined}>
                  {t(`board.move.proposal.${proposal.key}`)}
                </Text>
                {missingCapability ? (
                  <Badge variant="outline" className="px-1 py-0 text-xs">
                    {t(`board.move.requires.${missingCapability}`)}
                  </Badge>
                ) : null}
              </Box>
            ))}
          </Box>
        ) : null}

        {effects.checks.length > 0 ? (
          <Box className="space-y-1">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
              {t('board.move.checks')}
            </Text>
            {effects.checks.map(check => (
              <Text key={check} size="sm" color="text-[var(--bellum-text-secondary)]">
                {t(`board.move.check.${check}`)}
              </Text>
            ))}
          </Box>
        ) : null}

        {refused ? (
          <Text element="p" size="sm" color="text-[var(--warning-soft-text)]">
            {t('board.move.refused')}
          </Text>
        ) : null}

        {reasonRequired && !refused ? (
          <Box className="space-y-1">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-muted)]">
              {statusMove === 'backward' && !effects.reasonRequired
                ? t('board.move.backwardReason')
                : t('board.move.reason')}
            </Text>
            <Textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} />
          </Box>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            disabled={missingReason || refused}
            onClick={() => onConfirm({ reason: reason.trim() || null, accepted: [...accepted] })}
          >
            {t('board.move.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
