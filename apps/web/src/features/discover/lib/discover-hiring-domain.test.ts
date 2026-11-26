import { describe, expect, it } from 'vitest'
import {
  hiringDisplayLabel,
  hiringScopeNotice,
  hiringSignalLabel,
  isOffDomainHiringSignal,
  rankByHiringDomain,
  rankOffDomainHiringLast,
} from './discover-hiring-domain'
import type { DiscoverSignal } from './discover-types'

const hiring = (label: string): DiscoverSignal => ({ type: 'hiring', date: '2026-10-01', label })
const account = (name: string, ...signals: DiscoverSignal[]) => ({ name, signals })

const cyber = { placedRoles: ['cybersécurité'], noGoSectors: [] }
const industrie = { placedRoles: ['HSE'], noGoSectors: [] }
const vide = { placedRoles: [], noGoSectors: [] }

// #3901.w — décision Louis 09/10/2026 : les recrutements remontent selon le profil DÉCLARÉ.
describe('#3901.w — rangement des recrutements par domaine déclaré', () => {
  const list = [
    account('Chantier SA', hiring('Recrutement — Ingénieur HSE')),
    account('Sécu SAS', hiring('Recrutement IT — Analyste cybersécurité')),
    account('Sans offre'),
  ]

  it('ESN cyber : l’offre HSE ne remonte pas en tête, elle reste dans la liste', () => {
    const ranked = rankByHiringDomain(list, cyber).map(item => item.name)
    expect(ranked).toEqual(['Sécu SAS', 'Sans offre', 'Chantier SA'])
  })

  it('ESN industrie : l’offre HSE remonte en tête', () => {
    expect(rankByHiringDomain(list, industrie).map(item => item.name)[0]).toBe('Chantier SA')
  })

  it('profil vide ou absent : ordre inchangé, rien n’est deviné', () => {
    expect(rankByHiringDomain(list, vide).map(item => item.name)).toEqual(list.map(item => item.name))
    expect(rankByHiringDomain(list, undefined).map(item => item.name)).toEqual(list.map(item => item.name))
  })

  it('étiquette : le domaine déclaré remplace « Recrutement IT », sinon libellé intact', () => {
    expect(hiringSignalLabel(hiring('Recrutement IT — Analyste cybersécurité'), cyber)).toBe(
      'Recrutement cybersécurité — Analyste cybersécurité',
    )
    expect(hiringSignalLabel(hiring('Recrutement — Ingénieur HSE'), cyber)).toBe('Recrutement — Ingénieur HSE')
    expect(hiringSignalLabel(hiring('Recrutement IT — Dev'), undefined)).toBe('Recrutement IT — Dev')
  })

  it('#3901.p — bandeau : seulement quand des offres sont retirées faute de métiers (jamais d’affirmation sur un secteur)', () => {
    expect(hiringScopeNotice(vide, 3)).toEqual({ kind: 'noRoles' })
    expect(hiringScopeNotice(vide, 0)).toBeNull()
    expect(hiringScopeNotice(cyber, 3)).toBeNull() // des métiers existent : les offres hors métier sortent, sans ligne
    expect(hiringScopeNotice(undefined, 3)).toBeNull()
  })
})

// #3901.w (recette prod 10/10, lot Q07)
describe('#3901.w — le métier placé prime sur le tri secondaire et nomme l’étiquette', () => {
  const data = { placedRoles: ['Data'], noGoSectors: [] }

  it('le rang par domaine prime sur le tri « Taille » : le compte qui recrute le plus dans le métier placé passe devant', () => {
    // Déjà triée par effectif décroissant (Verdal d’abord) : un seul recrutement data contre deux.
    const bySize = [
      account('Verdal', hiring('Développeur Java confirmé'), hiring('Data engineer confirmé')),
      account('Sans offre'),
      account('Datalys', hiring('Consultants data'), hiring('Data engineer senior')),
    ]
    expect(rankByHiringDomain(bySize, data).map(item => item.name)).toEqual(['Datalys', 'Verdal', 'Sans offre'])
  })

  it('l’étiquette d’un intitulé nu nomme le métier placé, l’intitulé vient après', () => {
    expect(hiringSignalLabel(hiring('Data engineer confirmé'), data)).toBe('Recrutement Data — Data engineer confirmé')
    expect(hiringSignalLabel(hiring('Data engineer confirmé'), undefined)).toBe('Data engineer confirmé')
    expect(hiringSignalLabel(hiring('Ingénieur HSE'), data)).toBe('Ingénieur HSE')
  })

  it('/mes-cibles : « Poste ouvert » / « Offre publiée » deviennent « Recrutement <métier> »', () => {
    expect(hiringDisplayLabel({ type: 'Poste ouvert', label: 'Poste ouvert — ingénieur plateforme data' }, data)).toBe(
      'Recrutement Data — ingénieur plateforme data',
    )
    expect(hiringDisplayLabel({ type: 'Signal', label: 'Offre publiée : Data engineer' }, data)).toBe(
      'Recrutement Data : Data engineer',
    )
  })
})

// #1124.1 — décision Louis 14/10/2026 : un profil qui place des CDI chez ses clients ne voit AUCUNE offre « hors domaine ».
describe('#1124.1 — recruitsForClients gagne sur le rang par domaine', () => {
  const placeur = { placedRoles: ['cybersécurité'], noGoSectors: [], recruitsForClients: true }
  const list = [
    account('Sécu SAS', hiring('Recrutement IT — Analyste cybersécurité')),
    account('Chantier SA', hiring('Recrutement — Ingénieur HSE')),
  ]

  it('aucune offre n’est rangée en fin ni signalée hors domaine', () => {
    expect(rankByHiringDomain(list, placeur).map(item => item.name)).toEqual(['Sécu SAS', 'Chantier SA'])
    expect(rankByHiringDomain([list[1]!, list[0]!], placeur).map(item => item.name)).toEqual([
      'Chantier SA',
      'Sécu SAS',
    ])
    expect(hiringScopeNotice(placeur, 1)).toBeNull()
    expect(isOffDomainHiringSignal({ type: 'hiring', label: 'Recrutement — Ingénieur HSE' }, placeur)).toBe(false)
    expect(
      rankOffDomainHiringLast([list[1]!, list[0]!], placeur, item => ({
        type: 'hiring',
        label: item.signals[0]!.label,
      })).map(item => item.name),
    ).toEqual(['Chantier SA', 'Sécu SAS'])
  })
})
