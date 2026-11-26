import { describe, expect, it } from 'vitest'
import {
  defaultGroundingIds,
  callOfferLabel,
  groundingFacts,
  contextElement,
  groundingPayload,
  usedGroundingFact,
  type GroundingChoice,
} from './approach-grounding'

const RAW = {
  recent_signals: [
    { signal: 'Cession de la filiale Uptevia', date: '2026-10-01', source: 'Les Echos' },
    { signal: 'Recrutement de 12 ingénieurs data', date: '2026-09-20' },
    { signal: 'Nouveau directeur des achats' },
  ],
}
const CONTACT = {
  signals: [{ label: 'A pris la parole au salon Data Paris', source: 'LinkedIn', date: '2026-09-30' }],
  key_points: ['Veut fiabiliser ses pipelines data', '  '],
}

describe('#4524.1 — groundingFacts : ce que la fiche SAIT, dans l’ordre déjà calculé', () => {
  it('lit les signaux du compte dans l’ordre du dossier, sans en inventer un autre', () => {
    const { account } = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
    expect(account.map(fact => fact.label)).toEqual([
      'Cession de la filiale Uptevia',
      'Recrutement de 12 ingénieurs data',
      'Nouveau directeur des achats',
    ])
    expect(account[0]).toMatchObject({ kind: 'account_signal', proof: 'Les Echos · 2026-10-01' })
    expect(account[2]?.proof).toBeNull()
  })

  it('sépare les signaux du contact et ses besoins ; un texte blanc ne fait aucune ligne', () => {
    const { contact } = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
    expect(contact.map(fact => [fact.kind, fact.label])).toEqual([
      ['contact_signal', 'A pris la parole au salon Data Paris'],
      ['contact_need', 'Veut fiabiliser ses pipelines data'],
    ])
  })

  it('#4524.5 — aucun signal : aucune ligne, jamais un signal inventé', () => {
    expect(groundingFacts({ rawAnalysis: undefined, contact: {} })).toEqual({ account: [], contact: [] })
    expect(
      groundingFacts({ rawAnalysis: { recent_signals: 'x' }, contact: { signals: null, key_points: null } }),
    ).toEqual({
      account: [],
      contact: [],
    })
  })
})

describe('#4524.1 — le choix par défaut : les 2 meilleurs signaux', () => {
  it('coche les deux premiers signaux du compte', () => {
    const facts = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
    expect(defaultGroundingIds(facts)).toEqual([facts.account[0]?.id, facts.account[1]?.id])
  })

  it('complète avec le contact quand le compte n’en a qu’un, et ne coche rien quand il n’y a rien', () => {
    const one = groundingFacts({ rawAnalysis: { recent_signals: [{ signal: 'Seul' }] }, contact: CONTACT })
    expect(defaultGroundingIds(one)).toEqual([one.account[0]?.id, one.contact[0]?.id])
    expect(defaultGroundingIds({ account: [], contact: [] })).toEqual([])
  })
})

describe('#4524.2 — groundingPayload : ce qui part au moteur', () => {
  const facts = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
  const first = facts.account[0]!
  const need = facts.contact[1]!

  it('les faits cochés seulement, avec leur preuve', () => {
    const payload = groundingPayload({ mode: 'facts', ids: [first.id, need.id] }, facts)
    expect(payload).toEqual({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: 'Cession de la filiale Uptevia', proof: 'Les Echos · 2026-10-01' },
        { kind: 'contact_need', label: 'Veut fiabiliser ses pipelines data' },
      ],
    })
  })

  it('« Angle libre » : aucun fait imposé', () => {
    expect(groundingPayload({ mode: 'free_angle' }, facts)).toEqual({ mode: 'free_angle' })
  })

  it('rien de coché : l’angle libre, jamais « tous les signaux »', () => {
    expect(groundingPayload({ mode: 'facts', ids: [] }, facts)).toEqual({ mode: 'free_angle' })
  })

  it('aucun fait connu et aucun choix : la clé est omise (génération d’avant)', () => {
    expect(groundingPayload(null, { account: [], contact: [] })).toBeUndefined()
    expect(groundingPayload({ mode: 'facts', ids: [] }, { account: [], contact: [] })).toBeUndefined()
  })
})

describe('#4524.3 — usedGroundingFact : LE fait utilisé, jamais le nom du contact', () => {
  const facts = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
  const choice: GroundingChoice = { mode: 'facts', ids: [facts.account[1]!.id, facts.account[0]!.id] }

  it('prend le fait coché que le brouillon a réellement cité', () => {
    const used = usedGroundingFact(choice, facts, {
      specificity: {
        status: 'specifique',
        count: 1,
        minimum: 1,
        elements: [{ kind: 'dated_signal', value: 'Cession de la filiale Uptevia' }],
        unavailable: [],
      },
    })
    expect(used).toEqual({ label: 'Cession de la filiale Uptevia', proof: 'Les Echos · 2026-10-01' })
  })

  it('à défaut de citation lisible, le premier fait coché', () => {
    // Le premier dans l'ordre d'affichage (celui du dossier), pas dans l'ordre des clics.
    const clicked: GroundingChoice = { mode: 'facts', ids: [facts.account[2]!.id, facts.account[1]!.id] }
    expect(usedGroundingFact(clicked, facts, {})).toEqual({
      label: 'Recrutement de 12 ingénieurs data',
      proof: '2026-09-20',
    })
  })

  it('angle libre ou rien de coché : aucun fait (l’écran dit « Angle libre »)', () => {
    expect(usedGroundingFact({ mode: 'free_angle' }, facts, {})).toBeNull()
    expect(usedGroundingFact(null, facts, {})).toBeNull()
  })
})

describe('#4524.3 — contextElement : « Élément utilisé » du panneau', () => {
  const facts = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
  const specificity = (elements: { kind: string; value: string }[]) => ({
    specificity: { status: 'specifique', count: elements.length, minimum: 1, elements, unavailable: [] },
  })

  it('le fait coché utilisé, avec sa preuve', () => {
    const choice: GroundingChoice = { mode: 'facts', ids: [facts.account[0]!.id] }
    expect(contextElement(choice, facts, specificity([{ kind: 'precise_contact', value: 'Paul Ferrer' }]))).toEqual({
      label: 'Cession de la filiale Uptevia',
      proof: 'Les Echos · 2026-10-01',
    })
  })

  it('sans choix de faits, jamais le nom du contact : on saute son élément', () => {
    const insight = specificity([
      { kind: 'precise_contact', value: 'Paul Ferrer' },
      { kind: 'dated_signal', value: 'Note de rendez-vous du 16 octobre' },
    ])
    expect(contextElement(null, facts, insight)).toEqual({ label: 'Note de rendez-vous du 16 octobre', proof: null })
  })

  it('le seul élément cité est le contact : rien (l’écran dit « aucun élément »)', () => {
    expect(contextElement(null, facts, specificity([{ kind: 'precise_contact', value: 'Paul Ferrer' }]))).toBeNull()
  })

  it('angle libre : aucun fait du dossier n’est imposé, donc aucun élément non plus', () => {
    const insight = specificity([{ kind: 'dated_signal', value: 'Note de rendez-vous du 16 octobre' }])
    expect(contextElement({ mode: 'free_angle' }, facts, insight)).toBeNull()
  })
})

// #4524.9 — un doute d'homonyme sur la fiche : ce que le web dit de « cette » personne peut être celui d'une autre.
describe('#4524.9 — un doute d’homonyme marque les faits du CONTACT, pas ceux du compte', () => {
  it('sans doute, aucun fait n’est marqué (le défaut d’avant)', () => {
    const { account, contact } = groundingFacts({ rawAnalysis: RAW, contact: CONTACT })
    expect([...account, ...contact].some(fact => fact.homonymDoubt)).toBe(false)
  })

  it('avec un doute, les signaux ET besoins du contact sont marqués ; ceux du compte ne le sont pas', () => {
    const { account, contact } = groundingFacts({ rawAnalysis: RAW, contact: CONTACT, homonymDoubt: true })
    expect(contact.every(fact => fact.homonymDoubt)).toBe(true)
    expect(account.some(fact => fact.homonymDoubt)).toBe(false)
  })

  it('un fait douteux n’est JAMAIS coché d’emblée : le commercial le coche lui-même, en le sachant', () => {
    const one = groundingFacts({
      rawAnalysis: { recent_signals: [{ signal: 'Seul' }] },
      contact: CONTACT,
      homonymDoubt: true,
    })
    expect(defaultGroundingIds(one)).toEqual([one.account[0]?.id])
    const none = groundingFacts({ rawAnalysis: undefined, contact: CONTACT, homonymDoubt: true })
    expect(defaultGroundingIds(none)).toEqual([])
  })
})

describe('#4524.9 — le signal d’un HOMONYME du compte n’est jamais cochable', () => {
  const STILL = {
    recent_signals: [
      { signal: 'STILL recrute 40 techniciens de maintenance à Lyon', url: 'https://www.usine-digitale.fr/x' },
      { signal: 'Still Waters Farm opens a new barn', url: 'https://stillwatersfarm.com/news' },
    ],
  }

  it('sait dire NON : avec le site du compte, le fait de l’homonyme sort de la liste cochable', () => {
    const { account } = groundingFacts({ rawAnalysis: STILL, contact: {}, accountWebsite: 'https://www.still.fr' })
    expect(account.map(fact => fact.label)).toEqual(['STILL recrute 40 techniciens de maintenance à Lyon'])
  })

  it('un fait du compte reste cochable quand rien ne l’accuse (et sans site, rien n’est écarté à tort)', () => {
    const { account } = groundingFacts({
      rawAnalysis: RAW,
      contact: CONTACT,
      accountWebsite: 'https://www.uptevia.com',
    })
    expect(account).toHaveLength(3)
  })
})

describe('#4977 — l’offre d’emploi du compte se reconnaît et voyage avec son sujet', () => {
  const RAW_OFFER = {
    recent_signals: [
      { signal: 'Cession de la filiale Uptevia', date: '2026-10-01' },
      { signal: 'Expert OpenShift à Toulouse', date: '2026-10-20', type: 'recrutement' },
    ],
  }

  it('un signal de recrutement est marqué offre ; un autre non', () => {
    const { account } = groundingFacts({ rawAnalysis: RAW_OFFER, contact: {} })
    expect(account.map(fact => fact.jobOffer === true)).toEqual([false, true])
  })

  it('#4977.1 — le signal de recrutement dit sa ville quand elle est connue ; sans ville, rien n’est ajouté', () => {
    const raw = {
      recent_signals: [
        {
          signal: 'Chargé de Développement Technique',
          date: '2026-10-20',
          type: 'recrutement',
          location: 'Paris (75)',
        },
        { signal: 'Expert OpenShift à Toulouse', date: '2026-10-19', type: 'recrutement', location: 'Toulouse' },
        { signal: 'Développeur Java', date: '2026-10-18', type: 'recrutement' },
        { signal: 'Levée de fonds', date: '2026-10-17', type: 'funding', location: 'Lyon' },
      ],
    }
    const { account } = groundingFacts({ rawAnalysis: raw, contact: {} })
    expect(account.map(fact => fact.label)).toEqual([
      'Chargé de Développement Technique — Paris (75)',
      'Expert OpenShift à Toulouse', // la ville y est déjà : pas de doublon
      'Développeur Java',
      'Levée de fonds',
    ])
  })

  it('l’offre cochée part avec topic « job_offer » ; un signal ordinaire sans', () => {
    const facts = groundingFacts({ rawAnalysis: RAW_OFFER, contact: {} })
    const payload = groundingPayload({ mode: 'facts', ids: ['account-0', 'account-1'] }, facts)
    expect(payload).toEqual({
      mode: 'facts',
      facts: [
        { kind: 'account_signal', label: 'Cession de la filiale Uptevia', proof: '2026-10-01' },
        { kind: 'account_signal', label: 'Expert OpenShift à Toulouse', proof: '2026-10-20', topic: 'job_offer' },
      ],
    })
  })

  it('pour l’appel, l’offre est cochée d’emblée avant les autres signaux', () => {
    const facts = groundingFacts({ rawAnalysis: RAW_OFFER, contact: {} })
    expect(defaultGroundingIds(facts, { preferOffers: true })).toEqual(['account-1', 'account-0'])
    expect(defaultGroundingIds(facts)).toEqual(['account-0', 'account-1'])
  })

  it('callOfferState : offre cochée → son libellé ; sinon « aucune »', () => {
    const facts = groundingFacts({ rawAnalysis: RAW_OFFER, contact: {} })
    expect(callOfferLabel({ mode: 'facts', ids: ['account-1'] }, facts)).toBe('Expert OpenShift à Toulouse')
    expect(callOfferLabel({ mode: 'facts', ids: ['account-0'] }, facts)).toBeNull()
    expect(callOfferLabel({ mode: 'free_angle' }, facts)).toBeNull()
    expect(callOfferLabel(null, facts)).toBeNull()
  })

  describe('l’offre collectée (it_job_signals) devient un fait jobOffer du même modèle', () => {
    const WITH_OFFER = {
      ...RAW,
      it_job_signals: [
        {
          title: 'Data Engineer Senior',
          city: 'Lyon',
          company: 'Acme',
          date: '2026-10-20',
          url: 'https://x.example/1',
        },
        { title: 'Stagiaire data', city: 'Paris' },
      ],
    }
    it('cite le poste et la ville, avec la date comme preuve, marqué jobOffer', () => {
      const offer = groundingFacts({ rawAnalysis: WITH_OFFER, contact: CONTACT }).account.find(f => f.jobOffer)
      expect(offer).toMatchObject({ kind: 'account_signal', proof: '2026-10-20' })
      expect(offer?.label).toContain('Data Engineer Senior')
      expect(offer?.label).toContain('Lyon')
    })
    it('pour l’appel, elle est cochée d’emblée ; elle part avec topic « job_offer »', () => {
      const facts = groundingFacts({ rawAnalysis: WITH_OFFER, contact: CONTACT })
      const ids = defaultGroundingIds(facts, { preferOffers: true })
      expect(ids[0]).toBe('account-job-offer')
      const payload = groundingPayload({ mode: 'facts', ids }, facts)
      expect(payload?.mode === 'facts' && payload.facts.some(fact => fact.topic === 'job_offer')).toBe(true)
    })
    it('un stage n’est pas une offre : sans offre, aucun fait jobOffer inventé', () => {
      const stage = { ...RAW, it_job_signals: [{ title: 'Stagiaire data', city: 'Paris' }] }
      expect(groundingFacts({ rawAnalysis: stage, contact: CONTACT }).account.some(f => f.jobOffer)).toBe(false)
      expect(groundingFacts({ rawAnalysis: RAW, contact: CONTACT }).account.some(f => f.jobOffer)).toBe(false)
    })
  })

  describe('#4977.1 — l’offre RÉCENTE du compte, lue dans ses lignes de signaux (ce que l’écran montre)', () => {
    const line = (over: Record<string, unknown>) =>
      ({
        id: 'l1',
        date: '2026-10-20',
        date_precision: 'day',
        period: 'now',
        type: 'recrutement',
        title: 'Joaillier (H/F)',
        detail: null,
        url: null,
        people_hints: { names: [], roles: [], location: 'Paris' },
        ...over,
      }) as never
    const offerOf = (lines: unknown[], raw: Record<string, unknown> | undefined = RAW) =>
      groundingFacts({ rawAnalysis: raw, contact: CONTACT, signalLines: lines as never }).account.find(
        f => f.id === 'account-job-offer',
      )

    it('transmet poste + ville, la date en preuve, marquée jobOffer', () => {
      expect(offerOf([line({})])).toMatchObject({
        label: 'Joaillier (H/F) — Paris',
        proof: '2026-10-20',
        jobOffer: true,
      })
    })
    it('la plus récente gagne, et un résumé « N offres » n’est pas une offre', () => {
      const lines = [
        line({ id: 'a', title: 'Vingt offres récentes couvrent le retail', date: '2026-10-30' }),
        line({ id: 'b', title: 'Brand Identity Project Manager', date: '2026-10-25' }),
        line({ id: 'c', title: 'Joaillier (H/F)', date: '2026-10-10' }),
      ]
      expect(offerOf(lines)?.label).toContain('Brand Identity Project Manager')
    })
    it('sans ville connue, aucune ville inventée ; une offre ancienne ou un autre type ne compte pas', () => {
      expect(offerOf([line({ people_hints: { names: [], roles: [], location: null } })])?.label).toBe('Joaillier (H/F)')
      expect(offerOf([line({ period: 'past' }), line({ id: 'p', type: 'projet' })])).toBeUndefined()
      expect(offerOf([])).toBeUndefined()
    })
    it('pour l’appel, cette offre passe devant les autres offres du dossier', () => {
      const raw = { recent_signals: [{ signal: 'Offre ancienne', type: 'recrutement', date: '2026-01-01' }] }
      const facts = groundingFacts({ rawAnalysis: raw, contact: CONTACT, signalLines: [line({})] as never })
      expect(defaultGroundingIds(facts, { preferOffers: true })[0]).toBe('account-job-offer')
    })
  })
})
