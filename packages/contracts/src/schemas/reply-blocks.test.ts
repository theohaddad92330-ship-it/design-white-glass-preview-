import { describe, expect, it } from 'vitest'
import fixtures from './reply-blocks.fixtures.json' with { type: 'json' }
import {
  REPLY_BLOCK_FENCE,
  REPLY_BLOCK_TYPES,
  mentionsProbability,
  replyBlockLeaves,
  replyBlockSchema,
  splitReplyBlocks,
} from './reply-blocks.js'

/**
 * #1914 — LES FORMES D'UNE RÉPONSE DE LAURA.
 *
 * Le jeu `reply-blocks.fixtures.json` est lu À L'IDENTIQUE par le miroir
 * pydantic (`apps/ia/tests/test_reply_blocks.py`). Ce qui est tenu ici :
 *
 *  1. chaque type déclaré traverse le contrat SANS PERTE — une clé que le
 *     schéma avalerait en silence ferait tomber l'égalité (le défaut « pydantic
 *     ignore les clés inconnues » vaut pour zod aussi, dans l'autre sens) ;
 *  2. ce qui doit disparaître disparaît (un score, une probabilité) ;
 *  3. ce qui ne doit jamais devenir une carte est refusé ;
 *  4. le découpage du texte en segments est le même des deux côtés.
 */

describe('#1914.1 — le contrat des blocs de réponse', () => {
  it('le jeu partagé couvre EXACTEMENT les types déclarés — sinon la garde garde du vide', () => {
    expect(Object.keys(fixtures.valid).sort()).toEqual([...REPLY_BLOCK_TYPES].sort())
    // #3392 / #3428 — `account_volume_sprint` ; #213.2 (#3228) — `count_contract` ; #3758.2 / #3762 — `account_map` ;
    // #3758 (reste) — `post_meeting_summary` ; #2985 (lot E07 08/10) — `manager_review` : dix-huit.
    expect(REPLY_BLOCK_TYPES).toHaveLength(18)
  })

  it.each(Object.entries(fixtures.valid))('« %s » traverse le contrat sans rien perdre', (type, block) => {
    const parsed = replyBlockSchema.safeParse(block)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    expect(parsed.data).toEqual(block)
    expect(parsed.data?.type).toBe(type)
  })

  it.each(fixtures.stripped.map(entry => [entry.why, entry] as const))('%s', (_why, entry) => {
    const parsed = replyBlockSchema.safeParse(entry.input)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(entry.output)
  })

  it.each(fixtures.invalid.map(entry => [entry.why, entry.block] as const))('refusé : %s', (_why, block) => {
    expect(replyBlockSchema.safeParse(block).success).toBe(false)
  })

  it('aucune probabilité ne passe — et un mot voisin n’est pas attrapé', () => {
    expect(fixtures.probability.length).toBeGreaterThan(3)
    for (const sample of fixtures.probability) expect(mentionsProbability(sample), sample).toBe(true)
    for (const sample of fixtures.neutral) expect(mentionsProbability(sample), sample).toBe(false)
  })

  it('la clôture du bloc s’appelle `bellum-block`, le nom que le prompt et le parseur IA écrivent', () => {
    expect(REPLY_BLOCK_FENCE).toBe('bellum-block')
  })
})

describe('#1914.2 — le découpage d’une réponse en segments', () => {
  it.each(fixtures.replies.map(entry => [entry.why, entry] as const))('%s', (_why, entry) => {
    expect(splitReplyBlocks(entry.text).map(segment => segment.kind)).toEqual(entry.kinds)
  })

  it('un segment de bloc porte le bloc VALIDÉ, pas le texte brut', () => {
    const [, block] = splitReplyBlocks(fixtures.replies[1]!.text)
    expect(block).toEqual({
      kind: 'block',
      block: { type: 'verdict', conclusion: 'Oui.', reasons: ['Parce que.'] },
    })
  })

  it('une clôture en cours d’écriture (« ```bell ») n’affiche jamais sa syntaxe', () => {
    expect(splitReplyBlocks('Je prépare.\n```bell').map(segment => segment.kind)).toEqual(['text', 'unterminated'])
    // …mais un texte qui parle d'accents graves reste du texte.
    expect(splitReplyBlocks('Un ``` isolé au milieu d’une phrase.').map(segment => segment.kind)).toEqual(['text'])
  })

  it('un bloc invalide garde ce qu’il a pu lire, pour un repli en texte', () => {
    const [, invalid] = splitReplyBlocks(fixtures.replies[3]!.text)
    expect(invalid).toMatchObject({ kind: 'invalid', value: { type: 'dashboard' } })
  })
})

describe('#1914.9 — le repli texte d’un bloc illisible', () => {
  it('rend les textes du bloc dans leur ordre, sans le type ni les liens', () => {
    const leaves = replyBlockLeaves(fixtures.valid.comparison)
    expect(leaves).toContain('Taille au registre')
    expect(leaves).toContain('Deux ESN identifiées')
    expect(leaves).not.toContain('comparison')
    expect(replyBlockLeaves(fixtures.valid.verdict)).not.toContain('/accounts/alpha-1')
    expect(replyBlockLeaves(null)).toEqual([])
  })
})
