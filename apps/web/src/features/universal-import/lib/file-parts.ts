import { UNIVERSAL_IMPORT_PART_BYTES } from '@bellum/contracts'

/**
 * L'UPLOAD FRACTIONNÉ — un fichier de n'importe quelle taille part en morceaux
 * de {@link UNIVERSAL_IMPORT_PART_BYTES}, lus UN par UN (`Blob.slice`) : le
 * navigateur ne charge jamais le fichier entier en mémoire. La taille de part
 * vit dans le contrat (GA-26) — le serveur refuse une part plus grande.
 */
export function partCountOf(sizeBytes: number, partBytes: number = UNIVERSAL_IMPORT_PART_BYTES): number {
  return Math.max(1, Math.ceil(sizeBytes / partBytes))
}

/** Des octets en base64, par tranches — `btoa` sur 4 Mo d'un coup dépasse la pile d'appels. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let offset = 0; offset < bytes.length; offset += step) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + step))
  }
  return btoa(binary)
}

/** La part `index` du fichier, en base64. */
export async function readPartB64(
  file: Blob,
  index: number,
  partBytes: number = UNIVERSAL_IMPORT_PART_BYTES,
): Promise<string> {
  const slice = file.slice(index * partBytes, (index + 1) * partBytes)
  return bytesToBase64(new Uint8Array(await readBlob(slice)))
}

/** `FileReader` plutôt que `Blob.arrayBuffer()` : présent partout, y compris les navigateurs d'entreprise plus anciens. */
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible.'))
    reader.readAsArrayBuffer(blob)
  })
}
