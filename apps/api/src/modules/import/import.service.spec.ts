import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { ImportSessionEntity } from '../../database/entities/import-session.entity'
import { ImportService } from './import.service'
import { detectDelimiter, parseDelimited } from './delimited-parser'

/**
 * BEL-INT-602 PR1 — « `apply` REFUSE si aucun dry-run n'est enregistré. Écris ce
 * test EN PREMIER. »
 *
 * Le ticket a raison de le poser d'abord : c'est la seule garde qui protège une
 * base héritée, et les trois autres (champ obligatoire, ordre imposé,
 * déduplication) ne servent à rien si l'on peut écrire sans être passé par là.
 */

const WS = 'ws-1'

function makeService(session: Partial<ImportSessionEntity> | null) {
  const saved: Partial<ImportSessionEntity>[] = []
  const sessions = {
    findOne: jest.fn(async () => (session ? { id: 's-1', workspace_id: WS, ...session } : null)),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Partial<ImportSessionEntity>) => {
      saved.push(value)
      return { id: 's-1', ...value }
    }),
    update: jest.fn(async () => undefined),
    find: jest.fn(async () => []),
  } as unknown as Repository<ImportSessionEntity>
  // L'espace est PASSÉ par le contrôleur : le service ne le résout plus, ce qui
  // garde GA-07 à son plafond (le cliquet compte les imports service → service).
  return { service: new ImportService(sessions), sessions, saved }
}

const REPORT = {
  rowsRead: 10,
  creations: 10,
  updates: 0,
  overwrittenFields: 0,
  duplicates: [],
  skipped: [],
  mappedColumns: ['Email'],
  ignoredColumns: [],
  missingRequiredColumns: [],
  withoutLegalBasis: 0,
  truncated: false,
  errors: [],
  sensitiveColumns: [],
  possibleDuplicates: [],
}

describe('apply — les trois refus qui précèdent toute écriture', () => {
  it('REFUSE sans simulation enregistrée', async () => {
    const { service } = makeService({ state: 'draft', report: null, report_at: null, object_type: 'account' })
    await expect(service.apply(WS, 's-1', [])).rejects.toBeInstanceOf(ConflictException)
  })

  it('REFUSE une simulation trop vieille — l’existence du rapport ne suffit pas', async () => {
    // Le docblock du service promettait depuis le premier jour qu'« approuver un
    // import à partir d'un rapport de la semaine dernière écrirait un état que
    // plus personne n'a en tête ». Seule l'EXISTENCE du rapport était vérifiée.
    const { service } = makeService({
      state: 'simulated',
      report: REPORT,
      report_at: new Date(Date.now() - 3 * 60 * 60 * 1000),
      object_type: 'account',
    })
    await expect(service.apply(WS, 's-1', ['account'])).rejects.toThrow(/plus d’une heure/)
  })

  it('accepte une simulation récente', async () => {
    const { service } = makeService({
      state: 'simulated',
      report: REPORT,
      report_at: new Date(Date.now() - 5 * 60 * 1000),
      object_type: 'account',
    })
    // La garde d'âge est la SEULE chose que ce lot ajoute au chemin : une
    // simulation récente traverse `apply` exactement comme avant.
    await expect(service.apply(WS, 's-1', ['account'])).resolves.toBeDefined()
  })

  it('REFUSE quand une colonne obligatoire manque, en la NOMMANT', async () => {
    // Un champ obligatoire absent fait échouer des lignes entières EN SILENCE —
    // c'est le mode d'échec que le §7.1 nomme explicitement.
    const { service } = makeService({
      state: 'simulated',
      report: { ...REPORT, missingRequiredColumns: ['email'] },
      report_at: new Date(),
      object_type: 'contact',
    })
    await expect(service.apply(WS, 's-1', ['account'])).rejects.toThrow(/email/)
  })

  it('REFUSE des contacts quand aucun compte n’existe — pas d’exécution à moitié', async () => {
    const { service } = makeService({
      state: 'simulated',
      report: REPORT,
      report_at: new Date(),
      object_type: 'contact',
    })
    await expect(service.apply(WS, 's-1', [])).rejects.toBeInstanceOf(BadRequestException)
  })

  it('accepte quand les comptes sont déjà là', async () => {
    const { service } = makeService({
      state: 'simulated',
      report: REPORT,
      report_at: new Date(),
      object_type: 'contact',
    })
    await expect(service.apply(WS, 's-1', ['account'])).resolves.toMatchObject({ report: REPORT })
  })

  it('REFUSE de rejouer un import déjà exécuté', async () => {
    const { service } = makeService({
      state: 'applied',
      report: REPORT,
      report_at: new Date(),
      object_type: 'account',
    })
    await expect(service.apply(WS, 's-1', [])).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuse un identifiant vide AVANT de lire — TypeORM ignore une condition `undefined`', async () => {
    // `findOne({ where: { id: undefined } })` rend la PREMIÈRE ligne venue : ici,
    // la session d'import de quelqu'un d'autre.
    const { service, sessions } = makeService({ state: 'draft', object_type: 'account' })
    await expect(service.apply(WS, '', [])).rejects.toBeInstanceOf(NotFoundException)
    expect(sessions.findOne).not.toHaveBeenCalled()
  })
})

describe('la simulation FIGE ce qui autorisera l’écriture', () => {
  it('enregistre le rapport ET sa date', async () => {
    // Approuver un import à partir d'un rapport de la semaine dernière écrirait
    // un état que plus personne n'a en tête.
    const { service, saved } = makeService({
      state: 'draft',
      source: 'contacts_only',
      object_type: 'contact',
      report: null,
      report_at: null,
    })
    await service.simulate(WS, 's-1', { content: 'Email;Nom\ntheo@acme.fr;Théo' })
    expect(saved[0]?.state).toBe('simulated')
    expect(saved[0]?.report_at).toBeInstanceOf(Date)
    expect(saved[0]?.report?.rowsRead).toBe(1)
  })

  it('propose un mapping et LISTE ce qu’il n’a pas reconnu', async () => {
    const { service } = makeService({
      state: 'draft',
      source: 'contacts_only',
      object_type: 'contact',
      report: null,
      report_at: null,
    })
    const { proposedMapping } = await service.simulate(WS, 's-1', {
      content: 'Email;Code interne\ntheo@acme.fr;X-42',
    })
    expect(proposedMapping.columns).toMatchObject({ Email: 'email' })
    expect(proposedMapping.ignored).toEqual(['Code interne'])
  })

  it('#2159.11/.13 — nomme BoondManager quand deux colonnes de sa signature publique sont dans le fichier', async () => {
    const { service } = makeService({
      state: 'draft',
      source: 'boondmanager_export',
      object_type: 'talent',
      report: null,
      report_at: null,
    })
    const { detectedSource } = await service.simulate(WS, 's-1', {
      content: 'Nom;Pôle;Référence interne\nDupont;Data;REF-42',
    })
    expect(detectedSource).toEqual({ certainty: 'named', key: 'boondmanager_export' })
  })

  it('#2159.11/.13 — ne devine rien sur un export générique sans signature connue', async () => {
    const { service } = makeService({
      state: 'draft',
      source: 'contacts_only',
      object_type: 'contact',
      report: null,
      report_at: null,
    })
    const { detectedSource } = await service.simulate(WS, 's-1', { content: 'Email\ntheo@acme.fr' })
    expect(detectedSource).toEqual({ certainty: 'none' })
  })

  it('#2159.17 et suivants — la colonne EXACTEMENT reconnue est de confiance HAUTE, une colonne proche est SUGGÉRÉE sans être rattachée', async () => {
    const { service } = makeService({
      state: 'draft',
      source: 'contacts_only',
      object_type: 'contact',
      report: null,
      report_at: null,
    })
    const { columnConfidence, mappingSuggestions, proposedMapping } = await service.simulate(WS, 's-1', {
      content: 'Email;Adresse e-mail pro\ntheo@acme.fr;marie@acme.fr',
    })
    expect(columnConfidence['Email']).toBe('high')
    // La colonne proche n'est jamais rattachée d'office — elle reste dans `ignored`.
    expect(proposedMapping.ignored).toContain('Adresse e-mail pro')
    expect(mappingSuggestions['Adresse e-mail pro']).toEqual({ field: 'email', confidence: 'medium' })
  })
})

describe('le lecteur de fichier — ce qu’un export français produit vraiment', () => {
  it('détecte le point-virgule d’Excel FR', () => {
    // Un fichier lu avec le mauvais séparateur rend UNE colonne, et l'écran
    // annonce alors « aucune colonne reconnue » sur un fichier valide.
    expect(detectDelimiter('Nom;Prénom;Adresse e-mail')).toBe(';')
    expect(detectDelimiter('name,email')).toBe(',')
  })

  it('décide sur l’EN-TÊTE et non sur le fichier entier', () => {
    // Un corps de fichier contient des virgules dans les adresses ; compter sur
    // tout le fichier ferait gagner le caractère le plus fréquent DANS les
    // valeurs.
    const file = parseDelimited('Nom;Adresse\nACME;12, rue des Lilas, Paris', 100)
    expect(file.headers).toEqual(['Nom', 'Adresse'])
    expect(file.rows[0]?.['Adresse']).toBe('12, rue des Lilas, Paris')
  })

  it('retire le BOM UTF-8, invisible et collé au premier en-tête', () => {
    const file = parseDelimited('\uFEFFEmail;Nom\na@b.fr;A', 100)
    expect(file.headers[0]).toBe('Email')
  })

  it('garde une valeur multi-lignes entre guillemets sur UNE ligne logique', () => {
    // Toutes les notes exportées d'un CRM en contiennent. Découper naïvement sur
    // `\n` annonce « 400 lignes ignorées » sur un fichier de 40 notes.
    const file = parseDelimited('Note;Auteur\n"Premier appel.\nRappeler lundi.";Théo', 100)
    expect(file.rows).toHaveLength(1)
    expect(file.rows[0]?.['Note']).toContain('Rappeler lundi')
  })

  it('annonce la troncature au lieu de couper en silence', () => {
    const many = ['Email', ...Array.from({ length: 12 }, (_, i) => `p${i}@acme.fr`)].join('\n')
    const file = parseDelimited(many, 5)
    expect(file.rows).toHaveLength(5)
    expect(file.truncated).toBe(true)
  })
})
