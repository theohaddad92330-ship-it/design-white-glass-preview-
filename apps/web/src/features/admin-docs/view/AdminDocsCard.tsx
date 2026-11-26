import type { AdminDocsProvider, PendingSignature, UnpaidInvoice } from '@bellum/contracts'
import { Badge, Box, Button, FilterChips, Input, Label, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAdminDocsInvoices,
  useAdminDocsSignatures,
  useAdminDocsStatus,
  useConnectAdminDocs,
  useDisconnectAdminDocs,
} from '../api'

const PROVIDERS: readonly AdminDocsProvider[] = ['yousign', 'docusign', 'qonto', 'tiime']

/** Les fournisseurs qui demandent un second secret. Les autres n'affichent pas
 *  le champ : un champ facultatif non expliqué se remplit au hasard. */
const NEEDS_SECRET: ReadonlySet<AdminDocsProvider> = new Set<AdminDocsProvider>(['docusign'])

/** Ceux dont le contrat d'API n'est pas public : l'URL doit rester surchargeable
 *  sans redéploiement, exactement comme `BOONDMANAGER_SEARCH_PARAM`. */
const ALLOWS_BASE_URL: ReadonlySet<AdminDocsProvider> = new Set<AdminDocsProvider>(['docusign', 'tiime'])

/**
 * La carte « Signature & facturation ».
 *
 * Le module serveur existait depuis le 03/08 sans écran : personne ne pouvait
 * déposer ses identifiants, donc quatre connecteurs étaient livrés et morts.
 *
 * Ce que la carte dit avant la saisie, et qui n'est pas décoratif : **Bellum ne
 * signe rien et ne paie rien**. Il lit ce qui attend et déclenche l'envoi d'une
 * demande DÉJÀ préparée et relue chez le fournisseur. Un doute sur ce point est
 * exactement ce qui empêche une ESN de brancher son outil de signature.
 */
export function AdminDocsCard() {
  const { t } = useTranslation('integrations')
  const { data: status } = useAdminDocsStatus()
  const connect = useConnectAdminDocs()
  const disconnect = useDisconnectAdminDocs()

  const [provider, setProvider] = useState<AdminDocsProvider>('yousign')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  const connected = status?.connected ?? []
  // Rien de branché ⇒ aucune lecture. Une liste vide rendue par le serveur
  // s'écrirait « rien n'attend de signature » là où la vérité est « tu n'as rien
  // branché » : ce sont deux phrases différentes.
  const hasConnection = connected.length > 0
  const signatures = useAdminDocsSignatures(hasConnection)
  const invoices = useAdminDocsInvoices(hasConnection)
  const canSubmit = apiKey.trim().length >= 8 && (!NEEDS_SECRET.has(provider) || apiSecret.trim().length >= 8)

  const submit = () => {
    connect.mutate({
      provider,
      apiKey: apiKey.trim(),
      ...(apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {}),
      ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
    })
    setApiKey('')
    setApiSecret('')
  }

  return (
    <Box className="space-y-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="space-y-1">
        <Text weight="medium">{t('adminDocs.title')}</Text>
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('adminDocs.description')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('adminDocs.readOnlyNotice')}
        </Text>
      </Box>

      {connected.length > 0 ? (
        <Box className="flex flex-wrap items-center gap-2">
          {connected.map(p => (
            <Badge key={p} variant="outline" className="gap-2 text-xs">
              {t(`adminDocs.providers.${p}`)}
              <button
                type="button"
                className="text-[var(--bellum-text-secondary)] underline"
                disabled={disconnect.isPending}
                onClick={() => disconnect.mutate(p)}
              >
                {t('adminDocs.disconnect')}
              </button>
            </Badge>
          ))}
        </Box>
      ) : null}

      {/* Ce que la connexion RAPPORTE. Sans ce bloc, la carte annonçait une
          capacité muette : deux routes de lecture servies et jamais appelées. */}
      {hasConnection ? (
        <Box className="space-y-3 border-t border-[var(--bellum-border)] pt-3" data-testid="admin-docs-readings">
          <ReadingSection
            kind="signatures"
            isLoading={signatures.isLoading}
            isError={signatures.isError}
            unavailable={signatures.data?.unavailable ?? []}
            // `null` quand rien n'est encore revenu — surtout PAS `0`, qui se
            // lirait « rien n'attend de signature » avant même la réponse.
            count={signatures.data ? signatures.data.items.length : null}
          >
            {(signatures.data?.items ?? []).map(item => (
              <SignatureRow key={`${item.provider}-${item.id}`} signature={item} />
            ))}
          </ReadingSection>

          <ReadingSection
            kind="invoices"
            isLoading={invoices.isLoading}
            isError={invoices.isError}
            unavailable={invoices.data?.unavailable ?? []}
            count={invoices.data ? invoices.data.items.length : null}
          >
            {(invoices.data?.items ?? []).map(item => (
              <InvoiceRow key={`${item.provider}-${item.id}`} invoice={item} />
            ))}
          </ReadingSection>
        </Box>
      ) : null}

      <FilterChips
        ariaLabel={t('adminDocs.providersAria')}
        options={PROVIDERS.map(p => ({ value: p, label: t(`adminDocs.providers.${p}`) }))}
        value={provider}
        onChange={next => next && setProvider(next)}
      />

      <Box className="space-y-1.5">
        <Label htmlFor="admin-docs-key">{t('adminDocs.apiKey')}</Label>
        <Input
          id="admin-docs-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={event => setApiKey(event.target.value)}
        />
      </Box>

      {NEEDS_SECRET.has(provider) ? (
        <Box className="space-y-1.5">
          <Label htmlFor="admin-docs-secret">{t('adminDocs.apiSecret')}</Label>
          <Input
            id="admin-docs-secret"
            type="password"
            autoComplete="off"
            value={apiSecret}
            onChange={event => setApiSecret(event.target.value)}
          />
        </Box>
      ) : null}

      {ALLOWS_BASE_URL.has(provider) ? (
        <Box className="space-y-1.5">
          <Label htmlFor="admin-docs-url">{t('adminDocs.baseUrl')}</Label>
          <Input id="admin-docs-url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} />
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('adminDocs.baseUrlHelper')}
          </Text>
        </Box>
      ) : null}

      <Box className="flex items-center gap-2">
        <Button size="sm" onClick={submit} disabled={!canSubmit || connect.isPending}>
          {connect.isPending ? t('adminDocs.connecting') : t('adminDocs.connect')}
        </Button>
        {connect.isError ? (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {(connect.error as Error).message}
          </Text>
        ) : null}
      </Box>
    </Box>
  )
}

/**
 * Une des deux lectures, avec les QUATRE réponses possibles distinguées.
 *
 * Elles se ressemblent à l'écran et ne veulent pas dire la même chose :
 *  · je regarde encore ;
 *  · je n'ai pas pu regarder (la route a échoué) ;
 *  · j'ai regardé, et tel outil n'a pas répondu — `unavailable`, que le service
 *    calcule déjà et que personne ne rendait ;
 *  · j'ai regardé partout, et il n'y a rien.
 *
 * Confondre les trois premières avec la quatrième, c'est annoncer « aucune
 * facture en retard » à quelqu'un qui en a douze.
 */
function ReadingSection({
  kind,
  isLoading,
  isError,
  unavailable,
  count,
  children,
}: {
  kind: 'signatures' | 'invoices'
  isLoading: boolean
  isError: boolean
  unavailable: readonly AdminDocsProvider[]
  /** Combien d'éléments sont revenus. `null` = rien n'est revenu, ce qui n'est PAS zéro. */
  count: number | null
  children: React.ReactNode
}) {
  const { t } = useTranslation('integrations')
  const names = unavailable.map(p => t(`adminDocs.providers.${p}`)).join(', ')

  return (
    <Box className="space-y-1.5">
      <Text size="xs" weight="semibold">
        {t(`adminDocs.readings.${kind}.title`)}
      </Text>

      {isLoading ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid={`admin-docs-${kind}-loading`}>
          {t('adminDocs.readings.loading')}
        </Text>
      ) : null}

      {isError ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]" data-testid={`admin-docs-${kind}-failed`}>
          {t('adminDocs.readings.failed')}
        </Text>
      ) : null}

      {unavailable.length > 0 ? (
        <Text size="xs" className="text-[var(--warning-soft-text)]" data-testid={`admin-docs-${kind}-unavailable`}>
          {t('adminDocs.readings.unavailable', { list: names })}
        </Text>
      ) : null}

      {children}

      {/* « Rien » ne se dit QUE si on a vraiment tout regardé. */}
      {!isLoading && !isError && unavailable.length === 0 && count === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid={`admin-docs-${kind}-empty`}>
          {t(`adminDocs.readings.${kind}.empty`)}
        </Text>
      ) : null}
    </Box>
  )
}

function SignatureRow({ signature }: { signature: PendingSignature }) {
  const { t } = useTranslation('integrations')
  return (
    <Box className="flex flex-wrap items-baseline gap-x-2" data-testid={`admin-docs-signature-${signature.id}`}>
      <Text size="xs">{signature.title ?? t('adminDocs.readings.untitled')}</Text>
      {signature.signer ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {signature.signer}
        </Text>
      ) : null}
      <Text size="xs" color="text-[var(--text-ghost)]">
        {/* `daysWaiting: null` = date d'envoi illisible. Ce n'est pas « 0 jour ». */}
        {signature.daysWaiting === null
          ? t('adminDocs.readings.waitingUnknown')
          : t('adminDocs.readings.waiting', { count: signature.daysWaiting })}
      </Text>
    </Box>
  )
}

function InvoiceRow({ invoice }: { invoice: UnpaidInvoice }) {
  const { t, i18n } = useTranslation('integrations')

  /**
   * Le montant, converti UNE seule fois depuis les centimes.
   *
   * `amountCents: null` ne vaut pas « 0 € » : le fournisseur n'a pas donné de
   * montant lisible, et une facture affichée à zéro se lit « soldée ».
   */
  const amount =
    invoice.amountCents === null
      ? null
      : new Intl.NumberFormat(i18n.language, {
          style: invoice.currency ? 'currency' : 'decimal',
          ...(invoice.currency ? { currency: invoice.currency } : {}),
          maximumFractionDigits: 2,
        }).format(invoice.amountCents / 100)

  /**
   * Trois états, pas deux : inconnue, à venir, en retard.
   *
   * Le service rend `daysOverdue` NÉGATIF pour une facture non encore échue —
   * l'écrire « -32 jours de retard » n'a pas de sens, et l'écrire « 0 » en
   * mentirait dans l'autre sens.
   */
  const late = invoice.daysOverdue !== null && invoice.daysOverdue > 0
  const dueLabel =
    invoice.daysOverdue === null
      ? t('adminDocs.readings.dueUnknown')
      : late
        ? t('adminDocs.readings.overdue', { count: invoice.daysOverdue })
        : t('adminDocs.readings.notDueYet')

  return (
    <Box className="flex flex-wrap items-baseline gap-x-2" data-testid={`admin-docs-invoice-${invoice.id}`}>
      <Text size="xs">{invoice.reference ?? t('adminDocs.readings.untitled')}</Text>
      {invoice.client ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {invoice.client}
        </Text>
      ) : null}
      {amount ? <Text size="xs">{amount}</Text> : null}
      <Text size="xs" color={late ? 'text-[var(--warning-soft-text)]' : 'text-[var(--text-ghost)]'}>
        {dueLabel}
      </Text>
    </Box>
  )
}
