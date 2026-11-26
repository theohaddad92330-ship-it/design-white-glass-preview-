import type { ChatImageCitation, ChatImageObjects } from '@bellum/contracts'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useChatImageUrl } from '@/features/rag/hooks/useChatImageUrl'
import { DocumentPreview } from '@/features/rag/preview/DocumentPreview'
import { SpreadsheetGrid } from '@/features/rag/preview/SpreadsheetGrid'

type AttachmentPreviewDialogProps = {
  /** `null` = fermée. Sert aussi de clé de requête (`useRagDocumentContent`). */
  id: string | null
  name: string | null
  /**
   * #2148.16 — le texte d'une pièce ÉPHÉMÈRE (cas a), déjà connu du navigateur
   * (extrait par `POST /rag-documents/extract`, jamais ingéré) : `id` ne
   * désigne alors AUCUN document serveur, donc aucun aller-retour n'est
   * tenté. `undefined` (cas b, une pièce durable) garde le comportement
   * d'avant — lue par `id`.
   */
  content?: string
  /**
   * #2876 (#2433.4) — l'URL locale (`blob:`) de l'image SOURCE, quand la pièce
   * en est une ET que cet onglet l'a déposée lui-même dans CETTE session : la
   * PREUVE visuelle, montrée au-dessus du texte lu. Jamais un aller-retour
   * serveur — l'image ne quitte jamais ce navigateur.
   */
  imageUrl?: string
  /**
   * #2876 (#2433.4) — l'identifiant `storage_objects` (domaine
   * `chat_image_attachment`) d'une image de message DÉJÀ ENVOYÉ, quand
   * `imageUrl` n'est PAS déjà connu (fil rechargé, ou relu par un autre
   * membre de l'espace) : l'URL signée est demandée au clic
   * ({@link useChatImageUrl}), jamais mise en cache. `imageUrl` reste
   * prioritaire quand les deux sont présents — pas d'aller-retour réseau
   * pour une image que ce navigateur a déjà sous la main.
   */
  imageObjectId?: string
  /**
   * #2433.4 (épopée #2876, lot M10 09/10) — OÙ chaque ligne a été lue dans
   * l'image (`vision_regions.locate_lines`) : la zone est surlignée sur la
   * source, la ligne citée est nommée dessous. Absent = aucune zone mesurée,
   * rien n'est dessiné.
   */
  citations?: ChatImageCitation[]
  /**
   * #2433.12 (épopée #2876, lot P02 09/10) — les OBJETS mesurés par le
   * localiseur (`vision_objects.locate_objects`) : les bords du document (un
   * recadrage PROPOSÉ, jamais appliqué d'office) et la grille d'un tableau.
   * Absent = rien mesuré : l'aperçu n'en dit rien.
   */
  objects?: ChatImageObjects
  onOpenChange: (open: boolean) => void
}

const pct = (ratio: number) => `${Math.round(ratio * 10_000) / 100}%`

type Box = NonNullable<ChatImageObjects['documentBounds']>

/** #2433.12 — le recadrage MONTRÉ : un masque sur l'image, ses octets restent entiers. */
const cropInset = (box: Box) => `inset(${pct(box.y)} ${pct(1 - box.x - box.w)} ${pct(1 - box.y - box.h)} ${pct(box.x)})`

/**
 * #1954.19 — PRÉVISUALISER un document DÉJÀ attaché : « un clic sur la pièce
 * ouvrira un aperçu de son contenu » (registre 12/09/2026). Même
 * cloisonnement que l'API (`RagService.getContentForUser`, auteur+espace) —
 * ici, on affiche juste ce que le serveur a bien voulu rendre.
 *
 * #2876 (#2433.4) — pour une IMAGE, l'aperçu montre la SOURCE elle-même,
 * pas seulement ce que le modèle en a lu : cliquer la pièce jointe d'une
 * réponse qui la cite rouvre la preuve visuelle — `imageUrl` (locale,
 * session en cours) ou, à défaut, `imageObjectId` (fil rechargé, ou relu par
 * un collègue) résolu en URL signée au clic.
 */
export function AttachmentPreviewDialog({
  id,
  name,
  content,
  imageUrl,
  imageObjectId,
  citations,
  objects,
  onOpenChange,
}: AttachmentPreviewDialogProps) {
  const { t } = useTranslation('chat')
  // Le recadrage montré appartient à CETTE pièce : rouvrir une autre image la montre entière.
  const [croppedId, setCroppedId] = useState<string | null>(null)
  const cropped = id !== null && croppedId === id
  const bounds = objects?.documentBounds ?? null
  const isImage = imageUrl !== undefined || imageObjectId !== undefined
  const ephemeral = content !== undefined || isImage
  // `imageUrl` prioritaire : rien à demander au serveur pour une image que ce
  // navigateur a déjà sous la main. Sinon, l'URL signée se demande au clic —
  // jamais tant que le dialogue est fermé (`open` retombe l'`id` à `null`).
  const shouldFetchImageUrl = imageUrl === undefined && imageObjectId !== undefined && id !== null
  const { data: signedImage, isLoading: isImageLoading } = useChatImageUrl(shouldFetchImageUrl ? imageObjectId : null)
  const resolvedImageUrl = imageUrl ?? signedImage?.url

  return (
    <Dialog open={id !== null} onOpenChange={onOpenChange}>
      {/* #3803 — un document durable s'ouvre dans la visionneuse partagée : plus large qu'un texte. */}
      <DialogContent closeLabel={t('common:actions.close')} className={ephemeral ? 'max-w-lg' : 'max-w-4xl'}>
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{name ?? ''}</DialogTitle>
          <DialogDescription className="sr-only">{t('attach.preview.open', { name: name ?? '' })}</DialogDescription>
        </DialogHeader>
        {resolvedImageUrl ? (
          // #2433.4 — l'image à sa taille INTRINSÈQUE (pas `object-contain`) :
          // une zone normalisée se pose alors en pourcentage du conteneur,
          // exactement sur la ligne lue (même grammaire que `ReceiptRegionPreview`).
          <figure>
            <div className="relative mx-auto w-fit max-w-full">
              <img
                src={resolvedImageUrl}
                alt={t('attach.preview.imageAlt', { name: name ?? '' })}
                loading="lazy"
                className="block max-h-[60dvh] max-w-full rounded-md"
                style={cropped && bounds ? { clipPath: cropInset(bounds) } : undefined}
              />
              {citations?.map((citation, index) => (
                <span
                  key={`${citation.quote}-${index}`}
                  data-testid={`chat-image-citation-${index}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm border border-primary bg-primary/20"
                  style={{
                    left: pct(citation.bounding_box.x),
                    top: pct(citation.bounding_box.y),
                    width: pct(citation.bounding_box.w),
                    height: pct(citation.bounding_box.h),
                  }}
                />
              ))}
              {/* #2433.12 — le cadre du recadrage PROPOSÉ, tant qu'il n'est pas montré. */}
              {bounds && !cropped ? (
                <span
                  data-testid="chat-image-crop-frame"
                  aria-hidden="true"
                  className="pointer-events-none absolute rounded-sm border border-dashed border-primary"
                  style={{ left: pct(bounds.x), top: pct(bounds.y), width: pct(bounds.w), height: pct(bounds.h) }}
                />
              ) : null}
            </div>
            {citations?.length ? (
              <figcaption className="mt-2 text-xs text-[var(--bellum-text-muted)]">
                {t('attach.preview.citationsCaption', { count: citations.length })}
                <ul className="mt-1 grid gap-0.5">
                  {citations.map((citation, index) => (
                    <li key={`${citation.quote}-${index}`}>
                      {t('attach.preview.citationLine', { quote: citation.quote })}
                    </li>
                  ))}
                </ul>
              </figcaption>
            ) : null}
            {objects ? (
              // #2433.12 — jamais de recadrage deviné : sans bords détectés,
              // l'image reste entière et l'aperçu le DIT.
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--bellum-text-muted)]">
                <p>{t(bounds ? 'attach.preview.objects.cropProposed' : 'attach.preview.objects.noBounds')}</p>
                {bounds ? (
                  <button
                    type="button"
                    aria-pressed={cropped}
                    onClick={() => setCroppedId(cropped ? null : id)}
                    className="min-h-11 rounded-md border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-secondary)]"
                  >
                    {t(cropped ? 'attach.preview.objects.showWhole' : 'attach.preview.objects.showCropped')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </figure>
        ) : shouldFetchImageUrl && isImageLoading ? (
          <p className="text-sm text-[var(--bellum-text-muted)]">{t('attach.preview.loading')}</p>
        ) : shouldFetchImageUrl ? (
          <p className="text-sm text-[var(--bellum-text-muted)]">{t('attach.preview.failed')}</p>
        ) : null}
        {/* #2433.12 — le tableau lu, dans la grille de tableau existante : une case
            vide reste VIDE (#2433.5), jamais « 0 ». */}
        {resolvedImageUrl && objects?.table ? (
          <section className="grid gap-1">
            <h3 className="text-sm font-semibold text-[var(--bellum-text-secondary)]">
              {t('attach.preview.objects.tableTitle', {
                rows: objects.table.rows.length,
                columns: objects.table.rows[0]?.length ?? 0,
              })}
            </h3>
            <SpreadsheetGrid
              sheets={[{ name: '', rows: objects.table.rows.map(row => row.map(cell => cell ?? '')) }]}
            />
            {objects.table.rows.some(row => row.includes(null)) ? (
              <p className="text-xs text-[var(--bellum-text-muted)]">{t('attach.preview.objects.emptyCells')}</p>
            ) : null}
          </section>
        ) : null}
        {/* #3803 (3803.2/3803.6) — un document DURABLE : la visionneuse partagée avec
            Connaissances (grille, PDF, docx, slides, ou texte + « original non conservé »). */}
        {!ephemeral && id !== null ? (
          <DocumentPreview documentId={id} />
        ) : content ? (
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-[var(--bellum-text-secondary)]">
            {content}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
