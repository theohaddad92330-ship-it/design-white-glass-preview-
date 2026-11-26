import { resolveSalesforceLoginUrl, type ConnectedTool } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import {
  BookOpen,
  Bot,
  Boxes,
  Calendar,
  CalendarClock,
  Chrome,
  Cloud,
  Database,
  Download,
  FileEdit,
  FileText,
  Hash,
  LayoutGrid,
  Mail,
  MailOpen,
  MessageCircle,
  MessagesSquare,
  MessageSquare,
  Search,
  Send,
  Users,
  Webhook,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { attioApi } from '@/features/attio/api'
import { ATTIO_STATUS_KEY, useAttioStatus } from '@/features/attio/hooks/useAttioStatus'
import { crmApi, type CrmCapabilities } from '@/features/crm/api'
import { useScopeGapIsAppSide } from '../../api'
import { CRM_STATUS_KEY, useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { useIntegrations } from '@/features/integrations/hooks/useIntegrations'
import type { IntegrationProvider } from '@/features/integrations/api'
import { microsoftApi, type MicrosoftCapabilities } from '@/features/microsoft/api'
import { MICROSOFT_STATUS_KEY, useMicrosoftStatus } from '@/features/microsoft/hooks/useMicrosoftStatus'
import { notionApi, type NotionPage } from '@/features/notion/api'
import { NOTION_STATUS_KEY, useNotionStatus } from '@/features/notion/hooks/useNotionStatus'
import { pipedriveApi } from '@/features/pipedrive/api'
import { PIPEDRIVE_STATUS_KEY, usePipedriveStatus } from '@/features/pipedrive/hooks/usePipedriveStatus'
import { zohoApi } from '@/features/zoho/api'
import { ZOHO_STATUS_KEY, useZohoStatus } from '@/features/zoho/hooks/useZohoStatus'
import { salesforceApi } from '@/features/salesforce/api'
import { SALESFORCE_STATUS_KEY, useSalesforceStatus } from '@/features/salesforce/hooks/useSalesforceStatus'
import { clearConnectorFailure, useConnectorFailure } from '../../lib/connector-callback-failure'
import type { ConnectorId } from '../../lib/connectors'
import type { ConnectorCardProps } from './connector-card-map'
import { CrmReadScope } from './CrmReadScope'
import { CapabilityGrid, someCapabilityMissing, type CapabilityRow } from './CapabilityGrid'
import { ConnectorDiagnostics } from './ConnectorDiagnostics'
import { CardShell, ConnectedBadge, NotIncludedBadge, ReconnectBadge } from './CardShell'
import { ConnectorBenefits } from './ConnectorBenefits'
import { CrmReadScopeNote } from './CrmReadScopeNote'
import { MicrosoftMailboxes } from './MicrosoftMailboxes'
import { hasConnectorDetails } from './connector-benefits'
import { CONNECTOR_ICONS } from './connector-icons'
import { OAuthProviderCard } from './OAuthProviderCard'
import { SalesforceDomainField } from './SalesforceDomainField'
import { WebhookBackedCard } from './WebhookBackedCard'
import { ConnectorSyncStatus } from '../ConnectorSyncStatus'

/**
 * Le diagnostic par capacité, pour toutes les lignes de registre d'une carte.
 *
 * Une carte peut en porter plusieurs — « Google Workspace » couvre Gmail,
 * l'agenda et les documents, chacun avec ses propres portées. C'est justement ce
 * grain-là que l'écran ne montrait pas : « Google : connecté » restait vrai
 * pendant que la recherche documentaire rendait une liste vide.
 */
function Diagnostics({ tools, hideLastSync = false }: { tools?: readonly ConnectedTool[]; hideLastSync?: boolean }) {
  if (!tools || tools.length === 0) return null
  return (
    <>
      {tools.map(tool => (
        <ConnectorDiagnostics key={tool.provider} tool={tool} hideLastSync={hideLastSync} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  CRM + suite bureautique (OAuth)                                    */
/* ------------------------------------------------------------------ */

const CRM_CAP_ROWS: CapabilityRow<keyof CrmCapabilities & string>[] = [
  { key: 'contactsRead', icon: Users, labelKey: 'crmCap.contactsRead' },
  { key: 'contactsWrite', icon: Download, labelKey: 'crmCap.contactsWrite' },
  { key: 'companiesRead', icon: Boxes, labelKey: 'crmCap.companiesRead' },
  { key: 'dealsRead', icon: Workflow, labelKey: 'crmCap.dealsRead' },
  { key: 'tasksWrite', icon: CalendarClock, labelKey: 'crmCap.tasksWrite' },
  { key: 'meetingsWrite', icon: Calendar, labelKey: 'crmCap.meetingsWrite' },
  // #1934.18 — la seule capacité d'écriture qui touche le PIPELINE. Elle se
  // montre parce qu'un portail branché avant le 16/09/2026 ne l'a pas accordée :
  // sans cette ligne, la validation d'une proposition de stade échouerait au
  // bout, sans que rien n'ait dit pourquoi.
  { key: 'dealsWrite', icon: Workflow, labelKey: 'crmCap.dealsWrite' },
]

export function HubSpotCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useCrmStatus()
  const [reconnecting, setReconnecting] = useState(false)
  const missingCapability = someCapabilityMissing(data?.connected, data?.capabilities, CRM_CAP_ROWS)
  const appSide = useScopeGapIsAppSide('hubspot', missingCapability)

  const reconnect = async () => {
    setReconnecting(true)
    try {
      const { url } = await crmApi.connectUrl()
      window.location.href = url
    } catch {
      toast.error(t('providerConnectError', { name: 'HubSpot' }))
      setReconnecting(false)
    }
  }

  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.hubspot}
      connector="hubspot"
      name="HubSpot"
      description={t('hubspotDescription')}
      api={crmApi}
      statusKey={CRM_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('hubspotAccountFallback')}
    >
      {/* Le rapport de pipeline et les contacts dormants exigent des portées que
          les portails branchés avant leur ajout n'ont jamais accordées. Les
          montrer ici est la seule façon d'expliquer, sans lire les journaux,
          pourquoi ces deux écrans restaient vides. */}
      <CapabilityGrid
        rows={CRM_CAP_ROWS}
        capabilities={data?.capabilities}
        labelOf={t}
        hint={t('capabilityReconnectHint')}
        ctaLabel={t('googleReconnect')}
        onReconnect={reconnect}
        reconnecting={reconnecting}
        showReconnect={missingCapability}
        appSideHint={appSide ? t('capabilityAppSideHint', { name: 'HubSpot' }) : undefined}
      />
      {/* #4189.8 — l'APPELANT qui manquait : la note de périmètre (et, en salle, le conflit « Lu : … »)
          ne se rendait que sur les quatre autres CRM. */}
      <CrmReadScope
        connector="hubspot"
        connected={data?.connected === true}
        authExpired={state === 'action_required'}
      />
      <Diagnostics tools={tools} hideLastSync />
      <ConnectorSyncStatus provider="hubspot" name="HubSpot" tools={tools} />
    </OAuthProviderCard>
  )
}

export function SalesforceCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useSalesforceStatus()
  // #4431 — le domaine de l'organisation et la case sandbox, lus au moment de connecter.
  const [domain, setDomain] = useState('')
  const [sandbox, setSandbox] = useState(false)
  const [domainError, setDomainError] = useState<'invalid' | 'host_not_allowed' | null>(null)
  const refusal = useConnectorFailure('salesforce')
  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.salesforce}
      connector="salesforce"
      name="Salesforce"
      description={t('salesforceDescription')}
      api={{
        connectUrl: () => {
          // La même règle que l'API (`resolveSalesforceLoginUrl`) : le refus s'affiche sous le champ avant tout appel.
          const resolved = resolveSalesforceLoginUrl(domain, sandbox)
          if (!resolved.ok) {
            setDomainError(resolved.reason)
            return Promise.reject(new Error(resolved.reason))
          }
          setDomainError(null)
          clearConnectorFailure('salesforce')
          return salesforceApi.connectUrl({ domain, sandbox })
        },
        disconnect: () => salesforceApi.disconnect(),
      }}
      statusKey={SALESFORCE_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('salesforceAccountFallback')}
      connectOptions={
        <SalesforceDomainField
          domain={domain}
          onDomainChange={value => {
            setDomain(value)
            setDomainError(null)
          }}
          sandbox={sandbox}
          onSandboxChange={setSandbox}
          error={domainError}
          refusal={refusal}
        />
      }
    >
      {/* #3918.3 — ce qui est lu pour la veille, et ce qui reste hors périmètre. */}
      <CrmReadScope
        connector="salesforce"
        connected={data?.connected === true}
        authExpired={state === 'action_required'}
      />
      <Diagnostics tools={tools} hideLastSync />
      <ConnectorSyncStatus provider="salesforce" name="Salesforce" tools={tools} />
    </OAuthProviderCard>
  )
}

export function PipedriveCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = usePipedriveStatus()
  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.pipedrive}
      connector="pipedrive"
      name="Pipedrive"
      description={t('pipedriveDescription')}
      api={pipedriveApi}
      statusKey={PIPEDRIVE_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('pipedriveAccountFallback')}
    >
      {/* #3918.3 — rien n'est lu pour la veille : la mention le dit, avec sa raison. */}
      <CrmReadScope
        connector="pipedrive"
        connected={data?.connected === true}
        authExpired={state === 'action_required'}
      />
      <Diagnostics tools={tools} hideLastSync />
      <ConnectorSyncStatus provider="pipedrive" name="Pipedrive" tools={tools} />
    </OAuthProviderCard>
  )
}

export function ZohoCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useZohoStatus()
  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.zoho}
      connector="zoho"
      name="Zoho CRM"
      description={t('zohoDescription')}
      api={zohoApi}
      statusKey={ZOHO_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('zohoAccountFallback')}
    >
      {/* « connecté » ne s'affiche qu'après la lecture réussie du serveur (le rappel OAuth la fait avant de poser le lien). */}
      <CrmReadScope connector="zoho" connected={data?.connected === true} authExpired={state === 'action_required'} />
      <Diagnostics tools={tools} hideLastSync />
      <ConnectorSyncStatus provider="zoho" name="Zoho CRM" tools={tools} />
    </OAuthProviderCard>
  )
}

export function AttioCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useAttioStatus()
  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      // #1447 — `Boxes` était portée par DEUX cartes de la même section :
      // le choix vit désormais dans UNE table, et une garde tient son unicité.
      icon={CONNECTOR_ICONS.attio}
      connector="attio"
      name="Attio"
      description={t('attioDescription')}
      api={attioApi}
      statusKey={ATTIO_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('attioAccountFallback')}
    >
      {/* #4189 — ce qui est lu, la date de dernière synchro, les fiches en conflit. */}
      <CrmReadScope connector="attio" connected={data?.connected === true} authExpired={state === 'action_required'} />
      <Diagnostics tools={tools} hideLastSync />
      <ConnectorSyncStatus provider="attio" name="Attio" tools={tools} />
    </OAuthProviderCard>
  )
}

const MICROSOFT_CAP_ROWS: CapabilityRow<keyof MicrosoftCapabilities & string>[] = [
  { key: 'mailSend', icon: Send, labelKey: 'microsoftCap.mailSend' },
  { key: 'mailRead', icon: MailOpen, labelKey: 'microsoftCap.mailRead' },
  { key: 'mailDraft', icon: FileEdit, labelKey: 'microsoftCap.mailDraft' },
  { key: 'calendar', icon: Calendar, labelKey: 'microsoftCap.calendar' },
  { key: 'files', icon: FileText, labelKey: 'microsoftCap.files' },
]

export function Microsoft365Card({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useMicrosoftStatus()
  const [reconnecting, setReconnecting] = useState(false)
  const missingCapability = someCapabilityMissing(data?.connected, data?.capabilities, MICROSOFT_CAP_ROWS)
  const appSide = useScopeGapIsAppSide('microsoft', missingCapability)

  const reconnect = async () => {
    setReconnecting(true)
    try {
      const { url } = await microsoftApi.connectUrl()
      window.location.href = url
    } catch {
      toast.error(t('providerConnectError', { name: 'Microsoft 365' }))
      setReconnecting(false)
    }
  }

  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.microsoft}
      connector="microsoft"
      name="Microsoft 365"
      description={t('microsoft365Description')}
      api={microsoftApi}
      statusKey={MICROSOFT_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('microsoft365AccountFallback')}
    >
      <CapabilityGrid
        rows={MICROSOFT_CAP_ROWS}
        capabilities={data?.capabilities}
        labelOf={t}
        hint={t('capabilityReconnectHint')}
        ctaLabel={t('googleReconnect')}
        onReconnect={reconnect}
        reconnecting={reconnecting}
        showReconnect={missingCapability}
        appSideHint={appSide ? t('capabilityAppSideHint', { name: 'Microsoft 365' }) : undefined}
      />
      {/* #4546.4 — les boîtes Outlook branchées, « en ajouter une » et le débranchement d'UNE boîte. */}
      {data?.connected ? <MicrosoftMailboxes onAdd={() => void reconnect()} adding={reconnecting} /> : null}
      <Diagnostics tools={tools} />
      <ConnectorSyncStatus provider="microsoft" name="Microsoft 365" tools={tools} />
    </OAuthProviderCard>
  )
}

export function NotionCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data, isLoading } = useNotionStatus()
  const [busy, setBusy] = useState(false)
  const [pages, setPages] = useState<NotionPage[] | null>(null)
  const [ingestingId, setIngestingId] = useState<string | null>(null)

  const loadPages = async () => {
    setBusy(true)
    try {
      setPages(await notionApi.pages())
    } catch {
      toast.error(t('notionLoadPagesError'))
    } finally {
      setBusy(false)
    }
  }

  const ingest = async (page: NotionPage) => {
    setIngestingId(page.id)
    try {
      await notionApi.ingest({ pageId: page.id, title: page.title, category: 'Notion' })
      toast.success(t('notionIngestedToast', { title: page.title }))
    } catch {
      toast.error(t('notionIngestError'))
    } finally {
      setIngestingId(null)
    }
  }

  return (
    <OAuthProviderCard
      state={state}
      tools={tools}
      icon={CONNECTOR_ICONS.notion}
      connector="notion"
      name="Notion"
      description={t('notionDescription')}
      api={notionApi}
      statusKey={NOTION_STATUS_KEY}
      status={data}
      isLoading={isLoading}
      accountFallback={t('notionAccountFallback')}
    >
      <Box className="space-y-2">
        <Button variant="secondary" size="sm" icon={Search} isLoading={busy} onClick={loadPages}>
          {t('notionBrowsePages')}
        </Button>
        {pages && <NotionPageList pages={pages} ingestingId={ingestingId} onIngest={ingest} />}
      </Box>
      <Diagnostics tools={tools} />
      <ConnectorSyncStatus provider="notion" name="Notion" tools={tools} />
    </OAuthProviderCard>
  )
}

function NotionPageList({
  pages,
  ingestingId,
  onIngest,
}: {
  pages: NotionPage[]
  ingestingId: string | null
  onIngest: (page: NotionPage) => void
}) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  if (pages.length === 0) {
    return (
      <Text size="xs" color="text-[var(--text-ghost)]">
        {t('notionEmptyPages')}
      </Text>
    )
  }
  return (
    <Box className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--bellum-border)] p-1.5">
      {pages.map(page => (
        <Box
          key={page.id}
          display="flex"
          className="items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bellum-surface-2)]"
        >
          <FileText className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" />
          <Text size="xs" className="min-w-0 flex-1 truncate">
            {page.title}
          </Text>
          <Button
            variant="ghost"
            size="xs"
            icon={Download}
            isLoading={ingestingId === page.id}
            disabled={ingestingId !== null}
            onClick={() => onIngest(page)}
          >
            {t('notionIngest')}
          </Button>
        </Box>
      ))}
    </Box>
  )
}

/* ------------------------------------------------------------------ */
/*  Canaux d'équipe (webhooks)                                         */
/* ------------------------------------------------------------------ */

// Client-side pre-validation mirrors the API's provider host rules (anti-SSRF
// pinning is enforced server-side too, in `integration-providers.ts`).
const SLACK_URL_RE = /^https:\/\/hooks\.slack\.com\//
const DISCORD_URL_RE = /^https:\/\/(canary\.|ptb\.)?(discord|discordapp)\.com\/api\/(v\d+\/)?webhooks\//
const TEAMS_URL_RE = /^https:\/\/([a-z0-9-]+\.)*(webhook\.office\.com|outlook\.office\.com|logic\.azure\.com)(:\d+)?\//i
const GCHAT_URL_RE = /^https:\/\/chat\.googleapis\.com\//
const MATTERMOST_URL_RE = /^https:\/\/[^/]+\/hooks\/[A-Za-z0-9]+/
const HTTPS_URL_RE = /^https:\/\/.+/

/** La définition d'un canal : tout ce qui varie d'un webhook à l'autre. */
const WEBHOOK_CHANNELS: Record<
  string,
  {
    icon: LucideIcon
    /** #1614 — la clé du logo. Elle vaut la clé du canal, mais elle est ÉCRITE :
     *  un canal ajouté sans elle ne compile pas, là où un `as ConnectorId` sur
     *  la clé de l'objet aurait accepté n'importe quoi. */
    connector: ConnectorId
    name: string
    nameKey?: string
    placeholderKey?: string
    placeholder?: string
    validate: (u: string) => boolean
  }
> = {
  slack: {
    icon: CONNECTOR_ICONS.slack,
    connector: 'slack',
    name: 'Slack',
    placeholder: 'https://hooks.slack.com/services/T00000000/B00000000/xxxxxxxx',
    validate: u => SLACK_URL_RE.test(u),
  },
  discord: {
    icon: CONNECTOR_ICONS.discord,
    connector: 'discord',
    name: 'Discord',
    placeholder: 'https://discord.com/api/webhooks/000000000/xxxxxxxx',
    validate: u => DISCORD_URL_RE.test(u),
  },
  teams: {
    icon: CONNECTOR_ICONS.teams,
    connector: 'teams',
    name: 'Microsoft Teams',
    placeholderKey: 'teamsPlaceholder',
    validate: u => TEAMS_URL_RE.test(u),
  },
  googlechat: {
    icon: CONNECTOR_ICONS.googlechat,
    connector: 'googlechat',
    name: 'Google Chat',
    placeholder: 'https://chat.googleapis.com/v1/spaces/AAAA/messages?key=…&token=…',
    validate: u => GCHAT_URL_RE.test(u),
  },
  mattermost: {
    // #1447 — même défaut qu'Odoo/Attio, une section plus bas :
    // `MessageCircle` était portée par deux canaux voisins.
    icon: CONNECTOR_ICONS.mattermost,
    connector: 'mattermost',
    name: 'Mattermost',
    placeholderKey: 'mattermostPlaceholder',
    validate: u => MATTERMOST_URL_RE.test(u),
  },
  webhook: {
    icon: CONNECTOR_ICONS.webhook,
    connector: 'webhook',
    name: '',
    nameKey: 'webhookGenericLabel',
    placeholderKey: 'webhookGenericPlaceholder',
    validate: u => HTTPS_URL_RE.test(u),
  },
}

function ChannelCard({ provider, tools }: { provider: IntegrationProvider } & ConnectorCardProps) {
  const { t } = useTranslation('settings', { keyPrefix: 'integrations' })
  const { data: integrations } = useIntegrations()
  const def = WEBHOOK_CHANNELS[provider]
  if (!def) return null
  const descriptionKey = provider === 'webhook' ? 'webhookGenericDescription' : `${provider}Description`
  const helperKey = provider === 'webhook' ? 'webhookGenericHelper' : `${provider}Helper`
  return (
    <WebhookBackedCard
      provider={provider}
      icon={def.icon}
      connector={def.connector}
      name={def.nameKey ? t(def.nameKey) : def.name}
      description={t(descriptionKey)}
      placeholder={def.placeholderKey ? t(def.placeholderKey) : (def.placeholder ?? '')}
      helper={t(helperKey)}
      status={integrations?.find(i => i.provider === provider)}
      validate={def.validate}
      // #1443 — les six canaux JETAIENT leurs props : la carte ne recevait ni
      // `state` ni `tools`, donc la seule action que le registre autorise sur un
      // webhook n'atteignait pas l'écran.
      tools={tools}
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Assistant IA (MCP) — la connexion se fait depuis son propre écran  */
/* ------------------------------------------------------------------ */

/**
 * L'assistant IA n'a pas de bouton ici : le brancher demande de copier une URL
 * dans un autre logiciel puis de valider un consentement, et sa page porte aussi
 * la révocation. Une carte qui ouvre l'écran dédié vaut mieux qu'un formulaire
 * tronqué — mais l'absence de carte le rendait introuvable.
 *
 * ⚠️ Recette live du 27/08/2026 : l'en-tête annonçait « 6 branchés » au-dessus
 * de **cinq** badges « Connecté ». Cette carte était la seule à JETER son
 * `state` — un consentement d'assistant actif comptait donc au dénominateur de
 * l'écran sans qu'aucune carte ne le montre, et l'utilisateur cherchait le
 * sixième outil pendant que le compteur avait raison. Un compteur et une liste
 * doivent lire la MÊME chose : `state` vient du registre serveur, comme le
 * compteur.
 */
export function McpCard({ state, tools }: ConnectorCardProps) {
  const { t } = useTranslation('integrationCenter')
  return (
    <CardShell
      icon={CONNECTOR_ICONS.mcp}
      name={t('mcp.name')}
      description={t('mcp.description')}
      badge={
        state === 'action_required' ? (
          <ReconnectBadge />
        ) : state === 'connected' ? (
          <ConnectedBadge />
        ) : state === 'not_included_in_plan' ? (
          <NotIncludedBadge />
        ) : undefined
      }
      /* #1442 — même règle que les autres cartes : déplié une fois branché. */
      expanded={state !== 'available'}
      details={
        !hasConnectorDetails(tools) ? undefined : (
          <>
            {/* #1443 — ce que le registre autorise depuis l'assistant, et #1444 —
                ses capacités, leur état et leur dernière preuve datée. Cette carte
                recevait `tools` et n'en montrait rien. */}
            <ConnectorBenefits tools={tools} />
            <Diagnostics tools={tools} />
          </>
        )
      }
    >
      <Box display="flex" className="justify-end">
        <Button size="sm" variant="outline" asChild>
          <Link to="/settings/mcp">{state === 'connected' ? t('mcp.manage') : t('mcp.open')}</Link>
        </Button>
      </Box>
    </CardShell>
  )
}

/* Les six canaux ne diffèrent que par leur fournisseur : des composants nommés
   plutôt que des fermetures anonymes, pour que le rechargement à chaud sache
   les distinguer. Ils passent désormais `tools` — la carte n'avait aucun moyen
   de dire ce que le registre l'autorise à faire (#1443). */
export function SlackCard(props: ConnectorCardProps) {
  return <ChannelCard provider="slack" {...props} />
}
export function DiscordCard(props: ConnectorCardProps) {
  return <ChannelCard provider="discord" {...props} />
}
export function TeamsCard(props: ConnectorCardProps) {
  return <ChannelCard provider="teams" {...props} />
}
export function GoogleChatCard(props: ConnectorCardProps) {
  return <ChannelCard provider="googlechat" {...props} />
}
export function MattermostCard(props: ConnectorCardProps) {
  return <ChannelCard provider="mattermost" {...props} />
}
export function GenericWebhookCard(props: ConnectorCardProps) {
  return <ChannelCard provider="webhook" {...props} />
}
