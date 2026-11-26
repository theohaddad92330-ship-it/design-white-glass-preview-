import {
  RECRUITMENT_STAGES,
  type RecruitmentCard,
  type RecruitmentColumn,
  type RecruitmentStage,
} from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntityAvatar,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useChangeRecruitmentStage, useRecruitmentBoard } from './recruitment-hooks'

/**
 * Théo C talents-recrutement — « La qualification de la personne, indépendamment de ses présentations chez les
 * clients ». Cinq colonnes (À qualifier · Échange prévu · Qualifié · En veille · Écartée), une carte par PERSONNE.
 *
 * Changer l'étape n'écrit que le journal de recrutement : ni les présentations sur les besoins ni les affectations de
 * mission ne bougent (la fenêtre le dit). « Écartée » n'efface personne.
 */
export function RecruitmentPage() {
  const { t } = useTranslation('consultants')

  return (
    <Box className="space-y-4">
      <Box className="flex flex-wrap items-start justify-between gap-3">
        <Box className="space-y-1">
          <Text element="h1" size="xl" weight="semibold">
            {t('recruitment.title')}
          </Text>
          <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('recruitment.subtitle')}
          </Text>
        </Box>
        {/* La porte d'enregistrement du vivier (`?new=1`), la même que partout. */}
        <Link
          to="/consultants"
          search={{ new: true }}
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--bellum-border)] px-3 text-sm font-medium"
        >
          {t('recruitment.add')}
        </Link>
      </Box>

      <TalentsBar />

      <RecruitmentStages />
    </Box>
  )
}

/**
 * #4501 — LE TABLEAU À CINQ COLONNES, seul : monté par l'onglet « Recrutement » du Vivier (`ConsultantsPage`) et par
 * la route `/consultants/recrutement`. L'ancien tableau à deux colonnes (`RecruitmentBoard`, `review_status` seul) est
 * retiré : un seul tableau de recrutement (GA-26).
 */
export function RecruitmentStages() {
  const { t } = useTranslation('consultants')
  const board = useRecruitmentBoard()
  const [editing, setEditing] = useState<RecruitmentCard | null>(null)

  return (
    <>
      {board.isError ? (
        <Text element="p" role="alert" size="sm" className="text-[var(--danger-soft-text)]">
          {t('recruitment.loadError')}
        </Text>
      ) : (
        <Box data-testid="recruitment-board" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {(board.data ?? emptyColumns()).map(column => (
            <Column key={column.stage} column={column} onChange={setEditing} />
          ))}
        </Box>
      )}

      {editing ? <StageDialog card={editing} onClose={() => setEditing(null)} /> : null}
    </>
  )
}

const emptyColumns = (): RecruitmentColumn[] => RECRUITMENT_STAGES.map(stage => ({ stage, cards: [] }))

/** Vivier · Recrutement · Présentations — la barre de Théo, Recrutement est l'écran courant. */
function TalentsBar() {
  const { t } = useTranslation('consultants')
  const entry = 'rounded-md px-3 py-2 text-sm min-h-11 inline-flex items-center'
  return (
    <nav aria-label={t('recruitment.bar.label')} className="flex flex-wrap gap-1">
      <Link to="/consultants" className={`${entry} text-[var(--bellum-text-secondary)]`}>
        {t('recruitment.bar.pool')}
      </Link>
      <Link
        to="/consultants/recrutement"
        aria-current="page"
        className={`${entry} bg-[var(--bellum-surface-2)] font-medium`}
      >
        {t('recruitment.bar.recruitment')}
      </Link>
    </nav>
  )
}

function Column({ column, onChange }: { column: RecruitmentColumn; onChange: (card: RecruitmentCard) => void }) {
  const { t } = useTranslation('consultants')
  const headingId = `recruitment-column-${column.stage}`
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 space-y-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <Box className="flex items-center justify-between gap-2">
        <Text element="h2" size="sm" weight="semibold" id={headingId}>
          {t(`recruitment.stage.${column.stage}`)}
        </Text>
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {column.cards.length}
        </Text>
      </Box>
      {column.stage === 'on_hold' ? (
        // La durée de conservation est dite UNE fois, sous « En veille » (Louis 22/10).
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('recruitment.retention')}
        </Text>
      ) : null}
      {column.cards.length === 0 ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('recruitment.emptyStage')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {column.cards.map(card => (
            <li key={card.talentId}>
              <PersonCard card={card} onChange={onChange} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonCard({ card, onChange }: { card: RecruitmentCard; onChange: (card: RecruitmentCard) => void }) {
  const { t, i18n } = useTranslation('consultants')
  const name = card.fullName ?? t('recruitment.unnamed')
  const where = [card.location, card.relation ? t(`recruitment.relation.${card.relation}`, { defaultValue: '' }) : null]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className="space-y-1 rounded-card border border-[var(--bellum-border)] bg-card p-3">
      {/* Maquette `talents-recrutement` — l'avatar (initiales, la photo ne classe jamais), le nom, le poste. */}
      <Box className="flex min-w-0 items-center gap-2">
        <EntityAvatar name={card.fullName} size="sm" />
        <Box className="min-w-0 flex-1">
          <Link
            to="/consultants/$id"
            params={{ id: card.talentId }}
            className="flex min-h-11 items-center break-words text-sm font-semibold hover:underline"
          >
            {name}
          </Link>
          {card.title ? (
            <Text element="p" size="xs" className="break-words text-[var(--bellum-text-secondary)]">
              {card.title}
            </Text>
          ) : null}
        </Box>
      </Box>
      {where ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {where}
        </Text>
      ) : null}
      {card.plannedAt ? (
        <Text element="p" size="xs" weight="medium">
          {t('recruitment.plannedOn', {
            date: new Date(card.plannedAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' }),
          })}
        </Text>
      ) : null}
      {card.reason ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {card.reason}
        </Text>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="min-h-11"
        aria-label={t('recruitment.changeFor', { name })}
        onClick={() => onChange(card)}
      >
        {t('recruitment.change')}
      </Button>
    </article>
  )
}

function StageDialog({ card, onClose }: { card: RecruitmentCard; onClose: () => void }) {
  const { t } = useTranslation('consultants')
  const change = useChangeRecruitmentStage()
  const [stage, setStage] = useState<RecruitmentStage>(card.stage)
  const [reason, setReason] = useState('')
  const [plannedAt, setPlannedAt] = useState('')

  const save = async () => {
    const trimmed = reason.trim()
    await change.mutateAsync({
      talentId: card.talentId,
      input: {
        stage,
        ...(trimmed ? { reason: trimmed } : {}),
        ...(stage === 'call_planned' && plannedAt ? { plannedAt: new Date(plannedAt).toISOString() } : {}),
      },
    })
    onClose()
  }

  return (
    <Dialog open onOpenChange={open => (open ? null : onClose())}>
      <DialogContent closeLabel={t('recruitment.dialog.cancel')}>
        <DialogHeader>
          <DialogTitle>{t('recruitment.dialog.title')}</DialogTitle>
          <DialogDescription>{t('recruitment.dialog.independence')}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label={t('recruitment.dialog.stage')} className="space-y-1">
          {RECRUITMENT_STAGES.map(option => (
            <label key={option} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="recruitment-stage"
                checked={stage === option}
                onChange={() => setStage(option)}
              />
              {t(`recruitment.stage.${option}`)}
            </label>
          ))}
        </div>
        {stage === 'call_planned' ? (
          <label className="block space-y-1 text-sm">
            {t('recruitment.dialog.plannedAt')}
            <input
              type="datetime-local"
              value={plannedAt}
              onChange={event => setPlannedAt(event.target.value)}
              className="block min-h-11 w-full rounded-md border border-border bg-transparent p-2 text-sm"
            />
          </label>
        ) : null}
        <label className="block space-y-1 text-sm">
          {t('recruitment.dialog.reason')}
          <textarea
            value={reason}
            maxLength={500}
            onChange={event => setReason(event.target.value)}
            className="min-h-[88px] w-full rounded-md border border-border bg-transparent p-2 text-sm"
          />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('recruitment.dialog.cancel')}
          </Button>
          <Button isLoading={change.isPending} onClick={() => void save()}>
            {t('recruitment.dialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
