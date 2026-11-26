import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UniversalImportJobState } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const api = vi.hoisted(() => ({
  uploadUniversalImport: vi.fn(),
  previewUniversalImport: vi.fn(),
  verifyUniversalImport: vi.fn(),
  startUniversalImport: vi.fn(),
  resumeUniversalImport: vi.fn(),
  fetchUniversalImport: vi.fn(),
  fetchUniversalImportReport: vi.fn(),
}))
vi.mock('../api', () => api)
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search: _search, ...rest }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const socket = vi.hoisted(() => ({ handler: null as null | ((state: UniversalImportJobState) => void) }))
vi.mock('@/lib/socket', () => ({
  subscribeToImportJob: (_id: string, handler: (state: UniversalImportJobState) => void) => {
    socket.handler = handler
    return () => undefined
  },
}))
vi.mock('@/lib/data-exit', () => ({
  useDataExit: () => ({ allowed: true, grant: {} }),
  workspaceRuleRefusalText: () => null,
}))
vi.mock('@/components/overlay/ModalPortal', () => ({
  ModalPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import { UniversalImportDialog } from './UniversalImportDialog'

const JOB: UniversalImportJobState = {
  id: 'job-1',
  type: 'contact',
  status: 'queued',
  filename: 'exemple-contact.csv',
  totalRows: null,
  processedRows: 0,
  imported: 0,
  duplicates: 0,
  rejected: 0,
  error: null,
  scope: 'workspace',
  toReconcile: 0,
  breakdown: {},
  queryableByLaura: null,
  sourceSystem: null,
}

function renderDialog(props: Partial<Parameters<typeof UniversalImportDialog>[0]> = {}, client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <UniversalImportDialog accountId="acc-1" fixedType="contact" onClose={() => undefined} {...props} />
    </QueryClientProvider>,
  )
}

/**
 * Théo B c4 — un import est TOUJOURS vérifié avant d'être lancé : le bouton de la correspondance ne lance rien, il
 * vérifie ; « Lancer l'import » n'existe qu'avec le rapport de vérification en main.
 */
async function launchAfterVerification(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Vérifier avant d.importer|Check before importing/i }))
  await user.click(await screen.findByRole('button', { name: /Lancer l.import|Start import/i }))
}

describe('UniversalImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    socket.handler = null
    api.uploadUniversalImport.mockResolvedValue({ ...JOB, status: 'uploading' })
    api.previewUniversalImport.mockResolvedValue({
      headers: ['Nom complet', 'Code interne ERP'],
      mapping: { 'Nom complet': 'full_name', 'Code interne ERP': null },
      sample: [{ 'Nom complet': 'Jeanne Exemple', 'Code interne ERP': 'ERP-0001' }],
      fields: ['full_name', 'title', 'email'],
    })
    api.startUniversalImport.mockResolvedValue(JOB)
    api.fetchUniversalImport.mockResolvedValue(JOB)
    api.verifyUniversalImport.mockResolvedValue({
      total: 3,
      toCreate: 3,
      toComplete: 0,
      discarded: 0,
      rows: [],
      truncated: false,
      sensitiveColumns: [],
      withoutLegalBasis: 0,
    })
  })

  it('Théo B c4 — le lancement exige la vérification : rien ne part avant le rapport, quelle que soit la taille', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await user.click(await screen.findByRole('button', { name: /Vérifier avant d.importer|Check before importing/i }))
    expect(api.verifyUniversalImport).toHaveBeenCalledWith('job-1', expect.any(Object), null)
    expect(api.startUniversalImport).not.toHaveBeenCalled()
    expect(await screen.findByText(/3/)).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /Lancer l.import|Start import/i }))
    expect(api.startUniversalImport).toHaveBeenCalledTimes(1)
  })

  // #2732.1 — un fichier de missions se mappe au vocabulaire MISSION, pas à celui des contacts.
  it('#2732.1 — import de missions : « Intitulé de la mission » et « Client », jamais « Poste / intitulé » ni « Société »', async () => {
    const user = userEvent.setup()
    api.previewUniversalImport.mockResolvedValue({
      headers: ['Mission'],
      mapping: { Mission: 'title' },
      sample: [{ Mission: 'Refonte SI' }],
      fields: ['title', 'company', 'consultant'],
    })
    renderDialog({ fixedType: 'mission' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(input, new File(['Mission\nRefonte SI'], 'missions.csv', { type: 'text/csv' }))
    await user.click(await screen.findByRole('combobox', { name: /Mission/ }))
    expect(await screen.findByRole('option', { name: 'Client' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Intitulé de la mission' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Poste / intitulé' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'Société' })).toBeNull()
  })

  it('n’annonce AUCUN plafond de lignes', () => {
    renderDialog()
    expect(screen.queryByText(/500|maximum/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sans limite de lignes|no row limit/i)).toBeInTheDocument()
  })

  // Théo A comptes-import.N3 — l'entrée « fichier d'exemple » démarre le contrôle sans second clic, une seule fois.
  it('startWithSample envoie le fichier d’exemple dès l’ouverture, une seule fois', async () => {
    renderDialog({ startWithSample: true, fixedType: 'account', accountId: null })

    await waitFor(() => expect(api.uploadUniversalImport).toHaveBeenCalledTimes(1))
    expect(api.uploadUniversalImport).toHaveBeenCalledWith(expect.any(File), 'account', null, expect.any(Function), {})
  })

  it('fichier d’exemple → correspondance : une colonne inconnue est CONSERVÉE, puis le suivi temps réel et le rapport', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))

    // La colonne sans champ d'accueil est proposée en « informations complémentaires », jamais jetée.
    const select = await screen.findByRole('combobox', { name: /Code interne ERP/ })
    expect(select).toHaveTextContent(/Conserver en informations complémentaires|Keep as additional information/)
    expect(api.uploadUniversalImport).toHaveBeenCalledWith(
      expect.any(File),
      'contact',
      'acc-1',
      expect.any(Function),
      {},
    )

    await launchAfterVerification(user)
    expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', {
      'Nom complet': 'full_name',
      'Code interne ERP': null,
    })

    // La progression arrive par Socket.IO.
    await waitFor(() => expect(socket.handler).not.toBeNull())
    socket.handler?.({ ...JOB, status: 'done', totalRows: 3, processedRows: 3, imported: 2, duplicates: 1 })
    expect(await screen.findByText(/2 fiches créées|2 records created/)).toBeInTheDocument()
    expect(screen.getByText(/1 doublon proposé|1 duplicate suggested/)).toBeInTheDocument()
    // Aucun rejet : aucune ligne « 0 écartée ».
    expect(screen.queryByText(/écartée|set aside/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Télécharger le rapport|Download the report/ })).toBeInTheDocument()
  })

  it('#4426.4 — un classeur : l’onglet retenu est montré, un autre se choisit, et l’import lit celui-là', async () => {
    const user = userEvent.setup()
    const sheets = [
      { name: 'Synthèse', rows: 5 },
      { name: 'Tiering 2026-2027', rows: 279 },
    ]
    api.previewUniversalImport.mockResolvedValueOnce({
      headers: ['Nom complet'],
      mapping: { 'Nom complet': 'full_name' },
      sample: [{ 'Nom complet': 'Jeanne Exemple' }],
      fields: ['full_name', 'title'],
      sheets,
      sheet: 'Tiering 2026-2027',
    })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    const picker = await screen.findByRole('combobox', { name: /Onglet|Sheet/i })
    expect(picker).toHaveTextContent('Tiering 2026-2027')

    api.previewUniversalImport.mockResolvedValueOnce({
      headers: ['Tier'],
      mapping: { Tier: null },
      sample: [],
      fields: ['full_name', 'title'],
      sheets,
      sheet: 'Synthèse',
    })
    await user.click(picker)
    await user.click(await screen.findByRole('option', { name: /Synthèse/ }))
    expect(api.previewUniversalImport).toHaveBeenLastCalledWith('job-1', 'Synthèse')

    await launchAfterVerification(user)
    expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', { Tier: null }, 'Synthèse')
  })

  it('#4426.4 — un classeur à un seul onglet, ou un CSV : pas de sélecteur d’onglet', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await screen.findByRole('combobox', { name: /Code interne ERP/ })
    expect(screen.queryByRole('combobox', { name: /Onglet|Sheet/i })).not.toBeInTheDocument()
  })

  it('#2927 — par défaut l’import est d’équipe ; « Moi seul » envoie la portée personnelle', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByRole('group', { name: /Qui voit ces contacts|Who sees these contacts/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mon équipe|My team/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Moi seul|Only me/ }))
    expect(screen.getByText(/toi seul les vois|only you see them/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await waitFor(() =>
      expect(api.uploadUniversalImport).toHaveBeenCalledWith(
        expect.any(File),
        'contact',
        'acc-1',
        expect.any(Function),
        { scope: 'personal' },
      ),
    )
  })

  it('#2927 (X76) — un import « Moi seul » terminé relit « Mes contacts personnels » du compte', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()
    renderDialog({}, client)
    await user.click(screen.getByRole('button', { name: /Moi seul|Only me/ }))
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    await waitFor(() => expect(socket.handler).not.toBeNull())
    socket.handler?.({ ...JOB, scope: 'personal', status: 'done', totalRows: 3, processedRows: 3, imported: 3 })
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['personal-contacts', 'acc-1'] }))
  })

  it('#2927 (X76) — un import d’équipe ne relit pas les contacts personnels (la garde sait dire NON)', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()
    renderDialog({}, client)
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    await waitFor(() => expect(socket.handler).not.toBeNull())
    socket.handler?.({ ...JOB, status: 'done', totalRows: 3, processedRows: 3, imported: 3 })
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['account', 'acc-1'] }))
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['personal-contacts', 'acc-1'] })
  })

  // #2927 (#2159.54) retire la limite « sans compte d'origine, aucun choix », délibérément :
  // l'import depuis /contacts et Réglages › Import propose lui aussi Équipe / Moi seul.
  it('#2927 — sans compte d’origine, le choix de portée est proposé pour des contacts', async () => {
    const user = userEvent.setup()
    renderDialog({ accountId: null })
    expect(screen.getByRole('group', { name: /Qui voit ces contacts|Who sees these contacts/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mon équipe|My team/ })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: /Moi seul|Only me/ }))
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await waitFor(() =>
      expect(api.uploadUniversalImport).toHaveBeenCalledWith(expect.any(File), 'contact', null, expect.any(Function), {
        scope: 'personal',
      }),
    )
  })

  it('#2927 — hors fiche compte, un import « Moi seul » terminé relit « Mes contacts personnels » de /contacts', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()
    renderDialog({ accountId: null }, client)
    await user.click(screen.getByRole('button', { name: /Moi seul|Only me/ }))
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    await waitFor(() => expect(socket.handler).not.toBeNull())
    socket.handler?.({ ...JOB, scope: 'personal', status: 'done', totalRows: 3, processedRows: 3, imported: 3 })
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['personal-contacts'] }))
  })

  it('NON — un import de comptes n’offre aucun choix de portée', () => {
    renderDialog({ accountId: null, fixedType: 'account' })
    expect(
      screen.queryByRole('group', { name: /Qui voit ces contacts|Who sees these contacts/ }),
    ).not.toBeInTheDocument()
  })

  it('un import interrompu se REPREND d’un clic', async () => {
    const user = userEvent.setup()
    api.startUniversalImport.mockResolvedValue({ ...JOB, status: 'failed', processedRows: 500 })
    api.resumeUniversalImport.mockResolvedValue({ ...JOB, status: 'queued', processedRows: 500 })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    await user.click(await screen.findByRole('button', { name: /Reprendre l.import|Resume import/ }))
    expect(api.resumeUniversalImport).toHaveBeenCalledWith('job-1')
  })

  it('dit NON à un format inconnu, avant tout envoi', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderDialog()
    await user.upload(
      screen.getByLabelText(/Choisir un fichier|Choose a file/, { selector: 'input' }),
      new File(['x'], 'photo.png'),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/Format non reconnu|Unrecognised format/)
    expect(api.uploadUniversalImport).not.toHaveBeenCalled()
  })

  // #3666.9 (Louis 15/10/2026) — la limite annoncée de 1 Go : au-delà, refusé AVANT tout envoi, avec sa raison.
  it('#3666.9 — annonce la limite de 1 Go, et refuse au-delà avant tout envoi', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderDialog()
    expect(screen.getByText(/Jusqu’à 1 Go par fichier|Up to 1 Go per file/)).toBeInTheDocument()
    const huge = new File(['x'], 'export.csv')
    Object.defineProperty(huge, 'size', { value: 1024 ** 3 + 1 })
    await user.upload(screen.getByLabelText(/Choisir un fichier|Choose a file/, { selector: 'input' }), huge)
    expect(await screen.findByRole('alert')).toHaveTextContent(/limite d’import est de 1 Go|import limit is 1 Go/)
    expect(api.uploadUniversalImport).not.toHaveBeenCalled()
  })

  it('#4052.2 — le CRM d’origine saisi part avec le fichier (il borne les références source)', async () => {
    const user = userEvent.setup()
    renderDialog({ accountId: null })
    await user.type(screen.getByRole('textbox', { name: /CRM d.origine|Source CRM/ }), 'BoondManager')
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await waitFor(() =>
      expect(api.uploadUniversalImport).toHaveBeenCalledWith(expect.any(File), 'contact', null, expect.any(Function), {
        sourceSystem: 'BoondManager',
      }),
    )
  })

  it('#4051 — le bilan se lit PAR FAMILLE ; jamais « import terminé » ; une absence ne fait aucune ligne', async () => {
    const user = userEvent.setup()
    renderDialog({ accountId: null })
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    await waitFor(() => expect(socket.handler).not.toBeNull())
    socket.handler?.({
      ...JOB,
      status: 'done',
      totalRows: 5,
      processedRows: 5,
      imported: 3,
      toReconcile: 3,
      queryableByLaura: 5,
      breakdown: {
        account: { created: 2, matched: 0, duplicates: 0, rejected: 0, toReconcile: 1 },
        contact: { created: 3, matched: 1, duplicates: 0, rejected: 0, toReconcile: 2 },
      },
    })
    expect(await screen.findByText(/2 comptes créés|2 accounts created/)).toBeInTheDocument()
    expect(screen.getByText(/3 contacts créés|3 contacts created/)).toBeInTheDocument()
    expect(screen.getByText(/1 contact reconnu|1 contact recognised/)).toBeInTheDocument()
    expect(screen.getByText(/4 personnes distinctes|4 distinct people/)).toBeInTheDocument()
    expect(screen.getByText(/2 contacts à rapprocher|2 contacts to reconcile/)).toBeInTheDocument()
    expect(screen.getByText(/5 fiches interrogeables par Laura|5 records Laura can query/)).toBeInTheDocument()
    expect(screen.queryByText(/Import terminé|Import complete/)).not.toBeInTheDocument()
    // Aucune ligne « 0 » : ni doublon ni rejet n'ont eu lieu.
    expect(screen.queryByText(/écarté|set aside|doublon|duplicate/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Télécharger le rapport|Download the report/ })).toBeInTheDocument()
  })

  it('#4051 — un échec dit ce qui est DÉJÀ écrit, sans « aucun contact » ni « terminé »', async () => {
    const user = userEvent.setup()
    api.startUniversalImport.mockResolvedValue({
      ...JOB,
      status: 'failed',
      processedRows: 500,
      imported: 480,
      breakdown: { contact: { created: 480, matched: 0, duplicates: 0, rejected: 20, toReconcile: 0 } },
    })
    renderDialog()
    await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
    await launchAfterVerification(user)
    expect(await screen.findByText(/480 contacts créés|480 contacts created/)).toBeInTheDocument()
    expect(screen.queryByText(/aucun contact|no contact|terminé|complete/i)).not.toBeInTheDocument()
  })
})

describe('UniversalImportDialog — Théo B C4 : l’assistant en quatre étapes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.uploadUniversalImport.mockResolvedValue({ ...JOB, status: 'uploading' })
    api.previewUniversalImport.mockResolvedValue({
      headers: ['Nom complet'],
      mapping: { 'Nom complet': 'full_name' },
      sample: [{ 'Nom complet': 'Jeanne Exemple' }],
      fields: ['full_name', 'email'],
    })
    api.startUniversalImport.mockResolvedValue(JOB)
    api.fetchUniversalImport.mockResolvedValue(JOB)
  })

  it('page : titre, retour vers « Imports & sources », quatre étapes — la première est en cours', () => {
    const onClose = vi.fn()
    renderDialog({ layout: 'page', fixedType: 'contact', onClose })
    expect(screen.getByRole('heading', { name: 'Importer des contacts' })).toBeInTheDocument()
    const steps = screen.getByRole('list', { name: "Étapes de l'import" })
    expect(steps.querySelectorAll('li')).toHaveLength(4)
    expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent('Source')
    expect(screen.queryByRole('dialog')).toBeNull()
    return userEvent.click(screen.getByRole('button', { name: 'Imports & sources' })).then(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('page : après le dépôt, la deuxième étape (Colonnes) est en cours', async () => {
    renderDialog({ layout: 'page', fixedType: 'contact', startWithSample: true })
    await screen.findByText('Jeanne Exemple')
    expect(
      screen.getByRole('list', { name: "Étapes de l'import" }).querySelector('[aria-current="step"]'),
    ).toHaveTextContent('Colonnes')
  })

  it('dit, avant tout dépôt, que rien n’est écrit avant la validation', () => {
    renderDialog({ layout: 'page', fixedType: 'contact' })
    expect(screen.getByTestId('import-nothing-written')).toHaveTextContent(/Rien n.est écrit avant ta validation/)
  })

  it('« Coller un tableau » : le tableau collé est contrôlé comme un fichier, par le même moteur', async () => {
    renderDialog({ layout: 'page', fixedType: 'contact', initialSource: 'paste' })
    const check = screen.getByRole('button', { name: 'Contrôler le tableau' })
    expect(check).toBeDisabled()
    await userEvent.click(screen.getByRole('textbox', { name: 'Colle ton tableau ici' }))
    await userEvent.paste('Nom\tE-mail\nJeanne Exemple\tjeanne@exemple.fr')
    await userEvent.click(check)
    await waitFor(() => expect(api.uploadUniversalImport).toHaveBeenCalledTimes(1))
    const file = api.uploadUniversalImport.mock.calls[0]?.[0] as File
    expect(file.name).toBe('tableau-colle.tsv')
    expect(await file.text()).toBe('Nom\tE-mail\nJeanne Exemple\tjeanne@exemple.fr')
  })

  it('page, étape Source : les puces de source (Fichier, Coller un tableau, CRM, Avec Laura) — aucune puce morte', () => {
    renderDialog({ layout: 'page', fixedType: 'contact' })
    expect(screen.getByRole('tab', { name: 'Fichier' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Coller un tableau' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', '/integrations')
    expect(screen.getByRole('link', { name: 'Avec Laura' })).toHaveAttribute('href', '/chat')
    expect(screen.getByRole('heading', { name: 'Glisse ton fichier ici.' })).toBeInTheDocument()
  })

  it('page : un fichier GLISSÉ dans la zone est lu par le même moteur que « Choisir un fichier »', async () => {
    renderDialog({ layout: 'page', fixedType: 'contact' })
    const file = new File(['Nom\nJeanne'], 'contacts.csv', { type: 'text/csv' })
    fireEvent.drop(screen.getByTestId('import-dropzone'), { dataTransfer: { files: [file] } })
    await waitFor(() => expect(api.uploadUniversalImport).toHaveBeenCalledTimes(1))
    expect(api.uploadUniversalImport.mock.calls[0]?.[0]).toBe(file)
  })

  it('page, étape Colonnes : le fichier lu en résumé, « Aucune fiche modifiée », une ligne par colonne avec son exemple', async () => {
    renderDialog({ layout: 'page', fixedType: 'contact', startWithSample: true })
    await screen.findByText('Jeanne Exemple')
    expect(screen.getByTestId('import-mapping-summary')).toHaveTextContent('Aucune fiche modifiée')
    expect(screen.getByRole('heading', { name: 'Retrouver les bons champs' })).toBeInTheDocument()
    const rows = within(screen.getByTestId('import-mapping-rows')).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Nom complet')
  })

  it('page, étape Résultat : les nombres en grand, sans tuile « 0 », et « Ouvrir le répertoire »', async () => {
    api.startUniversalImport.mockResolvedValue({
      ...JOB,
      status: 'done',
      totalRows: 5,
      processedRows: 5,
      imported: 3,
      duplicates: 0,
      rejected: 2,
      toReconcile: 0,
    })
    renderDialog({ layout: 'page', fixedType: 'contact', startWithSample: true })
    // Théo B c4 : le lancement exige la vérification (rien ne part avant le rapport).
    await userEvent.click(
      await screen.findByRole('button', { name: /Vérifier avant d.importer|Check before importing/i }),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Lancer l.import|Start import/i }))
    const tiles = await screen.findByTestId('import-result-tiles')
    expect(tiles).toHaveTextContent('3créés')
    expect(tiles).toHaveTextContent('2non importés')
    expect(tiles).not.toHaveTextContent('à revoir')
    expect(screen.getByRole('link', { name: 'Ouvrir le répertoire' })).toHaveAttribute('href', '/contacts')
  })

  describe('#5223 — un dépôt, toutes les feuilles', () => {
    const sheets = [
      { name: 'Comptes A', rows: 2, recognised: true },
      { name: 'Comptes B', rows: 3, recognised: true },
      { name: 'Synthèse', rows: 5, recognised: false },
    ]
    const mappingA = { 'Nom complet': 'full_name' }
    const mappingB = { 'Raison sociale': 'full_name' }

    beforeEach(() => {
      api.previewUniversalImport.mockImplementation(async (_jobId: string, sheet?: string) =>
        sheet === 'Comptes B'
          ? { headers: ['Raison sociale'], mapping: mappingB, sample: [], fields: ['full_name'], sheets, sheet }
          : {
              headers: ['Nom complet'],
              mapping: mappingA,
              sample: [],
              fields: ['full_name'],
              sheets,
              sheet: 'Comptes A',
            },
      )
    })

    it('TOUTES les feuilles reconnues sont cochées ; une feuille non reconnue est nommée, décochée, avec sa raison', async () => {
      const user = userEvent.setup()
      renderDialog()
      await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
      expect(await screen.findByRole('checkbox', { name: /Comptes A/ })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /Comptes B/ })).toBeChecked()
      const unknown = screen.getByRole('checkbox', { name: /Synthèse/ })
      expect(unknown).not.toBeChecked()
      expect(screen.getByText(/non reconnues/i)).toBeInTheDocument()
    })

    it('vérifie puis lance les feuilles cochées, chacune avec SA correspondance de colonnes', async () => {
      const user = userEvent.setup()
      renderDialog()
      await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
      await screen.findByRole('checkbox', { name: /Comptes A/ })
      await launchAfterVerification(user)
      const plans = [
        { name: 'Comptes A', mapping: mappingA },
        { name: 'Comptes B', mapping: mappingB },
      ]
      expect(api.verifyUniversalImport).toHaveBeenCalledWith('job-1', mappingA, null, { sheets: plans })
      expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', mappingA, null, { sheets: plans })
    })

    it('décocher une feuille la retire du lancement ; sans aucune feuille cochée, rien ne se vérifie', async () => {
      const user = userEvent.setup()
      renderDialog()
      await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
      await user.click(await screen.findByRole('checkbox', { name: /Comptes B/ }))
      await launchAfterVerification(user)
      expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', mappingA, null, {
        sheets: [{ name: 'Comptes A', mapping: mappingA }],
      })
    })

    it('le bilan final est UN bilan ventilé par feuille, avec la raison des écartées', async () => {
      const user = userEvent.setup()
      api.startUniversalImport.mockResolvedValue({
        ...JOB,
        status: 'done',
        totalRows: 5,
        processedRows: 5,
        imported: 4,
        rejected: 1,
        sheets: [
          {
            name: 'Comptes A',
            done: true,
            totalRows: 2,
            committedRows: 2,
            created: 2,
            duplicates: 0,
            rejected: 0,
            toReconcile: 0,
            reasons: [],
          },
          {
            name: 'Comptes B',
            done: true,
            totalRows: 3,
            committedRows: 3,
            created: 2,
            duplicates: 0,
            rejected: 1,
            toReconcile: 0,
            reasons: [{ kind: 'rejected', reason: 'missing_required_field', count: 1 }],
          },
        ],
      })
      renderDialog()
      await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
      await screen.findByRole('checkbox', { name: /Comptes A/ })
      await launchAfterVerification(user)
      const report = await screen.findByTestId('import-sheets-report')
      expect(within(report).getByText(/Comptes A/)).toBeInTheDocument()
      const lineB = within(report)
        .getByText(/Comptes B/)
        .closest('li') as HTMLElement
      expect(lineB).toHaveTextContent(/3 lues/)
      expect(lineB).toHaveTextContent(/1 écartée/)
      expect(lineB).toHaveTextContent(/champ obligatoire absent/i)
      // Rien à signaler sur A : pas de « 0 écartée ».
      expect(
        within(report)
          .getByText(/Comptes A/)
          .closest('li'),
      ).not.toHaveTextContent(/0 écart/)
    })
  })

  describe('#5224 — le type proposé par feuille, visible et corrigeable', () => {
    const sheets = [
      {
        name: 'Comptes',
        rows: 2,
        recognised: true,
        detected: { type: 'account', columns: ['Raison sociale', 'SIREN'] },
      },
      { name: 'Équipe', rows: 3, recognised: false, candidates: ['contact', 'talent'] },
      { name: 'Synthèse', rows: 5, recognised: false },
    ]
    const mapping = { 'Raison sociale': 'full_name' }

    beforeEach(() => {
      api.previewUniversalImport.mockImplementation(async (_jobId: string, sheet?: string) => ({
        headers: ['Raison sociale'],
        mapping,
        sample: [],
        fields: ['full_name'],
        sheets,
        sheet: sheet ?? 'Comptes',
      }))
    })

    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      renderDialog()
      await user.click(screen.getByRole('button', { name: /Essayer avec|Try with/i }))
      await screen.findByRole('checkbox', { name: /Comptes/ })
    }

    it('nomme le type proposé ET les colonnes sur lesquelles il s’appuie, sans score', async () => {
      await open(userEvent.setup())
      const row = screen.getByTestId('sheet-type-Comptes')
      expect(row).toHaveTextContent('Comptes')
      expect(row).toHaveTextContent('Raison sociale')
      expect(row).toHaveTextContent('SIREN')
      expect(row).not.toHaveTextContent(/%|0 colonne/)
    })

    it('égalité : les deux types sont nommés, la feuille reste décochée, rien n’est tranché', async () => {
      await open(userEvent.setup())
      const row = screen.getByTestId('sheet-type-Équipe')
      expect(row).toHaveTextContent('Contacts')
      expect(row).toHaveTextContent('Consultants et candidats')
      expect(screen.getByRole('checkbox', { name: /Équipe/ })).not.toBeChecked()
    })

    it('rien de reconnu : décochée, sans type par défaut ni « 0 colonne »', async () => {
      await open(userEvent.setup())
      expect(screen.getByRole('checkbox', { name: /Synthèse/ })).not.toBeChecked()
      expect(screen.getByTestId('sheet-type-Synthèse')).not.toHaveTextContent(/0 colonne/)
      expect(screen.getByRole('combobox', { name: /Type de « Synthèse »/ })).toHaveTextContent(/Choisir/)
    })

    it('la correction humaine part dans le plan de la feuille, coche la feuille et gagne', async () => {
      const user = userEvent.setup()
      await open(user)
      await user.click(screen.getByRole('combobox', { name: /Type de « Équipe »/ }))
      await user.click(await screen.findByRole('option', { name: 'Contacts' }))
      expect(screen.getByRole('checkbox', { name: /Équipe/ })).toBeChecked()
      await launchAfterVerification(user)
      expect(api.startUniversalImport).toHaveBeenCalledWith('job-1', mapping, null, {
        sheets: [
          { name: 'Comptes', mapping },
          { name: 'Équipe', mapping, type: 'contact' },
        ],
      })
    })
  })
})
