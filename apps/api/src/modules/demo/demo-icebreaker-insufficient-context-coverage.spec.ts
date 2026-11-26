import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isContactIdentityComplete } from '@bellum/contracts'
import { DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT } from './demo-dataset'
import { DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_COVERAGE } from './demo-coverage'

/**
 * #2648.1 — la salle de démonstration montre une accroche qui échoue avec une
 * raison NOMMÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La chaîne complète (`apps/ia/app/routers/icebreaker.py` → `IaEnvelope` →
 * `ContactIcebreakers.tsx`) était livrée sans qu'AUCUN contact de démonstration
 * ne puisse jamais déclencher `insufficient_context` : chaque contact des six
 * dossiers réels porte un `title` non vide, et les deux contacts « à qualifier »
 * (`DEMO_UNQUALIFIED_CONTACTS`) portent `decision_role: 'unknown'` — une chaîne
 * non vide, donc VRAIE au sens Python (`contact.get("title") or
 * contact.get("decision_role")`). Un visiteur qui cliquait « Générer » sur
 * n'importe quel contact de la salle recevait donc TOUJOURS trois accroches,
 * jamais l'écran qui nomme l'information manquante — une capacité livrée,
 * jamais montrée, exactement le défaut que la craft rule n°9 vise.
 *
 * Elle RECOMPTE sur le jeu de données et relit le semis : un commentaire de
 * classification n'est pas une preuve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (jouée à l'écriture)
 * ─────────────────────────────────────────────────────────────────────────────
 * · `title: ''` remplacé par un titre non vide → ROUGE sur « ni poste ni rôle ».
 * · `decision_role: null` remplacé par une chaîne → ROUGE, même raison.
 * · L'appel à `demoContactRow` rattaché à un compte → ROUGE sur « SANS compte ».
 */

const SEED_SERVICE = join(__dirname, 'demo-seed.service.ts')

describe('#2648.1 — parité démo de l’accroche qui nomme sa raison manquante', () => {
  const seedSource = readFileSync(SEED_SERVICE, 'utf8')

  it('le contact ne porte NI poste NI rôle de décision — la condition du moteur', () => {
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.title.trim()).toBe('')
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.decision_role).toBeNull()
  })

  // Le piège : `title` ET `entity` vides tous les deux auraient laissé la
  // porte d'identité fermée, et le bouton « Générer » désactivé — personne
  // n'aurait jamais pu cliquer jusqu'à `insufficient_context`.
  it('l’identité reste COMPLÈTE malgré `title` vide — sinon le bouton « Générer » resterait désactivé', () => {
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.entity.trim().length).toBeGreaterThan(0)
    expect(
      isContactIdentityComplete({
        fullName: DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.full_name,
        title: DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.title,
        entity: DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.entity,
        role: DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.decision_role,
        linkedinUrl: null,
      }),
    ).toBe(true)
  })

  it('le contact est identifiable malgré tout — un nom et une provenance', () => {
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.full_name.trim().length).toBeGreaterThan(0)
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.why_contact.trim().length).toBeGreaterThan(20)
  })

  it('les adresses restent en .example — personne fictive, aucune ne délivre', () => {
    const email = DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT.email
    if (email) expect(email).toMatch(/\.example$/)
  })

  it('le semis APPELLE réellement l’écriture — pas seulement une méthode qui existe', () => {
    expect(seedSource).toContain('await this.seedIcebreakerInsufficientContextContact(workspaceId, ownerUserId)')
    expect(seedSource).toContain('private async seedIcebreakerInsufficientContextContact(')
  })

  it('le contact part SANS compte — sinon les signaux du compte le sauveraient', () => {
    const body = seedSource.slice(
      seedSource.indexOf('private async seedIcebreakerInsufficientContextContact('),
      seedSource.indexOf('private async seedIcebreakerInsufficientContextContact(') + 1600,
    )
    expect(body).toMatch(/\n\s*null,\n\s*null,\n\s*workspaceId,\n\s*ownerUserId,/)
    expect(body).toContain('this.demoContactRow(')
  })

  it('la couverture NOMME ce qui reste absent, et pourquoi', () => {
    expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_COVERAGE.state).toBe('seede')
    for (const mustMention of ['insufficient_context', 'title', 'decision_role', 'recent_signals']) {
      expect(DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_COVERAGE.reason).toContain(mustMention)
    }
  })
})
