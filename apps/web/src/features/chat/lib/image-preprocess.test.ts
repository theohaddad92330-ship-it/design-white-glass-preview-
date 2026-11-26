import { describe, expect, it, vi } from 'vitest'
import {
  CHAT_IMAGE_MAX_DIMENSION,
  computeTargetDimensions,
  hasIdentifyingMetadata,
  isChatImage,
  needsPreprocessing,
  preprocessChatImageFile,
  readJpegOrientation,
  rotationForOrientation,
  type ImagePreprocessDeps,
} from './image-preprocess'

function jpegWithOrientation(orientation: number | null): Uint8Array {
  // SOI, puis un APP1 minimal portant "Exif\0\0" + un IFD TIFF little-endian
  // avec UNE entrée (0x0112 Orientation) quand `orientation` n'est pas null.
  const tiffHeader = [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00] // 'II', 42, offset IFD=8
  const entries = orientation === null ? [] : [{ tag: 0x0112, value: orientation }]
  const ifd: number[] = [entries.length, 0]
  for (const entry of entries) {
    ifd.push(
      entry.tag & 0xff,
      (entry.tag >> 8) & 0xff,
      0x03,
      0x00, // type SHORT
      0x01,
      0x00,
      0x00,
      0x00, // count = 1
      entry.value & 0xff,
      (entry.value >> 8) & 0xff,
      0x00,
      0x00,
    )
  }
  ifd.push(0x00, 0x00, 0x00, 0x00) // next IFD offset = 0
  const tiff = [...tiffHeader, ...ifd]
  const app1Payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff] // "Exif\0\0" + TIFF
  const app1Size = app1Payload.length + 2
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe1,
    (app1Size >> 8) & 0xff,
    app1Size & 0xff,
    ...app1Payload,
    0xff,
    0xda, // SOS — arrête la lecture
    0x00,
    0x00,
  ])
}

describe('isChatImage', () => {
  it('reconnaît les trois formats lus par le modèle', () => {
    expect(isChatImage({ type: 'image/png', name: 'a.png' })).toBe(true)
    expect(isChatImage({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true)
    expect(isChatImage({ type: '', name: 'a.webp' })).toBe(true)
  })

  it('rejette un document non-image', () => {
    expect(isChatImage({ type: 'application/pdf', name: 'devis.pdf' })).toBe(false)
    expect(isChatImage({ type: '', name: 'archive.zip' })).toBe(false)
  })
})

describe('computeTargetDimensions', () => {
  it('ne touche jamais une image déjà dans les bornes', () => {
    expect(computeTargetDimensions(800, 600, 1568)).toEqual({ width: 800, height: 600 })
  })

  it('réduit en conservant le ratio, jamais en agrandissant', () => {
    expect(computeTargetDimensions(4000, 2000, 1568)).toEqual({ width: 1568, height: 784 })
  })

  it('réduit sur la hauteur quand elle est le plus grand côté', () => {
    expect(computeTargetDimensions(1000, 4000, 1568)).toEqual({ width: 392, height: 1568 })
  })
})

describe('needsPreprocessing', () => {
  it('ne demande rien pour une image droite et dans les bornes', () => {
    expect(needsPreprocessing(800, 600, 1, 1568)).toBe(false)
  })

  it('demande un prétraitement pour une orientation tournée, même en dessous des bornes', () => {
    expect(needsPreprocessing(800, 600, 6, 1568)).toBe(true)
  })

  it('demande un prétraitement pour une image trop grande', () => {
    expect(needsPreprocessing(4000, 3000, 1, 1568)).toBe(true)
  })
})

describe('readJpegOrientation', () => {
  it('rend 1 pour un fichier qui ne commence pas par le magique JPEG', () => {
    expect(readJpegOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1)
  })

  it('rend 1 pour un JPEG sans segment EXIF', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00])
    expect(readJpegOrientation(bytes)).toBe(1)
  })

  it("lit l'orientation 6 (photo mobile tournée à 90°) depuis un vrai segment EXIF", () => {
    expect(readJpegOrientation(jpegWithOrientation(6))).toBe(6)
  })

  it('lit une orientation 3 (180°)', () => {
    expect(readJpegOrientation(jpegWithOrientation(3))).toBe(3)
  })

  it('rend 1 quand le segment EXIF ne porte pas la balise Orientation', () => {
    expect(readJpegOrientation(jpegWithOrientation(null))).toBe(1)
  })
})

describe('hasIdentifyingMetadata', () => {
  it('rend false pour un fichier qui ne commence pas par le magique JPEG', () => {
    expect(hasIdentifyingMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
  })

  it('rend false pour un JPEG sans segment EXIF (aucune métadonnée à minimiser)', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x00])
    expect(hasIdentifyingMetadata(bytes)).toBe(false)
  })

  it("rend true dès qu'un segment EXIF est présent — même sans balise Orientation (GPS, modèle d'appareil, horodatage possibles)", () => {
    expect(hasIdentifyingMetadata(jpegWithOrientation(null))).toBe(true)
  })

  it('rend true pour un segment EXIF portant une orientation déjà normale (1) — la métadonnée reste, seule sa présence compte', () => {
    expect(hasIdentifyingMetadata(jpegWithOrientation(1))).toBe(true)
  })
})

describe('rotationForOrientation', () => {
  it.each([
    [1, 0],
    [3, 180],
    [6, 90],
    [8, 270],
  ])('orientation %i → %i degrés', (orientation, expected) => {
    expect(rotationForOrientation(orientation)).toBe(expected)
  })
})

function makeFile(name: string, type: string, bytes: Uint8Array): File {
  const file = new File([bytes as BlobPart], name, { type })
  // jsdom (v20 ici) ne fournit pas encore `File#arrayBuffer` — le fichier réel
  // (navigateur) le porte nativement ; en test, on le fournit soi-même.
  Object.defineProperty(file, 'arrayBuffer', {
    value: vi.fn().mockResolvedValue(bytes.buffer as ArrayBuffer),
  })
  return file
}

describe('preprocessChatImageFile', () => {
  it("rend le fichier D'ORIGINE, inchangé, pour un document non-image", async () => {
    const file = makeFile('devis.pdf', 'application/pdf', new Uint8Array([1, 2, 3]))
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn(),
      render: vi.fn(),
    }
    const result = await preprocessChatImageFile(file, deps)
    expect(result).toBe(file)
    expect(deps.loadDimensions).not.toHaveBeenCalled()
  })

  it("rend le fichier D'ORIGINE quand l'image est déjà droite et dans les bornes — jamais réencodée sans raison", async () => {
    const file = makeFile('capture.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      render: vi.fn(),
    }
    const result = await preprocessChatImageFile(file, deps)
    expect(result).toBe(file)
    expect(deps.render).not.toHaveBeenCalled()
  })

  it('redimensionne une image trop grande et rend un nouveau fichier', async () => {
    const file = makeFile('grande.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const blob = new Blob(['redimensionnée'], { type: 'image/png' })
    const render = vi.fn().mockResolvedValue(blob)
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn().mockResolvedValue({ width: 4000, height: 2000 }),
      render,
    }
    const result = await preprocessChatImageFile(file, deps)
    expect(render).toHaveBeenCalledWith(file, {
      width: CHAT_IMAGE_MAX_DIMENSION,
      height: 784,
      rotationDegrees: 0,
    })
    expect(result.name).toBe('grande.png')
    expect(result).not.toBe(file)
  })

  it('redresse une photo mobile tournée (orientation EXIF 6) même sous les bornes', async () => {
    const bytes = jpegWithOrientation(6)
    const file = makeFile('photo.jpg', 'image/jpeg', bytes)
    const blob = new Blob(['redressée'], { type: 'image/jpeg' })
    const render = vi.fn().mockResolvedValue(blob)
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn().mockResolvedValue({ width: 600, height: 800 }),
      render,
    }
    await preprocessChatImageFile(file, deps)
    // La cible est calculée sur les dimensions APRÈS rotation (90°) : 800×600.
    expect(render).toHaveBeenCalledWith(file, { width: 800, height: 600, rotationDegrees: 90 })
  })

  it("réencode un JPEG déjà droit et dans les bornes s'il porte un segment EXIF — minimisation avant envoi au modèle (#2433.9)", async () => {
    const bytes = jpegWithOrientation(1)
    const file = makeFile('photo.jpg', 'image/jpeg', bytes)
    const blob = new Blob(['sans-exif'], { type: 'image/jpeg' })
    const render = vi.fn().mockResolvedValue(blob)
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      render,
    }
    const result = await preprocessChatImageFile(file, deps)
    // Aucune rotation ni réduction nécessaire — seul le réencodage (qui ne
    // recopie jamais l'EXIF de la source) sert ici à purger la métadonnée.
    expect(render).toHaveBeenCalledWith(file, { width: 800, height: 600, rotationDegrees: 0 })
    expect(result).not.toBe(file)
  })

  it("se rabat sur le fichier D'ORIGINE si le rendu échoue — un prétraitement cassé ne doit jamais bloquer l'envoi", async () => {
    const file = makeFile('grande.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    const deps: ImagePreprocessDeps = {
      loadDimensions: vi.fn().mockResolvedValue({ width: 4000, height: 2000 }),
      render: vi.fn().mockRejectedValue(new Error('canvas indisponible')),
    }
    const result = await preprocessChatImageFile(file, deps)
    expect(result).toBe(file)
  })
})
