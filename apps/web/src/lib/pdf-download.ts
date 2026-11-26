/**
 * #2090.35 / #2074.9 — EXTRAIT de `account-pdf/export.tsx` pour que le PDF du
 * dossier de compte et le PDF de l'audit commercial téléchargent leur Blob de
 * la MÊME façon (GA-26 : un réglage vit à un seul endroit), au lieu de deux
 * copies du même petit mécanisme qui pourraient diverger en silence.
 */

/** Un nom de fichier sûr : sans accent, sans espace, jamais vide. */
export function slugifyForFilename(input: string, fallback: string): string {
  return (
    input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || fallback
  )
}

/** Déclenche le téléchargement d'un Blob — sans popup, sans dialogue d'impression. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Defer revocation so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4_000)
}
