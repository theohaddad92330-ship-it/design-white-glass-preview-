import {
  OUTREACH_PLAYBOOK_KEYS,
  OUTREACH_SEQUENCE_TEMPLATES,
  outreachSequenceCanonicalStatusSchema,
  type OutreachPlaybookKey,
  type OutreachSequence,
  type OutreachSequenceCanonicalStatus,
  type OutreachTemplateKey,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterChips,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { Link, useLocation } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  MailPlus,
  MoreHorizontal,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useMailboxStatus } from '@/features/mailbox/api'
import { useOutreachSequences } from '../hooks/useOutreachSequences'
import { useBlockedMessageContactIds } from '../hooks/useOutreachMessages'
import { CapabilityBanner } from '@/components/access/CapabilityBanner'
import { useRouteAccess } from '@/components/access/useRouteAccess'
import { formatDate } from '@/lib/locale'
import { campaignFromSearch, libraryFromSearch, openedSequenceIdFromSearch } from '../campaign-prefill'
import {
  prospectingThreadFromSearch,
  prospectingThreadNextLink,
} from '@/features/prospecting-session/lib/prospecting-thread'
import { campaignOptions } from '../campaign-label'
import { vacationOf } from '../step-channels'
import { groupByAudience, type AudienceRow } from '../sequences-audience'
import {
  NO_FILTERS,
  activeFilterCount,
  campaignSummary,
  filterOptions,
  filterSequences,
  type SequenceListFilters,
} from '../sequences-list-filters'
import { useAutomationRules } from '@/features/automations/api'
import { SequenceMultiSelect } from './SequenceMultiSelect'
import { SequencesPageHead } from './SequencesPageHead'
import type { CampaignAudience, CampaignDropped } from '../campaign-audience'
import { useCampaignAudience } from '../hooks/useCampaignAudience'
import { ChannelsBlock } from './ChannelsBlock'
import { DelegationBlock } from './DelegationBlock'
import { MandateScopesBlock } from './MandateScopesBlock'
import { DeliverabilityBlock } from './DeliverabilityBlock'
import { ProspectingSessionMetricsBlock } from './ProspectingSessionMetricsBlock'
import { OutreachApprovalCenter } from './OutreachApprovalCenter'
import { AudienceBuilderBlock } from './AudienceBuilderBlock'
import { CreateSequenceDialog } from './CreateSequenceDialog'
import { PlaybookFromUrl } from './PlaybookFromUrl'
import { SequenceLibraryView } from './SequenceLibraryView'
import { PlaybookWizardDialog } from './PlaybookWizardDialog'
import { useSequenceTemplates } from '../hooks/useSequenceLibrary'
import { SequenceLibraryBlock } from './SequenceLibraryBlock'
import { SequenceDetailSheet } from './SequenceDetailSheet'
import { SequenceStatusBadge } from './SequenceStatusBadge'
import { SequenceStepStats } from './SequenceStepStats'
import { VacationBanner } from './VacationBanner'
import { SequenceStarters } from './SequenceStarters'
import { sequencesLauraContext } from './sequences-laura-context'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import {
  SEQUENCE_BUCKETS,
  bucketCounts,
  campaignModeLabel,
  displayStatusOf,
  filterByBucket,
  progressOf,
  type SequenceBucket,
} from '../sequences-cockpit'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import type { journeyLaunchRequest } from '../sequence-journey'
import {
  clearJourneyDraft,
  initialJourney,
  journeyFromSearch,
  loadJourneyDraft,
  saveJourneyDraft,
  type JourneyContact,
  type JourneyState,
} from '../sequence-journey'
import { SequenceJourney } from './SequenceJourney'

const HEAD = 'text-xs font-medium text-[var(--bellum-text-muted)] whitespace-nowrap'
const CELL = 'py-2 align-middle'

/**
 * L'ÉCRAN SÉQUENCES — un cockpit, plus une table technique (#1509→#1515).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL ÉTAIT, ET CE QUE LES SEPT RETOURS DISENT DE LUI
 * ─────────────────────────────────────────────────────────────────────────────
 * Une table de huit colonnes, en LECTURE SEULE. On y voyait qu'une relance
 * était due, et il n'existait aucun geste : pas de bouton pour créer, pas de
 * clic sur la ligne, pas de pause, pas de reprise. Tout ce moteur existait —
 * dans la fiche contact, à trois clics et deux écrans de là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE COMPTEURS FILTRENT, ET NE PEUVENT PAS MENTIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `bucketsOf` est la SEULE fonction qui décide dans quel seau tombe une
 * séquence : le compteur additionne ce qu'elle rend, le filtre garde ce qu'elle
 * rend. C'est la parade au défaut « un compteur JUSTE peut promettre un filtre
 * FAUX », qui ne se voit pas à l'œil — il faut compter les lignes, et un test
 * le fait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE STATUT RESTE DÉRIVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `deriveOutreachDisplayStatus`, comme avant et comme la fiche contact. Le
 * badge disait « Active » sur une séquence dont la prochaine étape était un
 * e-mail que personne ne pouvait envoyer ; ce n'est pas la base qui avait tort,
 * c'est le mot. Les dix statuts que le retour énumère sont, à un près, ceux qui
 * existent déjà.
 */
export function SequencesPage() {
  // Le contrat de route (BEL-ARCH-002) : l'envoi dépend de la messagerie.
  const access = useRouteAccess({ path: '/actions/sequences', section: 'actions', degradesWithout: ['email'] })
  const { t } = useTranslation('outreach')
  const { data: sequences, isLoading, isError } = useOutreachSequences()
  const { data: mailbox } = useMailboxStatus()
  const { data: library } = useSequenceTemplates()
  const [bucket, setBucket] = useState<SequenceBucket | null>(null)
  // Théo C sequences-bibliotheque — « Bibliothèque de modèles » / « Explorer toute la bibliothèque » : une seule
  // porte, une vue pleine sur la même route (aucune route de plus) ; « Tes séquences » ramène à la liste.
  // Théo C sequences-liste.A6 — « Mode vacances… » vit dans le menu « ⋯ » de l'en-tête.
  const [vacationOpen, setVacationOpen] = useState(false)
  // « Choisir des contacts » ouvre le repli qui porte le constructeur d'audience, les canaux et la délégation.
  const [moreOpen, setMoreOpen] = useState(false)
  // Théo C sequences-liste (onze états dans le filtre) — un badge par ligne, le filtre porte la liste complète.
  // Théo C sequences-liste + décision Louis 23/10 — TOUS les filtres à choix multiple : l'état en tête, la campagne,
  // le modèle et le compte sous « Plus de filtres » (notre maquette : f-statut · f-modele · f-compte · f-plus).
  const [filters, setFilters] = useState<SequenceListFilters>(NO_FILTERS)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  // Lot L-C (#4166) — « Partir d'un modèle » : un gabarit d'avant (rangé par situation) ouvre
  // la MÊME fenêtre de création, présélectionné ; l'assistant en 4 questions a la sienne.
  const [libraryTemplate, setLibraryTemplate] = useState<OutreachTemplateKey | null>(null)
  const [wizard, setWizard] = useState<{ open: boolean; playbook?: OutreachPlaybookKey }>({ open: false })
  const [opened, setOpened] = useState<OutreachSequence | null>(null)
  // #2974 (lot V39) — la liste rendue par le constructeur d'audience, remise
  // telle quelle à la fenêtre de création (une séquence par personne, c74).
  const [builtAudience, setBuiltAudience] = useState<
    Parameters<Parameters<typeof AudienceBuilderBlock>[0]['onPrepare']>[0] | null
  >(null)

  /**
   * #1935.25 — LA CAMPAGNE PRÉPARÉE PAR LAURA, LUE DEPUIS L'URL.
   *
   * `campaignFromSearch` existait, juste et testé, et personne ne l'appelait :
   * le chat naviguait ici avec l'audience et l'objectif en paramètres, et cet
   * écran s'ouvrait VIERGE — tout le travail de préparation perdu au dernier
   * maillon. C'est ici que la chaîne se referme.
   *
   * Le même patron que `Discover` : on lit `location.search` plutôt que
   * d'imposer un `validateSearch` à la route, qui JETTERAIT les paramètres
   * qu'il ne connaît pas. Aucune navigation n'est déclenchée en retour — pas de
   * `<Navigate>` (GA-27), pas de réécriture d'URL : recharger la page rouvre
   * exactement la même campagne.
   */
  const location = useLocation()
  // #4492 — `?vue=modeles` ouvre « Modèles de séquence » (la bibliothèque) : lue, jamais réécrite (GA-27). Le lien
  // d'un autre écran vers la page déjà ouverte, lui, bascule la vue : on suit la VALEUR de l'URL, pas chaque rendu.
  const libraryRequested = libraryFromSearch(location.search as Record<string, unknown>)
  const [view, setView] = useState<'list' | 'library'>(libraryRequested ? 'library' : 'list')
  useEffect(() => {
    setView(libraryRequested ? 'library' : 'list')
  }, [libraryRequested])
  /**
   * #4355.1 / #4357.1 — LE PARCOURS « CRÉER MA SÉQUENCE » (décision Louis 19/10/2026). Ouvert, il
   * REMPLACE le contenu de l'écran : un écran par étape, pas une fenêtre de plus. L'URL peut l'ouvrir
   * (`?parcours=1`, `?parcours=signal` depuis « En faire une automatisation », #4354.2) — lue une fois,
   * jamais réécrite (GA-27).
   */
  const [journey, setJourney] = useState<JourneyState | null>(() =>
    journeyFromSearch(location.search as Record<string, unknown>),
  )
  // Théo C sequences-assistant.N3 — « Quitter et conserver » : le brouillon de l'assistant, repris d'un clic.
  const [draft, setDraft] = useState<JourneyState | null>(() => loadJourneyDraft())
  // La fin d'un parcours « maintenant » : la fenêtre de création, pré-remplie, fait la dernière vérification.
  const [journeyLaunch, setJourneyLaunch] = useState<ReturnType<typeof journeyLaunchRequest> | null>(null)
  const campaign = useMemo(() => campaignFromSearch(location.search as Record<string, unknown>), [location.search])
  const campaignContactIds = useMemo(() => campaign?.contactIds ?? [], [campaign])

  // #3700 — le lien du résumé de la fiche contact ouvre LA campagne exacte. Une
  // seule ouverture par identifiant : fermer la feuille ne la rouvre pas.
  const wantedSequenceId = useMemo(
    () => openedSequenceIdFromSearch(location.search as Record<string, unknown>),
    [location.search],
  )
  const openedFromUrl = useRef<string | null>(null)
  useEffect(() => {
    if (!wantedSequenceId || openedFromUrl.current === wantedSequenceId) return
    const found = (sequences ?? []).find(sequence => sequence.id === wantedSequenceId)
    if (!found) return
    openedFromUrl.current = wantedSequenceId
    setOpened(found)
  }, [wantedSequenceId, sequences])

  /**
   * #2386.1 — LE FIL, à l'arrivée. Même patron que `campaign` ci-dessus : un
   * écran ouvert PAR le fil de prospection (`ProspectingSessionDialog`,
   * `prospecting-thread.ts`) porte son étape et son compte dans l'URL ; cet
   * écran ne fait que les LIRE pour afficher « étape suivante » vers la trace
   * CRM (`/mailbox`) — jamais une deuxième navigation automatique (GA-27).
   */
  const prospectingThread = useMemo(
    () => prospectingThreadFromSearch(location.search as Record<string, unknown>),
    [location.search],
  )
  const prospectingThreadNext = prospectingThread
    ? prospectingThreadNextLink(prospectingThread.step, prospectingThread.context)
    : null
  const audience = useCampaignAudience(campaignContactIds)
  /**
   * Le contexte n'entre dans la fenêtre que si elle a été ouverte PAR la
   * campagne : le bouton « Créer une séquence » de l'entête garde son sens —
   * une séquence vierge — même sur un écran ouvert depuis le chat.
   */
  const [createFromCampaign, setCreateFromCampaign] = useState(false)
  const campaignReady = campaign !== null && audience.pending === 0 && audience.eligible.length > 0
  const openCampaign = () => {
    setCreateFromCampaign(true)
    setCreateOpen(true)
  }

  // Une seule ouverture automatique : refermer la fenêtre ne doit pas la
  // rouvrir au rendu suivant. Et tant qu'une fiche est en lecture, on n'ouvre
  // RIEN — une audience partielle n'est pas l'audience annoncée.
  const campaignOpened = useRef(false)
  useEffect(() => {
    if (campaignOpened.current || !campaignReady) return
    campaignOpened.current = true
    openCampaign()
  }, [campaignReady])

  /**
   * #2382.1/.2/.3 — RÉFUTÉ en prod le 23/09 (2e recette) : `GET /outreach/
   * sequences` rattrape désormais, côté serveur, le message canonique d'une
   * séquence née avant que ce lien n'existe (`OutreachController.list`) — mais
   * cette liste et le centre d'approbation lisent DEUX requêtes indépendantes,
   * parties dans le MÊME rendu. Sans ce geste, la requête `messages` gagnerait
   * parfois la course et repartirait vide AVANT que le rattrapage n'ait eu le
   * temps d'écrire — l'écran resterait alors muet jusqu'au prochain rechargement
   * complet. Dès que les séquences répondent, on force donc un second passage
   * sur les messages et les appels — jamais sur `outreachKeys.list` elle-même,
   * qui rebouclerait sans fin sur son propre changement.
   */
  const qc = useQueryClient()
  useEffect(() => {
    if (!sequences || sequences.length === 0) return
    void qc.invalidateQueries({ queryKey: ['outreach', 'messages'] })
    void qc.invalidateQueries({ queryKey: ['outreach', 'call-tasks'] })
  }, [sequences, qc])

  const rows = useMemo(() => sequences ?? [], [sequences])
  // #4426.7 — une campagne importée est un MODÈLE de la bibliothèque, pas une séquence (une séquence naît quand on
  // l'applique à un contact). Sans séquence, la bibliothèque sort du repli : sinon l'écran dit « aucune séquence »
  // alors que les campagnes importées existent. Un seul rendu à la fois (GA-26).
  // Même avec des séquences : replié derrière « Plus d'options », le bloc rendait les campagnes importées
  // invisibles dès qu'une seule séquence existait (recette 23/10 : « 1 séquence » pour 9 campagnes).
  const hasImportedCampaigns = (library?.length ?? 0) > 0
  const libraryOutside = !isLoading && !isError && hasImportedCampaigns
  // L'horloge est prise UNE fois par rendu et passée partout : deux `new Date()`
  // à deux endroits du même écran peuvent tomber de part et d'autre de minuit,
  // et le compteur cesserait alors d'égaler sa liste.
  const now = useMemo(() => new Date(), [rows])
  // #2877 — « bloqué » ne se définit qu'une fois : ici comme dans l'onglet du centre d'approbation.
  const blockedContactIds = useBlockedMessageContactIds()
  const counts = useMemo(() => bucketCounts(rows, now, blockedContactIds), [rows, now, blockedContactIds])
  /**
   * #2203.32 → .38 / #2153.29 — LE FILTRE DE CAMPAGNE (arbitrage de Louis,
   * 16/09/2026).
   *
   * « J'ai lancé une campagne sur 12 contacts » n'avait aucune surface : douze
   * lignes qui ne se savaient pas parentes. Elles partagent maintenant une
   * ÉTIQUETTE, et ce tableau EST le tableau d'audience — une ligne par
   * personne, avec son étape, son échéance, sa réponse. Aucun objet
   * « campagne » n'a été créé : la question « qui gagne quand une séquence est
   * modifiée seule » ne se pose donc pas, et « retirer ce contact » reste
   * « annuler UNE des séquences ».
   *
   * Les deux filtres se COMPOSENT : « réponses reçues, dans cette campagne »
   * est la question qu'on pose vraiment.
   */
  const campaigns = useMemo(() => campaignOptions(rows), [rows])
  const options = useMemo(() => filterOptions(rows), [rows])
  const hasMoreFilters = campaigns.length > 0 || options.models.length > 0 || options.accounts.length > 0
  const advancedCount = filters.campaigns.size + filters.models.size + filters.accounts.size
  const summary = useMemo(() => campaignSummary(rows, now), [rows, now])
  const visible = useMemo(
    () => filterSequences(filterByBucket(rows, bucket, now, blockedContactIds), filters, now),
    [rows, bucket, now, blockedContactIds, filters],
  )
  // Sous un filtre de campagne, une ligne PAR PERSONNE (le tableau d'audience) ; sinon une ligne par audience.
  const audienceRows = useMemo<AudienceRow[]>(
    () =>
      filters.campaigns.size > 0
        ? visible.map(sequence => ({ kind: 'single' as const, sequence }))
        : groupByAudience(visible, now),
    [visible, filters.campaigns, now],
  )

  // ⚠️ La capacité d'envoi voyage AVEC la séquence, résolue par le serveur. La
  // lecture locale ne sert qu'aux écrans sans séquence — l'état vide et le bloc
  // des canaux, où il n'y a aucune ligne à interroger.
  const canSend = mailbox?.connected === true

  // #1904 / #1904.11 — ce que l'écran déclare à Laura, dont la messagerie qui
  // manque. Une liste pas encore lue ne compte rien ; une messagerie dont
  // l'état n'est pas connu ne se dit pas « non connectée ».
  useLauraContext(
    sequencesLauraContext(t, {
      isLoading,
      total: sequences ? sequences.length : null,
      counts: sequences ? counts : null,
      mailboxConnected: mailbox ? mailbox.connected === true : null,
    }),
  )

  const startJourney = () => {
    setCreateFromCampaign(false)
    setBuiltAudience(null)
    setJourney(initialJourney())
  }
  // « Choisir des contacts » ouvre le repli du constructeur d'audience ET y mène : un repli ouvert hors de la vue
  // serait un clic qui ne fait rien à l'œil.
  const moreRef = useRef<HTMLDetailsElement | null>(null)
  const pickContacts = () => {
    setMoreOpen(true)
    requestAnimationFrame(() => moreRef.current?.scrollIntoView?.({ block: 'start' }))
  }
  // Théo C sequences-bibliotheque / -assistant — le fil « Actions › Séquences › Modèles | Créer une séquence » : la
  // vue vit sur la route de la liste ; depuis la bibliothèque, le maillon « Séquences » y ramène.
  const { t: tNav } = useTranslation('nav')
  const trail =
    journey || view === 'library'
      ? [
          { label: tNav('items.actions'), to: '/actions' },
          // Dans l'assistant, le maillon reste du TEXTE : y cliquer perdrait les réponses en cours — on en sort par
          // « Quitter et conserver » (qui range le brouillon) ou « Annuler ».
          journey
            ? { label: tNav('tabs.sequences') }
            : { label: tNav('tabs.sequences'), onClick: () => setView('list') },
          { label: journey ? t('journey.heading') : t('libraryView.crumb') },
        ]
      : undefined
  const automations = useAutomationRules()
  const automationCount = automations.data?.length ?? null

  return (
    <CustomerPage
      anchorId="sequences"
      titleInScreen
      pageTitle={t('page.title')}
      {...(trail ? { breadcrumbs: trail } : {})}
    >
      <Box className="flex w-full flex-col gap-6">
        {journey ? (
          <SequenceJourney
            initial={journey}
            onClose={() => {
              clearJourneyDraft()
              setDraft(null)
              setJourney(null)
            }}
            onSaveDraft={state => {
              saveJourneyDraft(state)
              setDraft(state)
              setJourney(null)
              toast.success(t('journey.draftSaved'))
            }}
            onLaunchManual={request => {
              clearJourneyDraft()
              setDraft(null)
              setJourney(null)
              setCreateFromCampaign(false)
              setBuiltAudience(null)
              setLibraryTemplate(null)
              setJourneyLaunch(request)
              setCreateOpen(true)
            }}
          />
        ) : view === 'library' ? (
          <SequenceLibraryView
            onBack={() => setView('list')}
            onUsePlaybook={playbook => setWizard({ open: true, playbook })}
            onUseTemplate={template => {
              setCreateFromCampaign(false)
              setLibraryTemplate(template)
              setCreateOpen(true)
            }}
            onGuide={() => setWizard({ open: true })}
          />
        ) : (
          <>
            {/* Théo C sequences-liste.R1 — `.page-head` : « Tes séquences », une phrase, [⋯] [Bibliothèque de modèles]
                [Créer une séquence]. #2456 : c'est le h1 de l'écran (la section à onglets tait celui de la coque). */}
            <SequencesPageHead
              title={t('page.heading')}
              subtitle={t('page.subtitle')}
              actions={
                <>
                  {draft ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="pointer-coarse:min-h-11"
                      onClick={() => setJourney(draft)}
                    >
                      {t('journey.resume')}
                    </Button>
                  ) : null}
                  {/* Théo C sequences-liste.A6 — « ⋯ » : le mode vacances, rare mais trouvable (il change tout l'écran). */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                        aria-label={t('page.moreActions')}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!vacationOf(rows) && !rows.some(row => row.status === 'active')}
                        onSelect={() => setVacationOpen(true)}
                      >
                        {t('multichannel.vacation.menuItem')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:min-h-11"
                    onClick={() => setView('library')}
                  >
                    <BookOpen className="size-4" aria-hidden="true" />
                    {t('page.library')}
                  </Button>
                  <Button size="sm" className="pointer-coarse:min-h-11" onClick={startJourney}>
                    <Plus className="size-4" aria-hidden="true" />
                    {t('page.create')}
                  </Button>
                </>
              }
            />

            {/* Lot L-B (#4165) / Théo C sequences-liste (Mise en page) — les BANDEAUX, en tête, sous l'en-tête : la
                pause vacances d'abord (elle change tout l'écran), puis la campagne venue de Laura (une seule à la fois,
                elle revient dès que la pause est levée), le fil de prospection et la messagerie qui manque. */}
            <VacationBanner sequences={rows} t={t} open={vacationOpen} onOpenChange={setVacationOpen} />
            {/* #1935.25 — la campagne annoncée par l'URL, et surtout ce qui en SORT : un contact écarté entre la
                proposition et le clic se NOMME, sinon il disparaît de l'audience sans que personne sache pourquoi. */}
            {campaign && !vacationOf(rows) ? (
              <CampaignBanner objective={campaign.objective} audience={audience} onResume={openCampaign} />
            ) : null}
            {prospectingThreadNext ? <ProspectingThreadBanner nextLink={prospectingThreadNext} /> : null}
            {/* #1932.5 — sans messagerie connectée, les séquences se CONSULTENT et se préparent, mais rien ne part. */}
            {/* #4426.7 — des campagnes importées existent : « aucun outil ne fournit ces données » serait faux ;
            ce qui manque, c'est la messagerie, et seulement pour l'envoi. */}
            <CapabilityBanner
              access={access}
              stillPossible={t('page.stillPossible')}
              {...(access.state === 'no_integration' && hasImportedCampaigns
                ? { title: t('page.noMailboxTitle'), description: t('page.noMailboxDescription') }
                : {})}
            />

            {/* Théo C sequences-liste.R2 / R3 — le héros « Préparer une campagne » et « Commencer avec un modèle ». */}
            <SequenceStarters
              modelCount={OUTREACH_PLAYBOOK_KEYS.length + Object.keys(OUTREACH_SEQUENCE_TEMPLATES).length}
              onStartFromScratch={startJourney}
              onUseTemplate={template => {
                setCreateFromCampaign(false)
                setLibraryTemplate(template)
                setCreateOpen(true)
              }}
              onOpenLibrary={() => setView('library')}
              onGuide={() => setWizard({ open: true })}
              onComposeByHand={() => {
                setCreateFromCampaign(false)
                setCreateOpen(true)
              }}
            />

            {/* Théo C sequences-liste.R4 — « Tes campagnes » : tête de bloc, filtres, tableau, renvoi Automatisations. */}
            <section
              aria-labelledby="sequence-campaigns-title"
              className="flex min-w-0 flex-col gap-4"
              data-testid="sequence-campaigns"
            >
              <Box className="flex flex-wrap items-center justify-between gap-4">
                <Box className="flex flex-col gap-1">
                  <Text element="h2" id="sequence-campaigns-title" size="xl" weight="semibold">
                    {t('list.title')}
                  </Text>
                  {isLoading || isError || rows.length === 0 ? null : (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]" data-testid="sequence-summary">
                      {summaryText(t, summary)}
                    </Text>
                  )}
                </Box>
                <Box className="flex flex-wrap items-center gap-2">
                  {rows.length > 0 ? (
                    <>
                      <StateFilter value={filters.states} onChange={states => setFilters(f => ({ ...f, states }))} />
                      {hasMoreFilters ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="pointer-coarse:min-h-11"
                          aria-expanded={moreFiltersOpen}
                          aria-controls="sequence-more-filters"
                          onClick={() => setMoreFiltersOpen(open => !open)}
                        >
                          <SlidersHorizontal className="size-4" aria-hidden="true" />
                          {t('list.moreFilters')}
                          {advancedCount > 0 ? <Badge variant="primary">{advancedCount}</Badge> : null}
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="pointer-coarse:min-h-11"
                    onClick={pickContacts}
                  >
                    <Users className="size-4" aria-hidden="true" />
                    {t('list.pickContacts')}
                  </Button>
                </Box>
              </Box>

              {moreFiltersOpen && hasMoreFilters ? (
                <Box
                  id="sequence-more-filters"
                  data-testid="sequence-more-filters"
                  className="flex flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4"
                >
                  {/* #2203.32 → .38 — les campagnes présentes : rien ne s'affiche tant qu'aucune séquence ne porte
                      d'étiquette (un filtre vide se lit comme une fonction cassée). */}
                  {campaigns.length > 0 ? (
                    <FilterChips
                      multiple
                      legend={t('campaignFilter.label')}
                      ariaLabel={t('campaignFilter.label')}
                      options={campaigns.map(option => ({
                        value: option.label,
                        label: option.label,
                        count: option.count,
                      }))}
                      values={[...filters.campaigns]}
                      onToggle={value => setFilters(f => ({ ...f, campaigns: toggled(f.campaigns, value) }))}
                      size="sm"
                    />
                  ) : null}
                  {options.models.length > 0 ? (
                    <FilterChips
                      multiple
                      legend={t('list.modelFilter')}
                      ariaLabel={t('list.modelFilter')}
                      options={options.models}
                      values={[...filters.models]}
                      onToggle={value => setFilters(f => ({ ...f, models: toggled(f.models, value) }))}
                      size="sm"
                    />
                  ) : null}
                  {options.accounts.length > 0 ? (
                    <FilterChips
                      multiple
                      legend={t('list.accountFilter')}
                      ariaLabel={t('list.accountFilter')}
                      options={options.accounts}
                      values={[...filters.accounts]}
                      onToggle={value => setFilters(f => ({ ...f, accounts: toggled(f.accounts, value) }))}
                      size="sm"
                    />
                  ) : null}
                  {activeFilterCount(filters) > 0 ? (
                    <Box>
                      <button
                        type="button"
                        onClick={() => setFilters(NO_FILTERS)}
                        className="rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                      >
                        {t('list.clearFilters')}
                      </button>
                    </Box>
                  ) : null}
                </Box>
              ) : null}

              {isLoading || isError || rows.length === 0 ? null : (
                // Rien ne se perd (Louis 22/10) — les chiffres (actives · dues aujourd'hui · réponses · bloquées) restent
                // sur UNE ligne discrète, et chacun filtre toujours la liste.
                <Box className="flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="sequence-figures">
                  {SEQUENCE_BUCKETS.map(key => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={bucket === key}
                      onClick={() => setBucket(bucket === key ? null : key)}
                      className={cn(
                        'inline-flex items-baseline gap-1.5 rounded-md py-1 text-xs text-[var(--bellum-text-secondary)] underline-offset-2 hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center',
                        bucket === key && 'font-semibold text-[var(--bellum-text-accent)] underline',
                      )}
                    >
                      <span>{t(`kpi.${key}`)}</span>
                      <span className="font-semibold text-[var(--bellum-text-primary)]">{counts[key]}</span>
                    </button>
                  ))}
                  {bucket ? (
                    <button
                      type="button"
                      onClick={() => setBucket(null)}
                      className="rounded-md py-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11"
                    >
                      {t('kpi.clear')}
                    </button>
                  ) : null}
                </Box>
              )}

              {/* Lot L-B — les stats PAR ÉTAPE des campagnes filtrées (préparé · fait · répondu · RDV) ; « — » quand une
                  valeur n'est pas mesurée. */}
              {filters.campaigns.size > 0 ? (
                <SequenceStepStats
                  sequences={rows.filter(row => filters.campaigns.has(row.campaign_label?.trim() ?? ''))}
                  t={t}
                />
              ) : null}

              {isLoading ? (
                <Text size="sm" className="text-[var(--bellum-text-muted)]">
                  {t('page.loading')}
                </Text>
              ) : isError ? (
                // #3666.k — une lecture en échec n'est pas « aucune séquence ».
                <QueryLoadError />
              ) : rows.length === 0 ? (
                // Deux causes, deux gestes : la porte SUIT la cause. ⚠️ PAS de « Créer une séquence » ici : le bouton
                // est dans l'en-tête, deux centimètres plus haut (le répéter serait la même chose deux fois, GA-26).
                <EmptyState
                  size="md"
                  align="center"
                  icon={<MailPlus className="h-10 w-10" />}
                  title={t('page.empty.title')}
                  description={canSend ? t('page.empty.description') : t('page.empty.noIntegration')}
                  action={
                    <Button asChild size="sm" variant="outline">
                      {canSend ? (
                        <Link to="/contacts">{t('page.empty.cta')}</Link>
                      ) : (
                        <Link to="/integrations">{t('page.empty.ctaConnect')}</Link>
                      )}
                    </Button>
                  }
                />
              ) : audienceRows.length === 0 ? (
                <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="sequence-no-match">
                  {t('list.noMatch')}
                </Text>
              ) : (
                // `.table-wrap` — le tableau dans un cadre bordé, arrondi ; il défile seul en largeur sur mobile.
                <Box
                  className="overflow-x-auto overscroll-x-contain rounded-card border border-[var(--bellum-border)]"
                  data-testid="sequence-table"
                >
                  <Table className="min-w-[42rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className={HEAD}>{t('columns.sequence')}</TableHead>
                        <TableHead className={HEAD}>{t('columns.audience')}</TableHead>
                        <TableHead className={HEAD}>{t('columns.stepCount')}</TableHead>
                        <TableHead className={HEAD}>{t('columns.state')}</TableHead>
                        <TableHead className="w-12">
                          <span className="sr-only">{t('columns.open')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {audienceRows.map(row =>
                        row.kind === 'group' ? (
                          <GroupRow key={`g-${row.label}`} row={row} now={now} />
                        ) : (
                          <SequenceRow key={row.sequence.id} sequence={row.sequence} now={now} />
                        ),
                      )}
                    </TableBody>
                  </Table>
                </Box>
              )}
              {libraryOutside ? (
                <Box className="flex flex-col gap-2">
                  <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                    {t('page.importedCampaigns')}
                  </Text>
                  <SequenceLibraryBlock />
                </Box>
              ) : null}

              {/* Théo C sequences-liste.A1 — `.a14-note.purple` : les séquences sur un signal ont leur onglet. Un renvoi,
                  pas une copie (GA-26) ; le nombre n'apparaît que s'il est lu. */}
              <Box
                data-testid="sequence-automations-note"
                className="flex gap-2.5 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-4 py-3"
              >
                <Zap className="mt-0.5 size-4 shrink-0 text-[var(--accent-soft-text)]" aria-hidden="true" />
                <Text size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {t('page.automationsLink.text')}{' '}
                  <Link
                    to="/actions/automatisations"
                    className="font-medium text-[var(--accent-soft-text)] underline underline-offset-2"
                  >
                    {automationCount && automationCount > 0
                      ? t('page.automationsLink.ctaCount', { count: automationCount })
                      : t('page.automationsLink.cta')}
                  </Link>
                </Text>
              </Box>
            </section>

            {/* HORS MAQUETTE, gardé (à trancher par Louis) — le centre d'approbation (#2382 ; `/approbation` redirige
                ici pour LUI, #3419) et le repli « Plus d'options » (constructeur d'audience, canaux, délégation,
                mandats, délivrabilité, télémétrie, bibliothèque importée). Rangés APRÈS le contenu de la maquette :
                rien n'est retiré, rien ne passe avant elle. */}
            <OutreachApprovalCenter />

            <details
              ref={moreRef}
              open={moreOpen}
              onToggle={event => setMoreOpen(event.currentTarget.open)}
              className="group rounded-card border border-[var(--bellum-border)] p-3"
              data-testid="sequence-more-options"
            >
              <summary className="cursor-pointer text-sm font-medium pointer-coarse:min-h-11 pointer-coarse:py-3">
                {t('page.moreOptions')}
              </summary>
              <Box className="mt-4 flex flex-col gap-5">
                {/* #2974 (lot V39) — le constructeur d'audience : une LISTE de contacts éligibles, remise à la fenêtre de
                    création. Rien n'est armé ici. */}
                <AudienceBuilderBlock
                  onPrepare={contacts => {
                    setCreateFromCampaign(false)
                    setBuiltAudience(contacts)
                    setCreateOpen(true)
                  }}
                />
                <ChannelsBlock canSend={canSend} />
                {/* #3702.9 — la délégation d'envoi : mandat explicite, borné, révocable. */}
                <DelegationBlock canSend={canSend} onCreateSequence={() => setCreateOpen(true)} />
                {/* #4016 L5 — les envois automatiques d'espace, chacun sous SON mandat signé. */}
                <MandateScopesBlock canSend={canSend} />
                {/* #2384.5 — délivrabilité (bounce/raisons), DISTINCTE du taux d'envoi des compteurs. */}
                <DeliverabilityBlock />
                {/* #2386.9 — la télémétrie de la session de prospection, PAR PARCOURS (jamais par personne). */}
                <ProspectingSessionMetricsBlock />
                {/* #3756 — la bibliothèque de campagnes importée : appliquer un modèle à UN contact crée sa séquence. */}
                {libraryOutside ? null : <SequenceLibraryBlock />}
              </Box>
            </details>
          </>
        )}
      </Box>

      {/* ⚠️ Le contexte de campagne est AFFICHÉ, jamais imposé : la fenêtre
          laisse changer l'audience et le gabarit, et la création reste un geste
          par contact. Le copilote prépare, la personne envoie. */}
      <CreateSequenceDialog
        open={createOpen}
        onOpenChange={open => {
          setCreateOpen(open)
          if (!open) {
            setLibraryTemplate(null)
            setJourneyLaunch(null)
          }
        }}
        {...(libraryTemplate && !createFromCampaign ? { initialTemplate: libraryTemplate } : {})}
        {...(createFromCampaign && campaignReady && campaign
          ? {
              initialContacts: audience.eligible,
              ...(campaign.template ? { initialTemplate: campaign.template } : {}),
              campaignContext: {
                objective: campaign.objective,
                persona: campaign.persona,
                relation: campaign.relation,
                tone: campaign.tone,
                channels: campaign.channels,
                // #1935.15 — `campaign.mode` était déjà lu depuis l'URL
                // (`campaign-prefill.ts:76`) sans jamais rejoindre le dialogue :
                // une campagne « nurturing » s'affichait identique à « outreach ».
                mode: campaign.mode,
                // #1935.14 — même chaîne cassée que `mode` : `campaign.outputKind`
                // était déjà lu depuis l'URL sans jamais rejoindre le dialogue,
                // une liste d'appels s'affichait identique à une campagne e-mail.
                outputKind: campaign.outputKind,
              },
            }
          : journeyLaunch
            ? {
                initialContacts: journeyLaunch.contacts,
                initialTemplate: journeyLaunch.template,
                ...(journeyLaunch.name ? { initialName: journeyLaunch.name } : {}),
                ...(journeyLaunch.customSteps ? { initialCustomSteps: journeyLaunch.customSteps } : {}),
              }
            : builtAudience
              ? { initialContacts: builtAudience }
              : {})}
      />
      <PlaybookWizardDialog
        open={wizard.open}
        onOpenChange={open => setWizard(current => ({ ...current, open }))}
        {...(wizard.playbook ? { initialPlaybook: wizard.playbook } : {})}
      />
      <PlaybookFromUrl search={location.search as Record<string, unknown>} />
      <SequenceDetailSheet sequence={opened} onClose={() => setOpened(null)} />
    </CustomerPage>
  )
}

/** Une case de plus ou de moins dans une famille de filtres. */
function toggled<T>(current: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** « 5 campagnes · 2 actives, 1 planifiée. » — une partie absente (zéro) ne s'écrit pas. */
function summaryText(t: TFunction<'outreach'>, summary: ReturnType<typeof campaignSummary>): string {
  const parts = [
    summary.active > 0 ? t('list.summaryActive', { count: summary.active }) : null,
    summary.scheduled > 0 ? t('list.summaryScheduled', { count: summary.scheduled }) : null,
  ].filter(Boolean)
  const head = t('list.summaryCampaigns', { count: summary.campaigns })
  return parts.length > 0 ? `${head} · ${parts.join(', ')}.` : `${head}.`
}

/**
 * Théo C sequences-liste — le filtre « État » de la tête de bloc, à choix MULTIPLE (décision Louis 23/10) : les onze
 * états canoniques, cochables ensemble ; le menu reste ouvert pendant qu'on coche.
 */
function StateFilter({
  value,
  onChange,
}: {
  value: ReadonlySet<OutreachSequenceCanonicalStatus>
  onChange: (next: Set<OutreachSequenceCanonicalStatus>) => void
}) {
  const { t } = useTranslation('outreach')
  return (
    <SequenceMultiSelect
      label={t('list.stateFilter')}
      allLabel={t('list.allStates')}
      pickedLabel={count => t('list.statesPicked', { count })}
      options={outreachSequenceCanonicalStatusSchema.options.map(state => ({
        value: state,
        label: t(`canonicalStatus.${state}`),
      }))}
      values={value}
      onChange={onChange}
      testId="sequence-state-filter"
    />
  )
}

/**
 * #2386.1 — LE FIL DE PROSPECTION, entre Découvrir et la trace CRM.
 *
 * Rendu seulement quand cet écran a été ouvert PAR le fil (`ProspectingSessionDialog`
 * → `prospecting-thread.ts`) : jamais affiché à un commercial qui a cliqué
 * « Créer une séquence » depuis cet écran directement — un bandeau qui parle
 * d'une étape qu'on n'a pas commencée serait plus déroutant qu'utile.
 */
function ProspectingThreadBanner({ nextLink }: { nextLink: { to: string; search: Record<string, string> } }) {
  const { t } = useTranslation('outreach')
  return (
    <Box className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
      <Text size="xs" weight="medium">
        {t('prospectingThread.banner')}
      </Text>
      <Link
        to={nextLink.to}
        search={nextLink.search}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {t('prospectingThread.next')}
        <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
      </Link>
    </Box>
  )
}

/**
 * Ce qu'une campagne préparée par Laura annonce, et ce qui en SORT (#1935.25).
 *
 * La règle que ce bloc tient : **un contact écarté est NOMMÉ, avec sa raison.**
 * Entre la proposition du chat et le clic, une fiche a pu être écartée,
 * fusionnée, supprimée — sans ce bloc, elle quitterait l'audience en silence,
 * et on croirait avoir relancé quelqu'un qu'on n'a jamais relancé.
 *
 * ⚠️ Tant qu'une fiche est en lecture, l'écran ne conclut RIEN : « pas encore
 * lu » n'est ni « introuvable » ni « zéro contact » (GA-18 / GA-19).
 */
function CampaignBanner({
  objective,
  audience,
  onResume,
}: {
  objective: string
  audience: CampaignAudience
  onResume: () => void
}) {
  const { t } = useTranslation('outreach')
  const ready = audience.pending === 0 && audience.eligible.length > 0
  return (
    // `.t-banner` — une bande bordée, fond de surface, le geste à droite.
    <Box
      className="flex min-w-0 flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
      data-testid="sequence-campaign-banner"
    >
      <Box className="flex items-center gap-1.5">
        <Sparkles className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
        <Text size="xs" weight="medium">
          {t('campaign.preparedByLaura')}
        </Text>
      </Box>
      <Text size="sm">{objective}</Text>
      {audience.pending > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('campaign.resolving')}
        </Text>
      ) : audience.eligible.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('campaign.audienceReady', { count: audience.eligible.length })}
        </Text>
      ) : (
        <Text size="xs" className="text-[var(--warning-soft-text)]">
          {t('campaign.noneUsable')}
        </Text>
      )}
      {audience.dropped.length > 0 ? (
        <Box className="flex min-w-0 flex-col gap-0.5">
          <Text size="xs" weight="medium">
            {t('campaign.dropped.title')}
          </Text>
          {audience.dropped.map(dropped => (
            <Text key={dropped.id} size="xs" className="text-[var(--bellum-text-secondary)]">
              {droppedLabel(t, dropped)}
            </Text>
          ))}
        </Box>
      ) : null}
      {ready ? (
        <Box>
          <Button type="button" size="sm" variant="outline" onClick={onResume}>
            {t('campaign.resumePreparation')}
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}

/**
 * Le nom quand on le connaît, l'identifiant sinon — jamais « Contact », qui
 * ferait passer une ignorance pour une donnée. Le motif consigné le jour de
 * l'écartement s'affiche quand il existe ; absent, la phrase s'arrête.
 */
function droppedLabel(t: TFunction<'outreach'>, dropped: CampaignDropped): string {
  const name = dropped.fullName ?? dropped.id
  if (dropped.reason === 'missing') return t('campaign.dropped.missing', { name })
  if (dropped.reason === 'unreadable') return t('campaign.dropped.unreadable', { name })
  return dropped.detail
    ? t('campaign.dropped.optedOutWithReason', { name, reason: dropped.detail })
    : t('campaign.dropped.optedOut', { name })
}

const NAME_LINK =
  'max-w-full truncate text-left text-sm font-semibold text-[var(--bellum-text-primary)] underline-offset-2 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center'

/**
 * Théo C sequences-liste.R4 — une audience de plusieurs contacts, sur UNE ligne.
 *
 * Le nom est l'étiquette de campagne ; l'audience dit « N contacts » (et les comptes) ; l'état est le
 * plus pressant des membres. Un repli nomme chaque personne et mène à SA séquence — rien n'est caché.
 */
function GroupRow({ row, now }: { row: Extract<AudienceRow, { kind: 'group' }>; now: Date }) {
  const { t } = useTranslation('outreach')
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <TableRow data-testid="audience-group-row">
        <TableCell className={CELL}>
          <Box className="flex min-w-0 flex-col gap-0.5">
            {/* Théo C sequences-liste/detail — le nom ouvre la CAMPAGNE (toute l'audience) ; les personnes se déplient
                depuis l'audience (« 6 contacts »), rien n'est retiré. */}
            {row.members[0] ? (
              <Link to="/actions/sequences/$id" params={{ id: row.members[0].id }} className={NAME_LINK}>
                {row.label}
              </Link>
            ) : (
              <Text size="sm" weight="medium">
                {row.label}
              </Text>
            )}
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {row.nextDueAt ? t('row.nextDue', { date: formatDate(row.nextDueAt) ?? '' }) : t('row.noNextDue')}
              {row.replies > 0 ? ` · ${t('row.replies', { count: row.replies })}` : ''}
            </Text>
          </Box>
        </TableCell>
        <TableCell className={CELL}>
          <Box className="flex min-w-0 flex-col">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t('row.showPeople', { label: row.label })}
              onClick={() => setExpanded(open => !open)}
              className="w-fit rounded-md py-1 text-left text-sm underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {t('row.contacts', { count: row.contactCount })}
            </button>
            {row.accountNames.length > 0 ? (
              <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                {row.accountNames.join(' · ')}
              </Text>
            ) : null}
          </Box>
        </TableCell>
        <TableCell className={CELL}>{t('row.steps', { count: row.stepCount })}</TableCell>
        <TableCell className={CELL}>
          <SequenceStatusBadge status={row.status} />
        </TableCell>
        <TableCell className={CELL}>
          {row.members[0] ? <OpenLink id={row.members[0].id} label={row.label} /> : null}
        </TableCell>
      </TableRow>
      {expanded ? row.members.map(member => <SequenceRow key={member.id} sequence={member} now={now} nested />) : null}
    </>
  )
}

function SequenceRow({ sequence, now, nested = false }: { sequence: OutreachSequence; now: Date; nested?: boolean }) {
  const { t } = useTranslation('outreach')
  const status = displayStatusOf(sequence, now)
  const progress = progressOf(sequence)
  const nextStep = sequence.next_step
  const modeLabel = campaignModeLabel(sequence)

  return (
    // ⚠️ La ligne entière n'est PAS un `onClick` : un `<div onClick>` n'a ni
    // tabulation ni Entrée ni annonce. Le geste porte sur un vrai LIEN, dans
    // la première cellule, qui nomme la séquence — Théo C sequences-detail.R1 :
    // le détail est une PAGE (`/actions/sequences/$id`), avec son URL partageable.
    <TableRow className={cn(nested && 'bg-[var(--bellum-surface-2)]')}>
      <TableCell className={CELL}>
        <Box className="flex min-w-0 flex-col gap-0.5">
          <Link to="/actions/sequences/$id" params={{ id: sequence.id }} className={NAME_LINK}>
            {sequence.name}
          </Link>
          {/* #2798 — le mode de campagne (gabarit), puis l'échéance en sous-titre (Théo : pas de colonne
              dédiée). Absents quand on ne les connaît pas — jamais un mode ni une date devinés. */}
          <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
            {modeLabel ? (
              <>
                <span className="sr-only">{t('columns.mode')}: </span>
                {modeLabel}
                {' · '}
              </>
            ) : null}
            {nextStep
              ? `${t(`kind.${nextStep.kind}`)} · ${t('row.nextDue', { date: formatDate(nextStep.due_at) ?? '' })}`
              : t('row.noNextDue')}
          </Text>
        </Box>
      </TableCell>
      <TableCell className={CELL}>
        <Box className="flex min-w-0 flex-col">
          <Text size="sm" className="truncate">
            {sequence.contact_name ?? '–'}
          </Text>
          {/* Un poste absent le DIT. Un tiret se lirait comme une valeur. */}
          <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
            {sequence.contact_role ?? t('columns.noRole')}
            {' · '}
            {sequence.account_name ?? t('columns.noAccount')}
          </Text>
        </Box>
      </TableCell>
      <TableCell className={CELL}>
        <Text size="sm">{t('row.steps', { count: progress.total })}</Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {progress.done}/{progress.total}
        </Text>
      </TableCell>
      <TableCell className={CELL}>
        <SequenceStatusBadge status={status} />
      </TableCell>
      <TableCell className={CELL}>
        <OpenLink id={sequence.id} label={sequence.name} />
      </TableCell>
    </TableRow>
  )
}

/** Théo C sequences-liste — le chevron de fin de ligne : un vrai lien (tabulation, Entrée), cible ≥ 44 px. */
function OpenLink({ id, label }: { id: string; label: string }) {
  const { t } = useTranslation('outreach')
  return (
    <Link
      to="/actions/sequences/$id"
      params={{ id }}
      aria-label={t('row.open', { name: label })}
      className="inline-flex size-9 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] pointer-coarse:size-11"
    >
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  )
}
