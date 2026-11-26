import { describe, expect, it } from 'vitest'
import {
  UNIVERSAL_IMPORT_REGISTRY,
  cvBatchBreakdown,
  documentUploadBreakdown,
  UNIVERSAL_IMPORT_TYPES,
  proposeUniversalMapping,
  universalImportHeadersRecognised,
  splitUniversalRow,
  universalImportCreateSchema,
  detectUniversalImportType,
  orderUniversalSheetPlans,
  universalImportFieldKeys,
  universalImportFormatOf,
  universalImportIssuesToCsv,
  universalMappingError,
  validateUniversalRow,
  universalImportFamilyOfIssue,
  universalImportSourceRefKey,
  universalImportSourceOf,
  universalImportStartSchema,
  universalImportVerifySchema,
} from './universal-import.js'

describe('import universel — registre', () => {
  it('chaque type déclare au moins un champ obligatoire, et des clés uniques', () => {
    for (const type of UNIVERSAL_IMPORT_TYPES) {
      const fields = UNIVERSAL_IMPORT_REGISTRY[type].fields
      expect(fields.some(field => field.required)).toBe(true)
      expect(new Set(fields.map(field => field.key)).size).toBe(fields.length)
    }
  })

  it('comptes, contacts, besoins et consultants sont écrits ; la mission se déclare sans écrire', () => {
    for (const type of ['account', 'contact', 'need', 'talent'] as const) {
      expect(UNIVERSAL_IMPORT_REGISTRY[type].writable).toBe(true)
    }
    expect(UNIVERSAL_IMPORT_REGISTRY.mission.writable).toBe(false)
  })

  it('aucun plafond de lignes dans le contrat de création — seulement un nombre de parts', () => {
    const ok = universalImportCreateSchema.safeParse({ type: 'contact', filename: 'a.csv', parts: 40 })
    expect(ok.success).toBe(true)
    expect(universalImportCreateSchema.safeParse({ type: 'invoice', filename: 'a.csv', parts: 1 }).success).toBe(false)
  })

  it('#2927 — la portée personnelle n’existe que pour les contacts', () => {
    const base = { filename: 'a.csv', parts: 1 }
    expect(universalImportCreateSchema.safeParse({ ...base, type: 'contact', scope: 'personal' }).success).toBe(true)
    expect(universalImportCreateSchema.safeParse({ ...base, type: 'account', scope: 'personal' }).success).toBe(false)
    expect(universalImportCreateSchema.safeParse({ ...base, type: 'account', scope: 'workspace' }).success).toBe(true)
    expect(universalImportCreateSchema.safeParse({ ...base, type: 'contact', scope: 'bu' }).success).toBe(false)
  })

  it('déduit le format du nom de fichier, et dit NON à un format inconnu', () => {
    expect(universalImportFormatOf('export.CSV')).toBe('csv')
    expect(universalImportFormatOf('export.tsv')).toBe('csv')
    expect(universalImportFormatOf('base.xlsx')).toBe('xlsx')
    expect(universalImportFormatOf('dump.ndjson')).toBe('json')
    expect(universalImportFormatOf('photo.png')).toBeNull()
  })
})

describe('import universel — mapping', () => {
  it('reconnaît les alias FR et EN sans accent ni casse', () => {
    const mapping = proposeUniversalMapping(['Nom complet', 'Téléphone', 'E-mail', 'Poste'], 'contact')
    expect(mapping).toEqual({ 'Nom complet': 'full_name', Téléphone: 'phone', 'E-mail': 'email', Poste: 'title' })
  })

  it('une colonne inconnue n’est PAS devinée : elle part en extra (null)', () => {
    const mapping = proposeUniversalMapping(['Nom', 'Couleur préférée'], 'contact')
    expect(mapping['Couleur préférée']).toBeNull()
  })

  it('un même champ n’est pris qu’une fois — la seconde colonne part en extra', () => {
    const mapping = proposeUniversalMapping(['Email', 'Mail'], 'contact')
    expect(mapping).toEqual({ Email: 'email', Mail: null })
  })

  it('refuse un champ inconnu du type et deux colonnes sur un même champ', () => {
    expect(universalMappingError({ A: 'full_name' }, 'contact')).toBeNull()
    expect(universalMappingError({ A: 'siren' }, 'contact')).toMatch(/inconnu/)
    expect(universalMappingError({ A: 'email', B: 'email' }, 'contact')).toMatch(/même champ/)
  })
})

describe('import universel — colonne inconnue → extra', () => {
  it('conserve toute colonne sans champ d’accueil, et n’écrit rien pour une cellule vide', () => {
    const split = splitUniversalRow(
      { Nom: 'Ada Lovelace', 'Code interne': 'X-42', Vide: '   ', Budget: '0' },
      { Nom: 'full_name', 'Code interne': null, Vide: null },
    )
    expect(split.fields).toEqual({ full_name: 'Ada Lovelace' })
    // `Budget` n'était pas au mapping : conservé, pas jeté. `Vide` ne fait aucune ligne.
    expect(split.extra).toEqual({ 'Code interne': 'X-42', Budget: '0' })
  })
})

describe('import universel — validation par ligne', () => {
  const mapping = { Nom: 'full_name', Mail: 'email', Prénom: 'first_name', NomFam: 'last_name' }

  it('rejette une ligne sans champ obligatoire, avec sa raison', () => {
    const verdict = validateUniversalRow('contact', { fields: { title: 'DSI' }, extra: {} }, mapping)
    expect(verdict).toEqual({ ok: false, reason: 'missing_required_field', detail: 'full_name' })
  })

  it('compose le nom depuis prénom + nom', () => {
    const verdict = validateUniversalRow(
      'contact',
      { fields: { first_name: 'Ada', last_name: 'Lovelace' }, extra: {} },
      mapping,
    )
    expect(verdict.ok && verdict.fields['full_name']).toBe('Ada Lovelace')
  })

  it('un e-mail illisible ne devient pas un e-mail : sa valeur brute part en extra', () => {
    const verdict = validateUniversalRow(
      'contact',
      { fields: { full_name: 'Ada', email: 'pas un mail' }, extra: {} },
      mapping,
    )
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) return
    expect(verdict.fields['email']).toBeUndefined()
    expect(verdict.extra).toEqual({ Mail: 'pas un mail' })
  })

  it('un compte exige sa raison sociale', () => {
    expect(validateUniversalRow('account', { fields: { siren: '123' }, extra: {} }, {}).ok).toBe(false)
    expect(validateUniversalRow('account', { fields: { company_name: 'Acme' }, extra: {} }, {}).ok).toBe(true)
  })
})

describe('import universel — rapport téléchargeable', () => {
  it('échappe les séparateurs et garde un vide pour une fiche absente', () => {
    const csv = universalImportIssuesToCsv([
      { row: 3, kind: 'rejected', reason: 'missing_required_field', existingId: null, label: 'a;b' },
    ])
    expect(csv).toBe('ligne;sort;raison;fiche_existante;libelle\n3;rejected;missing_required_field;;"a;b"\n')
  })
})

describe("#4052 — références source : bornées à l'espace ET à la source", () => {
  it('un export de CRM connu partage la référence du connecteur (même fournisseur, identifiant brut)', () => {
    expect(universalImportSourceOf('HubSpot')).toEqual({ provider: 'hubspot', namespace: null })
  })

  // #4051.10 (Exteam, base Zoho) — l'identifiant Zoho est CONSERVÉ tel quel, sous le fournisseur du
  // connecteur : un export Zoho et la synchro Zoho se reconnaissent sur le même id.
  it('#4051.10 — un export Zoho garde l’id Zoho brut, sous le fournisseur zoho', () => {
    const zoho = universalImportSourceOf(' Zoho ')
    expect(zoho).toEqual({ provider: 'zoho', namespace: null })
    expect(universalImportSourceRefKey(zoho, ' 5012345000000123456 ')).toBe('5012345000000123456')
  })

  it('un autre CRM range sa référence sous le fichier, préfixée par sa source — deux CRM ne se confondent pas', () => {
    const boond = universalImportSourceOf('BoondManager')
    const other = universalImportSourceOf('Sellsy')
    expect(boond).toEqual({ provider: 'csv', namespace: 'boondmanager' })
    expect(universalImportSourceRefKey(boond, 'CSOC12')).toBe('boondmanager:CSOC12')
    expect(universalImportSourceRefKey(other, 'CSOC12')).not.toBe(universalImportSourceRefKey(boond, 'CSOC12'))
  })

  it('sans source nommée : le fichier, sous un espace de noms dit, jamais un SIREN ni un nom', () => {
    expect(universalImportSourceOf(null)).toEqual({ provider: 'csv', namespace: 'fichier' })
    expect(universalImportSourceRefKey(universalImportSourceOf(null), ' CCON1 ')).toBe('fichier:CCON1')
  })

  it('un fichier de contacts se mappe sur la référence du contact ET celle de sa société', () => {
    const mapping = proposeUniversalMapping(['Référence contact', 'Référence société', 'Nom', 'Société'], 'contact')
    expect(mapping).toEqual({
      'Référence contact': 'source_ref',
      'Référence société': 'company_ref',
      Nom: 'full_name',
      Société: 'company',
    })
  })

  it('la création accepte une source nommée, bornée', () => {
    const base = { type: 'contact', filename: 'c.csv', parts: 1 }
    expect(universalImportCreateSchema.safeParse({ ...base, sourceSystem: 'BoondManager' }).success).toBe(true)
    expect(universalImportCreateSchema.safeParse({ ...base, sourceSystem: 'x'.repeat(81) }).success).toBe(false)
  })
})

describe('#4051 — un écart se range dans SA famille', () => {
  it('un homonyme de société proposé compte côté comptes, une société à valider côté contacts', () => {
    expect(universalImportFamilyOfIssue('contact', 'probable_duplicate_account')).toBe('account')
    expect(universalImportFamilyOfIssue('contact', 'company_to_validate')).toBe('contact')
    expect(universalImportFamilyOfIssue('account', 'duplicate')).toBe('account')
  })
})

// #4051.2 — le bilan par famille, étendu aux CV et aux documents.
describe('bilan par famille — CV et documents (#4051.2)', () => {
  it('un lot de CV : créés / mis à jour / à rapprocher / échoués, chacun son nombre', () => {
    expect(cvBatchBreakdown({ created: 5, auto_updated: 2, exception: 3, too_big: 1, failed: 4 })).toEqual({
      cv: { created: 5, matched: 2, duplicates: 0, rejected: 5, toReconcile: 3 },
    })
  })

  it('⚠️ SAIT DIRE NON — aucun fichier d’issue : aucune famille (jamais « tout importé », jamais zéro)', () => {
    expect(cvBatchBreakdown({ created: 0, auto_updated: 0, exception: 0, too_big: 0, failed: 0 })).toEqual({})
    expect(documentUploadBreakdown({ done: 0, failed: 0 })).toEqual({})
  })

  it('un dépôt de documents : déposés et échoués, rien à rapprocher', () => {
    expect(documentUploadBreakdown({ done: 3, failed: 1 })).toEqual({
      document: { created: 3, matched: 0, duplicates: 0, rejected: 1, toReconcile: 0 },
    })
  })

  it('un lot entièrement échoué le dit : la famille existe avec ses échecs', () => {
    expect(documentUploadBreakdown({ done: 0, failed: 2 }).document?.rejected).toBe(2)
  })
})

describe('#4055.5 — la colonne « alias » d’une société est reconnue au mapping', () => {
  it('« Alias », « Autres noms » et « Nom commercial » se proposent sur company_alias (comptes)', () => {
    const mapping = proposeUniversalMapping(['Société', 'Alias', 'Autres noms', 'Nom commercial'], 'account')
    expect(mapping['Alias']).toBe('company_alias')
    expect(mapping['Société']).toBe('company_name')
    // Un champ n’est mappé qu'une fois : les en-têtes suivants restent à la main, jamais devinés.
    expect(Object.values(mapping).filter(key => key === 'company_alias')).toHaveLength(1)
  })

  it('sait dire NON : une colonne sans lien avec un alias n’est pas proposée', () => {
    expect(proposeUniversalMapping(['Société', 'Secteur'], 'account')['Secteur']).not.toBe('company_alias')
  })

  it('un alias n’existe pas pour les contacts (l’alias décrit une société)', () => {
    expect(universalImportFieldKeys('contact')).not.toContain('company_alias')
  })
})

// #4426.4 — les en-têtes du tableau de comptes d'un classeur de tiering.
describe('en-têtes reconnus (#4426.4)', () => {
  const tiering = ['Nom de la société', 'domain', 'linkedinUrl', 'Tiering (A, B, C)', 'Raison du tiering']

  it('« Nom de la société » est la colonne entreprise, « domain » le site', () => {
    const mapping = proposeUniversalMapping(tiering, 'account')
    expect(mapping['Nom de la société']).toBe('company_name')
    expect(mapping['domain']).toBe('website')
    expect(universalImportHeadersRecognised(tiering, 'account')).toBe(true)
  })

  it.each(['Société', 'Entreprise', 'Raison sociale'])('« %s » est reconnu comme nom de société', header => {
    expect(universalImportHeadersRecognised([header, 'Autre'], 'account')).toBe(true)
  })

  it('un titre et un tableau croisé ne reconnaissent aucune colonne entreprise', () => {
    expect(universalImportHeadersRecognised(['Tiering 2026-2027'], 'account')).toBe(false)
    expect(universalImportHeadersRecognised(['Tier', 'Nombre'], 'account')).toBe(false)
    expect(universalImportHeadersRecognised([], 'account')).toBe(false)
  })

  it('Prénom + Nom suffisent pour un contact, sans colonne « nom complet »', () => {
    expect(universalImportHeadersRecognised(['Prénom', 'Nom'], 'contact')).toBe(true)
  })
})

describe('#5223 — un dépôt, plusieurs feuilles', () => {
  const mapping = { Nom: 'company_name' }

  it('le lancement et la vérification portent N feuilles, chacune avec SA correspondance', () => {
    const sheets = [
      { name: 'A', mapping },
      { name: 'B', mapping: { 'Raison sociale': 'company_name' } },
    ]
    expect(universalImportStartSchema.safeParse({ mapping, sheets }).success).toBe(true)
    expect(universalImportVerifySchema.safeParse({ mapping, sheets }).success).toBe(true)
  })

  it('NON : deux fois la même feuille, ou une liste vide, ne passent pas', () => {
    const twice = [
      { name: 'A', mapping },
      { name: 'A', mapping },
    ]
    expect(universalImportStartSchema.safeParse({ mapping, sheets: twice }).success).toBe(false)
    expect(universalImportStartSchema.safeParse({ mapping, sheets: [] }).success).toBe(false)
  })

  it('deux colonnes « Email » et deux « Téléphone » : la seconde reste lisible, distincte et gardée en extra', () => {
    const headers = ['Nom', 'Email', 'Email (2)', 'Téléphone', 'Téléphone (2)']
    const proposed = proposeUniversalMapping(headers, 'contact')
    expect(proposed['Email']).toBe('email')
    expect(proposed['Email (2)']).toBeNull()
    const row = splitUniversalRow(
      { Nom: 'Ada', Email: 'a@x.test', 'Email (2)': 'b@x.test', Téléphone: '01', 'Téléphone (2)': '02' },
      proposed,
    )
    expect(row.extra).toMatchObject({ 'Email (2)': 'b@x.test', 'Téléphone (2)': '02' })
  })
})

// #5224 — le type d'une feuille se PROPOSE, à partir des alias du registre (jamais un score, jamais un défaut).
describe('import universel — #5224 détection du type par feuille', () => {
  it('des sociétés : le produit le dit et nomme les colonnes sur lesquelles il s’appuie', () => {
    const found = detectUniversalImportType(['Nom de la société', 'domain', 'Tiering (A, B, C)'])
    expect(found.type).toBe('account')
    expect(found.columns).toEqual(['Nom de la société', 'domain', 'Tiering (A, B, C)'])
  })

  it('des contacts : « Société » à côté d’un prénom et d’un nom ne fait pas de la feuille une liste de sociétés', () => {
    const found = detectUniversalImportType(['Prénom', 'Nom', 'E-mail', 'Poste', 'Société'])
    expect(found.type).toBe('contact')
    expect(found.columns).toEqual(['Prénom', 'Nom', 'E-mail', 'Poste', 'Société'])
  })

  it('NON : une feuille qui ne ressemble à rien est NOMMÉE sans type, jamais rangée dans un défaut', () => {
    expect(detectUniversalImportType(['Tiering 2026'])).toEqual({ type: null, columns: [], candidates: [] })
    expect(detectUniversalImportType([])).toEqual({ type: null, columns: [], candidates: [] })
  })

  it('NON : deux types à égalité ne se tranchent pas au jugé — les candidats sont nommés', () => {
    const found = detectUniversalImportType(['Libellé', 'Société'])
    expect(found.type).toBeNull()
    expect(found.candidates).toEqual(['need', 'mission'])
  })

  it('les comptes passent AVANT les contacts, l’ordre du fichier ne compte pas', () => {
    const sheets = [
      { name: 'Contacts', type: 'contact' as const, mapping: {} },
      { name: 'Sociétés', type: 'account' as const, mapping: {} },
      { name: 'Autres contacts', type: 'contact' as const, mapping: {} },
    ]
    expect(orderUniversalSheetPlans(sheets).map(sheet => sheet.name)).toEqual([
      'Sociétés',
      'Contacts',
      'Autres contacts',
    ])
  })

  it('une feuille peut porter SON type au lancement ; sans type, elle suit celui du dépôt', () => {
    const mapping = { Nom: 'full_name' }
    const typed = [{ name: 'A', mapping, type: 'contact' }]
    expect(universalImportStartSchema.safeParse({ mapping, sheets: typed }).success).toBe(true)
    expect(
      universalImportStartSchema.safeParse({ mapping, sheets: [{ name: 'A', mapping, type: 'inconnu' }] }).success,
    ).toBe(false)
  })
})
