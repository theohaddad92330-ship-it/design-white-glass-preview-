import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2 } from 'lucide-react'
import { Box, Button, Text } from '@bellum/ui'
import {
  STORED_FILE_ACCEPT,
  refuseStoredFile,
  type InvoiceAttachmentsResponse,
  type SignedDownload,
  type StorageUploadInput,
  type StoredFile,
  type StoredFileRefusal,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2814 — LES PIÈCES JOINTES de la facture PRÉPARÉE, sur sa prévisualisation.
 *
 * Bon de commande signé, relevé validé, PV de recette : les pièces qu'un client
 * exige avec sa facture, rangées par mission et par mois. Elles sont JOINTES à
 * la préparation — rien ne part d'ici : Bellum prépare, il n'émet ni n'envoie.
 *
 *  · Ouvrir = demander à la porte de l'API une URL SIGNÉE (cinq minutes), au
 *    clic — jamais une URL gardée ni publique.
 *  · Déposer / retirer : seulement avec `finance:write` (le miroir du droit
 *    exigé côté serveur), et jamais en démonstration — la salle se CONSULTE.
 *  · Les bornes (type, taille) sont vérifiées AVANT l'envoi par la même
 *    fonction que le serveur (`refuseStoredFile`, GA-26) : un fichier refusé
 *    ne voyage pas pour rien. Le serveur revérifie, signature comprise.
 */
export function InvoiceAttachments({
  missionId,
  periodMonth,
  canWrite,
  demo,
}: {
  missionId: string
  /** `AAAA-MM-01` — la forme de la route. */
  periodMonth: string
  canWrite: boolean
  demo: boolean
}) {
  const { t } = useTranslation('missions')
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [refusal, setRefusal] = useState<StoredFileRefusal | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const basePath = `/delivery/invoice-attachments/${missionId}/${periodMonth}`
  const queryKey = ['missions', missionId, 'invoice-attachments', periodMonth] as const

  const { data, isError } = useQuery({
    queryKey,
    queryFn: () => apiFetch<InvoiceAttachmentsResponse>({ path: basePath }),
  })
  // `?.` sur `files` LUI-MÊME : une réponse sans cette clé ne plante pas l'écran.
  const files: StoredFile[] = data?.files ?? []

  const open = useMutation<SignedDownload, Error, string>({
    mutationFn: downloadPath => apiFetch<SignedDownload>({ path: downloadPath }),
    onSuccess: signed => {
      window.open(signed.url, '_blank', 'noopener,noreferrer')
    },
    onError: error => setFailure(error.message || t('readiness.connector.attachments.openError')),
  })

  const upload = useMutation<StoredFile, Error, StorageUploadInput>({
    mutationFn: body => apiFetch<StoredFile, StorageUploadInput>({ path: basePath, method: 'POST', body }),
    onSuccess: () => {
      setFailure(null)
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: error => setFailure(error.message || t('readiness.connector.attachments.failedUnknown')),
  })

  const remove = useMutation<void, Error, string>({
    mutationFn: attachmentId => apiFetch<void>({ path: `${basePath}/${attachmentId}`, method: 'DELETE' }),
    onSuccess: () => {
      setFailure(null)
      void queryClient.invalidateQueries({ queryKey })
    },
    onError: error => setFailure(error.message || t('readiness.connector.attachments.removeError')),
  })

  const submit = async (file: File) => {
    setFailure(null)
    // Le quota n'est pas connu ici : on ne le DEVINE pas — le serveur le
    // tranche, et son refus est nommé.
    const refused = refuseStoredFile({
      fileName: file.name,
      byteSize: file.size,
      workspaceUsedBytes: 0,
      quotaBytes: Number.MAX_SAFE_INTEGER,
      domain: 'invoice_attachment',
    })
    setRefusal(refused)
    if (refused) return
    upload.mutate({ fileName: file.name, contentType: file.type, fileB64: await readAsBase64(file) })
  }

  const writable = canWrite && !demo

  return (
    <Box className="space-y-1 border-t border-border pt-2">
      <Text element="p" size="xs" weight="medium">
        {t('readiness.connector.attachments.title')}
      </Text>
      {isError ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.connector.attachments.loadError')}
        </Text>
      ) : files.length === 0 ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.connector.attachments.empty')}
        </Text>
      ) : (
        <ul className="space-y-1">
          {files.map(file => (
            <li key={file.id} className="flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
              <Text element="span" size="xs" className="min-w-0 flex-1 truncate">
                {file.fileName}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11"
                disabled={open.isPending}
                aria-label={t('readiness.connector.attachments.open', { name: file.fileName })}
                onClick={() => open.mutate(file.downloadPath)}
              >
                {t('readiness.connector.attachments.openShort')}
              </Button>
              {writable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 min-w-11"
                  disabled={remove.isPending}
                  aria-label={t('readiness.connector.attachments.remove', { name: file.fileName })}
                  onClick={() => remove.mutate(file.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {writable ? (
        <Box>
          <Button
            size="sm"
            variant="outline"
            className="min-h-11"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {upload.isPending ? t('readiness.connector.attachments.working') : t('readiness.connector.attachments.add')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={STORED_FILE_ACCEPT}
            className="hidden"
            aria-label={t('readiness.connector.attachments.add')}
            onChange={event => {
              const file = event.target.files?.[0]
              if (file) void submit(file)
              event.target.value = ''
            }}
          />
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
            {t('readiness.connector.attachments.hint', { formats: STORED_FILE_ACCEPT })}
          </Text>
        </Box>
      ) : demo ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {t('readiness.connector.attachments.demoReadOnly')}
        </Text>
      ) : null}

      {refusal ? (
        <Text element="p" role="alert" size="xs" className="text-[var(--danger-soft-text)]">
          {t(`readiness.connector.attachments.refusal.${refusal}`)}
        </Text>
      ) : null}
      {failure ? (
        <Text element="p" role="alert" size="xs" className="text-[var(--danger-soft-text)]">
          {failure}
        </Text>
      ) : null}
    </Box>
  )
}

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
