import { noGoMessageRefusal } from '@bellum/contracts'
import { DEMO_ACTIVITIES, DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_USER_ACTIONS } from './demo-dataset'
import { DEMO_OUTREACH_PLAN, DEMO_PERSONAL_ACCESS_PATH_SEEDS } from './demo-seed.service'

/**
 * LOT D01 (06/10/2026) — LA RECETTE ÉCRAN DOIT POUVOIR PROUVER des fonctions déjà livrées.
 *
 * Constaté en recette démo : brouillon refusé (compte NO-GO), aucun contact « Répondu », aucun
 * relais d'introduction, aucune séquence active sur une fiche. Chaque test relit le JEU construit
 * (jamais un texte) et SAIT DIRE NON : le contrepoint nomme le cas que la garde doit refuser.
 *
 * Les interlocuteurs sont SIMULÉS (adresse en `.example`, comme `demo-contact-density.ts`) : le jeu
 * n'attribue ni réponse ni statut à une personne réelle du registre (décision Louis 04/10/2026).
 */
const carrierName = DEMO_DELIVERY_CLIENT.account.company_name
const carrier = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === carrierName)
const contacts = DEMO_DELIVERY_CLIENT.contacts
const byStatus = (status: string) => contacts.filter(contact => contact.user_status === status)

describe('lot D01 — le semis de la salle prouve ce que la recette doit voir', () => {
  it('lit un corpus NON VIDE — le compte porteur et ses interlocuteurs', () => {
    expect(carrier).toBeDefined()
    expect(contacts.length).toBeGreaterThanOrEqual(3)
  })

  it('tous les interlocuteurs créés sont SIMULÉS : adresse en `.example`, nom et e-mail en clair, aucune URL de profil', () => {
    for (const contact of contacts) {
      expect(contact.full_name.trim().length).toBeGreaterThan(0)
      expect(contact.email ?? '').toMatch(/^[a-z.]+@sncf-groupe\.example$/)
      expect(contact.phone ?? '').toMatch(/^06 39 98 \d\d \d\d$/)
      expect(contact.linkedin_url ?? null).toBeNull()
    }
  })

  describe('#3694 #3695 #3696 — un compte GO avec des contacts joignables', () => {
    it('le compte porteur n’est PAS en NO-GO : la garde de rédaction ne refuse pas', () => {
      expect(carrier?.account.sprint).not.toBe('no_go')
      expect(noGoMessageRefusal(carrier?.account.sprint, carrier?.account.sprint_reason)).toBeNull()
    })

    it('et il porte au moins trois contacts JOIGNABLES (e-mail) rédigeables', () => {
      const reachable = contacts.filter(contact => contact.email && !contact.exclusion_reason)
      expect(reachable.length).toBeGreaterThanOrEqual(3)
    })

    it('sait dire NON — Société Générale est en NO-GO et la garde refuse bien de rédiger pour elle', () => {
      const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
      expect(noGoMessageRefusal(sg?.account.sprint, sg?.account.sprint_reason)).not.toBeNull()
    })
  })

  describe('#3689 #3718 #3720 — un contact qui a répondu, avec son échange', () => {
    const [replied] = byStatus('replied')

    it('exactement un contact porte le statut `replied`', () => {
      expect(byStatus('replied')).toHaveLength(1)
    })

    it('son fil contient un message envoyé PUIS sa réponse reçue — « Traiter la réponse » et « Répondre » ont de quoi lire', () => {
      const thread = DEMO_ACTIVITIES.filter(activity => activity.contact === replied?.full_name)
      const outbound = thread.find(activity => activity.direction === 'outbound')
      const inbound = thread.find(activity => activity.direction === 'inbound')
      expect(outbound).toBeDefined()
      expect(inbound).toBeDefined()
      // Plus ancien = plus grand `daysAgo` : on écrit d'abord, on reçoit ensuite.
      expect(outbound!.daysAgo).toBeGreaterThan(inbound!.daysAgo)
      expect(inbound!.subject).toMatch(/^RE:/)
      expect(inbound!.body?.length ?? 0).toBeGreaterThan(40)
    })

    // Décision Louis 04/10/2026 (#2771) : aucune action `response_received` en
    // démo — la réponse est portée par le statut et l'échange entrant ci-dessus.
    it('aucune trace déclarée « Réponse reçue » n’est semée (#2771)', () => {
      const trace = DEMO_USER_ACTIONS.filter(action => action.action_type === 'response_received')
      expect(trace).toEqual([])
    })

    it('sait dire NON — aucune personne RÉELLE du registre ne porte une issue déclarée', () => {
      const real = (carrier?.contacts ?? []).filter(contact => contact.user_status && contact.user_status !== 'new')
      expect(real).toEqual([])
    })
  })

  describe('#3690 #3712 — un sponsor / relais d’introduction', () => {
    const sponsor = contacts.find(contact => contact.declared_person_company_relation === 'sponsor')

    it('un contact simulé est déclaré sponsor', () => {
      expect(sponsor).toBeDefined()
    })

    it('son autorisation d’introduction est ENREGISTRÉE (voie d’accès semée) et retrouvable', () => {
      const path = DEMO_PERSONAL_ACCESS_PATH_SEEDS.find(seed => seed.contact === sponsor?.full_name)
      expect(path).toBeDefined()
      expect(path?.linkKind).toBe('explicit_recommendation')
    })

    it('la réponse du sponsor qui ouvre la porte est au journal (reçue, datée avant la prise de contact des achats)', () => {
      const intro = DEMO_ACTIVITIES.find(
        activity => activity.contact === sponsor?.full_name && activity.direction === 'inbound',
      )
      const toBuyer = DEMO_ACTIVITIES.find(
        activity => activity.contact === byStatus('replied')[0]?.full_name && activity.direction === 'outbound',
      )
      expect(intro).toBeDefined()
      expect(intro!.daysAgo).toBeGreaterThan(toBuyer!.daysAgo)
    })
  })

  describe('#3700 — une séquence active sur la carte « Séquences » de la fiche', () => {
    const names = new Set(contacts.map(contact => contact.full_name))
    const mine = DEMO_OUTREACH_PLAN.filter(entry => names.has(entry.contact))

    it('un interlocuteur du compte porteur est inscrit à UNE séquence ACTIVE, première étape faite et suite à venir', () => {
      expect(mine).toHaveLength(1)
      const [entry] = mine
      expect(entry?.status).toBe('active')
      expect(entry?.steps.some(step => step.status === 'done')).toBe(true)
      expect(entry?.steps.some(step => step.status === 'pending')).toBe(true)
    })

    it('sait dire NON — les deux autres interlocuteurs n’ont AUCUNE séquence (fiche sans bloc)', () => {
      const enrolled = new Set(mine.map(entry => entry.contact))
      expect(contacts.filter(contact => !enrolled.has(contact.full_name))).toHaveLength(contacts.length - 1)
    })
  })

  describe('#3666 — un compte en cours d’analyse, dossier lisible', () => {
    const analyzing = DEMO_DOSSIERS.filter(dossier => dossier.account.analysis_status === 'analyzing')

    it('exactement un dossier est semé `analyzing`', () => {
      expect(analyzing).toHaveLength(1)
    })

    it('sa lecture précédente reste lisible, sans pourcentage semé', () => {
      const raw = analyzing[0]?.account.raw_analysis as { evaluation?: { dossier_read?: object } }
      expect(Object.keys(raw.evaluation?.dossier_read ?? {}).length).toBeGreaterThan(0)
      expect(JSON.stringify(analyzing[0]?.account.raw_analysis)).not.toMatch(/"percent"/)
    })

    it('aucune société fictive n’est créée pour l’occasion', () => {
      for (const dossier of DEMO_DOSSIERS) expect(dossier.account.website).not.toMatch(/\.example/)
    })
  })
})
