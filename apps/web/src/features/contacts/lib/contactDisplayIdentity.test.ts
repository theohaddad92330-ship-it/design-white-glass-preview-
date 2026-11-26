import { describe, expect, it } from 'vitest'
import { contactDisplayIdentity } from './contactDisplayIdentity'

describe('contactDisplayIdentity', () => {
  it('shows the real name once the identity is complete', () => {
    const r = contactDisplayIdentity({ full_name: 'Marie-Aude Morel', title: 'Administrateur' })
    expect(r).toEqual({ label: 'Marie-Aude Morel', roleToIdentify: false })
  })

  it('shows the ROLE (not the placeholder first name) for an unconfirmed role-persona', () => {
    // « Julien · Directeur des Sports » — a first-name-only placeholder.
    const r = contactDisplayIdentity({ full_name: 'Julien', title: 'Directeur des Sports Groupe TF1' })
    expect(r).toEqual({ label: 'Directeur des Sports Groupe TF1', roleToIdentify: true })
  })

  it('flips back to the real name the moment enrichment completes the identity', () => {
    const before = contactDisplayIdentity({ full_name: 'Marie-aude', title: 'Administrateur' })
    expect(before.roleToIdentify).toBe(true)
    // Apollo/SalesQL resolved the full name → real identity, badge gone.
    const after = contactDisplayIdentity({ full_name: 'Marie-Aude Morel', title: 'Administrateur' })
    expect(after).toEqual({ label: 'Marie-Aude Morel', roleToIdentify: false })
  })

  it('keeps the placeholder name when there is no role to stand in for it', () => {
    // Incomplete, no title/entity/linkedin → nothing better to show.
    const r = contactDisplayIdentity({ full_name: 'Julien' })
    expect(r).toEqual({ label: 'Julien', roleToIdentify: false })
  })

  it('treats a name + entity anchor as a complete identity (no role stand-in)', () => {
    const r = contactDisplayIdentity({ full_name: 'Jean Dupont', entity: 'TF1' })
    expect(r.roleToIdentify).toBe(false)
    expect(r.label).toBe('Jean Dupont')
  })

  // Apollo's search tier publishes the surname masked ("Mo***y"). Showing only
  // the role would hide a person we can actually name; showing "Severine" alone
  // pretends we know less than we do. The initial Apollo itself published is the
  // honest middle — and it says plainly that the name is not revealed yet.
  it('shows "first + initial" for an Apollo hit whose surname is still masked', () => {
    const r = contactDisplayIdentity({
      full_name: 'Severine',
      title: 'Responsable de la Communication Interne',
      last_name_obfuscated: 'Mo***y',
    })
    expect(r).toEqual({ label: 'Severine M.', roleToIdentify: false, nameToReveal: true })
  })

  // Louis 04/10/2026 (c81) — une donnée déjà en base s'affiche en clair. Un nom
  // complet tenu en base ne se réduit JAMAIS à « prénom + initiale », même sans
  // ancrage (poste, société, LinkedIn) pour le déclarer « complet ».
  it('shows a full name held in base in clear, even when a provider mask lingers', () => {
    const r = contactDisplayIdentity({ full_name: 'Severine Mondy', last_name_obfuscated: 'Mo***y' })
    expect(r).toEqual({ label: 'Severine Mondy', roleToIdentify: false })
  })

  it('never invents beyond the first masked letter', () => {
    const r = contactDisplayIdentity({ full_name: 'Jean', last_name_obfuscated: 'Du***t' })
    expect(r.label).toBe('Jean D.')
  })

  it('drops the mask as soon as the People-Match reveals the real surname', () => {
    const r = contactDisplayIdentity({
      full_name: 'Severine Mondy',
      title: 'Responsable de la Communication Interne',
      last_name_obfuscated: 'Mo***y',
    })
    expect(r).toEqual({ label: 'Severine Mondy', roleToIdentify: false })
  })

  it('reads the mask from raw_data on the contact detail shape', () => {
    // The list projection selects a column; the detail ships the same value inside
    // raw_data. Both screens must render the person identically.
    const r = contactDisplayIdentity({
      full_name: 'Severine',
      title: 'Responsable de la Communication Interne',
      raw_data: { lastNameObfuscated: 'Mo***y' },
    })
    expect(r).toEqual({ label: 'Severine M.', roleToIdentify: false, nameToReveal: true })
  })

  // GA-298 — LOT 4 (perf). `GET /contacts/account/:id` a arrêté d'envoyer
  // `raw_data` (282 Ko sur 2 027 lignes, mesuré le 12/09/2026) : la clé qu'ce
  // helper y lisait voyage désormais comme le champ projeté
  // `last_name_obfuscated` — SANS `raw_data` du tout dans la réponse, pas
  // seulement `raw_data: undefined`. Ce test simule le vrai payload de
  // `findByAccountForHttp`, pas seulement le cas `raw_data` déjà couvert
  // ci-dessus : l'écran de l'onglet Contacts (`CompactContactRow` →
  // `contactDisplayIdentity`) doit continuer d'afficher « Severine M. » alors
  // que la clé au fond de laquelle il la lisait n'existe plus du tout.
  it('shows the masked surname from a GET /contacts/account/:id row that never carries raw_data (LOT 4)', () => {
    const r = contactDisplayIdentity({
      full_name: 'Severine',
      title: 'Responsable de la Communication Interne',
      last_name_obfuscated: 'Mo***y',
      // Pas de clé `raw_data` — la forme réelle depuis le LOT 4, pas un
      // oubli : `Object.hasOwnProperty` doit rendre `false` pour ce champ.
    })
    expect(r).toEqual({ label: 'Severine M.', roleToIdentify: false, nameToReveal: true })
  })

  it('ignores a mask that carries no letter', () => {
    // Defensive: an empty or punctuation-only mask must not produce "Severine .".
    const r = contactDisplayIdentity({
      full_name: 'Severine',
      title: 'Responsable Communication',
      last_name_obfuscated: '***',
    })
    expect(r).toEqual({ label: 'Responsable Communication', roleToIdentify: true })
  })
})
