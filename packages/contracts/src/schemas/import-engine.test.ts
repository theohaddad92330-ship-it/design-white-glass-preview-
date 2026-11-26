import { describe, expect, it } from 'vitest'
import {
  applyNormalisation,
  blocksApply,
  dedupKeyOf,
  dedupKeysOf,
  detectImportSource,
  duplicatesInFile,
  mappingConfidence,
  normaliseAmountCents,
  normaliseCompanyName,
  normaliseDate,
  normaliseDomain,
  normaliseEmail,
  normalisePhone,
  proposeMapping,
  simulateImport,
  suggestMapping,
  withDedupInputs,
  withRowError,
} from './import-engine.js'
import { wizardImportBreakdown } from './universal-import.js'
import { orderViolations, rollbackDecision, type DryRunReport } from './import.js'

/** La somme des seaux DOIT égaler le nombre de lignes traitées — jamais une ligne perdue. */
function sumOfBuckets(report: DryRunReport): number {
  return report.creations + report.updates + report.skipped.length + report.errors.length
}

/**
 * BEL-INT-602 — les six tests obligatoires du ticket, et les règles qui les
 * portent.
 *
 * Le PDF ouvre son §7 par un chiffre du marché : « nettoyer après coûte 3 à
 * 10 fois plus cher que nettoyer avant ». Tout ce fichier existe pour rendre le
 * « avant » possible.
 */

describe('normalisation — chaque règle, et ce qu’elle REFUSE', () => {
  it('met un numéro au format international, et refuse ce qui n’en est pas un', () => {
    expect(normalisePhone('06 12 34 56 78')).toBe('+33612345678')
    expect(normalisePhone('+33 6 12 34 56 78')).toBe('+33612345678')
    expect(normalisePhone('0033612345678')).toBe('+33612345678')
    // `null` et non la valeur d'origine : une chaîne qui ne ressemble pas à un
    // numéro n'en devient pas un parce qu'on l'a recopiée.
    expect(normalisePhone('poste 4512')).toBeNull()
  })

  it('refuse une date AMBIGUË plutôt que d’en choisir une', () => {
    // 01/02/2026 est le 1er février en France et le 2 janvier aux États-Unis.
    // Une date mal lue ne se voit qu'à la relance, trois semaines plus tard,
    // chez un client.
    expect(normaliseDate('01/02/2026')).toBeNull()
    // Au-delà de 12, il n'y a plus d'ambiguïté.
    expect(normaliseDate('21/02/2026')).toBe('2026-02-21')
    expect(normaliseDate('2026-02-21')).toBe('2026-02-21')
    expect(normaliseDate('la semaine prochaine')).toBeNull()
  })

  it('convertit en CENTIMES, jamais en flottant', () => {
    // Un montant qui traverse deux conversions affiche 1 999,99 € là où la
    // facture dit 2 000 €.
    expect(normaliseAmountCents('2 000,00 €')).toBe(200000)
    expect(normaliseAmountCents('650')).toBe(65000)
    expect(normaliseAmountCents('à négocier')).toBeNull()
  })

  it('extrait un domaine, d’une URL comme d’une adresse', () => {
    expect(normaliseDomain('https://www.acme.fr/contact')).toBe('acme.fr')
    expect(normaliseDomain('theo@acme.fr')).toBe('acme.fr')
    expect(normaliseDomain('acme')).toBeNull()
  })

  it('retire la forme juridique pour comparer deux raisons sociales', () => {
    expect(normaliseCompanyName('ACME SAS')).toBe('acme')
    expect(normaliseCompanyName('Acme S.A.S.')).toBe('acme')
  })

  it('valide une adresse et la met en minuscules', () => {
    expect(normaliseEmail('  Theo@ACME.fr ')).toBe('theo@acme.fr')
    expect(normaliseEmail('theo(at)acme.fr')).toBeNull()
  })

  it('laisse la valeur BRUTE quand la règle est éteinte', () => {
    // Une ESN dont les numéros internes ne sont pas des téléphones verrait sa
    // colonne massacrée par une mise au format international.
    expect(applyNormalisation('phone', 'poste 4512', ['phone_international']).value).toBe('poste 4512')
    expect(applyNormalisation('phone', 'poste 4512', []).value).toBeNull()
  })
})

describe('mapping — proposé, jamais deviné', () => {
  it('rattache par alias et LISTE ce qu’il n’a pas reconnu', () => {
    const mapping = proposeMapping(['Adresse e-mail', 'Nom', 'Code interne'], {
      adresse_e_mail: 'email',
      nom: 'name',
    })
    expect(mapping.columns).toEqual({ 'Adresse e-mail': 'email', Nom: 'name' })
    // Le repli positionnel (« la 3ᵉ colonne est sûrement l'e-mail ») est
    // exactement ce qui fait entrer des numéros dans un champ société.
    expect(mapping.ignored).toEqual(['Code interne'])
  })
})

describe('déduplication — avant écriture, jamais sans clé', () => {
  it('prend la PREMIÈRE clé qui matche, dans l’ordre', () => {
    // Un SIREN identique est une certitude ; un nom normalisé identique ne l'est
    // pas. Les évaluer dans l'autre sens rapprocherait deux homonymes.
    expect(dedupKeyOf('account', { siren: '552100554', domain: 'acme.fr' })).toBe('siren:552100554')
    expect(dedupKeyOf('account', { domain: 'acme.fr' })).toBe('domain:acme.fr')
  })

  it('rend `null` plutôt que de rapprocher deux lignes sans clé', () => {
    // Les regrouper produirait le rapprochement le plus destructeur d'un CRM :
    // deux personnes fusionnées parce qu'aucune n'avait d'e-mail.
    expect(dedupKeyOf('contact', { title: 'DSI' })).toBeNull()
    expect(duplicatesInFile('contact', [{ title: 'DSI' }, { title: 'DSI' }])).toEqual([])
  })

  it('repère les doublons DANS le fichier', () => {
    const found = duplicatesInFile('contact', [{ email: 'a@acme.fr' }, { email: 'b@acme.fr' }, { email: 'a@acme.fr' }])
    expect(found).toEqual([{ row: 3, matchedOn: ['email'], confidence: 1 }])
  })
})

describe('T1 — 1 000 lignes dont des invalides : simulation exacte, aucune écriture', () => {
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    Email: index < 956 ? `p${index}@acme.fr` : 'pas-une-adresse',
    Nom: `Personne ${index}`,
  }))

  const report = simulateImport({
    object: 'contact',
    headers: ['Email', 'Nom'],
    rows,
    mapping: { columns: { Email: 'email', Nom: 'name' }, ignored: [], disabledRules: [] },
    required: ['email'],
    existing: {},
  })

  it('compte exactement ce qui passe et ce qui saute', () => {
    expect(report.rowsRead).toBe(1000)
    expect(report.creations).toBe(956)
    expect(report.skipped).toHaveLength(44)
  })

  it('ventile les rejets par RAISON — un total muet ne se corrige pas', () => {
    expect(report.skipped.every(row => row.reason === 'invalid_email')).toBe(true)
  })
})

describe('T2 — colonne obligatoire absente : blocage avec le NOM du champ', () => {
  const report = simulateImport({
    object: 'contact',
    headers: ['Nom'],
    rows: [{ Nom: 'Théo' }],
    mapping: { columns: { Nom: 'name' }, ignored: [], disabledRules: [] },
    required: ['email'],
    existing: {},
  })

  it('nomme le champ manquant et interdit l’import', () => {
    expect(report.missingRequiredColumns).toEqual(['email'])
    expect(blocksApply(report)).toBe(true)
  })
})

describe('T3 — des contacts sans comptes préalables : refus, pas exécution à moitié', () => {
  it('refuse et dit quel objet manque', () => {
    expect(orderViolations({ importing: ['contact'], available: [] })).toEqual(['contact'])
  })

  it('accepte quand le compte est déjà là', () => {
    expect(orderViolations({ importing: ['contact'], available: ['account'] })).toEqual([])
  })

  it('accepte quand le fichier apporte les DEUX', () => {
    // Les sociétés avant les contacts — mais dans le même import, c'est bon.
    expect(orderViolations({ importing: ['account', 'contact'], available: [] })).toEqual([])
  })
})

describe('T4 — annulation : ce qu’un humain a touché est LISTÉ, pas annulé', () => {
  const importedAt = new Date('2026-08-21T09:00:00Z')
  const now = new Date('2026-08-21T11:00:00Z')

  it('annule ce que personne n’a touché', () => {
    expect(rollbackDecision({ importedAt, now, updatedAt: null, lastWriteBy: null })).toBe('revert')
  })

  it('GARDE ce qu’un humain a corrigé après l’import', () => {
    // Annuler une correction faite à la main est la seule chose qu'un rollback
    // ne doit pas pouvoir faire : elle est invisible et irréversible.
    expect(
      rollbackDecision({
        importedAt,
        now,
        updatedAt: new Date('2026-08-21T10:00:00Z'),
        lastWriteBy: 'human',
      }),
    ).toBe('keep_touched')
  })

  it('annule ce qu’un CONNECTEUR a réécrit — ce n’est pas une décision humaine', () => {
    expect(
      rollbackDecision({
        importedAt,
        now,
        updatedAt: new Date('2026-08-21T10:00:00Z'),
        lastWriteBy: 'connector',
      }),
    ).toBe('revert')
  })

  it('ferme la fenêtre au-delà de 7 jours', () => {
    expect(
      rollbackDecision({
        importedAt,
        now: new Date('2026-09-01T09:00:00Z'),
        updatedAt: null,
        lastWriteBy: null,
      }),
    ).toBe('window_closed')
  })
})

describe('T5 — les doublons sont détectés AVANT écriture, aucune fusion sans clic', () => {
  const report = simulateImport({
    object: 'contact',
    headers: ['Email'],
    rows: [{ Email: 'connu@acme.fr' }, { Email: 'nouveau@acme.fr' }],
    mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
    required: ['email'],
    existing: { 'email:connu@acme.fr': 'contact-1' },
    filledFields: { 'email:connu@acme.fr': ['email'] },
  })

  it('sépare ce qui sera créé de ce qui sera mis à jour', () => {
    expect(report.creations).toBe(1)
    expect(report.updates).toBe(1)
  })

  it('annonce combien de valeurs seraient ÉCRASÉES — le seul chiffre qui dit une perte', () => {
    expect(report.overwrittenFields).toBe(1)
  })

  it('rend la paire avec sa RAISON, jamais un verdict', () => {
    const pair = report.duplicates.find(duplicate => duplicate.existingId === 'contact-1')
    expect(pair?.matchedOn).toEqual(['email'])
  })
})

describe('l’avertissement RGPD du §7.5', () => {
  it('compte les contacts qui arriveraient sans base légale', () => {
    // Un import RGPD-aveugle ne se rattrape pas après coup : les contacts sont
    // déjà là, et personne ne sait plus d'où ils viennent.
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'a@acme.fr' }, { Email: 'b@acme.fr' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.withoutLegalBasis).toBe(2)
  })
})

describe('#2079.7 — les données SENSIBLES du fichier sont SIGNALÉES', () => {
  // Une colonne « Date de naissance » ou « IBAN » n'a pas d'alias au catalogue :
  // elle finissait dans `ignoredColumns`, une liste que rien ne distingue d'une
  // colonne « Commentaire libre ». Signalement à part, pour un avertissement
  // dédié à l'écran — pas une nouvelle raison d'écarter la ligne.
  it('signale une colonne dont l’en-tête porte une catégorie de donnée sensible', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email', 'Date de naissance', 'IBAN'],
      rows: [{ Email: 'a@acme.fr', 'Date de naissance': '1990-01-01', IBAN: 'FR76XXXX' }],
      mapping: { columns: { Email: 'email' }, ignored: ['Date de naissance', 'IBAN'], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.sensitiveColumns).toEqual(['Date de naissance', 'IBAN'])
  })

  it('ne signale rien sur un fichier ordinaire', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email', 'Nom', 'Société'],
      rows: [{ Email: 'a@acme.fr', Nom: 'A', Société: 'Acme' }],
      mapping: { columns: { Email: 'email' }, ignored: ['Nom', 'Société'], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.sensitiveColumns).toEqual([])
  })

  it('signale même une colonne sensible que le mapping a RATTACHÉE — le signalement ne dépend pas du sort de la colonne', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email', 'Nationalité'],
      rows: [{ Email: 'a@acme.fr', Nationalité: 'française' }],
      // Un alias imaginaire, pour vérifier que le signalement lit l'EN-TÊTE, pas
      // le sort que le mapping lui a réservé.
      mapping: { columns: { Email: 'email', Nationalité: 'title' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.sensitiveColumns).toEqual(['Nationalité'])
  })
})

describe('la simulation rejoue EXACTEMENT ce que fera l’import', () => {
  const rows = [
    { Nom: 'Théo', Email: 'theo@acme.fr', Societe: 'ACME SAS' },
    { Nom: 'Léa', Email: 'lea@inconnue.fr', Societe: 'Société Inexistante' },
  ]
  const mapping = { columns: { Nom: 'name', Email: 'email', Societe: 'company' }, ignored: [], disabledRules: [] }

  it('écarte une ligne dont la société est INCONNUE, au lieu de promettre une création', () => {
    // Trouvé en recette live le 21/08 : le rapport annonçait « 2 créations » et
    // l'import en faisait « 0 » — les deux sociétés étant inconnues, l'écriture
    // écartait tout. Une simulation qui ne rejoue pas l'import ne prouve rien,
    // et c'est la propriété centrale du §7.
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'Email', 'Societe'],
      rows,
      mapping,
      required: ['email'],
      existing: {},
      knownParents: new Set(['acme']),
    })
    expect(report.creations).toBe(1)
    expect(report.skipped).toEqual([{ row: 2, reason: 'unknown_company', field: 'company' }])
  })

  it('ne prétend RIEN quand on ne lui dit pas quelles sociétés existent', () => {
    // `undefined` veut dire « je ne sais pas ». Écarter des lignes sur une
    // ignorance produirait un rapport plus faux que celui qu'on corrige.
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'Email', 'Societe'],
      rows,
      mapping,
      required: ['email'],
      existing: {},
    })
    expect(report.creations).toBe(2)
    expect(report.skipped).toEqual([])
  })

  it('n’exige pas de société pour un objet qui ne s’y rattache pas', () => {
    const report = simulateImport({
      object: 'account',
      headers: ['Societe'],
      rows: [{ Societe: 'Nouvelle Société' }],
      mapping: { columns: { Societe: 'company' }, ignored: [], disabledRules: [] },
      required: ['company'],
      existing: {},
      knownParents: new Set(),
    })
    expect(report.creations).toBe(1)
  })
})

describe('déduplication contre la base — le défaut trouvé en recette live', () => {
  it('reconnaît un compte déjà présent par son SIREN, alors qu’aucune colonne ne porte le nom normalisé', () => {
    // Ce que l'écran affichait en production : « 3 création(s), 0 mise(s) à
    // jour » sur un fichier de trois sociétés dont deux existaient déjà. La
    // clé `normalizedName` est DÉRIVÉE — aucun export n'a de colonne « nom
    // normalisé » — et personne ne la dérivait côté simulation.
    const report = simulateImport({
      object: 'account',
      headers: ['company', 'siren'],
      rows: [
        { company: 'AIRBUS', siren: '383474814' },
        { company: 'Société Fictive SAS', siren: '552100554' },
      ],
      mapping: { columns: { company: 'company', siren: 'siren' }, ignored: [], disabledRules: [] },
      required: ['company'],
      existing: { 'siren:383474814': 'acc-airbus' },
    })
    expect(report.updates).toBe(1)
    expect(report.creations).toBe(1)
  })

  // #4053.8 — un NOM seul ne rapproche jamais un compte déjà en base (#2079.13, l'écriture crée) : la
  // simulation dit « création » ET propose le doublon possible, au lieu de promettre une mise à jour
  // que l'import ne fera pas.
  it('un nom SEUL contre la base : une création, avec le doublon PROPOSÉ — comme l’écriture', () => {
    const report = simulateImport({
      object: 'account',
      headers: ['company'],
      rows: [{ company: 'ACME S.A.S.' }],
      mapping: { columns: { company: 'company' }, ignored: [], disabledRules: [] },
      required: ['company'],
      existing: { 'normalizedName:acme': 'acc-acme' },
    })
    expect(report.updates).toBe(0)
    expect(report.creations).toBe(1)
    expect(report.possibleDuplicates).toEqual([{ row: 1, matchedOn: ['normalizedName'], confidence: 0.6 }])
  })

  // #4053.8 — la ligne essaie TOUTES ses clés (SIREN → domaine → nom), comme l'écriture : un compte
  // retrouvé par son domaine alors que la ligne porte aussi un SIREN que la base n'a pas est reconnu.
  it('essaie toutes les clés de la ligne, pas seulement la plus forte', () => {
    const report = simulateImport({
      object: 'account',
      headers: ['company', 'siren', 'domain'],
      rows: [{ company: 'Nova', siren: '123456789', domain: 'nova.fr' }],
      mapping: { columns: { company: 'company', siren: 'siren', domain: 'domain' }, ignored: [], disabledRules: [] },
      required: ['company'],
      existing: { 'domain:nova.fr': 'acc-nova' },
    })
    expect(report.creations).toBe(0)
    expect(report.updates).toBe(1)
  })

  // #4053.7 — deux personnes distinctes sur le même domaine ne sont pas un doublon.
  it('deux contacts aux noms ET e-mails différents sur le même domaine : deux contacts, aucun doublon', () => {
    const rows = [
      { Nom: 'Alice Martin', Email: 'alice@nova.fr', Societe: 'Nova SA' },
      { Nom: 'Bruno Petit', Email: 'bruno@nova.fr', Societe: 'Nova SA' },
    ]
    const mapping = { columns: { Nom: 'name', Email: 'email', Societe: 'company' }, ignored: [], disabledRules: [] }
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'Email', 'Societe'],
      rows,
      mapping,
      required: ['email'],
      existing: {},
      knownParents: new Set([normaliseCompanyName('Nova SA')]),
    })
    expect(report.creations).toBe(2)
    expect(report.skipped).toEqual([])
  })

  it('le domaine d’une boîte personnelle n’est jamais l’identité d’une société (gmail.com)', () => {
    const row = withDedupInputs('account', { company: 'Alpha', email: 'alice@gmail.com' })
    expect(dedupKeysOf('account', row)).toEqual(['normalizedName:alpha'])
    const found = duplicatesInFile('account', [
      { company: 'Alpha', email: 'alice@gmail.com' },
      { company: 'Beta', email: 'bruno@gmail.com' },
    ])
    expect(found).toEqual([])
  })

  // #4053.1 — une ligne SANS société sort « à valider » : jamais un compte créé, et nommée au rapport.
  it('une ligne sans société sort « à valider », jamais comptée en création', () => {
    const report = simulateImport({
      object: 'account',
      headers: ['Nom', 'Email', 'Societe'],
      rows: [
        { Nom: 'Alice', Email: 'alice@nova.fr', Societe: 'Nova SA' },
        { Nom: 'Bruno', Email: 'bruno@x.fr', Societe: '' },
      ],
      mapping: { columns: { Nom: 'name', Email: 'email', Societe: 'company' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.creations).toBe(1)
    expect(report.skipped).toEqual([{ row: 2, reason: 'company_to_validate', field: 'company' }])
  })

  it('un contact sans société sort « à valider » (et non « société inconnue ») quand on sait quelles sociétés existent', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'Email'],
      rows: [{ Nom: 'Bruno', Email: 'bruno@x.fr' }],
      mapping: { columns: { Nom: 'name', Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
      knownParents: new Set(),
    })
    expect(report.skipped).toEqual([{ row: 1, reason: 'company_to_validate', field: 'company' }])
  })

  it('sans rien en base, tout reste une création', () => {
    const report = simulateImport({
      object: 'account',
      headers: ['company'],
      rows: [{ company: 'AIRBUS' }],
      mapping: { columns: { company: 'company' }, ignored: [], disabledRules: [] },
      required: ['company'],
      existing: {},
    })
    expect(report.creations).toBe(1)
    expect(report.updates).toBe(0)
  })
})

/**
 * Lot F du Recovery Pack — les deux motifs d'écart qui étaient déclarés,
 * traduits, et JAMAIS émis.
 *
 * Une liste fermée dont deux valeurs ne sortent d'aucun chemin n'est pas une
 * taxonomie, c'est une intention. Et ces deux-là appellent des gestes précis :
 * l'un dit « ta correspondance de colonnes est à revoir », l'autre « cette fiche
 * est attribuée à quelqu'un qui n'existe pas ».
 */
describe('out_of_scope_column — la ligne a du contenu, mais rien dans une colonne lue', () => {
  const base = {
    object: 'contact' as const,
    headers: ['Email', 'Commentaire interne'],
    required: ['email'],
    existing: {},
  }

  it('écarte une ligne dont TOUT le contenu est dans une colonne ignorée', () => {
    const report = simulateImport({
      ...base,
      rows: [{ Email: '', 'Commentaire interne': 'à rappeler en septembre' }],
      mapping: { columns: { Email: 'email' }, ignored: ['Commentaire interne'], disabledRules: [] },
    })
    expect(report.skipped).toEqual([{ row: 1, reason: 'out_of_scope_column', field: null }])
  })

  it('passe AVANT `missing_required_field` — les deux motifs appellent des gestes différents', () => {
    // Ce motif dit « revois ta correspondance de colonnes » ; l'autre dit
    // « ton fichier est incomplet ». Les confondre envoie corriger le mauvais bout.
    const report = simulateImport({
      ...base,
      rows: [{ Email: '', 'Commentaire interne': 'quelque chose' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
    })
    expect(report.skipped[0]?.reason).toBe('out_of_scope_column')
  })

  it('ne se déclenche PAS sur une ligne réellement vide — celle-là manque un champ', () => {
    const report = simulateImport({
      ...base,
      rows: [{ Email: '', 'Commentaire interne': '' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
    })
    expect(report.skipped[0]?.reason).toBe('missing_required_field')
  })
})

describe('unknown_owner — une fiche attribuée à quelqu’un qui n’existe pas', () => {
  const rows = [
    { Email: 'a@acme.fr', Responsable: 'Marie Dubois' },
    { Email: 'b@acme.fr', Responsable: 'Parti En 2019' },
  ]
  const mapping = { columns: { Email: 'email', Responsable: 'owner' }, ignored: [], disabledRules: [] }
  const base = {
    object: 'contact' as const,
    headers: ['Email', 'Responsable'],
    rows,
    mapping,
    required: ['email'],
    existing: {},
  }

  it('écarte la ligne dont le propriétaire n’est pas de l’espace', () => {
    const report = simulateImport({ ...base, knownOwners: new Set(['marie dubois']) })
    expect(report.skipped).toEqual([{ row: 2, reason: 'unknown_owner', field: 'owner' }])
    expect(report.creations).toBe(1)
  })

  it('ne prétend RIEN quand on ignore qui travaille ici', () => {
    // La garde qui rend le repli tenable : sans liste, refuser toutes les lignes
    // portant un propriétaire ferait échouer un import de 17 000 lignes parce
    // qu'une requête a raté.
    const report = simulateImport(base)
    expect(report.skipped).toHaveLength(0)
    expect(report.creations).toBe(2)
  })

  it('compare sans tenir compte de la casse', () => {
    const report = simulateImport({ ...base, knownOwners: new Set(['marie dubois', 'parti en 2019']) })
    expect(report.skipped).toHaveLength(0)
  })
})

describe('errors — une ligne en échec à l’écriture, additionnable, jamais perdue', () => {
  it('une simulation ne peut rien avoir en échec : rien n’a été écrit', () => {
    // C'est la garantie qui rend `errors` sûr par construction : le moteur pur
    // ne touche jamais la base, donc rien ne peut y échouer.
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'a@acme.fr' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.errors).toEqual([])
    expect(sumOfBuckets(report)).toBe(report.rowsRead)
  })

  it('l’invariant tient sur un rapport qui mélange créations, mises à jour ET lignes écartées', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'connu@acme.fr' }, { Email: 'nouveau@acme.fr' }, { Email: '' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: { 'email:connu@acme.fr': 'contact-1' },
    })
    expect(report.creations).toBe(1)
    expect(report.updates).toBe(1)
    expect(report.skipped).toHaveLength(1)
    expect(sumOfBuckets(report)).toBe(report.rowsRead)
  })

  it('`withRowError` retire une ligne de `creations` — jamais comptée deux fois', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'connu@acme.fr' }, { Email: 'nouveau@acme.fr' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: { 'email:connu@acme.fr': 'contact-1' },
    })
    expect(sumOfBuckets(report)).toBe(report.rowsRead)

    // La ligne 2 (« nouveau@acme.fr ») n'a AUCUNE entrée dans `duplicates` :
    // elle allait à la création.
    const failed = withRowError(report, { row: 2, message: 'connexion perdue' })
    expect(failed.creations).toBe(0)
    expect(failed.updates).toBe(1)
    expect(failed.errors).toEqual([{ row: 2, message: 'connexion perdue' }])
    // La preuve qui compte : la somme des seaux reste ÉGALE au nombre de
    // lignes lues — rien n'a été perdu, rien n'a été compté deux fois.
    expect(sumOfBuckets(failed)).toBe(report.rowsRead)
  })

  it('`withRowError` retire une ligne de `updates` quand c’en était une', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'connu@acme.fr' }, { Email: 'nouveau@acme.fr' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: { 'email:connu@acme.fr': 'contact-1' },
    })

    // La ligne 1 (« connu@acme.fr ») a une entrée dans `duplicates` avec un
    // `existingId` : elle allait à la mise à jour, pas à la création.
    const failed = withRowError(report, { row: 1, message: 'contrainte violée' })
    expect(failed.creations).toBe(1)
    expect(failed.updates).toBe(0)
    expect(failed.errors).toEqual([{ row: 1, message: 'contrainte violée' }])
    expect(sumOfBuckets(failed)).toBe(report.rowsRead)
  })

  it('ne descend jamais sous zéro — un appel en double sur la même ligne ne rend pas un compte négatif', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Email'],
      rows: [{ Email: 'nouveau@acme.fr' }],
      mapping: { columns: { Email: 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    const once = withRowError(report, { row: 1, message: 'un' })
    const twice = withRowError(once, { row: 1, message: 'deux' })
    expect(twice.creations).toBe(0)
    expect(twice.errors).toHaveLength(2)
  })
})

describe('#1889 — le PROJET se simule comme un compte, et sa clé n’est plus morte', () => {
  /**
   * ⚠️ LE DÉFAUT QUE CE BLOC GARDE, et il était silencieux.
   *
   * `DEDUP_KEYS.project` exigeait `account` et `period`. Aucun alias du
   * catalogue ne produit l'un ou l'autre : `dedupKeyOf('project', …)` rendait
   * TOUJOURS `null`. Conséquence mécanique — aucun doublon projet n'était jamais
   * vu, `updates` valait zéro par construction, et le rapport promettait « N
   * créations » sur des lignes déjà en base.
   *
   * Rien ne tombait : ce fichier ne contenait pas une seule occurrence du mot
   * `project`. Un moteur testé sur deux objets sur huit ne dit rien des six
   * autres.
   */
  const mapping = { columns: { Société: 'company', Libellé: 'label' }, ignored: [], disabledRules: [] }

  it('dérive une clé au lieu de rendre `null`', () => {
    const key = dedupKeyOf('project', withDedupInputs('project', { company: 'Société Générale', label: 'Socle data' }))
    expect(key).not.toBeNull()
  })

  it('la clé plie la casse, les accents et la forme juridique de la société', () => {
    const gauche = dedupKeyOf('project', withDedupInputs('project', { company: 'SG SA', label: 'Socle' }))
    const droite = dedupKeyOf('project', withDedupInputs('project', { company: 'sg', label: 'socle' }))
    expect(gauche).toBe(droite)
  })

  it('deux lignes identiques du MÊME fichier sont vues comme un doublon', () => {
    const report = simulateImport({
      object: 'project',
      headers: ['Société', 'Libellé'],
      rows: [
        { Société: 'Société Générale', Libellé: 'Socle data' },
        { Société: 'SOCIETE GENERALE', Libellé: 'Socle data' },
      ],
      mapping,
      required: ['company', 'label'],
      existing: {},
      knownParents: new Set([normaliseCompanyName('Société Générale')]),
    })
    expect(report.duplicates).toHaveLength(1)
    expect(report.duplicates[0]).toMatchObject({ row: 2, matchedOn: ['normalizedName+label'] })
    expect(report.creations).toBe(1)
  })

  it('une ligne DÉJÀ en base est annoncée comme mise à jour, pas comme création', () => {
    const key = dedupKeyOf('project', withDedupInputs('project', { company: 'Société Générale', label: 'Socle data' }))
    const report = simulateImport({
      object: 'project',
      headers: ['Société', 'Libellé'],
      rows: [{ Société: 'Société Générale', Libellé: 'Socle data' }],
      mapping,
      required: ['company', 'label'],
      existing: { [key as string]: 'proj-1' },
      knownParents: new Set([normaliseCompanyName('Société Générale')]),
    })
    expect(report).toMatchObject({ creations: 0, updates: 1 })
  })

  it('une ligne dont la société est inconnue est ÉCARTÉE, avec sa raison', () => {
    // Le §7.3 : les sociétés avant les projets. La simulation le DIT avant
    // l'écriture, sinon la ligne disparaît sans un mot.
    const report = simulateImport({
      object: 'project',
      headers: ['Société', 'Libellé'],
      rows: [{ Société: 'Entreprise Absente', Libellé: 'Un projet' }],
      mapping,
      required: ['company', 'label'],
      existing: {},
      knownParents: new Set([normaliseCompanyName('Société Générale')]),
    })
    expect(report.skipped.map(row => row.reason)).toEqual(['unknown_company'])
  })

  it('les seaux s’additionnent jusqu’au nombre de lignes lues', () => {
    const report = simulateImport({
      object: 'project',
      headers: ['Société', 'Libellé'],
      rows: [
        { Société: 'Société Générale', Libellé: 'A' },
        { Société: 'Société Générale', Libellé: 'A' },
        { Société: 'Inconnue', Libellé: 'B' },
        { Société: 'Société Générale', Libellé: '' },
      ],
      mapping,
      required: ['company', 'label'],
      existing: {},
      knownParents: new Set([normaliseCompanyName('Société Générale')]),
    })
    expect(sumOfBuckets(report)).toBe(report.rowsRead)
  })
})

describe('#2079.10 — TOUTES les clés qu’une entreprise satisfait, en une dérivation', () => {
  it('rend les clés dans l’ordre de `DEDUP_KEYS`, et `dedupKeyOf` en est la PREMIÈRE', () => {
    const row = withDedupInputs('account', { company: 'Acme Corp', siren: '552100554', domain: 'acme.fr' })
    expect(dedupKeysOf('account', row)).toEqual(['siren:552100554', 'domain:acme.fr', 'normalizedName:acme corp'])
    // La relation qui compte : un côté de l'import cherche UNE clé, l'autre les
    // indexe TOUTES. Si les deux ne venaient pas de la même liste, un compte
    // indexé sur une clé que la ligne ne produit pas serait introuvable.
    expect(dedupKeysOf('account', row)[0]).toBe(dedupKeyOf('account', row))
  })

  it('n’en rend que ce que la ligne porte vraiment — jamais une clé à trou', () => {
    expect(dedupKeysOf('account', withDedupInputs('account', { company: 'Acme Corp' }))).toEqual([
      'normalizedName:acme corp',
    ])
    expect(dedupKeysOf('account', {})).toEqual([])
  })

  it('rend la MÊME clé de domaine pour une URL complète et pour un domaine nu', () => {
    // Le défaut mesuré de #2079.10 : le compte en base portait
    // `https://www.acme.fr/`, la ligne portait `acme.fr`, et les deux clés ne
    // se rencontraient jamais.
    const brut = withDedupInputs('account', { company: 'Acme Corp', website: 'https://www.acme.fr/' })
    const nu = withDedupInputs('account', { company: 'Acme Corp', domain: 'acme.fr' })
    expect(dedupKeysOf('account', brut)).toContain('domain:acme.fr')
    expect(dedupKeysOf('account', nu)).toContain('domain:acme.fr')
  })

  it('n’attrape pas ce qu’elle ne vise pas : deux domaines différents restent deux clés', () => {
    const fr = withDedupInputs('account', { company: 'Acme', domain: 'acme.fr' })
    const be = withDedupInputs('account', { company: 'Acme', domain: 'acme.be' })
    expect(dedupKeysOf('account', fr)).not.toEqual(dedupKeysOf('account', be))
  })

  it('marche pour les autres objets : un contact sans e-mail retombe sur nom+société', () => {
    const contact = withDedupInputs('contact', { fullName: 'Marie Dupont', company: 'Acme' })
    expect(dedupKeysOf('contact', contact)).toEqual(['name+company:marie dupont|acme'])
  })
})

describe('#2159.11/.13 — la détection NOMMÉE d’un export BoondManager, et son repli honnête', () => {
  it('nomme BoondManager dès que DEUX colonnes de sa signature publique sont présentes', () => {
    const headers = ['Nom', 'Société - Nom', 'Pôle', 'Référence interne', 'Date de démarrage']
    expect(detectImportSource(headers)).toEqual({ certainty: 'named', key: 'boondmanager_export' })
  })

  it('ne nomme PAS l’outil sur une seule colonne de la signature — juste « ressemble à un ATS »', () => {
    const headers = ['Nom', 'Prénom', 'Pôle', 'Date']
    expect(detectImportSource(headers)).toEqual({ certainty: 'family', family: 'ats' })
  })

  it('ne devine rien sur un export générique sans aucune colonne de la signature', () => {
    const headers = ['Nom', 'Prénom', 'E-mail', 'Téléphone']
    expect(detectImportSource(headers)).toEqual({ certainty: 'none' })
  })

  it('lit la signature sans accent, sans casse et avec la ponctuation de l’export réel', () => {
    // Les mêmes cinq colonnes que documentées par l’éditeur, telles qu’un
    // export les écrit réellement (accents, tirets, casse mixte).
    const headers = ['POLE', 'Référence Interne', 'CA envisagé HT', 'Pondération', 'Domaine d’intervention']
    expect(detectImportSource(headers)).toEqual({ certainty: 'named', key: 'boondmanager_export' })
  })
})

describe('#2159.17 et suivants — la confiance de mapping, jamais un pourcentage', () => {
  // ⚠️ Volontairement SANS alias court (« tel ») : un alias court serait
  // CONTENU dans « telphone » et masquerait le cas visé par le test « basse »
  // (une distance de Levenshtein, pas une inclusion).
  const aliases = { email: 'email', e_mail: 'email', telephone: 'phone', nom: 'name' }

  it('est « haute » quand l’en-tête normalisé EST un alias déclaré du champ', () => {
    expect(mappingConfidence('E-mail', 'email', aliases)).toBe('high')
    expect(mappingConfidence('Téléphone', 'phone', aliases)).toBe('high')
  })

  it('est « moyenne » quand l’en-tête CONTIENT un alias du champ, sans le matcher exactement', () => {
    expect(mappingConfidence('Adresse e-mail pro', 'email', aliases)).toBe('medium')
  })

  it('est « basse » quand l’en-tête est à une ou deux lettres d’un alias — une faute de frappe d’export', () => {
    expect(mappingConfidence('telphone', 'phone', aliases)).toBe('low')
  })

  it('rend `null` sans aucune parenté textuelle — une correction humaine n’a besoin d’aucun badge', () => {
    expect(mappingConfidence('Adresse postale', 'phone', aliases)).toBeNull()
  })

  it('ne propose jamais une colonne qu’aucun alias ne reconnaît (repli positionnel refusé)', () => {
    expect(suggestMapping('Commentaire libre', aliases)).toBeNull()
  })

  it('suggère le champ le plus proche pour une colonne non reconnue par alias exact', () => {
    expect(suggestMapping('Adresse e-mail pro', aliases)).toEqual({ field: 'email', confidence: 'medium' })
    expect(suggestMapping('telphone', aliases)).toEqual({ field: 'phone', confidence: 'low' })
  })
})

describe('#2159.39 — le CONFLIT d’un doublon rapproché, distinct d’une simple mise à jour', () => {
  it('marque `overwrites` quand la ligne remplacerait une valeur DÉJÀ renseignée en base', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['E-mail', 'Téléphone'],
      rows: [{ 'E-mail': 'marie@acme.fr', Téléphone: '0612345678' }],
      mapping: { columns: { 'E-mail': 'email', Téléphone: 'phone' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: { 'email:marie@acme.fr': 'contact-1' },
      filledFields: { 'email:marie@acme.fr': ['phone'] },
    })
    expect(report.duplicates).toEqual([
      { row: 1, existingId: 'contact-1', matchedOn: ['email'], confidence: 0.95, overwrites: true },
    ])
  })

  it('ne marque PAS `overwrites` quand aucun champ déjà rempli ne serait remplacé', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['E-mail'],
      rows: [{ 'E-mail': 'marie@acme.fr' }],
      mapping: { columns: { 'E-mail': 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: { 'email:marie@acme.fr': 'contact-1' },
      filledFields: {},
    })
    expect(report.duplicates).toEqual([
      { row: 1, existingId: 'contact-1', matchedOn: ['email'], confidence: 0.95, overwrites: false },
    ])
  })

  it('un doublon INTRA-fichier n’écrase jamais rien en base — `overwrites` toujours faux', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['E-mail'],
      rows: [{ 'E-mail': 'marie@acme.fr' }, { 'E-mail': 'marie@acme.fr' }],
      mapping: { columns: { 'E-mail': 'email' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.duplicates).toEqual([
      { row: 2, existingId: null, matchedOn: ['email'], confidence: 1, overwrites: false },
    ])
  })
})

describe('#2159.32/#2159.33 — téléphone et profil LinkedIn partagés : signalés, jamais SKIPPÉS', () => {
  /**
   * Investigué et écarté le 26/09 (`DEDUP_KEYS.contact` + `phone`) : un skip
   * automatique sur un match par téléphone perdrait en silence la seconde
   * personne derrière le standard d'une même société. Ce que ce lot ajoute
   * n'est PAS une clé de dédup forte — les deux lignes sont TOUJOURS écrites
   * — seul le rapport gagne un signalement à vérifier humainement (doctrine
   * « on propose, on ne fusionne jamais »).
   */
  it('deux contacts, deux e-mails différents, même téléphone : les DEUX sont créés', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'E-mail', 'Téléphone'],
      rows: [
        { Nom: 'Standard Acme', 'E-mail': 'accueil@acme.fr', Téléphone: '01 23 45 67 89' },
        { Nom: 'Autre Contact', 'E-mail': 'autre@acme.fr', Téléphone: '+33123456789' },
      ],
      mapping: { columns: { Nom: 'full_name', 'E-mail': 'email', Téléphone: 'phone' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.creations).toBe(2)
    expect(report.skipped).toEqual([])
  })

  it('signale le même téléphone (normalisé) dans `possibleDuplicates`, avec sa raison', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'E-mail', 'Téléphone'],
      rows: [
        { Nom: 'Standard Acme', 'E-mail': 'accueil@acme.fr', Téléphone: '01 23 45 67 89' },
        { Nom: 'Autre Contact', 'E-mail': 'autre@acme.fr', Téléphone: '+33123456789' },
      ],
      mapping: { columns: { Nom: 'full_name', 'E-mail': 'email', Téléphone: 'phone' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.possibleDuplicates).toEqual([{ row: 2, matchedOn: ['phone'], confidence: 0.4 }])
  })

  it('signale un profil LinkedIn partagé de la même façon', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'E-mail', 'LinkedIn'],
      rows: [
        { Nom: 'Camille', 'E-mail': 'camille@acme.fr', LinkedIn: 'linkedin.com/in/camille-x' },
        { Nom: 'Homonyme', 'E-mail': 'homonyme@acme.fr', LinkedIn: 'linkedin.com/in/camille-x' },
      ],
      mapping: {
        columns: { Nom: 'full_name', 'E-mail': 'email', LinkedIn: 'linkedin_url' },
        ignored: [],
        disabledRules: [],
      },
      required: ['email'],
      existing: {},
    })
    expect(report.possibleDuplicates).toEqual([{ row: 2, matchedOn: ['linkedin_url'], confidence: 0.4 }])
  })

  it('ne signale rien pour deux téléphones différents', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['Nom', 'E-mail', 'Téléphone'],
      rows: [
        { Nom: 'A', 'E-mail': 'a@acme.fr', Téléphone: '01 23 45 67 89' },
        { Nom: 'B', 'E-mail': 'b@acme.fr', Téléphone: '01 98 76 54 32' },
      ],
      mapping: { columns: { Nom: 'full_name', 'E-mail': 'email', Téléphone: 'phone' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.possibleDuplicates).toEqual([])
  })

  it('une ligne déjà écartée comme doublon FORT (même e-mail) n’est pas comptée deux fois', () => {
    const report = simulateImport({
      object: 'contact',
      headers: ['E-mail', 'Téléphone'],
      rows: [
        { 'E-mail': 'marie@acme.fr', Téléphone: '01 23 45 67 89' },
        { 'E-mail': 'marie@acme.fr', Téléphone: '01 23 45 67 89' },
      ],
      mapping: { columns: { 'E-mail': 'email', Téléphone: 'phone' }, ignored: [], disabledRules: [] },
      required: ['email'],
      existing: {},
    })
    expect(report.possibleDuplicates).toEqual([])
  })
})

/**
 * #4051 — le bilan PAR FAMILLE de l'assistant de reprise est dérivé du MÊME rapport que celui qu'il
 * affiche : jamais un second calcul, jamais un « 0 » pour ce qui n'existe pas.
 */
describe('#4051 — wizardImportBreakdown : le bilan par famille de l’assistant de reprise', () => {
  const report = (skipped: DryRunReport['skipped'], possibleDuplicates: DryRunReport['possibleDuplicates'] = []) =>
    ({
      rowsRead: 6,
      creations: 2,
      updates: 1,
      duplicates: [],
      skipped,
      overwrittenFields: 0,
      withoutLegalBasis: 0,
      missingRequiredColumns: [],
      mappedColumns: [],
      ignoredColumns: [],
      truncated: false,
      errors: [],
      sensitiveColumns: [],
      possibleDuplicates,
    }) as DryRunReport

  it('range les lignes par famille : créés, reconnus, doublons, écartés, à rapprocher (société à valider)', () => {
    const breakdown = wizardImportBreakdown(
      'account',
      { created: 2, updated: 1 },
      report(
        [
          { row: 3, reason: 'company_to_validate', field: 'company' },
          { row: 4, reason: 'duplicate_in_file', field: null },
          { row: 5, reason: 'invalid_email', field: 'email' },
        ],
        [{ row: 6, matchedOn: ['normalizedName'], confidence: 0.6 }],
      ),
    )
    expect(breakdown).toEqual({
      account: { created: 2, matched: 1, duplicates: 2, rejected: 1, toReconcile: 1 },
    })
  })

  it('un objet que l’import universel ne connaît pas (projet) n’a pas de bilan par famille', () => {
    expect(wizardImportBreakdown('project', { created: 1, updated: 0 }, report([]))).toBeNull()
  })
})

describe('M2.2 (Meyer 20/10) — un export de contacts d’un outil de gestion est reconnu à sa signature', () => {
  it('« Société - Nom » + « Email 1 » + « Référence interne » ⇒ famille management_contacts, pas « suivi de candidats »', () => {
    const headers = ['Référence interne', 'Nom', 'Prénom', 'Société - Nom', 'Email 1', 'Téléphone 1']
    expect(detectImportSource(headers)).toEqual({ certainty: 'family', family: 'management_contacts' })
  })

  it('il manque un des trois ⇒ pas de reconnaissance de cette famille', () => {
    expect(detectImportSource(['Nom', 'Société - Nom', 'Email 1'])).toEqual({ certainty: 'none' })
  })
})
