import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  ClipboardList,
  FoldVertical,
  Layers,
  ListChecks,
  ListPlus,
  Scale,
  Sheet as SheetIcon,
  SlidersHorizontal,
  UnfoldVertical,
  type LucideIcon,
} from 'lucide-react'
import {
  replyTransformRequestFor,
  replyTransformsFor,
  type ReplyTransformId,
  type ReplyTransformRequest,
} from '@bellum/contracts'
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

/**
 * #3768 (BEL-LAU-1014) — RETRAVAILLER UNE RÉPONSE SANS REPARTIR DE ZÉRO.
 *
 * #5032.11 — le déclencheur s'appelle désormais « Ajuster » (revient sur #3768 : « Retravailler »),
 * mêmes transformations, plus « Approfondir (avec devis) ».
 *
 * Un seul déclencheur nommé dans le pied de réponse (même rang que
 * `ReplyRetryMenu`, GA-30 : huit boutons côte à côte passeraient sous 44 px sur
 * téléphone), huit gestes dedans. Seuls ceux qui ont un sens pour CETTE réponse
 * apparaissent (`replyTransformsFor` : pas de « plus de comptes » sans compte
 * cité) — une absence ne fait aucune ligne. Sur téléphone, le menu devient une
 * feuille du bas, comme `ReplyRetryMenu`.
 *
 * Le geste n'écrit rien : il envoie la réponse source, sa forme, ses comptes et
 * ses réserves avec un tour (`onTransform` → `Chat.tsx`), jamais une requête
 * aveugle. Laura prépare, elle n'envoie rien.
 */
const ICONS: Record<ReplyTransformId, LucideIcon> = {
  deepen: UnfoldVertical,
  synthesize: FoldVertical,
  more_accounts: ListPlus,
  less_detail: AlignLeft,
  justify: Scale,
  priorities_only: ListChecks,
  action_plan: ClipboardList,
  exportable_list: SheetIcon,
}

export function ReplyTransformMenu({
  text,
  onTransform,
  disabled,
  onDeepen,
}: {
  /** Le texte (Markdown) de la réponse à retravailler. */
  text: string
  /** Envoie le tour : la demande portée, et le libellé que la personne a cliqué. */
  onTransform?: (request: ReplyTransformRequest, label: string) => void
  /** Un tour en vol désactive les gestes (même règle que « Réessayer »). */
  disabled: boolean
  /**
   * #5032.12 — « Approfondir (avec devis) » : ouvre le flux de `DeepenActions` (devis avant
   * lancement, puis delta rejoué, #2452). Absent quand la réponse ne vise aucun compte.
   */
  onDeepen?: () => void
}) {
  const { t } = useTranslation('chat')
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)

  const ids = onTransform ? replyTransformsFor(text) : []
  const actions: { id: string; icon: LucideIcon; label: string; run: () => void }[] = ids.map(id => ({
    id,
    icon: ICONS[id],
    label: t(`replyTransform.ids.${id}`),
    run: () => onTransform?.(replyTransformRequestFor(id, text), t(`replyTransform.ids.${id}`)),
  }))
  // #5032.12 — le seul chemin vers le moteur d'approfondissement (devis d'abord, GA-26).
  if (onDeepen)
    actions.push({ id: 'deepenWithQuote', icon: Layers, label: t('replyTransform.deepenWithQuote'), run: onDeepen })
  if (actions.length === 0) return null

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={t('replyTransform.menuLabel')}
      className="gap-1 text-xs text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
    >
      <SlidersHorizontal className="size-3.5" aria-hidden />
      {t('replyTransform.trigger')}
    </Button>
  )

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
            <SheetTitle className="text-sm">{t('replyTransform.menuLabel')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-2 pb-2">
            {actions.map(action => (
              <button
                key={action.id}
                type="button"
                onClick={() => {
                  action.run()
                  setSheetOpen(false)
                }}
                className="flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-[var(--bg-glass)] focus-visible:bg-[var(--bg-glass)]"
              >
                <action.icon className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                {action.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {actions.map(action => (
          <DropdownMenuItem key={action.id} onSelect={action.run} className="gap-2 pointer-coarse:min-h-11">
            <action.icon className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
