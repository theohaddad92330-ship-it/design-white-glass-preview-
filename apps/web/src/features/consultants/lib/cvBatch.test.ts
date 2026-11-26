import { describe, expect, it, vi } from 'vitest'
import {
  estimateRemainingMs,
  filterCvBatchFiles,
  formatRemainingCv,
  runCvBatch,
  summariseCvBatch,
  type CvBatchOutcome,
} from './cvBatch'

/**
 * #1116 — « j'ai environ 2-3000 CV […] envie de tous les charger dans l'outil ».
 *
 * Ce que ces tests protègent, c'est ce qui casse à 3000 et jamais à 1 : un
 * échec qui emporte le lot, trois mille appels lancés d'un coup, une annulation
 * qui défait ce qui a marché.
 */

const asFile = (name: string) => new File(['x'], name)

describe('la file de dépôt de CV en masse (#1116)', () => {
  it('rend une issue par fichier, DANS L’ORDRE des fichiers', async () => {
    // Un rapport dans l'ordre d'achèvement ne se relit pas.
    const files = ['a.pdf', 'b.pdf', 'c.pdf'].map(asFile)
    const upload = vi.fn(async (file: File): Promise<CvBatchOutcome> => {
      // Le premier est lent : sans conservation de l'ordre, il finirait dernier.
      if (file.name === 'a.pdf') await new Promise(resolve => setTimeout(resolve, 20))
      return { file: file.name, status: 'created', consultantId: file.name }
    })

    const outcomes = await runCvBatch(files, upload)

    expect(outcomes.map(o => o.file)).toEqual(['a.pdf', 'b.pdf', 'c.pdf'])
  })

  it('un CV illisible n’arrête PAS les autres, et porte SA raison', async () => {
    const files = ['ok1.pdf', 'scan.pdf', 'ok2.pdf'].map(asFile)
    const upload = async (file: File): Promise<CvBatchOutcome> => {
      if (file.name === 'scan.pdf') throw new Error('Probablement un scan — saisis le CV à la main.')
      return { file: file.name, status: 'created', consultantId: file.name }
    }

    const outcomes = await runCvBatch(files, upload)

    expect(summariseCvBatch(outcomes)).toMatchObject({ created: 2, failed: 1 })
    // Remplacer la raison par « une erreur est survenue » ferait redéposer le
    // même fichier.
    expect(outcomes.find(o => o.file === 'scan.pdf')).toMatchObject({
      status: 'failed',
      reason: 'Probablement un scan — saisis le CV à la main.',
    })
  })

  it('ne lance jamais plus de fichiers à la fois que sa borne', async () => {
    // Trois mille en parallèle ne vont pas plus vite : ils tombent le service.
    let running = 0
    let peak = 0
    const files = Array.from({ length: 12 }, (_, i) => asFile(`cv-${i}.pdf`))
    const upload = async (file: File): Promise<CvBatchOutcome> => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, 5))
      running -= 1
      return { file: file.name, status: 'created', consultantId: file.name }
    }

    await runCvBatch(files, upload, { concurrency: 3 })

    expect(peak).toBeLessThanOrEqual(3)
  })

  it('s’arrête à la demande, sans défaire ce qui a marché', async () => {
    const files = Array.from({ length: 10 }, (_, i) => asFile(`cv-${i}.pdf`))
    let processed = 0
    const upload = async (file: File): Promise<CvBatchOutcome> => {
      processed += 1
      return { file: file.name, status: 'created', consultantId: file.name }
    }

    const outcomes = await runCvBatch(files, upload, {
      concurrency: 1,
      shouldStop: () => processed >= 4,
    })

    // Ce qui est créé RESTE : une annulation qui supprime des fiches serait la
    // pire des surprises.
    expect(outcomes).toHaveLength(4)
    expect(processed).toBe(4)
  })

  it('annonce sa progression à chaque fichier', async () => {
    const seen: number[] = []
    const files = ['a.pdf', 'b.pdf'].map(asFile)

    await runCvBatch(files, async file => ({ file: file.name, status: 'created', consultantId: file.name }), {
      concurrency: 1,
      onProgress: progress => seen.push(progress.done),
    })

    expect(seen).toEqual([1, 2])
  })

  it('compte les doublons à part — sautés, jamais fusionnés', async () => {
    // Poser trois mille questions n'est pas une fonctionnalité ; écrire un
    // doublon non plus.
    const files = ['a.pdf', 'b.pdf'].map(asFile)
    const outcomes = await runCvBatch(files, async file =>
      file.name === 'b.pdf'
        ? { file: file.name, status: 'duplicate', matched: ['Jean Dupont'] }
        : { file: file.name, status: 'created', consultantId: 'c-1' },
    )

    expect(summariseCvBatch(outcomes)).toMatchObject({ created: 1, duplicate: 1 })
  })

  it('ne fait rien, calmement, sur une liste vide', async () => {
    expect(await runCvBatch([], async () => ({ file: '', status: 'failed', reason: '' }))).toEqual([])
  })
})

/**
 * #2183.4 — le dossier ENTIER, pas juste une sélection multiple de fichiers.
 *
 * `webkitdirectory` ne respecte PAS `accept` : un dossier réel porte des
 * `.DS_Store`, des sous-dossiers cachés, des captures d'écran — les envoyer au
 * lot les compterait comme des ÉCHECS alors que ce ne sont simplement pas des
 * CV. Le filtre est CÔTÉ CLIENT, avant tout appel réseau : rien n'est deviné,
 * la liste des formats reconnus est la même que le dépôt unitaire.
 */
describe('filterCvBatchFiles (#2183.4 — dossier entier)', () => {
  it('garde les formats de CV reconnus, dans leur ordre', () => {
    const files = ['a.pdf', 'b.docx', 'c.doc', 'd.rtf', 'e.txt', 'f.md'].map(asFile)
    expect(filterCvBatchFiles(files).map(f => f.name)).toEqual(['a.pdf', 'b.docx', 'c.doc', 'd.rtf', 'e.txt', 'f.md'])
  })

  it('#3935.5 — accepte les CV en image (photo, capture), lus par l’OCR', () => {
    const files = ['a.png', 'b.JPG', 'c.jpeg', 'd.webp', 'e.gif', 'f.heic'].map(asFile)
    expect(filterCvBatchFiles(files).map(f => f.name)).toEqual(['a.png', 'b.JPG', 'c.jpeg', 'd.webp'])
  })

  it('écarte les fichiers système et cachés d’un dossier réel, sans les compter', () => {
    const files = ['.DS_Store', 'cv.pdf', '.hidden'].map(asFile)
    expect(filterCvBatchFiles(files).map(f => f.name)).toEqual(['cv.pdf'])
  })

  it('écarte une extension non reconnue plutôt que de la deviner', () => {
    const files = ['animation.gif', 'cv.pdf', 'notes.xlsx'].map(asFile)
    expect(filterCvBatchFiles(files).map(f => f.name)).toEqual(['cv.pdf'])
  })

  it('compare l’extension sans tenir compte de la casse', () => {
    const files = ['CV.PDF'].map(asFile)
    expect(filterCvBatchFiles(files).map(f => f.name)).toEqual(['CV.PDF'])
  })
})

/**
 * #2183.43 — « temps restant », un FAIT calculé sur ce qui vient d'être
 * mesuré, jamais un pourcentage inventé (même doctrine que `CvIntakeProgress`,
 * `CvDropZone.tsx`). Des horodatages passés en PARAMÈTRE, jamais `Date.now()`
 * lu à l'intérieur — un test qui dépend de l'horloge réelle est flaky par
 * construction (leçon du 21/09).
 */
describe('estimateRemainingMs (#2183.43 — temps restant)', () => {
  it('rend `null` tant qu’aucun fichier n’est traité — rien à extrapoler', () => {
    expect(estimateRemainingMs({ startedAt: 1000, now: 5000, done: 0, total: 10 })).toBeNull()
  })

  it('rend `null` une fois le lot terminé — plus rien à attendre', () => {
    expect(estimateRemainingMs({ startedAt: 1000, now: 5000, done: 10, total: 10 })).toBeNull()
  })

  it('extrapole le temps moyen par fichier sur ce qui reste', () => {
    // 4 secondes pour 2 fichiers ⇒ 2 s/fichier ⇒ 8 restants ⇒ 16 s.
    expect(estimateRemainingMs({ startedAt: 1000, now: 5000, done: 2, total: 10 })).toBe(16000)
  })

  it('ne rend jamais un temps négatif si l’horloge recule d’un poil (skew)', () => {
    expect(estimateRemainingMs({ startedAt: 5000, now: 4999, done: 1, total: 10 })).toBeNull()
  })
})

/**
 * #2183.43 — la fonction n'existait qu'en LOGIQUE (`estimateRemainingMs`,
 * `cfd96f846`) : personne ne l'appelait dans `CvDropZone.tsx`. `formatRemainingCv`
 * est le pont vers l'écran — secondes sous 90 s (une minute arrondie mentirait
 * sur un lot de 3 CV), minutes au-delà.
 */
describe('formatRemainingCv (#2183.43 — unité affichée)', () => {
  it('affiche des secondes sous 90 s', () => {
    expect(formatRemainingCv(16000)).toEqual({ unit: 'seconds', count: 16 })
  })

  it('ne rend jamais 0 seconde — un reste sous la seconde reste « 1 »', () => {
    expect(formatRemainingCv(400)).toEqual({ unit: 'seconds', count: 1 })
  })

  it('bascule en minutes à partir de 90 s', () => {
    expect(formatRemainingCv(150_000)).toEqual({ unit: 'minutes', count: 3 })
  })
})
