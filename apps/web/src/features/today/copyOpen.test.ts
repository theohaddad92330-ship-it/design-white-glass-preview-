import { describe, expect, it } from 'vitest'
import { buildCopyOpen } from './copyOpen'
import type { TodayItem } from './todayQueue'

const item = (over: Partial<TodayItem>): TodayItem =>
  ({
    channel: 'email',
    draft: { subject: 'Bonjour Marie', body: 'Ligne 1\nLigne 2' },
    contactName: 'Marie Dubois',
    accountName: 'Acme',
    recipient: null,
    ...over,
  }) as TodayItem

describe('buildCopyOpen — copier le brouillon, ouvrir la messagerie du commercial', () => {
  it('e-mail : copie « objet + corps » et ouvre un mailto prérempli', () => {
    const target = buildCopyOpen(item({}))
    expect(target?.text).toBe('Bonjour Marie\n\nLigne 1\nLigne 2')
    expect(target?.href).toBe('mailto:?subject=Bonjour%20Marie&body=Ligne%201%0ALigne%202')
  })

  it('e-mail : le destinataire est posé quand la maison le porte', () => {
    expect(buildCopyOpen(item({ recipient: 'marie@acme.fr' }))?.href.startsWith('mailto:marie%40acme.fr?')).toBe(true)
  })

  it('e-mail sans objet : le corps seul', () => {
    const target = buildCopyOpen(item({ draft: { subject: null, body: 'Salut' } }))
    expect(target?.text).toBe('Salut')
    expect(target?.href).toBe('mailto:?body=Salut')
  })

  it('LinkedIn : copie le corps et ouvre la recherche du contact, jamais une URL devinée', () => {
    const target = buildCopyOpen(item({ channel: 'linkedin', draft: { subject: null, body: 'Bonjour' } }))
    expect(target?.text).toBe('Bonjour')
    expect(target?.href).toBe('https://www.linkedin.com/search/results/people/?keywords=Marie%20Dubois%20Acme')
  })

  it('LinkedIn sans contact nommé : la messagerie LinkedIn', () => {
    const target = buildCopyOpen(item({ channel: 'linkedin', contactName: null, accountName: null }))
    expect(target?.href).toBe('https://www.linkedin.com/messaging/')
  })

  it('sans brouillon ou hors e-mail/LinkedIn : rien à copier', () => {
    expect(buildCopyOpen(item({ draft: null }))).toBeNull()
    expect(buildCopyOpen(item({ channel: 'phone' }))).toBeNull()
    expect(buildCopyOpen(item({ channel: null }))).toBeNull()
  })
})
