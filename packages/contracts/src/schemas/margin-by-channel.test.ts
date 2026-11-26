import { describe, expect, it } from 'vitest'
import { intermediationCost, marginByChannel, type MissionChannel } from './staffing.js'

/**
 * « L'indicateur le plus stratégique » du PDF 8 §5.3 : l'écart entre le direct
 * et le passage par un intermédiaire est ce qui justifie ou non un chantier de
 * référencement. Un chiffre qui déclenche un chantier d'un an doit être juste ou
 * absent — jamais approximatif.
 */
const row = (channel: MissionChannel, rate: number | null, cost: number | null, days: number | null) => ({
  channel,
  dailyRateCents: rate,
  loadedDailyCostCents: cost,
  days,
})

describe('marginByChannel', () => {
  it('pondère par les JOURS, pas par mission', () => {
    // Une mission d'un jour ne pèse pas comme une mission d'un an. Une moyenne
    // de pourcentages donnerait exactement le contraire.
    const result = marginByChannel([
      row('direct', 100_000, 50_000, 100), // 50 % sur 100 jours
      row('direct', 100_000, 90_000, 1), // 10 % sur 1 jour
    ])
    const direct = result.find(entry => entry.channel === 'direct')
    // Pondérée : ~49,6 %. Une moyenne simple aurait donné 30 %.
    expect(direct?.marginPercent).toBeGreaterThan(45)
  })

  it('une mission non chiffrable sort du calcul ET est COMPTÉE', () => {
    const result = marginByChannel([row('partner', 100_000, 60_000, 10), row('partner', null, null, 10)])
    const partner = result.find(entry => entry.channel === 'partner')
    expect(partner?.missions).toBe(1)
    expect(partner?.unmeasured).toBe(1)
    expect(partner?.marginPercent).toBe(40)
  })

  it('un canal sans mission mesurable vaut null, jamais 0', () => {
    // « 0 % de marge en rang 2 » se lirait comme un désastre plutôt que comme
    // une absence de données — et on lancerait un chantier là-dessus.
    const result = marginByChannel([row('direct', 100_000, 50_000, 10)])
    expect(result.find(entry => entry.channel === 'partner')?.marginPercent).toBeNull()
  })

  it('les missions sans canal renseigné restent DANS leur propre ligne', () => {
    // Les verser dans « direct » parce que c'est le cas le plus fréquent
    // fausserait précisément la comparaison qu'on cherche à faire.
    const result = marginByChannel([row('unknown', 100_000, 20_000, 10)])
    expect(result.find(entry => entry.channel === 'direct')?.marginPercent).toBeNull()
    expect(result.find(entry => entry.channel === 'unknown')?.marginPercent).toBe(80)
  })

  it('rend toujours les CINQ canaux, dans le même ordre', () => {
    // ⚠️ `portage` est en FIN, APRÈS `unknown`, et ce n'est pas une coquille :
    // une taxonomie gelée s'allonge par la fin (GA-08), même quand la valeur
    // ajoutée se lirait mieux ailleurs. L'ordre d'affichage appartient à
    // l'écran, pas à l'énumération.
    const result = marginByChannel([])
    expect(result.map(entry => entry.channel)).toEqual(['direct', 'partner', 'subcontracting', 'unknown', 'portage'])
  })

  it('le PORTAGE a sa propre ligne — il ne tombe plus dans « canal non renseigné »', () => {
    // C'était le défaut : la contrainte n'admettant pas `portage`, ces missions
    // étaient rangées en `unknown`, c'est-à-dire dans le seau des ABSENCES. Un
    // chemin commercial parfaitement connu se lisait comme une fiche mal
    // remplie, et « la marge par canal » — l'indicateur sur lequel on lance ou
    // non un chantier de référencement — comptait ces missions comme muettes.
    const result = marginByChannel([row('portage', 100_000, 70_000, 10)])
    expect(result.find(entry => entry.channel === 'portage')?.marginPercent).toBe(30)
    expect(result.find(entry => entry.channel === 'unknown')?.marginPercent).toBeNull()
    expect(result.find(entry => entry.channel === 'unknown')?.missions).toBe(0)
  })

  it('un portage non chiffrable vaut null et est COMPTÉ, jamais 0', () => {
    const result = marginByChannel([row('portage', null, null, 10)])
    const portage = result.find(entry => entry.channel === 'portage')
    expect(portage?.marginPercent).toBeNull()
    expect(portage?.unmeasured).toBe(1)
    expect(portage?.missions).toBe(0)
  })
})

describe('intermediationCost', () => {
  it('chiffre l’écart quand les DEUX termes existent', () => {
    const result = marginByChannel([row('direct', 100_000, 60_000, 10), row('partner', 100_000, 72_000, 10)])
    expect(intermediationCost(result)).toBe(12)
  })

  it('rend null dès qu’un des deux manque', () => {
    // Annoncer « 12 points de coût d'intermédiation » en comparant une valeur
    // réelle à une valeur absente est exactement le genre de chiffre sur lequel
    // on lance un chantier d'un an.
    const result = marginByChannel([row('direct', 100_000, 60_000, 10)])
    expect(intermediationCost(result)).toBeNull()
  })

  it('l’écart reste DIRECT contre PARTENAIRE — le portage ne s’y verse pas', () => {
    // La tuile nomme UNE comparaison : « ce que coûte le passage par un
    // partenaire référencé ». Y mélanger le portage — dont la structure de coût
    // est autre — ferait bouger un chiffre sans que personne sache pourquoi, et
    // c'est le chiffre qui déclenche un chantier d'un an.
    const result = marginByChannel([
      row('direct', 100_000, 60_000, 10),
      row('partner', 100_000, 72_000, 10),
      row('portage', 100_000, 90_000, 10),
    ])
    expect(intermediationCost(result)).toBe(12)
  })
})
