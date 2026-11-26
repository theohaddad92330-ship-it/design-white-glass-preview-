import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RAG_INGESTION_EXCLUDED, RAG_INGESTION_MANIFEST } from './method-delta.js'
import { RAG_INGESTION_GUARD_CONSTANTS, ragIngestionRefusal } from './ingestion-guard.js'

/** Un export CRM tel qu'un commercial le télécharge : point-virgule (Excel FR),
 *  en-tête de coordonnées, des milliers de lignes derrière. */
const CRM_EXPORT = [
  'Prénom;Nom;Société;Fonction;Email;Téléphone',
  'Jean;Dupont;ACME;DSI;jean.dupont@acme.fr;01 42 00 00 00',
  'Marie;Martin;BETA;DAF;marie.martin@beta.fr;01 43 00 00 00',
  'Paul;Durand;GAMMA;CTO;paul.durand@gamma.fr;01 44 00 00 00',
].join('\n')

describe('la garde d’ingestion — ce que le manifeste NOMME', () => {
  it('refuse un fichier du paquet classé hors base de connaissance', () => {
    const refusal = ragIngestionRefusal({ filename: 'title_taxonomy_seed.json' })
    expect(refusal?.code).toBe('not_retrieval_knowledge')
    // Le refus DIT ce que le fichier est, pas seulement qu'il est refusé.
    expect(refusal?.message).toContain('title_taxonomy_seed.json')
    expect(refusal?.message).toContain('graine de classifieur')
  })

  it('laisse passer les deux entrées du manifeste qui SONT de la connaissance', () => {
    for (const entry of RAG_INGESTION_MANIFEST.filter(item => !item.notRag)) {
      expect(ragIngestionRefusal({ filename: entry.file, sample: 'Le plan de compte est une discipline.' })).toBeNull()
    }
  })

  it('ne juge PAS un fichier absent du manifeste sur son nom', () => {
    // Le manifeste est une liste d'autorisations pour LE PAQUET. Le lire comme
    // une liste d'interdictions pour tout le produit refuserait chaque dépôt.
    expect(ragIngestionRefusal({ filename: 'plaquette-commerciale.pdf', sample: 'Notre offre.' })).toBeNull()
    expect(ragIngestionRefusal({ filename: 'methode-vente.md', sample: 'Une objection se valide.' })).toBeNull()
  })
})

describe('la garde d’ingestion — le nom interne', () => {
  it('refuse un fichier dont le nom porte le codename interne', () => {
    // #3881 — « JE JAMAIS CITÉ DATAFORGE » : l'interdit (`RAG_INGESTION_EXCLUDED[1]`
    // == « doublon DATAFORGE V4 ») était déjà écrit ; rien ne l'appliquait.
    const refusal = ragIngestionRefusal({ filename: 'DATAFORGE_V4_FINAL (4).xlsx' })
    expect(refusal?.code).toBe('internal_codename')
    expect(refusal?.message).toContain('DATAFORGE_V4_FINAL (4).xlsx')
    expect(refusal?.message).toContain('doublon DATAFORGE V4')
  })

  it('refuse le codename interne quelle que soit la casse ou la ponctuation', () => {
    for (const name of ['dataforge-export.csv', 'Export_DataForge.xlsx', 'data forge (copie).pdf']) {
      expect(ragIngestionRefusal({ filename: name })?.code).toBe('internal_codename')
    }
  })

  it('ne refuse pas un nom qui ne porte pas le codename', () => {
    expect(ragIngestionRefusal({ filename: 'plaquette-commerciale.pdf', sample: 'Notre offre.' })).toBeNull()
  })

  it('refuse les trois codenames vus en recette prod (08/10, V13)', () => {
    // #3881 bis — « mémoire interne data forge » restituait ces trois noms
    // comme sources visibles au client.
    for (const name of [
      'STELYA_SOMETHING_FINAL (2).zip',
      'ORION_DATAPACK_V12_FINAL.zip',
      'CRM BASE DE DONNÉES BELLUMAI.xlsx',
    ]) {
      expect(ragIngestionRefusal({ filename: name })?.code).toBe('internal_codename')
    }
  })

  it('ne refuse pas un nom de prospect qui ressemble à Orion', () => {
    // Le codename est `oriondatapack`, jamais `orion` seul.
    expect(ragIngestionRefusal({ filename: 'Orion — fiche compte.pdf', sample: 'Notre offre.' })).toBeNull()
  })
})

describe('la garde d’ingestion — le carnet d’adresses', () => {
  it('refuse un export CRM brut', () => {
    const refusal = ragIngestionRefusal({ filename: 'export_crm_17387_contacts.csv', sample: CRM_EXPORT })
    expect(refusal?.code).toBe('contact_table')
    // Ce qui a été RECONNU est nommé — sinon la personne ne sait pas quoi corriger.
    expect(refusal?.message).toContain('Email')
    expect(refusal?.message).toContain('Téléphone')
  })

  it('refuse le même export en virgules, en tabulations, et sans extension parlante', () => {
    const comma = CRM_EXPORT.replace(/;/g, ',')
    const tab = CRM_EXPORT.replace(/;/g, '\t')
    expect(ragIngestionRefusal({ filename: 'contacts.txt', sample: comma })?.code).toBe('contact_table')
    expect(ragIngestionRefusal({ sample: tab })?.code).toBe('contact_table')
  })

  it('refuse un export dont seules les coordonnées sont en anglais', () => {
    const english = [
      'First name,Last name,Company,Work email,Phone number',
      'Jean,Dupont,ACME,jean@acme.fr,0142000000',
      'Marie,Martin,BETA,marie@beta.fr,0143000000',
      'Paul,Durand,GAMMA,paul@gamma.fr,0144000000',
    ].join('\n')
    expect(ragIngestionRefusal({ sample: english })?.code).toBe('contact_table')
  })
})

describe('la garde d’ingestion — ce qu’elle NE bloque PAS', () => {
  it('laisse passer un document de méthode, même avec des virgules partout', () => {
    const prose = [
      'Le plan de compte est une discipline hebdomadaire, pas un document figé.',
      'Le haut et le bas de l’organisation se travaillent en parallèle, jamais l’un après l’autre.',
      'Une objection se valide d’abord, puis s’explore par une question, sans réciter l’offre.',
      'Le NON-résultat d’une action est un résultat exploitable, et il se journalise.',
    ].join('\n')
    expect(ragIngestionRefusal({ filename: 'methode.md', sample: prose })).toBeNull()
  })

  it('laisse passer un tableau qui ne porte AUCUNE coordonnée', () => {
    const grid = [
      'Palier;Prix mensuel;Crédits inclus;Siège supplémentaire',
      'Starter;119;80;39',
      'Growth;249;250;59',
      'Team;sur devis;sur devis;sur devis',
    ].join('\n')
    expect(ragIngestionRefusal({ filename: 'grille.csv', sample: grid })).toBeNull()
  })

  it('laisse passer un tableau qui porte moins de trois colonnes personnelles', () => {
    // C'est le seuil qui sépare une bibliographie d'un carnet d'adresses.
    const sources = [
      'Source;URL;Email de contact',
      'BOAMP;https://boamp.fr;contact@boamp.fr',
      'DECP;https://data.gouv.fr;contact@data.gouv.fr',
      'BODACC;https://bodacc.fr;contact@bodacc.fr',
    ].join('\n')
    expect(ragIngestionRefusal({ filename: 'sources.csv', sample: sources })).toBeNull()

    // Deux colonnes personnelles : un annuaire d'outils, pas des personnes.
    const tools = [
      'Outil;Société éditrice;Email support;Documentation',
      'Registre;ACME;support@acme.fr;https://acme.fr/doc',
      'Annuaire;BETA;support@beta.fr;https://beta.fr/doc',
      'Cartographie;GAMMA;support@gamma.fr;https://gamma.fr/doc',
    ].join('\n')
    expect(ragIngestionRefusal({ filename: 'outils.csv', sample: tools })).toBeNull()
  })

  it('laisse passer un en-tête de contacts sans lignes derrière', () => {
    // Un gabarit vide n'est le carnet de personne.
    expect(ragIngestionRefusal({ sample: 'Prénom;Nom;Email;Téléphone' })).toBeNull()
  })

  it('laisse passer un dépôt vide ou binaire', () => {
    expect(ragIngestionRefusal({})).toBeNull()
    expect(ragIngestionRefusal({ filename: 'plaquette.pdf', sample: '%PDF-1.4\n%âãÏÓ\n' })).toBeNull()
  })
})

// ─── La parité avec la garde Python du service IA ────────────────────────────
//
// Cette garde n'est pas la seule porte du magasin : `rag_service.py` écrit dans
// `rag_documents` par deux chemins qui ne traversent jamais NestJS. Le refus est
// donc porté en Python aussi, et il ne peut pas y être importé (la racine
// Railway du service IA est `apps/ia`). Le JSON est le point de rencontre :
// ici on vérifie qu'il dit ce que dit le TypeScript, et
// `apps/ia/tests/test_ingestion_guard.py` vérifie que le Python dit ce que dit
// le JSON. Une divergence casse l'un des deux, jamais aucun.

describe('la garde d’ingestion — la parité avec le service IA', () => {
  const snapshot = JSON.parse(
    readFileSync(new URL('./ingestion-guard.constants.json', import.meta.url), 'utf8'),
  ) as typeof RAG_INGESTION_GUARD_CONSTANTS

  it('le JSON partagé dit EXACTEMENT ce que dit ce fichier', () => {
    // `JSON.parse(JSON.stringify(...))` et non l'objet nu : c'est ce que l'autre
    // côté LIT réellement, donc c'est ce qu'il faut comparer.
    expect(snapshot).toEqual(JSON.parse(JSON.stringify(RAG_INGESTION_GUARD_CONSTANTS)))
  })

  it('et ce JSON porte un corpus NON VIDE', () => {
    // La preuve qu'elle lit quelque chose : un fichier vidé, tronqué, ou dont
    // une liste aurait disparu passerait le test d'égalité ci-dessus le jour où
    // le TypeScript se viderait aussi. Ces bornes-là ne peuvent pas se vider
    // ensemble sans que quelqu'un le remarque.
    expect(snapshot.coordinateWords.length).toBeGreaterThanOrEqual(10)
    expect(snapshot.identityWords.length).toBeGreaterThanOrEqual(16)
    expect(snapshot.separators).toEqual([';', '\t', ','])
    expect(snapshot.manifest.length).toBe(RAG_INGESTION_MANIFEST.length)
    expect(snapshot.excluded.length).toBe(RAG_INGESTION_EXCLUDED.length)
    expect(snapshot.internalCodenames.length).toBeGreaterThanOrEqual(1)
    expect(snapshot.messages.contact_table).toContain('{columns}')
    expect(snapshot.messages.not_retrieval_knowledge).toContain('{file}')
    expect(snapshot.messages.internal_codename).toContain('{file}')
  })

  it('nomme l’interdit que le script d’import CRM enfreignait, en toutes lettres', () => {
    // `apps/ia/scripts/ingest_crm.py` insérait un export Excel ligne à ligne
    // dans `rag_documents`. C'était mot pour mot cette première ligne.
    expect(snapshot.excluded[0]).toBe('export CRM brut')
  })
})
