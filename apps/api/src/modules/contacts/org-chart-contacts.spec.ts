import { orgChartSourceLabel, planOrgChartContacts } from './org-chart-contacts'

/**
 * #2553 / #3740 — « importer mon organigramme, le mettre dans les contacts ».
 * Une personne NOUVELLE devient un contact ; une personne qui correspond à un
 * contact existant s'y LIE (jamais écrasée, jamais fusionnée) ; réimporter le
 * même document ne double rien.
 */
const existing = [{ id: 'c-1', full_name: 'Éloïse Martin', email: null, phone: null, linkedin_url: null }]

describe('planOrgChartContacts', () => {
  it('une personne nouvelle est à créer, avec sa fonction et son entité', () => {
    const plan = planOrgChartContacts(existing, [{ fullName: 'Jean Dupont', title: 'DSI', entityName: 'Lyon' }])
    expect(plan.toCreate).toEqual([{ fullName: 'Jean Dupont', title: 'DSI', entityName: 'Lyon' }])
    expect(plan.linked).toEqual([])
  })

  it('une personne qui correspond (casse et accents) se LIE au contact, sans création', () => {
    const plan = planOrgChartContacts(existing, [{ fullName: 'ELOISE MARTIN', title: 'DAF' }])
    expect(plan.toCreate).toEqual([])
    expect(plan.linked).toEqual([{ fullName: 'ELOISE MARTIN', contactId: 'c-1' }])
  })

  it('un doublon dans le même document ne crée qu’une fois', () => {
    const plan = planOrgChartContacts([], [{ fullName: 'Jean Dupont' }, { fullName: 'jean dupont' }])
    expect(plan.toCreate).toHaveLength(1)
  })

  // #3740.3 — « l'écriture inverse » : le LinkedIn du FICHIER
  // complète un contact existant dont le LinkedIn est vide. Present-only :
  // le champ déjà renseigné (donné par une correction humaine ou un import
  // antérieur) n'est JAMAIS écrasé par le fichier.
  it('un contact lié SANS LinkedIn reçoit celui du fichier', () => {
    const plan = planOrgChartContacts(existing, [
      { fullName: 'Éloïse Martin', linkedinUrl: 'https://linkedin.com/in/eloise-martin' },
    ])
    expect(plan.linked).toEqual([
      { fullName: 'Éloïse Martin', contactId: 'c-1', linkedinUrl: 'https://linkedin.com/in/eloise-martin' },
    ])
  })

  it('un contact lié qui a DÉJÀ un LinkedIn garde le sien, le fichier ne l’écrase pas', () => {
    const withLinkedin = [{ ...existing[0], linkedin_url: 'https://linkedin.com/in/deja-la' }]
    const plan = planOrgChartContacts(withLinkedin, [
      { fullName: 'Éloïse Martin', linkedinUrl: 'https://linkedin.com/in/eloise-martin' },
    ])
    expect(plan.linked).toEqual([{ fullName: 'Éloïse Martin', contactId: 'c-1' }])
  })

  it('un fichier sans LinkedIn ne change rien pour un contact lié', () => {
    const plan = planOrgChartContacts(existing, [{ fullName: 'Éloïse Martin', title: 'DAF' }])
    expect(plan.linked).toEqual([{ fullName: 'Éloïse Martin', contactId: 'c-1' }])
  })

  it('une personne nouvelle n’a pas de linkedinUrl à écrire (elle est créée avec, pas liée)', () => {
    const plan = planOrgChartContacts(existing, [
      { fullName: 'Jean Dupont', linkedinUrl: 'https://linkedin.com/in/jean-dupont' },
    ])
    expect(plan.toCreate).toEqual([{ fullName: 'Jean Dupont', linkedinUrl: 'https://linkedin.com/in/jean-dupont' }])
    expect(plan.linked).toEqual([])
  })
})

describe('orgChartSourceLabel', () => {
  it('nomme l’année du document', () => {
    expect(orgChartSourceLabel('2023-06-01')).toBe('organigramme importé (2023)')
  })
  it('sans date, ne devine aucune année', () => {
    expect(orgChartSourceLabel(undefined)).toBe('organigramme importé')
  })
})
