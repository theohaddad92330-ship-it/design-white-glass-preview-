/**
 * Le fichier → base64, sans le préfixe `data:` que le lecteur ajoute.
 *
 * Extrait du dépôt unitaire (`CvDropZone.tsx`) pour être partagé avec l'import
 * ZIP (#2569.1) — même règle de transport, un seul endroit qui la porte.
 */
export function fileToBase64(file: File): Promise<string> {
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
