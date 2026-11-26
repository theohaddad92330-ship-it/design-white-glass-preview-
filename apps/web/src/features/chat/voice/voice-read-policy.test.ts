/**
 * #2434.47 / #2434.48 / #2434.49 / #2434.51 — CE QUE LAURA NE LIT JAMAIS À VOIX HAUTE.
 *
 * `ListenReply` lisait le texte de la réponse tel quel (seule la ponctuation de
 * mise en forme markdown était retirée, voir `speakableText`). Rien n'empêchait
 * de lire à voix haute un tableau de cinquante lignes, un e-mail, un numéro de
 * téléphone ou un IBAN présents dans la réponse de Laura.
 *
 * Ce module retire du texte PARLÉ (jamais du texte AFFICHÉ, qui reste intact
 * dans la bulle) trois catégories, avant que `ListenReply` ne l'envoie à
 * `speechSynthesis` :
 *  · un tableau markdown de plus de 50 lignes de données (#2434.47) ;
 *  · une coordonnée sensible — e-mail, téléphone, IBAN (#2434.48) ;
 *  · un long avertissement en citation (`>`), au-delà d'un seuil de caractères
 *    (#2434.49) ;
 * et signale quand plus rien de lisible ne reste, pour que l'écran propose
 * « je t'affiche le détail » plutôt qu'un bouton qui ne lirait rien (#2434.51).
 */
import { describe, expect, it } from 'vitest'
import { prepareSpokenText, speakableText } from './voice-read-policy'

function tableOf(rows: number): string {
  const header = '| Compte | Signal |'
  const sep = '| --- | --- |'
  const body = Array.from({ length: rows }, (_, i) => `| Compte ${i} | Signal ${i} |`).join('\n')
  return [header, sep, body].join('\n')
}

describe('#2434 — la politique de lecture à voix haute', () => {
  it('un texte ordinaire passe intact, rien de bloqué', () => {
    const result = prepareSpokenText('Trois signaux cette semaine chez Acme.')
    expect(result).toEqual({ spoken: 'Trois signaux cette semaine chez Acme.', blocked: false })
  })

  it('un petit tableau (5 lignes) reste lisible — seul le tableau LONG est visé', () => {
    const text = `Voici le détail :\n\n${tableOf(5)}`
    const result = prepareSpokenText(text)
    expect(result.spoken).toContain('Compte 0')
    expect(result.blocked).toBe(false)
  })

  it('#2434.47 — un tableau de plus de 50 lignes ne se lit jamais, le reste survit', () => {
    const text = `Voici le détail :\n\n${tableOf(60)}`
    const result = prepareSpokenText(text)
    expect(result.spoken).toBe('Voici le détail :')
    expect(result.spoken).not.toContain('Compte 0')
    expect(result.blocked).toBe(false)
  })

  it('#2434.51 — un message qui N’EST QUE ce tableau long est entièrement bloqué', () => {
    const result = prepareSpokenText(tableOf(60))
    expect(result.spoken.trim()).toBe('')
    expect(result.blocked).toBe(true)
  })

  it('#2434.48 — un e-mail ne se lit jamais à voix haute', () => {
    const result = prepareSpokenText('Contacte-la à jean.dupont@example.com pour la suite.')
    expect(result.spoken).not.toContain('jean.dupont@example.com')
    expect(result.spoken).toContain('Contacte-la')
    expect(result.spoken).toContain('pour la suite')
  })

  it('#2434.48 — un numéro de téléphone ne se lit jamais à voix haute', () => {
    const result = prepareSpokenText('Appelle-la au 06 12 34 56 78 avant midi.')
    expect(result.spoken).not.toMatch(/06[\s.-]?12[\s.-]?34[\s.-]?56[\s.-]?78/)
    expect(result.spoken).toContain('Appelle-la')
    expect(result.spoken).toContain('avant midi')
  })

  it('#2434.48 — un IBAN ne se lit jamais à voix haute', () => {
    const result = prepareSpokenText('IBAN : FR76 3000 6000 0112 3456 7890 189')
    expect(result.spoken).not.toContain('FR76')
    expect(result.spoken).not.toMatch(/\d{4}/)
  })

  it('#2434.51 — un message qui N’EST QU’une coordonnée sensible est entièrement bloqué', () => {
    const result = prepareSpokenText('jean.dupont@example.com')
    expect(result.spoken.trim()).toBe('')
    expect(result.blocked).toBe(true)
  })

  it('#2434.49 — un long avertissement en citation ne se lit jamais, le reste survit', () => {
    const disclaimer =
      '> Ces informations sont fournies à titre indicatif et ne constituent en aucun cas un engagement contractuel de la part de BellumAI ; elles doivent être vérifiées avant toute décision commerciale ou financière engageant ta société.'
    const text = `Résumé de la semaine.\n\n${disclaimer}`
    const result = prepareSpokenText(text)
    expect(result.spoken).toBe('Résumé de la semaine.')
    expect(result.blocked).toBe(false)
  })

  it('une courte citation reste lisible — seule la LONGUE citation est visée', () => {
    const text = 'Résumé.\n\n> Vu le 12/09.'
    const result = prepareSpokenText(text)
    expect(result.spoken).toContain('Vu le 12/09')
  })

  it('sait dire NON — un texte vide reste bloqué sans lever d’erreur', () => {
    expect(prepareSpokenText('')).toEqual({ spoken: '', blocked: true })
  })
})

// #5032.5 — le bouton « Écouter » est retiré ; la voix du mode conversation garde ce qui se dit.
describe('speakableText — ce que le mode conversation prononce', () => {
  it('retire la ponctuation de mise en forme, jamais le texte', () => {
    expect(speakableText('**Bonjour** `Laura` | #1')).toBe('Bonjour Laura 1')
  })
})
