import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3885 — « j'ai besoin de bcp plus de signaux, surtout de recrutements », EN DÉMONSTRATION.
 *
 * La recette prod ne pouvait pas mesurer une AUGMENTATION (relancer l'analyse = écriture et crédits).
 * La salle porte déjà des comptes dont l'onglet Veille, filtre « Recrutements », est fourni : cette
 * garde épingle ce que le recetteur doit y compter, pour que le chiffre de la ligne « Recette : »
 * ne dérive pas en silence (Sanofi, Alstom, ABB Suisse portent des signaux de type `recrutement`).
 */
/** Miroir de `categoryFor` (apps/web/src/features/accounts/model/watchData.ts), branche recrutement : un `type`
 *  `recrutement` est pris au mot, sinon la nomination prime puis le texte (jamais importé d'apps/web dans l'API). */
const isRecruitment = (type: string, signal: string): boolean => {
  if (type.trim().toLowerCase() === 'recrutement') return true
  if (['appel_offres', 'marche_public', 'nomination', 'budget'].includes(type.trim().toLowerCase())) return false
  const text = `${type} ${signal}`.toLowerCase()
  if (/nomm[ée]|nomination|prend la (direction|tête)|rejoint .*(en tant que|comme)/.test(text)) return false
  return /recrut|embauch|\bposte\b|\bemploi\b/.test(text)
}

/** Tous les signaux d'un dossier de démo — ce qui permet de distinguer « aucun recrutement » de « rien du tout ». */
const signalCount = (company: string): number =>
  (DEMO_DOSSIERS.find(d => d.account.company_name === company)?.account.recent_signals ?? []).length

const recruitmentCount = (company: string): number => {
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name === company)
  const signals = (dossier?.account.recent_signals ?? []) as Array<{ type?: string; signal?: string }>
  return signals.filter(item => isRecruitment(item.type ?? '', item.signal ?? '')).length
}

describe('#3885 — comptes démo à Veille fournie en recrutements', () => {
  it.each([
    ['Sanofi', 5],
    ['Alstom', 5],
    ['ABB Suisse', 5],
  ])('%s porte au moins %i signaux de recrutement', (company, minimum) => {
    expect(recruitmentCount(company)).toBeGreaterThanOrEqual(minimum)
  })

  it('sait dire NON : un compte sans signal de recrutement n’en affiche aucun (jamais un compte inventé)', () => {
    // ⚠️ 29/10/2026 — le témoin était Société Générale, qui ne portait AUCUN signal de recrutement.
    // #4756 (PR #4776) y a semé ses cinq besoins historiques (« Développeur Java back-end », « Tech lead
    // Java »…), tous de type `recrutement`, parce que l'onglet Historique de /signals se démontre sur ce
    // dossier. Le semis est juste ; c'est le témoin qu'il fallait déplacer — jamais l'inverse.
    //
    // BNP Paribas est un témoin PLUS FORT que l'ancien : dix-sept signaux, zéro recrutement. Il prouve que
    // le filtre DISCRIMINE, là où un compte vide ne prouverait que son vide. D'où l'assertion de corpus
    // juste en dessous : le jour où ce dossier perdrait ses signaux, le témoin cesserait de témoigner et
    // cette ligne le dirait, au lieu de rendre un zéro qui ressemble à une réponse.
    expect(signalCount('BNP Paribas')).toBeGreaterThanOrEqual(10)
    expect(recruitmentCount('BNP Paribas')).toBe(0)
    expect(recruitmentCount('Compte absent du jeu')).toBe(0)
  })
})
