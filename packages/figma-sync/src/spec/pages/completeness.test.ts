import { describe, expect, it } from 'vitest'

import type { Block, PageSpec } from '../types'
import { PAGES } from './index'

/**
 * Lot H (#2799, 25/09/2026) : ~25 pages restaient CONDENSÉES ou affichaient
 * « — » faute de données (une ligne d'exemple par tableau, un KPI « — »).
 * Louis veut voir TOUT le contenu des pages longues dans les maquettes : ce
 * test échoue tant qu'une page de ce lot montre encore un tiret, un
 * placeholder de catalogue non rempli (« Libellé », « Description »), ou
 * qu'il lui manque une section que la vraie page porte.
 *
 * Il tourne sur les SPECS directement (pas la scène Figma complète) : plus
 * rapide, et c'est la source que ce lot édite.
 */

const LOT_H_PAGE_IDS = [
  'dm/accueil',
  'dm/clients',
  'dm/facturation',
  'dm/couts',
  'dm/health',
  'dm/audit',
  'dm/impersonations',
  'dm/esn-detail',
  'dm/integrations',
  'dm/changelog',
  'dm/flags',
  'dm/analysis-detail',
  'app/pilotage-finance',
  'app/missions-encaissements',
  'app/missions-paiements',
  'app/missions-cra',
  'app/team',
  'app/expenses-index',
  'app/billing',
  'app/projects-needs',
  'app/settings-mes-donnees',
  'app/settings-activity',
  'app/settings-legal-entities',
  'site/product',
] as const

/**
 * Les sections/onglets attendus par page, lus dans la VRAIE route (fichier:ligne
 * cité dans les `uxNotes` de chaque spec). Une entrée vide veut dire « pas encore
 * audité » — ce test ne triche pas sur les pages déjà auditées, mais ne peut pas
 * inventer un audit qui reste à faire pour les autres.
 */
const REQUIRED_SECTIONS: Partial<Record<(typeof LOT_H_PAGE_IDS)[number], string[]>> = {
  'dm/flags': ['User ID', 'Workspace ID', 'Évaluer', 'Contexte évalué'],
  'dm/changelog': ['Où en sont les lecteurs', 'Les repères', 'Ce qu’on a livré'],
  'dm/integrations': ['Catalogue', 'Par client', 'Livraisons'],
  'dm/impersonations': ['Sessions listées', 'En cours', 'Terminées', 'Expirées sans arrêt'],
  'dm/esn-detail': ['Renommer l’ESN', 'Fiche ESN', 'Invitation propriétaire', 'Membres', 'Invitations en attente'],
  'dm/accueil': [
    'Décomposition du mois',
    'Douze mois de MRR',
    'Ce qui demande une décision',
    'Volume d’analyses',
    'Mouvements du mois',
  ],
  'dm/audit': ['Rétentions appliquées', 'Actions ordinaires', 'Changements de permission', 'Exports de données'],
  'dm/couts': [
    'Coût par fournisseur',
    'Pic surveillé',
    'Coût par espace de travail',
    'Coût par action',
    'Coût par opération',
    'Marge brute',
  ],
  'dm/health': [
    'Ce qui casse vu du client',
    'Files d’attente (BullMQ)',
    'Capacités coupées',
    'Coût par prompt',
    'État des sources externes',
    'Espaces touchés',
    'Générations tronquées',
  ],
  'dm/clients': [
    'Analyses lancées par ESN',
    'Équipes',
    'Créer un client (facturation manuelle)',
    'Créer l’ESN',
    'Méthodologie & limites',
  ],
  'dm/facturation': [
    'Top users par coût',
    'Top ESN par coût',
    'Offres — ce que chaque offre rapporte',
    'Catalogue des offres',
    'Sur facture',
    'Calendrier de facturation',
    'Enrichissements (obsolète)',
    'Journal des factures',
    'Relance',
  ],
  'dm/analysis-detail': [
    'Logique Axians',
    'Axes écartés',
    'Vocabulaire du groupe',
    'Déroulement — APIs appelées par phase',
    'Organigramme des contacts',
    'Contacts par entité',
    'Dirigeants & C-level',
    'Finances — historique',
    'Les ESN concurrentes déjà présentes',
    'Concurrence & synergies ESN',
    'Filiales opérationnelles',
    'Sites France',
    'Signaux légaux — BODACC',
    'Actualités — Brave News',
    'Offres IT — France Travail',
    'Bénéficiaires effectifs — INPI',
    'Angles d’attaque',
    'Stack & opportunités ESN',
    'Hypothèses qualifiées',
    'Signaux & budget',
    'Pains & défis IT',
    'Plan d’action',
    'Chaîne de décision',
    'Ordre d’approche',
    'Carte des parties prenantes',
    'Zones blanches',
    'Script RDV',
    'Power questions',
    'Objections',
    'Réglementations',
    'Score /25 — pourquoi',
    'Identité légale incertaine',
    'Fiche contact détaillée',
    'Quick win',
  ],
  'app/pilotage-finance': [
    'Chiffre d’affaires',
    'Prévisionnel',
    'Capacité',
    'Marge par canal',
    'Délai de paiement',
    'Ce qui bloque de l’argent',
    'Objectif de marge',
    'Réservé aux responsables',
  ],
  'app/missions-encaissements': ['Facturé', 'Contesté', 'Déclarer un litige', 'Enregistrer un règlement'],
  'app/missions-paiements': ['À valider', 'Gestes sur ce paiement', 'Cession préparée'],
  'app/missions-cra': [
    'Ouvrir les relevés attendus',
    'Ouvrir le dossier',
    'relevé escaladé',
    'Rejeter ce relevé',
    'non applicable',
  ],
  'app/team': [
    'Carte de couverture',
    'Comptes sans responsable',
    'Doublons de couverture',
    'Playbooks partagés',
    'Rituels d’équipe',
    'Crédits & usage IA',
    'verrouillé',
    'Coaching',
    'Mon objectif du mois',
  ],
  'app/expenses-index': [
    'Vérification automatique',
    'Conformité politique frais',
    'Pièces jointes',
    'Déposer une note de frais',
    'Action recommandée',
  ],
  'app/billing': ['Historique de facturation', 'Mouvements de crédits', 'Aucune licence active', 'Pack 100 crédits'],
  'app/projects-needs': [
    'CA potentiel',
    'Ce que l’analyse a repéré',
    'Vue Kanban',
    'Laura peut traiter ces besoins',
    'sans compétence typée',
    'Mes vues',
  ],
  'app/settings-mes-donnees': [
    'Mes données personnelles',
    'Les données de l’espace de travail',
    'Voici ce que ton export contiendra',
    'Zone sensible',
  ],
  'app/settings-activity': ['Rôle modifié', 'Intégration connectée'],
  'app/settings-legal-entities': ['Ajouter une société', 'Archivée'],
  'site/product': ['Répartition géographique', 'non évalué', 'Sites industriels'],
}

function collectStrings(blocks: readonly Block[] | undefined, out: string[]): void {
  for (const b of blocks ?? []) {
    if (b.type === 'text') out.push(b.text)
    else if (b.type === 'placeholder') out.push(b.label)
    else if (b.type === 'stack' || b.type === 'grid') collectStrings(b.children, out)
    else if (b.type === 'component') {
      const props = b.props as {
        content?: Record<string, string | undefined>
        items?: string[]
        table?: { columns: string[]; rows: string[][] }
      }
      if (props.content) out.push(...Object.values(props.content).filter((v): v is string => typeof v === 'string'))
      if (props.items) out.push(...props.items)
      if (props.table) out.push(...props.table.columns, ...props.table.rows.flat())
      const children = (b as { children?: Block[] }).children
      if (children) collectStrings(children, out)
    }
  }
}

/** Tous les textes d'une page : slots + états. */
function allStrings(spec: PageSpec): string[] {
  const out: string[] = []
  for (const blocks of Object.values(spec.slots)) collectStrings(blocks as Block[] | undefined, out)
  for (const blocks of Object.values(spec.states)) collectStrings(blocks as Block[] | undefined, out)
  return out
}

describe('lot H — pages sorties de leur état condensé (#2799)', () => {
  const byId = new Map(PAGES.map(p => [p.id, p]))

  it('les 25 pages du lot existent au registre', () => {
    const missing = LOT_H_PAGE_IDS.filter(id => !byId.has(id))
    expect(missing).toEqual([])
  })

  for (const id of LOT_H_PAGE_IDS) {
    it(`${id} : aucun « — » ni placeholder de catalogue non rempli`, () => {
      const spec = byId.get(id)
      if (!spec) return // couvert par le test de couverture ci-dessus
      const strings = allStrings(spec)
      const dashes = strings.filter(s => s === '—' || s === '—/—')
      const catalogPlaceholders = strings.filter(s => s === 'Libellé' || s === 'Description')
      expect({ dashes, catalogPlaceholders }).toEqual({ dashes: [], catalogPlaceholders: [] })
    })

    const required = REQUIRED_SECTIONS[id]
    if (required?.length) {
      it(`${id} : porte les sections de la vraie page`, () => {
        const spec = byId.get(id)
        if (!spec) return
        const strings = allStrings(spec)
        const missing = required.filter(title => !strings.some(s => s.includes(title)))
        expect(missing).toEqual([])
      })
    }
  }
})
