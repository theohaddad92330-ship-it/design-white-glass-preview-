import { describe, expect, it } from 'vitest'
import { demoTurn } from '@/features/chat/api/demo-turn'

interface RankingItem {
  name: string
  why?: string[]
  limits?: string[]
}
interface RankingBlock {
  type: string
  items: RankingItem[]
  not_evaluated?: string[]
}

function rankingOf(question: string): RankingBlock | null {
  const reply = demoTurn(question, 'REPLI').reply
  for (const match of reply.matchAll(/```bellum-block\n(.+?)\n```/gs)) {
    const block = JSON.parse(match[1] ?? '{}') as RankingBlock
    if (block.type === 'account_ranking') return block
  }
  return null
}

/**
 * V4-CORRECTIFS-B 4289.4 / 4289.5 (#3247.3, #3247.4) — « par quelle entité attaquer <compte> ? » en salle de
 * démonstration montre ce que la production montre : « preuve dans ce secteur » PAR candidat, les partenaires
 * écartés NOMMÉS, et la voie d'accès de chaque candidat (« voie directe » ou « voie partenaire X »).
 */
describe('Société Générale — carte de classement des entités', () => {
  const question = 'Par quelle entité attaquer Société Générale ?'
  const entities = ['Treezor', 'Boursorama / BoursoBank']
  const block = rankingOf(question)

  it('répond par une vraie réponse préparée, jamais le repli', () => {
    expect(demoTurn(question, 'REPLI').reply).not.toBe('REPLI')
    expect(block).not.toBeNull()
  })

  it('nomme des entités du jeu démo, chacune avec « preuve dans ce secteur » et sa voie d’accès', () => {
    const items = block?.items ?? []
    expect(items.map(item => item.name)).toEqual(expect.arrayContaining(entities))
    for (const item of items) {
      expect((item.limits ?? []).join(' ')).toMatch(/preuve dans ce secteur/)
      expect((item.why ?? []).join(' ')).toMatch(/voie directe|voie partenaire \S/)
    }
  })

  it('nomme les partenaires écartés en toutes lettres', () => {
    expect((block?.not_evaluated ?? []).join(' ')).toMatch(
      /Écartés — partenaires déclarés de l'espace, pas des cibles : \w/,
    )
  })

  it('sait dire NON : aucun fournisseur de données nommé, aucune probabilité', () => {
    const text = JSON.stringify(block)
    expect(text).not.toMatch(/dataforge|orion|pappers|apollo|brave|firecrawl|%|probab/i)
  })
})

describe('SNCF — le conseil garde ses quatre sections et porte les trois mesures par entité', () => {
  const reply = demoTurn('Faut-il attaquer SNCF par le groupe ou par une entité ?', 'REPLI').reply

  it('preuve dans ce secteur, voie d’accès par entité, partenaires écartés nommés', () => {
    for (const section of ['**Verdict :**', '**Pourquoi :**', '**Ce qui manque :**', '**Prochaine action :**']) {
      expect(reply).toContain(section)
    }
    expect(reply.match(/preuve dans ce secteur/g)).toHaveLength(2)
    expect(reply).toMatch(/SNCF Voyageurs — voie directe/)
    expect(reply).toMatch(/SNCF Réseau — voie directe/)
    expect(reply).toMatch(/partenaires déclarés de l’espace, pas des cibles : Sopra Steria, CGI/)
  })

  it('sait dire NON : aucun fournisseur de données nommé, aucune probabilité', () => {
    expect(reply).not.toMatch(/dataforge|orion|pappers|apollo|brave|firecrawl|probab/i)
  })
})

describe('4289.4 — la voie partenaire cite un partenaire réellement déclaré dans la salle', () => {
  it('Société Générale : au moins une voie partenaire, nommée parmi les partenaires du jeu démo', () => {
    const why = (rankingOf('Par quelle entité attaquer Société Générale ?')?.items ?? []).flatMap(
      item => item.why ?? [],
    )
    expect(why.join(' ')).toMatch(/voie partenaire (Devoteam|mc2i)/)
  })
})
