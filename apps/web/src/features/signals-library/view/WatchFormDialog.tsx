import {
  ACCOUNT_FOLLOW_CAP_REACHED,
  SIGNAL_NATURES,
  SIGNAL_WATCH_CADENCE_KEYS,
  SIGNAL_WATCH_CHANNELS,
  type SignalNature,
  type SignalWatchCadence,
  type SignalWatchChannel,
  type WatchItem,
} from '@bellum/contracts'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
} from '@bellum/ui'
import { Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TheoNote } from '@/components/page/theo-page-grammar'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useDebounce } from '@/hooks/useDebounce'
import { ApiError } from '@/lib/api-error'
import { useSaveWatch, useUnfollowAccount } from '../api'

const TIMEZONE = 'Europe/Paris'

type PickableAccount = { account_id: string; company_name: string; logo_url?: string | null; website?: string | null }

type WatchFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** La veille à régler ; `null` = une nouvelle. */
  watch: WatchItem | null
  /** Les comptes que l'utilisateur SUIT déjà (toutes veilles confondues). */
  followed: Array<{ account_id: string; company_name: string }>
  /** Le plafond de comptes suivis DISTINCTS par utilisateur (#4267, 3 au 23/10). */
  followMax: number
}

const todayIso = (): string => new Date().toISOString().slice(0, 10)

/**
 * #4506 — « Configurer une veille », au dessin de la maquette V22 (`#dlg-watch`) : nom, COMPTES SUIVIS (cases avec
 * logos, tous les comptes de l'espace), types d'actualités (aucun = tous), sujets ou mots-clés (facultatif), cadence,
 * date de départ, canal et partage. « Veiller sur un compte entier » = un compte coché, aucun type ni mot-clé.
 *
 * Cocher un compte le SUIT à l'enregistrement. Le plafond compte les comptes suivis DISTINCTS, toutes veilles
 * confondues : au-delà, la modale dit pourquoi et propose « Ne plus suivre » sur un compte déjà suivi — et l'API
 * refuse de toute façon (409), l'écran n'est pas la seule barrière. La cadence règle la fréquence des alertes ; chaque
 * passage relit ce qui a déjà été collecté, sans achat.
 */
export function WatchFormDialog({ open, onOpenChange, watch, followed, followMax }: WatchFormDialogProps) {
  const { t } = useTranslation('signalsLibrary')
  const save = useSaveWatch()
  const unfollow = useUnfollowAccount()
  const [name, setName] = useState(watch?.name ?? '')
  const [accountIds, setAccountIds] = useState<ReadonlySet<string>>(
    new Set(watch?.accounts.map(a => a.account_id) ?? []),
  )
  const [natures, setNatures] = useState<ReadonlySet<SignalNature>>(new Set(watch?.natures ?? []))
  const [keywords, setKeywords] = useState(watch?.keywords.join(', ') ?? '')
  const [cadence, setCadence] = useState<SignalWatchCadence>(watch?.cadence ?? '3_days')
  const [startsOn, setStartsOn] = useState(watch?.starts_on ?? todayIso())
  const [channel, setChannel] = useState<SignalWatchChannel>(watch?.channel ?? 'in_app')
  const [shared, setShared] = useState(watch?.shared ?? false)
  const [search, setSearch] = useState('')
  const [failure, setFailure] = useState<'cap' | 'other' | null>(null)
  const [debouncedSearch] = useDebounce(search.trim(), 250)
  const workspace = useAccounts({ limit: 50, ...(debouncedSearch ? { q: debouncedSearch } : {}) })

  // Les comptes suivis d'abord (ceux qu'on coche le plus), puis ceux de la veille, puis l'espace — chacun une fois.
  const pickable = useMemo(() => {
    const byId = new Map<string, PickableAccount>()
    const query = search.trim().toLowerCase()
    const keep = (account: PickableAccount) =>
      !byId.has(account.account_id) && (!query || account.company_name.toLowerCase().includes(query))
    for (const account of followed) if (keep(account)) byId.set(account.account_id, account)
    for (const account of watch?.accounts ?? []) if (keep(account)) byId.set(account.account_id, account)
    for (const page of workspace.data?.pages ?? [])
      for (const account of page.data ?? []) {
        const candidate = {
          account_id: account.id,
          company_name: account.company_name,
          logo_url: account.logo_url,
          website: account.website,
        }
        if (keep(candidate)) byId.set(candidate.account_id, candidate)
        else if (byId.has(account.id)) byId.set(account.id, { ...byId.get(account.id)!, ...candidate })
      }
    return [...byId.values()]
  }, [followed, watch, workspace.data, search])

  const followedIds = useMemo(() => new Set(followed.map(account => account.account_id)), [followed])
  const wouldFollow = new Set([...followedIds, ...accountIds])
  const overCap = wouldFollow.size > followMax
  // Ce qu'on peut retirer pour rentrer sous le plafond : un compte déjà suivi que cette veille ne coche pas.
  const removable = followed.filter(account => !accountIds.has(account.account_id))
  const naming: Map<string, string> = new Map(pickable.map(account => [account.account_id, account.company_name]))

  const toggle = <T,>(set: ReadonlySet<T>, value: T, apply: (next: ReadonlySet<T>) => void) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    apply(next)
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (overCap) return
    setFailure(null)
    save.mutate(
      {
        id: watch?.id ?? null,
        request: {
          name: name.trim(),
          account_ids: [...accountIds],
          natures: [...natures],
          keywords: keywords
            .split(',')
            .map(word => word.trim())
            .filter(Boolean),
          cadence,
          starts_on: startsOn,
          timezone: TIMEZONE,
          channel,
          shared,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: error =>
          setFailure(error instanceof ApiError && error.code === ACCOUNT_FOLLOW_CAP_REACHED ? 'cap' : 'other'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('form.close')} className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="flex min-w-0 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{watch ? t('form.editTitle') : t('form.createTitle')}</DialogTitle>
            <DialogDescription>{t('form.description')}</DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('form.name')}
            <Input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder={t('form.namePlaceholder')}
              maxLength={120}
              required
              className="min-h-11"
            />
          </label>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="text-sm font-medium text-[var(--bellum-text-primary)]">{t('form.accounts')}</legend>
            <p className="text-xs text-[var(--bellum-text-secondary)]">
              {t('form.accountsHint', { count: wouldFollow.size, max: followMax })}
            </p>
            <label className="flex min-h-11 items-center gap-2 rounded-control border border-[var(--bellum-border)] px-3">
              <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
              <Input
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder={t('form.searchAccounts')}
                aria-label={t('form.searchAccounts')}
                className="min-h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </label>
            <div className="max-h-56 overflow-y-auto rounded-control border border-[var(--bellum-border)]">
              {pickable.length === 0 ? (
                <p className="p-3 text-sm text-[var(--bellum-text-secondary)]">{t('form.noAccount')}</p>
              ) : (
                pickable.map(account => (
                  <label
                    key={account.account_id}
                    className="flex min-h-11 items-center gap-2 border-b border-[var(--bellum-border)] px-3 text-sm last:border-b-0"
                  >
                    <Checkbox
                      checked={accountIds.has(account.account_id)}
                      onCheckedChange={() => toggle(accountIds, account.account_id, setAccountIds)}
                    />
                    <CompanyAvatar
                      name={account.company_name}
                      size="sm"
                      logoUrl={account.logo_url ?? null}
                      website={account.website ?? null}
                    />
                    <span className="min-w-0 flex-1 truncate">{account.company_name}</span>
                    {followedIds.has(account.account_id) ? (
                      <span className="text-xs text-[var(--bellum-text-muted)]">{t('form.alreadyFollowed')}</span>
                    ) : null}
                  </label>
                ))
              )}
            </div>
            {overCap || failure === 'cap' ? (
              <div role="alert" data-testid="follow-cap" className="flex flex-col gap-2">
                <TheoNote>
                  {t('form.capReached', { max: followMax })}
                  {removable.length > 0 ? ` ${t('form.capRemoveOne')}` : ` ${t('form.capUncheck')}`}
                </TheoNote>
                {removable.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {removable.map(account => (
                      <Button
                        key={account.account_id}
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        disabled={unfollow.isPending}
                        onClick={() => unfollow.mutate(account.account_id, { onSuccess: () => setFailure(null) })}
                      >
                        {t('form.unfollow', { name: naming.get(account.account_id) ?? account.company_name })}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('form.natures')}{' '}
              <span className="font-normal text-[var(--bellum-text-muted)]">{t('form.naturesAll')}</span>
            </legend>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {SIGNAL_NATURES.map(nature => (
                <label key={nature} className="flex min-h-11 items-center gap-2 text-sm">
                  <Checkbox checked={natures.has(nature)} onCheckedChange={() => toggle(natures, nature, setNatures)} />
                  {t(`natures.${nature}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-medium text-[var(--bellum-text-primary)]">
            {t('form.keywords')}
            <Input
              value={keywords}
              onChange={event => setKeywords(event.target.value)}
              placeholder={t('form.keywordsPlaceholder')}
              className="min-h-11"
            />
            <span className="text-xs font-normal text-[var(--bellum-text-secondary)]">{t('form.keywordsHint')}</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('form.cadence')}
              <SelectField
                ariaLabel={t('form.cadence')}
                value={cadence}
                onChange={value => setCadence(value as SignalWatchCadence)}
                options={SIGNAL_WATCH_CADENCE_KEYS.map(key => ({ value: key, label: t(`cadences.${key}`) }))}
              />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('form.startsOn')}
              <Input
                type="date"
                value={startsOn}
                onChange={event => setStartsOn(event.target.value)}
                required
                className="min-h-11"
              />
            </label>
            <div className="flex flex-col gap-1 text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('form.channel')}
              <SelectField
                ariaLabel={t('form.channel')}
                value={channel}
                onChange={value => setChannel(value as SignalWatchChannel)}
                options={SIGNAL_WATCH_CHANNELS.map(key => ({ value: key, label: t(`channels.${key}`) }))}
              />
            </div>
            <label className="flex min-h-11 items-start gap-2 self-end text-sm">
              <Checkbox checked={shared} onCheckedChange={value => setShared(value === true)} className="mt-0.5" />
              <span>
                {t('form.shared')}
                <span className="block text-xs text-[var(--bellum-text-secondary)]">{t('form.sharedHint')}</span>
              </span>
            </label>
          </div>

          <TheoNote tone="neutral">
            {t('form.wholeAccount')} {t('form.timezone', { timezone: TIMEZONE })}
          </TheoNote>

          {failure === 'other' ? (
            <p role="alert" className="text-sm text-[var(--danger-soft-text)]">
              {t('form.saveFailed')}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t('form.cancel')}
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={save.isPending || overCap || name.trim().length === 0 || accountIds.size === 0}
            >
              {t('form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
