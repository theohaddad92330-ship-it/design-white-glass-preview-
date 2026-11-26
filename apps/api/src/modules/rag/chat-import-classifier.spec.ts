import { classifyChatDropContent } from './chat-import-classifier'

/**
 * #2850 (#2431.2/.10) — la classification par CONTENU du composeur `/chat`,
 * réutilisant EXACTEMENT le moteur de l'assistant d'import (`proposeMapping` +
 * `IMPORT_CATALOG`, `apps/api/src/modules/import`). Chaque cas ci-dessous fixe
 * une RAISON explicite de son verdict — jamais une valeur recopiée sans preuve.
 */
describe('classifyChatDropContent', () => {
  it('reconnaît un export de comptes (raison sociale + SIREN) avec confiance HAUTE', () => {
    const csv = 'raison sociale,siren\nAcme SAS,123456789'
    expect(classifyChatDropContent(csv)).toEqual({ object: 'account', sourceKey: 'accounts_only', confidence: 'high' })
  })

  it('reconnaît un appel d’offres (intitulé + échéance) comme un BESOIN, avec confiance HAUTE', () => {
    const csv = 'intitulé,date limite\nAudit SRE,2026-11-30'
    expect(classifyChatDropContent(csv)).toEqual({ object: 'need', sourceKey: 'tender_records', confidence: 'high' })
  })

  it('#2850 (réfuté, recette 07/10) — un export de BESOINS (colonne « besoin ») est reconnu comme un need', () => {
    // La recette déposait un CSV de besoins (pas un appel d'offres) : la colonne
    // s'appelle « besoin », jamais « intitulé »/« objet »/« titre » — l'alias
    // manquait, donc rien n'était proposé (classification `null`).
    const csv = 'besoin,competence\nDev Java confirmé,Java/Spring'
    expect(classifyChatDropContent(csv)).toEqual({ object: 'need', sourceKey: 'tender_records', confidence: 'high' })
  })

  it('#2431.10 — confiance BASSE quand une colonne ne matche aucun alias connu', () => {
    // « email » matche trois sources à égalité (hubspot/crm_generic/contacts_only) — le
    // catalogue est une liste ORDONNÉE : la PREMIÈRE l'emporte, jamais un tirage.
    const csv = 'email,notes_perso\nolivier@acme.fr,texte libre'
    expect(classifyChatDropContent(csv)).toEqual({ object: 'account', sourceKey: 'hubspot_export', confidence: 'low' })
  })

  it('ne propose JAMAIS un objet non écrivable (témoignage → `reference`, hors WRITABLE_IMPORT_OBJECTS)', () => {
    // Ces deux colonnes matchent PARFAITEMENT `testimonials`, mais son objet
    // cible (`reference`) n'écrit jamais en base (#2078.29) — la doctrine
    // « jamais de donnée fictive » s'applique aussi à une suggestion de routage.
    const csv = 'citation,auteur\n"Un partenaire fiable.",Jean Dupont'
    expect(classifyChatDropContent(csv)).toBeNull()
  })

  it('renvoie null sur un fichier non tabulaire (une seule colonne, aucun séparateur reconnu)', () => {
    expect(classifyChatDropContent('Un simple mémo sans tableau ni colonnes.')).toBeNull()
  })

  it('renvoie null sur un contenu vide', () => {
    expect(classifyChatDropContent('')).toBeNull()
  })

  it('renvoie null quand aucune source n’a tous ses champs obligatoires couverts', () => {
    const csv = 'couleur,taille\nrouge,42'
    expect(classifyChatDropContent(csv)).toBeNull()
  })
})
