import type { ApolloPhoneNumber, Contact, EnrichmentCooldown } from '@bellum/contracts'
import { contactEmploymentStatus } from '@/features/contacts/lib/contactEmploymentStatus'
import { phoneNatureFromProviderType, resolvePhoneNature } from '@bellum/contracts'
import {
  computeContactFieldStatus,
  enrichmentCooldown,
  formatPhoneForDisplay,
  isPlausiblePhoneNumber,
  looksLikePhoneNumber,
  toE164,
} from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { ContactEnrichConfirm, useContactEnrich } from './ContactEnrichButton'
import { safeHref } from '@/lib/safe-href'
import {
  Briefcase,
  Building2,
  ChevronDown,
  Clock,
  Languages,
  Ban,
  Linkedin,
  Mail,
  MailX,
  MapPin,
  Phone,
  Tag,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { getRoleLabel } from '@/lib/contactRoles'
import { cleanEntity } from '@/features/contacts/lib/contactEntity'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import { contactEmploymentSeenAt } from '@/features/contacts/lib/contactEmploymentSeen'
import { contactJobPostingProof } from '@/features/contacts/lib/contactJobPosting'
import { contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import { formatDate } from '@/lib/locale'
import { useSession } from '@/lib/hooks/use-session'
import { TagChips } from '@/components/primitives/TagChips'
import { DoNotContactPreference } from '@/features/team-guardrails/components/DoNotContactPreference'
import { ContactAssignControl } from './ContactAssignControl'
import { SectionCard } from './SectionCard'

/**
 * #3945/#3946 (retour bêta Louis 08/10/2026) — `ContactFieldMeta` (provenance,
 * confiance, coût sous chaque champ) est SUPPRIMÉ. ⚠️ Troisième retour sur le
 * même point (après #3842/#3840, qui l'avaient fusionné en une ligne plutôt
 * que supprimé, au nom de GA-18/19 et de « Aucune PROBABILITÉ » —
 * agent_docs/doctrine.md:13-14, `Provenance` étant une primitive NOMMÉE par
 * cette doctrine) : TRANCHÉ explicitement cette fois, mot pour mot
 * « supprimer », avec la garde du doctrine qui reste posée ailleurs —
 * `Provenance` et la confiance nommée restent utilisées partout où la
 * doctrine les exige (score, listes). Ce qui ne bouge pas : les coordonnées
 * elles-mêmes restent affichées EN CLAIR, intactes (doctrine c87).
 */

/** "+33 6 81 05 00 91 (mobile)" — international lisible (#3850.4), plus le
 *  type Apollo quand présent. */
function phoneLabel(phone: ApolloPhoneNumber): string {
  const formatted = formatPhoneForDisplay(phone.number)
  return phone.type ? `${formatted} (${phone.type})` : formatted
}

function InfoRow({
  icon: Icon,
  label,
  value,
  verified,
  estimatedAt,
  stacked,
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  verified?: boolean
  /** #4016 L4.1 — la valeur est une ESTIMATION vérifiée à cette date : badgée « estimé », jamais « vérifié ». */
  estimatedAt?: string | null
  /** #3687 — une valeur qui ne se coupe pas (e-mail) passe SOUS son étiquette, jamais à côté. */
  stacked?: boolean
}) {
  const { t } = useTranslation('contacts')
  if (!value) return null
  return (
    /**
     * R15-11 — L'ÉTIQUETTE ET LA VALEUR SE LISENT TOUTES LES DEUX.
     *
     * Mesuré en production le 15/09 (`5ca597d5a`) : « FoncHead of CISO Services
     * / Chief Information S… », « EntitTHALES COMMUNICATION & SECURITE NU… ».
     *
     * Trois causes, un remède chacune :
     *  · l'étiquette se faisait ÉCRASER. `index.css` pose `min-width: 0` sur
     *    tout enfant de flex (la cause racine des débordements horizontaux du
     *    dépôt) : le plancher implicite `min-width: auto` n'existe plus, et un
     *    enfant qui ne doit jamais se rétrécir doit le DIRE — `shrink-0` ;
     *  · la valeur était forcée sur une seule ligne (`noWrap` + `truncate`), ce
     *    qui la faisait déborder par-dessus au lieu de la pousser. Elle passe à
     *    la ligne, et `break-words` casse aussi un mot interminable — une
     *    raison sociale en majuscules n'a pas d'espace où se plier ;
     *  · à ~400 px les deux ne tiennent pas côte à côte : la ligne ENTIÈRE se
     *    replie (`flex-wrap`), la valeur descend sous son étiquette. Une
     *    troncature aurait « tenu » la largeur en cachant la moitié du poste.
     */
    <Box
      display="flex"
      data-stacked={stacked ? 'true' : undefined}
      className={
        stacked
          ? 'flex-col items-start gap-y-0.5 py-1.5'
          : 'flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5'
      }
    >
      <Box display="flex" className="shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <Text
          element="span"
          size="xs"
          title={verified === false && !estimatedAt ? t('keyInfo.notVerified') : undefined}
        >
          {label}
        </Text>
        {/* #3843 — retour bêta 08/10 : le badge « Vérifié » posé sur une
            coordonnée confirmée était pointé comme clutter (« supprime »).
            Aucune doctrine de CLAUDE.md ne protège ce badge précis (ce n'est
            ni un score, ni une valeur non mesurée) : retiré. Le silence est
            la bonne nouvelle — seul le doute (`verified === false`) reste
            NOMMÉ ci-dessous, ce que GA-18/19 continue d'exiger sur une fiche. */}
        {/* #2120.69 — « non vérifié » se DIT : un statut absent se lisait
            « rien à signaler ». `undefined` (champ sans vérification possible,
            ex. le poste) reste muet.
            VU EN PASSANT (lot V12, 08/10) — posé ici, sur la ligne de
            l'ÉTIQUETTE (texte court et fixe), plutôt que sur celle de la
            VALEUR : coté valeur, à 320 px, il pouvait retomber sur sa propre
            3e ligne quand la valeur ne laissait pas assez de place à côté
            d'elle (champ `stacked`, ex. e-mail) — jamais en raccourcissant la
            valeur elle-même (R15-11). */}
        {/* #4292.17 / #4292.18 (#4275, #4276) — « Non vérifié » ne s'écrit plus à côté de la coordonnée (Louis :
            « supprime » ; coordonnées pro toujours en clair, c87). Le doute reste lisible AU SURVOL (title) seulement. */}
        {estimatedAt ? <EstimatedBadge verifiedAt={estimatedAt} /> : null}
      </Box>
      <Box
        display="flex"
        className={
          stacked
            ? 'w-full min-w-0 max-w-full flex-wrap items-center gap-1.5 pl-6'
            : 'min-w-0 flex-1 items-center justify-end gap-1.5'
        }
      >
        <Text
          element="span"
          size="sm"
          weight="medium"
          // #4522.3 — `break-words` ne baisse PAS la largeur minimale d'un mot : une adresse sans espace (« alina.gherman@… »)
          // sortait de sa carte de 21 px (prod 25/10). `overflow-wrap:anywhere` la fait entrer dans le calcul de largeur : elle
          // se REPLIE sur plusieurs lignes, jamais tronquée (coordonnée pro en clair, c87).
          className={
            stacked
              ? 'min-w-0 max-w-full text-left text-foreground [overflow-wrap:anywhere]'
              : 'break-words text-right text-foreground'
          }
        >
          {value}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * SIG-B (11/10/2026) — un recruteur NOMMÉ par une offre d'emploi publiée : la
 * ligne porte la PREUVE — l'offre (lien, nouvel onglet) et sa date de
 * publication quand la source la donne. L'étiquette est le libellé de la
 * source (« Offre d'emploi publiée », un seul endroit), jamais un fournisseur.
 * Sans preuve vérifiable : aucune ligne.
 */
function JobPostingProofRow({ rawData }: { rawData: Record<string, unknown> | null | undefined }) {
  const { t } = useTranslation('contacts')
  const proof = contactJobPostingProof(rawData)
  if (!proof) return null
  const postedAt = formatDate(proof.postedAt, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <InfoRow
      icon={Briefcase}
      label={contactSourceLabel('job_posting')}
      stacked
      value={
        <>
          <a
            href={proof.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
          >
            {proof.title || t('keyInfo.jobPostingOpen')}
          </a>
          {postedAt ? (
            <span className="text-[var(--bellum-text-muted)]">
              {' · '}
              {t('keyInfo.jobPostingPostedAt', { date: postedAt })}
            </span>
          ) : null}
        </>
      }
    />
  )
}

/** A row showing that Apollo HAS a contact point to reveal, before a credit is
 *  spent — rendered where the (still missing) email/phone would sit. */
function AvailabilityRow({ icon: Icon, label, badge }: { icon: LucideIcon; label: string; badge: string }) {
  // #3724 — recette prod 05/10 : le badge recouvrait l'étiquette et son texte
  // était tronqué. Même remède que `InfoRow` (R15-11) : l'étiquette ne se
  // rétrécit pas (`shrink-0`), la ligne se replie (`flex-wrap`) et le badge,
  // pilule mono-ligne (garde `pill-single-line`), passe SOUS l'étiquette au
  // lieu de la recouvrir : son texte reste entier.
  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
      <Box display="flex" className="shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <Text element="span" size="xs">
          {label}
        </Text>
      </Box>
      {/* #4522 — libellé court (« Email disponible ») : le badge tient dans sa colonne, il ne la déborde plus. */}
      <Badge variant="info" className="min-w-0 max-w-full">
        <Text element="span" size="xs">
          {badge}
        </Text>
      </Badge>
    </Box>
  )
}

/**
 * #2598 — un canal cherché et resté vide se DIT, il ne disparaît plus.
 *
 * Avant : `InfoRow` rendait `null` sur une valeur vide, et `AvailabilityRow`
 * s'éteignait dès la première tentative (`enrichmentAttempted`). Le résultat
 * mesuré était un silence total — aucune ligne, aucune explication — qui se
 * lisait comme « le produit n'a jamais le numéro », alors que la vraie
 * réponse est « nos fournisseurs ne l'ont pas trouvé ». Jamais de valeur
 * devinée ni de « 0 » : juste le fait, nommé (GA-18/19).
 */
/**
 * #4016.L13 — « fait confirmé jusqu'à preuve contraire » : la valeur confirmée à la main reste
 * affichée au-dessus ; ce qu'une source a dit contre elle se NOMME ici, daté — jamais à sa place,
 * jamais le nom du fournisseur (doctrine). Absente = aucune ligne.
 */
function ContradictionRow({
  contact,
  field,
  icon,
  label,
}: {
  contact: Contact
  field: string
  icon: LucideIcon
  label: string
}) {
  const { t } = useTranslation('contacts')
  const contradiction = contact.field_contradictions?.find(entry => entry.field === field)
  const date = contradiction
    ? formatDate(contradiction.observedAt, { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  if (!contradiction || !date) return null
  return (
    <NotFoundRow icon={icon} label={label} hint={t('keyInfo.contradiction', { value: contradiction.value, date })} />
  )
}

function NotFoundRow({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) {
  // #3782 — retour bêta 06/10 : l'indice débordait PAR-DESSUS le reste de la
  // carte sur une colonne étroite. Même cause racine que R15-11 (étiquette ↔
  // valeur) : un texte libre, sans plancher (`min-w-0`) ni plafond
  // (`flex-1`), ne se replie jamais — il garde sa largeur intrinsèque et
  // chevauche ce qui suit au lieu d'être repoussé à la ligne suivante.
  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
      <Box display="flex" className="shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <Text element="span" size="xs">
          {label}
        </Text>
      </Box>
      <Box className="min-w-0 flex-1 text-right">
        <Text element="span" size="xs" className="break-words text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      </Box>
    </Box>
  )
}

/**
 * #4599.6 — une fiche SANS e-mail (jamais cherché : la valeur gabarit vidée par #4599 y mène) le DIT, et propose de
 * le chercher. La recherche est celle d'« Enrichir » de l'en-tête (`useContactEnrich`, GA-26) : même confirmation
 * qui annonce le coût, même garde de crédit — jamais un débit direct depuis cette ligne.
 */
function EmailAbsentRow({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const state = useContactEnrich(contact, { resume: false })
  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5">
      <Box display="flex" className="shrink-0 items-center gap-2 text-muted-foreground">
        <Mail className="size-3.5 shrink-0" />
        <Text element="span" size="xs">
          {t('keyInfo.email')}
        </Text>
      </Box>
      <Box display="flex" className="min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2">
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('table.emailMissing')}
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          disabled={state.disabled}
          title={state.hint}
          onClick={() => {
            state.enrich()
            state.setScope('email')
          }}
        >
          {t('coordinates.search.email')}
        </Button>
      </Box>
      <ContactEnrichConfirm contact={contact} state={state} />
    </Box>
  )
}

/**
 * #2598.3 — sous cooldown (`enrichmentCooldown`, même règle que
 * `ContactChannelMenu`/`ContactHeader`), la date d'un prochain essai qui aurait
 * du sens ; sinon un message générique — jamais de date inventée quand la
 * garde d'idempotence ne s'applique pas (ex. dernier résultat `matched` malgré
 * un canal resté vide).
 */
function channelNotFoundHint(t: TFunction, cooldown: EnrichmentCooldown | null, sourcesQueried?: number): string {
  // #3822/E1 — le COMPTE réel des sources interrogées, jamais leur nom ; 0 ou
  // inconnu ⇒ on ne l'écrit pas (« chez 0 sources » serait faux).
  const count = sourcesQueried && sourcesQueried > 0 ? sourcesQueried : null
  if (!cooldown) return count ? t('keyInfo.channelNotFoundSources', { count }) : t('keyInfo.channelNotFound')
  const date = new Date(cooldown.retryAvailableAt).toLocaleDateString(i18n.language)
  return count ? t('keyInfo.channelNotFoundSourcesUntil', { count, date }) : t('keyInfo.channelNotFoundUntil', { date })
}

/**
 * #3850.4 — deux téléphones de MÊME forme différente ne sont jamais
 * distincts : `contact.phone` écrit après ce lot est l'E.164 COMPACT, tandis
 * que `apollo_enrichment.phone_numbers[].number` reste tel qu'Apollo l'a
 * rendu (espacé ou non) — un même numéro ne doit pas se lire deux fois
 * (`additionalPhones`) ni manquer son badge « mobile » (`primaryPhoneIsMobile`)
 * à cause d'un simple espace.
 */
function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const normalize = (value: string): string => (isPlausiblePhoneNumber(value) ? toE164(value) : value.trim())
  return normalize(a) === normalize(b)
}

export function ContactKeyInfo({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const employmentSeenOn = formatDate(contactEmploymentSeenAt(contact.raw_data), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const employment = contactEmploymentStatus({
    rawData: contact.raw_data,
    employmentVerifiedAt: contact.employment_verified_at,
  })
  const statusDate = (value: string) => formatDate(value, { day: 'numeric', month: 'short', year: 'numeric' }) ?? value
  const employmentStatusLine =
    employment.state === 'unverified'
      ? t('keyInfo.employmentUnverified')
      : employment.state === 'not_found'
        ? t('keyInfo.employmentNotFound', { date: statusDate(employment.at) })
        : employment.state === 'left'
          ? t('keyInfo.employmentLeft', { organization: employment.organization, date: statusDate(employment.at) })
          : null
  // Additional Apollo contact points (present-only) — extra revealed emails and
  // any secondary numbers beyond the primary already shown above.
  const additionalEmails = contact.apollo_enrichment?.personal_emails ?? []
  const providerPhones = contact.apollo_enrichment?.phone_numbers ?? []
  // #4522 (recette prod 25/10) — un numéro CONNU s'affiche en clair, à sa place (doctrine c87). La colonne
  // `phone` peut rester vide alors que le profil fournisseur déjà stocké porte le numéro (révélation ciblée
  // e-mail, numéro rendu seulement dans `phone_numbers[]`) : il était replié en « Autre téléphone » pendant
  // que la ligne principale disait « Téléphone disponible ». Le premier numéro qui a la forme d'un
  // téléphone prend la ligne principale ; jamais une valeur sans cette forme (rien de deviné).
  const shownPhone = contact.phone?.trim()
    ? contact.phone
    : (providerPhones.find(phone => looksLikePhoneNumber(phone.number))?.number ?? null)
  const additionalPhones = providerPhones.filter(phone => !samePhone(phone.number, shownPhone))
  // #2297.8 — le numéro AFFICHÉ (`contact.phone`) est-il, chez Apollo, un
  // mobile ? La colonne scalaire fusionne déjà tous les types (mobile, ligne
  // directe, standard…) ; `phone_numbers[]` (même profil, déjà stocké) garde
  // le type. Aucune donnée nouvelle, aucun appel : « légalement disponible »
  // est déjà acquis en amont — le catalogue interdit (#2297.55) empêche de
  // COLLECTER un `personal_phone`/`personal_mobile`, jamais un mobile
  // professionnel comme celui-ci.
  const primaryPhoneIsMobile = providerPhones.some(
    phone => samePhone(phone.number, shownPhone) && phone.type === 'mobile',
  )
  // #4178.2 — nature du numéro affiché : les natures que le fournisseur déclare
  // pour CE numéro (`phone_numbers[]`) d'abord — un désaccord se nomme — sinon la
  // nature stockée, sinon « non vérifiée ». Jamais « pro » par déduction.
  const phoneNatureBadge = (() => {
    if (!shownPhone) return null
    const declared = providerPhones
      .filter(phone => samePhone(phone.number, shownPhone))
      .map(phone => phoneNatureFromProviderType(phone.type))
    const { nature, conflicting } = resolvePhoneNature(declared)
    if (conflicting.length > 0) {
      return t('keyInfo.phoneNatureConflict', {
        natures: conflicting.map(item => t(`keyInfo.phoneNatures.${item}`)).join(' · '),
      })
    }
    // #4292.17 — « Nature non vérifiée » ne fait AUCUNE ligne : une nature inconnue se tait (jamais « pro » par déduction).
    // La nature stockée qualifie la colonne `phone`, jamais un numéro lu dans le seul profil fournisseur.
    const resolved = (contact.phone ? contact.phone_nature : null) ?? nature
    return resolved === 'unknown' ? null : t(`keyInfo.phoneNatures.${resolved}`)
  })()
  // Availability flags Apollo returns on the FREE search tier (via the seed's
  // apolloDetails, carried in raw_data jsonb) — an email/phone EXISTS to reveal
  // with a paid enrich, even though its value is still locked. Show a badge where
  // the missing value would sit, so the seller knows the credit will pay off.
  const apolloDetails = (contact.raw_data?.['apolloDetails'] ?? null) as {
    hasEmail?: boolean
    hasPhone?: boolean
  } | null
  // Ce drapeau vient de la recherche GRATUITE, AVANT tout enrichissement : c'est
  // une promesse d'avant-vente (« le crédit va payer »). Une fois l'enrichissement
  // PASSÉ, il est périmé — et le canal encore vide est la réponse, pas la
  // question. Vu sur un contact réel le 04/08 : nom, photo, email et localisation
  // résolus, un crédit débité, et la ligne téléphone continuait d'annoncer
  // « Téléphone disponible — enrichir pour révéler ». Une promesse qui survit à
  // sa propre réponse invite à recliquer sans fin (le second passage ne débite
  // rien — `matched` exige une valeur NOUVELLE — mais il ne rapporte rien non
  // plus, et l'écran redit la même chose).
  const enrichmentAttempted = Boolean(contact.last_enrichment_at)
  // #2598.2 — le silence qui suivait une tentative ratée se lisait comme
  // « jamais de numéro » (retour bêta du 18/09, #2598). Le canal reste sans
  // ligne tant qu'il n'a JAMAIS été cherché (rien à dire) ; une fois cherché
  // et resté vide, il le DIT.
  // #2297.51 — une coordonnée ARCHIVÉE par la rétention (trois ans sans
  // activité) n'est ni « jamais cherchée » ni « non trouvée » : la ligne dit
  // la date du geste, et prend la place du « non trouvé ».
  const archivedHint = contact.enrichment_archived_at
    ? t('keyInfo.channelArchived', {
        date: new Date(contact.enrichment_archived_at).toLocaleDateString(i18n.language),
      })
    : null
  // #2297.37 — statut NOMMÉ, une seule fois (GA-26) : `computeContactFieldStatus`
  // porte la même priorité (valeur > archivé > non trouvé > disponible avant-
  // vente > jamais tenté) qu'avant, mais partagée au lieu de dupliquée par champ.
  const emailStatus = computeContactFieldStatus({
    value: contact.email,
    enrichmentAttempted,
    // #4522 — l'annonce par champ (R22 a4, `contacts.*_availability`) dit la même promesse que le drapeau
    // brut de la recherche gratuite ; la démo ne sème que la colonne.
    apolloAvailable: apolloDetails?.hasEmail === true || contact.email_availability === 'available',
    archivedAt: contact.enrichment_archived_at,
    // #3822.2 — la panne (l'appel a échoué) est distincte du « non trouvé ».
    errored: contact.enrichment_coordinates?.email?.state === 'unknown',
    // #3782 — une révélation en vol (webhook) n'est pas davantage « non trouvé ».
    pending: contact.enrichment_coordinates?.email?.state === 'pending',
  })
  // #2297.33/.39 — le téléphone n'avait AUCUN statut de validité (#2120.69).
  // `invalid` se fonde sur la FORME de la valeur stockée (`looksLikePhoneNumber`,
  // même heuristique que celle qui filtre déjà les fournisseurs de secours),
  // jamais sur un vocabulaire de fournisseur non documenté dans ce dépôt.
  const phoneFormatInvalid = Boolean(shownPhone) && !looksLikePhoneNumber(shownPhone ?? '')
  const phoneStatus = computeContactFieldStatus({
    value: shownPhone,
    enrichmentAttempted,
    apolloAvailable: apolloDetails?.hasPhone === true || contact.phone_availability === 'available',
    archivedAt: contact.enrichment_archived_at,
    invalid: phoneFormatInvalid,
    errored: contact.enrichment_coordinates?.phone?.state === 'unknown',
    // #3782 — la révélation du mobile Apollo livre PLUS TARD (webhook) : tant
    // qu'elle est en vol, le champ n'est ni trouvé ni introuvable.
    pending: contact.enrichment_coordinates?.phone?.state === 'pending',
  })
  const emailAvailable = emailStatus === 'available'
  const phoneAvailable = phoneStatus === 'available'
  const emailArchived = emailStatus === 'archived'
  const phoneArchived = phoneStatus === 'archived'
  const emailNotFound = emailStatus === 'not_found'
  const phoneNotFound = phoneStatus === 'not_found'
  const phoneInvalid = phoneStatus === 'invalid'
  const emailErrored = emailStatus === 'error'
  const phoneErrored = phoneStatus === 'error'
  const emailPending = emailStatus === 'pending'
  const phonePending = phoneStatus === 'pending'
  const cooldown = enrichmentCooldown(contact)
  const linkedinHref = safeHref(contact.linkedin_url ?? contact.apollo_enrichment?.linkedin_url ?? null)
  const linkedinLabel = (contact.linkedin_url ?? contact.apollo_enrichment?.linkedin_url ?? '').replace(
    /^https?:\/\/(www\.)?/,
    '',
  )
  const moreInfoCount =
    [contact.location, contact.language, contact.timezone].filter(value => Boolean(value?.trim())).length +
    1 +
    additionalEmails.length +
    additionalPhones.length
  return (
    <SectionCard icon={Building2} iconClassName="text-[var(--text-primary)]" title={t('keyInfo.title')}>
      <Box className="divide-y divide-border/60">
        <InfoRow
          icon={Mail}
          label={t('keyInfo.email')}
          value={contact.email}
          verified={contact.email_verified}
          estimatedAt={contact.email ? contact.email_estimated_at : null}
          stacked
        />
        <ContradictionRow contact={contact} field="email" icon={Mail} label={t('keyInfo.email')} />
        {emailStatus === 'not_attempted' && <EmailAbsentRow contact={contact} />}
        {emailAvailable && (
          <AvailabilityRow icon={Mail} label={t('keyInfo.email')} badge={t('keyInfo.emailAvailable')} />
        )}
        {emailNotFound && (
          <NotFoundRow
            icon={Mail}
            label={t('keyInfo.email')}
            hint={channelNotFoundHint(t, cooldown, contact.enrichment_coordinates?.email?.sources_queried)}
          />
        )}
        {emailArchived && archivedHint && <NotFoundRow icon={Mail} label={t('keyInfo.email')} hint={archivedHint} />}
        {/* #3822.2 — la PANNE (l'appel a échoué) se distingue du « non
            trouvé » (l'appel a répondu, vide) : une panne invite à réessayer,
            un « non trouvé » non. */}
        {emailErrored && <NotFoundRow icon={Mail} label={t('keyInfo.email')} hint={t('keyInfo.channelErrorHint')} />}
        {/* #3782 — une révélation en vol (webhook) se DIT, distincte du
            « non trouvé » : le fournisseur répond encore. */}
        {emailPending && <NotFoundRow icon={Mail} label={t('keyInfo.email')} hint={t('keyInfo.channelPendingHint')} />}
        {/* #2733.2 — un rebond de livraison se NOMME à côté de l'adresse (c73) ; il a quitté l'en-tête (#4504.1). */}
        {contact.email && contact.email_bounced_at ? (
          <NotFoundRow icon={MailX} label={t('table.emailBounced')} hint={t('table.emailBouncedTitle')} />
        ) : null}
        {/* #2120.69 — aucune vérification de numéro n'existe dans le produit :
            « non vérifié » est donc le seul statut VRAI, jamais un « vérifié »
            deviné. */}
        {/* #3850.4 — affichage international lisible (« +33 6 81 05 00 91 »),
            en clair (doctrine c87) ; le stockage reste l'E.164 compact. */}
        <InfoRow
          icon={Phone}
          label={primaryPhoneIsMobile ? t('keyInfo.mobilePhone') : t('keyInfo.phone')}
          value={shownPhone ? formatPhoneForDisplay(shownPhone) : shownPhone}
          verified={false}
          // #4292.16 — un numéro ne se coupe pas : il passe sous son étiquette quand la colonne est étroite.
          stacked
        />
        <ContradictionRow contact={contact} field="phone" icon={Phone} label={t('keyInfo.phone')} />
        {/* #4178.2 — la NATURE du numéro, sur sa propre ligne : jamais « pro »
            par déduction du type de ligne. Une absence ne fait aucune ligne ;
            deux sources qui se contredisent se NOMMENT toutes les deux. */}
        {shownPhone && phoneNatureBadge && (
          <AvailabilityRow icon={Phone} label={t('keyInfo.phoneNature')} badge={phoneNatureBadge} />
        )}
        {phoneAvailable && (
          <AvailabilityRow icon={Phone} label={t('keyInfo.phone')} badge={t('keyInfo.phoneAvailable')} />
        )}
        {phoneNotFound && (
          <NotFoundRow
            icon={Phone}
            label={t('keyInfo.phone')}
            hint={channelNotFoundHint(t, cooldown, contact.enrichment_coordinates?.phone?.sources_queried)}
          />
        )}
        {phoneArchived && archivedHint && <NotFoundRow icon={Phone} label={t('keyInfo.phone')} hint={archivedHint} />}
        {/* #2297.33/.39 — la valeur RESTE affichée ci-dessus (on archive, on
            ne supprime pas) ; cette ligne NOMME le doute plutôt que de le
            taire, pour qu'un numéro qui a perdu sa forme ne se lise pas comme
            une coordonnée fiable. */}
        {phoneInvalid && <NotFoundRow icon={Phone} label={t('keyInfo.phone')} hint={t('keyInfo.phoneInvalidHint')} />}
        {/* #3822.2 — voir le commentaire jumeau sur l'e-mail ci-dessus. */}
        {phoneErrored && <NotFoundRow icon={Phone} label={t('keyInfo.phone')} hint={t('keyInfo.channelErrorHint')} />}
        {/* #3782 — voir le commentaire jumeau sur l'e-mail ci-dessus. */}
        {phonePending && <NotFoundRow icon={Phone} label={t('keyInfo.phone')} hint={t('keyInfo.channelPendingHint')} />}
        {/* #4404.2 (retour bêta 21/10) — LinkedIn SOUS l'e-mail et le téléphone, en clair (c87).
            Pas d'URL ⇒ pas de ligne : jamais un lien mort (#1100). */}
        {linkedinHref ? (
          <InfoRow
            icon={Linkedin}
            label={t('keyInfo.linkedin')}
            value={
              <a
                href={linkedinHref}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
              >
                {linkedinLabel}
              </a>
            }
            stacked
          />
        ) : null}
        {/* #4055.9 (Exteam) — un titre périmé n'est jamais présenté comme actuel : une personne partie (preuve datée)
            porte une « Ancienne fonction ». « Non retrouvé » ne vaut pas départ, la fonction garde son libellé. */}
        <InfoRow
          icon={Users}
          label={employment.state === 'left' ? t('keyInfo.formerJobTitle') : t('keyInfo.jobTitle')}
          value={contact.title}
        />
        <ContradictionRow contact={contact} field="title" icon={Users} label={t('keyInfo.jobTitle')} />
        {/* #3831-adjacent (lot R22, 07/10) — un import a pu écrire le bruit littéral
            « N/A » dans `entity` : `InfoRow` n'omet que les valeurs falsy, jamais
            ce bruit, ce qui affichait « Entité : N/A ». */}
        <InfoRow icon={Building2} label={t('keyInfo.entity')} value={cleanEntity(contact.entity)} />
        <ContradictionRow contact={contact} field="entity" icon={Building2} label={t('keyInfo.entity')} />
        {/* #2159.62 — QUAND l'emploi (titre, entité) a été vérifié pour la
            dernière fois — par un fournisseur qui reconfirme la personne, ou
            par une correction humaine. Absent (jamais vérifié) : aucune ligne,
            jamais une date devinée. */}
        {contact.employment_verified_at ? (
          <Box className="-mt-1 pb-1.5 pl-6">
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('keyInfo.employmentVerifiedAt', {
                date: new Date(contact.employment_verified_at).toLocaleDateString(i18n.language),
              })}
            </Text>
          </Box>
        ) : null}
        {/* #4016.L2.a — « vu le <date> » : QUAND l'employeur du champion a été
            relu (fait daté, jamais « vérifié », c67). Sans date : aucune ligne. */}
        {employmentSeenOn ? (
          <Box className="-mt-1 pb-1.5 pl-6">
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('keyInfo.employmentSeenAt', { date: employmentSeenOn })}
            </Text>
          </Box>
        ) : null}
        {/* #4055.8 (Louis 15/10/2026) — les trois états d'emploi : « pas encore vérifié », « non retrouvé » et
            « a quitté l'entreprise » (seulement sur un autre employeur observé, daté). */}
        {employmentStatusLine ? (
          <Box className="-mt-1 pb-1.5 pl-6">
            <Text
              element="span"
              size="xs"
              data-testid="employment-status"
              data-state={employment.state}
              className="text-[var(--bellum-text-muted)]"
            >
              {employmentStatusLine}
            </Text>
          </Box>
        ) : null}
        {/* #4504.3 (contrat Louis 24/10) — « Attribuer » quitte l'en-tête : « Responsable du contact · Modifier ». */}
        <ContactOwnerRow contact={contact} />
        {/* #4504.3 — « Ne pas contacter » quitte l'en-tête : « Préférence de sollicitation » (droits d'équipe inchangés). */}
        <InfoRow
          icon={Ban}
          label={t('keyInfo.solicitationPreference')}
          value={<DoNotContactPreference contactId={contact.id} />}
          stacked
        />
        {/* #2159.26 — les étiquettes posées par l'import (ex-en-tête, deux étiquettes au plus) ; rien sans étiquette. */}
        {contact.tags && contact.tags.length > 0 ? (
          <InfoRow
            icon={Tag}
            label={t('header.tags')}
            value={<TagChips tags={contact.tags} list="contacts" label={t('header.tags')} />}
            stacked
          />
        ) : null}
        {/* Théo B c5 `.t-acc` « Plus d'informations · N » — les coordonnées et repères secondaires, repliés : la
            carte garde en clair e-mail, téléphones, réseau professionnel, fonction et entité (coordonnées pro
            toujours en CLAIR, c87). Le compte ne compte que ce qui est renseigné (une absence ne fait aucune ligne). */}
        <details data-testid="contact-more-info" className="group pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-[var(--bellum-text-primary)] [&::-webkit-details-marker]:hidden">
            <span className="flex-1">{t('keyInfo.moreInfo')}</span>
            {moreInfoCount > 0 ? (
              <span className="text-xs font-normal text-[var(--bellum-text-muted)]">{moreInfoCount}</span>
            ) : null}
            <ChevronDown
              className="size-4 text-[var(--bellum-text-muted)] transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="divide-y divide-border/60">
            <InfoRow icon={MapPin} label={t('keyInfo.location')} value={contact.location} />
            <JobPostingProofRow rawData={contact.raw_data} />
            <InfoRow
              icon={Users}
              label={t('keyInfo.decisionRole')}
              value={getRoleLabel(contact.decision_role ?? 'unknown')}
            />
            <InfoRow icon={Languages} label={t('keyInfo.language')} value={contact.language} />
            <InfoRow icon={Clock} label={t('keyInfo.timezone')} value={contact.timezone} />
            {additionalEmails.map(email => (
              <InfoRow key={email} icon={Mail} label={t('keyInfo.additionalEmail')} value={email} stacked />
            ))}
            {additionalPhones.map(phone => (
              <InfoRow
                key={phone.number}
                icon={Phone}
                label={t('keyInfo.additionalPhone')}
                value={phoneLabel(phone)}
                stacked
              />
            ))}
          </div>
        </details>
      </Box>
    </SectionCard>
  )
}

/**
 * #4504.3 — « Responsable du contact · Modifier » (Théo c5). Le porteur nommé (#2160.9), signalé quand c'est un
 * collègue (#2128.12) ; une sollicitation récente d'un collègue (#2128.17) se lit dessous. `owner` absent (endpoint
 * qui ne le sert pas) : pas de nom deviné ; `null` (lu, sans titulaire) : « Non attribué ». « Modifier » est la MÊME
 * porte que l'ancien « Attribuer » (`ContactAssignControl` : refus du serveur, démo inerte).
 */
function ContactOwnerRow({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const { user } = useSession()
  const colleague = contact.owner && contact.owner.user_id !== user?.id
  const solicitation = contact.solicitation ?? null
  return (
    <InfoRow
      icon={User}
      label={t('keyInfo.owner')}
      stacked
      value={
        <Box className="w-full space-y-0.5" data-testid="contact-owner-row">
          <Box display="flex" className="flex-wrap items-center justify-between gap-x-2">
            {contact.owner ? (
              <Text
                element="span"
                size="sm"
                weight="medium"
                className={colleague ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-primary)]'}
                title={colleague ? t('header.ownerColleagueSignal', { name: contact.owner.name }) : undefined}
              >
                {contact.owner.name}
              </Text>
            ) : contact.owner === null ? (
              <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
                {t('keyInfo.ownerNone')}
              </Text>
            ) : null}
            <ContactAssignControl
              contactId={contact.id}
              currentOwnerId={contact.owner?.user_id ?? null}
              label={t('keyInfo.ownerEdit')}
            />
          </Box>
          {solicitation ? (
            <Text element="p" size="xs" className="text-[var(--warning-soft-text)]">
              {t('header.solicitationSignal', {
                name: solicitation.colleague.name,
                date: formatDate(solicitation.lastTouchOn, { day: '2-digit', month: 'short' }),
              })}
            </Text>
          ) : null}
        </Box>
      }
    />
  )
}
