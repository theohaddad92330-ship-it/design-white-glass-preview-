import { describe, expect, it } from 'vitest'
import {
  isExecutableOrMacro,
  isNestedArchive,
  isPathEscapingArchive,
  RAG_ZIP_MAX_DECOMPRESSED_BYTES,
  RAG_ZIP_MAX_ENTRIES,
  ragZipCapRefusalMessage,
  validateRagZipEntries,
} from './rag-zip-ingest.js'

/**
 * #2667.1 — décision Louis (QCM du 21/09/2026) : un .zip joint au chat est
 * déplié CÔTÉ SERVEUR, ses entrées lisibles deviennent des pièces jointes.
 * « Les plafonds sont obligatoires et testés » — ce fichier tient la
 * DÉCISION pure (aucun zip réel, aucun réseau) : le service NestJS
 * (`apps/api/src/modules/rag/rag-zip-ingest.service.ts`) ne fait que mesurer
 * une archive réelle et lui poser ces questions.
 *
 * Refus EN BLOC : une archive qui dépasse un plafond, ou qui porte une entrée
 * hostile, est refusée ENTIÈREMENT (jamais une ingestion partielle sur un cas
 * suspect) — distinct d'un fichier illisible DEDANS une archive par ailleurs
 * saine, qui n'arrête pas les autres (côté service, pas ici).
 */
describe('validateRagZipEntries', () => {
  it('accepte une archive sous les deux plafonds, sans entrée hostile', () => {
    const entries = [
      { name: 'cv-dupont.pdf', decompressedSize: 100_000 },
      { name: 'notes.txt', decompressedSize: 2_000 },
    ]
    expect(validateRagZipEntries(entries)).toBeNull()
  })

  it('refuse — nommément — une archive avec plus de RAG_ZIP_MAX_ENTRIES entrées', () => {
    const entries = Array.from({ length: RAG_ZIP_MAX_ENTRIES + 1 }, (_, i) => ({
      name: `f${i}.txt`,
      decompressedSize: 10,
    }))
    const refusal = validateRagZipEntries(entries)
    expect(refusal).toEqual({ code: 'too_many_entries', count: RAG_ZIP_MAX_ENTRIES + 1, max: RAG_ZIP_MAX_ENTRIES })
  })

  it('refuse — nommément — une archive dont le cumul décompressé dépasse le plafond', () => {
    const entries = [
      { name: 'gros.pdf', decompressedSize: RAG_ZIP_MAX_DECOMPRESSED_BYTES },
      { name: 'petit.txt', decompressedSize: 1 },
    ]
    const refusal = validateRagZipEntries(entries)
    expect(refusal).toEqual({
      code: 'too_large',
      totalBytes: RAG_ZIP_MAX_DECOMPRESSED_BYTES + 1,
      maxBytes: RAG_ZIP_MAX_DECOMPRESSED_BYTES,
    })
  })

  it('refuse — nommément — une entrée dont le chemin sort de l’archive (`..`)', () => {
    const entries = [{ name: '../../etc/passwd', decompressedSize: 10 }]
    expect(validateRagZipEntries(entries)).toEqual({
      code: 'path_escapes_archive',
      file: '../../etc/passwd',
    })
  })

  it('refuse — nommément — un chemin absolu', () => {
    expect(validateRagZipEntries([{ name: '/etc/passwd', decompressedSize: 10 }])).toEqual({
      code: 'path_escapes_archive',
      file: '/etc/passwd',
    })
  })

  it('refuse — nommément — une archive imbriquée', () => {
    expect(validateRagZipEntries([{ name: 'dossier/interne.zip', decompressedSize: 10 }])).toEqual({
      code: 'nested_archive',
      file: 'dossier/interne.zip',
    })
  })
})

describe('isPathEscapingArchive', () => {
  it('sait dire NON sur un chemin relatif ordinaire', () => {
    expect(isPathEscapingArchive('dossier/fichier.pdf')).toBe(false)
  })
  it('détecte un segment `..` n’importe où dans le chemin', () => {
    expect(isPathEscapingArchive('dossier/../../fichier.pdf')).toBe(true)
  })
})

describe('isNestedArchive', () => {
  it('sait dire NON sur un fichier ordinaire', () => {
    expect(isNestedArchive('cv.pdf')).toBe(false)
  })
  it('détecte une extension .zip, insensible à la casse', () => {
    expect(isNestedArchive('lot.ZIP')).toBe(true)
  })
})

/**
 * « Un refus DIT pourquoi ; jamais un échec muet. » Chaque message NOMME le
 * chiffre mesuré et le plafond — jamais un « refusé » générique qui laisserait
 * deviner lequel des quatre motifs a joué.
 */
describe('ragZipCapRefusalMessage', () => {
  it('nomme le compte et le plafond dépassés', () => {
    const message = ragZipCapRefusalMessage({ code: 'too_many_entries', count: 25, max: 20 })
    expect(message).toContain('25')
    expect(message).toContain('20')
  })

  it('nomme la taille cumulée et le plafond, en Mo', () => {
    const message = ragZipCapRefusalMessage({ code: 'too_large', totalBytes: 41_000_000, maxBytes: 40_000_000 })
    expect(message).toContain('41')
    expect(message).toContain('40')
  })

  it('nomme le fichier dont le chemin sort de l’archive', () => {
    expect(ragZipCapRefusalMessage({ code: 'path_escapes_archive', file: '../secret.txt' })).toContain('../secret.txt')
  })

  it('nomme l’archive imbriquée refusée', () => {
    expect(ragZipCapRefusalMessage({ code: 'nested_archive', file: 'lot.zip' })).toContain('lot.zip')
  })
})

/**
 * #2431.8 — une archive qui porte un EXÉCUTABLE ou un document Office À
 * MACROS est refusée ENTIÈRE, avant extraction, comme une archive imbriquée :
 * rien n'y est jamais exécuté, mais on ne l'indexe pas non plus.
 */
describe('#2431.8 — exécutables et macros dans une archive', () => {
  it.each(['outils/setup.exe', 'run.BAT', 'script.ps1', 'lib.dll', 'install.sh', 'appli.jar', 'macro.vbs'])(
    'refuse l’exécutable %s',
    name => {
      expect(validateRagZipEntries([{ name, decompressedSize: 10 }])).toEqual({
        code: 'executable_or_macro',
        file: name,
      })
    },
  )

  it.each(['budget.xlsm', 'offre.docm', 'deck.PPTM', 'modele.dotm', 'addin.xlam'])(
    'refuse le document à macros %s',
    name => {
      expect(validateRagZipEntries([{ name, decompressedSize: 10 }])).toEqual({
        code: 'executable_or_macro',
        file: name,
      })
    },
  )

  it('sait dire NON sur des documents ordinaires', () => {
    for (const name of ['cv.pdf', 'offre.docx', 'budget.xlsx', 'deck.pptx', 'notes.md', 'executable-plan.txt']) {
      expect(isExecutableOrMacro(name)).toBe(false)
    }
  })

  // Le brief #2431 liste aussi les « mots de passe » : une entrée CHIFFRÉE ne
  // se lit pas sans secret, on ne le demande pas — refus nommé, en bloc.
  it('refuse une entrée chiffrée par mot de passe, et sait dire NON sinon', () => {
    expect(validateRagZipEntries([{ name: 'paie.pdf', decompressedSize: 10, encrypted: true }])).toEqual({
      code: 'encrypted_entry',
      file: 'paie.pdf',
    })
    expect(validateRagZipEntries([{ name: 'paie.pdf', decompressedSize: 10, encrypted: false }])).toBeNull()
    expect(ragZipCapRefusalMessage({ code: 'encrypted_entry', file: 'paie.pdf' })).toMatch(/paie\.pdf.*mot de passe/)
  })

  it('nomme le fichier refusé et la raison', () => {
    const message = ragZipCapRefusalMessage({ code: 'executable_or_macro', file: 'setup.exe' })
    expect(message).toContain('setup.exe')
    expect(message).toMatch(/exécutable|macro/i)
  })
})
