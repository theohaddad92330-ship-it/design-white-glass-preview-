import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Clock,
  History,
  KeyRound,
  Layers,
  MapPin,
  Network,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button, Text, cn } from '@bellum/ui'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useConsultants } from '@/features/consultants/hooks'
import { listAgentChatHistory } from '@/features/chat/api/agentChatApi'
import { dismissResume, pickResumeCandidate, readDismissedResumes } from '@/features/chat/lib/home-resume'
import { trackSuggestionClicked } from '@/lib/product-tracker'
import { CHAT_SURFACE } from './chat-surface'
import { buildKnownAccountEntry, type LauraHomeSuggestion } from './laura-home-suggestions'
import { WorkspaceNextSteps } from './WorkspaceNextSteps'

/**
 * L'ACCUEIL DE LAURA — point de départ ET de reprise (#3773, BEL-LAU-0610-002).
 *
 * Quatre cartes au plus, rédigées comme des demandes métier : un titre lisible
 * et une phrase entière (jamais tronquée), sans sur-titre en capitales — les
 * familles restent dans le catalogue, elles n'ont plus à se lire en premier. Une
 * seule icône par carte, aucun éclair décoratif : le coût d'une opération payante
 * est dit dans sa phrase et annoncé par Laura avant le lancement.
 *
 * Avant les cartes, au plus UNE entrée « Reprendre… » : la conversation la plus
 * récente, lue dans la liste existante. Le clic ouvre ce fil, il n'en crée pas de
 * copie et n'envoie rien.
 *
 * Référence visuelle : la grille d'avant (Chat.tsx, #1600/#2749) — mêmes tokens,
 * même carte `rounded-xl border surface-1`, même plancher tactile 44 px.
 */

const HOME_SUGGESTION_ICON: Record<string, LucideIcon> = {
  findCompatibleAccounts: Search,
  analyzeCompany: Building2,
  zoneOpportunities: MapPin,
  whereInvestTime: Clock,
  consultantAvailable: UserCheck,
  matchVivier: Users,
  matchingEnvironments: Layers,
  findAccessPath: KeyRound,
  whatsChanged: History,
  rank2PartnerUsage: Network,
  prepareMeeting: CalendarClock,
}

/** Combien de noms le choix propose : une liste courte, pas un second sélecteur. */
const PICK_MAX = 6
/** Au-delà, une lecture qui n'aboutit pas ne retient plus les cartes (voir `useStableSuggestions`). */
const SETTLE_TIMEOUT_MS = 1_500
/** « Commencer un travail » : trois cartes (maquette V8, #5042). */
const START_COUNT = 3

type PickOption = { id: string; name: string }

/**
 * #3773.5 — « les suggestions restent stables pendant la lecture ».
 *
 * Les cartes se servent de trois lectures (comptes, vivier, partenaires) qui
 * arrivent l'une après l'autre : rendre la liste à chaque arrivée la réordonnait
 * sous le pointeur. On attend donc la fin des lectures (ou un délai, pour qu'une
 * lecture en échec ne prive pas l'écran de ses cartes), puis on FIGE la liste des
 * identifiants pour la durée de l'écran. Les textes restent vivants (langue).
 */
function useStableSuggestions(suggestions: LauraHomeSuggestion[], settled: boolean | undefined) {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), SETTLE_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [])
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null)
  useEffect(() => {
    // #5042 R4 — SEULE la fin des lectures fige. Le délai figeait un jeu PARTIEL (une lecture lente = d'autres
    // cartes d'un chargement à l'autre, recette prod 02/11) ; il ne sert plus qu'à ne pas laisser l'écran muet.
    if (frozenIds === null && settled !== false) setFrozenIds(suggestions.map(s => s.id))
  }, [frozenIds, settled, suggestions])
  // #5042 (recette prod 01/11) — la liste figée relisait chaque carte dans la liste VIVANTE : si le contexte
  // rebasculait après (portefeuille → « nouvel utilisateur »), seules les cartes communes survivaient et
  // l'accueil n'en montrait plus qu'UNE. On garde donc la dernière version VUE de chaque carte figée : les
  // textes restent vivants (langue), l'ensemble ne se vide plus.
  const seenRef = useRef(new Map<string, LauraHomeSuggestion>())
  for (const suggestion of suggestions) seenRef.current.set(suggestion.id, suggestion)
  return useMemo(() => {
    if (frozenIds === null) return timedOut ? suggestions : []
    const byId = seenRef.current
    return frozenIds.flatMap(id => {
      const suggestion = byId.get(id)
      return suggestion ? [suggestion] : []
    })
  }, [frozenIds, suggestions, timedOut])
}

function ResumeEntry({ activeConversationId }: { activeConversationId: string | null }) {
  const { t } = useTranslation('chat')
  // Une lecture simple, comme le panneau des conversations (`ConversationsPanel`) : même liste,
  // même contrôle d'accès côté serveur. Un échec ne montre rien — jamais une reprise inventée.
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof listAgentChatHistory>> | null>(null)
  useEffect(() => {
    let cancelled = false
    listAgentChatHistory(false).then(
      items => {
        if (!cancelled) setThreads(items)
      },
      () => {
        if (!cancelled) setThreads(null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])
  const [dismissed, setDismissed] = useState(readDismissedResumes)
  // R2 #4962 — seul un tour réellement en cours (`background-turns`, #4967) se propose à la reprise.
  const turns = useBackgroundTurnsStore(state => state.turns)
  const running = useMemo(
    () => new Set(Object.entries(turns).flatMap(([id, state]) => (state === 'running' ? [id] : []))),
    [turns],
  )
  const candidate = pickResumeCandidate(threads, { activeConversationId, dismissed, running })
  // #3697 (vu en passant, recette prod 09/10) — pendant la lecture de
  // l'historique (`threads === null`), rien ne réservait la place de cette
  // rangée : les cartes de suggestion juste en dessous descendaient d'un bloc
  // (~60 px, la rangée + sa marge) dès qu'une reprise était trouvée — même
  // défaut de mise en page que celui déjà corrigé pour « Bien démarrer »
  // (#3490, `ActivationChecklist.tsx`). Un échec de lecture ou une liste sans
  // candidat ne réserve toujours rien : seul le TEMPS de lecture, avant de
  // savoir, a besoin de sa place.
  if (!candidate) return threads === null ? <div aria-hidden className="mb-2 h-11 w-full" /> : null
  return (
    <div
      role="region"
      aria-label={t('home.resume.region')}
      data-testid="laura-home-resume"
      className="mb-2 flex items-center rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <Link
        to="/chat"
        search={{
          ...(candidate.account_id ? { accountId: candidate.account_id } : {}),
          ...(candidate.conversation_id ? { conversationId: candidate.conversation_id } : {}),
        }}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--bellum-surface-2)]',
          CHAT_SURFACE.focusRing,
        )}
      >
        <History aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="medium" className="min-w-0 truncate text-[var(--bellum-text-primary)]">
          {t('home.resume.label', { title: candidate.title })}
        </Text>
      </Link>
      <button
        type="button"
        aria-label={t('home.resume.dismiss')}
        onClick={() => setDismissed(dismissResume(candidate.id))}
        className={cn(
          'mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--bellum-text-muted)] transition-colors pointer-coarse:size-11 hover:bg-[var(--bellum-surface-2)]',
          CHAT_SURFACE.focusRing,
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

/** Les noms qu'on peut proposer pour l'élément à choisir — jamais une ligne sans nom. */
function usePickOptions(): { loading: boolean; account: PickOption[]; consultant: PickOption[] } {
  const accountsQuery = useAccounts({ status: 'completed' })
  const consultantsQuery = useConsultants()
  const account = useMemo(
    () =>
      (accountsQuery.data?.pages.flatMap(page => page.data) ?? []).flatMap(row =>
        row.company_name ? [{ id: row.id, name: row.company_name }] : [],
      ),
    [accountsQuery.data],
  )
  const consultant = useMemo(
    () =>
      (consultantsQuery.data ?? []).flatMap(row =>
        // « Disponible » : jamais un consultant dont la disponibilité n'est pas renseignée.
        row.full_name && (row.availability === 'immediate' || row.availability === 'sous_1_mois')
          ? [{ id: row.id, name: row.full_name }]
          : [],
      ),
    [consultantsQuery.data],
  )
  return { loading: Boolean(accountsQuery.isLoading || consultantsQuery.isLoading), account, consultant }
}

/**
 * #3773.5 — « demander ce seul élément puis préparer la bonne demande ».
 *
 * Monté SEULEMENT au clic d'une carte qui suppose un compte ou un consultant : les
 * lectures ne partent pas à l'ouverture de l'accueil. Sans aucun nom à proposer,
 * le choix ne s'affiche pas vide — la demande générale de la carte est préparée.
 */
function TargetPicker({
  suggestion,
  needs,
  promptFor,
  onPrompt,
  onChoose,
  onClose,
}: {
  suggestion: LauraHomeSuggestion
  needs: 'account' | 'consultant'
  promptFor: (name: string) => string
  onPrompt: (prompt: string) => void
  /** #5011 / #5027 — si présent, le nom choisi va ICI (avec son id) au lieu de préparer la demande sur place. */
  onChoose?: (option: PickOption) => void
  onClose: () => void
}) {
  const { t } = useTranslation('chat')
  const options = usePickOptions()
  const list = options[needs].slice(0, PICK_MAX)
  const empty = !options.loading && list.length === 0
  useEffect(() => {
    if (!empty) return
    onPrompt(suggestion.prompt)
    onClose()
  }, [empty, onPrompt, onClose, suggestion.prompt])
  if (options.loading || empty) return null
  return (
    <div
      role="group"
      aria-label={t(`home.pickTarget.${needs}`)}
      data-testid="laura-home-pick"
      className="mt-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
    >
      <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
        {t(`home.pickTarget.${needs}`)}
      </Text>
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map(option => (
          <Button
            key={option.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (onChoose) onChoose(option)
              else onPrompt(promptFor(option.name))
              onClose()
            }}
          >
            {option.name}
          </Button>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {t('home.pickTarget.cancel')}
        </Button>
      </div>
    </div>
  )
}

export function HomeSuggestionGrid({
  suggestions,
  settled,
  activeConversationId,
  onPrompt,
  onOpenCatalog,
}: {
  suggestions: LauraHomeSuggestion[]
  /** `LauraHomeContext.settled` — `false` = lectures en cours, les cartes attendent. */
  settled: boolean | undefined
  activeConversationId: string | null
  onPrompt: (prompt: string) => void
  onOpenCatalog: () => void
}) {
  const { t } = useTranslation('chat')
  // #5042 — trois cartes au plus ; le reste n'est plus une rubrique (revient sur Théo B l1-laura.R4).
  const stable = useStableSuggestions(suggestions, settled)
  const cards = useMemo(() => stable.slice(0, START_COUNT), [stable])
  const [picking, setPicking] = useState<LauraHomeSuggestion | null>(null)
  const navigate = useNavigate()
  // #5011 / #5027 (arbitrage Louis 31/10) — UN SEUL chemin « J'ai un compte en tête » : le compte choisi ouvre un
  // fil neuf CADRÉ sur lui (`?fresh=1&accountId=`, le geste de « Demander à … » depuis la fiche d'un compte), et la
  // saisie préparée (`?prompt=`, jamais envoyée) demande le profil à positionner.
  const knownAccount = useMemo(() => buildKnownAccountEntry(t), [t])
  const chooseKnownAccount = useCallback(
    (option: PickOption) => {
      void navigate({
        to: '/chat',
        search: { fresh: '1', accountId: option.id, prompt: t('home.knownAccount.promptFor', { name: option.name }) },
      })
    },
    [navigate, t],
  )
  const closePicker = useCallback(() => setPicking(null), [])
  if (cards.length === 0) return null
  return (
    <div className="mt-8" data-testid="laura-home" data-guide-keep-clear>
      <ResumeEntry activeConversationId={activeConversationId} />
      {/* #5011.1 — sur l'accueil de Laura (Louis 31/10) : la suite de l'espace, absente si aucune étape. */}
      <WorkspaceNextSteps onPrefill={onPrompt} />
      {/* #5042 (revient sur Théo B l1-laura.R4) — « Commencer un travail » : trois tuiles EN LIGNE
          (icône, titre, phrase) ; plus de rubrique « Explorer les scénarios ». */}
      <div data-testid="laura-home-suggestions">
        <div role="group" aria-label={t('home.sections.start.title')} data-laura-home="start">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {t('home.sections.start.title')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('home.sections.start.hint', { count: cards.length })}
            </Text>
          </div>
          <div
            className={cn(
              'grid grid-cols-1 gap-2.5',
              // #4594.3 — jamais une colonne VIDE : deux amorces tiennent sur deux colonnes.
              cards.length >= START_COUNT ? 'md:grid-cols-3' : 'md:grid-cols-2',
            )}
          >
            {cards.map((suggestion, index) => {
              const Icon = HOME_SUGGESTION_ICON[suggestion.id] ?? Sparkles
              const pick = () => {
                // #1946.2 — le RANG RENDU, 1-based, jamais le libellé (le texte est le pipe d'un client).
                trackSuggestionClicked('/chat', index + 1)
                if (suggestion.needs && suggestion.promptFor) {
                  // #3773.5 — un compte ou un consultant à choisir : on demande CET élément seul.
                  setPicking(suggestion)
                  return
                }
                setPicking(null)
                onPrompt(suggestion.prompt)
              }
              return (
                <button
                  key={suggestion.id}
                  type="button"
                  onClick={pick}
                  // La demande complète reste lisible avant le clic ; la phrase de la carte, elle, n'est pas tronquée.
                  title={suggestion.prompt}
                  className={cn(
                    'flex min-h-24 items-start gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 text-left transition-colors hover:border-[var(--bellum-accent-line)] hover:bg-[var(--bellum-surface-2)]',
                    picking?.id === suggestion.id && 'border-[var(--bellum-accent-line)] bg-[var(--bellum-surface-2)]',
                    CHAT_SURFACE.focusRing,
                  )}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                      {suggestion.label}
                    </Text>
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {suggestion.benefit}
                    </Text>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {picking?.needs && picking.promptFor ? (
        <TargetPicker
          key={picking.id}
          suggestion={picking}
          needs={picking.needs}
          promptFor={picking.promptFor}
          onPrompt={onPrompt}
          onChoose={picking.id === 'knownAccount' ? chooseKnownAccount : undefined}
          onClose={closePicker}
        />
      ) : null}
      {/* Maquette V8 : « Toutes les idées de demandes » en pied, une seule fois. À côté, l'UNIQUE chemin
          « J'ai un compte en tête » (#5011 / #5027). */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPicking(knownAccount)}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-primary)] transition-colors hover:text-[var(--bellum-text-accent)] md:min-h-8',
            CHAT_SURFACE.focusRing,
          )}
        >
          <Building2 aria-hidden className="size-3.5" />
          {knownAccount.label}
        </button>
        <button
          type="button"
          onClick={onOpenCatalog}
          className={cn(
            'inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-xs font-medium text-[var(--bellum-text-primary)] transition-colors hover:text-[var(--bellum-text-accent)] md:min-h-8',
            CHAT_SURFACE.focusRing,
          )}
        >
          <ArrowRight aria-hidden className="size-3.5" />
          {t('home.catalogLink')}
        </button>
      </div>
    </div>
  )
}
