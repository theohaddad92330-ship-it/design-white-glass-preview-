import { Badge, Box, Button, Card, TabNav, Text, type TabNavItem } from '@bellum/ui'
import { ArrowLeft, Compass, FileText, Pencil, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { NotesPanel } from '@/features/crm-core/view/NotesPanel'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ScreenGuideSlot } from '@/components/shell/ScreenGuideSlot'
import { PageRecordLinks } from '@/features/records/PageRecordLinks'
import { formatDate } from '@/lib/locale'
import { consentState, daysBeforeConsentExpiry, isSkillSourceProven } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { useSession } from '@/lib/hooks/use-session'
import { trackErrorShown, trackTabOpened } from '@/lib/product-tracker'
import { useSubmissions } from '@/features/submissions/api'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import {
  useArchiveTalent,
  useConsultant,
  useConsultants,
  useReactivateTalent,
  useSetTalentOwner,
  useTalentMissions,
  useTalentSummary,
  useUpdateConsultant,
} from '../../hooks'
import { useTalentDocuments, useTalentSkills } from '../../talent-api'
import { talentNameText } from '../../lib/talentName'
import { TalentTabFields } from './TalentFieldGroup'
import { CvDropZone } from '../CvDropZone'
import { TalentPhotoUpload } from '../TalentPhotoUpload'
import { TalentSkillsDialog } from '../TalentSkillsDialog'
import { CvReviewPanel } from '../parse/CvReviewPanel'
import { CvStudioPanel } from '../studio/CvStudioPanel'
import { SubmissionFeedbackDialog } from '@/features/submissions/view/SubmissionFeedbackDialog'
import { TalentAddToNeedDialog } from './TalentAddToNeedDialog'
import { TalentPrepareMessageDialog } from './TalentPrepareMessageDialog'
import { AddToNeedAction } from './AddToNeedAction'
import { SubmissionFeedbackSummary } from './SubmissionFeedbackSummary'
import { TalentConsentTab } from './TalentConsentTab'
import { TalentContactActions } from './TalentContactActions'
import { TalentDetailHeader } from './TalentDetailHeader'
import { TalentObjectives } from './TalentObjectives'
import { ConsultantBriefDialog } from '../ConsultantBriefDialog'
import { ConsultantEngagementBanner } from '../ConsultantEngagementBanner'
import { TalentAvailabilityBadge } from '../TalentAvailabilityBadge'
import { TalentScorePanel } from './TalentScorePanel'
import { TalentMoreActions } from './TalentMoreActions'
import { TalentDocumentPreview } from './TalentDocumentPreview'
import { TalentIdentityPanel } from './TalentIdentityPanel'
import { TalentProfileTab } from './TalentProfileTab'
import { ImportedExtraCard } from '@/features/universal-import/view/ImportedExtraCard'
import { TalentRatesTab } from './TalentRatesTab'
import { InverseMatchPanel } from '@/features/matching/view/InverseMatchPanel'
import { ConsultantImportMark } from './ConsultantImportMark'

/**
 * La fiche d'un talent (PDF 3 §7 ; maquette du Vivier, PDF-22 §01).
 *
 * Il n'y avait aucune fiche : tout se jouait en dialogues au-dessus de la
 * liste, si bien qu'on ne pouvait pas savoir où quelqu'un était passé ni ce
 * qu'un client lui avait répondu — les données existaient pourtant toutes.
 *
 * Regroupée en SIX familles depuis le 26/09/2026 (#2185.22/.24/.25) : Profil,
 * Compétences, Missions & disponibilité, Documents, Activité, Conformité —
 * voir {@link groupOf}. Le dixième onglet d'origine, « Revue du CV »,
 * n'apparaît que tant que la fiche n'a pas été relue.
 *
 * #2185.27/.28 — « Expériences » et « Formations » n'ont toujours PAS de
 * structure : rien ne découpe le CV en expériences datées ou en diplômes (le
 * CV reste un bloc de texte, `cv-parse.service.ts`). Ce lot REVIENT sur le
 * refus antérieur de les poser vides : elles sont désormais NOMMÉES,
 * « non renseigné », dans l'onglet Profil (`TalentProfileTab.tsx`) — un
 * manque réel qui se dit vaut mieux qu'un silence qui se découvre en réunion,
 * tant qu'aucune structure n'est inventée pour le combler.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `TabNav` ET NON `Tabs` (Radix) — mesuré en production le 31/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * Les libellés « Documents », « Dossier », « Disponibilité & TJM » et
 * « Positionnements » se CHEVAUCHAIENT, illisibles. La cause n'était pas le
 * nombre d'onglets : `TabsTrigger` porte `flex-1`, donc `flex-basis: 0` ET
 * `flex-shrink: 1`. Dix onglets se partageaient la largeur en parts ÉGALES,
 * chaque part plus étroite que son libellé, et `whitespace-nowrap` empêchait le
 * retour à la ligne — le texte débordait de sa boîte sur celle du voisin.
 * `TabsList` étant `w-fit` et non `overflow-x-auto`, rien ne le rattrapait.
 *
 * `TabNav` tient exactement l'inverse, et l'a écrit noir sur blanc : `shrink-0`
 * sur le CONTENEUR de chaque onglet, `overflow-x-auto` sur la barre. La
 * réparation n'était donc pas à écrire, elle était à APPELER — réparer la barre
 * Radix ici aurait produit une SECONDE barre d'onglets, qui aurait divergé de
 * celle des cinq autres écrans au premier changement.
 *
 * Chaque panneau est une RÉGION nommée par son onglet : la fiche en compte
 * plusieurs (l'entête, puis l'onglet actif), et une région anonyme ne s'annonce
 * pas.
 */

/**
 * #2185.22/.24/.25 — SIX FAMILLES AU PLUS (brief nuit 26/09/2026), par
 * DÉPLACEMENT du contenu existant, rien retiré. `TalentTab` garde ses clés
 * FINES (`rates`, `submissions`, `missions`, `studio`, `identity`…) : ce que
 * la barre montre change, ce que l'entête et les anciens liens `?tab=` ciblent
 * ne bouge pas — `onStartMatch`/`onViewSubmissions`/`onViewMissions` posent
 * toujours `rates`/`submissions`/`missions`, {@link groupOf} les ramène tous
 * les trois vers le même bouton visible, « Missions & disponibilité ».
 */
// Théo C talents-fiche.R1 — CINQ boutons : Profil · Présentations · Documents · Activité · Conformité.
// Les anciennes clés FINES restent valides (`?tab=skills`, `rates`, `missions`, `review`…) : elles
// allument le bouton qui porte désormais leur contenu, rien n'est retiré.
const TAB_GROUPS = {
  profile: ['profile', 'identity', 'skills', 'rates', 'missions'],
  delivery: ['delivery', 'submissions'],
  documents: ['documents', 'studio', 'review'],
  notes: ['notes'],
  consent: ['consent'],
} as const

/** Les cinq boutons visibles, dans l'ordre de la page appliquée. « delivery » porte le libellé
 *  « Présentations ». */
const TAB_KEYS = ['profile', 'delivery', 'documents', 'notes', 'consent'] as const
type TabGroupKey = (typeof TAB_KEYS)[number]
type TalentTab = TabGroupKey | 'identity' | 'studio' | 'rates' | 'submissions' | 'missions' | 'skills' | 'review'

/** Une clé FINE → le bouton de premier niveau qui la porte. */
function groupOf(tabKey: TalentTab): TabGroupKey {
  for (const [group, members] of Object.entries(TAB_GROUPS)) {
    if ((members as readonly string[]).includes(tabKey)) return group as TabGroupKey
  }
  return 'profile'
}

/**
 * #1687 (trackTabOpened) — le MOTIF d'écran, jamais `talentId` : la même
 * convention que `PARTNERS_SCREEN` dans `TabPartners.tsx` (dossier de compte,
 * hors périmètre de ce lot) — `resolveProductScreen`/`PRODUCT_SCREENS`
 * connaissent `/consultants/$id`, jamais l'UUID réel.
 */
const TALENT_SCREEN = '/consultants/$id'

export function TalentDetailPage({
  talentId,
  initialTab,
}: {
  talentId: string
  /** #2185.22/.24/.25 — un ancien lien `?tab=` (une clé fine, ex. `rates`,
   *  ou un ancien nom de bouton devenu alias, ex. `opportunities`) : résolu
   *  par la route (`consultantDetailSearch.ts`) avant d'arriver ici. */
  initialTab?: TalentTab
}) {
  const { t } = useTranslation('consultants')
  const navigate = useNavigate()
  const { user } = useSession()
  const { data: talent, isLoading, isError, error } = useConsultant(talentId)
  /**
   * La LIGNE DE VIVIER — dérivée, et distincte de la fiche.
   *
   * `useConsultant` rend la ligne SQL : `availability`, le champ SAISI, dont le
   * défaut en base est « inconnu ». Sans cette seconde lecture, l'entête ne
   * pourrait ni afficher la disponibilité DÉDUITE des affectations, ni
   * décomposer la complétude — et la fiche annoncerait « disponible tout de
   * suite » pendant que la personne est en mission jusqu'en mars.
   */
  const { data: row, isLoading: rowIsLoading } = useTalentSummary(talentId)
  const { data: skills } = useTalentSkills(talentId)
  const { data: documents } = useTalentDocuments(talentId)
  const { data: missions } = useTalentMissions(talentId)
  const { data: submissions } = useSubmissions({ consultantId: talentId })
  const update = useUpdateConsultant()
  // #2195.12 — le vivier, pour la liste déroulante « Manager » de la modale
  // d'édition. Mis en cache trente secondes par `useConsultants` : ouvrir dix
  // fiches ne fait pas dix lectures.
  const { data: pool } = useConsultants()
  const archive = useArchiveTalent()
  const reactivate = useReactivateTalent()
  // #2185.10 — le vivier de l'espace, pour « Suivi par » (même liste que
  // `AccountCollaborationBand`, la promesse d'attribution des comptes).
  const members = useWorkspaceMembers().data ?? []
  const setOwner = useSetTalentOwner()
  /** #4034.4 — le document dont l'APERÇU est ouvert (panneau), `null` = fermé. */
  const [previewDocumentId, setPreviewDocumentId] = useState<string | null>(null)
  const previewDocument = (documents ?? []).find(document => document.id === previewDocumentId) ?? null
  /**
   * LE PANNEAU DES COMPÉTENCES, ATTEIGNABLE DEPUIS LA FICHE (28/08/2026).
   *
   * Le formulaire d'enregistrement écrit noir sur blanc que « le niveau et la
   * source se précisent ensuite dans l'onglet Compétences de la fiche ». Cet
   * onglet-là était en LECTURE SEULE : le seul chemin d'édition partait d'un
   * bouton de la LIGNE du vivier, donc il fallait revenir en arrière pour faire
   * ce que la phrase venait de promettre.
   *
   * C'est la cause racine « une réponse juste sans chemin », et elle coûte deux
   * fois ici : le geste manquant est précisément celui qui remplace un niveau
   * « inconnu » par une évaluation, c'est-à-dire ce qui rend le profil
   * évaluable au matching.
   */
  const [editingSkills, setEditingSkills] = useState(false)
  // #2185.50 — « Ajouter à un besoin », atteignable depuis la fiche.
  const [addingToNeed, setAddingToNeed] = useState(false)
  // #2185.51 — « Préparer un message » : un brouillon, jamais un envoi.
  const [preparingMessage, setPreparingMessage] = useState(false)
  // #2948 (#2329.53) — un brouillon SUGGÉRÉ (revalidation de fraîcheur, TJM
  // historique) plutôt que la boîte vide habituelle : `undefined` = geste
  // ordinaire depuis l'entête, sans suggestion.
  const [suggestedMessageBody, setSuggestedMessageBody] = useState<string | undefined>(undefined)
  const prepareRevalidationMessage = (body: string) => {
    setSuggestedMessageBody(body)
    setPreparingMessage(true)
  }
  // #2185.42 — le retour client structuré, ouvert pour UN positionnement à
  // la fois. `null` : aucune fenêtre ouverte, jamais un id périmé affiché.
  const [feedbackSubmissionId, setFeedbackSubmissionId] = useState<string | null>(null)
  // Théo C talents-fiche.A8 — le besoin dont le brief de soutenance est ouvert, `null` = fermé.
  const [briefProjectId, setBriefProjectId] = useState<string | null>(null)
  const needsReview = talent?.review_status === 'needs_review'
  const hasCvText = Boolean(talent?.cv_text?.trim())
  const [tab, setTab] = useState<TalentTab | null>(initialTab ?? null)
  // L'onglet actif se DÉDUIT tant que personne n'a cliqué : le poser dans un
  // état initial le figerait sur la valeur du premier rendu, alors que la fiche
  // n'est pas encore chargée.
  const activeTab: TalentTab = tab ?? (needsReview ? 'documents' : 'profile')
  // #2185.22/.24/.25 — LE BOUTON mis en avant, jamais la clé fine : un lien
  // `?tab=rates` (ou l'action « Chercher les besoins » de l'entête) doit
  // allumer « Missions & disponibilité », pas un quatrième bouton fantôme.
  const activeGroup = groupOf(activeTab)

  // Théo C talents-fiche.R1 — la revue du CV n'est plus un onglet : elle vit dans Documents (A3).
  const tabs = useMemo<TabNavItem[]>(() => TAB_KEYS.map(key => ({ key, label: t(`detail.tabs.${key}`) })), [t])

  // #1687.3 — L'ÉTAT D'ERREUR D'ÉCRAN. Un `useEffect` gardé sur `isError`,
  // jamais un appel en plein rendu : la fiche peut re-rendre plusieurs fois
  // pendant que l'échec persiste (un re-rendu du parent, par exemple), et
  // l'émission ne doit compter qu'une seule TRANSITION vers l'échec, pas
  // chaque rendu. `errorCode` est un littéral fixe — jamais le message
  // d'erreur de `useConsultant`, qui n'est pas un code fermé.
  useEffect(() => {
    if (isError) trackErrorShown(TALENT_SCREEN, 'load_failed')
  }, [isError])

  if (isLoading) {
    return (
      <CustomerPage pageTitle={t('detail.loading')}>
        <Text size="sm" className="py-6 text-[var(--bellum-text-muted)]">
          {t('detail.loading')}
        </Text>
      </CustomerPage>
    )
  }

  // Un échec de lecture DIT qu'il a échoué : une fiche vide se lirait « ce
  // talent n'a rien », ce qui n'est pas la même chose.
  if (isError || !talent) {
    return (
      <CustomerPage pageTitle={t('detail.errorTitle')}>
        <Card className="p-6">
          {/* #4401.1 — une fiche d'un autre espace ou supprimée (404) se DIT ; tout autre échec reste « la requête n'a pas abouti ». */}
          <Text size="sm">
            {error instanceof ApiError && error.status === 404 ? t('detail.errorNotFound') : t('detail.errorBody')}
          </Text>
          <Button variant="ghost" className="mt-3 gap-1.5" onClick={() => navigate({ to: '/consultants' })}>
            <ArrowLeft className="size-4" />
            {t('detail.backToPool')}
          </Button>
        </Card>
      </CustomerPage>
    )
  }

  // Le nom AFFICHABLE de la fiche — jamais le nom du fichier déposé, que
  // `cv-intake` écrit dans `full_name` faute d'autre chose (`talentName.ts`).
  const talentName = talentNameText(talent.full_name, t('name.unnamed'))

  // Une seule horloge pour les deux lectures : `consentState` et
  // `daysBeforeConsentExpiry` lisent le MÊME `expiresAt` sous la même condition
  // de validité — quand l'état vaut `expiring`, le nombre de jours ne peut donc
  // pas être `null`. Le vérifier ici plutôt qu'écrire `?? 0` évite d'afficher
  // « expire dans 0 jour » le jour où les deux lectures divergeraient.
  const consentNow = new Date()
  const consentStatus = consentState(talent.consent, consentNow)
  const consentDaysLeft = daysBeforeConsentExpiry(talent.consent, consentNow)

  // #4402.1 — « Ajouter un moyen de contact » mène au champ e-mail de la fiche (plus à une modale).
  const focusEmail = () => {
    setTab('profile')
    window.setTimeout(() => document.getElementById('talent-field-email')?.focus(), 0)
  }

  const archiveToggle = () =>
    (talent.archived_at ? reactivate.mutateAsync(talentId) : archive.mutateAsync({ id: talentId, reason: null }))
      .then(() => toast.success(talent.archived_at ? t('toast.reactivated') : t('toast.archived')))
      .catch((error: Error) => toast.error(error.message || t('toast.error')))

  /** #2185.10 — « Suivi par ». `ownerUserId: null` retire l'attribution. */
  const handleSetOwner = (ownerUserId: string | null) =>
    setOwner
      .mutateAsync({ id: talentId, ownerUserId })
      .then(() => toast.success(t('toast.ownerUpdated')))
      .catch((error: Error) => toast.error(error.message || t('toast.error')))

  // #4346 — une mission « en cours ou à venir » : sans fin, ou finissant aujourd'hui ou plus tard.
  // Une mission sans fin n'en invente pas une ; ISO `YYYY-MM-DD` se compare en texte.
  const today = new Date().toISOString().slice(0, 10)
  const hasCurrentMission = (missions ?? []).some(
    mission => !mission.endsOn || Date.parse(mission.endsOn) >= Date.parse(today),
  )
  // Théo C talents-fiche.N2 — une mission en cours ou à venir dont la fin est PRÉVUE (jamais inventée).
  const hasPlannedEnd = (missions ?? []).some(
    mission => mission.endsOn && Date.parse(mission.endsOn) >= Date.parse(today),
  )
  // #4034.4 — « Ouvrir le CV » ouvre l'APERÇU du CV le plus récent ; l'onglet
  // Documents s'ouvre derrière (la liste des versions).
  const openCv = () => {
    setTab('documents')
    const latestCv = (documents ?? []).find(document => document.kind === 'cv') ?? documents?.[0]
    if (latestCv) setPreviewDocumentId(latestCv.id)
  }

  return (
    <CustomerPage
      titleInScreen
      /* Le titre de la fiche n'est pas plus autorisé que la ligne du vivier à
         présenter le nom du FICHIER comme une identité (`talentName.ts`). */
      pageTitle={talentName}
      /* #4576 — la nature (« Consultant » / « Candidat ») est dite UNE fois, dans la ligne d'identité de
         l'en-tête (`TalentDetailHeader`) : plus de puce isolée tout en haut de la page. */
    >
      <Box display="flex" className="items-center justify-between gap-2 py-2">
        <Link to="/consultants">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-4" aria-hidden />
            {t('detail.backToPool')}
          </Button>
        </Link>
        {/* #4576.4 — « Comment travailler ici ? » rejoint les gestes de la fiche (#4654) au lieu de flotter seul dans
            l'en-tête de la coque : la fiche nomme son titre elle-même, donc elle pose l'emplacement du lien dans SA rangée. */}
        <Box display="flex" data-talent-actions-row="" className="items-center gap-3">
          <ScreenGuideSlot />
          {/* #4346 — les gestes retirés de l'en-tête (modifier, archiver, CV, où placer). */}
          <TalentMoreActions
            talentId={talentId}
            talentName={talentName}
            archived={Boolean(talent.archived_at)}
            archiveBusy={archive.isPending || reactivate.isPending}
            hasCv={row?.hasCv === true || hasCvText}
            onArchiveToggle={archiveToggle}
            onOpenCv={openCv}
          />
        </Box>
      </Box>

      <ConsultantImportMark consultantId={talentId} />
      <TalentDetailHeader
        talent={talent}
        row={row}
        rowIsLoading={rowIsLoading}
        talentName={talentName}
        // #4346 — « Voir la mission » seulement si une mission court ou vient.
        hasCurrentMission={hasCurrentMission}
        // #2185.17 — mène à l'onglet qui porte déjà la donnée, jamais une seconde surface.
        onViewMissions={() => setTab('missions')}
        onAddToNeed={() => setAddingToNeed(true)}
        onPrepareMessage={() => {
          setSuggestedMessageBody(undefined)
          setPreparingMessage(true)
        }}
        ownerCandidates={members.map(m => ({ userId: m.userId, fullName: m.fullName, email: m.email }))}
        onSetOwner={handleSetOwner}
        settingOwner={setOwner.isPending}
      />
      {/* Théo C talents-fiche.N1 — deux objectifs distincts : un besoin connu, ou des comptes compatibles. */}
      <TalentObjectives talentId={talentId} onCompareNeeds={() => setAddingToNeed(true)} />

      {/* Le bandeau du §7.3 : « Le consentement de Sophie expire le 3
          septembre. Sans renouvellement, sa fiche sera purgée. » Au-dessus des
          onglets, parce qu'une échéance qu'il faut aller chercher n'est pas
          une alerte. */}
      {consentStatus === 'expiring' && consentDaysLeft !== null ? (
        <Card className="mt-3 rounded-card border-0 border-l-2 border-[var(--bellum-warning)] bg-[var(--bellum-surface-2)] p-3 shadow-none">
          <Text size="sm">
            {t('consent.banner.expiring', {
              name: talentName,
              days: consentDaysLeft,
            })}
          </Text>
        </Card>
      ) : consentStatus === 'expired' ? (
        <Card className="mt-3 rounded-card border-0 border-l-2 border-[var(--bellum-warning)] bg-[var(--bellum-surface-2)] p-3 shadow-none">
          <Text size="sm">{t('consent.banner.expired', { name: talentName })}</Text>
        </Card>
      ) : null}

      {talent.archived_at ? (
        <Card className="mt-3 rounded-card border-0 border-l-2 border-[var(--bellum-warning)] bg-[var(--bellum-surface-2)] p-3 shadow-none">
          <Text size="sm">{t('detail.archivedBanner', { date: formatDate(talent.archived_at) ?? '' })}</Text>
        </Card>
      ) : null}

      {/* #4401.1 — une partie illisible du CV importé est NOMMÉE : le reste de la fiche se lit, rien n'est inventé à sa place. */}
      {talent.unreadable_fields && talent.unreadable_fields.length > 0 ? (
        <Card
          className="mt-3 rounded-card border-0 border-l-2 border-[var(--bellum-warning)] bg-[var(--bellum-surface-2)] p-3 shadow-none"
          data-testid="talent-unreadable-fields"
        >
          <Text size="sm">
            {t('detail.unreadable', {
              fields: talent.unreadable_fields
                .map(field => t(`detail.unreadableFields.${field}`, { defaultValue: field }))
                .join(', '),
            })}
          </Text>
        </Card>
      ) : null}

      <nav aria-label={t('detail.tabsAria')} className="mt-4">
        <TabNav
          tabs={tabs}
          activeTab={activeGroup}
          onTabChange={key => {
            trackTabOpened(TALENT_SCREEN, key)
            setTab(key as TalentTab)
          }}
          size="sm"
        />
      </nav>

      <div className="mt-3">
        {activeGroup === 'profile' ? (
          <Panel label={t('detail.tabs.profile')}>
            {/* Refonte Théo (maquette `c/talents-fiche`, onglet Profil) — dans SON ordre :
                la ligne de disponibilité (la déclaration gagne, le planning dessous,
                « Actualiser »), deux colonnes (Expertise & qualification | Score
                consultant en clair), puis Missions et engagements. Rien n'est retiré :
                coordonnées, tarifs, rapprochement inverse et identité suivent. */}
            {row ? (
              <div
                data-testid="talent-availability-line"
                className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <TalentAvailabilityBadge row={row} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById('talent-rates')?.scrollIntoView({ block: 'start' })}
                >
                  {t('detail.refreshAvailability')}
                </Button>
              </div>
            ) : null}
            {/* #4346 — écrire / appeler / ajouter un moyen de contact : ici, avec les coordonnées. */}
            <div className="mb-3">
              <TalentContactActions talent={talent} talentName={talentName} onAddContact={focusEmail} />
            </div>
            <ConsultantEngagementBanner consultantId={talentId} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel label={t('detail.sections.expertise')}>
                <div className="flex min-w-0 flex-col gap-3">
                  {/* « Modifier » de la maquette : le bouton des compétences, juste dessous (GA-26, un seul). */}
                  <Text element="h2" size="base" weight="semibold">
                    {t('detail.sections.expertise')}
                  </Text>
                  <TalentProfileTab talent={talent} />
                  <Card className="p-4">
                    {/* Le geste d'édition est en TÊTE de l'onglet, et non seulement
                      sous la liste vide : préciser le niveau d'une compétence déjà
                      posée est le cas le plus fréquent, pas le premier ajout. */}
                    <Box display="flex" className="mb-3 items-center justify-between gap-2">
                      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                        {t('detail.skillsIntro')}
                      </Text>
                      <Button variant="outline" size="sm" onClick={() => setEditingSkills(true)}>
                        <Pencil className="mr-1.5 size-3.5" aria-hidden />
                        {t('detail.editSkills')}
                      </Button>
                    </Box>
                    {(skills ?? []).length === 0 ? (
                      <Text size="sm" className="text-[var(--bellum-text-muted)]">
                        {t('detail.empty.skills')}
                      </Text>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {(skills ?? []).map(skill => (
                          <li key={skill.id} className="flex flex-wrap items-center gap-2">
                            {/* Le libellé écrit, jamais la famille du référentiel :
                              « PostgreSQL » ne doit pas s'afficher « sql » sur la
                              fiche de quelqu'un qui a écrit PostgreSQL. */}
                            <Text size="sm" weight="medium" title={skill.skill}>
                              {skill.rawLabel ?? skill.skill}
                            </Text>
                            <Badge variant="outline">{t(`skills.levels.${skill.level}`)}</Badge>
                            {/* La SOURCE est affichée au même niveau que le niveau :
                              « déclaré » et « prouvé en mission » ne se présentent
                              jamais de la même façon devant un client. */}
                            <Badge variant={skill.source === 'mission' ? 'success' : 'outline'}>
                              {t(`skills.sources.${skill.source}`)}
                            </Badge>
                            {/* #2185.35 — les ANNÉES ne s'affichent QUE si prouvées
                              (mission ou entretien) : un chiffre sur une simple
                              déclaration se lirait comme un fait vérifié qu'il
                              n'est pas — même prédicat que le moteur de matching
                              (`isSkillSourceProven`, GA-26). */}
                            {skill.years != null && isSkillSourceProven(skill.source) ? (
                              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                                {t('detail.skillYears', { count: skill.years })}
                              </Text>
                            ) : null}
                            {/* #2185.36 — une compétence de 2014 n'est pas une
                              compétence d'aujourd'hui, et le client le demandera.
                              `null` reste silencieux : rien n'invente une dernière
                              pratique que personne n'a datée. */}
                            {skill.lastUsedYear != null ? (
                              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                                {t('detail.skillLastUsed', { year: skill.lastUsedYear })}
                              </Text>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <TalentTabFields talent={talent} tab="skills" />
                </div>
              </Panel>
              <div className="flex min-w-0 flex-col gap-4">
                <Panel label={t('detail.sections.score')}>{row ? <TalentScorePanel row={row} /> : null}</Panel>
                <TalentTabFields talent={talent} tab="profile" managerCandidates={pool ?? []} />
                <ImportedExtraCard extra={talent.extra} />
              </div>
            </div>
            {hasPlannedEnd ? (
              <Text size="sm" className="mt-4 text-[var(--bellum-text-secondary)]">
                {t('detail.plannedEndNote')}
              </Text>
            ) : null}
            <div className="mt-4 flex flex-col gap-4">
              <Panel label={t('detail.sections.missions')}>
                <Text element="h2" size="base" weight="semibold" className="mb-2">
                  {t('detail.sections.missions')}
                </Text>
                <Card className="p-4">
                  {(missions ?? []).length === 0 ? (
                    <Text size="sm" className="text-[var(--bellum-text-muted)]">
                      {t('detail.empty.missions')}
                    </Text>
                  ) : (
                    <ul className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
                      {(missions ?? []).map(mission => (
                        <li key={mission.missionId} className="flex flex-wrap items-center gap-2 py-3">
                          <Text size="sm" weight="medium">
                            {mission.accountName ?? mission.label ?? t('row.unknownClient')}
                          </Text>
                          <Text size="xs" className="text-[var(--bellum-text-muted)]">
                            {/* Une mission sans fin n'en invente pas une. */}
                            {formatDate(mission.startsOn) ?? t('detail.notProvided')} →{' '}
                            {formatDate(mission.endsOn) ?? t('row.noEndDate')}
                          </Text>
                          <Badge variant="outline">{t('detail.load', { percent: mission.loadPercent })}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </Panel>
              <div id="talent-rates">
                <Panel label={t('detail.tabs.rates')}>
                  <div className="flex flex-col gap-4">
                    <TalentTabFields talent={talent} tab="rates" />
                    <TalentRatesTab talent={talent} onPrepareRevalidation={prepareRevalidationMessage} />
                    {/* Le matching INVERSE vit dans « Disponibilité & TJM »
                        (§5.2 N3) : c'est là qu'on regarde quand quelqu'un se
                        libère. */}
                    <InverseMatchPanel consultantId={talent.id} />
                  </div>
                </Panel>
              </div>
            </div>
            <div className="mt-4">
              <Panel label={t('detail.tabs.identity')}>
                <TalentIdentityPanel talentId={talentId} />
              </Panel>
            </div>
          </Panel>
        ) : null}

        {activeGroup === 'documents' ? (
          <Panel label={t('detail.tabs.documents')}>
            {/* Théo C talents-fiche.A3 — la revue du CV vit dans Documents (plus un onglet) : accepter / rejeter chaque champ lu. */}
            {needsReview || hasCvText ? (
              <div className="mb-4">
                <Panel label={t(needsReview ? 'detail.tabs.review' : 'detail.tabs.reviewCorrect')}>
                  <Text size="sm" className="mb-2 text-[var(--bellum-text-secondary)]">
                    {t('parse.intro')}
                  </Text>
                  <CvReviewPanel
                    talentId={talentId}
                    cvText={talent.cv_text ?? null}
                    onDone={() => setTab('profile')}
                    onPlace={() => void navigate({ to: '/consultants/$id/reverse-market', params: { id: talentId } })}
                  />
                </Panel>
              </div>
            ) : null}
            {/* #2327.1 / #2327.17 — DÉFAUT recette 17/09 (passage 7) : cet
                onglet n'avait AUCUNE zone de dépôt de CV — `CvDropZone`
                existait, mais `ConsultantFormDialog.tsx` ne la monte qu'en
                CRÉATION. Ici la fiche est déjà connue : `attachToTalentId`
                fait rejoindre le dépôt directement comme une nouvelle
                version, toujours visible (0 document comme N documents),
                sans détour par la modale d'édition. */}
            <CvDropZone attachToTalentId={talentId} />
            <TalentTabFields talent={talent} tab="documents" />
            <Card className="p-4">
              {(documents ?? []).length === 0 ? (
                // Un vide qui DIT pourquoi, et qui propose le geste suivant :
                // le CV source se colle dans la fiche (`cv_text`), et c'est de
                // lui que dépend l'onglet « Dossier ».
                <Box display="flex" className="flex-col items-start gap-2">
                  <Text size="sm" className="text-[var(--bellum-text-muted)]">
                    {t('detail.empty.documents')}
                  </Text>
                </Box>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {(documents ?? []).map(document => (
                    <li key={document.id} className="flex flex-wrap items-center gap-2">
                      {/* #4034.4 — le nom OUVRE l'aperçu : un bouton (tabulable,
                          nommé, cible ≥ 44 px), jamais un texte inerte. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 gap-1.5 px-2"
                        aria-label={t('detail.documentPreview.open', { name: document.filename })}
                        onClick={() => setPreviewDocumentId(document.id)}
                      >
                        <FileText className="size-4" aria-hidden />
                        <span className="underline-offset-2 hover:underline">{document.filename}</span>
                      </Button>
                      {/* #2185.38 — le type du document, une certification
                          comprise (`TALENT_DOCUMENT_KINDS`) : le champ existait
                          en base sans jamais se distinguer d'un CV ou d'un
                          dossier quelconque à l'écran. */}
                      <Badge variant="outline">{t(`detail.documentKind.${document.kind}`)}</Badge>
                      <Text size="xs" className="text-[var(--bellum-text-muted)]">
                        {document.extractedChars === 0
                          ? t('detail.documentNoText')
                          : t('detail.documentChars', { count: document.extractedChars })}
                      </Text>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <TalentDocumentPreview
              talentId={talentId}
              document={previewDocument}
              open={previewDocument !== null}
              onOpenChange={open => {
                if (!open) setPreviewDocumentId(null)
              }}
            />
            {/* #2185.22/.24/.25 — « Dossier » (CV Studio) DÉPLACÉ ici :
                regroupement en six familles, brief nuit du 26/09/2026. */}
            <div className="mt-4">
              <Panel label={t('detail.tabs.studio')}>
                <CvStudioPanel talentId={talentId} />
              </Panel>
            </div>
          </Panel>
        ) : null}

        {activeGroup === 'delivery' ? (
          <Panel label={t('detail.tabs.delivery')}>
            {/* #2185.22/.24/.25 — « Disponibilité & TJM », « Positionnements »
                et « Missions » DÉPLACÉS ici, chacun sa RÉGION nommée : trois
                questions distinctes (à quel prix ? sur quels besoins ? sur
                quelle mission ?) qui restent atteignables sous leur ancien nom,
                sans être trois boutons de premier niveau. */}
            <div className="flex flex-col gap-4">
              <Panel label={t('detail.tabs.submissions')}>
                {/* #2185.44 — le Reverse Market restait une page séparée, liée
                depuis l'entête (#2152.46) mais jamais depuis l'onglet
                Opportunités : un lien, pas une seconde surface de
                classement — le rapprochement inverse n'a qu'un seul
                endroit (`ReverseMarketPage`). */}
                <Card className="mb-3 flex flex-wrap items-center justify-between gap-2 p-4">
                  <Box className="min-w-0">
                    <Text size="sm" weight="medium">
                      {t('reverseMarket.fromOpportunities.title')}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('reverseMarket.fromOpportunities.subtitle')}
                    </Text>
                  </Box>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <Link to="/consultants/$id/reverse-market" params={{ id: talentId }}>
                      <Compass className="size-4" aria-hidden />
                      {t('reverseMarket.fromOpportunities.cta')}
                    </Link>
                  </Button>
                </Card>

                <Card className="p-4">
                  {(submissions?.items ?? []).length === 0 ? (
                    // « Jamais positionné » est un CONSTAT, pas une explication :
                    // le vide dit désormais ce qu'il signifie, et mène au geste qui
                    // le résout.
                    <Box display="flex" className="flex-col items-start gap-2">
                      <Text size="sm" className="text-[var(--bellum-text-muted)]">
                        {t('detail.empty.submissions')}
                      </Text>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab('rates')}>
                        <Sparkles className="size-4" aria-hidden />
                        {t('detail.empty.submissionsAction')}
                      </Button>
                    </Box>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {(submissions?.items ?? []).map(submission => (
                        <li key={submission.id} className="flex flex-wrap items-center gap-2">
                          <Text size="sm">{submission.accountName ?? submission.projectLabel ?? submission.id}</Text>
                          <Badge variant="outline">{t(`detail.submissionStage.${submission.stage}`)}</Badge>
                          {submission.outcomeReason ? (
                            <Text size="xs" className="text-[var(--bellum-text-muted)]">
                              {t(`detail.submissionReason.${submission.outcomeReason}`)}
                            </Text>
                          ) : null}
                          {/* #2185.42 — LE RETOUR CLIENT, structuré sur plusieurs
                          axes (`FEEDBACK_AXES`, `packages/contracts`) — pas
                          seulement le court `outcomeReason` ci-dessus. Le
                          MÊME dialogue que `SubmissionsPanel.tsx`, jamais une
                          seconde écriture de retour. Fermé tant que le
                          profil n'a pas été PRÉSENTÉ : noter un retour avant
                          ferait noter un échange qui n'a pas eu lieu. */}
                          {submission.stage !== 'shortlisted' ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="px-0"
                              onClick={() => setFeedbackSubmissionId(submission.id)}
                            >
                              {t('submissions:feedback.open')}
                            </Button>
                          ) : null}
                          {/* Théo C talents-fiche.A8 — « Brief et soutenance » : déterministe, sans modèle, par positionnement. */}
                          <Button
                            variant="ghost"
                            size="xs"
                            className="px-0"
                            onClick={() => setBriefProjectId(submission.projectId)}
                          >
                            {t('detail.briefOpen')}
                          </Button>
                          {/* #2185.42 — le retour COMPLET du client, quand il a été
                          enregistré : `outcomeReason` ci-dessus reste une
                          raison courte, celui-ci porte les axes réels. */}
                          <SubmissionFeedbackSummary submissionId={submission.id} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* #2185.50 — « Ajouter à un besoin » : positionner CE talent
                  sur un besoin ouvert, sans quitter sa propre fiche. */}
                  <AddToNeedAction talentId={talentId} />
                </Card>
              </Panel>
            </div>
          </Panel>
        ) : null}

        {activeGroup === 'notes' ? (
          <Panel label={t('detail.tabs.notes')}>
            {/* Les notes polymorphes couvraient déjà `consultant` côté serveur ;
                il ne manquait que le panneau. */}
            <TalentTabFields talent={talent} tab="notes" />
            <NotesPanel entityType="consultant" entityId={talentId} currentUserId={user?.id} />
          </Panel>
        ) : null}

        {activeGroup === 'consent' ? (
          <Panel label={t('detail.tabs.consent')}>
            <TalentTabFields talent={talent} tab="consent" />
            <TalentConsentTab talent={talent} />
          </Panel>
        ) : null}

        {/* #4198 (L7) — les objets liés du consultant : missions, candidatures. */}
        <PageRecordLinks kind="consultant" id={talent.id} />
      </div>

      {/* Le MÊME panneau que celui de la ligne du vivier, pas une seconde
          surface : deux écrans qui écriraient le niveau d'une compétence
          donneraient deux vérités, et la loi 1 du tome 7 les interdit. */}
      <TalentSkillsDialog talent={talent} open={editingSkills} onOpenChange={setEditingSkills} />
      {/* #2185.50 — le MÊME geste, le MÊME écrit (`useCreateSubmission`) que
          `ConsultantMatchPanel` sur la ligne du vivier. */}
      <TalentAddToNeedDialog
        talentId={talentId}
        talentName={talentName}
        open={addingToNeed}
        onOpenChange={setAddingToNeed}
      />
      {/* #2185.51 — un brouillon, jamais un envoi : distinct du moteur
          outreach (contact_id NOT NULL, séquences vivantes). */}
      <TalentPrepareMessageDialog
        talentId={talentId}
        talentName={talentName}
        open={preparingMessage}
        onOpenChange={setPreparingMessage}
        initialBody={suggestedMessageBody}
      />
      {briefProjectId ? (
        <ConsultantBriefDialog
          open
          consultantId={talentId}
          opportunityId={briefProjectId}
          onClose={() => setBriefProjectId(null)}
        />
      ) : null}
      {/* #2185.42 — le MÊME dialogue que `SubmissionsPanel.tsx`, jamais une
          seconde écriture de retour client. */}
      {feedbackSubmissionId ? (
        <SubmissionFeedbackDialog
          submissionId={feedbackSubmissionId}
          talentName={talentName}
          open
          onClose={() => setFeedbackSubmissionId(null)}
        />
      ) : null}
    </CustomerPage>
  )
}

/**
 * Le panneau d'un onglet — une RÉGION nommée par son onglet.
 *
 * `TabNav` ne rend que la barre ; le panneau est à nous. Le nommer est ce qui
 * permet à un lecteur d'écran d'annoncer où il vient d'arriver, et c'est aussi
 * ce qui rend vérifiable la règle « aucun onglet ne rend une page blanche ».
 */
/** Théo C talents-fiche — la carte de la fiche : titre de section, geste à droite, corps aéré. */
function FicheCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="rounded-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Text element="h2" size="lg" weight="semibold" className="tracking-tight">
          {title}
        </Text>
        {action}
      </div>
      {children}
    </Card>
  )
}

function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section role="region" aria-label={label}>
      {children}
    </section>
  )
}
