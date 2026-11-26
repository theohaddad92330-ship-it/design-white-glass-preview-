import {
  Box,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityAvatar,
  Input,
  Text,
} from '@bellum/ui'
import {
  CalendarPlus,
  ListChecks,
  Check,
  ChevronRight,
  Linkedin,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { onCooldownCount, planBulkEnrichment } from '@/features/contacts/lib/enrichBilling'
import type {
  EngagementChannel,
  SendableChannel,
} from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { commonAssignee } from '@/features/contacts/selection/commonAssignee'

/** Le membre choisi dans « Attribuer à… ». `null` retire l'attribution. */
export type ContactAssignTarget = { userId: string; name: string } | null

type ContactSelectionPanelProps = {
  contacts: readonly GlobalContact[]
  availableContacts: readonly GlobalContact[]
  activeAction?: ContactSelectionBusyAction | null
  onAddContact: (contact: GlobalContact) => void
  onClear: () => void
  onQuickAction: (action: ContactSelectionAction) => void
  /** Opens the "Envoyer à N contacts" bulk email confirm dialog. */
  onSendBulkEmail: () => void
  /** Opens the "Exécuter une action" (Action Router) dispatch dialog. */
  onExecuteActions: () => void
  /** Membres RÉELS de l'espace (`GET /workspaces/members`). Vide = l'action
   *  « Attribuer à… » se rend désactivée avec sa raison, jamais peuplée de faux. */
  members?: readonly WorkspaceMember[]
  /** Attribue la sélection au membre choisi (ou la libère avec `null`). */
  onAssign: (target: ContactAssignTarget) => void
  assignPending?: boolean
  /** Ajoute chaque contact de la sélection au plan d'action de SON compte. */
  onAddToPlan: () => void
  addToPlanPending?: boolean
  /**
   * #1512 — « Depuis la page Contacts : ajouter une action groupée "Ajouter à
   * une séquence". Elle ouvre le même builder avec les contacts déjà
   * sélectionnés. »
   *
   * C'est bien le MÊME : `CreateSequenceDialog`, la fenêtre de l'écran
   * Séquences, montée avec la sélection. Une seconde fenêtre aurait été un
   * second endroit où la liste des cadences peut diverger.
   */
  onAddToSequence: () => void
  /**
   * #3942.2 — spec de Louis (#3942, 08/10) : « cibler un type de profil,
   * sélectionner toutes les personnes, préparer un mail personnalisé par
   * personne qu'il valide ». Ouvre l'écran de revue, contact par contact —
   * jamais un envoi, un dépôt « préparé » (`PrepareContactsEmailDialog`).
   */
  onPrepareEmails: () => void
  /**
   * #2157.5 — « Créer une cible depuis Contacts ». Ouvre le dialogue qui crée
   * une nouvelle liste (`target-lists`, #2155/#2156) avec la sélection comme
   * éléments — la même notion de cible que /mes-cibles, jamais une seconde.
   */
  onCreateTargetList: () => void
  /**
   * #2964 (#2296.38-.41) — la vérification FORCÉE de toute la sélection.
   * Distincte de « Enrichir maintenant » (`enrich-missing`) : celle-ci
   * interroge le fournisseur pour CHAQUE contact, qu'un champ manque ou non
   * — d'où son propre prédicat de coût (`bulkVerificationCost`), jamais
   * celui de l'enrichissement.
   */
  onVerifyForced: () => void
  verifyPending?: boolean
  /**
   * #4188 — « ces contacts, je les envoie sur mon CRM » : ouvre la prévisualisation puis l'envoi par la porte d'écriture
   * (`CrmPushDialog`). Absent = la règle d'espace refuse la sortie de données : aucun bouton.
   */
  onPushToCrm?: () => void
}

type QuickAction = {
  action: ContactSelectionAction
  label: string
  description: string
  icon: LucideIcon
}

// #2123.72 — l'action groupée ouvre un canal d'ENVOI ; la tâche de prise de
// contact se prépare contact par contact, dans le composer du dossier.
export type ContactSelectionAction = { kind: 'open-channel'; channel: SendableChannel } | { kind: 'enrich-missing' }

export type ContactSelectionBusyAction = EngagementChannel | 'enrich-missing'

/**
 * Résolu à l'appel (render) pour suivre la langue courante.
 *
 * #3822.1 (recette prod 08/10, W 5b4b10d2f3) — l'enrichissement n'a plus
 * d'action rapide ICI : elle disait « Enrichir maintenant », exactement le
 * libellé du bouton chiffré du bas (`selection.enrichNow`), pour le MÊME
 * geste (`handleQuickAction({kind:'enrich-missing'})`) — deux boutons pour un
 * seul réglage (GA-26). Le bouton chiffré, seul à porter le coût, reste la
 * seule porte.
 */
function quickActionDefs(): QuickAction[] {
  return [
    {
      action: { kind: 'open-channel', channel: 'linkedin' },
      label: i18n.t('contacts:selection.actions.linkedinLabel'),
      description: i18n.t('contacts:selection.actions.linkedinDescription'),
      icon: Linkedin,
    },
    {
      action: { kind: 'open-channel', channel: 'email' },
      label: i18n.t('contacts:selection.actions.emailLabel'),
      description: i18n.t('contacts:selection.actions.emailDescription'),
      icon: Mail,
    },
    {
      action: { kind: 'open-channel', channel: 'phone' },
      label: i18n.t('contacts:selection.actions.phoneLabel'),
      description: i18n.t('contacts:selection.actions.phoneDescription'),
      icon: Phone,
    },
  ]
}

function actionKind(action: ContactSelectionAction): ContactSelectionAction['kind'] | EngagementChannel {
  return action.kind === 'open-channel' ? action.channel : action.kind
}

type QuickActionState = QuickAction & {
  disabled: boolean
  disabledReason?: string
}

function QuickActionButton({
  action,
  activeAction,
  onQuickAction,
}: {
  action: QuickActionState
  activeAction?: ContactSelectionBusyAction | null
  onQuickAction: (action: ContactSelectionAction) => void
}) {
  const Icon = action.icon
  const isBusy = activeAction === actionKind(action.action)
  const disabled = isBusy || action.disabled

  return (
    <button
      type="button"
      onClick={() => onQuickAction(action.action)}
      disabled={disabled}
      className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-3 text-left transition-[background-color,color,transform,opacity] hover:bg-[var(--bellum-surface-2)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
    >
      <Box
        display="flex"
        className="size-8 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--bellum-primary-500)_12%,transparent)] transition-colors group-hover:bg-[color-mix(in_srgb,var(--bellum-primary-500)_18%,transparent)]"
      >
        <Icon className="size-4 text-[var(--bellum-text-accent)]" />
      </Box>
      <Box className="min-w-0 flex-1">
        <Text size="sm" weight="medium" className="text-foreground">
          {action.label}
        </Text>
        <Text size="xs" className="mt-0.5 text-muted-foreground">
          {action.disabledReason ?? action.description}
        </Text>
      </Box>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function InfoRow({ icon: Icon, value, label }: { icon: LucideIcon; value: number; label: string }) {
  return (
    <Box display="flex" className="items-center justify-between gap-3 py-2">
      <Box display="flex" className="items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <Text element="span" size="xs">
          {label}
        </Text>
      </Box>
      <Text element="span" size="sm" weight="medium" className="text-foreground">
        {value > 0 ? value : '—'}
      </Text>
    </Box>
  )
}

function AddContactDropdown({
  availableContacts,
  selectedContactIds,
  onAddContact,
  remainingCount,
}: {
  availableContacts: readonly GlobalContact[]
  selectedContactIds: ReadonlySet<string>
  onAddContact: (contact: GlobalContact) => void
  remainingCount: number
}) {
  const { t } = useTranslation('contacts')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const candidates = useMemo(
    () =>
      availableContacts
        .filter(contact => !selectedContactIds.has(contact.id))
        .filter(contact => matchesContactSearch(contact, query))
        .slice(0, 8),
    [availableContacts, query, selectedContactIds],
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={t('selection.addAria')}
          // #2484 — `Button` pose `pointer-coarse:min-h-11` : sans son jumeau
          // en largeur, le rond devenait une ellipse de 40 × 44 sous le doigt.
          className="ml-2.5 flex size-10 items-center justify-center rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] pointer-coarse:min-w-11 text-muted-foreground transition-[background-color,color,transform] hover:text-foreground active:scale-95"
        >
          {remainingCount > 0 ? (
            <Text element="span" size="xs" weight="bold">
              +{remainingCount}
            </Text>
          ) : (
            <Plus className="size-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => event.stopPropagation()}
            placeholder={t('selection.addSearchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--bellum-border)]">
          {candidates.length > 0 ? (
            candidates.map(contact => (
              <button
                key={contact.id}
                type="button"
                onClick={() => {
                  onAddContact(contact)
                  setQuery('')
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--bellum-surface-2)]"
              >
                <ContactAvatar name={contact.full_name} photoUrl={contact.photo_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <Text size="sm" weight="medium" noWrap>
                    {contact.full_name}
                  </Text>
                  <Text size="xs" noWrap className="text-muted-foreground">
                    {contact.title || contact.company_name || t('selection.contactFallback')}
                  </Text>
                </span>
              </button>
            ))
          ) : (
            <Text size="xs" className="px-2 py-3 text-muted-foreground">
              {t('selection.addEmpty')}
            </Text>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * « Attribuer à… » — la même allocation que le portefeuille compte, appliquée à
 * une sélection. La liste est celle des membres RÉELS de l'espace : sans membre
 * chargé, l'action se rend désactivée avec sa raison plutôt que peuplée.
 */
export function AssignSelectionMenu({
  members,
  currentAssignee,
  pending,
  onAssign,
  inline = false,
}: {
  members: readonly WorkspaceMember[]
  /** Porteur commun à TOUTE la sélection, sinon `null` (sélection hétérogène). */
  currentAssignee: string | null
  pending: boolean
  onAssign: (target: ContactAssignTarget) => void
  /** #2120.73 — rendu dans une BARRE (onglet Contacts du dossier) : ni pleine
   *  largeur ni marge haute, qui n'ont de sens que dans la colonne du panneau. */
  inline?: boolean
}) {
  const { t } = useTranslation('contacts')

  if (members.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth={!inline}
        icon={UserPlus}
        className={inline ? undefined : 'mt-3'}
        disabled
        title={t('selection.assign.noMembers')}
      >
        {t('selection.assign.trigger')}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          fullWidth={!inline}
          icon={UserPlus}
          className={inline ? undefined : 'mt-3'}
          disabled={pending}
        >
          {t('selection.assign.trigger')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('selection.assign.menuLabel')}</DropdownMenuLabel>
        {members.map(member => {
          const name = member.fullName ?? member.email ?? t('selection.assign.memberFallback')
          return (
            <DropdownMenuItem key={member.userId} onSelect={() => onAssign({ userId: member.userId, name })}>
              {name}
              {member.isSelf ? (
                <span className="ml-1 text-[var(--bellum-text-muted)]">{t('selection.assign.selfSuffix')}</span>
              ) : null}
              {currentAssignee === member.userId ? (
                <Check className="ml-auto size-4 text-[var(--success-soft-text)]" />
              ) : null}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAssign(null)}>{t('selection.assign.release')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ContactSelectionPanel({
  contacts,
  availableContacts,
  activeAction,
  onAddContact,
  onClear,
  onQuickAction,
  onSendBulkEmail,
  onExecuteActions,
  members = [],
  onAssign,
  assignPending = false,
  onAddToPlan,
  addToPlanPending = false,
  onAddToSequence,
  onPrepareEmails,
  onCreateTargetList,
  onVerifyForced,
  verifyPending = false,
  onPushToCrm,
}: ContactSelectionPanelProps) {
  const { t } = useTranslation('contacts')
  if (contacts.length === 0) return null

  const selectedContactIds = new Set(contacts.map(contact => contact.id))
  const visibleContacts = contacts.slice(0, 3)
  const remainingCount = Math.max(contacts.length - visibleContacts.length, 0)
  const emailCount = contacts.filter(contact => Boolean(contact.email)).length
  const phoneCount = contacts.filter(contact => Boolean(contact.phone)).length
  const linkedinCount = contacts.filter(contact => Boolean(contact.linkedin_url)).length
  // Ce que le contrat FACTURERA, et rien d'autre — le MÊME plan que celui qui
  // choisira les contacts à envoyer, annoncé ICI, sous le bouton qui l'engage,
  // et pas seulement dans la confirmation qui s'ouvre après le clic.
  //
  // Le panneau comptait auparavant « les contacts à qui il manque un champ » —
  // un prédicat écrit ici, différent de celui qui facture : le bouton
  // s'activait pour des contacts qu'aucun crédit ne toucherait, et annonçait un
  // nombre que le débit ne suivait pas. Une dérivation vit à un seul endroit
  // (GA-26), et c'est `planBulkEnrichment`.
  const enrichPlan = planBulkEnrichment(contacts)
  const billableCount = enrichPlan.billableContacts.length
  const cooldownCount = onCooldownCount(enrichPlan.excluded)
  // Une seule dérivation (GA-26) : le motif sous le bouton du bas ET celui de
  // l'action rapide « Enrichir maintenant » viennent de la même ligne.
  const nothingBillableReason =
    billableCount > 0
      ? undefined
      : cooldownCount > 0
        ? t('selection.nothingBillableOnCooldown', { count: cooldownCount })
        : t('selection.nothingBillableDescription')
  const quickActions = buildQuickActions({ emailCount, linkedinCount, phoneCount })

  return (
    <Card className="w-full shrink-0 bg-[color-mix(in_srgb,var(--bellum-surface-1)_92%,transparent)] p-5 shadow-sm lg:w-[340px]">
      <Box display="flex" className="items-start justify-between gap-4">
        <Box display="flex" className="items-center gap-2">
          <Users className="size-4" />
          <Text element="h2" size="sm" weight="semibold" className="text-foreground">
            {t('selection.count', { count: contacts.length })}
          </Text>
        </Box>
        <button
          type="button"
          onClick={onClear}
          aria-label={t('selection.closeAria')}
          // Croix de fermeture icône-seule : plancher tactile aux deux axes
          // (44 px, GA-30), au doigt seulement.
          className="flex items-center justify-center rounded-md p-1 pointer-coarse:min-h-11 pointer-coarse:min-w-11 text-muted-foreground transition-[background-color,color,transform] hover:bg-[var(--bellum-surface-2)] hover:text-foreground active:scale-95"
        >
          <X className="size-4" />
        </button>
      </Box>

      <Box display="flex" className="mt-5 items-center">
        <Box display="flex" className="-space-x-2">
          {visibleContacts.map(contact => (
            <ContactAvatar
              key={contact.id}
              name={contact.full_name}
              photoUrl={contact.photo_url}
              size="md"
              className="ring-2 ring-[var(--bellum-surface-1)]"
            />
          ))}
        </Box>
        <AddContactDropdown
          availableContacts={availableContacts}
          selectedContactIds={selectedContactIds}
          remainingCount={remainingCount}
          onAddContact={onAddContact}
        />
      </Box>

      <Button
        variant="black"
        size="sm"
        fullWidth
        icon={Send}
        className="mt-5"
        onClick={onSendBulkEmail}
        disabled={emailCount === 0}
      >
        {emailCount > 0 ? t('selection.sendDrafted', { count: emailCount }) : t('selection.noEmailToSend')}
      </Button>

      <Button variant="outline" size="sm" fullWidth icon={Zap} className="mt-3" onClick={onExecuteActions}>
        {t('actions:execute.bulkTrigger')}
      </Button>

      {/* Les deux gestes de masse qui manquaient : répartir la sélection entre
          commerciaux, et la verser au plan d'action de chaque compte. */}
      <AssignSelectionMenu
        members={members}
        currentAssignee={commonAssignee(contacts)}
        pending={assignPending}
        onAssign={onAssign}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth
        icon={CalendarPlus}
        className="mt-3"
        onClick={onAddToPlan}
        isLoading={addToPlanPending}
        loadingText={t('selection.plan.adding')}
      >
        {t('selection.plan.trigger')}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth
        icon={ListChecks}
        className="mt-3"
        onClick={onAddToSequence}
      >
        {t('selection.sequence.trigger')}
      </Button>

      {/* #3942.2 — spec de Louis (#3942, 08/10) : cibler un type de profil,
          sélectionner tout le monde, préparer un e-mail PERSONNALISÉ par
          personne — relu et validé un par un, jamais un envoi groupé. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth
        icon={Sparkles}
        className="mt-3"
        onClick={onPrepareEmails}
      >
        {t('prepareEmails.trigger')}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth
        icon={Target}
        className="mt-3"
        onClick={onCreateTargetList}
      >
        {t('selection.targetList.trigger')}
      </Button>

      {onPushToCrm ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          fullWidth
          icon={Upload}
          className="mt-3"
          onClick={onPushToCrm}
        >
          {t('crm:push.sendAccount')}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        icon={<Trash2 className="size-4" />}
        // #2484 — le survol ne change plus la couleur du texte : le mélange
        // `--bellum-danger` × noir tombait à 3,93:1 (clair) et 3,63:1 (sombre)
        // sur le fond de survol. Le fond du bouton fantôme suffit comme retour.
        className="mt-3 w-fit flex items-center gap-2 text-sm font-medium text-[var(--danger-soft-text)] transition-transform active:scale-[0.99]"
      >
        {t('selection.clear')}
      </Button>

      <Box className="mt-2 border-t border-border pt-5">
        <Text element="h3" size="sm" weight="semibold" className="text-foreground">
          {t('selection.quickActionsTitle')}
        </Text>
        <Box className="mt-2">
          {quickActions.map(action => (
            <QuickActionButton
              key={action.label}
              action={action}
              activeAction={activeAction}
              onQuickAction={onQuickAction}
            />
          ))}
        </Box>
      </Box>

      <Box className="mt-2 border-t border-border pt-5">
        <Text element="h3" size="sm" weight="semibold" className="text-foreground">
          {t('selection.infoTitle')}
        </Text>
        <Box className="mt-2 divide-y divide-border/60">
          <InfoRow icon={Users} value={contacts.length} label={t('selection.infoSelected')} />
          <InfoRow icon={Mail} value={emailCount} label={t('selection.infoEmails')} />
          <InfoRow icon={Linkedin} value={linkedinCount} label={t('selection.infoLinkedin')} />
          <InfoRow icon={Phone} value={phoneCount} label={t('selection.infoPhones')} />
        </Box>
      </Box>

      <Button
        variant="black"
        size="sm"
        fullWidth
        icon={Sparkles}
        className="mt-5"
        onClick={() => onQuickAction({ kind: 'enrich-missing' })}
        disabled={activeAction === 'enrich-missing' || billableCount === 0}
      >
        {/* Le coût est sur le BOUTON, avant même la confirmation. Et à zéro
            facturable on n'écrit pas « jusqu'à 0 crédit » : il n'y a pas un
            débit de zéro, il n'y a rien à acheter — c'est ce que dit le
            libellé désactivé. */}
        {billableCount > 0 ? t('selection.enrichNow') : t('selection.nothingBillable')}
      </Button>

      {/* Le prix est SUR le bouton — jamais découvert après coup. Cette ligne
          ne le RÉPÈTE pas : elle explique le « jusqu'à », parce que
          l'enrichissement ne débite que sur un résultat. Deux endroits qui
          disent le même nombre sont deux endroits qui peuvent diverger.

          Et à zéro facturable, elle nomme les DEUX raisons possibles au lieu
          d'affirmer « tout est complet » — qui serait faux pour un contact dont
          le nom reste à confirmer. */}
      <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
        {nothingBillableReason ?? t('bulk.enrichCostHint')}
      </Text>

      {/* #2964 — vérification FORCÉE : son propre bouton, son propre coût sur
          le bouton (jamais découvert après le clic), jamais confondu avec
          « Enrichir maintenant » ci-dessus. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        fullWidth
        icon={RefreshCw}
        className="mt-3"
        onClick={onVerifyForced}
        isLoading={verifyPending}
        loadingText={t('bulkVerify.running')}
      >
        {t('bulkVerify.trigger')}
      </Button>
      <Text size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
        {t('bulkVerify.costHint')}
      </Text>
    </Card>
  )
}

function buildQuickActions({
  emailCount,
  linkedinCount,
  phoneCount,
}: {
  emailCount: number
  linkedinCount: number
  phoneCount: number
}): QuickActionState[] {
  const availableByChannel: Record<SendableChannel, number> = {
    email: emailCount,
    linkedin: linkedinCount,
    phone: phoneCount,
  }

  return quickActionDefs().map(action => {
    // #3822.1 — quickActionDefs() ne rend plus que des actions `open-channel` ;
    // le type reste l'union partagée avec le panneau (ContactSelectionAction),
    // donc on garde la garde de forme plutôt que de supposer le seul membre restant.
    if (action.action.kind !== 'open-channel') return { ...action, disabled: false }
    const availableCount = availableByChannel[action.action.channel]
    if (availableCount > 0) return { ...action, disabled: false }
    return {
      ...action,
      disabled: true,
      disabledReason: missingChannelDescription(action.action.channel),
    }
  })
}

function missingChannelDescription(channel: EngagementChannel): string {
  if (channel === 'linkedin') return i18n.t('contacts:selection.missingLinkedin')
  if (channel === 'phone') return i18n.t('contacts:selection.missingPhone')
  return i18n.t('contacts:selection.missingEmail')
}

function matchesContactSearch(contact: GlobalContact, query: string): boolean {
  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) return true
  return [contact.full_name, contact.title, contact.company_name, contact.email]
    .filter((value): value is string => Boolean(value))
    .some(value => normalizeSearch(value).includes(normalizedQuery))
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}
