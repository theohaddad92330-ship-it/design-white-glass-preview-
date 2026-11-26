import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  FileUp,
  History,
  Loader2,
  ShieldQuestion,
  Upload,
  X,
} from 'lucide-react'
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  cn,
  Input,
  SelectField,
  TabNav,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  Textarea,
} from '@bellum/ui'
import { toast } from 'sonner'
import {
  rfpAnswerStatusSchema,
  rfpOwnerRoleSchema,
  RFP_EXTRACTION_CATEGORIES,
  type RfpAnswerStatus,
  type RfpDocumentExtraction,
  type RfpExtractedField,
  type RfpExtractionCategory,
  type RfpImportDraft,
  type RfpImportPreview,
  type RfpImportPreviewIndicators,
  type RfpOwnerRole,
  type OpenNeedRow,
  type RfpAnswerVersion,
  type RfpRequirementComment,
  type SaveRfpImportSession,
} from '@bellum/contracts'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useSession } from '@/lib/hooks/use-session'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { rfpApi, rfpKeys, type RfpCreateBody, type RfpDetail, type RfpSummary } from '../api'
import { RfpSourceDocuments } from './RfpSourceDocuments'
import { RfpProfilesCard } from './RfpProfilesCard'
import { useSetWorkspaceSectionHidden, useWorkspaceHiddenSections } from '../hooks/useWorkspaceHiddenSections'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { toCsv } from '@/lib/csv'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { formatDate } from '@/lib/locale'

/**
 * RFP/RFQ Studio (addendum final p66-68).
 *
 * L'écran suit l'ordre du travail réel, et l'ordre est ce qui compte : on importe,
 * on DÉCIDE, puis on rédige. Rédiger avant de décider est ce qui fait répondre à
 * des appels d'offres perdus d'avance, en y laissant trois jours d'avant-vente.
 *
 * Ce que l'écran refuse de faire : afficher un bouton « exporter » quand des
 * exigences obligatoires n'ont pas de réponse validée. La matrice de conformité
 * ne dit pas « c'est bon », elle compte ce qui manque — et le savoir AVANT
 * l'envoi est tout l'intérêt.
 */
/**
 * #4341 (décision Louis du 19/10/2026) — L'ESPACE, PLUS UN ÉCRAN.
 *
 * L'onglet « Appels d'offres » a quitté Affaires : cet espace est monté DANS le
 * pipe (`ProjectsPage`, `?lens=rfp`), et `/rfp` y redirige. La coque
 * (`CustomerPage`) est donc celle du pipe ; `action` porte le retour au pipe
 * dans l'entête, à côté du titre.
 */
export function RfpWorkspace({ action }: { action?: ReactNode }) {
  const { t } = useTranslation('rfp')
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string>()
  // #2957 (#2179.20-.29) — la vue table est un AFFICHAGE, pas un réglage
  // persisté (même discipline que `viewMode` sur `/accounts`) : elle revient
  // à « cartes » à chaque ouverture de la page.
  const [listLayout, setListLayout] = useState<RfpListLayout>('cards')
  // #2957 (#2179.37) — `viewer` est strictement lecture seule (doctrine de la
  // matrice des rôles) : la page reste consultable, sans geste d'écriture.
  // Rôle inconnu (chargement) ⇒ pas lecture seule — le doute n'interdit pas.
  const { team } = useTeam()
  const readOnly = team?.workspace.role === 'viewer'

  const list = useQuery({ queryKey: rfpKeys.list, queryFn: () => rfpApi.list(), enabled: Boolean(user) })
  const detail = useQuery({
    queryKey: rfpKeys.detail(selectedId ?? ''),
    queryFn: () => rfpApi.get(selectedId as string),
    enabled: Boolean(selectedId),
  })

  const onImported = useCallback(
    (id: string) => {
      setSelectedId(id)
      void queryClient.invalidateQueries({ queryKey: rfpKeys.list })
    },
    [queryClient],
  )

  return (
    <Box id="appels-offres" className="space-y-4">
      {/* #2179.4 / #2179.5 / #2179.6 — L'ENTÊTE DE LA PAGE.
            `PageHeader` supprime déjà le titre de section dès qu'elle porte
            plusieurs onglets (`nameLivesInTabs`) — c'est le cas de `/rfp`
            (section « Projets », 3 onglets) : sans `titleInScreen` +
            `ScreenIntro`, la page n'affiche AUCUN titre. Le sous-titre nomme
            le rôle de l'écran (lire, distribuer, préparer un appel d'offres)
            et ce qu'il suit (échéances, exigences sans réponse, décisions à
            trancher) — distinct de la phrase d'intro retirée par #1845, qui
            répétait `routes.json#/rfp.description` juste au-dessus de
            l'intake. */}
      <ScreenIntro
        title={t('page.title')}
        titleWithoutName={t('page.title')}
        subtitle={t('page.subtitle')}
        action={action}
      />
      {/* #2179.33 — LA MÊME PRIMITIVE que sur les autres écrans de liste
            (`AccountsPage`, `ProjectsPage`) : un lien qui pré-remplit la
            question dans la conversation déjà existante, jamais un second
            moteur (D44). La catégorie « rfp » du tiroir de commandes
            (`chat-commands/categories.ts`) existe déjà côté catalogue — ce
            lien est le point d'entrée qui manquait depuis CET écran. */}
      <AskLaura label={t('page.askLauraLabel')} question={t('page.askLauraQuestion')} />
      {/* #2957 (#2179.7-.12) — LE RÉSUMÉ de la page d'entrée : le registre
            VUES/RÉSUMÉ de #2179 nomme six cartes, aucune n'existait. */}
      <RfpMaskedNotice />
      <RfpSummaryCards rfps={list.data?.rfps ?? []} />
      {/* #1845 — « supprime ce titre » : l'élément pointé par le retour
            (markup joint à l'issue) était très précisément cette phrase
            d'intro, pas l'entête de page. Elle répétait, un mot près, ce que
            dit déjà `routes.json#/rfp.description`, et n'apprenait plus rien
            une fois le geste connu — le bouton « Analyser » et les champs de
            l'intake, juste en dessous, suffisent à savoir quoi faire. */}
      {readOnly ? (
        <Card className="p-4">
          <Text size="sm">{t('readOnly.notice')}</Text>
        </Card>
      ) : (
        <RfpImportFlow onImported={onImported} />
      )}
      {/* #2957 (#2179.20-.29) — en vue table, D81/GA-34 veut la PLEINE
            LARGEUR (un tableau, pas du texte) : la colonne fixe de 320px du
            panneau cartes+détail disparaît, le tableau prend toute la place
            et le détail s'affiche EN DESSOUS, pleine largeur lui aussi. */}
      <div className={listLayout === 'table' ? 'space-y-4' : 'grid gap-4 lg:grid-cols-[320px_1fr]'}>
        <RfpList
          rfps={list.data?.rfps ?? []}
          loading={list.isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          layout={listLayout}
          onChangeLayout={setListLayout}
        />
        {detail.data ? (
          <RfpDetailPanel detail={detail.data} readOnly={readOnly} />
        ) : listLayout === 'table' ? null : (
          <EmptyPanel text={t('detail.pick')} />
        )}
      </div>
    </Box>
  )
}

/**
 * L'intake. Deux chemins, parce qu'il y a deux situations : le commercial colle
 * trois paragraphes, ou il dépose le `.docx` de quarante pages qu'il a reçu.
 * Le fichier part en base64 et c'est le SERVEUR qui l'extrait — lire un `.docx`
 * en UTF-8 côté navigateur produit du mojibake.
 *
 * #2180.5 / #2180.6 — l'import ne crée PLUS le dossier directement : il
 * s'arrête d'abord sur une PRÉVISUALISATION (`ImportPreviewCard`, ci-dessous),
 * avec ses six indicateurs (#2180.41-46) et ses actions de contrôle
 * (#2180.47-52). `POST /rfp/confirm` est la SEULE écriture qui suit.
 */
/** Ce que la route accepte (12 Mo de corps encodé) ramené au poids RÉEL d'un
 *  document : la base64 ajoute un tiers, donc ~9 Mo. On annonce 8 pour garder
 *  la marge du reste du corps (titre, texte collé). */
const MAX_RFP_FILE_MB = 8
const MAX_RFP_FILE_BYTES = MAX_RFP_FILE_MB * 1_000_000

type RfpDocumentDraft = { text?: string; fileBase64?: string; fileName?: string }
type StagedFile = { name: string; base64: string }

/** Le corps `POST /rfp/preview` (et `/rfp`) construit à partir de ce qui est
 *  ENCORE en cours de saisie — pure, partagée par l'intake et la preview
 *  (#2180.49 « Exclure », #2180.50 « Ajouter ») pour ne jamais diverger. */
function buildImportBody(title: string, text: string, files: StagedFile[]): RfpCreateBody {
  const textDocument: RfpDocumentDraft | null = text.trim() ? { text } : null
  const fileDocuments: RfpDocumentDraft[] = files.map(file => ({ fileBase64: file.base64, fileName: file.name }))
  const documents = [...(textDocument ? [textDocument] : []), ...fileDocuments]
  // #2180.2 / #2180.4 — deux documents ou plus : REGROUPÉS via `documents`.
  // Un seul (texte OU fichier unique) : la forme mono-document d'avant.
  return documents.length > 1 ? { title, documents } : { title, ...(documents[0] ?? {}) }
}

/** #2180.53 — ce que la session reprenable garde d'un import : le texte collé et
 *  les NOMS des fichiers, lus sur le corps exact qui vient d'être analysé. */
function sessionInputOf(body: RfpCreateBody): { pastedText: string | null; documentNames: string[] } {
  const documents = body.documents ?? [{ text: body.text, fileName: body.fileName }]
  return {
    pastedText: documents.find(document => document.text)?.text ?? null,
    documentNames: documents.flatMap(document => (document.fileName ? [document.fileName] : [])),
  }
}

function hasAnyDocument(body: RfpCreateBody): boolean {
  return Boolean(body.text || body.fileBase64 || (body.documents && body.documents.length > 0))
}

/**
 * Le flux d'import complet : intake → preview → confirmation.
 *
 * L'état des documents (titre, texte, fichiers) vit ICI, pas dans un écran ou
 * l'autre : « Corriger » (#2180.48) revient à l'intake SANS rien perdre,
 * « Exclure »/« Ajouter » (#2180.49/.50) rappellent `preview` avec la liste à
 * jour, et « Annuler l'import » (#2180.52) est le SEUL geste qui vide tout —
 * cohérent avec le fait que rien n'a encore été écrit côté serveur.
 */
function RfpImportFlow({ onImported }: { onImported: (id: string) => void }) {
  const { t } = useTranslation('rfp')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [files, setFiles] = useState<StagedFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [preview, setPreview] = useState<RfpImportPreview>()
  // #2179.31 — le besoin dont le dossier est tiré, s'il l'est.
  const [sourceNeedId, setSourceNeedId] = useState<string>()

  // #2957 (#2180.53) — un import INTERROMPU (onglet fermé, coupure) se retrouve
  // côté serveur : la session en cours est proposée en tête de l'intake.
  const importSession = useQuery({ queryKey: rfpKeys.importSession, queryFn: () => rfpApi.importSession() })
  const pendingSession = importSession.data?.session ?? null
  // Les noms des documents d'une session reprise : leurs octets ne sont pas gardés.
  const [resumedNames, setResumedNames] = useState<string[]>([])

  const cancelSession = useMutation({
    mutationFn: () => rfpApi.cancelImportSession(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rfpKeys.importSession }),
    onError: (error: Error) => toast.error(error.message || t('resume.abandonFailed')),
  })

  const saveSession = useMutation({
    mutationFn: (input: SaveRfpImportSession) => rfpApi.saveImportSession(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rfpKeys.importSession }),
  })

  const reset = useCallback(() => {
    setResumedNames([])
    setTitle('')
    setText('')
    setFiles([])
    setFileError(null)
    setPreview(undefined)
    setSourceNeedId(undefined)
  }, [])

  const previewMutation = useMutation({
    mutationFn: async (body: RfpCreateBody) => {
      // #2957 — la session se garde AVANT l'analyse (qui dure) : recharger
      // pendant le spinner laisse une reprise, aperçu `null` jusqu'au retour.
      saveSession.mutate({ title: body.title, ...sessionInputOf(body), preview: null })
      return rfpApi.preview(body)
    },
    onSuccess: (result, body) => {
      setPreview(result)
      setResumedNames([])
      // #2180.53 — l'aperçu rendu est GARDÉ côté serveur : fermer l'onglet ne le perd plus.
      saveSession.mutate({ title: body.title, ...sessionInputOf(body), preview: result })
    },
    onError: (error: Error) => toast.error(error.message || t('preview.failed')),
  })

  const confirmMutation = useMutation({
    // #2957 (#2180.54) — les MÊMES fichiers déjà déposés pour la preview,
    // RESSAISIS ici : `preview` n'écrit rien (#2180.5), donc c'est `confirm`
    // qui range les octets, exactement comme il écrit le reste du dossier.
    mutationFn: (draft: RfpImportDraft) =>
      rfpApi.confirm(
        draft,
        sourceNeedId,
        files.map(file => ({ fileBase64: file.base64, fileName: file.name })),
      ),
    onSuccess: result => {
      toast.success(t('intake.imported', { count: result.rfp.requirements.length }))
      onImported(result.rfp.id)
      // `confirm` a fermé la session côté serveur (#2180.53) : la bannière s'efface.
      void queryClient.invalidateQueries({ queryKey: rfpKeys.importSession })
      reset()
    },
    onError: (error: Error) => toast.error(error.message || t('preview.confirmFailed')),
  })

  // #2180.2 — DÉTECTION de plusieurs documents : chaque fichier déposé s'ajoute
  // à la liste au lieu de remplacer le précédent (mono-document : un seul
  // fichier finit dans la liste, comportement inchangé côté service). Rend la
  // liste FUSIONNÉE plutôt que de la poser elle-même : l'appelant décide s'il
  // doit aussi relancer une preview (#2180.50), l'intake n'en a pas besoin.
  const addFiles = useCallback(
    async (picked: FileList, current: StagedFile[]): Promise<StagedFile[]> => {
      let next = current
      for (const file of Array.from(picked)) {
        // Le fichier voyage encodé en base64, qui le gonfle d'un tiers. On refuse
        // ICI, avec le poids réel du document, plutôt que de laisser l'envoi
        // partir et revenir en erreur de transport — c'est cette erreur muette
        // qu'un client a rencontrée en déposant un dossier de mission.
        if (file.size > MAX_RFP_FILE_BYTES) {
          setFileError(t('intake.fileTooLarge', { max: MAX_RFP_FILE_MB, size: Math.ceil(file.size / 1_000_000) }))
          continue
        }
        setFileError(null)
        const buffer = await file.arrayBuffer()
        // btoa sur une longue chaîne fait exploser la pile : on découpe.
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let index = 0; index < bytes.length; index += 8192) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
        }
        const name = file.name
        if (!next.some(existing => existing.name === name)) next = [...next, { name, base64: btoa(binary) }]
      }
      return next
    },
    [t],
  )

  const removeFile = (name: string) => setFiles(prev => prev.filter(file => file.name !== name))

  const canSubmit = title.trim().length > 0 && (text.trim().length > 0 || files.length > 0)

  /** #2180.49 / #2180.50 — retirer ou ajouter un document PENDANT la preview :
   *  la liste change ET une nouvelle preview part aussitôt avec ce qui reste.
   *  Plus aucun document : retour à l'intake, rien à prévisualiser. */
  const repreviewWith = (nextText: string, nextFiles: StagedFile[]) => {
    setText(nextText)
    setFiles(nextFiles)
    const body = buildImportBody(title, nextText, nextFiles)
    if (hasAnyDocument(body)) previewMutation.mutate(body)
    else setPreview(undefined)
  }

  return preview ? (
    <ImportPreviewCard
      preview={preview}
      documents={[
        ...(text.trim() ? [{ key: '__text__', label: t('preview.documents.pastedText') }] : []),
        ...files.map(file => ({ key: file.name, label: file.name })),
        ...resumedNames
          .filter(name => !files.some(file => file.name === name))
          .map(name => ({ key: name, label: name })),
      ]}
      // #2180.53 — une session reprise n'a plus les octets : exclure ou ajouter
      // exigerait de ré-analyser, donc d'abord de redéposer les fichiers.
      locked={resumedNames.length > 0}
      busy={previewMutation.isPending || confirmMutation.isPending}
      onExclude={key =>
        repreviewWith(key === '__text__' ? '' : text, key === '__text__' ? files : files.filter(f => f.name !== key))
      }
      onAddFiles={async list => repreviewWith(text, await addFiles(list, files))}
      onConfirm={() => confirmMutation.mutate(preview.draft)}
      onCorrect={() => {
        setResumedNames([])
        setPreview(undefined)
      }}
      onCancel={() => {
        cancelSession.mutate()
        reset()
      }}
    />
  ) : (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileUp className="size-4 text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="semibold">
          {t('intake.title')}
        </Text>
      </div>
      {/* #2180.53 — un import interrompu se reprend, ou s'abandonne : intégré à
          la carte d'intake (même rangée d'actions que l'aperçu), jamais un
          bloc de plus au-dessus. */}
      {pendingSession ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--bellum-border)] pb-3">
          <History className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
          <div className="min-w-0 flex-1">
            <Text size="sm" weight="medium">
              {t('resume.title', { title: pendingSession.title })}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {!pendingSession.preview
                ? pendingSession.pastedText
                  ? t('resume.metaInterrupted', { date: formatDate(new Date(pendingSession.updatedAt)) })
                  : t('resume.metaInterruptedFiles', {
                      names: pendingSession.documentNames.join(', '),
                      date: formatDate(new Date(pendingSession.updatedAt)),
                    })
                : pendingSession.documentNames.length > 0
                  ? t('resume.meta', {
                      count: pendingSession.documentNames.length,
                      date: formatDate(new Date(pendingSession.updatedAt)),
                    })
                  : t('resume.metaPasted', { date: formatDate(new Date(pendingSession.updatedAt)) })}
            </Text>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setTitle(pendingSession.title)
              setText(pendingSession.pastedText ?? '')
              if (pendingSession.preview) {
                setResumedNames(pendingSession.documentNames)
                setPreview(pendingSession.preview)
              } else if (pendingSession.pastedText) {
                // Analyse interrompue : le texte est gardé, on la relance.
                previewMutation.mutate(buildImportBody(pendingSession.title, pendingSession.pastedText, []))
              }
              // Sinon : seuls des fichiers (octets non gardés) — l'avis « à redéposer » est sous le bouton.
            }}
          >
            {t('resume.resume')}
          </Button>
          <Button size="sm" variant="ghost" disabled={cancelSession.isPending} onClick={() => cancelSession.mutate()}>
            {t('resume.abandon')}
          </Button>
        </div>
      ) : null}
      <div className="space-y-2">
        <NeedSourcePicker
          onPick={need => {
            setTitle(need.account_name ? `${need.account_name} — ${need.title}` : need.title)
            setText(needToIntakeText(need, t))
            setSourceNeedId(need.id)
          }}
        />
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('intake.titlePlaceholder')}
          aria-label={t('intake.titlePlaceholder')}
          className="w-full rounded-md border border-[var(--bellum-border)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        />
        <textarea
          value={text}
          onChange={event => setText(event.target.value)}
          placeholder={t('intake.textPlaceholder')}
          aria-label={t('intake.textPlaceholder')}
          rows={4}
          className="w-full resize-y rounded-md border border-[var(--bellum-border)] bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--bellum-border)] px-3 py-1.5 text-xs hover:bg-[var(--bellum-surface-2)]">
            <Upload className="size-3.5" />
            {t('intake.pickFile')}
            <input
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
              onChange={event => {
                if (event.target.files?.length) {
                  const picked = event.target.files
                  void addFiles(picked, files).then(setFiles)
                }
                // Permet de resélectionner le même fichier après un retrait.
                event.target.value = ''
              }}
            />
          </label>
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('intake.formats')}
          </Text>
        </div>
        {/* #2180.2 / #2180.4 — les documents détectés, avant regroupement à
            l'analyse : un commercial qui dépose le CCTP puis le BPU doit voir
            les DEUX avant de cliquer « Analyser ». */}
        {files.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {files.map(file => (
              <li
                key={file.name}
                className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] py-1 pr-1 pl-2 text-xs"
              >
                <span className="max-w-[12rem] truncate text-[var(--bellum-text-primary)]">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('intake.removeFile', { name: file.name })}
                  onClick={() => removeFile(file.name)}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {fileError ? (
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {fileError}
          </Text>
        ) : null}
        <Button
          size="sm"
          disabled={!canSubmit || previewMutation.isPending}
          onClick={() => previewMutation.mutate(buildImportBody(title, text, files))}
        >
          {previewMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('intake.submit')}
        </Button>
        {/* #4463 — plus de ligne de coût ici : aucun crédit côté client (renverse #2181.48). */}
      </div>
    </Card>
  )
}

/**
 * #2180.5 / #2180.41-52 — L'ÉCRAN DE PREVIEW.
 *
 * Ce que l'import CRÉERAIT, jamais ce qui est déjà créé : rien n'existe encore
 * côté serveur tant qu'on n'a pas cliqué « Confirmer » ou « Créer comme
 * brouillon ». Les indicateurs (#2180.41-46) suivent la doctrine « un score
 * n'est jamais nu » — trois sont calculés, trois restent NOMMÉS « non mesuré ».
 */
function ImportPreviewCard({
  preview,
  documents,
  locked,
  busy,
  onExclude,
  onAddFiles,
  onConfirm,
  onCorrect,
  onCancel,
}: {
  preview: RfpImportPreview
  documents: { key: string; label: string }[]
  /** #2180.53 — import repris : pas d'octets, donc ni exclure ni ajouter avant de redéposer. */
  locked: boolean
  busy: boolean
  onExclude: (key: string) => void
  onAddFiles: (files: FileList) => void
  onConfirm: () => void
  onCorrect: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation('rfp')
  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('preview.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
        {t('preview.subtitle', { title: preview.draft.title })}
      </Text>

      <PreviewIndicators indicators={preview.indicators} />

      {preview.duplicateOf ? (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {preview.duplicateOf.matchedOn.includes('hash')
              ? t('preview.duplicate.warningHash', { title: preview.duplicateOf.title })
              : t('preview.duplicate.warningSimilar', {
                  title: preview.duplicateOf.title,
                  criteria: preview.duplicateOf.matchedOn
                    .map(kind => t(`preview.duplicate.criteria.${kind}`))
                    .join(t('preview.duplicate.criteriaSeparator')),
                })}
          </Text>
        </div>
      ) : null}

      {/* #2180.53 — un document en échec ne bloque JAMAIS la preview des
          autres : nommé ici, jamais un import qui disparaît en silence. */}
      {preview.failedDocuments.length > 0 ? (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" />
          <div>
            <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
              {t('preview.failedDocuments.title')}
            </Text>
            <ul className="mt-0.5">
              {preview.failedDocuments.map(failed => (
                <li key={failed.fileName ?? '__text__'}>
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t('preview.failedDocuments.reason', {
                      name: failed.fileName ?? t('preview.documents.pastedText'),
                      reason: failed.reason,
                    })}
                  </Text>
                </li>
              ))}
            </ul>
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
              {t('preview.failedDocuments.hint')}
            </Text>
          </div>
        </div>
      ) : null}

      {/* #2180.49 / #2180.50 — les documents de CET import, avec de quoi en
          exclure un ou en ajouter un avant de confirmer. */}
      <div className="mt-3">
        <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
          {t('preview.documents.title')}
        </Text>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {documents.map(document => (
            <li
              key={document.key}
              className="flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] py-1 pr-1 pl-2 text-xs"
            >
              <span className="max-w-[12rem] truncate text-[var(--bellum-text-primary)]">{document.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('preview.documents.exclude', { name: document.label })}
                disabled={busy || locked}
                onClick={() => onExclude(document.key)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
          <li>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--bellum-border)] px-3 py-1.5 text-xs hover:bg-[var(--bellum-surface-2)]">
              <Upload className="size-3.5" />
              {t('preview.documents.add')}
              <input
                type="file"
                multiple
                className="hidden"
                accept=".pdf,.docx,.xlsx,.txt,.md,.csv"
                disabled={busy || locked}
                onChange={event => {
                  if (event.target.files?.length) onAddFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          </li>
        </ul>
        {locked ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1.5">
            {t('preview.documents.redeposit')}
          </Text>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t('preview.confirm')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onConfirm}>
          {t('preview.createAsDraft')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCorrect}>
          {t('preview.correct')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('preview.cancel')}
        </Button>
      </div>
    </Card>
  )
}

function PreviewIndicators({ indicators }: { indicators: RfpImportPreviewIndicators }) {
  const { t } = useTranslation('rfp')
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      <Metric label={t('preview.indicators.total')} value={indicators.totalRequirements} />
      <Metric label={t('preview.indicators.mandatory')} value={indicators.mandatoryRequirements} />
      <NamedMetric
        label={t('preview.indicators.dueAt')}
        value={indicators.dueAt ? formatDate(new Date(indicators.dueAt)) : null}
      />
      <NamedMetric label={t('preview.indicators.missingDocuments')} value={indicators.missingDocuments} />
      <NamedMetric label={t('preview.indicators.contradictions')} value={indicators.contradictions} />
      <NamedMetric label={t('preview.indicators.estimatedCost')} value={indicators.estimatedCost} />
    </div>
  )
}

/** Un axe NON MESURÉ (`null`) se NOMME — jamais un zéro fabriqué (doctrine :
 *  un score n'est jamais nu). */
function NamedMetric({ label, value }: { label: string; value: string | number | null }) {
  const { t } = useTranslation('rfp')
  return (
    <div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      {value === null ? (
        <Text size="sm" className="italic text-[var(--bellum-text-muted)]">
          {t('preview.indicators.notMeasured')}
        </Text>
      ) : (
        <Text size="sm" weight="semibold">
          {value}
        </Text>
      )}
    </div>
  )
}

/** Statuts qui ferment un dossier — plus rien ne s'y travaille activement. */
const RFP_TERMINAL_STATUSES: readonly string[] = ['won', 'lost', 'no_bid']

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * #2957 (#2179.7-.12) — LE RÉSUMÉ de la page d'entrée. Le registre RÉSUMÉ de
 * #2179 nomme six cartes ; AUCUNE n'existait avant ce lot.
 *
 * Cinq sont RÉELLEMENT calculées depuis les dossiers de l'espace (le MÊME
 * compte que `computeRfpCompliance`, jamais une seconde logique). La
 * sixième, « Profils manquants », reste NOMMÉE « Non mesuré » : aucune
 * intégration du module RFP au Vivier n'existe encore (voir #2181.24, hors
 * périmètre de ce lot) — l'afficher à zéro mentirait, une liste vide ne
 * ment jamais puisqu'elle ne dit rien du tout (doctrine « on n'affiche pas
 * ce qu'on n'a pas »), mais SOUS un score/une carte, l'axe non mesuré reste
 * NOMMÉ plutôt que retiré.
 */
function RfpSummaryCards({ rfps }: { rfps: RfpSummary[] }) {
  const { t } = useTranslation('rfp')

  const counts = useMemo(() => {
    const now = Date.now()
    let active = 0
    let dueSoon = 0
    let mandatoryUnanswered = 0
    let toValidate = 0
    let submitted = 0
    for (const rfp of rfps) {
      const isActive = !RFP_TERMINAL_STATUSES.includes(rfp.status)
      if (!isActive) continue
      // Les quatre comptes qui suivent ne portent QUE sur les dossiers actifs :
      // un dossier gagné/perdu/renoncé ne bloque plus rien, sa réponse n'attend
      // plus de validation, et son échéance n'est plus une urgence.
      active += 1
      if (rfp.due_at) {
        const daysUntilDue = (new Date(rfp.due_at).getTime() - now) / MS_PER_DAY
        if (daysUntilDue >= 0 && daysUntilDue <= 7) dueSoon += 1
      }
      mandatoryUnanswered += rfp.mandatoryUnanswered
      toValidate += rfp.toValidateCount
      if (rfp.status === 'submitted') submitted += 1
    }
    return { active, dueSoon, mandatoryUnanswered, toValidate, submitted }
  }, [rfps])

  if (rfps.length === 0) return null

  return (
    <Card className="p-4" data-testid="rfp-summary-cards">
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
        <NamedMetric label={t('summary.active')} value={counts.active} />
        <NamedMetric label={t('summary.dueSoon')} value={counts.dueSoon} />
        <NamedMetric label={t('summary.mandatoryUnanswered')} value={counts.mandatoryUnanswered} />
        <NamedMetric label={t('summary.missingProfiles')} value={null} />
        <NamedMetric label={t('summary.toValidate')} value={counts.toValidate} />
        <NamedMetric label={t('summary.submitted')} value={counts.submitted} />
      </div>
    </Card>
  )
}

/**
 * #2179.13-.19 — LES SEPT VUES du registre, dans son ordre.
 *
 * « Soumis », « Gagnés », « Perdus » filtrent un statut existant ; les quatre
 * autres n'ont pas de statut 1-pour-1 et se DÉRIVENT (statut + réponses à
 * valider, voir `inListView`) plutôt que d'être inventées.
 */
const RFP_LIST_VIEWS = [
  'all',
  'to_process',
  'in_preparation',
  'to_validate',
  'submitted',
  'won',
  'lost',
  'archived',
] as const
type RfpListView = (typeof RFP_LIST_VIEWS)[number]

/**
 * #2957 (#2179.13/.14/.15/.19) — les quatre vues sans statut 1-pour-1, DÉRIVÉES
 * de la donnée réelle plutôt qu'inventées (tranché sans Louis) :
 *  - À traiter      = importé/analysé, pas encore tranché (bid/no-bid) ;
 *  - En préparation = « on y va », aucune réponse en attente de relecture ;
 *  - À valider      = « on y va », au moins une réponse à relire ;
 *  - Archivés       = renoncé (`no_bid`) — on archive, on ne supprime pas.
 * Chaque dossier tombe dans UNE vue de statut au plus.
 */
function inListView(rfp: RfpSummary, view: RfpListView): boolean {
  switch (view) {
    case 'all':
      return true
    case 'to_process':
      return rfp.status === 'intake' || rfp.status === 'analysed'
    case 'in_preparation':
      return rfp.status === 'bid' && !(rfp.toValidateCount > 0)
    case 'to_validate':
      return rfp.status === 'bid' && rfp.toValidateCount > 0
    case 'archived':
      return rfp.status === 'no_bid'
    default:
      return rfp.status === view
  }
}

/** #2957 (#2179.20-.29) — cartes (défaut) ou table triable pleine largeur. */
const RFP_LIST_LAYOUTS = ['cards', 'table'] as const
type RfpListLayout = (typeof RFP_LIST_LAYOUTS)[number]

function RfpList({
  rfps,
  loading,
  selectedId,
  onSelect,
  layout,
  onChangeLayout,
}: {
  rfps: RfpSummary[]
  loading: boolean
  selectedId?: string
  onSelect: (id: string) => void
  layout: RfpListLayout
  onChangeLayout: (layout: RfpListLayout) => void
}) {
  const { t } = useTranslation('rfp')
  const [view, setView] = useState<RfpListView>('all')
  const filtered = useMemo(() => rfps.filter(rfp => inListView(rfp, view)), [rfps, view])

  if (loading) return <Card className="h-40 animate-pulse p-4" />
  if (rfps.length === 0) return <RfpEmptyState />

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <nav aria-label={t('list.views.label')} className="min-w-0">
          <TabNav
            tabs={RFP_LIST_VIEWS.map(key => ({ key, label: t(`list.views.${key}`) }))}
            activeTab={view}
            onTabChange={key => setView(key as RfpListView)}
            size="sm"
            variant="pill"
          />
        </nav>
        <RfpListLayoutToggle layout={layout} onChange={onChangeLayout} />
      </div>
      {filtered.length === 0 ? (
        <EmptyPanel text={t('list.emptyView')} />
      ) : layout === 'table' ? (
        <RfpTable rfps={filtered} selectedId={selectedId} onSelect={onSelect} />
      ) : (
        <ul aria-label={t('list.title')} className="space-y-2">
          {filtered.map(rfp => (
            <li key={rfp.id}>
              <button
                type="button"
                onClick={() => onSelect(rfp.id)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  rfp.id === selectedId
                    ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)]/5'
                    : 'border-[var(--bellum-border)] hover:bg-[var(--bellum-surface-2)]',
                )}
              >
                <Text size="sm" weight="medium">
                  {rfp.title}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
                  {t(`status.${rfp.status}`)}
                  {rfp.due_at ? ` · ${t('list.dueAt', { date: formatDate(new Date(rfp.due_at)) })}` : ''}
                </Text>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RfpListLayoutToggle({
  layout,
  onChange,
}: {
  layout: RfpListLayout
  onChange: (layout: RfpListLayout) => void
}) {
  const { t } = useTranslation('rfp')
  return (
    <div
      role="group"
      aria-label={t('list.layout.label')}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--bellum-border)] p-0.5"
    >
      {RFP_LIST_LAYOUTS.map(key => (
        <button
          key={key}
          type="button"
          aria-pressed={layout === key}
          onClick={() => onChange(key)}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-medium transition-colors',
            layout === key
              ? 'bg-[var(--bellum-primary-500)]/15 text-[var(--bellum-text-accent)]'
              : 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-secondary)]',
          )}
        >
          {t(`list.layout.${key}`)}
        </button>
      ))}
    </div>
  )
}

/**
 * #2957 (#2179.20-.29) — les colonnes RÉELLEMENT calculables aujourd'hui :
 * client (`issuer`), périmètre (`lots`), échéance (`due_at`), statut,
 * exigences (`requirementsCount`) et couverture (`mandatoryTotal` -
 * `mandatoryUnanswered`). Owner par dossier, profils, documents multiples et
 * prochaine action restent hors de ce lot — aucune donnée réelle ne les
 * porte encore (`registre-2026-09-16-ecrans-secondaires.md`, #2179.23/.27-.29),
 * et une colonne sans donnée serait la case vide que la doctrine refuse.
 */
type RfpTableSortKey = 'issuer' | 'lots' | 'due_at' | 'status' | 'requirementsCount' | 'coverage'
type RfpTableSort = { key: RfpTableSortKey; direction: 'asc' | 'desc' }

function sortedForTable(rfps: RfpSummary[], sort: RfpTableSort): RfpSummary[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...rfps].sort((a, b) => {
    const va = tableSortValue(a, sort.key)
    const vb = tableSortValue(b, sort.key)
    // Une échéance absente reste TOUJOURS en fin de liste, quel que soit le
    // sens du tri — trier un `null` avant une date réelle laisserait croire
    // qu'un dossier sans échéance est le plus urgent.
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    if (va < vb) return -1 * factor
    if (va > vb) return 1 * factor
    return 0
  })
}

function tableSortValue(rfp: RfpSummary, key: RfpTableSortKey): string | number | null {
  switch (key) {
    case 'issuer':
      return rfp.issuer
    case 'lots':
      return rfp.lots.length > 0 ? rfp.lots.join(', ') : null
    case 'due_at':
      return rfp.due_at
    case 'status':
      return rfp.status
    case 'requirementsCount':
      return rfp.requirementsCount
    // Moins d'obligatoires SANS réponse validée = un dossier plus prêt : le
    // tri ascendant montre d'abord ce qui est le plus proche de l'export.
    case 'coverage':
      return rfp.mandatoryTotal === 0 ? null : rfp.mandatoryUnanswered
  }
}

function RfpTable({
  rfps,
  selectedId,
  onSelect,
}: {
  rfps: RfpSummary[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation('rfp')
  const [sort, setSort] = useState<RfpTableSort>({ key: 'due_at', direction: 'asc' })
  const rows = useMemo(() => sortedForTable(rfps, sort), [rfps, sort])

  const toggleSort = (key: RfpTableSortKey) =>
    setSort(current =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    )

  const columns: { key: RfpTableSortKey; label: string; align?: 'right' }[] = [
    { key: 'issuer', label: t('list.table.issuer') },
    { key: 'lots', label: t('list.table.lots') },
    { key: 'due_at', label: t('list.table.dueAt') },
    { key: 'status', label: t('list.table.status') },
    { key: 'requirementsCount', label: t('list.table.requirements'), align: 'right' },
    { key: 'coverage', label: t('list.table.coverage'), align: 'right' },
  ]

  return (
    // #2957 (#2179.20-.29) — `Table` (packages/ui) porte déjà le conteneur
    // défilant tabulable et nommé (GA-119) : un `<table>` à la main aurait
    // recopié un défaut déjà corrigé ailleurs (GA-26).
    <Table scrollLabel={t('list.title')} aria-label={t('list.title')} className="min-w-[46rem]">
      <TableHeader>
        <TableRow>
          {columns.map(column => (
            <TableHead key={column.key} className={cn(column.align === 'right' && 'text-right')}>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                icon={sort.key === column.key ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : undefined}
                iconPosition={column.align === 'right' ? 'right' : 'left'}
                onClick={() => toggleSort(column.key)}
                aria-label={t('list.table.sortBy', { column: column.label })}
                className={cn(
                  '-mx-2 pointer-coarse:min-h-11',
                  sort.key === column.key && 'text-[var(--bellum-text-primary)]',
                )}
              >
                {column.label}
              </Button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(rfp => (
          <TableRow
            key={rfp.id}
            onClick={() => onSelect(rfp.id)}
            aria-selected={rfp.id === selectedId}
            className={cn(
              'cursor-pointer',
              rfp.id === selectedId && 'bg-[color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent)]',
            )}
          >
            <TableCell>
              {/* Un `<tr>` ne se tabule ni ne s'annonce (GA-35) : le clic de
                  ligne n'est qu'un raccourci souris, le bouton porte le nom
                  accessible réel — même patron que `ProjectsTable`. */}
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onSelect(rfp.id)
                }}
                className="text-left"
              >
                <Text size="sm" weight="medium">
                  {rfp.title}
                </Text>
              </button>
              {rfp.issuer ? (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {rfp.issuer}
                </Text>
              ) : null}
            </TableCell>
            <TableCell className="text-[var(--bellum-text-secondary)]">
              {rfp.lots.length > 0 ? rfp.lots.join(', ') : '—'}
            </TableCell>
            <TableCell className="text-[var(--bellum-text-secondary)]">
              {rfp.due_at ? formatDate(new Date(rfp.due_at)) : '—'}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{t(`status.${rfp.status}`)}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums text-[var(--bellum-text-secondary)]">
              {rfp.requirementsCount}
            </TableCell>
            <TableCell className="text-right tabular-nums text-[var(--bellum-text-secondary)]">
              {rfp.mandatoryTotal === 0
                ? '—'
                : t('list.table.coverageValue', {
                    validated: rfp.mandatoryTotal - rfp.mandatoryUnanswered,
                    total: rfp.mandatoryTotal,
                  })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function RfpDetailPanel({ detail, readOnly = false }: { detail: RfpDetail; readOnly?: boolean }) {
  const { t } = useTranslation('rfp')
  const dataExit = useDataExit()
  const queryClient = useQueryClient()
  const { rfp, compliance } = detail

  const decide = useMutation({
    mutationFn: (verdict: 'bid' | 'no_bid') => rfpApi.decide(rfp.id, verdict),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfpKeys.list })
      void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(rfp.id) })
    },
  })
  // #2957 (#2181.47) — « Marquer soumis » : `submitted` existait dans
  // `rfpStatusSchema` depuis le début, sans AUCUN geste écran pour y passer.
  // Un geste DÉCLARATIF (voir `RfpService.markSubmitted`) — jamais une preuve
  // d'envoi.
  const markSubmitted = useMutation({
    mutationFn: () => rfpApi.markSubmitted(rfp.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfpKeys.list })
      void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(rfp.id) })
    },
    onError: (error: Error) => toast.error(error.message || t('decision.markSubmittedFailed')),
  })

  const pending = useMemo(
    () => Object.entries(compliance.pendingByOwner).filter(([, count]) => count > 0),
    [compliance.pendingByOwner],
  )

  return (
    // #2179.37 — un `fieldset` désactivé neutralise d'un coup TOUS les gestes
    // d'écriture du panneau (boutons, sélecteurs, champs) ; la lecture et le
    // lien « Demander à Laura » restent.
    <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-4 border-0 p-0">
      {/* #1097 « est-ce que ça sert à Bellum de charger les AO reçus d'un
          compte ? » — oui, à partir du moment où l'appel d'offres devient un
          BESOIN : il entre alors dans la vue transverse et dans le moteur de
          matching du vivier. Placé en tête, parce que c'est le geste qui rend le
          reste utile. */}
      {/* #2179.31 / #2179.36 — un dossier DÉJÀ lié à un besoin (tiré de lui,
          ou transformé en lui) ne propose plus d'en créer un second. */}
      {rfp.need_id ? (
        <>
          <Card className="p-4">
            <Text size="sm">{t('need.linked')}</Text>
          </Card>
          {/* #2152.25 — rattacher les profils : un positionnement sur le besoin de l'AO. */}
          <RfpProfilesCard needId={rfp.need_id} />
        </>
      ) : (
        <NeedFromRfpCard rfpId={rfp.id} />
      )}
      {/* #2957 (#2181.41) — « Demander à Laura » DANS le studio, scopé au
          dossier ouvert, pas seulement en tête de liste (#2179.33, déjà là).
          Même primitive (D44) : la question nomme LE dossier, jamais un
          second moteur de conversation. */}
      <AskLaura
        label={t('page.askLauraLabel')}
        question={t('detail.askLauraQuestion', { title: rfp.title })}
        accountId={rfp.account_id ?? undefined}
      />
      {/* La décision AVANT la rédaction : c'est l'ordre du rapport, et c'est ce
          qui évite de brûler trois jours d'avant-vente sur un dossier perdu. */}
      {rfp.decision ? (
        <Card className="p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Text size="sm" weight="semibold">
              {t('decision.title')}
            </Text>
            <Badge variant="outline">{t(`decision.verdict.${rfp.decision.verdict}`)}</Badge>
            {rfp.decision.fit !== null ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('decision.fit', { value: rfp.decision.fit })}
              </Text>
            ) : null}
          </div>
          <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
            {rfp.decision.rationale}
          </Text>
          <ListBlock title={t('decision.redFlags')} items={rfp.decision.redFlags} tone="danger" />
          <ListBlock title={t('decision.conditions')} items={rfp.decision.conditions} />
          <ListBlock title={t('decision.questions')} items={rfp.decision.questions} />
          {rfp.status === 'analysed' ? (
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate('bid')}>
                {t('decision.go')}
              </Button>
              <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate('no_bid')}>
                {t('decision.pass')}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* La matrice de conformité ne dit pas « c'est bon » : elle compte ce qui
          manque, et c'est ce chiffre qui autorise ou non l'export. */}
      <Card className="p-4">
        <Text size="sm" weight="semibold">
          {t('compliance.title')}
        </Text>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Metric label={t('compliance.total')} value={compliance.total} />
          <Metric label={t('compliance.mandatory')} value={compliance.mandatory} />
          <Metric label={t('compliance.missing')} value={compliance.mandatoryUnanswered} tone="danger" />
          <Metric label={t('compliance.ambiguous')} value={compliance.ambiguous} tone="warning" />
        </div>
        {pending.length > 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
            {t('compliance.pending', {
              detail: pending.map(([role, count]) => `${t(`owner.${role}`)} : ${count}`).join(' · '),
            })}
          </Text>
        ) : null}
        <div className="mt-2 flex items-start gap-1.5">
          {compliance.exportReady ? (
            <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-soft-text)]" />
          ) : (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
          )}
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {compliance.exportReady ? t('compliance.ready') : t('compliance.notReady')}
          </Text>
        </div>
        {/* #2957 (#2181.46) — « Exporter » n'existe QUE quand le dossier peut
            partir : c'est la règle de cet écran depuis l'origine (docblock de
            `RfpPage`). */}
        {compliance.exportReady && dataExit.grant ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 min-h-11"
            onClick={() => {
              if (dataExit.grant) downloadCSV(matrixCsv(rfp, t), `${rfp.title || 'appel-d-offres'}.csv`, dataExit.grant)
            }}
          >
            {t('export.cta')}
          </Button>
        ) : null}
        {/* #2957 (#2181.47) — visible seulement APRÈS la décision « on y va » :
            marquer soumis un dossier jamais décidé n'aurait aucun sens. Le
            bouton reste actif même sans `exportReady` — un commercial qui a
            déjà déposé la réponse ailleurs doit pouvoir le dire, l'écran ne
            décide pas à sa place si le dépôt était prudent. */}
        {rfp.status === 'bid' ? (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2"
            disabled={markSubmitted.isPending}
            onClick={() => markSubmitted.mutate()}
          >
            {t('decision.markSubmitted')}
          </Button>
        ) : null}
      </Card>

      <DocumentExtractionCard extraction={rfp.document_extraction} />

      <RfpSourceDocuments rfpId={rfp.id} />

      <RequirementsTable detail={detail} />
    </fieldset>
  )
}

/** #2957 (#2181.46) — la matrice de réponse en CSV : seulement ce que
 *  l'écran affiche déjà, et elle sort par `downloadCSV` — donc à travers la
 *  règle d'espace (#2081.14), jamais par un Blob fabriqué ici. */
function matrixCsv(rfp: RfpDetail['rfp'], t: (key: string) => string): string {
  const header = ['section', 'text', 'weight', 'status', 'answer', 'source', 'owner'].map(key =>
    t(`export.columns.${key}`),
  )
  const rows = rfp.requirements.map(requirement => [
    requirement.section ?? '',
    requirement.text,
    t(`weight.${requirement.weight}`),
    t(`answerStatus.${requirement.answer_status}`),
    requirement.answer_text ?? '',
    requirement.answer_source ?? '',
    t(`owner.${requirement.owner_role}`),
  ])
  return toCsv([header, ...rows])
}

/**
 * #2957 (#2180.9-.26/.27/.28/.30/.31) — la structure DOSSIER : douze
 * catégories nommées, chacune avec sa provenance. Contexte SCORE (comme
 * `compliance` juste au-dessus) : un axe non trouvé/à vérifier reste NOMMÉ,
 * jamais retiré — c'est `RfpExtractionCategory` qui fixe la liste, pas ce que
 * le document a réellement porté.
 *
 * `null` = l'extraction n'a jamais tourné sur ce dossier (importé avant ce
 * chantier) : la carte entière ne se rend pas, même logique que la carte
 * « décision » ci-dessus quand `rfp.decision` est `null`.
 */
function DocumentExtractionCard({ extraction }: { extraction: RfpDocumentExtraction | null }) {
  const { t } = useTranslation('rfp')
  if (!extraction) return null
  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('extraction.title')}
      </Text>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {RFP_EXTRACTION_CATEGORIES.map(category => (
          <ExtractionCategoryRow key={category} category={category} field={extraction[category]} />
        ))}
      </div>
    </Card>
  )
}

function ExtractionCategoryRow({
  category,
  field,
}: {
  category: RfpExtractionCategory
  field: RfpExtractedField | undefined
}) {
  const { t } = useTranslation('rfp')
  const status = field?.status ?? 'not_found'
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
          {t(`extraction.category.${category}`)}
        </Text>
        <Badge
          variant={
            status === 'found'
              ? 'success'
              : status === 'to_verify'
                ? 'warning'
                : status === 'contradiction'
                  ? 'danger'
                  : 'outline'
          }
        >
          {t(`extraction.status.${status}`)}
        </Badge>
      </div>
      {field?.value ? (
        <Text size="sm" className="mt-0.5 break-words">
          {field.value}
          {field.page ? (
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {' '}
              {t('extraction.page', { page: field.page })}
            </Text>
          ) : null}
        </Text>
      ) : null}
    </div>
  )
}

function RequirementsTable({ detail }: { detail: RfpDetail }) {
  const { t } = useTranslation('rfp')
  const queryClient = useQueryClient()
  // #2152.27 — VALIDER AVANT GÉNÉRATION : « Rédiger » ouvre l'étape de validation
  // (`DraftSourcesReview`), la génération ne part qu'avec les sources que l'humain a
  // cochées. Avant : `draft(…, [])` au clic — rien validé, la preuve rattachée jamais transmise.
  const [reviewOpenFor, setReviewOpenFor] = useState<string>()
  const draft = useMutation({
    mutationFn: ({ requirementId, sources }: { requirementId: string; sources: ApprovedSource[] }) =>
      rfpApi.draft(detail.rfp.id, requirementId, sources),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) })
      setReviewOpenFor(undefined)
    },
    onError: (error: Error) => toast.error(error.message || t('requirements.draftFailed')),
  })
  // #2152.24 — un RÔLE, jamais une personne : l'endpoint (`updateRfpRequirementSchema`)
  // n'accepte que `owner_role`, l'assignation nominative reste hors périmètre par
  // design (commentaire sur `rfpOwnerRoleSchema`, `packages/contracts/src/schemas/rfp.ts`).
  const updateOwner = useMutation({
    mutationFn: ({ requirementId, owner_role }: { requirementId: string; owner_role: RfpOwnerRole }) =>
      rfpApi.updateRequirement(detail.rfp.id, requirementId, { owner_role }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) }),
    onError: (error: Error) => toast.error(error.message || t('requirements.ownerUpdateFailed')),
  })
  // #2957 (#2181.19/.20/.22/.23) — le statut porte désormais SEPT valeurs
  // (registre `STATUTS`) ; l'écran ne se contentait que de les AFFICHER
  // (`STATUS_CLASS`), sans jamais laisser les poser — les quatre nouvelles
  // n'avaient donc aucun appelant. `updateRfpRequirementSchema` acceptait
  // déjà `answer_status` (voir le bouton « Rédiger », qui le fait passer à
  // `drafted`) : ce mutateur ouvre le MÊME endpoint à un choix humain direct.
  const updateStatus = useMutation({
    mutationFn: ({ requirementId, answer_status }: { requirementId: string; answer_status: RfpAnswerStatus }) =>
      rfpApi.updateRequirement(detail.rfp.id, requirementId, { answer_status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) }),
    onError: (error: Error) => toast.error(error.message || t('answerStatus.updateFailed')),
  })
  // #2957 (#2181.10/.14/.42) — « Ajouter une preuve » : le contrat porte déjà
  // `evidence`/`confidence` (`updateRfpRequirementSchema`), sans AUCUN geste
  // écran pour les poser — exactement le motif que ce dépôt nomme : « du code
  // juste, calculé, testé, que personne n'appelle ».
  const [evidenceOpenFor, setEvidenceOpenFor] = useState<string>()
  const updateEvidence = useMutation({
    mutationFn: ({
      requirementId,
      evidence,
      confidence,
    }: {
      requirementId: string
      evidence: string
      confidence: 'high' | 'medium' | 'low' | null
    }) => rfpApi.updateRequirement(detail.rfp.id, requirementId, { evidence, confidence }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) })
      setEvidenceOpenFor(undefined)
    },
    onError: (error: Error) => toast.error(error.message || t('requirements.evidenceUpdateFailed')),
  })

  // #2957 (#2181.15/.16) — commentaires et versions, un panneau ouvert à la fois par exigence.
  const [threadOpenFor, setThreadOpenFor] = useState<{ id: string; kind: 'comments' | 'versions' }>()
  const toggleThread = (id: string, kind: 'comments' | 'versions') =>
    setThreadOpenFor(current => (current?.id === id && current.kind === kind ? undefined : { id, kind }))
  const addComment = useMutation({
    mutationFn: ({ requirementId, body }: { requirementId: string; body: string }) =>
      rfpApi.addComment(detail.rfp.id, requirementId, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) }),
    onError: (error: Error) => toast.error(error.message || t('comments.failed')),
  })

  // #2957 (#2181.40) — « Attribuer une section » : un rôle pour toute la section.
  const assignSection = useMutation({
    mutationFn: ({ section, owner_role }: { section: string | null; owner_role: RfpOwnerRole }) =>
      rfpApi.assignSection(detail.rfp.id, section, owner_role),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: rfpKeys.detail(detail.rfp.id) }),
    onError: (error: Error) => toast.error(error.message || t('sections.failed')),
  })
  const sections = useMemo(() => {
    const counts = new Map<string | null, number>()
    for (const requirement of detail.rfp.requirements) {
      const key = requirement.section?.trim() || null
      const previous = counts.get(key)
      counts.set(key, previous === undefined ? 1 : previous + 1)
    }
    return [...counts.entries()]
  }, [detail.rfp.requirements])
  const hasNamedSection = sections.some(([section]) => section !== null)

  if (detail.rfp.requirements.length === 0) return <EmptyPanel text={t('requirements.empty')} />

  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('requirements.title')}
      </Text>
      {/* Seulement quand le document porte des sections : sans elles, un seul
          groupe « sans section » ne ferait que doubler le rôle par exigence. */}
      {hasNamedSection ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {sections.map(([section, count]) => (
            <SelectField
              key={section ?? '__none__'}
              ariaLabel={t('sections.assignAria', { section: section ?? t('sections.none'), count })}
              value=""
              onChange={next => assignSection.mutate({ section, owner_role: next as RfpOwnerRole })}
              emptyOption={{ label: t('sections.placeholder', { section: section ?? t('sections.none') }) }}
              options={rfpOwnerRoleSchema.options.map(role => ({ value: role, label: t(`owner.${role}`) }))}
              size="sm"
              className="w-auto min-w-44"
            />
          ))}
        </div>
      ) : null}
      <ul className="mt-2 space-y-2">
        {detail.rfp.requirements.map(requirement => (
          <li key={requirement.id} className="rounded-md border border-[var(--bellum-border)] p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={WEIGHT_CLASS[requirement.weight]}>
                {t(`weight.${requirement.weight}`)}
              </Badge>
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t(`kind.${requirement.kind}`)}
              </Text>
              <SelectField
                ariaLabel={t('requirements.ownerAria', { text: requirement.text })}
                value={requirement.owner_role}
                onChange={next =>
                  updateOwner.mutate({ requirementId: requirement.id, owner_role: next as RfpOwnerRole })
                }
                options={rfpOwnerRoleSchema.options.map(role => ({ value: role, label: t(`owner.${role}`) }))}
                size="sm"
                className="w-auto min-w-32"
              />
              <SelectField
                ariaLabel={t('answerStatus.ariaLabel', { text: requirement.text })}
                value={requirement.answer_status}
                onChange={next =>
                  updateStatus.mutate({ requirementId: requirement.id, answer_status: next as RfpAnswerStatus })
                }
                options={rfpAnswerStatusSchema.options.map(status => ({
                  value: status,
                  label: t(`answerStatus.${status}`),
                }))}
                size="sm"
                className={cn('w-auto min-w-32', STATUS_CLASS[requirement.answer_status])}
              />
            </div>
            <Text size="sm" className="mt-1">
              {requirement.text}
            </Text>
            {/* #2180.27 — le document SOURCE, seulement quand l'import en a
                regroupé plusieurs (#2180.2, #2180.4). Une absence ne fait
                jamais une ligne « aucun document » : rien à distinguer en
                mono-document, donc rien à afficher. */}
            {requirement.source_document ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
                {t('requirements.sourceDocument', { document: requirement.source_document })}
              </Text>
            ) : null}
            {requirement.answer_text ? (
              <Text size="xs" className="mt-1 whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                {requirement.answer_text}
              </Text>
            ) : null}
            {/* La SOURCE est affichée avec la réponse, jamais séparée : une
                réponse sans source visible est une réponse qu'on ne peut pas
                défendre en soutenance. */}
            {requirement.answer_source ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
                {t('requirements.source', { source: requirement.answer_source })}
              </Text>
            ) : null}
            {requirement.risk ? (
              <div className="mt-1 flex items-start gap-1.5">
                <ShieldQuestion className="mt-0.5 size-3 shrink-0 text-[var(--warning-soft-text)]" />
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {requirement.risk}
                </Text>
              </div>
            ) : null}
            {/* #2957 (#2181.10/.14) — la PREUVE elle-même, distincte de la
                référence (`answer_source` ci-dessus) — et la confiance de la
                personne qui répond, jamais nue (toujours son libellé à côté). */}
            {requirement.evidence ? (
              <Text size="xs" className="mt-0.5 whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                {t('requirements.evidence', { evidence: requirement.evidence })}
                {requirement.confidence ? ` — ${t(`requirements.confidence.${requirement.confidence}`)}` : ''}
              </Text>
            ) : null}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {requirement.answer_status === 'to_produce' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={draft.isPending}
                  onClick={() => setReviewOpenFor(current => (current === requirement.id ? undefined : requirement.id))}
                >
                  {t('requirements.draft')}
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEvidenceOpenFor(current => (current === requirement.id ? undefined : requirement.id))}
              >
                {t('requirements.addEvidence')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleThread(requirement.id, 'comments')}>
                {requirement.comments?.length
                  ? t('comments.toggle', { count: requirement.comments.length })
                  : t('comments.open')}
              </Button>
              {/* Une absence ne fait aucune ligne : sans version, pas de bouton « (0) ». */}
              {requirement.versions?.length ? (
                <Button size="sm" variant="ghost" onClick={() => toggleThread(requirement.id, 'versions')}>
                  {t('versions.toggle', { count: requirement.versions.length })}
                </Button>
              ) : null}
            </div>
            {threadOpenFor?.id === requirement.id && threadOpenFor.kind === 'comments' ? (
              <RequirementComments
                comments={requirement.comments ?? []}
                pending={addComment.isPending}
                onSubmit={body => addComment.mutate({ requirementId: requirement.id, body })}
              />
            ) : null}
            {threadOpenFor?.id === requirement.id && threadOpenFor.kind === 'versions' ? (
              <RequirementVersions versions={requirement.versions ?? []} current={requirement.answer_text} />
            ) : null}
            {reviewOpenFor === requirement.id ? (
              <DraftSourcesReview
                evidence={requirement.evidence}
                pending={draft.isPending}
                onGenerate={sources => draft.mutate({ requirementId: requirement.id, sources })}
              />
            ) : null}
            {evidenceOpenFor === requirement.id ? (
              <EvidenceForm
                initialEvidence={requirement.evidence}
                initialConfidence={requirement.confidence}
                pending={updateEvidence.isPending}
                onSubmit={(evidence, confidence) =>
                  updateEvidence.mutate({ requirementId: requirement.id, evidence, confidence })
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** #2957 (#2181.15) — le fil de commentaires d'une exigence. */
function RequirementComments({
  comments,
  pending,
  onSubmit,
}: {
  comments: RfpRequirementComment[]
  pending: boolean
  onSubmit: (body: string) => void
}) {
  const { t } = useTranslation('rfp')
  const { team } = useTeam()
  const [body, setBody] = useState('')
  const nameOf = (authorId: string) => {
    const member = team?.members?.find(candidate => candidate.userId === authorId)
    return member?.fullName ?? member?.email ?? null
  }
  return (
    <div className="mt-2 space-y-2 rounded-md bg-[var(--bellum-surface-2)] p-2">
      {comments.length > 0 ? (
        <ul className="space-y-1.5">
          {comments.map(comment => {
            const author = nameOf(comment.author_id)
            return (
              <li key={comment.id}>
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {author ? `${author} · ` : ''}
                  {formatDate(new Date(comment.created_at))}
                </Text>
                <Text size="xs" className="whitespace-pre-wrap">
                  {comment.body}
                </Text>
              </li>
            )
          })}
        </ul>
      ) : null}
      <Textarea
        aria-label={t('comments.label')}
        value={body}
        onChange={event => setBody(event.target.value)}
        rows={2}
        maxLength={2000}
      />
      <Button
        size="sm"
        className="min-h-11"
        disabled={pending || body.trim().length === 0}
        onClick={() => {
          onSubmit(body.trim())
          setBody('')
        }}
      >
        {t('comments.submit')}
      </Button>
    </div>
  )
}

/** #2957 (#2181.16 / #2181.45) — les réponses remplacées, et leur comparaison
 *  avec la réponse actuelle, côte à côte. On archive, on ne supprime pas. */
function RequirementVersions({ versions, current }: { versions: RfpAnswerVersion[]; current: string | null }) {
  const { t } = useTranslation('rfp')
  const [compareIndex, setCompareIndex] = useState<number>()
  const compared = compareIndex === undefined ? undefined : versions[compareIndex]
  return (
    <div className="mt-2 space-y-2 rounded-md bg-[var(--bellum-surface-2)] p-2">
      <ul className="space-y-2">
        {versions.map((version, index) => (
          <li key={`${version.replaced_at}-${index}`}>
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t('versions.replacedAt', { date: formatDate(new Date(version.replaced_at)) })}
            </Text>
            <Text size="xs" className="whitespace-pre-wrap">
              {version.answer_text}
            </Text>
            <Button size="sm" variant="ghost" onClick={() => setCompareIndex(index)}>
              {t('versions.compare')}
            </Button>
          </li>
        ))}
      </ul>
      {compared ? (
        <div data-testid="rfp-version-compare" className="grid gap-2 md:grid-cols-2">
          <div>
            <Text size="xs" weight="semibold">
              {t('versions.before')}
            </Text>
            <Text size="xs" className="whitespace-pre-wrap">
              {compared.answer_text}
            </Text>
          </div>
          <div>
            <Text size="xs" weight="semibold">
              {t('versions.now')}
            </Text>
            <Text size="xs" className="whitespace-pre-wrap">
              {current ?? t('versions.noCurrent')}
            </Text>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * #2957 (#2181.10/.14/.42) — le formulaire d'« Ajouter une preuve ».
 *
 * Deux champs, jamais présentés seuls : une preuve sans confiance ne dit pas
 * si la personne qui répond s'y fie, et une confiance sans preuve n'a rien à
 * quoi s'accrocher. `confidence` reste FACULTATIF (« non évaluée » est un état
 * honnête) ; `evidence` est le seul champ obligatoire à l'enregistrement — un
 * bouton « Ajouter une preuve » qui enregistrerait une confiance sans preuve
 * produirait la carte vide que #2181 (« INTERDIT ») refuse.
 */
type ApprovedSource = { title: string; content: string }

/**
 * #2152.27 — L'ÉTAPE DE VALIDATION AVANT GÉNÉRATION.
 *
 * Les sources CANDIDATES : la preuve déjà rattachée à l'exigence, et celles
 * que l'humain ajoute ici. Aucune n'est cochée d'office — valider est un geste
 * (« rien n'écrit tout seul »). Sans source cochée, la génération reste
 * possible et l'écran dit ce qui se passe : Laura ne rédige rien d'inventé,
 * elle rend « à produire » avec ce qui manque (`RfpService.draft`).
 */
function DraftSourcesReview({
  evidence,
  pending,
  onGenerate,
}: {
  evidence: string | null | undefined
  pending: boolean
  onGenerate: (sources: ApprovedSource[]) => void
}) {
  const { t } = useTranslation('rfp')
  const [added, setAdded] = useState<ApprovedSource[]>([])
  const [checked, setChecked] = useState<ReadonlySet<number>>(new Set())
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const candidates: ApprovedSource[] = [
    ...(evidence?.trim() ? [{ title: t('draftReview.evidenceTitle'), content: evidence.trim() }] : []),
    ...added,
  ]
  const toggle = (index: number) =>
    setChecked(current => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  const addSource = () => {
    const source = { title: title.trim(), content: content.trim() }
    if (!source.title || !source.content) return
    // Une source que l'humain vient d'écrire est validée par ce geste même.
    setChecked(current => new Set(current).add(candidates.length))
    setAdded(current => [...current, source])
    setTitle('')
    setContent('')
  }
  const approved = candidates.filter((_, index) => checked.has(index))

  return (
    <div
      className="mt-1.5 space-y-2 rounded-md border border-[var(--bellum-border)] p-2"
      data-testid="rfp-draft-review"
    >
      <Text size="xs" weight="medium">
        {t('draftReview.title')}
      </Text>
      {candidates.length > 0 ? (
        <ul className="space-y-1.5">
          {candidates.map((source, index) => (
            <li key={`${source.title}-${index}`} className="flex items-start gap-2">
              <Checkbox
                checked={checked.has(index)}
                onCheckedChange={() => toggle(index)}
                aria-label={source.title}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <Text size="xs" weight="medium">
                  {source.title}
                </Text>
                <Text size="xs" className="whitespace-pre-wrap text-[var(--bellum-text-secondary)]">
                  {source.content}
                </Text>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-1.5">
        <Input
          aria-label={t('draftReview.addTitle')}
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('draftReview.addTitlePlaceholder')}
          className="text-sm"
        />
        <Textarea
          aria-label={t('draftReview.addContent')}
          value={content}
          onChange={event => setContent(event.target.value)}
          placeholder={t('draftReview.addContentPlaceholder')}
          className="min-h-16 text-sm"
        />
        <Button size="sm" variant="outline" disabled={!title.trim() || !content.trim()} onClick={addSource}>
          {t('draftReview.add')}
        </Button>
      </div>
      {approved.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('draftReview.noSource')}
        </Text>
      ) : null}
      <Button size="sm" disabled={pending} onClick={() => onGenerate(approved)}>
        {t('draftReview.generate')}
      </Button>
    </div>
  )
}

function EvidenceForm({
  initialEvidence,
  initialConfidence,
  pending,
  onSubmit,
}: {
  initialEvidence: string | null | undefined
  initialConfidence: 'high' | 'medium' | 'low' | null | undefined
  pending: boolean
  onSubmit: (evidence: string, confidence: 'high' | 'medium' | 'low' | null) => void
}) {
  const { t } = useTranslation('rfp')
  const [evidence, setEvidence] = useState(initialEvidence ?? '')
  const [confidence, setConfidence] = useState<'high' | 'medium' | 'low' | null>(initialConfidence ?? null)

  return (
    <div className="mt-1.5 space-y-1.5 rounded-md border border-[var(--bellum-border)] p-2">
      <Textarea
        aria-label={t('requirements.evidenceLabel')}
        value={evidence}
        onChange={event => setEvidence(event.target.value)}
        placeholder={t('requirements.evidencePlaceholder')}
        className="min-h-16 text-sm"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <SelectField
          ariaLabel={t('requirements.confidenceLabel')}
          value={confidence ?? ''}
          onChange={next => setConfidence(next ? (next as 'high' | 'medium' | 'low') : null)}
          emptyOption={{ label: t('requirements.confidence.unset') }}
          options={[
            { value: 'high', label: t('requirements.confidence.high') },
            { value: 'medium', label: t('requirements.confidence.medium') },
            { value: 'low', label: t('requirements.confidence.low') },
          ]}
          size="sm"
          className="w-auto min-w-32"
        />
        <Button
          size="sm"
          disabled={pending || evidence.trim().length === 0}
          onClick={() => onSubmit(evidence.trim(), confidence)}
        >
          {t('requirements.evidenceSave')}
        </Button>
      </div>
    </div>
  )
}

const WEIGHT_CLASS: Record<string, string> = {
  mandatory: 'border-red-500/40 text-[var(--danger-soft-text)]',
  desirable: 'border-sky-500/40 text-[var(--info-soft-text)]',
  informative: 'border-[var(--bellum-border)] text-[var(--bellum-text-muted)]',
  ambiguous: 'border-amber-500/40 text-[var(--warning-soft-text)]',
}

const STATUS_CLASS: Record<string, string> = {
  to_produce: 'text-[var(--warning-soft-text)]',
  reused: 'text-[var(--bellum-text-secondary)]',
  drafted: 'text-[var(--info-soft-text)]',
  to_complete: 'text-[var(--warning-soft-text)]',
  to_validate: 'text-[var(--info-soft-text)]',
  blocked: 'text-[var(--danger-soft-text)]',
  not_applicable: 'text-[var(--bellum-text-muted)]',
  validated: 'text-[var(--success-soft-text)]',
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  const color =
    tone === 'danger' && value > 0
      ? 'text-[var(--danger-soft-text)]'
      : tone === 'warning' && value > 0
        ? 'text-[var(--warning-soft-text)]'
        : 'text-[var(--bellum-text-primary)]'
  return (
    <div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm" weight="semibold" className={color}>
        {value}
      </Text>
    </div>
  )
}

/**
 * `items` est déclaré `string[]`, mais il vient d'un dossier stocké en base —
 * lui-même issu d'un MODÈLE. Un dossier plus ancien, ou une réponse qui a omis
 * la clé, arrive avec `undefined`, et `items.length` faisait alors tomber la
 * page entière : l'écran affichait « Une erreur inattendue est survenue » à la
 * place du dossier. Vu en production le 03/08.
 *
 * L'API normalise désormais la décision avant de l'écrire, mais les dossiers
 * déjà stockés, eux, ne se renormalisent pas : la garde reste ici aussi.
 */
function ListBlock({ title, items, tone }: { title: string; items?: string[] | null; tone?: 'danger' }) {
  if (!items || items.length === 0) return null
  return (
    <div className="mt-2">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {title}
      </Text>
      <ul className="mt-0.5 list-inside list-disc">
        {items.map(item => (
          <li key={item}>
            <Text
              size="xs"
              className={tone === 'danger' ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-secondary)]'}
            >
              {item}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  )
}

type NeedSource = Pick<
  OpenNeedRow,
  'id' | 'title' | 'account_name' | 'skills' | 'seniority' | 'headcount' | 'location' | 'start_on' | 'duration_months'
>

/**
 * #2957 (#2179.31) — le texte d'intake tiré d'un besoin : SES champs, une
 * ligne par champ renseigné. Une absence ne fait AUCUNE ligne (doctrine « on
 * n'affiche pas ce qu'on n'a pas ») — jamais « Localisation : — ».
 */
function needToIntakeText(need: NeedSource, t: (key: string, options?: Record<string, unknown>) => string): string {
  const lines = [t('fromNeed.lines.title', { value: need.title })]
  const skills = (need.skills ?? []).map(skill => skill.term).filter(Boolean)
  if (skills.length > 0) lines.push(t('fromNeed.lines.skills', { value: skills.join(', ') }))
  if (need.seniority) lines.push(t('fromNeed.lines.seniority', { value: need.seniority }))
  if (need.headcount > 1) lines.push(t('fromNeed.lines.headcount', { count: need.headcount }))
  if (need.location) lines.push(t('fromNeed.lines.location', { value: need.location }))
  if (need.start_on) lines.push(t('fromNeed.lines.startOn', { value: formatDate(new Date(need.start_on)) }))
  if (need.duration_months) lines.push(t('fromNeed.lines.duration', { count: need.duration_months }))
  return lines.join('\n')
}

/** #2957 (#2179.31) — « Créer depuis un besoin » : choisir un besoin ouvert
 *  pré-remplit l'intake ; le parcours d'import reste le même. */
function NeedSourcePicker({ onPick }: { onPick: (need: NeedSource) => void }) {
  const { t } = useTranslation('rfp')
  const [open, setOpen] = useState(false)
  const needs = useOpenNeeds({ offset: 0, limit: 50 }, { enabled: open })
  const rows = needs.data?.data ?? []
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="min-h-11" onClick={() => setOpen(true)}>
        {t('fromNeed.cta')}
      </Button>
    )
  }
  return (
    <SelectField
      ariaLabel={t('fromNeed.label')}
      value=""
      onChange={next => {
        const need = rows.find(row => row.id === next)
        if (need) onPick(need)
      }}
      emptyOption={{ label: rows.length > 0 ? t('fromNeed.placeholder') : t('fromNeed.none') }}
      options={rows.map(row => ({
        value: row.id,
        label: row.account_name ? `${row.account_name} — ${row.title}` : row.title,
      }))}
      size="sm"
      className="min-w-56"
    />
  )
}

/** #2179.35 — seul qui peut ÉCRIRE le réglage voit le geste (le serveur
 *  exige owner/admin : `WorkspaceHiddenSectionsService.setHiddenSections`). */
function useCanMaskSections(): boolean {
  const { team } = useTeam()
  const role = team?.workspace.role
  return role === 'owner' || role === 'admin'
}

/**
 * #2957 (#2179.34) — L'EMPTY STATE HONNÊTE, texte exact de #2179 : il dit à
 * qui la page sert, et que l'espace peut s'en passer (#2179.35 — masquer).
 */
function RfpEmptyState() {
  const { t } = useTranslation('rfp')
  const canMask = useCanMaskSections()
  const hidden = useWorkspaceHiddenSections()
  const setHidden = useSetWorkspaceSectionHidden()
  return (
    <Card className="space-y-2 p-4">
      <Text size="sm">{t('list.empty')}</Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('list.emptyHint')}
      </Text>
      {canMask && !hidden.includes('rfp') ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={setHidden.isPending}
          onClick={() =>
            setHidden.mutate(
              { current: hidden, section: 'rfp', hidden: true },
              { onError: () => toast.error(t('mask.failed')) },
            )
          }
        >
          {t('mask.hide')}
        </Button>
      ) : null}
    </Card>
  )
}

/**
 * #2957 (#2179.2/.35) — une section masquée n'a plus d'onglet, mais la ROUTE
 * reste : qui l'ouvre directement le lit, et un admin peut la réafficher.
 */
function RfpMaskedNotice() {
  const { t } = useTranslation('rfp')
  const canMask = useCanMaskSections()
  const hidden = useWorkspaceHiddenSections()
  const setHidden = useSetWorkspaceSectionHidden()
  if (!hidden.includes('rfp')) return null
  return (
    <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
      <Text size="sm">{t('mask.hiddenNotice')}</Text>
      {canMask ? (
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={setHidden.isPending}
          onClick={() =>
            setHidden.mutate(
              { current: hidden, section: 'rfp', hidden: false },
              { onError: () => toast.error(t('mask.failed')) },
            )
          }
        >
          {t('mask.show')}
        </Button>
      ) : null}
    </Card>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <Card className="p-4">
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {text}
      </Text>
    </Card>
  )
}

/**
 * « Transformer en besoin » (#1097).
 *
 * Le projet est CHOISI : un appel d'offres peut relever d'une affaire en cours
 * comme d'une nouvelle, et se tromper de projet range le besoin dans un pipe où
 * personne ne le cherchera.
 *
 * La carte DIT que les compétences ne sont pas déduites du document. C'est la
 * moitié honnête du geste : les exigences d'un appel d'offres sont de la prose,
 * en tirer une liste de technologies ferait classer des profils sur des mots
 * qu'on aurait fabriqués.
 */
function NeedFromRfpCard({ rfpId }: { rfpId: string }) {
  const { t } = useTranslation('rfp')
  const navigate = useNavigate()
  const projects = useProjects()
  const [projectId, setProjectId] = useState('')

  const create = useMutation({
    mutationFn: () => rfpApi.createNeed(rfpId, projectId),
    onSuccess: need => {
      toast.success(t('need.created', { title: need.title }), {
        action: { label: t('need.open'), onClick: () => void navigate({ to: '/projects/needs' }) },
        duration: 8_000,
      })
      setProjectId('')
    },
    onError: (error: Error) => toast.error(error.message || t('need.failed')),
  })

  const rows = projects.data ?? []

  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold">
        {t('need.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
        {t('need.subtitle')}
      </Text>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SelectField
          ariaLabel={t('need.projectLabel')}
          value={projectId}
          onChange={next => setProjectId(next)}
          emptyOption={{ label: t('need.projectPlaceholder') }}
          options={rows.map(project => ({
            value: project.id,
            label: project.company_name ? `${project.company_name} — ${project.label}` : project.label,
          }))}
          size="sm"
          className="min-w-56 flex-1"
        />
        <Button
          size="sm"
          variant="black"
          disabled={!projectId || create.isPending}
          isLoading={create.isPending}
          onClick={() => create.mutate()}
        >
          {t('need.submit')}
        </Button>
      </div>
      {rows.length === 0 && !projects.isLoading ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
          {t('need.noProject')}
        </Text>
      ) : null}
      {/* #2571.3 — LA PASSERELLE qui manquait : côté consommateur tout est
          déjà là et testé (`routes/projects/needs.tsx:fromRfp`,
          `OpenNeedsPage.tsx`, `NeedFromRfpPreview.tsx`) — `git grep -rn
          "fromRfp" -- apps/web/src/features/rfp` rendait ZÉRO avant cette
          ligne. Un VRAI `<Link>`, pas un `onClick` sur un `div` : ce qui se
          clique se tabule (GA-35), et l'href s'ouvre aussi au clic du milieu.
          Distinct du bouton « Créer le besoin » juste au-dessus : celui-ci
          écrit directement (#1097), celui-là emmène vers l'aperçu FIGÉ du
          besoin que #2571 propose — rien n'y est créé avant confirmation. */}
      <Button asChild size="sm" variant="ghost" className="mt-2">
        <Link to="/projects/needs" search={{ fromRfp: rfpId }}>
          {t('need.preview.cta')}
        </Link>
      </Button>
    </Card>
  )
}
