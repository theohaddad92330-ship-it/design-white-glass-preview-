import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_CHAT_PROMPTS } from './demo-chat-script'

/**
 * #3219 (#190.2 côté contact) — « avant que je lui écrive, quelque chose cloche ? » répond en salle
 * (craft rule n°9). La réponse est écrite à la main : ce test la tient aux deux relevés RÉELLEMENT
 * semés (`DEMO_CONTACT_SCOPE_DIFFERENCE`, `demo-dataset.ts` côté API), pour qu'elle ne cite jamais
 * un fait que la salle n'a pas — et qu'elle ne tranche jamais entre deux vérités de portée.
 */
const DATASET = readFileSync(join(__dirname, '../../../../api/src/modules/demo/demo-dataset.ts'), 'utf8')

describe('#3219 — p-contact-preflight : le contrôle avant action, sur ce que la salle a semé', () => {
  const found = DEMO_CHAT_PROMPTS.find(p => p.id === 'p-contact-preflight')
  const answer = found?.answer ?? ''

  it('existe dans la salle', () => {
    expect(found).toBeDefined()
    expect(found?.question).toContain('SNCF')
  })

  it('cite les deux relevés semés, avec leur portée déclarée', () => {
    for (const fragment of [
      "first: { value: 'Directeur technique', scope: 'Groupe entier'",
      "second: { value: 'Directeur technique — entité numérique voyageurs', scope: 'Filiales'",
    ]) {
      expect(DATASET).toContain(fragment)
    }
    expect(answer).toContain('« Directeur technique » — analyse du dossier, portée **Groupe entier**')
    expect(answer).toContain(
      '« Directeur technique — entité numérique voyageurs » — analyse du dossier, portée **Filiales**',
    )
  })

  it('sait dire NON : ne choisit pas entre les deux, n’envoie rien, et laisse la correction à l’humain', () => {
    expect(answer).toMatch(/je ne choisis pas/)
    expect(answer).toMatch(/corrige la fiche/)
    expect(answer).toMatch(/Je n’envoie rien/)
    expect(answer).not.toMatch(/la bonne valeur est/i)
  })
})
