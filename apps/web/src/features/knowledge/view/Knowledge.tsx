import {
  ActionDialog,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  SelectField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@bellum/ui'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Upload,
  Trash2,
  FileText,
  Plus,
  Search,
  Clock,
  X,
  Loader2,
  CheckCircle2,
  Pencil,
  Compass,
  HardDrive,
  RefreshCw,
  Eye,
} from 'lucide-react'
import {
  CHAT_ATTACHMENT_CATEGORY,
  RAG_CATEGORIES,
  validateRagUpload,
  marketLocaleValues,
  RAG_UPLOAD_DOCUMENT_EXTENSIONS,
  RAG_UPLOAD_MAX_BYTES,
  documentUploadBreakdown,
  ragUploadExtension,
  type LibraryItem,
  type LibraryItemKind,
  type MarketLocale,
  type RagCategory,
  type RagDocumentScope,
  type UniversalImportBreakdown,
} from '@bellum/contracts'
import { ImportFamilyReport, hasFamilyReport } from '@/features/universal-import/view/ImportFamilyReport'
import { useRagDocuments } from '@/features/rag/hooks/useRagDocuments'
import { useIngestRagDocument } from '@/features/rag/hooks/useIngestRagDocument'
import { useReplaceRagDocument } from '@/features/rag/hooks/useReplaceRagDocument'
import { useDeleteRagDocument } from '@/features/rag/hooks/useDeleteRagDocument'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { DriveImportDialog } from '@/features/google/components/DriveImportDialog'
import { DocumentPreview } from '@/features/rag/preview/DocumentPreview'
import {
  useLibraryItems,
  useCreateLibraryItem,
  useUpdateLibraryItem,
  useDeleteLibraryItem,
} from '@/features/library/hooks/useLibraryItems'
import { useCrmStatus, CRM_STATUS_KEY } from '@/features/crm/hooks/useCrmStatus'
import { useWorkspaceMarket } from '@/features/team/hooks/useWorkspaceMarket'
import { crmApi } from '@/features/crm/api'
import { CrmDataPanel } from '@/features/crm/view/CrmDataPanel'
import { CrmImportPanel } from '@/features/crm-import/view/CrmImportPanel'
import { GovernancePanel } from '@/features/governance/view/GovernancePanel'
import { OutreachAssetsTab } from './OutreachAssetsTab'
import { MessageLibraryTab } from './MessageLibraryTab'
import { MessageStyleImportTab } from './MessageStyleImportTab'
import { MessageStyleTab } from './MessageStyleTab'
import { ProcessingStatusBadge } from './ProcessingStatusBadge'
import { toast } from 'sonner'
import { ApiError } from '@/lib/api-error'
import { trackedMutation } from '@/lib/product-tracker'

/* ------------------------------------------------------------------ */
/*  Categories                                                         */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  'Template LinkedIn',
  'Template Email',
  'Pitch commercial',
  'CV / Profil consultant',
  'Reference client',
  'Autre',
]

/**
 * #2779 — choisir la portée à l'ajout, depuis l'écran « Connaissances » (seul
 * le chat la proposait jusqu'ici — `attachScopesFor`, `Chat.tsx`). `workspace`
 * en tête, le défaut d'avant cette portée. `conversation` est ABSENTE : cet
 * écran n'a pas de fil auquel la rattacher.
 */
type UploadScope = Exclude<RagDocumentScope, 'conversation'>

const UPLOAD_SCOPES: readonly UploadScope[] = ['workspace', 'personal', 'account', 'knowledge_base']

// i18n keys: documents.scope.workspace | documents.scope.personal | documents.scope.account |
//            documents.scope.knowledge_base
const UPLOAD_SCOPE_LABEL_KEY: Record<UploadScope, string> = {
  workspace: 'documents.scope.workspace',
  personal: 'documents.scope.personal',
  account: 'documents.scope.account',
  knowledge_base: 'documents.scope.knowledge_base',
}

/**
 * VU (recette prod 09/10, lot H05) — la pastille de catégorie de « Mes documents »
 * affichait le type BRUT (`account_fact`, `winning_angle`…) quand `doc.category`
 * est une des neuf valeurs DISTILLÉES (`RAG_CATEGORIES`). `doc.category` reste
 * du texte libre pour un dépôt manuel (`Notion`, `sales`, `Autre` — voir
 * `rag.ts`) : SEULES les neuf valeurs canoniques ont une traduction, le reste
 * continue de s'afficher tel quel (c'est l'ESN qui l'a écrit).
 */
const RAG_CATEGORY_LABEL_KEY: Record<RagCategory, string> = {
  account_fact: 'documents.category.account_fact',
  sector_insight: 'documents.category.sector_insight',
  winning_angle: 'documents.category.winning_angle',
  access_fact: 'documents.category.access_fact',
  partner_fact: 'documents.category.partner_fact',
  territory_insight: 'documents.category.territory_insight',
  objection_answer: 'documents.category.objection_answer',
  client_proof: 'documents.category.client_proof',
  esn_profile_fact: 'documents.category.esn_profile_fact',
}

function isDistilledRagCategory(value: string): value is RagCategory {
  return (RAG_CATEGORIES as readonly string[]).includes(value)
}

/**
 * #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du document,
 * DÉCLARÉE au dépôt, jamais détectée. Sentinelle « non renseigné » (même
 * patron que `CONTACT_LOCALE_UNSET`, `ContactRecordCard.tsx`) : la valeur
 * n'atteint JAMAIS le serveur — `handleUpload` l'omet du corps envoyé.
 */
const DOCUMENT_LANGUAGE_UNSET = '__unset__'

/** Un geste d'une ligne de document : 44 px, icône nommée par son `aria-label`, visible sans survol (GA-375). */
const DOC_ACTION =
  'inline-flex size-11 items-center justify-center rounded-control text-[var(--bellum-text-muted)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:text-[var(--bellum-text-primary)]'

type Tab = 'documents' | 'templates' | 'playbooks' | 'method' | 'crm' | 'assets' | 'library' | 'style'

/**
 * Réglages › Laura › Documents & références (maquette `settings-laura`, Théo V22 — Louis 22/10/2026) coupe cette
 * vue en deux onglets de page : « Documents » (ce que Laura peut citer) et « Style & exemples » (ce que tes messages
 * lui ont appris). Chaque moitié monte `Knowledge` avec SES onglets ; sans `tabs`, la vue garde les huit d'origine.
 */
export const KNOWLEDGE_DOCUMENT_TABS = ['documents', 'templates', 'playbooks', 'method', 'crm', 'assets'] as const
export const KNOWLEDGE_STYLE_TABS = ['style', 'library'] as const

/** i18n key of the human label per library kind — drives toasts and the editor modal title. */
// i18n keys: library.kind.template | library.kind.playbook | library.kind.method_playbook
const KIND_LABEL_KEY: Record<LibraryItemKind, string> = {
  template: 'library.kind.template',
  playbook: 'library.kind.playbook',
  method_playbook: 'library.kind.method_playbook',
}

/**
 * Lit un fichier binaire (PDF) en base64 (sans le préfixe data:) pour l'envoyer
 * au serveur qui en extraira le texte (Théo p.21). FileReader.readAsDataURL
 * produit `data:...;base64,XXXX` — on ne garde que la partie après la virgule.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })
}

/**
 * Upload lifecycle surfaced to the user (Théo p.21) : lecture du fichier →
 * extraction du texte (PDF, serveur-side pypdf) / indexation (texte) → indexé |
 * erreur. Drives the submit-button label and the inline status line.
 */
type UploadPhase = 'idle' | 'reading' | 'extracting' | 'indexing' | 'done' | 'error'

// i18n keys: documents.uploadPhase.idle | documents.uploadPhase.reading |
//            documents.uploadPhase.extracting | documents.uploadPhase.indexing |
//            documents.uploadPhase.done | documents.uploadPhase.error
const UPLOAD_PHASE_LABEL_KEY: Record<UploadPhase, string> = {
  idle: 'documents.uploadPhase.idle',
  reading: 'documents.uploadPhase.reading',
  extracting: 'documents.uploadPhase.extracting',
  indexing: 'documents.uploadPhase.indexing',
  done: 'documents.uploadPhase.done',
  error: 'documents.uploadPhase.error',
}

const BUSY_PHASES: ReadonlySet<UploadPhase> = new Set(['reading', 'extracting', 'indexing'])

/**
 * #3751 — un fichier de la file de dépôt. `refused` : refusé AVANT envoi (format,
 * taille, vide) — jamais envoyé, sa raison reste affichée. Sinon `phase` suit
 * l'envoi, un fichier à la fois ; `reason` porte le message de l'API en cas d'échec.
 */
type EntryPhase = 'pending' | 'reading' | 'extracting' | 'indexing' | 'done' | 'error'
type UploadEntry = { key: string; file: File; phase: EntryPhase; refused: boolean; reason?: string }

// i18n keys: documents.file.status.pending | documents.file.status.reading | documents.file.status.extracting |
//            documents.file.status.indexing | documents.file.status.done | documents.file.status.error
const ENTRY_STATUS_KEY: Record<EntryPhase, string> = {
  pending: 'documents.file.status.pending',
  reading: 'documents.file.status.reading',
  extracting: 'documents.file.status.extracting',
  indexing: 'documents.file.status.indexing',
  done: 'documents.file.status.done',
  error: 'documents.file.status.error',
}

const ENTRY_BUSY_PHASES: ReadonlySet<EntryPhase> = new Set(['reading', 'extracting', 'indexing'])

let entrySeq = 0

/**
 * #2779 — le compte visé par un document `scope: 'account'`. Un composant à
 * part, monté SEULEMENT quand `scope === 'account'` (rendu conditionnel dans
 * `Knowledge`) : `useAccounts` ne tire la liste des comptes de l'espace que
 * pour qui en a besoin, même patron que `AccountPicker` de
 * `LinkAccountDialog.tsx` / `CreateContactDialog.tsx`.
 */
function DocumentAccountSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation('knowledge')
  const accountsQuery = useAccounts({ limit: 100 })
  const accounts = (accountsQuery.data?.pages.flatMap(page => page.data) ?? []).filter(account =>
    account.company_name?.trim(),
  )
  return (
    <SelectField
      value={value}
      onChange={onChange}
      options={accounts.map(account => ({ value: account.id, label: account.company_name ?? account.id }))}
      placeholder={t('documents.accountPlaceholder')}
      ariaLabel={t('documents.accountSelectAria')}
      className="min-w-0 max-w-full"
    />
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Knowledge({ tabs }: { tabs?: readonly Tab[] } = {}) {
  const { t, i18n } = useTranslation('knowledge')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>(tabs?.[0] ?? 'documents')
  const [docSearch, setDocSearch] = useState('')
  const [driveOpen, setDriveOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null)
  const [copied, setCopied] = useState(false)
  // #3797.1 — la suppression est définitive : elle passe par une confirmation qui NOMME le document.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)
  // #3803 (3803.6) — le document dont l'aperçu est ouvert (`null` = fermé).
  const [previewDoc, setPreviewDoc] = useState<{ id: string; name: string } | null>(null)

  const { data: documentsData, isLoading: loading } = useRagDocuments()
  const ingest = useIngestRagDocument()
  const replaceDoc = useReplaceRagDocument()
  const deleteDoc = useDeleteRagDocument()
  const documents = documentsData ?? []

  // Knowledge library (templates, playbooks & method playbooks) — real,
  // workspace-scoped CRUD. Method playbooks are the curated plan-de-compte
  // method guides (Drive #13), seeded server-side like the rest.
  const templatesQuery = useLibraryItems('template')
  const playbooksQuery = useLibraryItems('playbook')
  const methodQuery = useLibraryItems('method_playbook')
  const createItem = useCreateLibraryItem()
  const updateItem = useUpdateLibraryItem()
  const deleteTemplate = useDeleteLibraryItem('template')
  const deletePlaybook = useDeleteLibraryItem('playbook')
  const deleteMethod = useDeleteLibraryItem('method_playbook')

  // Editor modal: create (id === null) or edit an existing item.
  const [editor, setEditor] = useState<{ kind: LibraryItemKind; item: LibraryItem | null } | null>(null)

  const handleDeleteLibraryItem = useCallback(
    async (kind: LibraryItemKind, id: string) => {
      const deleteByKind: Record<LibraryItemKind, typeof deleteTemplate> = {
        template: deleteTemplate,
        playbook: deletePlaybook,
        method_playbook: deleteMethod,
      }
      try {
        await deleteByKind[kind].mutateAsync(id)
        setSelectedItem(current => (current?.id === id ? null : current))
        toast.success(t('library.toast.deleted', { kind: t(KIND_LABEL_KEY[kind]) }))
      } catch (err) {
        console.error('[Knowledge]', err)
        toast.error(t('library.toast.deleteFailed'))
      }
    },
    [deleteTemplate, deletePlaybook, deleteMethod, t],
  )

  const handleSaveLibraryItem = useCallback(
    async (input: {
      kind: LibraryItemKind
      id: string | null
      title: string
      description: string
      category: string
      body: string
    }) => {
      const title = input.title.trim()
      const body = input.body.trim()
      if (!title || !body) {
        toast.error(t('library.toast.requiredFields'))
        return
      }
      const description = input.description.trim() || null
      const category = input.kind === 'template' ? input.category.trim() || null : null
      const tracked = trackedMutation(
        input.id ? 'knowledge_item_updated' : 'knowledge_item_created',
        '/settings/knowledge',
      )
      try {
        if (input.id) {
          await updateItem.mutateAsync({ id: input.id, patch: { title, description, category, body } })
          toast.success(t('common:toast.saved'))
        } else {
          await createItem.mutateAsync({ kind: input.kind, title, description, category, body })
          toast.success(t('library.toast.created', { kind: t(KIND_LABEL_KEY[input.kind]) }))
        }
        tracked.onSuccess()
        setEditor(null)
      } catch (err) {
        tracked.onError()
        console.error('[Knowledge]', err)
        toast.error(t('library.toast.saveFailed'))
      }
    },
    [createItem, updateItem, t],
  )

  // CRM (HubSpot) connection state + OAuth-callback feedback.
  const { data: crmStatus, isLoading: crmLoading } = useCrmStatus()
  const [crmConnecting, setCrmConnecting] = useState(false)
  const [crmDisconnecting, setCrmDisconnecting] = useState(false)

  // The HubSpot OAuth callback bounces back to /knowledge?crm=connected|error.
  // Surface the outcome, refresh status, then strip the param from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const crm = params.get('crm')
    if (!crm) return
    setActiveTab('crm')
    if (crm === 'connected') {
      toast.success(t('crm.toast.connected'))
      queryClient.invalidateQueries({ queryKey: CRM_STATUS_KEY })
    } else if (crm === 'error') {
      toast.error(t('crm.toast.connectFailed', { reason: params.get('reason') ?? t('crm.toast.reasonUnknown') }))
    }
    params.delete('crm')
    params.delete('reason')
    const qs = params.toString()
    window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [queryClient, t])

  const handleCrmConnect = useCallback(async () => {
    setCrmConnecting(true)
    try {
      const { url } = await crmApi.connectUrl()
      window.location.href = url
    } catch {
      toast.error(t('crm.toast.startFailed'))
      setCrmConnecting(false)
    }
  }, [t])

  const handleCrmDisconnect = useCallback(async () => {
    setCrmDisconnecting(true)
    try {
      await crmApi.disconnect()
      toast.success(t('crm.toast.disconnected'))
      queryClient.invalidateQueries({ queryKey: CRM_STATUS_KEY })
    } catch {
      toast.error(t('crm.toast.disconnectFailed'))
    } finally {
      setCrmDisconnecting(false)
    }
  }, [queryClient, t])

  // Upload form
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  // #2779 — la portée choisie À L'AJOUT ; `account` exige un compte (voir
  // `accountId` ci-dessous, requis par le serveur — `ragScopeUpdateInputSchema`).
  const [scope, setScope] = useState<UploadScope>('workspace')
  const [accountId, setAccountId] = useState('')
  // #2861 (#2437.2, niveau SOURCE) — la langue DÉCLARÉE du document.
  const [language, setLanguage] = useState<string>(DOCUMENT_LANGUAGE_UNSET)
  // #2861 (#2437.2, niveau ESPACE) — la langue du marché de l'espace, réglage
  // déjà éditable (`GET /workspaces/market`, `Réglages > Équipe`), sert de
  // DÉFAUT proposé pour un NOUVEAU dépôt (voir `openNewUploadForm` plus bas) —
  // jamais posée sur un document déjà indexé, et jamais envoyée sans que
  // l'utilisateur ait ouvert le formulaire.
  const { market } = useWorkspaceMarket()
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle')
  // #4051.2 — le bilan d'un dépôt de plusieurs fichiers : déposés / échoués, jamais « tout importé ».
  const [uploadBreakdown, setUploadBreakdown] = useState<UniversalImportBreakdown>({})
  const busy = BUSY_PHASES.has(uploadPhase)
  const missingAccount = scope === 'account' && !accountId
  // #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
  // importée : non-null pendant que le formulaire cible un document EXISTANT
  // (`title` porte alors le sien, éditable) plutôt qu'un nouveau dépôt.
  const [replaceTarget, setReplaceTarget] = useState<{ id: string; title: string } | null>(null)

  const closeUploadForm = useCallback(() => {
    setTitle('')
    setCategory(CATEGORIES[0])
    setScope('workspace')
    setAccountId('')
    setLanguage(DOCUMENT_LANGUAGE_UNSET)
    setEntries([])
    setUploadBreakdown({})
    setShowUploadForm(false)
    setReplaceTarget(null)
    setUploadPhase('idle')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  /**
   * #2861 (#2437.2, niveau ESPACE) — un NOUVEAU dépôt (jamais un remplacement,
   * `startReplace` ci-dessous) s'ouvre avec la langue du marché de l'espace
   * déjà sélectionnée, plutôt que « non renseigné ». Un simple défaut de
   * formulaire : rien n'est envoyé tant que l'utilisateur n'a pas confirmé
   * l'upload, et le sélecteur reste modifiable comme avant.
   */
  const openNewUploadForm = useCallback(() => {
    setLanguage(market?.defaultLocale ?? DOCUMENT_LANGUAGE_UNSET)
    setShowUploadForm(true)
  }, [market?.defaultLocale])

  const startReplace = useCallback((doc: { id: string; title: string | null; category: string | null }) => {
    setReplaceTarget({ id: doc.id, title: doc.title ?? '' })
    setTitle(doc.title ?? '')
    setCategory(doc.category ?? CATEGORIES[0])
    setEntries([])
    setUploadPhase('idle')
    setShowUploadForm(true)
  }, [])

  /* ---- Upload --------------------------------------------------- */

  const formatsText = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
    RAG_UPLOAD_DOCUMENT_EXTENSIONS.map(ext => ext.toUpperCase()),
  )
  const maxMb = Math.round(RAG_UPLOAD_MAX_BYTES / 1_000_000)

  /** #3751 — ajoute des fichiers à la file ; chacun est contrôlé AVANT envoi (format, taille, vide). */
  const addFiles = useCallback(
    (picked: File[]) => {
      if (picked.length === 0) return
      const next = picked.map((f): UploadEntry => {
        entrySeq += 1
        const key = `f${entrySeq}`
        const verdict = validateRagUpload(f)
        if (verdict.ok) return { key, file: f, phase: 'pending', refused: false }
        const ext = ragUploadExtension(f.name)
        const reason =
          verdict.reason === 'unsupported'
            ? ext
              ? t('documents.file.reason.unsupported', { ext, formats: formatsText })
              : t('documents.file.reason.noExtension', { formats: formatsText })
            : verdict.reason === 'too_large'
              ? t('documents.file.reason.tooLarge', { maxMb })
              : t('documents.file.reason.empty')
        return { key, file: f, phase: 'error', refused: true, reason }
      })
      // Remplacer un document = UN fichier ; un dépôt neuf s'ajoute à la file.
      setEntries(current => (replaceTarget ? next.slice(0, 1) : [...current.filter(e => e.phase !== 'done'), ...next]))
      setUploadPhase('idle')
    },
    [replaceTarget, t, formatsText, maxMb],
  )

  const removeEntry = useCallback((key: string) => {
    setEntries(current => current.filter(e => e.key !== key))
    setUploadPhase('idle')
  }, [])

  const sendable = entries.filter(e => !e.refused && e.phase !== 'done')
  // Un seul fichier à envoyer : le titre saisi s'applique. Plusieurs : chacun garde son nom.
  const titleRequired = sendable.length === 1

  const handleUpload = useCallback(async () => {
    if (sendable.length === 0 || (titleRequired && !title.trim()) || BUSY_PHASES.has(uploadPhase) || missingAccount) {
      return
    }
    const patch = (key: string, changes: Partial<UploadEntry>) =>
      setEntries(current => current.map(e => (e.key === key ? { ...e, ...changes } : e)))
    const baseCommon = {
      category: category ?? CATEGORIES[0]!,
      scope,
      ...(scope === 'account' ? { accountId } : {}),
      // #2861 — omise quand non renseignée : le serveur garde NULL, jamais deviné.
      ...(language === DOCUMENT_LANGUAGE_UNSET ? {} : { language: language as MarketLocale }),
    }
    type Input = typeof baseCommon & { title: string; fileB64?: string; filename?: string; content?: string }
    // #3751 — MÊME chemin d'ingestion que le trombone du chat (`POST /rag-documents/ingest`), portée explicite.
    const mutation = replaceTarget
      ? (input: Input) => replaceDoc.mutateAsync({ id: replaceTarget.id, input })
      : (input: Input) => ingest.mutateAsync(input)
    setUploadPhase('reading')
    let done = 0
    let failed = 0
    for (const entry of sendable) {
      const verdict = validateRagUpload(entry.file)
      if (!verdict.ok) continue
      try {
        patch(entry.key, { phase: 'reading', reason: undefined })
        const fileTitle = titleRequired ? title.trim() : entry.file.name
        if (verdict.isText) {
          // Texte (.txt/.md/.csv/.json) : lu en UTF-8 côté client.
          const content = await entry.file.text()
          patch(entry.key, { phase: 'indexing' })
          // #3803.2 — le NOM voyage avec le texte : sans lui le serveur ne range pas l'original (`persistDocumentSource`)
          // et le CSV s'ouvrait en texte brut + « Original non conservé ». Dépôts NEUFS seulement, aucun rattrapage.
          await mutation({ ...baseCommon, title: fileTitle, content, filename: entry.file.name })
        } else {
          // PDF / docx / xlsx / pptx : base64, le texte est extrait côté serveur (feuilles et diapos comprises).
          const fileB64 = await fileToBase64(entry.file)
          patch(entry.key, { phase: 'extracting' })
          await mutation({ ...baseCommon, title: fileTitle, fileB64, filename: entry.file.name })
        }
        patch(entry.key, { phase: 'done' })
        done += 1
      } catch (err) {
        console.error('[Knowledge]', err)
        failed += 1
        // La raison de l'API (ex. garde « carnet d'adresses ») quand c'est un refus 4xx ; jamais un échec muet.
        const status = err instanceof ApiError ? err.status : undefined
        const reason =
          err instanceof Error && err.message && (status === undefined || status < 500)
            ? err.message
            : t('documents.file.reason.failed')
        patch(entry.key, { phase: 'error', reason })
      }
    }
    if (failed === 0 && sendable.length === 1) {
      setUploadPhase('done')
      toast.success(replaceTarget ? t('documents.toast.replaced') : t('documents.toast.indexed'))
      closeUploadForm()
      return
    }
    setUploadPhase(failed > 0 ? 'error' : 'done')
    if (sendable.length > 1) setUploadBreakdown(documentUploadBreakdown({ done, failed }))
    if (sendable.length === 1) {
      toast.error(replaceTarget ? t('documents.toast.replaceFailed') : t('documents.toast.ingestFailed'))
    } else {
      toast[failed > 0 ? 'error' : 'success'](t('documents.file.summary', { done, failed }))
    }
  }, [
    sendable,
    titleRequired,
    title,
    category,
    scope,
    accountId,
    language,
    missingAccount,
    uploadPhase,
    ingest,
    replaceDoc,
    replaceTarget,
    closeUploadForm,
    t,
  ])

  /* ---- Delete --------------------------------------------------- */

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteDoc.mutateAsync(id)
      } catch (err) {
        console.error('[Knowledge]', err)
        toast.error(t('documents.toast.deleteFailed'))
      }
    },
    [deleteDoc, t],
  )

  /* ---- Drag & drop ---------------------------------------------- */

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles],
  )

  const filteredDocs = documents.filter(d => (d.title ?? '').toLowerCase().includes(docSearch.toLowerCase()))

  const ALL_TABS: { id: Tab; label: string }[] = [
    { id: 'templates', label: t('tabs.templates') },
    { id: 'playbooks', label: t('tabs.playbooks') },
    { id: 'method', label: t('tabs.method') },
    { id: 'crm', label: t('tabs.crm') },
    { id: 'documents', label: t('tabs.documents') },
    { id: 'assets', label: t('tabs.assets') },
    { id: 'library', label: t('tabs.library') },
    { id: 'style', label: t('tabs.style') },
  ]
  const TABS = tabs === undefined ? ALL_TABS : tabs.flatMap(id => ALL_TABS.filter(tab => tab.id === id))

  /* ---- Render --------------------------------------------------- */

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Page header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' as const }}
      >
        {/* Le titre « Base de connaissances » vit déjà dans l'en-tête de page —
            on garde seulement le sous-titre (pas de titre dupliqué). */}
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('page.subtitle')}</p>
      </motion.div>

      {/* ── Tabs ── Maquette Théo V22 `.v12-tabs` : des onglets soulignés, l'actif à l'accent ; défilent sous 768 px. */}
      {TABS.length > 1 ? (
        <div
          role="tablist"
          aria-label={t('page.subtitle')}
          className="-mx-1 flex gap-1 overflow-x-auto border-b border-[var(--bellum-border)] px-1"
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                '-mb-px min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors duration-immediate ease-bellum-out',
                activeTab === tab.id
                  ? 'border-[var(--bellum-text-accent)] text-[var(--bellum-text-primary)]'
                  : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* ── Tab content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: 'easeOut' as const }}
        >
          {/* ============================================================ */}
          {/*  Mes documents tab                                            */}
          {/* ============================================================ */}
          {activeTab === 'documents' && (
            <div>
              {/* Action bar */}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative">
                  <Search
                    aria-hidden
                    className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--bellum-text-muted)]"
                  />
                  <input
                    type="text"
                    value={docSearch}
                    onChange={e => setDocSearch(e.target.value)}
                    placeholder={t('documents.searchPlaceholder')}
                    aria-label={t('documents.searchPlaceholder')}
                    className="h-9 w-full min-w-0 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-bg)] pl-8 pr-3 text-sm text-[var(--bellum-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] sm:w-64 pointer-coarse:min-h-11"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setDriveOpen(true)}>
                    <HardDrive className="size-3.5" aria-hidden />
                    {t('documents.importFromDrive')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => (showUploadForm ? closeUploadForm() : openNewUploadForm())}
                  >
                    <Plus className="size-3.5" aria-hidden />
                    {t('documents.addButton')}
                  </Button>
                </div>
              </div>

              <DriveImportDialog open={driveOpen} onOpenChange={setDriveOpen} />
              {/* #3803 (3803.6) — l'aperçu fidèle, partagé avec le chat (`DocumentPreview`). */}
              <Dialog
                open={previewDoc !== null}
                onOpenChange={open => {
                  if (!open) setPreviewDoc(null)
                }}
              >
                <DialogContent closeLabel={t('common:actions.close')} className="max-w-4xl">
                  <DialogHeader>
                    <DialogTitle className="truncate pr-8">{previewDoc?.name ?? ''}</DialogTitle>
                    <DialogDescription className="sr-only">
                      {t('common:documentPreview.openLabel', { name: previewDoc?.name ?? '' })}
                    </DialogDescription>
                  </DialogHeader>
                  {previewDoc ? <DocumentPreview documentId={previewDoc.id} /> : null}
                </DialogContent>
              </Dialog>

              <ActionDialog
                variant="danger"
                size="sm"
                open={pendingDelete !== null}
                onOpenChange={open => {
                  if (!open) setPendingDelete(null)
                }}
                title={t('documents.deleteDialog.title', { name: pendingDelete?.name ?? '' })}
                description={t('documents.deleteDialog.description')}
                isLoading={deleteDoc.isPending}
                footer={
                  <>
                    <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
                      {t('documents.deleteDialog.cancel')}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={deleteDoc.isPending}
                      onClick={async () => {
                        if (!pendingDelete) return
                        await handleDelete(pendingDelete.id)
                        setPendingDelete(null)
                      }}
                    >
                      {t('documents.deleteDialog.confirm')}
                    </Button>
                  </>
                }
              />

              {/* Upload form (collapsible) */}
              <AnimatePresence>
                {showUploadForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: 'easeOut' as const }}
                    className="overflow-hidden mb-4"
                  >
                    <div
                      className="rounded-xl p-5 space-y-4"
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {/* #2431.5 (reste, épopée #2886) — le formulaire cible un document
                          EXISTANT : on le dit, et on laisse revenir à un dépôt neuf. */}
                      {replaceTarget && (
                        <div
                          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                        >
                          <span>{t('documents.replaceBanner', { title: replaceTarget.title })}</span>
                          <button
                            onClick={closeUploadForm}
                            className="shrink-0 underline"
                            style={{ color: 'var(--text-ghost)' }}
                          >
                            {t('documents.replaceCancel')}
                          </button>
                        </div>
                      )}

                      {/* Drag & drop zone */}
                      <div
                        onDragOver={e => {
                          e.preventDefault()
                          setDragOver(true)
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 md:px-6 py-8 cursor-pointer transition-all duration-300"
                        style={{
                          borderColor: dragOver ? 'var(--bellum-primary-500)' : 'var(--border-default)',
                          background: dragOver ? 'rgba(124,58,237,0.05)' : 'var(--bg-elevated)',
                        }}
                      >
                        <FileText
                          className="h-8 w-8 mb-2"
                          style={{ color: dragOver ? 'var(--bellum-text-accent)' : 'var(--text-ghost)' }}
                        />
                        <p className="text-sm" style={{ color: 'var(--text-ghost)' }}>
                          {t('documents.dropHint')}
                        </p>
                        <p className="text-xs mt-1 text-center" style={{ color: 'var(--text-ghost)' }}>
                          {t('documents.dropFormats', { formats: formatsText, maxMb })}
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple={!replaceTarget}
                          accept={RAG_UPLOAD_DOCUMENT_EXTENSIONS.map(ext => `.${ext}`).join(',')}
                          className="hidden"
                          onChange={e => {
                            addFiles(Array.from(e.target.files ?? []))
                            // Même fichier re-choisi après l'avoir retiré : l'événement doit repartir.
                            e.target.value = ''
                          }}
                        />
                      </div>

                      {hasFamilyReport(uploadBreakdown) ? (
                        <ImportFamilyReport breakdown={uploadBreakdown} queryableByLaura={null} />
                      ) : null}
                      {/* #3751 — un statut PAR fichier : en cours / indexé / refusé + la raison lisible. */}
                      {entries.length > 0 && (
                        <ul aria-label={t('documents.file.listAria')} className="space-y-2">
                          {entries.map(entry => (
                            <li
                              key={entry.key}
                              className="flex items-start gap-3 rounded-lg px-3 py-2"
                              style={{ background: 'var(--bg-elevated)' }}
                            >
                              <span className="mt-0.5 shrink-0" aria-hidden="true">
                                {entry.phase === 'done' ? (
                                  <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--success-soft-text)' }} />
                                ) : ENTRY_BUSY_PHASES.has(entry.phase) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--text-ghost)' }} />
                                ) : entry.phase === 'error' ? (
                                  <X className="h-4 w-4" style={{ color: 'var(--danger-soft-text)' }} />
                                ) : (
                                  <FileText className="h-4 w-4" style={{ color: 'var(--text-ghost)' }} />
                                )}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm break-words text-[color:var(--text-primary)]">
                                  {entry.file.name}
                                </p>
                                <p
                                  className="text-xs"
                                  style={{
                                    color: entry.phase === 'error' ? 'var(--danger-soft-text)' : 'var(--text-ghost)',
                                  }}
                                >
                                  {t(ENTRY_STATUS_KEY[entry.phase])}
                                </p>
                                {entry.reason ? (
                                  <p className="text-xs break-words" style={{ color: 'var(--danger-soft-text)' }}>
                                    {entry.reason}
                                  </p>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeEntry(entry.key)}
                                disabled={ENTRY_BUSY_PHASES.has(entry.phase)}
                                aria-label={t('documents.file.remove', { name: entry.file.name })}
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md disabled:opacity-40"
                                style={{ color: 'var(--text-ghost)' }}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px] space-y-1">
                          {sendable.length > 1 ? (
                            <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                              {t('documents.file.multiTitleHint')}
                            </p>
                          ) : (
                            <>
                              <label className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                                {t('documents.titleLabel')}
                              </label>
                              <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder={t('documents.titlePlaceholder')}
                                className="w-full rounded-lg px-3 py-2 text-sm text-[color:var(--text-primary)] focus:outline-none transition-all"
                                style={{
                                  background: 'var(--bg-elevated)',
                                  border: '1px solid var(--border-default)',
                                }}
                              />
                            </>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                            {t('documents.categoryLabel')}
                          </label>
                          <SelectField
                            value={category}
                            onChange={next => setCategory(next)}
                            options={CATEGORIES.map(c => ({ value: c, label: c }))}
                            className="min-w-0 max-w-full"
                          />
                        </div>

                        {/* #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du
                            document, DÉCLARÉE, jamais détectée. Optionnelle : « non
                            renseigné » reste le défaut, jamais deviné. */}
                        <div className="space-y-1">
                          <label className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                            {t('documents.languageLabel')}
                          </label>
                          <SelectField
                            value={language}
                            onChange={next => setLanguage(next)}
                            options={[
                              { value: DOCUMENT_LANGUAGE_UNSET, label: t('documents.languageUnset') },
                              ...marketLocaleValues.map(locale => ({
                                value: locale,
                                label: t(`documents.language.${locale}`),
                              })),
                            ]}
                            ariaLabel={t('documents.languageLabel')}
                            className="min-w-0 max-w-full"
                          />
                        </div>

                        {/* #2779 — choisir la portée à l'ajout : `workspace` (défaut, le
                            comportement d'avant), `personal`, `account` (compte ci-dessous)
                            ou `knowledge_base`. Jamais `conversation` — cet écran n'a pas de fil. */}
                        <div className="space-y-1">
                          <label className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                            {t('documents.scopeLabel')}
                          </label>
                          <SelectField
                            value={scope}
                            onChange={next => setScope(next as UploadScope)}
                            options={UPLOAD_SCOPES.map(s => ({ value: s, label: t(UPLOAD_SCOPE_LABEL_KEY[s]) }))}
                            ariaLabel={t('documents.scopeLabel')}
                            className="min-w-0 max-w-full"
                          />
                        </div>

                        {scope === 'account' ? (
                          <div className="space-y-1">
                            <label className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                              {t('documents.accountLabel')}
                            </label>
                            <DocumentAccountSelect value={accountId} onChange={setAccountId} />
                          </div>
                        ) : null}

                        <button
                          onClick={handleUpload}
                          disabled={busy || sendable.length === 0 || (titleRequired && !title.trim()) || missingAccount}
                          className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{ background: 'var(--violet-gradient)' }}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          {t(UPLOAD_PHASE_LABEL_KEY[uploadPhase])}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Maquette Théo V22 `settings-laura#documents` — le tableau commun : le document (titre, date), son
                  usage, son accès, son état, puis les gestes (aperçu, remplacer, supprimer), toujours visibles. */}
              {loading ? (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 rounded-control skeleton" />
                  ))}
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-[var(--bellum-border)] py-12">
                  <div className="mb-4 flex items-center justify-center rounded-card bg-[var(--bellum-surface-2)] p-3">
                    <Upload aria-hidden className="h-8 w-8 text-[var(--bellum-text-muted)]" />
                  </div>
                  <p className="mb-2 text-base font-semibold text-[var(--bellum-text-primary)]">
                    {t('documents.emptyTitle')}
                  </p>
                  <Button type="button" variant="plain" size="sm" onClick={() => openNewUploadForm()}>
                    {t('documents.emptyCta')}
                  </Button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card">
                  <Table aria-label={t('tabs.documents')}>
                    <TableHeader>
                      <TableRow className="border-[var(--bellum-border)] bg-[var(--bellum-surface-2)]">
                        <TableHead className="px-4 text-xs text-[var(--bellum-text-muted)]">
                          {t('documents.columns.document')}
                        </TableHead>
                        <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] md:table-cell">
                          {t('documents.columns.usage')}
                        </TableHead>
                        <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] lg:table-cell">
                          {t('documents.columns.access')}
                        </TableHead>
                        <TableHead className="hidden text-xs text-[var(--bellum-text-muted)] sm:table-cell">
                          {t('documents.columns.status')}
                        </TableHead>
                        <TableHead className="px-4 text-right text-xs text-[var(--bellum-text-muted)]">
                          <span className="sr-only">{t('documents.columns.actions')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDocs.map(doc => {
                        const name = doc.title ?? t('documents.untitled')
                        const usage =
                          doc.category === CHAT_ATTACHMENT_CATEGORY
                            ? t('documents.fromChat')
                            : doc.category && isDistilledRagCategory(doc.category)
                              ? t(RAG_CATEGORY_LABEL_KEY[doc.category])
                              : (doc.category ?? 'Autre')
                        const access =
                          doc.scope && doc.scope in UPLOAD_SCOPE_LABEL_KEY
                            ? t(UPLOAD_SCOPE_LABEL_KEY[doc.scope as UploadScope])
                            : null
                        return (
                          <TableRow
                            key={doc.id}
                            data-knowledge-doc={doc.id}
                            className="border-[var(--bellum-border)] align-top"
                          >
                            <TableCell className="px-4 py-3 whitespace-normal">
                              <div className="flex items-start gap-2.5">
                                <FileText
                                  aria-hidden
                                  className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]"
                                />
                                <div className="min-w-0">
                                  <p className="line-clamp-2 text-sm font-medium text-[var(--bellum-text-primary)]">
                                    {name}
                                  </p>
                                  <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">
                                    {doc.created_at
                                      ? new Date(doc.created_at).toLocaleDateString(
                                          i18n.language === 'en' ? 'en-GB' : 'fr-FR',
                                        )
                                      : '--'}
                                  </p>
                                  {/* Sous 768 px, l'usage et l'état passent sous le titre (leurs colonnes se masquent). */}
                                  <p className="mt-1 text-xs text-[var(--bellum-text-secondary)] md:hidden">{usage}</p>
                                  <div className="sm:hidden">
                                    <ProcessingStatusBadge status={doc.processing_status} />
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden py-3 md:table-cell">
                              {/* #1954 — un document déposé depuis le chat reste dans la base, INCHANGÉ, et se dit
                                  comme tel (Louis, 12/09/2026). */}
                              <span className="inline-flex rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
                                {usage}
                              </span>
                            </TableCell>
                            <TableCell className="hidden py-3 text-sm text-[var(--bellum-text-secondary)] lg:table-cell">
                              {access}
                            </TableCell>
                            <TableCell className="hidden py-3 sm:table-cell [&_p]:mt-0">
                              <ProcessingStatusBadge status={doc.processing_status} />
                            </TableCell>
                            <TableCell className="px-4 py-2 text-right">
                              <div className="inline-flex items-center gap-0.5">
                                {/* #3803 (3803.6) — l'APERÇU fidèle aussi dans Connaissances : la même visionneuse
                                    que le chat (`DocumentPreview`). */}
                                <button
                                  type="button"
                                  data-testid="knowledge-doc-preview"
                                  onClick={() => setPreviewDoc({ id: doc.id, name })}
                                  className={DOC_ACTION}
                                  title={t('common:documentPreview.open')}
                                  aria-label={t('common:documentPreview.openLabel', { name })}
                                >
                                  <Eye className="size-3.5" aria-hidden />
                                </button>
                                {/* #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà importée :
                                    ouvre le formulaire ciblé sur CE document, jamais une suppression. */}
                                <button
                                  type="button"
                                  onClick={() => startReplace(doc)}
                                  className={DOC_ACTION}
                                  title={t('documents.replaceAria')}
                                  aria-label={t('documents.replaceAria')}
                                >
                                  <RefreshCw className="size-3.5" aria-hidden />
                                </button>
                                {/* #2436.19 (GA-375) / #3797.2 — visible sans survol, cible ≥ 44 px, nommée. */}
                                <button
                                  type="button"
                                  data-testid="knowledge-doc-delete"
                                  onClick={() => setPendingDelete({ id: doc.id, name })}
                                  className={cn(DOC_ACTION, 'hover:text-[var(--danger-soft-text)]')}
                                  title={t('common:actions.delete')}
                                  aria-label={t('documents.deleteAria', { name })}
                                >
                                  <Trash2 className="size-3.5" aria-hidden />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/*  Templates tab                                                */}
          {/* ============================================================ */}
          {activeTab === 'templates' && (
            <LibraryTab
              kind="template"
              icon={FileText}
              gridCols="sm:grid-cols-2 lg:grid-cols-3"
              newLabel={t('templates.new')}
              viewLabel={t('templates.view')}
              emptyLabel={t('templates.empty')}
              items={templatesQuery.data}
              loading={templatesQuery.isLoading}
              error={templatesQuery.isError}
              onView={item => {
                setCopied(false)
                setSelectedItem(item)
              }}
              onNew={() => setEditor({ kind: 'template', item: null })}
              onEdit={item => setEditor({ kind: 'template', item })}
              onDelete={id => handleDeleteLibraryItem('template', id)}
            />
          )}

          {/* ============================================================ */}
          {/*  Playbooks tab                                                */}
          {/* ============================================================ */}
          {activeTab === 'playbooks' && (
            <LibraryTab
              kind="playbook"
              icon={BookOpen}
              gridCols="sm:grid-cols-2"
              newLabel={t('playbooks.new')}
              viewLabel={t('playbooks.view')}
              emptyLabel={t('playbooks.empty')}
              items={playbooksQuery.data}
              loading={playbooksQuery.isLoading}
              error={playbooksQuery.isError}
              onView={item => {
                setCopied(false)
                setSelectedItem(item)
              }}
              onNew={() => setEditor({ kind: 'playbook', item: null })}
              onEdit={item => setEditor({ kind: 'playbook', item })}
              onDelete={id => handleDeleteLibraryItem('playbook', id)}
            />
          )}

          {/* ============================================================ */}
          {/*  Méthode tab (plan-de-compte method playbooks)                */}
          {/* ============================================================ */}
          {activeTab === 'method' && (
            <>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                {t('method.description')}
              </p>
              <LibraryTab
                kind="method_playbook"
                icon={Compass}
                gridCols="sm:grid-cols-2"
                newLabel={t('method.new')}
                viewLabel={t('method.view')}
                emptyLabel={t('method.empty')}
                items={methodQuery.data}
                loading={methodQuery.isLoading}
                error={methodQuery.isError}
                onView={item => {
                  setCopied(false)
                  setSelectedItem(item)
                }}
                onNew={() => setEditor({ kind: 'method_playbook', item: null })}
                onEdit={item => setEditor({ kind: 'method_playbook', item })}
                onDelete={id => handleDeleteLibraryItem('method_playbook', id)}
              />
            </>
          )}

          {/* ============================================================ */}
          {/*  Données CRM tab                                              */}
          {/* ============================================================ */}
          {activeTab === 'crm' &&
            (crmLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-ghost)' }} />
              </div>
            ) : crmStatus?.connected ? (
              /* ── Connected — status header + 2-way data panel ── */
              <div>
                <div
                  className="mb-6 flex items-center justify-between gap-4 rounded-xl p-4"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center rounded-xl p-2.5"
                      style={{ background: 'rgba(34,197,94,0.12)' }}
                    >
                      <CheckCircle2 className="h-6 w-6" style={{ color: 'var(--bellum-success-text)' }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[color:var(--text-primary)]">{t('crm.connectedTitle')}</h3>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {crmStatus.accountLabel ?? t('crm.accountFallback')}
                        {crmStatus.connectedAt
                          ? t('crm.since', {
                              date: new Date(crmStatus.connectedAt).toLocaleDateString(
                                i18n.language === 'en' ? 'en-GB' : 'fr-FR',
                              ),
                            })
                          : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleCrmDisconnect}
                    disabled={crmDisconnecting}
                    className="flex shrink-0 items-center gap-2 h-9 px-4 rounded-md text-sm transition-colors disabled:opacity-60"
                    style={{ border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                  >
                    {crmDisconnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('common:actions.disconnect')}
                  </button>
                </div>
                <CrmDataPanel />
                {/* La REPRISE : importer ce qui est déjà dans le CRM, sans
                    doublonner ni écraser une correction faite à la main. Elle
                    vit ici parce que c'est l'écran où l'on vient de connecter
                    son CRM — le moment exact où la question se pose. */}
                <div className="mt-6 border-t border-[var(--bellum-border)] pt-6">
                  <CrmImportPanel />
                </div>
                {/* La gouvernance : champs personnalisés bornés et doublons
                    proposés. Elle vit ici parce que c'est l'écran des données —
                    et parce qu'un doublon se traite au moment où l'on regarde
                    sa base, pas dans un menu de réglages qu'on n'ouvre jamais. */}
                <div className="mt-6 border-t border-[var(--bellum-border)] pt-6">
                  <GovernancePanel entityType="contact" />
                </div>
              </div>
            ) : crmStatus?.configured ? (
              /* ── Configured but not connected ── */
              <div className="flex flex-col items-center justify-center py-16">
                <div
                  className="flex items-center justify-center rounded-2xl p-3 mb-5"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <BookOpen className="h-10 w-10" style={{ color: 'var(--text-ghost)' }} />
                </div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)] mb-2">{t('crm.connectTitle')}</h3>
                <p className="text-sm text-center max-w-xs mb-6" style={{ color: 'var(--text-ghost)' }}>
                  {t('crm.connectBody')}
                </p>
                <button
                  onClick={handleCrmConnect}
                  disabled={crmConnecting}
                  className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white transition-colors disabled:opacity-60"
                  style={{ background: 'var(--violet-gradient)' }}
                >
                  {crmConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('crm.connectCta')}
                </button>
              </div>
            ) : (
              /* ── Not configured on this server ── */
              <div className="flex flex-col items-center justify-center py-16">
                <div
                  className="flex items-center justify-center rounded-2xl p-3 mb-5"
                  style={{ background: 'var(--bg-elevated)' }}
                >
                  <Clock className="h-10 w-10" style={{ color: 'var(--text-ghost)' }} />
                </div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)] mb-2">
                  {t('crm.notConfiguredTitle')}
                </h3>
                <p className="text-sm text-center max-w-xs" style={{ color: 'var(--text-ghost)' }}>
                  {t('crm.notConfiguredBody')}
                </p>
              </div>
            ))}

          {/* ============================================================ */}
          {/*  Assets outreach tab (#2838) — lecture seule                  */}
          {/* ============================================================ */}
          {activeTab === 'assets' && <OutreachAssetsTab />}
          {/* #3427 — la bibliothèque d'exemples commerciaux, en lecture. */}
          {activeTab === 'library' && <MessageLibraryTab />}

          {/* ============================================================ */}
          {/*  Mémoire de style tab (#2369.2/.3/.4/.5 + #2369.14, épopée    */}
          {/*  #2768) — import (analyse) PUIS templates/propositions        */}
          {/*  (lecture + décision), le NO-GO #2369.14 exige les deux.      */}
          {/* ============================================================ */}
          {activeTab === 'style' && (
            <div className="space-y-10">
              <MessageStyleImportTab />
              <MessageStyleTab />
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Template / Playbook modal ── */}
      <AnimatePresence>
        {selectedItem && (
          <motion.div
            key="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setSelectedItem(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ duration: 0.2, ease: 'easeOut' as const }}
              onClick={e => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl p-6"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label={t('close')}
                className="absolute right-4 top-4 rounded-sm p-1 transition-colors"
                style={{ color: 'var(--text-ghost)' }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text-ghost)'
                }}
              >
                <X className="h-4 w-4" />
              </button>
              <h3 className="text-base font-semibold text-[color:var(--text-primary)] mb-2 pr-8">
                {selectedItem.title}
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                {selectedItem.description}
              </p>
              <pre
                className="text-xs leading-relaxed rounded-md p-4 max-h-[45vh] overflow-y-auto whitespace-pre-wrap font-sans"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              >
                {selectedItem.body}
              </pre>
              <button
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(selectedItem.body)
                    .then(() => {
                      setCopied(true)
                      toast.success(t('library.toast.copied'))
                    })
                    .catch(() => toast.error(t('library.toast.copyFailed')))
                }}
                className="mt-4 w-full h-9 rounded-md text-sm font-medium text-white transition-colors"
                style={{ background: 'var(--violet-gradient)' }}
              >
                {copied ? t('modal.copiedButton') : t('modal.copyButton')}
              </button>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setEditor({ kind: selectedItem.kind, item: selectedItem })}
                  className="flex flex-1 items-center justify-center gap-1.5 h-9 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t('modal.edit')}
                </button>
                <button
                  onClick={() => handleDeleteLibraryItem(selectedItem.kind, selectedItem.id)}
                  className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium transition-colors"
                  style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: 'var(--danger-soft-text)',
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('common:actions.delete')}
                </button>
              </div>
              <p className="mt-3 text-xs text-center" style={{ color: 'var(--text-ghost)' }}>
                {t('modal.hint', { placeholder: '{{…}}' })}{' '}
                <button
                  onClick={() => {
                    setSelectedItem(null)
                    navigate({ to: '/chat' })
                  }}
                  className="text-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)] transition-colors"
                >
                  {t('modal.openCopilot')}
                </button>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Library editor (create / edit template or playbook) ── */}
      <AnimatePresence>
        {editor && (
          <LibraryEditorModal
            kind={editor.kind}
            item={editor.item}
            saving={createItem.isPending || updateItem.isPending}
            onCancel={() => setEditor(null)}
            onSave={handleSaveLibraryItem}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Library tab (templates / playbooks) — API-driven                   */
/* ------------------------------------------------------------------ */

type LibraryTabProps = {
  kind: LibraryItemKind
  icon: typeof FileText
  gridCols: string
  newLabel: string
  viewLabel: string
  emptyLabel: string
  items: LibraryItem[] | undefined
  loading: boolean
  error: boolean
  onView: (item: LibraryItem) => void
  onNew: () => void
  onEdit: (item: LibraryItem) => void
  onDelete: (id: string) => void
}

function LibraryTab({
  icon: Icon,
  gridCols,
  newLabel,
  viewLabel,
  emptyLabel,
  items,
  loading,
  error,
  onView,
  onNew,
  onEdit,
  onDelete,
}: LibraryTabProps) {
  const { t } = useTranslation('knowledge')
  const rows = items ?? []
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={onNew}
          className="flex items-center gap-2 h-9 px-4 rounded-md text-xs text-white font-medium"
          style={{ background: 'var(--violet-gradient)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          {newLabel}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--text-ghost)' }} />
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {t('library.errorState')}
        </p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {emptyLabel}
        </p>
      ) : (
        <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
          {rows.map(item => (
            <div
              key={item.id}
              className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-start justify-between">
                <Icon className="h-[18px] w-[18px]" style={{ color: 'var(--text-muted)' }} />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit(item)}
                    aria-label={t('library.editAria')}
                    className="rounded-sm p-1 transition-colors hover:bg-[var(--bg-elevated)]"
                    style={{ color: 'var(--text-ghost)' }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    aria-label={t('common:actions.delete')}
                    className="rounded-sm p-1 transition-colors hover:bg-[rgba(239,68,68,0.12)]"
                    style={{ color: 'var(--text-ghost)' }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm font-medium text-[color:var(--text-primary)] mt-1">{item.title}</p>
              {item.description && (
                <p className="text-xs" style={{ color: 'var(--text-ghost)' }}>
                  {item.description}
                </p>
              )}
              <div className="flex items-center justify-between mt-auto pt-2">
                {item.category ? (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {item.category}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  onClick={() => onView(item)}
                  className="text-xs text-[var(--bellum-text-accent)] hover:text-[var(--bellum-text-accent)] cursor-pointer transition-colors"
                >
                  {viewLabel}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Library editor modal (create / edit)                               */
/* ------------------------------------------------------------------ */

type LibraryEditorModalProps = {
  kind: LibraryItemKind
  item: LibraryItem | null
  saving: boolean
  onCancel: () => void
  onSave: (input: {
    kind: LibraryItemKind
    id: string | null
    title: string
    description: string
    category: string
    body: string
  }) => void
}

const EDITOR_INPUT_STYLE = {
  background: 'var(--bg-glass)',
  border: '1px solid var(--bg-glass-border)',
  color: 'var(--text-primary)',
} as const

function LibraryEditorModal({ kind, item, saving, onCancel, onSave }: LibraryEditorModalProps) {
  const { t } = useTranslation('knowledge')
  const [title, setTitle] = useState(item?.title ?? '')
  const [description, setDescription] = useState(item?.description ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [body, setBody] = useState(item?.body ?? '')

  const isTemplate = kind === 'template'
  const noun = t(KIND_LABEL_KEY[kind]).toLowerCase()
  const canSave = title.trim().length > 0 && body.trim().length > 0 && !saving

  return (
    <motion.div
      key="editor-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl p-6"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('close')}
          className="absolute right-4 top-4 rounded-sm p-1 transition-colors"
          style={{ color: 'var(--text-ghost)' }}
        >
          <X className="h-4 w-4" />
        </button>
        <h3 className="text-base font-semibold text-[color:var(--text-primary)] mb-4 pr-8">
          {item ? t('editor.editTitle', { noun }) : t('editor.newTitle', { noun })}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('editor.titleLabel')}
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={isTemplate ? t('editor.titlePlaceholderTemplate') : t('editor.titlePlaceholderPlaybook')}
              className="mt-1 w-full h-9 rounded-sm px-3 text-sm focus:outline-none"
              style={EDITOR_INPUT_STYLE}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                {t('editor.descriptionLabel')}
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder={t('editor.descriptionPlaceholder')}
                className="mt-1 w-full h-9 rounded-sm px-3 text-sm focus:outline-none"
                style={EDITOR_INPUT_STYLE}
              />
            </div>
            {isTemplate && (
              <div className="w-40">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {t('editor.categoryLabel')}
                </label>
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder={t('editor.categoryPlaceholder')}
                  className="mt-1 w-full h-9 rounded-sm px-3 text-sm focus:outline-none"
                  style={EDITOR_INPUT_STYLE}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              {t('editor.bodyLabel')}
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={10}
              placeholder={t('editor.bodyPlaceholder', { placeholder: '{{…}}' })}
              className="mt-1 w-full rounded-sm px-3 py-2 text-xs leading-relaxed font-sans resize-y focus:outline-none"
              style={EDITOR_INPUT_STYLE}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-sm font-medium transition-colors"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {t('common:actions.cancel')}
          </button>
          <button
            onClick={() => onSave({ kind, id: item?.id ?? null, title, description, category, body })}
            disabled={!canSave}
            className="flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium text-white transition-opacity disabled:opacity-50"
            style={{ background: 'var(--violet-gradient)' }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {item ? t('common:actions.save') : t('common:actions.create')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
