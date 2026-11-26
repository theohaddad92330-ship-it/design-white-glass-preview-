import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Box, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import {
  NEED_DOCUMENT_KINDS,
  STORED_FILE_ACCEPT,
  refuseStoredFile,
  type CreateNeedDocumentInput,
  type NeedDocument,
  type NeedDocumentFile,
  type NeedDocumentFilesResponse,
  type NeedDocumentKind,
  type NeedDocumentStatus,
  type SignedDownload,
  type StoredFileRefusal,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { uploadWithProgress, type UploadProgress } from '@/lib/upload-with-progress'

/**
 * LE DÉPÔT ET L'OUVERTURE d'une pièce d'affaire (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES FICHIERS SE LISENT SUR UNE AUTRE ROUTE QUE LES DOCUMENTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un document et son fichier ne sont pas la même chose : `NeedDocument` décrit
 * une pièce qu'on SUIT (« la NDA est signée »), qu'on l'ait reçue ou non. Les
 * faits de FICHIER — poids, type, conservation, porte d'ouverture —
 * appartiennent au stockage. Les fondre aurait fait porter des champs `null` à
 * toutes les lignes d'avant ce lot, et transformé « on suit une pièce qu'on n'a
 * pas » en « il manque une donnée ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA VUE DOIT DISTINGUER
 * ─────────────────────────────────────────────────────────────────────────────
 * `isError` n'est pas « aucun fichier ». Un échec de lecture qui s'afficherait
 * comme une absence ferait redéposer une pièce déjà là.
 */

/** La clé de cache des FICHIERS d'un besoin. Distincte de celle des documents
 *  (`needDocumentsKeys`) : deux routes, deux réponses, deux fraîcheurs. */
const needDocumentFilesKey = (needId: string) => ['open-needs', needId, 'document-files'] as const

/** Ce que le stockage porte pour ce besoin — les fichiers, et le quota. */
export function useNeedDocumentFiles(needId: string) {
  const query = useQuery({
    queryKey: needDocumentFilesKey(needId),
    queryFn: () => apiFetch<NeedDocumentFilesResponse>({ path: `/projects/needs/${needId}/document-files` }),
    enabled: needId.length > 0,
  })
  return {
    byDocument: new Map((query.data?.files ?? []).map(file => [file.documentId, file])),
    // ⚠️ `null` et pas `0` tant qu'on n'a pas lu : « je ne sais pas encore ce
    // que l'espace occupe » n'est pas « il n'occupe rien ».
    usedBytes: query.data?.usedBytes ?? null,
    quotaBytes: query.data?.quotaBytes ?? null,
    isError: query.isError,
  }
}

/** OUVRE une pièce : demande l'URL signée AU CLIC, puis la suit. Elle vit cinq
 *  minutes — la fabriquer d'avance la ferait périr dans un onglet ouvert. */
export function useOpenNeedDocument() {
  const { t } = useTranslation('projects')
  return useMutation<SignedDownload, Error, string>({
    mutationFn: downloadPath => apiFetch<SignedDownload>({ path: downloadPath }),
    onSuccess: signed => {
      window.open(signed.url, '_blank', 'noopener,noreferrer')
    },
    onError: error => toast.error(error.message || t('needSheet.documents.openError')),
  })
}

/** Fait avancer une pièce : envoyée, en attente, signée, refusée. */
export function useUpdateNeedDocumentStatus(needId: string) {
  const queryClient = useQueryClient()
  const { t } = useTranslation('projects')
  return useMutation<NeedDocument, Error, { documentId: string; status: NeedDocumentStatus }>({
    mutationFn: ({ documentId, status }) =>
      apiFetch<NeedDocument, { status: NeedDocumentStatus }>({
        path: `/projects/needs/${needId}/documents/${documentId}/status`,
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['open-needs', needId] })
    },
    onError: error => toast.error(error.message || t('needSheet.documents.statusError')),
  })
}

/**
 * LE DÉPÔT d'une pièce sur un besoin.
 *
 * Trois choses qui ne se négocient pas, les mêmes que pour un justificatif :
 * aucun échec muet (chaque refus porte un NOM), une barre MESURÉE (de vrais
 * octets partis, jamais une animation qui fait semblant), et « envoyé » qui
 * n'est pas « terminé » (le serveur range encore après le dernier octet).
 *
 * ⚠️ Les bornes ne sont pas recopiées : `refuseStoredFile` est la MÊME fonction
 * que celle du serveur. Ici le quota EST vérifiable — la lecture des fichiers
 * rend ce que l'espace occupe — donc il l'est, et le refus tombe avant l'envoi
 * plutôt qu'après deux minutes d'attente.
 */
export function NeedDocumentDeposit({
  needId,
  usedBytes,
  quotaBytes,
}: {
  needId: string
  usedBytes: number | null
  quotaBytes: number | null
}) {
  const { t } = useTranslation('projects')
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<NeedDocumentKind>('quote')
  const [dragging, setDragging] = useState(false)
  const [refusal, setRefusal] = useState<StoredFileRefusal | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [busy, setBusy] = useState(false)

  /**
   * Ce qu'on sait du quota au moment du dépôt.
   *
   * ⚠️ Tant que la lecture n'a pas répondu, on ne DEVINE rien : « je ne sais
   * pas encore ce que l'espace occupe » n'est PAS « il n'occupe rien ». Un zéro
   * supposé, associé à un plafond supposé, refuserait des dépôts légitimes ou
   * en laisserait passer que le serveur refusera. On sort donc le quota du
   * verdict local — le serveur est le seul à savoir, et son refus est nommé.
   */
  const quotaFacts =
    usedBytes === null || quotaBytes === null
      ? { workspaceUsedBytes: 0, quotaBytes: Number.MAX_SAFE_INTEGER }
      : { workspaceUsedBytes: usedBytes, quotaBytes }

  const submit = async (file: File) => {
    setFailure(null)
    const refused = refuseStoredFile({ fileName: file.name, byteSize: file.size, ...quotaFacts })
    setRefusal(refused)
    if (refused) return

    setBusy(true)
    setProgress({ phase: 'sending', ratio: 0 })
    try {
      await uploadWithProgress<{ document: NeedDocument; file: NeedDocumentFile }, CreateNeedDocumentInput>(
        `/projects/needs/${needId}/documents`,
        {
          kind,
          // Vide : le serveur retombe sur le nom du FICHIER. Jamais sur une
          // chaîne inventée — c'est la seule valeur qui désigne la même pièce.
          name: '',
          fileName: file.name,
          contentType: file.type,
          fileB64: await readAsBase64(file),
        },
        setProgress,
      )
      // Les DEUX lectures : la liste des documents ET celle des fichiers. La
      // seconde seule laisserait une pièce sans ligne, la première seule une
      // ligne sans bouton.
      void queryClient.invalidateQueries({ queryKey: ['open-needs', needId] })
      toast.success(t('needSheet.documents.deposit.done'))
    } catch (error) {
      setFailure((error as Error).message || t('needSheet.documents.deposit.failedUnknown'))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const percent = progress?.ratio === null || progress === null ? null : Math.round(progress.ratio * 100)

  return (
    <div
      className={`rounded-md border border-dashed p-3 ${dragging ? 'border-[var(--bellum-primary-500)]' : 'border-border'}`}
      onDragOver={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event: DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void submit(file)
      }}
    >
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Upload className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
        <Text element="span" size="sm" className="min-w-0 flex-1">
          {t('needSheet.documents.deposit.prompt')}
        </Text>
        {/* La NATURE se choisit AVANT le dépôt : la déduire du nom de fichier
            serait une donnée inventée, et « Devis_v3_final.pdf » est un devis
            aussi souvent qu'un contrat cadre mal nommé. */}
        <Select value={kind} onValueChange={value => setKind(value as NeedDocumentKind)}>
          <SelectTrigger aria-label={t('needSheet.documents.deposit.kindLabel')} className="h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NEED_DOCUMENT_KINDS.map(value => (
              <SelectItem key={value} value={value}>
                {t(`needSheet.documents.kind.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? t('needSheet.documents.deposit.working') : t('needSheet.documents.deposit.choose')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={STORED_FILE_ACCEPT}
          className="hidden"
          aria-label={t('needSheet.documents.deposit.choose')}
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void submit(file)
            // Remis à zéro pour que redéposer le MÊME fichier redéclenche un
            // événement : sans ça, corriger puis réessayer ne fait rien.
            event.target.value = ''
          }}
        />
      </Box>

      <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
        {t('needSheet.documents.deposit.hint', { formats: STORED_FILE_ACCEPT, max: 10 })}
      </Text>

      {progress ? (
        <Box className="mt-2">
          {/* ⚠️ AUCUNE barre quand l'avancement n'est pas MESURABLE : une barre
              figée à 0 % dirait « rien n'est parti », et c'est faux. */}
          {percent === null ? null : (
            <div className="h-2 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--bellum-primary-500)]"
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('needSheet.documents.deposit.progressLabel')}
              />
            </div>
          )}
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
            {progress.phase === 'finishing'
              ? t('needSheet.documents.deposit.finishing')
              : percent === null
                ? t('needSheet.documents.deposit.sendingUnknown')
                : t('needSheet.documents.deposit.sending', { percent })}
          </Text>
        </Box>
      ) : null}

      {refusal ? (
        // Le fond porte l'OPACITÉ sémantique, le texte porte `*-soft-text` :
        // une couleur sémantique ne passe AA que d'un côté du thème.
        <Box className="mt-2 rounded-md p-2" style={{ background: 'var(--danger-soft-bg)' }}>
          <Text element="p" size="xs" color="var(--danger-soft-text)">
            {t(`needSheet.documents.deposit.refusal.${refusal}`)}
          </Text>
        </Box>
      ) : null}

      {failure ? (
        <Box className="mt-2 rounded-md p-2" style={{ background: 'var(--danger-soft-bg)' }}>
          <Text element="p" size="xs" color="var(--danger-soft-text)">
            {failure}
          </Text>
        </Box>
      ) : null}
    </div>
  )
}

/** Le fichier → base64 nu, sans le préfixe `data:` que le lecteur ajoute. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
