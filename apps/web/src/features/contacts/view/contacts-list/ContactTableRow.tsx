import {
  Badge,
  Box,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  TableCell,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertTriangle,
  Copy,
  Ellipsis,
  FileText,
  Linkedin,
  Mail,
  MailX,
  Phone,
  Sparkles,
  UserCheck,
  UserX,
  Zap,
} from 'lucide-react'
import { memo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { capitalize } from '@bellum/utils'
import {
  asksEnrichmentCost,
  CREDIT_WEIGHTS,
  computeContactFieldStatus,
  computeHierarchyLevel,
  contactEnrichActionIsPrimary,
  enrichmentCooldown,
  formatPhoneForDisplay,
  coordinateDisplay,
  looksLikePhoneNumber,
  type ContactStatus,
} from '@bellum/contracts'
import { safeHref } from '@/lib/safe-href'
import { contactOriginSearch } from '@/features/contacts/lib/contactOrigin'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { DoNotContactListBadge, listedDoNotContact } from '@/features/team-guardrails/components/DoNotContactBadge'
import { useDoNotContactList } from '@/features/team-guardrails/hooks'
import {
  contactSourceLabel,
  enrichedPhoneOriginDate,
  formatContactDate,
} from '@/features/contacts/lib/contactProvenance'
import { contactRowAction } from '@/features/contacts/lib/contactRowAction'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'
import { useFormatName } from '@/features/preferences/formatName'
import { EnrichConfirmDialog, type EnrichmentScope } from '@/features/contacts/components/EnrichConfirmDialog'
import { CoordinateSearchState, type CoordinateChannel } from './CoordinateSearchState'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useEnrichmentInFlight } from '@/features/contacts/hooks/useEnrichmentInFlight'
import { useEnrichmentCostPreference } from '@/features/contacts/hooks/useEnrichmentCostPreference'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { toEngagementContact } from '@/features/contacts/lib/toEngagementContact'
import { ContactChannelSubmenu } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactChannelMenu'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { contactScore, scoreLabel } from '@/features/contacts/view/contact-detail/contactDerive'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { ContactAssignSubmenu } from './ContactAssignSubmenu'
import { ContactSignedMissionsBadge } from './ContactSignedMissionsBadge'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { EmailWithBreaks } from '@/components/contacts/EmailWithBreaks'
import { headquartersCity } from '@/features/accounts/view/account-detail/tabs/synthesis/accountSynthesis'
import { formatDate } from '@/lib/locale'
import { contactsColumnClass } from './contactsTableColumns'

type ContactTableRowProps = {
  contact: GlobalContact
  isSelected: boolean
  onRowMouseDown: (event: MouseEvent<HTMLTableRowElement>) => void
  onRowMouseEnter: () => void
  onSelectionChange: (selected: boolean) => void
  /** #4597.4 — « Origine » est un filtre : cliquer la source filtre la liste dessus. Absent = simple texte. */
  onFilterBySource?: (source: string) => void
}

type ActionKind = 'enrich' | 'identity' | 'generate' | 'contact'

// #3713.a — recette prod 09/10 : ligne à 62 px au lieu des 56 px promis (lot H07). `p-2` (8 px) de la
// cellule par défaut → `py-1` (4 px) : -8 px de hauteur, aucune cible tactile touchée (`pointer-coarse:min-h-11`
// des boutons internes garde la ligne >= 44 px au doigt).
const ROW_CELL =
  'py-1 [[data-density=compact]_&]:py-0 transition-colors group-hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] group-data-[state=selected]:bg-[color-mix(in_srgb,var(--bellum-text-primary)_7%,transparent)]'

/** #4503.5 — la teinte du badge « Relation » : neutre à contacter, accent doux quand l'échange est engagé. */
const RELATION_BADGE_VARIANT: Record<ContactStatus, 'outline' | 'primary' | 'default'> = {
  new: 'outline',
  contacted: 'primary',
  replied: 'primary',
  meeting: 'primary',
  refused: 'default',
  silence: 'default',
}

export const ContactTableRow = memo(function ContactTableRow({
  contact: c,
  isSelected,
  onRowMouseDown,
  onRowMouseEnter,
  onSelectionChange,
  onFilterBySource,
}: ContactTableRowProps) {
  const { t } = useTranslation('contacts')
  const formatName = useFormatName()
  const doNotContactList = useDoNotContactList()
  const navigate = useNavigate()
  const enrichMutation = useEnrichContact()
  // #AM.39 — « en cours » vient aussi de l'index serveur : l'opération lancée avant de quitter l'écran se retrouve dans la liste.
  const inFlight = useEnrichmentInFlight()
  const enrichingNow = enrichMutation.isPending || inFlight.isInFlight(c.id)
  // #3687.16 — « retour : origine, filtres, position ». La liste porte déjà
  // ses filtres dans l'URL (bookmarkables, `routes/contacts/index.tsx`) ;
  // `strict: false` les lit sans exiger un match exact de route (seule façon
  // de rester inoffensif dans les tests qui ne montent pas `/contacts/`).
  // Rien à restaurer (liste nue) : aucun paramètre n'est ajouté, la ligne
  // garde EXACTEMENT son `href`/sa navigation d'avant (#2719).
  const listSearch = useSearch({ strict: false })
  const listOriginSearch =
    Object.keys(listSearch).length > 0
      ? contactOriginSearch({ kind: 'list', search: JSON.stringify(listSearch) })
      : undefined
  const openDetail = () =>
    navigate({ to: '/contacts/$id', params: { id: c.id }, ...(listOriginSearch ? { search: listOriginSearch } : {}) })
  // Transparence billing (addendum Théo p.11) : le débit (1 crédit) ne part
  // qu'après la confirmation — voir EnrichConfirmDialog en fin de ligne.
  const [enrichConfirmOpen, setEnrichConfirmOpen] = useState(false)
  // #2988 (recette écran 28/09/2026) — « sur /contacts, cliquer Enrichir
  // enrichit DIRECTEMENT, sans proposer de portée ». Le menu ⋯ montait déjà
  // `EnrichConfirmDialog`, mais sans `coordinateScope` : même sélecteur que
  // `ContactContent.tsx` (GA-26), armé à « les deux » à chaque ouverture — le
  // choix d'un enrichissement précédent ne fuite pas sur le suivant.
  const [enrichScope, setEnrichScope] = useState<EnrichmentScope>('both')
  // #4016.L8b — « ne plus me demander » : UN contact, un crédit, le prix écrit sur le déclencheur.
  const engagement = useOptionalContactEngagement()
  const workspaceMembers = useWorkspaceMembers()
  const enrichCost = useEnrichmentCostPreference()
  const asksCost = asksEnrichmentCost({ skip: enrichCost.skip, credits: CREDIT_WEIGHTS.contact_enrichment })
  // #1473 — un contact à qualifier n'a pas de société. La chaîne vide est ce que
  // le hook attend déjà quand rien n'est connu : la recherche part sur le nom
  // seul, elle n'invente pas un employeur.
  // Théo B c1-repertoire.N5 (Louis 22/10) — « Chercher / disponible » : enrichissement CIBLÉ d'un seul champ.
  const searchChannel = (channel: CoordinateChannel) => {
    setEnrichScope(channel)
    if (asksCost) setEnrichConfirmOpen(true)
    else
      enrichMutation.mutate({
        contact: toEngagementContact(c),
        accountCompanyName: c.company_name ?? '',
        only: channel,
      })
  }
  const enrich = () =>
    enrichMutation.mutate({
      contact: toEngagementContact(c),
      accountCompanyName: c.company_name ?? '',
      ...(enrichScope !== 'both' ? { only: enrichScope } : {}),
    })

  // Identity gate (Théo P0): a prénom-seul contact is "identité incomplète" and
  // must not be messaged — see contactRowAction.
  const actionKind: ActionKind = contactRowAction(c)
  // Show the ROLE instead of an unconfirmed role-persona placeholder name.
  const identity = contactDisplayIdentity(c)
  // Le nom TEL QU'IL EST AFFICHÉ — c'est lui que `title` doit rendre, et pas
  // `identity.label` brut : montrer au survol une autre forme que celle qu'on
  // lit serait une seconde vérité (#2465).
  const displayedName = identity.roleToIdentify ? identity.label : formatName(identity.label)

  const cooldown = enrichmentCooldown(c)
  // Le palier d'organisation, par le SEUL calcul du dépôt (`computeHierarchyLevel`,
  // miroir de `hierarchy_level.py`) — jamais un barème réécrit ici. Il ne dit pas
  // « à contacter » : c'est un rang, pas une priorité, et le titre seul n'a
  // jamais eu le droit d'établir la seconde.
  const hierarchyLevel = computeHierarchyLevel(c.title)

  // #2158.76 — « ligne tabulable + Entrée ouvre la fiche » (recette 6 du
  // registre écrans secondaires, 16/09/2026). La ligne n'avait ni `tabIndex`,
  // ni `onKeyDown`, ni `role` : atteignable à la souris seulement (GA-35).
  // `event.target !== event.currentTarget` : le clavier sur un enfant
  // (checkbox, lien, menu d'actions) ne doit PAS aussi déclencher la
  // navigation — chacun garde son propre geste.
  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDetail()
  }

  // #4503.5 — « Coordonnées » : e-mail ET téléphone EN CLAIR (c87), chacun avec « copier » ; une adresse absente
  // se DIT (« E-mail absent »), un numéro absent ne fait aucune ligne. Seul un NUMÉRO s'affiche (#3821).
  const phone = c.phone && looksLikePhoneNumber(c.phone) ? c.phone : null
  const emailStatus = computeContactFieldStatus({
    value: c.email,
    enrichmentAttempted: Boolean(c.last_enrichment_at),
    errored: c.enrichment_coordinates?.email?.state === 'unknown',
  })
  const phoneStatus = computeContactFieldStatus({
    value: phone,
    enrichmentAttempted: Boolean(c.last_enrichment_at),
    errored: c.enrichment_coordinates?.phone?.state === 'unknown',
  })
  const phoneOriginDate = enrichedPhoneOriginDate(c)
  const copyValue = async (value: string, kind: 'email' | 'phone') => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(value)
      toast.success(kind === 'email' ? t('table.emailCopied') : t('table.phoneCopied'))
    } catch {
      toast.error(kind === 'email' ? t('table.emailCopyFailed') : t('table.phoneCopyFailed'))
    }
  }
  // #4503.5 — « Relation » : UN badge (la déclaration du commercial ; « new » se lit « À contacter », même mot que la
  // fiche) et le responsable nommé, ou « Non attribué ». Un porteur inconnu ne fait aucune ligne.
  const contactScoreValue = (c as { contact_score?: number | null }).contact_score
  const owner = c.assigned_to ? workspaceMembers.data?.find(member => member.userId === c.assigned_to) : undefined
  const ownerName = owner ? (owner.fullName ?? owner.email ?? null) : null
  // #4503 — la ville du COMPTE, tirée de son siège comme la liste des comptes (#4497.a) ; `null` = aucune ligne.
  const accountCity = c.account_id ? headquartersCity(c.account_headquarters) : null
  // #4295.11 — un contact de la liste « ne pas contacter » ne se lit JAMAIS « À contacter » : la relation dit l'interdit.
  const isDoNotContact = Boolean(listedDoNotContact(doNotContactList.data?.items, c.id, c.email))
  const relationLabel = isDoNotContact
    ? t('badge.doNotContact', { ns: 'teamGuardrails' })
    : c.user_status === 'new'
      ? t('relationBadge.to_contact')
      : t(`status.value.${c.user_status}`)
  // #4503.5 — « Origine » : la source (jamais un fournisseur nommé, `contactSourceLabel`) et sa précision datée.
  const addedOn = formatContactDate(c.created_at)
  const updatedOn = formatContactDate(c.updated_at)
  // Théo `title` du nom : dates et palier, ce que la ligne ne montre plus en clair (C1.A8).
  const nameTooltip = [
    displayedName,
    addedOn ? t('table.addedOn', { date: addedOn }) : null,
    updatedOn ? t('table.updatedOn', { date: updatedOn }) : null,
    hierarchyLevel !== 'unknown' ? t('table.levelTooltip', { level: t(`hierarchy.${hierarchyLevel}`) }) : null,
    c.entity ? t('table.entityTooltip', { entity: c.entity }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <TableRow
      onMouseDown={onRowMouseDown}
      onMouseEnter={onRowMouseEnter}
      onKeyDown={handleRowKeyDown}
      tabIndex={0}
      data-state={isSelected ? 'selected' : undefined}
      className="group relative cursor-pointer border-transparent"
    >
      {/* #4503.5 — « Contact & fonction » : avatar, nom, fonction ENTIÈRE (elle passe à la ligne, jamais tronquée),
          pastille « Décideur » discrète sous la fonction, puis les alertes de la personne. Quittent la ligne :
          « Nom à révéler » (dit par « Enrichir »), le cycle Détecté/Actionnable. */}
      <TableCell className={cn(contactsColumnClass('identity'), 'rounded-l-xl pl-3 pr-4 align-top', ROW_CELL)}>
        {/* #2719 — un vrai `<a href>` étiré sur toute la ligne : clic droit, ctrl/cmd-clic et clic molette natifs.
            `tabIndex={-1}` + `aria-hidden` : la ligne reste tabulable par ELLE-MÊME (#2158.76). */}
        <Link
          to="/contacts/$id"
          params={{ id: c.id }}
          {...(listOriginSearch ? { search: listOriginSearch } : {})}
          tabIndex={-1}
          aria-hidden="true"
          onClick={e => e.stopPropagation()}
          className="absolute inset-0 z-0"
        />
        <Box display="flex" className="min-w-0 items-start gap-3 py-1">
          <Box
            display="flex"
            className="relative z-10 mt-2 w-5 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[selected=true]:opacity-100 pointer-coarse:opacity-100"
            data-selected={isSelected}
            onClick={e => e.stopPropagation()}
          >
            <Checkbox
              checked={isSelected}
              aria-label={t('table.selectAria', { name: c.full_name || t('table.thisContact') })}
              onCheckedChange={checked => onSelectionChange(checked === true)}
            />
          </Box>
          <ContactAvatar name={identity.label} photoUrl={c.photo_url} size="sm" />
          <Box className="min-w-0 flex-1">
            {/* LOIC-FIX O.4 — le nom est le lien nommé et tabulable vers la fiche (GA-32 / GA-35). */}
            <Link
              to="/contacts/$id"
              params={{ id: c.id }}
              {...(listOriginSearch ? { search: listOriginSearch } : {})}
              title={nameTooltip}
              aria-label={t('table.openRecord', { name: displayedName || t('table.thisContact') })}
              onClick={e => e.stopPropagation()}
              data-testid="contact-row-name"
              className="relative z-10 block break-words text-sm font-semibold text-[var(--bellum-text-primary)] outline-none hover:text-[var(--bellum-text-accent)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              {displayedName}
            </Link>
            {/* #4586.5 — le nom vient de l'adresse e-mail (marqueur posé à l'écriture, ou ligne antérieure à la garde) : estimé, jamais une saisie. */}
            {c.name_derived_from_email ? (
              <span data-testid="contact-row-name-derived" className="mt-0.5 inline-flex">
                <EstimatedBadge basis={t('table.nameFromEmail')} />
              </span>
            ) : null}
            {identity.roleToIdentify ? (
              <Badge
                variant="outline"
                title={t('table.roleToIdentify')}
                className="mt-0.5 gap-1 border-[var(--bellum-warning)] px-1 py-0 text-xs text-[var(--warning-soft-text)]"
              >
                <UserX className="size-2.5" aria-hidden /> {t('table.roleToIdentify')}
              </Badge>
            ) : c.title ? (
              <Text
                element="p"
                size="xs"
                data-testid="contact-row-title"
                color="text-[var(--bellum-text-secondary)]"
                className="break-words"
              >
                {c.title}
              </Text>
            ) : null}
            {/* #4503 — où travaille la PERSONNE (`location`), distinct de la ville du compte : jamais l'un pour l'autre. */}
            {c.location ? (
              <Text element="p" size="xs" data-testid="contact-row-location" color="text-[var(--bellum-text-muted)]">
                {c.location}
              </Text>
            ) : null}
            <DecisionMakerBadge role={c.decision_role} className="mt-1" />
            {/* `overflow-hidden` : un `<td>` de `table-fixed` ne clippe pas ses pastilles (GA-255). Compacter masque. */}
            <Box className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 overflow-hidden empty:hidden [[data-density=compact]_&]:hidden">
              {/* #4158.52 — « Ne pas contacter » aussi dans la liste (même badge, même texte que la fiche). */}
              <DoNotContactListBadge contactId={c.id} email={c.email} />
              {/* RISQUE — l'employeur détecté ne correspond ni au compte ni à l'entité : probablement partie. */}
              {c.source_tag === 'RISQUE' && (
                <Badge
                  variant="danger"
                  title={
                    c.last_enrichment_at
                      ? t('table.riskTitleDated', { date: formatDate(new Date(c.last_enrichment_at)) })
                      : t('table.riskTitle')
                  }
                  className="shrink-0 gap-1 px-1.5 py-0"
                >
                  <UserX className="size-2.5" aria-hidden /> {t('table.risk')}
                </Badge>
              )}
              {/* #4290.12 — la PREUVE datée d'un départ, lue du serveur. Absente = aucun badge. */}
              {c.employment_left && (
                <Badge
                  variant="danger"
                  data-testid="employment-left-badge"
                  title={t('keyInfo.employmentLeft', {
                    organization: c.employment_left.organization,
                    date: formatDate(new Date(c.employment_left.at)),
                  })}
                  className="shrink-0 gap-1 px-1.5 py-0"
                >
                  <UserX className="size-2.5" aria-hidden /> {t('table.employmentLeft')}
                </Badge>
              )}
              {/* #2632.1 — ARRIVEE, miroir de RISQUE : la personne vient d'arriver. */}
              {c.source_tag === 'ARRIVEE' && (
                <Badge
                  variant="success"
                  title={
                    c.last_enrichment_at
                      ? t('table.arrivalTitleDated', { date: formatDate(new Date(c.last_enrichment_at)) })
                      : t('table.arrivalTitle')
                  }
                  className="shrink-0 gap-1 px-1.5 py-0"
                >
                  <UserCheck className="size-2.5" aria-hidden /> {t('table.arrival')}
                </Badge>
              )}
              {/* #2296.10/.36/.37 — deux sources d'emploi en désaccord : le désaccord se DIT. */}
              {c.employer_conflict && (
                <Badge
                  variant="warning"
                  title={t('table.employerConflictTitle', { employer: c.employer_conflict.detectedEmployer })}
                  className="shrink-0 gap-1 px-1.5 py-0"
                >
                  <AlertTriangle className="size-2.5" aria-hidden /> {t('table.employerConflict')}
                </Badge>
              )}
              {/* §4.2 — « ce contact a signé N missions » ; muet quand rien n'est signé. */}
              <ContactSignedMissionsBadge contactId={c.id} />
            </Box>
          </Box>
        </Box>
      </TableCell>

      {/* #4503.5 — « Compte » : le nom (lien vers le compte) et la ville DU COMPTE (son siège, #4503 recette 25/10 —
          le lieu de travail de la personne ne couvrait qu'une ligne sur trois ; il reste lu sous la fonction).
          Quittent la ligne : le logo et le rang « N° ». Sans compte : « à qualifier ». */}
      <TableCell className={cn(contactsColumnClass('company'), 'align-top', ROW_CELL)}>
        <Box className="min-w-0 py-1">
          {c.account_id && c.company_name ? (
            <Link
              to="/accounts/$id"
              params={{ id: c.account_id }}
              onClick={e => e.stopPropagation()}
              title={c.entity ? `${capitalize(c.company_name)} · ${c.entity}` : capitalize(c.company_name)}
              data-testid="contact-row-account"
              className="relative z-10 block break-words text-sm font-semibold text-[var(--bellum-text-primary)] hover:text-[var(--bellum-text-accent)]"
            >
              {capitalize(c.company_name)}
            </Link>
          ) : (
            <Text element="span" size="sm" className="block" color="text-[var(--bellum-text-muted)]">
              {c.company_name ? capitalize(c.company_name) : t('table.companyUnknown')}
            </Text>
          )}
          {accountCity ? (
            <Text element="p" size="xs" data-testid="contact-row-city" color="text-[var(--bellum-text-muted)]">
              {accountCity}
            </Text>
          ) : null}
        </Box>
      </TableCell>

      {/* #4503.5 — « Coordonnées » : e-mail et téléphone EN CLAIR, « copier » sur chacun, ou « E-mail absent ». */}
      <TableCell className={cn(contactsColumnClass('contact'), 'align-top text-xs', ROW_CELL)}>
        <Box className="relative z-10 space-y-1 py-1" onClick={e => e.stopPropagation()}>
          {c.email ? (
            <Box display="flex" className="min-w-0 items-start gap-1.5">
              <Mail
                aria-hidden="true"
                data-testid="contact-row-icon-email"
                className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]"
              />
              {/* Recette 21/10 A.5 — l'adresse entière, coupée seulement après « @ » ou « . ». */}
              <a
                href={`mailto:${c.email}`}
                title={c.email}
                className="min-w-0 text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
              >
                <EmailWithBreaks email={c.email} />
              </a>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  void copyValue(c.email ?? '', 'email')
                }}
                title={t('table.copyEmailAria')}
                aria-label={t('table.copyEmailAria')}
                className="inline-flex shrink-0 items-center justify-center text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-accent)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                <Copy className="size-3" aria-hidden="true" />
              </button>
              {/* #4016 L4.1 — une adresse ESTIMÉE se badge, jusque dans la liste. */}
              {c.email_estimated_at ? <EstimatedBadge verifiedAt={c.email_estimated_at} className="shrink-0" /> : null}
            </Box>
          ) : (
            <Box className="space-y-0.5">
              {/* #4503.3 — UN seul état par coordonnée : quand la source annonce l'adresse (« E-mail disponible »),
                  « E-mail absent » ne s'écrit pas à côté — les deux libellés ensemble se contredisaient (Vicenzo C.). */}
              {coordinateDisplay(c, 'email').kind === 'available' ? null : (
                <Text
                  element="p"
                  size="xs"
                  data-testid="contact-row-email-missing"
                  color="text-[var(--bellum-text-muted)]"
                >
                  {t('table.emailMissing')}
                </Text>
              )}
              {/* #3822.2 — une PANNE se distingue d'un « non trouvé » ; N5 — sinon ce que la source annonce, ou
                  « Chercher », ou « Introuvable · date » (`computeContactFieldStatus`, une seule fois, GA-26). */}
              {emailStatus === 'error' ? (
                <span title={t('table.emailError')} className="block text-[var(--bellum-text-muted)]">
                  {t('table.errorShort')}
                </span>
              ) : (
                <CoordinateSearchState
                  contact={c}
                  channel="email"
                  attemptedAt={emailStatus === 'not_found' ? c.last_enrichment_at : null}
                  onSearch={searchChannel}
                  disabled={enrichingNow}
                />
              )}
            </Box>
          )}
          {/* #2733 — un rebond de livraison se NOMME (c73), à côté de l'adresse qu'il concerne. */}
          {c.email_bounced_at ? (
            <Badge variant="danger" title={t('table.emailBouncedTitle')} className="gap-1 px-1.5 py-0">
              <MailX className="size-2.5" aria-hidden /> {t('table.emailBounced')}
            </Badge>
          ) : null}
          {phone ? (
            <Box display="flex" className="min-w-0 items-start gap-1.5">
              <Phone
                aria-hidden="true"
                data-testid="contact-row-icon-phone"
                className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]"
              />
              <span className="min-w-0">
                {/* #3850.4 — affichage international lisible, en clair (c87), jamais tronqué (#3549.6). */}
                <a
                  href={`tel:${phone.replace(/\s+/g, '')}`}
                  title={formatPhoneForDisplay(phone)}
                  className="block break-words text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-accent)]"
                >
                  {formatPhoneForDisplay(phone)}
                </a>
                {/* J1b #3822 — d'où vient le numéro : « Enrichissement » + date, jamais le fournisseur. */}
                {phoneOriginDate ? (
                  <span className="block leading-tight text-[var(--bellum-text-muted)]">
                    {t('table.phoneOrigin', { date: formatContactDate(phoneOriginDate) ?? phoneOriginDate })}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation()
                  void copyValue(formatPhoneForDisplay(phone), 'phone')
                }}
                title={t('table.copyPhoneAria')}
                aria-label={t('table.copyPhoneAria')}
                className="inline-flex shrink-0 items-center justify-center text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-accent)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
              >
                <Copy className="size-3" aria-hidden="true" />
              </button>
            </Box>
          ) : phoneStatus === 'error' ? (
            <span title={t('table.phoneError')} className="block text-[var(--bellum-text-muted)]">
              {t('table.errorShort')}
            </span>
          ) : (
            <CoordinateSearchState
              contact={c}
              channel="phone"
              attemptedAt={phoneStatus === 'not_found' ? c.last_enrichment_at : null}
              onSearch={searchChannel}
              disabled={enrichingNow}
            />
          )}
          {c.linkedin_url ? (
            <a
              href={safeHref(c.linkedin_url)}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="contact-row-icon-linkedin"
              title={t('table.viewOnLinkedin')}
              aria-label={t('table.viewOnLinkedin')}
              className="inline-flex items-center gap-1.5 text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
            >
              <Linkedin className="size-3.5 shrink-0" aria-hidden />
              {/* Sans e-mail, le profil est le seul chemin écrit : il se nomme en clair (comme avant #4503). */}
              {c.email ? null : 'LinkedIn'}
            </a>
          ) : null}
        </Box>
      </TableCell>

      {/* #4503.5 — « Relation » : un badge et le responsable. Le palier rejoint l'infobulle du nom ; « Déjà
          contacté » se lit dans le badge lui-même ; la priorité garde son MOT, discret, à côté du responsable. */}
      <TableCell data-column="relation" className={cn(contactsColumnClass('relation'), 'align-top', ROW_CELL)}>
        <Box className="space-y-1 py-1">
          <Badge
            variant={isDoNotContact ? 'warning' : RELATION_BADGE_VARIANT[c.user_status]}
            data-testid="contact-row-relation"
            className="whitespace-nowrap"
          >
            {relationLabel}
          </Badge>
          {/* #4503.3 — sous un champ nommé, l'absence se NOMME : « Non attribué » (jamais une case vide). Un `assigned_to`
              posé dont le membre n'est pas résolu ne dit rien : ce n'est pas « non attribué ». */}
          {ownerName || !c.assigned_to || typeof contactScoreValue === 'number' ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="break-words">
              {ownerName ? <span data-testid="contact-row-owner">{ownerName}</span> : null}
              {!ownerName && !c.assigned_to ? (
                <span data-testid="contact-row-owner-none" className="text-[var(--bellum-text-muted)]">
                  {t('table.ownerNone')}
                </span>
              ) : null}
              {(ownerName || !c.assigned_to) && typeof contactScoreValue === 'number' ? ' · ' : null}
              {/* LOIC-FIX O.3 — UN score, une source : seulement si le serveur l'a calculé ; en MOT, jamais en points. */}
              {typeof contactScoreValue === 'number' ? (
                <span data-testid="contact-row-score" className="text-[var(--bellum-text-muted)]">
                  {scoreLabel(contactScore(c))}
                </span>
              ) : null}
            </Text>
          ) : null}
        </Box>
      </TableCell>

      {/* #4503.5 — « Origine » : la source et sa précision (date d'ajout ; un enrichissement récent resté vide).
          Quitte la ligne : « Mis à jour le … lu dans un outil connecté » (la date reste dans l'infobulle du nom). */}
      <TableCell
        data-column="commercial"
        className={cn(contactsColumnClass('commercial'), 'rounded-r-xl pr-3 align-top pointer-coarse:pr-2', ROW_CELL)}
      >
        <Box display="flex" className="items-start justify-between gap-2 py-1">
          <Box className="min-w-0">
            {c.source ? (
              <Text element="span" size="sm" data-testid="contact-row-origin" className="block break-words">
                {onFilterBySource ? (
                  // #4597.4 — un clic sur l'origine FILTRE la liste sur elle ; la ligne (ouverture de la fiche) n'en sait rien.
                  <button
                    type="button"
                    title={t('table.filterByOrigin', { origin: contactSourceLabel(c.source) })}
                    onClick={event => {
                      event.stopPropagation()
                      onFilterBySource(c.source as string)
                    }}
                    className="inline-flex min-h-11 min-w-11 items-center break-words text-left underline-offset-2 hover:underline focus-visible:underline"
                  >
                    {contactSourceLabel(c.source)}
                  </button>
                ) : (
                  contactSourceLabel(c.source)
                )}
              </Text>
            ) : null}
            {addedOn ? (
              <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                {t('table.addedOn', { date: addedOn })}
              </Text>
            ) : null}
            {/* #2297.26 — sous délai de protection d'enrichissement : le lot l'exclura, la ligne le dit avant. */}
            {cooldown ? (
              <Text
                element="p"
                size="xs"
                title={t('table.recentlyEnrichedTitle', { date: formatDate(cooldown.retryAvailableAt) ?? '' })}
                color="text-[var(--bellum-text-muted)]"
              >
                {t('table.recentlyEnriched')}
              </Text>
            ) : null}
          </Box>
          <Box className="relative z-10 shrink-0" onClick={e => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label={t('table.actionsOn', { name: displayedName || t('table.thisContact') })}
                  title={t('table.actionsOn', { name: displayedName || t('table.thisContact') })}
                >
                  <Ellipsis className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openDetail}>
                  <FileText className="mr-2 size-4" aria-hidden /> {t('table.viewDetail')}
                </DropdownMenuItem>
                {/* #2160.9 — même porte que la fiche et le panneau de sélection, sans quitter la liste. */}
                <ContactAssignSubmenu contactId={c.id} currentOwnerId={c.assigned_to} />
                {/* SIMON-FIX S.22 — « Contacter » depuis la ligne : le menu de la fiche, en sous-menu. */}
                {engagement && !contactEnrichActionIsPrimary(c) ? (
                  <ContactChannelSubmenu
                    contact={toEngagementContact(c)}
                    enrichmentCredits={undefined}
                    isLoading={false}
                    onChannelSelect={channel => engagement.openEngagement([toEngagementContact(c)], channel)}
                  />
                ) : null}
                <DropdownMenuSeparator />
                {actionKind === 'contact' ? (
                  <>
                    <DropdownMenuItem
                      disabled={!c.email}
                      onClick={() => {
                        window.location.href = `mailto:${c.email}`
                      }}
                    >
                      <Mail className="mr-2 size-4" aria-hidden /> {t('table.contactByEmail')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!c.linkedin_url}
                      onClick={() => window.open(c.linkedin_url ?? '', '_blank', 'noopener,noreferrer')}
                    >
                      <Linkedin className="mr-2 size-4" aria-hidden /> {t('table.contactViaLinkedin')}
                    </DropdownMenuItem>
                  </>
                ) : actionKind === 'identity' ? (
                  <DropdownMenuItem disabled>
                    <UserX className="mr-2 size-4" aria-hidden /> {t('table.identityIncomplete')}
                  </DropdownMenuItem>
                ) : actionKind === 'generate' ? (
                  <DropdownMenuItem onClick={openDetail}>
                    <Sparkles className="mr-2 size-4" aria-hidden /> {t('table.generateMessage')}
                  </DropdownMenuItem>
                ) : null}
                {/* Théo B c1-repertoire.A10 — « Enrichir les coordonnées » reste au menu de ligne, coût annoncé
                    avant le débit (EnrichConfirmDialog). Une coordonnée manquante se cherche ICI (#4503.5). */}
                {actionKind === 'enrich' || !c.email || !phone ? (
                  <DropdownMenuItem
                    disabled={enrichingNow}
                    onClick={() => {
                      setEnrichScope(!c.email && phone ? 'email' : c.email && !phone ? 'phone' : 'both')
                      // #4016.L8b — préférence posée : le clic EST le geste.
                      if (asksCost) setEnrichConfirmOpen(true)
                      else
                        enrichMutation.mutate({
                          contact: toEngagementContact(c),
                          accountCompanyName: c.company_name ?? '',
                          ...(!c.email && phone ? { only: 'email' as const } : {}),
                          ...(c.email && !phone ? { only: 'phone' as const } : {}),
                        })
                    }}
                  >
                    <Zap className="mr-2 size-4" aria-hidden />
                    {enrichingNow
                      ? t('enrich.loading')
                      : contactEnrichActionIsPrimary(c)
                        ? t('table.enrichPrimary')
                        : t('table.enrichEmail')}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <EnrichConfirmDialog
              open={enrichConfirmOpen}
              onOpenChange={setEnrichConfirmOpen}
              count={1}
              coordinateScope={enrichScope}
              onCoordinateScopeChange={setEnrichScope}
              onConfirm={enrich}
              onDontAskAgain={() => enrichCost.setSkip(true)}
            />
          </Box>
        </Box>
      </TableCell>
    </TableRow>
  )
}, areContactTableRowPropsEqual)

function areContactTableRowPropsEqual(previous: ContactTableRowProps, next: ContactTableRowProps): boolean {
  return previous.contact === next.contact && previous.isSelected === next.isSelected
}
