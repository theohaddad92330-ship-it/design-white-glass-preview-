import { mailSearchRequestSchema } from '@bellum/contracts'
import { buildMailQuery, isoDaysAgo, renderGmailQuery, renderGraphSearch } from './mail-query'

/**
 * Ce que ces tests protègent : une recherche fausse ne se voit pas. Elle rend
 * zéro résultat, ce qui ressemble exactement à « il n'y a rien ». Chaque
 * intention métier des méta-analyses est donc épinglée à la requête qu'elle
 * produit réellement.
 */

const parse = (input: Record<string, unknown>) => mailSearchRequestSchema.parse(input)

describe('buildMailQuery', () => {
  it('traduit une intention métier en vocabulaire, pas en texte libre', () => {
    const spec = buildMailQuery(parse({ intent: 'tjm' }))
    expect(spec.keywordGroups).toEqual([['TJM', 'taux journalier', 'tarif journalier', 'daily rate']])
  })

  it('« sans réponse » cherche les ENVOYÉS, jamais les reçus', () => {
    // Le silence se déduit d'un fil dont le dernier message est sortant : partir
    // de la boîte de réception ne pourrait pas répondre à la question.
    const spec = buildMailQuery(parse({ intent: 'no_reply', silenceDays: 7 }))
    expect(spec.sentOnly).toBe(true)
    expect(spec.keywordGroups).toEqual([])
  })

  it('« sans réponse » élargit la fenêtre au-delà du silence demandé', () => {
    // Un fil parti il y a 40 jours est plus en retard qu'un fil de 8 jours ; le
    // chercher sur 30 jours le ferait disparaître du décompte.
    const spec = buildMailQuery(parse({ intent: 'no_reply', windowDays: 30, silenceDays: 20 }))
    expect(spec.newerThanDays).toBe(60)
  })

  it('« CV » demande aussi la pièce jointe — un CV voyage attaché', () => {
    const spec = buildMailQuery(parse({ intent: 'cv' }))
    expect(spec.hasAttachment).toBe(true)
  })

  it('« non lus » ne porte aucun vocabulaire : c’est une forme, pas un sujet', () => {
    const spec = buildMailQuery(parse({ intent: 'unread' }))
    expect(spec.unreadOnly).toBe(true)
    expect(spec.keywordGroups).toEqual([])
  })

  it('le texte libre de l’utilisateur est conservé tel quel', () => {
    const spec = buildMailQuery(parse({ intent: 'free', query: 'Société Générale' }))
    expect(spec.keywordGroups).toEqual([['Société Générale']])
  })

  it('un interlocuteur nu est traité comme un domaine', () => {
    const spec = buildMailQuery(parse({ intent: 'free', counterpart: '@acme.com' }))
    expect(spec.participant).toBe('acme.com')
  })
})

describe('renderGmailQuery', () => {
  it('met les groupes en OU et les cite quand ils contiennent des espaces', () => {
    const query = renderGmailQuery({ keywordGroups: [['TJM', 'taux journalier']] })
    expect(query).toContain('(TJM OR "taux journalier")')
  })

  it('cherche un domaine dans les deux sens', () => {
    const query = renderGmailQuery({ keywordGroups: [], participant: 'acme.com' })
    expect(query).toContain('(from:@acme.com OR to:@acme.com)')
  })

  it('rend les opérateurs Gmail documentés et exclut les promotions', () => {
    const query = renderGmailQuery({
      keywordGroups: [],
      sentOnly: true,
      unreadOnly: true,
      hasAttachment: true,
      newerThanDays: 14,
    })
    expect(query).toContain('in:sent')
    expect(query).toContain('is:unread')
    expect(query).toContain('has:attachment')
    expect(query).toContain('newer_than:14d')
    expect(query).toContain('-category:promotions')
  })

  it('n’émet jamais une apostrophe non citée qui casserait la requête', () => {
    const query = renderGmailQuery({ keywordGroups: [["appel d'offres"]] })
    expect(query).toBe('"appel d\'offres" -category:promotions')
  })
})

describe('renderGraphSearch', () => {
  it('assemble du KQL en ET entre groupes', () => {
    const rendered = renderGraphSearch({ keywordGroups: [['budget'], ['RFP', 'RFI']] })
    expect(rendered.search).toBe('budget AND (RFP OR RFI)')
  })

  it('renvoie le critère non-lu à l’appelant plutôt que d’émettre une requête illégale', () => {
    // Graph refuse $search combiné à $filter sur /me/messages : le dire est
    // mieux que le perdre en silence.
    const rendered = renderGraphSearch({ keywordGroups: [['budget']], unreadOnly: true })
    expect(rendered.clientSideUnread).toBe(true)
    expect(rendered.search).not.toContain('isRead')
  })

  it('exprime la fenêtre en date, seule forme que KQL accepte', () => {
    const rendered = renderGraphSearch({ keywordGroups: [], newerThanDays: 30 })
    expect(rendered.search).toMatch(/^received>=\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isoDaysAgo', () => {
  it('rend une date nue, pas un instant', () => {
    expect(isoDaysAgo(10, new Date('2026-08-11T13:45:00Z'))).toBe('2026-08-01')
  })
})
