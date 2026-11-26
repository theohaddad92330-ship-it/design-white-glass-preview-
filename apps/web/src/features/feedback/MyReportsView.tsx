import { resolveScreenState, type ReportStatus } from '@bellum/contracts'
import { Badge, Box, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { MessageSquareWarning } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { SettingsEyebrow } from '@/features/settings/components/SettingsScreenHeader'
import { myReportsApi, reportSummary, type MyReport } from './myReports'
import { requestReport } from './reportLink'

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>

/**
 * Une couleur par état — et AUCUNE pour « état indisponible », qui prend le
 * contour neutre : une panne de lecture ne se colore ni en attente ni en succès.
 */
const STATUS_VARIANT: Readonly<Record<ReportStatus, BadgeVariant>> = {
  received: 'default',
  in_progress: 'info',
  fixed: 'success',
  closed_unresolved: 'outline',
}

/**
 * #1960.10 — « MES SIGNALEMENTS » (décision de Louis du 13/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le widget rendait une référence (« Signalement n° 913 ») et n'offrait aucun
 * endroit où la suivre. La personne qui remonte un problème ne savait jamais
 * s'il avait été reçu, pris en main ou corrigé — et ne revenait pas en signaler
 * un deuxième.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE MONTRE PAS, EXPRÈS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Aucun lien, aucun nom d'outil : le ticket vit dans un outil interne qu'un
 *    client ne peut pas ouvrir.
 *  - Aucune marque, aucune adresse : un espace en marque blanche lit la même
 *    page, et rien ici ne lui parle d'un autre que lui.
 *  - Aucun état deviné : un état qui n'a pas pu être lu s'écrit « État
 *    indisponible », jamais « Reçu ».
 *  - Rien que les signalements de la personne connectée — l'API filtre par
 *    l'auteur du jeton.
 */
/**
 * `embedded` — Théo D settings-outils (Aide & signalements) : la page porte l'en-tête « Aide & signalements » ; la liste
 * devient un BLOC « Mes signalements » (titre h2), sous l'aide.
 */
export function MyReportsView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation('feedback')
  // #1960.10 — en démonstration, l'envoi est refusé : l'état vide ne le promet pas.
  const isDemo = useIsDemo()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['feedback', 'mine'],
    queryFn: () => myReportsApi.list(),
  })

  const reports = data ?? []
  // Seuls les signalements NUMÉROTÉS ont un état à lire : un signalement sans
  // numéro n'est pas une lecture qui a échoué, l'annoncer ferait croire à une panne.
  const unread = reports.filter(report => report.reference !== null && report.status === null)
  const screenState = resolveScreenState({
    isLoading,
    failed: isError,
    canRead: true,
    needsIntegration: false,
    integrationConnected: true,
    awaitingApproval: false,
    everHadRows: reports.length > 0,
    visibleRows: reports.length,
    isNarrowed: false,
    missingParts: unread.map(report => t('myReports.reference', { number: report.reference })),
    computedAt: null,
    freshForDays: null,
    now: new Date(),
  })

  return (
    <Box className="w-full max-w-5xl">
      <Box className="mb-5">
        {embedded ? null : <SettingsEyebrow scope="personal" />}
        <Text
          element={embedded ? 'h2' : 'h1'}
          size={embedded ? 'base' : '2xl'}
          weight={embedded ? 'semibold' : 'bold'}
          color="text-[var(--bellum-text-primary)]"
        >
          {t('myReports.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {t('myReports.subtitle')}
        </Text>
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
          {t('myReports.legend')}
        </Text>
        {/* Geste primaire (V22 aide, #1960.10) : le même formulaire que le bouton flottant ; il n'envoie rien. */}
        <Button
          type="button"
          size="sm"
          className="mt-3 pointer-coarse:min-h-11"
          onClick={() => requestReport({ message: '' })}
        >
          <MessageSquareWarning aria-hidden className="size-4" />
          {t('myReports.reportAction')}
        </Button>
      </Box>

      <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('myReports.note')}
      </Text>

      <SettingsBlock label={t('myReports.listTitle')} description={t('myReports.legend')}>
        {screenState === 'loading' && (
          <div className="px-5 py-4 sm:px-6">
            <ScreenState state="loading" message={t('myReports.states.loading')} />
          </div>
        )}

        {screenState === 'error' && (
          <div className="px-5 py-4 sm:px-6">
            <ScreenState
              state="error"
              message={t('myReports.states.error')}
              action={{ label: t('myReports.states.retry'), onClick: () => void refetch() }}
            />
          </div>
        )}

        {screenState === 'empty_never' && (
          <div className="px-5 py-4 sm:px-6">
            <ScreenState
              state="empty_never"
              title={t('myReports.states.emptyTitle')}
              message={t('myReports.states.emptyMessage')}
              detail={isDemo ? t('myReports.states.emptyDetailDemo') : t('myReports.states.emptyDetail')}
              // Un état vide porte un GESTE (`an-empty-column-offers-a-way-out.test.ts`) :
              // il ouvre le même formulaire que le bouton flottant et le lien de Laura,
              // et n'envoie rien. En démonstration, le widget répond par son message.
              action={{ label: t('myReports.states.emptyAction'), onClick: () => requestReport({ message: '' }) }}
            />
          </div>
        )}

        {screenState === 'partial' && (
          <div className="px-5 pt-4 sm:px-6">
            <ScreenState
              state="partial"
              message={t('myReports.states.partial', { count: unread.length })}
              detail={t('myReports.states.partialDetail')}
            />
          </div>
        )}

        {!isError && reports.length > 0 ? (
          /* Le tableau commun (`.v12-table`) : le signalement, sa catégorie, sa date, son état. */
          <Table aria-label={t('myReports.title')}>
            <TableHeader>
              <TableRow className="border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]">
                <TableHead className="px-5 text-xs text-[var(--bellum-text-muted)] sm:px-6">
                  {t('myReports.columns.report')}
                </TableHead>
                <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] md:table-cell">
                  {t('myReports.columns.category')}
                </TableHead>
                <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] md:table-cell">
                  {t('myReports.columns.sentOn')}
                </TableHead>
                <TableHead className="px-5 text-right text-xs text-[var(--bellum-text-muted)] sm:px-6">
                  {t('myReports.columns.status')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map(report => (
                <ReportRow key={report.id} report={report} />
              ))}
            </TableBody>
          </Table>
        ) : null}
      </SettingsBlock>
    </Box>
  )
}

function ReportRow({ report }: { report: MyReport }) {
  const { t, i18n } = useTranslation('feedback')
  const sent = new Date(report.createdAt)
  const sentOn = Number.isNaN(sent.getTime())
    ? null
    : sent.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
  const meta = [
    report.category ? t(`categories.${report.category}`) : null,
    sentOn ? t('myReports.sentOn', { date: sentOn }) : null,
  ].filter((part): part is string => part !== null)

  return (
    <TableRow className="border-[var(--bellum-border)] align-top">
      <TableCell className="px-5 py-4 sm:px-6">
        <Box className="min-w-0 space-y-1 whitespace-normal">
          <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
            {report.reference !== null
              ? t('myReports.reference', { number: report.reference })
              : t('myReports.noReference')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="break-words">
            {reportSummary(report.message)}
          </Text>
          {/* Sous 768 px, la catégorie et la date passent sous le résumé (les colonnes se masquent). */}
          {meta.length > 0 ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="md:hidden">
              {meta.join(' · ')}
            </Text>
          ) : null}
        </Box>
      </TableCell>
      <TableCell className="hidden py-4 text-sm text-[var(--bellum-text-secondary)] md:table-cell">
        {report.category ? t(`categories.${report.category}`) : null}
      </TableCell>
      <TableCell className="hidden py-4 text-sm text-[var(--bellum-text-secondary)] md:table-cell">{sentOn}</TableCell>
      <TableCell className="px-5 py-4 text-right sm:px-6">
        <Badge variant={report.status ? STATUS_VARIANT[report.status] : 'outline'}>
          {report.status ? t(`myReports.status.${report.status}`) : t('myReports.status.unavailable')}
        </Badge>
      </TableCell>
    </TableRow>
  )
}
