import {
  chatThreadExportSections,
  extractSources,
  formatExportTimestamp,
  type ChatThreadExport,
  type ChatThreadExportMessage,
} from './chat-thread-export'

/** Une date ISO brute, telle que mesurée en production (0ccc8961a) — jamais lisible telle quelle. */
const RAW_ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/

/**
 * #1955.15-.23 — le modèle de contenu d'un export de fil, et ses deux
 * dérivations pures : les sources citées par Laura, et les sections rendues
 * en Markdown/PDF (`chatThreadExportSections`).
 */

function message(over: Partial<ChatThreadExportMessage>): ChatThreadExportMessage {
  return {
    role: 'user',
    author: null,
    content: '',
    createdAt: '2026-09-15T10:00:00.000Z',
    ...over,
  }
}

describe('extractSources — #1955.21', () => {
  it('lit les liens markdown des réponses de Laura', () => {
    const sources = extractSources([
      message({ role: 'user', content: 'https://client.example/faux-lien-humain' }),
      message({
        role: 'assistant',
        content: 'D’après [le communiqué de presse](https://presse.example/article) publié ce matin.',
      }),
    ])
    expect(sources).toEqual([{ label: 'le communiqué de presse', url: 'https://presse.example/article' }])
  })

  it('n’attrape pas ce qu’elle ne vise pas : un lien collé par un humain n’est pas une source de Laura', () => {
    expect(extractSources([message({ role: 'user', content: '[voir ici](https://client.example/x)' })])).toEqual([])
  })

  it('dédoublonne par URL, garde le premier libellé rencontré', () => {
    const sources = extractSources([
      message({ role: 'assistant', content: '[Site A](https://a.example)' }),
      message({ role: 'assistant', content: '[encore le même](https://a.example)' }),
    ])
    expect(sources).toHaveLength(1)
    expect(sources[0]?.label).toBe('Site A')
  })

  it('sait dire NON : aucun message ne rend une liste vide, pas une erreur', () => {
    expect(extractSources([])).toEqual([])
  })
})

const BASE: ChatThreadExport = {
  title: 'Fil — Helios',
  generatedAt: '2026-09-15T12:00:00.000Z',
  scope: { accountId: 'acc-1', accountName: 'Helios' },
  authors: ['Marie'],
  messages: [
    message({ role: 'user', author: { firstName: 'Marie', avatarUrl: null }, content: 'Prépare la relance.' }),
    message({ role: 'assistant', content: 'Voici trois pistes.' }),
  ],
  sources: [{ label: 'Site Helios', url: 'https://helios.example' }],
  actions: [
    {
      whatWillHappen: 'Créer un brouillon',
      targetObject: 'Jean Dupont',
      destination: 'votre messagerie',
      outcome: 'Le brouillon a été créé.',
      occurredAt: '2026-09-15T12:05:00.000Z',
    },
  ],
  limits: ['votre CRM'],
}

describe('formatExportTimestamp — #1955.18 : une date se lit, elle ne se décode pas', () => {
  it('rend une date FRANÇAISE lisible, jamais l’ISO brut', () => {
    const readable = formatExportTimestamp('2026-09-15T21:51:03.654Z', 'fr', 'Europe/Paris')
    expect(readable).not.toMatch(RAW_ISO_TIMESTAMP)
    expect(readable).toContain('septembre')
    expect(readable).toContain('2026')
    expect(readable).toContain('23:51') // UTC 21:51 + 2 h (heure d'été Paris)
  })

  it('rend une date ANGLAISE lisible, jamais l’ISO brut — parité stricte avec le français', () => {
    const readable = formatExportTimestamp('2026-09-15T21:51:03.654Z', 'en', 'Europe/London')
    expect(readable).not.toMatch(RAW_ISO_TIMESTAMP)
    expect(readable).toContain('September')
    expect(readable).toContain('2026')
    expect(readable).toContain('22:51') // UTC 21:51 + 1 h (heure d'été Londres)
  })

  it('sans fuseau connu, retombe sur le fuseau de référence nommé du produit (Europe/Paris)', () => {
    expect(formatExportTimestamp('2026-01-15T10:00:00.000Z', 'fr', null)).toContain('11:00') // hiver, UTC+1
    expect(formatExportTimestamp('2026-01-15T10:00:00.000Z', 'fr', undefined)).toContain('11:00')
  })

  it('un fuseau illisible ne casse pas l’export — retombe sur la référence plutôt que de lever', () => {
    expect(() => formatExportTimestamp('2026-01-15T10:00:00.000Z', 'fr', 'Pas/UnFuseau')).not.toThrow()
    expect(formatExportTimestamp('2026-01-15T10:00:00.000Z', 'fr', 'Pas/UnFuseau')).toContain('11:00')
  })

  it('sait dire NON : une date illisible rend la chaîne d’origine, jamais « Invalid Date »', () => {
    expect(formatExportTimestamp('pas-une-date', 'fr')).toBe('pas-une-date')
  })
})

describe('chatThreadExportSections — #1955.15/.16/.18-.23', () => {
  it('#1955.18/.20 — la première section porte la date d’émission, lisible, et le périmètre', () => {
    const [first] = chatThreadExportSections(BASE, 'fr', 'Europe/Paris')
    expect(first?.heading).toBe('Fil')
    expect(first?.paragraphs.join(' ')).not.toMatch(RAW_ISO_TIMESTAMP)
    expect(first?.paragraphs.join(' ')).toContain('septembre')
    expect(first?.paragraphs.join(' ')).toContain('Helios')
  })

  it('#1955.18 — sait dire NON : le détecteur d’ISO brut voit bien une date fabriquée', () => {
    // Le même motif que la garde ci-dessus, appliqué à une paragraphe fabriquée
    // qui régresserait au format d'avant ce lot — la preuve que l'assertion
    // « pas de match » ci-dessus ne serait pas vacuously vraie sur du vide.
    expect('Émis le 2026-09-15T21:51:03.654Z.').toMatch(RAW_ISO_TIMESTAMP)
  })

  it('#1955.18 — sans langue déclarée, le rendu reste français par défaut (comportement d’avant ce lot)', () => {
    const [first] = chatThreadExportSections(BASE)
    expect(first?.paragraphs.join(' ')).toContain('septembre')
  })

  it('#1955.18 — en langue anglaise, la date du message suit — parité avec la section « Fil »', () => {
    const messages = chatThreadExportSections(BASE, 'en', 'Europe/London').find(
      section => section.heading === 'Messages',
    )
    expect(messages?.paragraphs[0]).not.toMatch(RAW_ISO_TIMESTAMP)
    expect(messages?.paragraphs[0]).toContain('September')
  })

  it('#1955.19 — chaque message nomme son auteur : « Laura » ou le prénom', () => {
    const messages = chatThreadExportSections(BASE, 'fr', 'Europe/Paris').find(
      section => section.heading === 'Messages',
    )
    expect(messages?.paragraphs[0]).toContain('Marie')
    expect(messages?.paragraphs[1]).toContain('Laura')
  })

  it('#1955.21 — les sources citées ont leur propre section', () => {
    const sources = chatThreadExportSections(BASE).find(section => section.heading === 'Sources citées')
    expect(sources?.paragraphs).toEqual(['Site Helios — https://helios.example'])
  })

  it('#1955.22 — les actions confirmées listent leur résultat', () => {
    const actions = chatThreadExportSections(BASE).find(section => section.heading === 'Actions confirmées')
    expect(actions?.paragraphs[0]).toContain('Créer un brouillon')
    expect(actions?.paragraphs[0]).toContain('Le brouillon a été créé.')
  })

  it('#1955.23 — les limites nomment ce que Laura n’a pas pu consulter', () => {
    const limits = chatThreadExportSections(BASE).find(section => section.heading === 'Limites')
    expect(limits?.paragraphs[0]).toContain('votre CRM')
  })

  it('sait dire NON : sans sources ni actions, ces deux sections n’existent pas — jamais une section vide', () => {
    const sections = chatThreadExportSections({ ...BASE, sources: [], actions: [] })
    expect(sections.find(section => section.heading === 'Sources citées')).toBeUndefined()
    expect(sections.find(section => section.heading === 'Actions confirmées')).toBeUndefined()
  })

  it('un résultat pas encore connu se dit — jamais un résultat inventé (doctrine)', () => {
    const withoutOutcome = {
      ...BASE,
      actions: [{ ...BASE.actions[0]!, outcome: null, occurredAt: null }],
    }
    const actions = chatThreadExportSections(withoutOutcome).find(section => section.heading === 'Actions confirmées')
    expect(actions?.paragraphs[0]).toContain('résultat non encore connu')
  })
})

// #3895.5 — « l'export permet de comprendre le test ou indique clairement ce qui manque » :
// il dit s'il porte le fil COMPLET ou un EXTRAIT, et avec quelle version du produit il a été émis.
describe('chatThreadExportSections — #3895.5 : fil complet ou extrait, et version du produit', () => {
  const fil = (data: ChatThreadExport) =>
    chatThreadExportSections(data, 'fr')
      .find(section => section.heading === 'Fil')
      ?.paragraphs.join('\n') ?? ''

  it('dit « fil complet » avec le nombre de messages et la période', () => {
    const text = fil({
      ...BASE,
      coverage: { messageCount: 2, truncated: false },
      productVersion: 'a1b2c3d',
    })
    expect(text).toContain('Fil complet : 2 messages')
    expect(text).toContain('Version du produit : a1b2c3d.')
  })

  it('dit « extrait » quand le fil a été coupé, jamais « complet »', () => {
    const text = fil({ ...BASE, coverage: { messageCount: 1000, truncated: true } })
    expect(text).toContain('Extrait : les 1000 derniers messages')
    expect(text).not.toContain('Fil complet')
  })

  it('sait dire NON : sans version connue, aucune version n’est écrite ni devinée', () => {
    const text = fil({ ...BASE, coverage: { messageCount: 2, truncated: false }, productVersion: null })
    expect(text).not.toContain('Version du produit')
  })

  it('sans mesure de couverture (ancien appelant), rien n’est affirmé sur la complétude', () => {
    const text = fil(BASE)
    expect(text).not.toContain('Fil complet')
    expect(text).not.toContain('Extrait')
  })
})
