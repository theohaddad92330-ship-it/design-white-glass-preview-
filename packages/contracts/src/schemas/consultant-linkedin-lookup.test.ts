import { describe, expect, it } from 'vitest'
import { buildLinkedinDraft, parseLinkedInProfileUrl } from './consultant-linkedin-lookup.js'

// H-DECISIONS #4348 — l'URL d'un profil LinkedIn est lue, jamais visitée.
describe('parseLinkedInProfileUrl', () => {
  it.each([
    ['https://www.linkedin.com/in/nadia-benali/', 'nadia-benali'],
    ['linkedin.com/in/nadia-benali', 'nadia-benali'],
    ['http://fr.linkedin.com/in/Nadia-Benali?utm_source=share#x', 'nadia-benali'],
    ['  https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa-12ab  ', 'jos%c3%a9-garc%c3%ada-12ab'],
  ])('%s → profil %s', (raw, slug) => {
    expect(parseLinkedInProfileUrl(raw)).toEqual({ slug, url: `https://www.linkedin.com/in/${slug}` })
  })

  it.each([
    '',
    'nadia benali',
    'https://www.linkedin.com/company/bellum',
    'https://www.linkedin.com/in/',
    'https://evil.com/in/nadia',
    'https://linkedin.com.evil.com/in/nadia',
    'https://www.linkedin.com/feed/',
    'javascript:alert(1)',
  ])('refuse %j — ce n’est pas un profil linkedin.com/in/<slug>', raw => {
    expect(parseLinkedInProfileUrl(raw)).toBeNull()
  })
})

describe('buildLinkedinDraft', () => {
  const url = 'https://www.linkedin.com/in/nadia-benali'

  it('ne rend RIEN quand le fournisseur ne reconnaît personne (pas de donnée inventée)', () => {
    expect(buildLinkedinDraft({ matched: false }, url)).toBeNull()
  })

  it('ne rend rien non plus sans nom : une fiche sans identité n’est pas un résultat', () => {
    expect(buildLinkedinDraft({ matched: true, title: 'Dev' }, url)).toBeNull()
  })

  it('pré-remplit présent-seulement : nom, titre, expériences — compétences JAMAIS devinées', () => {
    const draft = buildLinkedinDraft(
      {
        matched: true,
        first_name: 'Nadia',
        last_name: 'Benali',
        title: 'Lead Data Engineer',
        organization_name: 'Nordia',
        employment_history: [
          { title: 'Lead Data Engineer', organization_name: 'Nordia', start_date: '2021-03', current: true },
          { title: 'Data Engineer', organization_name: 'Acme', start_date: '2018-01', end_date: '2021-02' },
        ],
      },
      url,
    )
    expect(draft).toMatchObject({
      full_name: 'Nadia Benali',
      title: 'Lead Data Engineer',
      public_profile_url: url,
      source: 'linkedin_profile',
    })
    expect(draft?.cv_text).toContain('Lead Data Engineer · Nordia · 2021-03 – aujourd’hui')
    expect(draft?.cv_text).toContain('Data Engineer · Acme · 2018-01 – 2021-02')
    expect(draft?.stack).toEqual([])
  })

  it('un champ blanc ne devient jamais une valeur', () => {
    const draft = buildLinkedinDraft({ matched: true, first_name: 'Nadia', title: '  ', employment_history: [] }, url)
    expect(draft?.title).toBeNull()
    expect(draft?.cv_text).toBeNull()
    expect(draft?.email).toBeNull()
  })
})

// #4348.4 — « champs non trouvés = vides et DITS » : le brouillon nomme ce que le fournisseur n'a pas rendu.
describe('buildLinkedinDraft — missing', () => {
  const url = 'https://www.linkedin.com/in/nadia-benali'

  it('nomme chaque champ non rendu, compétences incluses (jamais devinées)', () => {
    const draft = buildLinkedinDraft({ matched: true, first_name: 'Nadia', title: 'Dev' }, url)
    expect(draft?.missing).toEqual(['email', 'phone', 'cv_text', 'stack'])
  })

  it('un champ rendu ne figure pas dans missing', () => {
    const draft = buildLinkedinDraft(
      {
        matched: true,
        first_name: 'Nadia',
        title: 'Dev',
        email: 'n@x.fr',
        phone: '0600',
        employment_history: [{ title: 'Dev', organization_name: 'Acme' }],
      },
      url,
    )
    expect(draft?.missing).toEqual(['stack'])
  })
})
