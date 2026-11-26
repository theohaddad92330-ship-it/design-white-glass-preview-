import {
  DossierContext,
  convertDossierPeople,
  listSection,
  parseSemicolonCsv,
  sourcesSection,
  type PeopleSpec,
} from './account-dossier'

/**
 * Cœur PARTAGÉ des convertisseurs de dossiers de compte (15/10/2026) — Orange (12/10) puis Crédit Agricole, VINCI,
 * Enedis et Safran. Ce que ce cœur garantit pour TOUS les dossiers : une clé source est mappée OU écartée avec sa raison
 * (jamais ignorée en silence), l'ESN prospect n'est jamais nommée, aucune source interne ni fournisseur ne se lit, seules
 * les adresses du groupe sont semées.
 */

const ctx = (): DossierContext => new DossierContext({ prospect: /soluxan|\balan\b|dervoet/i })

describe('DossierContext — clés source', () => {
  it('une clé de premier niveau non mappée et non écartée fait ÉCHOUER la conversion', () => {
    const context = ctx()
    const account = { meta: {}, kpis: {}, inconnue: [] }
    context.take(account, 'meta')
    context.drop(account, 'kpis', 'indicateurs internes')
    expect(() => context.assertAllConsumed(account)).toThrow(/inconnue/)
    context.drop(account, 'inconnue', 'raison écrite')
    expect(() => context.assertAllConsumed(account)).not.toThrow()
    expect(context.skipped['clé « kpis » : indicateurs internes']).toBe(1)
  })

  it('une clé absente du dossier n’est jamais devinée : take() lève', () => {
    expect(() => ctx().take({ a: 1 }, 'b')).toThrow(/« b » absent/)
  })
})

describe('DossierContext.text — ce qui se lit à l’écran', () => {
  it('retire la PHRASE qui nomme l’ESN prospect ou son interlocuteur, garde les autres', () => {
    const context = ctx()
    const out = context.text('Le compte est ouvert. Alan lit-il PACA seul ? Le budget IT est de 5,8 Md€.')
    expect(out).toBe('Le compte est ouvert. Le budget IT est de 5,8 Md€.')
    expect(Object.values(context.skipped).reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('nomme la base interne sans son nom de code, retire les identifiants internes et les fournisseurs', () => {
    const context = ctx()
    expect(context.text('Verrouillé - panel CA (ORION 27/08/2026)')).toBe(
      'Verrouillé - panel CA (relevé du 27/08/2026)',
    )
    expect(context.text('En base : racine BM-A-000183, sans rattachement.')).toBe(
      'En base : racine, sans rattachement.',
    )
    expect(context.text('Capital 1 470 € (Pappers, BODACC du 08/10/2026).')).toBe(
      'Capital 1 470 € (registre des entreprises, BODACC du 08/10/2026).',
    )
    expect(context.text('Trois besoins du CRM Belloum portent un numéro.')).toBe(
      'Trois besoins du CRM interne portent un numéro.',
    )
    expect(context.text('Issu de BELLUM MARKET MEMORY v2.1b.')).toBe('Issu de base interne de l’espace.')
  })

  it('la phrase qui POURSUIT une phrase retirée part avec elle (« Il … », « Sinon, … »)', () => {
    expect(
      ctx().text('Le panel existe. Point important pour Alan : Sopra est en place. Il occupe le build. Fin.'),
    ).toBe('Le panel existe. Fin.')
  })

  it('les balises HTML de la page du pack ne s’affichent pas', () => {
    expect(ctx().text('Pilotage <b>de SLA</b> opérés.')).toBe('Pilotage de SLA opérés.')
  })

  it('un texte entièrement fait de phrases écartées rend une chaîne vide', () => {
    expect(ctx().text('Question à poser à Alan Dervoet.')).toBe('')
  })
})

describe('listSection — une colonne par clé, sinon une raison', () => {
  it('rend les colonnes déclarées et compte les clés écartées', () => {
    const context = ctx()
    const section = listSection(context, {
      key: 'projets-2026-2027',
      title: 'PROJETS',
      sheet: 'projets',
      items: [{ projet: 'Cloud', date: '2026', origin: 'fichier interne' }],
      columns: [
        { from: 'projet', key: 'projet_tendance', label: 'PROJET' },
        { from: 'date', key: 'horizon', label: 'HORIZON' },
      ],
      dropped: { origin: 'nom d’un fichier interne' },
    })
    expect(section.rows).toEqual([{ projet_tendance: 'Cloud', horizon: '2026' }])
    expect(context.skipped['projets.origin : nom d’un fichier interne']).toBe(1)
    expect(context.coverage).toContainEqual(expect.objectContaining({ sheet: 'projets', rows: 1 }))
  })

  it('une clé d’élément ni lue ni écartée fait ÉCHOUER', () => {
    expect(() =>
      listSection(ctx(), {
        key: 'x',
        title: 'X',
        sheet: 'x',
        items: [{ a: '1', surprise: '2' }],
        columns: [{ from: 'a', key: 'a', label: 'A' }],
      }),
    ).toThrow(/surprise/)
  })

  it('une cellule vide reste vide (null) — jamais 0, jamais devinée', () => {
    const section = listSection(ctx(), {
      key: 'x',
      title: 'X',
      sheet: 'x',
      items: [
        { a: '', b: 'x' },
        { a: '', b: '' },
      ],
      columns: [
        { from: 'a', key: 'a', label: 'A' },
        { from: 'b', key: 'b', label: 'B' },
      ],
    })
    // …et une ligne dont TOUTES les cellules sont vides ne s'affiche pas.
    expect(section.rows).toEqual([{ a: null, b: 'x' }])
  })
})

const SPEC: PeopleSpec = {
  sheet: 'contacts.csv',
  name: 'nom',
  function: 'fonction',
  entity: 'entite',
  city: 'ville',
  groupEmails: 'emails_domaine_groupe',
  otherEmails: 'autres_emails',
  mobile: 'mobile',
  linkedin: 'linkedin',
  groupDomain: /@(?:[\w-]+\.)*credit-agricole\.(?:com|fr)$/i,
  blacklist: 'blacklist_CRM',
  role: row => (row['decideur'] === 'Oui' ? 'decision_maker' : row['en_poste'] === 'Oui' ? 'contact' : 'alumni'),
  hook: row => [row['famille'] ? `Famille : ${row['famille']}` : undefined],
  dropped: { statut_CRM: 'statut de NOTRE relation commerciale', rang: 'rang interne', score: 'score interne' },
  read: ['decideur', 'en_poste', 'famille'],
}

const CSV = [
  '﻿rang;nom;fonction;entite;ville;emails_domaine_groupe;autres_emails;mobile;linkedin;decideur;en_poste;famille;blacklist_CRM;statut_CRM;score',
  '1;Camille Dupont;DSI;CA-TS;Annecy;camille.dupont@credit-agricole.fr;camille@gmail.com | c.dupont@capgemini.com;+33612345678;https:/www.linkedin.com/in/cd;Oui;Oui;Direction;Non;;10',
  '2;Paul Martin;Développeur;CAGIP;Lyon;;;;;Non;Non;Dev;Non;Client;5',
  '3;Rémi Interdit;Chef de projet;CAGIP;Paris;remi@credit-agricole.com;;;;Non;Oui;PMO;Oui;;4',
].join('\n')

describe('convertDossierPeople — coordonnées du GROUPE en clair, rien d’autre', () => {
  it('garde les adresses du groupe, compte les autres, répare LinkedIn, respecte la liste noire', () => {
    const context = ctx()
    const { people, withGroupEmail, withMobile } = convertDossierPeople(context, parseSemicolonCsv(CSV), SPEC)
    expect(people.map(person => person.name)).toEqual(['Camille Dupont', 'Paul Martin'])
    expect(people[0]).toMatchObject({
      email: 'camille.dupont@credit-agricole.fr',
      mobile: '+33612345678',
      linkedin: 'https://www.linkedin.com/in/cd',
      role: 'decision_maker',
      reliability: 'issu des fichiers',
    })
    expect(people[1]?.email).toBeUndefined()
    expect(people[1]?.role).toBe('alumni')
    expect(withGroupEmail).toBe(1)
    expect(withMobile).toBe(1)
    expect(context.skipped['adresse personnelle (webmail) : non reprise']).toBe(1)
    expect(context.skipped['adresse d’un employeur tiers ou d’un domaine personnel : non reprise']).toBe(1)
    expect(context.skipped['contact marqué « blacklist » au CRM : non semé']).toBe(1)
    // une cellule vide n'est pas « écartée » : seule la valeur de Paul Martin l'est
    expect(context.skipped['contacts.csv.statut_CRM : statut de NOTRE relation commerciale']).toBe(1)
  })

  it('une colonne du CSV ni lue ni écartée fait ÉCHOUER', () => {
    const csv = parseSemicolonCsv('nom;colonne_mystere\nA B;x')
    expect(() => convertDossierPeople(ctx(), csv, { ...SPEC, blacklist: undefined, dropped: {}, read: [] })).toThrow(
      /colonne_mystere/,
    )
  })

  it('une adresse annoncée « du groupe » qui n’en est pas une fait ÉCHOUER (jamais semée en silence)', () => {
    const csv = parseSemicolonCsv('nom;emails_domaine_groupe\nA B;a@gmail.com')
    expect(() => convertDossierPeople(ctx(), csv, { ...SPEC, blacklist: undefined, dropped: {}, read: [] })).toThrow(
      /n'est pas une adresse du groupe/,
    )
  })
})

describe('sourcesSection', () => {
  it('lien et date de chaque source ; un lien vers un fournisseur de données est retiré, la source reste', () => {
    const context = ctx()
    const section = sourcesSection(
      context,
      parseSemicolonCsv(
        'source;url;date_consultation\nVINCI, résultats 2025;https://www.vinci.com/r;2026-10-15\nPappers, VINCI Airports;https://www.pappers.fr/entreprise/x;2026-10-15',
      ),
    )
    expect(section.rows).toEqual([
      { source: 'VINCI, résultats 2025', url: 'https://www.vinci.com/r', date_consultation: '2026-10-15' },
      { source: 'registre des entreprises, VINCI Airports', url: null, date_consultation: '2026-10-15' },
    ])
  })
})
