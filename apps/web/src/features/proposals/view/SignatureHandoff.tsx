import type { AdminDocsProvider } from '@bellum/contracts'
import { Button, Card, Text } from '@bellum/ui'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAdminDocsSignatures, useAdminDocsStatus, useProposalSignatureStatus } from '@/features/admin-docs/api'

/**
 * #4016 L12 (Louis 15/10/2026) — E-SIGNATURE : Bellum PRÉPARE le document, le client SIGNE dans son outil.
 *
 * Aucune demande de signature n'est créée depuis Bellum (le contrat d'API de création n'est pas vérifiable,
 * et un document à valeur légale n'est pas composé par un outil qui n'en porte pas la responsabilité) :
 * on OUVRE l'outil de signature que l'espace a branché, par lien. Le statut « signé » ne se lit que si
 * un outil est connecté ; sinon il est dit NON LU — jamais présumé, jamais « en attente » inventé.
 */
const SIGNATURE_TOOL_URL: Partial<Record<AdminDocsProvider, string>> = {
  yousign: 'https://app.yousign.com/',
  docusign: 'https://app.docusign.com/',
}

const SIGNATURE_PROVIDERS = Object.keys(SIGNATURE_TOOL_URL) as AdminDocsProvider[]

export function SignatureHandoff({ projectId }: { projectId?: string }) {
  const { t } = useTranslation('proposals')
  const { data, isLoading } = useAdminDocsStatus()
  // #4016.121 — armée à la main : rien n'est lu chez l'outil avant le clic (zéro appel réseau sinon).
  const reading = useAdminDocsSignatures(false)
  // #4295.27 — avec une proposition : le statut de SA demande (identifiant retenu à l'envoi), pas la liste du compte.
  const proposal = useProposalSignatureStatus(projectId)
  if (isLoading) return null
  const tools = SIGNATURE_PROVIDERS.filter(provider => data?.connected?.includes(provider))
  const read = reading.data
  const unread = read?.unavailable ?? []

  return (
    <Card className="flex flex-col gap-2 p-4" data-testid="signature-handoff">
      <Text size="base" weight="semibold" element="h2">
        {t('signature.title')}
      </Text>
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('signature.prepared')}
      </Text>
      {tools.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            {/* GA-44 — l'écran nomme la capacité, pas l'éditeur : un seul libellé, un lien par outil branché. */}
            {tools.map(provider => (
              <Button key={provider} asChild variant="outline" size="sm">
                <a href={SIGNATURE_TOOL_URL[provider]} target="_blank" rel="noopener noreferrer">
                  {t('signature.open')}
                  <ExternalLink aria-hidden="true" className="ml-1.5 size-3.5" />
                </a>
              </Button>
            ))}
          </div>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('signature.statusConnected')}
          </Text>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={reading.isFetching || proposal.isFetching}
              onClick={() => void (projectId ? proposal.refetch() : reading.refetch())}
            >
              <RefreshCw aria-hidden="true" className="mr-1.5 size-3.5" />
              {t('signature.reread')}
            </Button>
          </div>
          {projectId ? (
            proposal.isError ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signature-reading">
                {t('signature.rereadError')}
              </Text>
            ) : proposal.data ? (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signature-reading">
                {t(`signature.proposal.${proposal.data.state}`, { count: proposal.data.daysWaiting ?? undefined })}
              </Text>
            ) : null
          ) : reading.isError ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signature-reading">
              {t('signature.rereadError')}
            </Text>
          ) : read ? (
            <div data-testid="signature-reading" className="flex flex-col gap-1">
              {unread.length > 0 ? (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('signature.rereadNotRead')}
                </Text>
              ) : read.items.length === 0 ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('signature.rereadNonePending')}
                </Text>
              ) : (
                <>
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t('signature.rereadPending', { count: read.items.length })}
                  </Text>
                  <ul className="list-disc pl-5 text-xs text-[var(--bellum-text-secondary)]">
                    {read.items.map(item => (
                      <li key={item.id}>
                        {[item.title, item.signer].filter(Boolean).join(' — ') || item.id}
                        {item.daysWaiting !== null
                          ? ` · ${t('signature.rereadDays', { count: item.daysWaiting })}`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
        </>
      ) : (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" data-testid="signature-not-read">
          {t('signature.statusNotRead')}
        </Text>
      )}
    </Card>
  )
}
