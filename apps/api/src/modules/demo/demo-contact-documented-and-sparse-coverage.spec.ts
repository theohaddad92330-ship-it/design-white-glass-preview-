import { DEMO_ACTIVITIES, DEMO_DOSSIERS, DEMO_PLAN_TASKS } from './demo-dataset'

/**
 * #3710.3 — « UN CONTACT DOCUMENTÉ ET UN CONTACT PEU DOCUMENTÉ », sur un VRAI
 * compte de la salle (décision Louis 05/10/2026 : aucun scénario fictif, les
 * deux cas sont des contacts d'un compte réel).
 *
 * Une salle où tout contact est riche fait croire que le produit n'a jamais un
 * trou ; une salle où tout contact est vide ne montre rien. Les DEUX cas doivent
 * se lire, et se lire UTILES : le documenté montre la chaîne
 * compte → signal → interlocuteur → préparation → prochaine action ; le peu
 * documenté montre ce que le produit dit quand il ne sait pas — sans coordonnée
 * inventée.
 *
 * Ce que « documenté » veut dire ici, sept faits tous présents :
 *   identité (nom ou fonction) · périmètre (entité) · raison commerciale ·
 *   historique d'échanges (≥ 2 lignes de journal) · prochaine action (une tâche
 *   de plan datée) · dossier associé (le compte) · préparation (une tâche de
 *   plan « Préparer… » liée à lui).
 * Le garde SAIT DIRE NON : il recompte sur le jeu réellement construit
 * (`DEMO_DOSSIERS`, post-densification), jamais sur une liste écrite à la main.
 */
type Row = (typeof DEMO_DOSSIERS)[number]['contacts'][number]

function facts(company: string, contact: Row) {
  const history = DEMO_ACTIVITIES.filter(a => a.company === company && a.contact === contact.full_name)
  const plan = DEMO_PLAN_TASKS.filter(t => t.company === company && t.contact === contact.full_name)
  return {
    identity: contact.full_name.trim() !== '' || contact.title.trim() !== '',
    scope: contact.entity.trim() !== '',
    reason: contact.why_contact.trim() !== '',
    history: history.length,
    nextAction: plan.some(t => t.dueInDays !== undefined),
    preparation: plan.some(t => /^Préparer/.test(t.label)),
    dossier: DEMO_DOSSIERS.some(d => d.account.company_name === company),
    plan: plan.length,
  }
}

function all() {
  return DEMO_DOSSIERS.flatMap(dossier =>
    dossier.contacts.map(contact => ({
      company: dossier.account.company_name,
      contact,
      f: facts(dossier.account.company_name, contact),
    })),
  )
}

const isDocumented = (f: ReturnType<typeof facts>) =>
  f.identity && f.scope && f.reason && f.history >= 2 && f.nextAction && f.dossier && f.preparation

describe('couverture démo — un contact documenté et un contact peu documenté (#3710.3)', () => {
  it('LIT un corpus non vide — sans lui, la garde passerait au vert sur du vide', () => {
    expect(all().length).toBeGreaterThan(50)
  })

  it('porte AU MOINS un contact DOCUMENTÉ — les sept faits, sur un compte réel de la salle', () => {
    const documented = all().filter(row => isDocumented(row.f))
    expect(documented.length).toBeGreaterThan(0)
  })

  it('le documenté montre une prochaine action ET une relance en retard, jamais une chaîne lisse', () => {
    const row = all().find(entry => isDocumented(entry.f))
    expect(row).toBeDefined()
    const dues = DEMO_PLAN_TASKS.filter(t => t.company === row?.company && t.contact === row?.contact.full_name).map(
      t => t.dueInDays,
    )
    expect(dues.some(d => d !== null && d > 0)).toBe(true)
    expect(dues.some(d => d !== null && d < 0)).toBe(true)
  })

  it('porte AU MOINS un contact PEU DOCUMENTÉ — identité et périmètre, mais ni e-mail, ni téléphone, ni historique', () => {
    const sparse = all().filter(
      ({ contact, f }) => f.identity && f.scope && !contact.email && !contact.phone && f.history === 0 && f.plan === 0,
    )
    expect(sparse.length).toBeGreaterThan(0)
  })

  it('le peu documenté n’invente RIEN : aucune coordonnée, et ses faits connus se disent', () => {
    const sparse = all().filter(
      ({ contact, f }) => f.identity && f.scope && !contact.email && !contact.phone && f.history === 0 && f.plan === 0,
    )
    for (const { contact } of sparse) {
      expect(contact.email ?? null).toBeNull()
      expect(contact.phone ?? null).toBeNull()
      expect(contact.profile_summary.trim().length).toBeGreaterThan(0)
    }
  })

  it('SAIT DIRE NON : un contact sans historique n’est pas « documenté »', () => {
    const thin = all().find(({ f }) => f.history === 0)
    expect(thin).toBeDefined()
    expect(isDocumented((thin as { f: ReturnType<typeof facts> }).f)).toBe(false)
  })
})
