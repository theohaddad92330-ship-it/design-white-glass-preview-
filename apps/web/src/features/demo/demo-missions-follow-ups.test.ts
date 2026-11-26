import { describe, expect, it } from 'vitest'
import { splitReplyBlocks } from '@bellum/contracts'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

/**
 * #3816 (lot R8 07/10) — la carte « Comptes où placer <consultant> » (démo : Camille Roussel,
 * SII et Alten) n'affichait ses trois suites que sous le PREMIER compte : `DEMO_MISSIONS_FOLLOW_UPS`
 * portait « SII » en dur dans son texte, et l'entrée Alten n'avait tout simplement aucun
 * `follow_ups`. Chaque compte de la carte doit porter ses propres suites, chacune menant à une
 * réponse scriptée réelle — jamais un bouton qui ne mène nulle part.
 */
describe('#3816 — la carte « missions pour ce profil » porte ses suites sous CHAQUE compte', () => {
  const prompt = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile')

  it('le prompt scripté existe', () => {
    expect(prompt).toBeDefined()
  })

  const block = prompt ? splitReplyBlocks(prompt.answer).find(segment => segment.kind === 'block') : undefined

  it('la carte account_ranking porte deux comptes (SII, Alten)', () => {
    expect(block?.kind).toBe('block')
    if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
    expect(block.block.items.map(item => item.name)).toEqual(['SII', 'Alten'])
  })

  it.each(['SII', 'Alten'])('%s porte ses 3 suites, chacune avec un libellé distinct', accountName => {
    if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
    const item = block.block.items.find(i => i.name === accountName)
    expect(item?.follow_ups, `${accountName} doit porter follow_ups`).toBeDefined()
    expect(item?.follow_ups).toHaveLength(3)
    const labels = (item?.follow_ups ?? []).map(f => f.label)
    expect(new Set(labels).size).toBe(3)
  })

  it.each(['SII', 'Alten'])('%s : chaque suite envoie une question qui a sa propre réponse scriptée', accountName => {
    if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
    const item = block.block.items.find(i => i.name === accountName)
    for (const followUp of item?.follow_ups ?? []) {
      expect(followUp.ask, `${accountName} / ${followUp.label}`).toContain(accountName)
      const matched = DEMO_CHAT_PROMPTS.find(p => p.question === followUp.ask)
      expect(matched, `aucune réponse scriptée pour « ${followUp.ask} »`).toBeDefined()
    }
  })

  // #4421.13 (Louis, QCM 24/10, craft rule n°9) — comme en production depuis #4421.10 : un compte hors de l'espace
  // reçoit ses personnes DANS le même tour, à vérifier, et un mail préparé pour la première. Personnes SIMULÉES.
  it.each(['SII', 'Alten'])(
    '%s montre 1 à 3 personnes nommées (nom complet ou masqué), à vérifier, et le mail préparé',
    accountName => {
      if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
      const item = block.block.items.find(i => i.name === accountName)
      const found = (item?.why ?? []).find(line => line.startsWith('Trouvés hors de ton espace, à vérifier : '))
      expect(found, `${accountName} doit nommer ses personnes`).toBeDefined()
      const people = (found ?? '')
        .replace('Trouvés hors de ton espace, à vérifier : ', '')
        .replace(/\.$/, '')
        .split('; ')
      expect(people.length).toBeGreaterThanOrEqual(1)
      expect(people.length).toBeLessThanOrEqual(3)
      // #4421.18 (Louis 25/10) — comme en production, le nom de famille peut être MASQUÉ par la source (« Inès G. ») :
      // « Obtenir l'e-mail » le révèle au clic. Un prénom seul, lui, ne passe toujours pas.
      for (const person of people)
        expect(person).toMatch(/^\p{Lu}\p{L}+(?:-\p{Lu}\p{L}+)? (?:\p{Lu}\p{L}+|\p{Lu}\.) \(.+\)$/u)
      expect(
        people.some(person => /Direct|Responsable d’agence/.test(person)),
        'un décideur au moins',
      ).toBe(true)
      const first = (people[0] ?? '').replace(/ \(.+\)$/, '')
      expect(item?.why).toContain(`Mail préparé pour ${first} — à relire, c’est toi qui l’envoies.`)
      expect(item?.why.join(' ')).not.toContain('Aucun contact connu')
      // Le mail lui-même est dans la réponse, en brouillon — jamais « envoyé ».
      expect(prompt?.answer).toContain(`Bonjour ${first.split(' ')[0]},`)
    },
  )

  it('#4421.13 — deux mails préparés, chacun avec son objet, rien ne part', () => {
    expect(prompt?.answer.match(/Objet : /g)).toHaveLength(2)
    expect(prompt?.answer).not.toMatch(/\benvoyé\b/)
    expect(prompt?.answer).toContain('rien ne part sans toi')
  })

  it.each([
    [DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile-contacts'), 'SII'],
    [DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile-contacts-alten'), 'Alten'],
  ])('#4421.13 — « Voir les contacts » montre les personnes trouvées (%#)', (followUp, accountName) => {
    expect(followUp?.answer).toContain(accountName)
    expect(followUp?.answer).toContain('à vérifier')
    expect(followUp?.answer).not.toContain('je n’ai aucun contact')
  })

  it.each([
    [DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile-message'), 'SII'],
    [DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile-message-alten'), 'Alten'],
  ])('#4421.13 — « Préparer le message » rend le mail préparé (%#)', (followUp, accountName) => {
    expect(followUp?.answer).toContain(accountName)
    expect(followUp?.answer).toContain('Objet : ')
    expect(followUp?.answer).not.toContain('Il me faut d’abord un interlocuteur')
  })

  it('#4421 — Laura annonce en une ligne ce qu’elle a retenu de la fiche, sans question', () => {
    expect(prompt?.answer).toContain('J’ai retenu : Kubernetes, zone 69.')
    expect(prompt?.answer.split('```')[0]).not.toContain('?')
  })

  it('les suites de SII et Alten ne se confondent jamais (asks distincts)', () => {
    if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
    const sii = block.block.items.find(i => i.name === 'SII')
    const alten = block.block.items.find(i => i.name === 'Alten')
    const siiAsks = new Set((sii?.follow_ups ?? []).map(f => f.ask))
    const altenAsks = (alten?.follow_ups ?? []).map(f => f.ask)
    for (const ask of altenAsks) expect(siiAsks.has(ask)).toBe(false)
  })
})

describe('#4421.18 — « Obtenir l’e-mail » en salle (craft rule n°9)', () => {
  it('SII porte ses personnes révélables ; la première se révèle depuis le jeu fictif, en @exemple.fr', async () => {
    const { DEMO_CHAT_PROMPTS, DEMO_REVEALED_PEOPLE } = await import('./demo-chat-script')
    const { splitReplyBlocks } = await import('@bellum/contracts')
    const answer = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile')?.answer ?? ''
    const card = splitReplyBlocks(answer).find(s => s.kind === 'block')
    if (card?.kind !== 'block' || card.block.type !== 'account_ranking') throw new Error('carte attendue')
    const sii = card.block.items.find(i => i.name === 'SII')
    const first = sii?.reveal?.people[0]
    expect(first).toMatchObject({ name: 'Inès G.', mail_to: true })
    const revealed = DEMO_REVEALED_PEOPLE[first?.person_ref ?? '']
    expect(revealed?.fullName.startsWith('Inès G')).toBe(true)
    expect(revealed?.email).toMatch(/@exemple\.fr$/)
  })
})

// #4642 — craft rule n°9 : la salle rend aussi la carte qui porte la DEMANDE, sinon « Analyser la sélection »
// n'ouvre jamais le cadrage devant un prospect.
describe('#4642 — la carte démo « missions pour ce profil » porte la demande (talent, compétences, offres)', () => {
  const prompt = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-missions-for-profile')
  const block = prompt ? splitReplyBlocks(prompt.answer).find(segment => segment.kind === 'block') : undefined

  it('le contexte nomme le consultant et ses compétences ; SII porte ses offres relevées', () => {
    if (block?.kind !== 'block' || block.block.type !== 'account_ranking') throw new Error('carte attendue')
    expect(block.block.talent_context).toMatchObject({ talent_name: 'Camille Roussel', skills: ['Kubernetes'] })
    expect(block.block.items.find(item => item.name === 'SII')?.offers?.length).toBeGreaterThan(0)
    // Alten n'a pas d'offre relevée dans le jeu : aucune ligne inventée.
    expect(block.block.items.find(item => item.name === 'Alten')?.offers).toBeUndefined()
  })
})
