import { describe, expect, it } from 'vitest'
import { hiringDomain, hiringDomainLabel, signalRelevance } from './signal-relevance.js'

// #3901.w — décision Louis 09/10/2026 : le domaine du recrutement vient du profil DÉCLARÉ.
describe('hiringDomain / hiringDomainLabel — #3901.w', () => {
  const cyber = { placedRoles: ['cybersécurité', 'pentest'], noGoSectors: [] }
  const industrie = { placedRoles: ['HSE', 'maintenance industrielle'], noGoSectors: [] }

  it('ESN cyber : une offre « Ingénieur HSE » ne remonte pas (aucun domaine)', () => {
    expect(hiringDomain({ type: 'hiring', label: 'Recrutement IT — Ingénieur HSE' }, cyber)).toBeNull()
  })

  it('ESN industrie : la même offre remonte, sous le domaine déclaré', () => {
    expect(hiringDomain({ type: 'hiring', label: 'Recrutement — Ingénieur HSE' }, industrie)).toBe('HSE')
  })

  it('profil vide ou signal non recrutement : aucun domaine, jamais deviné', () => {
    expect(
      hiringDomain({ type: 'hiring', label: 'Recrutement IT — Développeur' }, { placedRoles: [], noGoSectors: [] }),
    ).toBeNull()
    expect(hiringDomain({ type: 'legal', label: 'HSE' }, industrie)).toBeNull()
  })

  it('l’étiquette « Recrutement IT » cède la place au domaine déclaré', () => {
    expect(hiringDomainLabel('Recrutement IT — Pentest applicatif', 'pentest')).toBe(
      'Recrutement pentest — Pentest applicatif',
    )
    expect(hiringDomainLabel('Recrutement — Ingénieur HSE', 'HSE')).toBe('Recrutement HSE — Ingénieur HSE')
  })

  it('#3901.w (recette 10/10) — « Poste ouvert » / « Offre publiée » nomment le métier placé, l’intitulé vient après', () => {
    expect(hiringDomainLabel('Poste ouvert — ingénieur plateforme data', 'Data')).toBe(
      'Recrutement Data — ingénieur plateforme data',
    )
    expect(hiringDomainLabel('Offre publiée : Data engineer', 'Data')).toBe('Recrutement Data : Data engineer')
  })

  it('un libellé qui ne commence pas par « Recrutement » reste intact', () => {
    expect(hiringDomainLabel('Recrute 3 développeurs', 'développeur')).toBe('Recrute 3 développeurs')
  })
})

describe('signalRelevance — #3923', () => {
  it('« non évaluable » quand le profil ne déclare rien à comparer', () => {
    const verdict = signalRelevance(
      { type: 'hiring', label: 'Recrute un professeur de mathématiques' },
      { placedRoles: [], noGoSectors: [] },
    )
    expect(verdict.status).toBe('non_evaluable')
    expect(verdict.reasonFr).toContain('aucun métier')
  })

  it('un recrutement qui ne recoupe AUCUN métier placé est hors métier, raison nommée', () => {
    const verdict = signalRelevance(
      { type: 'hiring', label: 'Recrute un professeur de mathématiques' },
      { placedRoles: ['développeur', 'devops', 'data engineer'], noGoSectors: [] },
    )
    expect(verdict.status).toBe('hors_metier')
    expect(verdict.reasonFr).toContain('développeur')
  })

  it('un recrutement qui recoupe un métier placé est pertinent, le métier nommé', () => {
    const verdict = signalRelevance(
      { type: 'hiring', label: 'Recrute 3 développeurs Python' },
      { placedRoles: ['développeur', 'devops'], noGoSectors: [] },
    )
    expect(verdict.status).toBe('pertinent')
    expect(verdict.reasonFr).toContain('développeur')
  })

  it('la comparaison est insensible à la casse et aux accents', () => {
    const verdict = signalRelevance(
      { type: 'hiring', label: 'Recherche un DÉVELOPPEUR senior' },
      { placedRoles: ['developpeur'], noGoSectors: [] },
    )
    expect(verdict.status).toBe('pertinent')
  })

  it('un recrutement reste « non évaluable » si aucun métier placé n’est déclaré, même avec des no-go sectors', () => {
    const verdict = signalRelevance(
      { type: 'hiring', label: 'Recrute un professeur' },
      { placedRoles: [], noGoSectors: ['éducation'] },
    )
    expect(verdict.status).toBe('non_evaluable')
  })

  it('un appel d’offres qui recoupe un secteur explicitement NO-GO est hors métier, le secteur nommé', () => {
    const verdict = signalRelevance(
      { type: 'tender', label: 'Marché public de gestion des cantines scolaires' },
      { placedRoles: ['développeur'], noGoSectors: ['cantines scolaires'] },
    )
    expect(verdict.status).toBe('hors_metier')
    expect(verdict.reasonFr).toContain('cantines scolaires')
  })

  it('un appel d’offres qui ne recoupe aucun no-go reste « non évaluable » — l’absence de preuve n’est jamais négative', () => {
    const verdict = signalRelevance(
      { type: 'tender', label: 'Marché public de refonte du système d’information' },
      { placedRoles: ['développeur'], noGoSectors: ['cantines scolaires'] },
    )
    expect(verdict.status).toBe('non_evaluable')
    expect(verdict.reasonEn).toBeTruthy()
  })

  it('un type sans règle dédiée (legal/tech/business) suit la même logique no-go que tender/award', () => {
    const verdict = signalRelevance(
      { type: 'legal', label: 'Annonce légale — gestion de parkings' },
      { placedRoles: [], noGoSectors: ['gestion de parkings'] },
    )
    expect(verdict.status).toBe('hors_metier')
  })
})

// #1124.1 — décision Louis 14/10/2026 : `recruitsForClients` GAGNE sur la note du 09/10 (#3901.w).
describe('signalRelevance — le placement en CDI (#1124.1)', () => {
  const placeur = { placedRoles: ['cybersécurité'], noGoSectors: [], recruitsForClients: true }

  it('un profil qui recrute POUR ses clients : une offre hors métier placé reste pertinente', () => {
    const hse = { type: 'hiring' as const, label: 'Recrutement — Ingénieur HSE' }
    expect(signalRelevance(hse, placeur).status).toBe('pertinent')
    expect(signalRelevance(hse, { ...placeur, placedRoles: [] }).status).toBe('pertinent')
  })

  it('sans placement (absent ou false) : le verdict d’avant, à l’octet', () => {
    const hse = { type: 'hiring' as const, label: 'Recrutement — Ingénieur HSE' }
    expect(signalRelevance(hse, { ...placeur, recruitsForClients: false }).status).toBe('hors_metier')
    expect(signalRelevance(hse, { placedRoles: ['cybersécurité'], noGoSectors: [] }).status).toBe('hors_metier')
  })
})
