import { describe, expect, it } from 'vitest'
import { normalizeMyReports, reportSummary } from './myReports'

/**
 * #1960.10 — CE QUE « MES SIGNALEMENTS » LIT DE L'API.
 *
 * La lecture est TOLÉRANTE parce que le web et l'API se déploient séparément :
 * pendant quelques minutes, l'écran neuf peut parler à une API qui rend encore
 * l'ancienne forme (la ligne entière, sans `status` ni `reference`). Il doit
 * alors dire « état indisponible » — jamais « reçu » — et retrouver le numéro
 * sous son ancien nom plutôt qu'annoncer « sans numéro » à tort.
 */
describe('#1960.10 — normalizeMyReports', () => {
  it('rend ce que l’écran lit, et rien d’autre', () => {
    const reports = normalizeMyReports({
      items: [
        {
          id: 'fb-1',
          created_at: '2026-09-12T10:00:00.000Z',
          category: 'bug',
          message: 'Mon CRM est déconnecté',
          reference: 913,
          status: 'in_progress',
        },
      ],
    })

    expect(reports).toEqual([
      {
        id: 'fb-1',
        createdAt: '2026-09-12T10:00:00.000Z',
        category: 'bug',
        message: 'Mon CRM est déconnecté',
        reference: 913,
        status: 'in_progress',
      },
    ])
  })

  // NON : une valeur qui n'est pas un des quatre états n'en devient pas un.
  it('un état inconnu ou absent vaut « indisponible » (null), jamais « reçu »', () => {
    const reports = normalizeMyReports({
      items: [
        {
          id: 'a',
          created_at: '2026-09-12T10:00:00.000Z',
          category: 'bug',
          message: 'x',
          reference: 1,
          status: 'open',
        },
        { id: 'b', created_at: '2026-09-12T10:00:00.000Z', category: 'bug', message: 'x', reference: 2 },
        { id: 'c', created_at: '2026-09-12T10:00:00.000Z', category: 'bug', message: 'x', reference: 3, status: null },
      ],
    })

    expect(reports.map(report => report.status)).toEqual([null, null, null])
  })

  it('API encore ancienne : lit le numéro sous son ancien nom, et ne garde AUCUN des autres champs', () => {
    const [report] = normalizeMyReports({
      items: [
        {
          id: 'fb-1',
          created_at: '2026-09-12T10:00:00.000Z',
          category: 'bug',
          message: 'Mon CRM est déconnecté',
          page_url: 'https://app.example/chat?…',
          github_issue_number: 913,
          github_issue_url: 'https://github.com/o/r/issues/913',
          screenshot: 'data:image/png;base64,AAAA',
        },
      ],
    })

    expect(report?.reference).toBe(913)
    expect(report?.status).toBeNull()
    expect(JSON.stringify(report)).not.toMatch(/https?:|base64|github/i)
  })

  it('une référence qui n’est pas un nombre vaut « sans numéro »', () => {
    const [report] = normalizeMyReports({
      items: [{ id: 'fb-1', created_at: '2026-09-12T10:00:00.000Z', category: 'bug', message: 'x', reference: '913' }],
    })

    expect(report?.reference).toBeNull()
  })

  it('écarte une ligne malformée, et une réponse sans liste rend une liste vide', () => {
    expect(normalizeMyReports({ items: [{ message: 'sans identifiant' }, null, 'texte'] })).toEqual([])
    expect(normalizeMyReports(null)).toEqual([])
    expect(normalizeMyReports({})).toEqual([])
  })
})

describe('#1960.10 — reportSummary', () => {
  it('garde la première ligne écrite par la personne', () => {
    expect(reportSummary('\n  Le bouton ne répond plus  \nDétails : depuis ce matin')).toBe('Le bouton ne répond plus')
  })

  it('coupe une ligne trop longue, et le montre', () => {
    const summary = reportSummary('a'.repeat(400))
    expect(summary.length).toBeLessThanOrEqual(160)
    expect(summary.endsWith('…')).toBe(true)
  })

  it('laisse intacte une ligne qui tient', () => {
    expect(reportSummary('Court')).toBe('Court')
  })
})
