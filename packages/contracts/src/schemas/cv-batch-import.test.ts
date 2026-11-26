import { describe, expect, it } from 'vitest'
import {
  buildCvBatchImportJobState,
  buildCvZipManifest,
  classifyCvExtractFailure,
  cvFilesImportInputSchema,
  cvZipLargeImportStartSchema,
  cvZipLargeUploadTicketRequestSchema,
  cvZipImportRoute,
  decideCvBatchFileAction,
  estimateCvBatchImportEtaSeconds,
  extractCvEmail,
  extractCvPhone,
  incomingCvIsMoreRecent,
  isCvZipNestedArchiveEntry,
  isCvZipNoiseEntry,
  isRecognizedCvExtension,
  hasSpreadsheetExtension,
  looksTabularText,
  sniffCvFileKind,
  summariseCvBatchImport,
  CV_INTAKE_STEPS,
  CV_ZIP_LARGE_ARCHIVE_MAX_BYTES,
  CV_ZIP_MAX_ARCHIVE_BYTES,
} from './cv-batch-import.js'
import type { TalentDuplicateMatch } from './talent-duplicates.js'
import { IMPORT_FILE_MAX_BYTES } from './import-limits.js'

/** Une correspondance minimale, pour ne pas répéter les neuf champs à chaque cas. */
function match(overrides: Partial<TalentDuplicateMatch> = {}): TalentDuplicateMatch {
  return {
    talentId: 't1',
    fullName: 'Jean Dupont',
    reason: 'same_email',
    confidence: 0.95,
    signals: ['email'],
    sharedExperiences: 0,
    conflicts: [],
    ...overrides,
  }
}

describe('decideCvBatchFileAction (#2569.3)', () => {
  it('crée directement quand personne ne ressemble', () => {
    expect(decideCvBatchFileAction('new', [])).toEqual({ action: 'create' })
  })

  it('met à jour automatiquement une correspondance forte et non ambiguë (#2569.2)', () => {
    const matches = [match({ talentId: 'existing-1' })]
    expect(decideCvBatchFileAction('resolved', matches)).toEqual({
      action: 'auto_update',
      talentId: 'existing-1',
    })
  })

  it.each(['probable_duplicate', 'ambiguous', 'conflicting'] as const)(
    'isole une exception pour revue sur l’état %s — rien n’est perdu, rien n’est fusionné seul',
    state => {
      const matches = [match({ talentId: 'maybe-1', confidence: 0.4, reason: 'same_name' })]
      expect(decideCvBatchFileAction(state, matches)).toEqual({
        action: 'exception',
        state,
        talentId: 'maybe-1',
      })
    },
  )

  it('une exception sans aucune cible désignée porte quand même son état', () => {
    expect(decideCvBatchFileAction('ambiguous', [])).toEqual({
      action: 'exception',
      state: 'ambiguous',
      talentId: null,
    })
  })

  it('ne décide jamais de fusion — action absente du vocabulaire (c37_fusion_doublons)', () => {
    const decision = decideCvBatchFileAction('resolved', [match()])
    expect(decision.action).not.toBe('merge')
  })
})

describe('incomingCvIsMoreRecent (#2569.2 — la donnée la plus récente gagne)', () => {
  it('le document entrant gagne quand sa date est mesurée et postérieure', () => {
    expect(incomingCvIsMoreRecent(new Date('2024-01-01'), new Date('2025-01-01'))).toBe(true)
  })

  it('le document existant garde la main quand il est plus récent', () => {
    expect(incomingCvIsMoreRecent(new Date('2025-01-01'), new Date('2024-01-01'))).toBe(false)
  })

  it('sans date connue côté existant, la date connue entrante devient la référence', () => {
    expect(incomingCvIsMoreRecent(null, new Date('2024-01-01'))).toBe(true)
  })

  it('⚠️ une date entrante INCONNUE ne gagne jamais — "non mesuré" n’est jamais "plus récent"', () => {
    expect(incomingCvIsMoreRecent(new Date('2024-01-01'), null)).toBe(false)
    expect(incomingCvIsMoreRecent(null, null)).toBe(false)
  })
})

describe('extractCvEmail / extractCvPhone — lecture déterministe, jamais un modèle', () => {
  it('lit une adresse e-mail présente dans le texte', () => {
    expect(extractCvEmail('Jean Dupont\njean.dupont@example.com\nParis')).toBe('jean.dupont@example.com')
  })

  it('rend null sans invention quand aucune adresse n’est lisible', () => {
    expect(extractCvEmail('Un CV sans aucune coordonnée.')).toBeNull()
    expect(extractCvEmail(null)).toBeNull()
  })

  it('lit un numéro de téléphone français, dans ses deux écritures', () => {
    expect(extractCvPhone('Tél : 06 12 34 56 78')).toBe('06 12 34 56 78')
    expect(extractCvPhone('+33 6 12 34 56 78 — disponible')).toBe('+33 6 12 34 56 78')
  })

  it('rend null sans invention quand aucun numéro n’est lisible', () => {
    expect(extractCvPhone('Aucune coordonnée ici.')).toBeNull()
  })

  it('⚠️ ne lit JAMAIS un critère protégé — l’extraction ne connaît que email et téléphone', () => {
    // Preuve négative : la fonction n'a pas de signature qui permettrait de lire
    // l'âge, le genre, la nationalité, une photo ou la situation familiale — ce
    // test échouerait à la compilation si l'API s'élargissait à un troisième champ.
    const text = 'Né le 12/03/1990, célibataire, française, 42 ans.\njean.dupont@example.com'
    expect(extractCvEmail(text)).toBe('jean.dupont@example.com')
    // La fonction ne rend qu'une chaîne ou null — jamais un objet où un champ
    // protégé pourrait se glisser.
    expect(typeof extractCvEmail(text)).toBe('string')
  })
})

/**
 * #2431.6 (épopée #2883) — le manifeste dit le nombre de fichiers et les
 * doublons AVANT le traitement, jamais découverts après coup. Coût et durée
 * ne sont volontairement pas rendus : aucun modèle de coût ni d'historique de
 * durée par taille/type n'existe dans le dépôt — en inventer un violerait
 * « JAMAIS de donnée fictive ». Seul ce qui est RÉELLEMENT mesurable (compte,
 * doublons par empreinte) entre dans le manifeste.
 */
describe('buildCvZipManifest (#2431.6)', () => {
  it('compte les fichiers et ne signale aucun doublon quand toutes les empreintes diffèrent', () => {
    const manifest = buildCvZipManifest([
      { name: 'a.pdf', sha256: 'aaa' },
      { name: 'b.pdf', sha256: 'bbb' },
    ])
    expect(manifest).toEqual({ totalFiles: 2, duplicateFiles: 0 })
  })

  it('compte un doublon par empreinte répétée, jamais par nom de fichier', () => {
    const manifest = buildCvZipManifest([
      { name: 'cv.pdf', sha256: 'aaa' },
      { name: 'cv (1).pdf', sha256: 'aaa' },
      { name: 'autre.pdf', sha256: 'bbb' },
    ])
    expect(manifest.totalFiles).toBe(3)
    expect(manifest.duplicateFiles).toBe(1)
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 2 500 fichiers, aucun dépassement dit', () => {
    const entries = Array.from({ length: 2500 }, (_, i) => ({ name: `f${i}.pdf`, sha256: `h${i}` }))
    const manifest = buildCvZipManifest(entries)
    expect(manifest).toEqual({ totalFiles: 2500, duplicateFiles: 0 })
  })

  it('un lot vide ne fait ni doublon ni dépassement', () => {
    expect(buildCvZipManifest([])).toEqual({ totalFiles: 0, duplicateFiles: 0 })
  })
})

/**
 * #2183.41 — « probablement un scan » restait un TEXTE LIBRE de raison
 * d'échec, jamais une catégorie structurée. Le classement lit les trois
 * messages CONTRÔLÉS que notre propre service IA (`document_text.py`) émet
 * pour un document sans calque texte — jamais un texte de modèle, donc une
 * classification fiable, pas une devinette.
 */
describe('classifyCvExtractFailure', () => {
  it('reconnaît un PDF image-only — le motif mesuré en production', () => {
    expect(
      classifyCvExtractFailure(
        'Aucun texte extractible du PDF (probablement un scan/image). Fournissez un PDF texte ou copiez le contenu.',
      ),
    ).toBe('scan_suspected')
  })

  it('reconnaît un document Office qui ne porte que des images', () => {
    expect(
      classifyCvExtractFailure('Aucun texte extractible du document Office (fichier vide ou uniquement des images).'),
    ).toBe('scan_suspected')
  })

  it('reconnaît une image sans texte lisible (le lot d’images)', () => {
    expect(classifyCvExtractFailure('Aucun texte lisible dans cette image.')).toBe('scan_suspected')
  })

  it('classe le reste en `other` — jamais un scan deviné', () => {
    expect(classifyCvExtractFailure('Fichier vide.')).toBe('other')
    expect(classifyCvExtractFailure('PDF protégé par mot de passe — impossible d’extraire le texte.')).toBe('other')
    expect(classifyCvExtractFailure('Fiche rapprochée introuvable — import ignoré.')).toBe('other')
  })
})

/**
 * #3065 (lot 2) — un lot peut contenir des fichiers qui ne sont PAS des CV
 * (csv, xlsx, zip imbriqué, sans extension). Les envoyer à l'extraction les
 * ferait échouer en silence, comptés comme des erreurs — exactement le
 * « échec muet » que l'issue interdit. `isRecognizedCvExtension` permet de les
 * NOMMER « ignoré : pas un CV » avant même d'appeler l'extraction (et sans en
 * payer le coût).
 */
describe('isRecognizedCvExtension (#3065 lot 2)', () => {
  it('reconnaît pdf, docx et doc — insensible à la casse', () => {
    expect(isRecognizedCvExtension('cv-jean.pdf')).toBe(true)
    expect(isRecognizedCvExtension('CV-Jean.PDF')).toBe(true)
    expect(isRecognizedCvExtension('cv-jean.docx')).toBe(true)
    expect(isRecognizedCvExtension('cv-jean.doc')).toBe(true)
  })

  it('écarte les formats qui ne sont pas des CV — csv, xlsx, zip imbriqué', () => {
    expect(isRecognizedCvExtension('export.csv')).toBe(false)
    expect(isRecognizedCvExtension('tableau.xlsx')).toBe(false)
    expect(isRecognizedCvExtension('sous-dossier.zip')).toBe(false)
  })

  it('écarte un fichier SANS extension — rien à reconnaître', () => {
    expect(isRecognizedCvExtension('LISEZMOI')).toBe(false)
  })
})

// #1952.22 (épopée #2844) — l'ETA mesurée, extrapolée du débit RÉEL de ce job
// (son propre `created_at`/`updated_at`, jamais une durée par type de fichier
// inventée — le manifeste `buildCvZipManifest` refuse déjà ça juste au-dessus).
describe('estimateCvBatchImportEtaSeconds (#1952.22)', () => {
  const t0 = new Date('2026-09-28T10:00:00.000Z')

  it('extrapole le temps restant depuis le débit déjà mesuré', () => {
    // 2 fichiers traités en 20s (10s/fichier) → 8 restants ≈ 80s.
    const eta = estimateCvBatchImportEtaSeconds({
      status: 'processing',
      total: 10,
      processed: 2,
      createdAt: t0,
      updatedAt: new Date(t0.getTime() + 20_000),
    })
    expect(eta).toBe(80)
  })

  it('rend `null` — jamais 0 — avant qu’aucun fichier n’ait produit d’issue', () => {
    expect(
      estimateCvBatchImportEtaSeconds({ status: 'processing', total: 10, processed: 0, createdAt: t0, updatedAt: t0 }),
    ).toBeNull()
  })

  it('rend `null` une fois le job terminé — plus rien à estimer', () => {
    const done = { total: 10, processed: 10, createdAt: t0, updatedAt: new Date(t0.getTime() + 30_000) }
    expect(estimateCvBatchImportEtaSeconds({ ...done, status: 'done' })).toBeNull()
    expect(estimateCvBatchImportEtaSeconds({ ...done, status: 'failed' })).toBeNull()
  })

  it('rend `null` quand tout le lot est déjà traité (rien de restant à extrapoler)', () => {
    expect(
      estimateCvBatchImportEtaSeconds({
        status: 'processing',
        total: 5,
        processed: 5,
        createdAt: t0,
        updatedAt: new Date(t0.getTime() + 10_000),
      }),
    ).toBeNull()
  })

  it('rend `null` sur un horodatage illisible (`updated_at` ≤ `created_at`) — jamais une durée négative', () => {
    expect(
      estimateCvBatchImportEtaSeconds({ status: 'processing', total: 10, processed: 2, createdAt: t0, updatedAt: t0 }),
    ).toBeNull()
  })
})

describe('buildCvBatchImportJobState — porte etaSeconds sans second calcul (GA-26)', () => {
  it('calcule etaSeconds depuis les MÊMES horodatages que la ligne persistée', () => {
    const t0 = new Date('2026-09-28T10:00:00.000Z')
    const state = buildCvBatchImportJobState({
      id: 'job-1',
      kind: 'zip',
      status: 'processing',
      total: 4,
      processed_count: 1,
      outcomes: [{ status: 'created', file: 'a.pdf', consultantId: 'c1' }],
      error: null,
      created_at: t0,
      updated_at: new Date(t0.getTime() + 10_000),
    })
    expect(state.etaSeconds).toBe(30)
  })
})

describe('summariseCvBatchImport — le compte `ignored`, distinct des erreurs', () => {
  it('compte les fichiers ignorés SÉPARÉMENT de `failed` — jamais confondus', () => {
    const summary = summariseCvBatchImport([
      { status: 'created', file: 'a.pdf', consultantId: 'c1' },
      { status: 'ignored', file: 'b.csv', reason: 'Ce n’est pas un CV (extension .csv).' },
      { status: 'ignored', file: 'c.xlsx', reason: 'Ce n’est pas un CV (extension .xlsx).' },
    ])
    expect(summary.ignored).toBe(2)
    expect(summary.failed).toBe(0)
    expect(summary.created).toBe(1)
  })
})

/**
 * #2326.6 (épopée #2794) — un dossier entier de CV, hors d'une archive ZIP.
 * Même forme par fichier que l'archive ZIP ; aucun plafond en nombre (Louis 06/10/2026).
 */
describe('cvFilesImportInputSchema (#2326.6)', () => {
  const file = (over: Partial<{ fileB64: string; filename: string }> = {}) => ({
    fileB64: 'aGVsbG8=',
    filename: 'cv.pdf',
    ...over,
  })

  it('accepte un dossier d’au moins un fichier', () => {
    expect(cvFilesImportInputSchema.safeParse({ files: [file()] }).success).toBe(true)
    expect(cvFilesImportInputSchema.safeParse({ files: [file(), file({ filename: 'autre.pdf' })] }).success).toBe(true)
  })

  it('accepte un chemin RELATIF de sous-dossier (`File.webkitRelativePath`)', () => {
    expect(cvFilesImportInputSchema.safeParse({ files: [file({ filename: 'lot-2026/cv-dupont.pdf' })] }).success).toBe(
      true,
    )
  })

  it('sait dire NON : un dossier VIDE est refusé — jamais un lot de zéro fichier', () => {
    expect(cvFilesImportInputSchema.safeParse({ files: [] }).success).toBe(false)
  })

  it('Louis 06/10/2026 : plus aucun plafond en nombre — 301 fichiers acceptés', () => {
    const files = Array.from({ length: 301 }, (_, i) => file({ filename: `cv-${i}.pdf` }))
    expect(cvFilesImportInputSchema.safeParse({ files }).success).toBe(true)
  })

  it('sait dire NON : un fichier sans octets ou sans nom est refusé', () => {
    expect(cvFilesImportInputSchema.safeParse({ files: [file({ fileB64: '' })] }).success).toBe(false)
    expect(cvFilesImportInputSchema.safeParse({ files: [file({ filename: '' })] }).success).toBe(false)
  })

  it('sait dire NON : un champ hors contrat est refusé (`.strict()`)', () => {
    expect(cvFilesImportInputSchema.safeParse({ files: [file()], extra: true }).success).toBe(false)
  })
})

/**
 * #3065 (lot 2b) — au-delà de `CV_ZIP_MAX_ARCHIVE_BYTES` (le transport
 * inline), l'archive part vers l'import volumineux plutôt que d'être refusée
 * net. `cvZipImportRoute` est la SEULE fonction qui décide, lue par le web
 * (quelle route appeler) ET par l'API (mêmes bornes) — deux plafonds qui
 * divergeraient laisseraient partir un envoi pour rien, ou refuseraient une
 * archive que l'autre côté aurait acceptée (GA-26).
 */
describe('cvZipImportRoute (#3065 lot 2b)', () => {
  it('route en ligne (base64/JSON) sous la borne du transport inline', () => {
    expect(cvZipImportRoute(1)).toBe('inline')
    expect(cvZipImportRoute(CV_ZIP_MAX_ARCHIVE_BYTES)).toBe('inline')
  })

  it('route vers l’import volumineux au-delà de la borne inline, jusqu’au plafond', () => {
    expect(cvZipImportRoute(CV_ZIP_MAX_ARCHIVE_BYTES + 1)).toBe('large')
    expect(cvZipImportRoute(CV_ZIP_LARGE_ARCHIVE_MAX_BYTES)).toBe('large')
  })

  // #3481.1 — le cas de la recette : l'archive de 600 Mo (beta Louis, 30/09) est volumineuse,
  // ni refusée ni envoyée en base64 ; et le plafond (1 Go depuis le 15/10) la contient avec de la marge.
  it('#3481.1 — une archive de 600 Mo prend la route volumineuse, sous le plafond du seau', () => {
    const sixHundredMb = 600 * 1024 * 1024
    expect(cvZipImportRoute(sixHundredMb)).toBe('large')
    expect(sixHundredMb).toBeLessThan(CV_ZIP_LARGE_ARCHIVE_MAX_BYTES)
  })

  // #3666.9 (Louis 15/10/2026) — RENVERSEMENT DATÉ du lot BATCH-CV (12/10, 2,5 Gio) : la limite
  // ANNONCÉE de tout import est 1 Go, à UN endroit (`IMPORT_FILE_MAX_BYTES`). Le cas réel de #3065
  // (703 Mo / 688 CV) passe toujours ; un lot de 2 000 CV se découpe en deux envois.
  it('#3666.9 — le plafond est la limite annoncée de 1 Go ; 688 CV passent, 2 000 se découpent', () => {
    expect(CV_ZIP_LARGE_ARCHIVE_MAX_BYTES).toBe(IMPORT_FILE_MAX_BYTES)
    expect(IMPORT_FILE_MAX_BYTES).toBe(1024 * 1024 * 1024)
    expect(cvZipImportRoute(703 * 1024 * 1024)).toBe('large')
    expect(cvZipImportRoute(Math.ceil((703 * 1024 * 1024 * 2000) / 688))).toBe('refused')
  })

  it('refuse au-delà du plafond de l’import volumineux — jamais un envoi qui échouera après coup', () => {
    expect(cvZipImportRoute(CV_ZIP_LARGE_ARCHIVE_MAX_BYTES + 1)).toBe('refused')
  })

  it('refuse une taille illisible (zéro, négative, non finie) — jamais devinée', () => {
    expect(cvZipImportRoute(0)).toBe('refused')
    expect(cvZipImportRoute(-1)).toBe('refused')
    expect(cvZipImportRoute(Number.NaN)).toBe('refused')
  })
})

describe('cvZipLargeUploadTicketRequestSchema (#3065 lot 2b)', () => {
  it('accepte un nom et une taille positive', () => {
    expect(
      cvZipLargeUploadTicketRequestSchema.safeParse({ filename: 'cv.zip', byteSize: 700 * 1024 * 1024 }).success,
    ).toBe(true)
  })

  it('sait dire NON : une taille nulle ou négative, un nom vide, un champ hors contrat', () => {
    expect(cvZipLargeUploadTicketRequestSchema.safeParse({ filename: 'cv.zip', byteSize: 0 }).success).toBe(false)
    expect(cvZipLargeUploadTicketRequestSchema.safeParse({ filename: '', byteSize: 100 }).success).toBe(false)
    expect(
      cvZipLargeUploadTicketRequestSchema.safeParse({ filename: 'cv.zip', byteSize: 100, extra: true }).success,
    ).toBe(false)
  })
})

describe('isCvZipNoiseEntry (#3065 lot 2b)', () => {
  it('écarte les métadonnées macOS et les fichiers cachés du Finder', () => {
    expect(isCvZipNoiseEntry('__MACOSX/cv.pdf')).toBe(true)
    expect(isCvZipNoiseEntry('.DS_Store')).toBe(true)
    expect(isCvZipNoiseEntry('dossier/.DS_Store')).toBe(true)
  })

  it('n’écarte pas un CV réel', () => {
    expect(isCvZipNoiseEntry('cv-jean.pdf')).toBe(false)
  })
})

describe('isCvZipNestedArchiveEntry (#3303)', () => {
  it('reconnaît une archive imbriquée par son extension', () => {
    expect(isCvZipNestedArchiveEntry('Candidats.zip')).toBe(true)
    expect(isCvZipNestedArchiveEntry('dossier/All 13.8.zip')).toBe(true)
    expect(isCvZipNestedArchiveEntry('CANDIDATS.ZIP')).toBe(true)
  })

  it('n’écarte pas un CV réel', () => {
    expect(isCvZipNestedArchiveEntry('cv-jean.pdf')).toBe(false)
  })
})

describe('sniffCvFileKind (#3303 — un fichier sans extension reconnue, mais dont les octets disent CV)', () => {
  it('reconnaît un PDF à sa signature `%PDF`, même sans extension', () => {
    const bytes = new TextEncoder().encode('%PDF-1.4 reste du contenu')
    expect(sniffCvFileKind(bytes)).toBe('pdf')
  })

  it('reconnaît un DOCX à sa signature ZIP + une entrée `word/`', () => {
    const bytes = new TextEncoder().encode('PK\u0003\u0004...word/document.xml...')
    expect(sniffCvFileKind(bytes)).toBe('docx')
  })

  it('ne confond pas un ZIP quelconque (sans `word/`) avec un DOCX', () => {
    const bytes = new TextEncoder().encode('PK\u0003\u0004...Candidats/cv-jean.pdf...')
    expect(sniffCvFileKind(bytes)).toBeNull()
  })

  it('rend `null` sur un contenu qui n’a ni signature', () => {
    expect(sniffCvFileKind(new TextEncoder().encode('bonjour'))).toBeNull()
  })

  it('rend `null` sur des octets trop courts pour porter une signature', () => {
    expect(sniffCvFileKind(new Uint8Array([0x25, 0x50]))).toBeNull()
  })
})

describe('cvZipLargeImportStartSchema (#3065 lot 2b)', () => {
  it('accepte le chemin rendu par le ticket et le nom d’origine', () => {
    expect(
      cvZipLargeImportStartSchema.safeParse({ path: 'w1/cv-zip-import/abc.zip', filename: 'cv.zip' }).success,
    ).toBe(true)
  })

  it('sait dire NON : un chemin ou un nom vide', () => {
    expect(cvZipLargeImportStartSchema.safeParse({ path: '', filename: 'cv.zip' }).success).toBe(false)
    expect(cvZipLargeImportStartSchema.safeParse({ path: 'w1/x.zip', filename: '' }).success).toBe(false)
  })
})

/**
 * #2326.12 (épopée #2794/#2905, lot V11) — les dix étapes NOMMÉES du dépôt
 * d'un fichier, même patron que `MATCH_PIPELINE_STEPS` (`consultant-matching.ts`).
 */
describe('CV_INTAKE_STEPS (#2326.12)', () => {
  it('nomme dix étapes, chacune avec un id ET un libellé lisible', () => {
    expect(CV_INTAKE_STEPS).toHaveLength(10)
    for (const step of CV_INTAKE_STEPS) {
      expect(step.id.length).toBeGreaterThan(0)
      expect(step.label.length).toBeGreaterThan(0)
    }
  })

  it('des ids UNIQUES — jamais deux étapes qui se confondent', () => {
    const ids = CV_INTAKE_STEPS.map(step => step.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('M2.3 (Meyer 20/10) — un tableur n’est pas un CV', () => {
  it.each(['contacts.csv', 'Export.CSV', 'vivier.xlsx', 'liste.xls', 'data.tsv', 'tableau.ods'])(
    '%s est refusé par son extension',
    name => {
      expect(hasSpreadsheetExtension(name)).toBe(true)
    },
  )

  it.each(['cv.pdf', 'cv.docx', 'cv.doc', 'cv.odt', 'profil.txt', 'photo.png', 'cv'])(
    '%s n’est pas un tableur',
    name => {
      expect(hasSpreadsheetExtension(name)).toBe(false)
    },
  )

  it('reconnaît le contenu d’un export CSV à point-virgule, même sous une extension .txt', () => {
    const line = (i: number) => `CCON${i};M.;Nom${i};Prenom${i};Directeur;Service;Société ${i};Secteur;x;y`
    const text = [
      'Référence;Civilité;Nom;Prénom;Fonction;Service;Société;Secteur;A;B',
      ...[1, 2, 3, 4, 5, 6].map(line),
    ].join('\n')
    expect(looksTabularText(text)).toBe(true)
  })

  it('ne prend PAS un CV pour un tableau — ni ses listes de compétences à virgules', () => {
    const cv = [
      'Yanis Berthier',
      'Ingénieur plateforme',
      'yanis@exemple.fr · 06 12 34 56 78',
      '2019 - 2022 · Société Alpha · Ingénieur plateforme',
      'Compétences : Java, Spring, SQL, Docker, Kubernetes, Terraform',
      '2016 - 2019 Banque Beta Dev',
      'Compétences : Python, Django, PostgreSQL, Redis, Celery, AWS',
    ].join('\n')
    expect(looksTabularText(cv)).toBe(false)
  })
})
