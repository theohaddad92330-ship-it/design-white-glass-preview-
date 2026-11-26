import { describe, expect, it } from 'vitest'
import { MANAGER_KPIS, MANAGER_KPI_FAMILIES, kpisOfFamily, managerKpiSchema } from './manager-kpi.js'
import { KPI_DICTIONARY } from './playbook.js'

/**
 * Le dictionnaire est un contrat d'HONNÊTETÉ avant d'être un contrat de données.
 * Ces gardes vérifient les deux moitiés de cette phrase.
 */
describe('MANAGER_KPIS', () => {
  it('porte les 64 indicateurs, dans les six familles du document', () => {
    // 60 jusqu'au 29/08/2026. Deux ajouts, tous deux du PDF 5 §13.3, tous deux
    // NOMMÉS par la source et absents du dictionnaire — donc absents de tout
    // écran, et surtout privés de leur cible chiffrée :
    //  · `unmeasurable_missions` — « missions non mesurables (< 20 %) ». Son
    //    absence avait fait migrer sa cible sur `unmeasured_margin`, qui affichait
    //    « au-delà de 20 % » là où la source dit « < 10 % » ;
    //  · `renewal_rate` — « taux de renouvellement (> 60 %) », repris au §7 sous
    //    N15. Non mesurable aujourd'hui, avec sa raison écrite.
    // 63 depuis BEL-SC-242 (#3271.2) : `client_concentration_top_account`
    // — la « dépendance / concentration client » que la vue Fondateur nomme
    // et que le dictionnaire ne portait pas encore. NON mesurable (le CA
    // produit n'est pas agrégé par compte), donc `pending()`, jamais un zéro.
    // 64 depuis #3415.1 (beta-feedback, lot C14 30/09/2026) : `revenue_growth`
    // — la « croissance » que la liste Fondateur de l'issue nomme et
    // qu'aucune entrée ne couvrait (`gross_margin`/`dso_days`/
    // `client_concentration_top_account`/`bench_rate` couvrent marge, cash,
    // dépendance, capacité — pas la croissance). NON mesurable (aucune photo
    // mensuelle du CA d'un espace n'existe pour comparer deux périodes),
    // donc `pending()`, jamais un zéro ni un taux deviné.
    expect(MANAGER_KPIS).toHaveLength(64)
    expect(kpisOfFamily('business')).toHaveLength(12)
    expect(kpisOfFamily('recruitment')).toHaveLength(11)
    expect(kpisOfFamily('delivery')).toHaveLength(14)
    expect(kpisOfFamily('capitalisation')).toHaveLength(10)
    expect(kpisOfFamily('finance')).toHaveLength(10)
    expect(kpisOfFamily('adoption')).toHaveLength(7)
    expect(MANAGER_KPI_FAMILIES).toHaveLength(6)
  })

  it('chaque indicateur porte sa cible, ou `null` — et jamais une cible devinée', () => {
    // La cible est RÉSOLUE depuis `KPI_TARGETS`, jamais écrite dans l'entrée.
    // Ce test tient le lien : sans lui, `computed()` pourrait cesser d'appeler
    // `kpiTarget()` et les 64 entrées rendraient `null` en silence — la forme
    // même de « code juste que personne n'appelle ».
    const withTarget = MANAGER_KPIS.filter(kpi => kpi.target !== null)
    expect(withTarget.length).toBe(10)
    for (const kpi of withTarget) expect(kpi.target?.kpi, kpi.key).toBe(kpi.key)
    // Un indicateur NON mesurable garde sa cible : ne pas savoir mesurer
    // aujourd'hui ne change pas la destination.
    expect(MANAGER_KPIS.find(kpi => kpi.key === 'renewal_rate')?.target?.bound).toBe(60)
    expect(MANAGER_KPIS.find(kpi => kpi.key === 'renewal_rate')?.measurable).toBe(false)
  })

  it('filtre le catalogue qu’on lui DONNE, pas la copie du navigateur', () => {
    // L'écran affiche ce que la ROUTE a servi — pas la constante empaquetée
    // dans le bundle. Les deux coïncident aujourd'hui ; le jour où le serveur
    // filtrera (par offre, par espace, par droit), une dérivation qui relit la
    // copie locale afficherait un dictionnaire que l'utilisateur n'a pas reçu.
    // C'est pour cela que la dérivation prend son catalogue en argument.
    const served = [
      MANAGER_KPIS.find(kpi => kpi.family === 'business')!,
      MANAGER_KPIS.find(kpi => kpi.family === 'finance')!,
    ]
    expect(kpisOfFamily('business', served)).toHaveLength(1)
    expect(kpisOfFamily('finance', served)).toHaveLength(1)
    expect(kpisOfFamily('delivery', served)).toHaveLength(0)
  })

  it('aucune clé en double — un dictionnaire à deux entrées du même nom n’en est plus un', () => {
    const keys = MANAGER_KPIS.map(kpi => kpi.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('chaque indicateur valide son contrat', () => {
    for (const kpi of MANAGER_KPIS) {
      const parsed = managerKpiSchema.safeParse(kpi)
      if (!parsed.success) throw new Error(`${kpi.key}: ${parsed.error.issues.map(i => i.message).join(', ')}`)
    }
  })

  it('les SEPT attributs sont remplis — pas seulement présents', () => {
    // Un type ne voit pas une chaîne vide. C'est exactement ce qui produit un
    // dictionnaire qui a l'air complet et ne dit rien.
    const empty: string[] = []
    for (const kpi of MANAGER_KPIS) {
      for (const field of ['definition', 'formula', 'cadence', 'owner', 'threshold', 'decision'] as const) {
        if (String(kpi[field]).trim().length === 0) empty.push(`${kpi.key}.${field}`)
      }
      if (kpi.label.fr.trim().length === 0 || kpi.label.en.trim().length === 0) empty.push(`${kpi.key}.label`)
    }
    expect(empty).toEqual([])
  })

  it('« un KPI sans décision associée est une décoration » — la décision dit un GESTE', () => {
    // Une décision qui répète la définition ne décide de rien. On vérifie au
    // moins qu'elle est substantielle et qu'elle diffère de la définition.
    const decorative = MANAGER_KPIS.filter(
      kpi => kpi.decision.trim().length < 30 || kpi.decision.trim() === kpi.definition.trim(),
    ).map(kpi => kpi.key)
    expect(decorative).toEqual([])
  })

  it('un indicateur MESURABLE nomme sa source', () => {
    const lying = MANAGER_KPIS.filter(kpi => kpi.measurable && !kpi.source).map(kpi => kpi.key)
    expect(lying).toEqual([])
  })

  it('un indicateur NON mesurable dit POURQUOI, et la raison est écrite', () => {
    // Sans raison, la ligne se lit « on a oublié » — et personne ne saura jamais
    // ce qu'il aurait fallu capturer.
    const silent = MANAGER_KPIS.filter(kpi => !kpi.measurable && (kpi.unmeasurableReason ?? '').trim().length < 40).map(
      kpi => kpi.key,
    )
    expect(silent).toEqual([])
  })

  it('il RESTE des indicateurs non mesurables — un catalogue tout vert serait suspect', () => {
    // Le catalogue existe pour se souvenir de ce qu'on voulait suivre. S'il ne
    // contenait que du calculable, il aurait été taillé pour être vert.
    const pending = MANAGER_KPIS.filter(kpi => !kpi.measurable)
    expect(pending.length).toBeGreaterThan(0)
    expect(pending.length).toBeLessThan(MANAGER_KPIS.length / 3)
  })

  it('les renvois au dictionnaire d’exclusions pointent sur une entrée qui existe', () => {
    const known = new Set(KPI_DICTIONARY.map(entry => entry.key))
    const broken = MANAGER_KPIS.filter(kpi => kpi.dictionaryKey && !known.has(kpi.dictionaryKey)).map(kpi => kpi.key)
    expect(broken).toEqual([])
  })
})
