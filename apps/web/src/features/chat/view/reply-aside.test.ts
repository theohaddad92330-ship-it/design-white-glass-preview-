import { describe, expect, it } from 'vitest'
import { extractReplyAside } from './reply-aside'

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')
const ranking = (count: number, sourced: number) => ({
  type: 'account_ranking',
  title: 'Par où commencer',
  axes: ['Signal daté'],
  items: Array.from({ length: count }, (_, index) => ({
    name: `Compte ${index + 1}`,
    why: ['Raison écrite.'],
    ...(index < sourced ? { source: { label: 'Registre', as_of: '2026-09' } } : {}),
  })),
})

// #5044 — ce que le corps ne montre plus part dans le panneau Sources : la fonction qui le dit est pure.
describe('extractReplyAside (#5044)', () => {
  const REPLY = [
    '## Verdict',
    'Commence par Alpha.',
    '',
    '## Pourquoi',
    'Un appel d’offres est ouvert.',
    '',
    'Preuve détaillée : deux sources concordent.',
    '',
    '## Ce qui manque',
    'Le budget n’est pas confirmé.',
    '',
    '## Prochaine action',
    'Appeler le DSI.',
    '',
    '## Sources',
    'Annonce publique du 12/09.',
    '',
    '## Limites de cette analyse',
    'Périmètre : département 34 uniquement.',
    '',
    '## Cartographie Montpellier',
    'Neuf comptes retenus.',
  ].join('\n')

  it('sort Sources, Limites et la suite du Pourquoi, avec leur nature', () => {
    expect(extractReplyAside(REPLY).sections).toEqual([
      { kind: 'why', title: 'Pourquoi', body: 'Preuve détaillée : deux sources concordent.' },
      { kind: 'sources', title: 'Sources', body: 'Annonce publique du 12/09.' },
      { kind: 'limits', title: 'Limites de cette analyse', body: 'Périmètre : département 34 uniquement.' },
    ])
  })

  it('ne sort JAMAIS « Ce qui manque », le verdict, la prochaine action ni un intitulé inconnu', () => {
    const titles = extractReplyAside(REPLY).sections.map(section => section.title)
    for (const kept of ['Verdict', 'Ce qui manque', 'Prochaine action', 'Cartographie Montpellier']) {
      expect(titles).not.toContain(kept)
    }
  })

  it('une section vide ne fait aucune ligne', () => {
    expect(extractReplyAside('## Verdict\nGo.\n\n## Sources\n').sections).toEqual([])
  })

  it('une réponse sans intitulé reconnu n’est pas sectionnée : rien ne sort', () => {
    expect(extractReplyAside('Texte libre.\n\n## Sources\nUne source.').sections).toEqual([])
  })

  it('les sections de chaque segment de texte entre deux cartes sont lues', () => {
    const text = [
      '## Verdict\nGo.\n\n## Limites\nPérimètre réduit.',
      fence(ranking(2, 2)),
      '## Objectif\nCibler.\n\n## Sources\nRegistre.',
    ].join('\n\n')
    expect(extractReplyAside(text).sections.map(section => section.kind)).toEqual(['limits', 'sources'])
  })

  it('la note de substance sort des cartes : « 2 lignes sur 8 » est un constat', () => {
    const aside = extractReplyAside(fence(ranking(8, 2)))
    expect(aside.substance).toHaveLength(1)
    expect(aside.substance[0]).toMatchObject({ reason: 'few_dated_sources', found: 2, total: 8 })
  })

  it('sans constat ni section : rien (le test sait dire NON)', () => {
    expect(extractReplyAside(fence(ranking(3, 3)))).toEqual({ sections: [], substance: [], notes: [] })
    expect(extractReplyAside('Bonjour.')).toEqual({ sections: [], substance: [], notes: [] })
  })
})

// #5086 — « Précision : … » et « Contrainte retenue : … » arrivent par le champ structuré `reply_notes`
// du contexte de la réponse, jamais relus dans la prose.
describe('extractReplyAside — notes de la réponse (#5086)', () => {
  it('porte les notes du contexte telles quelles, sans les chercher dans le texte', () => {
    const aside = extractReplyAside('Voici cinq comptes.', ['Contrainte retenue : volume attendu « 5 comptes ».'])
    expect(aside.notes).toEqual(['Contrainte retenue : volume attendu « 5 comptes ».'])
  })

  it('ne relit pas la prose : une ligne « Précision : » du texte n’est pas une note', () => {
    expect(extractReplyAside('Précision : dans le texte.').notes).toEqual([])
  })

  it('écarte les notes vides et garde l’ordre', () => {
    expect(extractReplyAside('Réponse.', ['Précision : a.', '  ', 'Contrainte retenue : b.']).notes).toEqual([
      'Précision : a.',
      'Contrainte retenue : b.',
    ])
  })
})
