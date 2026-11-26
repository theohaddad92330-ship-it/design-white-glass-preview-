import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_UNQUALIFIED_CONTACTS } from './demo-dataset'
import { DEMO_UNQUALIFIED_CONTACTS_COVERAGE } from './demo-coverage'

/**
 * #1473 — la salle de démonstration montre des contacts « à qualifier ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts` est classée SEEDÉE depuis des mois : la garde PAR TABLE ne pose
 * aucune question sur ce lot. Le chantier n'ajoute pas une table, il ajoute une
 * FORME — une ligne dont `account_id` est `null`. Sans semis, l'onglet « À
 * qualifier », la case « Je ne connais pas encore l'entreprise » et le libellé
 * d'absence de la colonne « Entreprise » s'ouvrent tous sur du vide devant un
 * prospect, et rien ne rougit.
 *
 * Elle RECOMPTE sur le jeu de données, et elle relit le semis : un audit
 * documentaire n'est pas le code, et un `reason` bien écrit ne sème rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (jouée à l'écriture)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Retiré l'appel `this.seedUnqualifiedContacts(...)` de `demo-seed.service.ts`
 *   → ROUGE sur « le semis APPELLE réellement l'écriture ».
 * · Remplacé `null,\n          null,` par un dossier dans l'appel à
 *   `demoContactRow` → ROUGE sur « les deux fiches partent sans compte ».
 * · Vidé `DEMO_UNQUALIFIED_CONTACTS` → ROUGE sur « la garde LIT un jeu non
 *   vide », avant toute autre assertion.
 */

const SEED_SERVICE = join(__dirname, 'demo-seed.service.ts')

describe('#1473 — parité démo des contacts « à qualifier »', () => {
  const seedSource = readFileSync(SEED_SERVICE, 'utf8')

  // Une garde qui ne lit rien est verte sur du vide. Ce test-ci passe AVANT.
  it('LIT un jeu de données non vide et un semis non vide', () => {
    expect(seedSource.length).toBeGreaterThan(1000)
    expect(DEMO_UNQUALIFIED_CONTACTS.length).toBeGreaterThan(0)
  })

  // DEUX, et non une : une liste d'un seul élément ne se lit pas comme une file
  // de travail, et c'est une FILE que l'onglet promet.
  it('porte au moins deux fiches — une seule ne fait pas une file', () => {
    expect(DEMO_UNQUALIFIED_CONTACTS.length).toBeGreaterThanOrEqual(2)
  })

  it('chaque fiche est identifiable et DIT d’où vient la rencontre', () => {
    for (const contact of DEMO_UNQUALIFIED_CONTACTS) {
      expect(contact.full_name.trim().length).toBeGreaterThan(0)
      expect(contact.title.trim().length).toBeGreaterThan(0)
      // Sans provenance, personne ne sait qui est cette personne six mois plus
      // tard — et le rattachement devient impossible.
      expect(contact.why_contact.trim().length).toBeGreaterThan(30)
      expect(contact.key_points.length).toBeGreaterThan(0)
    }
  })

  // Une fiche sans AUCUNE coordonnée serait injoignable : on ne pourrait pas
  // qualifier l'entreprise, donc la file ne se viderait jamais.
  it('chaque fiche porte au moins une coordonnée', () => {
    for (const contact of DEMO_UNQUALIFIED_CONTACTS) {
      expect(Boolean(contact.email?.trim()) || Boolean(contact.phone?.trim())).toBe(true)
    }
  })

  // Personnes FICTIVES : aucune adresse ne doit pouvoir délivrer.
  it('les adresses restent en .example — aucune ne délivre', () => {
    for (const contact of DEMO_UNQUALIFIED_CONTACTS) {
      if (contact.email) expect(contact.email).toMatch(/\.example$/)
    }
  })

  it('le semis APPELLE réellement l’écriture — pas seulement une méthode qui existe', () => {
    expect(seedSource).toContain('await this.seedUnqualifiedContacts(workspaceId, ownerUserId)')
    expect(seedSource).toContain('private async seedUnqualifiedContacts(')
  })

  // Le point qui casse en silence : une fiche rattachée à un compte quelconque
  // remplirait la table sans rien montrer de la capacité.
  it('les deux fiches partent SANS compte et SANS dossier', () => {
    const body = seedSource.slice(
      seedSource.indexOf('private async seedUnqualifiedContacts('),
      seedSource.indexOf('UNE ligne `contacts`, et la seule façon'),
    )
    expect(body.length).toBeGreaterThan(200)
    // Les deux arguments `account` et `accountId` de `demoContactRow`, à `null`.
    expect(body).toMatch(/\n\s*null,\n\s*null,\n\s*workspaceId,\n\s*ownerUserId,/)
    // Et elles passent par l'UNIQUE porte d'écriture, pas par un second chemin.
    expect(body).toContain('this.demoContactRow(')
  })

  // Ce qu'on NE sème PAS est une décision, pas un oubli — et elle est écrite.
  it('la couverture NOMME ce qui reste absent, et pourquoi', () => {
    expect(DEMO_UNQUALIFIED_CONTACTS_COVERAGE.state).toBe('seede')
    for (const absent of ['script d’appel', 'cadence', 'signaux', 'ENTITÉ']) {
      expect(DEMO_UNQUALIFIED_CONTACTS_COVERAGE.reason).toContain(absent)
    }
  })

  // La dérivation de fiche ne doit PAS tourner sans dossier : c'est ce qui
  // fabriquerait un script d'appel ne parlant d'aucune société.
  it('les champs dérivés du dossier sont neutralisés quand il n’y en a pas', () => {
    for (const field of ['scope:', 'phone_script:', 'cadence_messages:', 'followup_message:']) {
      const line = seedSource.split('\n').find(l => l.trim().startsWith(field))
      expect(line).toBeDefined()
      expect(line as string).toContain('account ?')
    }
  })
})
