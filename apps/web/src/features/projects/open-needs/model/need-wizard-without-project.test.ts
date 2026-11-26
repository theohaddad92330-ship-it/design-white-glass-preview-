import { describe, expect, it } from 'vitest'
import { emptyNeedWizardDraft, needWizardDraftToAccountNeedInput, needWizardStepValid } from './need-wizard'

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET, jusque dans l'assistant.
 *
 * L'étape 1 exigeait un PROJET. Ce qu'elle doit exiger, c'est un CLIENT : la
 * majorité des missions d'ESN ne produisent aucun signal public (retour bêta
 * François Thomas, 17/09/2026), et forcer un projet revenait à en faire
 * inventer un par mission de régie.
 *
 * ⚠️ Ce test ne défait PAS #2558.2 : choisir un projet (ou le créer sans
 * sortir du parcours) reste un chemin entier, et le second cas ci-dessous le
 * garde — il vaut autant que le premier.
 */
const ACCOUNT = '33333333-3333-4333-8333-333333333333'
const PROJECT = '22222222-2222-4222-8222-222222222222'

describe('need-wizard — l’étape 1 exige le CLIENT, plus le projet (#2558.1)', () => {
  it('un titre et un CLIENT suffisent : le projet ne bloque plus', () => {
    const draft = { ...emptyNeedWizardDraft(), title: 'Tech lead Java', accountId: ACCOUNT }
    expect(needWizardStepValid(1, draft)).toBe(true)
    expect(draft.projectId).toBe('')
  })

  it('sans CLIENT, l’étape 1 BLOQUE — même avec un titre et un projet', () => {
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), title: 'Tech lead Java' })).toBe(false)
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), title: 'Tech lead Java', projectId: PROJECT })).toBe(
      false,
    )
  })

  it('sans TITRE, l’étape 1 bloque toujours — la garde n’a pas été desserrée par erreur', () => {
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), accountId: ACCOUNT })).toBe(false)
    expect(needWizardStepValid(1, { ...emptyNeedWizardDraft(), accountId: ACCOUNT, title: '   ' })).toBe(false)
  })

  it('un brouillon neuf n’a NI client NI projet — rien n’est deviné pour l’appelant', () => {
    const empty = emptyNeedWizardDraft()
    expect(empty.accountId).toBe('')
    expect(empty.projectId).toBe('')
  })
})

describe('need-wizard — le corps envoyé porte le client, et le projet seulement s’il existe', () => {
  it('sans projet, `project_id` vaut `null` — jamais une chaîne vide, que la route refuserait', () => {
    const body = needWizardDraftToAccountNeedInput({
      ...emptyNeedWizardDraft(),
      title: 'Tech lead Java',
      accountId: ACCOUNT,
    })
    expect(body.account_id).toBe(ACCOUNT)
    expect(body.project_id).toBeNull()
  })

  it('avec projet, il voyage tel quel — la non-régression du parcours existant', () => {
    const body = needWizardDraftToAccountNeedInput({
      ...emptyNeedWizardDraft(),
      title: 'Tech lead Java',
      accountId: ACCOUNT,
      projectId: PROJECT,
    })
    expect(body.project_id).toBe(PROJECT)
    expect(body.account_id).toBe(ACCOUNT)
  })

  it('ne pose QUE ce qui a été saisi — un champ vide ne part pas', () => {
    const body = needWizardDraftToAccountNeedInput({
      ...emptyNeedWizardDraft(),
      title: '  Tech lead Java  ',
      accountId: ACCOUNT,
    })
    expect(body.title).toBe('Tech lead Java')
    expect(body.seniority).toBeUndefined()
    expect(body.location).toBeUndefined()
    // `headcount` fait exception et c'est voulu : 1 est ce que l'assistant
    // AFFICHE dès l'ouverture, donc ce que l'appelant a sous les yeux — pas
    // un défaut deviné à son insu.
    expect(body.headcount).toBe(1)
  })
})
