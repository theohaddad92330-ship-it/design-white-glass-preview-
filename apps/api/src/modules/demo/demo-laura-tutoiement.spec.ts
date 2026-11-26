import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_PROFILE_CONTEXT } from './demo-dataset'

/**
 * #3769 — Laura TUTOIE le commercial partout (D45, chantiers-livres.md). Cette garde
 * lit les textes DÉMO que Laura adresse au commercial : le message d'accueil
 * (`welcomeSummary`) et la réponse d'amorce de la conversation d'exemple.
 * Les messages destinés à un client (brouillons, client-pitch) gardent le vouvoiement
 * et ne sont PAS lus ici.
 */
const VOUVOIEMENT = /\b(vous|votre|vos)\b|\bdites-moi\b|\bindiquez\b|\bsouhaitez\b/i

function welcomeTexts(): string[] {
  const w = DEMO_PROFILE_CONTEXT.welcomeSummary
  return [
    w?.profileRecap,
    w?.searchesPersonalization,
    w?.contactsPersonalization,
    w?.messagesPersonalization,
    w?.scoringPersonalization,
  ].filter((t): t is string => typeof t === 'string')
}

function sampleConversationReply(): string {
  const src = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')
  const m = src.match(/'(Trois comptes ressortent avec un signal actif[^']*)'/)
  return m?.[1] ?? ''
}

describe('#3769 — Laura tutoie le commercial dans les textes démo', () => {
  it('le message d’accueil (welcomeSummary) ne vouvoie pas', () => {
    const texts = welcomeTexts()
    expect(texts.length).toBeGreaterThan(0)
    for (const t of texts) expect(t).not.toMatch(VOUVOIEMENT)
  })

  it('la réponse d’amorce de la conversation d’exemple ne vouvoie pas (et est bien lue)', () => {
    const reply = sampleConversationReply()
    expect(reply).toContain('Trois comptes ressortent')
    expect(reply).not.toMatch(VOUVOIEMENT)
  })

  it('la garde sait dire NON sur l’ancien texte', () => {
    expect('Dites-moi lequel regarder en premier.').toMatch(VOUVOIEMENT)
    expect('Vous êtes une ESN de 1 à 10 consultants').toMatch(VOUVOIEMENT)
    expect('Dis-moi lequel regarder. Tu es une ESN.').not.toMatch(VOUVOIEMENT)
  })
})
