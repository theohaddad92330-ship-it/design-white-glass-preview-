import { NEED_OPEN_STATUSES } from '@bellum/contracts'
import { sameZone, sharedSkillTerms } from '../projects/reverse-need-prospects'
import { DEMO_REVERSE_PROSPECTS_COVERAGE } from './demo-coverage'
import { DEMO_DELIVERY_CARRIER_ACCOUNT, DEMO_DELIVERY_CLIENT, DEMO_FLAGSHIP_NEED } from './demo-dataset'

/**
 * « UN BESOIN SANS CANDIDAT OUVRE UNE PISTE » — CE QUE LA SALLE EN MONTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /projects/needs/:needId/reverse-prospects` (`open-needs.service.ts`)
 * croise DEUX besoins ouverts, sur des comptes DIFFÉRENTS, qui partagent la
 * même zone (`location`, égalité normalisée — `sameZone`) et au moins une
 * compétence (`skills[].term` — `sharedSkillTerms`). Avant ce lot, AUCUNE paire
 * de besoins de la salle ne partageait sa zone : le besoin phare
 * (`DEMO_FLAGSHIP_NEED`) était en « Île-de-France », les cinq besoins du client
 * d'exemple en « Lyon (69) » ou « Lyon ». `NeedReverseProspects`
 * s'ouvrait donc TOUJOURS sur « Personne d'autre ne cherche ce profil dans
 * cette zone pour l'instant » — jamais sur une piste réelle, alors que
 * `shortlist_count === 0` (la condition qui affiche la section,
 * `NeedDetailPage.tsx`) est vrai sur trois besoins de la salle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUL CHANGEMENT : LA ZONE DU BESOIN PHARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `DEMO_FLAGSHIP_NEED.location` passe de « Île-de-France » à « Lyon » — le
 * siège de SNCF (`DEMO_DELIVERY_CARRIER_ACCOUNT.headquarters`). Ses
 * compétences (Kubernetes, Terraform, Observabilité) partageaient DÉJÀ deux
 * termes avec « Ingénieur infrastructure — socle conteneurisé du portail »
 * (Kubernetes, Terraform, GitLab CI) : rien d'autre n'a besoin de changer pour
 * faire apparaître une piste RÉELLE, sur un AUTRE compte que le sien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CAS NÉGATIF RESTE VISIBLE, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Ingénieur systèmes — supervision des systèmes temps réel » (Lyon
 * (69)) garde `shortlist_count === 0` et ne partage sa zone avec AUCUN autre
 * besoin ouvert de la salle : son croisement tourne et ne trouve personne — la
 * réponse « personne d'autre ne cherche ce profil ici » reste donc, elle aussi,
 * démontrable dans la même salle. Un produit qui ne montrerait que des pistes
 * pleines cacherait la moitié de ce qu'il sait dire.
 *
 * ⚠️ ELLE LIT LE MÊME CROISEMENT QUE LE SERVEUR, PAS UNE VERSION RACCOURCIE.
 * `sameZone` et `sharedSkillTerms` sont IMPORTÉES de `reverse-need-prospects.ts`
 * (jamais recopiées) : une salle qui « aurait l'air » de matcher sans passer
 * par les mêmes fonctions que `OpenNeedsService.findReverseProspects` ne
 * prouverait rien de ce qui s'affiche réellement.
 */
describe('couverture de la prospection inversée depuis un besoin', () => {
  const flagshipSkills = DEMO_FLAGSHIP_NEED.skills
  const flagshipAccountId = 'flagship-account'
  const novaAccountId = 'nova-account'

  /** Les besoins ouverts de SNCF, avec l'id de compte qu'ils PORTERAIENT en
   *  base — jamais le même que le besoin phare, exactement comme le refuse
   *  `project.account_id <> reference.account_id` côté serveur. */
  const novaOpenNeeds = DEMO_DELIVERY_CLIENT.openNeeds.filter(need =>
    (NEED_OPEN_STATUSES as readonly string[]).includes(need.status),
  )

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert sur du vide', () => {
    expect(novaOpenNeeds.length).toBeGreaterThanOrEqual(3)
    expect(flagshipSkills.length).toBeGreaterThan(0)
  })

  it('le besoin phare est localisé là où le client de livraison publie', () => {
    // Décision Louis 04/10/2026 — SNCF : Lyon est le lieu d'une offre RELEVÉE
    // sur le compte (`it_job_signals`), à défaut d'un site déclaré.
    const places = JSON.stringify([
      DEMO_DELIVERY_CARRIER_ACCOUNT.raw_analysis['sites_france'] ?? [],
      DEMO_DELIVERY_CARRIER_ACCOUNT.raw_analysis['it_job_signals'] ?? [],
    ])
    expect(places).toContain(DEMO_FLAGSHIP_NEED.location)
  })

  it('trouve AU MOINS une piste réelle — la salle montre enfin l’état plein', () => {
    const matches = novaOpenNeeds.filter(
      need =>
        sameZone(DEMO_FLAGSHIP_NEED.location, need.location) &&
        sharedSkillTerms(flagshipSkills, need.skills).length > 0,
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)

    const match = matches.find(need => need.title.includes('socle conteneurisé du portail'))
    expect(match).toBeDefined()
    const shared = sharedSkillTerms(flagshipSkills, match!.skills)
    expect(shared).toEqual(expect.arrayContaining(['Kubernetes', 'Terraform']))
  })

  it('un besoin qui partage la zone mais AUCUNE compétence ne matche pas', () => {
    // Preuve que la garde sait dire NON : « Chef de projet — refonte du portail
    // transporteurs » est dans la même zone (Lyon) et ne partage pourtant aucun
    // terme avec le besoin phare — la piste ne doit pas apparaître.
    const projectLead = DEMO_DELIVERY_CLIENT.openNeeds.find(need => need.title.startsWith('Chef de projet'))
    expect(projectLead).toBeDefined()
    expect(sameZone(DEMO_FLAGSHIP_NEED.location, projectLead!.location)).toBe(true)
    expect(sharedSkillTerms(flagshipSkills, projectLead!.skills)).toEqual([])
  })

  it('montre AUSSI l’état vide, sur un AUTRE besoin `shortlist_count === 0` de la salle', () => {
    // « Ingénieur systèmes — supervision des systèmes temps réel » : shortlist
    // vide (la section s'affiche) et une zone (Lyon (69)) qu'aucun
    // autre besoin ouvert de la salle ne partage.
    const supervision = novaOpenNeeds.find(need => need.title.includes('supervision des systèmes temps réel'))
    expect(supervision).toBeDefined()
    expect(supervision!.shortlist.length).toBe(0)

    const otherOpenNeeds = [
      { location: DEMO_FLAGSHIP_NEED.location, skills: flagshipSkills, id: flagshipAccountId },
      ...novaOpenNeeds
        .filter(need => need !== supervision)
        .map(need => ({ location: need.location, skills: need.skills, id: novaAccountId })),
    ]
    const matches = otherOpenNeeds.filter(
      other =>
        sameZone(supervision!.location, other.location) &&
        sharedSkillTerms(supervision!.skills, other.skills).length > 0,
    )
    expect(matches).toEqual([])
  })

  it('ne casse pas la décision existante — le besoin phare reste SANS positionnement', () => {
    // `demo-coverage.ts` : lui en attribuer un referait la contradiction
    // « shortlist prête / zéro positionné » que le lot du 28/08 a évitée. Le
    // déplacement de zone ne touche à rien de ce côté.
    expect(DEMO_FLAGSHIP_NEED.status).toBe('to_match')
  })

  it('la capacité est classée dans le registre de couverture, avec une raison qui tient', () => {
    expect(DEMO_REVERSE_PROSPECTS_COVERAGE.state).toBe('seede')
    expect(DEMO_REVERSE_PROSPECTS_COVERAGE.reason.length).toBeGreaterThan(60)
  })
})
