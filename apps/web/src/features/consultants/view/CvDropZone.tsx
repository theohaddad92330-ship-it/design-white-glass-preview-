import { Button, Card, Spinner, Text } from '@bellum/ui'
import { AlertTriangle, Check, FolderUp, Layers, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CV_UPLOAD_MAX_BYTES, hasSpreadsheetExtension, type TalentDuplicateMatch } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { useCvIntake } from '../hooks'
import { talentNameText } from '../lib/talentName'
import {
  estimateRemainingMs,
  filterCvBatchFiles,
  formatRemainingCv,
  runCvBatch,
  summariseCvBatch,
  type CvBatchOutcome,
  type CvBatchProgress,
} from '../lib/cvBatch'

/**
 * Le dépôt d'un CV (PDF 3 §3.1 et §3.3).
 *
 * Le vivier ne savait recevoir que du texte COLLÉ : déposer un CV supposait de
 * l'ouvrir, tout sélectionner, copier. Ici on dépose le fichier.
 *
 * Deux comportements qui portent tout l'écran :
 *
 *  - **le doublon arrête le dépôt**, il ne le complète pas. Tant que personne
 *    n'a dit « ce n'est pas la même personne », rien n'est écrit ;
 *  - **un fichier illisible dit POURQUOI**. Le message vient du serveur, qui
 *    tient la vraie raison (« probablement un scan »). Le remplacer par « une
 *    erreur est survenue » ferait redéposer le même fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `attachToTalentId` — DÉPOSER DIRECTEMENT SUR UNE FICHE CONNUE (#2327.1 / #2327.17)
 * ─────────────────────────────────────────────────────────────────────────
 * DÉFAUT recette 17/09 (passage 7) : l'onglet Documents de la fiche talent
 * n'avait aucune zone de dépôt — `ConsultantFormDialog.tsx` ne montait ce
 * composant qu'en CRÉATION (`isCreation`), jamais en édition d'une fiche
 * existante. Ici, la cible est déjà connue : le serveur saute la détection de
 * doublon (`cv-intake.service.ts:118-140`) et rejoint directement la fiche
 * comme une nouvelle version — aucune question à poser, donc ni le dépôt en
 * masse (qui, lui, CRÉE toujours) ni le tiroir « ça ressemble à… » n'ont leur
 * place dans ce mode.
 */
/**
 * #2542.1 — retour Ludovic Marx (call bêta 17/09) : un dossier de compétences
 * PDF restait « bloqué en analyse » sans qu'aucune étape ne se distingue à
 * l'écran — seul le libellé du bouton (`intake.working`) changeait pendant
 * `intake.isPending`. Le timeout et l'erreur nommée existaient déjà côté
 * serveur (`cv-intake.service.ts`, #2542.1 aussi) ; ce qui manquait était la
 * PROGRESSION.
 *
 * `received` et `processing` ne sont JAMAIS un pourcentage inventé — ce sont
 * les deux seules frontières que le client peut vérifier sur un aller-retour
 * HTTP unique (`POST /talents/intake`, aucun flux de progression serveur) :
 * le fichier est en mémoire (`received`, fait immédiat, avant tout réseau),
 * puis le serveur lit ET extrait (`processing` — une SEULE étape honnête :
 * rien ne dit au client où finit la lecture et où commence l'extraction dans
 * cette même requête, donc rien n'affirme l'une ACHEVÉE avant l'autre).
 */
type CvIntakeProgress =
  | { phase: 'received' }
  | { phase: 'processing' }
  | { phase: 'done'; outcome: 'created' | 'updated' }
  | { phase: 'error'; message: string }
  // Une panne de TRANSPORT (ou toute erreur que le serveur n'a pas nommée) ne
  // dit pas si le fichier est arrivé : `unknown` ARRÊTE la reprise — elle ne
  // se rejoue jamais d'elle-même, et l'écran le dit plutôt que d'inventer un
  // échec qu'il n'a pas constaté.
  | { phase: 'unknown' }

export function CvDropZone({
  attachToTalentId,
  onCreated,
  startInPaste = false,
}: {
  /** Fiche déjà ouverte : le dépôt lui ajoute une version, sans détection de doublon. */
  attachToTalentId?: string
  onCreated?: (consultantId: string) => void
  /** Théo C talents-vivier.N5 — « Préparer avec Laura » : la zone s'ouvre directement sur le texte à coller. */
  startInPaste?: boolean
}) {
  const { t } = useTranslation('consultants')
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pasting, setPasting] = useState(startInPaste)
  const [pastedText, setPastedText] = useState('')
  const [pending, setPending] = useState<{ file: File; duplicates: TalentDuplicateMatch[] } | null>(null)
  const [progress, setProgress] = useState<CvIntakeProgress | null>(null)
  // #1116 — « j'ai environ 2-3000 CV […] envie de tous les charger dans l'outil ».
  const batchInputRef = useRef<HTMLInputElement>(null)
  // #2183.4 — le dossier ENTIER, pas fichier par fichier.
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [batch, setBatch] = useState<CvBatchProgress | null>(null)
  // #2183.43 — le début du lot EN COURS, pour extrapoler un temps restant sur
  // ce qui vient d'être mesuré. Un `ref` : poser l'heure ne doit pas, à lui
  // seul, redéclencher un rendu.
  const batchStartedAtRef = useRef<number | null>(null)
  // Un `ref` et non un état : la file le lit à chaque fichier, et un état
  // relu dans une boucle déjà lancée resterait à sa valeur de départ.
  const stopRef = useRef(false)
  const intake = useCvIntake()

  /**
   * `resolution` porte la DÉCISION humaine face à un doublon :
   *  - `create` : « ce n'est pas la même personne » — les fiches écartées sont
   *    transmises, et la paire ne reviendra plus (#2327.12) ;
   *  - `attach` : le CV rejoint la fiche existante comme une version (#2327.17).
   */
  const submit = async (
    file: File,
    resolution: { kind: 'none' } | { kind: 'create'; dismissed: string[] } | { kind: 'attach'; talentId: string },
  ) => {
    if (file.size > CV_UPLOAD_MAX_BYTES) {
      toast.error(t('intake.tooBig', { max: Math.round(CV_UPLOAD_MAX_BYTES / (1024 * 1024)) }))
      return
    }
    // M2.3 (Meyer 20/10) — un tableur n'est pas un CV : refusé avant tout envoi, le message renvoie vers Réglages › Import.
    if (hasSpreadsheetExtension(file.name)) {
      toast.error(t('intake.notACv'))
      return
    }
    // #2542.1 — « reçu » est vrai dès que le navigateur tient le fichier, AVANT
    // tout réseau : ce n'est jamais retardé jusqu'à la réponse du serveur.
    setProgress({ phase: 'received' })
    const fileB64 = await readAsBase64(file)
    setProgress({ phase: 'processing' })
    try {
      const result = await intake.mutateAsync({
        filename: file.name,
        fileB64,
        kind: 'candidate',
        createDespiteDuplicates: resolution.kind === 'create',
        ...(resolution.kind === 'create' ? { dismissedTalentIds: resolution.dismissed } : {}),
        ...(resolution.kind === 'attach' ? { attachToTalentId: resolution.talentId } : {}),
      })
      if (result.outcome === 'duplicates') {
        // Le tiroir « ça ressemble à… » porte déjà l'explication — la
        // remontrer ici la montrerait deux fois (même règle que #2024.3).
        setProgress(null)
        setPending({ file, duplicates: result.duplicates })
        return
      }
      setProgress({ phase: 'done', outcome: result.outcome })
      setPending(null)
      toast.success(
        result.outcome === 'updated'
          ? t('intake.updated', { count: result.extractedChars })
          : t('intake.created', { count: result.extractedChars }),
      )
      onCreated?.(result.consultantId)
    } catch (error) {
      // Le message du serveur porte la RAISON : le remplacer ferait redéposer
      // le même fichier. Une erreur NOMMÉE (`ApiError`, cv-intake.service.ts)
      // se distingue d'une panne de transport qui n'en nomme aucune — cf.
      // `CvIntakeProgress['unknown']` ci-dessus.
      if (error instanceof ApiError) {
        const message = error.message || t('intake.failed')
        setProgress({ phase: 'error', message })
        toast.error(message)
      } else {
        setProgress({ phase: 'unknown' })
        toast.error(t('intake.progress.unknown'))
      }
    }
  }

  /**
   * Le dépôt EN MASSE (#1116).
   *
   * Il rejoue le dépôt unitaire, fichier par fichier : mêmes refus, même
   * recherche de doublon, même création. Aucune seconde route d'ingestion,
   * donc aucun moyen que les deux divergent.
   *
   * Le doublon est SAUTÉ et nommé — poser trois mille questions n'est pas une
   * fonctionnalité, et écrire un doublon encore moins.
   */
  const runBatch = async (files: File[]) => {
    stopRef.current = false
    batchStartedAtRef.current = Date.now()
    setBatch({ done: 0, total: files.length, outcomes: [] })
    const outcomes = await runCvBatch(
      files,
      async (file): Promise<CvBatchOutcome> => {
        if (file.size > CV_UPLOAD_MAX_BYTES) return { file: file.name, status: 'too_big' }
        const result = await intake.mutateAsync({
          filename: file.name,
          fileB64: await readAsBase64(file),
          kind: 'candidate',
          createDespiteDuplicates: false,
        })
        return result.outcome === 'duplicates'
          ? {
              file: file.name,
              status: 'duplicate',
              // Le doublon est NOMMÉ — et une fiche sans nom le dit plutôt que
              // de rendre l'identifiant de son fichier (`talentName.ts`).
              matched: result.duplicates.map(match => talentNameText(match.fullName, t('name.unnamed'))),
            }
          : { file: file.name, status: 'created', consultantId: result.consultantId }
      },
      { onProgress: setBatch, shouldStop: () => stopRef.current },
    )
    setBatch({ done: outcomes.length, total: files.length, outcomes })
    const counts = summariseCvBatch(outcomes)
    if (counts.created > 0) toast.success(t('intake.batch.done', { count: counts.created }))
  }

  const summary = batch ? summariseCvBatch(batch.outcomes) : null
  const running = batch != null && batch.done < batch.total && !stopRef.current
  // #2183.43 — recalculé à CHAQUE progression (un fichier qui vient de finir),
  // jamais sur une horloge qui tourne toute seule : le lot n'a pas de raison
  // d'accélérer ou de ralentir entre deux fichiers, une extrapolation qui se
  // recalculerait chaque seconde ne ferait que trembler sans rien apprendre
  // de plus.
  const remainingMs =
    running && batch && batchStartedAtRef.current !== null
      ? estimateRemainingMs({
          startedAt: batchStartedAtRef.current,
          now: Date.now(),
          done: batch.done,
          total: batch.total,
        })
      : null
  const remaining = remainingMs !== null ? formatRemainingCv(remainingMs) : null
  // #2327.1 / #2327.17 — le dépôt SEUL, quand la cible est déjà connue, rejoint
  // directement cette fiche : ni le tiroir « ça ressemble à… » (le serveur ne
  // le pose jamais dans ce cas) ni le dépôt en masse (qui, lui, CRÉE toujours)
  // n'ont leur place ici.
  const singleFileResolution = attachToTalentId
    ? ({ kind: 'attach', talentId: attachToTalentId } as const)
    : ({ kind: 'none' } as const)

  return (
    <Card
      className={`mb-3 border-dashed p-4 ${dragging ? 'border-[var(--bellum-primary-500)]' : ''}`}
      onDragOver={event => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void submit(file, singleFileResolution)
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-[var(--bellum-text-muted)]" />
          <Text size="sm">{attachToTalentId ? t('intake.attachPrompt') : t('intake.prompt')}</Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={intake.isPending} onClick={() => inputRef.current?.click()}>
            {intake.isPending ? t('intake.working') : t('intake.choose')}
          </Button>
          {/* #4348.2 — repli du profil LinkedIn (décision Louis 19/10 : PDF ou texte
              collé d'abord, jamais de scraping). Le texte collé devient un
              fichier `.txt` et suit la MÊME route que le dépôt : mêmes refus,
              même recherche de doublon, aucune seconde ingestion. */}
          <Button variant="outline" size="sm" disabled={intake.isPending} onClick={() => setPasting(open => !open)}>
            {t('intake.paste.open')}
          </Button>
          {/* #1116 — « ça permet de ne pas rentrer 1 par 1 ». Sans objet quand
              la cible est déjà connue : ce geste CRÉE toujours une fiche. */}
          {attachToTalentId ? null : (
            <Button
              variant="outline"
              size="sm"
              icon={Layers}
              disabled={running}
              onClick={() => batchInputRef.current?.click()}
            >
              {t('intake.batch.choose')}
            </Button>
          )}
          {/* #2183.4 — « charger un dossier entier », pas fichier par fichier.
              `webkitdirectory` n'a pas d'équivalent standard : c'est
              l'attribut que Chrome, Firefox et Safari reconnaissent tous les
              trois pour un choix de DOSSIER plutôt que de fichiers. */}
          {attachToTalentId ? null : (
            <Button
              variant="outline"
              size="sm"
              icon={FolderUp}
              disabled={running}
              onClick={() => folderInputRef.current?.click()}
            >
              {t('intake.batch.chooseFolder')}
            </Button>
          )}
        </div>
        {attachToTalentId ? null : (
          <input
            ref={batchInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.rtf,.txt,.md,.png,.jpg,.jpeg,.webp"
            className="hidden"
            aria-label={t('intake.batch.choose')}
            onChange={event => {
              const files = Array.from(event.target.files ?? [])
              if (files.length > 0) void runBatch(files)
              event.target.value = ''
            }}
          />
        )}
        {attachToTalentId ? null : (
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // `webkitdirectory` ignore `accept` : le filtre se fait CÔTÉ
            // CLIENT, dans `filterCvBatchFiles` — un dossier réel porte des
            // `.DS_Store` et des fichiers qui ne sont pas des CV.
            // @ts-expect-error — attribut non standard, reconnu par tous les
            // navigateurs cibles, absent des types DOM.
            webkitdirectory=""
            directory=""
            className="hidden"
            aria-label={t('intake.batch.chooseFolder')}
            onChange={event => {
              const files = filterCvBatchFiles(Array.from(event.target.files ?? []))
              if (files.length > 0) void runBatch(files)
              event.target.value = ''
            }}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.doc,.rtf,.txt,.md,.png,.jpg,.jpeg,.webp"
          className="hidden"
          aria-label={t('intake.choose')}
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void submit(file, singleFileResolution)
            // Remis à zéro pour que redéposer le MÊME fichier redéclenche un
            // événement : sans ça, corriger puis réessayer ne fait rien.
            event.target.value = ''
          }}
        />
      </div>
      {pasting ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            aria-label={t('intake.paste.label')}
            className="min-h-32 w-full rounded-md border border-[var(--bellum-border)] bg-transparent p-2 text-sm"
            value={pastedText}
            onChange={event => setPastedText(event.target.value)}
          />
          <div>
            <Button
              size="sm"
              disabled={intake.isPending || pastedText.trim() === ''}
              onClick={() => {
                // #4348.2 — un fichier `.txt` : la route de dépôt le lit comme un CV texte.
                const file = new File([pastedText], 'profil-colle.txt', { type: 'text/plain' })
                void submit(file, singleFileResolution)
              }}
            >
              {t('intake.paste.submit')}
            </Button>
          </div>
        </div>
      ) : null}
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('intake.hint')}
      </Text>

      {/* #2542.1 — l'écran DIT où en est un dépôt SEUL (pas le lot, qui a déjà
          sa propre progression FACTUELLE plus bas). Jamais un pourcentage
          inventé : deux faits vérifiables (reçu, puis l'issue) et une attente
          nommée entre les deux — voir `CvIntakeProgress` pour le détail de ce
          que le client peut et ne peut pas savoir sur un aller-retour unique. */}
      {progress ? (
        <div
          className="mt-3 flex flex-col gap-1.5 rounded-md border border-[var(--bellum-border)] p-3"
          role={progress.phase === 'error' ? 'alert' : 'status'}
        >
          <div className="flex items-center gap-2">
            <Check className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
            <Text size="xs">{t('intake.progress.received')}</Text>
          </div>
          {progress.phase === 'processing' && (
            <div className="flex items-center gap-2">
              <Spinner size={14} className="shrink-0 text-[var(--bellum-text-muted)]" />
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('intake.progress.processing')}
              </Text>
            </div>
          )}
          {progress.phase === 'done' && (
            <div className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
              <Text size="xs">
                {t(progress.outcome === 'updated' ? 'intake.progress.updated' : 'intake.progress.created')}
              </Text>
            </div>
          )}
          {progress.phase === 'error' && (
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {progress.message}
            </Text>
          )}
          {progress.phase === 'unknown' && (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('intake.progress.unknown')}
            </Text>
          )}
        </div>
      ) : null}

      {/* #1116 — le lot sous les yeux : ce qui est fait, ce qui reste, et un
          bouton pour arrêter. Arrêter laisse ce qui est déjà créé — une
          annulation qui supprime des fiches serait la pire des surprises. */}
      {batch ? (
        <div className="mt-3 rounded-md border border-[var(--bellum-border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Text size="sm" weight="medium">
                {t('intake.batch.progress', { done: batch.done, total: batch.total })}
              </Text>
              {/* #2183.43 — un FAIT extrapolé sur ce qui vient d'être mesuré,
                  jamais dès le premier fichier (rien à extrapoler encore). */}
              {remaining ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t(`intake.batch.remaining${remaining.unit === 'seconds' ? 'Seconds' : 'Minutes'}`, {
                    count: remaining.count,
                  })}
                </Text>
              ) : null}
            </div>
            {running ? (
              <Button
                size="xs"
                variant="outline"
                icon={X}
                onClick={() => {
                  stopRef.current = true
                }}
              >
                {t('intake.batch.stop')}
              </Button>
            ) : (
              <Button size="xs" variant="ghost" onClick={() => setBatch(null)}>
                {t('intake.batch.close')}
              </Button>
            )}
          </div>
          {summary ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('intake.batch.summary', {
                created: summary.created,
                duplicate: summary.duplicate,
                failed: summary.failed + summary.too_big,
              })}
            </Text>
          ) : null}
          {/* Ce qui n'est PAS passé est NOMMÉ, fichier par fichier : un lot qui
              annonce « 2 847 créées » sans dire lesquelles manquent laisse
              chercher pendant des mois. */}
          {!running && batch.outcomes.some(outcome => outcome.status !== 'created') ? (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
              {batch.outcomes
                .filter(outcome => outcome.status !== 'created')
                .map(outcome => (
                  <li key={outcome.file}>
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {outcome.status === 'duplicate'
                        ? t('intake.batch.skippedDuplicate', {
                            file: outcome.file,
                            names: outcome.matched.join(', '),
                          })
                        : outcome.status === 'too_big'
                          ? t('intake.batch.skippedTooBig', { file: outcome.file })
                          : t('intake.batch.skippedFailed', { file: outcome.file, reason: outcome.reason })}
                    </Text>
                  </li>
                ))}
            </ul>
          ) : null}
          {/* Ce que le lot NE fait pas : lire les CV. Le dire ici évite de
              croire à une base remplie alors qu'elle est faite de fiches à un
              seul champ. */}
          <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {t('intake.batch.note')}
          </Text>
        </div>
      ) : null}

      {pending ? (
        <div className="mt-3 rounded-md border border-[var(--bellum-warning)] p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
            <div className="min-w-0">
              <Text size="sm" weight="medium">
                {t('intake.duplicate.title')}
              </Text>
              <ul className="mt-1 list-disc pl-5">
                {pending.duplicates.map(match => {
                  const name = talentNameText(match.fullName, t('name.unnamed'))
                  return (
                    <li key={match.talentId}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Text size="sm">
                          {t('intake.duplicate.line', {
                            name,
                            reason: t(`intake.duplicate.reasons.${match.reason}`),
                          })}
                        </Text>
                        {/* #2327.17 — plusieurs CV d'une même personne : on garde
                            les versions, on ne crée pas une seconde personne. */}
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={intake.isPending}
                          onClick={() => void submit(pending.file, { kind: 'attach', talentId: match.talentId })}
                        >
                          {t('intake.duplicate.attach', { name })}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* « Ce n'est pas la même personne » est une AFFIRMATION : elle doit
                venir de quelqu'un, jamais d'un défaut. */}
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                void submit(pending.file, {
                  kind: 'create',
                  dismissed: pending.duplicates.map(match => match.talentId),
                })
              }
            >
              {t('intake.duplicate.createAnyway')}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setPending(null)}>
              {t('intake.duplicate.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

/** Le fichier → base64, sans le préfixe `data:` que le lecteur ajoute. */
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
