import type { AgendaEvent, MeetingBriefBlockInput, MeetingType, RelationshipState } from '@bellum/contracts'
import {
  MEETING_TYPES,
  buildMeetingBrief,
  deriveAccessPath,
  deriveAnsweredFamilies,
  deriveComputedAt,
  deriveMeetingBriefLimits,
  deriveMeetingBriefToVerify,
  deriveMeetingObjective,
  deriveMeetingQuestions,
  deriveMeetingType,
  describeGround,
  estimateMeetingBriefReadingMinutes,
  meetingTypeSchema,
  personAttendeesOf,
  relationshipStateSchema,
} from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  MOTION,
  SelectField,
  Text,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Download, NotebookPen, Sparkles, Video } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { useConsultants } from '@/features/consultants/hooks'
import { useMissions } from '@/features/missions/api'
import { useRecapExists } from '@/features/meetings/api'
import { useOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { safeHref } from '@/lib/safe-href'
import { trackBriefGenerated, trackBriefOpened, trackFalseAssociationCorrected } from '@/lib/product-tracker'
import { resolveAccountGroupRoleFact } from '../meeting-account-facts'
import {
  externalAccountCandidatesForEvent,
  isConfidentialAgendaEvent,
  isPersonalAgendaEvent,
  isRecurringAgendaEvent,
  isPostMeetingRecapCandidate,
  matchLinkedRecordForEvent,
  resolveAssociatedAccount,
} from '../meeting-account-match'
import {
  buildMeetingBriefInputs,
  matchAttendeeContact,
  missingKnownContacts,
  type BriefActivity,
  type BriefConsultant,
  type BriefContact,
  type BriefFact,
  type BriefLinkedRecord,
  type BriefRisk,
  type BriefSignal,
} from '../meeting-brief-inputs'
import { guestLocalTimes } from '../guest-time-zones'
import { buildR1R2BriefBlocks } from '../meeting-r1-r2-blocks'
import { readAccountStakes, useMeetingR1R2 } from '../useMeetingR1R2'
import { MeetingFlowCard } from './MeetingFlowCard'
import { AccountFactsBriefBlock } from '@/features/account-facts/AccountFactsBriefBlock'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { MeetingBriefBlockCard } from './MeetingBriefBlocks'
import { MeetingLiveView } from './MeetingLiveView'

/**
 * LE BRIEF D'AVANT — ce qu'on a sous les yeux avant d'entrer en rendez-vous.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce panneau rassemblait l'agenda (objet, heure, invités) et ouvrait le dossier.
 * C'était le CHEMIN, et il manquait ; ce n'était pas encore un brief. Il porte
 * maintenant les sept blocs de la spécification — qui, ce qu'on s'est dit, ce
 * qui bouge, les enjeux probables, l'entourage, ce qu'on peut positionner, ce
 * qu'on veut obtenir — et, sous chacun, **la ligne qui dit d'où il vient**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS REFUS QUI TIENNENT L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Aucune personne rattachée ⇒ pas de brief**, et on le dit. Préparer le
 *     mauvais interlocuteur est pire que ne rien proposer — c'est déjà la règle
 *     de `matchAccountForEvent` pour le compte, appliquée ici à la personne.
 *  2. **L'objectif est ABSENT quand le type de rendez-vous ne se dérive pas.**
 *     Il est calculé (type × état de la relation), jamais rédigé. Un objectif
 *     inventé envoie quelqu'un en réunion avec la mauvaise intention.
 *  3. **Rien n'est affiché sans son origine.** `buildMeetingBrief` retire les
 *     blocs incapables de la dire ; l'écran n'a pas de branche pour les afficher
 *     quand même.
 *
 * ⚠️ « Demander à Laura » n'ouvre PAS un second assistant : il navigue vers la
 * porte existante avec une question PRÉ-REMPLIE (`?prompt=`, qui ne l'envoie
 * pas — le commercial relit avant). Aucun appel `/laura/*` n'est fait ici.
 */
/** #2985 — le panneau vit sous `/briefing/` (`BriefingPage`), jamais dans un
 *  identifiant de rendez-vous : un MOTIF de route, comme `PARTNERS_SCREEN`. */
const MEETING_PREP_SCREEN = '/briefing/'

export function MeetingPrepDialog({
  event,
  language,
  onClose,
}: {
  event: AgendaEvent | null
  language: string
  onClose: () => void
}) {
  // Le contenu est un composant SÉPARÉ, monté seulement quand un rendez-vous
  // est ouvert. Un `if` placé après les hooks ne les empêche pas de tourner :
  // comptes, contacts, historique et vivier seraient alors demandés à chaque
  // affichage de la journée, pour un panneau que personne n'a ouvert.
  if (!event) return null
  return <MeetingPrepContent event={event} language={language} onClose={onClose} />
}

function MeetingPrepContent({
  event,
  language,
  onClose,
}: {
  event: AgendaEvent
  language: string
  onClose: () => void
}) {
  const { t } = useTranslation('briefing')
  const navigate = useNavigate()

  // #2985 (26/09/2026) — le panneau s'OUVRE, qu'un brief en sorte ou non ;
  // `event.id` fait repartir la mesure à chaque rendez-vous ouvert, y compris
  // si React réutilise la même instance de composant pour un autre événement.
  useEffect(() => {
    trackBriefOpened(MEETING_PREP_SCREEN)
  }, [event.id])
  /** #2985 — « généré » ne s'émet qu'UNE fois par rendez-vous ouvert, quand le
   *  brief assemblé plus bas porte au moins un bloc. */
  const briefGeneratedFor = useRef<string | null>(null)

  // La liste sert UNIQUEMENT à rattacher. Elle arrive PAGINÉE — on aplatit,
  // parce qu'un compte rangé en deuxième page est un compte quand même.
  const { data: pages } = useAccounts()
  const accounts = useMemo(() => (pages?.pages ?? []).flatMap(page => page.data), [pages])
  // La liste ne porte qu'une PROJECTION du compte (id, nom, site) : ni les
  // signaux, ni les enjeux, ni l'état de la relation n'y sont. Le rattachement
  // se fait donc sur la liste, et la matière du brief sur le DÉTAIL.
  //
  // #2103.30 — PLUSIEURS ENTREPRISES INVITÉES. `matchAccountForEvent` devinait
  // silencieusement la PREMIÈRE quand deux domaines externes désignaient deux
  // comptes distincts (un point à trois avec deux clients du portefeuille).
  // `externalAccountCandidatesForEvent` rend la liste ENTIÈRE : `length > 1`
  // ouvre le choix ci-dessous plutôt qu'un rattachement au hasard.
  //
  // #2319.16 / #2319.131 — MAUVAIS COMPTE, CORRIGÉ PAR L'UTILISATEUR. Le même
  // état sert les DEUX gestes — trancher une ambiguïté, ou corriger un
  // rattachement automatique qui s'est trompé — parce que c'est le MÊME geste
  // du point de vue de l'utilisateur : « non, c'est celui-là ». Local à CETTE
  // ouverture du panneau : rien n'est écrit, revenir sur l'événement redemande.
  const domainCandidates = useMemo(() => externalAccountCandidatesForEvent(event, accounts), [event, accounts])
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null)
  const isAmbiguousAccount = domainCandidates.length > 1 && !chosenAccountId
  const matched = useMemo(
    () => resolveAssociatedAccount(event, accounts, chosenAccountId),
    [event, accounts, chosenAccountId],
  )
  const { account, contacts, loading } = useAccount(matched?.id ?? '')
  // #4072.3 — affaires passées, missions, besoins récurrents, derniers échanges (métadonnées).
  const factsBrief = useAccountFactsBrief(matched?.id)

  const timelineQuery = useTimeline('account', matched?.id)
  const consultantsQuery = useConsultants()
  // #2319.33 — les fiches de l'espace liées au compte. Les missions ne se lisent
  // qu'une fois le compte RATTACHÉ : sans `accountId`, la requête rendrait
  // celles de tout l'espace.
  const projectsQuery = useProjects(!!matched)
  const missionsQuery = useMissions({ accountId: matched?.id ?? '' }, { enabled: !!matched })
  // #2319.7 — même garde que les missions juste au-dessus : les besoins ne se
  // lisent qu'une fois le compte RATTACHÉ.
  const needsQuery = useOpenNeeds({ account_id: matched?.id ?? '', offset: 0, limit: 50 }, { enabled: !!matched })
  // #2319.44 — le domaine d'offre de l'espace, quand il est renseigné.
  const { data: portfolio } = useOfferPortfolio()

  /** #2319.43 — le type (donc l'objectif) CHOISI par l'utilisateur ; `null` = déduit. */
  const [chosenType, setChosenType] = useState<MeetingType | null>(null)
  /** #2319.52 — le mode « en rendez-vous ». */
  const [live, setLive] = useState(false)

  const briefContacts = useMemo<BriefContact[]>(
    () =>
      contacts.map(contact => ({
        id: contact.id,
        full_name: contact.full_name,
        email: contact.email,
        title: contact.title,
        entity: contact.entity,
        decision_role: contact.decision_role ?? null,
        seniority: contact.seniority ?? null,
        scope: contact.scope ?? null,
        source_tag: contact.source_tag ?? null,
        relations: contact.relations ?? null,
        key_points: contact.key_points ?? null,
        why_contact: contact.why_contact ?? null,
        updated_at: contact.updated_at,
      })),
    [contacts],
  )

  const contact = matchAttendeeContact(event.attendees, briefContacts)
  // #2390.10 (épopée #2926) — des contacts connus du compte, absents de CE
  // rendez-vous. `briefContacts` est déjà borné au compte rattaché
  // (`useAccount(matched?.id)` juste au-dessus) : un compte non rattaché rend
  // `[]`, jamais une absence devinée.
  const missingParticipants = useMemo(
    () => missingKnownContacts(event.attendees, briefContacts),
    [event.attendees, briefContacts],
  )

  /**
   * ⚠️ `undefined` (on n'a pas encore lu, ou la lecture a échoué) devient `null`
   * — « on ne sait pas » —, et `[]` reste `[]` — « on a lu, il n'y a rien ».
   * Écraser le premier en second ferait dire à l'écran « aucun échange » à
   * quelqu'un qui parle à ce client depuis deux ans.
   */
  const activities = useMemo<BriefActivity[] | null>(() => {
    const items = timelineQuery.data?.items
    if (!items) return null
    return items.map(item => ({
      kind: item.kind,
      source: item.source ?? null,
      // Le SUJET seulement. Le corps d'un message ne sort jamais vers un tiers.
      subject: item.subject ?? null,
      occurredAt: item.occurredAt ?? null,
      recordedAt: item.createdAt ?? null,
    }))
  }, [timelineQuery.data])

  const consultants = useMemo<BriefConsultant[] | null>(() => {
    const rows = consultantsQuery.data
    if (!rows) return null
    return rows.map(row => ({
      id: row.id,
      full_name: row.full_name,
      title: row.title,
      availability: row.availability,
      available_from: row.available_from,
      // ⚠️ `availability_checked_at` existe en base mais n'est PAS exposé par
      // l'API : la date de la source est donc celle de la dernière écriture de
      // la fiche. Elle est vraie (toute modification de disponibilité écrit la
      // ligne) mais optimiste — une fiche touchée pour une autre raison la
      // rafraîchit. Sans elle, le bloc ne s'afficherait pas du tout.
      availability_checked_at: row.updated_at,
    }))
  }, [consultantsQuery.data])

  const signals = useMemo<BriefSignal[] | null>(() => readAccountSignals(account?.recent_signals), [account])
  const stakes = useMemo<string[]>(() => readAccountStakes(account?.it_challenges), [account])
  // #1934.10 — contrairement à `it_challenges`, les objections n'ont pas leur
  // propre colonne : elles ne vivent que dans `raw_analysis` (phase 1, section
  // stratégie), au même endroit que `salesContext` juste en dessous.
  const objections = useMemo<string[]>(() => readObjections(account?.raw_analysis), [account])

  /**
   * #2319.30 — TROIS FAITS UTILES : secteur, effectif, chiffre d'affaires, datés
   * par la DERNIÈRE ANALYSE terminée. Sans cette date, aucun fait n'est daté et
   * le bloc se tait — jamais `updated_at`, qu'une simple édition rafraîchit.
   */
  const facts = useMemo<BriefFact[] | null>(() => {
    if (!account) return null
    const date = account.last_analyzed_at ?? null
    const firmographic = (
      [
        ['sector', account.sector],
        ['employees', account.employees],
        ['revenue', account.revenue],
      ] as const
    ).flatMap(([key, value]) =>
      value?.trim()
        ? [{ label: t(`agenda.brief.fact.${key}`, { value: value.trim() }), kind: 'account_analysis' as const, date }]
        : [],
    )
    // #2319.5 — LA FILIALE DU COMPTE ASSOCIÉ : datée par l'observation du lien
    // capitalistique (`group_link_observed_at`), jamais par `last_analyzed_at`
    // — un rafraîchissement de fiche qui ne touche pas ce lien ne le redate pas.
    const groupRoleFact = resolveAccountGroupRoleFact(account)
    const group = groupRoleFact
      ? [
          {
            label:
              groupRoleFact.role === 'groupe'
                ? t('agenda.brief.fact.groupRoleParent')
                : groupRoleFact.headSiren
                  ? t('agenda.brief.fact.groupRoleSubsidiary', { siren: groupRoleFact.headSiren })
                  : t('agenda.brief.fact.groupRoleSubsidiaryUnknown'),
            kind: 'account_analysis' as const,
            date: groupRoleFact.date,
          },
        ]
      : []
    return [...firmographic, ...group]
  }, [account, t])

  /**
   * #2319.33 — `null` tant qu'une des TROIS lectures n'a pas abouti.
   *
   * #2319.6 / #2319.7 / #2319.8 — LAQUELLE, parmi ces fiches, ce rendez-vous
   * vise-t-il ? `matchLinkedRecordForEvent` relit le TITRE, comme
   * `matchAccountForEvent` le fait pour le compte : un indice, jamais une
   * preuve, donc le libellé porte une mention plutôt qu'un tri à part — une
   * fiche mal résolue reste visible, elle n'est juste pas mise en avant.
   */
  const linkedEntries = useMemo<
    { kind: 'opportunity' | 'mission' | 'need'; record: BriefLinkedRecord }[] | null
  >(() => {
    if (!matched || !projectsQuery.data || !missionsQuery.data || !needsQuery.data) return null
    const opportunities = projectsQuery.data.filter(project => project.account_id === matched.id)
    const missions = missionsQuery.data.missions.filter(mission => mission.account_id === matched.id)
    const needs = needsQuery.data.data.filter(need => need.account_id === matched.id)
    const resolvedOpportunity = matchLinkedRecordForEvent(
      event,
      opportunities.map(project => ({ id: project.id, label: project.label })),
    )
    const resolvedMission = matchLinkedRecordForEvent(
      event,
      missions.map(mission => ({ id: mission.id, label: mission.label })),
    )
    const resolvedNeed = matchLinkedRecordForEvent(
      event,
      needs.map(need => ({ id: need.id, label: need.title })),
    )
    const labelFor = (id: string, label: string, resolved: { id: string } | null) =>
      resolved?.id === id ? t('agenda.brief.linkedForThisMeeting', { label }) : label
    return [
      ...opportunities.map(project => ({
        kind: 'opportunity' as const,
        record: {
          kindLabel: t('agenda.brief.linkedKind.opportunity'),
          label: labelFor(project.id, project.label, resolvedOpportunity),
          date: project.stage_entered_at,
        },
      })),
      ...missions.map(mission => ({
        kind: 'mission' as const,
        record: {
          kindLabel: t('agenda.brief.linkedKind.mission'),
          label: labelFor(mission.id, mission.label, resolvedMission),
          date: mission.updated_at,
        },
      })),
      ...needs.map(need => ({
        kind: 'need' as const,
        record: {
          kindLabel: t('agenda.brief.linkedKind.need'),
          label: labelFor(need.id, need.title, resolvedNeed),
          // #2558.1 — un besoin peut n'avoir jamais changé d'étape : `null` ne
          // date rien, le bloc l'écarte plutôt que d'inventer une fraîcheur.
          date: need.status_changed_at,
        },
      })),
    ]
  }, [matched, projectsQuery.data, missionsQuery.data, needsQuery.data, event, t])
  const linked = linkedEntries ? linkedEntries.map(entry => entry.record) : null

  /**
   * #2319.34 — RISQUES lus sur les fiches : un employeur relevé qui ne
   * correspond plus au compte (`RISQUE`), un bloqueur nommé. Rien d'autre —
   * aucun critère protégé n'entre ici.
   */
  const risks = useMemo<BriefRisk[]>(
    () =>
      briefContacts.flatMap(person => [
        ...(person.source_tag === 'RISQUE'
          ? [{ label: t('agenda.brief.risk.left', { name: person.full_name }), date: person.updated_at }]
          : []),
        ...(person.decision_role === 'blocker'
          ? [{ label: t('agenda.brief.risk.blocker', { name: person.full_name }), date: person.updated_at }]
          : []),
      ]),
    [briefContacts, t],
  )

  /* ---------------------- l'objectif : calculé, pas rédigé ------------------ */

  // #2319.18 — une réunion PERSONNELLE, distincte d'un point interne : les
  // deux n'ont pas de fiche client à préparer, mais pour des raisons
  // différentes, et l'écran ne les confond pas.
  const isPersonal = isPersonalAgendaEvent(event)
  // #2319.10 — le niveau de confidentialité posé par le calendrier lui-même.
  const isConfidential = isConfidentialAgendaEvent(event)
  const isRecurringMeeting = isRecurringAgendaEvent(event)
  // #2390.9 — une salle réservée n'est jamais une personne : elle ne peut pas,
  // à elle seule, faire classer un rendez-vous comme externe.
  const hasExternalAttendee = personAttendeesOf(event).some(attendee => attendee.external)
  const relationship = readRelationshipState(account?.raw_analysis)
  const derivedType = deriveMeetingType({ hasExternalAttendee, relationship })
  // #2319.43 — un point interne se lit sur les invités, il ne se choisit pas.
  const meetingType = derivedType === 'internal_meeting' ? derivedType : (chosenType ?? derivedType)
  const objective = deriveMeetingObjective({ meetingType })

  /*
   * #4424.2-.4 — R1, R2 et pitch. Les REX viennent de ce que l'espace sait
   * DÉJÀ : ses missions (tout l'espace, pas seulement ce compte), ses documents
   * de preuve client et les références de son profil. Les missions et les
   * documents de l'espace ne se lisent que pour un R1 — le seul qui les cite.
   */
  const { rex, r1, pitch, flow } = useMeetingR1R2({
    meetingType,
    meetingStart: event.start ?? null,
    accountName: account?.company_name ?? null,
    stakes,
    factsBrief,
  })

  /**
   * #2103.1 — LE DÉCLENCHEUR post-RDV. `now` figé à l'ouverture, comme
   * `computedAt` plus bas — une approximation honnête, pas une horloge qui
   * déclenche en direct pendant que le panneau reste ouvert.
   */
  const isRecapCandidate = useMemo(
    () =>
      isPostMeetingRecapCandidate(event, {
        isPersonal,
        isInternalMeeting: meetingType === 'internal_meeting',
        now: new Date(),
      }),
    [event, isPersonal, meetingType],
  )
  // Sans réponse tant que le rendez-vous n'appelle pas le déclencheur — on ne
  // demande « a-t-il déjà un CR ? » que quand la question sert à quelque chose.
  const recapStatus = useRecapExists(event.id, isRecapCandidate)
  const recapAlreadyWritten = isRecapCandidate && recapStatus.data?.exists === true

  // #2103.1 — LA PROPOSITION : un rendez-vous externe terminé sans CR ouvre
  // DIRECTEMENT le mode « en rendez-vous » plutôt que le brief d'avant. Une
  // seule fois par rendez-vous ouvert (`event.id`) : l'utilisateur reste libre
  // de revenir au brief ensuite sans que l'effet ne l'y renvoie.
  const autoLiveProposedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!isRecapCandidate || recapStatus.isLoading || recapAlreadyWritten) return
    if (autoLiveProposedFor.current === event.id) return
    autoLiveProposedFor.current = event.id
    setLive(true)
  }, [event.id, isRecapCandidate, recapStatus.isLoading, recapAlreadyWritten])
  // #2319.42-.45 — personnalisées par le rôle de la personne en face, le type
  // (donc l'objectif), l'offre de l'espace et ce que l'utilisateur tient déjà.
  const questions = deriveMeetingQuestions({
    meetingType,
    attendeeRole: contact?.decision_role ?? null,
    offerDomain: portfolio?.company_type ?? null,
    answeredFamilies: deriveAnsweredFamilies({
      exchangesOnAccount: activities === null ? null : activities.length,
      linkedKinds: linkedEntries ? linkedEntries.map(entry => entry.kind) : null,
    }),
  })

  const accessPath = deriveAccessPath({
    contacts: briefContacts
      .filter(person => !!person.decision_role)
      .map(person => ({
        id: person.id,
        name: person.full_name,
        role: person.decision_role as NonNullable<BriefContact['decision_role']>,
        // « Sponsor PROBABLE » : une fiche marquée hypothèse porte un rôle lu,
        // pas un rôle établi. Le mot « probable » vient de là, pas d'un réglage.
        roleIsProbable: person.source_tag === 'HYPOTHÈSE',
      })),
    metWithIds: contact ? [contact.id] : [],
  })

  /**
   * #2319.31 — les LIMITES, calculées une fois les lectures ABOUTIES : pendant
   * le chargement, « pas encore lu » n'est pas « pas pu lire ».
   */
  const settled =
    !timelineQuery.isLoading &&
    !consultantsQuery.isLoading &&
    !projectsQuery.isLoading &&
    !missionsQuery.isLoading &&
    !needsQuery.isLoading
  const limits = settled
    ? deriveMeetingBriefLimits({
        activities: activities === null ? 'unread' : 'read',
        datedSignals:
          signals === null
            ? null
            : signals.filter(signal => signal.date && !Number.isNaN(Date.parse(signal.date))).length,
        relationshipKnown: relationship !== null,
        relationsKnown: (contact?.relations ?? []).some(relation => relation.name.trim().length > 0),
        bench: consultants === null ? 'unread' : 'read',
        linked: linked === null ? 'unread' : 'read',
      }).map(limit => t(`agenda.brief.limit.${limit}`))
    : []

  const baseInputs = {
    contact,
    activities,
    signals,
    stakes,
    consultants,
    objections,
    language,
    facts,
    limits,
    linked,
    risks,
  }

  /**
   * #2319.38 — CE QUI RESTE À VÉRIFIER se calcule sur le brief DÉJÀ assemblé :
   * les blocs qui sont des lectures, les rôles lus du chemin d'accès, et le
   * type de rendez-vous quand il n'est pas établi.
   */
  const checks = deriveMeetingBriefToVerify({
    probableRoles: accessPath.filter(step => step.roleIsProbable).map(step => ({ name: step.name, role: step.role })),
    blocks: buildMeetingBrief(buildMeetingBriefInputs(baseInputs)),
    meetingTypeKnown: meetingType !== null,
  })
  const toVerify = contact
    ? checks.map(check =>
        check.kind === 'probable_role'
          ? t('agenda.brief.check.probable_role', { name: check.name, role: t(`agenda.brief.role.${check.role}`) })
          : check.kind === 'inferred_block'
            ? t('agenda.brief.check.inferred_block', { block: t(`agenda.brief.block.${check.block}`) })
            : t('agenda.brief.check.meeting_type'),
      )
    : []

  // #4424.2-.4 — sans personne rattachée, pas de brief : les blocs R1/R2 et le
  // pitch suivent la même règle que les autres.
  const dataBlocks = [
    ...buildMeetingBriefInputs({ ...baseInputs, toVerify }),
    ...(contact ? buildR1R2BriefBlocks({ meetingType, rex, r1, pitch, t }) : []),
  ]

  /**
   * Le bloc 07 s'assemble ICI et non dans l'assembleur de données : son contenu
   * est fait de clés traduites (`stance`, `outcomes`), pas de données du compte.
   * Son origine n'est pas une source mais un CALCUL — d'où `derivedFrom`.
   */
  const outcomeBlock: MeetingBriefBlockInput | null = objective
    ? {
        key: 'outcome',
        lines: objective.outcomes.map(outcome => t(`agenda.brief.outcome.${outcome}`)),
        note: null,
        ground: describeGround({ derivedFrom: ['meeting_type', 'relationship_state'] }),
      }
    : null

  const brief = buildMeetingBrief([...dataBlocks, ...(outcomeBlock ? [outcomeBlock] : [])])
  const dataColumn = brief.filter(block => block.key !== 'outcome')
  const outcome = brief.find(block => block.key === 'outcome') ?? null

  useEffect(() => {
    if (brief.length === 0 || briefGeneratedFor.current === event.id) return
    briefGeneratedFor.current = event.id
    trackBriefGenerated(MEETING_PREP_SCREEN)
  }, [brief.length, event.id])

  /* ------------------------------- l'en-tête ------------------------------- */

  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const startsAt = event.start ? new Date(event.start) : null
  const when = startsAt && !Number.isNaN(startsAt.getTime()) ? time.format(startsAt) : null
  // #2390.1 / #2390.8 — l'heure chez chaque invité dont la fiche contact porte
  // un fuseau DIFFÉRENT du mien. Fuseau inconnu ⇒ aucune mention.
  const guestTimes = useMemo(
    () =>
      guestLocalTimes(event, contacts, Intl.DateTimeFormat().resolvedOptions().timeZone, language).map(guest =>
        t('agenda.brief.guestLocalTime', { name: guest.name, time: guest.time, zone: guest.timeZone }),
      ),
    [event, contacts, language, t],
  )

  /**
   * « Brief calculé à 06:02 » — l'horodatage de CALCUL, pas l'heure de la
   * requête. `deriveComputedAt` refuse structurellement le second cas : un brief
   * assemblé à l'ouverture du panneau rend `live`, et on n'affiche alors rien
   * plutôt qu'« il y a une seconde », à chaque ouverture, pour toujours.
   *
   * Ce brief est justement assemblé à l'affichage ; la date qui l'informe est
   * donc celle du dossier — la dernière fois que sa matière a bougé.
   */
  const computedAt = deriveComputedAt(account?.updated_at ?? null, new Date())
  // #2319.25 — le temps de lecture, dit : le brief doit tenir en cinq minutes.
  const readingMinutes = estimateMeetingBriefReadingMinutes({ blocks: brief, questions })
  const computedLabel =
    computedAt.kind === 'sameDay'
      ? t('agenda.brief.computedAt', { at: time.format(new Date(computedAt.at)) })
      : computedAt.kind === 'dated'
        ? t('agenda.brief.computedOn', {
            at: new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit' }).format(new Date(computedAt.at)),
          })
        : null

  const subject = contact?.full_name ?? event.summary ?? ''
  const title = account
    ? t('agenda.brief.title', { subject, company: account.company_name })
    : t('agenda.brief.titleNoAccount', { subject: subject || t('agenda.grid.untitled') })

  /* -------------------------------- gestes --------------------------------- */

  function exportBrief() {
    const text = [
      title,
      ...brief.flatMap(block => [
        `\n${String(block.index).padStart(2, '0')} · ${t(`agenda.brief.block.${block.key}`)}`,
        ...block.lines,
        ...(block.note ? [block.note] : []),
      ]),
      ...(questions.length > 0 ? [`\n${t('agenda.brief.questions', { count: questions.length })}`, ...questions] : []),
    ].join('\n')
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t('agenda.brief.exported')))
      .catch(() => toast.error(t('agenda.brief.exportFailed')))
  }

  /** La porte EXISTANTE, avec une question pré-remplie — jamais envoyée seule. */
  function askLaura(prompt: string) {
    onClose()
    void navigate({ to: '/chat', search: { prompt } })
  }

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('meetingPrep.description')}</DialogDescription>
        </DialogHeader>

        <Box className="flex flex-wrap items-center justify-between gap-3 px-1">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {[
              when ? t('agenda.brief.at', { time: when }) : null,
              ...guestTimes,
              event.conferenceUrl ? t('agenda.brief.remote') : event.location,
              computedLabel,
              readingMinutes === null ? null : t('agenda.brief.readingTime', { count: readingMinutes }),
              // #2319.10 — nommé, jamais deviné : seul un calendrier qui l'a
              // POSÉ fait apparaître ce mot.
              isConfidential ? t('agenda.brief.confidential') : null,
              // #2319.14 — la Résolution du rendez-vous nomme la SÉRIE, jamais
              // devinée : `event.recurring` vient de `recurringEventId`
              // (Google) / `seriesMasterId` (Microsoft), déjà calculé par
              // #2103.29 mais jusqu'ici jamais lu dans le pré-brief.
              isRecurringMeeting ? t('agenda.brief.recurring') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Box className="flex flex-wrap items-center gap-2">
            {/* #2319.52 — le mode « en rendez-vous » : le brief et les questions
                à côté de la prise de notes. Aucun micro ne s'y ouvre. */}
            <Button variant="outline" onClick={() => setLive(current => !current)} aria-pressed={live}>
              {live ? <ArrowLeft className="size-3.5" aria-hidden /> : <NotebookPen className="size-3.5" aria-hidden />}
              {live ? t('agenda.brief.live.leave') : t('agenda.brief.live.enter')}
            </Button>
            {/* #2103.1 — NOMMÉ, jamais deviné : ne s'affiche que si un CR
                existe déjà pour CE rendez-vous, pour ne jamais en reproposer un
                sans le dire. */}
            {recapAlreadyWritten ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.brief.live.recapAlready')}
              </Text>
            ) : null}
            {brief.length > 0 ? (
              <Button onClick={exportBrief}>
                <Download className="size-3.5" aria-hidden />
                {t('agenda.brief.export')}
              </Button>
            ) : null}
          </Box>
        </Box>

        {/* #2103.30 — LE CHOIX, PAS LA DEVINETTE. Deux domaines externes qui
            désignent deux comptes distincts (un point à trois avec deux
            clients du portefeuille) : le brief attend un geste plutôt que de
            préparer la mauvaise entreprise. */}
        {isAmbiguousAccount ? (
          <Box className="mx-1 flex flex-col gap-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
            <Text element="p" size="sm" weight="medium">
              {t('agenda.prep.chooseAccount.title')}
            </Text>
            <Box className="flex flex-wrap gap-2">
              {domainCandidates.map(candidate => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="pointer-coarse:min-h-11"
                  onClick={() => setChosenAccountId(candidate.id)}
                >
                  {candidate.company_name}
                </Button>
              ))}
            </Box>
          </Box>
        ) : null}

        {/*
         * #2319.16 / #2319.131 — LA CORRECTION, TOUJOURS DISPONIBLE. Le
         * rattachement déterministe (domaine puis titre) reste un INDICE : un
         * titre peut ressembler par erreur à un client qui n'est pas le bon.
         * Absente sur une réunion PERSONNELLE (#2319.18, aucun compte ne s'y
         * rattache jamais) et sur un portefeuille vide (rien à choisir).
         */}
        {!isPersonal && !isAmbiguousAccount && accounts.length > 0 ? (
          <Box className="mx-1 flex flex-wrap items-center gap-2 px-1">
            <Text size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
              {matched ? t('agenda.prep.correctAccount.label') : t('agenda.prep.correctAccount.attach')}
            </Text>
            <SelectField
              value={chosenAccountId ?? ''}
              onChange={next => {
                // #2985 — une CORRECTION, jamais le premier choix : il faut déjà
                // avoir un compte rattaché, et la nouvelle valeur doit en désigner
                // un AUTRE (revenir à `''` réarme l'auto-résolution, pas une
                // correction).
                if (next && matched && next !== matched.id) trackFalseAssociationCorrected(MEETING_PREP_SCREEN)
                setChosenAccountId(next || null)
              }}
              emptyOption={{ label: t('agenda.prep.correctAccount.auto') }}
              ariaLabel={t('agenda.prep.correctAccount.label')}
              options={accounts.map(candidate => ({ value: candidate.id, label: candidate.company_name }))}
            />
          </Box>
        ) : null}

        {live ? (
          <MeetingLiveView
            brief={brief}
            stance={objective?.stance ?? null}
            outcomes={outcome?.lines ?? []}
            questions={questions}
            account={
              account ? { id: account.id, companyName: account.company_name, website: account.website ?? null } : null
            }
            // #2103.37 — le compte rendu qui naît d'ICI reste rattaché à CE
            // rendez-vous.
            eventId={event.id}
            // #2103.31 — lu sur les invités (`meetingType`, calculé plus haut
            // par `deriveMeetingType`), jamais choisi : un rendez-vous interne
            // ne propose aucune sortie qui vise l'extérieur.
            isInternalMeeting={meetingType === 'internal_meeting'}
          />
        ) : (
          // Une seule borne (768 px) : une colonne en dessous, deux au-dessus. La
          // colonne de droite n'est pas masquée sur mobile — elle passe dessous,
          // parce que l'objectif est ce qui compte le plus dans ce panneau.
          <Box className="mt-3 grid grid-cols-1 items-start gap-4 px-1 md:grid-cols-[minmax(0,1fr)_18rem]">
            <Box className="flex flex-col gap-3">
              {factsBrief ? <AccountFactsBriefBlock brief={factsBrief} /> : null}
              {dataColumn.length > 0 ? (
                dataColumn.map(block => <MeetingBriefBlockCard key={block.key} block={block} />)
              ) : (
                // Une absence de brief SE DIT, avec sa raison — et « pas encore
                // lu » n'est pas « personne ne correspond ». Afficher le second
                // pendant le chargement est le « zéro de chargement » : un verdict
                // rendu sur une mesure qui n'a pas eu lieu.
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {matched && loading
                    ? t('agenda.brief.loading')
                    : matched
                      ? t('agenda.brief.noContact')
                      : isPersonal
                        ? t('agenda.prep.personalMeeting')
                        : t('agenda.prep.noAccount')}
                </Text>
              )}
            </Box>

            <Box className="flex flex-col gap-3">
              {hasExternalAttendee ? (
                <MeetingTypePicker value={chosenType} derived={derivedType} onChange={setChosenType} />
              ) : null}
              {/* #4424.2 / #4424.3 — le déroulé du R1 ou du R2 ; aucun type n'en reçoit un inventé. */}
              <MeetingFlowCard flow={flow} />
              <OutcomePanel
                outcome={outcome}
                stance={objective?.stance ?? null}
                questions={questions}
                hasExternalAttendee={hasExternalAttendee}
                relationshipKnown={relationship !== null}
                isPersonal={isPersonal}
              />

              {accessPath.length > 0 ? (
                <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('agenda.brief.accessPath')}
                  </Text>
                  <Box className="mt-3 flex flex-col gap-2.5">
                    {accessPath.map(step => (
                      <Box key={step.contactId} className="flex items-start gap-2.5">
                        <Text
                          size="xs"
                          weight="semibold"
                          aria-hidden
                          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)]"
                        >
                          {step.rank}
                        </Text>
                        <Box className="flex min-w-0 flex-col">
                          <Text size="sm" weight="medium" className="truncate">
                            {step.name}
                          </Text>
                          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                            {/* « Référent technique PROBABLE » : le mot suit le
                              rôle quand il est lu et non établi. */}
                            {step.roleIsProbable
                              ? t('agenda.brief.roleProbable', { role: t(`agenda.brief.role.${step.role}`) })
                              : t(`agenda.brief.role.${step.role}`)}
                          </Text>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {missingParticipants.length > 0 ? (
                <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('agenda.brief.missingParticipants.title', { count: missingParticipants.length })}
                  </Text>
                  <Box className="mt-2 flex flex-col gap-1.5">
                    {missingParticipants.map(person => (
                      <Text key={person.id} element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {person.title ? `${person.full_name} — ${person.title}` : person.full_name}
                      </Text>
                    ))}
                  </Box>
                </Box>
              ) : null}

              {contact && account ? (
                <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('agenda.brief.laura.title')}
                  </Text>
                  <Box className="mt-2 flex flex-col gap-1.5">
                    {(['questions', 'compare', 'influence'] as const).map(key => (
                      <Text key={key} element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t(`agenda.brief.laura.${key}`)}
                      </Text>
                    ))}
                  </Box>
                  <Button
                    className="mt-3 w-full"
                    onClick={() =>
                      askLaura(
                        t('agenda.brief.laura.prompt', {
                          contact: contact.full_name,
                          company: account.company_name,
                        }),
                      )
                    }
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {t('agenda.brief.laura.ask')}
                  </Button>
                </Box>
              ) : null}
            </Box>
          </Box>
        )}

        <Box className="flex flex-wrap justify-end gap-2 px-1 pt-3">
          {account ? (
            <Button asChild variant="outline">
              <Link to="/accounts/$id" params={{ id: account.id }} onClick={onClose}>
                {t('agenda.prep.openAccount')}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </Button>
          ) : null}
          {event.conferenceUrl ? (
            <Button asChild variant="outline">
              <a href={safeHref(event.conferenceUrl)} target="_blank" rel="noopener noreferrer">
                <Video className="size-3.5" aria-hidden />
                {t('agenda.board.join')}
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            {t('agenda.prep.close')}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}

/**
 * #2319.43 / .48 / .51 — le type de rendez-vous, CHOISI par l'utilisateur.
 *
 * Quatre types ne se dérivent pas de ce que le produit sait (dont Qualification
 * et Achats) : plutôt que de les deviner, on laisse l'utilisateur les dire.
 * « Déduit du dossier » reste l'option par défaut — et elle NOMME le type déduit,
 * ou dit qu'il n'y en a pas. Un point interne ne se choisit pas : il se lit
 * sur les invités.
 */
function MeetingTypePicker({
  value,
  derived,
  onChange,
}: {
  value: MeetingType | null
  derived: MeetingType | null
  onChange: (next: MeetingType | null) => void
}) {
  const { t } = useTranslation('briefing')
  const auto = derived
    ? `${t('agenda.brief.meetingType.auto')} · ${t(`agenda.brief.meetingType.${derived}`)}`
    : t('agenda.brief.meetingType.auto')
  return (
    <Box className="flex flex-col gap-1">
      <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('agenda.brief.meetingType.label')}
      </Text>
      <SelectField
        value={value ?? ''}
        onChange={next => {
          const parsed = meetingTypeSchema.safeParse(next)
          onChange(parsed.success ? parsed.data : null)
        }}
        emptyOption={{ label: auto }}
        ariaLabel={t('agenda.brief.meetingType.label')}
        options={MEETING_TYPES.filter(type => type !== 'internal_meeting').map(type => ({
          value: type,
          label: t(`agenda.brief.meetingType.${type}`),
        }))}
      />
    </Box>
  )
}

/**
 * 07 · CE QUE TU VEUX OBTENIR — la posture, le résultat, les trois questions.
 *
 * Quand l'objectif est absent, ce panneau ne se tait PAS : il dit laquelle des
 * deux raisons s'applique. « Point interne » et « on ne sait pas encore quel
 * rendez-vous c'est » appellent deux gestes différents — le premier n'attend
 * rien, le second attend une analyse du compte.
 */
function OutcomePanel({
  outcome,
  stance,
  questions,
  hasExternalAttendee,
  relationshipKnown,
  isPersonal,
}: {
  outcome: { readonly lines: readonly string[]; readonly index: number } | null
  stance: string | null
  questions: readonly string[]
  hasExternalAttendee: boolean
  relationshipKnown: boolean
  /** #2319.18 — distincte d'un point interne : ni l'une ni l'autre n'a d'objectif,
   *  mais pas pour la même raison, et le libellé ne les confond pas. */
  isPersonal: boolean
}) {
  const { t } = useTranslation('briefing')

  return (
    // #2097.38 — l'ouverture du détail : `MOTION.reveal` (« voici une information »), rien de plus — aucun
    // glissement, aucun rebond (GA-25). La clé rejoue le fondu quand la posture change (autre type choisi).
    <motion.div
      key={stance ?? 'none'}
      data-testid="meeting-outcome-panel"
      initial={MOTION.reveal.initial}
      animate={MOTION.reveal.animate}
      transition={MOTION.reveal.transition}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4"
    >
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-accent)]">
        {t('agenda.brief.blockIndex', { index: String(outcome?.index ?? 7).padStart(2, '0') })}
        {' · '}
        {t('agenda.brief.block.outcome')}
      </Text>

      {outcome && stance ? (
        <>
          <Text element="p" size="lg" weight="semibold" className="mt-2">
            {t(`agenda.brief.stance.${stance}`)}
          </Text>
          <Box className="mt-2 flex flex-col gap-1">
            {outcome.lines.map(line => (
              <Text key={line} element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {line}
              </Text>
            ))}
          </Box>
        </>
      ) : (
        // L'objectif ABSENT, et sa raison. On n'en invente pas un : entrer en
        // réunion avec la mauvaise intention coûte plus cher que d'y entrer sans.
        <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {isPersonal
            ? t('agenda.brief.noObjective.personal')
            : !hasExternalAttendee
              ? t('agenda.brief.noObjective.internal')
              : relationshipKnown
                ? t('agenda.brief.noObjective.ambiguous')
                : t('agenda.brief.noObjective.unknownRelationship')}
        </Text>
      )}

      {questions.length > 0 ? (
        <Box className="mt-4">
          <Text element="h4" size="xs" weight="semibold" className="text-[var(--bellum-text-accent)]">
            {t('agenda.brief.questions', { count: questions.length })}
          </Text>
          <ol className="mt-1.5 flex list-inside list-decimal flex-col gap-1">
            {questions.map(question => (
              <li key={question}>
                <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {question}
                </Text>
              </li>
            ))}
          </ol>
        </Box>
      ) : null}
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*  TROIS LECTURES DÉFENSIVES DE COLONNES PERMISSIVES                          */
/* -------------------------------------------------------------------------- */

/**
 * `accounts.recent_signals` est déclaré `unknown[]` — des lignes héritées y
 * portent des formes ad hoc. On lit ce qui est lisible et on jette le reste,
 * sans jamais fabriquer de date.
 *
 * ⚠️ La NATURE de la source n'est pas déduite du champ `type` : celui-ci décrit
 * ce QU'EST la nouvelle (`recrutement`, `budget`, `acquisition`…), pas D'OÙ elle
 * vient. Un signal « recrutement » peut venir d'une offre publiée comme d'un
 * article. Tous sont donc attribués au dossier d'analyse, qui est vrai, plutôt
 * qu'à « offres + presse », qui serait deviné.
 */
function readAccountSignals(raw: unknown): BriefSignal[] | null {
  if (!Array.isArray(raw)) return null
  return raw.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    const label = typeof row.signal === 'string' ? row.signal.trim() : ''
    if (!label) return []
    return [{ label, kind: 'account_analysis' as const, date: typeof row.date === 'string' ? row.date : null }]
  })
}

/**
 * #1934.10 — `raw_analysis.objections`, écrit par la phase 1 (section
 * stratégie) : contrairement à `it_challenges` ou `recent_signals`, ce champ
 * n'a jamais eu sa propre colonne, donc pas de lecteur typé côté API. Une
 * réponse comprend `objection` (le motif) et `response` (la parade préparée) —
 * jointes en une ligne, sur le même principe qu'un `head, dispo {date}` de
 * `positionableBlock`. `real_concern` et `mirror_question` existent côté
 * modèle mais n'ont pas de place dans une ligne de brief compacte.
 */
function readObjections(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const objections = (raw as Record<string, unknown>).objections
  if (!Array.isArray(objections)) return []
  return objections.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    const objection = typeof row.objection === 'string' ? row.objection.trim() : ''
    if (!objection) return []
    const response = typeof row.response === 'string' ? row.response.trim() : ''
    return [response ? `${objection} — ${response}` : objection]
  })
}

/**
 * L'état de la relation, tel que l'analyse l'a établi.
 *
 * On le LIT, on ne le recalcule pas : `salesContext.relationship` porte déjà sa
 * provenance (`derivation`, `confidence`, `evidence`). Absent ⇒ `null`, et
 * l'écran dit qu'il ne sait pas encore — il n'affiche pas d'objectif.
 */
function readRelationshipState(raw: unknown): RelationshipState | null {
  if (typeof raw !== 'object' || raw === null) return null
  const salesContext = (raw as Record<string, unknown>).salesContext
  if (typeof salesContext !== 'object' || salesContext === null) return null
  const relationship = (salesContext as Record<string, unknown>).relationship
  if (typeof relationship !== 'object' || relationship === null) return null
  // Le schéma canonique valide la valeur : recopier la liste ici en produirait
  // une seconde, qui divergerait au premier état ajouté (GA-26).
  const parsed = relationshipStateSchema.safeParse((relationship as Record<string, unknown>).state)
  return parsed.success ? parsed.data : null
}
