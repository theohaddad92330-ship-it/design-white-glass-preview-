import {
  buildProvisioningPreview,
  periodEndOf,
  renderOwnerInvitationEmail,
  type ProvisioningContext,
  type ProvisioningPreviewInput,
} from './manual-provisioning-plan'

/**
 * L'aperçu des six étapes, prouvé sans base et sans horloge (#1665, règle 3).
 *
 * `now` est un PARAMÈTRE : sans ça, « le contrat commence aujourd'hui » serait
 * un test qui passe le 7 septembre et tombe le 8.
 */
const NOW = new Date('2026-09-07T10:00:00.000Z')

const input = (over: Partial<ProvisioningPreviewInput> = {}): ProvisioningPreviewInput => ({
  esnName: 'Skaizen',
  owner: { email: '  Theo@Skaizen.FR ', firstName: 'Théo', lastName: 'Martin' },
  plan: 'team',
  extraSeats: 2,
  billing: {
    amountCents: 259000,
    currency: 'eur',
    period: 'yearly',
    startDate: '2026-09-07',
    reference: 'FA-2026-042',
  },
  team: [{ email: 'sales@skaizen.fr', role: 'member' }],
  ...over,
})

const context = (over: Partial<ProvisioningContext> = {}): ProvisioningContext => ({
  ownerExists: false,
  ownerHasStripeSubscription: false,
  existingWorkspace: null,
  existingSubscription: null,
  existingTerms: false,
  invoiceAlreadyRecorded: false,
  plan: { label: 'Entreprise', accountsLimit: 600, enrichmentCredits: 0, seats: 3 },
  ...over,
})

describe('l’aperçu du provisionnement (#1665, règle 3)', () => {
  it('récapitule les SIX étapes de l’issue, dans leur ordre de récit', () => {
    const preview = buildProvisioningPreview(input(), context(), NOW)
    expect(preview.steps.map(step => step.rank)).toEqual([1, 2, 3, 4, 5, 6])
    expect(preview.steps.map(step => step.title)).toEqual([
      "Créer l'espace",
      'Créer le propriétaire',
      "Attribuer l'offre",
      'Créditer',
      'Facturation',
      "Envoyer l'invitation",
    ])
  })

  it('déclare, étape par étape, ce que la transaction couvre', () => {
    // C'est la partie honnête de « tout est annulé » : le compte
    // d'authentification et les e-mails ne sont PAS dans la transaction.
    const preview = buildProvisioningPreview(input(), context(), NOW)
    expect(preview.steps.filter(step => !step.transactional).map(step => step.key)).toEqual(['owner', 'invitations'])
    expect(preview.compensations).toHaveLength(4)
  })

  it('normalise l’adresse du propriétaire comme l’écriture le fera', () => {
    const preview = buildProvisioningPreview(input(), context(), NOW)
    expect(preview.ownerEmail).toBe('theo@skaizen.fr')
  })

  it('annonce la CRÉATION quand rien n’existe', () => {
    const preview = buildProvisioningPreview(input(), context(), NOW)
    expect(preview.steps.find(step => step.key === 'owner')?.action).toBe('create')
    expect(preview.steps.find(step => step.key === 'workspace')?.action).toBe('create')
  })

  it('annonce la RÉUTILISATION d’un compte existant plutôt que de la laisser découvrir', () => {
    const preview = buildProvisioningPreview(
      input(),
      context({ ownerExists: true, existingWorkspace: { id: 'ws', name: 'Mon espace' } }),
      NOW,
    )
    expect(preview.steps.find(step => step.key === 'owner')?.action).toBe('reuse')
    // « Mon espace » → « Skaizen » : un RENOMMAGE, pas un second espace.
    expect(preview.steps.find(step => step.key === 'workspace')?.action).toBe('rename')
    expect(preview.steps.find(step => step.key === 'workspace')?.detail[0]).toContain('RENOMMÉ')
  })

  it('un espace déjà nommé comme l’ESN est simplement réutilisé', () => {
    const preview = buildProvisioningPreview(
      input(),
      context({ ownerExists: true, existingWorkspace: { id: 'ws', name: 'Skaizen' } }),
      NOW,
    )
    expect(preview.steps.find(step => step.key === 'workspace')?.action).toBe('reuse')
  })

  it('compte les sièges du palier PLUS les sièges négociés', () => {
    const preview = buildProvisioningPreview(input(), context(), NOW)
    expect(preview.steps[0]?.detail.join(' ')).toContain('Sièges : 5')
  })

  it('nomme le blocage Stripe AVANT que le compte ne soit créé', () => {
    const preview = buildProvisioningPreview(input(), context({ ownerHasStripeSubscription: true }), NOW)
    expect(preview.blockers[0]).toContain('abonnement Stripe actif')
  })

  it('refuse un nom d’ESN vide plutôt que d’ouvrir un espace sans nom', () => {
    const preview = buildProvisioningPreview(input({ esnName: '   ' }), context(), NOW)
    expect(preview.blockers.some(b => b.includes("nom de l'ESN"))).toBe(true)
  })

  describe('la facturation, telle qu’elle sera écrite', () => {
    it('dérive l’échéance d’engagement, jamais « 0 mois »', () => {
      const preview = buildProvisioningPreview(
        input({
          billing: { amountCents: 11900, period: 'monthly', startDate: '2026-09-01', commitmentMonths: 3 },
        }),
        context(),
        NOW,
      )
      expect(preview.commitmentEnd).toBe('2026-11-30')
    })

    it('sans engagement, l’échéance est `null` et l’étape le DIT', () => {
      const preview = buildProvisioningPreview(input(), context(), NOW)
      expect(preview.commitmentEnd).toBeNull()
      expect(preview.steps.find(step => step.key === 'billing')?.detail).toContain('Sans engagement.')
    })

    it('annonce la période exacte que la première facture couvrira', () => {
      const preview = buildProvisioningPreview(input(), context(), NOW)
      expect(preview.firstInvoiceWindow).toEqual({ start: '2026-09-07', end: '2027-09-06' })
    })

    it('sans référence, aucune facture — et l’écran l’explique', () => {
      const preview = buildProvisioningPreview(
        input({ billing: { amountCents: 11900, period: 'monthly', startDate: '2026-09-01' } }),
        context(),
        NOW,
      )
      expect(preview.firstInvoiceWindow).toBeNull()
      expect(preview.steps.find(step => step.key === 'billing')?.detail.join(' ')).toContain('facture manquante')
    })

    it('signale une facture DÉJÀ enregistrée plutôt que de promettre un doublon', () => {
      const preview = buildProvisioningPreview(input(), context({ invoiceAlreadyRecorded: true }), NOW)
      expect(preview.steps.find(step => step.key === 'billing')?.detail.join(' ')).toContain('déjà au grand livre')
    })

    it('situe la date de début par rapport à AUJOURD’HUI — `now` est un paramètre', () => {
      const futur = buildProvisioningPreview(
        input({ billing: { amountCents: 11900, period: 'monthly', startDate: '2026-12-01' } }),
        context(),
        NOW,
      )
      expect(futur.steps.find(step => step.key === 'billing')?.detail.join(' ')).toContain("n'a pas encore commencé")

      const passe = buildProvisioningPreview(
        input({ billing: { amountCents: 11900, period: 'monthly', startDate: '2026-01-01' } }),
        context(),
        NOW,
      )
      expect(passe.steps.find(step => step.key === 'billing')?.detail.join(' ')).toContain('immédiatement due')
    })
  })

  describe('les crédits (étape 4)', () => {
    it('reprend la valeur du palier et le DIT', () => {
      const preview = buildProvisioningPreview(input(), context(), NOW)
      const detail = preview.steps.find(step => step.key === 'credits')?.detail.join(' ')
      expect(detail).toContain('600 crédits')
      expect(detail).toContain('valeur du palier')
    })

    it('distingue une valeur NÉGOCIÉE de la valeur du palier', () => {
      const preview = buildProvisioningPreview(input({ accountsLimit: 900 }), context(), NOW)
      const detail = preview.steps.find(step => step.key === 'credits')?.detail.join(' ')
      expect(detail).toContain('900 crédits')
      expect(detail).toContain('négociés')
    })
  })

  describe('l’e-mail préparé (règle 2)', () => {
    it('l’aperçu ne porte PAS le lien — un aperçu se capture et se partage', () => {
      const preview = buildProvisioningPreview(input(), context(), NOW)
      expect(preview.ownerInvitation?.carriesLink).toBe(false)
      expect(preview.ownerInvitation?.body).toContain('sera engendré à la validation')
      expect(preview.ownerInvitation?.body).not.toContain('http')
    })

    it('aucun e-mail préparé pour un compte qui a déjà son mot de passe', () => {
      const preview = buildProvisioningPreview(input(), context({ ownerExists: true }), NOW)
      expect(preview.ownerInvitation).toBeNull()
    })

    it('le MÊME rendu, avec le lien, est ce que l’opérateur enverra', () => {
      const email = renderOwnerInvitationEmail({
        ownerEmail: 'theo@skaizen.fr',
        ownerFirstName: 'Théo',
        esnName: 'Skaizen',
        planLabel: 'Entreprise',
        link: 'https://app.bellum.ai/auth/reset-password?t=abc',
        expiresAt: '2026-09-09T10:00:00.000Z',
      })
      expect(email.carriesLink).toBe(true)
      expect(email.to).toBe('theo@skaizen.fr')
      expect(email.subject).toBe('Votre espace Skaizen est prêt')
      expect(email.body).toContain('Bonjour Théo,')
      expect(email.body).toContain('https://app.bellum.ai/auth/reset-password?t=abc')
      expect(email.body).toContain('2026-09-09T10:00:00.000Z')
    })

    it('sans prénom, l’e-mail reste correct — jamais « Bonjour undefined »', () => {
      const email = renderOwnerInvitationEmail({
        ownerEmail: 'theo@skaizen.fr',
        esnName: 'Skaizen',
        planLabel: 'Entreprise',
        link: null,
        expiresAt: null,
      })
      expect(email.body).toContain('Bonjour,')
      expect(email.body).not.toContain('undefined')
    })
  })

  it('retire le propriétaire de la liste des invitations d’équipe', () => {
    const preview = buildProvisioningPreview(
      input({
        team: [
          { email: 'THEO@skaizen.fr', role: 'admin' },
          { email: 'sales@skaizen.fr', role: 'member' },
        ],
      }),
      context(),
      NOW,
    )
    // Il est déjà membre : l'inviter se solderait par un 409 sur lui-même.
    expect(preview.teamInvitations).toEqual([{ email: 'sales@skaizen.fr', role: 'member' }])
  })

  describe('periodEndOf — la dérivation DÉPLACÉE, pas recopiée', () => {
    it('couvre un mois, un trimestre, une année', () => {
      expect(periodEndOf('monthly', '2026-09-01')).toBe('2026-09-30')
      expect(periodEndOf('quarterly', '2026-09-01')).toBe('2026-11-30')
      expect(periodEndOf('yearly', '2026-09-01')).toBe('2027-08-31')
    })

    it('un contrat ponctuel couvre son jour, et rien de plus', () => {
      // L'étaler sur un mois inventerait une fenêtre que le contrat n'a pas.
      expect(periodEndOf('one_off', '2026-09-07')).toBe('2026-09-07')
    })
  })
})
