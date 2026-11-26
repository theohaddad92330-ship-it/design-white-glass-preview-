import type { PortabilityManifest, PortableFormat } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * L'écran « Mes données » (PDF 7 §9.2) côté client.
 *
 * ⚠️ Le téléchargement d'UN objet passe par `apiFetch` avec
 * `responseType: 'text'`, et pas par un `<a href>` direct vers l'API : la porte
 * unique porte l'identité d'onglet, le repli d'origine et la détection de
 * session morte (GA « une seule porte »). Un lien nu perdrait les trois — et le
 * parser JSON par défaut détruirait un CSV.
 */
export const portabilityApi = {
  manifest(): Promise<PortabilityManifest> {
    return apiFetch<PortabilityManifest>({ path: '/privacy/portability' })
  },

  /** Télécharge UN objet, dans le format demandé. */
  async downloadObject(payloadKey: string, format: PortableFormat): Promise<void> {
    const body = await apiFetch<string>({
      path: `/privacy/export/object?object=${encodeURIComponent(payloadKey)}&format=${format}`,
      responseType: 'text',
    })
    const stamp = new Date().toISOString().slice(0, 10)
    saveAs(body, `bellum-${payloadKey}-${stamp}.${format}`, format === 'csv' ? 'text/csv' : 'application/json')
  },
}

/**
 * Enregistre un texte comme fichier.
 *
 * Un seul endroit : deux implémentations du même geste divergent sur Safari,
 * qui exige que l'URL de l'objet survive au clic — d'où le `setTimeout` avant
 * de la révoquer.
 */
export function saveAs(body: string, filename: string, mime: string): void {
  const blob = new Blob([body], { type: `${mime};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}
