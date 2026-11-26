import { isToRevalidate, type Contact, type EnrichmentCoordinate } from '@bellum/contracts'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EntityAvatar,
  Text,
} from '@bellum/ui'
import { motion } from 'framer-motion'
import {
  CalendarPlus,
  Check,
  ChevronRight,
  Ellipsis,
  EyeOff,
  FileText,
  Linkedin,
  Mail,
  PenLine,
  Pencil,
  UserX,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { safeHref } from '@/lib/safe-href'
import { formatDate, formatMonth } from '@/lib/locale'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { ContactCrmOriginBadge } from '@/features/crm/view/CrmProvenance'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { contactPlaceLabel } from '@/features/contacts/lib/contactPlace'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'
import { ContactVerificationBadge } from '@/features/contacts/components/ContactVerificationBadge'
import { DoNotContactListBadge } from '@/features/team-guardrails/components/DoNotContactBadge'
import { useContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import { useAddContactsToPlan } from '@/features/contacts/hooks/useAddContactsToPlan'
import { useHideContact } from '@/features/contacts/hooks/useHideContact'
import { ContactPriorityBadge } from '@/features/contacts/components/ContactPriorityBadge'
import { statusBadge } from '../../components/Badges'
import { ContactOutcomeSubmenu } from './ContactOutcomeSubmenu'
import { CommercialOutcomeSubmenu } from './CommercialOutcomeSubmenu'
import { layoutTransition, rowTransition } from './motionConfig'
import { EmailWithBreaks } from '@/components/contacts/EmailWithBreaks'
import { ContactCoordinatesCell, ContactEnrichAction } from '@/features/contacts/components/ContactCoordinatesCell'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { ContactDepartureBadge } from '@/features/contacts/components/ContactDepartureBadge'
import { contactDeparture } from '@/features/contacts/lib/contactDeparture'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { ContactRecordCard } from '@/features/contacts/view/contact-detail/components/ContactRecordCard'

/** #2120.71-75 — la case de sélection multiple de la ligne. Absente = pas de case. */
type RowSelection = { selected: boolean; onToggle: () => void }

export function CompactContactRow({
  contact,
  onContactClick,
  selection,
  accountName,
}: {
  contact: Contact
  /** #4465.2 — le nom du compte : le départ se déduit du parcours contre lui. */
  accountName?: string | null
  onContactClick?: (contact: Contact) => void
  selection?: RowSelection
}) {
  const openDetail = () => onContactClick?.(contact)
  const { t } = useTranslation('accountOrg')
  // Théo A comptes-fiche.R5 — l'enrichissement CIBLÉ d'un champ (`only`) ou du contact entier (« Enrichir »).
  const enrich = useEnrichContact()
  // Le coût s'annonce avant le débit (GA-49) : le geste arme l'état, la confirmation déclenche.
  const [pendingEnrich, setPendingEnrich] = useState<{ only?: EnrichmentCoordinate } | null>(null)
  const enrichContact = (only?: EnrichmentCoordinate) => setPendingEnrich(only ? { only } : {})

  return (
    <motion.div
      layout
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, transform: 'translate3d(0, 6px, 0)' }}
      animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
      exit={{ opacity: 0, transform: 'translate3d(0, -4px, 0)' }}
      transition={{ ...rowTransition, layout: layoutTransition }}
      onClick={openDetail}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openDetail()
        }
      }}
      className="grid min-h-14 cursor-pointer grid-cols-[minmax(0,2.2fr)_minmax(100px,0.55fr)_minmax(128px,0.6fr)_minmax(270px,1.8fr)_72px_92px_112px_60px] items-center rounded-xl border border-transparent outline-none transition-colors duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] focus-visible:border-[var(--bellum-primary-500)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bellum-bg)] max-xl:grid-cols-[minmax(0,1.6fr)_minmax(110px,0.8fr)_minmax(128px,0.7fr)_64px_60px] max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-3"
    >
      {pendingEnrich ? (
        <EnrichConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setPendingEnrich(null)
          }}
          count={1}
          onConfirm={() => {
            enrich.mutate({
              contact,
              accountCompanyName: contact.entity ?? '',
              ...(pendingEnrich.only ? { only: pendingEnrich.only } : {}),
            })
            setPendingEnrich(null)
          }}
        />
      ) : null}
      {selection ? (
        <div className="flex min-w-0 items-center">
          <RowSelectBox contact={contact} selection={selection} />
          <ContactIdentity contact={contact} onOpenDetail={openDetail} accountName={accountName} />
        </div>
      ) : (
        <ContactIdentity contact={contact} onOpenDetail={openDetail} accountName={accountName} />
      )}

      <div className="min-w-0 px-3 py-2 max-lg:hidden">
        <Text
          size="sm"
          noWrap
          className="truncate text-[var(--bellum-text-secondary)]"
          title={contact.entity || undefined}
        >
          {/* Recette 12/10/2026 — une entité ou un rôle absent ne s'écrit pas « - » : on n'affiche pas ce qu'on n'a pas
              (gardes GA-18/19). La cellule reste, vide, pour que la grille garde ses colonnes. */}
          {contact.entity || null}
        </Text>
      </div>

      <div className="flex min-w-0 items-center overflow-hidden px-3 py-2 max-lg:hidden">
        {contact.decision_role ? <RoleBadge role={contact.decision_role} /> : null}
      </div>

      <div className="min-w-0 px-3 py-2 max-xl:hidden">
        <ContactChannels contact={contact} onEnrich={enrichContact} busy={enrich.isPending} />
      </div>

      <div className="flex items-center justify-center px-3 py-2 max-lg:hidden">
        <ContactPriorityBadge value={contact.priority} />
      </div>

      <div className="flex w-[92px] items-center justify-center px-2 py-2 max-xl:hidden">
        {statusBadge(contact.user_status)}
      </div>

      <div className="flex w-[112px] items-center justify-center px-2 py-2 max-xl:hidden">
        <LastVerified contact={contact} />
      </div>

      <div className="flex items-center justify-end gap-1 px-3 py-2">
        {/* #2725 — « rien ne mène à la fiche complète depuis les vues en
            résumé, et rien ne dit qu'il y a plus derrière » (retour bêta
            22/09). La ligne ouvre déjà la fiche au clic (`onContactClick`,
            #2150.62) et via « Voir la fiche » dans le menu « … » — ce qui
            manquait, c'est l'annonce AVANT le clic. Décoratif et
            `aria-hidden` : la ligne porte déjà son propre geste accessible
            (`role="button"`, Entrée/Espace ci-dessus) ; cette pastille se
            contente de le montrer, y compris sur tactile où il n'y a pas de
            survol. */}
        {/* Théo A comptes-fiche.R5 — ni e-mail ni téléphone : « Contacter » devient « Enrichir ». */}
        <ContactEnrichAction contact={contact} onEnrich={enrichContact} busy={enrich.isPending} />
        {/* LOIC-FIX2 O.4 — le chevron est un bouton NOMMÉ de 44 × 44 px (c'était un svg nu de 14 px). */}
        <button
          type="button"
          aria-label={t('row.openProfileAria', { name: contact.full_name })}
          onClick={event => {
            event.stopPropagation()
            openDetail()
          }}
          className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]"
        >
          <ChevronRight aria-hidden="true" data-testid="account-contact-row-open-hint" className="size-3.5" />
        </button>
        <div onClick={event => event.stopPropagation()}>
          <ContactRowActions contact={contact} onOpenDetail={openDetail} />
        </div>
      </div>
    </motion.div>
  )
}

/**
 * #2120.71-75 — cocher une ligne n'ouvre PAS la fiche : ni le clic ni Espace /
 * Entrée ne remontent à la ligne, qui ouvre le détail sur ces deux gestes.
 */
function RowSelectBox({ contact, selection }: { contact: Contact; selection: RowSelection }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div
      className="flex shrink-0 items-center justify-center pl-3 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <Checkbox
        checked={selection.selected}
        onCheckedChange={() => selection.onToggle()}
        aria-label={t('contactsTab.selection.selectRow', { name: contact.full_name })}
      />
    </div>
  )
}

/**
 * « Dernière vérification » — la colonne manquante de la maquette
 * `03_tous_contacts_couverture.png`.
 *
 * `last_enrichment_at` est la date du dernier passage d'un fournisseur qui a
 * confirmé où travaille cette personne (voir `contactSchema.last_enrichment_at`).
 * ⚠️ Une absence se NOMME (« jamais vérifié ») — jamais une date inventée, ni
 * un tiret muet qui laisserait croire à un champ simplement vide.
 */
export function LastVerified({ contact }: { contact: Contact }) {
  const { t, i18n } = useTranslation('accountOrg')
  if (!contact.last_enrichment_at) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('row.neverVerified')}
      </Text>
    )
  }
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const parsed = new Date(contact.last_enrichment_at)
  const compact = parsed.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
  const longDate = parsed.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]" title={t('row.lastVerifiedOn', { date: longDate })}>
      {compact}
    </Text>
  )
}

function ContactIdentity({
  contact,
  onOpenDetail,
  accountName,
}: {
  contact: Contact
  onOpenDetail: () => void
  accountName?: string | null
}) {
  const { t } = useTranslation('contacts')
  const departure = contactDeparture(contact, accountName)
  // Unconfirmed role-persona → show the role, not the placeholder first name;
  // the real name + photo take over the instant a match completes the identity.
  const identity = contactDisplayIdentity(contact)
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2">
      <ContactAvatar name={identity.label} photoUrl={contact.photo_url} size="sm" />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {/* LOIC-FIX2 O.4 — le nom est un lien vers la fiche, cible ≥ 44 px (c'était un div). */}
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onOpenDetail()
            }}
            className="min-h-11 min-w-0 cursor-pointer truncate text-left text-sm font-semibold text-[var(--bellum-text-primary)] underline-offset-4 hover:underline"
          >
            {identity.label}
          </button>
          {/* 13/10/2026 — « Décideur » sur chaque décideur, seulement sous lg, là où la colonne Rôle est masquée
              (dès lg, « Décideur économique » la porte : GA-26, jamais deux pastilles). */}
          <DecisionMakerBadge role={contact.decision_role} className="lg:hidden" />
          {/* #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum » ; compte hors CRM ou provenance inconnue ⇒ rien. */}
          <ContactCrmOriginBadge contact={contact} />
          {/* #4055.8 — la même preuve datée que la liste /contacts (`employment_left`) : sans elle, rien. */}
          {departure ? <ContactDepartureBadge organization={departure.organization} at={departure.at} /> : null}
        </div>
        {identity.roleToIdentify ? (
          <Badge
            variant="outline"
            className="mt-0.5 gap-1 border-[var(--bellum-warning)] px-1 py-0 text-xs text-[var(--warning-soft-text)]"
          >
            <UserX className="size-2.5" /> {t('table.roleToIdentify')}
          </Badge>
        ) : (
          <div className="flex min-w-0 items-center gap-1.5">
            {/* Recette démo Orange 12/10/2026 — un titre absent ne s'écrit pas « - » : on n'affiche pas ce qu'on n'a pas. */}
            {contact.title ? (
              // Recette 13/10/2026 — l'intitulé passe sur deux lignes au lieu d'être coupé à ~200 px ; le texte
              // entier reste au survol si même ça ne suffit pas.
              <Text
                size="xs"
                className="line-clamp-2 min-w-0 text-[var(--bellum-text-secondary)] [overflow-wrap:anywhere]"
                title={contact.title}
              >
                {contact.title}
              </Text>
            ) : null}
            {/* Apollo named this contact only partially — « Séverine M. ». */}
            {identity.nameToReveal ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-[var(--bellum-warning)] px-1 py-0 text-xs text-[var(--warning-soft-text)]"
              >
                {t('table.nameToReveal')}
              </Badge>
            ) : null}
          </div>
        )}
        {/* LUDOVIC-E LC.1 — où il travaille, quand on le sait (la zone du profil se vérifie à l'œil) ; absent = rien. */}
        {contactPlaceLabel(contact) ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="contact-place">
            {contactPlaceLabel(contact)}
          </Text>
        ) : null}
        {/* #4992.1 — la raison du rang sous chaque contact ; absente ⇒ aucune ligne (rien d'inventé). */}
        {contact.why_contact?.trim() ? (
          <Text
            size="xs"
            data-testid="contact-why"
            className="mt-0.5 line-clamp-2 max-w-prose text-[var(--bellum-text-secondary)]"
          >
            {contact.why_contact.trim()}
          </Text>
        ) : null}
        {/* #4290.12 — un contact écarté DIT son motif ici aussi (« A quitté l’entreprise… ») ; sans motif, aucune ligne. */}
        {contact.excluded_at && contact.exclusion_reason?.trim() ? (
          <Text
            size="xs"
            data-testid="contact-exclusion-reason"
            className="mt-0.5 max-w-prose text-[var(--bellum-text-secondary)]"
          >
            {t('exclude.reasonGiven', { ns: 'contacts', reason: contact.exclusion_reason.trim() })}
          </Text>
        ) : null}
        {/* #2632.2 — le poste porte sa date, sa source et sa CATÉGORIE de
            vérification ici aussi, pas seulement sur /contacts. Un seul
            rendu pour les deux écrans (GA-26) : `ContactVerificationBadge`. */}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {/* #4158.52 — même badge « Ne pas contacter » que la fiche et la liste /contacts. */}
          <DoNotContactListBadge contactId={contact.id} email={contact.email} />
          <ContactVerificationBadge contact={contact} labelled />
          {/* Théo A comptes-fiche-reference.N5 — identité reprise d'une archive : à revalider, rien de déduit de plus. */}
          {isToRevalidate(contact.tags) ? (
            <Badge
              variant="outline"
              data-testid="to-revalidate-badge"
              className="shrink-0 border-[var(--bellum-warning)] px-1 py-0 text-xs text-[var(--warning-soft-text)]"
            >
              {t('table.toRevalidate')}
            </Badge>
          ) : null}
        </div>
        {isToRevalidate(contact.tags) ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('table.toRevalidateNote')}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

/**
 * #4404.2 — coordonnées dans l'ordre e-mail, téléphone, LinkedIn (SOUS les deux), en clair.
 * Théo A comptes-fiche.R5 — par champ : connu · disponible · jamais cherché · introuvable ;
 * le clic enrichit CE champ (`onEnrich`), l'appelant porte le hook.
 */
export function ContactChannels({
  contact,
  onEnrich,
  busy,
}: {
  contact: Contact
  onEnrich: (only: EnrichmentCoordinate) => void
  busy?: boolean
}) {
  const { t } = useTranslation('contacts')
  const linkedinHref = safeHref(contact.linkedin_url)
  return (
    <div className="flex min-w-0 flex-col items-start gap-0.5 text-[var(--bellum-text-muted)]">
      <ContactCoordinatesCell contact={contact} onEnrich={onEnrich} busy={busy} />
      {/* #4016 L4.1 — une adresse ESTIMÉE se badge, partout où elle s'affiche. */}
      {contact.email && contact.email_estimated_at ? (
        <EstimatedBadge verifiedAt={contact.email_estimated_at} className="shrink-0" />
      ) : null}
      {linkedinHref ? (
        <a
          href={linkedinHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('header.linkedin')}
          title={t('header.linkedin')}
          onClick={event => event.stopPropagation()}
          className="inline-flex min-h-11 shrink-0 items-center text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-accent)]"
        >
          <Linkedin className="size-3.5" />
        </a>
      ) : null}
    </div>
  )
}

function ContactRowActions({ contact, onOpenDetail }: { contact: Contact; onOpenDetail: () => void }) {
  const { t, i18n } = useTranslation('accountOrg')

  const alreadySent = Boolean(contact.email_sent_at)
  // #2120.42 — le brouillon existe déjà (`email_message`), mais cet item
  // l'ENVOYAIT directement via `useSendContactEmail`/Resend, sans jamais le
  // montrer : le geste s'appelait « Envoyer le brouillon » sur un menu compact
  // d'où on ne voit rien du corps du message. « Préparer un message » ouvre
  // désormais le panneau d'engagement (même porte que `ContactChannelMenu`,
  // `openEngagement`) — le commercial VOIT le brouillon, et c'est LUI qui
  // clique Envoyer, dans `EngagementSendEmail` (la checklist pré-envoi).
  //
  // #2716.1 — retour SKAIZen Group (22/09/2026) : « depuis 'envoyé', rien ne
  // mène au message réellement expédié ». `!alreadySent` désactivait l'item
  // UNE FOIS l'e-mail parti — le clic sur « Envoyé le … » ne faisait plus
  // rien. Le panneau que ce même clic ouvre affiche déjà le message envoyé en
  // lecture (`EngagementSendEmailAction` → `SendReceipt`, #2714) sans jamais
  // le ré-envoyer : rouvrir un message DÉJÀ envoyé est donc sans risque.
  //
  // #4062.1 — l'absence d'e-mail n'empêche que l'ENVOI (blocage `noEmail` d'`EngagementSendEmail`),
  // jamais la préparation : le geste est toujours ouvert, le panneau dit pourquoi l'envoi reste bloqué.
  const sentLabel = contact.email_sent_at
    ? t('row.sentOn', {
        date: new Date(contact.email_sent_at).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB'),
      })
    : null
  const { openEngagement } = useContactEngagement()

  // #2120.40 — même hook que le panneau de sélection du portefeuille
  // (`ContactSelectionPanel.tsx`) : un seul chemin « ajouter au plan », jamais
  // un second qui pourrait diverger.
  const addToPlan = useAddContactsToPlan()
  // #2120.44 — réversible : un état (`hidden`), jamais une suppression.
  const hideContact = useHideContact()
  // #2120.45 — corriger sans quitter la liste.
  const [correcting, setCorrecting] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="xs" aria-label={t('row.actionsAria', { name: contact.full_name })}>
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpenDetail}>
            <FileText className="mr-2 size-4" />
            {t('row.viewProfile')}
          </DropdownMenuItem>
          {/* #2120.45 — la fiche d'identité CORRIGEABLE de la fiche contact, la
            même (`ContactRecordCard`) : chaque champ corrigé y pose la
            provenance « saisi à la main », qu'aucune analyse n'écrase. */}
          <DropdownMenuItem onClick={() => setCorrecting(true)}>
            <Pencil className="mr-2 size-4" />
            {t('row.correct')}
          </DropdownMenuItem>
          {/* L'issue de l'approche : la ligne AFFICHAIT déjà le statut sans offrir
            de quoi le changer. On lit et on écrit désormais au même endroit. */}
          <ContactOutcomeSubmenu contact={contact} />
          {/* #2126.47/.50/.51/.53/.54 (épopée #2787) — boucle d'apprentissage
              SÉPARÉE, voir le docblock de `CommercialOutcomeSubmenu`. */}
          <CommercialOutcomeSubmenu contact={contact} />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openEngagement([contact], 'email')}>
            {alreadySent ? (
              <Check className="mr-2 size-4 text-[var(--success-soft-text)]" />
            ) : (
              <PenLine className="mr-2 size-4" />
            )}
            {alreadySent ? sentLabel : t('row.prepareMessage')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!contact.email}
            onClick={() => {
              if (contact.email) window.location.href = `mailto:${contact.email}`
            }}
          >
            <Mail className="mr-2 size-4" />
            {t('row.contactByEmail')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!contact.linkedin_url}
            onClick={() => window.open(contact.linkedin_url ?? '', '_blank', 'noopener,noreferrer')}
          >
            <Linkedin className="mr-2 size-4" />
            {t('row.viewLinkedin')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!contact.account_id || addToPlan.isPending}
            onClick={() => addToPlan.mutate([contact])}
          >
            <CalendarPlus className="mr-2 size-4" />
            {t('row.addToPlan')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={hideContact.isPending}
            onClick={() => hideContact.mutate({ contact, hidden: true })}
          >
            <EyeOff className="mr-2 size-4" />
            {t('row.hide')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={correcting} onOpenChange={setCorrecting}>
        {/* La ligne ouvre la fiche sur Entrée / Espace : une frappe dans le
          formulaire ne doit pas remonter jusqu'à elle (le portail React
          propage les événements à ses ancêtres de composants). */}
        <DialogContent
          closeLabel={t('common:actions.close')}
          className="sm:max-w-2xl"
          onKeyDown={event => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{t('row.correctTitle', { name: contact.full_name })}</DialogTitle>
            <DialogDescription>{t('row.correctDescription')}</DialogDescription>
          </DialogHeader>
          {correcting ? <ContactRecordCard contact={contact} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
