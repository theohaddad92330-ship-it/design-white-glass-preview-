import { outreachContextBlockers } from '@bellum/contracts'
import {
  DEMO_DELIVERY_CARRIER_ACCOUNT,
  DEMO_DELIVERY_CLIENT,
  DEMO_DOSSIERS,
  DEMO_OUTREACH_MESSAGES,
} from './demo-dataset'

/**
 * #3420 (lot X68, recette prod 02/10 Y18) — « Le message ne cite rien de ce
 * qu'on sait du compte » apparaissait 3× sur la fiche de Directeur technique — entité numérique voyageurs, dont
 * sur le message « Validé » : un défaut qui n'a rien à faire en salle de démo,
 * où chaque motif de contrôle est posé À DESSEIN. Les ancres du compte sont lues
 * comme le serveur les lit (`accountAnchorsOf` : secteur + signaux récents).
 * Cette garde SAIT DIRE NON : un message de la salle qui ne cite plus rien de son
 * compte la fait rougir.
 */
function anchorsOf(contact: string): string[] {
  const dossier = DEMO_DOSSIERS.find(d => d.contacts.some(c => c.full_name === contact))
  const account = dossier?.account ?? DEMO_DELIVERY_CARRIER_ACCOUNT
  const anchors: string[] = []
  if (account.sector) anchors.push(account.sector)
  for (const signal of (account as { recent_signals?: unknown[] }).recent_signals ?? []) {
    const record = signal as Record<string, unknown>
    for (const key of ['title', 'label', 'summary', 'description']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) anchors.push(value)
    }
  }
  return anchors
}

describe('messages de démo — chaque message cite ce qu’on sait de son compte (#3420)', () => {
  const judged = DEMO_OUTREACH_MESSAGES.filter(entry => entry.status !== 'copied_manual')

  it.each(judged.map(entry => [`${entry.contact} — ${entry.subject}`, entry] as const))(
    '%s : « ne cite rien du compte » ne se déclenche pas',
    (_label, entry) => {
      const blockers = outreachContextBlockers({
        body: entry.edit?.body ?? entry.body,
        channel: 'email',
        intent: entry.intent,
        contactName: entry.contact,
        contactStatus: 'new',
        priorContactedCount: 0,
        accountAnchors: anchorsOf(entry.contact),
        verifiedTechStack: [],
        siblingBodies: [],
        sequencePosition: null,
      })
      expect(blockers).not.toContain('scope_unclear')
    },
  )

  it('le garde sait dire non : un message sans rapport avec le compte est détecté', () => {
    const blockers = outreachContextBlockers({
      body: 'Bonjour,\nUn café ?',
      channel: 'email',
      intent: 'open_relationship',
      contactName: 'Directeur technique — entité numérique voyageurs',
      contactStatus: 'new',
      priorContactedCount: 0,
      accountAnchors: anchorsOf('Directeur technique — entité numérique voyageurs'),
      verifiedTechStack: [],
      siblingBodies: [],
      sequencePosition: null,
    })
    expect(blockers).toContain('scope_unclear')
  })
})
