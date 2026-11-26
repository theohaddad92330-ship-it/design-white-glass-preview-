import { IMPORT_ORDER, IMPORT_SOURCES, isReadableImportFormat, proposeMapping } from '@bellum/contracts'
import { IMPORT_CATALOG, findImportSource, receivableFields } from './import-catalog'

/**
 * Le catalogue d'import — et le descripteur de l'ancien CRM (LEGACY-005).
 *
 * Le premier test est celui sans lequel les autres ne prouvent rien : un
 * catalogue vide ferait passer chaque « la source X est bien décrite » au vert
 * par absence de sujet.
 */
describe('le catalogue décrit réellement ses sources', () => {
  it('décrit CHAQUE source déclarée — aucune carte sans mode d’emploi', () => {
    expect(IMPORT_CATALOG.length).toBe(IMPORT_SOURCES.length)
    expect(IMPORT_CATALOG.length).toBeGreaterThanOrEqual(13)
    for (const source of IMPORT_CATALOG) {
      expect(source.imports.length).toBeGreaterThan(0)
      expect(source.howTo.trim().length).toBeGreaterThan(0)
      // Les alias et les champs obligatoires ne valent que pour un TABLEAU.
      // `cv_bulk` est une archive de documents : lui inventer des colonnes ne
      // décrirait rien. C'est la seule source dans ce cas, et le test le fige.
      if (source.format === 'csv') {
        expect(Object.keys(source.aliases).length).toBeGreaterThan(0)
        expect(source.required.length).toBeGreaterThan(0)
      }
    }
  })

  it('les alias sont écrits sous leur forme NORMALISÉE — sinon ils ne matchent jamais', () => {
    for (const source of IMPORT_CATALOG) {
      for (const alias of Object.keys(source.aliases)) {
        expect(alias).toBe(alias.toLowerCase())
        expect(alias).not.toMatch(/[éèêàçùû\s-]/)
      }
    }
  })
})

/**
 * #2078.29 — la garde qui aurait attrapé le point AVANT qu'il ne soit ouvert.
 *
 * `IMPORT_ORDER` (contrat) déclare les objets ; ce catalogue (apps/api) leur
 * donne un MAPPAGE de colonnes. Le contrat ne peut pas vérifier ça lui-même —
 * il ne connaît pas ce fichier. Sans cette garde, un objet peut vivre dans
 * `IMPORT_ORDER` sans qu'aucune source ne sache le LIRE, ce qui est exactement
 * ce qui est arrivé à « document » et « reference ». Un neuvième objet ajouté
 * à `IMPORT_ORDER` sans sa source ici fait rougir CE test.
 */
describe('#2078.29 — CHAQUE objet d’IMPORT_ORDER a son mappage de colonnes', () => {
  it('a au moins une source TABULAIRE qui le lit, avec ses alias et ses champs obligatoires', () => {
    // `zip` (cv_bulk) est la SEULE source sans colonnes (une archive de
    // documents, pas un tableau) — csv ET xlsx portent alias/required, comme
    // `missions` (xlsx) le prouve déjà juste au-dessus dans ce catalogue.
    const missing: string[] = []
    for (const object of IMPORT_ORDER) {
      const sources = IMPORT_CATALOG.filter(source => source.objects.includes(object) && source.format !== 'zip')
      const described = sources.some(source => Object.keys(source.aliases).length > 0 && source.required.length > 0)
      if (!described) missing.push(object)
    }
    expect(missing).toEqual([])
  })
})

describe('#2078.29 — « Documents » (need_documents) — le devis, la NDA, le contrat cadre', () => {
  const documents = findImportSource('need_documents')

  it('existe, et lit les trois champs du document', () => {
    expect(documents).toBeDefined()
    expect(documents?.objects).toEqual(['document'])
    expect(documents?.aliases['type']).toBe('kind')
    expect(documents?.aliases['nom']).toBe('name')
    expect(documents?.aliases['statut']).toBe('status')
  })

  it('exige un nom ET une nature — les deux sont NOT NULL sur `need_documents`', () => {
    expect(documents?.required).toEqual(['name', 'kind'])
  })

  it('dit qu’aucun FICHIER n’est repris, seulement le SUIVI', () => {
    // `need_documents.storage_object_id` reste NULL pour une ligne importée :
    // le fichier lui-même ne voyage pas par un tableur.
    const skips = documents?.skips.join(' ') ?? ''
    expect(skips.toLowerCase()).toContain('fichier')
  })
})

describe('#2078.29 — « Références » (testimonials) — le témoignage client', () => {
  const references = findImportSource('testimonials')

  it('existe, et lit la citation avec son auteur', () => {
    expect(references).toBeDefined()
    expect(references?.objects).toEqual(['reference'])
    expect(references?.aliases['citation']).toBe('quote')
    expect(references?.aliases['auteur']).toBe('author_name')
  })

  it('exige une citation — un témoignage sans citation n’en est pas un', () => {
    expect(references?.required).toEqual(['quote'])
  })

  it('dit qu’aucune référence importée n’est publiable sans accord relu à la main', () => {
    const skips = references?.skips.join(' ') ?? ''
    expect(skips.toLowerCase()).toMatch(/accord|consentement|publi/)
  })
})

describe('salesconnect_legacy_export — la reprise nominative', () => {
  const legacy = findImportSource('salesconnect_legacy_export')

  it('existe, et n’est PAS un réglage de l’export générique', () => {
    expect(legacy).toBeDefined()
    // Ses colonnes ont des noms à elle : `societe_nom`, `email_1`,
    // `responsable_manager` n'apparaissent dans aucune autre source.
    expect(legacy?.aliases['societe_nom']).toBe('company')
    expect(legacy?.aliases['email_1']).toBe('email')
    expect(legacy?.aliases['responsable_manager']).toBe('owner')
  })

  it('exige une adresse — une fiche sans adresse n’est pas reprenable', () => {
    expect(legacy?.required).toEqual(['email'])
  })

  it('DIT ce qu’elle ne reprend pas, et combien', () => {
    // La moitié qui compte : 31 des 38 colonnes de l'ancien outil n'ont pas
    // d'équivalent. Les rattacher au champ le plus proche produirait une base
    // qu'on ne peut plus démêler sur 17 387 lignes.
    const skips = legacy?.skips.join(' ') ?? ''
    expect(skips).toContain('31')
    expect(skips).toContain('LISTÉES')
  })

  it('explique où trouver le fichier, et sous quelle forme', () => {
    expect(legacy?.howTo).toContain('CP1252')
    expect(legacy?.howTo).toContain('point-virgule')
  })
})

/**
 * #2148.19 — DEUX types de fichiers manquants au catalogue (issue #2148,
 * section « INGESTION MÉTIER — Types de fichiers à reconnaître »), tranchés
 * sans Louis (règle du lot : la recommandation la plus sûre plutôt qu'un
 * « à trancher »).
 *
 * Le troisième type nommé par l'issue — « tableau de besoins » — N'EST PAS un
 * gap : `projects.skips` (ligne ~211) dit déjà, et de façon datée (#2078.29),
 * que les besoins « se créent depuis le projet ». Ajouter une source
 * standalone contredirait cette décision existante sans son arbitrage —
 * laissé tel quel, comme #2148.7 (antériorité Louis 10/09) juste au-dessus.
 */
describe('#2148.19 — « Appels d’offres » (tenders) — le besoin décrit par un client', () => {
  // Tranché sans Louis : un appel d'offres DÉCRIT un besoin à pourvoir — même
  // objet cible que `need_documents`/`boondmanager_export` (`need`), jamais un
  // objet nouveau qu'aucune page canonique ne connaît encore.
  const tenders = findImportSource('tender_records')

  it('existe, et lit l’intitulé, le compte et l’échéance', () => {
    expect(tenders).toBeDefined()
    expect(tenders?.objects).toEqual(['need'])
    expect(tenders?.aliases['intitule']).toBe('title')
    expect(tenders?.aliases['date_limite']).toBe('deadline')
  })

  it('exige un intitulé — un appel d’offres sans objet n’en est pas un', () => {
    expect(tenders?.required).toEqual(['title'])
  })

  it('dit qu’elle ne reprend pas le mémoire technique lui-même', () => {
    const skips = tenders?.skips.join(' ') ?? ''
    expect(skips.toLowerCase()).toMatch(/mémoire|document|pièce/)
  })
})

describe('#2850 (#2148.25, reste 27/09) — « Deals » (deals_export) — l’affaire d’un CRM tiers', () => {
  // Tranché sans Louis : le contrat n'a pas d'objet « deal » distinct —
  // `opportunities` porte déjà les affaires via `project`. Le geste bloqué
  // n'était pas l'écriture (déjà ouverte pour `project`) mais le CHOIX à
  // l'écran : aucune source ne portait `objects: ['deal']`, un export
  // « Deals » était donc invisible dans l'assistant. Même précédent que
  // `tender_records` → `need`.
  const deals = findImportSource('deals_export')

  it('existe, et route vers `project` — DÉJÀ writable, aucun objet inventé', () => {
    expect(deals).toBeDefined()
    expect(deals?.objects).toEqual(['project'])
    expect(deals?.aliases['deal_name']).toBe('label')
    expect(deals?.aliases['deal_stage']).toBe('stage')
  })

  it('exige le compte ET l’intitulé — comme `projects`, même objet cible', () => {
    expect(deals?.required).toEqual(['company', 'label'])
  })

  it('dit qu’elle ne reprend pas les besoins — ils se créent depuis le projet', () => {
    const skips = deals?.skips.join(' ') ?? ''
    expect(skips.toLowerCase()).toMatch(/besoin/)
  })
})

describe('#2148.19 — « Référentiel interne » (internal_directory) — le savoir déjà écrit', () => {
  // Tranché sans Louis : un référentiel interne (méthodologies, argumentaires,
  // études de cas) est un DOCUMENT consultable, pas un objet métier vivant —
  // même famille que `testimonials` (`reference`), jamais publié seul.
  const directory = findImportSource('internal_directory')

  it('existe, et lit le titre et le domaine', () => {
    expect(directory).toBeDefined()
    expect(directory?.objects).toEqual(['reference'])
    expect(directory?.aliases['titre']).toBe('title')
    expect(directory?.aliases['domaine']).toBe('domain_area')
  })

  it('exige un titre — une entrée sans titre ne se retrouve pas', () => {
    expect(directory?.required).toEqual(['title'])
  })
})

describe('les formats non lisibles sont ANNONCÉS, pas masqués', () => {
  it('quatre sources déclarent un format que le lecteur ne sait pas ouvrir', () => {
    const unreadable = IMPORT_SOURCES.filter(source => !isReadableImportFormat(source.format))
    // Ce n'est pas un défaut à corriger en douce : ces reprises sont prévues, et
    // masquer leur carte retirerait cette information. Le test fige le compte
    // pour qu'un cinquième format déclaré sans lecteur se remarque.
    expect(unreadable.map(source => source.key).sort()).toEqual([
      'boondmanager_export',
      'cv_bulk',
      'missions',
      'talent_pool',
    ])
  })

  it('le CSV, lui, se lit', () => {
    expect(isReadableImportFormat('csv')).toBe(true)
    expect(isReadableImportFormat('xlsx')).toBe(false)
    expect(isReadableImportFormat('zip')).toBe(false)
  })
})

/**
 * Les champs qu'une source sait RECEVOIR (§7.4, étape 3 — « Corriger »).
 *
 * L'assistant proposait une correspondance de colonnes, la renvoyait au
 * navigateur… et le navigateur la jetait. Rebrancher l'étape 3 demande une
 * chose que le client n'avait pas : la liste des champs auxquels il a le droit
 * de rattacher une colonne non reconnue. Elle se DÉRIVE des alias — c'est le
 * seul endroit qui la connaît — plutôt que d'être recopiée à la main, sinon les
 * deux listes divergent au premier alias ajouté, et l'écran offrirait un champ
 * que le moteur n'écrit nulle part.
 *
 * On n'expose PAS les alias eux-mêmes : ce sont les orthographes acceptées, pas
 * des champs, et laisser le client refaire `proposeMapping` dupliquerait une
 * dérivation qui doit vivre à un seul endroit.
 */
describe('les champs recevables d’une source', () => {
  it('sont dérivés des alias, dédoublonnés et triés', () => {
    const fields = receivableFields(findImportSource('contacts_only')!)
    expect(fields.length).toBeGreaterThan(0)
    expect(fields).toEqual([...new Set(fields)].sort())
  })

  it('contiennent TOUS les champs obligatoires — sinon l’écran ne permettrait pas de débloquer l’import', () => {
    for (const source of IMPORT_CATALOG) {
      const fields = receivableFields(source)
      for (const required of source.required) {
        expect({ source: source.key, required, fields }).toMatchObject({ fields: expect.arrayContaining([required]) })
      }
    }
  })

  it('ne rendent RIEN pour une source sans colonnes — une archive de CV n’a pas de correspondance à corriger', () => {
    expect(receivableFields(findImportSource('cv_bulk')!)).toEqual([])
  })

  it('le catalogue n’est pas vide — sans quoi les trois tests ci-dessus passeraient par absence de sujet', () => {
    expect(IMPORT_CATALOG.length).toBeGreaterThanOrEqual(13)
  })
})

/** #3753.1 — le tiering d'une ESN (tier, raison, problématiques, projets IT) est reconnu, FR comme EN. */
describe('#3753 — alias du tiering sur la source « comptes »', () => {
  const aliases = findImportSource('accounts_only')!.aliases
  it.each([
    ['tier', 'tier'],
    ['tiering', 'tier'],
    ['priorite', 'tier'],
    ['priority', 'tier'],
    ['raison_du_tiering', 'selection_reason'],
    ['raison', 'selection_reason'],
    ['reason', 'selection_reason'],
    ['problematiques_adressables', 'addressable_issues'],
    ['projets_it_a_venir', 'upcoming_it_projects'],
    ['domaine', 'domain'],
    ['site', 'domain'],
    ['website', 'domain'],
  ])('« %s » → %s', (alias, field) => {
    expect(aliases[alias]).toBe(field)
  })
})

/**
 * #4053.3 (recette prod 14/10) — « Secteur d'activité », « Nombre d'employés » et « Ville » finissaient
 * en « Colonnes non rattachées » alors que le COMPTE sait les porter (secteur, effectif, siège). Le
 * rattachement est commun à toutes les sources qui parlent d'une société, pas réservé à une seule.
 */
describe('#4053.3 — les colonnes de profil société sont rattachées au COMPTE, pour toute source', () => {
  const headers = ['Secteur d’activité', 'Nombre d’employés', 'Ville']
  // Les sources bâties sur le groupe d'alias SOCIÉTÉ commun (pas le format figé du CRM historique à sept colonnes).
  const sources = IMPORT_CATALOG.filter(source => source.aliases['societe'] === 'company')

  it('« Export CRM générique » rattache les trois colonnes', () => {
    const mapping = proposeMapping(headers, findImportSource('crm_generic_export')!.aliases)
    expect(mapping.columns).toEqual({
      'Secteur d’activité': 'sector',
      'Nombre d’employés': 'employees',
      Ville: 'headquarters',
    })
    expect(mapping.ignored).toEqual([])
  })

  it('toutes les sources qui portent une société les rattachent aussi — pas seulement l’export générique', () => {
    expect(sources.length).toBeGreaterThan(2)
    for (const source of sources) {
      const mapping = proposeMapping(headers, source.aliases)
      expect({ source: source.key, ignored: mapping.ignored }).toEqual({ source: source.key, ignored: [] })
    }
  })
})

/**
 * M2.1 (Meyer 20/10) — le Wizard reconnaît un export de contacts d'un outil de gestion.
 *
 * Mesuré sur les 38 en-têtes réels : « Export de ton CRM » en rattachait 4 (« Email 1 » et « Société - Nom »
 * manquaient, « Ville » partait vers `headquarters`), « Ancien CRM » 7 — donc 0 ligne exploitable chez le client.
 */
const MEYER_HEADERS_38 = [
  'Référence interne',
  'Civilité',
  'Nom',
  'Prénom',
  'Fonction',
  'Service',
  'Société - Nom',
  'Société - Secteur',
  'Société - Informations',
  'État',
  'Provenance - Type',
  'Provenance - Détail',
  'Email 1',
  'Email 2',
  'Email 3',
  'Téléphone 1',
  'Téléphone 2',
  'Adresse',
  'Code postal',
  'Ville',
  'Pays',
  'Société - Téléphone',
  'Société - Adresse',
  'Société - Code postal',
  'Société - Ville',
  'Société - Pays',
  'Périmètre Technique',
  'Responsable manager',
  'Agence',
  'Date de création',
  'Date de MAJ',
  'Domaines',
  'Outils',
  'Société - État',
  'Société - Effectif',
  'Société - Référence interne',
  'Société - Agence',
  'Type',
] as const

describe('M2.1 — un export BoondManager de contacts est reconnu par le Wizard', () => {
  it.each(['hubspot_export', 'crm_generic_export', 'salesconnect_legacy_export', 'contacts_only'])(
    '%s : e-mail, société, téléphone, références mappés ; la Ville du contact ne va PAS au siège',
    key => {
      const source = findImportSource(key)
      expect(source).toBeDefined()
      const { columns } = proposeMapping(MEYER_HEADERS_38, source!.aliases, { object: 'contact' })
      expect(columns).toMatchObject({
        'Email 1': 'email',
        'Société - Nom': 'company',
        'Téléphone 1': 'phone',
        'Référence interne': 'sourceRef',
        'Société - Référence interne': 'companyRef',
        'Société - Secteur': 'sector',
        'Société - Effectif': 'employees',
        'Société - Ville': 'headquarters',
        'Société - État': 'companyStatus',
        Fonction: 'title',
      })
      expect(Object.values(columns).filter(field => field === 'headquarters')).toHaveLength(1)
      expect(columns['Ville']).toBeUndefined()
      expect(Object.keys(columns).length).toBeGreaterThanOrEqual(12)
    },
  )

  it('« Nom » à côté de « Prénom » est le nom de famille, jamais le nom complet', () => {
    const { columns } = proposeMapping(MEYER_HEADERS_38, findImportSource('hubspot_export')!.aliases, {
      object: 'contact',
    })
    expect(columns['Nom']).toBe('lastName')
    expect(columns['Prénom']).toBe('firstName')
  })

  it('même pour un import de sociétés, « Ville » du contact cède la place à « Société - Ville »', () => {
    const { columns } = proposeMapping(MEYER_HEADERS_38, findImportSource('hubspot_export')!.aliases, {
      object: 'account',
    })
    expect(columns['Société - Ville']).toBe('headquarters')
    expect(columns['Ville']).toBeUndefined()
    // La référence du CONTACT ne devient pas celle du compte : « Société - Référence interne » fait foi.
    expect(columns['Société - Référence interne']).toBe('companyRef')
    expect(columns['Référence interne']).toBeUndefined()
  })
})
