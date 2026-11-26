import { Badge, Box, Button, CopyField, Text } from '@bellum/ui'
import { GUARDRAIL_ARCHIVE_EXCEPTION, GUARDRAIL_ITEMS } from '@bellum/contracts'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ShieldCheck, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { ApiKeysCard } from '@/features/api-keys/components/ApiKeysCard'
import { MCP_CONNECTIONS_KEY, MCP_SERVER_URL, mcpApi, type McpConnection } from '@/features/mcp/api'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { usePlanFeature } from '@/features/plan-features/usePlanFeature'
import {
  SETTINGS_ROW_CLASS,
  SettingsBlock,
  SettingsNote,
  SettingsPageHeader,
  SettingsStack,
} from '../components/SettingsBlocks'
import consentPreview from '@/assets/mcp-consent.gif'

/** External documentation link. */
function DocLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[var(--bellum-text-accent)] hover:underline"
    >
      {children}
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  )
}

/** A numbered, ordered step list. */
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <Box
            display="flex"
            rounded="full"
            className="mt-0.5 size-4 shrink-0 items-center justify-center bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
          >
            {i + 1}
          </Box>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug">
            {item}
          </Text>
        </li>
      ))}
    </ol>
  )
}

/** One MCP client's setup walkthrough. */
function ClientGuide({
  name,
  badge,
  steps,
  link,
}: {
  name: string
  badge?: string
  steps: ReactNode[]
  link?: ReactNode
}) {
  return (
    <Box className="space-y-2">
      <Box display="flex" className="items-center gap-2">
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {name}
        </Text>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </Box>
      <Steps items={steps} />
      {link && <Box className="pl-4 md:pl-6">{link}</Box>}
    </Box>
  )
}

/** Top card: what it is + the URL to copy. */
function ConnectCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  return (
    <SettingsBlock title={t('connectCardTitle')} description={t('connectCardDescription')}>
      <Box>
        <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]" className="mb-1.5">
          {t('connectCardUrlLabel')}
        </Text>
        <CopyField value={MCP_SERVER_URL ?? ''} />
      </Box>
    </SettingsBlock>
  )
}

/** Step-by-step guide per client. */
function SetupGuideCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  return (
    <SettingsBlock title={t('setupGuideTitle')}>
      <Box className="space-y-5">
        <Box>
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mb-2">
            {t('setupGuideConsentIntro')}
          </Text>
          <img
            src={consentPreview}
            alt={t('setupGuideConsentAlt')}
            className="w-full max-w-md rounded-lg border border-[var(--bellum-border)]"
          />
        </Box>

        <ClientGuide
          name="Claude Desktop"
          badge={t('claudeDesktopBadge')}
          steps={[
            <Trans key="1" t={t} i18nKey="claudeDesktopStep1" />,
            <Trans key="2" t={t} i18nKey="claudeDesktopStep2" />,
            t('claudeDesktopStep3'),
            <Trans key="4" t={t} i18nKey="claudeDesktopStep4" />,
            t('claudeDesktopStep5'),
          ]}
          link={<DocLink href="https://claude.ai/download">{t('claudeDesktopDownloadLink')}</DocLink>}
        />

        <Box className="h-px bg-[var(--bellum-border)]" />

        <ClientGuide
          name={t('claudeWebName')}
          steps={[<Trans key="1" t={t} i18nKey="claudeWebStep1" />, t('claudeWebStep2')]}
        />

        <Box className="h-px bg-[var(--bellum-border)]" />

        <ClientGuide
          name="Cursor"
          steps={[<Trans key="1" t={t} i18nKey="cursorStep1" />, <Trans key="2" t={t} i18nKey="cursorStep2" />]}
          link={<DocLink href="https://docs.cursor.com/context/model-context-protocol">{t('cursorDocLink')}</DocLink>}
        />

        <SettingsNote>{t('lockNote')}</SettingsNote>

        <DocLink href="https://modelcontextprotocol.io">{t('learnMoreLink')}</DocLink>
      </Box>
    </SettingsBlock>
  )
}

/** A few example prompts the rep can try. */
function ExamplePromptsCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  const prompts = [t('examplePrompt1'), t('examplePrompt2'), t('examplePrompt3'), t('examplePrompt4')]
  return (
    <SettingsBlock title={t('examplePromptsTitle')}>
      <ul className="space-y-1.5">
        {prompts.map(p => (
          <li key={p} className="flex items-start gap-2">
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              •
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug" className="italic">
              {t('examplePromptQuoted', { prompt: p })}
            </Text>
          </li>
        ))}
      </ul>
    </SettingsBlock>
  )
}

function ConnectionRow({
  connection,
  onRevoke,
  busy,
}: {
  connection: McpConnection
  onRevoke: () => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  const date = new Date(connection.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR')
  return (
    <Box display="flex" className={SETTINGS_ROW_CLASS}>
      <Box className="min-w-0">
        <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="truncate">
          {connection.client_name}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {t('connectionsAuthorizedOn', { date, scope: connection.scope })}
        </Text>
      </Box>
      <Box display="flex" className="shrink-0 items-center gap-2">
        <Badge variant="success">{t('connectionActive')}</Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRevoke}
          disabled={busy}
          aria-label={t('connectionsRevokeAria', { name: connection.client_name })}
          className="min-h-11"
        >
          <Trash2 aria-hidden className="size-4" />
          {t('connectionsRevoke')}
        </Button>
      </Box>
    </Box>
  )
}

function ConnectionsCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  const { t: tCommon } = useTranslation('common')
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: MCP_CONNECTIONS_KEY,
    queryFn: mcpApi.listConnections,
    enabled: !!user,
  })

  const revoke = async (id: string) => {
    setRevokingId(id)
    try {
      await mcpApi.revokeConnection(id)
      toast.success(t('connectionsRevokedToast'))
      queryClient.invalidateQueries({ queryKey: MCP_CONNECTIONS_KEY })
    } catch {
      toast.error(t('connectionsRevokeError'))
    } finally {
      setRevokingId(null)
    }
  }

  const connections = data ?? []

  return (
    <SettingsBlock
      title={connections.length > 0 ? t('connectionsCount', { count: connections.length }) : t('connectionsTitle')}
      description={t('connectionsSubtitle')}
      testId="mcp-connections"
    >
      {isLoading ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {tCommon('states.loading')}
        </Text>
      ) : connections.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('connectionsEmpty')}
        </Text>
      ) : (
        <Box>
          {connections.map(c => (
            <ConnectionRow key={c.id} connection={c} onRevoke={() => revoke(c.id)} busy={revokingId === c.id} />
          ))}
        </Box>
      )}
    </SettingsBlock>
  )
}

/**
 * #3424 lot G03 (30/09) — retour bêta : les garde-fous injectés dans le
 * serveur MCP (`apps/mcp/src/guardrails.ts`) n'étaient visibles nulle part à
 * l'écran. Même liste, même fichier source (`@bellum/contracts`, GA-26) —
 * affichée ici pour que le commercial VOIE ce qui est refusé avant de
 * brancher son propre assistant.
 */
export function GuardrailsCard() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  return (
    <SettingsBlock title={t('guardrailsTitle')} description={t('guardrailsSubtitle')}>
      {/* `.bo11-checks` : une ligne par garde-fou, l'icône d'accent — en lecture, deux colonnes sur bureau. */}
      <ul className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
        {GUARDRAIL_ITEMS.map(item => (
          <li key={item} className="flex items-start gap-2.5 border-b border-[var(--bellum-border)] py-2.5">
            <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" leading="snug">
              {item}
            </Text>
          </li>
        ))}
      </ul>
      <SettingsNote className="mt-4">{t('guardrailsArchiveNote')}</SettingsNote>
    </SettingsBlock>
  )
}

export function AiAssistantView() {
  const { t } = useTranslation('settings', { keyPrefix: 'aiAssistant' })
  const { t: tHub } = useTranslation('settingsHub')
  const { t: tCommon } = useTranslation('common')
  // Gating par offre : brancher son assistant IA sur Bellum est une feature de
  // palier. Distinct du cas « serveur MCP non déployé » ci-dessous — l'un dit
  // « pas encore chez nous », l'autre « pas dans votre offre ».
  const mcp = usePlanFeature('mcp_assistant')
  return (
    <Box className="w-full">
      <SettingsPageHeader eyebrow={tHub('eyebrow.space')} title={t('headerTitle')} description={t('headerSubtitle')} />

      {MCP_SERVER_URL && !mcp.allowed ? (
        <SettingsStack>
          <SettingsBlock>
            <PlanFeatureLocked feature="mcp_assistant" compact />
          </SettingsBlock>
          {/* Les clés d'API sont une autre porte que l'assistant MCP : elles restent atteignables ici même sans lui. */}
          <ApiKeysCard />
        </SettingsStack>
      ) : MCP_SERVER_URL ? (
        // Deux colonnes dès `xl` : cette page est surtout de la prose (un guide
        // pas-à-pas, des exemples de prompts). Étirée sur toute la largeur d'un
        // grand écran, une ligne dépasserait les 200 caractères et deviendrait
        // pénible à lire. La largeur sert donc à mettre les cartes côte à côte,
        // pas à allonger les lignes.
        // Maquette settings-outils : UNE colonne de blocs — les accès réels, révocables ; le cadre d'un nouvel accès
        // (l'adresse du serveur) ; les garde-fous. Le guide de connexion et les exemples suivent (gardés hors maquette).
        <SettingsStack testId="mcp-blocks">
          <ConnectionsCard />
          <ConnectCard />
          {/* Arbitrage Louis 24/10 : les clés d'API quittent Intégrations (maquette) et vivent ICI, un seul endroit. */}
          <ApiKeysCard />
          <GuardrailsCard />
          <SetupGuideCard />
          <ExamplePromptsCard />
        </SettingsStack>
      ) : (
        <SettingsStack>
          <SettingsBlock
            title={t('headerTitle')}
            description={t('gatedDescription')}
            action={
              <Badge variant="warning" className="text-xs">
                {tCommon('states.comingSoon')}
              </Badge>
            }
          >
            <Box />
          </SettingsBlock>
          <ApiKeysCard />
        </SettingsStack>
      )}
    </Box>
  )
}
