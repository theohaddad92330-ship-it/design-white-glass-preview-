import { describe, expect, it } from 'vitest'
import { replyParityIssues, replyTransformsFor, splitReplyBlocks } from '@bellum/contracts'
import { replyPlainText } from '@/features/chat/view/reply-blocks/plain-text'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

/**
 * #3707.7 — PARITÉ CARTE ↔ TEXTE, SUR CHAQUE RÉPONSE SCRIPTÉE DE LA SALLE.
 *
 * Le lien de démonstration est ce qu'un prospect voit du produit : s'il montre une colonne
 * « non mesuré » ou une réserve répétée sur chaque ligne, il montre exactement ce que #3707
 * interdit. Les réponses sont écrites à la main ; ce test est ce qui les tient à la forme
 * (même garde que le contrat, `replyParityIssues`) — et il prouve qu'il lit quelque chose.
 */
describe('#3707.7 — les réponses scriptées de la salle suivent la forme stable', () => {
  const withCards = DEMO_CHAT_PROMPTS.filter(prompt =>
    splitReplyBlocks(prompt.answer).some(segment => segment.kind === 'block'),
  )

  it('LIT : la salle porte bien des réponses à cartes (le test n’est pas vide)', () => {
    expect(withCards.length).toBeGreaterThanOrEqual(3)
  })

  it.each(withCards.map(prompt => [prompt.id, prompt] as const))(
    '%s — la copie garde les réserves, aucune ligne vide, aucune réserve dite deux fois',
    (_id, prompt) => {
      expect(replyParityIssues(prompt.answer, replyPlainText(prompt.answer))).toEqual([])
    },
  )

  it('une réponse scriptée sans carte n’ouvre jamais par un tableau de « non mesuré »', () => {
    for (const prompt of DEMO_CHAT_PROMPTS) {
      expect(prompt.answer, prompt.id).not.toMatch(/\|\s*(Aucun|Non mesuré)\s*\|/i)
    }
  })
})

/**
 * Recette salle démo nuit 08→09/10 — #3776 : « 0 badge Preuve/Interprétation/
 * Historique sous les réponses démo ». Le champ `basis` (`sourceSchema`,
 * #3776.5) existe au contrat depuis le lot K05, mais aucun PROMPT réel ne le
 * remplit encore (voir le « reste » du lot T03) — la salle de démonstration,
 * elle, écrit ses réponses à la main et peut donc le porter dès maintenant,
 * sans attendre que le modèle le fasse en production. Ce test SAIT DIRE NON :
 * retirer `basis` d'une des sources ci-dessous le fait échouer.
 */
describe('#3865 (recette nuit 08→09/10) — « besoins compatibles avec un consultant » est démontrable', () => {
  it('p-needs-for-profile range les besoins par compartiment, jamais une liste à puces uniforme', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-needs-for-profile')
    expect(prompt, 'p-needs-for-profile doit exister dans la salle').toBeDefined()
    expect(prompt!.question).toContain('besoins compatibles')
    expect(prompt!.answer).toContain('Recommandé')
    expect(prompt!.answer).toContain('Écarté')
    // #3865.4 — jamais une probabilité chiffrée.
    expect(prompt!.answer).not.toMatch(/%|\bchance\b/i)
  })
})

describe('#3776 (recette nuit 08→09/10) — la salle porte les trois badges de fondement', () => {
  it('p-market-sweep porte au moins une source « Preuve » et une « Interprétation »', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-market-sweep')
    expect(prompt, 'p-market-sweep doit exister dans la salle').toBeDefined()
    expect(prompt!.answer).toContain('"basis":"proof"')
    expect(prompt!.answer).toContain('"basis":"interpretation"')
  })

  it('la cartographie par secteur porte une source « Historique »', () => {
    // ⚠️ Deux entrées partagent l'id `p-account-map` (#3762 et celle-ci) —
    // préexistant, hors du périmètre de ce point ; on cible donc par
    // question, comme `demo-turn.ts:86` le fait réellement en production.
    const prompt = DEMO_CHAT_PROMPTS.find(p => p.question === 'Fais-moi une cartographie de mes comptes par secteur.')
    expect(prompt, 'la cartographie par secteur doit exister dans la salle').toBeDefined()
    expect(prompt!.answer).toContain('"basis":"history"')
  })
})

/**
 * Recette 07/10 — #3768, lot L1 (07/10) : le menu « Retravailler » d'une
 * réponse de priorisation propose « Voir seulement les priorités » et
 * « Voir plus de comptes » (`replyCardObjects`/`ACCOUNT_CARDS`,
 * `reply-transform.ts`). La PR #3802 l'a fait pour les CARTES en général ;
 * ce test prouve que la réponse SCRIPTÉE de la salle de démonstration — la
 * première à porter une carte `account_ranking` (`p-priorities`) — en
 * profite AUSSI, sur la même fonction que la production (`ReplyTransformMenu`
 * lit `replyTransformsFor` sur le texte rendu, démo ou pas).
 */
describe('recette 07/10 (#3768) — la priorisation scriptée de la salle propose les deux gestes', () => {
  it('p-priorities : « Voir seulement les priorités » et « Voir plus de comptes » sont proposés', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-priorities')
    expect(prompt, 'p-priorities doit exister dans la salle').toBeDefined()

    const ids = replyTransformsFor(prompt!.answer)
    expect(ids).toContain('priorities_only')
    expect(ids).toContain('more_accounts')
  })
})
