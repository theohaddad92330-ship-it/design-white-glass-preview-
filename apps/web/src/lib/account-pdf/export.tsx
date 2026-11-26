import { pdf } from '@react-pdf/renderer'
import type { Account, AccountFactsBrief, Brand, Contact } from '@bellum/contracts'
import { downloadBlob, slugifyForFilename } from '@/lib/pdf-download'
import { AccountPdfDocument } from './AccountPdfDocument'
import { buildAccountPdfData } from './normalize'
import { withTimeout } from './with-timeout'

/** Au-delà, on dit l'échec plutôt que de laisser le bouton figé (#4073). */
const RENDER_TIMEOUT_MS = 30_000
const RENDER_TIMEOUT_MESSAGE = 'La fabrication du PDF a dépassé 30 secondes.'

/** MessageChannel plutôt que setTimeout : insensible aux horloges simulées des tests. */
function yieldToMainThread(): Promise<void> {
  return new Promise<void>(resolve => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

function slugify(input: string): string {
  return slugifyForFilename(input, 'compte')
}

/** Render the dossier PDF in-memory and return the Blob (used by the preview). */
export async function renderAccountPdfBlob(
  account: Account,
  contacts: Contact[],
  brand: Brand,
  factsBrief: AccountFactsBrief | null = null,
): Promise<Blob> {
  // Cède la main avant le gros du travail : le chargeur de l'aperçu a le temps
  // de se peindre au lieu de rester sur un onglet figé.
  await yieldToMainThread()
  const data = buildAccountPdfData(account, contacts, factsBrief)
  return withTimeout(
    pdf(<AccountPdfDocument data={data} brand={brand} />).toBlob(),
    RENDER_TIMEOUT_MS,
    RENDER_TIMEOUT_MESSAGE,
  )
}

/**
 * Generate the account dossier PDF in-browser via `@react-pdf/renderer` and
 * trigger a download. No popup, no print dialog, works with popup blockers.
 */
export async function exportAccountPdf(
  account: Account,
  contacts: Contact[],
  brand: Brand,
  factsBrief: AccountFactsBrief | null = null,
): Promise<void> {
  const blob = await renderAccountPdfBlob(account, contacts, brand, factsBrief)
  const slug = slugify(account.company_name || 'compte')
  // ⚠️ Le NOM DU FICHIER porte la marque aussi. C'est ce qui reste visible
  // après le téléchargement — dans un dossier, dans une pièce jointe — bien
  // après que l'écran a disparu, et c'est le seul endroit que le contenu du
  // document ne peut pas rattraper.
  downloadBlob(blob, `${slugify(brand.name)}-${slug}.pdf`)
}
