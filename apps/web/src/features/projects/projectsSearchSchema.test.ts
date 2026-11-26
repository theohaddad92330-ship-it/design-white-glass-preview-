import { PIPELINE_STAGES } from '@bellum/contracts'
import { defaultStringifySearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { projectsSearchSchema } from '@/routes/projects/index'

/**
 * §2.1 — LE PARAMÈTRE DE LA BARRE DU PIPE EST DÉCLARÉ SUR LA ROUTE.
 *
 * Sans `validateSearch`, TanStack Router jette la recherche avant que l'écran la
 * voie : `/projects?stage=…` ouvrait le pipe ENTIER, c'est-à-dire une barre qui
 * montre autre chose que ce qu'elle annonce. C'est le défaut du 28/08 sur
 * `/missions?accountId=…`, à l'identique.
 */
describe('projectsSearchSchema — ce que la barre du pipe a le droit de porter', () => {
  it('accepte CHAQUE étape du pipe — l’inventaire est lu dans le contrat, pas recopié', () => {
    // Une sixième colonne un jour doit passer ici sans qu'on y pense : c'est
    // `PIPELINE_STAGES` qui fait foi, et ce test le relit.
    expect(PIPELINE_STAGES.length).toBeGreaterThan(0)
    for (const stage of PIPELINE_STAGES) {
      expect(projectsSearchSchema.parse({ stage })).toEqual({ stage })
    }
  })

  it('REFUSE une étape hors du pipe — elle n’a pas de colonne au tableau', () => {
    // `detected` et `potential` sont l'ENTONNOIR (`intake`), `lost` et `dormant`
    // des sorties : aucune colonne ne les rend. Un lien qui les porterait
    // ouvrirait un tableau sans colonne, sans rien pour dire pourquoi.
    for (const stage of ['detected', 'potential', 'lost', 'dormant']) {
      expect(projectsSearchSchema.parse({ stage }).stage).toBeUndefined()
    }
  })

  it('retombe sur « pas de filtre » plutôt que sur une page en erreur', () => {
    // `.catch(undefined)` : un lien collé de travers doit montrer le pipe. Ce
    // qui rend le repli honnête, c'est qu'aucune mention de filtre ne s'affiche
    // alors — l'écran n'affirme un périmètre que quand il en tient un.
    expect(projectsSearchSchema.parse({ stage: 'tout-sauf-une-etape' }).stage).toBeUndefined()
    expect(projectsSearchSchema.parse({ stage: 42 }).stage).toBeUndefined()
    expect(projectsSearchSchema.parse({ stage: '' }).stage).toBeUndefined()
  })

  it('ignore une recherche vide sans lever', () => {
    expect(projectsSearchSchema.parse({})).toEqual({ stage: undefined })
  })

  it('est IDEMPOTENT — le routeur reparse sa propre sortie à chaque navigation', () => {
    const once = projectsSearchSchema.parse({ stage: 'negotiation' })
    expect(projectsSearchSchema.parse(once)).toEqual(once)
  })
})

/**
 * Lot X41 (02/10), #2958 — DÉFAUT RÉEL découvert par le scénario #2154.16
 * (« création d'un besoin manuel », e2e) : `/projects?create=1` et
 * `/projects?create_need=1` — LES deux formes que le catalogue de Laura
 * (`chat_tools.py`, route `/projects`, param `create`), `compile_opportunity`
 * et les commentaires du code nomment — n'ouvraient RIEN.
 *
 * Cause : le routeur analyse la recherche d'une URL (`parseSearch`, JSON) et
 * lit `1` comme le NOMBRE 1 ; `z.literal('1')` le refusait, `.catch(undefined)`
 * l'avalait en silence. Seule la forme `"1"` (entre guillemets) que le routeur
 * écrit lui-même quand on lui passe la chaîne marchait — donc un lien écrit à
 * la main, collé, ou rendu par Laura arrivait sur un pipe nu sans formulaire.
 */
describe('projectsSearchSchema — les drapeaux d’ouverture de formulaire lus dans une vraie URL', () => {
  it('`?create=1` : le routeur lit le nombre 1, le formulaire s’ouvre quand même', () => {
    expect(projectsSearchSchema.parse({ create: 1 }).create).toBe(1)
  })

  it('`?create_need=1` : même lecture, même ouverture', () => {
    expect(projectsSearchSchema.parse({ create_need: 1 }).create_need).toBe(1)
  })

  it('la chaîne « 1 » que le routeur écrit lui-même reste acceptée', () => {
    expect(projectsSearchSchema.parse({ create: '1', create_need: '1' })).toMatchObject({
      create: 1,
      create_need: 1,
    })
  })

  it('toute autre valeur n’ouvre rien : jamais un formulaire de création sur une valeur abîmée', () => {
    for (const bad of [0, 2, '0', 'oui', true, '']) {
      expect(projectsSearchSchema.parse({ create: bad }).create).toBeUndefined()
      expect(projectsSearchSchema.parse({ create_need: bad }).create_need).toBeUndefined()
    }
  })

  it('est idempotent : le routeur reparse sa propre sortie', () => {
    const once = projectsSearchSchema.parse({ create: 1, create_need: 1 })
    expect(projectsSearchSchema.parse(once)).toEqual(once)
  })

  it('#3547 — le routeur écrit `create=1`, jamais `create=%221%22`', () => {
    const out = defaultStringifySearch(projectsSearchSchema.parse({ create: '1', create_need: 1 }))
    expect(out).toBe('?create=1&create_need=1')
  })
})
