import type { CreateAccountNeed, ProjectNeed } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { rfpApi } from '@/features/rfp/api'
import { MAX_NEED_IMPORT_FILE_BYTES, needTitleFromFileName, type NeedImportRow } from '../model/need-import'

/**
 * LA FILE DE L'IMPORT EN MASSE (#2173.56) — même discipline que `cvBatch.ts`
 * (#1116), sur DEUX opérations au lieu d'une : extraire, puis créer.
 *
 * Un fichier illisible sur dix ne doit pas emporter les neuf autres (règle 1) :
 * `extractNeedImportRow` et `createNeedImportRow` ne LANCENT jamais — un échec
 * devient une ligne nommée, retournée comme les autres. Trois à la fois, même
 * raisonnement que `CV_BATCH_CONCURRENCY` : chaque fichier traverse une
 * extraction côté serveur, et dix en parallèle ne raccourcissent pas le lot —
 * ils tombent le service pour tout le monde.
 */
export const NEED_IMPORT_CONCURRENCY = 3

/**
 * `FileReader.readAsDataURL`, PAS `file.arrayBuffer()` — celui-ci est le choix
 * de `NeedWizard.tsx`, mais `CvDropZone.tsx` (`readAsBase64`, #1116) montre
 * pourquoi il ne convient pas à un lot : cette API manque sur les fichiers
 * construits en test (jsdom), donc jamais exercée par un test qui dépose un
 * vrai fichier. `FileReader` fonctionne dans les deux environnements —
 * repris ici pour que l'extraction en lot soit RÉELLEMENT testée, pas
 * seulement câblée.
 */
function fileToBase64(file: File): Promise<string> {
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

/**
 * Extrait UN fichier — le MÊME appel que `NeedWizard.tsx` (`StepKeyInfo.handleFile`) :
 * `rfpApi.create`, puis les exigences TECHNIQUES deviennent des suggestions de
 * compétences. Ne lance jamais : un refus devient une ligne `'failed'` nommée.
 */
export async function extractNeedImportRow(file: File): Promise<NeedImportRow> {
  if (file.size > MAX_NEED_IMPORT_FILE_BYTES) return { status: 'too_large', file: file.name }
  try {
    const fileBase64 = await fileToBase64(file)
    const title = needTitleFromFileName(file.name)
    const detail = await rfpApi.create({ title, fileBase64, fileName: file.name })
    const skills = detail.rfp.requirements
      .filter(requirement => requirement.kind === 'technical')
      .slice(0, 12)
      .map(requirement => ({ term: requirement.text.slice(0, 80).trim(), section: requirement.section }))
    return { status: 'extracted', file: file.name, title, skills, rfpId: detail.rfp.id, duplicateOf: null }
  } catch (error) {
    return {
      status: 'failed',
      file: file.name,
      reason: error instanceof Error && error.message ? error.message : 'Échec inconnu',
    }
  }
}

/** Ce qu'une ligne de la prévisualisation est devenue une fois créée. */
export type NeedImportCreateOutcome =
  | { file: string; status: 'created'; need: ProjectNeed }
  | { file: string; status: 'failed'; reason: string }

/** Crée UN besoin — `POST /projects/needs`, le MÊME endpoint que
 *  `useAddAccountNeed` (`CreateAccountNeed`), appelé N fois plutôt qu'une
 *  seconde route. Ne lance jamais : un refus devient une ligne nommée. */
export async function createNeedImportRow(
  row: Extract<NeedImportRow, { status: 'extracted' }>,
  accountId: string,
): Promise<NeedImportCreateOutcome> {
  try {
    const body: CreateAccountNeed = {
      account_id: accountId,
      title: row.title,
      skills: row.skills.map(skill => ({ term: skill.term, required: true, level: null })),
    }
    const need = await apiFetch<ProjectNeed, CreateAccountNeed>({ path: '/projects/needs', method: 'POST', body })
    return { file: row.file, status: 'created', need }
  } catch (error) {
    return {
      file: row.file,
      status: 'failed',
      reason: error instanceof Error && error.message ? error.message : 'Échec inconnu',
    }
  }
}

/** Déroule N tâches, bornées en concurrence, en rendant les résultats DANS
 *  L'ORDRE d'arrivée des entrées — un rapport qui suit l'ordre de dépôt se
 *  relit ; un rapport dans l'ordre d'achèvement, non. */
async function runBounded<T, R>(
  items: readonly T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function lane(): Promise<void> {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      results[index] = await worker(items[index] as T)
    }
  }
  const lanes = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: lanes }, () => lane()))
  return results
}

export async function runNeedImportExtraction(
  files: readonly File[],
  extractOne: (file: File) => Promise<NeedImportRow> = extractNeedImportRow,
  concurrency: number = NEED_IMPORT_CONCURRENCY,
): Promise<NeedImportRow[]> {
  return runBounded(files, extractOne, concurrency)
}

export async function runNeedImportCreation(
  rows: readonly Extract<NeedImportRow, { status: 'extracted' }>[],
  createOne: (row: Extract<NeedImportRow, { status: 'extracted' }>) => Promise<NeedImportCreateOutcome>,
  concurrency: number = NEED_IMPORT_CONCURRENCY,
): Promise<NeedImportCreateOutcome[]> {
  return runBounded(rows, createOne, concurrency)
}
