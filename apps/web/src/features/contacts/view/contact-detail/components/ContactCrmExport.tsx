import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { Contact } from '@bellum/contracts'
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Check, ChevronDown, ExternalLink, MessageSquarePlus, Plug, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { safeHref } from '@/lib/safe-href'
import { providerLabel } from '@/features/integration-center/lib/provider-label'
import { attioApi } from '@/features/attio/api'
import { useAttioStatus } from '@/features/attio/hooks/useAttioStatus'
import { crmApi, type ExportContactInput } from '@/features/crm/api'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { useLogCrmActivity } from '@/features/crm/hooks/useLogCrmActivity'
import { useFeatureLock } from '@/features/plan-features/useFeatureLock'
import { pipedriveApi } from '@/features/pipedrive/api'
import { usePipedriveStatus } from '@/features/pipedrive/hooks/usePipedriveStatus'
import { salesforceApi } from '@/features/salesforce/api'
import { useSalesforceStatus } from '@/features/salesforce/hooks/useSalesforceStatus'
import { useContactAssociations } from '@/features/contacts/hooks/useContactAssociations'
import { useContactCrmExports, useRecordContactCrmExport } from '@/features/contacts/hooks/useContactCrmExports'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/**
 * Multi-CRM export for a qualified Bellum contact. The card stays invisible
 * until at least one CRM (HubSpot, Salesforce, Pipedrive or Attio) is connected.
 * The Export button opens a provider picker driven by each provider's real
 * `/{provider}/status`: connected CRMs are actionable and call their own
 * `POST /{provider}/export` (upsert-by-email); a CRM that isn't connected is
 * greyed out and links to Settings › Integrations to connect it first.
 *
 * Once exported to HubSpot — the only provider exposing an activity-log endpoint
 * — a second "log activity" step writes back onto the CRM timeline (2-way sync).
 * The user is derived server-side from the JWT; we only pass business fields.
 */
type CrmProviderId = 'hubspot' | 'salesforce' | 'pipedrive' | 'attio'

type ProviderRow = {
  id: CrmProviderId
  label: string
  /** Nom de l'espace CRM de l'utilisateur — jamais l'éditeur. */
  accountLabel: string | null
  connected: boolean
  exportContact: (input: ExportContactInput) => Promise<{ id: string; created: boolean }>
}

export function ContactCrmExport({ contact }: { contact: Contact }) {
  const { t, i18n } = useTranslation('contacts')
  // #2081.14 — pousser la fiche dans un CRM est une SORTIE de données : sous la
  // règle d'espace « administrateurs seulement », la carte d'export est masquée
  // (l'API refuse aussi la route, `@DataExit()`).
  const dataExit = useDataExit()
  const { data: hubspotStatus } = useCrmStatus()
  const { data: salesforceStatus } = useSalesforceStatus()
  const { data: pipedriveStatus } = usePipedriveStatus()
  const { data: attioStatus } = useAttioStatus()
  const logActivity = useLogCrmActivity()
  // Offre qui n'ouvre pas l'export CRM : la carte reste, GRISÉE, et le clic
  // ouvre ce qu'il faut savoir pour l'obtenir.
  const crmLock = useFeatureLock('crm_sync')

  // #3719.4 — l'état « exporté vers … le … » vient de la base, plus d'un
  // `useState` : il survit au rechargement. #3719.6 — l'entreprise exportée est
  // celle du COMPTE identifié, jamais le libellé d'entité importé.
  const { data: persistedExports } = useContactCrmExports(contact.id)
  const { data: associations } = useContactAssociations(contact.id)
  const recordExport = useRecordContactCrmExport(contact.id)

  const [busy, setBusy] = useState<CrmProviderId | null>(null)
  const [logged, setLogged] = useState(false)
  const exportsByProvider = new Map((persistedExports?.items ?? []).map(item => [item.provider, item]))
  // HubSpot : le journal d'activité s'adresse à l'objet RETROUVÉ en base.
  const hubspotExport = exportsByProvider.get('hubspot') ?? null

  // #3719.3 — la destination se nomme par l'espace CRM de l'utilisateur dès
  // qu'on le connaît, même avec un seul CRM branché : « Ton CRM — Acme Corp ».
  // ⚠️ AUCUN NOM D'ÉDITEUR (arbitrage du 02/08, reconduit le 25/08 « capacité
  // partout, sans exception »). Chaque destination s'appelle « ton CRM ».
  //
  // Le cas que ça ouvre — plusieurs CRM connectés, donc plusieurs lignes du même
  // libellé — se règle avec un discriminant qui n'est PAS l'éditeur : le
  // `accountLabel`, c'est-à-dire le nom de l'espace CRM de l'utilisateur. Il est
  // exposé par les quatre statuts, et il lui parle davantage qu'un nom de
  // produit : il reconnaît « Acme Corp », pas « l'instance Salesforce ».
  // #5028 (recette prod 01/11) : « Ton CRM — bellum-it.com » ne disait pas QUEL outil est branché — quatre cibles,
  // aucune « HubSpot ». On NOMME l'outil que l'espace a branché (jamais un fournisseur qui nous sert) : l'arbitrage
  // « aucun nom d'éditeur » est levé depuis le 13/09 (doctrine-registry).
  const crmName = (
    provider: 'hubspot' | 'salesforce' | 'pipedrive' | 'attio',
    accountLabel: string | null | undefined,
  ) => (accountLabel ? `${providerLabel(provider)} — ${accountLabel}` : providerLabel(provider))

  // Salle de démonstration : un connecteur CRM FICTIF (aucune écriture externe, voir `CrmService.exportContact`).
  const demoCrm = hubspotStatus?.demo === true

  const providers: ProviderRow[] = [
    {
      id: 'hubspot',
      // Salle de démonstration : le connecteur fictif porte son nom ET le dit (« démonstration »).
      label: demoCrm
        ? t('crm.demoLabel', { name: hubspotStatus?.accountLabel ?? t('crm.capability') })
        : crmName('hubspot', hubspotStatus?.accountLabel),
      accountLabel: hubspotStatus?.accountLabel ?? null,
      connected: (hubspotStatus?.connected ?? false) || demoCrm,
      exportContact: crmApi.exportContact,
    },
    {
      id: 'salesforce',
      label: crmName('salesforce', salesforceStatus?.accountLabel),
      accountLabel: salesforceStatus?.accountLabel ?? null,
      connected: salesforceStatus?.connected ?? false,
      exportContact: salesforceApi.exportContact,
    },
    {
      id: 'pipedrive',
      label: crmName('pipedrive', pipedriveStatus?.accountLabel),
      accountLabel: pipedriveStatus?.accountLabel ?? null,
      connected: pipedriveStatus?.connected ?? false,
      exportContact: pipedriveApi.exportContact,
    },
    {
      id: 'attio',
      label: crmName('attio', attioStatus?.accountLabel),
      accountLabel: attioStatus?.accountLabel ?? null,
      connected: attioStatus?.connected ?? false,
      exportContact: attioApi.exportContact,
    },
  ]

  // Preserve the original behaviour: no CRM connected → render nothing.
  if (!providers.some(provider => provider.connected)) return null
  if (!dataExit.allowed) return null

  const historical = contact.lifecycle_state === 'historique'
  const input = buildInput(contact, historical, associations?.account?.name ?? null)

  const exportTo = async (provider: ProviderRow) => {
    if (busy) return
    // #3719.7 — sans e-mail, le CRM ne peut pas retrouver l'objet déjà créé : le
    // ré-exporter en créerait un second. L'export est déjà fait, on le dit.
    if (!contact.email && exportsByProvider.has(provider.id)) {
      toast.error(t('crm.noEmailAlreadyExported', { provider: provider.label }))
      return
    }
    setBusy(provider.id)
    try {
      const result = await provider.exportContact(input)
      setLogged(false)
      // Consigné APRÈS la réponse du CRM : un export échoué n'est jamais « exporté ».
      // Un échec d'écriture ici ne défait pas l'export : la carte le dit.
      recordExport.mutate(
        {
          provider: provider.id,
          crm_record_id: result.id,
          created: result.created,
          destination_label: provider.accountLabel,
        },
        { onError: () => toast.error(t('crm.recordError')) },
      )
      toast.success(
        result.created
          ? t('crm.exportedToast', { name: contact.full_name, provider: provider.label })
          : t('crm.updatedToast', { name: contact.full_name, provider: provider.label }),
      )
    } catch (error) {
      // #2081.14 — un refus de la règle d'espace se dit par sa phrase.
      toast.error(workspaceRuleRefusalText(error) ?? t('crm.exportError', { provider: provider.label }))
    } finally {
      setBusy(null)
    }
  }

  const logToCrm = async () => {
    if (!hubspotExport || logActivity.isPending) return
    try {
      await logActivity.mutateAsync({
        crmId: hubspotExport.crm_record_id,
        note: t('crm.activityNote', { name: contact.full_name }),
      })
      setLogged(true)
      toast.success(t('crm.loggedToast'))
    } catch {
      toast.error(t('crm.logError'))
    }
  }

  // HubSpot is the only provider with an activity-log endpoint, so the write-back
  // step only surfaces after a HubSpot export.
  const canLog = hubspotExport !== null

  return (
    <>
      <Card className="flex items-center justify-between gap-3 p-4">
        <div>
          <Text weight="semibold">{t('crm.title')}</Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('crm.description')}
          </Text>
          {demoCrm && (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('crm.demoNote')}
            </Text>
          )}
          {historical && (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('crm.historicalNote')}
            </Text>
          )}
          {/* #3719.4 — retrouvé après rechargement. Un export ponctuel, pas une synchronisation. */}
          {providers
            .filter(provider => exportsByProvider.has(provider.id))
            .map(provider => {
              const record = exportsByProvider.get(provider.id)
              if (!record) return null
              // #3719.5 — « null » dès que le fournisseur n'expose pas de base
              // par-espace vérifiable (Attio) ou que la connexion a disparu :
              // jamais un lien qui mènerait à une page d'erreur.
              const href = safeHref(record.record_url)
              return (
                <Text
                  key={provider.id}
                  size="sm"
                  color="text-[var(--bellum-text-secondary)]"
                  className="flex items-center gap-1.5"
                >
                  {t(record.last_action === 'created' ? 'crm.exportedOn' : 'crm.updatedOn', {
                    destination: provider.label,
                    date: formatExportDate(record.exported_at, i18n.language),
                  })}
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--bellum-text-accent)] hover:underline"
                    >
                      <ExternalLink className="size-3" />
                      {t('crm.openRecord')}
                    </a>
                  )}
                </Text>
              )
            })}
          {providers.some(provider => exportsByProvider.has(provider.id)) && (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('crm.oneShotNote')}
            </Text>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="violet"
                size="sm"
                icon={Upload}
                isLoading={busy !== null}
                className={crmLock.dimClassName}
              >
                {t('common:actions.export')}
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('crm.menuLabel')}</DropdownMenuLabel>
              {providers
                .filter(provider => provider.connected)
                .map(provider => (
                  <DropdownMenuItem
                    key={provider.id}
                    className={crmLock.dimClassName}
                    onSelect={crmLock.guard(() => void exportTo(provider))}
                  >
                    {exportsByProvider.has(provider.id) ? (
                      <Check className="mr-2 size-4 text-[var(--success-soft-text)]" />
                    ) : (
                      <Upload className="mr-2 size-4" />
                    )}
                    {exportsByProvider.has(provider.id) ? t('crm.updateIn', { name: provider.label }) : provider.label}
                  </DropdownMenuItem>
                ))}
              {/*
                Une SEULE invite pour tout ce qui n'est pas branché.
                Avant, chaque CRM non connecté avait sa ligne, nommée par son
                éditeur. Sans le nom, ces lignes deviendraient trois « Ton CRM ·
                Connecter d'abord » identiques — un menu qui répète trois fois la
                même chose n'apprend rien et fait douter du reste.
                Le geste est le même pour toutes : aller à Réglages › Intégrations,
                où les outils SONT nommés.
              */}
              {providers.some(provider => !provider.connected) && (
                <DropdownMenuItem asChild className="text-[var(--bellum-text-muted)]">
                  <Link to="/integrations">
                    <Plug className="mr-2 size-4" />
                    <span className="flex-1">{t('crm.connectAnother')}</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {canLog && (
            <Button
              variant={logged ? 'ghost' : 'outline'}
              size="sm"
              icon={logged ? Check : MessageSquarePlus}
              isLoading={logActivity.isPending}
              disabled={logged}
              onClick={logToCrm}
            >
              {logged ? t('crm.logged') : t('crm.log')}
            </Button>
          )}
        </div>
      </Card>
      {crmLock.dialog}
    </>
  )
}

/**
 * #3719.1 — un contact HISTORIQUE (a quitté l'entreprise du compte) ne part pas
 * comme employé actuel : ni le poste ni l'entreprise ne sont envoyés tant que
 * la situation n'est pas vérifiée. L'identité et l'adresse partent, et
 * l'absence d'un champ n'efface rien côté CRM (jamais une valeur vide).
 */
function formatExportDate(iso: string, language: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(language, { day: 'numeric', month: 'long' })
}

/**
 * #3719.6 — `company` = le nom du COMPTE identifié (la même identité que le
 * lien « compte » de la fiche), jamais `contact.entity` : c'est un libellé
 * d'entité (filiale, BU), pas l'entreprise, et un intitulé importé ne doit pas
 * créer une entreprise erronée dans le CRM. Sans compte identifié, aucune
 * entreprise ne part (jamais une valeur devinée ni vide).
 */
function buildInput(contact: Contact, historical: boolean, accountName: string | null): ExportContactInput {
  const parts = (contact.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const firstName = parts[0]
  // CRMs want a last name; when the name is a single token, reuse it so the
  // export never fails validation (email alone also satisfies the API).
  const lastName = parts.slice(1).join(' ') || firstName
  return {
    firstName,
    lastName,
    email: contact.email ?? undefined,
    jobTitle: historical ? undefined : (contact.title ?? undefined),
    company: historical ? undefined : (accountName ?? undefined),
    linkedinUrl: contact.linkedin_url ?? undefined,
  }
}
