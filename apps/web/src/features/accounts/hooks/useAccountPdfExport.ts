import { ensureError } from '@bellum/errors'
import type { Account, Contact } from '@bellum/contracts'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { useFeatureLock } from '@/features/plan-features/useFeatureLock'
import { useBrand } from '@/features/brand/brand-context'
import { useAccountFactsBrief } from '@/features/account-facts/useAccountFactsBrief'
import { exportAccountPdf, renderAccountPdfBlob } from '@/lib/account-pdf/export'
import { toPdfRenderError } from '@/lib/account-pdf/failure'

type UseAccountPdfExportResult = {
  exportPdf: () => Promise<void>
  /** Render the PDF document in-memory (without downloading) — used for previews. */
  renderPdfBlob: () => Promise<Blob>
  isExporting: boolean
  /** L'offre en cours n'inclut pas les exports : le bouton doit être GRISÉ. */
  locked: boolean
  /** La fenêtre d'upsell ouverte par un clic sur le bouton grisé. À rendre
   *  dans l'arbre à côté du bouton (`null` quand la fonction est ouverte). */
  lockDialog: ReactNode
}

/**
 * Lazy-loads `@/lib/account-pdf/export` on first call so `@react-pdf/renderer`
 * stays out of the initial bundle. Exposes both a download flow and a blob
 * builder for the in-app preview.
 *
 * Gating par offre : le PDF est fabriqué DANS le navigateur, donc aucun serveur
 * ne peut le refuser. Le refus vit ici — le bouton reste visible mais grisé, et
 * le clic ouvre ce qu'il faut savoir pour l'obtenir (palier, prix, ce qu'il
 * débloque) plutôt qu'un toast d'erreur qui ne mène nulle part.
 */
export function useAccountPdfExport(account: Account, contacts: Contact[]): UseAccountPdfExportResult {
  const [isExporting, setIsExporting] = useState(false)
  const lock = useFeatureLock('exports')
  // #2081.14 — livrable commercial, décision Louis 19/09 : le PDF du compte
  // n'est plus tenu par la règle d'espace « qui peut exporter ».
  // Le PDF est fabriqué DANS le navigateur : la marque doit donc être lue ici,
  // le rendu `@react-pdf/renderer` n'atteignant aucun contexte React.
  const brand = useBrand()
  // #4073.1 (13/10/2026) — même lecteur que l'écran (#4072.3) et l'export CSV
  // d'une liste (#4073) : `null` en échec de lecture, la section est alors
  // absente du PDF plutôt qu'inventée.
  const factsBrief = useAccountFactsBrief(account.id)

  const download = useCallback(async () => {
    setIsExporting(true)
    try {
      await exportAccountPdf(account, contacts, brand, factsBrief)
      toast.success(i18n.t('accounts:toast.pdfDownloaded'), {
        description: i18n.t('accounts:toast.pdfReady', {
          name: account.company_name || i18n.t('accounts:pdf.fallbackAccountName'),
        }),
      })
    } catch (error) {
      // #2116.53 — l'échec portait un titre générique et RIEN d'autre : la
      // cause (police absente, mémoire, image illisible) restait dans la
      // console. Elle voyage maintenant dans la description, comme la porte de
      // priorisation le fait déjà pour la phrase du serveur.
      toast.error(i18n.t('accounts:toast.pdfError'), { description: ensureError(error).message })
      throw toPdfRenderError(error)
    } finally {
      setIsExporting(false)
    }
  }, [account, contacts, brand, factsBrief])

  /**
   * #2116.43, .53 — la promesse du téléchargement est CONSERVÉE au lieu d'être
   * jetée (`void download()`). Deux conséquences, les deux voulues :
   *  · `exportPdf` ne rend la main qu'une fois le fichier écrit — sans ça, le
   *    bouton se croyait libre avant que quoi que ce soit existe, et un double
   *    clic fabriquait deux fois le document ;
   *  · l'échec ne part plus en rejet non géré. Il est DÉJÀ annoncé par
   *    `download` (toast + cause) ; le relancer ici n'atteindrait qu'un
   *    `onClick`, où une promesse rejetée redevient exactement ce rejet.
   */
  const runningExport = useRef<Promise<void> | null>(null)
  // `guard` court-circuite le téléchargement quand l'offre ne l'inclut pas.
  const guardedExport = lock.guard(() => {
    runningExport.current = download()
  })
  const exportPdf = useCallback(async () => {
    // On compare AVANT et APRÈS plutôt que de remettre la référence à `null` :
    // `guard` court-circuite quand l'offre n'inclut pas les exports, et il ne
    // faut alors attendre ni l'ancienne promesse, ni rien du tout.
    const avant = runningExport.current
    guardedExport()
    const lancee = runningExport.current
    if (lancee && lancee !== avant) await lancee.catch(() => undefined)
  }, [guardedExport])

  const renderPdfBlob = useCallback(async () => {
    try {
      return await renderAccountPdfBlob(account, contacts, brand, factsBrief)
    } catch (error) {
      throw toPdfRenderError(error)
    }
  }, [account, contacts, brand, factsBrief])

  return {
    exportPdf,
    renderPdfBlob,
    isExporting,
    locked: lock.locked,
    lockDialog: lock.dialog,
  }
}
