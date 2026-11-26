import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildCorpusLabel,
  classifyUpserts,
  findForbiddenPiiColumn,
  IMPORTABLE_FILES,
  MARKET_MEMORY_CORPUS_LABEL,
  MARKET_MEMORY_SOURCE_FAMILY,
  optionalInt,
  parseCompanySignal,
  parseCompanyStack,
  parseEsnClient,
  parseExEsnAtClient,
  parseHeadcountBracket,
  parseHeader,
  parseRoleFamilies,
  readCsvRecords,
  sha256Hex,
  splitCsvLine,
  toRecord,
  validateManifest,
} from './market-memory-import'

const CORPUS = 'pack-parcours'

describe('la liste des fichiers importables est une DÉCISION', () => {
  it('n’inclut aucun fichier d’identités ou de coordonnées', () => {
    for (const file of IMPORTABLE_FILES) {
      expect(file).not.toMatch(/identite|contact|profil/i)
    }
  })

  it('n’inclut aucun fichier qui porte une URL de profil', () => {
    // 01, 03 et 04 en portent une. Les nommer ici est le seul moyen que la
    // garde tombe si quelqu'un les ajoute « parce qu'ils étaient dans le zip ».
    for (const forbidden of [
      '01_profils_sans_pii.csv',
      '03_associations_personne_entreprise.csv',
      '04_competences_occurrences.csv',
    ]) {
      expect(IMPORTABLE_FILES as readonly string[]).not.toContain(forbidden)
    }
  })

  it('lit vraiment quelque chose — sinon les deux assertions ci-dessus sont vides', () => {
    expect(IMPORTABLE_FILES.length).toBeGreaterThanOrEqual(7)
  })
})

describe('splitCsvLine / parseHeader', () => {
  it('découpe sur le point-virgule', () => {
    expect(splitCsvLine('a;b;c')).toEqual(['a', 'b', 'c'])
  })

  it('respecte les guillemets et les doubles guillemets échappés', () => {
    expect(splitCsvLine('"a;b";c')).toEqual(['a;b', 'c'])
    expect(splitCsvLine('"il a dit ""oui""";c')).toEqual(['il a dit "oui"', 'c'])
  })

  it('retire le BOM de l’entête — sinon la première colonne n’a pas de nom', () => {
    expect(parseHeader('﻿source;cle;nom')).toEqual(['source', 'cle', 'nom'])
  })

  it('rend la chaîne vide pour une colonne absente de la ligne', () => {
    expect(toRecord(['a', 'b', 'c'], 'x;y')).toEqual({ a: 'x', b: 'y', c: '' })
  })
})

describe('optionalInt — une cellule vide n’est pas un zéro', () => {
  it('rend null sur une cellule vide', () => {
    expect(optionalInt('')).toBeNull()
    expect(optionalInt('   ')).toBeNull()
    expect(optionalInt(undefined)).toBeNull()
  })

  it('rend 0 quand le fichier écrit vraiment 0', () => {
    expect(optionalInt('0')).toBe(0)
  })
})

describe('parseHeadcountBracket', () => {
  it('rend null sur le littéral « inconnu » du corpus', () => {
    expect(parseHeadcountBracket('inconnu')).toBeNull()
    expect(parseHeadcountBracket('INCONNU')).toBeNull()
  })

  it('garde une vraie tranche', () => {
    expect(parseHeadcountBracket('10000+')).toBe('10000+')
  })
})

describe('parseRoleFamilies — le comptage est le DERNIER nombre', () => {
  it('lit les trois familles séparées par le point médian', () => {
    expect(parseRoleFamilies('Autre 225 · Direction / Conseil 106 · Développement 100')).toEqual([
      { family: 'Autre', persons: 225 },
      { family: 'Direction / Conseil', persons: 106 },
      { family: 'Développement', persons: 100 },
    ])
  })

  it('garde le « / » d’un libellé — découper dessus casserait une famille sur trois', () => {
    expect(parseRoleFamilies('Data / IA 58')).toEqual([{ family: 'Data / IA', persons: 58 }])
  })

  it('rend une liste vide sur une cellule vide, jamais une famille inventée', () => {
    expect(parseRoleFamilies('')).toEqual([])
    expect(parseRoleFamilies(undefined)).toEqual([])
  })

  it('écarte un fragment sans comptage plutôt que de lui en inventer un', () => {
    expect(parseRoleFamilies('Data · Développement 100')).toEqual([{ family: 'Développement', persons: 100 }])
  })
})

describe('parseCompanySignal', () => {
  const row = {
    cle: 'thales',
    nom: 'Thales',
    est_esn: 'False',
    freelances_total: '272',
    freelances_actuels: '80',
    freelances_passes: '192',
    score_externalisation: '74.0',
    familles_de_roles: 'Infra / Cloud 60 · Développement 55',
    tranche_effectif: '10000+',
    effectif_min: '10001',
    effectif_max: '',
    ville: 'Paris',
    region: 'Ile-de-France',
    pays: 'France',
    site_web: 'https://www.thalesgroup.com',
    esn_observees: '12',
    technos_observees: '31',
    anciens_esn_presents: '23',
  }

  it('dérive la clé de rapprochement et le domaine racine', () => {
    const draft = parseCompanySignal(row, CORPUS)

    expect(draft?.matchKey).toBe('thales')
    expect(draft?.websiteDomain).toBe('thalesgroup.com')
  })

  it('laisse le score VIDE à null — « pas assez pour noter » n’est pas « noté zéro »', () => {
    const draft = parseCompanySignal({ ...row, score_externalisation: '' }, CORPUS)

    expect(draft?.externalizationScore).toBeNull()
  })

  it('garde un vrai zéro quand le fichier en écrit un', () => {
    const draft = parseCompanySignal({ ...row, score_externalisation: '0' }, CORPUS)

    expect(draft?.externalizationScore).toBe('0')
  })

  it('rend null quand la ligne n’a pas de clé — une entreprise sans clé ne se joint à rien', () => {
    expect(parseCompanySignal({ ...row, cle: '' }, CORPUS)).toBeNull()
  })

  it('pose les trois signaux des AUTRES fichiers à leur valeur neutre, pas à une mesure', () => {
    const draft = parseCompanySignal(row, CORPUS)

    expect(draft?.rotationRatio).toBeNull()
    expect(draft?.hasCeased).toBe(false)
    expect(draft?.connectorCount).toBe(0)
  })

  it('retombe sur la clé quand le nom manque', () => {
    const draft = parseCompanySignal({ ...row, nom: '' }, CORPUS)

    expect(draft?.companyName).toBe('thales')
  })
})

describe('parseCompanyStack — le seuil du corpus est appliqué à l’IMPORT', () => {
  it('garde une technologie citée par deux personnes', () => {
    expect(parseCompanyStack({ cle_entreprise: 'thales', techno: 'java', freelances: '2' }, CORPUS)).toEqual({
      companyKey: 'thales',
      techno: 'java',
      persons: 2,
      corpusLabel: CORPUS,
    })
  })

  it('REFUSE une technologie citée par une seule personne — c’est une ligne de CV', () => {
    expect(parseCompanyStack({ cle_entreprise: 'thales', techno: 'cobol', freelances: '1' }, CORPUS)).toBeNull()
  })
})

describe('parseEsnClient et parseExEsnAtClient', () => {
  it('lisent un couple complet', () => {
    expect(
      parseEsnClient(
        { esn: 'alten', esn_nom: 'ALTEN', client: 'thales', client_nom: 'Thales', personnes: '9' },
        CORPUS,
      ),
    ).toEqual({
      esnKey: 'alten',
      esnName: 'ALTEN',
      clientKey: 'thales',
      clientName: 'Thales',
      persons: 9,
      corpusLabel: CORPUS,
    })

    expect(
      parseExEsnAtClient(
        { esn_origine: 'capgemini', esn_nom: 'Capgemini', client_actuel: 'adeo', client_nom: 'ADEO', personnes: '6' },
        CORPUS,
      ),
    ).toEqual({
      esnOriginKey: 'capgemini',
      esnOriginName: 'Capgemini',
      clientKey: 'adeo',
      clientName: 'ADEO',
      persons: 6,
      corpusLabel: CORPUS,
    })
  })

  it('refusent un couple à zéro personne — il n’observe rien', () => {
    expect(parseEsnClient({ esn: 'alten', client: 'thales', personnes: '0' }, CORPUS)).toBeNull()
    expect(parseExEsnAtClient({ esn_origine: 'alten', client_actuel: 'thales', personnes: '0' }, CORPUS)).toBeNull()
  })

  it('refusent un couple incomplet plutôt que d’inventer la moitié manquante', () => {
    expect(parseEsnClient({ esn: '', client: 'thales', personnes: '9' }, CORPUS)).toBeNull()
  })
})

describe('readCsvRecords — un retour à la ligne CITÉ ne termine pas un enregistrement', () => {
  /** Un flux à partir d'une chaîne, découpée pour prouver qu'un champ peut traverser deux morceaux. */
  async function* chunks(text: string, size = 7): AsyncGenerator<string> {
    for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size)
  }

  const HEADER = 'cle;nom;ville'

  it('lit une ligne normale', async () => {
    const seen: Array<Record<string, string>> = []
    const result = await readCsvRecords(chunks(`${HEADER}\nthales;Thales;Paris\n`), record => {
      seen.push(record)
      return true
    })

    expect(result).toEqual({ read: 1, kept: 1 })
    expect(seen[0]).toEqual({ cle: 'thales', nom: 'Thales', ville: 'Paris' })
  })

  it('garde UN seul enregistrement quand un champ contient un retour à la ligne', async () => {
    const seen: Array<Record<string, string>> = []
    const csv = `${HEADER}\nthales;"Thales\nGroup";Paris\n`

    const result = await readCsvRecords(chunks(csv), record => {
      seen.push(record)
      return true
    })

    // Le défaut qu'on empêche : un lecteur ligne à ligne verrait DEUX
    // enregistrements, jetterait celui sans clé et garderait l'autre décalé.
    expect(result.read).toBe(1)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.cle).toBe('thales')
    expect(seen[0]?.ville).toBe('Paris')
  })

  it('rend le dernier enregistrement même sans retour à la ligne final', async () => {
    const result = await readCsvRecords(chunks(`${HEADER}\nthales;Thales;Paris`), () => true)

    expect(result).toEqual({ read: 1, kept: 1 })
  })

  it('compte séparément ce qui est LU et ce qui est RETENU', async () => {
    const result = await readCsvRecords(chunks(`${HEADER}\na;A;Paris\nb;B;Lyon\n`), record => record.cle === 'a')

    expect(result).toEqual({ read: 2, kept: 1 })
  })
})

/**
 * #1617 — LA LISTE D'EXCLUSION EST-ELLE LUE PAR QUELQU'UN ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON A TROUVÉ EN MESURANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `IMPORTABLE_FILES` exclut les trois fichiers du pack qui portent des e-mails,
 * des noms de personnes et des URL de profil. Le test juste au-dessus vérifie
 * que la liste est bonne — et il passait.
 *
 * **Personne ne la lisait.** Le script d'ingestion écrivait ses sept noms de
 * fichiers en dur, plus un huitième chemin COMPOSÉ à l'exécution
 * (`join(dataDir, `${file}.csv`)`), et n'importait pas la constante. Son propre
 * commentaire affirmait pourtant : *« ce script ne connaît que la liste
 * `IMPORTABLE_FILES`, et ce qui n'y est pas n'a aucun chemin pour entrer »*.
 *
 * C'est le défaut n°1 de ce dépôt — du code juste que personne n'appelle —
 * appliqué à son sujet le plus sensible, avec sa propre justification pour le
 * cacher. Une garde qui vérifie le CONTENU d'une liste ne dit rien de son
 * USAGE : c'est ce que ces trois tests ajoutent.
 */
describe('#1617 — la liste d’exclusion a un LECTEUR, et c’est le script', () => {
  const SCRIPT = readFileSync(join(__dirname, '../../scripts/ingest-market-memory.ts'), 'utf8')

  it('lit vraiment le script — sinon tout ce qui suit est vert sur du néant', () => {
    expect(SCRIPT.length).toBeGreaterThan(2000)
    expect(SCRIPT).toContain('ingest')
  })

  it('tout chemin de fichier du pack passe par la porte typée', () => {
    // `corpusFile(dataDir, '…')` est la SEULE forme admise : son paramètre est
    // typé sur `IMPORTABLE_FILES`, donc un fichier hors liste ne compile pas.
    const parLaPorte = [...SCRIPT.matchAll(/corpusFile\(dataDir, '([^']+)'\)/g)].map(m => m[1]!)
    expect(parLaPorte.length).toBeGreaterThanOrEqual(IMPORTABLE_FILES.length)
    for (const file of parLaPorte) expect(IMPORTABLE_FILES).toContain(file)
  })

  it('aucun chemin ne CONTOURNE la porte', () => {
    // Deux contournements possibles, et les deux ont existé :
    //   · `join(dataDir, '…csv')` — le nom écrit en dur ;
    //   · `join(dataDir, `${x}.csv`)` — le nom COMPOSÉ, que le type ne peut pas
    //     vérifier puisqu'il n'existe qu'à l'exécution.
    const contournements = [
      ...SCRIPT.matchAll(/join\(dataDir,\s*'[^']*\.csv'\)/g),
      ...SCRIPT.matchAll(/join\(dataDir,\s*`[^`]*`\)/g),
    ]
      .map(m => m[0])
      // Le commentaire qui RACONTE le défaut cite forcément la forme fautive :
      // sans ce filtre, la garde s'attrape elle-même sur sa propre explication.
      .filter(found => !SCRIPT.includes(`// \`${found}\``) && !SCRIPT.includes(`\`${found}\` — la forme d'avant`))
    // ⚠️ `expect(valeur, message)` est du vitest ; jest n'accepte qu'un
    // argument et lève « Expect takes at most one argument ». Le contexte passe
    // donc par la valeur comparée elle-même.
    expect({ contournements }).toEqual({ contournements: [] })
  })

  it('sait dire NON — les deux formes de contournement sont bien reconnues', () => {
    const fautif = "createReadStream(join(dataDir, '03_associations_personne_entreprise.csv'))"
    const compose = 'createReadStream(join(dataDir, `${file}.csv`))'
    expect(/join\(dataDir,\s*'[^']*\.csv'\)/.test(fautif)).toBe(true)
    expect(/join\(dataDir,\s*`[^`]*`\)/.test(compose)).toBe(true)
  })
})

/**
 * #1615 — `sha256Hex` : le calcul pur, séparé de la lecture de fichier.
 *
 * L'IO (lire les octets du pack) reste dans le script ; ici on ne teste que
 * l'algorithme, sur des entrées connues.
 */
describe('sha256Hex', () => {
  it('rend le même hex que node:crypto pour un contenu connu', () => {
    // Comparaison contre l'implémentation de référence de Node — pas une
    // réimplémentation de l'algorithme, une vérification qu'on l'utilise bien.
    const expected = createHash('sha256').update('02_entreprises.csv', 'utf8').digest('hex')
    expect(sha256Hex('02_entreprises.csv')).toBe(expected)
    expect(sha256Hex('02_entreprises.csv')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('deux contenus identiques rendent la même somme, deux différents une somme différente', () => {
    const a = sha256Hex('02_entreprises.csv;contenu-v1')
    const b = sha256Hex('02_entreprises.csv;contenu-v1')
    const c = sha256Hex('02_entreprises.csv;contenu-v2')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

/**
 * #1615.3 — l'étiquette de corpus devient PORTEUSE de la version et de la
 * période, à un seul endroit (GA-26).
 *
 * ⚠️ Elle reste préfixée par `MARKET_MEMORY_CORPUS_LABEL`, qui vaut désormais
 * `bellum_market_memory_v1` (#1603.3, tranché le 11/09/2026). Le renommage n'est
 * arrivé qu'AVEC sa reprise — `1792610000000-MarketMemoryCorpusLabelRename` —
 * parce que changer la constante seule aurait coupé le corpus en deux : les
 * ~60 067 lignes déjà en base portaient l'ancien préfixe.
 *
 * Ce test lit la CONSTANTE, jamais sa valeur littérale : c'est ce qui lui a
 * permis de survivre au renommage sans être touché.
 */
describe('MARKET_MEMORY_CORPUS_LABEL — le nom de source canonique (#1603.3)', () => {
  it('vaut `bellum_market_memory_v1`, le nom demandé par le retour', () => {
    expect(MARKET_MEMORY_CORPUS_LABEL).toBe('bellum_market_memory_v1')
  })

  it('⚠️ ne porte plus l’ancien préfixe — sinon la reprise serait à moitié faite', () => {
    // Le défaut que ce test empêche : remettre l'ancienne valeur sans rejouer
    // la migration de reprise recréerait DEUX corpus que rien ne réconcilie,
    // ce qui est exactement ce pour quoi le renommage avait été refusé deux
    // fois avant d'être tranché.
    expect(MARKET_MEMORY_CORPUS_LABEL).not.toContain('parcours-observes')
  })

  it('ne contient ni espace ni millésime — un nom de source n’est pas une phrase', () => {
    expect(MARKET_MEMORY_CORPUS_LABEL).toMatch(/^[a-z0-9_]+$/)
    // « Ne pas mettre 2022 / 2024 / 2025 dans les noms de tables ou contrats »
    // (#1603) : la version vit dans `datasetVersion`, pas dans le nom.
    expect(MARKET_MEMORY_CORPUS_LABEL).not.toMatch(/20\d\d/)
  })
})

describe('buildCorpusLabel — la version et la période voyagent dans l’étiquette', () => {
  it('compose le label à partir du préfixe existant, de la version et de la période', () => {
    const label = buildCorpusLabel({ datasetVersion: '2026.09.1', periodStart: '2026-01-01', periodEnd: '2026-08-31' })
    expect(label.startsWith(MARKET_MEMORY_CORPUS_LABEL)).toBe(true)
    expect(label).toContain('2026.09.1')
    expect(label).toContain('2026-01-01')
    expect(label).toContain('2026-08-31')
  })

  it('deux vintages différents rendent deux labels différents', () => {
    const v1 = buildCorpusLabel({ datasetVersion: '2026.09.1', periodStart: '2026-01-01', periodEnd: '2026-08-31' })
    const v2 = buildCorpusLabel({ datasetVersion: '2026.10.1', periodStart: '2026-02-01', periodEnd: '2026-09-30' })
    expect(v1).not.toBe(v2)
  })
})

describe('MARKET_MEMORY_SOURCE_FAMILY — #1616.3, un réglage à un seul endroit', () => {
  it('est une constante non vide, écrite par le code d’ingestion et rien d’autre', () => {
    expect(MARKET_MEMORY_SOURCE_FAMILY.length).toBeGreaterThan(0)
    expect(MARKET_MEMORY_SOURCE_FAMILY).toBe('bellum_market_memory')
  })
})

/**
 * #1615.5 — FAIL 1 & 2 : une URL LinkedIn personne, un e-mail ou un téléphone
 * en clair dans l'ENTÊTE d'un fichier par ailleurs autorisé. `IMPORTABLE_FILES`
 * exclut déjà les trois fichiers qui EN PORTENT structurellement ; ce
 * validateur est la seconde ligne de défense, si une colonne de ce type
 * apparaissait un jour dans un fichier accepté.
 */
describe('findForbiddenPiiColumn — seconde ligne de défense contre la PII', () => {
  it('rend null sur un entête ordinaire du corpus', () => {
    expect(findForbiddenPiiColumn(['cle', 'nom', 'personnes'])).toBeNull()
  })

  it("⚠️ TÉMOIN — ne s'attrape pas sur un mot qui CONTIENT le motif sans être le champ visé", () => {
    // 'client_actuel' contient la sous-chaîne 'tel' ; un mauvais motif substring
    // le confondrait avec une colonne téléphone.
    expect(findForbiddenPiiColumn(['esn_origine', 'client_actuel', 'clientele'])).toBeNull()
  })

  it('détecte une colonne LinkedIn', () => {
    expect(findForbiddenPiiColumn(['cle', 'linkedin_url'])).toContain('linkedin_url')
  })

  it('détecte une colonne e-mail (avec ou sans tiret, ou "courriel")', () => {
    expect(findForbiddenPiiColumn(['cle', 'email'])).toContain('email')
    expect(findForbiddenPiiColumn(['cle', 'e-mail'])).toContain('e-mail')
    expect(findForbiddenPiiColumn(['cle', 'courriel'])).toContain('courriel')
  })

  it('détecte une colonne téléphone (telephone, tel, phone, gsm, mobile)', () => {
    expect(findForbiddenPiiColumn(['cle', 'telephone'])).toContain('telephone')
    expect(findForbiddenPiiColumn(['cle', 'tel'])).toContain('tel')
    expect(findForbiddenPiiColumn(['cle', 'gsm'])).toContain('gsm')
  })
})

/**
 * #1615.5 — le validateur : un pack invalide est refusé AVANT toute écriture,
 * avec la raison. Et le témoin le plus sensible : un fichier hors de
 * `IMPORTABLE_FILES` reste exclu même s'il apparaît dans le manifest.
 */
describe('validateManifest — un pack invalide est refusé AVANT écriture', () => {
  const validChecksums: Record<string, string> = Object.fromEntries(
    IMPORTABLE_FILES.map(file => [file, sha256Hex(file)]),
  )
  const validRowCounts: Record<string, number> = Object.fromEntries(IMPORTABLE_FILES.map(file => [file, 10]))
  const validRaw = {
    version: '2026.09.1',
    methodologyVersion: 'resolution-v3',
    sourceArtifactUri: 'https://drive.example/bellum-market-memory-pack',
    periodStart: '2026-01-01',
    periodEnd: '2026-08-31',
    checksums: validChecksums,
    expectedRowCounts: validRowCounts,
  }

  it('accepte un manifest complet dont toutes les sommes correspondent', () => {
    const result = validateManifest(validRaw, validChecksums)
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error('unreachable')
    expect(result.vintage).toEqual({
      datasetVersion: '2026.09.1',
      methodologyVersion: 'resolution-v3',
      sourceArtifactUri: 'https://drive.example/bellum-market-memory-pack',
      periodStart: '2026-01-01',
      periodEnd: '2026-08-31',
    })
    expect(Object.keys(result.checksums).sort()).toEqual([...IMPORTABLE_FILES].sort())
    expect(Object.keys(result.expectedRowCounts).sort()).toEqual([...IMPORTABLE_FILES].sort())
    expect(result.expectedRowCounts[IMPORTABLE_FILES[0]]).toBe(10)
  })

  it('#1615.4 — refuse une méthodologie manquante ou vide', () => {
    expect(validateManifest({ ...validRaw, methodologyVersion: '  ' }, validChecksums).valid).toBe(false)
    const { methodologyVersion: _omitted, ...withoutMethodology } = validRaw
    expect(validateManifest(withoutMethodology, validChecksums).valid).toBe(false)
  })

  it('#1615.4 — refuse une URI d’artefact source manquante ou vide', () => {
    expect(validateManifest({ ...validRaw, sourceArtifactUri: '  ' }, validChecksums).valid).toBe(false)
    const { sourceArtifactUri: _omitted, ...withoutUri } = validRaw
    expect(validateManifest(withoutUri, validChecksums).valid).toBe(false)
  })

  it('#1615.4/#1615.5 — refuse un compte de lignes attendu absent, négatif ou non entier', () => {
    const { [IMPORTABLE_FILES[0]]: _omitted, ...missingOne } = validRowCounts
    expect(validateManifest({ ...validRaw, expectedRowCounts: missingOne }, validChecksums).valid).toBe(false)
    expect(
      validateManifest(
        { ...validRaw, expectedRowCounts: { ...validRowCounts, [IMPORTABLE_FILES[0]]: -1 } },
        validChecksums,
      ).valid,
    ).toBe(false)
    expect(
      validateManifest(
        { ...validRaw, expectedRowCounts: { ...validRowCounts, [IMPORTABLE_FILES[0]]: 1.5 } },
        validChecksums,
      ).valid,
    ).toBe(false)
  })

  it('#1615.5 — FAIL : une provenance obsolète (« *_2022 », type salesql_export_2022) est refusée', () => {
    expect(validateManifest({ ...validRaw, version: 'salesql_export_2022' }, validChecksums).valid).toBe(false)
    expect(validateManifest({ ...validRaw, version: '2022.03' }, validChecksums).valid).toBe(false)
    // Témoin : un vrai millésime récent n'est pas confondu avec le motif interdit.
    expect(validateManifest({ ...validRaw, version: '2026.09.1' }, validChecksums).valid).toBe(true)
  })

  it('refuse un manifest qui n’est pas un objet', () => {
    expect(validateManifest(null, validChecksums)).toEqual({
      valid: false,
      reason: expect.stringContaining('manifest.json'),
    })
    expect(validateManifest('texte', validChecksums).valid).toBe(false)
  })

  it('refuse une version manquante ou vide', () => {
    const result = validateManifest({ ...validRaw, version: '  ' }, validChecksums)
    expect(result.valid).toBe(false)
  })

  it('refuse une période mal formée ou inversée', () => {
    expect(validateManifest({ ...validRaw, periodStart: '01/01/2026' }, validChecksums).valid).toBe(false)
    expect(
      validateManifest({ ...validRaw, periodStart: '2026-09-01', periodEnd: '2026-01-01' }, validChecksums).valid,
    ).toBe(false)
  })

  it('refuse un fichier importable dont la somme déclarée est absente', () => {
    const { [IMPORTABLE_FILES[0]]: _omitted, ...incomplete } = validChecksums
    const result = validateManifest({ ...validRaw, checksums: incomplete }, validChecksums)
    expect(result.valid).toBe(false)
    if (result.valid) throw new Error('unreachable')
    expect(result.reason).toContain(IMPORTABLE_FILES[0])
  })

  it('refuse quand la somme réelle du fichier ne correspond pas au manifest — le pack a changé', () => {
    const tampered = { ...validChecksums, [IMPORTABLE_FILES[0]]: 'deadbeef'.repeat(8) }
    const result = validateManifest({ ...validRaw, checksums: tampered }, validChecksums)
    expect(result.valid).toBe(false)
  })

  it('refuse quand un fichier importable est introuvable (aucune somme réelle calculée)', () => {
    const { [IMPORTABLE_FILES[1]]: _missing, ...actualWithoutOne } = validChecksums
    const result = validateManifest(validRaw, actualWithoutOne)
    expect(result.valid).toBe(false)
  })

  it("⚠️ TÉMOIN — un fichier HORS allowlist déclaré dans le manifest n'entre jamais dans le résultat", () => {
    // '03_associations_personne_entreprise.csv' porte une URL de profil (05 est entré le 02/11/2026, lot 775, sans identité) : même s'il
    // est présent dans manifest.checksums avec une somme valide, il ne doit
    // jamais apparaître dans les sommes retenues — la même porte typée que
    // `corpusFile`, appliquée au validateur.
    const withForbiddenFile = {
      ...validChecksums,
      '03_associations_personne_entreprise.csv': sha256Hex('03_associations_personne_entreprise.csv'),
    }
    const result = validateManifest({ ...validRaw, checksums: withForbiddenFile }, validChecksums)
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error('unreachable')
    expect(Object.keys(result.checksums)).not.toContain('03_associations_personne_entreprise.csv')
    expect(Object.keys(result.checksums).sort()).toEqual([...IMPORTABLE_FILES].sort())
  })

  it("⚠️ TÉMOIN — la même porte s'applique aux comptes de lignes attendus", () => {
    const withForbiddenCount = { ...validRowCounts, '03_associations_personne_entreprise.csv': 999 }
    const result = validateManifest({ ...validRaw, expectedRowCounts: withForbiddenCount }, validChecksums)
    expect(result.valid).toBe(true)
    if (!result.valid) throw new Error('unreachable')
    expect(Object.keys(result.expectedRowCounts)).not.toContain('03_associations_personne_entreprise.csv')
    expect(Object.keys(result.expectedRowCounts).sort()).toEqual([...IMPORTABLE_FILES].sort())
  })
})

/**
 * #1616.4 — `classifyUpserts` : la partition insert / update / inchangé qui
 * permet aux comptes de s'ADDITIONNER sans jamais soustraire.
 */
describe('classifyUpserts — insert / update / inchangé, sans soustraction', () => {
  interface Row {
    key: string
    value: string
  }

  it('classe une clé absente comme un INSERT', () => {
    const result = classifyUpserts<Row>([{ key: 'a', value: '1' }], new Map(), draft => draft.key, ['value'])
    expect(result.toInsert).toHaveLength(1)
    expect(result.toUpdate).toHaveLength(0)
    expect(result.unchanged).toHaveLength(0)
  })

  it('classe une clé existante à valeur IDENTIQUE comme INCHANGÉE — ne réécrit pas une correction', () => {
    const existing = new Map([['a', { value: '1' }]])
    const result = classifyUpserts<Row>([{ key: 'a', value: '1' }], existing, draft => draft.key, ['value'])
    expect(result.unchanged).toHaveLength(1)
    expect(result.toInsert).toHaveLength(0)
    expect(result.toUpdate).toHaveLength(0)
  })

  it('classe une clé existante à valeur DIFFÉRENTE comme UPDATE', () => {
    const existing = new Map([['a', { value: '1' }]])
    const result = classifyUpserts<Row>([{ key: 'a', value: '2' }], existing, draft => draft.key, ['value'])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.unchanged).toHaveLength(0)
  })

  it('les trois catégories s’ADDITIONNENT toujours au total des brouillons — jamais de reste', () => {
    const existing = new Map([
      ['a', { value: '1' }],
      ['b', { value: 'stale' }],
    ])
    const drafts: Row[] = [
      { key: 'a', value: '1' },
      { key: 'b', value: 'fresh' },
      { key: 'c', value: 'new' },
    ]
    const result = classifyUpserts<Row>(drafts, existing, draft => draft.key, ['value'])
    const total = result.toInsert.length + result.toUpdate.length + result.unchanged.length
    expect(total).toBe(drafts.length)
    expect(result.toInsert.map(r => r.key)).toEqual(['c'])
    expect(result.toUpdate.map(r => r.key)).toEqual(['b'])
    expect(result.unchanged.map(r => r.key)).toEqual(['a'])
  })
})
