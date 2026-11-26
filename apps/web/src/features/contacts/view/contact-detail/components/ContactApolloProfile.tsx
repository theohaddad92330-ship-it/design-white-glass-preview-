import type { ApolloContactProfile, ApolloEducationEntry, ApolloEmploymentEntry, Contact } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import {
  Briefcase,
  Facebook,
  Github,
  GraduationCap,
  Linkedin,
  MapPin,
  Sparkles,
  Twitter,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { humanizeApolloValue, useApolloLabel } from '@/lib/apolloVocabulary'
import { contactCurrentPost, supersededCurrentPosts } from '@/features/contacts/lib/contactDeparture'
import { safeHref } from '@/lib/safe-href'
import { SectionCard } from './SectionCard'

/** Best-effort year from an Apollo date string (`2021-03-01` → `2021`). */
function year(date: string | null | undefined): string {
  const match = /^(\d{4})/.exec((date ?? '').trim())
  return match ? match[1]! : ''
}

function ProfileSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <Box className="space-y-2">
      <Box display="flex" className="items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />
        <Text element="h3" size="xs" weight="medium">
          {title}
        </Text>
      </Box>
      {children}
    </Box>
  )
}

function SocialLinks({ profile }: { profile: ApolloContactProfile }) {
  const { t } = useTranslation('contacts')
  // #3716 — LinkedIn n'est plus redit ici : il a son bouton dans l'en-tête de
  // la fiche. Twitter / GitHub / Facebook seulement quand Apollo les a rendus.
  const links: { key: string; icon: LucideIcon; label: string; url: string }[] = []
  const push = (key: string, icon: LucideIcon, label: string, url: string | null | undefined) => {
    const href = safeHref(url)
    if (href) links.push({ key, icon, label, url: href })
  }
  push('twitter', Twitter, t('apollo.twitter'), profile.twitter_url)
  push('github', Github, t('apollo.github'), profile.github_url)
  push('facebook', Facebook, t('apollo.facebook'), profile.facebook_url)
  if (links.length === 0) return null
  return (
    <Box display="flex" className="flex-wrap gap-2">
      {links.map(link => (
        <a
          key={link.key}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--bellum-border)] px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
        >
          <link.icon className="size-3.5" />
          {link.label}
        </a>
      ))}
    </Box>
  )
}

function CareerTimeline({ entries }: { entries: ApolloEmploymentEntry[] }) {
  const { t } = useTranslation('contacts')
  // #4889 — un seul « Actuel » par employeur ; les autres postes `current` sont passés.
  const superseded = supersededCurrentPosts(entries)
  return (
    <ol className="space-y-3">
      {entries.map((raw, index) => {
        const closedBy = superseded.get(index)
        const entry = superseded.has(index)
          ? { ...raw, current: false, end_date: raw.end_date ?? closedBy ?? null }
          : raw
        const from = year(entry.start_date)
        const to = entry.current ? t('apollo.current') : year(entry.end_date)
        const range = [from, to].filter(Boolean).join(' – ')
        return (
          <li key={`${entry.organization_name ?? ''}-${entry.title ?? ''}-${index}`} className="flex gap-2.5">
            <span
              aria-hidden
              className={`mt-1.5 size-2 shrink-0 rounded-full ${entry.current ? 'bg-emerald-400' : 'bg-border'}`}
            />
            <Box className="min-w-0 space-y-0.5">
              <Box display="flex" className="flex-wrap items-center gap-2">
                {entry.title ? (
                  <Text element="span" size="sm" weight="medium" className="text-foreground">
                    {entry.title}
                  </Text>
                ) : null}
                {entry.current ? (
                  <Badge variant="success" className="text-xs">
                    {t('apollo.current')}
                  </Badge>
                ) : null}
              </Box>
              <Text element="p" size="xs" color="text-muted-foreground">
                {[entry.organization_name, range].filter(Boolean).join(' · ')}
              </Text>
            </Box>
          </li>
        )
      })}
    </ol>
  )
}

function EducationList({ entries }: { entries: ApolloEducationEntry[] }) {
  return (
    <ul className="space-y-2.5">
      {entries.map((entry, index) => {
        const range = [year(entry.start_date), year(entry.end_date)].filter(Boolean).join(' – ')
        const detail = [entry.degree, entry.field_of_study, range].filter(Boolean).join(' · ')
        return (
          <li key={`${entry.school ?? ''}-${index}`} className="space-y-0.5">
            {entry.school ? (
              <Text element="p" size="sm" weight="medium" className="text-foreground">
                {entry.school}
              </Text>
            ) : null}
            {detail ? (
              <Text element="p" size="xs" color="text-muted-foreground">
                {detail}
              </Text>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/** #4465.1 — l'intitulé du poste marqué `current`, ou `null` : aucun poste en cours connu ⇒ aucun sous-titre. */
function currentPostTitle(profile: ApolloContactProfile): string | null {
  return contactCurrentPost({ apollo_enrichment: profile })?.title?.trim() || null
}

/** Le profil porte-t-il quelque chose À MONTRER ? Sert au détail « Parcours et
 *  informations complémentaires » : sans contenu, pas de ligne vide. */
export function apolloProfileHasContent(profile: ApolloContactProfile | null | undefined): boolean {
  if (!profile) return false
  return Boolean(
    currentPostTitle(profile) ||
    profile.city ||
    profile.state ||
    profile.country ||
    profile.seniority ||
    (profile.departments ?? []).length > 0 ||
    (profile.functions ?? []).length > 0 ||
    profile.twitter_url ||
    profile.github_url ||
    profile.facebook_url ||
    (profile.employment_history ?? []).length > 0 ||
    (profile.education ?? []).length > 0,
  )
}

/**
 * Rich contact profile compiled from Apollo's People-Match (the SAME paid
 * payload as email/phone): headline/bio, location, seniority + departments /
 * functions, clickable social links, career path and education. Every block is
 * present-only — the whole card is hidden when Apollo returned nothing. This is
 * Apollo-sourced data, NOT scraped from LinkedIn (the LinkedIn URL is only shown
 * as a link).
 *
 * Seniority / departments / functions are CLOSED Apollo vocabulary: they are
 * translated at display time from the deterministic `apolloVocabulary`
 * dictionary (the stored JSONB is never touched, and a value the dictionary
 * doesn't know stays exactly as Apollo sent it). The free text — `headline`,
 * job titles in the career timeline — is deliberately left in its original
 * language: translating it would require a stored translated variant.
 */
export function ContactApolloProfile({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const apollo = useApolloLabel()
  const profile = contact.apollo_enrichment
  if (!profile) return null

  // #3716 — un emplacement par propriété : la localisation vit déjà dans
  // « Informations clés » quand le contact en porte une. Elle ne se redit ici
  // que si c'est le SEUL endroit qui la connaît (rien n'est perdu).
  const location = contact.location?.trim()
    ? ''
    : [profile.city, profile.state, profile.country]
        .map(part => (part ?? '').trim())
        .filter(Boolean)
        .join(', ')
  // Seniority reads from its own table; departments and functions share Apollo's
  // department vocabulary, so they resolve against the same one.
  const tags: { value: string; label: string }[] = [
    ...(profile.seniority ? [{ value: profile.seniority, field: 'seniority' as const }] : []),
    ...(profile.departments ?? []).map(value => ({ value, field: 'department' as const })),
    ...(profile.functions ?? []).map(value => ({ value, field: 'department' as const })),
  ].map(({ value, field }) => ({ value, label: apollo(field, value, humanizeApolloValue(value)) }))
  const hasLinks = Boolean(
    safeHref(profile.twitter_url) || safeHref(profile.github_url) || safeHref(profile.facebook_url),
  )
  const career = profile.employment_history ?? []
  const subtitle = currentPostTitle(profile)
  const education = profile.education ?? []

  // Nothing worth a card → render nothing (present-only, hidden when empty).
  if (!subtitle && !location && tags.length === 0 && !hasLinks && career.length === 0 && education.length === 0) {
    return null
  }

  return (
    <SectionCard icon={Sparkles} iconClassName="text-[var(--bellum-text-accent)]" title={t('apollo.title')}>
      <Box className="space-y-5">
        <Box display="flex" className="items-center gap-1.5 text-muted-foreground">
          <Text element="span" size="xs">
            {t('apollo.source')}
          </Text>
        </Box>

        {/* #4465.1 — le sous-titre dit la fonction du poste EN COURS, comme l'en-tête et « Fonction ». Le titre libre de la
            source (`headline`) racontait l'ancien poste : il ne s'affiche plus ; sans poste en cours, rien. */}
        {subtitle ? (
          <Text
            element="p"
            size="sm"
            leading="relaxed"
            color="text-foreground/90"
            data-testid="contact-apollo-subtitle"
          >
            {subtitle}
          </Text>
        ) : null}

        {location ? (
          <Box display="flex" className="items-center gap-2 text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <Text element="span" size="sm" className="text-foreground">
              {location}
            </Text>
          </Box>
        ) : null}

        {tags.length > 0 ? (
          <Box display="flex" className="flex-wrap gap-1.5">
            {tags.map(tag => (
              <Badge key={tag.value} variant="secondary">
                {tag.label}
              </Badge>
            ))}
          </Box>
        ) : null}

        {hasLinks ? (
          <ProfileSection icon={Linkedin} title={t('apollo.links')}>
            <SocialLinks profile={profile} />
          </ProfileSection>
        ) : null}

        {career.length > 0 ? (
          <ProfileSection icon={Briefcase} title={t('apollo.career')}>
            <CareerTimeline entries={career} />
          </ProfileSection>
        ) : null}

        {education.length > 0 ? (
          <ProfileSection icon={GraduationCap} title={t('apollo.education')}>
            <EducationList entries={education} />
          </ProfileSection>
        ) : null}
      </Box>
    </SectionCard>
  )
}
