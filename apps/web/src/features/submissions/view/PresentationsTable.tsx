import type { Submission } from '@bellum/contracts'
import { Badge, Box, EntityAvatar, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { presentationState, type PresentationState } from '../lib/presentationStates'

const STATE_VARIANT: Record<PresentationState, 'default' | 'primary' | 'success' | 'warning'> = {
  preselection: 'default',
  to_present: 'default',
  presented: 'primary',
  client_interview: 'primary',
  retained: 'success',
  declined: 'warning',
  withdrawn: 'default',
  no_response: 'warning',
  converted: 'success',
  archived: 'default',
}

/**
 * Théo C projects-presentations.R2 — le tableau des présentations : Consultant · Besoin / client · Suivi ·
 * Canal / responsable · Prochaine échéance · Ouvrir. Monté par l'écran Présentations ET par l'onglet
 * « Profils & présentations » de la fiche affaire (projects-fiche.R7) : un seul tableau, filtré (GA-26).
 *
 * Aucune valeur inventée : une présélection n'a ni canal ni date d'envoi (« Pas encore présentée »,
 * « Aucun envoi consigné »), une échéance absente se dit « À préciser ».
 */
export function PresentationsTable({ items }: { items: readonly Submission[] }) {
  const { t } = useTranslation('submissions')
  return (
    // Théo `.bo11-table-wrap` — un cadre arrondi qui défile seul sous 768 px, en-têtes sur le creux.
    <Box className="overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--bellum-border)] bg-card">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm [&_td]:px-4 [&_th]:px-4">
        <thead>
          <tr className="border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs text-[var(--bellum-text-muted)]">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('presentations.columns.consultant')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('presentations.columns.need')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('presentations.columns.follow')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('presentations.columns.channel')}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t('presentations.columns.due')}
            </th>
            <th scope="col" className="py-2 font-medium">
              <span className="sr-only">{t('presentations.columns.open')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <PresentationRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </Box>
  )
}

function PresentationRow({ item }: { item: Submission }) {
  const { t } = useTranslation('submissions')
  const state = presentationState(item)
  const sentOn = formatDate(item.submittedAt, { dateStyle: 'medium' })
  const dueOn = formatDate(item.nextActionDueAt, { dateStyle: 'medium' })
  const name = item.consultantName ?? t('row.unnamedConsultant')
  return (
    <tr className="border-b border-[var(--bellum-border)] align-top last:border-b-0">
      <td className="py-3 pr-3 font-medium">
        {/* Théo `.bo11-person` — l'avatar teinté puis le nom, lien vers la fiche du consultant. */}
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <EntityAvatar name={name} size="sm" shape="circle" aria-hidden />
          <span className="flex min-w-0 flex-col">
            {item.consultantId ? (
              <Link to="/consultants/$id" params={{ id: item.consultantId }} className="hover:underline">
                {name}
              </Link>
            ) : (
              <span>{name}</span>
            )}
            {/* #4502 — le poste, tel que stocké ; absent ⇒ aucune ligne. */}
            {item.consultantTitle ? (
              <Text size="xs" color="text-muted-foreground" data-testid="presentation-consultant-title">
                {item.consultantTitle}
              </Text>
            ) : null}
          </span>
        </span>
      </td>
      <td className="py-3 pr-3">
        {item.projectId ? (
          <Link
            to="/projects/$id"
            params={{ id: item.projectId }}
            className="block text-sm font-semibold hover:underline"
          >
            {item.needRole ?? item.projectLabel ?? t('row.noAccount')}
          </Link>
        ) : (
          <Text size="sm" className="block">
            {item.needRole ?? item.projectLabel ?? t('row.noAccount')}
          </Text>
        )}
        {item.accountName ? (
          <Text size="xs" color="text-muted-foreground" className="block">
            {item.accountName}
          </Text>
        ) : null}
      </td>
      <td className="py-3 pr-3">
        <Badge variant={STATE_VARIANT[state]}>{t(`presentations.states.${state}`)}</Badge>
        {/* D-4 : une trace consignée est un geste DÉCLARATIF — jamais présentée comme une preuve d'envoi. */}
        <Text size="xs" color="text-muted-foreground" className="mt-1 block">
          {sentOn ? t('presentations.row.recorded', { date: sentOn }) : t('presentations.row.noSend')}
        </Text>
      </td>
      <td className="py-3 pr-3">
        <Text size="sm" className="block">
          {item.submittedAt && item.channel
            ? t(`details.channels.${item.channel}`)
            : item.submittedAt
              ? t('presentations.row.channelUnknown')
              : t('presentations.row.notPresented')}
        </Text>
        {item.ownerName ? (
          <Text size="xs" color="text-muted-foreground" className="block">
            {item.ownerName}
          </Text>
        ) : null}
      </td>
      <td className="py-3 pr-3">{dueOn ?? t('presentations.row.dueUnknown')}</td>
      <td className="py-3">
        <Link
          to="/submissions/$id"
          params={{ id: item.id }}
          aria-label={t('presentations.row.openNamed', { name })}
          className="inline-flex min-h-11 items-center rounded-control px-2 text-sm hover:underline"
        >
          {t('presentations.row.open')}
        </Link>
      </td>
    </tr>
  )
}
