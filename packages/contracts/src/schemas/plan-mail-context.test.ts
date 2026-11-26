import { describe, expect, it } from 'vitest'
import { findContactByName, findContactNamedIn, readPlanSignal } from './plan-mail-context.js'

describe('readPlanSignal (#4521.2)', () => {
  it('lit le signal factuel de la consigne et le met en une ligne', () => {
    const label =
      "Envoyer un email J1 (5 lignes, pas de PJ) à Muriel Kumpflen (DG) en s'appuyant sur le signal factuel du repli de CA (72,4 M€ à 69,1 M€) pour ouvrir"
    expect(readPlanSignal(label)).toBe('Repli de CA : 72,4 M€ → 69,1 M€')
  })

  it('garde le détail tel quel quand il ne décrit pas un passage de A à B', () => {
    expect(readPlanSignal('Relancer en citant le signal de la levée de fonds (série B, 12 M€)')).toBe(
      'Levée de fonds : série B, 12 M€',
    )
  })

  it("ne rend rien quand la consigne ne porte pas de signal (on n'affiche pas ce qu'on n'a pas)", () => {
    expect(readPlanSignal('Envoyer un email J1 à Muriel Kumpflen (DG)')).toBeNull()
    expect(readPlanSignal('')).toBeNull()
    expect(readPlanSignal(null)).toBeNull()
  })

  it("n'invente pas un signal sans détail chiffré entre parenthèses", () => {
    expect(readPlanSignal('en s’appuyant sur le signal du repli de CA sans plus')).toBeNull()
  })
})

describe('findContactByName (#4415.2, partagé #4521.1)', () => {
  const contacts = [
    { id: 'a', full_name: 'Muriel Kumpflen' },
    { id: 'b', full_name: 'Jean Dupont' },
  ]
  it('trouve par nom exact, puis par nom normalisé (casse, accents, rôle)', () => {
    expect(findContactByName(contacts, 'Muriel Kumpflen')?.id).toBe('a')
    expect(findContactByName(contacts, 'MURIEL KUMPFLEN (DG)')?.id).toBe('a')
    expect(findContactByName([{ id: 'c', full_name: 'Éloïse Martin' }], 'eloise martin')?.id).toBe('c')
  })
  it('rend null sur un inconnu ou un nom vide', () => {
    expect(findContactByName(contacts, 'Quelqu’un')).toBeNull()
    expect(findContactByName(contacts, '  ')).toBeNull()
  })
})

describe("findContactNamedIn (#4521.1 — le nom dans la consigne, quand la ligne n'a pas de contact_id)", () => {
  const book = [
    { id: 'a', full_name: 'Muriel Kumpflen' },
    { id: 'b', full_name: 'Paul Durand' },
    { id: 'c', full_name: 'Paul Durand Martin' },
    { id: 'd', full_name: null },
  ]
  const label = "Envoyer un email J1 (5 lignes, pas de PJ) à Muriel Kumpflen (DG) en s'appuyant sur le signal"

  it('rattache le contact dont le nom complet figure dans la consigne', () => {
    expect(findContactNamedIn(book, label)?.id).toBe('a')
    expect(findContactNamedIn(book, 'écrire à MURIEL  kumpflen, demain')?.id).toBe('a')
  })

  it('le nom le plus long est celui qui est cité', () => {
    expect(findContactNamedIn(book, 'Appeler Paul Durand Martin')?.id).toBe('c')
  })

  it('aucun nom cité, un prénom seul, ou deux noms cités : personne — jamais un destinataire deviné', () => {
    expect(findContactNamedIn(book, 'Envoyer un email J1 au DG')).toBeNull()
    expect(findContactNamedIn(book, 'Écrire à Muriel')).toBeNull()
    expect(findContactNamedIn(book, 'Écrire à Muriel Kumpflen et Paul Durand')).toBeNull()
    expect(findContactNamedIn(book, '')).toBeNull()
  })
})
