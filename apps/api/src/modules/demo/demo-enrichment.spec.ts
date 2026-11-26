import { DEMO_ENRICHMENT_REASON, demoEnrichment } from './demo-enrichment'

/**
 * Le bouton « Enrichir » rendait des coordonnées fictives — cohérent tant que
 * les personnes du jeu étaient inventées. Les cinq dossiers portent désormais
 * des sociétés RÉELLES, et leurs contacts nommés sont des mandataires sociaux
 * publiés au registre.
 *
 * Ce que ces tests verrouillent est donc l'inverse de ce qu'ils vérifiaient : le
 * clic ne doit RIEN fabriquer. Une adresse en `.example` n'est pas une échappée
 * — c'est une donnée inventée attribuée à une personne qui existe, publiée sur
 * un lien que n'importe qui peut ouvrir.
 */
const CONTACT = {
  id: 'c-1',
  full_name: 'Jean Castex',
  title: 'Président du conseil d’administration et directeur général',
  entity: 'SNCF',
}

describe('demoEnrichment — ce que le clic ne fabrique PAS', () => {
  it('ne rend aucune coordonnée, sur aucun canal', () => {
    const data = demoEnrichment(CONTACT)

    expect(data.matched).toBe(false)
    expect(data.email).toBeNull()
    expect(data.phone).toBeNull()
    expect(data.linkedin_url).toBeNull()
    expect(data.phone_numbers).toEqual([])
  })

  it('ne fabrique pas d’adresse, même impossible à joindre', () => {
    // Le piège que ce test ferme : « .example ne peut atteindre personne, donc
    // c'est sans risque ». Non — la fiche affiche alors une adresse au nom
    // d'une personne réelle, sur une société réelle, depuis un lien public.
    for (const entity of ['SNCF', 'Société Générale', 'Une Vraie Entreprise SA', '']) {
      expect(demoEnrichment({ ...CONTACT, entity }).email).toBeNull()
    }
  })

  it('ne renvoie jamais d’adresse de profil sur le domaine réel d’un réseau', () => {
    // Une URL construite mène soit nulle part, soit chez un homonyme. Les deux
    // sont pires que rien.
    expect(demoEnrichment(CONTACT).linkedin_url).toBeNull()
  })

  it('reprend le nom et le titre SEEDÉS, sans en inventer', () => {
    const data = demoEnrichment(CONTACT)

    expect(data.first_name).toBe('Jean')
    expect(data.last_name).toBe('Castex')
    expect(data.title).toBe('Président du conseil d’administration et directeur général')
    expect(data.organization_name).toBe('SNCF')
  })

  it('ne fabrique pas d’identité quand la fiche n’en porte pas', () => {
    // L'ancienne version retombait sur « Camille Martin » : un nom inventé de
    // plus, sur une société réelle.
    const data = demoEnrichment({ ...CONTACT, full_name: null, entity: null })

    expect(data.first_name).toBeNull()
    expect(data.last_name).toBeNull()
    expect(data.organization_name).toBeNull()
  })

  it('est déterministe — une démonstration rejouée montre la même chose', () => {
    expect(demoEnrichment(CONTACT)).toEqual(demoEnrichment(CONTACT))
  })

  it('porte une raison lisible, qui dit ce que le même clic ferait en vrai', () => {
    // Un « rien trouvé » sans explication se lit comme une panne. Le message
    // doit dire pourquoi ici, et ce que le clic donne sur un espace réel.
    expect(DEMO_ENRICHMENT_REASON).toContain('démonstration')
    expect(DEMO_ENRICHMENT_REASON).toContain('ton espace')
    expect(DEMO_ENRICHMENT_REASON.length).toBeGreaterThan(80)
  })
})
