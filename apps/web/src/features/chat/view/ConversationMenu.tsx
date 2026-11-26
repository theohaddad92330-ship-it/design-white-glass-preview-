import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from '@bellum/ui'
import { ConversationSummaryContent } from './ConversationSummaryPanel'
import { ParticipantsContent } from './ParticipantsPanel'
import { DetailsContent } from './ConversationDetailsPanel'

type ConversationTab = 'summary' | 'access' | 'details'

/**
 * #3775.1 / #3775.3 — UN accès « Conversation » à la place de trois boutons
 * équivalents (Résumé, Participants, Détails) dans l'en-tête de `/chat`.
 *
 * Rien n'est retiré : chaque onglet rend le CONTENU du panneau qu'il remplace
 * (`ConversationSummaryContent`, `ParticipantsContent`, `DetailsContent` — les
 * mêmes composants, jamais une seconde copie : GA-26), avec les mêmes sources
 * et les mêmes contrôles d'accès. Regrouper ne fusionne aucune permission.
 *
 * · Le RÉSUMÉ n'est proposé qu'après un premier échange : avant, il serait vide,
 *   et un onglet vide n'est pas un passage obligatoire. Il se CONSULTE ; le
 *   geste « corriger » reste dans son contenu, comme avant.
 * · L'ACCÈS ouvre le menu : c'est la question que pose le plus souvent
 *   l'en-tête (« qui peut lire ce fil ? »), et elle a une place identifiable.
 * · Les DÉTAILS (propriétaire, branche, conservation légale, versions) ne se
 *   lisent que pour un fil enregistré.
 *
 * Aucun hook réseau n'est appelé avant l'ouverture : le contenu d'un
 * `PopoverContent` ne se monte qu'ouvert (même raison que les trois panneaux).
 */
export function ConversationMenu({
  accountId,
  conversationId,
  hasExchange,
  sources,
  mailboxRead,
}: {
  accountId: string | null
  conversationId: string | null
  /** Le fil a-t-il déjà une réponse de Laura ? Sinon aucun résumé n'est proposé. */
  hasExchange: boolean
  /** #1955.29 — les sources principales du fil (`mainThreadSources`), calculées par l'appelant. */
  sources: readonly { kind: string; label: string; replies: number }[]
  /** #5032.9 — Laura a lu un fil de la messagerie de ce lecteur dans ce fil. */
  mailboxRead?: boolean
}) {
  const { t } = useTranslation('chat')
  const [tab, setTab] = useState<ConversationTab>('access')

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* #5047 — LIGNE du menu ⋯ de l'en-tête (`ConversationHeaderMenu`) : libellé toujours visible, cible ≥ 44 px. */}
        <Button variant="ghost" size="sm" icon={Info} fullWidth className="justify-start pointer-coarse:min-h-11">
          {t('conversationMenu.action')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-3">
        <Tabs value={tab} onValueChange={value => setTab(value as ConversationTab)}>
          <TabsList aria-label={t('conversationMenu.title')} className="w-full">
            {hasExchange ? <TabsTrigger value="summary">{t('summary.action')}</TabsTrigger> : null}
            <TabsTrigger value="access">{t('conversationMenu.access')}</TabsTrigger>
            {conversationId ? <TabsTrigger value="details">{t('conversationObject.action')}</TabsTrigger> : null}
          </TabsList>
          {hasExchange ? (
            <TabsContent value="summary" className="space-y-3">
              <Text element="p" size="xs" weight="semibold">
                {t('summary.title')}
              </Text>
              <ConversationSummaryContent
                accountId={accountId}
                conversationId={conversationId}
                sources={sources}
                mailboxRead={mailboxRead}
              />
            </TabsContent>
          ) : null}
          <TabsContent value="access" className="space-y-2">
            <Text element="p" size="xs" weight="semibold">
              {t('participants.title')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('participants.notice')}
            </Text>
            <ParticipantsContent />
          </TabsContent>
          {conversationId ? (
            <TabsContent value="details" className="space-y-3">
              <Text element="p" size="xs" weight="semibold">
                {t('conversationObject.title')}
              </Text>
              <DetailsContent accountId={accountId} conversationId={conversationId} />
            </TabsContent>
          ) : null}
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
