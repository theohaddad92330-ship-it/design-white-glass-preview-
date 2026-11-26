import { Badge, Button, Checkbox, Text } from '@bellum/ui'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import type { TimesheetLine } from '../api'

export const lineKey = (line: Pick<TimesheetLine, 'missionId' | 'consultantId' | 'periodMonth'>) =>
  `${line.missionId}::${line.consultantId ?? ''}::${line.periodMonth}`

type PillTone = 'success' | 'warning' | 'default'

/**
 * Théo missions-cra.R3/R5 — LE TABLEAU PLAT DES RELEVÉS : le même composant que toutes les listes.
 *
 * Une ligne par consultant, mission et période — aucun groupe, un seul état par cellule :
 *  - **Activité** : les jours déclarés ; « À recevoir · Aucune activité supposée » quand rien n'est arrivé
 *    (jamais « 0 jour ») ;
 *  - **Validation interne** : « Validée » ou « À contrôler » — une absence reste « — » ;
 *  - **Validation client** : « Preuve consignée » (la preuve existe), « En attente », « Rejetée » ;
 *  - **Suivi** : l'état du relevé, la prochaine action, la relance à préparer ou l'escalade.
 *
 * « Ouvrir » ouvre la fenêtre du relevé, qui porte tous les gestes (expliquer l'écart, valider, rejeter,
 * non applicable, relancer…) : rien n'est retiré de la liste, tout vit un cran plus près de la ligne.
 */
export function TimesheetsTable({
  lines,
  selected,
  onToggle,
  onOpen,
  reminderDueKeys,
  nextActionKey,
  missionGroups,
}: {
  lines: readonly TimesheetLine[]
  selected: ReadonlySet<string>
  onToggle: (key: string) => void
  onOpen: (line: TimesheetLine) => void
  reminderDueKeys: ReadonlySet<string>
  nextActionKey: Partial<Record<string, string>>
  /** #2415.8 — les missions à PLUSIEURS consultants ce mois : leur nombre, et si tout est prêt pour la facturation. */
  missionGroups: ReadonlyMap<string, { count: number; ready: boolean }>
}) {
  const { t } = useTranslation('missions')
  // Le repère de groupe ne s'écrit qu'UNE fois par mission (sur sa première ligne), pas sur chaque consultant.
  const groupShown = new Set<string>()

  const internal = (line: TimesheetLine): { tone: PillTone; label: string } | null => {
    if (line.internalReviewedAt || line.status === 'validated')
      return { tone: 'success', label: t('cra.table.internal.validated') }
    if (line.status === 'submitted') return { tone: 'default', label: t('cra.table.internal.toCheck') }
    return null
  }
  const client = (line: TimesheetLine): { tone: PillTone; label: string } | null => {
    if (line.validatedByClientAt || line.status === 'validated')
      return { tone: 'success', label: t('cra.table.client.proof') }
    if (line.status === 'rejected') return { tone: 'warning', label: t('cra.table.client.rejected') }
    if (line.status === 'submitted') return { tone: 'warning', label: t('cra.table.client.waiting') }
    return null
  }

  return (
    <ResponsiveTable
      rows={lines}
      rowKey={lineKey}
      scrollLabel={t('cra.table.label')}
      columns={[
        {
          key: 'select',
          header: '',
          className: 'w-10',
          mobile: 'hidden',
          render: line => (
            <Checkbox
              aria-label={t('cra.table.selectLine', { name: line.consultantName ?? t('cra.noConsultant') })}
              checked={selected.has(lineKey(line))}
              onCheckedChange={() => onToggle(lineKey(line))}
            />
          ),
        },
        {
          key: 'who',
          header: t('cra.table.who'),
          mobile: 'title',
          render: line => (
            <span className="block min-w-0">
              <span className="block font-medium">{line.consultantName ?? t('cra.noConsultant')}</span>
              <span className="block text-xs text-[var(--bellum-text-muted)]">
                {line.missionLabel ? (
                  <ObjectMention kind="mission" id={line.missionId} name={line.missionLabel} />
                ) : (
                  t('unknownMission')
                )}
                {line.accountName ? ` · ${line.accountName}` : ''}
              </span>
              {(missionGroups.get(line.missionId) ?? { count: 1 }).count > 1 &&
              !groupShown.has(line.missionId) &&
              groupShown.add(line.missionId) ? (
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--bellum-text-muted)]">
                  {t('cra.multiConsultantGroup', { count: missionGroups.get(line.missionId)?.count })}
                  <Badge variant={missionGroups.get(line.missionId)?.ready ? 'success' : 'secondary'}>
                    {t(
                      missionGroups.get(line.missionId)?.ready ? 'cra.missionGroup.ready' : 'cra.missionGroup.notReady',
                    )}
                  </Badge>
                </span>
              ) : null}
            </span>
          ),
        },
        {
          key: 'activity',
          header: t('cra.table.activity'),
          render: line =>
            line.days === null ? (
              <span className="block">
                <strong>{t('cra.table.toReceive')}</strong>
                <span className="block text-xs text-[var(--bellum-text-muted)]">{t('cra.table.noInvented')}</span>
              </span>
            ) : (
              <span className="block">
                <strong>{t('cra.days', { count: line.days })}</strong>
                {line.expectedDays !== null ? (
                  <span className="block text-xs text-[var(--bellum-text-muted)]">
                    {t('cra.expected', { count: line.expectedDays })}
                  </span>
                ) : null}
                {line.gapKind !== 'none' ? (
                  <Badge variant={line.blocksInvoicing ? 'warning' : 'outline'} className="mt-1">
                    {line.gapKind === 'unknown'
                      ? t('cra.gapUnknown')
                      : t(`cra.gap.${line.gapKind}`, { count: line.gap === null ? undefined : Math.abs(line.gap) })}
                  </Badge>
                ) : null}
              </span>
            ),
        },
        {
          key: 'internal',
          header: t('cra.table.internalHeader'),
          render: line => {
            const pill = internal(line)
            return pill ? <Badge variant={pill.tone}>{pill.label}</Badge> : <Text element="span">—</Text>
          },
        },
        {
          key: 'client',
          header: t('cra.table.clientHeader'),
          render: line => {
            const pill = client(line)
            return pill ? <Badge variant={pill.tone}>{pill.label}</Badge> : <Text element="span">—</Text>
          },
        },
        {
          key: 'follow',
          header: t('cra.table.follow'),
          render: line => {
            const action = nextActionKey[line.status]
            return (
              <span className="block">
                <Badge
                  variant={
                    line.status === 'validated' ? 'success' : line.status === 'submitted' ? 'default' : 'warning'
                  }
                >
                  {t(`cra.states.${line.status}`)}
                </Badge>
                {reminderDueKeys.has(lineKey(line)) ? (
                  <span className="mt-1 block text-xs text-[var(--warning-soft-text)]">
                    {t('cra.table.reminderToPrepare')}
                  </span>
                ) : action ? (
                  <span className="mt-1 block text-xs text-[var(--bellum-text-muted)]">{t(action)}</span>
                ) : null}
                {line.remindersSent > 0 ? (
                  <span className="block text-xs text-[var(--bellum-text-muted)]">
                    {t('cra.table.remindersSent', { count: line.remindersSent })}
                  </span>
                ) : null}
              </span>
            )
          },
        },
        {
          key: 'open',
          header: '',
          render: line => (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
              aria-label={t('cra.table.openLine', { name: line.consultantName ?? t('cra.noConsultant') })}
              onClick={() => onOpen(line)}
            >
              <ChevronRight className="size-4" aria-hidden />
              {t('cra.table.open')}
            </Button>
          ),
        },
      ]}
    />
  )
}
