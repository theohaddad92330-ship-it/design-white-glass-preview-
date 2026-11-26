import type { ExpenseCategory, StorageUploadInput } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #1827.2 — LA LECTURE AUTOMATIQUE D'UN JUSTIFICATIF.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME EST LOCALE À CET ÉCRAN, ET C'EST UN CHOIX
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce type n'est PAS dans `@bellum/contracts` : ce lot est scopé à
 * `apps/web/src/features/expenses/**` et `apps/api/src/modules/expenses/**`,
 * sans toucher aux contrats partagés. `ExpenseExtractionService`
 * (`apps/api/src/modules/expenses/expense-extraction.service.ts`) déclare la
 * MÊME forme côté API ; les deux sont dupliqués plutôt que promus dans un
 * paquet partagé — un geste distinct, pour un domaine qui n'en a besoin qu'ici
 * pour l'instant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PROPOSITION, JAMAIS UNE ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque champ porte sa `confidence` et sa `sourceExcerpt` — c'est ce qui
 * permet à l'écran de dire « lu automatiquement, à vérifier » plutôt que de
 * remplir un champ à l'identique d'une saisie humaine. `value: null` couvre
 * DEUX choses distinctes que l'écran doit pouvoir dire différemment : le champ
 * n'a pas pu être lu DU TOUT (aucune citation trouvée), ou il a été lu à une
 * confiance jugée trop faible côté serveur (`services/expense_extraction.py`,
 * `_MIN_CONFIDENCE`) — dans les deux cas, le champ reste VIDE, jamais une
 * valeur inventée à sa place.
 */
type ExpenseReceiptExtractionStatus =
  | 'ok'
  | 'not_configured'
  | 'unreadable'
  | 'not_a_receipt'
  | 'too_large'
  | 'unavailable'

/** #2433.4 — rectangle normalisé (0..1, origine en haut à gauche) où un champ a été lu sur une IMAGE. */
export type ReceiptRegion = { x: number; y: number; w: number; h: number }

type ExpenseFieldProposal<T> = {
  value: T | null
  confidence: number
  sourceExcerpt: string
  /** Absent/`null` : PDF, texte, ou zone non établie — jamais une zone devinée. */
  sourceRegion?: ReceiptRegion | null
}

export type ExpenseReceiptExtraction = {
  status: ExpenseReceiptExtractionStatus
  ocrUsed: boolean
  costUsd: number | null
  fields: {
    amountCents: ExpenseFieldProposal<number>
    spentOn: ExpenseFieldProposal<string>
    category: ExpenseFieldProposal<ExpenseCategory>
    vatRateBps: ExpenseFieldProposal<number>
  }
}

function emptyField<T>(): ExpenseFieldProposal<T> {
  return { value: null, confidence: 0, sourceExcerpt: '' }
}

/** Un statut qui ne varie jamais : ni appel, ni octet du fichier ne comptent
 *  pour l'établir — seulement l'échec du TRANSPORT vers l'API. */
export function unavailableExtraction(): ExpenseReceiptExtraction {
  return {
    status: 'unavailable',
    ocrUsed: false,
    costUsd: null,
    fields: {
      amountCents: emptyField(),
      spentOn: emptyField(),
      category: emptyField(),
      vatRateBps: emptyField(),
    },
  }
}

/**
 * Propose une lecture — NE LÈVE JAMAIS : un réseau qui tombe pendant la
 * lecture automatique ne doit jamais empêcher de continuer le dépôt à la
 * main. Une panne de transport se traduit en `unavailableExtraction()`,
 * identique à ce que l'API rend déjà pour sa propre panne de transport vers
 * le service IA (même principe, à l'étage du dessus).
 */
export async function extractReceipt(input: StorageUploadInput): Promise<ExpenseReceiptExtraction> {
  try {
    return await apiFetch<ExpenseReceiptExtraction, StorageUploadInput>({
      path: '/expenses/receipts/extract',
      method: 'POST',
      body: input,
    })
  } catch {
    return unavailableExtraction()
  }
}

/**
 * Au moins un champ a été proposé — sert à décider si la ligne du formulaire a
 * quelque chose à pré-remplir.
 *
 * ⚠️ `extraction?.fields` : un serveur qui répond une forme inattendue (un
 * test qui a oublié de mocker cet appel et hérite du stub `fetch` générique du
 * dépôt, par exemple) ne doit jamais faire planter l'écran de dépôt — il doit
 * se comporter comme si rien n'avait été lu.
 */
export function hasAnyProposal(extraction: ExpenseReceiptExtraction): boolean {
  if (extraction?.status !== 'ok' || !extraction.fields) return false
  const { amountCents, spentOn, category, vatRateBps } = extraction.fields
  return (
    (amountCents?.value ?? null) !== null ||
    (spentOn?.value ?? null) !== null ||
    (category?.value ?? null) !== null ||
    (vatRateBps?.value ?? null) !== null
  )
}
