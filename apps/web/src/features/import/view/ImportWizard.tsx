import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Box, Button, Card, SelectField, Text, cn } from '@bellum/ui'
import {
  extensionMatchesFileSignature,
  IMPORT_CONTENT_MAX_CHARS,
  IMPORT_CONTENT_MAX_MB,
  IMPORT_FILE_ACCEPT,
  wizardImportBreakdown,
  type DryRunReport,
  type ImportMapping,
  type ImportStep,
  type ImportObject,
  type ImportSourceDetection,
  type MappingConfidence,
} from '@bellum/contracts'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  Circle,
  Download,
  FileUp,
  Play,
  RotateCcw,
  Sparkles,
  Users,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { OperationStatusBadge } from '@/components/operations/OperationStatusBadge'
import { importOperationStatus, importReadableByLaura, importStage } from '@/lib/operation-status'
import { AskLaura } from '@/components/primitives/AskLaura'
import { toast } from 'sonner'
import { ImportFamilyReport } from '@/features/universal-import/view/ImportFamilyReport'
import { CONTEXT_PACK_ANCHOR } from '@/features/universal-import/view/ContextPackDropzone'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { toCsv } from '@/lib/csv'
import { RestitutionPanel } from '@/features/restitution/view/RestitutionPanel'
import { useRecordContactResolutionCorrection } from '@/features/contacts/hooks/useContactResolutionCorrections'
import { decodeFile } from '../lib/decode-file'
import { importTemplateCsv } from '../lib/import-template'
import { importedObjectQueryPrefixes } from '../lib/imported-object-queries'
import { importStepStatuses } from '../model/steps'
import { SOURCE_FAMILIES, UNLOCKED_BY_FAMILY, familyOfSource } from '../model/unlocked'
import { formatDateTime } from '@/lib/locale'
import { importApi, useImportSessions, useImportSources, type ImportSession, type ImportSourceCard } from '../api'
import { trackDataImported } from '@/lib/product-tracker'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/** #2085.12 — le motif de route de CET écran (catalogue : `product-screens-catalog.ts`). */
const IMPORT_SCREEN = '/settings/import'

/** Au plus quatre puces par carte — au-delà, deux cartes ne se comparent plus. */
const IMPORT_CHIPS_MAX = 4

/**
 * Une icône par FAMILLE. Treize pictogrammes auraient été de la décoration ;
 * trois répètent l'intention sous laquelle la carte est rangée, ce qui est la
 * seule chose qu'une icône sait dire à cette taille.
 */
const FAMILY_ICONS: Record<string, typeof Boxes> = {
  legacyTool: Boxes,
  talent: Users,
  business: Sparkles,
}

/**
 * L'assistant d'import en sept étapes (PDF 7 §7.4, BEL-INT-602).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN IMPOSE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * On ne peut pas cliquer « Importer » sans avoir simulé. Ce n'est pas une
 * discipline d'interface : le serveur REFUSE, et l'écran ne fait que rendre le
 * refus lisible avant le clic. Le chiffre qui justifie tout le §7 tient en une
 * ligne — nettoyer après coûte 3 à 10 fois plus cher que nettoyer avant.
 *
 * Le rapport montre trois chiffres que personne n'aime lire et qu'il faut lire :
 * combien de valeurs seraient ÉCRASÉES, combien de lignes sont écartées et
 * pourquoi, et combien de contacts arriveraient sans base légale.
 *
 * Le fichier n'est pas conservé entre les étapes — il reste en mémoire du
 * navigateur. Un CSV de prospection contient des données personnelles qu'on n'a
 * aucune raison de garder sur nos serveurs après l'import.
 */

/**
 * #2078.31 — télécharge le gabarit d'une source, AVANT même de choisir un
 * fichier : « quelles colonnes, avec quel exemple » se décide au moment de
 * préparer l'export, pas après l'avoir déjà déposé.
 */
function downloadTemplate(sourceKey: string, fields: readonly string[]): void {
  const blob = new Blob([importTemplateCsv(fields)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${sourceKey}-modele.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Range les sources dans leurs familles, en gardant l'ORDRE du serveur à
 * l'intérieur de chacune.
 *
 * Une famille vide n'est pas rendue — un intertitre sans carte dessous se lit
 * comme un chargement en panne. Et toute source absente de la table rejoint la
 * dernière famille plutôt que de disparaître : c'est ce qui rend l'ajout d'une
 * source côté serveur sans risque pour cet écran.
 */
function groupSourcesByFamily<T extends { key: string }>(cards: T[]): { key: string; cards: T[] }[] {
  const placed = new Set(SOURCE_FAMILIES.flatMap(family => family.sources))
  const last = SOURCE_FAMILIES[SOURCE_FAMILIES.length - 1]?.key
  return SOURCE_FAMILIES.map(family => ({
    key: family.key,
    cards: cards.filter(card => family.sources.includes(card.key) || (family.key === last && !placed.has(card.key))),
  })).filter(family => family.cards.length > 0)
}

export function ImportWizard() {
  const { t } = useTranslation('importWizard')
  // `isLoading` et `isError` sont LUS, pas ignorés.
  //
  // Trouvé en recette live le 21/08 : l'écran rendait sa phrase d'introduction et
  // RIEN d'autre quand `/import/sources` échouait. Un écran vide et muet se lit
  // « il n'y a aucune source », pas « je n'ai pas pu regarder » — c'est le défaut
  // exact que ce chantier combat, et il s'était glissé dans l'écran qui le
  // corrige. Même famille que `isError` non distingué du vide, relevé en recette
  // CRM.
  const { data: sources, isLoading: sourcesLoading, isError: sourcesFailed } = useImportSources()
  // #1452.3 — `isLoading` et `isError` sont LUS. « Aucun import » et « je n'ai
  // pas pu regarder » sont deux écrans différents, et le second se lisait comme
  // le premier : le bloc disparaissait entièrement, sans un mot.
  const { data: sessions, refetch, isLoading: sessionsLoading, isError: sessionsFailed } = useImportSessions()

  // #2080 — ce que l'écriture vient de produire, pour la restitution qui suit.
  // `null` : rien à montrer, l'écran normal reste seul. Jamais peuplé tant que
  // l'utilisateur n'a pas cliqué « Importer » — #2080.13, rien ne se génère
  // tout seul.
  const [restitution, setRestitution] = useState<{ created: number; updated: number } | null>(null)
  const [source, setSource] = useState<ImportSourceCard | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  // #3753 — « créer une liste cible » avec les comptes du fichier (tier, raison,
  // problématiques). Décoché par défaut : rien ne se crée sans le geste. Le nom
  // vaut `null` tant que le geste n'a pas été fait.
  const [targetListName, setTargetListName] = useState<string | null>(null)
  // #2159.35 — l'objet RÉELLEMENT ciblé par CETTE session (`ImportSession.object_type`,
  // posé par le serveur), pas déduit de `source.objects[0]` : un même
  // catalogue peut décrire plusieurs objets, la session en cible UN SEUL.
  // Sert uniquement à savoir si le geste « ce n'est pas la même personne »
  // (#2159.35, contacts) a un sens sur CETTE session.
  const [objectType, setObjectType] = useState<ImportObject | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [encoding, setEncoding] = useState<string | null>(null)
  /** Le refus DIT du fichier déposé — un poids, aujourd'hui. Voir `onFile`. */
  const [fileError, setFileError] = useState<string | null>(null)
  // Le séparateur détecté par le serveur, annoncé à côté de l'encodage : les
  // deux répondent à la même question, « est-ce que Bellum a bien lu mon
  // fichier ? », et l'un des deux manquait.
  const [delimiter, setDelimiter] = useState<string | null>(null)
  const [report, setReport] = useState<DryRunReport | null>(null)
  /**
   * `report` porte-t-il le résultat d'une ÉCRITURE, ou seulement d'une simulation ?
   *
   * La distinction compte pour un seul champ : `report.errors`. Une simulation
   * n'écrit rien, donc rien ne peut y avoir échoué — mais ce n'est pas la même
   * chose que « zéro erreur, mesuré ». Tant que l'import n'a pas été exécuté,
   * le nombre d'erreurs n'est PAS mesuré : « non mesuré n'est jamais 0 ».
   * `ReportPanel` lit ce drapeau pour ne jamais afficher un zéro qui n'en est pas un.
   */
  const [reportWritten, setReportWritten] = useState(false)
  // #4051 — ce que l'ÉCRITURE a posé, pour le bilan par famille (ignoré tant que `reportWritten` est faux).
  const [writtenCounts, setWrittenCounts] = useState<{ created: number; updated: number } | null>(null)
  const [busy, setBusy] = useState<'simulate' | 'apply' | null>(null)
  /**
   * Les étapes 2 et 3 — « Reconnaître » et « Corriger ».
   *
   * `proposedMapping` était renvoyé par le serveur depuis le premier jour et
   * JETÉ ici : l'écran destructurait `{ report, delimiter }` et laissait tomber
   * le troisième champ. Tout le reste du chemin existait — `simulate()` accepte
   * un mapping et le fait GAGNER sur la proposition automatique, et l'écriture
   * rejoue le mapping SIMULÉ.
   *
   * `headers` est figé au premier rapport : c'est la liste des colonnes du
   * fichier, et elle ne doit pas se réordonner à chaque correction — sinon la
   * ligne qu'on vient de régler saute ailleurs sous le curseur.
   */
  const [mapping, setMapping] = useState<ImportMapping | null>(null)
  const [headers, setHeaders] = useState<string[] | null>(null)
  /**
   * #2159.11/.13 — ce que les en-têtes du fichier laissent deviner de sa
   * provenance, `null` tant qu'aucune simulation n'a encore lu de fichier.
   */
  const [detectedSource, setDetectedSource] = useState<ImportSourceDetection | null>(null)
  /** #2159.17 et suivants — la confiance de chaque colonne RATTACHÉE. */
  const [columnConfidence, setColumnConfidence] = useState<Record<string, MappingConfidence>>({})
  /** Les colonnes ignorées pour lesquelles une correspondance approchante existe. */
  const [mappingSuggestions, setMappingSuggestions] = useState<
    Record<string, { field: string; confidence: 'medium' | 'low' }>
  >({})
  /**
   * La session interrompue qu'on est en train de REPRENDRE.
   *
   * Elle n'est pas déduite de `sessionId` : l'écran doit continuer à afficher où
   * l'import s'était arrêté pendant qu'on redépose le fichier, et la liste
   * d'historique se recharge sous les pieds.
   */
  const [resuming, setResuming] = useState<ImportSession | null>(null)
  /**
   * Le choix humain, quand la dernière ligne est partie sans réponse.
   *
   * `null` tant que personne n'a tranché — et le bouton « Importer » reste
   * indisponible. C'est la seule chose que la reprise automatique ne fait PAS :
   * « un timeout n'est pas un échec », `unknown` ARRÊTE la reprise.
   */
  const [uncertainChoice, setUncertainChoice] = useState<'rewrite' | 'skip' | null>(null)

  const choose = async (card: ImportSourceCard) => {
    setSource(card)
    setReport(null)
    setReportWritten(false)
    setContent(null)
    setFileError(null)
    setMapping(null)
    setHeaders(null)
    setDetectedSource(null)
    setColumnConfidence({})
    setMappingSuggestions({})
    setResuming(null)
    setUncertainChoice(null)
    try {
      const session = await importApi.create(card.key)
      setSessionId(session.id)
      setObjectType(session.object_type)
    } catch {
      toast.error(t('sessionError'))
    }
  }

  /**
   * Reprendre un import interrompu — on rouvre SA session, jamais une nouvelle.
   *
   * Une nouvelle session ne connaîtrait ni le point d'arrêt ni l'empreinte du
   * fichier : elle réécrirait les 4 000 premières lignes. La déduplication de
   * reprise vaut (session + numéro de ligne), et le numéro de ligne n'a de sens
   * que dans SA session.
   */
  const resume = (session: ImportSession) => {
    const card = (sources ?? []).find(entry => entry.key === session.source) ?? null
    setSource(card)
    setSessionId(session.id)
    setObjectType(session.object_type)
    setResuming(session)
    setUncertainChoice(null)
    setReport(null)
    setReportWritten(false)
    setContent(null)
    setMapping(null)
    setHeaders(null)
    setDetectedSource(null)
    setColumnConfidence({})
    setMappingSuggestions({})
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    // #2159.8/#2159.9/#2159.13 — le sélecteur de fichier REFUSE déjà le XLSX au
    // clic (`accept=".csv,.txt,.tsv"`), mais un glisser-déposer l'ignore : c'est
    // le seul chemin qui atteint encore `onFile` avec un classeur Excel ou une
    // archive ZIP. Sans ce contrôle, `decodeFile` les décode quand même en
    // Windows-1252 — des octets devenus charabia, lus ensuite comme un CSV sans
    // aucune colonne reconnue. La SIGNATURE décide, jamais l'extension déclarée
    // (`extensionMatchesFileSignature`, #2438.7, déjà utilisée pour les pièces
    // jointes) : docx/xlsx/zip partagent le même conteneur ZIP, impossible à
    // distinguer sans lire la table centrale — donc un seul message pour les deux.
    if (extensionMatchesFileSignature('xlsx', new Uint8Array(await file.arrayBuffer()))) {
      setFileError(t('fileLooksLikeBinary'))
      setContent(null)
      setEncoding(null)
      setReport(null)
      setReportWritten(false)
      setMapping(null)
      setHeaders(null)
      setDetectedSource(null)
      setColumnConfidence({})
      setMappingSuggestions({})
      return
    }
    // On DIT comment le fichier a été lu. « Ton fichier utilise l'encodage
    // Windows-1252, je m'adapte » évite l'aller-retour au support qu'un
    // « SociÃ©tÃ© » à l'écran déclenche toujours.
    const decoded = await decodeFile(file)
    // Le plafond est DIT ici, avant l'envoi. Au-delà, la requête finissait en
    // 413 — un code sans corps JSON, donc sans phrase à afficher : l'écran
    // restait muet sur la seule chose qui expliquait l'échec (retour du 14/08).
    // On mesure le TEXTE DÉCODÉ, pas les octets du fichier : c'est lui qui
    // part, et un CSV en Windows-1252 pèse plus en octets qu'en caractères.
    if (decoded.text.length > IMPORT_CONTENT_MAX_CHARS) {
      setFileError(t('fileTooLarge', { max: IMPORT_CONTENT_MAX_MB }))
      setContent(null)
      setEncoding(null)
      setReport(null)
      setReportWritten(false)
      setMapping(null)
      setHeaders(null)
      setDetectedSource(null)
      setColumnConfidence({})
      setMappingSuggestions({})
      return
    }
    setFileError(null)
    setContent(decoded.text)
    setEncoding(decoded.encoding)
    setReport(null)
    setReportWritten(false)
    // Un autre fichier, d'autres en-têtes : la correspondance précédente ne
    // décrit plus rien. La garder rattacherait des colonnes qui n'existent plus.
    setMapping(null)
    setHeaders(null)
    setDetectedSource(null)
    setColumnConfidence({})
    setMappingSuggestions({})
  }

  const simulate = async () => {
    if (!sessionId || !content) return
    setBusy('simulate')
    try {
      // `mapping ?? undefined` : au premier passage on ne dicte rien, le serveur
      // propose. Ensuite c'est la correction de l'utilisateur qui part — et le
      // service la fait gagner sur sa propre proposition.
      const simulation = await importApi.dryRun(sessionId, content, mapping ?? undefined)
      setReport(simulation.report)
      // Une simulation, jamais une écriture : `report.errors` reste NON MESURÉ,
      // pas « zéro ». Voir `reportWritten` plus haut.
      setReportWritten(false)
      setDelimiter(simulation.delimiter)
      setDetectedSource(simulation.detectedSource ?? null)
      setColumnConfidence(simulation.columnConfidence ?? {})
      setMappingSuggestions(simulation.mappingSuggestions ?? {})
      // La proposition n'est adoptée qu'une fois : au second passage,
      // l'utilisateur a corrigé, et le serveur renvoie tout de même SA
      // proposition automatique. L'écraser effacerait la correction.
      if (!mapping) {
        setMapping(simulation.proposedMapping)
        setHeaders([...Object.keys(simulation.proposedMapping.columns), ...simulation.proposedMapping.ignored])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('simulateError'))
    } finally {
      setBusy(null)
    }
  }

  /**
   * Rattacher une colonne, ou la détacher (`field` vide).
   *
   * ⚠️ Toute correction INVALIDE le rapport. Le serveur écrit avec le mapping
   * qui a été SIMULÉ : laisser « Importer » cliquable après une correction non
   * simulée écrirait l'ancienne correspondance en affichant la nouvelle — et le
   * rapport, qui est précisément ce qui autorise l'écriture, serait faux.
   */
  const remap = (column: string, field: string) => {
    setMapping(current => {
      if (!current) return current
      const columns = { ...current.columns }
      const ignored = current.ignored.filter(name => name !== column)
      if (field) columns[column] = field
      else {
        delete columns[column]
        ignored.push(column)
      }
      return { ...current, columns, ignored }
    })
    setReport(null)
    setReportWritten(false)
  }

  const queryClient = useQueryClient()
  /**
   * L'annulation d'un import déjà écrit.
   *
   * Le retour n'est pas un booléen : ce qui a été LAISSÉ compte autant que ce
   * qui a été annulé. Un objet corrigé à la main après l'import n'est jamais
   * touché — le taire ferait croire à une annulation complète.
   */
  const rollback = useMutation({
    mutationFn: (id: string) => importApi.rollback(id),
    onSuccess: outcome => {
      void queryClient.invalidateQueries({ queryKey: ['import', 'sessions'] })
      if (outcome.windowClosed) {
        toast.warning(t('rollback.windowClosed'))
        return
      }
      toast.success(
        t('rollback.done', {
          reverted: outcome.reverted,
          archived: outcome.archived,
          kept: outcome.keptTouched + outcome.leftInPlace,
        }),
      )
    },
    onError: (error: Error) => toast.error(error.message || t('rollback.error')),
  })

  /**
   * La ligne incertaine, quand il y en a une.
   *
   * `failed_at_row` est un INDEX ; l'écran parle en numéros de ligne. Les deux
   * ne se mélangent pas — dire « ligne 4 000 » pour l'index 4 000 ferait
   * chercher au mauvais endroit dans le tableur.
   */
  const uncertainRow = resuming?.resume_outcome === 'unknown' ? resuming.failed_at_row : null
  const resumeFromChoice =
    uncertainRow === null || uncertainChoice === null
      ? undefined
      : uncertainChoice === 'rewrite'
        ? uncertainRow
        : uncertainRow + 1

  const apply = async () => {
    if (!sessionId || !content || !source) return
    setBusy('apply')
    try {
      // Les objets DÉJÀ présents : sans eux, le serveur refuse un import de
      // contacts sans comptes. C'est l'ordre imposé du §7.3, et il vaut mieux
      // qu'il refuse que d'exécuter à moitié.
      const available: ImportObject[] = ['account']
      const listName = objectType === 'account' ? (targetListName?.trim() ?? '') : ''
      const outcome = await importApi.apply(
        sessionId,
        content,
        available,
        resumeFromChoice,
        listName ? { name: listName } : undefined,
      )
      // Le rapport RETENU devient celui de l'ÉCRITURE, pas celui d'avant : c'est
      // là qu'apparaît `errors`, et `reportWritten` ne passe à VRAI que si une
      // écriture a réellement été TENTÉE — un objet non écrivable (`written:
      // false`) n'a rien tenté, et son compte d'erreurs reste NON MESURÉ.
      setReport(outcome.report)
      setReportWritten(outcome.written)
      setWrittenCounts(outcome.written ? { created: outcome.created, updated: outcome.updated } : null)
      // #2085.12 — « import » : une ÉCRITURE réelle, jamais une simulation
      // (`outcome.written`, pas `report`) — même distinction que le commentaire
      // au-dessus.
      if (outcome.written) trackDataImported(IMPORT_SCREEN)
      // #2080 — la restitution lit ce que l'ÉCRITURE a produit, jamais ce que
      // la simulation avait annoncé : `created`/`updated` viennent de
      // `outcome`, pas de `report`.
      setRestitution(outcome.written ? { created: outcome.created, updated: outcome.updated } : null)
      // #2958.106 — les listes qui montrent l'objet écrit sont relues : un
      // annuaire ouvert avant l'import ne reste pas vide après.
      if (outcome.written) {
        for (const queryKey of importedObjectQueryPrefixes(objectType)) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }
      if (!outcome.written) toast.info(outcome.reason ?? t('notWritten'))
      // L'import s'est ARRÊTÉ en route. Ce n'est ni un succès ni une erreur
      // muette : les lignes déjà écrites sont en base, et le dire est la moitié
      // de la réponse. Le taire renverrait quelqu'un tout relancer, donc
      // doublonner sa base.
      else if (outcome.stopped) {
        toast.warning(
          t(outcome.stopped.outcome === 'unknown' ? 'stopped.unknown' : 'stopped.failed', {
            line: outcome.stopped.atRow + 1,
            total: outcome.stopped.totalRows,
            created: outcome.created,
            updated: outcome.updated,
          }),
          { duration: 12_000 },
        )
      }
      // Une ligne ABANDONNÉE lors d'une reprise précédente : partie sans
      // réponse, sautée sur décision de l'utilisateur. Elle est en `errors`, et
      // le TAIRE ici referait exactement le défaut que ce seau corrige.
      else if (outcome.report.errors.length > 0) {
        toast.warning(
          t('appliedWithErrors', {
            created: outcome.created,
            updated: outcome.updated,
            errors: outcome.report.errors.length,
          }),
          { duration: 12_000 },
        )
      }
      // Ce qui a été ÉCARTÉ se dit aussi. « 0 créé » sans un mot se lit comme une
      // panne — mesuré en recette live : quatre lignes déposées, « 0 créé », et
      // rien pour dire que les sociétés étaient inconnues.
      else if (outcome.skippedUnknownCompany > 0) {
        toast.warning(
          t('appliedWithSkips', {
            created: outcome.created,
            updated: outcome.updated,
            skipped: outcome.skippedUnknownCompany,
          }),
        )
      } else toast.success(t('applied', { created: outcome.created, updated: outcome.updated }))
      // #3753 — la liste cible se DIT : combien de comptes, combien rattachés à un
      // compte déjà là (un lien, jamais une fusion), et les quasi-doublons à
      // vérifier. Aucune analyse n'est lancée — la phrase le promet, le serveur le tient.
      if (outcome.written && outcome.targetList) {
        toast.info(
          t('targetListCreated', {
            name: outcome.targetList.name,
            added: outcome.targetList.added,
            existing: outcome.targetList.attachedToExisting,
          }),
          { duration: 12_000 },
        )
        if (outcome.targetList.nearDuplicates.length > 0) {
          toast.warning(t('targetListNearDuplicates', { count: outcome.targetList.nearDuplicates.length }), {
            duration: 12_000,
          })
        }
      }
      setResuming(null)
      setUncertainChoice(null)
      void refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('applyError'))
    } finally {
      setBusy(null)
    }
  }

  const blocked =
    (report?.missingRequiredColumns.length ?? 0) > 0 ||
    // Tant qu'un humain n'a pas tranché sur la ligne incertaine, il n'y a rien
    // à écrire : le serveur refuse de toute façon, et le bouton ne ment pas.
    (uncertainRow !== null && uncertainChoice === null)

  return (
    <Box {...guideAnchorProps('import.assistant')} className="space-y-4">
      {/* #1449 — CE QUE CETTE PAGE PROMET, avant de montrer treize formats.
          L'écran s'ouvrait sur une phrase grise puis la grille : il fallait
          deviner soi-même à quoi sert un import et en quoi il diffère d'une
          connexion. */}
      <Box className="flex flex-col gap-2">
        <Box className="flex flex-wrap items-start justify-between gap-2">
          <Box className="flex flex-col gap-1">
            {/* #2456 — `element="h1"` : le titre était déjà visible, mais rendu
                en `<p>`. Seule la balise change. */}
            <Text element="h2" size="lg" weight="semibold">
              {t('hero.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('hero.subtitle')}
            </Text>
          </Box>
          {/* #1452 — le copilote guide le choix du format ; il ne valide jamais
              l'import à la place de l'utilisateur. C'est un lien vers la
              conversation, pas un chemin d'écriture. */}
          <AskLaura question={t('hero.askLaura')} label={t('hero.askLauraLabel')} />
        </Box>

        {/* La distinction que le retour demande, en une ligne : ce n'est pas la
            même chose de SYNCHRONISER et de REPRENDRE. */}
        <Box className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--bellum-border)] px-3 py-2">
          <Text size="xs" weight="medium">
            {t('hero.importIs')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('hero.connectionIs')}
          </Text>
          <Link
            to="/integrations"
            className="ml-auto inline-flex min-h-11 items-center text-xs font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('hero.seeIntegrations')}
          </Link>
        </Box>
      </Box>

      {/* #2080 — ce que l'écriture vient de produire. Placé AVANT la règle qui
          rassure et le rail d'étapes : c'est la première chose à lire une fois
          qu'un import a écrit quelque chose de réel. */}
      {restitution ? (
        <RestitutionPanel
          counts={restitution}
          sessionId={sessionId}
          objectType={objectType}
          onDismiss={() => setRestitution(null)}
        />
      ) : null}

      {/* La règle qui rassure vraiment, sortie du gris : rien n'est écrit avant
          la simulation validée. */}
      {/* Une fois la source choisie, la règle vit au pied du dépôt (c4) : jamais deux fois à l'écran. */}
      {source && sessionId ? null : (
        <Text size="sm" weight="medium">
          {t('intro')}
        </Text>
      )}

      {/* #1451.3 — les sept étapes du §7.4. `IMPORT_STEPS` était déclaré au
          contrat et n'avait aucun consommateur : l'écran enchaînait les gestes
          sans jamais dire où on en était ni ce qui restait. */}
      <StepRail
        progress={{
          sourceChosen: Boolean(source && sessionId),
          fileLoaded: Boolean(content),
          columnsRecognised: Boolean(mapping),
          simulated: Boolean(report),
          written: reportWritten,
        }}
      />

      {sourcesFailed ? (
        <Text size="sm" className="text-[var(--danger-soft-text)]">
          {t('sourcesUnavailable')}
        </Text>
      ) : null}
      {sourcesLoading ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('sourcesLoading')}
        </Text>
      ) : null}

      {/* Étape 1 — choisir la source, RANGÉE PAR INTENTION (#1449). Chaque carte
          dit ce qu'elle N'IMPORTE PAS : quelqu'un qui croit importer ses pièces
          jointes ne doit pas le découvrir trois semaines plus tard. */}
      {groupSourcesByFamily(sources ?? []).map(family => (
        <Box key={family.key} className="space-y-2">
          <Text size="sm" weight="semibold">
            {t(`families.${family.key}`)}
          </Text>
          <Box display="grid" className="grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {family.cards.map(card => {
              const FamilyIcon = FAMILY_ICONS[family.key] ?? Boxes
              return (
                <Card
                  key={card.key}
                  className={source?.key === card.key ? 'border-[var(--bellum-primary-400)]' : undefined}
                >
                  <Box className="space-y-2 p-3">
                    <Box display="flex" className="items-start gap-3">
                      {/* #1450 — l'icône de la FAMILLE, pas une par source. Treize
                        pictogrammes différents auraient été décoratifs ; trois
                        disent quelque chose, parce qu'ils répètent l'intention
                        sous laquelle la carte est rangée. */}
                      <Box className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-surface-2)]">
                        <FamilyIcon className="size-5 text-[var(--bellum-text-secondary)]" aria-hidden />
                      </Box>
                      <Box className="min-w-0 flex-1">
                        <Box display="flex" className="flex-wrap items-center gap-2">
                          <Text size="base" weight="semibold">
                            {t(`sources.${card.key}`, { defaultValue: card.key })}
                          </Text>
                          <Badge variant="outline" className="text-xs">
                            {card.format.toUpperCase()}
                          </Badge>
                          {/* Le format n'est pas encore lu : le DIRE ici, et pas au moment
                    où le sélecteur de fichier refuse le fichier sans un mot. */}
                          {/* import-contexte Je.6 — ce format n'est toujours pas lu PAR CET ASSISTANT : plus de
                              « Bientôt disponible », la carte renvoie vers la zone de dépôt en tête de page, qui le lit. */}
                          {card.readable ? null : (
                            <a
                              href={`#${CONTEXT_PACK_ANCHOR}`}
                              className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--warning-soft-text)] underline underline-offset-2"
                            >
                              {t('formatToDropzone')}
                            </a>
                          )}
                        </Box>
                        {/* Le BÉNÉFICE en une phrase — #1450. « Récupère tes
                          comptes, contacts, affaires et notes » se lit ; une
                          énumération de champs se subit. */}
                        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
                          {t(`benefit.${card.key}`, { defaultValue: t(`benefitByFamily.${family.key}`) })}
                        </Text>
                      </Box>
                    </Box>
                    {/* #1450 — ce qui est importé passe en CHIPS. La liste vient du
                      serveur ; on en montre quatre au plus et on compte le reste,
                      parce qu'une carte à onze puces ne se compare plus à sa
                      voisine. Rien n'est perdu : le compte le dit. */}
                    <Box display="flex" className="flex-wrap items-center gap-1">
                      {card.imports.slice(0, IMPORT_CHIPS_MAX).map(entry => (
                        <Badge key={entry} variant="secondary" className="text-xs font-normal">
                          {entry}
                        </Badge>
                      ))}
                      {card.imports.length > IMPORT_CHIPS_MAX ? (
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {t('moreImports', { count: card.imports.length - IMPORT_CHIPS_MAX })}
                        </Text>
                      ) : null}
                    </Box>
                    {card.skips.length > 0 ? (
                      <Text size="xs" color="text-[var(--text-ghost)]">
                        {t('wontImport', { list: card.skips.join(', ') })}
                      </Text>
                    ) : null}
                    <Text size="xs" color="text-[var(--text-ghost)]">
                      {card.howTo}
                    </Text>
                    {card.readable ? null : (
                      <Text size="xs" color="text-[var(--warning-soft-text)]">
                        {t('formatNotReadableHelp')}
                      </Text>
                    )}
                    {/* #2078.31 — les colonnes NÉCESSAIRES, dites AVANT de
                        choisir la source : c'est le moment où ça sert, pas
                        après avoir déjà déposé le fichier. `card.required`
                        existait déjà côté serveur (étape 3, correction du
                        mapping) et n'atteignait pas cet écran-ci. */}
                    {card.required.length > 0 ? (
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {t('requiredColumns', { list: card.required.join(', ') })}
                      </Text>
                    ) : null}
                    {/* Le MODÈLE téléchargeable — un en-tête et une ligne
                        d'EXEMPLE, jamais une donnée réelle (import-template.ts). */}
                    {/* #4067.9 (R47) — les deux gestes de la carte vivent dans UN conteneur : 12 px entre
                        eux et 44 px de haut chacun (ils se touchaient, x 460/461, au pouce). */}
                    <Box className="flex flex-col items-start gap-3 pt-1">
                      {card.readable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Download}
                          className="-mx-2 min-h-11 w-fit"
                          onClick={() => downloadTemplate(card.key, card.fields)}
                        >
                          {t('downloadTemplate')}
                        </Button>
                      ) : null}
                      {/* #1451.1 — le bouton suit le badge. Il restait ACTIF sous
                  « format pas encore lu » : le clic ouvrait un sélecteur en
                  `accept=".csv,.txt,.tsv"`, et le navigateur refusait le XLSX
                  sans un mot. Un badge qui dit non à côté d'un bouton qui dit
                  oui, c'est le bouton qu'on croit.
                  Le `title` porte la RAISON sur le bouton lui-même : un bouton
                  éteint sans explication au survol se lit « c'est cassé ». */}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="min-h-11"
                        disabled={!card.readable}
                        title={card.readable ? undefined : t('chooseSourceDisabled')}
                        onClick={() => void choose(card)}
                      >
                        {t('chooseSource')}
                      </Button>
                    </Box>
                  </Box>
                </Card>
              )
            })}
          </Box>
        </Box>
      ))}

      {/* import-contexte Je.5 — la source qui manquait : la grille go/no-go. Elle ne passe pas par cet assistant
          (ce n'est ni un compte ni un contact) — la carte renvoie vers la zone de dépôt et vers l'écran de la grille. */}
      <Card data-testid="import-source-qualification-grid">
        <Box className="space-y-2 p-3">
          <Box display="flex" className="flex-wrap items-center gap-2">
            <Text size="base" weight="semibold">
              {t('qualificationGridSource.title')}
            </Text>
            <Badge variant="outline" className="text-xs">
              XLSX · CSV
            </Badge>
          </Box>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('qualificationGridSource.benefit')}
          </Text>
          <Box display="flex" className="flex-wrap items-center gap-x-4">
            <a
              href={`#${CONTEXT_PACK_ANCHOR}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
            >
              {t('formatToDropzone')}
            </a>
            <Link
              to="/settings/workspace-rules"
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
            >
              {t('qualificationGridSource.open')}
            </Link>
          </Box>
        </Box>
      </Card>

      {/* Refonte Théo — `b/c4-assistant-import` : une fois la source choisie, le travail se lit en boîtes
          titrées (`.v13-box`), dans l'ordre — le fichier, les champs dès qu'ils sont reconnus, puis la
          vérification. Chaque geste et chaque message d'avant reste, à sa place. */}
      {source && sessionId ? (
        <>
          <Card data-theo-block="import-file" className="rounded-card">
            <Box className="space-y-3 p-4 md:p-5">
              <Box>
                <Text element="h2" size="base" weight="semibold">
                  {t('theoBoxes.file.title')}
                </Text>
              </Box>
              {/* La reprise — ce qu'on sait de l'import interrompu, AVANT de
                redemander le fichier. */}
              {resuming ? (
                <ResumePanel session={resuming} choice={uncertainChoice} onChoice={setUncertainChoice} />
              ) : null}

              {/* Étape 2 — déposer, avec le message NOMMÉ sur ce qu'on a compris. */}
              <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-6 text-center">
                <FileUp className="size-5 text-[var(--bellum-text-secondary)]" aria-hidden />
                <Text size="sm" weight="medium">
                  {t('dropFile')}
                </Text>
                <input
                  type="file"
                  accept={IMPORT_FILE_ACCEPT}
                  className="text-xs"
                  onChange={event => void onFile(event.target.files?.[0])}
                />
              </label>
              {fileError ? (
                <Text size="xs" color="text-[var(--danger-soft-text)]" role="alert">
                  {fileError}
                </Text>
              ) : null}
              {encoding ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t(`encodingRead.${encoding}`, { defaultValue: encoding })}
                </Text>
              ) : null}
              {delimiter ? (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('delimiterRead', { delimiter })}
                </Text>
              ) : null}

              {detectedSource ? <DetectedSourceBanner detection={detectedSource} chosenSourceKey={source.key} /> : null}

              {/* c4 — la promesse, au pied du dépôt : rien n'est écrit avant la validation. */}
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('intro')}
              </Text>
            </Box>
          </Card>
          {mapping && headers ? (
            <Card data-theo-block="import-columns" className="rounded-card">
              <Box className="space-y-3 p-4 md:p-5">
                <Box>
                  <Text element="h2" size="base" weight="semibold">
                    {t('theoBoxes.columns.title')}
                  </Text>
                  <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                    {t('theoBoxes.columns.hint')}
                  </Text>
                </Box>
                {/* Étapes 2 et 3 — RECONNAÎTRE, puis CORRIGER. Elles n'apparaissent
                qu'après la première simulation : c'est le serveur qui reconnaît
                les colonnes, et refaire cette dérivation côté navigateur
                donnerait deux réponses qui divergeraient. */}
                <MappingPanel
                  headers={headers}
                  mapping={mapping}
                  fields={source.fields}
                  required={source.required}
                  stale={!report}
                  onChange={remap}
                  columnConfidence={columnConfidence}
                  mappingSuggestions={mappingSuggestions}
                />
              </Box>
            </Card>
          ) : null}
          <Card data-theo-block="import-check" className="rounded-card">
            <Box className="space-y-3 p-4 md:p-5">
              <Box>
                <Text element="h2" size="base" weight="semibold">
                  {t('theoBoxes.check.title')}
                </Text>
              </Box>
              {/* #1452 — CE QUE CES DONNÉES VONT DÉBLOQUER, avant la validation.
                Le retour pose lui-même la limite : « Ne promettre que les usages
                réellement branchés dans le produit. » Chaque promesse mène donc
                à l'écran qui la tient — si le lien n'existe pas, la promesse
                n'est pas écrite. Elle est rangée par FAMILLE et non par source :
                ce qui se débloque en reprenant un ancien CRM ne dépend pas de
                l'éditeur d'où vient l'export, et prétendre le contraire aurait
                fabriqué treize listes dont douze auraient menti. */}
              <UnlockedByImport familyKey={familyOfSource(source.key)} />

              {/* #3753 — « créer une liste cible » : proposé pour un fichier de COMPTES,
                jamais coché d'office. La liste garde le tier (A/B/C), la raison et
                les problématiques fournies par l'ESN ; aucune analyse n'est lancée. */}
              {objectType === 'account' ? (
                <Box className="space-y-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={targetListName !== null}
                      onChange={event => setTargetListName(event.target.checked ? t('targetListDefaultName') : null)}
                    />
                    {t('targetListOffer')}
                  </label>
                  {targetListName !== null ? (
                    <label className="flex flex-col gap-1 text-sm text-[var(--bellum-text-secondary)]">
                      {t('targetListName')}
                      <input
                        value={targetListName}
                        onChange={event => setTargetListName(event.target.value)}
                        maxLength={120}
                        className="min-h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm text-[var(--bellum-text-primary)]"
                      />
                    </label>
                  ) : null}
                </Box>
              ) : null}

              {/* Étapes 4 à 6 — normaliser, dédupliquer, SIMULER. */}
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Play}
                  isLoading={busy === 'simulate'}
                  onClick={() => void simulate()}
                  disabled={!content}
                >
                  {t('simulate')}
                </Button>
                {/* Étape 7 — indisponible tant que rien n'a été simulé. Le serveur
                  refuse de toute façon ; le bouton ne ment pas non plus. */}
                <Button
                  variant="default"
                  size="sm"
                  icon={Check}
                  isLoading={busy === 'apply'}
                  onClick={() => void apply()}
                  disabled={!report || blocked}
                >
                  {t('apply')}
                </Button>
              </Box>

              {report ? (
                <ReportPanel
                  report={report}
                  written={reportWritten}
                  objectType={objectType}
                  writtenCounts={writtenCounts}
                />
              ) : null}
            </Box>
          </Card>
        </>
      ) : null}

      {/* #1452.3 — « Imports précédents » DISPARAISSAIT quand il était vide, sans
          un mot : un bloc absent se lit comme un bloc cassé, et surtout il ne
          disait pas que l'historique existe. Trois états distincts, trois
          phrases — « je regarde », « je n'ai pas pu regarder », « il n'y en a
          pas encore » — la deuxième et la troisième ne se confondent jamais. */}
      <Box className="space-y-1">
        <Text size="sm" weight="semibold">
          {t('historyTitle')}
        </Text>
        {sessionsFailed ? (
          <Text size="xs" className="text-[var(--warning-soft-text)]">
            {t('historyUnavailable')}
          </Text>
        ) : sessionsLoading ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('historyLoading')}
          </Text>
        ) : (sessions ?? []).length === 0 ? (
          <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-history-empty">
            {t('historyEmpty')}
          </Text>
        ) : (
          (sessions ?? []).map(session => (
            <Box key={session.id} className="space-y-1">
              <Box display="flex" className="flex-wrap items-center gap-2">
                {/* #3666.3 / #3666.6 — l'état de l'import dit en mots (même
                    vocabulaire que les analyses) et son PALIER : fichier reçu
                    (rien d'écrit) ≠ lignes écrites. Un état inconnu ne rend
                    rien. */}
                <ImportStatus state={session.state} />
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('historyLine', {
                    source: t(`sources.${session.source}`, { defaultValue: session.source }),
                    state: t(`states.${session.state}`, { defaultValue: session.state }),
                    created: session.created_count,
                    updated: session.updated_count,
                  })}
                </Text>
                {/* L'annulation apparaît sur tout import qui a ÉCRIT — donc
                    aussi sur celui qui s'est INTERROMPU, et c'est le cas qui
                    compte le plus : il a laissé des lignes derrière lui. La
                    règle qui la rend sûre est côté serveur : un objet corrigé à
                    la main après l'import n'est jamais touché, et le rapport le
                    compte. */}
                {session.state === 'applied' || session.state === 'partial' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={rollback.isPending && rollback.variables === session.id}
                    onClick={() => rollback.mutate(session.id)}
                  >
                    {t('rollback.action')}
                  </Button>
                ) : null}
                {session.state === 'partial' ? (
                  <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => resume(session)}>
                    {t('resume.action')}
                  </Button>
                ) : null}
              </Box>
              <HistoryMeta session={session} />
              {session.state === 'partial' ? <StoppedLine session={session} /> : null}
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
}

/**
 * Où en est l'assistant — les sept étapes du §7.4 (#1451.3).
 *
 * Ce n'est pas un compteur : chaque état est DÉRIVÉ d'un fait de l'écran (voir
 * `model/steps.ts`), si bien qu'une correction de correspondance fait reculer
 * ce qu'elle invalide au lieu de laisser une progression mentir.
 */
const STEP_PHASES: readonly { key: 'source' | 'columns' | 'check' | 'result'; steps: readonly ImportStep[] }[] = [
  { key: 'source', steps: ['choose_source', 'upload'] },
  { key: 'columns', steps: ['map'] },
  { key: 'check', steps: ['normalise', 'deduplicate', 'simulate'] },
  { key: 'result', steps: ['apply'] },
]

/**
 * Théo B c4-assistant-import — QUATRE temps lisibles (Source · Colonnes · Vérification · Résultat), numérotés ;
 * les sept étapes du §7.4 (#1451.3) restent nommées dessous, chacune avec son état. Un temps est fait quand
 * toutes ses étapes le sont, en cours quand il porte l'étape en cours : rien n'est compté à la main.
 */
function StepRail({ progress }: { progress: Parameters<typeof importStepStatuses>[0] }) {
  const { t } = useTranslation('importWizard')
  const statuses = importStepStatuses(progress)
  const statusOf = new Map(statuses.map(row => [row.step, row.status]))
  const done = statuses.filter(row => row.status === 'done').length

  return (
    <Box {...guideAnchorProps('import.etapes')} className="space-y-2">
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('steps.progress', { done, total: statuses.length })}
      </Text>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label={t('steps.ariaLabel')}>
        {STEP_PHASES.map((phase, index) => {
          const phaseStatus = phase.steps.every(step => statusOf.get(step) === 'done')
            ? 'done'
            : phase.steps.some(step => statusOf.get(step) === 'current')
              ? 'current'
              : 'todo'
          return (
            <li
              key={phase.key}
              data-phase={phase.key}
              data-status={phaseStatus}
              className={cn(
                'min-w-0 rounded-lg border p-2',
                phaseStatus === 'current'
                  ? 'border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)]'
                  : 'border-[var(--bellum-border)] bg-transparent',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                    phaseStatus === 'done'
                      ? 'bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
                      : phaseStatus === 'current'
                        ? 'bg-[var(--bellum-text-accent)] text-[var(--bellum-surface-1)]'
                        : 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-muted)]',
                  )}
                >
                  {phaseStatus === 'done' ? <Check className="size-3.5" /> : index + 1}
                </span>
                <Text size="sm" weight={phaseStatus === 'current' ? 'semibold' : 'medium'} className="truncate">
                  {t(`steps.phase.${phase.key}`)}
                </Text>
              </div>
              <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 pl-7">
                {phase.steps.map(step => {
                  const status = statusOf.get(step) ?? 'todo'
                  return (
                    <li key={step} className="flex items-center gap-1">
                      {status === 'done' ? (
                        <Check className="size-3 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
                      ) : (
                        <Circle className="size-3 shrink-0 text-[var(--text-ghost)]" aria-hidden />
                      )}
                      <Text
                        size="xs"
                        weight={status === 'current' ? 'semibold' : 'normal'}
                        color={status === 'todo' ? 'text-[var(--text-ghost)]' : 'text-[var(--bellum-text-secondary)]'}
                        /* L'état est ANNONCÉ, pas seulement dessiné : une pastille et une
                           graisse ne disent rien à un lecteur d'écran. */
                        aria-current={status === 'current' ? 'step' : undefined}
                        title={t(`steps.status.${status}`)}
                      >
                        {t(`steps.${step}`)}
                      </Text>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ol>
    </Box>
  )
}

/**
 * La date de l'import et le nombre de lignes traitées (#1452.3).
 *
 * L'entité les porte, la ligne d'historique n'en rendait aucun : elle ne disait
 * ni QUAND l'import a eu lieu, ni sur combien de lignes il a porté.
 *
 * ⚠️ Rien n'est écrit quand `processed_rows` / `total_rows` valent `null` :
 * « on ne sait pas combien de lignes ont été traitées » n'est pas « zéro », et
 * une session interrompue a déjà `StoppedLine` pour le dire mieux — la répéter
 * ici afficherait deux fois la même chose sous deux formes.
 */
function HistoryMeta({ session }: { session: ImportSession }) {
  const { t } = useTranslation('importWizard')
  const when = formatDateTime(session.created_at)
  const rowsKnown = session.state !== 'partial' && session.processed_rows !== null && session.total_rows !== null

  if (!when && !rowsKnown) return null

  return (
    <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-history-meta">
      {[
        when ? t('historyWhen', { when }) : null,
        rowsKnown ? t('historyRows', { done: session.processed_rows, total: session.total_rows }) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </Text>
  )
}

/**
 * Où l'import s'est arrêté — la ligne d'historique d'une session interrompue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI TIENT TOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * « 0 ligne importée » et « on ne sait pas combien de lignes ont été importées »
 * sont **deux écrans différents**. Le premier autorise à tout relancer ; le
 * second l'interdit, puisque relancer redoublonnerait. Écrire « 0 » sur une
 * ignorance est le défaut que tout ce dépôt combat, et un import interrompu en
 * est le cas le plus coûteux : une base de contacts doublonnée, personne ne la
 * répare.
 */
function StoppedLine({ session }: { session: ImportSession }) {
  const { t } = useTranslation('importWizard')
  const known = session.processed_rows !== null && session.total_rows !== null

  return (
    <Box className="space-y-1 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
      <Box display="flex" className="items-start gap-1.5">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
        <Text size="xs" className="text-[var(--warning-soft-text)]" data-testid="import-stopped-line">
          {known
            ? t('resume.stoppedAt', {
                done: session.processed_rows,
                total: session.total_rows,
                created: session.created_count,
                updated: session.updated_count,
              })
            : t('resume.stoppedUnknown')}
        </Text>
      </Box>
      {session.resume_outcome ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t(session.resume_outcome === 'unknown' ? 'resume.whyUnknown' : 'resume.whyFailed')}
        </Text>
      ) : null}
      {session.error ? (
        <Text size="xs" color="text-[var(--text-ghost)]">
          {t('resume.detail', { detail: session.error })}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * Le panneau de reprise — ce qu'on sait, et la seule question qui reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE QUESTION, ET PAS UNE DÉCISION AUTOMATIQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un timeout n'est pas un échec : `unknown` ARRÊTE la reprise. » Quand la
 * ligne est PARTIE sans que la réponse revienne, la réécrire la doublonne
 * peut-être et la sauter la perd peut-être. Il n'y a pas de bonne réponse
 * automatique : les deux sont montrées avec leur risque, et c'est un humain qui
 * tranche. Le serveur n'accepte alors que ces deux valeurs-là.
 */
function ResumePanel({
  session,
  choice,
  onChoice,
}: {
  session: ImportSession
  choice: 'rewrite' | 'skip' | null
  onChoice: (value: 'rewrite' | 'skip') => void
}) {
  const { t } = useTranslation('importWizard')
  const uncertainRow = session.resume_outcome === 'unknown' ? session.failed_at_row : null

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3" data-testid="import-resume-panel">
      <Text size="sm" weight="semibold">
        {t('resume.title')}
      </Text>
      <StoppedLine session={session} />
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('resume.dropSameFile')}
      </Text>

      {uncertainRow !== null ? (
        <Box className="space-y-2" data-testid="import-resume-uncertain">
          <Text size="xs" className="text-[var(--warning-soft-text)]">
            {t('resume.uncertainQuestion', { line: uncertainRow + 1 })}
          </Text>
          {/* Deux `<button type="button">` : ce qui se clique se tabule, et un
              `<div onClick>` n'a ni tabulation, ni Entrée, ni annonce. */}
          <Box display="flex" className="flex-wrap gap-2">
            <Button
              variant={choice === 'rewrite' ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={choice === 'rewrite'}
              onClick={() => onChoice('rewrite')}
            >
              {t('resume.rewriteLine', { line: uncertainRow + 1 })}
            </Button>
            <Button
              variant={choice === 'skip' ? 'default' : 'secondary'}
              size="sm"
              aria-pressed={choice === 'skip'}
              onClick={() => onChoice('skip')}
            >
              {t('resume.skipLine', { line: uncertainRow + 1 })}
            </Button>
          </Box>
          <Text size="xs" color="text-[var(--text-ghost)]">
            {t(
              choice === 'rewrite' ? 'resume.rewriteRisk' : choice === 'skip' ? 'resume.skipRisk' : 'resume.mustChoose',
            )}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}

/**
 * La correspondance des colonnes — étapes 2 et 3 du §7.4.
 *
 * Ce que ce panneau REFUSE de faire, et qui est la moitié de sa raison d'être :
 * deviner. Une colonne qu'aucun alias ne reconnaît reste NON RATTACHÉE et le
 * DIT ; elle n'est jamais rapprochée du champ le plus proche. Le repli
 * positionnel — « la troisième colonne est sûrement l'e-mail » — est exactement
 * ce qui fait entrer des numéros de téléphone dans un champ société, et sur
 * 17 000 lignes cela ne se démêle plus.
 *
 * Les champs offerts viennent du SERVEUR (`/import/sources` → `fields`), dérivés
 * des alias de la source. Une liste écrite à la main ici proposerait un jour un
 * champ que le moteur d'écriture ne connaît pas — et une colonne rattachée à un
 * champ fantôme se perd en silence.
 */
/** Une pastille de confiance — jamais un pourcentage (doctrine, voir `mappingConfidence`). */
function ConfidenceBadge({ level }: { level: MappingConfidence }) {
  const { t } = useTranslation('importWizard')
  const variant = level === 'high' ? 'outline' : level === 'medium' ? 'warning' : 'danger'
  return (
    <Badge variant={variant} data-testid={`import-mapping-confidence-${level}`}>
      {t(`mapping.confidence.${level}`)}
    </Badge>
  )
}

function MappingPanel({
  headers,
  mapping,
  fields,
  required,
  stale,
  onChange,
  columnConfidence,
  mappingSuggestions,
}: {
  headers: readonly string[]
  mapping: ImportMapping
  fields: readonly string[]
  required: readonly string[]
  /** La correspondance a changé depuis la dernière simulation. */
  stale: boolean
  onChange: (column: string, field: string) => void
  /** #2159.17 et suivants — la confiance de chaque colonne RATTACHÉE (haute/moyenne/basse). */
  columnConfidence: Readonly<Record<string, MappingConfidence>>
  /** Une suggestion pour une colonne NON rattachée — jamais appliquée sans un clic. */
  mappingSuggestions: Readonly<Record<string, { field: string; confidence: 'medium' | 'low' }>>
}) {
  const { t } = useTranslation('importWizard')
  const attached = new Set(Object.values(mapping.columns))
  const missingRequired = required.filter(field => !attached.has(field))
  const unattached = headers.filter(header => !mapping.columns[header])
  const withoutSuggestion = unattached.filter(header => !mappingSuggestions[header])

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3" data-testid="import-mapping">
      <Text size="sm" weight="semibold">
        {t('mapping.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('mapping.recognised', { attached: Object.keys(mapping.columns).length, total: headers.length })}
      </Text>

      <Box className="space-y-1.5">
        {headers.map(header => {
          const confidence = columnConfidence[header]
          return (
            <Box key={header} display="flex" className="flex-wrap items-center gap-2">
              <label className="min-w-0 flex-1 text-xs" htmlFor={`import-map-${header}`}>
                {header}
              </label>
              {/* La confiance d'un rattachement DÉJÀ fait — jamais affichée sur
                  un choix humain sans parenté textuelle avec l'en-tête : une
                  correction gagne toujours, elle n'a besoin d'aucun badge. */}
              {mapping.columns[header] && confidence ? <ConfidenceBadge level={confidence} /> : null}
              {/* Un `<select>` natif : il se tabule, s'annonce, et se manipule au
                  clavier — ce qu'un menu maison n'a jamais gratuitement. */}
              <SelectField
                id={`import-map-${header}`}
                value={mapping.columns[header] ?? ''}
                onChange={next => onChange(header, next)}
                emptyOption={{ label: t('mapping.unattached') }}
                options={fields.map(field => ({
                  value: field,
                  label: `${t(`mapping.fields.${field}`, { defaultValue: field })}
                    ${required.includes(field) ? ` ${t('mapping.requiredMark')}` : ''}`,
                }))}
              />
            </Box>
          )
        })}
      </Box>

      {/* #2159.17 et suivants — une colonne non reconnue par alias exact, mais
          textuellement proche d'un champ connu, obtient une SUGGESTION —
          jamais rattachée d'office : « on propose, on n'exécute jamais tout
          seul » (doctrine, même règle qu'une fusion de doublons proposée). */}
      {unattached.map(header =>
        mappingSuggestions[header] ? (
          <Box
            key={`suggestion-${header}`}
            display="flex"
            className="flex-wrap items-center gap-2"
            data-testid="import-mapping-suggestion"
          >
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('mapping.suggestion', {
                header,
                field: t(`mapping.fields.${mappingSuggestions[header].field}`, {
                  defaultValue: mappingSuggestions[header].field,
                }),
              })}
            </Text>
            <ConfidenceBadge level={mappingSuggestions[header].confidence} />
            <Button variant="ghost" size="sm" onClick={() => onChange(header, mappingSuggestions[header].field)}>
              {t('mapping.acceptSuggestion')}
            </Button>
          </Box>
        ) : null,
      )}

      {withoutSuggestion.length > 0 ? (
        <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-mapping-unattached">
          {t('mapping.unattachedList', { list: withoutSuggestion.join(', ') })}
        </Text>
      ) : null}

      {/* Un champ obligatoire non rattaché BLOQUE l'écriture côté serveur. Le
          dire ici évite de le découvrir à la simulation suivante. */}
      {missingRequired.length > 0 ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]" data-testid="import-mapping-missing-required">
          {t('mapping.missingRequired', { list: missingRequired.join(', ') })}
        </Text>
      ) : null}

      {stale ? (
        <Text size="xs" className="text-[var(--warning-soft-text)]" data-testid="import-mapping-stale">
          {t('mapping.stale')}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * #2159.11/.13 — la reconnaissance d'un export à sa signature de colonnes, et
 * son repli honnête (« ressemble à un ATS ») quand elle n'est pas certaine.
 * Rien ne change de source tout seul : c'est une INFORMATION, la source déjà
 * choisie reste celle que l'écriture utilisera.
 *
 * ⚠️ GA-44 (`architecture/no-vendor-names-in-app.test.ts`) — un écran hors
 * Réglages › Intégrations ne nomme JAMAIS un éditeur, y compris celui de
 * l'outil du CLIENT : `detectImportSource` sait en interne qu'il s'agit de
 * `boondmanager_export`, mais le texte affiché reste « export ERP », comme le
 * libellé de la carte source elle-même (`sources.boondmanager_export` =
 * « Export de ton ERP », déjà sans nom d'éditeur).
 */
function DetectedSourceBanner({
  detection,
  chosenSourceKey,
}: {
  detection: ImportSourceDetection
  chosenSourceKey: string
}) {
  const { t } = useTranslation('importWizard')
  if (detection.certainty === 'none') return null

  if (detection.certainty === 'named') {
    const key = detection.key === chosenSourceKey ? 'detectedSource.confirmed' : 'detectedSource.mismatchBoondmanager'
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="import-detected-source">
        {t(key)}
      </Text>
    )
  }

  // M2.2 (Meyer 20/10) — un export de contacts d'un outil de gestion : dit « reconnu », aucun nom de fournisseur.
  const familyKey =
    detection.family === 'management_contacts' ? 'detectedSource.managementContacts' : 'detectedSource.atsLike'
  return (
    <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="import-detected-source">
      {t(familyKey)}
    </Text>
  )
}

/**
 * Le rapport de simulation (§7.5) — ou celui de l'ÉCRITURE, une fois exécutée.
 *
 * Trois chiffres que personne n'aime lire et qu'il faut lire : combien de
 * valeurs seraient ÉCRASÉES, combien de lignes sont écartées et pourquoi, et
 * combien de contacts arriveraient sans base légale.
 */
function ReportPanel({
  report,
  /**
   * Une écriture a-t-elle été TENTÉE ? Distinct de `report` lui-même : une
   * simulation a toujours `errors: []`, mais ce n'est pas la même chose que
   * « zéro erreur, mesuré ». Tant que rien n'a été écrit, le nombre d'erreurs
   * n'est PAS mesuré — voir §"errors" ci-dessous.
   */
  written,
  /** #2159.35 — l'objet ciblé par CETTE session : le geste « ce n'est pas la
   *  même personne » n'a de sens que sur un import de CONTACTS (le seul
   *  objet dédupliqué par e-mail). `null` tant que la session n'a pas encore
   *  répondu. */
  objectType,
  writtenCounts,
}: {
  report: DryRunReport
  written: boolean
  objectType: ImportObject | null
  /** #4051 — ce que l'écriture a posé : le bilan par famille n'existe qu'APRÈS elle. */
  writtenCounts: { created: number; updated: number } | null
}) {
  const { t } = useTranslation('importWizard')
  const dataExit = useDataExit()
  const breakdown =
    written && writtenCounts && objectType ? wizardImportBreakdown(objectType, writtenCounts, report) : null
  // #4051 — « Télécharger le rapport » : les lignes écartées et en échec, avec leur raison. Il SORT des
  // données : il lit la règle d'espace, comme l'import universel (#2081.14).
  const downloadReport = (): void => {
    if (!dataExit.grant) {
      toast.error(t('universal.report.exportRefused'))
      return
    }
    const reason = (code: string) => t(`skipReasons.${code}`, { defaultValue: code })
    downloadCSV(
      toCsv([
        [t('errors.lineHeader'), t('errors.reasonHeader'), t('errors.fieldHeader')],
        ...report.skipped.map(row => [String(row.row), reason(row.reason), row.field ?? '']),
        ...report.errors.map(error => [String(error.row), error.message, '']),
      ]),
      'rapport-import.csv',
      dataExit.grant,
    )
  }
  const byReason = report.skipped.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason] = (acc[row.reason] ?? 0) + 1
    return acc
  }, {})
  // #2159.46/.48 — deux chiffres agrégés de la preview, dérivés de
  // `report.duplicates` (rien de nouveau calculé) : les comptes RAPPROCHÉS
  // (toute ligne qui a trouvé un `existingId`, conflit compris) et, parmi
  // eux, ceux en CONFLIT (`overwrites`). Un rapprochement sans conflit n'en
  // est pas moins un rapprochement — les deux comptent, pas seulement le pire cas.
  const matchedAccounts = report.duplicates.filter(duplicate => duplicate.existingId !== null)
  const conflicts = matchedAccounts.filter(duplicate => duplicate.overwrites)

  return (
    <Box className="space-y-1 rounded-lg border border-[var(--bellum-border)] p-3">
      {breakdown ? <ImportFamilyReport breakdown={breakdown} queryableByLaura={null} /> : null}
      <Text size="sm">{t('rowsRead', { count: report.rowsRead })}</Text>
      <Text size="xs">{t('creations', { count: report.creations })}</Text>
      <Text size="xs">{t('updates', { count: report.updates })}</Text>
      <Text size="xs">{t('duplicates', { count: report.duplicates.length })}</Text>
      {matchedAccounts.length > 0 ? (
        <Text size="xs" data-testid="import-report-matched-accounts-count">
          {t('matchedAccounts', { count: matchedAccounts.length })}
        </Text>
      ) : null}
      {conflicts.length > 0 ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]" data-testid="import-report-conflicts-count">
          {t('conflictsCount', { count: conflicts.length })}
        </Text>
      ) : null}

      {/*
       * #2159.32/.33/.39/.46/.48 — l'APERÇU du rapprochement, avant l'écriture :
       * chaque doublon proposé, avec sa RAISON (`matchedOn`) et sa
       * classification. Un CONFLIT (`overwrites`) est distingué d'une simple
       * mise à jour — la doctrine (« on n'affiche pas ce qu'on n'a pas ») vaut
       * ici dans l'autre sens : ce calcul EXISTE déjà (`simulateImport`), et un
       * total muet ne dit pas QUELLES lignes demandent une décision. Rien n'est
       * fusionné ici — c'est une lecture, l'écriture suit le même chemin
       * qu'avant (mise à jour ou création, jamais une fusion automatique).
       */}
      {report.duplicates.length > 0 ? (
        <Box className="space-y-1 pt-1" data-testid="import-report-duplicates">
          {report.duplicates.map(duplicate => (
            <Box key={duplicate.row} display="flex" className="items-start gap-1.5">
              {duplicate.overwrites ? (
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
              ) : null}
              <Text
                size="xs"
                className={duplicate.overwrites ? 'text-[var(--danger-soft-text)]' : undefined}
                color={duplicate.overwrites ? undefined : 'text-[var(--bellum-text-secondary)]'}
              >
                {t('errors.line', { line: duplicate.row })} —{' '}
                {t(
                  duplicate.overwrites
                    ? 'duplicateConflict'
                    : duplicate.existingId
                      ? 'duplicateUpdate'
                      : 'duplicateInFile',
                  {
                    keys: duplicate.matchedOn.map(key => t(`duplicateKeys.${key}`, { defaultValue: key })).join(', '),
                  },
                )}
              </Text>
              {/* #2159.35 — un CONFLIT contre une fiche EXISTANTE, sur un
                  import de CONTACTS, peut venir d'un e-mail générique partagé
                  (accueil@, secretariat@) qui désigne quelqu'un d'autre. Le
                  geste corrige le rapprochement pour les imports suivants —
                  jamais pour celui-ci (rien n'est réécrit après coup). */}
              {objectType === 'contact' && duplicate.overwrites && duplicate.existingId ? (
                <RejectContactMatchButton contactId={duplicate.existingId} />
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}

      {/*
       * #2159.32/#2159.33 — téléphone/LinkedIn partagés DANS le fichier : un
       * signal FAIBLE, jamais un skip (contrairement à `report.duplicates`
       * ci-dessus). Les deux lignes restent créées ; seul ce panneau les
       * signale, à vérifier humainement.
       */}
      {report.possibleDuplicates.length > 0 ? (
        <Box className="space-y-1 pt-1" data-testid="import-report-possible-duplicates">
          <Text size="xs" data-testid="import-report-possible-duplicates-count">
            {t('possibleDuplicatesCount', { count: report.possibleDuplicates.length })}
          </Text>
          {report.possibleDuplicates.map(duplicate => (
            <Text key={duplicate.row} size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('possibleDuplicateLine', {
                line: duplicate.row,
                keys: duplicate.matchedOn.map(key => t(`duplicateKeys.${key}`, { defaultValue: key })).join(', '),
              })}
            </Text>
          ))}
        </Box>
      ) : null}

      {Object.entries(byReason).map(([reason, count]) => (
        <Text key={reason} size="xs" color="text-[var(--bellum-text-secondary)]">
          · {t(`skipReasons.${reason}`, { defaultValue: reason })} — {count}
        </Text>
      ))}

      {/*
       * #2159.60 — chaque ligne écartée reste consultable UNE PAR UNE, pas
       * seulement son total par raison ci-dessus. `report.skipped` porte déjà
       * `row`/`reason`/`field` (§ contrat) : rien de neuf n'est calculé ici.
       */}
      {report.skipped.length > 0 ? (
        <Box className="space-y-1 pt-1" data-testid="import-report-skipped-details">
          {report.skipped.map(row => (
            <Text key={row.row} size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('errors.line', { line: row.row })} — {t(`skipReasons.${row.reason}`, { defaultValue: row.reason })}
              {row.field ? ` (${row.field})` : ''}
            </Text>
          ))}
        </Box>
      ) : null}

      {written && report.skipped.length + report.errors.length > 0 ? (
        <Box className="pt-1">
          <Button variant="secondary" size="sm" icon={Download} onClick={downloadReport}>
            {t('universal.report.download')}
          </Button>
        </Box>
      ) : null}

      {/*
       * Les lignes en ÉCHEC à l'écriture — distinctes des lignes ignorées
       * juste au-dessus : celles-ci n'ont pas été écartées par une règle
       * connue, elles ont été TENTÉES et n'ont pas abouti. Trois états, pas
       * deux : « pas encore mesuré » (rien écrit), « zéro » (écrit, rien en
       * échec) et « N en échec » — jamais confondus.
       */}
      {!written ? (
        <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-report-errors-unmeasured">
          {t('errors.unmeasured')}
        </Text>
      ) : report.errors.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="import-report-errors-zero">
          {t('errors.zero')}
        </Text>
      ) : (
        <Box className="space-y-1 pt-1" data-testid="import-report-errors">
          <Box display="flex" className="items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-[var(--danger-soft-text)]" aria-hidden />
            <Text size="xs" className="text-[var(--danger-soft-text)]">
              {t('errors.count', { count: report.errors.length })}
            </Text>
          </Box>
          {/* Le geste : REVOIR chaque ligne, avec son numéro et sa raison —
              une erreur sans son numéro de ligne est inutilisable sur un
              fichier de 3 000 lignes. */}
          {report.errors.map(error => (
            <Text key={error.row} size="xs" color="text-[var(--bellum-text-secondary)]">
              · {t('errors.line', { line: error.row })} — {error.message}
            </Text>
          ))}
        </Box>
      )}

      {report.overwrittenFields > 0 ? (
        <Box display="flex" className="items-center gap-1.5 pt-1">
          <AlertTriangle className="size-3.5 text-[var(--danger-soft-text)]" aria-hidden />
          <Text size="xs">{t('overwritten', { count: report.overwrittenFields })}</Text>
        </Box>
      ) : null}

      {report.withoutLegalBasis > 0 ? (
        <Box display="flex" className="items-center gap-1.5">
          <AlertTriangle className="size-3.5 text-[var(--danger-soft-text)]" aria-hidden />
          <Text size="xs">{t('withoutLegalBasis', { count: report.withoutLegalBasis })}</Text>
        </Box>
      ) : null}

      {report.missingRequiredColumns.length > 0 ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {t('missingRequired', { list: report.missingRequiredColumns.join(', ') })}
        </Text>
      ) : null}

      {/* #1451.3 — les colonnes RECONNUES. Le moteur les calcule
          (`import-engine.ts`), le rapport les porte, et l'écran rendait onze de
          ses douze champs : celui-ci passait à la trappe. « Voici les colonnes
          que j'ai reconnues » est pourtant exactement ce qu'une simulation doit
          dire — la liste des ignorées juste en dessous ne répond pas à la même
          question, et seule ne dit pas si le fichier a été LU. */}
      {report.mappedColumns.length > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="import-report-mapped-columns">
          {t('mappedColumns', { list: report.mappedColumns.join(', ') })}
        </Text>
      ) : null}

      {report.ignoredColumns.length > 0 ? (
        <Text size="xs" color="text-[var(--text-ghost)]">
          {t('ignoredColumns', { list: report.ignoredColumns.join(', ') })}
        </Text>
      ) : null}

      {/* #2079.7 — le signalement des colonnes SENSIBLES, lu sur l'EN-TÊTE du
          fichier (`sensitiveHeaders`) : il suit le sort du mapping (rattachée
          ou ignorée) ci-dessus, mais reste un avertissement à PART — une
          « Date de naissance » ne se lit pas comme une colonne perdue parmi
          d'autres. */}
      {report.sensitiveColumns.length > 0 ? (
        <Box display="flex" className="items-center gap-1.5" data-testid="import-report-sensitive-columns">
          <AlertTriangle className="size-3.5 shrink-0 text-[var(--danger-soft-text)]" aria-hidden />
          <Text size="xs" className="text-[var(--danger-soft-text)]">
            {t('sensitiveColumns', { list: report.sensitiveColumns.join(', ') })}
          </Text>
        </Box>
      ) : null}

      {/* #2159.50 — la preview COMPTE les notes sensibles signalées, en plus
          de les lister ci-dessus (la liste nomme les colonnes, ce chiffre
          répond à « combien » sans avoir à les recompter à la main). */}
      {report.sensitiveColumns.length > 0 ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]" data-testid="import-report-sensitive-notes-count">
          {t('sensitiveNotesCount', { count: report.sensitiveColumns.length })}
        </Text>
      ) : null}

      {report.truncated ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {t('truncated')}
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * #2159.35 — « ce n'est pas la même personne », sur un doublon CONFLIT.
 *
 * Un e-mail générique partagé (accueil@, secretariat@) peut faire matcher une
 * ligne du fichier sur la mauvaise fiche existante. Le geste enregistre un
 * REJET versionné (`POST /contacts/:id/resolution-corrections`) : il ne
 * change rien à CETTE simulation (rien n'est réécrit après coup — on
 * n'invente pas une seconde décision sur un rapport déjà rendu), mais les
 * imports SUIVANTS ne mettront plus à jour cette fiche par cet e-mail.
 */
function RejectContactMatchButton({ contactId }: { contactId: string }) {
  const { t } = useTranslation('importWizard')
  const record = useRecordContactResolutionCorrection(contactId)
  if (record.isSuccess) {
    return (
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="import-report-reject-match-done">
        {t('rejectMatch.done')}
      </Text>
    )
  }
  return (
    <Button
      variant="outline"
      size="xs"
      isLoading={record.isPending}
      data-testid="import-report-reject-match"
      onClick={() => record.mutate({ decision: 'rejected' }, { onError: () => toast.error(t('rejectMatch.error')) })}
    >
      {t('rejectMatch.action')}
    </Button>
  )
}

function UnlockedByImport({ familyKey }: { familyKey: string }) {
  const { t } = useTranslation('importWizard')
  const unlocked = UNLOCKED_BY_FAMILY[familyKey]
  if (!unlocked) return null
  return (
    <Box as="section" className="rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="sm" weight="semibold">
        {t('unlocked.title')}
      </Text>
      <ul className="mt-1.5 space-y-1">
        {unlocked.map(entry => (
          <li key={entry.key}>
            <Link
              to={entry.to}
              className="inline-flex items-center gap-1 text-xs text-[var(--bellum-text-accent)] hover:underline"
            >
              {t(`unlocked.${familyKey}.${entry.key}`)}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Box>
  )
}

function ImportStatus({ state }: { state: string }) {
  const { t } = useTranslation('importWizard')
  const status = importOperationStatus(state)
  const stage = importStage(state)
  if (!status) return null
  return (
    <>
      <OperationStatusBadge status={status} />
      {stage ? (
        <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-stage">
          {t(`stage.${stage}`)}
        </Text>
      ) : null}
      {/* #3666.6 — troisième palier : ce qui est écrit, Laura le lit déjà (lecture directe, sans indexation). */}
      {importReadableByLaura(state) ? (
        <Text size="xs" color="text-[var(--text-ghost)]" data-testid="import-readable">
          {t('stage.readable')}
        </Text>
      ) : null}
    </>
  )
}
