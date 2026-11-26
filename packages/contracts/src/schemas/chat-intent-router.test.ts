import { describe, expect, it } from 'vitest'

import { UNROUTED_INTENT_CATEGORIES } from './laura-unrouted-intent.js'
import {
  CHAT_INTENT_KINDS,
  CHAT_INTENT_PIPELINE,
  CHAT_INTENT_ROUTE_FIELDS,
  CHAT_INTENT_ROUTING_TABLE,
  UNDECLARED_CHAT_INTENT,
  chatIntentRouteSchema,
  routeChatIntent,
} from './chat-intent-router.js'

/**
 * #2321 — LE ROUTEUR D'INTENTION de Laura (LAU-FINAL-062).
 *
 * Mesuré le 22/09/2026 : aucun compilateur `/chat` n'existait — `chat_tools.py`
 * porte soixante outils, et RIEN ne lisait une demande pour décider lequel
 * appeler. Le contrat de demande (`request-intent-contract.ts`, #2257) nommait
 * dix-huit champs dont deux seulement avaient un producteur ; ce routeur est le
 * producteur qui manquait pour quatre d'entre eux.
 *
 * Ces tests tiennent surtout ce que le routeur doit savoir REFUSER : une demande
 * qu'il ne reconnaît pas, une capacité qu'il n'a pas, et les trois NO-GO que le
 * ticket écrit noir sur blanc.
 */
describe('routeur d’intention de Laura (#2321)', () => {
  it('déclare les dix intentions du ticket #2321, plus les six de #3175.3 et le défaut qui ATTEND', () => {
    expect(CHAT_INTENT_KINDS).toHaveLength(16)
    expect((CHAT_INTENT_KINDS as readonly string[]).includes(UNDECLARED_CHAT_INTENT)).toBe(false)
  })

  it('rend une route conforme au schéma, tous champs nommés', () => {
    const route = routeChatIntent({ message: 'Je cherche du business dans la banque' })
    const parsed = chatIntentRouteSchema.parse(route)
    for (const field of CHAT_INTENT_ROUTE_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(parsed, field)).toBe(true)
    }
  })

  // ── Les dix intentions (#2321.1 à #2321.10) ────────────────────────────────

  it.each([
    ['Je cherche du business dans l’assurance', 'chercher_du_business'],
    ['I am looking for new business in insurance', 'chercher_du_business'],
    ['J’ai appris que Renault ouvre un centre de services', 'information_client'],
    ['I heard that Renault is opening a service centre', 'information_client'],
    ['J’ai un besoin : deux devops pour janvier', 'besoin'],
    ['I have a need: two devops engineers for January', 'besoin'],
    ['J’ai un profil de data engineer disponible', 'profil'],
    ['I have a profile, a data engineer available now', 'profil'],
    ['Peux-tu matcher ce besoin avec le vivier ?', 'matcher'],
    ['Can you match this need with the bench?', 'matcher'],
    ['Je veux proposer une shortlist au client', 'proposer'],
    ['I want to propose a shortlist to the client', 'proposer'],
    ['J’ai un retour du client sur la candidature', 'retour'],
    ['I have feedback from the client on the application', 'retour'],
    ['C’est signé, le bon de commande est arrivé', 'signe'],
    ['It is signed, the purchase order arrived', 'signe'],
    ['Je veux importer mon existant, mes CV et mes besoins', 'importer'],
    ['I want to import my existing data, my CVs and my needs', 'importer'],
    ['Je ne sais pas quoi faire aujourd’hui', 'diagnostic'],
    ['I do not know what to do today', 'diagnostic'],
    ['Peux-tu comparer ces comptes ?', 'comparer'],
    ['Can you compare these accounts?', 'comparer'],
    ['Qui contacter chez Airbus ?', 'trouver_contacts'],
    ['Find contacts at Airbus', 'trouver_contacts'],
    ['Quel est le bon périmètre chez Airbus ?', 'choisir_perimetre'],
    ['Which perimeter should I target at Airbus?', 'choisir_perimetre'],
    ['Challenge ce compte : est-ce le bon compte ?', 'challenger_un_compte'],
    ['Is this the right account?', 'challenger_un_compte'],
    ["Comprendre l'écosystème de ce compte", 'comprendre_ecosysteme'],
    ['Map the ecosystem around Airbus', 'comprendre_ecosysteme'],
  ])('reconnaît « %s » comme l’intention %s', (message, expected) => {
    expect(routeChatIntent({ message }).intent).toBe(expected)
  })

  // ── #3175.3 (épopée #3215) — « comparer des options » / « trouver des contacts » ──

  it('#3175.3 sert « comparer » avec `compare_accounts`, sans capacité absente', () => {
    const route = routeChatIntent({ message: 'Peux-tu comparer mes comptes Société Générale et BNP ?' })
    expect(route.intent).toBe('comparer')
    expect(route.tools).toEqual(['compare_accounts'])
    expect(route.capability_gap).toBeNull()
    expect(route.awaits_human).toBe(false)
  })

  it('#3175.3 sert « trouver_contacts » avec les deux outils réels, sans capacité absente', () => {
    const route = routeChatIntent({ message: 'Qui contacter chez Airbus ?' })
    expect(route.intent).toBe('trouver_contacts')
    expect(route.tools).toEqual(['get_account_contacts', 'search_workspace_contacts'])
    expect(route.capability_gap).toBeNull()
    expect(route.awaits_human).toBe(false)
  })

  it('#3175.3 reconnaît « actualiser » mais nomme sa capacité absente, sans inventer d’outil', () => {
    const route = routeChatIntent({ message: 'Peux-tu actualiser ce compte ?' })
    expect(route.intent).toBe('actualiser')
    expect(route.tools).toEqual([])
    expect(route.capability_gap).toBe('relance_dune_analyse_existante_depuis_le_chat')
    expect(route.awaits_human).toBe(true)
    expect(route.unrouted_category).toBe('capacite_absente')
  })

  it('#3175.3 sert « choisir_perimetre » avec `resolve_account_territory`, sans capacité absente', () => {
    const route = routeChatIntent({ message: 'Quel est le bon périmètre chez Airbus ?' })
    expect(route.intent).toBe('choisir_perimetre')
    expect(route.tools).toEqual(['resolve_account_territory'])
    expect(route.capability_gap).toBeNull()
    expect(route.awaits_human).toBe(false)
  })

  it('#3175.3 sert « challenger_un_compte » et « comprendre_ecosysteme » avec de vrais outils', () => {
    const challenge = routeChatIntent({ message: 'Est-ce le bon compte ?' })
    expect(challenge.intent).toBe('challenger_un_compte')
    expect(challenge.tools).toEqual(['get_account_interest_penetrability', 'suggest_account_alternatives'])
    const ecosystem = routeChatIntent({ message: "Comprendre l'écosystème de ce compte" })
    expect(ecosystem.intent).toBe('comprendre_ecosysteme')
    expect(ecosystem.tools).toEqual(['get_account_coverage_map', 'get_esn_on_account'])
    expect(ecosystem.capability_gap).toBeNull()
  })

  it('#3175.3 sait dire NON : une simple mention ne route pas', () => {
    expect(routeChatIntent({ message: 'Mon compte est ouvert chez Airbus' }).intent).not.toBe('challenger_un_compte')
    expect(routeChatIntent({ message: 'Un écosystème de startups' }).intent).not.toBe('comprendre_ecosysteme')
  })

  // ── Le défaut qui ATTEND (doctrine, jumeau d’UNDECLARED_INTENT_SITE) ───────

  it('sait dire NON : une demande sans aucun marqueur déclaré n’est pas routée, et ATTEND', () => {
    const route = routeChatIntent({ message: 'Bonjour, ça va bien ?' })
    expect(route.intent).toBe(UNDECLARED_CHAT_INTENT)
    expect(route.awaits_human).toBe(true)
    expect(route.unrouted_category).toBe('intention_incomprise')
    expect(route.tools).toEqual([])
    expect(route.expected_result).toBeNull()
    expect(route.canonical_object).toBeNull()
  })

  it('sait dire NON : une demande HORS PÉRIMÈTRE (comptabilité) n’est pas routée — BellumAI SUIT le financier, il ne COMPTABILISE pas', () => {
    for (const message of ['Passe-moi l’écriture comptable de cette facture', 'Show me the general ledger entry']) {
      const route = routeChatIntent({ message })
      expect(route.intent).toBe(UNDECLARED_CHAT_INTENT)
      expect(route.unrouted_category).toBe('hors_perimetre')
      expect(route.awaits_human).toBe(true)
    }
  })

  it('n’emploie que les trois catégories existantes — jamais une quatrième inventée', () => {
    const categories = [
      routeChatIntent({ message: 'Bonjour' }).unrouted_category,
      routeChatIntent({ message: 'plan comptable' }).unrouted_category,
      routeChatIntent({ message: 'J’ai un retour du client' }).unrouted_category,
    ]
    for (const category of categories) {
      if (category !== null) expect((UNROUTED_INTENT_CATEGORIES as readonly string[]).includes(category)).toBe(true)
    }
  })

  // ── #2321.22 — LE NO-GO EXPLICITE DU TICKET ───────────────────────────────

  it('#2321.22 — « à qui vendre ce consultant ? » route vers le MARCHÉ INVERSE, jamais vers un simple matching', () => {
    for (const message of ['À qui vendre ce consultant ?', 'Who should I sell this consultant to?']) {
      const route = routeChatIntent({ message })
      expect(route.expected_result).toBe('marche_inverse')
      expect(route.intent).not.toBe('matcher')
      expect(route.expected_result).not.toBe('liste_de_correspondances')
    }
  })

  it('#2321.22 — le marché inverse gagne MÊME quand la phrase porte aussi les marqueurs de « proposer »', () => {
    const route = routeChatIntent({ message: 'À qui proposer ce consultant en shortlist ?' })
    expect(route.expected_result).toBe('marche_inverse')
  })

  // ── #2321.18 / #2321.19 — le job séquencé et le no-go du saut d’étape ─────

  it('#2321.18 — une demande multi-intentions rend un job SÉQUENCÉ, dans l’ordre du pipeline', () => {
    const route = routeChatIntent({
      message: 'J’ai un besoin de deux devops, trouve-moi les profils et prépare la shortlist',
    })
    expect(route.steps.length).toBeGreaterThan(1)
    const indexes = route.steps.map(step => CHAT_INTENT_PIPELINE.indexOf(step))
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
  })

  it('#2321.19 — sait dire NON au saut d’étape : un besoin + un e-mail ne rend JAMAIS l’étape finale seule', () => {
    const route = routeChatIntent({
      message: 'J’ai un besoin de deux devops, envoie un mail au client avec les profils',
    })
    expect(route.steps).not.toEqual(['preparer_le_message'])
    expect(route.steps[0]).toBe('qualifier_le_besoin')
    expect(route.steps[route.steps.length - 1]).toBe('preparer_le_message')
    // Contigu : aucune étape intermédiaire sautée.
    const first = CHAT_INTENT_PIPELINE.indexOf(route.steps[0]!)
    expect(route.steps).toEqual(CHAT_INTENT_PIPELINE.slice(first, first + route.steps.length))
  })

  it('le copilote PRÉPARE, il n’envoie jamais : l’étape terminale est une préparation qui attend', () => {
    // ⚠️ La demande porte une VRAIE intention (« proposer ») en plus du mail :
    // « envoie un mail » tout seul n’est aucune des dix intentions du ticket, et
    // le routeur n’en invente pas une onzième pour lui faire plaisir.
    const route = routeChatIntent({ message: 'Je veux proposer ce profil, prépare le message pour le client' })
    expect(route.steps).toContain('preparer_le_message')
    expect(CHAT_INTENT_PIPELINE).not.toContain('envoyer_le_message')
    expect(route.awaits_validation).toContain('preparer_le_message')
    expect(route.produces_now).not.toContain('preparer_le_message')
    expect(route.awaits_human).toBe(true)
  })

  // ── #2321.12 / #2321.13 / #2321.14 — résultat, objet canonique, données ───

  it('#2321.12 — nomme le RÉSULTAT ATTENDU, dans un vocabulaire fermé — jamais une phrase libre', () => {
    expect(routeChatIntent({ message: 'Je cherche du business' }).expected_result).toBe('liste_de_comptes')
    expect(routeChatIntent({ message: 'Peux-tu matcher ce besoin ?' }).expected_result).toBe('liste_de_correspondances')
  })

  it('#2321.13 — nomme l’OBJET CANONIQUE concerné (need / consultant / mission / submission)', () => {
    expect(routeChatIntent({ message: 'J’ai un besoin de deux devops' }).canonical_object).toBe('need')
    expect(routeChatIntent({ message: 'J’ai un retour du client' }).canonical_object).toBe('submission')
    expect(routeChatIntent({ message: 'C’est signé, bon de commande reçu' }).canonical_object).toBe('mission')
    expect(routeChatIntent({ message: 'J’ai un profil disponible' }).canonical_object).toBe('consultant')
  })

  it('#2321.14 — les données PRÉSENTES viennent de ce que l’appelant a déjà résolu, jamais devinées du texte', () => {
    const sansRien = routeChatIntent({ message: 'Peux-tu matcher ce besoin ?' })
    expect(sansRien.known_inputs).toEqual([])
    expect(sansRien.missing_inputs).toContain('besoin_cite')

    const avec = routeChatIntent({ message: 'Peux-tu matcher ce besoin ?', availableInputs: ['besoin_cite'] })
    expect(avec.known_inputs).toEqual(['besoin_cite'])
    expect(avec.missing_inputs).toEqual([])
  })

  it('#2321.11 — le POINT DE DÉPART est le compte actif déjà résolu, jamais extrait du message', () => {
    expect(
      routeChatIntent({ message: 'Je cherche du business', activeAccountCompanyName: 'ACME' }).starting_point,
    ).toBe('ACME')
    expect(routeChatIntent({ message: 'Je cherche du business' }).starting_point).toBeNull()
  })

  // ── #2321.15 / #2321.16 — capacité absente, et ce qui attend ──────────────

  it('une intention RECONNUE sans capacité le DIT — elle n’invente pas un outil', () => {
    const route = routeChatIntent({ message: 'J’ai un retour du client sur la candidature' })
    expect(route.intent).toBe('retour')
    expect(route.tools).toEqual([])
    expect(route.unrouted_category).toBe('capacite_absente')
    expect(route.awaits_human).toBe(true)
    expect(route.capability_gap).not.toBeNull()
  })

  it('une intention SERVIE produit tout de suite et ne demande aucune validation', () => {
    const route = routeChatIntent({ message: 'Je ne sais pas par où commencer' })
    expect(route.intent).toBe('diagnostic')
    expect(route.tools.length).toBeGreaterThan(0)
    expect(route.unrouted_category).toBeNull()
    expect(route.awaits_human).toBe(false)
  })

  // ── #2321.20 — l’hypothèse s’affiche COMME une hypothèse, avec son motif ──

  it('#2321.20 — un marqueur unique rend une HYPOTHÈSE, nommée comme telle, avec son motif consultable', () => {
    const route = routeChatIntent({ message: 'shortlist' })
    expect(route.confidence).toBe('hypothese')
    expect(route.reasoning).not.toBeNull()
  })

  it('le motif ne cite JAMAIS le texte de l’utilisateur — seulement un marqueur DÉCLARÉ', () => {
    const secret = 'mon mot de passe est hunter2'
    const route = routeChatIntent({ message: `Je cherche du business, ${secret}` })
    expect(route.reasoning ?? '').not.toContain('hunter2')
    expect(route.reasoning ?? '').not.toContain(secret)
  })

  it('aucune PROBABILITÉ ne sort du routeur — deux niveaux nommés, jamais un nombre', () => {
    const route = routeChatIntent({ message: 'Je cherche du business et des prospects' })
    expect(route.confidence).toBe('certaine')
    expect(typeof route.confidence).toBe('string')
    for (const value of Object.values(route)) {
      expect(typeof value).not.toBe('number')
    }
  })

  // ── #2321.17 — NO-GO : ne jamais répondre en citant le nom d’une page ─────

  it('#2321.17 — une route nomme un OUTIL, jamais un nom de page ; et sans outil elle ne prétend rien produire', () => {
    const pageLabels = ['vivier', 'découvrir', 'decouvrir', 'comptes', 'contacts', 'missions', 'réglages']
    expect(Object.keys(CHAT_INTENT_ROUTING_TABLE)).toHaveLength(CHAT_INTENT_KINDS.length)
    for (const kind of CHAT_INTENT_KINDS) {
      const entry = CHAT_INTENT_ROUTING_TABLE[kind]
      for (const tool of entry.tools) {
        expect(pageLabels).not.toContain(tool.toLowerCase())
        // Un nom d’outil, c’est du snake_case machine — pas un libellé humain.
        expect(tool).toMatch(/^[a-z][a-z0-9_]*$/)
      }
      // Une intention sans outil NOMME son manque plutôt que d’inventer.
      if (entry.tools.length === 0) expect(entry.capability_gap).not.toBeNull()
    }
  })

  it('une route sans outil ne porte AUCUNE étape produite immédiatement', () => {
    const route = routeChatIntent({ message: 'J’ai un retour du client' })
    expect(route.tools).toEqual([])
    expect(route.produces_now).toEqual([])
  })

  // ── La normalisation, qui doit lire l’accent comme le sans-accent ─────────

  it('sait dire NON à une SOUS-CHAÎNE : « candidature » ne déclenche pas le marqueur « candidat »', () => {
    // Défaut mesuré le 22/09/2026 en lisant le bloc rendu : « j’ai un retour du
    // client sur la CANDIDATURE » attrapait le marqueur `candidat` de
    // l’intention « profil », et collait une étape « trouver les profils » à une
    // demande qui n’en parlait pas.
    const route = routeChatIntent({ message: 'J’ai un retour du client sur la candidature' })
    expect(route.intent).toBe('retour')
    expect(route.steps).toEqual([])
    // Le marqueur AUTONOME, lui, doit toujours être lu.
    expect(routeChatIntent({ message: 'J’ai un candidat disponible' }).intent).toBe('profil')
  })

  it('lit une demande accentuée comme sa forme sans accent, et la casse ne change rien', () => {
    expect(routeChatIntent({ message: 'C’EST SIGNÉ' }).intent).toBe('signe')
    expect(routeChatIntent({ message: "c'est signe" }).intent).toBe('signe')
  })

  // ── #3856 (BEL-LAU-1008-005) — une demande composée garde tous ses livrables ──

  it('une demande composée garde les outils de chaque intention matchée, winner d’abord', () => {
    // « comptes, interlocuteurs et stratégie » ne doit pas devenir une seule
    // recherche de sociétés : avant ce lot, seuls les outils de l'intention
    // GAGNANTE sortaient de la route (winner-takes-all).
    const route = routeChatIntent({
      message: 'Trouve-moi des comptes dans la banque, avec les contacts de chaque entreprise.',
    })
    expect(route.intent).toBe('chercher_du_business')
    expect(route.tools.slice(0, 2)).toEqual(['find_accounts', 'run_account_search'])
    expect(route.tools).toContain('get_account_contacts')
    expect(route.tools).toContain('search_workspace_contacts')
  })

  it('une demande simple ne rend toujours que les outils de son intention', () => {
    const route = routeChatIntent({ message: 'Qui contacter chez Airbus ?' })
    expect(route.tools).toEqual(['get_account_contacts', 'search_workspace_contacts'])
  })

  // #2257.35 — les travaux FACULTATIFS : jumeau des tests Python.
  describe('travaux facultatifs (#2257.35)', () => {
    it('pose l’étape facultative, la garde dans le plan et ne la lance jamais d’office', () => {
      const route = routeChatIntent({
        message:
          'J’ai un besoin de profils Java, un besoin urgent, et accessoirement je veux aussi proposer une shortlist plus tard',
      })
      expect(route.optional_steps).toEqual(['construire_la_shortlist'])
      expect(route.optional_reason).toBe('accessoirement')
      expect(route.steps).toContain('construire_la_shortlist')
      expect(route.produces_now).not.toContain('construire_la_shortlist')
      expect(route.intent).toBe('besoin')
      expect(chatIntentRouteSchema.parse(route).optional_steps).toEqual(['construire_la_shortlist'])
    })

    it('ne bloque pas le résultat principal : l’étape facultative n’attend aucune validation', () => {
      const route = routeChatIntent({
        message: 'Je veux proposer ce profil, prépare le message pour le client si tu as le temps',
      })
      expect(route.optional_steps).toContain('preparer_le_message')
      expect(route.awaits_validation).toEqual(['faire_valider_la_shortlist'])
      expect(route.produces_now).not.toContain('preparer_le_message')
    })

    it('contrôle négatif : sans marqueur déclaré, rien n’est facultatif', () => {
      const route = routeChatIntent({
        message: 'J’ai un besoin de profils Java, un besoin urgent, et je veux aussi proposer une shortlist',
      })
      expect(route.optional_steps).toEqual([])
      expect(route.optional_reason).toBeNull()
      expect(route.produces_now).toEqual(['qualifier_le_besoin', 'trouver_les_profils', 'construire_la_shortlist'])
    })

    it('le résultat demandé n’est jamais facultatif', () => {
      const route = routeChatIntent({ message: 'J’ai un profil de data engineer disponible, si possible' })
      expect(route.optional_steps).toEqual([])
    })
  })
})
