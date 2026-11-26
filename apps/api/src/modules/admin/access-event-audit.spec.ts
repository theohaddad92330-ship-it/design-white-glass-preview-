import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BACKOFFICE_ACCESS_EVENTS } from '@bellum/contracts'
import { auditEntryForAccess } from './access-event-audit'

/**
 * LE MIROIR — « journal UNIQUE, toutes opérations confondues » (#1666).
 *
 * ⚠️ CE QUE CES TESTS EXISTENT POUR EMPÊCHER
 * Le défaut n°1 du dépôt est du code juste que personne n'appelle. Une table
 * d'audit, un écran, des rétentions — et zéro ligne dedans parce qu'entrer dans
 * la console n'y écrit rien. Ces tests tiennent les DEUX moitiés : que la
 * traduction soit juste, ET que les neuf événements soient couverts (aucun
 * oublié en silence quand on en ajoutera un dixième).
 */
describe('Miroir journal d’accès → journal d’audit (#1666)', () => {
  it('LIT quelque chose — les neuf événements d’accès ont une réponse EXPLICITE', () => {
    // Contrôle positif ET garde d'exhaustivité : un dixième événement ajouté à
    // `BACKOFFICE_ACCESS_EVENTS` sans décision de miroitage fait tomber ce test,
    // plutôt que de disparaître du journal unique sans bruit.
    expect(BACKOFFICE_ACCESS_EVENTS.length).toBeGreaterThanOrEqual(9)
    for (const event of BACKOFFICE_ACCESS_EVENTS) {
      const entry = auditEntryForAccess({ event })
      // `null` est une décision écrite (email_revele), pas un trou.
      expect(entry === null || typeof entry.operation === 'string').toBe(true)
    }
  })

  it('une connexion réussie devient une opération ordinaire RÉUSSIE', () => {
    const entry = auditEntryForAccess({
      event: 'connexion',
      actorEmail: 'ops@bellum-it.com',
      actorRole: 'owner',
      ip: '203.0.113.7',
      country: 'FR',
    })
    expect(entry).toMatchObject({
      operation: 'backoffice.connexion',
      category: 'ordinaire',
      outcome: 'succes',
      actorEmail: 'ops@bellum-it.com',
      actorRole: 'owner',
      ip: '203.0.113.7',
      country: 'FR',
    })
  })

  it('un REFUS est une action ordinaire au résultat `refus`, pas un changement de permission', () => {
    // La catégorie décide de la RÉTENTION : ranger un refus en `permission`
    // gonflerait de trois ans la conservation de la ligne la plus banale de la
    // console. Le refus vit dans `outcome`, pas dans la catégorie.
    const refus = auditEntryForAccess({ event: 'capacite_refusee', actorEmail: 'x@y.fr', target: 'users.delete' })
    expect(refus).toMatchObject({ category: 'ordinaire', outcome: 'refus', subjectId: 'users.delete' })

    const horsListe = auditEntryForAccess({
      event: 'acces_refuse',
      actorEmail: 'intrus@ailleurs.fr',
      reason: 'hors_liste',
    })
    expect(horsListe).toMatchObject({ category: 'ordinaire', outcome: 'refus', detail: 'hors_liste' })
  })

  it('poser un second facteur EST un changement de permission — 36 mois', () => {
    // Le seul de la famille : il change durablement qui peut entrer avec ce
    // compte.
    expect(auditEntryForAccess({ event: 'enrolement_confirme', actorEmail: 'ops@bellum-it.com' })).toMatchObject({
      category: 'permission',
      outcome: 'succes',
    })
  })

  it('SAIT DIRE NON — `email_revele` n’est PAS miroité, il a son propre écrivain', () => {
    // Deux lignes pour un clic, dans un journal d'audit, c'est ce qui apprend à
    // ne plus le croire. La route `/api/admin/email-reveal` écrit directement,
    // avec l'écran d'où vient le clic.
    expect(
      auditEntryForAccess({ event: 'email_revele', actorEmail: 'ops@bellum-it.com', target: '/clients' }),
    ).toBeNull()
  })

  it('l’écrivain direct d’`email_revele` existe VRAIMENT — sinon le miroir aurait dû le couvrir', () => {
    // Le piège symétrique : exclure un événement du miroir en supposant qu'un
    // autre chemin l'écrit. On vérifie que ce chemin existe et appelle bien la
    // porte du journal d'audit.
    const route = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'dashboard-manager',
      'src',
      'app',
      'api',
      'admin',
      'email-reveal',
      'route.ts',
    )
    const source = readFileSync(route, 'utf8')
    expect(source).toContain('journaliserAudit')
    expect(source).toContain("operation: 'email.reveal'")
  })

  it('une LACUNE reste une lacune — jamais « inconnu »', () => {
    const entry = auditEntryForAccess({ event: 'deconnexion' })
    expect(entry).toMatchObject({ actorEmail: null, actorRole: null, ip: null, country: null, detail: null })
  })
})
