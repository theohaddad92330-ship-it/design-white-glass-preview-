import { describe, expect, it } from 'vitest'
import { pointClientDraft } from './point-client-draft'

const BASE = {
  missionLabel: 'Fiabilisation plateforme',
  consultantName: 'Yanis Berthier',
  clientFirstName: 'Julien',
  senderFirstName: 'Maëlle',
  endsOnLabel: '30 nov.',
  variant: 'default' as const,
}

// Théo missions-dossier — « Préparer le point client » : la fenêtre s'ouvre DÉJÀ rédigée, jamais un champ vide.
describe('pointClientDraft', () => {
  it('rédige un objet et un message à partir de la mission, tutoie, et ne présume pas d’une prolongation', () => {
    const draft = pointClientDraft(BASE)
    expect(draft.subject).toBe('Point de suivi — Fiabilisation plateforme')
    expect(draft.body).toContain('Bonjour Julien,')
    expect(draft.body).toContain('Yanis Berthier')
    expect(draft.body).toContain('30 nov.')
    expect(draft.body).toMatch(/sans présumer d’une prolongation/)
    expect(draft.body.trim().endsWith('Maëlle')).toBe(true)
  })

  it('sans date de fin connue, n’invente aucune échéance', () => {
    const draft = pointClientDraft({ ...BASE, endsOnLabel: null })
    expect(draft.body).not.toMatch(/après le|avant le/i)
    expect(draft.body).toMatch(/la suite de la mission/i)
  })

  it('sans consultant affecté, parle de la mission seule', () => {
    const draft = pointClientDraft({ ...BASE, consultantName: null })
    expect(draft.body).not.toContain('null')
    expect(draft.body).toContain('Fiabilisation plateforme')
  })

  it('sans prénom du client, salue sans prénom plutôt que d’en deviner un', () => {
    const draft = pointClientDraft({ ...BASE, clientFirstName: null })
    expect(draft.body.startsWith('Bonjour,')).toBe(true)
  })

  it('« plus court » tient en moins de lignes que le texte par défaut', () => {
    const long = pointClientDraft(BASE).body.split('\n').filter(Boolean).length
    const short = pointClientDraft({ ...BASE, variant: 'shorter' })
      .body.split('\n')
      .filter(Boolean).length
    expect(short).toBeLessThan(long)
  })

  it('« plus direct » pose la question de la suite dès la première phrase', () => {
    const body = pointClientDraft({ ...BASE, variant: 'direct' }).body
    expect(body.split('\n').filter(Boolean)[1]).toMatch(/suite/i)
  })
})
