import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger } from '@bellum/ui'
import { toast } from 'sonner'
import {
  exportAgentChatThread,
  type ChatThreadExportFormat,
  type ChatThreadExportScope,
} from '@/features/chat/api/agentChatApi'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/** Les deux formats qu'on lit : le `.json` reste dans le menu de la liste des fils. */
const HEADER_FORMATS: readonly ChatThreadExportFormat[] = ['md', 'pdf']
/** #3895.1 — le fil complet d'abord (le défaut), puis l'extrait. */
const HEADER_SCOPES: readonly ChatThreadExportScope[] = ['full', 'extract']

/**
 * #3979.1 (#3895.5) — « Exporter » dans l'en-tête de /chat : le fil OUVERT, en
 * Markdown ou en PDF.
 *
 * Aucune route neuve : c'est `exportAgentChatThread`, le geste déjà livré par le
 * menu de la liste des fils (#1955.7) — la même route, la même garde d'espace,
 * le même export. Le serveur ne sort ni le corps rédigé d'une action proposée
 * ni celui d'un message envoyé (voir `chat-thread-export.ts`). Les libellés
 * sont ceux de `sidebarThreads.*` : un réglage vit à UN seul endroit (GA-26).
 * Masqué quand la règle d'espace interdit toute sortie de données (#2081.14).
 */
export function ExportConversation({
  accountId,
  conversationId,
}: {
  accountId: string | null
  conversationId: string | null
}) {
  const { t } = useTranslation('chat')
  const dataExit = useDataExit()
  const [open, setOpen] = useState(false)

  if (!dataExit.allowed) return null

  async function run(format: ChatThreadExportFormat, scope: ChatThreadExportScope) {
    setOpen(false)
    try {
      await exportAgentChatThread({ conversationId, accountId }, format, scope)
    } catch (error) {
      // Un export qui n'aboutit pas le DIT, par la phrase de la règle si c'est elle.
      toast.error(workspaceRuleRefusalText(error) ?? t('sidebarThreads.exportFailed'))
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* #5047 — LIGNE du menu ⋯ de l'en-tête (revient sur #4876 : plus de repli en icône seule). */}
        <Button variant="ghost" size="sm" icon={Download} fullWidth className="justify-start pointer-coarse:min-h-11">
          {t('sidebarThreads.export')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-1 p-1">
        {HEADER_SCOPES.map(scope => (
          <div key={scope} role="group" aria-label={t(`sidebarThreads.exportScopes.${scope}`)}>
            <p className="px-2 pt-1 text-xs font-medium text-[var(--bellum-text-muted)]">
              {t(`sidebarThreads.exportScopes.${scope}`)}
              <span className="font-normal"> — {t(`sidebarThreads.exportScopes.${scope}Hint`)}</span>
            </p>
            {HEADER_FORMATS.map(format => (
              <Button
                key={format}
                variant="ghost"
                size="sm"
                fullWidth
                className="justify-start pointer-coarse:min-h-11"
                aria-label={`${t(`sidebarThreads.exportScopes.${scope}`)} — ${t(`sidebarThreads.exportFormats.${format}`)}`}
                onClick={() => void run(format, scope)}
              >
                {t(`sidebarThreads.exportFormats.${format}`)}
              </Button>
            ))}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
