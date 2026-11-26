import type { ProfileContextRevisionSummary } from '@bellum/contracts'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { History, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { useProfileContextRevisions } from '@/features/profile-context/hooks/useProfileContextRevisions'
import { useRestoreProfileContextRevision } from '@/features/profile-context/hooks/useRestoreProfileContextRevision'
import { formatTimeAgo } from '@/lib/relative-time'

function formatDate(dateStr: string): string {
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  return new Date(dateStr).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * « Versions » panel for the profile-context screen — the append-only history of
 * BellumAI profile snapshots with one-click restore. Present-only : renders
 * nothing while loading or when there is no history. The newest revision is the
 * live one (badge « Actuelle », no restore). Restoring is reversible (it
 * snapshots a fresh revision) but confirmed at the click.
 */
export function ProfileContextVersions() {
  const { t } = useTranslation('profile')
  const { data: revisions, isLoading } = useProfileContextRevisions()
  const restore = useRestoreProfileContextRevision()
  const [target, setTarget] = useState<ProfileContextRevisionSummary | null>(null)

  if (isLoading || !revisions || revisions.length === 0) return null

  // Newest first (the API orders them so); the first row is the live context.
  const [current, ...previous] = revisions

  const handleRestore = () => {
    if (!target) return
    const version = target.version
    setTarget(null)
    restore.mutate(version, {
      onSuccess: () => toast.success(t('context.versions.toastRestored', { version })),
      onError: () => toast.error(t('context.versions.toastError')),
    })
  }

  return (
    <section id="versions" className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-[var(--bellum-text-secondary)]" aria-hidden />
        <Text element="h4" size="base" weight="semibold">
          {t('context.versions.title')}
        </Text>
      </div>
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('context.versions.subtitle')}
      </Text>

      <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5 bg-[color-mix(in_srgb,var(--bellum-bg-darker)_60%,transparent)]">
        <VersionRow revision={current} isCurrent onRestore={() => undefined} restoringVersion={null} />
        {previous.map(rev => (
          <VersionRow
            key={rev.version}
            revision={rev}
            isCurrent={false}
            onRestore={() => setTarget(rev)}
            restoringVersion={restore.isPending ? (restore.variables ?? null) : null}
          />
        ))}
      </ul>

      <Dialog open={target !== null} onOpenChange={open => !open && setTarget(null)}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--bellum-text-primary)]">
              {t('context.versions.confirmTitle', { version: target?.version ?? 0 })}
            </DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('context.versions.confirmDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setTarget(null)}>
              {t('common:actions.cancel')}
            </Button>
            <Button variant="violet" size="sm" icon={RotateCcw} onClick={handleRestore}>
              {t('context.versions.confirmCta')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

type VersionRowProps = {
  revision: ProfileContextRevisionSummary
  isCurrent: boolean
  onRestore: () => void
  restoringVersion: number | null
}

function VersionRow({ revision, isCurrent, onRestore, restoringVersion }: VersionRowProps) {
  const { t } = useTranslation('profile')
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Text element="span" size="sm" weight="medium">
            {t('context.versions.versionLabel', { version: revision.version })}
          </Text>
          {isCurrent ? (
            <Badge variant="primary" className="border-0">
              {t('context.versions.current')}
            </Badge>
          ) : revision.was_last_validated ? (
            // #2010.17 — RÉSIDU : « actuelle vs remplacée » se dérive de la
            // position (#2010.6), mais « laquelle était VALIDÉE » ne se
            // dérive de rien — une régénération peut intervenir plusieurs
            // fois pendant qu'une revue reste ouverte. `was_last_validated`
            // vient du serveur (`profiles.last_validated_context_version`,
            // stampé au clic « Valider »), jamais deviné par la position.
            <Badge variant="secondary" className="border-0">
              {t('context.versions.lastValidated')}
            </Badge>
          ) : (
            // #2010.6 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
            // §1) : toute révision qui n'est pas l'actuelle est, par
            // construction de cette liste ordonnée (« la plus récente en
            // premier », voir le commentaire de `ProfileContextVersions`
            // ci-dessus), REMPLACÉE — état dérivé de sa position, aucun champ
            // supplémentaire à écrire.
            <Badge variant="secondary" className="border-0">
              {t('context.versions.superseded')}
            </Badge>
          )}
        </div>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {formatDate(revision.created_at)} · {formatTimeAgo(revision.created_at)}
        </Text>
      </div>
      {!isCurrent && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={RotateCcw}
          iconPosition="left"
          isLoading={restoringVersion === revision.version}
          onClick={onRestore}
        >
          {t('context.versions.restore')}
        </Button>
      )}
    </li>
  )
}
