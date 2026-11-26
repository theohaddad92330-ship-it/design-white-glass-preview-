import { MISSING_EXPERTISE_THRESHOLDS } from '@bellum/contracts'
import { canonicalSkill } from '../consultants/skill-referential'
import { DEMO_NEED_SHEET_BLOCKS } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DELIVERY_CLIENT } from './demo-dataset'

/**
 * LA PARITÉ DÉMO DE LA FICHE D'UN BESOIN (PDF-02 §4.2, craft rule n°9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE À CÔTÉ DE `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche n'ajoute AUCUNE table : elle lit `project_needs` et l'agrégat
 * `account_average_sold_rate`, tous deux déjà classés SEEDÉS. La garde par
 * table ne lui pose donc aucune question — et une fiche qui s'ouvrirait sur
 * quatre phrases d'absence se découvrirait en réunion, pas en CI.
 *
 * ⚠️ Cette garde ne LIT PAS la prose de `demo-coverage.ts`. Une raison écrite
 * est une AFFIRMATION sur les données ; le dépôt a déjà payé « un audit
 * documentaire n'est pas le code » (cinq affirmations sur cinq fausses). Chaque
 * état `seede` est donc RECOMPTÉ sur `DEMO_DELIVERY_CLIENT`.
 *
 * ⚠️ Et chaque contrôle vérifie les DEUX moitiés — ce qui est chiffré et ce qui
 * ne l'est pas. Une salle où tout serait rempli ne montrerait jamais les phrases
 * d'absence, c'est-à-dire la partie du produit qui dit ce qu'il ignore.
 */

const BLOCKS = [
  'target_rate',
  'sold_rate_cross',
  'status_reason',
  'third_door',
  'staffable_verdict',
  'requirements',
  'summary_fields',
  'go_no_go_verdict',
] as const

/** Les états qui EXIGENT un motif — la porte d'API rend 400 sans lui. */
const REASON_BEARING_STATUSES = ['on_hold', 'lost', 'cancelled']

describe('parité démo — la fiche d’un besoin', () => {
  it('la garde LIT quelque chose — le jeu de données n’est pas vide', () => {
    // Le faux zéro silencieux : sur un jeu vide, tous les comptes ci-dessous
    // vaudraient 0 et seuls les seuils « au moins un » rougiraient.
    expect(DEMO_DELIVERY_CLIENT.openNeeds.length).toBeGreaterThan(3)
    expect(DEMO_DELIVERY_CLIENT.missions.length).toBeGreaterThan(5)
  })

  it('les cinq blocs sont classés — aucun ne passe sans réponse écrite', () => {
    expect(Object.keys(DEMO_NEED_SHEET_BLOCKS).sort()).toEqual([...BLOCKS].sort())
    for (const key of BLOCKS) {
      const entry = DEMO_NEED_SHEET_BLOCKS[key]
      expect(entry).toBeDefined()
      // Une raison d'une ligne n'est pas une raison : elle doit tenir devant
      // quelqu'un qui présente le produit.
      expect((entry?.reason ?? '').length).toBeGreaterThan(180)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Les états `seede` sont RECOMPTÉS, pas crus sur parole                 */
  /* ---------------------------------------------------------------------- */

  it('le tarif CIBLE se voit dans ses deux états — chiffré, et non communiqué', () => {
    const withRate = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.target_tjm_cents !== null)
    const withoutRate = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.target_tjm_cents === null)
    expect(DEMO_NEED_SHEET_BLOCKS['target_rate']?.state).toBe('seede')
    expect(withRate.length).toBeGreaterThan(0)
    // ⚠️ La moitié qu'on oublie : sans un seul rôle SANS tarif cible, la phrase
    // « Personne n’a communiqué de tarif cible » ne se montre nulle part, et un
    // prospect ne verrait jamais que l'outil refuse d'écrire « 0 € ».
    expect(withoutRate.length).toBeGreaterThan(0)
    // Et jamais un zéro déguisé en montant : `0` se lirait « gratuit ».
    for (const need of withRate) expect(need.target_tjm_cents).toBeGreaterThan(0)
  })

  it('le CROISEMENT a ses deux côtés — des rôles chez un client qui a un historique de prix', () => {
    // Les rôles ouverts et les missions pendent du MÊME client d'exemple :
    // c'est une propriété de STRUCTURE du jeu, pas une coïncidence de libellés.
    expect(DEMO_DELIVERY_CLIENT.account.company_name.length).toBeGreaterThan(0)
    const rated = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.daily_rate !== null)
    const unrated = DEMO_DELIVERY_CLIENT.missions.filter(mission => mission.daily_rate === null)
    expect(DEMO_NEED_SHEET_BLOCKS['sold_rate_cross']?.state).toBe('seede')
    // Sans mission chiffrée, le bloc s'ouvrirait sur « la moyenne ne se calcule
    // pas » — vrai, et sans intérêt pour une démonstration.
    expect(rated.length).toBeGreaterThan(0)
    // Sans mission NON chiffrée, la moyenne se présenterait comme complète.
    expect(unrated.length).toBeGreaterThan(0)
    // L'ÉCART doit être VISIBLE : une moyenne égale au tarif cible ferait
    // afficher « exactement celui auquel ce client achète » — l'état le moins
    // intéressant des trois, et le seul qui n'apprend rien.
    const rates = rated.map(mission => Number(mission.daily_rate)).filter(value => Number.isFinite(value))
    const average = rates.reduce((sum, value) => sum + value, 0) / rates.length
    const targets = DEMO_DELIVERY_CLIENT.openNeeds
      .map(need => need.target_tjm_cents)
      .filter((cents): cents is number => cents !== null)
      .map(cents => cents / 100)
    expect(targets.some(target => Math.abs(target - average) >= 1)).toBe(true)
  })

  it('le MOTIF d’état est porté par le rôle dont l’état l’exige', () => {
    const bearing = DEMO_DELIVERY_CLIENT.openNeeds.filter(need =>
      REASON_BEARING_STATUSES.includes(need.status as string),
    )
    expect(DEMO_NEED_SHEET_BLOCKS['status_reason']?.state).toBe('seede')
    expect(bearing.length).toBeGreaterThan(0)
    // Un état qui EXIGE son motif et ne le porte pas est le besoin que personne
    // ne rouvre : rien ne dit ce qu'on attend ni de qui.
    for (const need of bearing) expect((need.status_reason ?? '').length).toBeGreaterThan(20)
  })

  it('la TROISIÈME PORTE s’offre quelque part, et se referme ailleurs', () => {
    const withoutShortlist = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.shortlist.length === 0)
    const withShortlist = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.shortlist.length > 0)
    expect(DEMO_NEED_SHEET_BLOCKS['third_door']?.state).toBe('seede')
    // Sans rôle sans shortlist, la porte ne se montre NULLE PART : la
    // fonctionnalité serait livrée et invisible en démonstration.
    expect(withoutShortlist.length).toBeGreaterThan(0)
    // Sans rôle AVEC shortlist, un prospect croirait à un bouton permanent — et
    // c'est justement le contraire : la porte se referme dès qu'un profil est
    // positionné.
    expect(withShortlist.length).toBeGreaterThan(0)
  })

  it('les EXIGENCES du poste ont leurs deux moitiés — un rôle qui exige, un rôle qui n’exige rien', () => {
    const requiringClearance = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.clearances.length > 0)
    const requiringLanguage = DEMO_DELIVERY_CLIENT.openNeeds.filter(need => need.languages.length > 0)
    const requiringNothing = DEMO_DELIVERY_CLIENT.openNeeds.filter(
      need => need.clearances.length === 0 && need.languages.length === 0,
    )
    expect(DEMO_NEED_SHEET_BLOCKS['requirements']?.state).toBe('seede')

    // Sans un rôle qui EXIGE une habilitation, l'axe 12 du rapprochement — le
    // seul qui ÉCARTE — n'a rien à écarter : la salle annoncerait treize axes
    // et n'en montrerait jamais un seul agir. C'est le défaut que ce lot ferme.
    expect(requiringClearance.length).toBeGreaterThan(0)
    expect(requiringLanguage.length).toBeGreaterThan(0)
    // Sans un rôle qui n'exige RIEN, les phrases d'absence ne se montrent nulle
    // part — c'est-à-dire la partie du produit qui dit ce qu'il ignore.
    expect(requiringNothing.length).toBeGreaterThan(0)

    // Les deux exigences sont INDÉPENDANTES : un rôle au moins porte une langue
    // sans habilitation. Un jeu où elles iraient toujours ensemble ferait croire
    // qu'elles sont liées, et personne ne penserait à n'en saisir qu'une.
    expect(requiringLanguage.some(need => need.clearances.length === 0)).toBe(true)

    // Et jamais une exigence VIDE : une habilitation sans nom bloquerait tout le
    // vivier sans que rien ne puisse dire pourquoi.
    for (const need of requiringClearance) {
      for (const clearance of need.clearances) expect(clearance.trim().length).toBeGreaterThan(0)
    }
  })

  it('⚠️ aucun rôle n’exige une habilitation que son PROPRE profil positionné ne détient pas', () => {
    // L'écran qui se contredit lui-même, version axe bloquant : un rôle en
    // « validation client » dont le profil est déjà parti chez le client, et
    // dont le rapprochement écarterait ce même profil pour une habilitation
    // manquante. Un prospect qui lance le rapprochement depuis cette fiche
    // verrait l'outil déconseiller la personne que la fiche montre au client.
    //
    // C'est la même règle que « aucun rôle ne s'annonce plus loin que ce que ses
    // profils permettent », un cran plus loin — et elle a été violée en écrivant
    // ce lot, ce qui est précisément pourquoi elle est gardée.
    // ⚠️ La garde LIT le vivier : sur une liste vide, `held` serait vide, tout
    // rôle exigeant une habilitation paraîtrait contradictoire — et la garde
    // hurlerait à tort. L'inverse compte autant : c'est le faux zéro.
    expect(DEMO_CONSULTANTS.length).toBeGreaterThan(3)
    const held = new Map(
      DEMO_CONSULTANTS.map(consultant => [consultant.full_name, consultant.clearances.map(item => item.toLowerCase())]),
    )
    const contradictions: string[] = []
    for (const need of DEMO_DELIVERY_CLIENT.openNeeds) {
      for (const entry of need.shortlist) {
        const mine = held.get(entry.consultant) ?? []
        for (const required of need.clearances) {
          if (!mine.includes(required.toLowerCase()))
            contradictions.push(`${need.title} ← ${entry.consultant} : ${required}`)
        }
      }
    }
    expect(contradictions).toEqual([])
  })

  it('les six champs de RÉSUMÉ se voient renseignés ET absents', () => {
    const needs = DEMO_DELIVERY_CLIENT.openNeeds
    expect(DEMO_NEED_SHEET_BLOCKS['summary_fields']?.state).toBe('seede')

    // Chaque champ compte ses deux moitiés. Le tableau porte le NOM du champ
    // dans la valeur comparée : `expect` de Jest ne prend qu'un argument, et
    // sans ça un échec ne dirait pas lequel des six manque.
    const written = [
      needs.some(need => (need.context ?? '').length > 0) ? null : 'context',
      needs.some(need => (need.expertise ?? '').length > 0) ? null : 'expertise',
      needs.some(need => need.stack.length > 0) ? null : 'stack',
      needs.some(need => (need.constraints ?? '').length > 0) ? null : 'constraints',
      needs.some(need => need.min_tjm_cents !== null) ? null : 'min_tjm_cents',
      needs.some(need => need.budget_cents !== null) ? null : 'budget_cents',
    ].filter(name => name !== null)
    expect(written).toEqual([])

    const absent = [
      needs.some(need => need.context === null) ? null : 'context',
      needs.some(need => need.expertise === null) ? null : 'expertise',
      needs.some(need => need.stack.length === 0) ? null : 'stack',
      needs.some(need => need.constraints === null) ? null : 'constraints',
      needs.some(need => need.min_tjm_cents === null) ? null : 'min_tjm_cents',
      needs.some(need => need.budget_cents === null) ? null : 'budget_cents',
    ].filter(name => name !== null)
    expect(absent).toEqual([])

    // Et jamais un zéro déguisé : `0` sur un plancher ou un budget se lirait
    // « gratuit », alors que l'absence se lit « personne ne l'a dit ».
    for (const need of needs) {
      if (need.min_tjm_cents !== null) expect(need.min_tjm_cents).toBeGreaterThan(0)
      if (need.budget_cents !== null) expect(need.budget_cents).toBeGreaterThan(0)
    }
  })

  /* ---------------------------------------------------------------------- */
  /*  Et le refus est VÉRIFIÉ, pas seulement écrit                          */
  /* ---------------------------------------------------------------------- */

  it('le verdict G3 est SEMÉ sur les refus, et sur eux SEULS', () => {
    // ⚠️ Ce test a été RETOURNÉ le 01/09/2026, comme la note d'avant l'exigeait :
    // « le jour où quelqu'un sème un verdict, ce test tombe et la raison doit
    // être RETOURNÉE — pas désactivée ».
    //
    // Ce qui a changé : le détecteur d'expertise manquante (PDF 4 §8.4) ne peut
    // se montrer que sur des besoins DÉJÀ refusés. Ce qui n'a PAS changé, et que
    // ce test tient maintenant : aucun rôle OUVERT ne porte de verdict, donc la
    // porte G3 reste un geste que la démonstration fait faire.
    expect(DEMO_NEED_SHEET_BLOCKS['staffable_verdict']?.state).toBe('seede')

    const decidedAmongOpen = DEMO_DELIVERY_CLIENT.openNeeds.filter(
      need => 'staffable' in need && (need as { staffable?: unknown }).staffable != null,
    )
    expect(decidedAmongOpen).toEqual([])

    // Et le semis EXISTE : sans ces trois-là, le détecteur serait livré et muet
    // en démonstration — un écran vide qui se découvre en réunion.
    const refused = DEMO_DELIVERY_CLIENT.refusedNeeds
    expect(refused.length).toBeGreaterThanOrEqual(MISSING_EXPERTISE_THRESHOLDS.refusalsOnSameSkill)
    for (const need of refused) {
      expect(need.staffable).toBe('no')
      expect(need.staffable_reason?.length ?? 0).toBeGreaterThan(0)
      // Un refus SANS date n'entre pas dans la fenêtre de 90 jours : il serait
      // écrit en base et invisible partout.
      expect(need.staffable_decided_days_ago).toBeLessThan(MISSING_EXPERTISE_THRESHOLDS.windowDays)
      // Un refus est un besoin CLOS : `lost` est le statut que la porte G3 force.
      expect(REASON_BEARING_STATUSES).toContain(need.status)
    }

    // Les trois écrivent la MÊME compétence canonique de trois façons : c'est
    // exactement ce que le détecteur existe pour rapprocher, et une salle où les
    // trois écriraient « Kubernetes » ne le montrerait jamais.
    const canonical = new Set(
      refused.flatMap(need => need.skills.map(skill => canonicalSkill(skill.term)).filter(Boolean)),
    )
    expect(canonical.has('kubernetes')).toBe(true)
    const graphies = new Set(refused.flatMap(need => need.skills.map(skill => skill.term)))
    expect(graphies.size).toBeGreaterThan(1)

    // ⚠️ Au moins UN refus sans TJM cible : c'est lui qui fait apparaître la
    // ligne « hors du montant », sans laquelle un CA non adressé partiel se lit
    // comme un total.
    expect(refused.some(need => need.target_tjm_cents === null)).toBe(true)
  })

  /* ---------------------------------------------------------------------- */
  /*  LE VERDICT « GO / NO-GO » — les deux moitiés, RECOMPTÉES              */
  /* ---------------------------------------------------------------------- */

  it('UN SEUL rôle porte un rapprochement — les quatre autres montrent l’absence', () => {
    expect(DEMO_NEED_SHEET_BLOCKS['go_no_go_verdict']?.state).toBe('seede')
    // La moitié qui vend : un rôle avec son verdict complet.
    const carrier = DEMO_DELIVERY_CLIENT.openNeeds.find(need => need.title === DEMO_DELIVERY_CLIENT.needVerdict.need)
    expect(carrier).toBeDefined()
    // ⚠️ La moitié qu'on oublie : sans elle, la salle montrerait un produit qui
    // a toujours une réponse. « Personne n'a regardé le vivier » n'est pas
    // « personne ne convient », et c'est cet écran-là qui le dit.
    expect(DEMO_DELIVERY_CLIENT.openNeeds.length - 1).toBeGreaterThanOrEqual(3)
  })

  it('les deux axes DÉCISIFS du rôle porteur sont réellement renseignables', () => {
    const carrier = DEMO_DELIVERY_CLIENT.openNeeds.find(need => need.title === DEMO_DELIVERY_CLIENT.needVerdict.need)
    // Sans plancher NI cible, l'axe « économie » sortirait du décompte, et un
    // axe décisif non renseigné interdit le OUI : la salle s'ouvrirait sur
    // « je manque de données » sur le seul rôle censé montrer le verdict.
    expect(carrier?.target_tjm_cents).toBeGreaterThan(0)
    expect(carrier?.min_tjm_cents).toBeGreaterThan(0)
    // Et l'axe « capacité à staffer » : un rapprochement qui n'a évalué
    // personne n'est pas un vivier vide — il sortirait lui aussi du décompte.
    expect(DEMO_DELIVERY_CLIENT.needVerdict.evaluated).toBeGreaterThan(0)
    expect(DEMO_DELIVERY_CLIENT.needVerdict.entries.length).toBeGreaterThan(0)
  })

  it('les profils montrent les DEUX moitiés de la lecture d’acceptation', () => {
    const entries = DEMO_DELIVERY_CLIENT.needVerdict.entries
    // Libre à temps ET libre plus tard : sans le second, la carte ne dirait
    // jamais « Libre après le démarrage », et l'axe « faisabilité » ne
    // montrerait jamais son attention.
    expect(entries.some(entry => entry.availability >= 100)).toBe(true)
    expect(entries.some(entry => entry.availability < 100)).toBe(true)
    // Secteur pratiqué ET secteur manquant — « manque l'expérience du secteur »
    // est le fait que la maquette montre, et il n'existerait pas sans lui.
    expect(entries.some(entry => entry.sector >= 100)).toBe(true)
    expect(entries.some(entry => entry.sector < 100)).toBe(true)
  })

  it('l’axe ACCÈS montre le « décideur manquant », pas un axe vide', () => {
    // Des contacts rattachés — sans eux l'axe n'est pas renseigné du tout —
    // mais AUCUN décideur : c'est l'attention MESURÉE de la maquette.
    expect(DEMO_DELIVERY_CLIENT.projectContactRoles.length).toBeGreaterThan(0)
    expect(DEMO_DELIVERY_CLIENT.projectContactRoles).not.toContain('decideur')
  })

  it('l’axe CONCURRENCE a des concurrents NOMMÉS — sinon il sortirait toujours au vert', () => {
    expect(DEMO_DELIVERY_CLIENT.competitors.length).toBeGreaterThan(0)
    for (const competitor of DEMO_DELIVERY_CLIENT.competitors) {
      expect(competitor.name.length).toBeGreaterThan(0)
    }
  })

  it('aucun bloc ne se classe « vide à dessein » sur une raison courte', () => {
    // Un refus se paye en explication : c'est ce qui empêche de déplacer une
    // entrée ici pour faire passer un test.
    // ⚠️ `expect` de Jest ne prend qu'un argument — le second, qui nomme la
    // ligne fautive sous vitest, y lève « Expect takes at most one argument ».
    // Le nom du bloc voyage donc dans la valeur comparée.
    const short = Object.entries(DEMO_NEED_SHEET_BLOCKS)
      .filter(([, entry]) => entry.state === 'vide_a_dessein' && entry.reason.length <= 300)
      .map(([key]) => key)
    expect(short).toEqual([])
  })
})
