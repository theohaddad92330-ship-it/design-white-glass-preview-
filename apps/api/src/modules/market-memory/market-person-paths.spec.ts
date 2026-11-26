import { readCsvRecords } from './market-memory-import'
import { parsePersonPath, personPathRowKey, type PersonPathContext } from './market-person-paths'

const CSV = [
  'id;nom;prenom;genre;email;telephone;linkedin;photo;adresse;date_naissance;cle_entreprise;entreprise;poste;competences;date_debut;date_fin;statut;esn;tjm;ville_mission;colonne_inconnue',
  '42;Dupont;Jean;M;jean.dupont@example.org;0102030405;https://linkedin.com/in/jd;https://x/p.jpg;1 rue de la Paix;1980-02-03;acme;ACME SA;Data Engineer;Java, Kafka;2023-01;2024-06;freelance;Alten;650;Lyon;zzz',
  '43;Martin;Eva;F;e@x.fr;0600000000;;;;;acme;ACME SA;Architecte;;2022;;salarié;;;;',
].join('\n')

const context: PersonPathContext = {
  hashKey: 'cle-de-test',
  corpusLabel: 'bellum_market_memory_v1@t',
  datasetVersion: 't',
  sourceChecksum: 'abc',
  resolveCompanyKey: ({ companyKey, matchKey }) => companyKey ?? (matchKey === 'acme' ? 'acme' : null),
}

async function drafts() {
  const out: NonNullable<ReturnType<typeof parsePersonPath>>[] = []
  await readCsvRecords(
    (async function* () {
      yield CSV
    })(),
    record => {
      const draft = parsePersonPath(record, context)
      if (draft) out.push(draft)
      return draft !== null
    },
  )
  return out
}

describe('parsePersonPath — un parcours sans identité', () => {
  it('garde poste, dates, statut, ESN, compétences, TJM, lieu de mission', async () => {
    const [first] = await drafts()
    expect(first).toMatchObject({
      companyKey: 'acme',
      jobTitle: 'Data Engineer',
      skills: ['Java', 'Kafka'],
      startDate: '2023-01-01',
      endDate: '2024-06-01',
      datePrecision: 'month',
      workStatus: 'freelance',
      esnName: 'Alten',
      dailyRateEur: 650,
      missionCity: 'Lyon',
    })
  })

  it('RIEN d’un identifiant direct n’arrive dans le brouillon (ni clé, ni valeur)', async () => {
    const serialised = JSON.stringify(await drafts())
    for (const leaked of [
      'Dupont',
      'Jean',
      'Martin',
      'Eva',
      'example.org',
      '0102030405',
      '0600000000',
      'linkedin',
      'jpg',
      'rue de la Paix',
      '1980',
      'e@x.fr',
    ]) {
      expect(serialised).not.toContain(leaked)
    }
  })

  it('person_key est un HMAC stable, et change avec la clé', async () => {
    const [a] = await drafts()
    const [b] = await drafts()
    expect(a!.personKey).toBe(b!.personKey)
    expect(a!.personKey).toMatch(/^[0-9a-f]{64}$/)
    const other = parsePersonPath(
      { id: '42', cle_entreprise: 'acme', poste: 'Data Engineer' },
      { ...context, hashKey: 'autre' },
    )
    expect(other!.personKey).not.toBe(a!.personKey)
  })

  it('valeur absente = null, jamais 0 ; statut absent = inconnu ; année seule = précision year', async () => {
    const all = await drafts()
    expect(all[1]).toMatchObject({
      dailyRateEur: null,
      esnName: null,
      workStatus: 'salarie',
      datePrecision: 'year',
      startDate: '2022-01-01',
      endDate: null,
    })
  })

  it('empreinte de ligne idempotente', async () => {
    const [a] = await drafts()
    expect(personPathRowKey(a!)).toBe(personPathRowKey({ ...a! }))
  })

  it('entreprise non résolue ⇒ ligne écartée (jamais devinée)', () => {
    expect(parsePersonPath({ id: '1', entreprise: 'Inconnue SARL', poste: 'Dev' }, context)).toBeNull()
  })

  it('sans clé de hash ⇒ refuse (no-op strict)', () => {
    expect(() => parsePersonPath({ id: '1', cle_entreprise: 'acme' }, { ...context, hashKey: '' })).toThrow(
      /MARKET_MEMORY_PERSON_HASH_KEY/,
    )
  })
})
