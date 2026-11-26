import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contactRelationSchema, contactSignalSchema, contactActivitySchema } from '@bellum/contracts'
import {
  DEMO_CONTACT_COLUMNS_NOT_APPLICABLE,
  DEMO_CONTACT_ENRICHMENT_COLUMNS,
  DEMO_CONTACT_SEEDED_COLUMNS,
} from './demo-coverage'
import {
  demoApolloProfile,
  demoBudgetAuthority,
  demoCadenceMessages,
  demoCareerLevers,
  demoContactActivity,
  demoContactRelations,
  demoContactSignals,
  demoFollowupMessage,
  demoImplicitFears,
  demoLanguage,
  demoLocation,
  demoPhoneScript,
  demoScope,
  demoTimezone,
  type DemoContactSeed,
  type DemoDossierSeed,
} from './demo-contact-profile'
import { DEMO_DOSSIERS } from './demo-dataset'

/** Toutes les paires (contact, dossier) réellement seedées. */
function everySeededContact(): { seed: DemoContactSeed; dossier: DemoDossierSeed; label: string }[] {
  return DEMO_DOSSIERS.flatMap(dossier =>
    dossier.contacts.map(contact => ({
      seed: contact,
      dossier: dossier.account,
      label: `${contact.full_name} (${dossier.account.company_name})`,
    })),
  )
}

/** Noms des colonnes de `contacts`, lus sur l'entité — pour qu'une colonne
 *  AJOUTÉE demain ne puisse pas passer sous le radar de la couverture. */
function contactColumnNames(): string[] {
  const source = readFileSync(join(__dirname, '..', '..', 'database', 'entities', 'contact.entity.ts'), 'utf8')
  const names: string[] = []
  const decorator = /@(?:Primary(?:Generated)?Column|Column|CreateDateColumn|UpdateDateColumn)\b/
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (!decorator.test(lines[i]!)) continue
    // La propriété suit le décorateur, éventuellement après des lignes de
    // commentaire ou la suite d'un objet d'options multi-lignes.
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j += 1) {
      const property = /^ {2}([a-z_][a-z0-9_]*)[?!]?:/.exec(lines[j]!)
      if (property) {
        names.push(property[1]!)
        break
      }
    }
  }
  return [...new Set(names)]
}

describe('fiche contact de démonstration — remplie à 100 %, pour tous les contacts', () => {
  describe('ce que le seed écrit', () => {
    it.each(everySeededContact().map(c => [c.label, c] as const))(
      'renseigne toute la fiche de %s',
      (_label, { seed, dossier }) => {
        expect(demoScope(seed, dossier).length).toBeGreaterThan(20)
        expect(demoBudgetAuthority(seed).length).toBeGreaterThan(20)
        // LUDB.8 bis — « Préparer mon appel » : accroche, sujet, deux questions de découverte,
        // demande. Jamais un numéro (il n'est pas inventé), jamais d'objection (#4975.1 : elle vient du dossier).
        const script = demoPhoneScript(seed, dossier).split('\n')
        expect(script.map(line => line.split(' — ')[0])).toEqual(['Accroche', 'Sujet', 'Découverte', 'Demande'])
        expect(script[2]!.match(/\?/g)).toHaveLength(2)
        expect(script.join('\n')).not.toMatch(/Objection|Réponse —/)
        expect(script.join('\n')).not.toMatch(/\+?\d[\d .]{8,}/)

        const cadence = demoCadenceMessages(seed, dossier)
        for (const message of [cadence.relance, cadence.preuveSociale, cadence.closeLoop]) {
          expect(message.length).toBeGreaterThan(40)
        }

        const followup = demoFollowupMessage(seed, dossier)
        expect(followup.subject.length).toBeGreaterThan(5)
        expect(followup.body.length).toBeGreaterThan(60)

        expect(demoCareerLevers(seed).length).toBeGreaterThan(0)
        expect(demoImplicitFears(seed).length).toBeGreaterThan(0)
        expect(['fr', 'es']).toContain(demoLanguage(seed))
        expect(demoTimezone(seed)).toMatch(/^Europe\//)
      },
    )

    it('n’écrit jamais le prénom « Dr » — le titre médical n’est pas un prénom', () => {
      // Testé sur la FONCTION et non sur le jeu de données : aucun des cinq
      // dossiers réels ne porte de titre médical, mais la règle vaut pour tout
      // contact qu'une analyse ramènera demain.
      const { dossier } = everySeededContact()[0]!
      const seed = { ...everySeededContact()[0]!.seed, full_name: 'Dr Émilie Chartier' }
      expect(demoPhoneScript(seed, dossier)).toContain('Bonjour Émilie')
      expect(demoCadenceMessages(seed, dossier).relance).toContain('Bonjour Émilie')
    })

    it('#4977.1 — l’appel s’ouvre sur l’offre d’emploi du dossier : poste ET ville, pas le premier signal venu', () => {
      const { seed, dossier } = everySeededContact()[0]!
      const withOffer = {
        ...dossier,
        recent_signals: [
          { signal: 'Un partenariat annoncé', type: 'partenariat' },
          {
            signal: 'SNCF Voyageurs — Directeur des opérations (COO) F/H — Saint-Denis',
            type: 'recrutement',
            location: 'Saint-Denis (93)',
          },
        ],
      }
      const accroche = demoPhoneScript(seed, withOffer).split('\n')[0]!
      expect(accroche).toContain('Directeur des opérations (COO) F/H')
      expect(accroche).toContain('Saint-Denis')
      expect(accroche).not.toContain('partenariat annoncé')
      // la ville absente du texte du signal est ajoutée, jamais inventée
      const noCity = {
        ...dossier,
        recent_signals: [{ signal: 'Architecte cloud F/H', type: 'recrutement', location: 'Lyon (69)' }],
      }
      expect(demoPhoneScript(seed, noCity).split('\n')[0]).toContain('Architecte cloud F/H — Lyon')
    })

    it('produit des signaux et une activité conformes au contrat', () => {
      for (const { seed, dossier } of everySeededContact()) {
        const signals = demoContactSignals(seed, dossier)
        expect(signals.length).toBeGreaterThan(0)
        for (const signal of signals) expect(contactSignalSchema.safeParse(signal).success).toBe(true)

        const activity = demoContactActivity(seed, dossier)
        expect(activity.length).toBeGreaterThan(0)
        for (const entry of activity) expect(contactActivitySchema.safeParse(entry).success).toBe(true)
      }
    })

    // Théo B c5 — « sources cliquables, visibles directement » : le signal du compte garde l'URL de sa page d'origine.
    it('reprend l’URL de la source du signal du compte, quand il en a une', () => {
      for (const { seed, dossier } of everySeededContact()) {
        const dossierUrls = dossier.recent_signals.flatMap(signal => (signal.url ? [signal.url] : []))
        for (const signal of demoContactSignals(seed, dossier)) {
          if (signal.source_url) expect(dossierUrls).toContain(signal.source_url)
        }
      }
    })

    // #3420 (recette 03/10) — « A signé deux missions en cours » s'affichait 2× sur la fiche du signataire :
    // dans « Pourquoi c'est un contact clé » ET dans « Signaux liés ». Une phrase, un seul endroit.
    it('ne répète jamais un point clé du contact dans ses signaux', () => {
      for (const { seed, dossier } of everySeededContact()) {
        const labels = demoContactSignals(seed, dossier).map(signal => signal.label)
        for (const point of seed.key_points) expect(labels).not.toContain(point)
      }
    })

    // Recette 31/10 — siège à Puteaux (92) mais zone du profil « Paris & Île-de-France » : 10/10 « Hors zone ».
    // Le lieu d'un siège francilien nomme la région, sinon aucun contact de démo n'est jamais en zone.
    it('un siège francilien (code postal 92) porte « Île-de-France » dans le lieu', () => {
      const { seed, dossier } = everySeededContact()[0]!
      const location = demoLocation(
        { ...seed, entity: 'Société Générale' },
        {
          ...dossier,
          headquarters: '17 cours Valmy, 92800 Puteaux',
        },
      )
      expect(location).toBe('Puteaux, Île-de-France, France')
      expect(demoLocation(seed, { ...dossier, headquarters: '1 rue X, 69002 Lyon' })).toBe('Lyon, France')
    })

    // Vu en passant (recette D3 01/11) — « `entities_exhaustive` » (nom de clé, backticks) s'affichait tel quel dans la
    // justification d'une fiche. Un texte VISIBLE d'un contact ne porte ni backtick ni identifiant technique snake_case.
    it('aucun texte visible d’un contact ne montre un backtick ni un nom de clé technique', () => {
      for (const { seed, label } of everySeededContact()) {
        const visible = [seed.why_contact, ...(seed.key_points ?? [])].filter(Boolean).join(' | ')
        expect({ label, texte: visible }).not.toEqual(expect.objectContaining({ texte: expect.stringMatching(/`/) }))
        expect({
          label,
          cle: visible.match(/\b(?:entities_exhaustive|raw_analysis|lifecycle_state|decision_role|contact_score)\b/g),
        }).toEqual({ label, cle: null })
      }
    })

    // #4556.4 (recette D3 01/11) — Airbus siège à Blagnac (31), zone du profil « Toulouse & Occitanie » : les contacts
    // à l'adresse du siège (« 2 ROND-POINT DEWOITINE, France ») se lisaient « Hors zone ». Le code postal 31 nomme la région.
    it('#4556.4 — un siège occitan (code postal 31) porte « Occitanie » dans le lieu', () => {
      const { seed, dossier } = everySeededContact()[0]!
      const location = demoLocation(seed, { ...dossier, headquarters: '2 ROND-POINT DEWOITINE, 31700, BLAGNAC' })
      expect(location).toContain('Occitanie')
      expect(demoLocation(seed, { ...dossier, headquarters: '1 rue X, 69002 Lyon' })).not.toContain('Occitanie')
      // 3 chiffres hors région : « 13100 » n'est pas occitan (sait dire NON).
      expect(demoLocation(seed, { ...dossier, headquarters: '1 rue X, 13100 Aix' })).not.toContain('Occitanie')
    })

    it('suit l’ENTITÉ pour la langue, pas le siège du groupe', () => {
      // Même raison que ci-dessus : les cinq sociétés réelles n'ont pas
      // d'entité ibérique dans le jeu, mais la règle — la langue suit l'entité
      // qui emploie, pas le siège du groupe — reste celle du produit.
      const { dossier } = everySeededContact()[0]!
      const seed = { ...everySeededContact()[0]!.seed, entity: 'Filiale Ibérica' }
      expect(demoLanguage(seed)).toBe('es')
      expect(demoTimezone(seed)).toBe('Europe/Madrid')
      expect(demoLocation(seed, dossier)).toContain('Espagne')
    })

    // #2165.38 — les six dossiers réels portent une ADRESSE COMPLÈTE
    // (« rue, code postal ville »), pas le format « Ville, Région » que
    // `headquartersCity` savait lire. Rouge si la fonction rend la rue au lieu
    // de la ville : la localisation serait fausse, donc invisible au filtre
    // pays de Découvrir (`MARKET_COUNTRY_NAMES`, `includesLoose`).
    it('extrait la VILLE d’une adresse complète « rue, code postal ville », pas la rue entière', () => {
      const { seed } = everySeededContact()[0]!
      const thales: DemoDossierSeed = {
        company_name: 'Groupe BPCE',
        sector: 'Industrie de haute technologie',
        // Adresse réelle du jeu de données (demo-dataset.ts).
        headquarters: '4 rue de la Verrerie, 92190 Meudon',
        recent_signals: [],
      }
      expect(demoLocation(seed, thales)).toBe('Meudon, Île-de-France, France')
    })
  })

  describe('ce que le clic « Enrichir » ajoute', () => {
    it('ne renseigne QUE ce qui est vrai par construction', () => {
      // Le profil dérivait un parcours professionnel et une formation. C'était
      // tenable pour des personnes inventées ; sur des mandataires sociaux
      // réels, c'est écrire la biographie de quelqu'un qui existe. Ne reste que
      // ce que la fiche elle-même contient : titre, entité, ville du siège,
      // famille métier.
      for (const { seed, dossier } of everySeededContact()) {
        const profile = demoApolloProfile(seed, dossier)
        expect(profile.headline).toBeTruthy()
        expect(profile.city).toBeTruthy()
        expect(profile.country).toBeTruthy()
        expect(profile.departments?.length).toBeGreaterThan(0)

        // Et surtout : rien d'inventé sur la personne.
        expect(profile.linkedin_url).toBeNull()
        expect(profile.employment_history).toEqual([])
        expect(profile.education).toEqual([])
        expect(profile.personal_emails).toEqual([])
        expect(profile.phone_numbers).toEqual([])
      }
    })

    it('reconstruit l’entourage à partir des fiches qui existent VRAIMENT', () => {
      const siblings = [
        {
          id: 'a',
          full_name: 'Claire Vasseur',
          title: 'DSI',
          entity: 'Groupe Helios',
          decision_role: 'technical',
          priority: 1,
        },
        {
          id: 'b',
          full_name: 'Thomas Reynier',
          title: 'RSSI',
          entity: 'Groupe Helios',
          decision_role: 'technical',
          priority: 2,
        },
        {
          id: 'c',
          full_name: 'Julien Morvan',
          title: 'CTO',
          entity: 'Helios Digital',
          decision_role: 'technical',
          priority: 1,
        },
      ]
      const relations = demoContactRelations({ id: 'b', entity: 'Groupe Helios', priority: 2 }, siblings)

      // Jamais soi-même dans son propre entourage.
      expect(relations.map(r => r.id)).not.toContain('b')
      // Chaque relation pointe une fiche existante → « Voir la fiche » marche.
      expect(relations.every(r => siblings.some(s => s.id === r.id))).toBe(true)
      // Même entité = lien plein, autre entité = pointillés, et le tri met les
      // liens directs d'abord.
      expect(relations[0]).toMatchObject({ id: 'a', tier: 1, relationship: 'Responsable hiérarchique probable' })
      expect(relations.find(r => r.id === 'c')).toMatchObject({ tier: 2 })
      for (const relation of relations) expect(contactRelationSchema.safeParse(relation).success).toBe(true)
    })

    it('ne fabrique aucune relation quand la personne est seule sur son compte', () => {
      expect(
        demoContactRelations({ id: 'a', entity: 'X', priority: 1 }, [
          { id: 'a', full_name: 'Seule', title: null, entity: 'X', decision_role: null, priority: 1 },
        ]),
      ).toEqual([])
    })
  })

  describe('couverture des colonnes — la garde qui rend « 100 % » vérifiable', () => {
    it('classe CHAQUE colonne de `contacts` : seedée, enrichie, ou hors sujet avec sa raison', () => {
      const classified = new Set<string>([
        ...DEMO_CONTACT_SEEDED_COLUMNS,
        ...DEMO_CONTACT_ENRICHMENT_COLUMNS,
        ...Object.keys(DEMO_CONTACT_COLUMNS_NOT_APPLICABLE),
      ])

      // Si ce test échoue, une colonne de fiche contact est apparue sans qu'on
      // ait dit ce que la démonstration en fait. Trois issues, jamais une
      // quatrième : la seeder, la faire remplir par « Enrichir », ou la déclarer
      // hors sujet avec une raison qui tient devant quelqu'un qui présente.
      expect(contactColumnNames().filter(column => !classified.has(column))).toEqual([])
    })

    it('ne garde pas de classement périmé — une colonne supprimée ment sur la couverture', () => {
      const columns = new Set(contactColumnNames())
      const stale = [
        ...DEMO_CONTACT_SEEDED_COLUMNS,
        ...DEMO_CONTACT_ENRICHMENT_COLUMNS,
        ...Object.keys(DEMO_CONTACT_COLUMNS_NOT_APPLICABLE),
      ].filter(column => !columns.has(column))
      expect(stale).toEqual([])
    })

    it('ne classe jamais une colonne deux fois', () => {
      const seeded = new Set<string>(DEMO_CONTACT_SEEDED_COLUMNS)
      const enriched = new Set<string>(DEMO_CONTACT_ENRICHMENT_COLUMNS)
      const notApplicable = Object.keys(DEMO_CONTACT_COLUMNS_NOT_APPLICABLE)
      expect([...enriched].filter(column => seeded.has(column))).toEqual([])
      expect(notApplicable.filter(column => seeded.has(column) || enriched.has(column))).toEqual([])
    })

    it('exige une raison NON VIDE pour chaque colonne déclarée hors sujet', () => {
      for (const reason of Object.values(DEMO_CONTACT_COLUMNS_NOT_APPLICABLE)) {
        expect(reason.length).toBeGreaterThan(30)
      }
    })
  })
})
