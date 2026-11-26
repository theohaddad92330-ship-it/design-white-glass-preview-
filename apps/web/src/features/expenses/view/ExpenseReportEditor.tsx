import type { ExpenseCategory, ExpenseReportDetailView, SaveExpenseReportInput } from '@bellum/contracts'
import { EXPENSE_CATEGORIES } from '@bellum/contracts'
import {
  Box,
  Button,
  Input,
  SelectField,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UploadProgress } from '@/lib/upload-with-progress'
import { expensesApi, useSaveExpenseReport, useSubmitExpenseReport } from '../api'
// ⚠️ Import à EFFET — voir `../i18n.ts`. Cet écran s'ouvre aussi sans passer
// par la liste (ses propres tests), et partirait sinon sans catalogue.
import '../i18n'
import { CATEGORY_GLYPH, formatBytes } from '../presentation'
import type { ExpenseReceiptExtraction, ReceiptRegion } from '../receipt-extraction'
import { toUploadInput } from './AttachmentDeposit'
import { ExpenseDepositStart, type DepositEntry } from './ExpenseDepositStart'
import { ReceiptRegionPreview } from './ReceiptRegionPreview'

/**
 * LE DÉPÔT D'UNE NOTE DE FRAIS — l'écran qui manquait (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 31/08 a livré la file, le dossier, « Valider » et « Refuser ». Rien
 * ne DÉPOSAIT. Un écran de validation sans écran de dépôt ne sert à personne :
 * rien n'arrive jamais dans la file, et le produit ne se démontre qu'en
 * expliquant ce qu'il ferait si quelqu'un pouvait s'en servir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX BOUTONS, DEUX PROMESSES
 * ─────────────────────────────────────────────────────────────────────────────
 * « Enregistrer le brouillon » range ; « Soumettre » envoie à quelqu'un. Un
 * libellé promet ce qui va se passer, et fondre les deux ferait partir des
 * notes à demi saisies au premier clic — celles-là mêmes qu'on rouvre trois
 * jours plus tard en se demandant qui les a déposées.
 *
 * ⚠️ Soumettre ENREGISTRE d'abord. Sans cela, une modification tapée juste
 * avant le clic partirait à la corbeille pendant que la note, elle, entre dans
 * la file — la pire des deux moitiés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1827.1 — LE DÉPÔT D'ABORD (09/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le paragraphe ci-dessus décrivait un « point de branchement » : il est
 * PÉRIMÉ. Le stockage de fichiers existe depuis (`AttachmentDeposit`, utilisé
 * par `ExpenseReportDrawer`) — ce formulaire ne le savait simplement pas
 * encore. En CRÉATION, l'écran commence maintenant par une zone de dépôt
 * (`ExpenseDepositStart`), pas par un formulaire vide : chaque fichier accepté
 * ouvre une ligne VIDE à compléter, et les octets partent réellement au
 * stockage — mais seulement quand la note est ENREGISTRÉE, jamais avant
 * (aucun enregistrement silencieux). Aucune lecture automatique n'accompagne
 * le dépôt : sans OCR branché sur ce domaine, un montant ou une catégorie
 * devinés depuis un fichier seraient une donnée fictive.
 *
 * En ÉDITION, le mécanisme précédent (nommer une pièce sans l'envoyer) reste
 * inchangé : c'est un domaine séparé, non touché par ce lot, et les notes déjà
 * nommées ne doivent pas disparaître d'un coup de ce formulaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1827.2 — LA LECTURE AUTOMATIQUE (10/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le paragraphe précédent disait : « aucune lecture automatique n'accompagne
 * le dépôt ». C'est PÉRIMÉ. `ExpenseDepositStart` propose maintenant une
 * lecture par fichier (`extractReceipt`), et cet écran en fait des lignes
 * PRÉ-REMPLIES plutôt que vides — `lineFromExtraction` construit la ligne, et
 * `DraftLine.read` retient QUELS champs viennent d'une lecture plutôt que
 * d'une saisie, pour que `LineForm` les marque « à vérifier » (`readBadge`).
 *
 * ⚠️ Une correction humaine gagne toujours : dès que l'utilisateur MODIFIE un
 * champ marqué lu, `LineForm.set` efface son entrée dans `read` — le badge
 * disparaît, parce que la valeur n'est plus une proposition mais une saisie.
 * `applyFieldUpdates` / `decideFieldWrite` (doctrine du dépôt) ne s'appliquent
 * PAS ici : ces fonctions arbitrent entre deux ÉCRITURES sur un enregistrement
 * déjà PERSISTÉ (une ré-analyse contre une correction antérieure) ; une ligne
 * de ce formulaire n'existe encore nulle part tant que « Enregistrer » n'a pas
 * été cliqué — il n'y a rien à arbitrer contre, seulement un brouillon local
 * qu'une frappe efface.
 */

/** Une ligne en cours de saisie : des CHAÎNES, parce qu'un champ vide n'est pas zéro. */
type DraftLine = {
  key: string
  category: ExpenseCategory
  label: string
  spentOn: string
  city: string
  detail: string
  /** Euros tapés à la main — « 18,50 ». Vide = rien saisi, JAMAIS 0 €. */
  amount: string
  /** Points de pourcentage — « 10 » pour 10 %. Vide = taux NON LU. */
  vatRate: string
  distanceKm: string
  fiscalHorsepower: string
  /**
   * #1827.2 — quels champs viennent d'une LECTURE automatique, pas d'une
   * saisie. Une entrée disparaît dès que l'utilisateur touche le champ
   * correspondant (`LineForm.set`) : une correction humaine gagne toujours.
   */
  read: Partial<
    Record<
      'amount' | 'spentOn' | 'category' | 'vatRate',
      { confidence: number; sourceExcerpt: string; sourceRegion: ReceiptRegion | null }
    >
  >
  /** #2433.4 — le justificatif d'où viennent les champs lus (pour surligner leur zone). */
  receipt: File | null
}

const EMPTY_LINE = (): DraftLine => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  category: 'meal',
  label: '',
  spentOn: '',
  city: '',
  detail: '',
  amount: '',
  vatRate: '',
  distanceKm: '',
  fiscalHorsepower: '',
  read: {},
  receipt: null,
})

/**
 * #1827.2 — une ligne VIDE, pré-remplie de ce qu'une lecture a proposé.
 *
 * `extraction` est `null` (lecture pas encore lancée ou pas terminée au clic
 * sur « Continuer ») ou porte un statut différent de `ok` (interrupteur
 * absent, scan illisible, document qui n'est pas une facture, plafond
 * dépassé, service indisponible) rend exactement `EMPTY_LINE()` — le
 * comportement d'avant ce lot, byte-identique dans ces cas.
 *
 * ⚠️ Champ par champ, et jamais en bloc : `hasAnyProposal` ne garantit que
 * l'un des quatre est présent, pas les quatre — un ticket de train ne porte
 * souvent aucune TVA lisible, ce qui n'empêche pas la catégorie et le montant
 * d'être proposés.
 */
function lineFromExtraction(extraction: ExpenseReceiptExtraction | null, receipt: File | null = null): DraftLine {
  const base = EMPTY_LINE()
  const fields = extraction?.status === 'ok' ? extraction.fields : null
  if (!fields) return base

  const read: DraftLine['read'] = {}
  if (fields.amountCents?.value !== null && fields.amountCents?.value !== undefined) {
    base.amount = (fields.amountCents.value / 100).toFixed(2)
    read.amount = {
      confidence: fields.amountCents.confidence,
      sourceExcerpt: fields.amountCents.sourceExcerpt,
      sourceRegion: fields.amountCents.sourceRegion ?? null,
    }
  }
  if (fields.spentOn?.value) {
    base.spentOn = fields.spentOn.value
    read.spentOn = {
      confidence: fields.spentOn.confidence,
      sourceExcerpt: fields.spentOn.sourceExcerpt,
      sourceRegion: fields.spentOn.sourceRegion ?? null,
    }
  }
  if (fields.category?.value) {
    base.category = fields.category.value
    read.category = {
      confidence: fields.category.confidence,
      sourceExcerpt: fields.category.sourceExcerpt,
      sourceRegion: fields.category.sourceRegion ?? null,
    }
  }
  if (fields.vatRateBps?.value !== null && fields.vatRateBps?.value !== undefined) {
    base.vatRate = String(fields.vatRateBps.value / 100)
    read.vatRate = {
      confidence: fields.vatRateBps.confidence,
      sourceExcerpt: fields.vatRateBps.sourceExcerpt,
      sourceRegion: fields.vatRateBps.sourceRegion ?? null,
    }
  }
  return { ...base, read, receipt }
}

/**
 * #1827.1 — un fichier déposé AVANT que la note existe, en attente d'envoi.
 *
 * `idle` : choisi, pas encore envoyé (la note n'est pas encore enregistrée).
 * `uploading` : les octets partent, `progress` les mesure.
 * `done` : reçu par le stockage.
 * `failed` : refusé ou injoignable — `error` porte la phrase du serveur, JAMAIS
 * une phrase inventée ici. Une pièce en échec ne bloque pas les autres.
 */
type PendingUpload = {
  key: string
  file: File
  status: 'idle' | 'uploading' | 'done' | 'failed'
  progress: UploadProgress | null
  error: string | null
}

function toPendingUpload(file: File): PendingUpload {
  return {
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    status: 'idle',
    progress: null,
    error: null,
  }
}

export function ExpenseReportEditor({
  open,
  report,
  onClose,
}: {
  open: boolean
  /** `null` = création. Sinon la note qu'on corrige, telle que le serveur la rend. */
  report: ExpenseReportDetailView | null
  onClose: () => void
}) {
  const { t } = useTranslation('expenses')
  const save = useSaveExpenseReport()
  const submit = useSubmitExpenseReport()

  const [reference, setReference] = useState('')
  const [bearerName, setBearerName] = useState('')
  const [periodMonth, setPeriodMonth] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([EMPTY_LINE()])
  const [attachments, setAttachments] = useState<string[]>([])
  const [attachmentName, setAttachmentName] = useState('')
  // #1827.1 — `false` UNIQUEMENT en création tant que le dépôt n'a pas eu lieu
  // (ni fichiers ni « commencer sans justificatif ») : c'est ce qui fait de la
  // zone de dépôt le PREMIER écran, et pas le formulaire.
  const [started, setStarted] = useState(true)
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([])
  // #1827.1 — l'identifiant du brouillon créé au premier « Enregistrer », pour
  // qu'un second clic (après un échec d'envoi de pièce) CORRIGE cette même
  // note plutôt que d'en créer une seconde : `report` reste `null` tant que le
  // parent n'a pas rouvert le tiroir sur ce nouvel identifiant.
  const [createdId, setCreatedId] = useState<string | null>(null)

  // ⚠️ Le formulaire se REMPLIT depuis la note quand elle change, et se VIDE
  // quand on passe en création. Sans ce second cas, rouvrir « Déposer » après
  // avoir corrigé une note proposerait la référence de la précédente — et on
  // la garderait, puisqu'elle est déjà tapée.
  useEffect(() => {
    if (!open) return
    setReference(report?.reference ?? '')
    setBearerName(report?.bearerName ?? '')
    setPeriodMonth(report?.periodMonth ?? new Date().toISOString().slice(0, 7))
    setLines(
      report && report.lines.length > 0
        ? report.lines.map(line => ({
            key: line.id,
            category: line.category,
            label: line.label,
            spentOn: line.spentOn,
            city: line.city ?? '',
            detail: line.detail ?? '',
            // ⚠️ `?? ''` et jamais `?? 0` : un montant rédigé (pas le droit de
            // le voir) réapparaîtrait sinon à « 0 », et l'enregistrement
            // écraserait la vraie valeur par zéro.
            amount: line.amountCents === null ? '' : (line.amountCents / 100).toFixed(2),
            vatRate: line.vatRateBps === null ? '' : String(line.vatRateBps / 100),
            distanceKm: line.distanceKm === null ? '' : String(line.distanceKm),
            fiscalHorsepower: line.fiscalHorsepower === null ? '' : String(line.fiscalHorsepower),
            // Une ligne déjà ENREGISTRÉE n'est jamais « à vérifier » — la
            // lecture automatique n'existe qu'au dépôt, en création.
            read: {},
            receipt: null,
          }))
        : [EMPTY_LINE()],
    )
    setAttachments(report?.attachments.map(attachment => attachment.fileName) ?? [])
    setAttachmentName('')
    // #1827.1 — la création commence TOUJOURS par le dépôt ; l'édition n'a
    // jamais eu ce détour et ne le gagne pas ici.
    setStarted(report !== null)
    setPendingFiles([])
    setCreatedId(null)
  }, [open, report])

  const editable = report === null || report.status === 'draft' || report.status === 'pending'
  const complete = reference.trim().length > 0 && bearerName.trim().length > 0 && /^\d{4}-\d{2}$/.test(periodMonth)
  // #1827.1 — un envoi de pièce EN COURS : les boutons d'enregistrement se
  // désactivent, un second clic pendant un envoi relancerait le même fichier.
  const uploadingPending = pendingFiles.some(pending => pending.status === 'uploading')

  function payload(): SaveExpenseReportInput {
    return {
      reference: reference.trim(),
      bearerName: bearerName.trim(),
      periodMonth,
      missionId: report?.missionId ?? null,
      accountId: report?.accountId ?? null,
      lines: lines.filter(usable).map(toLineInput),
      attachments: attachments.map(fileName => ({ fileName, contentType: null, byteSize: null })),
    }
  }

  async function persist(): Promise<string | null> {
    // #1827.1 — la cible est la note du serveur si elle existe déjà, SINON le
    // brouillon créé par un « Enregistrer » précédent sur CETTE même ouverture
    // (`createdId`) : sans lui, réessayer après un échec d'envoi de pièce
    // créerait une seconde note à chaque clic.
    const targetId = report?.id ?? createdId
    const result = await save.mutateAsync({ id: targetId, input: payload() })
    if (targetId === null) setCreatedId(result.id)
    return result.id
  }

  /**
   * #1827.1 — envoie les fichiers déposés AVANT que la note existe, un par un,
   * vers la note qui vient d'être enregistrée. Rend `true` seulement si TOUS
   * sont passés — un seul échec suffit à garder le tiroir ouvert, pour que le
   * refus, nommé, reste sous les yeux plutôt que de disparaître avec la
   * fermeture.
   *
   * Réutilise `expensesApi.upload` et `toUploadInput` — le MÊME chemin que
   * `AttachmentDeposit` (le dépôt sur une note déjà créée) — jamais un second
   * mécanisme d'envoi.
   */
  async function uploadPendingFiles(id: string): Promise<boolean> {
    let allUploaded = true
    for (const pending of pendingFiles) {
      if (pending.status === 'done') continue
      setPendingFiles(current =>
        current.map(entry => (entry.key === pending.key ? { ...entry, status: 'uploading', error: null } : entry)),
      )
      try {
        const input = await toUploadInput(pending.file)
        await expensesApi.upload(id, input, progress => {
          setPendingFiles(current => current.map(entry => (entry.key === pending.key ? { ...entry, progress } : entry)))
        })
        setPendingFiles(current =>
          current.map(entry => (entry.key === pending.key ? { ...entry, status: 'done', progress: null } : entry)),
        )
      } catch (error) {
        allUploaded = false
        setPendingFiles(current =>
          current.map(entry =>
            entry.key === pending.key
              ? {
                  ...entry,
                  status: 'failed',
                  progress: null,
                  // Le message du SERVEUR, jamais une phrase inventée ici —
                  // « rôle insuffisant », « ce fichier dépasse 10 Mo »… sont
                  // toutes des raisons vraies, contrairement à un texte fixe.
                  error: (error as Error).message || t('deposit.failedUnknown'),
                }
              : entry,
          ),
        )
      }
    }
    return allUploaded
  }

  /** Enregistre la note PUIS envoie ses pièces en attente — dans cet ordre :
   *  sans note enregistrée, il n'y a pas d'identifiant vers lequel envoyer. */
  async function persistWithAttachments(): Promise<{ id: string; allUploaded: boolean } | null> {
    const id = await persist()
    if (id === null) return null
    const allUploaded = pendingFiles.length === 0 ? true : await uploadPendingFiles(id)
    return { id, allUploaded }
  }

  /** Retente les pièces en ÉCHEC (ou pas encore envoyées) sur une note déjà
   *  enregistrée — sans redemander la saisie, qui n'a pas changé. */
  async function retryPendingUploads(): Promise<void> {
    const id = report?.id ?? createdId
    if (id === null) return
    await uploadPendingFiles(id)
  }

  return (
    <Sheet open={open} onOpenChange={next => (next ? undefined : onClose())}>
      {/* `dvh` et jamais `vh` : sur mobile, `vh` compte la barre d'URL et le
          pied du tiroir passe sous le bord de l'écran. */}
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex h-[100dvh] w-full max-w-xl flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-lg">{report === null ? t('editor.newTitle') : t('editor.editTitle')}</SheetTitle>
          <SheetDescription className="mt-1 text-sm">
            {/* #1827.1 — le premier écran de la création porte sa PROPRE
                description (« dépose tes justificatifs »), distincte de celle
                du formulaire qui suit : les deux ne disent pas la même chose. */}
            {report === null
              ? started
                ? t('editor.newDescription')
                : t('editor.depositStart.description')
              : t('editor.editDescription')}
          </SheetDescription>
        </SheetHeader>

        {/* #1827.1 — LE DÉPÔT D'ABORD : en création, le premier écran est une
            zone de dépôt, jamais le formulaire vide. `started` ne devient vrai
            qu'après un choix explicite (des fichiers, ou « commencer sans
            justificatif ») — jamais tout seul. */}
        {report === null && !started ? (
          <Box className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ExpenseDepositStart
              onContinue={(entries: DepositEntry[]) => {
                setPendingFiles(entries.map(entry => toPendingUpload(entry.file)))
                // #1827.2 — un fichier → une ligne PRÉ-REMPLIE de ce que la
                // lecture automatique a proposé, ou VIDE quand elle n'a rien
                // trouvé (ou n'est pas branchée) : `lineFromExtraction` couvre
                // les deux, sans jamais écrire une donnée non vérifiée.
                setLines(entries.map(entry => lineFromExtraction(entry.extraction, entry.file)))
                setStarted(true)
              }}
              onSkip={() => setStarted(true)}
            />
          </Box>
        ) : (
          <>
            {/* Un seul conteneur défilant — jamais deux imbriqués (GA-29).
            `max-w-xl` : un formulaire se lit en colonne étroite (D81). */}
            <Box className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {!editable ? (
                <Box
                  className="rounded-md border p-3"
                  style={{ background: 'var(--info-soft-bg)', borderColor: 'var(--info-soft-border)' }}
                >
                  <Text element="p" size="sm" color="var(--info-soft-text)">
                    {t('editor.decidedLocked')}
                  </Text>
                </Box>
              ) : null}

              <Box className="max-w-xl space-y-3">
                <Field label={t('editor.reference')} hint={t('editor.referenceHint')}>
                  <Input
                    value={reference}
                    onChange={event => setReference(event.target.value)}
                    aria-label={t('editor.reference')}
                    disabled={!editable}
                    maxLength={80}
                  />
                </Field>
                <Field label={t('editor.bearer')}>
                  <Input
                    value={bearerName}
                    onChange={event => setBearerName(event.target.value)}
                    aria-label={t('editor.bearer')}
                    disabled={!editable}
                    maxLength={160}
                  />
                </Field>
                <Field label={t('editor.period')} hint={t('editor.periodHint')}>
                  <Input
                    type="month"
                    value={periodMonth}
                    onChange={event => setPeriodMonth(event.target.value)}
                    aria-label={t('editor.period')}
                    disabled={!editable}
                  />
                </Field>
              </Box>

              <Box>
                <Box display="flex" className="items-center justify-between gap-2">
                  <Text element="h3" size="sm" weight="semibold">
                    {t('editor.lines')}
                  </Text>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!editable}
                    onClick={() => setLines(current => [...current, EMPTY_LINE()])}
                  >
                    {t('editor.addLine')}
                  </Button>
                </Box>
                <Box className="mt-2 space-y-3">
                  {lines.map((line, index) => (
                    <LineForm
                      key={line.key}
                      line={line}
                      index={index}
                      disabled={!editable}
                      onChange={next =>
                        setLines(current => current.map(entry => (entry.key === line.key ? next : entry)))
                      }
                      onRemove={() =>
                        setLines(current => {
                          const rest = current.filter(entry => entry.key !== line.key)
                          // Une note sans ligne est un état valable (un brouillon
                          // commence vide), mais un formulaire sans AUCUN bloc n'a
                          // plus de prise : on en laisse un, vierge.
                          return rest.length > 0 ? rest : [EMPTY_LINE()]
                        })
                      }
                    />
                  ))}
                </Box>
              </Box>

              <Box>
                <Text element="h3" size="sm" weight="semibold">
                  {t('editor.attachments')}
                </Text>
                {report === null ? (
                  // #1827.1 — CRÉATION : les fichiers déposés à l'étape précédente
                  // (et ceux-là seuls — aucun ajout mi-formulaire dans ce lot,
                  // pour ne pas mélanger deux mécanismes) sont RÉELLEMENT envoyés,
                  // au moment de l'enregistrement.
                  <>
                    <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 max-w-xl">
                      {t('editor.depositAttachmentsHint')}
                    </Text>
                    {pendingFiles.length === 0 ? (
                      <Text element="p" size="sm" color="text-muted-foreground" className="mt-2">
                        {t('editor.noPendingFiles')}
                      </Text>
                    ) : (
                      <Box className="mt-2 space-y-2">
                        {pendingFiles.map(pending => (
                          <PendingFileRow
                            key={pending.key}
                            pending={pending}
                            onRemove={() =>
                              setPendingFiles(current => current.filter(entry => entry.key !== pending.key))
                            }
                            onRetry={() => void retryPendingUploads()}
                          />
                        ))}
                      </Box>
                    )}
                  </>
                ) : (
                  // ÉDITION : mécanisme INCHANGÉ par ce lot — nommer une pièce sans
                  // l'envoyer. Domaine séparé de la création, voir le commentaire
                  // de tête sur #1827.1.
                  <>
                    <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5 max-w-xl">
                      {/* ⚠️ La phrase DIT ce que ce formulaire ne fait pas ICI.
                      Laisser croire au téléversement se découvre en réunion,
                      pas en CI. */}
                      {t('editor.attachmentsHint')}
                    </Text>
                    <Box display="flex" className="mt-2 max-w-xl flex-wrap items-center gap-2">
                      <Input
                        value={attachmentName}
                        onChange={event => setAttachmentName(event.target.value)}
                        placeholder={t('editor.attachmentPlaceholder')}
                        aria-label={t('editor.attachmentLabel')}
                        disabled={!editable}
                        maxLength={255}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!editable || attachmentName.trim().length === 0}
                        onClick={() => {
                          setAttachments(current => [...current, attachmentName.trim()])
                          setAttachmentName('')
                        }}
                      >
                        {t('editor.addAttachment')}
                      </Button>
                    </Box>
                    {attachments.length > 0 ? (
                      <Box display="flex" className="mt-2 flex-wrap gap-2">
                        {attachments.map((fileName, index) => (
                          <Box
                            key={`${fileName}-${index}`}
                            display="flex"
                            className="items-center gap-2 rounded-md border border-border bg-card px-2 py-1"
                          >
                            <Text element="span" size="xs">
                              {fileName}
                            </Text>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="min-h-11 px-2"
                              disabled={!editable}
                              aria-label={t('editor.removeAttachment', { name: fileName })}
                              onClick={() => setAttachments(current => current.filter((_, at) => at !== index))}
                            >
                              ×
                            </Button>
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                  </>
                )}
              </Box>
            </Box>

            <Box className="border-t border-border px-5 py-3">
              <Box display="flex" className="flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  // #1827.1 — un envoi de pièce EN COURS bloque aussi le bouton :
                  // cliquer pendant qu'un fichier part relancerait un second
                  // envoi du même fichier.
                  disabled={!editable || !complete || save.isPending || uploadingPending}
                  onClick={() => {
                    // #1827.1 — la note s'enregistre PUIS ses pièces en attente
                    // partent réellement. Le tiroir ne se ferme QUE si tout est
                    // passé : un échec d'envoi doit rester sous les yeux, nommé,
                    // plutôt que de disparaître avec la fermeture — la note, elle,
                    // est déjà en sûreté en brouillon.
                    void persistWithAttachments().then(result => {
                      if (result !== null && result.allUploaded) onClose()
                    })
                  }}
                >
                  {t('editor.saveDraft')}
                </Button>
                <Button
                  type="button"
                  className="min-h-11 flex-1"
                  // Une note DÉJÀ soumise ne se re-soumet pas : le bouton dirait
                  // qu'il va se passer quelque chose qui ne se passera pas.
                  disabled={
                    !editable ||
                    !complete ||
                    save.isPending ||
                    submit.isPending ||
                    report?.status === 'pending' ||
                    uploadingPending
                  }
                  onClick={() => {
                    // ⚠️ Enregistrer PUIS soumettre : sans le premier, la dernière
                    // frappe partirait à la corbeille pendant que la note entre
                    // dans la file — la pire des deux moitiés. #1827.1 — et
                    // désormais PUIS envoyer les pièces ; si l'une échoue, on ne
                    // soumet pas en silence par-dessus un dépôt incomplet.
                    void persistWithAttachments().then(result => {
                      if (result === null || !result.allUploaded) return
                      submit.mutate(result.id, { onSuccess: onClose })
                    })
                  }}
                >
                  {t('editor.submit')}
                </Button>
              </Box>
              <Text element="p" size="xs" color="text-muted-foreground" className="mt-2 max-w-xl">
                {t('editor.footerHint')}
              </Text>
            </Box>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Une ligne du formulaire. Onze catégories sur douze n'ont pas de kilomètres. */
function LineForm({
  line,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  line: DraftLine
  index: number
  disabled: boolean
  onChange: (next: DraftLine) => void
  onRemove: () => void
}) {
  const { t } = useTranslation('expenses')
  const set = (patch: Partial<DraftLine>) => onChange({ ...line, ...patch })
  /**
   * #1827.2 — UNE CORRECTION HUMAINE GAGNE TOUJOURS : dès que l'utilisateur
   * touche un champ marqué « lu automatiquement », son entrée dans `read`
   * disparaît — le badge s'efface avec elle. La valeur qu'il tape ensuite
   * n'est plus une proposition, c'est une saisie, et rien ne doit plus la
   * distinguer d'un champ jamais lu.
   */
  const setRead = (field: keyof DraftLine['read'], patch: Partial<DraftLine>) =>
    onChange({ ...line, ...patch, read: { ...line.read, [field]: undefined } })

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="p" size="sm" weight="medium">
          <Text element="span" size="sm" aria-hidden="true">
            {CATEGORY_GLYPH[line.category]}{' '}
          </Text>
          {t('editor.lineNumber', { number: index + 1 })}
        </Text>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11"
          disabled={disabled}
          aria-label={t('editor.removeLine', { number: index + 1 })}
          onClick={onRemove}
        >
          {t('editor.remove')}
        </Button>
      </Box>

      <Box className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label={t('editor.category')} hint={line.read.category ? t('editor.readBadge') : undefined}>
          {/* Un `<select>` natif : douze options se déroulent, et il se tabule,
              s'annonce et s'ouvre au clavier sans une ligne de code. */}
          <SelectField
            ariaLabel={t('editor.category')}
            value={line.category}
            onChange={next => setRead('category', { category: next as ExpenseCategory })}
            options={EXPENSE_CATEGORIES.map(category => ({ value: category, label: t(`category.${category}`) }))}
            disabled={disabled}
            className="w-full"
          />
        </Field>
        <Field label={t('editor.date')} hint={line.read.spentOn ? t('editor.readBadge') : undefined}>
          <Input
            type="date"
            value={line.spentOn}
            disabled={disabled}
            aria-label={t('editor.date')}
            onChange={event => setRead('spentOn', { spentOn: event.target.value })}
          />
        </Field>
        <Field label={t('editor.label')}>
          <Input
            value={line.label}
            disabled={disabled}
            maxLength={200}
            aria-label={t('editor.label')}
            onChange={event => set({ label: event.target.value })}
          />
        </Field>
        <Field label={t('editor.city')}>
          <Input
            value={line.city}
            disabled={disabled}
            maxLength={120}
            aria-label={t('editor.city')}
            onChange={event => set({ city: event.target.value })}
          />
        </Field>
        <Field label={t('editor.amount')} hint={line.read.amount ? t('editor.readBadge') : t('editor.amountHint')}>
          <Input
            inputMode="decimal"
            value={line.amount}
            disabled={disabled}
            aria-label={t('editor.amount')}
            onChange={event => setRead('amount', { amount: event.target.value })}
          />
        </Field>
        <Field label={t('editor.vatRate')} hint={line.read.vatRate ? t('editor.readBadge') : t('editor.vatRateHint')}>
          <Input
            inputMode="decimal"
            value={line.vatRate}
            disabled={disabled}
            placeholder={t('editor.vatRatePlaceholder')}
            aria-label={t('editor.vatRate')}
            onChange={event => setRead('vatRate', { vatRate: event.target.value })}
          />
        </Field>
      </Box>

      {line.receipt ? (
        <ReceiptRegionPreview
          file={line.receipt}
          regions={(
            [
              ['amount', t('editor.amount')],
              ['spentOn', t('editor.date')],
              ['category', t('editor.category')],
              ['vatRate', t('editor.vatRate')],
            ] as const
          ).flatMap(([key, label]) => {
            const region = line.read[key]?.sourceRegion
            return region ? [{ label, region }] : []
          })}
        />
      ) : null}

      {line.category === 'mileage' ? (
        <Box className="mt-2 grid gap-2 sm:grid-cols-2">
          <Field label={t('editor.distance')} hint={t('editor.distanceHint')}>
            <Input
              inputMode="numeric"
              value={line.distanceKm}
              disabled={disabled}
              aria-label={t('editor.distance')}
              onChange={event => set({ distanceKm: event.target.value })}
            />
          </Field>
          <Field label={t('editor.horsepower')} hint={t('editor.horsepowerHint')}>
            <Input
              inputMode="numeric"
              value={line.fiscalHorsepower}
              disabled={disabled}
              aria-label={t('editor.horsepower')}
              onChange={event => set({ fiscalHorsepower: event.target.value })}
            />
          </Field>
        </Box>
      ) : null}
    </Box>
  )
}

/**
 * #1827.1 — une ligne de la liste des pièces DÉPOSÉES en création : nom,
 * poids, et le SEUL état vrai — en attente, en cours (mesuré), reçue, ou en
 * échec avec sa phrase et un moyen de réessayer.
 */
function PendingFileRow({
  pending,
  onRemove,
  onRetry,
}: {
  pending: PendingUpload
  onRemove: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation('expenses')
  const percent =
    pending.progress?.ratio === null || pending.progress === null ? null : Math.round(pending.progress.ratio * 100)

  return (
    <Box className="rounded-md border border-border bg-card p-2">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="p" size="xs" className="min-w-0 truncate">
          {pending.file.name} · {formatBytes(pending.file.size)}
        </Text>
        {pending.status === 'idle' || pending.status === 'failed' ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 px-2"
            aria-label={t('editor.removeAttachment', { name: pending.file.name })}
            onClick={onRemove}
          >
            ×
          </Button>
        ) : null}
      </Box>
      {pending.status === 'uploading' ? (
        <Text element="p" size="xs" color="text-muted-foreground">
          {pending.progress?.phase === 'finishing'
            ? t('deposit.finishing')
            : percent === null
              ? t('deposit.sendingUnknown')
              : t('deposit.sending', { percent })}
        </Text>
      ) : null}
      {pending.status === 'done' ? (
        <Text element="p" size="xs" color="var(--success-soft-text)">
          {t('editor.uploadDone')}
        </Text>
      ) : null}
      {pending.status === 'failed' ? (
        <Box display="flex" className="mt-1 items-center justify-between gap-2">
          <Text element="p" size="xs" color="var(--danger-soft-text)">
            {pending.error}
          </Text>
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onRetry}>
            {t('editor.retryUpload')}
          </Button>
        </Box>
      ) : null}
    </Box>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box className="min-w-0">
      <Text element="p" size="xs" color="text-muted-foreground">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
          {hint}
        </Text>
      ) : null}
    </Box>
  )
}

/** Une ligne n'est envoyée que si elle porte un montant ET une date lisibles. */
function usable(line: DraftLine): boolean {
  return toCents(line.amount) !== null && /^\d{4}-\d{2}-\d{2}$/.test(line.spentOn) && line.label.trim().length > 0
}

function toLineInput(line: DraftLine): SaveExpenseReportInput['lines'][number] {
  return {
    category: line.category,
    label: line.label.trim(),
    spentOn: line.spentOn,
    city: line.city.trim() || null,
    detail: line.detail.trim() || null,
    // `usable` a déjà écarté les lignes sans montant lisible.
    amountCents: toCents(line.amount) as number,
    // ⚠️ Un champ VIDE vaut `null` — « je n'ai pas lu le taux » — et jamais 0.
    // « 0 % » est un fait fiscal ; ne pas avoir lu le ticket n'en est pas un, et
    // la ventilation de TVA compte les deux différemment.
    vatRateBps: toBps(line.vatRate),
    distanceKm: line.category === 'mileage' ? toPositiveInt(line.distanceKm) : null,
    fiscalHorsepower: line.category === 'mileage' ? toPositiveInt(line.fiscalHorsepower) : null,
  }
}

/** « 18,50 » ou « 18.50 » → 1850. `null` sur un champ vide ou illisible. */
function toCents(value: string): number | null {
  const normalised = value.trim().replace(',', '.')
  if (normalised.length === 0) return null
  const euros = Number(normalised)
  if (!Number.isFinite(euros) || euros <= 0) return null
  return Math.round(euros * 100)
}

/** « 10 » → 1000 points de base. `null` = taux NON LU, jamais 0. */
function toBps(value: string): number | null {
  const normalised = value.trim().replace(',', '.')
  if (normalised.length === 0) return null
  const percent = Number(normalised)
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
  return Math.round(percent * 100)
}

function toPositiveInt(value: string): number | null {
  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed <= 0) return null
  return parsed
}
