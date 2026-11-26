import { CONTACT_RANKING_TIE_BREAKER_AXES } from '@bellum/contracts'
import type { Contact, ContactAccessPath, ContactRankingQuery, RankedContact } from '@bellum/contracts'
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@bellum/ui'
import { motion } from 'framer-motion'
import { Building2, ChevronRight, Info, Star, UserX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { useTrackAction } from '@/features/actions/hooks/useTrackAction'
import { trackActionStarted } from '@/lib/product-tracker'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import type { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { contactPlaceLabel } from '@/features/contacts/lib/contactPlace'
import { useContactEngagement } from '../../components/contact-engagement/ContactEngagementContext'
import { ContactEngagementTrigger } from '../../components/contact-engagement/ContactEngagementTrigger'
import type { EngagementChannel } from '../../components/contact-engagement/types'
import { ContactPriorityBadge } from '@/features/contacts/components/ContactPriorityBadge'
import { cardFade } from '../../motion'
import { getPriorityContacts } from './contactGrouping'
import { passAheadReason } from './passAheadReason'
import { rankingTotals } from './rankingTotals'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

type PriorityPathSectionProps = {
  accountId: string
  /** TOUS les contacts du compte : le classement vient de l'API, les cartes lisent la fiche ici. */
  contacts: Contact[]
  accountCompanyName: string
  rawAnalysis: Record<string, unknown>
  /** Les entités du dossier — les options du périmètre ciblé (#2120.30). */
  entities: string[]
  /** #2091 — `undefined` tant que `useCredits()` n'a pas résolu (jamais `0`). */
  enrichmentCredits: number | undefined
  enrichMutation: ReturnType<typeof useEnrichContact>
  onContactClick?: (contact: Contact) => void
}

/** Valeur sentinelle du sélecteur : Radix refuse une option à valeur vide. */
const ACCOUNT_DEFAULT = '__account__'

/** #2130.68 — même convention que `TabPartners.tsx` : le motif de route
 *  littéral, jamais dérivé d'un `accountId` (GA-276). */
const ACCOUNT_DETAIL_SCREEN = '/accounts/$id'

type PathCard = { contact: Contact; ranked: RankedContact | null }

/** Les titres d'angles du compte — les options du sujet (#2120.33). */
function readAngleTitles(rawAnalysis: Record<string, unknown>): string[] {
  const angles = Array.isArray(rawAnalysis.angles) ? (rawAnalysis.angles as unknown[]) : []
  const titles = angles.map(angle =>
    angle && typeof angle === 'object' && typeof (angle as { title?: unknown }).title === 'string'
      ? (angle as { title: string }).title.trim()
      : '',
  )
  return Array.from(new Set(titles.filter(Boolean)))
}

/**
 * Le chemin d'accès recommandé.
 *
 * #2120.30-38 — l'ORDRE vient désormais de l'API (`GET /contacts/account/:id/ranking`),
 * calculé sur neuf axes nommés et sur les trois choix posés ici : périmètre,
 * sujet, offre. Avant, les cartes triaient `contact.priority`, un rang figé par
 * le prompt que rien de ce que le commercial choisissait ne faisait bouger.
 *
 * API ancienne ou en panne : l'ordre de l'analyse revient, et l'écran DIT qu'il
 * n'a pas ses critères — jamais une confiance ou une voie d'accès devinées.
 */
export function PriorityPathSection({
  accountId,
  contacts,
  accountCompanyName,
  rawAnalysis,
  entities,
  enrichmentCredits,
  enrichMutation,
  onContactClick,
}: PriorityPathSectionProps) {
  const { t } = useTranslation('accountOrg')
  const trackAction = useTrackAction()
  const { openEngagement } = useContactEngagement()
  const [query, setQuery] = useState<ContactRankingQuery>({})
  const [offerDraft, setOfferDraft] = useState('')
  const ranking = useContactRanking(accountId, query)
  const angles = useMemo(() => readAngleTitles(rawAnalysis), [rawAnalysis])

  // #2628.1 — la porte d'entrée se classait sur la séniorité par défaut :
  // l'axe « offre » (poids 10) sort du score tant que rien n'est saisi ici, et
  // personne ne le remplissait. On le préremplit depuis les domaines
  // d'expertise déclarés du profil ESN — une seule fois, et seulement si le
  // commercial n'a encore rien tapé : sa saisie garde toujours la main.
  const { data: esnAnswers, isLoading: esnLoading } = useEsnProfile()
  const expertiseOffer = useMemo(() => (esnAnswers?.expertise_areas ?? []).join(', '), [esnAnswers?.expertise_areas])
  const [offerSeeded, setOfferSeeded] = useState(false)
  useEffect(() => {
    if (offerSeeded || !expertiseOffer) return
    setOfferSeeded(true)
    if (offerDraft.trim() !== '') return
    setOfferDraft(expertiseOffer)
    setQuery(current => ({ ...current, offer: expertiseOffer }))
  }, [expertiseOffer, offerDraft, offerSeeded])
  // #4292.19 — un score ne s'affiche qu'une fois son jeu d'axes arrêté : tant que l'offre du profil n'est pas
  // lue puis posée dans la requête, le premier rang (sans l'axe « offre », 34/55) serait remplacé par le second
  // (avec, 44/65) — deux « vérités » pour les mêmes données. On dit « Classement en cours… » entre les deux.
  const offerSettling = esnLoading === true || (expertiseOffer !== '' && !offerSeeded)
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])

  // Un champ serveur NEUF se lit avec une garde : une API d'avant la route (ou un
  // intermédiaire qui répond autre chose) ne doit pas faire tomber l'onglet —
  // une réponse sans liste `ranked` vaut « classement indisponible ».
  const rankedList = !offerSettling && Array.isArray(ranking.data?.ranked) ? ranking.data.ranked : null
  const rankingUnavailable = !offerSettling && (ranking.isError || (ranking.data !== undefined && rankedList === null))

  // Lot 758 (Loïc) — « les achats interviennent ensuite » nomme QUI. `undefined` : réponse d'avant le champ
  // (aucune ligne) ; `null` : aucun acheteur identifié au dossier (dit tel quel) ; sinon la personne, si chargée.
  const procurementId = rankedList ? ranking.data?.procurement_contact_id : undefined
  const buyer: BuyerLine =
    procurementId === undefined
      ? undefined
      : procurementId === null
        ? null
        : (contactsById.get(procurementId) ?? undefined)

  const cards = useMemo<PathCard[]>(() => {
    if (rankedList) {
      return rankedList.flatMap(ranked => {
        const contact = contactsById.get(ranked.contact_id)
        return contact ? [{ contact, ranked }] : []
      })
    }
    if (rankingUnavailable) return getPriorityContacts(contacts).map(contact => ({ contact, ranked: null }))
    return []
  }, [rankedList, rankingUnavailable, contactsById, contacts])

  const openContactEngagement = (contact: Contact, channel: EngagementChannel) => {
    // #2130.75 — anonyme, par écran : jamais l'accountId ni le contact engagé.
    trackActionStarted('contact_selected', ACCOUNT_DETAIL_SCREEN)
    // LUDOVIC-E LC.5 — préparer l'appel ne demande pas de numéro : sans ce drapeau, le canal « téléphone »
    // d'un contact sans numéro était jugé vide et le panneau ne s'ouvrait pas (STILL, n°2).
    openEngagement([contact], channel, { rawAnalysis, ...(channel === 'phone' ? { callPreparation: true } : {}) })
  }

  // Transparence billing (addendum Théo p.11) : le clic ouvre la confirmation
  // (coût 1 crédit, source, champs attendus) — le débit ne part qu'après accord.
  const [pendingEnrich, setPendingEnrich] = useState<{ contact: Contact; force: boolean } | null>(null)

  const enrichContact = (contact: Contact, force: boolean) => {
    trackPlanContactAction(trackAction.mutate, 'plan_action_enrichment_requested', accountId, contact)
    setPendingEnrich({ contact, force })
  }

  const confirmEnrich = () => {
    if (!pendingEnrich) return
    enrichMutation.mutate({
      contact: pendingEnrich.contact,
      accountCompanyName,
      ...(pendingEnrich.force ? { force: true } : {}),
    })
  }

  const openContactDetail = (contact: Contact) => {
    trackPlanContactAction(trackAction.mutate, 'plan_action_contact_opened', accountId, contact)
    // #2130.68 — anonyme, par écran : jamais l'accountId ni le contact ouvert.
    trackActionStarted('access_path_used', ACCOUNT_DETAIL_SCREEN)
    onContactClick?.(contact)
  }

  return (
    <motion.div variants={cardFade}>
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="space-y-3 border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {/* #2754 — titre et sous-titre COMBINÉS sur une ligne : "fais
                  tenir tout ça sur 2-3 lignes max" (Louis, beta 23/09). */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <div className="flex items-center gap-2">
                  <Star className="size-4 text-[var(--bellum-text-accent)]" />
                  <Text element="h3" size="base" weight="semibold">
                    {t('priorityPath.title')}
                  </Text>
                </div>
                <Text size="sm" element="p" className="text-[var(--bellum-text-secondary)]">
                  {t('priorityPath.subtitle', { count: cards.length })}
                </Text>
              </div>
              {rankedList && ranking.data ? (
                <Text size="xs" element="p" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('priorityPath.rankedSummary', { total: ranking.data.total })}
                </Text>
              ) : null}
              {/* #4984.2 — la taille ET le palier viennent de l'API (GA-26 : les seuils n'existent qu'à un endroit) ; absent ⇒ aucune phrase. */}
              {rankedList && ranking.data?.account_size ? (
                <Text
                  size="xs"
                  element="p"
                  data-testid="priority-ranked-size"
                  className="text-[var(--bellum-text-muted)]"
                >
                  {t('priorityPath.rankedForSize', {
                    count: ranking.data.account_size.employees,
                    tier: t(`priorityPath.sizeTier.${ranking.data.account_size.tier}`),
                  })}
                </Text>
              ) : null}
              {/* #4292.10 (21/10) — aucun décideur ni sponsor identifié : le bloc le DIT au lieu de se taire. */}
              {rankedList && ranking.data?.no_decision_maker ? (
                <Text
                  size="xs"
                  element="p"
                  data-testid="priority-no-decision-maker"
                  className="mt-1 text-[var(--bellum-text-secondary)]"
                >
                  {t('priorityPath.noDecisionMaker')}
                </Text>
              ) : null}
            </div>
            {/* #2754 — l'indice tenait sa propre ligne pour un conseil court :
                "y a du blabla inutile" (Louis, beta 23/09). Il reste NOMMÉ,
                sur une icône tabulable (GA-32/GA-35), plutôt que supprimé. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  aria-label={t('priorityPath.hint')}
                  className="inline-flex shrink-0 cursor-help items-center text-[var(--bellum-text-secondary)] outline-none"
                >
                  <Info className="size-4" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-[220px]">
                {t('priorityPath.hint')}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* #2120.30 / .33 / .34 — les trois choix qui font bouger l'ordre. */}
          <div className="flex flex-wrap items-end gap-3">
            {entities.length > 0 ? (
              <RankingSelect
                label={t('priorityPath.perimeterLabel')}
                defaultLabel={t('priorityPath.perimeterAccount')}
                options={entities}
                value={query.perimeter}
                onChange={perimeter => setQuery(current => ({ ...current, perimeter }))}
              />
            ) : null}
            {angles.length > 0 ? (
              <RankingSelect
                label={t('priorityPath.subjectLabel')}
                defaultLabel={t('priorityPath.subjectAccount')}
                options={angles}
                value={query.subject}
                onChange={subject => setQuery(current => ({ ...current, subject }))}
              />
            ) : null}
            <form
              className="flex items-end gap-2"
              onSubmit={event => {
                event.preventDefault()
                const offer = offerDraft.trim()
                setQuery(current => ({ ...current, offer: offer || undefined }))
              }}
            >
              <label className="flex flex-col gap-1">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                  {t('priorityPath.offerLabel')}
                </Text>
                <input
                  value={offerDraft}
                  onChange={event => setOfferDraft(event.target.value)}
                  placeholder={t('priorityPath.offerPlaceholder')}
                  maxLength={200}
                  className="h-9 min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] placeholder:text-[var(--bellum-text-muted)]"
                />
              </label>
              <Button type="submit" size="sm" variant="outline">
                {t('priorityPath.offerApply')}
              </Button>
            </form>
          </div>

          {rankingUnavailable ? (
            <Text size="xs" element="p" className="text-[var(--warning-soft-text)]">
              {t('priorityPath.unavailable')}
            </Text>
          ) : null}
          {!rankedList && !rankingUnavailable ? (
            <Text size="xs" element="p" className="text-[var(--bellum-text-muted)]">
              {t('priorityPath.loading')}
            </Text>
          ) : null}
        </div>

        {/* #3685.2 — une lecture COURTE en lignes pleine largeur, pas quatre cartes côte à côte. */}
        <div className="flex flex-col divide-y divide-[var(--bellum-border)]">
          {cards.map(({ contact, ranked }, index) => (
            <PriorityContactCard
              key={contact.id}
              contact={contact}
              ranked={ranked}
              next={cards[index + 1] ?? null}
              buyer={buyer}
              enrichmentCredits={enrichmentCredits}
              onContactClick={openContactDetail}
              onChannelSelect={channel => openContactEngagement(contact, channel)}
              onEnrich={({ force }) => enrichContact(contact, force)}
              isLoading={enrichMutation.isPending && enrichMutation.variables?.contact.id === contact.id}
            />
          ))}
        </div>

        <EnrichConfirmDialog
          open={pendingEnrich !== null}
          onOpenChange={open => {
            if (!open) setPendingEnrich(null)
          }}
          count={1}
          onConfirm={confirmEnrich}
        />
      </Card>
    </motion.div>
  )
}

function RankingSelect({
  label,
  defaultLabel,
  options,
  value,
  onChange,
}: {
  label: string
  defaultLabel: string
  options: string[]
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Select
        value={value ?? ACCOUNT_DEFAULT}
        onValueChange={next => onChange(next === ACCOUNT_DEFAULT ? undefined : next)}
      >
        <SelectTrigger className="h-9 min-w-[12rem] max-w-[18rem]" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ACCOUNT_DEFAULT}>{defaultLabel}</SelectItem>
          {options.map(option => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

type TrackAction = ReturnType<typeof useTrackAction>['mutate']
type PlanContactActionType = 'plan_action_contact_opened' | 'plan_action_enrichment_requested'

function trackPlanContactAction(
  track: TrackAction,
  actionType: PlanContactActionType,
  accountId: string,
  contact: Contact,
) {
  track({
    action_type: actionType,
    account_id: accountId,
    contact_id: contact.id,
    channel: 'other',
    metadata: {
      label: actionType === 'plan_action_contact_opened' ? 'Fiche contact ouverte' : 'Enrichissement demandé',
      detail: contact.full_name,
      source: 'priority_path',
      source_label: "Chemin d'accès recommandé",
      contact_name: contact.full_name,
      contact_title: contact.title,
    },
  })
}

/** Lot 758 — l'acheteur du dossier : la personne, `null` (aucun identifié), `undefined` (rien à dire). */
type BuyerLine = Contact | null | undefined

type PriorityContactCardProps = {
  contact: Contact
  ranked: RankedContact | null
  /** LOIC-FIX2 O.3 — le contact classé juste derrière : celui devant lequel on passe. */
  next: PathCard | null
  /** Lot 758 (Loïc) — nommé sous un DÉCIDEUR : « les achats interviennent ensuite », et qui. */
  buyer: BuyerLine
  enrichmentCredits: number | undefined
  onContactClick?: (contact: Contact) => void
  onChannelSelect: (channel: EngagementChannel) => void
  onEnrich: (options: { force: boolean }) => void
  isLoading: boolean
}

// #2613 — un accès jamais recherché est une absence pure : la ligne « Voie
// d'accès » disparaît plutôt que d'afficher « non mesurée » (`null` ici, le
// caller ne rend alors aucun `ContactMeta`). `missing_reason` porte deux
// valeurs distinctes (contrat `ContactAccessPath`) : `never_searched` — on
// n'a jamais cherché, absence pure, retirée — et `searched_nothing_found` —
// on a cherché, il n'y a rien, ça RESTE nommé (mesuré à zéro).
function accessPathLabel(t: (key: string) => string, path: ContactAccessPath): string | null {
  const key = path.kind ?? path.missing_reason
  if (!key || key === 'never_searched') return null
  return t(`priorityPath.access.${key}`)
}

function PriorityContactCard({
  contact,
  ranked,
  next,
  buyer,
  enrichmentCredits,
  onContactClick,
  onChannelSelect,
  onEnrich,
  isLoading,
}: PriorityContactCardProps) {
  const { t, i18n } = useTranslation('accountOrg')
  const [showWhy, setShowWhy] = useState(false)
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'

  // #2120.24 — les coordonnées quand on les connaît ; sinon l'absence est NOMMÉE
  // quand elle dit quelque chose (« cherché sans rien trouver »).
  // #3060 (retour bêta, 26/09/2026) — Louis : « ne pas afficher si vide ». Un
  // contact jamais cherché n'a pas une absence intéressante à nommer (même
  // logique que #2613 sur la voie d'accès, `never_searched` → null) : la ligne
  // entière disparaît, elle ne fait plus « Coordonnées jamais recherchées ».
  const channels = [contact.email, contact.phone].filter((value): value is string => Boolean(value?.trim()))
  const coordinates =
    channels.length > 0 ? channels.join(' · ') : contact.last_enrichment_at ? t('priorityPath.card.nothingFound') : null

  // #2120.25 — le dernier échange tracé DANS L'ESPACE, jamais une date devinée.
  // #3059 (retour bêta, 26/09/2026) — Louis : « ne pas afficher si vide ». Un
  // échange jamais tracé ne fait plus de ligne « Aucun échange tracé dans ton
  // espace » — une absence pure sort du DOM (doctrine « on n'affiche pas ce
  // qu'on n'a pas »).
  const lastInteraction = ranked?.last_interaction_at ?? contact.email_sent_at ?? null
  const lastInteractionLabel = lastInteraction
    ? new Date(lastInteraction).toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  // #2613 — la voie d'accès ne s'affiche que quand elle est connue.
  // Recette 13/10/2026 — « e-mail (non) vérifié » ne se dit que si l'e-mail est AFFICHÉ sur la carte (ligne « Coordonnées »).
  const emailVoiceWithoutEmail =
    (ranked?.access_path.kind === 'email' || ranked?.access_path.kind === 'verified_email') && !contact.email?.trim()
  const accessLabel = ranked && !emailVoiceWithoutEmail ? accessPathLabel(t, ranked.access_path) : null

  // #3685.2 — un rôle sans identité vérifiée se lit « rôle à identifier », jamais un prénom d'emprunt.
  const identity = contactDisplayIdentity(contact)

  return (
    <div className="flex flex-col p-4 md:flex-row md:items-start md:gap-6" data-testid="priority-contact-card">
      <div className="flex items-start gap-3 md:w-2/5 md:shrink-0">
        <ContactAvatar name={identity.label} photoUrl={contact.photo_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {/* LOIC-FIX O.4 — le nom mène à la fiche (avec le chevron plus bas) : avant, seul
                « Voir la fiche » ouvrait. LOIC-FIX2 O.4 — un vrai bouton, tabulable, de 44 px, pas un texte. */}
            <button
              type="button"
              onClick={() => onContactClick?.(contact)}
              className="min-h-11 min-w-0 cursor-pointer truncate rounded text-left text-sm font-semibold text-[var(--bellum-text-primary)] underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              {identity.label}
            </button>
            {identity.roleToIdentify ? (
              <Text size="xs" className="inline-flex items-center gap-1 text-[var(--warning-soft-text)]">
                <UserX className="size-3" aria-hidden /> {t('priorityPath.card.roleToIdentify')}
              </Text>
            ) : null}
            <RoleBadge role={contact.decision_role ?? 'unknown'} />
          </div>
          {identity.roleToIdentify ? null : (
            <Text size="xs" className="mt-1 line-clamp-2 text-[var(--bellum-text-secondary)]">
              {contact.title}
            </Text>
          )}
          {/* #2120.18 — l'entité ; #2120.19 — la ville AFFICHÉE, jamais classante.
              #2613 — une entité inconnue ne fait plus de ligne : elle sort du
              DOM, et la ville reste seule si c'est tout ce qu'on sait. */}
          {contact.entity?.trim() || contactPlaceLabel(contact) ? (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[var(--bellum-text-secondary)]">
              <Building2 className="size-3.5 shrink-0" aria-hidden />
              {contact.entity?.trim() ? (
                <Text size="xs" noWrap className="truncate">
                  {contact.entity.trim()}
                </Text>
              ) : null}
              {contactPlaceLabel(contact) ? (
                <Text size="xs" noWrap className="truncate text-[var(--bellum-text-muted)]">
                  {contactPlaceLabel(contact)}
                </Text>
              ) : null}
            </div>
          ) : null}
          {/* #4432.4 — la zone du profil NOMMÉE : en zone, hors zone, « lieu absent » (jamais deviné) ; sans zone
              déclarée (statut absent), aucune ligne. */}
          {ranked?.zone_status ? (
            <Text
              size="xs"
              data-testid="contact-zone-status"
              className={`mt-1 ${ranked.zone_status === 'in_zone' ? 'text-[var(--bellum-text-secondary)]' : 'text-[var(--warning-soft-text)]'}`}
            >
              {ranked.zone_status === 'out_of_zone' && ranked.zone_label?.trim()
                ? t('priorityPath.card.zone.out_of_zone_named', { zone: ranked.zone_label.trim() })
                : t(`priorityPath.card.zone.${ranked.zone_status}`)}
            </Text>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-w-0 flex-1 space-y-2.5 md:mt-0">
        {/* Lot 758 (Loïc) — un décideur ne conclut pas seul : l'étape achats NOMME l'acheteur, ou dit qu'il manque. */}
        {ranked?.group === 'decision_maker' && buyer !== undefined && buyer?.id !== contact.id ? (
          <Text size="xs" weight="medium" data-testid="priority-buyer" className="text-[var(--bellum-text-secondary)]">
            {buyer
              ? contactDisplayIdentity(buyer).roleToIdentify
                ? // Recette 31/10 — pas de nom : le libellé EST la fonction, on ne la répète pas « X (X) ».
                  t('priorityPath.card.buyerSeat', { title: contactDisplayIdentity(buyer).label })
                : t('priorityPath.card.buyerNamed', {
                    name: contactDisplayIdentity(buyer).label,
                    title: buyer.title?.trim() || t('priorityPath.card.buyerNoTitle'),
                  })
              : t('priorityPath.card.buyerUnknown')}
          </Text>
        ) : null}
        {ranked ? (
          <RankingDetail ranked={ranked} next={next} showWhy={showWhy} onToggleWhy={() => setShowWhy(open => !open)} />
        ) : (
          <div className="flex items-center justify-between">
            <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
              {t('priorityPath.priorityLabel')}
            </Text>
            <ContactPriorityBadge value={contact.priority} />
          </div>
        )}
        {contact.why_contact ? (
          <div className="flex items-start gap-2 text-[var(--bellum-text-secondary)]">
            <Star className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
            <Text size="xs" className="line-clamp-3 max-w-prose">
              {contact.why_contact}
            </Text>
          </div>
        ) : null}
        {/* #2120.23 — la voie d'accès, lue sur le classement serveur seulement.
            #2613 — jamais recherchée n'est plus une ligne « non mesurée ». */}
        {accessLabel ? <ContactMeta label={t('priorityPath.card.accessLabel')} value={accessLabel} /> : null}
        {coordinates ? <ContactMeta label={t('priorityPath.card.contactLabel')} value={coordinates} /> : null}
        {lastInteractionLabel ? (
          <ContactMeta label={t('priorityPath.card.lastInteractionLabel')} value={lastInteractionLabel} />
        ) : null}
      </div>

      {/* SIMON-FIX S.9 — colonne d'actions de largeur FIXE : sa largeur suivait ses boutons (« Enrichir… »
          vs « Contacter »), donc la colonne centrale — et « Pourquoi ce rang ? » — glissait de 143 px d'une ligne à l'autre. */}
      <div className="mt-auto flex flex-wrap gap-2 pt-4 md:mt-0 md:w-64 md:shrink-0 md:pt-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onContactClick?.(contact)}
          className="min-h-11 flex-1"
        >
          {t('row.viewProfile')}
        </Button>
        <button
          type="button"
          aria-label={t('priorityPath.card.openRecord', { name: identity.label })}
          onClick={() => onContactClick?.(contact)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          <ChevronRight aria-hidden="true" className="size-3.5 text-[var(--bellum-text-muted)]" />
        </button>
        <ContactEngagementTrigger
          contact={contact}
          enrichmentCredits={enrichmentCredits}
          onChannelSelect={onChannelSelect}
          onEnrich={onEnrich}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}

/**
 * #2120.22 + #2120.30-38 — le rang, sa note DÉCOMPOSÉE et la confiance NOMMÉE.
 * Un score n'est jamais nu : « Pourquoi ce rang ? » ouvre les neuf axes, et ce
 * qui n'a pas pu être évalué est nommé (primitive `ScoreWithAxes`).
 */
function RankingDetail({
  ranked,
  next,
  showWhy,
  onToggleWhy,
}: {
  ranked: RankedContact
  next: PathCard | null
  showWhy: boolean
  onToggleWhy: () => void
}) {
  const { t } = useTranslation('accountOrg')
  // #2297.57 — la joignabilité DÉPARTAGE, elle ne note pas : elle sort des axes
  // du score (qui somment au score affiché) et se lit sur sa propre ligne.
  const isTieBreaker = (key: string) => (CONTACT_RANKING_TIE_BREAKER_AXES as readonly string[]).includes(key)
  const axes = ranked.axes
    .filter(axis => !isTieBreaker(axis.key))
    .map(axis => ({
      label: t(`priorityPath.axes.${axis.key}`),
      score: axis.points,
      // SIMON-FIX S.24 / LOIC-FIX2 O.3 — le poids de chaque critère, lu sur le contrat (jamais recopié ici).
      max: axis.max,
      detail: t(`priorityPath.reasons.${axis.reason}`),
    }))
  // Recette 21/10 A.2 (S.24) — le total affiché est CELUI QUE LE DÉTAIL ADDITIONNE (`rankingTotals`),
  // jamais un `ranked.score` lu à côté : 53/85 dans les critères sous « 62/100 » ne se recoupait pas.
  const totals = ranked.score === null ? null : rankingTotals(ranked.axes, isTieBreaker)
  const nextTotals = next?.ranked ? rankingTotals(next.ranked.axes, isTieBreaker) : null
  const tieBreakers = ranked.axes.filter(axis => isTieBreaker(axis.key))
  const missing = ranked.axes.filter(axis => axis.points === null).map(axis => t(`priorityPath.axes.${axis.key}`))
  // LOIC-FIX2 O.3 — pourquoi cette personne passe devant la suivante, écrit à partir des points RÉELS.
  const passAhead = next?.ranked ? passAheadReason(ranked, next.ranked, axisKey => isTieBreaker(axisKey)) : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2" data-testid="ranking-header">
        {/* Recette 21/10 A.7 (S.19) — même aria-label que le badge « N° N » de /contacts.
            Recette 31/10 — le badge ne rétrécit pas et la rangée replie : le bouton ne le recouvre plus. */}
        <Text
          size="xs"
          weight="semibold"
          className="shrink-0 text-[var(--bellum-text-accent)]"
          aria-label={t('priorityPath.card.rankAria', { position: ranked.position })}
        >
          {t('priorityPath.card.rank', { position: ranked.position })}
        </Text>
        {/* Recette 21/10 A.4 — la cible mesurait 139×28 px : plancher de 44 px (GA-35). */}
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-expanded={showWhy}
          onClick={onToggleWhy}
          className="min-h-11"
        >
          {t(showWhy ? 'priorityPath.card.hideWhy' : 'priorityPath.card.whyRank')}
        </Button>
      </div>
      {/* #3754.4 — le niveau que L'ESN donne à ce poste : la RAISON de l'ordre, jamais un score.
          Aucune ligne quand l'intitulé ne rapproche aucun de ses postes cibles (on n'affiche pas
          ce qu'on n'a pas). */}
      {ranked.esn_target_level ? (
        <Text size="xs" weight="medium" data-testid="ranking-esn-level" className="text-[var(--bellum-text-secondary)]">
          {t('priorityPath.card.esnLevel', {
            level: ranked.esn_target_level,
            label: t(`priorityPath.card.esnLevels.${ranked.esn_target_level}`),
          })}
        </Text>
      ) : null}
      {/* LOIC-FIX O.3 — la RAISON d'un passage devant : le statut d'accès du compte (#4271)
          avance opérationnels/acheteurs (référencé) ou décideurs/sponsors (à bâtir). Sans cette
          ligne, un « Utilisateur » N°1 devant des décideurs se lisait comme une erreur. */}
      {ranked.order_reason ? (
        <Text
          size="xs"
          weight="medium"
          data-testid="ranking-order-reason"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t(`priorityPath.card.orderReason.${ranked.order_reason}`)}
        </Text>
      ) : null}
      {/* SIMON-FIX S.19 — UNE échelle pour la note d'une personne : sur 100, comme la fiche contact
          (`contactScoreView` ramène déjà les critères évalués sur 100). Le « /85 » changeait de plafond d'une
          carte à l'autre (55, 65, 75, 85) selon les axes évaluables ; le détail points/plafond reste dans les axes. */}
      <ScoreWithAxes
        score={totals?.score100 ?? null}
        max={100}
        axes={axes}
        reason={t('priorityPath.card.noScore')}
        compact={!showWhy}
        // #3912.1 — « Confiance moyenne, 35. C'est quoi le numéro ? » : un
        // score n'est jamais nu, l'infobulle dit ce qu'il mesure.
        scoreTooltip={
          totals ? t('priorityPath.card.scoreTooltip', { score: totals.points, max: totals.max }) : undefined
        }
      />
      {/* Recette 21/10 A.2 — le détail dit lui-même comment il devient le total. */}
      {showWhy && totals ? (
        <Text size="xs" data-testid="ranking-axes-sum" className="text-[var(--bellum-text-muted)]">
          {t('priorityPath.card.axesSum', { points: totals.points, max: totals.max, score: totals.score100 })}
        </Text>
      ) : null}
      {/* Recette 21/10 A.3 (O.3) — deux personnes à égalité de score : on le DIT, au lieu de rien. */}
      {showWhy && !passAhead && next && totals && nextTotals && totals.score100 === nextTotals.score100 ? (
        <Text size="xs" weight="medium" data-testid="ranking-tied" className="text-[var(--bellum-text-secondary)]">
          {t('priorityPath.card.tiedWith', {
            name: contactDisplayIdentity(next.contact).label,
            position: next.ranked?.position,
          })}
        </Text>
      ) : null}
      {showWhy && passAhead && next ? (
        <Text
          size="xs"
          weight="medium"
          data-testid="ranking-pass-ahead"
          className="text-[var(--bellum-text-secondary)]"
        >
          {t('priorityPath.card.passAhead', {
            name: contactDisplayIdentity(next.contact).label,
            position: next.ranked?.position,
            axis: t(`priorityPath.axes.${passAhead.key}`),
            points: passAhead.points,
            otherPoints: passAhead.otherPoints,
            max: passAhead.max,
          })}
        </Text>
      ) : null}
      {showWhy
        ? tieBreakers.map(axis => (
            <Text
              key={axis.key}
              size="xs"
              data-testid="ranking-tie-breaker"
              className="text-[var(--bellum-text-muted)]"
            >
              {t('priorityPath.card.tieBreaker', {
                axis: t(`priorityPath.axes.${axis.key}`),
                detail: t(`priorityPath.reasons.${axis.reason}`),
              })}
            </Text>
          ))
        : null}
      {/* #3063 (retour bêta, 26/09/2026) — Louis : « mettre sur une ligne ».
          Label, valeur et ce qui manque tenaient sur deux lignes empilées
          (`ContactMeta`) ; ils vivent maintenant sur UNE ligne qui replie.
          Ce qui n'a pas pu être évalué reste NOMMÉ (doctrine, gardes
          GA-18/19) : aucun texte protégé n'est retiré, seul l'habillage
          change. */}
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
          {t('priorityPath.card.confidenceLabel')}
        </Text>
        <Text
          size="xs"
          weight="medium"
          className="text-[var(--bellum-text-secondary)]"
          // #3912.2 — « Confiance moyenne, 35 » n'avait aucune infobulle :
          // la confiance compte les axes MESURÉS, jamais la complétude des
          // champs (ce que Louis avait répondu, à tort, en recette).
          title={t('priorityPath.card.confidenceTooltip', {
            measured: ranked.axes.length - missing.length,
            total: ranked.axes.length,
          })}
        >
          {t(`priorityPath.confidence.${ranked.confidence}`)}
        </Text>
        {missing.length > 0 ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('priorityPath.card.confidenceMissing', { axes: missing.join(', ') })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

// #3062 (retour bêta, 26/09/2026) — Louis : « supprimer » sur le bloc des six
// dimensions d'explication (#2295.8, `ContactExplanationList`). Retiré de
// cette carte ; le contrat (`CONTACT_EXPLANATION_DIMENSIONS`, `RankedContact.explanation`)
// n'est pas touché, rien ne l'appelait ailleurs.
//
// #3058 (retour bêta, 26/09/2026) — Louis : « ce message est incompréhensif,
// à supprimer » sur l'anti-recommandation par contact (#2295.9,
// `ContactAntiAdviceLine`). Retirée avec le même principe ; `RankedContact.anti_advice`
// reste au contrat, rien ne l'affiche plus depuis cette carte.

function ContactMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="xs" weight="medium" className="mt-1 line-clamp-2 break-words text-[var(--bellum-text-secondary)]">
        {value}
      </Text>
    </div>
  )
}
