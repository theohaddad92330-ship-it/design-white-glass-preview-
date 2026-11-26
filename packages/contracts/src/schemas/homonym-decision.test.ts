import { describe, expect, it } from 'vitest'
import {
  accountDomainsFrom,
  hasPendingHomonyms,
  HOMONYM_FACT_REASON,
  homonymFactLens,
  isCertainHomonymHost,
  selectHomonymsToArchive,
  withoutHomonymSignals,
} from './homonym-decision.js'

// LUDOVIC-D LC.2 — la fiche STILL (manutention, still.fr / still.de) en recette 19/10.
describe('LC.2 — homonymFactLens : actus et angles de STILL', () => {
  const still = accountDomainsFrom('https://www.still.fr', ['still.de'])
  const farm = { text: 'Still Waters Farm opens a new barn', url: 'https://stillwatersfarm.com/news' }
  const whiskey = { text: 'Still Austin Whiskey Co. wins award', url: 'https://www.stillaustin.com/press' }
  const okla = { text: 'Stillwater, OK : la ville vote un budget', url: 'https://www.newson6.com/a' }

  it('écarte la source du site propre d’une autre entité qui commence comme le compte', () => {
    const lens = homonymFactLens(still)
    expect(lens.reasonFor(farm)).toBe(HOMONYM_FACT_REASON)
    expect(lens.reasonFor(whiskey)).toBe(HOMONYM_FACT_REASON)
  })

  it('écarte un texte qui nomme « Stillwater » sans jamais nommer STILL', () => {
    expect(homonymFactLens(still).reasonFor(okla)).toBe(HOMONYM_FACT_REASON)
  })

  it('un ANGLE sans URL qui cite l’entité apprise d’un fait prouvé est écarté', () => {
    const lens = homonymFactLens(still, [farm, whiskey])
    expect(lens.reasonFor({ text: 'Proposer un audit logistique à Still Waters Farm' })).toBe(HOMONYM_FACT_REASON)
    expect(lens.reasonFor({ text: 'Approcher Still Austin pour la distillerie' })).toBe(HOMONYM_FACT_REASON)
  })

  it('SAIT DIRE NON : les faits de STILL, la presse, une absence', () => {
    const lens = homonymFactLens(still, [farm, whiskey])
    expect(
      lens.reasonFor({
        text: 'STILL recrute 40 techniciens de maintenance à Lyon',
        url: 'https://www.usine-digitale.fr/x',
      }),
    ).toBeNull()
    expect(lens.reasonFor({ text: 'Nouveau chariot RX 20', url: 'https://www.still.de/news' })).toBeNull()
    expect(lens.reasonFor({ text: 'Le site still.fr annonce Stillwater comme client', url: null })).toBeNull()
    expect(lens.reasonFor({ text: 'Angle : méthodes industrielles sur le site de Châtres' })).toBeNull()
    expect(homonymFactLens([]).reasonFor(farm)).toBeNull()
  })

  it('isCertainHomonymHost : la règle LC.1 des contacts, inchangée', () => {
    expect(isCertainHomonymHost('a@stillfront.com', still)).toBe(true)
    expect(isCertainHomonymHost('a@still.co.nz', still)).toBe(false)
    expect(isCertainHomonymHost('a@still.fr', still)).toBe(false)
  })
})

describe('LC.2 — withoutHomonymSignals (lecture de l’existant)', () => {
  const sig = (id: string, label: string, source_url: string | null) => ({ id, label, source_url })
  it('masque les signaux d’homonymes déjà stockés, garde ceux du compte et ceux déclarés par un humain', () => {
    const kept = withoutHomonymSignals(
      [
        sig('s1', 'Still Waters Farm opens a barn', 'https://stillwatersfarm.com/n'),
        sig('s2', 'Stillwater OK vote un budget', null),
        sig('s3', 'STILL recrute des techniciens méthodes', 'https://www.usine-digitale.fr/x'),
        sig('declared-9', 'Stillwater : salon déclaré par Ludovic', null),
      ],
      'https://www.still.fr',
    )
    expect(kept.map(s => s.id)).toEqual(['s3', 'declared-9'])
  })
  it('SAIT DIRE NON : sans site connu, rien n’est masqué', () => {
    expect(withoutHomonymSignals([sig('s1', 'Stillwater OK', null)], null)).toHaveLength(1)
  })
})

// LUDOVIC-E LC.1b — la date seule ne suffit pas : une collecte partielle postérieure à la capacité
// (« Agrandir la recherche ») la rafraîchit en laissant stillfront.com au dossier.
describe('LC.1b — selectHomonymsToArchive / hasPendingHomonyms', () => {
  const domains = accountDomainsFrom('https://www.still.fr')
  const rows = [
    { id: 'a', email: 'x@stillfront.com', source: 'apollo', identity_confirmed_at: null, excluded_at: null },
    { id: 'b', email: 'y@still.fr', source: 'apollo', identity_confirmed_at: null, excluded_at: null },
    { id: 'c', email: 'z@stillfront.com', source: 'manual', identity_confirmed_at: null, excluded_at: null },
  ]
  it('archive le seul homonyme certain, jamais une source humaine', () => {
    expect(selectHomonymsToArchive(rows, domains)).toEqual(['a'])
    expect(hasPendingHomonyms(rows, domains)).toBe(true)
  })
  it('dit NON sans homonyme ou sans domaine de compte', () => {
    expect(hasPendingHomonyms([rows[1]!, rows[2]!], domains)).toBe(false)
    expect(hasPendingHomonyms(rows, [])).toBe(false)
  })
})
