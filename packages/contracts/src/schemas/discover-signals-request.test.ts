import { describe, expect, it } from 'vitest'
import { discoverSignalsRequestSchema } from './discover.js'

/**
 * Le corps de `POST /ia/discover/signals` porte TOUS les critères de l'écran.
 *
 * ## Le défaut que ces tests verrouillent
 *
 * Le schéma déclarait `signalTypes`, `department`, `sinceDays`, `limit`,
 * `resolveOffset`, `entityType`. Il ne déclarait **ni `sources`, ni `keywords`,
 * ni `sectors`** — les trois que le rail de Découvrir envoie réellement.
 *
 * Or ce schéma est le DTO de la route (`createZodDto`), et un objet zod
 * **retire les clés inconnues**. Mesuré le 31/08/2026 :
 *
 * ```
 * ENVOYÉ    {"department":"69","sinceDays":90,"keywords":"java","sources":["hiring"],"limit":25}
 * APRÈS DTO {"department":"69","sinceDays":90,"limit":25}
 * ```
 *
 * Conséquences, toutes silencieuses — aucune erreur, aucun `degraded`, rien à
 * l'écran :
 *
 *  - la **recherche par technologie** (« j'ai des consultants de cette stack »)
 *    n'atteignait jamais le service IA. Le champ existait, il était inerte ;
 *  - la **sélection de sources** non plus : cocher « recrutements » seul
 *    laissait tourner les trois sources ;
 *  - le **secteur** subissait le même sort.
 *
 * `signalTypes` est un champ FANTÔME : personne ne l'envoie, nulle part dans le
 * dépôt. C'est lui qui donnait au schéma l'apparence de déclarer les sources —
 * un nom voisin, une forme voisine, et le vrai champ manquant juste à côté.
 *
 * Ces tests portent sur ce qui SURVIT au parse, pas sur la présence d'une clé
 * dans le fichier : c'est la seule formulation qui aurait attrapé le défaut.
 */
describe('discoverSignalsRequestSchema', () => {
  const body = {
    department: '69',
    sinceDays: 90,
    limit: 25,
    keywords: 'java spring',
    sources: ['hiring'],
    sectors: ['industry', 'it'],
    entityType: 'client',
    resolveOffset: 0,
  }

  it('laisse passer les mots-clés — la recherche par technologie', () => {
    expect(discoverSignalsRequestSchema.parse(body).keywords).toBe('java spring')
  })

  it('laisse passer les sources cochées', () => {
    expect(discoverSignalsRequestSchema.parse(body).sources).toEqual(['hiring'])
  })

  it('laisse passer les secteurs cochés', () => {
    expect(discoverSignalsRequestSchema.parse(body).sectors).toEqual(['industry', 'it'])
  })

  it('ne perd AUCUN critère du rail au passage du DTO', () => {
    // La formulation qui compte : on compare les clés posées à celles qui
    // survivent. Un champ ajouté à l'écran sans son entrée ici retombera
    // dessus, au lieu de disparaître en silence pendant des semaines.
    const parsed = discoverSignalsRequestSchema.parse(body)

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(body).sort())
  })

  // #3551 — « Chercher hors de ma cible » en mode Signaux (« Comptes qui recrutent »).
  it('#3551 laisse passer includeOutOfTarget — sinon le bouton hors cible est inerte en mode Signaux', () => {
    expect(discoverSignalsRequestSchema.parse({ ...body, includeOutOfTarget: true }).includeOutOfTarget).toBe(true)
  })

  it('refuse une source inconnue plutôt que de la retirer en douce', () => {
    expect(() => discoverSignalsRequestSchema.parse({ ...body, sources: ['twitter'] })).toThrow()
  })

  it('accepte un corps minimal — tout est optionnel', () => {
    expect(() => discoverSignalsRequestSchema.parse({})).not.toThrow()
  })

  // #2165.28 / #2165.30 — les deux critères mémoire marché du lot DC-MOTEUR2.
  it('laisse passer le filtre technologies observées', () => {
    const parsed = discoverSignalsRequestSchema.parse({ ...body, technologiesObserved: ['java', 'react'] })
    expect(parsed.technologiesObserved).toEqual(['java', 'react'])
  })

  it('laisse passer le filtre recours externe observé', () => {
    const parsed = discoverSignalsRequestSchema.parse({ ...body, externalRecourseObserved: true })
    expect(parsed.externalRecourseObserved).toBe(true)
  })
})

// #3941.5 (Louis 17/10) — l'augmentation de capital (BODACC B) survit au parse : sinon le DTO la retirerait
// en silence, comme il retirait `sources` avant le 31/08.
describe('discoverSignalsRequestSchema — « capital »', () => {
  it('accepte la source `capital` et la conserve', () => {
    const parsed = discoverSignalsRequestSchema.parse({ department: '68', sources: ['capital'] })
    expect(parsed.sources).toEqual(['capital'])
  })

  it('refuse une source qu’aucun collecteur ne sait lancer', () => {
    expect(discoverSignalsRequestSchema.safeParse({ sources: ['levee'] }).success).toBe(false)
  })
})
