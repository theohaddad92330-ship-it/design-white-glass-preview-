import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { Box, Button, Text } from '@bellum/ui'
import {
  STORED_FILE_ACCEPT,
  refuseStoredFile,
  type StoredFileRefusal,
  type StorageUploadInput,
} from '@bellum/contracts'
import type { UploadProgress } from '@/lib/upload-with-progress'
import { useUploadAttachment } from '../api'
import { formatBytes } from '../presentation'

/**
 * LE DÉPÔT D'UN JUSTIFICATIF (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOSES QUI NE SE NÉGOCIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **Aucun échec muet.** Chaque refus porte un NOM — trop gros, type refusé,
 *     vide, quota — et sa phrase. « Le dépôt a échoué » fait redéposer le même
 *     fichier ; « ce fichier dépasse 10 Mo » le fait compresser.
 *  2. **La barre est MESURÉE.** Elle compte de vrais octets partis
 *     (`upload.onprogress`), jamais une animation qui fait semblant — une
 *     fausse barre est un chiffre inventé à l'écran.
 *  3. **« Envoyé » n'est pas « terminé ».** Le serveur range encore le fichier
 *     après le dernier octet reçu : la phase le DIT, plutôt que d'annoncer
 *     « c'est fait » pendant que ça ne l'est pas.
 *
 * ⚠️ Les bornes ne sont pas recopiées ici : `refuseStoredFile` est la MÊME
 * fonction que celle du serveur (`@bellum/contracts`). Un écran qui refuserait
 * à 8 Mo pendant que le serveur refuse à 10 laisserait partir un envoi de deux
 * minutes pour rien — ou pire, l'inverse.
 *
 * Le quota n'est pas vérifié ici : cet écran ne sait pas ce que l'espace
 * occupe. C'est le serveur qui le dit, et son message remonte tel quel — la
 * seule alternative honnête aurait été de deviner, ce qui aurait refusé des
 * dépôts parfaitement acceptables.
 */
export function AttachmentDeposit({ reportId }: { reportId: string }) {
  const { t } = useTranslation('expenses')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [refusal, setRefusal] = useState<StoredFileRefusal | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [pending, setPending] = useState<{ name: string; size: number } | null>(null)
  const upload = useUploadAttachment(reportId)

  const submit = async (file: File) => {
    setFailure(null)
    // ⚠️ Le quota est volontairement hors d'atteinte ici (`MAX_SAFE_INTEGER`) :
    // il se vérifie côté serveur, seul à savoir ce que l'espace occupe. Passer
    // un chiffre deviné ferait refuser des fichiers acceptables.
    const refused = refuseStoredFile({
      fileName: file.name,
      byteSize: file.size,
      workspaceUsedBytes: 0,
      quotaBytes: Number.MAX_SAFE_INTEGER,
    })
    setRefusal(refused)
    if (refused) return

    setPending({ name: file.name, size: file.size })
    setProgress({ phase: 'sending', ratio: 0 })
    try {
      await upload.mutateAsync({
        input: await toUploadInput(file),
        onProgress: setProgress,
      })
      setPending(null)
    } catch (error) {
      // Le message du serveur porte la vraie raison ; le remplacer ferait
      // redéposer le même fichier. Sans message, on le DIT plutôt que
      // d'inventer une cause.
      setFailure((error as Error).message || t('deposit.failedUnknown'))
    } finally {
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
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Box display="flex" className="min-w-0 items-center gap-2">
          <Upload className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
          <Text element="span" size="sm">
            {t('deposit.prompt')}
          </Text>
        </Box>
        {/* `min-h-11` = 44 px : la cible tactile minimale en pointeur grossier. */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={upload.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {upload.isPending ? t('deposit.working') : t('deposit.choose')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={STORED_FILE_ACCEPT}
          className="hidden"
          aria-label={t('deposit.choose')}
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
        {t('deposit.hint', { formats: STORED_FILE_ACCEPT, max: 10 })}
      </Text>

      {pending ? (
        <Box className="mt-2">
          <Text element="p" size="xs" className="truncate">
            {/* La taille ET le type sont AFFICHÉS : c'est ce qui permet de
                comprendre un refus avant même qu'il tombe. */}
            {t('deposit.pending', { name: pending.name, size: formatBytes(pending.size) })}
          </Text>
          {/* ⚠️ AUCUNE barre quand l'avancement n'est pas MESURABLE (le
              navigateur ne sait pas dire la taille totale). Une barre figée à
              0 % dirait « rien n'est parti », ce qui est faux, et une barre
              animée dirait « ça avance » sans rien mesurer. On écrit alors la
              phrase, et rien d'autre. */}
          {percent === null ? null : (
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--bellum-primary-500)]"
                style={{ width: `${percent}%` }}
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('deposit.progressLabel')}
              />
            </div>
          )}
          <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
            {progress?.phase === 'finishing'
              ? t('deposit.finishing')
              : percent === null
                ? t('deposit.sendingUnknown')
                : t('deposit.sending', { percent })}
          </Text>
        </Box>
      ) : null}

      {refusal ? (
        // Le fond porte l'OPACITÉ sémantique, le texte porte `*-soft-text` :
        // `--bellum-danger` fait 9,47:1 d'un côté du thème et 1,84:1 de
        // l'autre, donc une couleur sémantique ne porte jamais de texte.
        <Box className="mt-2 rounded-md p-2" style={{ background: 'var(--danger-soft-bg)' }}>
          <Text element="p" size="xs" color="var(--danger-soft-text)">
            {t(`deposit.refusal.${refusal}`)}
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

/**
 * Le fichier → le corps attendu par l'API. Le préfixe `data:` que le lecteur
 * ajoute est retiré : l'API attend du base64 nu.
 *
 * #1827.1 — EXPORTÉE : le dépôt-avant-saisie de `ExpenseReportEditor` la
 * réutilise pour convertir les fichiers déposés AVANT qu'une note existe,
 * plutôt que de réécrire une seconde conversion base64 à côté de celle-ci.
 * Deux chemins qui font la même chose divergent.
 */
export async function toUploadInput(file: File): Promise<StorageUploadInput> {
  return {
    fileName: file.name,
    // Ce que le navigateur DÉCLARE — souvent vide, souvent faux. Le serveur ne
    // le croit pas : il décide sur l'extension. On l'envoie quand même, pour
    // que le journal du jour où ça coince porte les deux versions.
    contentType: file.type,
    fileB64: await readAsBase64(file),
  }
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
