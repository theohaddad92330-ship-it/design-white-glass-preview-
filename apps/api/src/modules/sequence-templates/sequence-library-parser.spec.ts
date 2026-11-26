import ExcelJS from 'exceljs'
import { parseSequenceLibrary, readSequenceLibraryFile } from './sequence-library-parser'

const rec = (line: number, record: Record<string, string>) => ({ line, record })

// #3756.1 — une campagne = un modèle ; colonnes tolérantes FR/EN ; lignes
// invalides comptées et nommées ; les chiffres de l'outil d'envoi ne sont PAS lus.
describe('parseSequenceLibrary', () => {
  it('regroupe les lignes par campagne, étapes ordonnées, délai J+n', () => {
    const out = parseSequenceLibrary([
      rec(2, {
        Campagne: 'Campagne 1',
        Secteur: '3PL',
        Tier: 'A',
        Étape: '2',
        'J+n': 'J+3',
        Objet: 'Relance',
        Corps: 'B2',
      }),
      rec(3, {
        Campagne: 'Campagne 1',
        Secteur: '3PL',
        Tier: 'A',
        Étape: '1',
        'J+n': 'J+0',
        Objet: 'Hello',
        Corps: 'B1',
      }),
      rec(4, {
        Campagne: 'Campagne 2',
        Secteur: 'Retail',
        Tier: 'tier b',
        Étape: '1',
        'J+n': '0',
        Objet: 'O',
        Corps: 'C',
      }),
    ])
    expect(out.skipped).toEqual([])
    expect(out.templates).toHaveLength(2)
    expect(out.templates[0]).toEqual({
      name: 'Campagne 1',
      sector: '3PL',
      tier_label: 'A',
      steps: [
        { position: 0, delay_days: 0, subject: 'Hello', body: 'B1' },
        { position: 1, delay_days: 3, subject: 'Relance', body: 'B2' },
      ],
      call_scripts: [],
    })
    expect(out.templates[1]?.tier_label).toBe('B')
  })

  it('accepte les en-têtes anglais et un délai numérique', () => {
    const out = parseSequenceLibrary([
      rec(2, { campaign: 'C', sector: 'S', tier: 'C', step: '1', delay: '5', subject: 's', body: 'b' }),
    ])
    expect(out.templates[0]).toMatchObject({ name: 'C', tier_label: 'C', steps: [{ delay_days: 5 }] })
  })

  it('compte et nomme les lignes invalides', () => {
    const out = parseSequenceLibrary([
      rec(2, { Campagne: 'Ok', 'J+n': '0', Corps: 'b' }),
      rec(3, { Campagne: '', 'J+n': '0', Corps: 'b' }),
      rec(4, { Campagne: 'Ok', 'J+n': '0', Corps: '  ' }),
      rec(5, { Campagne: 'Ok', 'J+n': 'bientôt', Corps: 'b' }),
      rec(6, { Campagne: 'Ok', 'J+n': '1', Tier: 'Z', Corps: 'b' }),
    ])
    expect(out.templates[0]?.steps).toHaveLength(1)
    expect(out.skipped).toEqual([
      { line: 3, reason: 'no_campaign', campaign: null },
      { line: 4, reason: 'no_body', campaign: 'Ok' },
      { line: 5, reason: 'bad_delay', campaign: 'Ok' },
      { line: 6, reason: 'bad_tier', campaign: 'Ok' },
    ])
  })

  it('ignore les colonnes de stats : aucun chiffre de l’outil d’envoi n’est importé', () => {
    const out = parseSequenceLibrary([
      rec(2, {
        Campagne: 'C1',
        'J+n': '0',
        Corps: 'b',
        "Taux d'ouverture": '61%',
        'Taux de réponse': '12%',
        Envoyés: '4321',
      }),
    ])
    const serialized = JSON.stringify(out)
    expect(serialized).not.toContain('61%')
    expect(serialized).not.toContain('4321')
    expect(Object.keys(out.templates[0] ?? {}).sort()).toEqual([
      'call_scripts',
      'name',
      'sector',
      'steps',
      'tier_label',
    ])
  })

  it('écarte les étapes au-delà de 12', () => {
    const rows = Array.from({ length: 13 }, (_, i) => rec(i + 2, { Campagne: 'Long', 'J+n': String(i), Corps: 'b' }))
    const out = parseSequenceLibrary(rows)
    expect(out.templates[0]?.steps).toHaveLength(12)
    expect(out.skipped).toEqual([{ line: 14, reason: 'too_many_steps', campaign: 'Long' }])
  })
})

describe('readSequenceLibraryFile', () => {
  it('lit un CSV (séparateur point-virgule, accents)', async () => {
    const csv =
      'Campagne;Secteur;Tier;Étape;J+n;Objet;Corps;Taux d’ouverture\nCampagne 1;3PL;A;1;J+0;Bonjour;Salut {{firstName}};55%\n'
    const out = await readSequenceLibraryFile(Buffer.from(csv, 'utf8'), 'csv')
    expect(out.templates).toHaveLength(1)
    expect(out.templates[0]?.steps[0]).toMatchObject({ subject: 'Bonjour', body: 'Salut {{firstName}}' })
    expect(JSON.stringify(out)).not.toContain('55%')
  })

  it('lit un xlsx : la première feuille seulement, l’onglet stats n’est jamais importé', async () => {
    const wb = new ExcelJS.Workbook()
    const lib = wb.addWorksheet('Campagnes')
    lib.addRow(['Campagne', 'Secteur', 'Tier', 'Étape', 'J+n', 'Objet', 'Corps'])
    lib.addRow(['Campagne 1', '3PL', 'A', 1, 'J+0', 'Hello', 'Bonjour {{firstName}}'])
    lib.addRow(['Campagne 1', '3PL', 'A', 2, 'J+3', 'Relance', 'Re {{firstName}}'])
    const stats = wb.addWorksheet('Stats')
    stats.addRow(['Campagne', 'Taux de réponse'])
    stats.addRow(['Stats-only', '99%'])
    const buffer = Buffer.from(await wb.xlsx.writeBuffer())
    const out = await readSequenceLibraryFile(buffer, 'xlsx')
    expect(out.templates.map(t => t.name)).toEqual(['Campagne 1'])
    expect(out.templates[0]?.steps.map(s => s.delay_days)).toEqual([0, 3])
    expect(JSON.stringify(out)).not.toContain('99%')
  })
})

// #4426.7 — le classeur réel : « listecampagnes », « contenu » (une ligne par mail), « stats ».
describe('#4426.7 — classeur multi-feuilles', () => {
  async function pack(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const list = wb.addWorksheet('listecampagnes')
    list.addRow(['Campagne', 'Secteur', 'Sociétés Tier A', 'Sociétés Tier B', 'Sociétés Tier C'])
    list.addRow([1, 'Logistique', 'Acme', 'Globex', 'Initech'])
    list.addRow([2, 'Retail', 'Umbrella', '', ''])
    const content = wb.addWorksheet('contenu')
    content.addRow(['Campagne', 'Type / Étape', 'Titre / Intitulé', 'Contenu'])
    content.addRow([1, 'Mail 2 (J+3)', 'Relance', '<p>Re {{firstName}},</p><p>Suite de {{companyName}}</p>'])
    content.addRow([
      1,
      'Mail 1 (J+0)',
      'Premier mail',
      'Bonjour {{firstName}},<br>Je suis {{monAlias}}.<br/>Cordialement',
    ])
    content.addRow([2, 'Mail 1 (J+0)', 'Autre', 'Salut {{lastName}}'])
    const stats = wb.addWorksheet('stats')
    stats.addRow(['Campagne', 'Taux de réponse'])
    stats.addRow([1, '99%'])
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  it('retient la feuille « contenu » (la colonne corps), pas la première', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.skipped).toEqual([])
    expect(out.templates).toHaveLength(2)
    expect(JSON.stringify(out)).not.toContain('99%')
  })

  it('groupe par campagne, ordonne par étape, lit le délai « (J+3) », prend l’objet dans « Titre / Intitulé »', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.templates[0]?.steps.map(s => [s.position, s.delay_days, s.subject])).toEqual([
      [0, 0, 'Premier mail'],
      [1, 3, 'Relance'],
    ])
  })

  it('le nom de la campagne vient de « listecampagnes » (Campagne + Secteur), le secteur aussi', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.templates.map(t => [t.name, t.sector])).toEqual([
      ['1 — Logistique', 'Logistique'],
      ['2 — Retail', 'Retail'],
    ])
    // Les listes de sociétés par tier ne sont pas des tiers de séquence : rien n'est deviné.
    expect(out.templates.map(t => t.tier_label)).toEqual([null, null])
  })

  it('convertit le HTML simple en texte avec retours à la ligne', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.templates[0]?.steps[0]?.body).toBe('Bonjour {{firstName}},\nJe suis {{monAlias}}.\nCordialement')
    expect(out.templates[0]?.steps[1]?.body).toBe('Re {{firstName}},\n\nSuite de {{companyName}}')
  })

  it('une variable inconnue reste telle quelle, et le rapport la nomme', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.unknownVariables).toEqual(['monAlias'])
    expect(out.templates[0]?.steps[0]?.body).toContain('{{monAlias}}')
  })

  it('sans feuille « listecampagnes », le nom de campagne reste celui du fichier', async () => {
    const wb = new ExcelJS.Workbook()
    const content = wb.addWorksheet('contenu')
    content.addRow(['Campagne', 'Type / Étape', 'Titre / Intitulé', 'Contenu'])
    content.addRow(['Printemps', 'Mail 1 (J+0)', 'O', 'Salut'])
    const out = await readSequenceLibraryFile(Buffer.from(await wb.xlsx.writeBuffer()), 'xlsx')
    expect(out.templates.map(t => t.name)).toEqual(['Printemps'])
    expect(out.unknownVariables).toEqual([])
  })
})

// #4426.7 — les lignes « Script : … » ne sont PAS écartées : ce sont les scripts d'appel de la campagne.
describe('#4426.7 — les scripts d’appel sont gardés', () => {
  const SCRIPTS = ['Accroche', 'Le Liant', 'La Fermeture', 'Qualification', 'Renfort', 'Traitement des objections']
  const records = [
    {
      line: 2,
      record: { Campagne: '1', 'Type / Étape': 'Mail 1 (J+0)', 'Titre / Intitulé': 'Premier', Contenu: 'Bonjour' },
    },
    ...SCRIPTS.map((name, index) => ({
      line: 3 + index,
      record: {
        Campagne: '1',
        'Type / Étape': `Script : ${name}`,
        'Titre / Intitulé': '',
        Contenu: `<p>Texte ${name}</p>`,
      },
    })),
    { line: 20, record: { Campagne: '1', 'Type / Étape': 'Script : Vide', 'Titre / Intitulé': '', Contenu: '' } },
  ]

  it('range les 6 scripts sur la campagne (titre = ce qui suit « Script : »), hors des étapes de mail', () => {
    const out = parseSequenceLibrary(records)
    expect(out.templates).toHaveLength(1)
    expect(out.templates[0]?.steps).toHaveLength(1)
    expect(out.templates[0]?.call_scripts.map(script => script.title)).toEqual(SCRIPTS)
    expect(out.templates[0]?.call_scripts[0]?.body).toBe('Texte Accroche')
  })

  it('un script SANS texte reste écarté, avec son motif nommé ; les 6 scripts ne sont plus « écartés »', () => {
    const out = parseSequenceLibrary(records)
    expect(out.skipped).toEqual([{ line: 20, reason: 'no_body', campaign: '1' }])
  })
})

// #4426.7 — « 9 campagnes prises — 54 scripts gardés » ne disait rien des 36 MAILS : chacun devient une étape de
// séquence de sa campagne (délai J+n, titre, corps en texte lisible, variables conservées). Fichier fictif.
describe('#4426.7 — les mails d’un classeur de campagnes deviennent des étapes de séquence', () => {
  const MAILS = ['Mail 1 (J+0)', 'Mail 2 (J+3)', 'Mail 3 (J+7)', 'Mail 4 (J+14)']
  async function pack(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook()
    const list = wb.addWorksheet('listecampagnes')
    list.addRow(['Campagne', 'Secteur', 'Sociétés Tier A', 'Sociétés Tier B', 'Sociétés Tier C'])
    const content = wb.addWorksheet('contenu')
    content.addRow(['Campagne', 'Type / Étape', 'Titre / Intitulé', 'Contenu'])
    for (let campaign = 1; campaign <= 9; campaign++) {
      list.addRow([campaign, `Secteur ${campaign}`, 'Acme', '', ''])
      MAILS.forEach((step, index) =>
        content.addRow([
          campaign,
          step,
          `Objet ${campaign}.${index + 1}`,
          `Bonjour {{firstName}},<br><br>Texte ${campaign}.${index + 1}<br>Cordialement`,
        ]),
      )
      for (let s = 1; s <= 6; s++) content.addRow([campaign, `Script : Étape ${s}`, '', `<p>Appel ${s}</p>`])
    }
    wb.addWorksheet('stats').addRow(['Campagne', 'Taux'])
    return Buffer.from(await wb.xlsx.writeBuffer())
  }

  it('36 mails → 36 étapes (4 par campagne), 54 scripts à part, rien d’écarté', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    expect(out.skipped).toEqual([])
    expect(out.templates).toHaveLength(9)
    expect(out.templates.reduce((sum, t) => sum + t.steps.length, 0)).toBe(36)
    expect(out.templates.reduce((sum, t) => sum + t.call_scripts.length, 0)).toBe(54)
    expect(out.unknownVariables).toEqual([])
  })

  it('chaque étape garde son délai J+n, son titre, un corps lisible (pas de <br>) et {{firstName}}', async () => {
    const out = await readSequenceLibraryFile(await pack(), 'xlsx')
    const steps = out.templates[2]?.steps ?? []
    expect(steps.map(s => [s.position, s.delay_days, s.subject])).toEqual([
      [0, 0, 'Objet 3.1'],
      [1, 3, 'Objet 3.2'],
      [2, 7, 'Objet 3.3'],
      [3, 14, 'Objet 3.4'],
    ])
    expect(steps[1]?.body).toBe('Bonjour {{firstName}},\n\nTexte 3.2\nCordialement')
    expect(steps.every(s => !/<\/?[a-z]/i.test(s.body))).toBe(true)
  })
})
