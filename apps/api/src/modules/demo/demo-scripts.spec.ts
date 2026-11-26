import { DEMO_DISCOVER_BRAND_GROUP_COVERAGE } from './demo-coverage'
import { bidDecisionSchema, discoverResponseSchema, rfpRequirementSchema } from '@bellum/contracts'
import { randomUUID } from 'node:crypto'
import { demoDiscoverResponse, demoRfpAnalysis, demoRfpDraft } from './demo-scripts'

/**
 * Les réponses scriptées doivent respecter les CONTRATS, pas seulement compiler.
 *
 * Vu en production, dans l'heure qui a suivi leur mise en ligne : deux formes
 * écrites « à la main » ne portaient pas les champs du contrat, et l'écran, qui
 * les parcourt, tombait.
 *
 * - la décision d'appel d'offres avait une clé inventée (`blockers`) au lieu de
 *   `redFlags` / `questions`, si bien que l'écran affichait « Une erreur
 *   inattendue est survenue » à la place du dossier ;
 * - les signaux de Découvrir n'avaient pas de `type` (l'enum du contrat) : les
 *   cinq candidats étaient rejetés à la validation et l'écran annonçait
 *   « aucune entreprise ne correspond », c'est-à-dire l'inverse de ce qu'on
 *   voulait montrer.
 *
 * Un objet écrit à la main dérive de son contrat sans bruit. TypeScript ne
 * l'attrape pas — ces fonctions rendent des types larges, exprès, pour ne pas
 * faire dépendre le module de démonstration des types du contrat. C'est donc ce
 * test qui tient la promesse : il confronte chaque forme au schéma zod réel.
 */

describe('les scripts de démonstration respectent les contrats', () => {
  it('la décision d’appel d’offres est une vraie `BidDecision`', () => {
    const parsed = bidDecisionSchema.safeParse(demoRfpAnalysis('Consultation').decision)
    expect(parsed.success).toBe(true)
  })

  it('la décision porte les champs que l’écran PARCOURT, SANS passer par zod', () => {
    // Le test précédent ne suffit pas : `redFlags` et `questions` ont un
    // `.default([])`, si bien que zod les FABRIQUE et qu'une forme incomplète le
    // passe quand même. Or l'API ne parse pas la décision — elle la stocke telle
    // quelle et la rend telle quelle, et c'est l'écran qui appelle `.map`.
    // C'est donc l'objet BRUT qu'il faut regarder ; c'est la forme exacte du
    // plan blanc vu en production.
    const decision = demoRfpAnalysis('Consultation').decision as Record<string, unknown>
    for (const key of ['redFlags', 'questions', 'conditions']) {
      expect(Array.isArray(decision[key])).toBe(true)
    }
    expect(decision['rationale']).toEqual(expect.any(String))
    // Et aucune clé inventée : c'est « blockers » qui avait remplacé `redFlags`.
    expect(Object.keys(decision).sort()).toEqual(
      ['capacity', 'conditions', 'fit', 'questions', 'rationale', 'redFlags', 'verdict'].sort(),
    )
  })

  it('chaque exigence scriptée passe le contrat d’exigence', () => {
    // Les exigences traversent le normaliseur du service avant d'être écrites ;
    // on vérifie ici qu'elles en sortent conformes, avec le même vocabulaire.
    for (const raw of demoRfpAnalysis('Consultation').requirements) {
      const item = raw as Record<string, unknown>
      const parsed = rfpRequirementSchema.safeParse({
        id: randomUUID(),
        rfp_id: randomUUID(),
        section: item['section'] ?? null,
        text: item['text'],
        weight: item['weight'],
        kind: item['kind'],
        owner_role: item['ownerRole'],
        answer_status: 'to_produce',
        answer_source: null,
        answer_text: null,
        risk: item['risk'] ?? null,
        source_document: null,
      })
      expect(parsed.success).toBe(true)
    }
  })

  it('la réponse de Découvrir est une vraie `DiscoverResponse`', () => {
    const parsed = discoverResponseSchema.safeParse(demoDiscoverResponse({ sector: 'Informatique' }))
    expect(parsed.success).toBe(true)
  })

  it('les douze candidats survivent à la validation — sinon l’écran est vide', () => {
    // #2489.3/D1 — `includeOutOfTarget: true` : ce test vérifie le SCHÉMA de
    // chaque candidat scripté, pas le filtre cible (qui a ses propres tests
    // plus bas, « la cible déclarée… »).
    // #2614.1 — un huitième candidat a rejoint la liste (le conseil de
    // qualification l'écarte, voir plus bas).
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    // #3238 : Naval Group ; #3757 : Orvane (ESN) ; #3757 (reste) : Askelia (partenaire déclaré) ;
    // #3814.3 : Vaucelle Holding (« 0 salarié ») ; #3819.4 : Castelnau Ingénierie (aucun signal).
    // #3983 (reste) : Groupe Aurélys (holding écartée au profit de sa filiale).
    // #4284.26 : Maison Delcourt Proximité (compte hors métier, marqué).
    // #4284.27 (#4758) : Vauclair Logistique (le compte qui remonte sur son SEUL historique).
    // #4819.4 : Castaing Transports (son SEUL signal récent est une offre fermée).
    // Lot T : Calderis Ingénierie (une ESN reconnue par ses OFFRES).
    expect(parsed.candidates).toHaveLength(42)
  })

  /**
   * #2544.2 — PARITÉ DÉMO DU BLOC « PERSONNES » (craft rule n°9).
   *
   * Le bloc est user-facing : sans personne sur aucun candidat de
   * démonstration, un prospect ne verrait jamais qu'il existe, et le découvrir
   * en réunion est exactement ce que la règle évite.
   *
   * Ce que la salle doit montrer, et que ces assertions tiennent :
   *
   * · des personnes NOMMÉES, avec leur provenance et leur date ;
   * · au moins une dont le MANDAT est inconnu, pour que le visiteur voie le
   *   produit dire « non su » plutôt que remplir ;
   * · AUCUN lieu de travail — parce qu'aucune source vérifiée n'en donne, et
   *   qu'une démonstration qui en montrerait un enseignerait un comportement
   *   que le vrai produit n'a pas ;
   * · au moins un candidat SANS personne, pour que l'absence du bloc soit elle
   *   aussi représentée.
   */
  it('#2544.2 — la démonstration montre des personnes nommées, et ce qu’elle ignore d’elles', () => {
    // #2489.3/D1 — `includeOutOfTarget: true` : ce test tient les invariants du
    // bloc PERSONNES sur les sept candidats scriptés, pas le filtre cible (qui
    // a ses propres tests plus bas). Sans ce paramètre, le filtre cible écarte
    // cinq des sept candidats par défaut et les invariants qu'ils portent
    // (mandat inconnu, candidat sans personne) ne seraient plus mesurés ici.
    const { candidates } = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const withPeople = candidates.filter(candidate => (candidate.people?.length ?? 0) > 0)
    expect(withPeople.length).toBeGreaterThan(0)
    expect(candidates.some(candidate => (candidate.people?.length ?? 0) === 0)).toBe(true)

    const people = withPeople.flatMap(candidate => candidate.people ?? [])
    for (const person of people) {
      expect(person.name.value.length).toBeGreaterThan(0)
      expect(person.name.observedAt.length).toBeGreaterThan(0)
      // Aucune source vérifiée ne rattache une personne à un établissement :
      // la démonstration ne prétend pas le contraire.
      expect(person.workplace).toBeUndefined()
    }
    expect(people.some(person => person.role === undefined)).toBe(true)
    expect(people.some(person => person.role !== undefined)).toBe(true)
  })

  /**
   * #2546.2 — mesuré à l'écran le 18/09/2026 : la carte « Verdal Distribution
   * (démo) » affichait « Sources : une source de données ». Chaque candidat
   * portait `sources: [{ name: 'Jeu de démonstration', ... }]` — un nom que
   * `dataSourceLabel` (apps/web/src/lib/data-source-label.ts) ne reconnaît
   * pas, donc replié sur le libellé générique `unknown`.
   *
   * La nature existait déjà, dans `signal.type` (`discoverSignalTypeSchema`,
   * cinq valeurs exhaustives, packages/contracts/src/schemas/discover.ts:30 —
   * « BOAMP … DECP … France Travail … BODACC … tech-detect »). Ce témoin
   * rougit si un candidat garde le nom du jeu de données au lieu du registre
   * réel que désignent SES PROPRES signaux.
   */
  it('#2546.2 — chaque candidat nomme le registre réel de ses signaux, jamais le jeu de données', () => {
    const REGISTRY_BY_TYPE: Record<string, string> = {
      tender: 'BOAMP',
      award: 'DECP',
      hiring: 'France Travail',
      legal: 'BODACC',
      tech: 'market-memory',
      funding: 'funding-feed',
    }
    // #2489.3/D1 — roster COMPLET : ce test couvre chaque candidat scripté,
    // pas seulement ceux dans la cible déclarée de la démo.
    const candidates = demoDiscoverResponse({ includeOutOfTarget: true }).candidates as Array<{
      name: string
      signals: Array<{ type: string }>
      sources: Array<{ name: string }>
    }>
    expect(candidates.length).toBeGreaterThan(0)
    for (const candidate of candidates) {
      const sourceNames = candidate.sources.map(s => s.name)
      expect([candidate.name, sourceNames]).toEqual([
        candidate.name,
        sourceNames.filter(n => n !== 'Jeu de démonstration'),
      ])
      // #4068/#4115 — une actualité (`business`) est HISTORISÉE, jamais un registre : elle ne
      // nomme aucune source (`sourcesFromSignals` la saute), exactement comme le vrai chemin.
      const expected = [
        ...new Set(candidate.signals.filter(s => s.type !== 'business').map(s => REGISTRY_BY_TYPE[s.type])),
      ]
      expect([candidate.name, sourceNames]).toEqual([candidate.name, expected])
    }
  })

  it('#2546.2 — Verdal Distribution (legal + hiring) nomme BODACC ET France Travail', () => {
    // Verdal (« Grande distribution & retail ») est HORS de la cible déclarée
    // de la démo (#2489.3/D1) — `includeOutOfTarget: true` pour l'atteindre.
    const verdal = (
      demoDiscoverResponse({ includeOutOfTarget: true }).candidates as Array<{
        name: string
        sources: Array<{ name: string }>
      }>
    ).find(c => c.name === 'Verdal Distribution (démo)')
    expect(verdal?.sources.map(s => s.name)).toEqual(['BODACC', 'France Travail'])
  })

  it('HONORE le filtre de secteur au lieu de tout rendre', () => {
    // Trouvé par la recette live du 04/09/2026 : cocher « Aéronautique &
    // spatial » rendait une enseigne de grande distribution (NAF 47.11F). La
    // fonction recevait la requête et se contentait de la RENVOYER.
    //
    // Le lien de démonstration est ce qu'un prospect voit du produit : un
    // filtre qui ne filtre visiblement rien lui apprend que le produit est
    // cassé.
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ nafCode: '30.30Z,25.40Z' }))
    expect(parsed.candidates.map(c => c.nafCode)).toEqual(['30.30Z', '25.40Z', '30.30Z'])
  })

  /**
   * #2489.3/D1 (décision Louis 18/09/2026 après-midi) — la démo DOIT montrer
   * le filtre cible à l'œuvre (craft rule n°9), pas juste sa présence dans le
   * code. `DEMO_ESN_PROFILE.target_sectors` (banque, aéronautique & défense,
   * tech, transport) ne couvre que 2 des 7 candidats scriptés.
   */
  it('la cible déclarée écarte les candidats hors secteur PAR DÉFAUT, et le dit', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({}))

    // Pharmatek Santé (« Santé PRIVÉE — cliniques & imagerie ») survit : le mot
    // « privée » retrouve celui de « Banque de détail & Banque PRIVÉE » — le
    // MÊME appariement mot-clé que le vrai chemin (`matchesTargetSectors`,
    // GA-26), avec la même limite assumée ailleurs dans ce dépôt.
    expect(parsed.candidates.map(c => c.name)).toEqual([
      'Verdal Distribution (démo)',
      // #4284.26 (recette 21/10) — le compte « hors de ton métier » reste dans la liste (marqué, jamais caché).
      'Maison Delcourt Proximité (démo)',
      'Pharmatek Santé (démo)',
      'Aubrac Aerostructures (démo)',
      'Cévennes Défense Systèmes (démo)',
      // #2614.1 — même secteur qu'Aubrac (aéronautique & spatial), donc dans
      // la cible : la vue PAR DÉFAUT montre le candidat exclu, pas seulement
      // la vue élargie — sinon le masquage ne se verrait qu'en cochant
      // « chercher hors de ma cible », un geste que le retour ne demande pas.
      'Roggeman Structures — M. Roggeman (démo)',
      // #3983 (reste) — la holding écartée au profit de sa filiale (« Santé privée », dans la cible).
      'Groupe Aurélys (démo)',
      // #3238 — Naval Group (compte réel des briefs, secteur Défense dans la cible).
      'Naval Group',
      // #3757 — une ESN passe APRÈS les clients finaux et porte le drapeau `isEsnPeer`.
      'Orvane Digital Services (démo)',
      // Lot T — une ESN reconnue par ses OFFRES (NAF 71.12B), motif « ses offres le disent ».
      'Calderis Ingénierie (démo)',
      // #3757 (reste) — un partenaire DÉCLARÉ par l'espace, même secteur qu'Orvane,
      // porte son propre drapeau `isDeclaredPartner`, jamais `isEsnPeer`.
      'Askelia Partners (démo)',
      // #4814 — intérim, VMS, MSP, apporteur d'affaires : `isIntermediary`, retirés par « Clients finaux ».
      'Ouest Intérim Services (démo)',
      'Vendorly Flex (démo)',
      'Sourcia Managed Staffing (démo)',
      'Passerelle Affaires Conseil (démo)',
      // #3819.4 — aucun signal mesuré (secteur Aéronautique & Défense, dans la cible).
      'Castelnau Ingénierie (démo)',
      // #4284.27 (#4758) — le compte qui remonte sur son SEUL historique de besoins : « Transport &
      // Logistique » apparie « transport » de la cible déclarée, il reste donc dans la vue PAR DÉFAUT.
      'Vauclair Logistique (démo)',
      // #4819.4 — son seul signal récent est une offre FERMÉE : historique, pas « récent ».
      'Castaing Transports (démo)',
      // R24-FIX-B — de vraies entreprises (banque, assurance, aéronautique, télécoms), dans la cible.
      'BNP Paribas',
      'Société Générale',
      'Groupe BPCE',
      'Natixis',
      'La Banque Postale',
      'Crédit Agricole S.A.',
      'Crédit Mutuel Arkéa',
      'AXA',
      'CNP Assurances',
      'Groupama',
      'Covéa',
      'Airbus',
      'Thales',
      'Orange',
      // #3819.1 (RBB2) — le compte client semé : « N besoins connus » (transport, dans la cible).
      'SNCF',
      // #4892.1 — une marque = une ligne : deux entités fictives de la même marque (tête puis membre).
      'Valcourt France (démo)',
      'Maison Valcourt (démo)',
    ])
    expect(parsed.candidates.filter(c => c.isEsnPeer).map(c => c.name)).toEqual([
      'Orvane Digital Services (démo)',
      'Calderis Ingénierie (démo)',
    ])
    expect(parsed.candidates.find(c => c.name === 'Calderis Ingénierie (démo)')?.esnRecognition).toBe('offers')
    expect(parsed.candidates.filter(c => c.isDeclaredPartner).map(c => c.name)).toEqual(['Askelia Partners (démo)'])
    // #4814 — les quatre familles portent le drapeau que le filtre « Clients finaux » lit, et elles seules.
    expect(parsed.candidates.filter(c => c.isIntermediary).map(c => c.name)).toEqual([
      'Ouest Intérim Services (démo)',
      'Vendorly Flex (démo)',
      'Sourcia Managed Staffing (démo)',
      'Passerelle Affaires Conseil (démo)',
    ])
    expect(parsed.targetSectorFilter).toEqual({
      applied: true,
      excludedCount: 7,
      excludedSectors: [
        'Commerce & distribution',
        'Industrie — construction automobile',
        'Industrie — équipements électromécaniques',
        'Santé & médico-social',
        'Services financiers — financement spécialisé',
        'Énergie — production et fourniture d’électricité',
      ],
    })
  })

  it('« chercher hors de ma cible » ramène tout, et le compteur le dit', () => {
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))

    // #3238 : Naval Group ; #3757 : Orvane (ESN) ; #3757 (reste) : Askelia (partenaire déclaré) ;
    // #3814.3 : Vaucelle Holding ; #3819.4 : Castelnau Ingénierie.
    // #3983 (reste) : Groupe Aurélys (holding écartée au profit de sa filiale).
    // #4284.26 : Maison Delcourt Proximité (compte hors métier, marqué).
    // #4284.27 (#4758) : Vauclair Logistique (le compte qui remonte sur son SEUL historique).
    // #4819.4 : Castaing Transports (son SEUL signal récent est une offre fermée).
    // Lot T : Calderis Ingénierie (une ESN reconnue par ses OFFRES).
    expect(parsed.candidates).toHaveLength(42)
    expect(parsed.targetSectorFilter).toEqual({ applied: false, excludedCount: 0, excludedSectors: [] })
  })

  it('croise le département, comme la vraie recherche', () => {
    // #2489.3/D1 — `includeOutOfTarget: true` : ce test isole le croisement
    // département, pas le filtre cible (Altiver Industries, dept 31, est hors
    // cible et sinon disparaîtrait de ce compte).
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ departments: ['31'], includeOutOfTarget: true }))
    expect(parsed.candidates.map(c => c.department)).toEqual(['31', '31', '31'])
  })

  it('rend une liste VIDE quand rien ne correspond, jamais un résultat approximatif', () => {
    // Un jeu de démonstration qui rend « quelque chose quand même » enseigne
    // exactement ce que le produit s'interdit.
    const parsed = discoverResponseSchema.parse(demoDiscoverResponse({ nafCode: '01.11Z' }))
    expect(parsed.candidates).toHaveLength(0)
  })

  it('rend TOUT quand aucun critère NAF/département n’est posé — vide ne veut pas dire « rien »', () => {
    // #2489.3/D1 — « aucun critère » porte ici sur NAF/département, pas sur la
    // cible déclarée : celle-ci filtre TOUJOURS par défaut, `includeOutOfTarget`
    // l'ignore explicitement pour isoler ce que ce test vérifie.
    expect(discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true })).candidates).toHaveLength(42)
  })

  it('le SIREN passe le format que l’ÉCRAN exige, et n’est pourtant pas crédible', () => {
    // Le contrat accepte n'importe quelle chaîne non vide, mais le normaliseur
    // du web (`discover-normalize.ts`) rejette tout ce qui n'est pas neuf
    // chiffres et jette le candidat entier. Le mot « DÉMO » vidait donc l'écran
    // — vu en production. Neuf chiffres, donc, mais sept zéros de tête au moins (dix candidats : #3238) :
    // aucun SIREN réel ne commence ainsi, et la clé de Luhn est fausse.
    for (const candidate of demoDiscoverResponse({}).candidates as Array<{ siren: string }>) {
      expect(candidate.siren).toMatch(/^\d{9}$/)
      expect(candidate.siren).toMatch(/^0{7}/)
      expect(luhnValid(candidate.siren)).toBe(false)
    }
  })

  it('deux candidats ne partagent pas le même identifiant', () => {
    const sirens = (demoDiscoverResponse({}).candidates as Array<{ siren: string }>).map(c => c.siren)
    expect(new Set(sirens).size).toBe(sirens.length)
  })

  it('l’exigence rédigée garde la forme attendue par l’appelant', () => {
    const draft = demoRfpDraft()
    expect(draft.status).toBe('drafted')
    expect(draft.answer.length).toBeGreaterThan(0)
    expect(draft.source.length).toBeGreaterThan(0)
  })
})

/** Clé de Luhn d'un SIREN — l'INSEE en pose une sur tous les numéros réels. */
function luhnValid(siren: string): boolean {
  let sum = 0
  for (let index = 0; index < siren.length; index += 1) {
    let digit = Number(siren[siren.length - 1 - index])
    if (index % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

// R24-FIX-B (15/10) — recette prod : « Banque-finance-assurance + Paris » ne rendait qu'une holding factice à
// « 0 salarié ». Décision Louis 04/10 : de vraies entreprises ; GA-18/GA-19 : une absence n'est jamais « 0 ».
describe('demoDiscoverResponse — vraies entreprises du secteur demandé (R24-FIX-B)', () => {
  type Raw = {
    name: string
    headcountRange: string | null
    signals: { tier?: string; label: string; date: string }[]
  }
  const bankingParis = (
    demoDiscoverResponse({ nafCode: '64.19Z,64.20Z,65.11Z,65.12Z', departments: ['75'] }) as {
      candidates: Raw[]
    }
  ).candidates

  it('rend une page crédible : au moins dix cartes, des entreprises réelles', () => {
    const names = bankingParis.map(c => c.name)
    expect(names.length).toBeGreaterThanOrEqual(10)
    expect(names).toEqual(expect.arrayContaining(['BNP Paribas', 'Société Générale', 'Groupe BPCE', 'AXA']))
    expect(names).not.toContain('Vaucelle Holding (démo)')
  })

  it('n’affiche jamais « 0 salarié » : effectif réel ou absent (null)', () => {
    for (const candidate of bankingParis) {
      expect(candidate.headcountRange ?? '').not.toMatch(/^0 /)
    }
    expect(bankingParis.some(c => c.headcountRange === null)).toBe(true)
  })

  it('porte des signaux datés dans les plafonds de la grille, jamais de stage', () => {
    for (const candidate of bankingParis.filter(c => c.signals.length > 0)) {
      expect(candidate.signals.filter(s => s.tier === 'strong').length).toBeLessThanOrEqual(5)
      expect(candidate.signals.filter(s => s.tier !== 'strong').length).toBeLessThanOrEqual(10)
      for (const signal of candidate.signals) {
        expect(signal.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(signal.label).not.toMatch(/stage|stagiaire|alternance/i)
      }
    }
  })

  it('#4892.1 — la tête de marque nomme son membre, le membre nomme sa tête (deux SIREN distincts)', () => {
    expect(DEMO_DISCOVER_BRAND_GROUP_COVERAGE.state).toBe('seede')
    const { candidates } = discoverResponseSchema.parse(demoDiscoverResponse({ includeOutOfTarget: true }))
    const head = candidates.find(c => c.name === 'Valcourt France (démo)') as Record<string, unknown> | undefined
    const member = candidates.find(c => c.name === 'Maison Valcourt (démo)') as Record<string, unknown> | undefined
    expect(head?.['siren']).not.toBe(member?.['siren'])
    expect(head?.['brandGroup']).toEqual({
      role: 'head',
      members: [{ siren: member?.['siren'], name: 'Maison Valcourt (démo)' }],
    })
    expect(member?.['brandGroup']).toEqual({ role: 'member', headSiren: head?.['siren'] })
  })
})
