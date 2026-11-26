import { describe, expect, it } from 'vitest'
import {
  DEDUP_KEYS,
  IMPORT_ORDER,
  IMPORT_SOURCES,
  WRITABLE_IMPORT_OBJECTS,
  isWritableImportObject,
  orderViolations,
} from './import.js'

/**
 * #2078.29 — « Historique · Documents · Références » manquaient au catalogue
 * d'import. « Historique » (`activity`) était déjà là ; « Documents » et
 * « Références » étaient absents d'`IMPORT_ORDER` — un enum FERMÉ qui commande
 * le moteur, la déduplication et l'écriture.
 *
 * Ce fichier tient la garde que le point demandait : `IMPORT_ORDER` est un
 * ORDRE, pas une liste, et il ne suffit pas d'y ajouter un mot. Un NEUVIÈME
 * objet ajouté sans son attirail (source qui le produit, clé de
 * déduplication, dépendance déclarée) doit faire rougir CE fichier — c'est
 * exactement ce qui a laissé `document` et `reference` dans un angle mort :
 * `IMPORT_ORDER` ne les portait pas, donc rien d'autre n'avait de raison de
 * les porter non plus.
 */
describe('#2078.29 — IMPORT_ORDER commande tout le reste, jamais l’inverse', () => {
  it('« Documents » et « Références » sont maintenant des objets importables', () => {
    expect(IMPORT_ORDER).toContain('document')
    expect(IMPORT_ORDER).toContain('reference')
  })

  it('CHAQUE objet d’IMPORT_ORDER est produit par au moins UNE source déclarée', () => {
    // La garde qui aurait attrapé le point AVANT qu'il ne soit ouvert : un objet
    // énuméré sans aucune source qui le produit n'est atteignable par personne.
    const produced = new Set(IMPORT_SOURCES.flatMap(source => source.objects))
    const orphans = IMPORT_ORDER.filter(object => !produced.has(object))
    expect(orphans).toEqual([])
  })

  it('CHAQUE objet d’IMPORT_ORDER porte une règle de déduplication — même vide, jamais absente', () => {
    // `DEDUP_KEYS` est typé `Record<ImportObject, …>` : TypeScript refuse déjà
    // de compiler un objet sans entrée. Ce test le prouve aussi à l'exécution,
    // pour qu'un lecteur du rapport de test voie la garantie sans lire le type.
    for (const object of IMPORT_ORDER) {
      expect(Object.keys(DEDUP_KEYS)).toContain(object)
    }
  })

  it('un objet AJOUTÉ à IMPORT_ORDER sans source qui le produit fait rougir CE test', () => {
    // Preuve que la garde sait dire NON : un objet fantôme, absent de toute
    // source, doit apparaître dans les orphelins.
    const produced = new Set(IMPORT_SOURCES.flatMap(source => source.objects))
    expect(produced.has('fantome' as never)).toBe(false)
  })
})

/**
 * « Documents » dépend du BESOIN qui le porte (`NeedDocumentEntity.need_id`,
 * NOT NULL) : un document sans besoin déjà présent — dans le fichier ou en
 * base — est refusé, comme un contact sans compte (T3, `import-engine.test.ts`).
 */
describe('#2078.29 — « Documents » dépend d’un besoin déjà présent', () => {
  it('refuse un document sans besoin préalable', () => {
    expect(orderViolations({ importing: ['document'], available: [] })).toEqual(['document'])
  })

  it('accepte quand le besoin est déjà en base', () => {
    expect(orderViolations({ importing: ['document'], available: ['need'] })).toEqual([])
  })

  it('accepte quand le fichier apporte les deux', () => {
    // `need` porte lui-même un parent (`account`, #2558.1) : la chaîne complète
    // doit être satisfaite, pas seulement la paire besoin/document.
    expect(orderViolations({ importing: ['need', 'document'], available: ['account'] })).toEqual([])
  })
})

/**
 * « Références » (témoignages client) dépend du COMPTE — même dépendance que
 * `activity` et `mission`, qui portent déjà `account` comme parent.
 */
describe('#2078.29 — « Références » dépend d’un compte déjà présent', () => {
  it('refuse une référence sans compte préalable', () => {
    expect(orderViolations({ importing: ['reference'], available: [] })).toEqual(['reference'])
  })

  it('accepte quand le compte est déjà en base', () => {
    expect(orderViolations({ importing: ['reference'], available: ['account'] })).toEqual([])
  })
})

/**
 * ⚠️ Ni « Documents » ni « Références » ne s'ÉCRIVENT — comme `talent`,
 * `submission`, `mission` et `activity`. Leurs tables réelles existent
 * (`need_documents`, `testimonials`) mais chacune porte une contrainte NOT
 * NULL qu'un import générique CSV ne peut pas honorer sans deviner :
 * `need_documents.need_id` référence un besoin PRÉCIS (aucune résolution
 * « libellé → UUID » n'existe pour un import déclaratif), et
 * `testimonials.publishable` engage un accord écrit qu'une ligne de tableur
 * ne prouve jamais. Les inventer serait exactement CE que la doctrine
 * refuse : deviner un chemin d'écriture plutôt que le mesurer. Ce test dit
 * NON à la fois — un objet non-écrit doit LE RESTER tant que personne n'a
 * construit la résolution qui manque.
 *
 * `need` (le besoin lui-même, pas ses documents) N'EST PLUS dans ce lot
 * depuis #2148.25/#2850 : contrairement à `need_documents`, il ne référence
 * qu'une entreprise déjà connue — la MÊME résolution que `project`, pas une
 * clé à deviner.
 */
describe('#2078.29 — aucune écriture inventée : Documents et Références restent SIMULÉS', () => {
  it('« document » n’est pas dans les objets écrits', () => {
    expect(isWritableImportObject('document' as never)).toBe(false)
    expect(WRITABLE_IMPORT_OBJECTS).not.toContain('document')
  })

  it('« reference » n’est pas dans les objets écrits', () => {
    expect(isWritableImportObject('reference' as never)).toBe(false)
    expect(WRITABLE_IMPORT_OBJECTS).not.toContain('reference')
  })

  // #2732.1 + #5022.1 (recette prod 31/10) : `mission` rejoint la liste — Documents et Références restent simulés.
  it('les six seuls objets écrits sont account, contact, mission, need, project, talent', () => {
    expect([...WRITABLE_IMPORT_OBJECTS].sort()).toEqual(['account', 'contact', 'mission', 'need', 'project', 'talent'])
  })
})

/**
 * #2148.25/#2850 (reste, 27/09) — LE TALENT ÉCRIT, À SON TOUR : sa clé de
 * dédup (`email`/`phone`/`name+lastEmployer`) existait déjà dans `DEDUP_KEYS`
 * sans qu'aucune écriture ne l'utilise — contrairement à `need`, il n'a pas
 * fallu attendre qu'elle soit vide pour se poser la question de la deviner.
 */
describe('#2148.25/#2850 (reste) — « talent » écrit, sans dépendance de compte', () => {
  it('« talent » est dans les objets écrits', () => {
    expect(isWritableImportObject('talent' as never)).toBe(true)
    expect(WRITABLE_IMPORT_OBJECTS).toContain('talent')
  })

  it('n’a AUCUNE dépendance : un talent s’importe sans compte préalable', () => {
    expect(orderViolations({ importing: ['talent'], available: [] })).toEqual([])
  })

  it('« deal » n’existe pas comme objet écrit distinct : aucun objet de ce nom dans le contrat', () => {
    expect(WRITABLE_IMPORT_OBJECTS).not.toContain('deal' as never)
  })
})

/**
 * #2148.25/#2850 — LE BESOIN ÉCRIT, ENFIN : `DEDUP_KEYS.need` est vide PAR
 * CONCEPTION (deux besoins identiques le même jour sont deux besoins
 * distincts), donc `need` n'avait besoin d'aucune clé de dédup pour devenir
 * writable — seule la dépendance compte déjà connue, comme `project`.
 */
describe('#2148.25/#2850 — « besoin » écrit, dépend d’un compte déjà présent', () => {
  it('« need » est dans les objets écrits', () => {
    expect(isWritableImportObject('need' as never)).toBe(true)
    expect(WRITABLE_IMPORT_OBJECTS).toContain('need')
  })

  it('refuse un besoin sans compte préalable', () => {
    expect(orderViolations({ importing: ['need'], available: [] })).toEqual(['need'])
  })

  it('accepte quand le compte est déjà en base', () => {
    expect(orderViolations({ importing: ['need'], available: ['account'] })).toEqual([])
  })
})
