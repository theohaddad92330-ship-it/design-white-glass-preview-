import { planDetach, refuseDetach, type DetachAccount } from './account-detach'

/**
 * #1111 — le RETOUR ARRIÈRE du rattachement.
 *
 * Le rattachement était livré sans lui : `merged_into_id` était écrite et
 * jamais relue, et `status` était écrasé par `'archived'` sans que l'état
 * d'avant soit gardé nulle part. Un « détacher » écrit sur cette base aurait dû
 * CHOISIR un statut de retour, donc en inventer un.
 *
 * Ce que ces tests protègent :
 *  - on ne restitue JAMAIS un état qu'on n'a pas enregistré ;
 *  - un lien posé avant l'enregistrement de cet état est refusé À VOIX HAUTE,
 *    pas restitué au jugé ;
 *  - le retour des contacts respecte l'unicité par nom du compte d'accueil —
 *    le même index qui a fait tomber trois runs en #983.
 */

const linked = (over: Partial<DetachAccount> = {}): DetachAccount => ({
  id: 'a-klesia-adp',
  mergedIntoId: 'a-klesia',
  previousStatus: 'completed',
  previousCommercialStatus: 'watching',
  hostEntityId: 'e-klesia-adp',
  ...over,
})

describe('les refus du détachement (#1111)', () => {
  it('refuse un dossier qui n’est rattaché à rien', () => {
    expect(refuseDetach(linked({ mergedIntoId: null }))).toBe('not_linked')
  })

  it('refuse un lien posé AVANT que l’état d’avant soit enregistré', () => {
    // Le seul cas où restituer exigerait d'inventer un statut.
    expect(refuseDetach(linked({ previousStatus: null }))).toBe('link_predates_reversal')
  })

  it('accepte un lien qui porte son état d’avant', () => {
    expect(refuseDetach(linked())).toBeNull()
  })

  it('n’exige PAS une entité d’accueil pour rendre son statut au dossier', () => {
    // Un lien sans entité n'a fait bouger aucun contact identifiable ; ce n'est
    // pas une raison de laisser le dossier archivé pour toujours.
    expect(refuseDetach(linked({ hostEntityId: null }))).toBeNull()
  })
})

describe('le plan de détachement (#1111)', () => {
  it('rend au dossier le statut EXACT qu’il avait, jamais un statut choisi', () => {
    const plan = planDetach({ account: linked(), hostedContacts: [], homeContacts: [] })
    expect(plan.restoredStatus).toBe('completed')
    expect(plan.restoredCommercialStatus).toBe('watching')
  })

  it('laisse le statut commercial à null quand il n’y en avait pas', () => {
    // `null` = « il n'y en avait pas », et surtout pas « inbox » par défaut :
    // un dossier reviendrait dans la boîte de tri sans que personne l'y mette.
    const plan = planDetach({
      account: linked({ previousCommercialStatus: null }),
      hostedContacts: [],
      homeContacts: [],
    })
    expect(plan.restoredCommercialStatus).toBeNull()
  })

  it('ramène les contacts hébergés par l’entité d’accueil', () => {
    const plan = planDetach({
      account: linked(),
      hostedContacts: [
        { id: 'c-1', fullName: 'Marie Dupont' },
        { id: 'c-2', fullName: 'Paul Martin' },
      ],
      homeContacts: [],
    })
    expect(plan.returnedContactIds).toEqual(['c-1', 'c-2'])
    expect(plan.keptContacts).toEqual([])
  })

  it('laisse en place un contact dont le nom est DÉJÀ pris sur le dossier rendu', () => {
    // Le ramener violerait `idx_contacts_account_normalized_name` ; l'écraser
    // effacerait la fiche la plus renseignée des deux.
    const plan = planDetach({
      account: linked(),
      hostedContacts: [
        { id: 'c-1', fullName: 'Marie Dupont' },
        { id: 'c-2', fullName: 'Paul Martin' },
      ],
      homeContacts: [{ id: 'c-home', fullName: 'marie  DUPONT' }],
    })
    expect(plan.returnedContactIds).toEqual(['c-2'])
    expect(plan.keptContacts).toEqual([{ id: 'c-1', fullName: 'Marie Dupont', reason: 'name_taken' }])
  })

  it('compare les noms accents et casse ignorés — comme l’index de la base', () => {
    const plan = planDetach({
      account: linked(),
      hostedContacts: [{ id: 'c-1', fullName: 'Hélène Ríos' }],
      homeContacts: [{ id: 'c-home', fullName: 'helene rios' }],
    })
    expect(plan.returnedContactIds).toEqual([])
  })

  it('laisse en place un contact sans nom exploitable, au lieu de le rendre anonyme', () => {
    const plan = planDetach({
      account: linked(),
      hostedContacts: [{ id: 'c-vide', fullName: '   ' }],
      homeContacts: [],
    })
    expect(plan.returnedContactIds).toEqual([])
    expect(plan.keptContacts).toHaveLength(1)
  })

  it('ne ramène aucun contact quand aucune entité n’a hébergé le rattachement', () => {
    const plan = planDetach({ account: linked({ hostEntityId: null }), hostedContacts: [], homeContacts: [] })
    expect(plan.returnedContactIds).toEqual([])
    expect(plan.restoredStatus).toBe('completed')
  })
})
