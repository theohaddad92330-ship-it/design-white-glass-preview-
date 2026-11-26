import {
  Avatar,
  AvatarFallback,
  Badge,
  Box,
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@bellum/ui'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { memo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { WorkspaceActivityEventName, WorkspaceActivityItem, WorkspaceActivityQuery } from '@bellum/contracts'
import { hasPermission, resolveScreenState, workspaceActivityEventNames } from '@bellum/contracts'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useWorkspaceActivity } from '@/features/team/hooks/useWorkspaceActivity'
import { teamApi } from '@/features/team/api'
import { activityCsvRows } from '@/features/team/lib/activity-csv'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { SettingsViewHeader } from '@/features/settings/components/SettingsViewHeader'

const PAGE_SIZE = 25

/** Le plafond d'un export : au-delà, le journal se filtre — jamais un fichier sans fin. */
const EXPORT_MAX_ROWS = 2000
const EXPORT_PAGE = 100

/** Badge tone per event family — team events stand out, the rest stays quiet. */
const EVENT_BADGE_VARIANT: Record<WorkspaceActivityEventName, 'default' | 'info' | 'secondary'> = {
  analysis_started: 'info',
  analysis_completed: 'info',
  contact_enriched: 'secondary',
  export_performed: 'secondary',
  message_sent: 'secondary',
  member_invited: 'default',
  invitation_revoked: 'default',
  member_removed: 'default',
  member_role_changed: 'default',
  integration_connected: 'secondary',
  integration_disconnected: 'secondary',
  // Une reprise de portefeuille déplace des dizaines de comptes d'un coup :
  // elle se lit avec les autres gestes d'équipe, pas dans le bruit de fond.
  portfolio_handed_over: 'default',
  // Un droit accordé en propre déplace un privilège SANS changer le rôle
  // affiché : c'est le geste d'équipe qu'on relit le plus tard, et le moins
  // visible ailleurs.
  member_permissions_changed: 'default',
}

function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

function ActivityRow({ item }: { item: WorkspaceActivityItem }) {
  const { t, i18n } = useTranslation('activityLog')
  const actorLabel = item.actor.name ?? item.actor.email ?? t('row.unknownActor')
  const when = new Date(item.occurredAt).toLocaleString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const detail = [item.target, item.detail].filter(Boolean).join(' · ') || t('row.noTarget')

  return (
    <TableRow className="border-[var(--bellum-border)] align-top">
      <TableCell className="px-5 py-3 whitespace-normal">
        <Badge variant={EVENT_BADGE_VARIANT[item.event]} className="text-xs">
          {t(`events.${item.event}`)}
        </Badge>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 break-words">
          {detail}
        </Text>
        {/* Sous 768 px, l'auteur passe sous le changement (sa colonne se masque). */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1 md:hidden">
          {actorLabel}
        </Text>
      </TableCell>
      <TableCell className="hidden py-3 md:table-cell">
        <Box display="flex" className="items-center gap-2">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="bg-[var(--bellum-accent-bg)] text-xs text-[var(--bellum-text-accent)]">
              {initialsOf(actorLabel)}
            </AvatarFallback>
          </Avatar>
          <Text size="sm" color="text-[var(--bellum-text-primary)]" className="truncate">
            {actorLabel}
          </Text>
        </Box>
      </TableCell>
      <TableCell className="px-5 py-3 text-right text-xs whitespace-nowrap text-[var(--bellum-text-secondary)]">
        {when}
      </TableCell>
    </TableRow>
  )
}

const FILTER_TRIGGER =
  'h-9 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm pointer-coarse:min-h-11'

/** `.v12-field` : l'intitulé AU-DESSUS du champ, lié par `htmlFor`. */
function FilterField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <Box display="flex" className="min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
        {label}
      </label>
      {children}
    </Box>
  )
}

/**
 * « Journal d'activité » — Réglages › Espace de travail (Théo p.21 P2): who
 * launched an analysis, enriched a contact, exported, sent a message, invited
 * or removed a member, connected an integration. The server enforces the
 * `team:manage` RBAC gate (owner | admin | sales_ops); this view mirrors the
 * same matrix so other roles see an access notice instead of a 403.
 */
export const ActivityLogView = memo(function ActivityLogView() {
  const { t } = useTranslation('activityLog')
  const { team, isLoading: teamLoading } = useTeam()
  const [actorId, setActorId] = useState<string>('all')
  const [event, setEvent] = useState<string>('all')
  const [period, setPeriod] = useState<string>('all')
  const [offset, setOffset] = useState(0)

  const canView = team ? hasPermission(team.workspace.role, 'team:manage') : false
  const query: WorkspaceActivityQuery = {
    ...(actorId !== 'all' ? { actorId } : {}),
    ...(event !== 'all' ? { event: event as WorkspaceActivityEventName } : {}),
    ...(period !== 'all' ? { period: period as NonNullable<WorkspaceActivityQuery['period']> } : {}),
    offset,
    limit: PAGE_SIZE,
  }
  const { data: page, isLoading, isError, refetch } = useWorkspaceActivity(query, canView)
  const dataExit = useDataExit()
  const [exporting, setExporting] = useState(false)

  /**
   * Théo D settings-outils.A4 — « Exporter » : le journal FILTRÉ tel qu'affiché, toutes pages, en CSV. Soumis à la règle
   * d'espace sur la sortie de données (le bouton disparaît quand elle refuse) ; plafonné, et le dit si le plafond coupe.
   */
  const exportLog = async () => {
    if (!dataExit.grant || exporting) return
    setExporting(true)
    try {
      const items: WorkspaceActivityItem[] = []
      let offsetNow = 0
      while (items.length < EXPORT_MAX_ROWS) {
        const chunk = await teamApi.getActivity({ ...query, offset: offsetNow, limit: EXPORT_PAGE })
        items.push(...chunk.data)
        if (!chunk.pagination.hasNext) break
        offsetNow += EXPORT_PAGE
      }
      const rows = activityCsvRows(items, {
        header: [t('export.date'), t('export.by'), t('export.change'), t('export.target'), t('export.detail')],
        event: name => t(`events.${name}`),
      })
      downloadCSV(toCsv(rows), t('export.filename'), dataExit.grant)
      toast.success(t('export.done', { count: items.length }))
    } catch {
      toast.error(t('export.failed'))
    } finally {
      setExporting(false)
    }
  }

  const applyFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value)
    setOffset(0) // a filter change always restarts from page 1
  }

  /** Le geste que `empty_true` propose — et le SEUL qui rende quelque chose. */
  const handleClearFilters = () => {
    setActorId('all')
    setEvent('all')
    setPeriod('all')
    setOffset(0)
  }

  /**
   * L'ÉTAT DE CET ÉCRAN, DÉRIVÉ (PDF 1 §2).
   *
   * ⚠️ Ce qu'il corrigeait : le journal rendait « Aucune activité sur cette
   * période » DANS LES DEUX CAS — espace neuf où personne n'a encore rien fait,
   * et espace actif dont les trois filtres ne laissent rien passer. La phrase
   * est celle du second cas ; servie au premier, elle envoie chercher une
   * période qui n'existe pas, sur un journal qui n'a simplement jamais rien
   * eu à montrer.
   *
   * `everHadRows` se lit sur le TOTAL rendu par le serveur, pas sur la page :
   * la pagination vide la page 3 sans que l'espace soit vide, et compter les
   * lignes visibles ferait dire « jamais alimenté » à un journal de 500 lignes.
   */
  const isFiltered = actorId !== 'all' || event !== 'all' || period !== 'all'
  const totalRows = page?.pagination.totalItems ?? null
  const screenState = resolveScreenState({
    isLoading: (teamLoading && !team) || (isLoading && !page),
    failed: isError,
    canRead: team ? canView : true,
    needsIntegration: false,
    integrationConnected: true,
    awaitingApproval: false,
    // Sans filtre, le total EST la réponse. Avec un filtre, le serveur ne
    // compte que ce qui passe : on ne SAIT pas si le journal a déjà servi, et
    // `null` dit exactement ça plutôt que de l'inventer.
    everHadRows: isFiltered ? null : totalRows === null ? null : totalRows > 0,
    visibleRows: (page?.data ?? []).length,
    isNarrowed: isFiltered,
    missingParts: [],
    computedAt: null,
    freshForDays: null,
    now: new Date(),
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="w-full space-y-6"
    >
      <SettingsViewHeader scope="space" title={t('header.title')} subtitle={t('header.subtitle')} />

      {teamLoading && !team && (
        <Card className="p-4">
          <ScreenState state="loading" message={t('states.loading')} />
        </Card>
      )}

      {team && !canView && (
        <Card className="p-4">
          <ScreenState state="permission" title={t('accessDenied.title')} message={t('accessDenied.description')} />
        </Card>
      )}

      {team && canView && (
        <>
          {/* `.t-filters` : trois champs NOMMÉS (Type, Membre, Période), le type d'abord. */}
          <Box display="grid" className="grid-cols-1 gap-3 md:grid-cols-4" role="group" aria-label={t('filters.label')}>
            <FilterField id="activity-filter-event" label={t('filters.event')}>
              <Select value={event} onValueChange={applyFilter(setEvent)}>
                <SelectTrigger id="activity-filter-event" className={FILTER_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allEvents')}</SelectItem>
                  {workspaceActivityEventNames.map(name => (
                    <SelectItem key={name} value={name}>
                      {t(`events.${name}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="activity-filter-actor" label={t('filters.actor')}>
              <Select value={actorId} onValueChange={applyFilter(setActorId)}>
                <SelectTrigger id="activity-filter-actor" className={FILTER_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allMembers')}</SelectItem>
                  {team.members.map(member => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.fullName ?? member.email ?? t('row.unknownActor')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField id="activity-filter-period" label={t('filters.period')}>
              <Select value={period} onValueChange={applyFilter(setPeriod)}>
                <SelectTrigger id="activity-filter-period" className={FILTER_TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('filters.allPeriods')}</SelectItem>
                  <SelectItem value="7d">{t('filters.period7d')}</SelectItem>
                  <SelectItem value="30d">{t('filters.period30d')}</SelectItem>
                  <SelectItem value="90d">{t('filters.period90d')}</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            {dataExit.allowed ? (
              <Button
                variant="outline"
                size="sm"
                icon={Download}
                isLoading={exporting}
                className="min-h-11 self-end"
                onClick={() => void exportLog()}
              >
                {t('export.action')}
              </Button>
            ) : null}
          </Box>

          {screenState === 'error' && (
            <Card className="p-4">
              {/* `error` NOMME le geste de reprise (§2.4) — jamais « une erreur
                  est survenue » toute seule. */}
              <ScreenState
                state="error"
                message={t('errors.load')}
                action={{ label: t('errors.retry'), onClick: () => void refetch() }}
              />
            </Card>
          )}

          {screenState === 'loading' && (
            <Card className="p-4">
              <ScreenState state="loading" message={t('states.loading')} />
            </Card>
          )}

          {/* LES DEUX VIDES, ET ILS NE DISENT PAS LA MÊME CHOSE.
              Le journal servait « Aucune activité sur cette période » dans les
              deux cas : sur un espace neuf, cette phrase envoie chercher une
              période, alors qu'il n'y a simplement rien eu à journaliser. */}
          {screenState === 'empty_never' && (
            <Card className="p-4">
              <ScreenState state="empty_never" message={t('states.emptyNever')} />
            </Card>
          )}

          {screenState === 'empty_true' && (
            <Card className="p-4">
              <ScreenState
                state="empty_true"
                message={t('states.emptyFiltered')}
                action={{ label: t('states.clearFilters'), onClick: handleClearFilters }}
              />
            </Card>
          )}

          {page && page.data.length > 0 && (
            <>
              {/* #3057 — le panneau rendait à 0 px de haut dans son parent
                  flex (698 px) alors que son contenu faisait ~13 500 px : un
                  enfant `flex-1` sans hauteur PROPRE bornée reste à 0 dès que
                  son ancêtre n'a lui-même qu'une hauteur intrinsèque (rien à
                  distribuer). `max-h-[60dvh]` est un PLAFOND indépendant de
                  cet ancêtre — jamais `vh` (mobile = le produit, GA-28/29/30) —
                  et `overflow-y-auto` fait défiler la liste dans SA boîte,
                  sans jamais déborder la page. */}
              <div
                data-slot="activity-log-scroll"
                className="max-h-[60dvh] overflow-y-auto rounded-card border border-[var(--bellum-border)] bg-card"
              >
                {/* Le tableau commun (`.v12-table`) : le changement, son auteur, sa date. */}
                <Table aria-label={t('header.title')}>
                  <TableHeader>
                    <TableRow className="border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]">
                      <TableHead className="px-5 text-xs text-[var(--bellum-text-muted)]">
                        {t('columns.change')}
                      </TableHead>
                      <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] md:table-cell">
                        {t('columns.actor')}
                      </TableHead>
                      <TableHead className="px-5 text-right text-xs text-[var(--bellum-text-muted)]">
                        {t('columns.date')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.data.map(item => (
                      <ActivityRow key={item.id} item={item} />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Box display="flex" className="items-center justify-between">
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('pagination.pageOf', {
                    page: page.pagination.currentPage,
                    total: page.pagination.totalPages,
                    count: page.pagination.totalItems,
                  })}
                </Text>
                <Box display="flex" className="gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ChevronLeft}
                    disabled={!page.pagination.hasPrev}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  >
                    {t('pagination.prev')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={ChevronRight}
                    disabled={!page.pagination.hasNext}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                  >
                    {t('pagination.next')}
                  </Button>
                </Box>
              </Box>
            </>
          )}
          {/* `.v12-note` : à qui ce journal est réservé — le même fait que l'écran d'accès refusé. */}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('accessDenied.description')}
          </Text>
        </>
      )}
    </motion.div>
  )
})
