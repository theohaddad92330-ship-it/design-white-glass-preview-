import type { Contact } from '@bellum/contracts'
import { enrichmentCooldown } from '@bellum/contracts'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { ChevronDown, ListChecks, ListPlus, RotateCcw, UserCheck, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import {
  channelActionLabel,
  channelFallback,
  channelIcon,
  channelNeedsPhoneReveal,
  getMenuChannels,
  getMissingChannels,
} from './channel'
import type { EngagementChannel } from './types'

type ContactChannelMenuProps = {
  contact: Contact
  /** #2091 — `undefined` tant que `useCredits()` n'a pas encore résolu (JAMAIS
   *  un `0` de repli, qui affirmerait à tort « plus de crédits »). */
  enrichmentCredits: number | undefined
  isLoading: boolean
  /** La fiche contact place le déclencheur dans une grille pleine largeur. */
  fullWidth?: boolean
  /**
   * #2160.15/.16/.17 — remplace `trigger.contact` par un libellé qui nomme la
   * situation (« Préparer la première approche », « Préparer une reprise »,
   * « Traiter la réponse »). Optionnel et réservé à la fiche contact
   * (`ContactHeader`) : la liste de contacts d'un compte (`ContactEngagementTrigger`)
   * ne le passe pas et garde son libellé générique inchangé.
   */
  triggerLabel?: string
  onChannelSelect: (channel: EngagementChannel) => void
  /** `force` = « réessayer quand même », qui outrepasse le délai d'idempotence.
   *  L'appelant reste responsable d'ouvrir la confirmation de coût.
   *
   *  #3693.2 — OPTIONNEL : la fiche contact ne le passe plus (Enrichir y est un
   *  geste distinct, `ContactEnrichButton`) ; la liste de contacts d'un compte,
   *  qui n'a pas ce bouton, le garde. Absent ⇒ aucun item d'enrichissement. */
  onEnrich?: (options: { force: boolean }) => void
  /** #3693.1 — « Ajouter à une séquence » : OUVRE le choix de la séquence, rien
   *  d'autre (ni inscription ni activation automatique). Absent ⇒ pas d'item. */
  onAddToSequence?: () => void
  /** Théo B c5.A8 — « Ajouter au plan » : pose ce contact au plan d'action du compte. Absent ⇒ pas d'item. */
  onAddToPlan?: () => void
}

/**
 * Menu « Contacter » — canaux disponibles + complétion des infos manquantes.
 *
 * UNIQUE implémentation, partagée par la fiche contact (`ContactHeader`) et la
 * liste de contacts d'un compte (`ContactEngagementTrigger`). Les deux écrans
 * en avaient chacun une copie quasi identique, avec deux namespaces i18n et —
 * surtout — deux comportements crédits divergents : la fiche contact ignorait le
 * solde ET la confirmation, si bien qu'un clic y débitait un crédit sans accord.
 * Factoriser garantit qu'un garde-fou ajouté ici vaut pour les deux écrans.
 */
export function ContactChannelMenu({
  contact,
  enrichmentCredits,
  isLoading,
  fullWidth = false,
  triggerLabel,
  onChannelSelect,
  onEnrich,
  onAddToSequence,
  onAddToPlan,
}: ContactChannelMenuProps) {
  const { t } = useTranslation('engagement')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          fullWidth={fullWidth}
          type="button"
          variant="black"
          size="sm"
          icon={UserCheck}
          iconPosition="left"
          // #4474 — ni le bouton ni ses icônes ne rétrécissent (le libellé, `whitespace-nowrap`, venait
          // sinon recouvrir l'icône quand la rangée d'actions se serre) ; `gap-2` pose un écart réel.
          iconClassName="shrink-0"
          className="min-h-11 shrink-0 gap-2"
        >
          {triggerLabel ?? t('trigger.contact')}
          <ChevronDown className="size-3.5 shrink-0 text-current opacity-70 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={8} className="w-64 max-w-[calc(100vw-1rem)]">
        <ChannelMenuItems
          contact={contact}
          enrichmentCredits={enrichmentCredits}
          isLoading={isLoading}
          onChannelSelect={onChannelSelect}
          onEnrich={onEnrich}
          onAddToSequence={onAddToSequence}
          onAddToPlan={onAddToPlan}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * SIMON-FIX S.22 — le MÊME menu « Contacter », en sous-menu d'un menu de ligne (liste /contacts : « ⋯ »).
 * Un déclencheur-bouton ne s'imbrique pas dans un `DropdownMenu` ; le corps (canaux, repli LinkedIn, préparation d'un
 * message) est `ChannelMenuItems`, partagé avec `ContactChannelMenu` — jamais une seconde liste de canaux (GA-26).
 */
export function ContactChannelSubmenu({
  contact,
  enrichmentCredits,
  isLoading,
  onChannelSelect,
}: Pick<ContactChannelMenuProps, 'contact' | 'enrichmentCredits' | 'isLoading' | 'onChannelSelect'>) {
  const { t } = useTranslation('engagement')
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <UserCheck className="mr-2 size-4" aria-hidden /> {t('trigger.contact')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <ChannelMenuItems
          contact={contact}
          enrichmentCredits={enrichmentCredits}
          isLoading={isLoading}
          onChannelSelect={onChannelSelect}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function ChannelMenuItems({
  contact,
  enrichmentCredits,
  isLoading,
  onChannelSelect,
  onEnrich,
  onAddToSequence,
  onAddToPlan,
}: Pick<
  ContactChannelMenuProps,
  'contact' | 'enrichmentCredits' | 'isLoading' | 'onChannelSelect' | 'onEnrich' | 'onAddToSequence' | 'onAddToPlan'
>) {
  const { t } = useTranslation('engagement')
  const channels = getMenuChannels(contact)
  const canComplete = onEnrich !== undefined && getMissingChannels(contact).length > 0
  // #2629.2 — LinkedIn seul ne se lit plus comme un « Canaux disponibles »
  // générique : le libellé nomme le repli.
  const fallback = channelFallback(contact)
  // #2091 — distinct de `noCredits` : « on n'a pas encore mesuré le solde »
  // n'est pas « le solde est à zéro ».
  const creditsUnknown = enrichmentCredits === undefined
  const noCredits = !creditsUnknown && enrichmentCredits <= 0
  // Idempotence : même règle que le serveur (`@bellum/contracts`). Une tentative
  // récente restée vide ⇒ on cesse de proposer un clic payant qui ne rapportera
  // rien, sans pour autant condamner le contact (« réessayer quand même » reste
  // offert, et la garde expire d'elle-même).
  const cooldown = enrichmentCooldown(contact)

  return (
    <>
      <DropdownMenuLabel className="text-xs text-[var(--bellum-text-secondary)]">
        {fallback === 'linkedin-only' ? t('trigger.availableChannelsLinkedinOnly') : t('trigger.availableChannels')}
      </DropdownMenuLabel>
      {channels.map(channel => (
        <ChannelItem
          key={channel}
          channel={channel}
          needsPhoneReveal={channelNeedsPhoneReveal(contact, channel)}
          onChannelSelect={onChannelSelect}
        />
      ))}
      {onAddToSequence ? (
        <DropdownMenuItem onSelect={onAddToSequence} className="gap-2">
          <ListChecks className="size-4 text-[var(--bellum-text-secondary)]" />
          {t('trigger.addToSequence')}
        </DropdownMenuItem>
      ) : null}
      {onAddToPlan ? (
        <DropdownMenuItem onSelect={onAddToPlan} className="gap-2">
          <ListPlus className="size-4 text-[var(--bellum-text-secondary)]" />
          {t('trigger.addToPlan')}
        </DropdownMenuItem>
      ) : null}
      {canComplete && onEnrich ? (
        <CompleteMissingItem
          noCredits={noCredits}
          creditsUnknown={creditsUnknown}
          isLoading={isLoading}
          cooldownUntil={cooldown?.lastAttemptAt ?? null}
          onEnrich={onEnrich}
        />
      ) : null}
    </>
  )
}

function ChannelItem({
  channel,
  needsPhoneReveal,
  onChannelSelect,
}: {
  channel: EngagementChannel
  /** #2370 (R41) — l'appel sans numéro révélé : proposé, avec la mention. */
  needsPhoneReveal: boolean
  onChannelSelect: (channel: EngagementChannel) => void
}) {
  const { t } = useTranslation('engagement')
  const Icon = channelIcon(channel)

  return (
    <DropdownMenuItem onSelect={() => onChannelSelect(channel)} className="gap-2">
      <Icon className="size-4 text-[var(--bellum-text-secondary)]" />
      {channelActionLabel(channel)}
      {needsPhoneReveal ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">{t('channel.phoneToReveal')}</span>
      ) : null}
    </DropdownMenuItem>
  )
}

function CompleteMissingItem({
  noCredits,
  creditsUnknown,
  isLoading,
  cooldownUntil,
  onEnrich,
}: {
  noCredits: boolean
  /** #2091 — le solde n'a pas encore été mesuré : bloque le geste comme
   *  `noCredits`, mais le dit avec un libellé DIFFÉRENT — « plus de crédits »
   *  serait une affirmation fausse tant qu'on n'a pas lu le solde. */
  creditsUnknown: boolean
  isLoading: boolean
  /** ISO de la dernière tentative restée vide, ou null si aucune. */
  cooldownUntil: string | null
  onEnrich: (options: { force: boolean }) => void
}) {
  const { t } = useTranslation('engagement')
  const blocked = noCredits || creditsUnknown || isLoading

  if (cooldownUntil) {
    const attemptedOn = new Date(cooldownUntil).toLocaleDateString(i18n.language)
    return (
      <>
        <DropdownMenuSeparator />
        {/* Grisé + explicite : on dit POURQUOI c'est inutile, au lieu de laisser
            l'utilisateur repayer pour découvrir qu'il n'y a rien de plus. */}
        <DropdownMenuItem disabled className="gap-2">
          <Zap className="size-4 text-[var(--bellum-text-secondary)]" />
          {t('trigger.alreadyEnriched', { date: attemptedOn })}
        </DropdownMenuItem>
        {/* Porte de sortie assumée : le coût est annoncé dans le libellé, puis
            reconfirmé par le dialog de l'appelant. */}
        <DropdownMenuItem
          disabled={blocked}
          onSelect={event => {
            event.preventDefault()
            if (!blocked) onEnrich({ force: true })
          }}
          className="gap-2"
        >
          <RotateCcw className="size-4 text-[var(--bellum-text-secondary)]" />
          {t('trigger.retryAnyway')}
        </DropdownMenuItem>
      </>
    )
  }

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={blocked}
        onSelect={event => {
          event.preventDefault()
          if (!blocked) onEnrich({ force: false })
        }}
        className="gap-2"
      >
        <Zap className="size-4 text-[var(--bellum-text-secondary)]" />
        {creditsUnknown
          ? t('trigger.creditsLoading')
          : noCredits
            ? t('trigger.noCredits')
            : t('trigger.completeMissing')}
      </DropdownMenuItem>
    </>
  )
}
