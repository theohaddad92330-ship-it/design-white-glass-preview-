import { useEffect, useRef, useState } from 'react'

type PreviewState =
  | { status: 'idle'; url: null; error: null }
  | { status: 'loading'; url: null; error: null }
  | { status: 'ready'; url: string; error: null }
  | { status: 'error'; url: null; error: string }

const IDLE: PreviewState = { status: 'idle', url: null, error: null }

/**
 * #4073 — l'aperçu du dossier PDF. Remplace `<PDFViewer>` de `@react-pdf` :
 * ses enfants sont un élément NEUF à chaque rendu de la feuille, et il refait
 * tout le document (lourd, sur le fil principal) à chaque nouvelle identité —
 * le chargeur, la marque, la lecture des faits relançaient donc le rendu, et
 * l'onglet restait figé sur un iframe blanc.
 *
 * Ici le document est fabriqué UNE fois par ouverture ; le rendeur le plus
 * récent est lu par `ref`, jamais comme dépendance. Un échec devient un état
 * `error` (jamais une attente infinie) et l'URL est libérée à la fermeture.
 */
export function useAccountPdfPreviewUrl(renderPdfBlob: () => Promise<Blob>, open: boolean): PreviewState {
  const [state, setState] = useState<PreviewState>(IDLE)
  const latest = useRef(renderPdfBlob)
  latest.current = renderPdfBlob

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let url: string | null = null
    setState({ status: 'loading', url: null, error: null })
    latest
      .current()
      .then(blob => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setState({ status: 'ready', url, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({ status: 'error', url: null, error: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setState(IDLE)
    }
  }, [open])

  return state
}
