import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  ArchiveX,
  ChevronRight,
  Copy,
  Download,
  ListChecks,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { CHAT_THREAD_TITLE_MAX_LENGTH } from '@bellum/contracts'
import { EntityAvatar, Text, cn } from '@bellum/ui'
import { toast } from 'sonner'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import {
  deleteAgentChatThread,
  duplicateAgentChatThread,
  exportAgentChatThread,
  listAgentChatHistory,
  renameAgentChatThread,
  searchAgentChatThreads,
  setAgentChatThreadArchived,
  type AgentChatHistoryItem,
  type ChatThreadExportFormat,
} from '@/features/chat/api/agentChatApi'
import { dedupeThreads, filterThreads, mergeSearchResults } from '@/features/chat/lib/conversation'
import { sharedThreads } from '@/features/chat/lib/shared-conversation'
// #1911.5 — l'unique dérivation de l'état d'un fil (« en attente » / « reçu »).
import { useSelfChatAuthor } from '@/features/chat/hooks/useSelfChatAuthor'
import { PORTFOLIO_SCOPE, SHARED_SCOPE, isSharedScope, type ChatScope } from '@/features/chat/scope/chat-scope'
import {
  activityIsoOf,
  groupThreadsByAccount,
  groupThreadsByDate,
  type ThreadGroup,
} from '@/features/chat/lib/thread-groups'
import { threadStatusLabelKey, threadStatusOf } from '@/features/chat/lib/thread-status'
import { useConversationsGrouping } from './conversations-grouping'
import { useConversationsPanelOpen } from './conversations-panel-open'
import { MessageAuthor } from './MessageAuthor'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'

/**
 * Les conversations de Laura — la colonne repliable, DANS l'écran du copilote.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLES REDESCENDENT ICI (Louis, 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ce qui se passe sous le bouton Laura prend trop de place, décale ça dans
 * une petite sidebar dans le chat à gauche qui peut se refermer, mais sinon on
 * voit plus bien le sidebar principal si on laisse comme ça. »
 *
 * Ce qui se passe sous le bouton « Demander à Laura », c'est cette liste : elle
 * était rendue par la barre latérale du produit, juste sous le bouton, et
 * seulement sur `/chat`. MESURÉ en production le 30/08, sur un écran de 861 px
 * de haut, avant ce lot :
 *
 *   · le bloc des conversations mesurait **510 px** (de y=100 à y=610) ;
 *   · le conteneur défilant de la navigation n'en gardait que **135 px** pour
 *     **278 px** de contenu — soit **moins de la moitié de la barre visible** ;
 *   · **3 entrées de navigation sur 8** tenaient entièrement dans cette fenêtre
 *     (Aujourd'hui, Comptes, Projets) ; Vivier était coupée, et Missions,
 *     Actions, Pilotage, Paramètres demandaient de faire défiler une barre
 *     latérale dont personne ne soupçonne qu'elle défile.
 *
 * C'est exactement « on voit plus bien le sidebar principal ». Le repli seul
 * n'y aurait rien changé — c'est la PLACE qu'il fallait rendre, pas un pli.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA COLONNE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est pas une TROISIÈME colonne de navigation : la barre latérale rend ses
 * 510 px au moment même où celle-ci les prend, et elle se referme sur un rail
 * de 44 px. Sur un portable de 1 280 px, le fil garde donc 1 280 − 240 − 240 =
 * 800 px, au-dessus des 768 px du `max-w-3xl` des bulles ; replié, 1 000 px.
 *
 * Ce n'est pas non plus deux conteneurs défilants IMBRIQUÉS : cette colonne et
 * le fil sont des FRÈRES dans la même rangée. Chacun défile chez lui, et rien
 * ne défile dans l'autre.
 *
 * ⚠️ `max-md:hidden` — sur téléphone la colonne n'existe pas, en CSS et dans le
 * MÊME rendu. Trois bandes ne tiennent pas dans 390 px.
 *
 * L'historique reste atteignable sur téléphone : `ConversationsDrawer`
 * (`Chat.tsx`, en-tête) ouvre un tiroir qui rend `ConversationList` — LE MÊME
 * composant, exporté ci-dessous, jamais une seconde implémentation (loi 4 du
 * tome 7 / GA-26). Voir son docblock pour ce que ce second montage change et
 * ne change pas.
 */
// #1944.4 — tranché par Louis le 12/09/2026 : tiroir depuis l'en-tête
export function ConversationsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { t } = useTranslation('chat')
  const [open, toggleOpen] = useConversationsPanelOpen()
  return (
    <aside
      aria-label={t('conversationsPanel.aria')}
      className={cn(
        // `min-w-0` : sans lui, un enfant de flex prend `min-width: auto`,
        // c'est-à-dire la largeur de son contenu — le premier responsable des
        // débordements horizontaux de ce dépôt.
        'flex min-h-0 min-w-0 shrink-0 flex-col border-r border-[var(--bellum-border)] bg-[var(--bellum-bg)]',
        // La même durée que le repli de la barre latérale du produit, qui est
        // le geste FRÈRE de celui-ci : « où c'est allé », §16 du tome 7.
        'transition-[width] duration-200 ease-out',
        // Le mobile n'a pas la largeur de trois bandes — masquée en CSS, dans
        // le même rendu, jamais par un rendu conditionnel.
        'max-md:hidden',
        open ? 'w-60' : 'w-11',
      )}
    >
      {/* `h-14` : exactement l'entête du fil, à côté. Deux barres de hauteurs
          voisines mais différentes se remarquent sans qu'on sache dire quoi. */}
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-[var(--bellum-border)] px-1.5">
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          /* Le bouton ne montre qu'une icône : il porte son nom (GA-32), et
             l'infobulle native le redit — c'est la seule qui survive au rail
             replié, où le libellé n'a pas la place d'exister. */
          aria-label={t(open ? 'conversationsPanel.collapse' : 'conversationsPanel.expand')}
          title={t(open ? 'conversationsPanel.collapse' : 'conversationsPanel.expand')}
          className="flex size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
        >
          {open ? <PanelLeftClose className="size-4" aria-hidden /> : <PanelLeftOpen className="size-4" aria-hidden />}
        </button>
        {/* Replié, le titre passe en `sr-only` : il n'occupe plus de place mais
            reste annoncé. Le retirer du rendu ferait disparaître le nom de la
            région pour qui l'écoute. */}
        <Text size="xs" weight="medium" className={cn('truncate', !open && 'sr-only')}>
          {t('conversationsPanel.title')}
        </Text>
      </div>

      {/*
        #2748.2 — replié, le lien « + Nouvelle conversation » du corps de liste
        (juste en dessous) est masqué EN CSS avec le reste (règle 4 de GA-111) :
        en rail, plus aucune cible ne le rend. Ce raccourci vit donc HORS du
        corps repliable, visible seulement replié (`!open`) pour ne jamais
        doubler le lien du corps quand la colonne est ouverte — un seul « + »
        visible à la fois, à l'écran comme dans le DOM accessible.
      */}
      {!open && (
        <div className="shrink-0 border-b border-[var(--bellum-border)] px-1.5 py-1.5">
          <Link
            to="/chat"
            search={{ new: '1' }}
            data-testid="conversations-panel-rail-new"
            aria-label={t('sidebarThreads.new')}
            title={t('sidebarThreads.new')}
            className="flex size-8 pointer-coarse:min-h-11 pointer-coarse:min-w-11 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-accent)] outline-none transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
          >
            <Plus className="size-4" aria-hidden />
          </Link>
        </div>
      )}

      {/* Le corps DÉFILE chez lui. Masqué en CSS quand la colonne est repliée —
          le rail garde son bouton, donc la fonctionnalité reste trouvable. */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto py-2', open ? 'block' : 'hidden')}>
        <ConversationList refreshKey={refreshKey} />
        <AccountShortcuts />
      </div>
    </aside>
  )
}

/** Théo B l1-laura.N1 — combien de dossiers la bibliothèque raccourcit : une rubrique courte, pas un second portefeuille. */
const SHORTCUT_MAX = 3

/**
 * Théo B l1-laura.N1 — « TES DOSSIERS » : des raccourcis vers les comptes du portefeuille, sous les conversations.
 *
 * Lecture seule du portefeuille déjà chargé pour les logos de la liste (même requête, aucun appel de plus).
 * Un nom blanc ne fait pas de ligne ; sans compte, la rubrique n'existe pas.
 */
function AccountShortcuts() {
  const { t } = useTranslation('chat')
  const { data } = useAccounts({ status: 'completed' })
  const shortcuts = (data?.pages.flatMap(page => page.data) ?? [])
    .flatMap(row =>
      row.company_name?.trim() ? [{ id: row.id, name: row.company_name.trim(), logo: row.logo_url }] : [],
    )
    .slice(0, SHORTCUT_MAX)
  if (shortcuts.length === 0) return null
  return (
    <div
      role="group"
      aria-label={t('sidebarThreads.dossiers.title')}
      className="mt-3 border-t border-[var(--bellum-border)] px-2 pt-2"
    >
      <Text
        size="xs"
        weight="semibold"
        color="text-[var(--bellum-text-secondary)]"
        className="px-2 py-1.5 uppercase tracking-wider"
      >
        {t('sidebarThreads.dossiers.title')}
      </Text>
      {shortcuts.map(account => (
        <Link
          key={account.id}
          to="/accounts/$id"
          params={{ id: account.id }}
          className="flex min-h-9 pointer-coarse:min-h-11 items-center gap-2.5 rounded-md px-2 text-xs text-[var(--bellum-text-primary)] transition-colors hover:bg-[var(--bellum-surface-2)]"
        >
          <EntityAvatar
            name={account.name}
            src={account.logo ?? undefined}
            shape="square"
            size="xs"
            aria-hidden="true"
          />
          <span className="truncate">{account.name}</span>
        </Link>
      ))}
    </div>
  )
}

/**
 * La liste elle-même.
 *
 * ⚠️ Elle n'est rendue QUE dans l'écran du copilote, jamais dans la barre
 * latérale — c'est la règle que tient GA-110. Elle a été rendue deux fois dans
 * l'histoire de cet écran (un panneau à colonne, puis la barre latérale), et
 * les deux fois la seconde copie a divergé de la première.
 *
 * #1944.4 (12/09/2026) — EXPORTÉE pour un second appelant, `ConversationsDrawer`
 * (`Chat.tsx`), le tiroir mobile. Ce n'est pas la même divergence que ci-dessus :
 * c'est le MÊME composant, monté deux fois (colonne repliable ≥768 px, tiroir
 * en dessous), jamais réécrit. Une troisième implémentation romprait cette
 * garantie — un appelant nouveau importe `ConversationList`, il ne la recopie
 * pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT ELLE SE RANGE — #1911.7 à #1911.10, décision de Louis du 13/09/2026
 * (batch 11), qui DÉFAIT la règle d'avant
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux rangements, au choix de chaque personne, par une bascule en tête de
 * liste — retenue sur ce navigateur (`conversations-grouping.ts`) :
 *
 *   · PAR DATE, le défaut — intercalaires « Aujourd'hui », « Cette semaine »,
 *     « Plus ancien », sur la DERNIÈRE activité du fil, dans le fuseau du
 *     navigateur, semaine commençant le lundi. Un groupe vide ne s'affiche pas.
 *     Les fils ne bougent pas : l'ordre servi par l'API était déjà celui-là, les
 *     intercalaires s'y posent.
 *   · PAR COMPTE — un intercalaire par compte (logo + nom lisible, lu par l'API
 *     dans l'espace), ses fils dessous dans l'ordre d'activité ; puis « Compte
 *     introuvable » (compte effacé, nom blanc) et « Sans compte » en dernier.
 *     Jamais un identifiant, « undefined » ni « 0 » à la place d'un nom.
 *
 * Le calcul — bornes de date, ordre des groupes, noms absents — vit dans
 * `lib/thread-groups.ts`, et se teste aux bornes sans navigateur.
 *
 * Ce que la décision GARDE de la règle d'avant : rien n'est dépliable, et les
 * deux rangements ne s'imbriquent jamais. Un intercalaire est une ligne de texte
 * de 12 px, pas un nœud qu'on ouvre. La colonne garde donc sa largeur (`w-60`,
 * 240 px) : la bascule y tient en deux moitiés d'environ 110 px pour des
 * libellés de 8 à 10 caractères, et un nom de compte long se tronque.
 *
 * ⚠️ LA RÈGLE D'AVANT, pour la trace (30/08/2026 → 13/09/2026) — la liste était
 * PLATE : « Pas de groupes par compte dépliables : 240 px n'ont pas la largeur
 * d'une arborescence à deux niveaux, et un compte porte rarement plus de deux ou
 * trois fils. La PORTÉE d'un fil se lit dans l'en-tête de la conversation. »
 * Louis a retenu « date + par compte » contre la recommandation « date seule ».
 * Ne pas la rétablir sans lui : c'est une décision, pas un oubli.
 *
 * Le compte reste dans le lien (`?accountId=`) : c'est lui qui porte la portée,
 * et un fil ouvert sans son compte repartirait sur le portefeuille entier.
 */
export function ConversationList({ refreshKey }: { refreshKey: number }) {
  const { t, i18n } = useTranslation('chat')
  const [threads, setThreads] = useState<AgentChatHistoryItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  // #1120 — « Faudrait pouvoir archiver ou supprimer les conversations. »
  // Le tiroir : ranger n'est pas supprimer, et un tiroir dont on ne peut pas
  // ouvrir le fond n'est pas un tiroir.
  const [showArchived, setShowArchived] = useState(false)
  // #1911.7 / #1911.10 — par date ou par compte, retenu sur ce navigateur.
  const [grouping, setGrouping] = useConversationsGrouping()
  /**
   * #1910.8 — LE PÉRIMÈTRE « CONVERSATION PARTAGÉE », CÔTÉ FILTRE.
   *
   * Arbitré par Louis le 16/09/2026 : un filtre pour RETROUVER ses fils
   * partagés, que l'humain lit et que Laura NE lit PAS. Il ne touche donc que
   * cette LISTE — aucun corps de message écrit par un collègue n'entre dans le
   * contexte du modèle (D65), et `SHARED_SCOPE` ne descend ni en `accountId` ni
   * en objet de portée (`chat-scope.ts`).
   *
   * ⚠️ L'état vit en `ChatScope`, pas en booléen à part : `SHARED_SCOPE` /
   * `isSharedScope` avaient été écrits pour porter exactement ce filtre, puis
   * l'écran avait tenu son propre `useState(false)` à côté — un réglage à DEUX
   * endroits (GA-26), et `SHARED_SCOPE` restait un export sans appelant réel
   * hors de ses tests. `PORTFOLIO_SCOPE` sert ici de valeur « éteinte » : seul
   * son `kind` compte, jamais son sens de portée de composition.
   *
   * Il n'est pas retenu d'une session à l'autre, contrairement au rangement :
   * un filtre qui cache des fils et qu'on a oublié d'éteindre se lit « je n'ai
   * plus de conversations ».
   */
  const [sharedFilterScope, setSharedFilterScope] = useState<ChatScope>(PORTFOLIO_SCOPE)
  const sharedOnly = isSharedScope(sharedFilterScope)
  const self = useSelfChatAuthor()
  const groupIdPrefix = useId()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  // #1955.7 — les trois formats d'export, dépliés DANS le menu du fil : une
  // entrée « Exporter » qui ouvre trois lignes, jamais un second menu flottant
  // qui se refermerait sur le premier.
  const [exportOpen, setExportOpen] = useState(false)
  // #2081.14 — exporter un fil (Markdown, PDF, JSON) le fait SORTIR de l'espace :
  // sous la règle d'espace « administrateurs seulement », l'entrée « Exporter »
  // du menu est masquée (l'API refuse aussi les trois routes, `@DataExit()`).
  const dataExit = useDataExit()
  // #1911.12 / #1955.1 — le fil qu'on renomme, et ce qui est tapé.
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null)
  const renameInput = useRef<HTMLInputElement>(null)
  const editingId = editing?.id ?? null
  /**
   * #2223 — SÉLECTIONNER PLUSIEURS FILS POUR LES RANGER D'UN GESTE.
   *
   * 🔴 On archive, on ne supprime pas : la sélection multiple ne porte QU'UN
   * geste (`bulkArchive`, ci-dessous), jamais une suppression en lot — la
   * suppression reste un geste PAR FIL, confirmé, dans le menu (`remove`).
   * L'ANNULABLE (`clearSelection`) et le compte (jamais affiché à zéro, la
   * barre disparaît avec lui) sont ce que #2223 demandait explicitement.
   */
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkArchiving, setBulkArchiving] = useState(false)

  // Changer de tiroir (actifs / rangés) : la liste affichée n'est plus la bonne,
  // on repart de « chargement ».
  useEffect(() => {
    setThreads(null)
    setFailed(false)
  }, [showArchived])

  /**
   * #1955.2 — LE CHAMP « Rechercher… » INTERROGE AUSSI LE SERVEUR.
   *
   * Mesuré sur `origin/main` le 16/09/2026 : ce champ ne faisait qu'un filtre
   * LOCAL (`filterThreads`) sur les fils déjà chargés — 20 au plus. `GET
   * chat/threads/search`, montée et servie en production depuis #1955.2, n'était
   * appelée par aucune ligne de `apps/web/src`. Chercher le 21e fil ne rendait
   * donc rien, et le vide se lisait « ce fil n'existe pas ».
   *
   * UN SEUL CHAMP (GA-26) : c'est le même, qui fait maintenant les deux. Le
   * filtre local répond à la frappe, sans réseau ; la lecture serveur arrive
   * derrière et AJOUTE ce qui était hors de la page. Les deux se complètent au
   * lieu de se remplacer parce que leurs corpus diffèrent (voir
   * `searchAgentChatThreads`) — un fil renommé à la main n'est trouvé que par le
   * filtre local.
   *
   * ⚠️ Une recherche serveur en panne ne VIDE PAS la liste : on retombe sur le
   * filtre local, jamais sur « aucun résultat » qui serait un mensonge.
   */
  const [serverMatches, setServerMatches] = useState<AgentChatHistoryItem[] | null>(null)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const needle = query.trim()
    if (!needle) {
      setServerMatches(null)
      setSearching(false)
      return
    }
    let alive = true
    setSearching(true)
    // Le délai évite une requête par caractère tapé — la frappe reste servie par
    // le filtre local pendant ce temps.
    const timer = setTimeout(() => {
      searchAgentChatThreads(needle, showArchived)
        .then(items => {
          if (!alive) return
          setServerMatches(items)
          setSearching(false)
        })
        .catch(() => {
          if (!alive) return
          setServerMatches(null)
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query, showArchived])

  // #1911.1 — la relecture qui suit un tour arrive AVANT que Laura ait titré le
  // fil (elle le fait en tâche de fond, après l'écriture de sa réponse). Voir
  // l'effet plus bas : `settleTick` déclenche UNE seconde lecture.
  const [settleTick, setSettleTick] = useState(0)
  /**
   * Le tour (`refreshKey`) dont la liste affichée est la lecture. Un ÉTAT et
   * non une ref : une lecture qui rend une liste identique ne re-rend pas
   * (`setThreads` compare l'identité), et c'est ce changement-ci qui réveille
   * l'effet de seconde lecture.
   */
  const [loadedFor, setLoadedFor] = useState(0)
  /** Le tour pour lequel la seconde lecture a déjà été armée. */
  const settledFor = useRef(0)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // #1947 — relire aussi quand un tour vient d'être enregistré (`refreshKey`) :
  // chaque « Demander à Laura » ouvre un fil neuf, et il doit apparaître ici tout
  // de suite. La liste reste affichée pendant la relecture — pas de clignotement.
  useEffect(() => {
    let alive = true
    const readFor = refreshKey
    listAgentChatHistory(showArchived)
      .then(items => {
        if (!alive) return
        setLoadedFor(readFor)
        setThreads(items)
        setFailed(false)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [showArchived, refreshKey, settleTick])

  /**
   * #1911.1 — le titre de Laura arrive sans recharger.
   *
   * Une seconde lecture, UNE par tour, et seulement quand le fil le plus récent
   * de la lecture de CE tour n'a encore aucun titre stocké. `settledFor` est ce
   * qui en fait une relecture et pas une boucle : la relecture change `threads`,
   * et sans lui cet effet se réarmerait à chaque réponse — le défaut « un effet
   * qui relit sans fin » que ce dépôt a déjà payé.
   *
   * Le minuteur vit dans une ref et n'est pas annulé quand `threads` change : un
   * rangement ou un renommage pendant l'attente ne doit pas faire perdre le titre.
   */
  useEffect(() => {
    if (refreshKey === 0 || showArchived) return
    if (loadedFor !== refreshKey || settledFor.current === refreshKey) return
    if (!threads?.[0] || threads[0].title_source) return
    settledFor.current = refreshKey
    settleTimer.current = setTimeout(() => setSettleTick(tick => tick + 1), TITLE_SETTLE_MS)
  }, [refreshKey, showArchived, threads, loadedFor])

  useEffect(() => {
    const timer = settleTimer
    return () => clearTimeout(timer.current)
  }, [])

  // La saisie du renommage prend le focus et sélectionne le titre : on tape
  // directement le nouveau.
  useEffect(() => {
    if (!editingId) return
    renameInput.current?.focus()
    renameInput.current?.select()
  }, [editingId])

  /**
   * De quel COMPTE parle ce fil — pour le montrer, pas pour le deviner.
   *
   * La liste n'affichait que le premier message et une date : « Utiliser ta
   * connaissance sur AIRBUS et trouve… » et « Compare mes comptes suivis… » se
   * ressemblaient, alors que l'un est cadré sur un compte et l'autre sur tout
   * le portefeuille. Le logo répond d'un coup d'œil à « c'est lequel, celui-là ».
   *
   * ⚠️ Un compte ABSENT de la liste chargée (page suivante, compte archivé) ne
   * rend RIEN plutôt qu'une pastille grise : une pastille sans nom se lit comme
   * un compte qu'on n'arrive pas à charger, alors que ce fil-là n'a peut-être
   * simplement aucun compte. Un fil de portefeuille n'est pas un fil cassé.
   */
  const { data: accountsData } = useAccounts({ status: 'completed' })
  const accountById = useMemo(() => {
    // Le hook est PAGINÉ : ses lignes vivent dans `pages[].data`. Lire un
    // `items` qui n'existe pas rendrait une carte vide en silence — donc aucun
    // logo nulle part, sans qu'aucun test ne tombe.
    const rows = accountsData?.pages.flatMap(page => page.data) ?? []
    return new Map(rows.map(account => [account.id, account]))
  }, [accountsData])

  /**
   * #1911.2 — LE NOM DU COMPTE D'UN FIL, ou rien.
   *
   * Deux sources, dans cet ordre, et pour une raison : `account_name` voyage
   * AVEC le fil (l'API le sert depuis #1911.10) et couvre donc TOUT le
   * portefeuille, là où `accountById` s'arrête à la première page du hook —
   * 25 comptes. Le portefeuille chargé ne sert plus qu'à la fenêtre de
   * déploiement où l'API est encore l'ancienne, et au logo, qui n'existe que là.
   *
   * ⚠️ Un nom BLANC n'est pas un nom : il retombe sur « on ne sait pas », jamais
   * sur une pastille sans texte — elle se lirait comme un compte en panne de
   * chargement, alors que ce fil-là n'a peut-être aucun compte.
   */
  const accountNameOf = (thread: AgentChatHistoryItem): string | null => {
    const served = thread.account_name?.trim()
    if (served) return served
    const known = (thread.account_id ? accountById.get(thread.account_id) : undefined)?.company_name?.trim()
    return known ? known : null
  }

  /** Le fil disparaît de la liste tout de suite : c'est le geste qu'on vient de
   *  faire, et attendre un rechargement le ferait paraître sans effet. */
  const drop = (id: string) => setThreads(current => (current ?? []).filter(thread => thread.id !== id))

  const targetOf = (thread: AgentChatHistoryItem) => ({
    conversationId: thread.conversation_id,
    accountId: thread.account_id,
  })

  /** Refermer le menu — et AVEC lui la liste des formats, qui vit dedans. */
  const closeMenu = () => {
    setOpenMenu(null)
    setExportOpen(false)
  }

  const archive = async (thread: AgentChatHistoryItem, archived: boolean) => {
    closeMenu()
    try {
      await setAgentChatThreadArchived(targetOf(thread), archived)
      drop(thread.id)
      toast.success(t(archived ? 'sidebarThreads.archived' : 'sidebarThreads.unarchived'))
    } catch {
      toast.error(t('sidebarThreads.actionFailed'))
    }
  }

  const toggleSelectMode = () => {
    setSelectMode(current => !current)
    setSelectedIds(new Set())
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  /**
   * #2223 — RANGER LA SÉLECTION, d'un seul geste.
   *
   * Même route que le rangement d'UN fil (`setAgentChatThreadArchived`),
   * appelée une fois par fil sélectionné : aucun endpoint « en lot » n'existe
   * côté serveur, et il n'y a pas de raison d'en écrire un pour un geste dont
   * le volume reste celui d'un tiroir de conversations. Un échec partiel se
   * dit par l'échec global — Promise.all rejette dès le premier — plutôt que
   * de laisser croire que tout est rangé quand une partie ne l'est pas.
   */
  const bulkArchive = async () => {
    const targets = (threads ?? []).filter(item => selectedIds.has(item.id))
    if (targets.length === 0 || bulkArchiving) return
    setBulkArchiving(true)
    try {
      await Promise.all(targets.map(item => setAgentChatThreadArchived(targetOf(item), true)))
      const ids = new Set(targets.map(item => item.id))
      setThreads(current => (current ?? []).filter(item => !ids.has(item.id)))
      toast.success(t('sidebarThreads.archivedSelected', { count: targets.length }))
      setSelectedIds(new Set())
    } catch {
      toast.error(t('sidebarThreads.actionFailed'))
    } finally {
      setBulkArchiving(false)
    }
  }

  /**
   * #1955.8 — DUPLIQUER un fil.
   *
   * « Un fil dupliqué apparaîtra comme un nouveau fil indépendant. » Le serveur
   * recopie les messages sous une clé NEUVE ; le fil d'origine n'est pas touché,
   * et c'est pour ça qu'on relit la liste plutôt que d'y injecter une ligne
   * devinée — la copie arrive avec sa vraie date et son vrai titre.
   *
   * Rien n'écrit tout seul : ce geste n'existe que sous un clic.
   */
  const duplicate = async (thread: AgentChatHistoryItem) => {
    closeMenu()
    try {
      await duplicateAgentChatThread(targetOf(thread))
      // La copie n'est pas dans la liste affichée : on la relit, sans vider
      // l'écran — le fil source reste visible pendant ce temps.
      setSettleTick(tick => tick + 1)
      toast.success(t('sidebarThreads.duplicated'))
    } catch {
      toast.error(t('sidebarThreads.actionFailed'))
    }
  }

  /**
   * #1955.7 / #1955.15 à #1955.23 — EXPORTER le fil dans l'un des trois formats.
   *
   * Une LECTURE : le fichier part à l'appelant, qui lit déjà ce fil à l'écran
   * (côté API, `@WorkspaceRead` + espace résolu depuis le jeton). Le
   * téléchargement passe par le mécanisme DÉJÀ livré de l'app
   * (`downloadDocument`) — voir `exportAgentChatThread`.
   */
  const exportThread = async (thread: AgentChatHistoryItem, format: ChatThreadExportFormat) => {
    closeMenu()
    try {
      await exportAgentChatThread(targetOf(thread), format)
    } catch (error) {
      // Un export qui n'aboutit pas le DIT : sans cela, le clic n'aurait l'air
      // de rien faire, et on le rejouerait indéfiniment. #2081.14 — un refus de
      // la règle d'espace se dit par sa phrase.
      toast.error(workspaceRuleRefusalText(error) ?? t('sidebarThreads.exportFailed'))
    }
  }

  const remove = async (thread: AgentChatHistoryItem) => {
    closeMenu()
    // #2430.9 (20/09/2026) — les messages ne disparaissent plus : ce geste les
    // ARCHIVE (retrouvables via « Voir les conversations rangées »), comme
    // « Ranger » ; seuls le titre et les documents joints partent pour de bon.
    // Toujours confirmé : la phrase dit ce qui part pour de bon, et ce qui
    // reste (ce qui a été sauvegardé depuis Laura vit ailleurs).
    if (!window.confirm(t('sidebarThreads.deleteConfirm'))) return
    try {
      await deleteAgentChatThread(targetOf(thread))
      drop(thread.id)
      toast.success(t('sidebarThreads.deleted'))
    } catch (error) {
      // #1943.11 — une permission insuffisante SE NOMME : le contrôleur explique
      // déjà (« Rôle insuffisant pour cette action », `ia-proxy.controller.ts`),
      // un refus générique l'écraserait et enverrait chercher une panne qui
      // n'existe pas. Même geste que `CopilotCards.tsx::act()` : l'erreur porte
      // sa phrase, on la montre plutôt que de la deviner.
      toast.error(error instanceof Error && error.message ? error.message : t('sidebarThreads.actionFailed'))
    }
  }

  /**
   * #1911.12 / #1955.1 — renommer un fil.
   *
   * Pas d'affichage optimiste : l'écran montre le titre que le serveur a
   * ENREGISTRÉ (blancs repliés), jamais une saisie qu'il aurait refusée. Un
   * titre vide ou inchangé ne part pas — un aller-retour qui n'écrit rien.
   */
  const rename = async (thread: AgentChatHistoryItem) => {
    if (editing?.id !== thread.id) return
    const title = editing.draft.replace(/\s+/g, ' ').trim()
    setEditing(null)
    if (!title || title === thread.title) return
    try {
      const saved = await renameAgentChatThread(targetOf(thread), title)
      // Un fil ancien sans clé de conversation se désigne par son compte, comme
      // pour l'archivage : toutes ses lignes portent le même titre.
      const sameThread = (entry: AgentChatHistoryItem) =>
        thread.conversation_id
          ? entry.conversation_id === thread.conversation_id
          : !entry.conversation_id && entry.account_id === thread.account_id
      setThreads(current =>
        (current ?? []).map(entry =>
          sameThread(entry) ? { ...entry, title: saved.title, title_source: 'user' as const } : entry,
        ),
      )
      toast.success(t('sidebarThreads.renamed'))
    } catch {
      toast.error(t('sidebarThreads.actionFailed'))
    }
  }

  /**
   * #1911.11 / #1955.2 — CE QUI EST MONTRÉ : le filtre local, PLUS ce que le
   * serveur a trouvé au-delà de la page chargée.
   *
   * Une union, pas un remplacement — les deux corpus diffèrent (docblock de
   * `searchAgentChatThreads`). Le filtre local d'abord, parce qu'il est ce que
   * l'œil voyait déjà dans la liste ; les fils venus de plus loin ensuite, dans
   * l'ordre de récence servi par l'API. Un fil présent des deux côtés n'est
   * compté qu'une fois : c'est le même fil, pas deux.
   *
   * L'union elle-même vit dans `mergeSearchResults` (GA-26, une dérivation à un
   * seul endroit) : les deux lots l'avaient écrite chacun de son côté, l'un ici
   * en ligne, l'autre dans `lib/conversation.ts` — deux copies divergent.
   */
  const shown = useMemo(() => {
    const local = filterThreads(threads ?? [], query)
    const found = !query.trim() || !serverMatches?.length ? local : mergeSearchResults(local, serverMatches)
    // #1910.8 — le filtre s'applique EN DERNIER : il rétrécit ce que la
    // recherche a trouvé, il ne cherche pas dans un autre corpus.
    // #3367 — dédoublonné juste avant l'affichage : la ligne « en attente »
    // sans `conversation_id` s'efface au profit de celle, du même titre et du
    // même compte, qui en porte un.
    return dedupeThreads(sharedOnly ? sharedThreads(found, self) : found)
  }, [threads, query, serverMatches, sharedOnly, self])

  /**
   * #1910.8 — le filtre n'apparaît QUE mesuré : sans un seul fil ouvert par
   * quelqu'un d'autre, un bouton « Partagées » promet un tri qui ne rendrait
   * jamais rien. Même règle que la pastille de l'en-tête.
   */
  const hasShared = useMemo(() => sharedThreads(threads ?? [], self).length > 0, [threads, self])

  /** Les noms que l'écran connaît déjà : le repli quand l'API ne sert pas encore `account_name`. */
  const knownNames = useMemo(
    () => new Map([...accountById].map(([id, account]) => [id, account.company_name])),
    [accountById],
  )

  // #1911.7 — décision 13/09 batch 11 : la liste se range par date (défaut) ou
  // par compte, jamais les deux imbriqués. La recherche filtre AVANT : un groupe
  // dont aucun fil ne correspond disparaît avec eux.
  const groups = useMemo(
    () => (grouping === 'account' ? groupThreadsByAccount(shown, knownNames) : groupThreadsByDate(shown, new Date())),
    [grouping, shown, knownNames],
  )

  /**
   * #1944.12 — ROVING TABINDEX sur la liste des fils : UN SEUL lien de la
   * liste est un arrêt Tab (`tabIndex=0`), tous les autres sont à `-1` et se
   * rejoignent aux flèches (↑/↓/Home/End). Sans ça, une liste de cent fils
   * fait cent arrêts Tab avant d'atteindre le composeur — le motif WAI-ARIA
   * veut UN SEUL arrêt pour tout un groupe de navigation apparenté.
   *
   * Délégué au conteneur (pas de `ref` par lien) : les groupes se réordonnent
   * déjà (par date / par compte), et l'ordre DOM de `querySelectorAll` EST
   * l'ordre visuel — aucun état de position dupliqué à tenir synchronisé.
   */
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const flatThreadIds = useMemo(() => groups.flatMap(group => group.threads.map(thread => thread.id)), [groups])

  useEffect(() => {
    setActiveThreadId(current => (current && flatThreadIds.includes(current) ? current : (flatThreadIds[0] ?? null)))
  }, [flatThreadIds])

  const rovingTabIndex = activeThreadId ?? flatThreadIds[0] ?? null

  function handleThreadListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (!target.dataset.threadLink) return
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[data-thread-link]'))
    const currentIndex = links.indexOf(target as HTMLAnchorElement)
    if (currentIndex === -1) return
    event.preventDefault()
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(currentIndex + 1, links.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(currentIndex - 1, 0)
          : event.key === 'Home'
            ? 0
            : links.length - 1
    const nextLink = links[nextIndex]
    const nextId = nextLink?.dataset.threadLink
    if (!nextLink || !nextId) return
    setActiveThreadId(nextId)
    nextLink.focus()
  }

  function handleThreadListFocus(event: React.FocusEvent<HTMLDivElement>) {
    const id = (event.target as HTMLElement).dataset.threadLink
    if (id) setActiveThreadId(id)
  }

  /** Le libellé d'un intercalaire : traduit pour les groupes fixes, le NOM pour un compte. */
  const groupLabel = (group: ThreadGroup): string => {
    switch (group.kind === 'date' ? group.key : group.kind) {
      case 'today':
        return t('sidebarThreads.groups.today')
      case 'thisWeek':
        return t('sidebarThreads.groups.thisWeek')
      case 'older':
        return t('sidebarThreads.groups.older')
      case 'undated':
        return t('sidebarThreads.groups.undated')
      case 'noAccount':
        return t('sidebarThreads.groups.noAccount')
      default:
        // Un groupe de compte a toujours un nom (`thread-groups.ts`) ; sans lui, il
        // serait « introuvable » — jamais un identifiant.
        return group.label ?? t('sidebarThreads.groups.unknownAccount')
    }
  }

  return (
    <div className="space-y-1 px-1.5" onKeyDown={handleThreadListKeyDown} onFocus={handleThreadListFocus}>
      {/*
        `?new=1` et non `/chat` tout court.

        ⚠️ Vers `/chat` nu, depuis l'écran `/chat`, l'URL ne changeait pas : rien
        ne se passait et le bouton avait l'air cassé. Depuis un fil ouvert il
        faisait pire — il ramenait sur le fil `general`, DÉJÀ écrit, en laissant
        croire qu'on repartait de zéro.

        Le paramètre ouvre le choix de PORTÉE (ce que demande la maquette), et
        `Chat` le retire aussitôt de l'URL pour que le clic suivant redéclenche.
      */}
      <Link
        to="/chat"
        search={{ new: '1' }}
        // Théo B l1-laura (bibliothèque) : « + Nouvelle conversation » est un bouton bordé teinté d'accent, pleine largeur.
        className="mb-1 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-2 text-[var(--bellum-text-accent)] transition-colors hover:border-[var(--bellum-text-accent)] md:min-h-9"
      >
        <Plus className="size-4 shrink-0" aria-hidden />
        <Text size="xs" weight="semibold" color="text-[var(--bellum-text-accent)]">
          {t('sidebarThreads.new')}
        </Text>
      </Link>

      {/* La recherche n'apparaît qu'à partir de six fils : en dessous, on lit la
          liste plus vite qu'on ne tape, et le champ ne fait qu'occuper la place
          des conversations. */}
      {threads !== null && threads.length > 5 && (
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 md:min-h-9">
          <Search className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('sidebarThreads.search')}
            aria-label={t('sidebarThreads.search')}
            className="w-full bg-transparent text-xs text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
          />
        </label>
      )}

      {/* #1911.7 / #1911.10 — la bascule « Par date » / « Par compte ». Elle
          n'apparaît qu'à partir de deux fils : ranger une seule ligne n'apprend
          rien. Deux boutons à `aria-pressed` plutôt qu'un menu : les deux
          choix se lisent d'un coup d'œil, et chacun est une cible de 44 px au
          doigt (GA-30). */}
      {/* #1910.8 — « Partagées » : retrouver les fils ouverts par un collègue.
          Un interrupteur à `aria-pressed`, cible de 44 px au doigt (GA-30). */}
      {!failed && hasShared && (
        <button
          type="button"
          aria-pressed={sharedOnly}
          title={t('sidebarThreads.sharedFilter.title')}
          onClick={() => {
            closeMenu()
            setSharedFilterScope(current => (isSharedScope(current) ? PORTFOLIO_SCOPE : SHARED_SCOPE))
          }}
          className={cn(
            'flex min-h-7 pointer-coarse:min-h-11 w-full items-center gap-1.5 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
            sharedOnly
              ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] font-medium text-[var(--bellum-text-primary)]'
              : 'border-transparent text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <Users className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{t('sidebarThreads.sharedFilter.label')}</span>
        </button>
      )}

      {!failed && threads !== null && threads.length > 1 && (
        <div
          role="group"
          aria-label={t('sidebarThreads.grouping.label')}
          className="flex gap-0.5 rounded-md border border-[var(--bellum-border)] p-0.5"
        >
          {(['date', 'account'] as const).map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={grouping === option}
              onClick={() => {
                closeMenu()
                setGrouping(option)
              }}
              className={cn(
                'flex min-h-7 pointer-coarse:min-h-11 min-w-0 flex-1 items-center justify-center rounded px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
                grouping === option
                  ? 'bg-[var(--bellum-surface-2)] font-medium text-[var(--bellum-text-primary)]'
                  : 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              <span className="truncate">
                {t(option === 'date' ? 'sidebarThreads.grouping.byDate' : 'sidebarThreads.grouping.byAccount')}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* #2223 — « sélectionner une ou plusieurs discussions… pour les
          archiver ». Un interrupteur, comme le filtre « Partagées » ci-dessus :
          n'apparaît qu'à partir de deux fils, sinon sélectionner une seule
          ligne n'apprend rien. */}
      {!failed && threads !== null && threads.length > 1 && (
        <button
          type="button"
          aria-pressed={selectMode}
          onClick={() => {
            closeMenu()
            toggleSelectMode()
          }}
          className={cn(
            'flex min-h-7 pointer-coarse:min-h-11 w-full items-center gap-1.5 rounded-md border px-2 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]',
            selectMode
              ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] font-medium text-[var(--bellum-text-primary)]'
              : 'border-transparent text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <ListChecks className="size-3 shrink-0" aria-hidden />
          <span className="truncate">
            {t(selectMode ? 'sidebarThreads.exitSelectMode' : 'sidebarThreads.selectMode')}
          </span>
        </button>
      )}

      {/* La barre de sélection : jamais affichée à ZÉRO — un compte à zéro
          serait un mensonge (« rien » n'est pas la même chose que « 0 »), et
          la seule action qu'elle porte est RANGER (doctrine : on archive, on
          ne supprime pas). */}
      {selectMode && selectedIds.size > 0 && (
        <div className="sticky bottom-0 z-widget flex items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 shadow-sm">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
            {t('sidebarThreads.selectedCount', { count: selectedIds.size })}
          </Text>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={bulkArchiving}
              onClick={() => void bulkArchive()}
              className="flex min-h-7 items-center gap-1 rounded-md px-2 pointer-coarse:min-h-11 text-xs font-medium text-[var(--bellum-text-accent)] transition-colors hover:bg-[var(--bellum-surface-2)] disabled:opacity-50"
            >
              <Archive className="size-3.5 shrink-0" aria-hidden />
              {t('sidebarThreads.archiveSelected')}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="flex min-h-7 items-center rounded-md px-2 pointer-coarse:min-h-11 text-xs text-[var(--bellum-text-muted)] transition-colors hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]"
            >
              <X className="size-3.5 shrink-0" aria-hidden />
              {t('sidebarThreads.clearSelection')}
            </button>
          </div>
        </div>
      )}

      {failed ? (
        /* Une liste illisible se DIT. Vide, elle se lirait « tu n'as jamais
           parlé à Laura » — et on rouvrirait un fil qui existe déjà. */
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1">
          {t('sidebarThreads.unavailable')}
        </Text>
      ) : threads === null ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1">
          {t('sidebarThreads.loading')}
        </Text>
      ) : shown.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="px-2 py-1">
          {/* #1955.2 — une recherche sans résultat dit CE QU'ELLE A CHERCHÉ, et
              nomme le mot. « 0 » ou « Aucun résultat » se lisent comme un
              compteur : ici il n'y a rien à compter, il y a une phrase vraie —
              aucun fil de l'historique lu ne contient ce mot. Tant que la
              lecture serveur n'est pas revenue, on le DIT plutôt que d'annoncer
              une absence qu'on ne connaît pas encore. */}
          {query.trim()
            ? searching
              ? t('sidebarThreads.searching')
              : t('sidebarThreads.noMatch', { query: query.trim() })
            : /* #1910.8 — un filtre actif DIT ce qu'il a filtré : « aucune
                 conversation » seul se lirait « tu n'as jamais parlé à Laura ». */
              t(
                sharedOnly
                  ? 'sidebarThreads.sharedFilter.empty'
                  : showArchived
                    ? 'sidebarThreads.emptyArchived'
                    : 'sidebarThreads.empty',
              )}
        </Text>
      ) : (
        groups.map(group => {
          const headingId = `${groupIdPrefix}-${group.key}`
          const groupAccount =
            group.kind === 'account' && group.threads[0]?.account_id
              ? accountById.get(group.threads[0].account_id)
              : undefined
          return (
            /* Un GROUPE nommé par son intercalaire : un lecteur d'écran annonce
               « Aujourd'hui » ou « LATECOERE » en y entrant. L'intercalaire n'est
               pas un bouton — rien ne se déplie (voir le docblock). */
            <div key={group.key} role="group" aria-labelledby={headingId} className="space-y-1 pt-1">
              <span id={headingId} className="flex min-w-0 items-center gap-1.5 px-2 pt-1">
                {group.kind === 'account' && group.label ? (
                  <CompanyAvatar
                    name={group.label}
                    logoUrl={groupAccount?.logo_url}
                    website={groupAccount?.website}
                    size="sm"
                  />
                ) : null}
                <Text
                  element="span"
                  size="xs"
                  weight="semibold"
                  color="text-[var(--bellum-text-secondary)]"
                  className="truncate uppercase tracking-wider"
                >
                  {groupLabel(group)}
                </Text>
              </span>
              {group.threads.map(thread => (
                /* Le lien reste un lien — la ligne entière s'ouvre. Le menu est un
                   VOISIN et non un enfant : un bouton dans un lien fait un clic
                   ambigu, et le clavier ne saurait plus lequel des deux il vise. */
                <div key={thread.id} className="group/thread relative flex items-center">
                  {/* #2223 — la case ne remplace pas le lien : cocher SÉLECTIONNE,
                      ouvrir le fil reste le clic sur la ligne. */}
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(thread.id)}
                      onChange={() => toggleSelected(thread.id)}
                      aria-label={t('sidebarThreads.selectThread', {
                        title: thread.title || t('sidebarThreads.untitled'),
                      })}
                      className="mr-1 size-4 shrink-0 pointer-coarse:size-11"
                    />
                  )}
                  <Link
                    to="/chat"
                    search={{
                      ...(thread.account_id ? { accountId: thread.account_id } : {}),
                      ...(thread.conversation_id ? { conversationId: thread.conversation_id } : {}),
                    }}
                    data-thread-link={thread.id}
                    tabIndex={thread.id === rovingTabIndex ? 0 : -1}
                    className={cn(
                      'flex min-h-8 pointer-coarse:min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-1 transition-colors',
                      'hover:bg-[var(--bellum-surface-2)]',
                    )}
                  >
                    {/* Le compte du fil, quand on le connaît. `shrink-0` : sans lui,
                        un enfant de flex prend `min-width: auto` et la pastille se
                        fait écraser par un titre long au lieu de le tronquer. */}
                    {(() => {
                      const account = thread.account_id ? accountById.get(thread.account_id) : undefined
                      if (!account) return null
                      // #1911.10 — rangé par compte, le logo est déjà sur l'intercalaire :
                      // le redire sur chaque ligne montrerait deux fois la même chose
                      // (loi 4). Le nom reste dans le nom accessible du lien.
                      if (grouping === 'account') return <span className="sr-only">{account.company_name ?? ''}</span>
                      return (
                        <span className="mt-0.5 shrink-0">
                          <CompanyAvatar
                            name={account.company_name ?? '?'}
                            logoUrl={account.logo_url}
                            website={account.website}
                            size="sm"
                          />
                          {/* `CompanyAvatar` est `aria-hidden` — décoratif par
                              construction. Si le logo est la SEULE chose qui
                              distingue deux fils aux titres voisins, un lecteur
                              d'écran n'entend donc rien du tout. Le nom du compte
                              est rendu LISIBLE sur la ligne méta (#1911.2), et
                              c'est lui qui entre dans le nom accessible du lien. */}
                        </span>
                      )
                    })()}
                    <span className="flex min-w-0 flex-1 flex-col justify-center">
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="line-clamp-2">
                        {thread.title || t('sidebarThreads.untitled')}
                      </Text>
                      {/* #1911.4 / #1911.6 — la ligne MÉTA : qui a OUVERT le fil (prénom +
                          avatar, initiales sans photo), puis sa dernière activité. Un fil
                          sans auteur connu (compte effacé, API antérieure) ne montre que
                          sa date — personne n'est deviné. */}
                      {/* #3769 (R31, 1512 px) : `flex-wrap` — la colonne fait 240 px ; compte, auteur, date et statut
                          ne tiennent pas toujours sur une ligne, et « SNCF » (32 px dans 22) ou « Maëlle » (37 dans 17)
                          se coupaient. Un élément court passe à la ligne au lieu d'être rogné. */}
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                        {/* #1911.2 — LE COMPTE DU FIL SE LIT, il n'est pas seulement annoncé.
                            Mesuré le 13/09/2026 sur `/chat` : le nom ne vivait qu'en
                            `sr-only` à côté d'une pastille à initiales, et une pastille
                            générique ne répond pas à « ce fil, il parle de qui ? ». Et un
                            fil dont le compte tombait hors des 25 premiers du portefeuille
                            n'avait NI logo NI nom — alors que l'API sert `account_name` sur
                            chaque fil, et que `thread-groups.ts` s'en sert déjà pour ses
                            intercalaires : du code juste, que cet écran-ci n'appelait pas.
                            Rangé PAR COMPTE, l'intercalaire le porte déjà (loi 4). */}
                        {grouping !== 'account' && accountNameOf(thread) ? (
                          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="max-w-full truncate">
                            {accountNameOf(thread)}
                          </Text>
                        ) : null}
                        {thread.author ? (
                          <MessageAuthor
                            author={thread.author}
                            label={t('sidebarThreads.startedBy', { firstName: thread.author.firstName })}
                            size="meta"
                            className="shrink-0"
                          />
                        ) : null}
                        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="shrink-0">
                          {formatDay(activityIsoOf(thread), i18n.language)}
                        </Text>
                        {/* #1911.5 — LE STATUT DU FIL : « en attente » = j'ai écrit,
                            Laura n'a pas encore répondu. Dérivé du RÔLE du dernier
                            message (`thread-status.ts`), jamais d'une date — et rien
                            ne s'affiche quand le rôle est inconnu (API antérieure au
                            champ, lecture en échec) : un fil ne se dit pas « en
                            attente » par défaut. Ce n'est PAS une action à valider,
                            celle-là vit dans le plan d'action (loi 4). */}
                        {(() => {
                          const status = threadStatusOf(thread, { archived: showArchived })
                          if (!status) return null
                          return (
                            <Text
                              size="xs"
                              color="text-[var(--bellum-text-muted)]"
                              className="shrink-0"
                              title={t(`${threadStatusLabelKey(status)}Label`)}
                            >
                              {t(threadStatusLabelKey(status))}
                            </Text>
                          )
                        })()}
                      </span>
                    </span>
                  </Link>

                  <button
                    type="button"
                    aria-label={t('sidebarThreads.menu')}
                    aria-expanded={openMenu === thread.id}
                    onClick={() =>
                      setOpenMenu(current => {
                        const next = current === thread.id ? null : thread.id
                        // Rouvrir un menu le rouvre REPLIÉ : les trois formats
                        // d'export du fil précédent n'ont rien à faire ici.
                        setExportOpen(false)
                        return next
                      })
                    }
                    /* Visible au survol ET au focus clavier : un menu qui n'apparaît
                       qu'à la souris n'existe pas pour qui navigue au clavier.

                       ⚠️ #1955.7 — NI POUR QUI TOUCHE. Mesuré le 16/09/2026 : la
                       règle s'arrêtait à `group-hover` + `focus-visible`, et ce
                       composant est monté DEUX fois — la colonne (≥ 768 px) et
                       `ConversationsDrawer`, le tiroir du téléphone. Un doigt ne
                       survole pas : sur mobile ce bouton restait à `opacity: 0`,
                       donc Renommer, Ranger, Supprimer — et maintenant Exporter
                       et Dupliquer — n'existaient tout simplement pas. D'où
                       `pointer-coarse:opacity-100` : visible en permanence là où
                       le pointeur est grossier, inchangé à la souris. Et la
                       cible passe à 44 px au doigt (GA-30) : `p-1` autour d'une
                       icône de 14 px en faisait 22. */
                    className={cn(
                      'flex shrink-0 items-center justify-center rounded p-1 text-[var(--bellum-text-muted)] transition-opacity',
                      'pointer-coarse:min-h-11 pointer-coarse:min-w-11',
                      'opacity-0 group-hover/thread:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
                      'hover:text-[var(--bellum-text-primary)]',
                      openMenu === thread.id && 'opacity-100',
                    )}
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden />
                  </button>

                  {/* #1911.12 / #1955.1 — la saisie EN PLACE, posée par-dessus la ligne :
                      le lien reste monté dessous, dans le même rendu. Entrée valide,
                      Échap annule, quitter le champ annule aussi — seul un geste
                      explicite écrit un titre. */}
                  {editing?.id === thread.id && (
                    <form
                      className="absolute inset-0 z-overlay flex items-center bg-[var(--bellum-bg)]"
                      onSubmit={event => {
                        event.preventDefault()
                        void rename(thread)
                      }}
                    >
                      <input
                        ref={renameInput}
                        type="text"
                        value={editing.draft}
                        maxLength={CHAT_THREAD_TITLE_MAX_LENGTH}
                        aria-label={t('sidebarThreads.renameLabel')}
                        onChange={event => setEditing({ id: thread.id, draft: event.target.value })}
                        onKeyDown={event => {
                          if (event.key !== 'Escape') return
                          event.preventDefault()
                          setEditing(null)
                        }}
                        onBlur={() => setEditing(null)}
                        className="min-h-8 pointer-coarse:min-h-11 w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-2 text-xs text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)]"
                      />
                    </form>
                  )}

                  {openMenu === thread.id && (
                    <div className="absolute right-0 top-full z-overlay mt-0.5 min-w-40 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.16)]">
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu()
                          setEditing({ id: thread.id, draft: thread.title ?? '' })
                        }}
                        className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                      >
                        <Pencil className="size-3.5 shrink-0" aria-hidden />
                        {t('sidebarThreads.rename')}
                      </button>
                      {/* #1955.8 — DUPLIQUER. Le geste rejoint sa famille : il
                          vit dans le menu qui porte déjà Renommer / Ranger /
                          Supprimer, il ne s'invente pas un emplacement. */}
                      <button
                        type="button"
                        onClick={() => void duplicate(thread)}
                        className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                      >
                        <Copy className="size-3.5 shrink-0" aria-hidden />
                        {t('sidebarThreads.duplicate')}
                      </button>
                      {/* #1955.7 / #1955.15-.17 — EXPORTER, et ses trois formats
                          dépliés SOUS lui, dans le même menu : un second menu
                          flottant refermerait le premier, et sur 240 px il
                          sortirait de la colonne. */}
                      {dataExit.allowed ? (
                        <button
                          type="button"
                          aria-expanded={exportOpen}
                          onClick={() => setExportOpen(current => !current)}
                          className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                        >
                          <Download className="size-3.5 shrink-0" aria-hidden />
                          <span className="flex-1">{t('sidebarThreads.export')}</span>
                          <ChevronRight
                            className={cn('size-3.5 shrink-0 transition-transform', exportOpen && 'rotate-90')}
                            aria-hidden
                          />
                        </button>
                      ) : null}
                      {exportOpen &&
                        dataExit.allowed &&
                        EXPORT_FORMATS.map(format => (
                          <button
                            key={format}
                            type="button"
                            onClick={() => void exportThread(thread, format)}
                            className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded py-1 pl-7 pr-2 text-left text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                          >
                            {t(`sidebarThreads.exportFormats.${format}`)}
                          </button>
                        ))}
                      <button
                        type="button"
                        onClick={() => void archive(thread, !showArchived)}
                        className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
                      >
                        {showArchived ? (
                          <ArchiveRestore className="size-3.5 shrink-0" aria-hidden />
                        ) : (
                          <Archive className="size-3.5 shrink-0" aria-hidden />
                        )}
                        {t(showArchived ? 'sidebarThreads.unarchive' : 'sidebarThreads.archive')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(thread)}
                        className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-2 rounded px-2 text-left text-xs text-[var(--danger-soft-text)] hover:bg-[var(--bellum-surface-2)]"
                      >
                        {/* #2430.9 — plus une corbeille : ce geste n'efface plus les
                            messages (ils s'archivent), seulement son titre et ses
                            documents joints. */}
                        <ArchiveX className="size-3.5 shrink-0" aria-hidden />
                        {t('sidebarThreads.delete')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        })
      )}

      {/* Le tiroir. Il n'apparaît que s'il y a quelque chose dedans OU qu'on y
          est déjà : proposer d'ouvrir un tiroir vide est du bruit. */}
      {(showArchived || (threads?.length ?? 0) > 0) && (
        <button
          type="button"
          onClick={() => {
            closeMenu()
            setShowArchived(current => !current)
          }}
          className="flex min-h-8 pointer-coarse:min-h-11 w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[var(--bellum-text-muted)] transition-colors hover:bg-[var(--bellum-surface-2)]"
        >
          <Archive className="size-3 shrink-0" aria-hidden />
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t(showArchived ? 'sidebarThreads.showActive' : 'sidebarThreads.showArchived')}
          </Text>
        </button>
      )}
    </div>
  )
}

/**
 * #1911.1 — combien de temps après un tour relire la liste pour y voir le titre
 * que Laura rédige en tâche de fond. L'API lui laisse 15 s au plus ; en pratique
 * un modèle léger rend une ligne en une à trois secondes. Au-delà de ce délai le
 * titre n'est pas perdu : il apparaît à la relecture du tour suivant.
 */
const TITLE_SETTLE_MS = 8_000

/**
 * #1955.2 — le délai avant d'interroger le serveur.
 *
 * La frappe reste servie par le filtre local pendant ce temps : le champ ne
 * paraît jamais lent, et on n'envoie pas une requête par caractère.
 */
const SEARCH_DEBOUNCE_MS = 250

/** #1955.15 / #1955.16 / #1955.17 — l'ordre affiché des trois formats. */
const EXPORT_FORMATS: readonly ChatThreadExportFormat[] = ['md', 'pdf', 'json']

/** Jour court localisé. Date illisible ⇒ rien plutôt qu'une date inventée. */
function formatDay(iso: string | null | undefined, language: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}
