import {
  CRM_TOOL_NAMES,
  type CrmProvider,
  type CrmPushPreview,
  type CrmPushRequest,
  type CrmPushResult,
  type CrmPushTarget,
} from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { connectedToolLogo } from '@/features/chat/view/brand-logos'
import { safeHref } from '@/lib/safe-href'
import { useCrmPresence } from '../hooks/useCrmPresence'
import { crmPushApi } from '../api'

/**
 * #4188 — « ce compte, je l'envoie sur mon CRM ; ces contacts, je les envoie ».
 *
 * Deux temps, jamais un : la PRÉVISUALISATION dit élément par élément ce qui
 * sera créé, mis à jour, ce qui est déjà présent et ce qui est refusé (avec sa
 * raison) — rien n'est écrit tant que la personne n'a pas validé. Puis l'envoi :
 * chaque élément garde son propre résultat, jamais un « tout envoyé » qui
 * couvrirait un échec.
 *
 * 16/10/2026 — la fenêtre NOMME l'outil (« HubSpot · bellum-it.com ») : la doctrine interdit de
 * nommer NOS fournisseurs de données, pas l'outil que l'espace a lui-même branché. Quand
 * plusieurs CRM sont branchés, chacun a sa case — seul le principal est coché d'office —,
 * sa prévisualisation et son résultat. L'envoi part vers chaque CRM coché par la même
 * porte ; l'échec de l'un n'annule pas l'autre, et un délai sans réponse est « à vérifier »,
 * jamais un échec. Un CRM en lecture seule est listé, non cochable, avec sa raison.
 */
type Selection = Pick<CrmPushRequest, 'accountIds' | 'contactIds'>

/** Un envoi vers UN CRM : son résultat, ou son erreur — `noAnswer` = parti sans réponse (à vérifier, pas un échec). */
type Sent = { provider: CrmProvider; result: CrmPushResult | null; error: Error | null; noAnswer: boolean }

/** Le nom à l'écran : l'outil branché, puis l'espace CRM de l'utilisateur. */
function targetName(provider: CrmProvider, destination: string | null): string {
  return destination ? `${CRM_TOOL_NAMES[provider]} · ${destination}` : CRM_TOOL_NAMES[provider]
}

/** Aucune réponse du réseau ou délai dépassé : la demande a pu partir, on ne dit pas « échec ». */
function isNoAnswer(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'))
  )
}

function ToolLogo({ provider }: { provider: CrmProvider }) {
  const logo = connectedToolLogo(provider)
  return logo ? <img src={logo} alt="" aria-hidden className="size-5 shrink-0" /> : null
}

export function PushItems({
  items,
  label,
}: {
  items: CrmPushPreview['items'] | CrmPushResult['items']
  label: string
}) {
  const { t } = useTranslation('crm')
  return (
    <ul className="max-h-60 space-y-1 overflow-y-auto" aria-label={label}>
      {items.map(item => {
        const state = 'outcome' in item ? `outcome.${item.outcome}` : `verdict.${item.verdict}`
        const href = item.recordUrl ? safeHref(item.recordUrl) : null
        return (
          <li key={`${item.entity}-${item.id}`} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{item.label}</span>
              <span className="text-[var(--bellum-text-muted)]"> · {t(`push.entity.${item.entity}`)}</span>
              {item.reason ? (
                <span className="block text-xs text-[var(--bellum-text-muted)]">{item.reason}</span>
              ) : null}
              {/* #4290.1 — les champs qui seront écrits, valeur par champ ; la fiche déjà liée est signalée. */}
              {'fields' in item && item.fields.length > 0 ? (
                <dl
                  className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-xs text-[var(--bellum-text-muted)]"
                  aria-label={t('push.fieldsLabel')}
                >
                  {item.fields.map(entry => (
                    <div key={entry.field} className="contents">
                      <dt>{t(`push.field.${entry.field}`)}</dt>
                      <dd className="min-w-0 break-words">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {'verdict' in item && item.crmRecordId ? (
                <span className="block text-xs text-[var(--bellum-text-muted)]">{t('push.existsInCrm')}</span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs">
              {t(`push.${state}`)}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label={t('push.openRecord', { name: item.label })}
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function CrmPushDialog({
  open,
  onOpenChange,
  selection,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selection: Selection
}) {
  const { t } = useTranslation('crm')
  const queryClient = useQueryClient()
  // Le lot depuis une liste de COMPTES peut emporter leurs contacts ; un envoi
  // depuis des contacts cochés n'emporte que ceux-là.
  const [withAccountContacts, setWithAccountContacts] = useState(false)
  // `null` = la personne n'a rien touché : seul le CRM principal est coché.
  const [chosen, setChosen] = useState<readonly CrmProvider[] | null>(null)
  const targets = useQuery<CrmPushTarget[], Error>({
    queryKey: ['crm', 'push', 'targets'],
    queryFn: async () => (await crmPushApi.targets()).targets,
    enabled: open,
    retry: false,
  })
  // K.6 — on n'affiche QUE des destinations fraîchement lues : pendant une relecture, la liste de la
  // dernière ouverture (un CRM grisé « lecture seule » qui se débloque une seconde plus tard) resterait
  // affichée puis changerait sous les yeux. Tant que ça charge, on dit « chargement », rien d'autre.
  const targetsSettled = targets.data !== undefined && !targets.isFetching
  const listed = targetsSettled ? (targets.data ?? []) : []
  // L.1 — aucune case cochée d'office, sauf s'il n'y a QU'UN CRM branché. Le choix de la personne
  // (`chosen`) prime toujours et ne se recalcule jamais depuis la liste.
  const onlyOne = listed.length === 1
  const checked: CrmPushTarget[] = listed.filter(
    target => target.writable && (chosen ? chosen.includes(target.provider) : onlyOne),
  )
  const request = (provider: CrmProvider): CrmPushRequest => ({ ...selection, withAccountContacts, provider })
  const previews = useQueries({
    queries: checked.map(target => ({
      queryKey: ['crm', 'push', 'preview', request(target.provider)],
      queryFn: (): Promise<CrmPushPreview> => crmPushApi.preview(request(target.provider)),
      enabled: open,
      retry: false,
    })),
  })
  const push = useMutation<Sent[], Error, CrmProvider[]>({
    // Chaque CRM part pour son compte : un échec (ou un silence) de l'un n'arrête jamais l'autre.
    mutationFn: providers =>
      Promise.all(
        providers.map(async (provider): Promise<Sent> => {
          try {
            return { provider, result: await crmPushApi.push(request(provider)), error: null, noAnswer: false }
          } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error))
            return { provider, result: null, error: failure, noAnswer: isNoAnswer(error) }
          }
        }),
      ),
    onSuccess: () => {
      for (const id of selection.accountIds) {
        void queryClient.invalidateQueries({ queryKey: ['crm', 'push', 'account', id] })
      }
      void queryClient.invalidateQueries({ queryKey: ['contact-crm-exports'] })
    },
  })
  const sent = push.data
  // L.4 — à la réouverture, état neuf : ni ancien résultat, ni ancien choix.
  const { reset: resetPush } = push
  useEffect(() => {
    if (open) return
    resetPush()
    setChosen(null)
    setWithAccountContacts(false)
  }, [open, resetPush])
  const destinationOf = (provider: CrmProvider) =>
    listed.find(target => target.provider === provider)?.destination ?? null
  const title =
    checked.length === 1 && checked[0]
      ? t('push.titleTo', { destination: targetName(checked[0].provider, checked[0].destination) })
      : checked.length > 1
        ? t('push.titleMany', { count: checked.length })
        : t('push.title')
  const toggle = (provider: CrmProvider, on: boolean) => {
    const current = chosen ?? checked.map(target => target.provider)
    setChosen(on ? [...current.filter(p => p !== provider), provider] : current.filter(p => p !== provider))
  }
  const sendable = previews.some(p => p.data?.items.some(i => i.verdict === 'create' || i.verdict === 'update'))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('push.close')} className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('push.description')}</DialogDescription>
        </DialogHeader>

        {selection.accountIds.length > 0 && !sent ? (
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={withAccountContacts}
              onChange={event => setWithAccountContacts(event.target.checked)}
            />
            {t('push.withAccountContacts')}
          </label>
        ) : null}

        {targets.isError ? (
          <Text size="sm" color="text-[var(--danger-soft-text)]" role="alert">
            {targets.error.message}
          </Text>
        ) : null}
        {targets.isFetching ? <Text size="sm">{t('push.loading')}</Text> : null}
        {targetsSettled && listed.length === 0 ? <Text size="sm">{t('push.noTarget')}</Text> : null}

        {listed.length > 1 && !sent ? (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t('push.targetsLegend')}</legend>
            {listed.map(target => (
              <label key={target.provider} className="flex min-h-11 items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  disabled={!target.writable}
                  checked={checked.some(c => c.provider === target.provider)}
                  onChange={event => toggle(target.provider, event.target.checked)}
                />
                <ToolLogo provider={target.provider} />
                <span className="min-w-0">
                  <span className="font-medium">{targetName(target.provider, target.destination)}</span>
                  {!target.writable && target.readOnlyReason ? (
                    <span className="block text-xs text-[var(--bellum-text-muted)]">{target.readOnlyReason}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {sent
          ? sent.map(entry => (
              <section key={entry.provider} className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <ToolLogo provider={entry.provider} />
                  {targetName(entry.provider, entry.result?.destination ?? destinationOf(entry.provider))}
                </h3>
                {entry.result ? (
                  <PushItems items={entry.result.items} label={t('push.listLabel')} />
                ) : (
                  <Text size="sm" color={entry.noAnswer ? undefined : 'text-[var(--danger-soft-text)]'} role="alert">
                    {entry.noAnswer ? t('push.noAnswer') : entry.error?.message}
                  </Text>
                )}
              </section>
            ))
          : checked.map((target, index) => {
              const preview = previews[index]
              return (
                <section key={target.provider} className="space-y-1">
                  {listed.length > 1 ? (
                    <h3 className="flex items-center gap-2 text-sm font-medium">
                      <ToolLogo provider={target.provider} />
                      {targetName(target.provider, target.destination)}
                    </h3>
                  ) : null}
                  {preview?.isError ? (
                    <Text size="sm" color="text-[var(--danger-soft-text)]" role="alert">
                      {preview.error.message}
                    </Text>
                  ) : null}
                  {preview?.isLoading ? <Text size="sm">{t('push.loading')}</Text> : null}
                  {preview?.data ? <PushItems items={preview.data.items} label={t('push.listLabel')} /> : null}
                  {preview?.data?.items.some(item => item.fields.length > 0) ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('push.fieldsNotRead')}
                    </Text>
                  ) : null}
                </section>
              )
            })}

        {push.isError ? (
          <Text size="sm" color="text-[var(--danger-soft-text)]" role="alert">
            {push.error.message}
          </Text>
        ) : null}

        <div className="flex justify-end gap-2">
          {sent ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('push.done')}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={push.isPending || checked.length === 0 || !sendable}
              onClick={() => push.mutate(checked.map(target => target.provider))}
            >
              {push.isPending ? t('push.sending') : t('push.send')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** « Dans <CRM> » sur la fiche d'un compte, et le geste « Envoyer vers mon CRM ». */
export function AccountCrmPushChip({
  accountId,
  companyName,
  website,
  siren,
}: {
  accountId: string
  companyName?: string | null
  website?: string | null
  siren?: string | null
}) {
  const { t } = useTranslation('crm')
  // R24 (15/10) — « Déjà dans ton CRM » (présence) et « Envoyer » ne se contredisent pas : même question, une réponse.
  const presence = useCrmPresence({ companyName, website, siren })
  const [open, setOpen] = useState(false)
  const exports = useQuery({
    queryKey: ['crm', 'push', 'account', accountId],
    queryFn: () => crmPushApi.accountExports(accountId),
    retry: false,
  })
  const alreadyInCrm = (exports.data?.items ?? []).length > 0 || presence.data?.matched === true
  // L.3 — « Mettre à jour » seulement si le compte est présent ET qu'il reste un écart à envoyer.
  const gap = useQuery({
    queryKey: ['crm', 'push', 'gap', accountId],
    queryFn: () => crmPushApi.preview({ accountIds: [accountId], contactIds: [], withAccountContacts: true }),
    enabled: alreadyInCrm,
    retry: false,
  })
  const hasGap = gap.data?.items.some(item => item.verdict === 'create' || item.verdict === 'update') === true
  return (
    <>
      {(exports.data?.items ?? []).map(item => {
        const href = item.record_url ? safeHref(item.record_url) : null
        const label = t('push.inCrm', { destination: item.destination_label ?? t('push.yourCrm') })
        return href ? (
          <a
            key={item.provider}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs underline"
          >
            {label}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        ) : (
          <Text key={item.provider} element="span" size="xs">
            {label}
          </Text>
        )
      })}
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="pointer-coarse:min-h-11"
        onClick={() => setOpen(true)}
      >
        {alreadyInCrm && hasGap ? t('push.updateAccount') : t('push.sendAccount')}
      </Button>
      <CrmPushDialog open={open} onOpenChange={setOpen} selection={{ accountIds: [accountId], contactIds: [] }} />
    </>
  )
}
