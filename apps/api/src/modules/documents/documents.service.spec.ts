import { DocumentsService, formatRevenue, generationNotice, readScoreLine, readSignal } from './documents.service'
import { DEFAULT_BRAND_NAME } from '@bellum/contracts'
import { resolveBrand } from '@bellum/contracts'

/** Le service de marque, réduit à ce que le code testé lui demande : la marque
 *  du PRODUIT, c'est-à-dire un espace qui n'a rien posé. */
const brandsStub = {
  getForUser: jest.fn().mockResolvedValue(resolveBrand(null)),
  getForWorkspace: jest.fn().mockResolvedValue(resolveBrand(null)),
  getSendingAddress: jest.fn().mockResolvedValue(null),
}

/**
 * Le défaut trouvé en production : le dossier de Groupe Helios se téléchargeait
 * bien, en Word, en PDF et en présentation — et sa section « Signaux récents »
 * ne contenait que trois dates nues. Aucun test ne le voyait parce qu'aucun ne
 * lisait un signal AU FORMAT DU CONTRAT.
 */
describe('readSignal — la ligne de « Signaux récents »', () => {
  it('lit la clé `signal`, celle que le contrat nomme', () => {
    expect(
      readSignal({
        signal: 'Lancement du programme Helios 2027',
        date: '2026-05-12',
        source: 'Communiqué de presse',
      }),
    ).toBe('Lancement du programme Helios 2027 — 2026-05-12')
  })

  it('n’écrit JAMAIS une date sans ce qui s’est passé', () => {
    // C'est la forme exacte qui partait au client : « 2026-05-12 », seul.
    expect(readSignal({ date: '2026-05-12' })).toBe('')
  })

  it('porte l’implication commerciale, qui est ce qu’on relit avant l’appel', () => {
    expect(
      readSignal({
        signal: 'Arrivée d’une nouvelle DSI groupe',
        date: '2026-04-02',
        sales_implication: 'Fenêtre de re-référencement ouverte.',
      }),
    ).toBe('Arrivée d’une nouvelle DSI groupe — 2026-04-02 — Fenêtre de re-référencement ouverte.')
  })

  it('accepte encore l’ancienne clé `label` d’un dossier plus ancien', () => {
    expect(readSignal({ label: 'Levée de fonds' })).toBe('Levée de fonds')
  })

  it('ne rend rien d’une entrée qui n’est pas un objet', () => {
    expect(readSignal('2026-05-12')).toBe('')
    expect(readSignal(null)).toBe('')
  })

  it('tolère les blancs sans produire une ligne de ponctuation', () => {
    expect(readSignal({ signal: '  ', date: '2026-05-12' })).toBe('')
    expect(readSignal({ signal: 'Nomination', date: '   ', sales_implication: '  ' })).toBe('Nomination')
  })
})

/**
 * La note portée par le document doit être celle de l'écran.
 *
 * Vu en production : le PDF annonçait « 8/25 » quand l'application affichait
 * partout « 8/10 » — écran du compte, veille, tableau de bord, besoins, et
 * jusqu'aux exports déjà existants. Un document envoyé au client ne peut pas
 * contredire l'application sur le chiffre qu'on lit en premier.
 */
describe('readScoreLine — la note du dossier', () => {
  it('écrit la grille /25 quand le dossier la porte', () => {
    expect(readScoreLine({ priority_score: 8, raw_analysis: { evaluation: { score: 14 } } }, DEFAULT_BRAND_NAME)).toBe(
      `Score ${DEFAULT_BRAND_NAME} : 14/25`,
    )
  })

  it('lit la grille où l’écran la lit aussi — sous le plan', () => {
    expect(
      readScoreLine({ priority_score: 8, raw_analysis: { plan: { evaluation: { score: 12 } } } }, DEFAULT_BRAND_NAME),
    ).toBe(`Score ${DEFAULT_BRAND_NAME} : 12/25`)
  })

  it('retombe sur /10 pour un dossier qui n’a que la projection', () => {
    // C'est le cas du dossier vu en production : « 8 » affiché « /10 » à
    // l'écran, et « 8/25 » dans le document. Le dénominateur ne peut pas
    // dépendre du fichier qu'on ouvre.
    expect(readScoreLine({ priority_score: 8, raw_analysis: {} }, DEFAULT_BRAND_NAME)).toBe(
      `Score ${DEFAULT_BRAND_NAME} : 8/10`,
    )
  })

  it('n’écrit aucune ligne quand il n’y a pas de note', () => {
    // Écrire « 0 » se lirait « ce compte ne vaut rien », alors que la vérité est
    // « rien n'a été mesuré ».
    expect(readScoreLine({ priority_score: null, raw_analysis: {} }, DEFAULT_BRAND_NAME)).toBeUndefined()
  })

  it('ne se laisse pas déborder par une note hors grille', () => {
    expect(readScoreLine({ raw_analysis: { evaluation: { score: 99 } } }, DEFAULT_BRAND_NAME)).toBe(
      `Score ${DEFAULT_BRAND_NAME} : 25/25`,
    )
  })
})

/**
 * Vu sur un dossier réel : le PDF envoyé au client affichait « Chiffre
 * d'affaires : 756714000 ». Neuf chiffres collés, qu'il faut compter du doigt
 * pour savoir s'il s'agit de 75 ou de 756 millions.
 */
describe('formatRevenue — le chiffre d’affaires du document', () => {
  it('abrège en millions, comme on le dit à l’oral', () => {
    expect(formatRevenue(756714000)).toBe('756,7 M€')
    expect(formatRevenue('488600000')).toBe('488,6 M€')
  })

  it('abrège en milliards au-delà du seuil', () => {
    expect(formatRevenue(3400000000)).toBe('3,4 Md€')
  })

  it('groupe les milliers en dessous du million', () => {
    expect(formatRevenue(870000)).toMatch(/^870\s?000 €$/)
  })

  it('laisse INTACTE une valeur déjà rédigée', () => {
    // L'analyse écrit parfois « ≈ 3,4 Md€ (est. 2025) » : la reformater
    // détruirait l'estimation et son année.
    expect(formatRevenue('≈ 3,4 Md€ (est. 2025)')).toBe('≈ 3,4 Md€ (est. 2025)')
    expect(formatRevenue('non communiqué')).toBe('non communiqué')
  })

  it('rend null sur du vide — la ligne disparaît au lieu d’afficher un blanc', () => {
    expect(formatRevenue(null)).toBeNull()
    expect(formatRevenue('  ')).toBeNull()
  })

  it('ne fabrique pas un montant à partir de zéro', () => {
    // Un CA à 0 dans le registre veut dire « non déposé », pas « zéro euro ».
    expect(formatRevenue(0)).toBe('0')
  })
})

describe('la mention de génération (tome 5 §18)', () => {
  it('porte la date ET ce qu’il ne faut pas lire dans le document', () => {
    // « Sans cette mention, un deck de six mois circule dans une équipe comme
    // s'il était à jour » — c'est la première faiblesse que le tome relève du
    // document humain qui lui sert de modèle.
    const notice = generationNotice(new Date('2026-08-23T12:12:00Z'))
    expect(notice).toContain('23/08/2026')
    expect(notice).toContain('estimations')
    expect(notice).toContain('premier contact')
  })

  it('est la DERNIÈRE section du dossier — donc la dernière page de chaque format', async () => {
    const accounts = {
      findOneForWorkspace: jest.fn().mockResolvedValue({
        type: 'success',
        output: { id: 'a1', company_name: 'ACME', sector: 'Industrie', recent_signals: [] },
      }),
    }
    const contacts = { findByAccount: jest.fn().mockResolvedValue([]) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1' }) }
    const service = new DocumentsService(
      accounts as never,
      contacts as never,
      workspaceContext as never,
      brandsStub as never,
    )
    const content = await (
      service as unknown as {
        accountContent: (id: string, user: string) => Promise<{ sections: { heading: string }[] }>
      }
    ).accountContent('a1', 'u1')
    expect(content.sections.at(-1)?.heading).toBe('À propos de ce document')
  })
})
