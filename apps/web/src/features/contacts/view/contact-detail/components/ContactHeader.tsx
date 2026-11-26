import { type Contact, enrichmentCooldown, isContactIdentityComplete } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import {
  getMissingChannels,
  getSendableChannels,
} from '@/features/accounts/view/account-detail/components/contact-engagement/channel'
import { ContactChannelMenu } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactChannelMenu'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { EnrichConfirmDialog, type EnrichmentScope } from '@/features/contacts/components/EnrichConfirmDialog'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { CreateSequenceDialog } from '@/features/outreach/view/CreateSequenceDialog'
import { useHideContact } from '@/features/contacts/hooks/useHideContact'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { ContactDepartureBadge } from '@/features/contacts/components/ContactDepartureBadge'
import { contactDeparture } from '@/features/contacts/lib/contactDeparture'
import { contactDisplayIdentity } from '@/features/contacts/lib/contactDisplayIdentity'
import { contactPlanAction } from '@/features/contacts/lib/contactPlanAction'
import { ContactEnrichConfirm, useContactEnrich } from './ContactEnrichButton'
import { ContactMoreActions } from './ContactMoreActions'
import { ContactRelationBadges } from './ContactRelationBadges'
import { useCopyContactLink } from './CopyContactLinkButton'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { safeHref } from '@/lib/safe-href'

function ContactActions({
  contact,
  onGenerateMessage,
  onOpenNotes,
}: {
  contact: Contact
  onGenerateMessage: (channel: EngagementChannel) => void
  onOpenNotes?: () => void
}) {
  const { t } = useTranslation('contacts')
  const { t: tEngagement } = useTranslation('engagement')
  const navigate = useNavigate()
  // #2123.72 — joignable = au moins un canal d'ENVOI ; le menu, lui, propose
  // aussi la tâche de prise de contact.
  const channels = getSendableChannels(contact)
  const missingChannels = getMissingChannels(contact)
  const canCompleteContact = missingChannels.length > 0
  // Tentative récente restée vide : on retire le bouton plein « Compléter ».
  // #3632 / #3693.2 — le menu « Contacter » de la fiche ne porte plus
  // l'enrichissement ; « réessayer quand même » se lit à côté d'Enrichir (plus bas).
  const enrichCooldown = enrichmentCooldown(contact)
  // #1100 — « Il faudrait un bouton -> Lien vers le linkedin s'il existe. »
  // Il existait : dans la carte « profil Apollo », qui ne se rend QUE si Apollo
  // a renvoyé une charge utile. Un contact dont on connaît l'URL LinkedIn sans
  // profil Apollo n'avait donc aucun lien — c'est-à-dire précisément le cas où
  // le commercial n'a que ça pour ouvrir la porte. Présent seulement : pas
  // d'URL, pas de bouton (jamais un lien mort).
  const linkedinHref = safeHref(contact.linkedin_url ?? contact.apollo_enrichment?.linkedin_url ?? null)

  const hideMutation = useHideContact()
  const hide = () =>
    hideMutation.mutate({
      contact,
      hidden: true,
      // The contact drops out of the default list — leave the now-hidden detail
      // page for the list.
      onHidden: () => void navigate({ to: '/contacts' }),
    })

  // « Plan d'action » : ajoute ce contact au plan d'action réel du compte
  // (#2123.46 — la ligne canonique, POST /plan-items, avec ce contact comme
  // objet visé), puis ouvre l'onglet Plan du compte. Le corps vient du helper
  // PARTAGÉ avec l'action de masse du panneau de sélection — le serveur
  // dédoublonne une action ouverte sur son libellé ET son objet.
  // #1473 — un contact À QUALIFIER n'a pas de compte, donc pas de plan d'action
  // où poser la ligne. Le hook reste monté INCONDITIONNELLEMENT (il lit un cache
  // react-query ; le rendre conditionnel casserait l'ordre des hooks) et c'est
  // le BOUTON qui disparaît : proposer un geste qui n'a nulle part où atterrir
  // est pire que ne pas le proposer.
  const accountId = contact.account_id
  const { addAction, isPending: planPending } = usePersistAccountPlan(accountId ?? '')
  const addToPlan = () => {
    if (!accountId) return
    void addAction(contactPlanAction(contact))
      .then(() => navigate({ to: '/accounts/$id', params: { id: accountId }, search: { tab: 'plan' } }))
      .catch(() => undefined)
  }

  // « Compléter les infos manquantes » = enrichissement Apollo réel (email /
  // téléphone). `organization_name` est requis : on prend l'`entity` du contact,
  // sinon le nom du compte (fallback chargé seulement s'il manque).
  const enrichMutation = useEnrichContact()
  const { data: fallbackAccount } = useQuery({
    queryKey: accountKeys.detail(accountId ?? 'none'),
    queryFn: () => accountsApi.getOne(accountId ?? ''),
    // #1473 — sans compte, il n'y a rien à aller chercher. `enabled: false`
    // plutôt qu'un appel qui rendrait 404 : une requête qui échoue à chaque
    // ouverture de fiche remplirait le journal réseau d'un faux problème.
    enabled: !contact.entity && Boolean(accountId),
  })
  // Le solde conditionne l'action, exactement comme sur l'écran compte : sans
  // crédit on grise au lieu de laisser cliquer pour se prendre un 402.
  // #2091 — `undefined` tant que le solde n'est pas mesuré (JAMAIS `0` — voir
  // la JSDoc de `useCredits`, « never a zero »), lu par `ContactChannelMenu`
  // (menu « Contacter ») ET par `ContactEnrichButton` (bouton plein) via son
  // propre `useCreditGate` — même solde serveur, même « le doute n'interdit
  // pas » aux deux endroits (#3021 : une seule source de coût/solde, jamais
  // recalculée deux fois).
  const { data: credits } = useCredits()
  const enrichmentCredits = credits?.enrichment_credits
  const orgName = contact.entity || fallbackAccount?.company_name || ''
  // #4331.2 — la reprise d'un job en vol n'est sondée qu'une fois : par le bouton
  // principal quand il est là, sinon par ce montage (item du menu).
  const enrichState = useContactEnrich(contact)
  const completing = enrichMutation.isPending && enrichMutation.variables?.contact.id === contact.id

  // Transparence billing (addendum Théo p.11) : le clic n'enrichit PLUS
  // directement — il arme la confirmation, qui annonce le coût. C'était le
  // défaut de cet écran : l'item de menu « réessayer quand même » appelait
  // `mutate` sans accord, alors que tous les autres chemins passent par le
  // dialog. #3021 (25/09/2026) a retiré le bouton plein « Compléter » de ce
  // même mécanisme : il rend désormais `ContactEnrichButton`, la SEULE
  // liaison dispensée de cette porte (voir GA-49, `INLINE_COST_ANNOUNCERS`) —
  // son propre libellé porte déjà le prix.
  const [pendingForce, setPendingForce] = useState<boolean | null>(null)
  // #2988 (recette écran 28/09/2026) — même sélecteur que `ContactContent.tsx`
  // (GA-26), armé à « les deux » à chaque ouverture : le choix d'un
  // enrichissement précédent ne fuite pas sur le suivant.
  const [pendingScope, setPendingScope] = useState<EnrichmentScope>('both')
  // #3693.1 — « Ajouter à une séquence » OUVRE le choix de la cadence (même
  // fenêtre que la carte « Séquences d'outreach ») ; il n'inscrit rien seul.
  const [sequenceOpen, setSequenceOpen] = useState(false)
  const askCompleteInfo = ({ force }: { force: boolean }) => {
    setPendingScope('both')
    setPendingForce(force)
  }
  const confirmCompleteInfo = () => {
    if (!orgName || pendingForce === null) return
    enrichMutation.mutate({
      contact,
      accountCompanyName: orgName,
      ...(pendingForce ? { force: true } : {}),
      ...(pendingScope !== 'both' ? { only: pendingScope } : {}),
    })
  }
  // #4404.1 (retour bêta 21/10) — « Compléter » a UNE place, à côté de « Contacter »,
  // quel que soit l'état : impossible ⇒ désactivé et la raison se DIT (title +
  // aria-description), jamais caché. La raison la plus parlante gagne : tentative
  // récente vide, puis contact déjà complet, puis la raison du hook (crédit, société…).
  const completeBlockedReason = enrichCooldown
    ? tEngagement('trigger.alreadyEnriched', {
        date: new Date(enrichCooldown.lastAttemptAt).toLocaleDateString(i18n.language),
      })
    : !canCompleteContact
      ? t('enrich.alreadyCompleteHint')
      : enrichState.disabled
        ? enrichState.hint
        : undefined
  const completeHint = completeBlockedReason ?? enrichState.hint
  const showRetryInMenu = channels.length > 0 && canCompleteContact && enrichCooldown
  // #4504.2 — « Copier le lien » quitte l'en-tête de la page pour le menu « … » (même copie, `useCopyContactLink`).
  const copyLink = useCopyContactLink(contact.id)
  return (
    // #4504.1 (contrat Louis 24/10) — à droite : « Enrichir » (secondaire, taille normale) puis « Contacter ▾ »
    // (principal), puis « … ». Aucun bouton étiré : chacun garde sa largeur de libellé.
    <div className="flex flex-wrap items-center gap-2" data-testid="contact-primary-actions">
      <Button
        variant={channels.length > 0 ? 'outline' : 'black'}
        size="sm"
        className="min-h-11"
        icon={Zap}
        isLoading={enrichState.enriching}
        loadingText={t('enrich.loading')}
        disabled={Boolean(completeBlockedReason) || enrichState.disabled}
        title={completeHint}
        aria-description={completeHint}
        onClick={enrichState.enrich}
      >
        {enrichState.buttonLabel(t('header.complete'))}
      </Button>
      {channels.length > 0 ? (
        <ContactChannelMenu
          contact={contact}
          // #3632 (Louis 05/10/2026) — plus d'item « Compléter les infos manquantes » dans ce menu.
          enrichmentCredits={enrichmentCredits}
          isLoading={completing}
          // #3487.1 — libellé générique : la situation est nommée UNE fois, par `ContactRelationalCtaBanner`.
          onChannelSelect={onGenerateMessage}
          onAddToSequence={() => setSequenceOpen(true)}
          // Théo B c5.A8 — « Ajouter au plan » dans « Contacter » ; un contact à qualifier n'a pas de plan.
          onAddToPlan={accountId ? addToPlan : undefined}
        />
      ) : null}
      <ContactMoreActions
        contactName={contact.full_name}
        onOpenNotes={onOpenNotes}
        // #1473 — masqué pour un contact à qualifier : le plan d'action appartient à un compte.
        onAddToPlan={accountId ? addToPlan : undefined}
        planPending={planPending}
        linkedinHref={linkedinHref}
        onCopyLink={copyLink}
        onHide={hide}
        hidePending={hideMutation.isPending}
        // #3693.2 — sous cooldown, ce que le menu Contacter disait se lit ICI.
        enrichCooldownLabel={
          showRetryInMenu && enrichCooldown
            ? tEngagement('trigger.alreadyEnriched', {
                date: new Date(enrichCooldown.lastAttemptAt).toLocaleDateString(i18n.language),
              })
            : undefined
        }
        onRetryEnrich={showRetryInMenu ? () => askCompleteInfo({ force: true }) : undefined}
        retryDisabled={completing || enrichmentCredits === undefined || enrichmentCredits <= 0}
        retryLabel={tEngagement('trigger.retryAnyway')}
      />
      {/* #4504.2 — l'explication et le champ du nom vivent DANS la modale qu'ouvre « Enrichir ». */}
      <ContactEnrichConfirm contact={contact} state={enrichState} />
      {/* Monté À L'OUVERTURE seulement : fermé, il ne charge rien. */}
      {sequenceOpen ? (
        <CreateSequenceDialog
          open={sequenceOpen}
          onOpenChange={setSequenceOpen}
          contactsLocked
          initialContacts={[
            {
              id: contact.id,
              full_name: contact.full_name,
              title: contact.title ?? null,
              email: contact.email ?? null,
              excluded_at: contact.excluded_at ?? null,
              assigned_to: contact.assigned_to ?? null,
            },
          ]}
        />
      ) : null}
      <EnrichConfirmDialog
        open={pendingForce !== null}
        onOpenChange={open => {
          if (!open) setPendingForce(null)
        }}
        count={1}
        coordinateScope={pendingScope}
        onCoordinateScopeChange={setPendingScope}
        onConfirm={confirmCompleteInfo}
      />
    </div>
  )
}

/** Map the snake_case Contact onto the contracts identity predicate. */
export function contactIdentityComplete(contact: Contact): boolean {
  return isContactIdentityComplete({
    fullName: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    role: contact.decision_role,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
}

function ContactIdentity({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  // Show the ROLE (« Directeur des Sports ») instead of an unconfirmed
  // role-persona placeholder first name; the real name + photo replace it the
  // moment Apollo/SalesQL completes the identity (retour Théo P0).
  const identity = contactDisplayIdentity(contact)
  // Théo B c5 — « fonction · compte », le compte cliquable. Même clé de cache que le repli d'enrichissement.
  const accountId = contact.account_id
  const { data: account } = useQuery({
    queryKey: accountKeys.detail(accountId ?? 'none'),
    queryFn: () => accountsApi.getOne(accountId ?? ''),
    enabled: Boolean(accountId),
  })
  const companyName = account?.company_name
  // #4465.2 — un départ lu du parcours se NOMME sur la fiche ; le contact reste consultable, marqué.
  const departure = contactDeparture(contact, companyName)
  const showTitle = !identity.roleToIdentify && Boolean(contact.title)
  return (
    <Box display="flex" className="min-w-0 items-center gap-4">
      <ContactAvatar name={identity.label} photoUrl={contact.photo_url} size="lg" />
      <Box className="min-w-0 space-y-1.5">
        <Text element="h1" size="2xl" weight="semibold" className="break-words text-[var(--bellum-text-primary)]">
          {identity.label}
        </Text>
        {/* #4504.1 — « fonction · compte (lien) » ; la fonction est le h1 quand on se tient dans le rôle. */}
        {showTitle || (accountId && companyName) ? (
          <Text element="p" size="sm" data-testid="contact-hero-subtitle" color="text-muted-foreground">
            {showTitle ? contact.title : null}
            {showTitle && accountId && companyName ? ' · ' : null}
            {accountId && companyName ? (
              <Link
                to="/accounts/$id"
                params={{ id: accountId }}
                data-testid="contact-hero-account"
                className="font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
              >
                {companyName}
              </Link>
            ) : null}
          </Text>
        ) : null}
        {/* #2160.9 — le responsable se lit aussi en tête de fiche (il reste dans Informations clés, #4504.3) ;
            `owner` absent (non servi) = aucune ligne, `null` = « Non attribué » (doctrine : rien d'inventé). */}
        {contact.owner !== undefined ? (
          <Text element="p" size="sm" data-testid="contact-hero-owner" color="text-muted-foreground">
            {t('header.ownerLine', { owner: contact.owner?.name ?? t('keyInfo.ownerNone') })}
          </Text>
        ) : null}
        {departure ? <ContactDepartureBadge organization={departure.organization} at={departure.at} /> : null}
        {/* #4504.1 (contrat Louis 24/10) — DEUX étiquettes au plus : le statut de relation (dérivé, cliquable pour
            déclarer ; sans badge servi, le statut déclaré) et le rôle ; puis « Décideur », discret. Quittent
            l'en-tête : « Ton du message », « calculé par l'analyse · date », « À jour depuis », « Nom à révéler »
            (dit par Enrichir), « Attribuer » et « Ne pas contacter » (Informations clés). */}
        <Box display="flex" className="min-w-0 flex-wrap items-center gap-2" data-testid="contact-hero-badges">
          <ContactRelationBadges contact={contact} />
          <DecisionMakerBadge role={contact.decision_role} />
        </Box>
      </Box>
    </Box>
  )
}

export function ContactHeader({
  contact,
  onGenerateMessage,
  onOpenNotes,
}: {
  contact: Contact
  onGenerateMessage: (channel: EngagementChannel) => void
  /** #3640 / #3688 — mène à l'éditeur de notes de la zone de travail, bouton posé sous « Contacter ». */
  onOpenNotes?: () => void
}) {
  // Théo B c5-fiche-contact `.entity-hero` — l'identité à gauche, les gestes à droite, sans carte autour.
  // La jauge « /100 » a quitté l'en-tête : aucun score en points ; la priorité s'écrit en MOT dans
  // « Pourquoi préparer cet échange », avec ses axes (`ContactScoreBreakdown`).
  return (
    <Box
      as="header"
      data-testid="contact-hero"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 max-md:items-start"
    >
      <ContactIdentity contact={contact} />
      <ContactActions contact={contact} onGenerateMessage={onGenerateMessage} onOpenNotes={onOpenNotes} />
    </Box>
  )
}
