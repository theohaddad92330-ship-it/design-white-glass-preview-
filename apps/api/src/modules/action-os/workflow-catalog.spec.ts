import { workflowDefinitionSchema } from '@bellum/contracts'
import { WORKFLOW_CATALOG, findWorkflow } from './workflow-catalog'
import { orderByDependency } from './workflow-runner.service'

/**
 * Le catalogue est du CODE, donc il se relit et se teste comme du code.
 *
 * Ces tests ne vérifient pas « les cinq workflows existent » — ils vérifient les
 * propriétés qu'un workflow mal formé violerait silencieusement : un pas qui
 * dépend d'un pas inexistant (il ne s'exécuterait jamais), un cycle (l'ordre
 * deviendrait arbitraire), un envoi déclaré réversible (il échapperait à
 * l'approbation), un coût oublié (le devis mentirait).
 */

describe('catalogue de workflows', () => {
  it('respecte le contrat partagé, définition par définition', () => {
    for (const definition of WORKFLOW_CATALOG) {
      expect(() => workflowDefinitionSchema.parse(definition)).not.toThrow()
    }
  })

  it('n’a pas deux définitions sous la même clé', () => {
    const keys = WORKFLOW_CATALOG.map(d => d.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ne référence que des dépendances qui existent', () => {
    // Une dépendance mal orthographiée ne casse rien au démarrage : le pas est
    // simplement sauté à chaque run, silencieusement. C'est le pire des échecs.
    for (const definition of WORKFLOW_CATALOG) {
      const keys = new Set(definition.steps.map(s => s.key))
      for (const step of definition.steps) {
        for (const dependency of step.dependsOn) {
          expect(keys.has(dependency)).toBe(true)
        }
      }
    }
  })

  it('n’a pas de cycle de dépendances', () => {
    for (const definition of WORKFLOW_CATALOG) {
      const ordered = orderByDependency(definition.steps)
      const placed = new Set<string>()
      for (const step of ordered) {
        for (const dependency of step.dependsOn) {
          expect(placed.has(dependency)).toBe(true)
        }
        placed.add(step.key)
      }
    }
  })

  it('déclare tout envoi d’email comme irréversible', () => {
    // C'est ce qui force l'approbation. Un envoi marqué « low » passerait sous
    // le radar de la politique et partirait sans que personne ne dise oui.
    for (const definition of WORKFLOW_CATALOG) {
      for (const step of definition.steps) {
        if (step.intentType === 'send_email') expect(step.risk).toBe('irreversible')
      }
    }
  })

  it('ne facture un crédit que sur les pas qui en coûtent vraiment', () => {
    // Seul l'enrichissement débite (monnaie unique : 1 crédit = 1 action). Une
    // note CRM annoncée payante ferait renoncer l'utilisateur pour rien.
    for (const definition of WORKFLOW_CATALOG) {
      for (const step of definition.steps) {
        if (step.intentType === 'enrich_contact') expect(step.estimatedCredits).toBeGreaterThan(0)
        else expect(step.estimatedCredits).toBe(0)
      }
    }
  })

  it('nomme une capacité, jamais un éditeur', () => {
    // Les capacités remontent jusqu'à l'écran de prévisualisation : un nom
    // d'éditeur ici ressortirait devant le commercial (addendum p12).
    const vendors = ['hubspot', 'salesforce', 'gmail', 'outlook', 'apollo', 'dropcontact', 'slack', 'google']
    for (const definition of WORKFLOW_CATALOG) {
      for (const step of definition.steps) {
        expect(vendors).not.toContain(step.capability.toLowerCase())
      }
    }
  })

  it('décrit chaque pas en français ET en anglais au niveau de la définition', () => {
    for (const definition of WORKFLOW_CATALOG) {
      expect(definition.name.fr).not.toBe('')
      expect(definition.name.en).not.toBe('')
      expect(definition.name.fr).not.toBe(definition.name.en)
    }
  })

  it('rend `undefined` sur une clé inconnue — jamais une définition inventée', () => {
    expect(findWorkflow('does_not_exist')).toBeUndefined()
    expect(findWorkflow('crm_hygiene')?.key).toBe('crm_hygiene')
  })

  it('écrit la fiche CRM AVANT d’y ajouter une note (anti-doublon p28)', () => {
    const hygiene = findWorkflow('crm_hygiene')
    const ordered = orderByDependency(hygiene?.steps ?? [])
    expect(ordered.map(s => s.intentType)).toEqual(['create_crm_task', 'create_crm_note'])
  })
})
