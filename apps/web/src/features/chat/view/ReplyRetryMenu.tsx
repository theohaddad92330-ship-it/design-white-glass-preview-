import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Link2, MoreHorizontal, PenLine, RotateCcw, Shuffle } from 'lucide-react'
import { toast } from 'sonner'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@bellum/ui'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import type { BranchOf, DataOrigin } from './reply-branch'
import { useReplyExportActions, type ReplyExportAction } from './ReplyExportMenu'
import { chatShareUrl } from './chat-share-url'

/**
 * #1953.5 / .6 / .7 / .9 / .10 / .11 — LES CINQ ACTIONS SOUS UNE RÉPONSE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI REPLIÉES, ET POURQUOI UN SEUL DÉCLENCHEUR NOMMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `ReplyFooter` porte déjà quatre gestes (épingler, copier, écouter, signaler
 * un DÉSACCORD). Cinq boutons de plus, côte à côte, passeraient sous 44 px de
 * cible sur téléphone (GA-30) — la ligne est repliée derrière UN déclencheur
 * nommé (GA-32 : « Plus d'actions sur cette réponse »), pas rétrécie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MENU N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne dispatch rien : « Réessayer » / « Modifier ma demande » / « Un autre
 * angle » appellent des callbacks fournis par `Chat.tsx` (`runBranch`), qui ne
 * font que reposer une question par le chemin normal du fil. Voir la garde
 * `apps/web/src/architecture/retry-never-redispatches.test.ts`.
 *
 * « Partager cette réponse » réutilise le lien CLOISONNÉ de `ShareConversation`
 * (`chatShareUrl`, GA-26 — un seul endroit), avec `messageId` en plus.
 *
 * #5032.15 — « Signaler un problème » ouvre le retour sur la réponse (`ReplyFeedback`,
 * ses six choix et la correction « Donnée fausse »), et « Exporter » sert les copies
 * d'une réponse à cartes. Revient sur #1960.4 : le signalement de support pré-rempli
 * (`requestReport`) n'est plus atteint depuis ce menu — un seul « Signaler » (GA-26).
 */
export function ReplyRetryMenu({
  exportContent = null,
  ...props
}: ReplyRetryMenuProps & { exportContent?: string | null }) {
  // #5032.15 — « Exporter » : la liste ne se lit (règle d'espace) que si la réponse porte des cartes.
  return exportContent ? (
    <ReplyRetryMenuWithExport exportContent={exportContent} {...props} />
  ) : (
    <ReplyRetryMenuView exportActions={[]} {...props} />
  )
}

function ReplyRetryMenuWithExport({ exportContent, ...props }: ReplyRetryMenuProps & { exportContent: string }) {
  return <ReplyRetryMenuView exportActions={useReplyExportActions(exportContent)} {...props} />
}

type ReplyRetryMenuProps = {
  accountId: string | null
  conversationId: string | null
  messageId: string | null
  branchOf: BranchOf | null
  dataOrigin: DataOrigin | null
  /**
   * #5032.15 — réessayer / modifier / autre angle : absents quand rien ne précède cette
   * réponse (une ouverture de Laura sur un fil vierge) — aucune entrée qui ne ferait rien.
   */
  onRetry?: () => void
  onEditLastMessage?: () => void
  onAlternativeAngle?: () => void
  /** #5032.15 — « Signaler un problème » ouvre le retour sur la réponse (`ReplyFeedback`, ses six choix). */
  onReport?: () => void
  /** #1953.13 — un tour en vol désactive réessayer / modifier / autre angle. */
  retryDisabled: boolean
}

function ReplyRetryMenuView({
  exportActions,
  accountId,
  conversationId,
  messageId,
  branchOf,
  dataOrigin,
  onRetry,
  onEditLastMessage,
  onAlternativeAngle,
  onReport,
  retryDisabled,
}: ReplyRetryMenuProps & { exportActions: readonly ReplyExportAction[] }) {
  const { t } = useTranslation('chat')
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  async function share() {
    const url = chatShareUrl(window.location.origin, { accountId, conversationId, messageId })
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('share.copied'))
    } catch {
      toast.error(t('share.failed', { url }))
    }
  }

  /**
   * #2435.4 — LES CINQ ACTIONS, UNE SEULE FOIS.
   *
   * Décrites ici, rendues deux fois (`DropdownMenuItem` sur bureau,
   * `<button>` dans le tiroir sur mobile) : la LISTE ne se dédouble jamais
   * (GA-26), seul son habillage change avec `useIsMobile`.
   */
  const actions: {
    key: string
    icon: ReplyExportAction['icon']
    label: string
    onSelect: () => void
    disabled: boolean
  }[] = [
    // #5032.15 — « Exporter » d'abord (réponse à cartes seulement), puis les reprises, puis signaler.
    ...exportActions.map(action => ({ ...action, disabled: false })),
    ...(onRetry
      ? [{ key: 'retry', icon: RotateCcw, label: t('retry.retry'), onSelect: onRetry, disabled: retryDisabled }]
      : []),
    ...(onEditLastMessage
      ? [
          {
            key: 'editLastMessage',
            icon: PenLine,
            label: t('retry.editLastMessage'),
            onSelect: onEditLastMessage,
            disabled: retryDisabled,
          },
        ]
      : []),
    ...(onAlternativeAngle
      ? [
          {
            key: 'alternativeAngle',
            icon: Shuffle,
            label: t('retry.alternativeAngle'),
            onSelect: onAlternativeAngle,
            disabled: retryDisabled,
          },
        ]
      : []),
    { key: 'share', icon: Link2, label: t('retry.share'), onSelect: () => void share(), disabled: false },
    ...(onReport ? [{ key: 'report', icon: Flag, label: t('retry.report'), onSelect: onReport, disabled: false }] : []),
  ]

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t('retry.menuLabel')}
      className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
    >
      <MoreHorizontal className="size-3.5" aria-hidden />
    </Button>
  )

  const dataOriginNote =
    branchOf && dataOrigin ? (
      <p className="border-t border-[var(--bellum-border)] px-2 pt-2 text-xs text-[var(--bellum-text-muted)]">
        {t(`retry.dataOrigin.${dataOrigin}`)}
      </p>
    ) : null

  if (isMobile) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          closeLabel={t('common:actions.close')}
          className="gap-0 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle className="text-sm">{t('retry.menuLabel')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2 pb-2">
            {actions.map(action => (
              <button
                key={action.key}
                type="button"
                disabled={action.disabled}
                onClick={() => {
                  action.onSelect()
                  setSheetOpen(false)
                }}
                className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-[var(--bg-glass)] focus-visible:bg-[var(--bg-glass)] disabled:pointer-events-none disabled:opacity-50"
              >
                <action.icon className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                {action.label}
              </button>
            ))}
          </div>
          {dataOriginNote}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {actions.map(action => (
          <DropdownMenuItem
            key={action.key}
            onSelect={action.onSelect}
            disabled={action.disabled}
            className="gap-2 pointer-coarse:min-h-11"
          >
            <action.icon className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            {action.label}
          </DropdownMenuItem>
        ))}
        {/* #1953.21 / #1953.22 — la provenance de LA BRANCHE, dans son propre
            menu : « je réutilise » et « j'ai rechargé » ne coûtent pas la même
            chose et ne valent pas la même fraîcheur (doctrine `Provenance`). */}
        {dataOriginNote}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
