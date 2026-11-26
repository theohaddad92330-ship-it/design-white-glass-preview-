import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACTION_TARGET_DOMAIN } from '@/features/commercial-audit/lib/build-audit'
import { AUDIT_CONFIGURATION_AREA_SETTINGS, buildAuditProductConfiguration } from '@bellum/contracts'

/**
 * GA-372 — UNE AIRE PRODUIT PROMISE PAR L'AUDIT EST ATTEIGNABLE DEPUIS DES
 * DONNÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE AURAIT ATTRAPÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en PRODUCTION le 21/09/2026 : l'audit déclarait NEUF aires produit
 * (`auditProductAreaSchema`), en nommait neuf en i18n aux deux langues, et
 * trois d'entre elles — « Scoring » (#2068.24), « Carte d'influence »
 * (#2068.26) et « Messages » (#2068.27) — ne sortaient d'AUCUNE donnée :
 * `ACTION_TARGET_DOMAIN` ne mène à aucune des trois, et leur seul autre
 * porteur (`CommercialAuditContext.productConfiguration`) était écrit `null`
 * EN DUR (`build-audit.ts:605`). Trois aires marquées `livré`, jamais
 * affichables. C'est le défaut n°1 de ce dépôt : du code juste, calculé,
 * testé, que personne n'appelle.
 *
 * Un libellé i18n ne prouve rien : il se lit dans un fichier de traduction,
 * pas sur un écran. Cette garde exige, pour CHAQUE aire déclarée, un PORTEUR
 * qui la produise depuis des données — et refuse qu'une même aire soit portée
 * par les DEUX (un réglage vit à un seul endroit, GA-26 : le plan dit ce
 * qu'il faut FAIRE, la configuration dit ce qu'il faut RÉGLER, jamais les deux
 * sur la même aire).
 */

const CONTRACTS = join(process.cwd(), '..', '..', 'packages', 'contracts', 'src', 'schemas')
const LOCALES = join(process.cwd(), 'src', 'i18n', 'locales')

/** Les aires DÉCLARÉES par le contrat, lues sur le fichier — jamais une liste
 *  recopiée ici, qui serait verte en oubliant l'aire ajoutée hier. */
function declaredAreas(): string[] {
  const source = readFileSync(join(CONTRACTS, 'commercial-audit-context.ts'), 'utf8')
  const block = /auditProductAreaValues\s*=\s*\[([^\]]+)\]/.exec(source)
  expect(block, "le catalogue `auditProductAreaValues` n'a pas été trouvé — la garde lirait du vide").not.toBeNull()
  return [...block![1].matchAll(/'([A-Za-z]+)'/g)].map(match => match[1])
}

/** Les aires que le PLAN peut nommer : une priorité de semaine porte un
 *  `domain`, dérivé du TYPE d'objet visé par l'action (`ACTION_TARGET_DOMAIN`). */
const planAreas = new Set<string>(Object.values(ACTION_TARGET_DOMAIN))

/** Les aires que la CONFIGURATION peut nommer : un réglage d'espace manquant
 *  ou renseigné (`buildAuditProductConfiguration`). */
const configurationAreas = new Set<string>(Object.keys(AUDIT_CONFIGURATION_AREA_SETTINGS))

describe('GA-372 — une aire produit promise est atteignable depuis des données', () => {
  it('lit un corpus non vide — le contrat, les deux langues et les deux porteurs', () => {
    const areas = declaredAreas()
    expect(areas.length).toBeGreaterThanOrEqual(9)
    for (const language of ['fr', 'en']) {
      const labels = JSON.parse(readFileSync(join(LOCALES, language, 'commercialAudit.json'), 'utf8')) as {
        productConfiguration?: { area?: Record<string, string> }
      }
      const named = Object.keys(labels.productConfiguration?.area ?? {})
      expect(named.sort(), `les libellés d'aire manquent en « ${language} »`).toEqual([...areas].sort())
    }
    expect(planAreas.size).toBeGreaterThanOrEqual(5)
    expect(configurationAreas.size).toBeGreaterThanOrEqual(3)
  })

  it('les trois aires RÉFUTÉES le 21/09/2026 ont un porteur', () => {
    // #2068.24 · #2068.26 · #2068.27 — nommées ici pour que la garde puisse
    // redevenir rouge exactement sur le défaut qu'elle a fermé.
    for (const area of ['scoring', 'orgGraph', 'messages']) {
      expect(
        planAreas.has(area) || configurationAreas.has(area),
        `l'aire « ${area} » est promise par l'audit et ne sort d'aucune donnée`,
      ).toBe(true)
    }
  })

  it('aucune aire déclarée n’est orpheline des deux porteurs', () => {
    const orphans = declaredAreas().filter(area => !planAreas.has(area) && !configurationAreas.has(area))
    // `discover` (#2068.23) reste la SEULE aire sans porteur : aucune nature
    // d'action ne la vise et aucun réglage d'espace ne la configure encore
    // (point `retenu` au registre, pas un oubli). Toute AUTRE aire orpheline
    // fait échouer cette garde.
    expect(orphans).toEqual(['discover'])
  })

  it('aucune aire n’est portée par les DEUX — le plan dit quoi FAIRE, la configuration quoi RÉGLER (GA-26)', () => {
    const both = [...configurationAreas].filter(area => planAreas.has(area))
    expect(both, 'une aire portée par le plan ET par la configuration s’affiche deux fois sous deux formes').toEqual([])
  })

  it('SAIT DIRE NON — une aire absente des deux porteurs est refusée', () => {
    const rogue = 'uneAireQuePersonneNeProduit'
    expect(planAreas.has(rogue) || configurationAreas.has(rogue)).toBe(false)
  })

  it('le porteur CONFIGURATION produit vraiment ses aires depuis un profil — pas une table morte', () => {
    const produced = buildAuditProductConfiguration({
      esnArchetype: 'boutiqueExpert',
      sellingPosture: 'expertiseRare',
      idealAccountProfile: {
        size: 'eti',
        sectorsPriority: ['Banque'],
        decisionLevel: 'director',
        entryStrategy: 'bottomUp',
      },
      analysisParameters: {
        braveQueriesCount: 12,
        firecrawlPagesCount: 6,
        contactsTarget: 40,
        analysisDepth: 'standard',
        maxTokensResearch: 12000,
        focusAreas: ['Cloud'],
      },
      messagingStyle: {
        tone: 'directExpert',
        messageLength: 'concise',
        valuePropositionAngle: 'Une preuve par domaine.',
        differentiationPoints: ['Une référence réelle'],
        avoid: [],
      },
      welcomeSummary: {
        profileRecap: 'r',
        searchesPersonalization: 's',
        contactsPersonalization: 'c',
        messagesPersonalization: 'm',
        scoringPersonalization: 'sc',
        firstAnalysisSuggestions: [],
      },
    })
    expect(produced?.map(entry => entry.area).sort()).toEqual([...configurationAreas].sort())
    // Et le porteur sait rendre `null` : sans aucun bloc lu, aucune aire —
    // une absence ne fait AUCUNE ligne.
    expect(buildAuditProductConfiguration({ esnArchetype: 'soloHunter', sellingPosture: 'volumeFlexible' })).toBeNull()
  })
})
