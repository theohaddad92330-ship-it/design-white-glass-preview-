import type { OpenNeedRow } from '@bellum/contracts'
import { ImportedExtraCard } from '@/features/universal-import/view/ImportedExtraCard'
import { daysInStatus, needBoardStatus, needNextAction, needTheoStatus, normaliseNeedStatus } from '@bellum/contracts'
import { Badge, Box, Button, Card, Text, TabNav, TYPE_SCALE, cn, type TabNavItem } from '@bellum/ui'
import { ArrowLeft, Share2, Sparkles, Star, UserPlus } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { clientTeamLabel, supervisedForfaitLabel } from '@/features/missions/supervised-forfait'
import { CustomerPage } from '@/components/page/CustomerPage'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { NextAction } from '@/components/primitives/NextAction'
import { PrivateSwitch } from '@/components/access/PrivateSwitch'
import { TimelinePanel } from '@/features/activities/view/TimelinePanel'
import { formatCents } from '@/lib/money'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { Route } from '@/routes/projects/needs_.$needId'
import { useNeedActions } from '../hooks/useNeedActions'
import { needMatcherCanLaunch, needMatcherLaunchTooltip } from '../model/need-matcher-gate-label'
import { needDetailFamilyOf, type NeedDetailFamily } from '../model/need-detail-tabs'
import { openNeedsKeys } from '../api'
import { useOpenNeed } from '../hooks/useOpenNeed'
import { useProjectOwners } from '../../hooks/useProjectOwners'
import { useChainForSubject } from '@/features/chains/api'
import { ChainProgressBlock } from '@/features/chains/view/ChainProgressBlock'
import { i18n } from '@/i18n'
import { overtakenPhaseLabel } from './need-phase'
import { NeedBeforeMissionCard } from './NeedBeforeMissionCard'
import { NeedConsultantDoor } from './NeedConsultantDoor'
import { NeedConvergenceStateControl } from './NeedConvergenceStateControl'
import { NeedDetailRecommendation } from './NeedDetailRecommendation'
import { NeedDiscoveryRails } from './NeedDiscoveryRails'
import { NeedDocumentsTab } from './NeedDocumentsTab'
import { NeedHistoryTab } from './NeedHistoryTab'
import { NeedMatchTab } from './NeedMatchTab'
import { NeedAutoMatchNote } from '@/features/matching/view/NeedAutoMatchNote'
import { NeedPositioningsTab } from './NeedPositioningsTab'
import { NeedShortlistSection } from './NeedShortlistPreview'
import { NeedProfileTypeAgreementControl } from './NeedProfileTypeAgreementControl'
import { PageRecordLinks } from '@/features/records/PageRecordLinks'
import { NeedRateComparison } from './NeedRateComparison'
import { NeedRequirementsCard } from './NeedRequirementsCard'
import { NeedReverseProspects } from './NeedReverseProspects'
import { NeedExternalSourcing } from './NeedExternalSourcing'
import { NeedFramingCard } from './NeedFramingCard'
import { NeedWonProjectCard } from './NeedWonProjectCard'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { NeedRowMenu } from './NeedRowMenu'
import { NeedSourceLink } from './NeedSourceLink'
import { ProjectSynthesisPanel } from '@/features/projects/view/ProjectSynthesisPanel'
import { NeedStaffableControl } from './NeedStaffableControl'
import { NeedStaffingBanner } from './NeedStaffingBanner'
import { NeedStepsCard } from './NeedStepsCard'
import { NeedQualitySummaryCard } from './NeedQualitySummaryCard'
import { NeedVerdictBanner } from './NeedVerdictBanner'
import { NeedVerdictProfiles } from './NeedVerdictProfiles'
import { formatDate } from '@/lib/locale'

// #2175.1 — le type d'onglet vit maintenant dans `need-detail-tabs.ts`
// (`NeedDetailFamily`) : quatre familles visibles, cinq anciens noms encore
// valides en `?tab=` (voir `needDetailFamilyOf`).

/**
 * LA FICHE D'UN BESOIN — l'écran qui n'existait pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le besoin était le seul objet du produit sans fiche. Il n'avait qu'une LISTE
 * (`/projects/needs`), un kanban, et un tiroir de matching qui montre le
 * classement des profils — pas le besoin. Le dépôt en avait même la trace
 * écrite : le docblock de `NeedsKanban` dit « Changer l'état d'un besoin est une
 * décision qui se prend dans sa fiche », et cette fiche n'existait pas.
 *
 * Conséquence mesurée : dix-huit colonnes de tableau pour un objet qui en porte
 * vingt-huit. `status_reason` (POURQUOI ce besoin est en veille),
 * `staffable_reason`, `provenance`, `entity_name` étaient servis par le serveur
 * et n'avaient nulle part où s'afficher en entier. Et le §4.2 demandait un bloc
 * « tarif cible vs tarif vendu moyen chez ce client » qui n'avait pas d'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE LIT LA MÊME LIGNE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `useOpenNeed` passe par `GET /projects/needs?id=…`, c'est-à-dire le même
 * `SELECT`, le même `shortlist_count`, le même âge d'étape. Une seconde route
 * serveur aurait fabriqué la seconde vérité : deux écrans qui ne disent pas la
 * même chose du même besoin, et personne pour trancher lequel a raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ AUCUNE VALEUR ABSENTE NE S'AFFICHE « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque champ facultatif passe par {@link Field}, qui rend `UnknownValue` sur
 * `null`. Un TJM cible absent n'est pas « gratuit », un besoin sans séniorité
 * n'est pas « junior », un besoin qui n'a jamais changé d'état n'est pas « 0 j
 * dans l'étape » — celui-là serait même rassurant, ce qui est pire.
 *
 * La seule exception est `shortlist_count`, où **zéro est une vraie réponse** :
 * la requête a compté, elle a trouvé personne. C'est l'alerte du §16, et c'est
 * ce qui ouvre la troisième porte — ET {@link NeedReverseProspects}, qui vit
 * juste à côté d'elle (« un besoin sans candidat ouvre une piste ») : d'autres
 * comptes de la même zone qui cherchent la même compétence, jamais montés
 * comme piste neuve quand on les a déjà (`already_in_portfolio`). Elle
 * n'ajoute PAS de cinquième onglet — voir plus bas pourquoi — et ne vit donc
 * pas dans les quatre : le `Sheet` de `MatchDrawer` est portalé plein écran et
 * rendrait invisible tout ce qui n'est pas dedans tant qu'il reste ouvert.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ SIX PANNEAUX, QUATRE FAMILLES VISIBLES — CE QU'ILS MONTENT, CE QU'ILS N'ONT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2175.1-.6, .41 (lot W41, 24/09) — la barre visible ne porte plus que
 * QUATRE familles (Synthèse / Profils & positionnements / Avancement /
 * Documents & historique, `need-detail-tabs.ts`) : Rapprochement et
 * Positionnements s'empilent désormais sous « Profils & positionnements »,
 * Documents et Historique sous « Documents & historique ». Les cinq anciennes
 * clés restent des valeurs valides de `?tab=` (deep links historiques,
 * `needDetailFamilyOf`) — elles ouvrent la famille qui les contient, jamais
 * une page d'erreur.
 *
 * « Vue d'ensemble » / « Synthèse » (par défaut) est la fiche telle qu'elle
 * existait — un lien entrant qui pointe ici continue de voir exactement ça.
 * Les cinq autres MONTENT des panneaux, existants ou neufs, ils ne réécrivent
 * rien :
 *
 *  - **Rapprochement** ({@link NeedMatchTab}) monte `MatchDrawer` — le MÊME
 *    composant que la liste ouvre par `?match=…`. Déjà scopé sur un `needId`,
 *    donc réutilisable tel quel.
 *  - **Positionnements** ({@link NeedPositioningsTab}) réutilise
 *    `useSubmissions`, mais PAS `SubmissionsPanel` tel quel : ce panneau ne
 *    connaît qu'un `projectId`, et un projet porte souvent plusieurs besoins.
 *    Le monter sans filtre montrerait les profils des RÔLES VOISINS sous
 *    l'onglet d'un seul — une donnée réelle, au mauvais périmètre. `Submission`
 *    porte un `needId` : on filtre dessus.
 *  - **Notes & activités** monte `TimelinePanel` au niveau du PROJET
 *    (`need.project_id`), pas du besoin : les activités (`ACTIVITY_SCOPES`,
 *    `packages/contracts/src/schemas/activity.ts`) n'ont ni portée `need` ni
 *    colonne `needId` — un appel ou un e-mail sur l'affaire concerne
 *    généralement tous ses rôles à la fois. C'est le MÊME renoncement que
 *    `MissionDetailTabs` a déjà fait pour l'historique d'une mission (monté au
 *    niveau du COMPTE) : nommer honnêtement le périmètre plutôt que fabriquer
 *    un filtre qui n'existe pas dans la donnée.
 *  - **Documents** ({@link NeedDocumentsTab}) — devis, NDA, contrat cadre, et
 *    leur statut. Objet NEUF (`need_documents`, migration
 *    `1790974000001-NeedDocuments`) : `openNeedRowSchema` n'en portait aucun.
 *  - **Historique** ({@link NeedHistoryTab}) — ce qui est DATÉ en base sur ce
 *    besoin : les portes franchies, l'entrée dans l'état COURANT, les étapes
 *    cochées, les documents ouverts. ⚠️ Complété le 31/08/2026 : il ne portait
 *    que les portes, ce qui le faisait lire comme un audit complet alors qu'il
 *    en rendait un quart. Il NOMME désormais ce qui n'est journalisé nulle part
 *    — les états précédents (la colonne `status_changed_at` est écrasée à
 *    chaque transition), les modifications de champ, et l'auteur de chaque
 *    geste. Une version antérieure de cet écran avait EXAMINÉ et refusé un
 *    cinquième onglet du même nom, parce que son seul porteur connu
 *    (`AccountTimelineCard`) appelle en dur `GET /accounts/:id/timeline` et ne
 *    prend qu'un `accountId`. Ce lot n'utilise PAS ce porteur : il ouvre une
 *    lecture DIFFÉRENTE, déjà écrite mais jamais relue depuis un besoin — les
 *    franchissements de porte (`DecisionGatesService.forSubject`, subject
 *    `need`) — sur une route neuve du module Projets
 *    (`GET /projects/needs/:id/history`), ouverte au périmètre de la fiche
 *    plutôt qu'à `team:manage`. Voir le docblock de
 *    `ProjectsController.needHistory`.
 */
export function NeedDetailPage({ needId }: { needId: string }) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const { need, isPending, isError, notFound, refetch } = useOpenNeed(needId)
  // #3348 — UNE phase : le parcours (dérivé des faits) parle quand il a dépassé le statut déclaré.
  const { data: chainEntries } = useChainForSubject('need', needId)
  const matchingEntry = chainEntries?.find(entry => entry.chain.key === 'sourcing_matching')
  const overtakenPhase = need
    ? overtakenPhaseLabel(
        need.status,
        matchingEntry?.chain,
        matchingEntry?.projection.derivation,
        i18n.language.startsWith('en') ? 'en' : 'fr',
      )
    : null
  const phaseLabel = need ? (overtakenPhase ?? t(`needStatus.${needBoardStatus(need.status)}`)) : ''

  // Ce que cet écran DÉCLARE montrer à Laura (bulle).
  //
  // ⚠️ L'appel est AVANT les retours anticipés : un hook conditionnel casserait
  // l'ordre des hooks au premier chargement qui aboutit. C'est aussi ce qui
  // permet à Laura de dire « ta fiche charge encore » plutôt que de croire
  // qu'aucun écran n'est ouvert.
  useLauraContext({
    kind: 'need',
    label: need?.title || t('needSheet.title'),
    entityId: needId,
    facets: need ? [{ label: t('openNeeds.columns.phase'), value: phaseLabel }] : [],
    state: isPending ? 'loading' : 'ready',
  })

  if (isPending) {
    return (
      // Le titre reste celui de l'écran ; la phrase d'attente vit une seule fois, dans le corps.
      <CustomerPage pageTitle={t('needSheet.title')}>
        <Text size="sm" className="py-6 text-[var(--bellum-text-muted)]">
          {t('needSheet.loading')}
        </Text>
      </CustomerPage>
    )
  }

  // ⚠️ Deux vides, deux phrases. « Je n'ai pas pu lire » envoie réessayer ;
  // « ce besoin n'existe pas ici » envoie chercher ailleurs. Les confondre
  // ferait recharger une page qui ne changera jamais — ou abandonner une
  // lecture qui aurait marché au second essai.
  if (isError) {
    return (
      <CustomerPage pageTitle={t('needSheet.errorTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('needSheet.errorBody')}</Text>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" className="pointer-coarse:min-h-11" onClick={() => void refetch()}>
              {t('openNeeds.error.retry')}
            </Button>
            <BackToList />
          </div>
        </Card>
      </CustomerPage>
    )
  }

  if (notFound || !need) {
    return (
      <CustomerPage pageTitle={t('needSheet.missingTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('needSheet.missingBody')}</Text>
          <div className="mt-3">
            <BackToList />
          </div>
        </Card>
      </CustomerPage>
    )
  }

  return (
    <NeedSheet
      need={need}
      phaseLabel={phaseLabel}
      onMatch={id => void navigate({ to: '/projects/needs', search: { match: id } })}
    />
  )
}

/** Le retour à la liste, écrit UNE fois : trois états d'erreur l'offrent. */
function BackToList() {
  const { t } = useTranslation('projects')
  return (
    <Button size="sm" variant="ghost" asChild className="gap-1.5 pointer-coarse:min-h-11">
      {/* Théo C projects-besoin-fiche — le retour mène à la liste des besoins, d'où la fiche s'ouvre. */}
      <Link to="/projects/needs">
        <ArrowLeft className="size-4" aria-hidden />
        {t('needSheet.backToList')}
      </Link>
    </Button>
  )
}

function NeedSheet({
  need,
  phaseLabel,
  onMatch,
}: {
  need: OpenNeedRow
  phaseLabel: string
  onMatch: (needId: string) => void
}) {
  const { t } = useTranslation('projects')
  const { t: tMatching } = useTranslation('matching')
  const navigate = useNavigate()
  const [doorFor, setDoorFor] = useState<OpenNeedRow | null>(null)
  // #4270.3 (18/10) — en espace forfait / conseil, le besoin se lit comme un projet
  // à cadrer : périmètre, sponsor et budget montent en tête, et ne se répètent pas plus bas.
  // RV4-E-FIX 4291.7 — la carte « Projet à cadrer » (sponsor, périmètre, budget, échéance) est celle de TOUS les
  // espaces : en prod, un besoin LVMH d'un espace sans profil forfait n'avait ni sponsor ni périmètre en tête.
  // Seul le suivi du projet GAGNÉ (#4270.4) reste propre au profil forfait / conseil.
  const framed = true
  const forfait = useWorkspaceProfile() === 'forfait_conseil'
  // #2175.9 — même fonction que la carte du pipe, le tableau des projets et
  // le hero du tiroir d'opportunité : un nom d'owner recalculé à un
  // quatrième endroit divergerait à la première retouche.
  const { ownerName } = useProjectOwners()
  const resolvedOwnerName = ownerName(need.owner_id)
  /**
   * ⚠️ « PRIORISER » ET « PARTAGER » SONT UNE INTERPRÉTATION — 31/08/2026.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * CE QUI EST SÛR, ET CE QUI NE L'EST PAS
   * ─────────────────────────────────────────────────────────────────────────
   * La maquette (dossier du 26/08, image 02) montre deux boutons d'entête
   * nommés « Prioriser » et « Partager la mission ». Elle ne dit NULLE PART ce
   * qu'ils font. Les deux implémentations ci-dessous sont donc une LECTURE de
   * la maquette, pas une spécification, et **personne ne les a validées** :
   *
   *  · **« Prioriser » écrit `urgency = 'haute'`**, via le geste existant
   *    `set_urgency` (`useNeedActions`, le MÊME hook que le menu de ligne et la
   *    barre de sélection). L'argument qui l'a emporté : l'urgence EST déjà
   *    l'axe que le produit porte pour « ce besoin passe avant les autres », et
   *    inventer un second champ de priorité aurait créé deux réglages pour une
   *    seule question (loi 1 du tome 7). L'autre lecture possible — épingler le
   *    besoin en tête de SA liste, sans rien écrire de partagé — reste ouverte,
   *    et elle n'est pas absurde : « prioriser » peut être un geste privé.
   *  · **« Partager » copie le lien de CETTE fiche** dans le presse-papier —
   *    aucune route serveur neuve : ce que la barre d'adresse porte déjà est ce
   *    qu'un collègue doit recevoir. L'autre lecture possible — envoyer un
   *    e-mail, ou publier dans un fil d'équipe — demanderait un chemin
   *    d'écriture qui n'existe pas, et « le copilote n'envoie jamais d'e-mail »
   *    penche contre.
   *
   * Écrit ici plutôt que laissé implicite parce qu'une interprétation muette se
   * relit comme une décision : dans trois semaines, personne ne saura que
   * « prioriser = urgence haute » était une supposition, et le premier
   * utilisateur qui s'en étonnera se fera répondre « c'est le comportement
   * attendu ». À confirmer ou à corriger — les deux gestes sont réversibles et
   * n'ont aucun effet hors de l'espace.
   */
  const prioritizeAction = useNeedActions()
  function onPrioritize() {
    prioritizeAction.mutate(
      { kind: 'set_urgency', needIds: [need.id], urgency: 'haute' },
      { onSuccess: () => toast.success(t('needSheet.prioritized')) },
    )
  }
  // « Partager » — voir le docblock d'interprétation ci-dessus (31/08/2026).
  function onShare() {
    void navigator.clipboard.writeText(window.location.href).then(
      () => toast.success(t('needSheet.shareCopied')),
      () => toast.error(t('needSheet.shareFailed')),
    )
  }
  const now = new Date()
  const overdue = need.deadline_at !== null && new Date(need.deadline_at).getTime() < now.getTime()
  const days = need.status_changed_at === null ? null : daysInStatus(need.status_changed_at, now)
  const nextAction = needNextAction(need, now)

  // #2175.1-.6, .41 — QUATRE FAMILLES VISIBLES, CINQ DEEP LINKS PRÉSERVÉS.
  //
  // ⚠️ « Synthèse » PAR DÉFAUT — c'est la famille par défaut requise par un
  // lien entrant nu : quelqu'un qui arrive sur `/projects/needs/$needId`
  // doit voir exactement ce que la fiche montrait avant ce lot (« Vue
  // d'ensemble »).
  //
  // La famille active est DÉRIVÉE de `?tab=` (`Route.useSearch()`), jamais
  // un `useState` local : sans `validateSearch`, TanStack Router jette la
  // recherche avant que l'écran la voie — le défaut déjà corrigé sur
  // `/projects` (`routes/projects/index.tsx`). `needDetailFamilyOf` est la
  // SEULE table de correspondance ancien nom → famille (GA-26) ; les cinq
  // anciennes clés (`matching`, `positioning`, `activity`, `documents`,
  // `history`) restent des valeurs valides de `?tab=` qui ouvrent la famille
  // qui les contient désormais.
  const { tab: tabParam } = Route.useSearch()
  const [family, setFamily] = useState<NeedDetailFamily>(() => needDetailFamilyOf(tabParam))
  // Théo C projects-besoin-fiche — « Trouver des profils » ouvre le rapprochement SUR PLACE, dans
  // l'onglet Profils (aucun départ vers la liste) ; un ancien `?tab=matching` l'ouvre directement.
  const [matchingOpen, setMatchingOpen] = useState(tabParam === 'matching')
  const openMatching = () => {
    setMatchingOpen(true)
    setFamily('profiles')
  }
  const openLauraInPlace = useOpenLauraInPlace()
  // « Avec Laura » — la bulle s'ouvre sur place, question PRÉPARÉE et jamais envoyée ; sans bulle
  // atteignable (mobile, surcouche), la conversation s'ouvre avec la même question.
  function onAskLaura() {
    const prompt = t('needSheet.askLauraPrompt', {
      title: need.title,
      account: need.account_name ?? t('needSheet.noAccount'),
    })
    if (openLauraInPlace) openLauraInPlace(prompt)
    else void navigate({ to: '/chat', search: { accountId: need.account_id, prompt } })
  }
  const tabs = useMemo<TabNavItem[]>(
    () => [
      { key: 'synthese', label: t('needSheet.tabs.synthese') },
      {
        key: 'profiles',
        // Aucun « (0) » : une absence n'est pas un zéro (GA-18 / GA-19).
        label:
          need.shortlist_count > 0
            ? t('needSheet.tabs.profilesCount', { count: need.shortlist_count })
            : t('needSheet.tabs.profiles'),
      },
      { key: 'progress', label: t('needSheet.tabs.progress') },
      { key: 'documents', label: t('needSheet.tabs.documents') },
    ],
    [t, need.shortlist_count],
  )

  // Théo C projects-besoin-fiche — « Le besoin » : la grille des faits clés, puis les compétences
  // rangées en deux familles. Une famille vide ne fait aucune ligne.
  const requiredSkills = need.skills.filter(skill => skill.required)
  const optionalSkills = need.skills.filter(skill => !skill.required)
  const presence = [
    need.remote ? t(`openNeeds.remote.${need.remote}`) : null,
    need.onsite_days_per_week ? t('needSheet.keyFacts.onsiteDays', { count: need.onsite_days_per_week }) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const statusLabel =
    needTheoStatus(need.status) === 'closed'
      ? t(`needStatus.${normaliseNeedStatus(need.status)}`)
      : t(`needTheoStatus.${needTheoStatus(need.status)}`)

  return (
    // Théo `.bo11-head` — sur bureau, la coque nomme une page de détail dans le fil (barre du haut) et
    // ne rend pas de h1 visible : la fiche porte donc SON en-tête (`titleInScreen`, jamais deux h1).
    <CustomerPage pageTitle={need.title} titleInScreen>
      <div className="flex flex-col gap-4 py-4">
        <BackToList />

        <header className="flex flex-wrap items-start justify-between gap-4" data-testid="page-head">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2" data-testid="page-badges">
              <Text element="h1" className={cn(TYPE_SCALE.pageTitle, 'text-[var(--bellum-text-primary)]')}>
                {need.title}
              </Text>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {/* Le badge d'urgence ne s'affiche QUE si quelqu'un l'a dite : un « normale » par défaut
              ferait passer pour un arbitrage ce qui n'est qu'une absence de réponse. */}
                {need.urgency ? (
                  <Badge variant={need.urgency === 'haute' ? 'warning' : 'default'}>
                    {t(`openNeeds.urgency.${need.urgency}`)}
                  </Badge>
                ) : null}
                <Badge variant="primary" data-testid="need-phase-badge">
                  {phaseLabel}
                </Badge>
                {/* #3348 — Laura dit « périmé, à revérifier » à partir de ce même verdict (`needNextAction`) :
              l'entête le dit aussi, sinon le badge d'état seul le contredit. */}
                {nextAction === 'decide_expired' || nextAction === 'decide_stale_start' ? (
                  <Badge variant="warning" data-testid="need-stale-badge">
                    {t('needSheet.staleBadge')}
                  </Badge>
                ) : null}
              </span>
            </div>
            {/* Théo `.bo11-head p` — « Besoin · compte · porté par » ; pas de porteur = pas de « porté par ». */}
            <Text
              element="p"
              size="sm"
              className="mt-1 text-[var(--bellum-text-secondary)]"
              data-testid="page-subtitle"
            >
              {[
                t('needSheet.byline.need'),
                need.account_name ?? t('needSheet.noAccount'),
                resolvedOwnerName ? t('needSheet.byline.ownedBy', { name: resolvedOwnerName }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1.5" data-testid="page-actions">
            <>
              {/* Théo — « Trouver des profils » : le rapprochement s'ouvre SUR PLACE, onglet Profils. */}
              <Button
                size="sm"
                variant="secondary"
                className="pointer-coarse:min-h-11"
                disabled={!needMatcherCanLaunch(need)}
                title={needMatcherLaunchTooltip(need, tMatching)}
                onClick={openMatching}
              >
                {t('needSheet.findProfiles')}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 pointer-coarse:min-h-11" onClick={onAskLaura}>
                <Sparkles className="size-4" aria-hidden />
                {t('needSheet.withLaura')}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 pointer-coarse:min-h-11" onClick={onShare}>
                <Share2 className="size-4" aria-hidden />
                {t('needSheet.share')}
              </Button>
              {/* Gardés hors maquette (à trancher par Louis) : « Prioriser » et la troisième porte. */}
              {need.shortlist_count === 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 pointer-coarse:min-h-11"
                  title={tMatching('launch.knowSomeone')}
                  onClick={() => setDoorFor(need)}
                >
                  <UserPlus className="size-4" aria-hidden />
                  {tMatching('launch.fillPool')}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 pointer-coarse:min-h-11"
                disabled={need.urgency === 'haute' || prioritizeAction.isPending}
                onClick={onPrioritize}
              >
                <Star className="size-4" aria-hidden />
                {t('needSheet.prioritize')}
              </Button>
              <NeedRowMenu need={need} title={need.title} />
            </>
          </div>
        </header>

        {/* Le formulaire s'ouvre ICI, sur la fiche — pas dans le vivier. */}
        <NeedConsultantDoor need={doorFor} onClose={() => setDoorFor(null)} onMatch={onMatch} />

        {/* Théo `.bo11-banner` — OÙ EN EST le besoin, et l'affaire qui le porte (l'étape n'est pas
            répétée en barre : le bandeau la dit et y mène). */}
        <section
          data-theo-block="status-banner"
          className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-3"
        >
          <div className="min-w-0">
            <Text element="p" size="sm" weight="semibold" data-testid="need-status-line">
              {[
                statusLabel,
                t('openNeeds.seats', { count: need.headcount }),
                need.start_on ? t('needSheet.startPlanned', { date: formatDate(need.start_on) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {/* #2773 — un besoin sans affaire NI nom n'écrit aucune phrase « Sur l'affaire «  » ». */}
            {need.project_label?.trim() ? (
              <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                {need.project_stage
                  ? t('needSheet.linkedProjectAtStage', {
                      project: need.project_label,
                      stage: t(`stage.states.${need.project_stage}`, { defaultValue: need.project_stage }),
                    })
                  : t('needSheet.onProject', { project: need.project_label })}
              </Text>
            ) : null}
            {/* Le compte est dans la phrase de l'en-tête : ici, seulement l'entité (rien deux fois). */}
            {need.entity_name ? (
              <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                {need.entity_name}
              </Text>
            ) : null}
            {/* N2 — la page d'origine de l'offre, visible sans ouvrir de détail. */}
            <NeedSourceLink url={need.source_url} />
            {/* #2773 / #4463 — « Gratuit. » près du lancement du matching. */}
            <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]" data-testid="need-match-free-note">
              {tMatching('freeNote')}
            </Text>
            {/* #2916 / #2399.2 (c93) — le matching lancé automatiquement à l'arrivée du besoin. */}
            <NeedAutoMatchNote needId={need.id} onOpen={openMatching} />
          </div>
          {/* #2446.17 — l'affaire OUVRE son dossier ; sans affaire, aucun lien (sait dire NON). */}
          {need.project_id && need.project_label?.trim() ? (
            <Button asChild size="sm" variant="secondary" className="shrink-0 pointer-coarse:min-h-11">
              <Link to="/projects/$id" params={{ id: need.project_id }}>
                {t('needSheet.openProject')}
              </Link>
            </Button>
          ) : null}
        </section>

        {/* Théo `.bo11-tabs` — les quatre onglets du produit, chacun n'affiche que son contenu. */}
        <div data-theo-block="tabs" data-testid="need-tabs">
          <TabNav tabs={tabs} activeTab={family} onTabChange={key => setFamily(key as NeedDetailFamily)} size="sm" />
        </div>

        {family === 'synthese' ? (
          <>
            {/* N1 — « Synthèse en 7 questions », celle de l'affaire, en tête : ce qui n'est pas su est dit. */}
            {need.project_id ? (
              <Card data-theo-block="synthesis" className="rounded-card p-4 md:p-5">
                <ProjectSynthesisPanel projectId={need.project_id} />
              </Card>
            ) : null}

            {/* ─── LE BESOIN ─────────────────────────────────────────────────── */}
            <Card data-theo-block="need" data-testid="need-panel" className="rounded-card p-4 md:p-5">
              <Text element="h2" size="base" weight="semibold">
                {t('needSheet.needBlock')}
              </Text>
              {/* La grille des faits clés (`.bo11-facts`) : deux colonnes au téléphone, trois au-delà. */}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
                <KeyFact label={t('needSheet.keyFacts.start')}>
                  {formatDate(need.start_on) ?? <UnknownValue reason={t('needSheet.startUnknown')} />}
                </KeyFact>
                <KeyFact label={t('needSheet.keyFacts.duration')}>
                  {need.duration_months === null ? (
                    <UnknownValue reason={t('needSheet.durationUnknown')} />
                  ) : (
                    t('openNeeds.months', { count: need.duration_months })
                  )}
                </KeyFact>
                <KeyFact label={t('needSheet.keyFacts.place')} hint={presence || null}>
                  {need.location ?? <UnknownValue reason={t('needSheet.locationUnknown')} />}
                </KeyFact>
                {/* `headcount` est `min(1)` au contrat : pas de « 0 poste », pas d'absence à nommer. */}
                <KeyFact label={t('needSheet.keyFacts.seats')}>{need.headcount}</KeyFact>
                <KeyFact
                  label={t('needSheet.keyFacts.targetRate')}
                  hint={need.target_tjm_cents === null ? null : t('needSheet.keyFacts.perDay')}
                >
                  {need.target_tjm_cents === null ? (
                    <UnknownValue reason={t('needSheet.rate.targetUnknownShort')} />
                  ) : (
                    formatCents(need.target_tjm_cents)
                  )}
                </KeyFact>
                <KeyFact
                  label={t('needSheet.minRate')}
                  hint={need.min_tjm_cents == null ? null : t('needSheet.keyFacts.perDay')}
                >
                  {need.min_tjm_cents == null ? (
                    <UnknownValue reason={t('needSheet.minRateUnknown')} />
                  ) : (
                    formatCents(need.min_tjm_cents)
                  )}
                </KeyFact>
              </dl>

              {need.skills.length === 0 ? (
                // Pas « aucune compétence » : la question n'a pas été remplie, et c'est ce qui empêche le rapprochement.
                <div className="mt-4">
                  <UnknownValue reason={t('needSheet.skillsUnknown')} />
                </div>
              ) : null}
              {requiredSkills.length > 0 ? (
                <SkillFamily title={t('needSheet.skillsRequired')} tone="primary" skills={requiredSkills} />
              ) : null}
              {optionalSkills.length > 0 ? (
                <SkillFamily title={t('needSheet.skillsOptional')} tone="default" skills={optionalSkills} />
              ) : null}

              {/* Gardé hors maquette — le reste du poste, sous les compétences (à trancher par Louis). */}
              <div className="mt-4 border-t border-[var(--bellum-border)] pt-3">
                <Text element="h3" size="sm" weight="semibold">
                  {t('needSheet.roleBlock')}
                </Text>
                <dl className="mt-2 grid gap-2">
                  <Field label={t('openNeeds.columns.seniority')}>
                    {need.seniority ?? <UnknownValue reason={t('needSheet.seniorityUnknown')} />}
                  </Field>
                  <Field label={t('openNeeds.columns.contract')}>{t(`openNeeds.contract.${need.contract_kind}`)}</Field>
                  {/* X66 / #3547 — le forfait encadré, DANS la grille (pas un bloc de plus) :
                      aucune ligne sur un besoin staffé ; une équipe inconnue se dit. */}
                  {supervisedForfaitLabel(need) ? (
                    <>
                      <Field label={t('missions:overview.deliveryMode')}>{supervisedForfaitLabel(need)}</Field>
                      <Field label={t('missions:overview.clientTeam')}>{clientTeamLabel(need)}</Field>
                    </>
                  ) : null}
                  <Field label={t('openNeeds.columns.deadline')}>
                    {need.deadline_at === null ? (
                      <UnknownValue reason={t('needSheet.deadlineUnknown')} />
                    ) : (
                      <Text
                        element="span"
                        size="sm"
                        color={overdue ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-primary)]'}
                      >
                        {formatDate(need.deadline_at)}
                        {overdue ? ` · ${t('needSheet.deadlinePassed')}` : ''}
                      </Text>
                    )}
                  </Field>
                  {/* LE BUDGET (le plancher vit dans la grille de « Le besoin »). Servi par le contrat depuis le
                  chantier CRM.

                  ⚠️ Ni lui ni le plancher n'est dérivé de l'autre. « budget ÷
                  jours » est exactement le calcul refusé pour le « CA
                  potentiel » — il varierait selon qu'on compte vingt ou
                  vingt-et-un jours par mois, et il finirait lu comme un fait. */}
                  {framed ? null : (
                    <Field label={t('needSheet.budget')}>
                      {need.budget_cents == null ? (
                        <UnknownValue reason={t('needSheet.budgetUnknown')} />
                      ) : (
                        formatCents(need.budget_cents)
                      )}
                    </Field>
                  )}
                  <Field label={t('needSheet.expertise')}>
                    {need.expertise ?? <UnknownValue reason={t('needSheet.expertiseUnknown')} />}
                  </Field>
                  <Field label={t('needSheet.stack')}>
                    {(need.stack ?? []).length === 0 ? (
                      <UnknownValue reason={t('needSheet.stackUnknown')} />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(need.stack ?? []).map(item => (
                          <Badge key={item} variant="outline">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </Field>
                  {/* LE « RÉSUMÉ : CONTEXTE ET OBJECTIFS » DU §3.3. Le champ existait
                  en base et n'atteignait aucun écran — c'est ce qui rend un
                  brief racontable au téléphone plutôt qu'une liste de mots-clés. */}
                  {framed ? null : (
                    <Field label={t('needSheet.context')}>
                      {need.context ?? <UnknownValue reason={t('needSheet.contextUnknown')} />}
                    </Field>
                  )}
                  {/* #2175.12 — « RÉSULTAT ATTENDU » : relit `project_objective`
                      (ProjectRow.objective côté API, GA-26) — jamais un second
                      champ, jamais deviné dans le contexte ci-dessus. */}
                  <Field label={t('needSheet.expectedOutcome')}>
                    {need.project_objective ?? <UnknownValue reason={t('needSheet.expectedOutcomeUnknown')} />}
                  </Field>
                  <Field label={t('needSheet.constraints')}>
                    {need.constraints ?? <UnknownValue reason={t('needSheet.constraintsUnknown')} />}
                  </Field>
                  {/* Import universel (27/09/2026) — muet sans colonne importée. */}
                  <ImportedExtraCard extra={need.extra} />
                  {/* #2323.22 — LE PROCESSUS de présentation, même patron que
                  `constraints` juste au-dessus : texte libre, jamais une
                  énumération de ses étapes. */}
                  <Field label={t('needSheet.presentationProcess')}>
                    {need.presentation_process ?? <UnknownValue reason={t('needSheet.presentationProcessUnknown')} />}
                  </Field>
                  {/* #2323.18 — la porte PRÉSENTER, accord sur le type de
                  profil : `unknown` reste éditable à tout moment. */}
                  <Field label={t('needSheet.profileTypeAgreement.label')}>
                    <NeedProfileTypeAgreementControl need={need} />
                  </Field>
                </dl>
              </div>
            </Card>

            {/* ─── ACTIONS ET PROCHAINES ÉTAPES ─────────────────────────────── */}
            <div data-theo-block="actions">
              <NeedStepsCard need={need}>
                {/* La prochaine action DÉRIVÉE (`needNextAction`), en tête ; `null` quand le besoin ne
                    circule plus. Le MÊME composant que la liste, rendu en texte ici (l'écran est déjà la
                    destination de toutes les actions d'un besoin). */}
                {nextAction ? (
                  <div className="mt-2 rounded-control bg-[var(--bellum-surface-2)] px-3 py-2">
                    <NextAction
                      action={{
                        domain: 'need',
                        action: nextAction,
                        needId: need.id,
                        origin: '/projects/needs/$needId',
                      }}
                    />
                  </div>
                ) : null}
              </NeedStepsCard>
            </div>

            {/* ─── POUR DÉCIDER — gardé hors maquette (à trancher par Louis) ─────────────────
                Le verdict go / no-go, le tarif comparé, le parcours, les rails, le cadrage, les exigences
                et le suivi : présents avant la refonte, absents de la maquette. Rien n'est retiré. */}
            <section data-theo-block="decide" className="flex flex-col gap-4">
              <Text element="h2" size="base" weight="semibold">
                {t('needSheet.decideBlock')}
              </Text>
              {/* #2323.46 — le résumé qualité : matchable / présentable / prêt à engager, ce qui manque NOMMÉ. */}
              <NeedQualitySummaryCard need={need} />
              <NeedVerdictBanner needId={need.id} onSeeProfiles={() => setFamily('profiles')} />
              <ChainProgressBlock subjectType="need" subjectId={need.id} />
              <NeedRateComparison need={need} />
              <NeedDiscoveryRails need={need} now={now} />
              {framed ? <NeedFramingCard need={need} /> : null}
              <div className="grid gap-4 lg:grid-cols-2">
                <NeedRequirementsCard need={need} />
                <Card className="rounded-card p-4 md:p-5">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('needSheet.trackingBlock')}
                  </Text>
                  <dl className="mt-2 grid gap-2">
                    {/* #3409.2 — LA NATURE (exprimé / détecté / simple signal /
                  confirmé). `convergence_state` reste éditable à tout moment,
                  comme `profile_type_agreement` juste au-dessus. */}
                    {/* #4158.34 — l'interrupteur « Privé » ; défaut partagé. */}
                    <PrivateSwitch
                      kind="needs"
                      id={need.id}
                      isPrivate={need.is_private}
                      invalidate={[openNeedsKeys.all]}
                    />
                    <Field label={t('needSheet.convergenceState.label')}>
                      <NeedConvergenceStateControl need={need} />
                    </Field>
                    {/* Le MOTIF de l'état — servi depuis toujours, affiché nulle part.
                  C'est la seule chose qui permet de rouvrir un besoin en veille :
                  sans lui, rien ne dit ce qu'on attend ni de qui. */}
                    {need.status_reason ? (
                      <Field label={t('needSheet.statusReason')}>{need.status_reason}</Field>
                    ) : null}
                    {/* #3389.13 — « attente AVEC DATE » : la reprise prévue, seulement
                  quand elle est posée (une absence ne fait aucune ligne). */}
                    {need.status === 'on_hold' && need.resume_on ? (
                      <Field label={t('needSheet.resumeOn')}>{formatDate(need.resume_on)}</Field>
                    ) : null}
                    <Field label={t('openNeeds.columns.stageAge')}>
                      {days === null || need.status_changed_at === null ? (
                        // Jamais « 0 j » : « ça vient de bouger » et « personne ne l'a
                        // jamais fait bouger » appellent des gestes opposés.
                        <UnknownValue reason={t('openNeeds.stageAge.unknown')} />
                      ) : (
                        <Text
                          element="span"
                          size="sm"
                          title={t('openNeeds.stageAge.since', {
                            date: formatDate(new Date(need.status_changed_at)),
                          })}
                        >
                          {t('openNeeds.stageAge.days', { count: days })}
                        </Text>
                      )}
                    </Field>
                    {/* ZÉRO EST UNE VRAIE RÉPONSE ICI, et c'est la seule du fichier :
                  la requête a compté les positionnements, elle a trouvé
                  personne. C'est l'alerte du §16 — et c'est ce qui ouvre la
                  troisième porte, en haut de l'écran. */}
                    <Field label={t('openNeeds.columns.shortlist')}>
                      {need.shortlist_count === 0 ? (
                        <Text element="span" size="sm" color="text-[var(--warning-soft-text)]">
                          {t('openNeeds.shortlist.none')}
                        </Text>
                      ) : (
                        need.shortlist_count
                      )}
                    </Field>
                    <Field label={t('openNeeds.columns.staffable')}>
                      {need.staffable === 'yes' || need.staffable === 'no' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline">{t(`staffable.state.${need.staffable}`)}</Badge>
                          {need.staffable_reason ? (
                            <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
                              {need.staffable_reason}
                            </Text>
                          ) : null}
                        </div>
                      ) : (
                        // « Pas encore » n'est pas un verdict : la porte G3 est
                        // rendue OUVERTE, comme dans la liste, et ne rien cliquer
                        // reste la troisième issue.
                        <NeedStaffableControl need={need} />
                      )}
                    </Field>
                    <Field label={t('openNeeds.columns.source')}>
                      {need.source === null ? (
                        // ⚠️ Jamais « saisi à la main » : la valeur par défaut d'une
                        // colonne vide serait une provenance INVENTÉE, et une
                        // provenance inventée se relit six mois plus tard comme un fait.
                        <UnknownValue reason={t('openNeeds.sourceUnknownHint')} />
                      ) : (
                        t(`openNeeds.source.${need.source}`)
                      )}
                    </Field>
                    <Field label={t('needSheet.provenance')}>
                      {need.provenance === null ? (
                        <UnknownValue reason={t('needSheet.provenanceUnknown')} />
                      ) : (
                        t(`needSheet.provenanceValue.${need.provenance}`)
                      )}
                    </Field>
                    {/* #2175.9 — LE RESPONSABLE. `owner_id` existe depuis la LISTE des
                  besoins ouverts (#1328) ; la FICHE ne le nommait pas encore. Même
                  fonction que la carte du pipe, le tableau des projets et le hero
                  du tiroir d'opportunité (`useProjectOwners`) : un nom recalculé à
                  un quatrième endroit divergerait à la première retouche. */}
                    <Field label={t('needSheet.owner')}>
                      {resolvedOwnerName ? resolvedOwnerName : <UnknownValue reason={t('needSheet.ownerUnknown')} />}
                    </Field>
                    {/* #2175.8 — L'INTERLOCUTEUR. `contact_id`/`contact_name` sont lus
                  SUR LA MÊME requête que le reste du besoin (`OpenNeedsService.list`) :
                  `null` = personne n'a été désigné, jamais un nom déduit du compte. */}
                    <Field label={t('needSheet.contact')}>
                      {need.contact_name ? need.contact_name : <UnknownValue reason={t('needSheet.contactUnknown')} />}
                    </Field>
                    {/* #2939 (#2174.33) — LE DÉCIDEUR, même patron que l'interlocuteur
                  juste au-dessus : `decision_maker_name` est lu par jointure,
                  jamais un second calcul. */}
                    {framed ? null : (
                      <Field label={t('needSheet.decisionMaker')}>
                        {need.decision_maker_name ? (
                          need.decision_maker_name
                        ) : (
                          <UnknownValue reason={t('needSheet.decisionMakerUnknown')} />
                        )}
                      </Field>
                    )}
                    {/* #2939 (#2174.32) — COMMENT LE CLIENT DÉCIDE en interne,
                  distinct du recrutement côté ESN (`presentation_process` plus
                  bas) : texte libre, jamais une énumération de ses étapes. */}
                    <Field label={t('needSheet.decisionProcess')}>
                      {need.decision_process ?? <UnknownValue reason={t('needSheet.decisionProcessUnknown')} />}
                    </Field>
                    {/* #2939 (#2174.34) — LES ACHATS : `implique` | `non_implique`,
                  jamais un troisième « peut-être ». */}
                    <Field label={t('needSheet.procurement.label')}>
                      {need.procurement_involvement ? (
                        t(`needSheet.procurement.values.${need.procurement_involvement}`)
                      ) : (
                        <UnknownValue reason={t('needSheet.procurementUnknown')} />
                      )}
                    </Field>
                    {/* La prochaine action. `null` quand le besoin ne circule plus :
                  un conseil générique dirait le contraire et se ferait ignorer.

                  ⚠️ Le MÊME composant que la liste — et il rend du TEXTE ici.
                  `origin` porte la route de cet écran, qui est justement la
                  destination de toutes les actions d'un besoin : un lien vers
                  la page où l'on est déjà promet un déplacement qui n'a pas
                  lieu, et fait douter des autres liens de la page. La décision
                  est prise dans la dérivation, pas ici (GA-26). */}
                    {nextAction ? (
                      <Field label={t('openNeeds.columns.nextAction')}>
                        <NextAction
                          action={{
                            domain: 'need',
                            action: nextAction,
                            needId: need.id,
                            origin: '/projects/needs/$needId',
                          }}
                        />
                      </Field>
                    ) : null}
                  </dl>
                </Card>
              </div>
            </section>
          </>
        ) : null}

        {family === 'profiles' ? (
          <div data-theo-block="profiles" data-testid="need-profiles-panel" className="flex flex-col gap-4">
            {matchingOpen ? (
              // Fermer le rapprochement ramène au tableau des profils, pas à la Synthèse.
              <NeedMatchTab need={need} onClose={() => setMatchingOpen(false)} />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="pointer-coarse:min-h-11"
                    disabled={!needMatcherCanLaunch(need)}
                    title={needMatcherLaunchTooltip(need, tMatching)}
                    onClick={openMatching}
                  >
                    {t('needSheet.findProfiles')}
                  </Button>
                </div>
                <NeedPositioningsTab need={need} />
                {/* Gardés hors maquette (à trancher par Louis) — ce que la fiche disait déjà des profils. */}
                <NeedShortlistSection need={need} onOpen={openMatching} />
                <NeedVerdictProfiles needId={need.id} onCompare={openMatching} />
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    {forfait && need.status === 'won' ? (
                      <NeedWonProjectCard need={need} />
                    ) : (
                      <NeedStaffingBanner need={need} />
                    )}
                  </div>
                  <NeedDetailRecommendation need={need} onOpenMatching={openMatching} />
                </div>
                {/* « Un besoin sans candidat ouvre une piste » et « chercher hors vivier » : même signal
                    (`shortlist_count === 0`, l'alerte du §16). */}
                {need.shortlist_count === 0 ? <NeedReverseProspects needId={need.id} /> : null}
                {need.shortlist_count === 0 ? (
                  <NeedExternalSourcing
                    needId={need.id}
                    needTitle={need.title}
                    skillTerms={need.skills.map(skill => skill.term)}
                    headcount={need.headcount}
                    onImportResult={() => setDoorFor(need)}
                  />
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {family === 'progress' ? (
          <>
            {/* Théo — « Avancement du besoin » : ce qui est DATÉ en base sur CE besoin. */}
            <Card data-theo-block="progress" className="rounded-card p-4 md:p-5">
              <Text element="h2" size="base" weight="semibold">
                {t('needSheet.progressBlock')}
              </Text>
              <div className="mt-3">
                <NeedHistoryTab need={need} />
              </div>
            </Card>
            {/* Nos maquettes validées (AFFAIRES-B5 / B4) — « Avant la mission » et « Doublons ». */}
            <NeedBeforeMissionCard needId={need.id} />
            {/* ⚠️ Le fil du PROJET, pas du besoin : une activité n'a pas de `needId`. #2558.1 — sans
                affaire, pas de fil : on le dit, on ne montre pas un fil vide. */}
            <Card data-theo-block="project-thread" className="rounded-card p-4 md:p-5">
              <Text element="h2" size="base" weight="semibold">
                {t('needSheet.projectThreadBlock')}
              </Text>
              {need.project_id === null ? (
                <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('needSheet.tabs.activityWithoutProject')}
                </Text>
              ) : (
                <Box className="mt-1 space-y-2">
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('needSheet.tabs.activityHint', { project: need.project_label })}
                  </Text>
                  <TimelinePanel
                    scope="project"
                    entityId={need.project_id}
                    projectId={need.project_id}
                    accountId={need.account_id}
                    showSync={false}
                  />
                </Box>
              )}
            </Card>
          </>
        ) : null}

        {family === 'documents' ? (
          <>
            <Card data-theo-block="documents" className="rounded-card p-4 md:p-5">
              <Text element="h2" size="base" weight="semibold">
                {t('needSheet.documentsBlock')}
              </Text>
              <div className="mt-3">
                <NeedDocumentsTab need={need} />
              </div>
            </Card>
            {/* N3 — UNE proposition par affaire (Louis 22/10) : elle vit sur la fiche de l'affaire. */}
            {need.project_id ? (
              <Card
                data-theo-block="proposal"
                className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-[var(--bellum-surface-2)] p-4 md:p-5"
              >
                <div className="min-w-0">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('needSheet.proposal.title')}
                  </Text>
                  <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                    {t('needSheet.proposal.body')}
                  </Text>
                </div>
                <Button asChild size="sm" variant="secondary" className="pointer-coarse:min-h-11">
                  <Link to="/projects/$id" params={{ id: need.project_id }}>
                    {t('needSheet.proposal.prepare')}
                  </Link>
                </Button>
              </Card>
            ) : null}
          </>
        ) : null}

        {/* #4198 (L7) — l'affaire, les candidats et les missions de ce besoin. */}
        <PageRecordLinks kind="need" id={need.id} />
      </div>
    </CustomerPage>
  )
}

/** Théo `.bo11-fact` — un fait clé : libellé discret, valeur forte, précision dessous. */
function KeyFact({ label, hint, children }: { label: string; hint?: string | null; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--bellum-text-primary)]">{children}</dd>
      {hint ? <dd className="text-xs text-[var(--bellum-text-secondary)]">{hint}</dd> : null}
    </div>
  )
}

/** Une famille de compétences (`.bo11-badge`), chacune avec son niveau en infobulle. */
function SkillFamily({
  title,
  tone,
  skills,
}: {
  title: string
  tone: 'primary' | 'default'
  skills: OpenNeedRow['skills']
}) {
  const { t } = useTranslation('projects')
  return (
    <div className="mt-4">
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {skills.map(skill => (
          <Badge
            key={skill.term}
            variant={tone}
            title={
              skill.required
                ? t('needSheet.skillRequired', { level: skill.level ?? t('needSheet.levelUnknown') })
                : t('needSheet.skillOptional', { level: skill.level ?? t('needSheet.levelUnknown') })
            }
          >
            {skill.term}
          </Badge>
        ))}
      </div>
    </div>
  )
}

/**
 * Une ligne « libellé / valeur ».
 *
 * `<dt>`/`<dd>` et non deux `<div>` : la relation entre le nom d'un champ et sa
 * valeur doit être ANNONCÉE, pas seulement visible — un lecteur d'écran lit
 * alors « TJM cible : 560 € », et non deux fragments côte à côte.
 *
 * ⚠️ `min-w-0` sur la valeur : `min-width: auto` sur un enfant de flex est le
 * premier responsable des débordements horizontaux du dépôt. Un motif d'état de
 * deux cents caractères pousserait la carte hors de l'écran.
 *
 * Les tailles sont celles de l'échelle Tailwind (12 et 14 px, GA-31) et les
 * couleurs passent par les jetons de thème — une nuance figée ne suivrait pas
 * le passage en clair.
 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <dt className="min-w-[7rem] text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}
