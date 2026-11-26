import {
  COMMITTEE_ENTRY_LEVELS,
  type CommitteeEntryLevel,
  type Contact,
  type ContactSolicitation,
  type OrgGraph,
} from '@bellum/contracts'
import { RoleHint } from '@/components/contacts/RoleHint'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { User, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DossierEyebrow } from '../theo/DossierBlocks'
import { AskLaura } from '@/components/primitives/AskLaura'
import { DecisionMakerBadge } from '@/components/contacts/DecisionMakerBadge'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { useContactSolicitations } from '@/features/contacts/hooks/useContactSolicitations'
import { useHideContact } from '@/features/contacts/hooks/useHideContact'
import { useCommitteeEntryLevel, useSetCommitteeEntryLevel } from '@/features/accounts/hooks/useCommitteeEntryLevel'
import { formatDate } from '@/lib/locale'
import type { TabId } from '../components/AccountDetailTabsBar'
import {
  buildCommitteeScreenData,
  hiddenCommitteeContacts,
  type CommitteeScreenMember,
} from './committee/committeeScreenData'
import { useContactEngagement } from '../components/contact-engagement/ContactEngagementContext'
import { OrgCorrectionDrawer } from './organigramme/corrections/OrgCorrectionDrawer'
import { OrgSourceChips } from './organigramme/OrgSourceChips'

/**
 * #3282 / #3263.39 — l'écran « Comité d'achat » : les sièges, les personnes rattachées,
 * les sièges vides NOMMÉS. Il relit le graphe d'organisation (aucun second moteur) ;
 * l'ordre est celui des sièges, jamais celui de la séniorité (#3263.50).
 */
/** Combien de noms par lecture : une porte d'entrée, pas un annuaire. */
const ENTRY_POINTS_MAX = 3
/** Radix refuse une valeur vide : « non précisé » porte cette clé, jamais envoyée à l'API. */
const ENTRY_LEVEL_NONE = 'none'

export function TabCommittee({
  accountId,
  companyName,
  rawAnalysis,
  contacts,
  onTabChange,
}: {
  accountId: string
  companyName: string
  rawAnalysis: Record<string, unknown> | null | undefined
  /** #3263.43 — pour la vue « Masqués » : les contacts du compte tels que
   *  `findByAccount` les rend déjà (masqués INCLUS, contrairement à
   *  `GET /contacts`), jamais une seconde lecture. */
  contacts: Contact[]
  onTabChange: (tab: TabId) => void
}) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'committeeScreen' })
  // #3282 / #3263.30 — le niveau d'entrée SAISI (liste fermée) : « trop haut » se calcule dessus.
  const entryLevel = useCommitteeEntryLevel(accountId)
  const setEntryLevel = useSetCommitteeEntryLevel(accountId)
  const entryLevelValue = entryLevel.data?.level ?? null
  const data = useMemo(
    () => buildCommitteeScreenData(rawAnalysis, new Date(), contacts, entryLevelValue),
    [rawAnalysis, contacts, entryLevelValue],
  )
  const hidden = useMemo(() => hiddenCommitteeContacts(contacts), [contacts])
  // #3263.17 — la relation réseau, LUE (jamais recalculée) sur le classement de
  // contacts déjà câblé ailleurs (`useContactRanking`, même appel que
  // `FocalOrgView`, GA-26). Jointure par `contactId` résolu (#3263.17-19/.44,
  // le pont d'identité du lot E22) : aucun second calcul côté IA.
  const ranking = useContactRanking(accountId, {})
  // #3282.18/.19 — dernière action (dernier échange tracé) et prochaine action planifiée,
  // lues sur CE MÊME classement, jointes par identifiant de contact. Une absence ne fait
  // aucune ligne : `null` reste `null`, jamais « 0 jour » ni un tiret.
  const relationByContactId = useMemo(() => {
    const map = new Map<string, { known: boolean; lastAt: string | null; nextDue: string | null }>()
    for (const ranked of ranking.data?.ranked ?? []) {
      const axis = ranked.axes.find(a => a.key === 'relationship')
      map.set(ranked.contact_id, {
        known: axis?.reason === 'known_relationship',
        lastAt: ranked.last_action_at ?? ranked.last_interaction_at ?? null,
        nextDue: ranked.next_action_due_date ?? null,
      })
    }
    // #3282 / #3263.19 — un siège hors du chemin recommandé (dix premiers) garde sa date planifiée.
    for (const scheduled of ranking.data?.scheduled_actions ?? []) {
      if (map.has(scheduled.contact_id)) continue
      map.set(scheduled.contact_id, { known: false, lastAt: null, nextDue: scheduled.next_action_due_date })
    }
    return map
  }, [ranking.data])

  // #3263.44 — « enrichir » RÉUTILISE le hook et le dialogue de coût de l'onglet Contacts : le clic
  // ouvre la confirmation (1 crédit, solde avant débit), le débit ne part qu'après accord.
  const enrichMutation = useEnrichContact()
  const [pendingEnrich, setPendingEnrich] = useState<Contact | null>(null)
  const contactsById = useMemo(() => new Map(contacts.map(contact => [contact.id, contact])), [contacts])

  // #3263.28 — risque de collision : UN aller-retour groupé sur tous les contacts
  // résolus du comité, jamais un par siège (même capacité que la session de
  // prospection, #2386.6, jamais un second mécanisme de détection).
  const committeeContactIds = useMemo(
    () => [...new Set((data?.seats ?? []).flatMap(seat => seat.members.flatMap(member => member.contactId ?? [])))],
    [data],
  )
  const { data: solicitations } = useContactSolicitations(committeeContactIds)

  // #3263.46/.48 — « préparer l'approche » et « créer une introduction » RÉUTILISENT le
  // composeur commun (`ComposerDock`/`message-parameters.ts`) avec l'objectif déjà choisi ;
  // jamais un second moteur de rédaction.
  const { openEngagement } = useContactEngagement()

  // #3263.38 / #3263.40 — « Première porte » et « Relations existantes » : deux lectures du MÊME
  // classement (position stratégique, jamais l'ancienneté — #3263.50). Un contact absent de la
  // fiche ou une liste vide ne fait aucune ligne.
  const entryPoints = useMemo(() => {
    const ranked = [...(ranking.data?.ranked ?? [])].sort((a, b) => a.position - b.position)
    const nameOf = (contactId: string) => contactsById.get(contactId)?.full_name?.trim() || null
    const names = (ids: string[]) => ids.map(nameOf).filter((name): name is string => name !== null)
    return {
      firstDoor: names(
        ranked
          .filter(r => r.group === 'first_door')
          .slice(0, ENTRY_POINTS_MAX)
          .map(r => r.contact_id),
      ),
      known: names(
        ranked
          .filter(r => relationByContactId.get(r.contact_id)?.known)
          .slice(0, ENTRY_POINTS_MAX)
          .map(r => r.contact_id),
      ),
    }
  }, [ranking.data, contactsById, relationByContactId])

  if (!data) {
    return (
      <Card className="p-5">
        <EmptyState
          size="sm"
          icon={<Users />}
          title={t('empty.title')}
          description={t('empty.description')}
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => onTabChange('organigramme')}>
              {t('empty.action')}
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <Text size="lg" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </header>

      {/* #3282 / #3263.30 — le niveau d'entrée, SAISI dans une liste fermée (jamais du texte libre). */}
      <div className="flex flex-wrap items-center gap-3">
        <Text element="span" size="sm" weight="medium">
          {t('entryLevel.label')}
        </Text>
        <Select
          value={entryLevelValue ?? ENTRY_LEVEL_NONE}
          onValueChange={next => setEntryLevel.mutate(next === ENTRY_LEVEL_NONE ? null : (next as CommitteeEntryLevel))}
          disabled={entryLevel.isLoading || setEntryLevel.isPending}
        >
          <SelectTrigger aria-label={t('entryLevel.label')} className="h-11 w-48 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value={ENTRY_LEVEL_NONE}>{t('entryLevel.none')}</SelectItem>
            {COMMITTEE_ENTRY_LEVELS.map(level => (
              <SelectItem key={level} value={level}>
                {t(`entryLevel.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Text size="xs" className="min-w-0 text-[var(--bellum-text-muted)]">
          {t('entryLevel.hint')}
        </Text>
      </div>

      {entryPoints.firstDoor.length > 0 || entryPoints.known.length > 0 ? (
        <Card className="divide-y divide-[var(--bellum-border)]">
          {entryPoints.firstDoor.length > 0 ? (
            <section className="px-5 py-4" aria-label={t('firstDoor.title')}>
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {t('firstDoor.title')}
              </Text>
              <Text size="sm" className="mt-1">
                {entryPoints.firstDoor.join(' · ')}
              </Text>
            </section>
          ) : null}
          {entryPoints.known.length > 0 ? (
            <section className="px-5 py-4" aria-label={t('knownRelations.title')}>
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-secondary)]">
                {t('knownRelations.title')}
              </Text>
              <Text size="sm" className="mt-1">
                {entryPoints.known.join(' · ')}
              </Text>
            </section>
          ) : null}
        </Card>
      ) : null}

      {data.seats.length > 0 ? (
        // Refonte Théo (23/10) — `.x-committee` : un panneau par siège (DÉCIDE · PORTE LE BESOIN · ACHÈTE ·
        // INFLUENCE), en grille mesurée par le contenu, le rôle en sur-titre teinté.
        <div
          data-testid="committee-seats"
          className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] gap-4"
        >
          {data.seats.map(seat => (
            <section
              key={seat.role}
              className="min-w-0 rounded-card border border-[var(--bellum-border)] bg-card px-5 py-4"
              aria-label={t(`seats.${seat.role}`)}
            >
              <RoleHint role={seat.role}>
                <DossierEyebrow>{t(`seats.${seat.role}`)}</DossierEyebrow>
              </RoleHint>
              <ul className="mt-2 flex flex-col gap-3">
                {seat.members.map(member => {
                  const memberContact = member.contactId ? contactsById.get(member.contactId) : undefined
                  return (
                    <MemberRow
                      key={`${seat.role}-${member.personId}`}
                      member={member}
                      decisionRole={memberContact?.decision_role ?? null}
                      roleLabel={t(`seats.${seat.role}`)}
                      accountId={accountId}
                      companyName={companyName}
                      graph={data.graph}
                      relation={member.contactId ? relationByContactId.get(member.contactId) : undefined}
                      solicitation={member.contactId ? (solicitations?.[member.contactId] ?? null) : null}
                      onEnrich={memberContact ? () => setPendingEnrich(memberContact) : undefined}
                      onPrepareApproach={
                        memberContact
                          ? () =>
                              openEngagement([memberContact], 'email', {
                                rawAnalysis: rawAnalysis ?? undefined,
                                initialParameters: { objective: 'ouverture_compte' },
                              })
                          : undefined
                      }
                      onCreateIntroduction={
                        memberContact
                          ? () =>
                              openEngagement([memberContact], 'email', {
                                rawAnalysis: rawAnalysis ?? undefined,
                                initialParameters: { objective: 'introduction', cta: 'demander_intro' },
                              })
                          : undefined
                      }
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {/* #4324.1 — un siège sans personne au graphe mais qu'un contact du dossier peut tenir n'est JAMAIS « à pourvoir » :
          on le nomme avec ses contacts, à confirmer. */}
      {data.contactHeldSeats.length > 0 ? (
        <Card className="px-5 py-4">
          <Text size="sm" weight="semibold">
            {t('contactHeld.title')}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('contactHeld.hint')}
          </Text>
          <ul className="mt-2 flex flex-col gap-1">
            {data.contactHeldSeats.map(seat => (
              <li key={seat.role} className="text-xs text-[var(--bellum-text-secondary)]">
                <span className="font-medium">{t(`seats.${seat.role}`)}</span> — {seat.names.join(', ')}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* #3263.42 — les sièges cœur sans personne, NOMMÉS : ce qui reste à trouver. */}
      {data.vacantSeats.length > 0 ? (
        <Card className="px-5 py-4">
          <Text size="sm" weight="semibold">
            {t('vacant.title')}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('vacant.hint')}
          </Text>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {data.vacantSeats.map(role => (
              <span
                key={role}
                className="rounded-md border border-dashed border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
              >
                {t(`seats.${role}`)}
              </span>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => onTabChange('coverage')}>
            {t('vacant.action')}
          </Button>
        </Card>
      ) : null}

      {/* #3263.41 — À vérifier : périmé ou identité pas assez solide. Rien à vérifier = aucune ligne. */}
      {data.toVerify.length > 0 ? (
        <Card className="px-5 py-4">
          <Text size="sm" weight="semibold">
            {t('toVerify.title', { count: data.toVerify.length })}
          </Text>
          <ul className="mt-2 flex flex-col gap-1">
            {data.toVerify.map(member => (
              <li key={member.personId}>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {member.fullName}
                  {member.title ? ` · ${member.title}` : ''}
                </Text>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* #3263.43 — Masqués : réutilise `useHideContact` (Contacts), aucun
       *  second mécanisme. Rien de masqué = aucune ligne, comme partout ailleurs. */}
      {hidden.length > 0 ? <HiddenContactsSection contacts={hidden} /> : null}

      <EnrichConfirmDialog
        open={pendingEnrich !== null}
        onOpenChange={open => {
          if (!open) setPendingEnrich(null)
        }}
        count={1}
        onConfirm={() => {
          if (!pendingEnrich) return
          enrichMutation.mutate({ contact: pendingEnrich, accountCompanyName: companyName })
          setPendingEnrich(null)
        }}
      />
    </div>
  )
}

/** #4813 — le `whitespace-nowrap` du Badge est voulu (#1608) ; une PHRASE dans une colonne de carte s'enroule ici, chez l'appelant. */
const BADGE_WRAP = 'h-auto max-w-full whitespace-normal text-left'

function HiddenContactsSection({ contacts }: { contacts: Contact[] }) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'committeeScreen' })
  const hideContact = useHideContact()
  return (
    <Card className="px-5 py-4">
      <Text size="sm" weight="semibold">
        {t('hidden.title', { count: contacts.length })}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('hidden.hint')}
      </Text>
      <ul className="mt-2 flex flex-col gap-2">
        {contacts.map(contact => (
          <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {contact.full_name}
                {contact.title ? ` · ${contact.title}` : ''}
              </Text>
              <DecisionMakerBadge role={contact.decision_role} />
            </span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => hideContact.mutate({ contact, hidden: false })}
            >
              {t('hidden.unhide')}
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Vrai quand `text` ne fait que redire le libellé du siège (casse et accents ignorés). */
function repeatsSeatLabel(text: string | null, seatLabel: string): boolean {
  const fold = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase()
  return text !== null && fold(text) === fold(seatLabel)
}

function MemberRow({
  member,
  decisionRole,
  roleLabel,
  accountId,
  companyName,
  graph,
  relation,
  solicitation,
  onEnrich,
  onPrepareApproach,
  onCreateIntroduction,
}: {
  member: CommitteeScreenMember
  /** Théo comptes-fiche — le rôle du contact résolu : « Décideur » sur chaque décideur, rien sinon. */
  decisionRole?: string | null
  roleLabel: string
  accountId: string
  companyName: string
  graph: OrgGraph
  /** #3263.17 — vrai seulement si le classement de contacts confirme une
   *  relation CONNUE ; jamais affiché sinon (doctrine liste : une absence ne
   *  fait aucune ligne — pas de « relation inconnue » à côté de chaque nom). */
  relation?: { known: boolean; lastAt: string | null; nextDue: string | null }
  /** #3263.28 — une collègue a déjà sollicité CE contact récemment. `null` =
   *  aucune collision connue, ou siège sans contact résolu (jamais deviné). */
  solicitation?: ContactSolicitation | null
  /** #3263.44 — absent quand le siège ne correspond à aucun contact du compte. */
  onEnrich?: () => void
  /** #3263.46 — absent quand le siège ne correspond à aucun contact du compte (jamais un contact deviné). */
  onPrepareApproach?: () => void
  /** #3263.48 — même garde que `onPrepareApproach`. */
  onCreateIntroduction?: () => void
}) {
  const { t } = useTranslation('accountOrg', { keyPrefix: 'committeeScreen' })
  const { t: tOrg } = useTranslation('accountOrg')
  const { t: tContacts } = useTranslation('contacts')
  const { freshness } = member
  // Recette prod 01/10 (#3282) : le siège est déjà l'en-tête du groupe — une ligne qui le
  // redit mot pour mot n'apprend rien (un libellé ne s'affiche qu'une fois par bloc).
  const memberTitle = repeatsSeatLabel(member.title, roleLabel) ? null : member.title
  const memberReason = repeatsSeatLabel(member.reason, roleLabel) ? null : member.reason
  return (
    <li className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold" className="min-w-0">
          {member.fullName}
        </Text>
        {memberTitle ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {memberTitle}
          </Text>
        ) : null}
        <DecisionMakerBadge role={decisionRole} />
        {member.entityName ? (
          <Badge className={BADGE_WRAP} variant="outline">
            {member.entityName}
          </Badge>
        ) : null}
        {member.roleInferred ? <Badge variant="outline">{t('inferred')}</Badge> : null}
        {relation?.known ? <Badge variant="outline">{t('relation.known')}</Badge> : null}
        {/* #3263.37 — jamais recommandé par défaut : nommé, pas masqué. */}
        {member.tooGlobalExecutive ? (
          <Badge className={BADGE_WRAP} variant="warning">
            {t('notices.tooGlobalExecutive')}
          </Badge>
        ) : null}
        {/* #3263.31 — distinct du dirigeant mondial : une branche entièrement différente. */}
        {member.outOfPerimeter ? (
          <Badge className={BADGE_WRAP} variant="warning">
            {t('notices.outOfPerimeter')}
          </Badge>
        ) : null}
        {/* #3282 / #3263.30 — plus haut que le niveau d'entrée que le commercial a déclaré. */}
        {member.tooHigh ? (
          <Badge className={BADGE_WRAP} variant="warning">
            {t('notices.tooHigh')}
          </Badge>
        ) : null}
        {/* #3263.28 — RÉUTILISE exactement le badge et la clé de `ContactHeader.tsx`
         *  (GA-26) : un même fait, un même libellé, où qu'il se lise. */}
        {solicitation ? (
          <Badge variant="outline" className="gap-1.5 border-[var(--bellum-warning)] text-[var(--warning-soft-text)]">
            <User className="size-3.5 shrink-0" />
            {tContacts('header.solicitationSignal', {
              name: solicitation.colleague.name,
              date: formatDate(solicitation.lastTouchOn, { day: '2-digit', month: 'short' }),
            })}
          </Badge>
        ) : null}
      </div>
      {memberReason ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {memberReason}
        </Text>
      ) : null}
      {/* #3263.21 — la fraîcheur se NOMME : jamais un tiret, jamais « 0 jour ». */}
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {[
          freshness.lastVerifiedAt
            ? t(`freshness.${freshness.state}`, { date: formatDate(freshness.lastVerifiedAt) })
            : t('freshness.never_verified'),
          // #3282.18/.19 — sur la même ligne que la fraîcheur : un bloc de moins à empiler.
          relation?.lastAt ? t('lastAction', { date: formatDate(relation.lastAt) }) : null,
          relation?.nextDue ? t('nextAction', { date: formatDate(relation.nextDue) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {/* #3263.20 — la provenance, via les puces de source (jamais un nom de fournisseur brut). */}
      <OrgSourceChips sources={member.person.sources ?? []} max={2} />
      {/* #3263.45/#3263.47 — deux CTA qui RÉUTILISENT une capacité déjà livrée
       *  ailleurs (le tiroir de correction de l'organigramme, le lien vers
       *  Laura), câblées sur CET écran plutôt qu'un second mécanisme. */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <OrgCorrectionDrawer
          accountId={accountId}
          graph={graph}
          objectType="person"
          objectId={member.personId}
          objectName={member.fullName}
          field="decisionRoles"
          triggerLabel={tOrg('correction.gestures.declareRole')}
          triggerClassName="mt-0"
        />
        {onEnrich ? (
          <Button type="button" size="xs" variant="outline" className="pointer-coarse:min-h-11" onClick={onEnrich}>
            {t('actions.enrich')}
          </Button>
        ) : null}
        {onPrepareApproach ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={onPrepareApproach}
          >
            {t('actions.prepareApproach')}
          </Button>
        ) : null}
        {onCreateIntroduction ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={onCreateIntroduction}
          >
            {t('actions.createIntroduction')}
          </Button>
        ) : null}
        <AskLaura
          accountId={accountId}
          label={t('actions.askOrientation')}
          question={t('actions.askOrientationQuestion', {
            name: member.fullName,
            role: roleLabel,
            company: companyName,
          })}
        />
        {/* #3263.17-19/.44/.46/.48 — le siège REJOINT enfin la vraie fiche
         *  contact (`orgPersonSlug`, même rapprochement que le chemin
         *  recommandé de l'organigramme). Absent quand le nom est ambigu ou
         *  inconnu des contacts du compte : jamais un lien deviné.
         *  Recette prod 30/09 (#3282, VISUEL KO) : le lien portait 12px/h16
         *  contre 14px/h28 pour `AskLaura` juste à côté — réutilise EXACTEMENT
         *  la classe du lien non-prominent de `AskLaura` (même ligne de CTA),
         *  jamais un style inventé. */}
        {member.contactId ? (
          <Link
            to="/contacts/$id"
            params={{ id: member.contactId }}
            className="inline-flex items-center gap-1.5 rounded-md py-1 text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
          >
            {t('actions.openContact')}
          </Link>
        ) : null}
      </div>
    </li>
  )
}
