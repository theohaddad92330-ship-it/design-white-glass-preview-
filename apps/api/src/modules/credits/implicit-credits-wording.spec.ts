import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// #4464 — crédits IMPLICITES (Louis 22/10/2026) : un texte qui part vers l'utilisateur (refus, raison d'une porte,
// message d'un enrichissement) ne dit jamais « crédit ». Le débit, le registre et le remboursement nocturne ne changent pas ;
// seul ce que la personne LIT change. Le back-office (`backoffice-alert-dispatch`, `admin/*`) garde son vocabulaire.
const SRC = join(__dirname, '..')
const USER_FACING = [
  'credits/credits.service.ts',
  'contacts/contacts.service.ts',
  'action-router/action-router.service.ts',
]

/** Les littéraux « message / reason » qui disent « crédit(s) » (hors commentaires). */
export function creditWordingInMessages(source: string): string[] {
  return source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(line => /["'`][^"'`]*\bcr[ée]dits?\b[^"'`]*["'`]/i.test(line))
    .filter(line => /message|reason|REASON|"|'/.test(line))
    .filter(line => /(Aucun|aucun|engage|débité|dépense|Tu n.as|solde)/.test(line))
}

describe('crédits implicites — le texte lisible ne dit pas « crédit » (#4464)', () => {
  it.each(USER_FACING)('%s', file => {
    expect(creditWordingInMessages(readFileSync(join(SRC, file), 'utf8'))).toEqual([])
  })

  it('sait dire NON : une phrase qui promet « aucun crédit débité » est attrapée', () => {
    expect(creditWordingInMessages(`message: "Rien. Aucun crédit n'a été débité.",`)).toHaveLength(1)
    expect(creditWordingInMessages(`reason: 'Ce geste engage des crédits : go.'`)).toHaveLength(1)
    expect(creditWordingInMessages(`// Aucun crédit n'a été débité (commentaire)`)).toEqual([])
    expect(creditWordingInMessages(`message: "Rien n'a été consommé — réessaie."`)).toEqual([])
  })
})
