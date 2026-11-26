import { describe, expect, it } from 'vitest'
import {
  REPLY_TRANSFORM_IDS,
  replyLayoutOf,
  replyReservesOf,
  replyTransformRequestFor,
  replyTransformRequestSchema,
  replyTransformsFor,
} from './reply-transform.js'

const ID_A = '0b6f3d5e-1c1a-4a53-9a40-2f1f0e0c1a11'
const ID_B = '7d8c5b1e-92aa-4c3f-8f0e-5a6a3b9c2d22'

const LIST_REPLY = [
  'Voici les comptes à traiter :',
  '',
  `1. [Alpha](/accounts/${ID_A}) — contrat en fin de cycle`,
  `2. [Beta](/accounts/${ID_B}) — nouveau DSI`,
  '',
  'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.',
].join('\n')

describe('replyLayoutOf', () => {
  it('reconnaît un tableau, une liste numérotée, un plan et de la prose', () => {
    expect(replyLayoutOf('| a | b |\n| - | - |\n| 1 | 2 |')).toBe('table')
    expect(replyLayoutOf(LIST_REPLY)).toBe('list')
    expect(replyLayoutOf('## Plan d’action\n\n- Appeler\n- Relancer')).toBe('plan')
    expect(replyLayoutOf('Une phrase. Une autre phrase.')).toBe('prose')
  })
})

describe('replyReservesOf', () => {
  it('relève les réserves déjà posées, mot pour mot, sans en inventer', () => {
    expect(replyReservesOf(LIST_REPLY)).toEqual([
      'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.',
    ])
    expect(replyReservesOf('Tout est clair.')).toEqual([])
  })
})

describe('replyTransformsFor', () => {
  it('ne propose « Voir plus de comptes » que si la réponse cite des comptes', () => {
    expect(replyTransformsFor(LIST_REPLY)).toContain('more_accounts')
    expect(replyTransformsFor('Une réponse courte sans compte.')).not.toContain('more_accounts')
  })

  it('ne propose pas de se reformater dans la forme où la réponse est déjà', () => {
    expect(replyTransformsFor(LIST_REPLY)).not.toContain('exportable_list')
    expect(replyTransformsFor('Une phrase. Une autre phrase.')).toContain('exportable_list')
  })

  // #3768 (recette prod 07/10, lot L1) — « Par où je commence dans mon portefeuille ? » : la réponse est une
  // CARTE de classement (JSON sur une ligne, sans puce ni lien de fiche) ; le menu ne proposait ni « priorités »
  // ni « plus de comptes ». Les objets d'une carte comptent comme ceux d'une liste.
  it('une réponse de priorisation en carte propose « Voir seulement les priorités » et « Voir plus de comptes »', () => {
    const card = {
      type: 'account_ranking',
      title: 'Par où commencer',
      axes: ['Signal daté'],
      items: [
        { name: 'SNCF', level: 'priority', why: ['Six entités.'] },
        { name: 'Société Générale', why: ['Plan 2029.'] },
        { name: 'ENGIE', level: 'to_watch', why: ['Externes.'] },
      ],
    }
    const reply = `Je commencerais par SNCF.\n\n\`\`\`bellum-block\n${JSON.stringify(card)}\n\`\`\``
    const ids = replyTransformsFor(reply)
    expect(ids).toContain('priorities_only')
    expect(ids).toContain('more_accounts')
  })

  it('SAIT DIRE NON — une carte de contacts ne propose pas « plus de comptes », une carte d’un seul objet pas « priorités »', () => {
    const contacts = { type: 'contact_list', items: [{ name: 'Jeanne' }, { name: 'Paul' }] }
    const single = { type: 'account_ranking', axes: ['Signal'], items: [{ name: 'Alpha', why: ['Raison.'] }] }
    const fenced = (block: unknown) => `\`\`\`bellum-block\n${JSON.stringify(block)}\n\`\`\``
    expect(replyTransformsFor(fenced(contacts))).not.toContain('more_accounts')
    expect(replyTransformsFor(fenced(contacts))).toContain('priorities_only')
    expect(replyTransformsFor(fenced(single))).not.toContain('priorities_only')
  })

  it('garde l’ordre de l’issue', () => {
    const all = replyTransformsFor(`${LIST_REPLY}\n${'mot '.repeat(120)}`)
    expect(all).toEqual(REPLY_TRANSFORM_IDS.filter(id => all.includes(id)))
  })
})

describe('replyTransformRequestFor', () => {
  it('emporte la réponse source, sa forme, ses comptes et ses réserves', () => {
    const request = replyTransformRequestFor('justify', LIST_REPLY)
    expect(request).toMatchObject({
      id: 'justify',
      layout: 'list',
      accountIds: [ID_A, ID_B],
      reserves: ['La cartographie est partielle : seuls les comptes déjà analysés sont couverts.'],
    })
    expect(replyTransformRequestSchema.safeParse(request).success).toBe(true)
  })

  it('refuse une transformation inconnue ou une source vide', () => {
    expect(replyTransformRequestSchema.safeParse({ id: 'inconnue', sourceText: 'x', layout: 'prose' }).success).toBe(
      false,
    )
    expect(replyTransformRequestSchema.safeParse({ id: 'deepen', sourceText: '', layout: 'prose' }).success).toBe(false)
  })

  it('borne la source : le texte finit dans un prompt', () => {
    const request = replyTransformRequestFor('synthesize', 'a'.repeat(50_000))
    expect(request.sourceText.length).toBeLessThanOrEqual(12_000)
  })
})

describe('RV4-E-FIX 4287.4 — une carte d’état vide n’a rien à retravailler', () => {
  const EMPTY_CARD = [
    '```bellum-block',
    JSON.stringify({
      type: 'missing_data',
      title: 'Aucun objet rendu',
      missing: [{ what: 'Aucun compte ne reste vérifiable après les deux filtres', how: 'Élargis les critères.' }],
      still_possible: ['Élargir à la région voisine'],
    }),
    '```',
  ].join('\n')

  it('ne propose aucun geste « Retravailler » sur une réponse qui n’est qu’un état vide', () => {
    expect(replyTransformsFor(EMPTY_CARD)).toEqual([])
  })

  it('garde les gestes d’une réponse ordinaire', () => {
    expect(replyTransformsFor(LIST_REPLY).length).toBeGreaterThan(0)
  })
})
