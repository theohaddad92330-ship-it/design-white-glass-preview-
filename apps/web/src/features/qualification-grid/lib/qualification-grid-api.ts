import type {
  AccountQualificationView,
  QualificationCriterion,
  QualificationGrid,
  QualificationGridImportReport,
  QualificationManualInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #3755 — la grille de qualification de l'espace, côté client. Une seule porte :
 * le module `qualification-grid` de l'API (GA-26).
 */
type AccountQualificationResponse = { qualification: AccountQualificationView | null }

export const qualificationGridApi = {
  getActive(): Promise<{ grid: QualificationGrid | null }> {
    return apiFetch<{ grid: QualificationGrid | null }>({ path: '/qualification-grid' })
  },

  save(criteria: QualificationCriterion[]): Promise<QualificationGrid> {
    return apiFetch<QualificationGrid, { criteria: QualificationCriterion[] }>({
      path: '/qualification-grid',
      method: 'PUT',
      body: { criteria },
    })
  },

  import(file: {
    format: 'xlsx' | 'csv'
    content: string
    sheet?: string
  }): Promise<QualificationGrid & { import_report?: QualificationGridImportReport }> {
    return apiFetch<
      QualificationGrid & { import_report?: QualificationGridImportReport },
      { format: 'xlsx' | 'csv'; content: string; sheet?: string }
    >({
      path: '/qualification-grid/import',
      method: 'POST',
      body: file,
    })
  },

  account(accountId: string): Promise<AccountQualificationResponse> {
    return apiFetch<AccountQualificationResponse>({ path: `/qualification-grid/accounts/${accountId}` })
  },

  /** #3749 — le verdict de la grille pour tout le portefeuille, une lecture. */
  accountsSummary(): Promise<{ accountId: string; verdict: 'GO' | 'PRUDENT' | 'NO-GO' | null }[]> {
    return apiFetch<{ accountId: string; verdict: 'GO' | 'PRUDENT' | 'NO-GO' | null }[]>({
      path: '/qualification-grid/accounts-summary',
    })
  },

  setManual(accountId: string, code: string, input: QualificationManualInput): Promise<AccountQualificationResponse> {
    return apiFetch<AccountQualificationResponse, QualificationManualInput>({
      path: `/qualification-grid/accounts/${accountId}/criteria/${encodeURIComponent(code)}`,
      method: 'PUT',
      body: input,
    })
  },

  clearManual(accountId: string, code: string): Promise<AccountQualificationResponse> {
    return apiFetch<AccountQualificationResponse>({
      path: `/qualification-grid/accounts/${accountId}/criteria/${encodeURIComponent(code)}`,
      method: 'DELETE',
    })
  },

  evaluate(accountId: string): Promise<AccountQualificationResponse & { status: string }> {
    return apiFetch<AccountQualificationResponse & { status: string }>({
      path: `/qualification-grid/accounts/${accountId}/evaluate`,
      method: 'POST',
    })
  },
}

/** Le contenu d'un fichier en base64 — `FileReader`, testable sous jsdom (voir `needImportBatch.ts`). */
export function readFileAsBase64(file: File): Promise<string> {
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
