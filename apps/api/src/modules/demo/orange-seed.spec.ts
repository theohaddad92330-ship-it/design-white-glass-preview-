import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeTags } from '@bellum/contracts'
import { parseCompteCsvRows } from './compte-csv-parser'
import { ORANGE_CONSULTANTS_CSV } from './data/orange-consultants.generated'
import { COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY, normalizePersonName } from './commercial-brief-seed'
import { DEMO_EXTENSION_ACCOUNTS } from './demo-dataset'
import { DEMO_ORANGE_COMPANY } from './orange-csv-mapping'
import { ORANGE_ROWS, ORANGE_SEED } from './orange-seed'

/**
 * 12/10/2026 — le compte Orange de la salle est alimenté par le relevé que Théo a déposé dans le Drive « DÉMO CLIENTS »
 * (`Orange_consultants_verifiables_annexe.csv`). Décisions Louis 12/10 : noms recopiés en clair, JAMAIS une coordonnée
 * inventée (le relevé ne porte que des drapeaux), hors France rangé sous son entité, plus de siège sans nom.
 */
const raw = readFileSync(join(__dirname, 'data/orange-consultants.csv'), 'utf-8')

describe('relevé Orange — lecture sans perte', () => {
  it('614 lignes, 13 colonnes, module généré identique octet pour octet au CSV', () => {
    const rows = parseCompteCsvRows(raw)
    expect(rows).toHaveLength(614)
    expect(Object.keys(rows[0] ?? {})).toHaveLength(13)
    expect(ORANGE_CONSULTANTS_CSV).toBe(raw)
    expect(ORANGE_ROWS).toHaveLength(614)
  })

  it('192 lignes en poste (#current*) et 422 anciennes (#previous_*)', () => {
    expect(ORANGE_SEED.stats.currentRows).toBe(192)
    expect(ORANGE_SEED.stats.formerRows).toBe(422)
  })

  it('aucune ligne perdue : chaque person_key du relevé porte une fiche', () => {
    const keys = new Set(ORANGE_ROWS.map(row => row.person_key))
    expect(ORANGE_SEED.contacts.flatMap(contact => contact.personKeys).sort()).toEqual([...keys].sort())
  })
})

const GROUP_EMAIL =
  /@(?:[\w-]+\.)*(orange\.com|orange-business\.com|orangecyberdefense\.com|orange-ftgroup\.com|francetelecom\.com)$/i
const dossier = COMMERCIAL_BRIEF_BY_EXTENSION_COMPANY[DEMO_ORANGE_COMPANY]

describe('relevé Orange — contacts semés', () => {
  it('le relevé n’a que des drapeaux : les coordonnées viennent du dossier de compte, EN CLAIR, jamais inventées', () => {
    const fromDossier = new Map((dossier?.people ?? []).map(person => [normalizePersonName(person.name), person]))
    for (const contact of ORANGE_SEED.contacts) {
      const person = fromDossier.get(normalizePersonName(contact.full_name))
      // Une valeur semée est une valeur du dossier (première adresse, mobile mis en forme, lien) — rien d'autre.
      if (contact.email) expect(person?.email?.split(' | ')[0]).toBe(contact.email)
      else expect(person?.email).toBeUndefined()
      if (contact.linkedin_url) expect(person?.linkedin).toBe(contact.linkedin_url)
      else expect(person?.linkedin).toBeUndefined()
      expect(Boolean(contact.phone)).toBe(Boolean(person?.mobile))
      if (contact.email) expect(contact.email).toMatch(GROUP_EMAIL)
    }
    expect(ORANGE_SEED.contacts.filter(contact => contact.email)).toHaveLength(156)
    expect(ORANGE_SEED.contacts.filter(contact => contact.phone)).toHaveLength(83)
    expect(ORANGE_SEED.contacts.filter(contact => contact.linkedin_url)).toHaveLength(476)
  })

  it('aucune boîte personnelle n’est semée : ni en e-mail, ni dans un résumé', () => {
    const personal = /@(gmail|yahoo|hotmail|outlook|live|icloud|free|wanadoo|sfr|laposte|proton|orange\.fr)\b/i
    for (const contact of ORANGE_SEED.contacts) {
      expect(contact.email ?? '').not.toMatch(personal)
      expect(contact.profile_summary).not.toMatch(personal)
    }
  })

  it('les sept décideurs du dossier remontent en tête, avec leur rôle', () => {
    const head = ORANGE_SEED.contacts.slice(0, 7)
    expect(head.every(contact => contact.tags.includes('Décideur') && contact.priority === 1)).toBe(true)
    expect(head.map(contact => contact.full_name)).toEqual(
      expect.arrayContaining(['Jean-Christophe Boulay', 'Hicham Sabre', 'Florent Bazin', 'Audrey Prevost']),
    )
    expect(ORANGE_SEED.contacts.filter(contact => contact.tags.includes('Décideur'))).toHaveLength(7)
    // 15/10/2026 (recette R24) — le dossier les nomme « Décideur » : ils portent le rôle `economic`, celui que lit le
    // badge « Décideur » ET le compteur « Décideurs » (une seule source). Les autres fiches restent `unknown`.
    expect(head.every(contact => contact.decision_role === 'economic')).toBe(true)
    expect(ORANGE_SEED.contacts.slice(7).every(contact => contact.decision_role === 'unknown')).toBe(true)
    // Le CIO cité par un tiers n'a AUCUNE coordonnée : rien n'est deviné.
    const bazin = ORANGE_SEED.contacts.find(contact => contact.full_name === 'Florent Bazin')
    expect(bazin).toMatchObject({ email: null, phone: null, linkedin_url: null })
  })

  it('478 fiches : les 476 personnes du relevé + les deux que SEUL le dossier cite, aucune perte', () => {
    expect(ORANGE_SEED.contacts).toHaveLength(478)
    const names = new Set(ORANGE_SEED.contacts.map(contact => normalizePersonName(contact.full_name)))
    for (const person of dossier?.people ?? []) expect(names.has(normalizePersonName(person.name))).toBe(true)
    for (const row of ORANGE_ROWS) expect(names.has(normalizePersonName(row.full_name ?? ''))).toBe(true)
  })

  it('les noms sont recopiés en clair, y compris abrégés ; jamais deux fiches du même nom', () => {
    const names = ORANGE_SEED.contacts.map(contact => contact.full_name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    expect(ORANGE_SEED.contacts.map(contact => contact.full_name)).toContain('Alan D.')
    expect(ORANGE_SEED.contacts.map(contact => contact.full_name)).toContain('Sylvie Wadier')
  })

  it('en poste et anciens sont distingués par étiquette ; les ESN observées sont nommées', () => {
    const former = ORANGE_SEED.contacts.filter(contact => contact.tags.includes('Ancien du compte'))
    const external = ORANGE_SEED.contacts.filter(contact => contact.tags.includes('Prestataire externe'))
    const current = ORANGE_SEED.contacts.filter(contact => contact.tags.includes('Contact en poste'))
    expect(former.length).toBeGreaterThan(250)
    expect(current.length).toBeGreaterThan(100)
    // Les deux personnes que seul le dossier cite (le CIO d'une étude de cas, le contact d'un besoin) ne sont ni en
    // poste, ni anciennes, ni externes au relevé : elles ne portent que « Décideur ».
    const onlyInDossier = ORANGE_SEED.contacts.filter(contact => contact.personKeys.length === 0)
    expect(onlyInDossier).toHaveLength(2)
    expect(former.length + external.length + current.length + onlyInDossier.length).toBe(ORANGE_SEED.contacts.length)
    const withEsn = ORANGE_SEED.contacts.filter(contact => contact.profile_summary.includes('ESN observée'))
    expect(withEsn.length).toBeGreaterThanOrEqual(40)
  })

  it('le résumé dit ce qui est repris du dossier et ce qui est signalé mais NON repris, sans jamais porter de valeur personnelle', () => {
    const taken = ORANGE_SEED.contacts.find(contact => contact.profile_summary.includes('Coordonnées reprises'))
    expect(taken).toBeDefined()
    const left = ORANGE_SEED.contacts.find(contact => contact.profile_summary.includes('non repris'))
    expect(left).toBeDefined()
    for (const contact of ORANGE_SEED.contacts) {
      // Aucun numéro ni lien dans le résumé ; une adresse n'y figure que si c'est une AUTRE adresse du groupe Orange.
      expect(contact.profile_summary).not.toMatch(/https?:\/\/|\+33|\b0[1-9]( ?\d\d){4}\b/)
      for (const email of contact.profile_summary.match(/\S+@\S+\.\S+/g) ?? []) {
        expect(email.replace(/[.,;]$/, '')).toMatch(GROUP_EMAIL)
      }
    }
  })

  it('« en poste » dit que c’est l’export 2024', () => {
    const current = ORANGE_SEED.contacts.find(contact => contact.tags.includes('Contact en poste'))
    expect(current?.profile_summary).toContain('export 2024')
  })

  it('une personne en poste ET ancienne (deux lignes) est UNE fiche en poste', () => {
    const wadier = ORANGE_SEED.contacts.find(contact => contact.full_name === 'Sylvie Wadier')
    expect(wadier?.tags).toContain('Contact en poste')
    expect(wadier?.tags).not.toContain('Ancien du compte')
  })

  it('valeurs compatibles avec les CHECK SQL (tags ≤ 40 car., ≤ 20, rôle connu)', () => {
    for (const contact of ORANGE_SEED.contacts) {
      expect(normalizeTags(contact.tags)).toEqual(contact.tags)
      expect(contact.decision_role).toBe(contact.tags.includes('Décideur') ? 'economic' : 'unknown')
      expect(contact.full_name.length).toBeGreaterThan(0)
    }
  })
})

describe('relevé Orange — entités', () => {
  it('chaque fiche est rattachée à son entité du relevé ; 34 entités', () => {
    expect(ORANGE_SEED.entities).toHaveLength(34)
    const entities = new Set(ORANGE_SEED.entities)
    for (const contact of ORANGE_SEED.contacts) expect(entities.has(contact.entity)).toBe(true)
  })

  it('hors France : gardé sous SON entité, étiqueté, jamais mêlé au siège France', () => {
    const foreign = ORANGE_SEED.contacts.filter(contact => contact.tags.includes('Hors France'))
    expect(foreign.length).toBeGreaterThanOrEqual(10)
    for (const contact of foreign) {
      expect(contact.entity).not.toBe(DEMO_ORANGE_COMPANY)
      expect(ORANGE_SEED.foreignEntities).toContain(contact.entity)
    }
    // 12/10/2026 (recette écran) — le marquage voyage DANS le libellé de l'entité : « Par où entrer », la colonne
    // « Entité » et le regroupement ne lisent que ce nom.
    expect(ORANGE_SEED.foreignEntities).toEqual(
      expect.arrayContaining([
        "Orange Côte d'Ivoire (hors France)",
        'Orange Tunisie (hors France)',
        'Orange Cameroun (hors France)',
        'Orange Polska (hors France)',
        'Orange Egypt (hors France)',
        'Orange Jordan (hors France)',
        'Orange Business Maroc (hors France)',
        'Orange Communications SA (hors France)',
      ]),
    )
    for (const label of ORANGE_SEED.foreignEntities) expect(label.match(/hors France/g)).toHaveLength(1)
    // Les DOM (Caraïbe, Réunion/Mayotte) sont la FRANCE : jamais « Hors France ».
    expect(ORANGE_SEED.entities.filter(entity => /caraibe|réunion/i.test(entity)).sort()).toEqual([
      'ORANGE CARAIBE',
      'Orange - La Réunion / Mayotte',
    ])
    for (const contact of ORANGE_SEED.contacts.filter(c => /caraibe|réunion/i.test(c.entity))) {
      expect(contact.tags).not.toContain('Hors France')
    }
    for (const contact of ORANGE_SEED.contacts.filter(c => c.entity === DEMO_ORANGE_COMPANY)) {
      expect(contact.tags).not.toContain('Hors France')
    }
  })

  it('les entités du relevé (hors le groupe lui-même) sont les filiales du compte', () => {
    const orange = DEMO_EXTENSION_ACCOUNTS.find(account => account.company_name === DEMO_ORANGE_COMPANY)
    expect(orange?.subsidiaries).toEqual(ORANGE_SEED.entities.filter(entity => entity !== DEMO_ORANGE_COMPANY))
    expect(orange?.subsidiaries).toContain('Orange Business')
    expect(orange?.subsidiaries).toContain('Orange Cyberdefense')
  })
})

describe('compte Orange de la salle', () => {
  const orange = DEMO_EXTENSION_ACCOUNTS.find(account => account.company_name === DEMO_ORANGE_COMPANY)

  it('porte les contacts du relevé et du dossier : plus aucun siège sans nom', () => {
    expect(orange?.contacts).toHaveLength(ORANGE_SEED.contacts.length)
    expect(orange?.contacts.length).toBeGreaterThan(300)
    for (const contact of orange?.contacts ?? []) expect(contact.full_name).not.toBe(contact.title)
  })

  it('les coordonnées semées sont celles du dossier (groupe Orange, en clair) ; aucun effectif ni chiffre d’affaires inventés', () => {
    expect(orange?.employees).toBe('')
    expect(orange?.revenue).toBe('')
    expect(orange?.contacts.filter(contact => contact.email)).toHaveLength(156)
    for (const contact of orange?.contacts ?? []) {
      if (contact.email) expect(contact.email).toMatch(GROUP_EMAIL)
    }
    const boulay = orange?.contacts.find(contact => contact.full_name === 'Jean-Christophe Boulay')
    expect(boulay?.email).toBe('jean-christophe.boulay@orange.com')
    expect(boulay?.linkedin_url).toBe('https://www.linkedin.com/in/jxboulay')
  })

  it('le siège n’est pas affirmé : « à vérifier »', () => {
    expect(orange?.headquarters).toBe('Paris (siège à vérifier)')
  })

  it('plus aucun compte mince à UN siège (Louis 12/10/2026) : Orange, puis les dossiers de compte du 15/10', () => {
    expect(DEMO_EXTENSION_ACCOUNTS.filter(account => account.contacts.length === 1)).toEqual([])
    // 15/10/2026 — Crédit Agricole, VINCI, Enedis et Safran rejoignent Orange, riches de leur dossier de compte.
    expect(DEMO_EXTENSION_ACCOUNTS.map(account => account.company_name)).toEqual([
      'Orange',
      'Crédit Agricole',
      'VINCI',
      'Enedis',
      'Safran',
    ])
  })
})
