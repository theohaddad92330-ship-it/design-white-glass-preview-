import { useState } from 'react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeftOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@bellum/ui'
import { ConversationList } from './ConversationsPanel'

/**
 * #1944.4 — le tiroir des conversations, sur téléphone.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI (Louis, 12/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Tiroir depuis l'en-tête de Laura — même liste qu'ordinateur, cibles 44 px. »
 * `ConversationsPanel` (la colonne repliable) se masque en CSS sous 768 px
 * (`max-md:hidden`), et jusqu'ici l'historique n'était atteignable nulle part
 * ailleurs sur téléphone — une décision documentée comme parquée, pas un oubli
 * (voir `ConversationsPanel.tsx`).
 *
 * Ce composant rend LE MÊME `ConversationList` que la colonne — importé, jamais
 * réécrit (loi 4 du tome 7 / GA-26 : rien n'apparaît deux fois sous une forme
 * différente pour le même contenu). `Sheet` est la primitive Radix Dialog du
 * dépôt (`packages/ui`) : Échap ferme, le focus revient au bouton qui a ouvert,
 * le reste de la page passe `aria-hidden` — rien de tout cela n'est réécrit ici.
 *
 * Monté dans l'en-tête de `Chat.tsx`, à côté du bouton de repli desktop : les
 * deux sont mutuellement exclusifs en CSS (`md:hidden` ici, `max-md:hidden` sur
 * la colonne), jamais par un rendu conditionnel qui perdrait l'état au premier
 * rendu (GA-28).
 */
export function ConversationsDrawer({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)

  /**
   * Choisir un fil OU « Nouveau fil » ferme le tiroir — les deux sont des LIENS
   * rendus par `ConversationList`, jamais des boutons (`ConversationsPanel.tsx`).
   * Le menu « … » (archiver, supprimer) est un VOISIN du lien, pas un enfant :
   * il ne navigue pas, et `.closest('a')` ne le voit donc jamais — l'archivage
   * d'un fil ne doit pas refermer la vue sur laquelle on vient d'agir.
   *
   * La capture se fait ICI, sur le conteneur du tiroir, jamais dans
   * `ConversationList` : cette liste appartient à un autre appelant (la colonne
   * desktop) qui n'a rien à fermer.
   */
  const closeOnNavigate = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('conversationsPanel.mobileOpen')}
          title={t('conversationsPanel.mobileOpen')}
          /* `pointer-coarse:min-h-11 pointer-coarse:min-w-11` — GA-30, la même
             cible tactile que le bouton de repli desktop. `md:hidden` — GA-28,
             masqué en CSS à partir de 768 px, dans le MÊME rendu : jamais un
             `useIsMobile()` qui démonterait le bouton. */
          className="flex size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] md:hidden"
        >
          <PanelLeftOpen className="size-4" aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent closeLabel={t('common:actions.close')} side="left" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-[var(--bellum-border)] p-4">
          <SheetTitle className="text-sm">{t('conversationsPanel.title')}</SheetTitle>
          <SheetDescription>{t('conversationsPanel.aria')}</SheetDescription>
        </SheetHeader>
        {/* Le SEUL conteneur défilant du tiroir — `SheetContent` porte déjà
            `overflow-hidden` (GA-29 : jamais deux conteneurs défilants
            imbriqués). */}
        <div className="min-h-0 flex-1 overflow-y-auto py-2" onClickCapture={closeOnNavigate}>
          <ConversationList refreshKey={refreshKey} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
