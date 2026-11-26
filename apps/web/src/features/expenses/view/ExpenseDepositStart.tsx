import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Upload } from 'lucide-react'
import { Box, Button, Text } from '@bellum/ui'
import { STORED_FILE_ACCEPT, refuseStoredFile, type StoredFileRefusal } from '@bellum/contracts'
import { formatBytes, formatExtractedAmount } from '../presentation'
import { extractReceipt, hasAnyProposal, type ExpenseReceiptExtraction } from '../receipt-extraction'
import { toUploadInput } from './AttachmentDeposit'

/**
 * #1827.1 — LE DÉPÔT D'ABORD (09/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Il a une pile de justificatifs et il ne veut pas les retaper. » Avant ce
 * lot, « Déposer une note » ouvrait directement un formulaire VIDE — la saisie
 * partait de zéro, jamais du fichier. Cet écran est la PREMIÈRE chose que
 * `ExpenseReportEditor` montre en création : une zone de dépôt, pas un champ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1827.2 — LA LECTURE AUTOMATIQUE (10/09/2026), ET LE PARAGRAPHE QU'ELLE REMPLACE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le paragraphe d'origine disait : « aucune lecture automatique n'existe dans
 * ce dépôt ». C'était vrai le 09/09, et c'est PÉRIMÉ depuis : Louis a tranché
 * le 10/09 que retaper chaque justificatif à la main est exactement ce que sa
 * demande refuse — « gagner du temps sur le temps de saisie », sans perdre le
 * contrôle. Chaque fichier accepté déclenche maintenant une lecture
 * (`extractReceipt`), qui PROPOSE montant, date, catégorie, TVA — jamais une
 * écriture. Le fichier n'ouvre PLUS systématiquement une ligne vide : si la
 * lecture a abouti, la ligne arrive PRÉ-REMPLIE de ce qui a été lu, et
 * `ExpenseReportEditor` marque chaque champ ainsi rempli comme « à vérifier »
 * (`DraftLine.read`) — jamais indistinguable d'une saisie humaine.
 *
 * Sans `OCR_API_KEY` posée côté service IA (l'interrupteur), ou sur un fichier
 * qui a son propre calque de texte non lisible, la lecture rend un statut
 * NOMMÉ (`not_configured`, `unreadable`, `not_a_receipt`, `too_large`,
 * `unavailable`) et la ligne reste VIDE — le comportement d'AVANT ce lot,
 * byte-identique dans ce cas précis.
 *
 * ⚠️ « Continuer » ne BLOQUE JAMAIS sur une lecture en cours : un réseau lent
 * ne doit pas retenir un commercial qui veut avancer. Un fichier dont la
 * lecture n'a pas encore abouti au clic ouvre une ligne vide, comme si la
 * lecture n'avait rien trouvé — jamais une attente forcée.
 *
 * ⚠️ Le quota est hors d'atteinte ICI (`MAX_SAFE_INTEGER`), comme dans
 * `AttachmentDeposit` : cet écran ne sait pas ce que l'espace occupe, et
 * deviner un chiffre refuserait des dépôts par ailleurs acceptables. Le
 * fichier n'est pas non plus ENVOYÉ AU STOCKAGE ici : aucun octet n'y part
 * tant que la note n'a pas été enregistrée (jamais d'enregistrement
 * silencieux) — voir `ExpenseReportEditor.persistWithAttachments`. La lecture,
 * elle, part réellement (c'est tout son but), mais elle n'ÉCRIT rien : aucune
 * ligne, aucun fichier, aucune note n'existe avant « Enregistrer ».
 */

type StagedFile = {
  key: string
  file: File
  /** Le MÊME refus que le serveur rendrait — `refuseStoredFile` est une
   *  fonction partagée, pas recopiée. */
  refusal: StoredFileRefusal | null
}

/** #1827.2 — l'état de lecture d'un fichier ACCEPTÉ, par clé. */
type ReadState = { phase: 'reading' } | { phase: 'done'; extraction: ExpenseReceiptExtraction }

/** Une entrée continuée vers l'éditeur : le fichier, et ce que la lecture en a
 *  tiré — `null` quand elle n'a pas encore abouti au moment du clic. */
export type DepositEntry = { file: File; extraction: ExpenseReceiptExtraction | null }

export function ExpenseDepositStart({
  onContinue,
  onSkip,
}: {
  /** Les fichiers ACCEPTÉS, chacun avec sa lecture — chacun ouvrira une ligne
   *  à compléter, PRÉ-REMPLIE quand la lecture a abouti. */
  onContinue: (entries: DepositEntry[]) => void
  /** Aucun justificatif en main : le formulaire s'ouvre vide, comme avant ce lot. */
  onSkip: () => void
}) {
  const { t } = useTranslation('expenses')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [staged, setStaged] = useState<StagedFile[]>([])
  // #1827.2 — une lecture par fichier ACCEPTÉ, tenue à part de `staged` : elle
  // arrive de façon asynchrone et ne doit jamais bloquer l'affichage de la
  // liste elle-même.
  const [reads, setReads] = useState<Map<string, ReadState>>(new Map())

  const add = (files: FileList | File[]) => {
    const next: StagedFile[] = Array.from(files).map(file => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      refusal: refuseStoredFile({
        fileName: file.name,
        byteSize: file.size,
        workspaceUsedBytes: 0,
        quotaBytes: Number.MAX_SAFE_INTEGER,
      }),
    }))
    setStaged(current => [...current, ...next])
    // La lecture ne part QUE pour les fichiers ACCEPTÉS — lire un fichier déjà
    // refusé (trop gros, type interdit) coûterait un appel pour rien.
    for (const item of next) {
      if (item.refusal !== null) continue
      setReads(current => new Map(current).set(item.key, { phase: 'reading' }))
      void readOne(item.key, item.file)
    }
  }

  async function readOne(key: string, file: File): Promise<void> {
    const input = await toUploadInput(file)
    const extraction = await extractReceipt(input)
    setReads(current => new Map(current).set(key, { phase: 'done', extraction }))
  }

  const remove = (key: string) => {
    setStaged(current => current.filter(item => item.key !== key))
    setReads(current => {
      if (!current.has(key)) return current
      const next = new Map(current)
      next.delete(key)
      return next
    })
  }
  // Seuls les fichiers ACCEPTÉS comptent pour « Continuer » — un refus porte
  // son nom dans la liste, il ne bloque pas les autres.
  const accepted = staged.filter(item => item.refusal === null)

  return (
    <Box className="space-y-3">
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('editor.depositStart.description')}
      </Text>
      <div
        className={`rounded-md border border-dashed p-4 ${dragging ? 'border-[var(--bellum-primary-500)]' : 'border-border'}`}
        onDragOver={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length > 0) add(event.dataTransfer.files)
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
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => inputRef.current?.click()}
          >
            {t('deposit.choose')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={STORED_FILE_ACCEPT}
            className="hidden"
            aria-label={t('deposit.choose')}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              if (event.target.files && event.target.files.length > 0) add(event.target.files)
              // Remis à zéro : redéposer le MÊME fichier après l'avoir retiré
              // doit redéclencher un événement.
              event.target.value = ''
            }}
          />
        </Box>
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t('deposit.hint', { formats: STORED_FILE_ACCEPT, max: 10 })}
        </Text>
      </div>

      {staged.length > 0 ? (
        <Box className="space-y-1">
          {staged.map(item => (
            <Box
              key={item.key}
              display="flex"
              className="items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1"
            >
              <Box className="min-w-0">
                <Text element="p" size="xs" className="truncate">
                  {item.file.name} · {formatBytes(item.file.size)}
                </Text>
                {item.refusal ? (
                  <Text element="p" size="xs" color="var(--danger-soft-text)">
                    {t(`deposit.refusal.${item.refusal}`)}
                  </Text>
                ) : (
                  // #1827.2 — la lecture n'est jamais SILENCIEUSE : en cours,
                  // aboutie (avec ce qui a été proposé), ou nommée dans son
                  // échec (interrupteur non branché, scan illisible, document
                  // qui n'est pas une facture, plafond dépassé, service
                  // indisponible) — jamais un vide sans explication.
                  <ReadStatusLine state={reads.get(item.key)} t={t} />
                )}
              </Box>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11 px-2"
                aria-label={t('editor.removeAttachment', { name: item.file.name })}
                onClick={() => remove(item.key)}
              >
                ×
              </Button>
            </Box>
          ))}
        </Box>
      ) : null}

      <Box display="flex" className="flex-wrap gap-2">
        <Button
          type="button"
          className="min-h-11 flex-1"
          disabled={accepted.length === 0}
          onClick={() =>
            onContinue(
              accepted.map(item => {
                const state = reads.get(item.key)
                // Une lecture qui n'a pas encore ABOUTI au clic ne bloque
                // jamais « Continuer » — la ligne s'ouvrira vide, comme si la
                // lecture n'avait rien trouvé.
                return { file: item.file, extraction: state?.phase === 'done' ? state.extraction : null }
              }),
            )
          }
        >
          {t('editor.depositStart.continue', { count: accepted.length })}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onSkip}>
          {t('editor.depositStart.skip')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * #1827.2 — les statuts que la lecture peut rendre, et rien d'autre. Un statut
 * QUI NE FIGURE PAS ICI (une forme malformée, une réponse inattendue) tombe
 * sur `reading.unavailable` : le même message qu'une panne de transport, parce
 * que c'en est une aux yeux de l'écran — jamais un texte inventé pour un cas
 * non prévu, et jamais un champ rempli sur une donnée dont la forme est
 * incertaine.
 */
const READING_STATUS_KEY: Record<string, string> = {
  not_configured: 'reading.notConfigured',
  unreadable: 'reading.unreadable',
  not_a_receipt: 'reading.notAReceipt',
  too_large: 'reading.tooLarge',
  unavailable: 'reading.unavailable',
}

/** « 45,90 € · 2026-03-12 · Hôtel » — seuls les champs LUS entrent dans le
 *  résumé ; la TVA n'y figure pas (elle reste dans le formulaire) pour que la
 *  ligne tienne sur un balayage visuel. */
function summaryOf(extraction: ExpenseReceiptExtraction, t: TFunction): string {
  const parts: string[] = []
  const amountCents = extraction.fields?.amountCents?.value ?? null
  const spentOn = extraction.fields?.spentOn?.value ?? null
  const category = extraction.fields?.category?.value ?? null
  if (amountCents !== null) parts.push(formatExtractedAmount(amountCents))
  if (spentOn !== null) parts.push(spentOn)
  if (category !== null) parts.push(t(`category.${category}`))
  return parts.join(' · ')
}

function ReadStatusLine({ state, t }: { state: ReadState | undefined; t: TFunction }) {
  if (state === undefined || state.phase === 'reading') {
    return (
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('reading.inProgress')}
      </Text>
    )
  }

  const { extraction } = state
  if (extraction?.status === 'ok') {
    return hasAnyProposal(extraction) ? (
      <Text element="p" size="xs" color="var(--info-soft-text)">
        {t('reading.read', { summary: summaryOf(extraction, t) })}
      </Text>
    ) : (
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('reading.emptyRead')}
      </Text>
    )
  }

  const key = READING_STATUS_KEY[extraction?.status ?? ''] ?? 'reading.unavailable'
  return (
    <Text element="p" size="xs" color="text-muted-foreground">
      {t(key)}
    </Text>
  )
}
