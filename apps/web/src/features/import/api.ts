import type {
  DryRunReport,
  ImportMapping,
  ImportObject,
  ImportSourceDetection,
  MappingConfidence,
} from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** Une source du catalogue, telle que l'étape 1 l'affiche. */
export type ImportSourceCard = {
  key: string
  objects: ImportObject[]
  format: 'csv' | 'xlsx' | 'zip'
  /** Ce format se lit-il aujourd'hui ? Résolu par le SERVEUR — la carte ne le
   *  déduit pas de son badge, sinon les deux divergeraient au premier lecteur
   *  ajouté. */
  readable: boolean
  tier: 'mvp' | 'v1' | 'v2'
  /** Ce que la source importe, et ce qu'elle n'importe PAS — la seconde moitié compte autant. */
  imports: string[]
  skips: string[]
  howTo: string
  required: string[]
  /**
   * Les champs auxquels une colonne peut être rattachée — DÉRIVÉS des alias de
   * la source, côté serveur. L'étape 3 (« Corriger ») en a besoin pour offrir un
   * choix ; les recopier ici les ferait diverger au premier alias ajouté, et
   * l'écran proposerait un champ que le moteur d'écriture ne connaît pas.
   */
  fields: string[]
}

export type ImportSession = {
  id: string
  source: string
  object_type: ImportObject
  state: string
  created_at: string
  created_count: number
  updated_count: number
  /**
   * Le point de reprise d'un import interrompu.
   *
   * ⚠️ `processed_rows: null` veut dire « on ne sait pas combien de lignes ont
   * été écrites », JAMAIS « zéro ». Les deux s'affichent différemment, et c'est
   * tout l'objet de la règle « une valeur absente ne s'affiche jamais 0 » :
   * annoncer « 0 ligne importée » sur un import qui en a écrit 4 000 enverrait
   * quelqu'un relancer le tout et doublonner sa base.
   */
  processed_rows: number | null
  total_rows: number | null
  failed_at_row: number | null
  /** `failed` = rejouable · `unknown` = partie sans réponse, un humain tranche. */
  resume_outcome: 'failed' | 'unknown' | null
  error: string | null
}

export const importApi = {
  sources(): Promise<ImportSourceCard[]> {
    return apiFetch<ImportSourceCard[]>({ path: '/import/sources' })
  },
  sessions(): Promise<ImportSession[]> {
    return apiFetch<ImportSession[]>({ path: '/import/sessions' })
  },
  create(source: string): Promise<ImportSession> {
    return apiFetch<ImportSession>({ path: '/import/sessions', method: 'POST', body: { source } })
  },
  dryRun(
    id: string,
    content: string,
    mapping?: ImportMapping,
    // Le séparateur RÉELLEMENT détecté par le serveur. Il était déjà calculé et
    // testé côté API, puis remplacé par une constante `';'` dans la réponse — et
    // le client ne lisait même pas le champ. Un fichier en virgules ne pouvait
    // donc jamais être annoncé comme tel.
  ): Promise<{
    report: DryRunReport
    proposedMapping: ImportMapping
    delimiter: string
    /** #2159.11/.13 — ce que les en-têtes du fichier laissent deviner de sa provenance. */
    detectedSource: ImportSourceDetection
    /** #2159.17 et suivants — la confiance de chaque colonne rattachée (jamais un pourcentage). */
    columnConfidence: Record<string, MappingConfidence>
    /** Les colonnes ignorées pour lesquelles une correspondance approchante existe. */
    mappingSuggestions: Record<string, { field: string; confidence: 'medium' | 'low' }>
  }> {
    return apiFetch({ path: `/import/sessions/${id}/dry-run`, method: 'POST', body: { content, mapping } })
  },
  apply(
    id: string,
    content: string,
    available: ImportObject[],
    /**
     * Le point de reprise CHOISI par un humain, et lui seul.
     *
     * Il n'est lu que sur une session dont la dernière ligne est partie sans
     * réponse — « un timeout n'est pas un échec » : la rejouer la doublonne
     * peut-être, la sauter la perd peut-être. Le serveur n'accepte alors que
     * deux valeurs, la ligne incertaine ou la suivante.
     */
    resumeFrom?: number,
    /** #3753 — créer une liste cible avec les comptes du fichier (comptes seulement, aucune analyse). */
    targetList?: { name: string },
  ): Promise<{
    created: number
    updated: number
    skippedUnknownCompany: number
    /** #2732.1 — les lignes refusées, une par une (elles sont aussi versées dans `report.errors`, en clair). */
    rejected?: { row: number; reason: string; detail: string | null }[]
    /** #3753 — ce que la liste cible a reçu, quand elle a été demandée. */
    targetList?: {
      id: string
      name: string
      added: number
      attachedToExisting: number
      nearDuplicates: { company: string; existingAccountId: string; newAccountId: string }[]
    }
    written: boolean
    reason: string | null
    resumedFromRow: number
    stopped: { atRow: number; totalRows: number; outcome: 'failed' | 'unknown'; message: string } | null
    /**
     * Le rapport, à jour de ce que L'ÉCRITURE a appris — pas seulement de ce que
     * la simulation avait annoncé. C'est là qu'apparaît `errors` : une ligne
     * partie sans réponse qu'on choisit de sauter plutôt que de rejouer.
     */
    report: DryRunReport
  }> {
    return apiFetch({
      path: `/import/sessions/${id}/apply`,
      method: 'POST',
      body: {
        content,
        available,
        ...(resumeFrom === undefined ? {} : { resumeFrom }),
        ...(targetList ? { targetList } : {}),
      },
    })
  },
  /**
   * L'annulation, dans sa fenêtre de 24 h.
   *
   * Elle ne rend pas un booléen : ce qu'elle a LAISSÉ compte autant que ce
   * qu'elle a annulé. Un objet corrigé à la main après l'import n'est jamais
   * touché, et le dire est la moitié de la réponse.
   */
  rollback(id: string): Promise<{
    reverted: number
    keptTouched: number
    archived: number
    leftInPlace: number
    windowClosed: boolean
  }> {
    return apiFetch({ path: `/import/sessions/${id}/rollback`, method: 'POST' })
  },
}

export function useImportSources() {
  return useQuery({ queryKey: ['import', 'sources'], queryFn: importApi.sources, staleTime: 300_000 })
}

export function useImportSessions() {
  return useQuery({ queryKey: ['import', 'sessions'], queryFn: importApi.sessions, staleTime: 0 })
}
