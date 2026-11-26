import type { TKey } from '@/lib/i18n'

/**
 * #1678.3 — LE RUNBOOK OPÉRATEUR. Une procédure par carte : ce qu'elle
 * résout, et l'écran où la faire. Les trois dernières (révéler un email, la
 * recherche globale, la visite guidée) n'ont pas d'écran UNIQUE — elles
 * marchent depuis n'importe où — donc `href: null`, jamais un lien qui
 * mentirait sur « où » aller.
 *
 * ⚠️ Ce fichier n'était nulle part avant ce lot : `apps/dashboard-manager`
 * n'avait AUCUN fichier « runbook », mesuré par l'éclaireur avant #1678.3.
 */
type RunbookEntry = {
  id: string
  titleKey: TKey
  bodyKey: TKey
  href: string | null
}

export const RUNBOOK_ENTRIES: RunbookEntry[] = [
  {
    id: 'stuck-analysis',
    titleKey: 'rbStuckAnalysisTitle',
    bodyKey: 'rbStuckAnalysisBody',
    href: '/monitoring?view=runs',
  },
  { id: 'suspend-user', titleKey: 'rbSuspendUserTitle', bodyKey: 'rbSuspendUserBody', href: '/users' },
  { id: 'purge-failed-jobs', titleKey: 'rbPurgeJobsTitle', bodyKey: 'rbPurgeJobsBody', href: '/queues' },
  { id: 'audit-trail', titleKey: 'rbAuditTitle', bodyKey: 'rbAuditBody', href: '/audit' },
  { id: 'global-search', titleKey: 'rbSearchTitle', bodyKey: 'rbSearchBody', href: null },
]
