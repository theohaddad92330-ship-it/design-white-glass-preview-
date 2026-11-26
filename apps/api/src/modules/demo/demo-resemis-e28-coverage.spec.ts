import { DEMO_DELIVERY_CLIENT, DEMO_DOSSIERS, DEMO_OUTREACH_MESSAGES, DEMO_PERSONAL_CONTACTS } from './demo-dataset'

/**
 * Lot E28 (05/10) — la démo a été refondue (client de livraison SNCF, plus de NOVA ni d'Aumont).
 * Le semis saute SILENCIEUSEMENT une ligne dont le contact ou le compte n'existe plus
 * (`if (!contactId) continue`) : ces gardes lisent le jeu réel pour que #3420.1 (bloc « à valider »)
 * et #2927 (« Mes contacts personnels ») ne disparaissent pas sans bruit.
 */
const contactNames = new Set([
  ...DEMO_DOSSIERS.flatMap(d => d.contacts.map(c => c.full_name)),
  ...DEMO_DELIVERY_CLIENT.contacts.map(c => c.full_name),
])
const companyNames = new Set(DEMO_DOSSIERS.map(d => d.account.company_name))

describe('démo — re-semis après la refonte (E28)', () => {
  it('#3420.1 — chaque message d’approche vise un contact SEMÉ, et un bloc « à valider » existe', () => {
    const orphans = DEMO_OUTREACH_MESSAGES.filter(m => !contactNames.has(m.contact)).map(m => m.contact)
    expect(orphans).toEqual([])
    expect(DEMO_OUTREACH_MESSAGES.filter(m => m.status === 'needs_review').length).toBeGreaterThanOrEqual(3)
  })

  it('#2927 — chaque contact personnel vise un compte SEMÉ (section « Mes contacts personnels » non vide)', () => {
    expect(DEMO_PERSONAL_CONTACTS.length).toBeGreaterThan(0)
    expect(DEMO_PERSONAL_CONTACTS.filter(c => !companyNames.has(c.account))).toEqual([])
  })

  it('la garde sait dire NON — un contact absent du jeu n’est pas vu comme semé', () => {
    expect(contactNames.has('Ferdinand Aumont')).toBe(false)
    expect(companyNames.has('NOVA Logistique')).toBe(false)
  })
})
