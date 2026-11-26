import { describe, expect, it } from 'vitest'
import {
  accountIdsInReply,
  lauraJobEstimatedCredits,
  lauraJobGesturesOf,
  lauraJobPreviewOf,
  lauraJobStateOf,
  lauraJobViewSchema,
  pendingChatActionSchema,
  planStepsOf,
  replyActionsFor,
  splitReplyBlocks,
  type ReplyBlock,
} from '@bellum/contracts'
import { DEMO_CHAT_PROMPTS } from '@/features/demo/demo-chat-script'
import { DEMO_NEED_ID_PREFIX } from '@/features/demo/demo-long-job'
import { demoTurn } from './demo-turn'

/**
 * #1914 — la démonstration montre les CARTES, pas seulement le texte.
 *
 * Le lien de démo est ce qu'un prospect voit du produit : une forme livrée mais
 * jamais servie en démo se découvre en réunion (craft rule n°9). Les réponses
 * sont écrites à la main — rien ne les valide à l'exécution, sauf ce test.
 */
const DEMO_COMPANIES = ['Société Générale', 'Groupe BPCE', 'SNCF', 'Alstom', 'ENGIE', 'TotalEnergies']

function blocksOf(answer: string): ReplyBlock[] {
  return splitReplyBlocks(answer).flatMap(segment => (segment.kind === 'block' ? [segment.block] : []))
}

describe('#3243 — le challenge « contacter une personne partie » en démonstration', () => {
  it('la question exacte rend le challenge AVANT toute rédaction, avec ses trois alternatives, sans nommer personne', () => {
    const turn = demoTurn('Écris un message à un contact qui a quitté SNCF', 'fallback')
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/quitté l’entreprise/)
    expect(turn.reply).toMatch(/relation réseau/)
    expect(turn.reply).toMatch(/nouvel employeur/)
    expect(turn.reply).toMatch(/successeur/)
  })
})

/**
 * Lot X62 (02/10) — quatre cas de recette prod que la salle ne pouvait pas
 * rejouer parce que la conversation y est scriptée : chaque question exacte
 * rend le comportement de l'issue, sans nommer personne et sans rien créer.
 */
describe('lot X62 — les cas de recette rejouables dans la salle', () => {
  it('#3434 — un groupe trop large n’est pas analysé en bloc : entité, programme ou direction', () => {
    const turn = demoTurn('Analyse Verdal Distribution (démo).', 'fallback')
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/trop large/)
    expect(turn.reply).toMatch(/entité, programme ou direction/)
    expect(turn.reply).toMatch(/rien n’est débité avant ta confirmation/)
  })

  it('#3420 — le message n’est pas validé : « Il manque une preuve », test de généricité, rien n’est envoyé', () => {
    const turn = demoTurn('Mon message est-il prêt à être validé ?', 'fallback')
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/Il manque une preuve/)
    expect(turn.reply).toMatch(/remplace le nom de l’entreprise/i)
    expect(turn.reply).toMatch(/je n’envoie rien/)
  })

  it('#3400 — le ton suit le type de personne, le rôle de décision suit le plan de compte', () => {
    const turn = demoTurn(
      'Pourquoi le ton de ces deux messages est-il le même, alors que leurs rôles diffèrent ?',
      'fallback',
    )
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/type de personne/)
    expect(turn.reply).toMatch(/rôle dans la décision/)
    expect(turn.reply).toMatch(/jamais déduit du seul intitulé/)
  })

  it('#3287 — une action réorientée : Laura propose, ne crée rien', () => {
    const turn = demoTurn(
      'Mon action « relancer le directeur des systèmes d’information » a été réorientée : que proposes-tu ?',
      'fallback',
    )
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/Je ne crée rien/)
    expect(turn.reply).toMatch(/à ta validation/)
  })
})

describe('les réponses préparées de la démonstration', () => {
  it('aucune carte scriptée n’est refusée ni laissée ouverte', () => {
    for (const prompt of DEMO_CHAT_PROMPTS) {
      const kinds = splitReplyBlocks(prompt.answer).map(segment => segment.kind)
      expect(kinds, prompt.id).not.toContain('invalid')
      expect(kinds, prompt.id).not.toContain('unterminated')
    }
  })

  it('au moins une réponse classe des comptes, et une compare', () => {
    const blocks = DEMO_CHAT_PROMPTS.flatMap(prompt => blocksOf(prompt.answer))
    expect(blocks.some(block => block.type === 'account_ranking')).toBe(true)
    expect(blocks.some(block => block.type === 'comparison')).toBe(true)
  })

  /**
   * #2778 — search_talents rend désormais une carte `consultant_shortlist`
   * (production) : la démonstration doit montrer la même forme, pas une liste
   * en texte (craft rule n°9). `contact_list` (get_account_contacts /
   * search_workspace_contacts), câblée dans le même lot, n'a PAS son tour ici
   * à dessein — la règle « aucune personne nommée » de ce fichier (ligne 14)
   * porte sur les personnes des comptes clients réels, exactement ce que ces
   * deux outils rendent : une carte y nommerait un contact chez Groupe BPCE ou la
   * SNCF, jamais seedé côté `demo-dataset.ts`.
   */
  it('au moins une réponse propose une shortlist de consultants', () => {
    const blocks = DEMO_CHAT_PROMPTS.flatMap(prompt => blocksOf(prompt.answer))
    const shortlist = blocks.find(block => block.type === 'consultant_shortlist')
    if (shortlist?.type !== 'consultant_shortlist') throw new Error('carte absente')
    // Les mêmes trois personas que `p-territory-plan`, jamais une nouvelle donnée inventée.
    const DEMO_CONSULTANTS = ['Camille R.', 'Inès K.', 'Marc O.']
    for (const item of shortlist.items) expect(DEMO_CONSULTANTS).toContain(item.name)
  })

  /**
   * Épopée #2778 (LOT j1 26/09) — `explain_talent_duplicate` rend désormais
   * une carte `verdict` en production : la phrase reprise dans le script est
   * EXACTEMENT celle de `explainTalentDuplicate` pour le signal `name` seul
   * (aucun chiffre de confiance, doctrine « aucune probabilité »).
   */
  it('au moins une réponse rend un verdict sans jamais énoncer de chiffre de confiance', () => {
    const blocks = DEMO_CHAT_PROMPTS.flatMap(prompt => blocksOf(prompt.answer))
    const verdict = blocks.find(block => block.type === 'verdict')
    if (verdict?.type !== 'verdict') throw new Error('carte absente')
    expect(verdict.reasons.length).toBeGreaterThan(0)
    expect(verdict.conclusion).not.toMatch(/%|\d\/\d|chance/i)
    for (const reason of verdict.reasons) expect(reason).not.toMatch(/%|\d\/\d|chance/i)
  })

  it('les cartes ne parlent que des dossiers seedés — et le classement dépasse trois comptes', () => {
    const blocks = DEMO_CHAT_PROMPTS.flatMap(prompt => blocksOf(prompt.answer))
    const ranking = blocks.find(block => block.type === 'account_ranking')
    const comparison = blocks.find(block => block.type === 'comparison')
    if (ranking?.type !== 'account_ranking' || comparison?.type !== 'comparison') throw new Error('cartes absentes')
    for (const item of ranking.items) expect(DEMO_COMPANIES).toContain(item.name)
    for (const column of comparison.columns) expect(DEMO_COMPANIES).toContain(column)
    // « top 3 puis Voir les autres » doit être visible en démo.
    expect(ranking.items.length).toBeGreaterThan(3)
  })

  /**
   * #1924.1 — LA STRUCTURE D'UN CONSEIL EST AUSSI REMPLIE EN DÉMONSTRATION
   * (craft rule n°9).
   *
   * Le lien de démonstration est ce qu'un prospect voit du produit. Un conseil
   * qui sortirait en markdown à plat en démo pendant que la production le rend
   * en carte se découvrirait en réunion, pas en CI. La garde lit les intitulés
   * que `StructuredReply::RECOGNIZED_TITLES` reconnaît — pas le mot « verdict »
   * dans une phrase : c'est l'intitulé EN GRAS qui déclenche la carte.
   */
  it('porte un CONSEIL aux quatre sections que l’écran encadre (#1924.1)', () => {
    const advice = DEMO_CHAT_PROMPTS.filter(prompt => prompt.answer.includes('**Verdict :**'))
    expect(advice.length, 'aucune amorce de démonstration ne montre la structure d’un conseil').toBeGreaterThan(0)
    for (const prompt of advice) {
      for (const section of ['**Verdict :**', '**Pourquoi :**', '**Ce qui manque :**', '**Prochaine action :**']) {
        expect(prompt.answer, prompt.id).toContain(section)
      }
    }
  })

  it('la question du classement rend la carte par le vrai moteur de démo', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => blocksOf(entry.answer).some(b => b.type === 'account_ranking'))!
    const turn = demoTurn(prompt.question, 'hors script')
    expect(turn.reply).toBe(prompt.answer)
  })

  /**
   * #3766 Reste (lot K06 07/10) — SANS la table des comptes réellement chargés
   * (le seul appelant réel, `Chat.tsx`, la fournit toujours), le jeton reste
   * tel quel : la réponse garde son texte EXACT (test ci-dessus), et aucun
   * geste de compte n'est proposé (la salle n'avait, avant ce lot, que
   * « Affiner la recherche »).
   */
  it('sans la table des comptes, le jeton de lien reste tel quel et aucun geste de compte n’apparaît', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-priorities')!
    const turn = demoTurn(prompt.question, 'hors script')
    expect(turn.reply).toBe(prompt.answer)
    expect(accountIdsInReply(turn.reply)).toEqual([])
  })

  /**
   * #3766 Reste (lot K06 07/10) — AVEC la table (celle que `Chat.tsx` tire de
   * `useAccounts`, déjà chargée pour l'écran réel), chaque compte cité dans
   * « Par où je commence dans mon portefeuille ? » porte un VRAI lien de
   * fiche, et ce sont ces liens (≥ 2 comptes, carte `account_ranking`) qui
   * font apparaître « Créer une liste de travail » en geste PRINCIPAL — pas
   * seulement « Affiner la recherche », seul geste de compte servi jusqu'ici.
   */
  it('avec la table des comptes, le classement cite ≥ 2 comptes RÉELS et « Créer une liste de travail » devient le geste principal', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-priorities')!
    const accountIdByName = new Map([
      ['SNCF', '11111111-1111-4111-8111-111111111111'],
      ['Société Générale', '22222222-2222-4222-8222-222222222222'],
      ['Groupe BPCE', '33333333-3333-4333-8333-333333333333'],
      ['Alstom', '44444444-4444-4444-8444-444444444444'],
      ['ENGIE', '55555555-5555-4555-8555-555555555555'],
      ['TotalEnergies', '66666666-6666-4666-8666-666666666666'],
    ])
    const turn = demoTurn(prompt.question, 'hors script', accountIdByName)
    expect(turn.reply).not.toContain('{{account:')
    const cited = accountIdsInReply(turn.reply)
    expect(cited.length).toBeGreaterThanOrEqual(2)
    for (const id of cited) expect([...accountIdByName.values()]).toContain(id)

    const blocks = blocksOf(turn.reply)
    const ranking = blocks.find(block => block.type === 'account_ranking')
    if (ranking?.type !== 'account_ranking') throw new Error('carte de classement absente')
    const plan = replyActionsFor({
      accountIds: cited,
      blockTypes: blocks.map(block => block.type),
      hasDiscoverCriteria: false,
      hasMissingData: false,
    })
    expect(plan?.primary).toBe('create_worklist')
  })

  /**
   * #2470 / #2471 — la SECONDE carte de classement : le tour d'horizon.
   *
   * Le test au-dessus lit la PREMIÈRE (le portefeuille seedé) et ne verrait
   * jamais celle-ci. Or c'est elle qui montre le geste livré par ce lot — et
   * elle cite des entreprises que la salle FABRIQUE, pas des dossiers seedés :
   * la règle « seules les sociétés seedées » ne s'y applique pas, la règle
   * « toute entreprise fabriquée se nomme comme telle » oui.
   */
  it('le tour d’horizon rend une carte VALIDE, et ne nomme que des entreprises de démonstration', () => {
    const sweep = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-market-sweep')
    expect(sweep, 'l’amorce du tour d’horizon a disparu du script de la salle').toBeDefined()
    const ranking = blocksOf(sweep!.answer).find(block => block.type === 'account_ranking')
    if (ranking?.type !== 'account_ranking') throw new Error('le tour d’horizon ne rend aucune carte de classement')
    expect(ranking.axes.length).toBeGreaterThan(0)
    for (const item of ranking.items) expect(item.name).toMatch(/\(démo\)$/)
    // Ce qui n'a pas pu être évalué est NOMMÉ, jamais compté zéro (GA-18/GA-19).
    expect(ranking.not_evaluated?.length).toBeGreaterThan(0)
    expect(demoTurn(sweep!.question, 'hors script').reply).toBe(sweep!.answer)
  })

  /**
   * #2271.19 (compagnon démo) — LA TIMELINE, ELLE AUSSI REMPLIE EN DÉMONSTRATION.
   *
   * Craft rule n°9 : une sortie livrée mais jamais servie en démo se découvre
   * en réunion. `chat_messages` reste vide à dessein (aucun message semé), donc
   * la carte n'apparaît QUE si le visiteur pose la question — même mécanisme
   * que `account_ranking`/`comparison` plus haut, par le vrai moteur de démo.
   */
  it('une question d’historique rend une carte timeline valide, ancrée sur un dossier seedé (#2271.19)', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => blocksOf(entry.answer).some(b => b.type === 'timeline'))
    expect(prompt, 'aucune amorce de démonstration ne rend de carte timeline').toBeDefined()
    const timeline = blocksOf(prompt!.answer).find(b => b.type === 'timeline')
    if (timeline?.type !== 'timeline') throw new Error('carte timeline absente')
    expect(timeline.events.length).toBeGreaterThan(0)
    if (timeline.account) expect(DEMO_COMPANIES).toContain(timeline.account.name)
    // Un compte réellement sans historique dirait `events: []` (GA-18/19) —
    // ici le dossier EN a, donc la carte n'a pas de raison d'être vide.
    for (const event of timeline.events) expect(event.label.length).toBeGreaterThan(0)
    expect(demoTurn(prompt!.question, 'hors script').reply).toBe(prompt!.answer)
  })

  /**
   * #2271.20 (compagnon démo) — LE FICHIER EXPORTABLE, LUI AUSSI EN DÉMONSTRATION.
   *
   * Zéro destination réseau (doctrine) : la carte ne porte qu'un nom de fichier
   * et des lignes déjà écrites plus haut dans le script (mêmes notes que
   * `p-portfolio`) — rien n'est recalculé, rien ne part.
   */
  it('une demande d’export rend une carte file_export valide, sans destination réseau (#2271.20)', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => blocksOf(entry.answer).some(b => b.type === 'file_export'))
    expect(prompt, 'aucune amorce de démonstration ne rend de carte file_export').toBeDefined()
    const file = blocksOf(prompt!.answer).find(b => b.type === 'file_export')
    if (file?.type !== 'file_export') throw new Error('carte file_export absente')
    expect(file.filename).not.toMatch(/[/\\]/)
    expect(file.columns.length).toBeGreaterThan(0)
    expect(file.rows.length).toBeGreaterThan(0)
    expect(demoTurn(prompt!.question, 'hors script').reply).toBe(prompt!.answer)
  })

  /** #2429.13 (compagnon démo) — l'approche, en carte validée, dans la salle. */
  it('une demande d’approche rend une carte approach valide, sans intitulé markdown à reconnaître (#2429.13)', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => blocksOf(entry.answer).some(b => b.type === 'approach'))
    expect(prompt, 'aucune amorce de démonstration ne rend de carte approach').toBeDefined()
    expect(prompt!.answer).not.toMatch(/\*\*Objectif|\*\*Angle d'accroche/)
    const approach = blocksOf(prompt!.answer).find(b => b.type === 'approach')
    if (approach?.type !== 'approach') throw new Error('carte approach absente')
    expect(approach.objective.length).toBeGreaterThan(0)
    expect(approach.angle.length).toBeGreaterThan(0)
  })
})

/**
 * #1950.14 / #1950.20 / #1950.22 (compagnon démo) — LE PLAN DE LAURA, DANS LA SALLE.
 *
 * #1950.14 revient sur 1950.3, délibérément (décision Louis 19/09/2026) : un plan
 * se lance en un geste, chaque étape a son état, une dépendance DÉCLARÉE bloque.
 * Craft rule n°9 : la barre « Plan de Laura » doit se voir en démonstration, avec
 * des états VARIÉS — sinon elle se découvre en réunion. Ce qui tient : RIEN ne
 * part de la salle. Aucune carte n'offre de geste, aucune ne porte de tour
 * (`turnId: null`), donc la barre n'offre aucun lancement — elle MONTRE.
 */
describe('le plan de Laura en démonstration (#1950)', () => {
  it('une amorce rend un plan de trois cartes aux états variés : faite, échouée, bloquée par sa dépendance', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.cards && entry.cards.length > 1)
    expect(prompt, 'aucune amorce de démonstration ne rend de plan').toBeDefined()
    const turn = demoTurn(prompt!.question, 'hors script')
    expect(turn.reply).toBe(prompt!.answer)
    const steps = planStepsOf(turn.cards ?? [])
    expect(steps.map(step => step.status)).toEqual(['done', 'failed', 'blocked'])
    expect(steps[2]?.blockedBy).toEqual({ rank: 1, cause: 'failed' })
  })

  // #1950.4 / .7 / .12 / .13 — PARITÉ DÉMO : le plan de la salle dit son
  // objectif, dans la forme EXACTE que le serveur sert (`context.plan_brief`).
  it('le plan de la salle porte son résumé : objectif, résultats attendus, ce qui ne se fera pas', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.cards && entry.cards.length > 1)
    const turn = demoTurn(prompt!.question, 'hors script')
    expect(turn.context?.plan_brief?.objective).toMatch(/Groupe BPCE/)
    expect(turn.context?.plan_brief?.expected_results?.length).toBeGreaterThan(0)
    expect(turn.context?.plan_brief?.impossible?.length).toBeGreaterThan(0)
  })

  it('rien ne part de la salle : aucune carte n’offre de geste, aucune ne porte de tour', () => {
    for (const prompt of DEMO_CHAT_PROMPTS) {
      for (const card of prompt.cards ?? []) {
        expect(card.allowedGestures, `${prompt.id} / ${card.id}`).toEqual([])
        expect(card.turnId, `${prompt.id} / ${card.id}`).toBeNull()
      }
    }
  })

  /**
   * #2679 — LES PRÉCISIONS CLIQUABLES, EN DÉMONSTRATION (craft rule n°9).
   *
   * Deux choses, et la seconde est celle qui peut casser en silence : le tour
   * porte bien les options dans la forme du serveur, ET chaque libellé est
   * exactement la question d'une autre amorce. En salle, le moteur est le
   * script : un libellé qui ne correspond à rien enverrait le prospect sur la
   * réponse « hors script » — un bouton qui ne mène nulle part, découvert en
   * réunion.
   */
  it('une précision scriptée rend ses options, et chaque option retombe sur une réponse préparée', () => {
    const withOptions = DEMO_CHAT_PROMPTS.filter(prompt => prompt.replyOptions?.length)
    expect(withOptions.length).toBeGreaterThan(0)

    for (const prompt of withOptions) {
      const turn = demoTurn(prompt.question, 'hors script')
      expect(turn.context?.reply_options?.length, prompt.id).toBe(prompt.replyOptions?.length)
      for (const precision of prompt.replyOptions ?? []) {
        // La question posée dans le TEXTE reste la question : les options s'y
        // ajoutent, elles ne la remplacent pas.
        expect(prompt.answer, prompt.id).toContain(precision.question)
        for (const option of precision.options) {
          expect(demoTurn(option, 'hors script').reply, `${prompt.id} / ${option}`).not.toBe('hors script')
        }
      }
    }
  })

  /**
   * #3816 (lot C4) — « trouve-moi des missions pour ce profil » est REMPLI en salle (craft rule n°9) :
   * une carte de comptes, chacun avec sa raison. Et chaque SUITE d'un compte (analyse, contacts,
   * message) envoie une phrase qui retombe sur une réponse préparée — jamais un bouton mort.
   */
  it('#3816 — les missions pour un profil sortent en carte, et chaque suite mène à une réponse préparée', () => {
    const turn = demoTurn('Trouve-moi des missions pour ce profil : Camille Roussel', 'hors script')
    expect(turn.reply).not.toBe('hors script')
    const block = turn.reply.match(/```bellum-block\n(.*)\n```/)?.[1]
    const ranking = JSON.parse(block ?? '{}') as {
      type?: string
      items?: { name: string; why: string[]; follow_ups?: { label: string; ask: string }[] }[]
    }
    expect(ranking.type).toBe('account_ranking')
    expect(ranking.items?.length).toBeGreaterThan(0)
    const followUps = (ranking.items ?? []).flatMap(item => item.follow_ups ?? [])
    expect(followUps.length).toBeGreaterThan(0)
    for (const followUp of followUps) {
      expect(demoTurn(followUp.ask, 'hors script').reply, followUp.ask).not.toBe('hors script')
    }
  })

  it('une amorce SANS précision ne porte aucune option — pas de bouton mort', () => {
    const plain = DEMO_CHAT_PROMPTS.find(prompt => !prompt.replyOptions)!
    expect(demoTurn(plain.question, 'hors script').context?.reply_options).toBeUndefined()
  })

  it('le plan parle d’un dossier seedé, sans nommer personne', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.cards && entry.cards.length > 1)!
    expect(DEMO_COMPANIES.some(company => prompt.answer.includes(company))).toBe(true)
    for (const card of prompt.cards ?? []) {
      if (card.action && 'contact_name' in card.action) expect(card.action.contact_name ?? null).toBeNull()
    }
  })

  it('#2276 — une amorce rend un job composite VALIDE, déjà exécuté, dont le coût est celui de la grille', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.lauraJob)
    expect(prompt, 'aucune amorce de démonstration ne rend de job').toBeDefined()
    const turn = demoTurn(prompt!.question, 'hors script')
    const job = lauraJobViewSchema.parse(turn.context?.laura_job)
    // #2276 tranche 2 — la salle montre un job EXÉCUTÉ (semé), jamais lancé depuis la salle.
    expect(job.state).toBe(lauraJobStateOf('done'))
    // Le coût annoncé en salle est celui que l'API calculerait — jamais un chiffre recopié.
    expect(job.estimatedCredits).toBe(lauraJobEstimatedCredits(job.brief))
    // #4463 — la réponse de Laura ne chiffre aucun crédit (le job en porte, l'écran ne le dit pas).
    expect(prompt!.answer).not.toMatch(/crédit/i)
    expect(turn.reply).not.toMatch(/crédit/i)
    // Chaque étape porte sa preuve ; le débit RÉEL tient sous le coût maximum annoncé.
    expect(job.brief.steps.every(step => step.status === 'done' && step.finishedAt !== null)).toBe(true)
    expect(job.spentCredits).toBeLessThanOrEqual(job.estimatedCredits)
    expect(job.spentCredits).toBe(job.brief.steps.reduce((sum, step) => sum + (step.creditsSpent ?? 0), 0))
    // L'écriture CRM n'est faite que validée par une personne ; aucun geste n'est offert en salle.
    expect(job.brief.steps.find(step => step.capability === 'crm_write')?.approvedBy).not.toBeNull()
    expect(lauraJobGesturesOf(job.state, job.brief)).toEqual([])
    // Laura n'envoie jamais : ce qui est créé, ce sont des brouillons et une note.
    expect(job.brief.createdObjects.every(object => ['outreach_message', 'crm_note'].includes(object.kind))).toBe(true)
    // La fiche ne parle que d'un dossier seedé.
    expect(DEMO_COMPANIES.some(name => job.brief.scope.description.includes(name))).toBe(true)
  })

  it('#2276.46 / .47 / .49 / .51 — la prévisualisation est REMPLIE en salle : relu, neuf, limites, durée mesurée', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.lauraJob)
    const job = lauraJobViewSchema.parse(demoTurn(prompt!.question, 'hors script').context?.laura_job)
    const preview = lauraJobPreviewOf(job.brief)
    expect(preview.reused.length).toBeGreaterThan(0)
    expect(preview.newActions.length).toBeGreaterThan(0)
    // Des contacts dans le périmètre : la limite dit un nombre, pas « aucun contact ».
    expect(preview.limits.some(limit => limit.kind === 'max_targets')).toBe(true)
    // Une durée affichée porte sa base de mesure (sinon la carte ne l'affiche pas).
    expect(job.brief.estimatedDurationSeconds).not.toBeNull()
    expect(job.brief.estimatedDurationBasis).not.toBeNull()
  })
})

/**
 * #3193.2/.3/.4 (épopée #3217) — PARITÉ DÉMO (craft rule n°9) : le reçu de
 * connaissance ne prétend jamais qu'une couche a été consultée alors
 * qu'aucun appel réseau n'a eu lieu en salle.
 */
describe('le job long du chat en démonstration (#2844)', () => {
  const QUESTION = 'Classe-moi le vivier contre mes trois derniers besoins ouverts, en tâche de fond'

  it('le texte libre de la recette rend la carte « Matching massif » sur trois besoins semés, jamais « terminé »', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/tâche de fond/)
    expect(turn.reply).not.toMatch(/terminé/i)
    const actions = pendingChatActionSchema.array().parse(turn.context?.pending_actions)
    expect(actions).toHaveLength(1)
    const action = actions[0]
    expect(action?.action).toBe('propose_long_job')
    if (action?.action !== 'propose_long_job') return
    expect(action.job).toBe('bulk_matching')
    expect(action.need_ids).toHaveLength(3)
    // Les besoins sont ceux de la salle (titres semés par `demo-dataset.ts`), jamais inventés.
    expect(action.needs?.map(need => need.label)).toEqual([
      'Ingénieur infrastructure — socle conteneurisé du portail',
      'Ingénieur données — fiabilisation des flux temps réel',
      'Consultant sécurité applicative — parcours d’authentification',
    ])
    // Aucun prix de lot inventé, aucun besoin réel visé : les identifiants disent « salle ».
    expect(action.cost_credits ?? 0).toBe(0)
    expect(action.need_ids.every(id => id.startsWith(DEMO_NEED_ID_PREFIX))).toBe(true)
  })
})

describe('le reçu de connaissance en démonstration (#3217)', () => {
  it('nomme les onze couches, honnêtement — seul le portefeuille de la salle est réellement consulté', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.replyOptions?.length)
    expect(prompt, 'aucune amorce de démonstration ne pose de précision').toBeDefined()
    const turn = demoTurn(prompt!.question, 'hors script')
    const receipt = turn.context?.knowledge_receipt
    expect(receipt?.workspace.status).toBe('consulted')
    expect(receipt?.inference.status).toBe('consulted')
    for (const layer of [
      'crm',
      'messaging',
      'agenda',
      'documents',
      'account_dossier',
      'dataforge',
      'market_memory',
      'current_public_sources',
      'bellum_method',
    ] as const) {
      expect(receipt?.[layer].status, layer).toBe('not_requested')
    }
  })
})

describe('X37 / #3398 — la question libre du brief reçoit une vraie réponse en salle', () => {
  it('« Qu’est-ce qui est en retard sur mes comptes ? » nomme la relance en retard, pas la réponse générique', () => {
    const turn = demoTurn('Qu’est-ce qui est en retard sur mes comptes ?', 'GÉNÉRIQUE')
    expect(turn.reply).not.toBe('GÉNÉRIQUE')
    expect(turn.reply).toContain('Société Générale')
    expect(turn.reply).toContain('profils conformité')
  })
})

describe('X64 / #3274.4 — une règle de méthode contredite par les résultats de la salle', () => {
  it('« Pourquoi tu ne me cites plus la règle du plan de compte hebdomadaire ? » rejoue le tour : cause, seuil, réactivation', () => {
    const turn = demoTurn('Pourquoi tu ne me cites plus la règle du plan de compte hebdomadaire ?', 'GÉNÉRIQUE')
    expect(turn.reply).not.toBe('GÉNÉRIQUE')
    expect(turn.reply).toContain('plan de compte hebdomadaire')
    expect(turn.reply).toContain('cinq')
    expect(turn.reply).toMatch(/un seul résultat positif/i)
    expect(turn.reply).toContain('SNCF')
  })
})

/**
 * X66 / #3284.20–.21 — le compte écarté de la salle (Société Générale : arbitrage
 * « No-Go », revue posée à la main au 15/10/2026) rend les deux réponses que
 * `get_focus_review` relaie en production : la prochaine revue (date + source)
 * et les évènements qui pourraient réactiver — des PROPOSITIONS, rien d'appliqué.
 */
describe('X66 / #3284 — revue programmée et réactivation d’un compte écarté, en salle', () => {
  it('.20 — la prochaine revue nomme la date posée à la main, jamais une date devinée', () => {
    const turn = demoTurn('Quand dois-je revoir ce compte écarté ?', 'fallback')
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/15 octobre 2026/)
    expect(turn.reply).toMatch(/posée à la main/)
    expect(turn.reply).toMatch(/Société Générale/)
  })

  it('.21 — la réactivation liste des évènements proposés : Laura n’applique rien', () => {
    const turn = demoTurn('Qu’est-ce qui pourrait réactiver ce compte écarté ?', 'fallback')
    expect(turn.reply).not.toBe('fallback')
    expect(turn.reply).toMatch(/réponse positive/i)
    expect(turn.reply).toMatch(/signal fort/i)
    expect(turn.reply).toMatch(/je ne (rouvre|change) rien/i)
  })
})

describe('l’enrichissement en masse du chat en démonstration (#2434.56)', () => {
  const QUESTION = 'Enrichis ces trois contacts d’un coup : Palmieri, Trévisani et Castex'

  it('rend la carte sur trois contacts semés, le plafond annoncé, jamais « enrichi »', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    // #4463 — le plafond n'est plus annoncé en crédits : la réponse dit ce qui est proposé, sans chiffre de coût.
    expect(turn.reply).toMatch(/enrichir les coordonnées de t/i)
    expect(turn.reply).not.toMatch(/crédit/i)
    const actions = pendingChatActionSchema.array().parse(turn.context?.pending_actions)
    const action = actions[0]
    expect(action?.action).toBe('propose_bulk_enrichment')
    if (action?.action !== 'propose_bulk_enrichment') return
    expect(action.contacts.map(contact => contact.contact_name)).toEqual([
      'Pierre Palmieri',
      'Laurent Trévisani',
      'Jean Castex',
    ])
    expect(action.cost_credits).toBe(3)
  })
})

describe('un message à plusieurs contacts NOMMÉS en démonstration (#3894.3)', () => {
  const QUESTION = 'Prépare un message de relance pour Trévisani et Castex'

  it('rend la carte sur les deux contacts semés que la personne a nommés, rien d’envoyé', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/Rien n’est envoyé/)
    const action = pendingChatActionSchema.array().parse(turn.context?.pending_actions)[0]
    expect(action?.action).toBe('prepare_message_audience')
    if (action?.action !== 'prepare_message_audience') return
    expect(action.recipients.map(recipient => recipient.contact_name)).toEqual(['Laurent Trévisani', 'Jean Castex'])
    expect(action.explicit_multi_contact).toBe(true)
  })

  it('n’attrape pas ce qu’elle ne vise pas — un seul contact nommé ne rend pas d’audience', () => {
    const turn = demoTurn('Prépare un message de relance pour Trévisani', 'hors script')
    const actions = pendingChatActionSchema.array().parse(turn.context?.pending_actions ?? [])
    expect(actions.some(action => action.action === 'prepare_message_audience')).toBe(false)
  })
})

// #3186 / #3285 (recette démo 06/10) — deux réponses préparées que la démo ne servait pas : le mode
// contractuel NON DÉCLARÉ (jamais « en régie » deviné) et l'ouverture de compte fermé, sourcée comme en prod.
describe('#3186 — Laura ne devine pas le mode contractuel en démonstration', () => {
  const QUESTION = 'Comment présenter notre modèle de staffing ?'

  it('dit « non déclaré », ne dit jamais « en régie », et porte la carte menant à Réglages › Profil', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/non déclaré/)
    expect(turn.reply).not.toMatch(/en régie/i)
    const cards = splitReplyBlocks(turn.reply).flatMap(segment => (segment.kind === 'block' ? [segment.block] : []))
    const missing = cards.find(block => block.type === 'missing_data')
    expect(JSON.stringify(missing)).toContain('Renseigner le mode contractuel')
    expect(turn.reply).toContain('/settings/profile')
  })
})

describe('#3285 — « Par où j’ouvre ce compte ? » (Alstom) cite la méthode « ouverture de compte fermé »', () => {
  const QUESTION = 'Par où j’ouvre ce compte ?'

  it('sert une réponse préparée dont la source est « ouverture de compte fermé » (même forme que la prod)', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/Alstom/)
    expect(turn.context?.sources).toEqual([{ kind: 'method_rule', label: 'ouverture de compte fermé' }])
  })

  it('une amorce sans source ne porte aucune source de MÉTHODE — la méthode ne se colle pas à côté', () => {
    // #4069.4 (14/10) — ses seules sources sont les faits DATÉS que la réponse cite (voir
    // `demo-turn.datedProof.test.ts`) ; jamais la méthode d'une autre amorce.
    const sources = demoTurn('Quels signaux justifient de prioriser SNCF ?', 'hors script').context?.sources ?? []
    expect(sources.filter(source => source.kind === 'method_rule')).toEqual([])
    expect(demoTurn('Où en est mon portefeuille ?', 'hors script').context?.sources ?? []).toEqual([])
  })
})

describe('#3750.8 — Laura cite l’ONGLET du classeur semé, pas le classeur entier', () => {
  it('« trop cher » cite « Brand Messaging — … — 07 · Objections », dans la forme de la prod', () => {
    const turn = demoTurn('Que répondre si on me dit que c’est trop cher ?', 'hors script')
    expect(turn.reply).toMatch(/07 · Objections/)
    expect(turn.context?.sources).toEqual([
      { kind: 'knowledge_doc', label: 'Brand Messaging — Bellum Conseil (classeur, démo) — 07 · Objections' },
    ])
  })
})

/**
 * #3764 — recette prod 08/10 (U 22edd95fe1) : « Où en est mon portefeuille ? »
 * disait « Trois comptes suivis, deux notés » dans le TEXTE, tandis que le
 * pied de réponse (`active.portfolio.count`, lu par `ReplySourceBasis`)
 * disait « 6 comptes du portefeuille » — deux comptes différents sous la
 * même réponse. Et aucun tour scripté ne portait `reasoning_trace`, donc
 * AUCUN badge ne pouvait jamais apparaître (`toolsRead` restait `null`).
 */
describe('#3764 — « Où en est mon portefeuille ? » est cohérente, et porte un badge', () => {
  const QUESTION = 'Où en est mon portefeuille ?'

  it('le texte et le pied de réponse comptent la MÊME salle (six comptes)', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/Six comptes suivis/)
    expect(turn.reply).not.toMatch(/Trois comptes suivis/)
    expect(turn.context?.active.portfolio.count).toBe(6)
  })

  it('les trois comptes dits « notés » dans le texte sont bien ceux du graphe', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.chart?.bars.map(bar => bar.label)).toEqual(['SNCF', 'Société Générale', 'TotalEnergies'])
  })

  it('porte désormais une trace d’outil non vide — sans elle, AUCUN badge ne peut jamais apparaître', () => {
    const turn = demoTurn(QUESTION, 'hors script')
    expect(turn.context?.reasoning_trace?.tools_called?.length).toBeGreaterThan(0)
  })
})

/**
 * #4069.4 (recette R6 14/10) — Renault (compte analysé, Louis 12/10) répondait par le texte
 * générique « choisis une des questions proposées » à une question LIBRE sur ses faits datés,
 * alors que le dossier en porte (recent_signals réels, dates réelles). La question est GÉNÉRIQUE
 * (« sur ce compte », pas « sur Renault ») : sans le nom du compte ouvert, le moteur scripté ne
 * peut pas savoir lequel des quatre comptes analysés répondre — `demoTurn` doit donc le recevoir.
 */
describe('#4069.4 — « Que sais-tu de daté sur ce compte ? » sur un compte analysé', () => {
  it('Renault : des faits réels et datés, jamais le texte générique hors-script', () => {
    const turn = demoTurn('Que sais-tu de daté sur ce compte ?', 'hors script', undefined, 'Renault')
    expect(turn.reply).not.toBe('hors script')
    expect(turn.reply).toMatch(/8 octobre 2026/)
    expect(turn.context?.active.account).toEqual({ present: true, name: 'Renault' })
  })

  it('EDF, Airbus et Thales (les mêmes comptes analysés) répondent aussi', () => {
    for (const name of ['EDF', 'Airbus', 'Thales']) {
      const turn = demoTurn('Que sais-tu de daté sur ce compte ?', 'hors script', undefined, name)
      expect(turn.reply).not.toBe('hors script')
      expect(turn.context?.active.account).toEqual({ present: true, name })
    }
  })

  it('un compte du portefeuille (SNCF) sans faits datés dédiés reste sur le script existant', () => {
    const turn = demoTurn('Que sais-tu de daté sur ce compte ?', 'hors script', undefined, 'SNCF')
    expect(turn.reply).toBe('hors script')
  })

  it('sans compte actif connu, le texte générique hors-script reste inchangé', () => {
    const turn = demoTurn('Que sais-tu de daté sur ce compte ?', 'hors script')
    expect(turn.reply).toBe('hors script')
  })

  // #5086 — parité démo (craft rule n°9) : la limite que le vérificateur dit sous un message préparé voyage
  // dans `context.reply_notes` (panneau Sources), jamais dans le corps de la réponse.
  it('un message préparé porte sa Précision « rien envoyé » dans reply_notes, pas dans le texte', () => {
    const turn = demoTurn('Que dire à Groupe BPCE en premier message ?', 'hors script')
    expect(turn.context?.reply_notes).toEqual([
      'Précision : je n’ai rien envoyé ni écrit — ce message est préparé, l’envoi reste ton geste.',
    ])
    expect(turn.reply).not.toContain('Précision')
    expect(demoTurn('Où en est mon portefeuille ?', 'hors script').context?.reply_notes).toBeUndefined()
  })
})
