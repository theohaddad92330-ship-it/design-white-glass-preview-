/**
 * #2876 (#2433.12) — PRÉTRAITEMENT D'UNE IMAGE JOINTE AU CHAT : réduction et
 * orientation, AVANT l'envoi au modèle (`extract_images_text`, apps/ia).
 *
 * Distinct de `ocr.py` (CV / notes de frais) : ce pipeline est celui du chat
 * (pièce « pour ce fil », `ATTACH_EXTENSIONS`), qui ne porte AUCUNE garde de
 * non-retouche — `test_sends_the_original_bytes_unmodified_no_local_retouching`
 * (`apps/ia/tests/test_cv_capacities.py:75`) ne s'applique qu'à `ocr.py`.
 *
 * CE QUE ÇA FAIT. Une photo mobile arrive souvent tournée (EXIF Orientation
 * 3/6/8, jamais appliqué par le décodage brut) et à une résolution que
 * l'API n'a pas besoin de lire en entier (`_MAX_IMAGE_BYTES`, 5 Mo, refuse déjà
 * le surdimensionné — mais un envoi plus léger part plus vite et coûte moins).
 * Une image DÉJÀ droite et dans les bornes part TELLE QUELLE, octet pour octet
 * — jamais réencodée sans raison.
 *
 * CE QUE ÇA NE FAIT PAS. Aucune amélioration de lisibilité (netteté, contraste,
 * texte réécrit) : uniquement une rotation géométrique, une réduction
 * d'échelle et — depuis #2433.9 — la purge du segment EXIF, trois opérations
 * qui ne changent aucun caractère du contenu visible.
 *
 * MINIMISATION (#2433.9). Un JPEG issu d'un téléphone porte souvent, au-delà
 * de l'orientation, un segment EXIF avec position GPS, modèle d'appareil et
 * horodatage — aucun rapport avec ce que Laura doit LIRE dans l'image, et une
 * donnée qui n'a rien à faire chez un fournisseur multimodal externe. La
 * seule PRÉSENCE de ce segment déclenche un réencodage (qui ne le recopie
 * jamais), même sur une image déjà droite et dans les bornes. Distinct du
 * refus doctrinal sur `ocr.py` (CV/notes de frais) : cette garde-là interdit
 * toute retouche de l'octet envoyé à Mistral OCR ; ce fichier n'a AUCUNE garde
 * de ce genre (chemin chat, pipeline différent) — voir note plus haut.
 *
 * TESTABILITÉ. Le décodage JPEG/EXIF et le calcul de dimensions sont des
 * fonctions PURES (testées sans navigateur). Le rendu réel (`<canvas>`,
 * `Image`) n'existe qu'en navigateur — `preprocessChatImageFile` accepte des
 * dépendances injectables pour rester testable sans canvas réel (jsdom n'en a
 * pas).
 */

/** Bornes documentées par Anthropic pour une image sur `/v1/messages` : au-delà,
 *  le modèle redimensionne lui-même — envoyer déjà à cette taille ne change rien
 *  à ce qu'il lit, et allège l'envoi. */
export const CHAT_IMAGE_MAX_DIMENSION = 1568

const CHAT_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Une image du chemin ÉPHÉMÈRE du chat (`ATTACH_EXTENSIONS` : png/jpg/jpeg/webp) —
 *  jamais un PDF, un Office ou une archive, qui ne passent pas par ce prétraitement. */
export function isChatImage(file: Pick<File, 'type' | 'name'>): boolean {
  if (CHAT_IMAGE_MIME_TYPES.has(file.type)) return true
  return /\.(png|jpe?g|webp)$/i.test(file.name)
}

/**
 * Nouvelles dimensions, échelle conservée, jamais agrandies : une image déjà
 * dans les bornes rend ses dimensions D'ORIGINE, inchangées.
 */
export function computeTargetDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0 || maxDimension <= 0) return { width, height }
  const largestSide = Math.max(width, height)
  if (largestSide <= maxDimension) return { width, height }
  const scale = maxDimension / largestSide
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** #2433.12 — une image déjà droite (orientation 1) et déjà dans les bornes ne
 *  demande AUCUN prétraitement : c'est le cas le plus courant (capture d'écran
 *  desktop), et l'octet d'origine part tel quel. */
export function needsPreprocessing(width: number, height: number, orientation: number, maxDimension: number): boolean {
  if (orientation !== 1) return true
  return Math.max(width, height) > maxDimension
}

/**
 * L'orientation EXIF (1 à 8) d'un JPEG, lue directement dans les octets — 1
 * (normale) pour tout ce qui n'est pas un JPEG, ou un JPEG sans segment EXIF
 * lisible. PNG et WebP ne portent jamais cette balise : jamais appelée pour eux.
 */
/** Le segment APP1 "Exif" d'un JPEG (au-delà de l'en-tête "Exif\0\0"), ou
 *  `null` s'il n'y en a aucun — PNG/WebP n'en portent jamais par ce chemin, un
 *  JPEG peut très bien ne pas en avoir (capture d'écran, image déjà nettoyée). */
function findExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1]
    // SOI/EOI n'ont pas de segment de taille derrière eux.
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    // SOS (début des données image) : plus aucun marqueur de métadonnées ne suit.
    if (marker === 0xda) break
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3]
    if (size < 2 || offset + 2 + size > bytes.length) break
    if (marker === 0xe1) {
      const segment = bytes.subarray(offset + 4, offset + 2 + size)
      if (
        segment.length >= 6 &&
        segment[0] === 0x45 &&
        segment[1] === 0x78 &&
        segment[2] === 0x69 &&
        segment[3] === 0x66
      ) {
        return segment
      }
    }
    offset += 2 + size
  }
  return null
}

export function readJpegOrientation(bytes: Uint8Array): number {
  const segment = findExifSegment(bytes)
  if (!segment) return 1
  const orientation = readExifOrientation(segment)
  return orientation ?? 1
}

/** #2433.9 — la seule PRÉSENCE d'un segment EXIF suffit à déclencher une
 *  minimisation : au-delà de l'orientation (déjà lue), ce segment peut porter
 *  une position GPS, un modèle d'appareil ou un horodatage — aucune de ces
 *  informations n'aide Laura à lire l'image, et les envoyer telles quelles à
 *  un fournisseur multimodal externe serait le contraire de la minimisation. */
export function hasIdentifyingMetadata(bytes: Uint8Array): boolean {
  return findExifSegment(bytes) !== null
}

function readExifOrientation(segment: Uint8Array): number | null {
  // En-tête "Exif\0\0" (6 octets) avant le bloc TIFF.
  if (segment.length < 14 || segment[0] !== 0x45 || segment[1] !== 0x78 || segment[2] !== 0x69 || segment[3] !== 0x66) {
    return null
  }
  const tiff = segment.subarray(6)
  const little = tiff[0] === 0x49 && tiff[1] === 0x49 // 'II' = little-endian, 'MM' = big-endian
  const readU16 = (o: number) => (little ? tiff[o] | (tiff[o + 1] << 8) : (tiff[o] << 8) | tiff[o + 1])
  const readU32 = (o: number) =>
    little
      ? (tiff[o] | (tiff[o + 1] << 8) | (tiff[o + 2] << 16) | (tiff[o + 3] << 24)) >>> 0
      : ((tiff[o] << 24) | (tiff[o + 1] << 16) | (tiff[o + 2] << 8) | tiff[o + 3]) >>> 0
  const ifdOffset = readU32(4)
  if (ifdOffset + 2 > tiff.length) return null
  const entryCount = readU16(ifdOffset)
  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdOffset + 2 + i * 12
    if (entryOffset + 12 > tiff.length) break
    const tag = readU16(entryOffset)
    if (tag === 0x0112) {
      const value = readU16(entryOffset + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return null
}

/** L'angle (degrés, horaire) et le retournement que chaque orientation EXIF
 *  demande — les 4 valeurs (5 à 8) qui impliquent un miroir sont hors-champ
 *  ici : jamais produites par un appareil photo, seulement par un logiciel de
 *  retouche, et un chat métier n'a pas à les corriger. */
export function rotationForOrientation(orientation: number): number {
  if (orientation === 3) return 180
  if (orientation === 6) return 90
  if (orientation === 8) return 270
  return 0
}

export type ImagePreprocessDeps = {
  /** Décode le fichier et rend ses dimensions naturelles. */
  loadDimensions: (file: File) => Promise<{ width: number; height: number }>
  /** Rend un nouveau blob, redressé et redimensionné. */
  render: (file: File, target: { width: number; height: number; rotationDegrees: number }) => Promise<Blob>
}

/**
 * Le prétraitement RÉEL, appelé avant `fileToBase64` sur le chemin éphémère du
 * chat. Ne touche JAMAIS un fichier qui n'en a pas besoin (jamais réencodé sans
 * raison), et se rabat sur le fichier D'ORIGINE au moindre échec — un
 * prétraitement qui casse l'envoi serait pire que son absence.
 */
export async function preprocessChatImageFile(file: File, deps: ImagePreprocessDeps): Promise<File> {
  if (!isChatImage(file)) return file
  try {
    const isJpeg = file.type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)
    const bytes = isJpeg ? new Uint8Array(await file.arrayBuffer()) : null
    const orientation = bytes ? readJpegOrientation(bytes) : 1
    const metadata = bytes ? hasIdentifyingMetadata(bytes) : false
    const { width, height } = await deps.loadDimensions(file)
    if (!needsPreprocessing(width, height, orientation, CHAT_IMAGE_MAX_DIMENSION) && !metadata) return file
    const rotationDegrees = rotationForOrientation(orientation)
    const swapped = rotationDegrees === 90 || rotationDegrees === 270
    const target = computeTargetDimensions(swapped ? height : width, swapped ? width : height, CHAT_IMAGE_MAX_DIMENSION)
    const blob = await deps.render(file, { ...target, rotationDegrees })
    return new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified })
  } catch (error) {
    console.error('[Chat attach] preprocessing failed, sending the original file', error)
    return file
  }
}

/** Les dépendances RÉELLES (navigateur) — `<canvas>`/`Image`, jamais exercées
 *  en test (jsdom n'a pas de canvas réel) : voir `ImagePreprocessDeps` pour la
 *  version injectable qui rend `preprocessChatImageFile` testable. */
const browserImagePreprocessDeps: ImagePreprocessDeps = {
  loadDimensions: file =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        URL.revokeObjectURL(url)
        resolve({ width: image.naturalWidth, height: image.naturalHeight })
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image decode failed'))
      }
      image.src = url
    }),
  render: (file, { width, height, rotationDegrees }) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const image = new Image()
      image.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('canvas 2d context unavailable'))
          return
        }
        context.translate(canvas.width / 2, canvas.height / 2)
        context.rotate((rotationDegrees * Math.PI) / 180)
        const swapped = rotationDegrees === 90 || rotationDegrees === 270
        const drawWidth = swapped ? height : width
        const drawHeight = swapped ? width : height
        context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight)
        canvas.toBlob(
          blob => (blob ? resolve(blob) : reject(new Error('canvas export failed'))),
          file.type || 'image/png',
        )
      }
      image.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('image decode failed'))
      }
      image.src = url
    }),
}

/** Le point d'entrée réel — appelé par `Chat.tsx` avant `fileToBase64` sur le
 *  chemin éphémère (`scope === 'conversation'`) d'une image. */
export function preprocessChatImage(file: File): Promise<File> {
  return preprocessChatImageFile(file, browserImagePreprocessDeps)
}
