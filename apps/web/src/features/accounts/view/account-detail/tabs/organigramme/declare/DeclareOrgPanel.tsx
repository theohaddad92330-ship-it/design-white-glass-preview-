import type { DeclareOrgPeopleRequest, DeclareOrgPeopleResponse, OrgImportPreviewResponse } from '@bellum/contracts'
import { Badge, Box, Button, Card, Input, Text, Textarea } from '@bellum/ui'
import { FileSearch, FileUp, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { decodeFile } from '@/features/import/lib/decode-file'
import { fileToBase64 } from '@/features/consultants/lib/fileToBase64'
import { useBulkVerifyContacts } from '@/features/contacts/hooks/useBulkVerifyContacts'
import {
  useDeclareOrgPeople,
  useImportOrgChartPeople,
  usePreviewOrgPeople,
  useProposeOrgPeopleFromDocuments,
  useProposeOrgPeopleFromFile,
  useProposeOrgPeopleFromText,
} from '@/features/accounts/hooks/useDeclareOrgPeople'
import { parseOrgFile, withDocumentDate, type OrgFileReading } from './parseOrgFile'

type Row = DeclareOrgPeopleRequest['people'][number]

/** #2553 / #3740 — ce que la lecture serveur sait lire : PDF, image, PowerPoint, Excel.
 *  Le CSV / texte garde son chemin local, sans modèle. */
const SERVER_READ_EXTENSIONS = /\.(pdf|png|jpe?g|webp|pptx|xlsx)$/i

/** Un document de plus de 12 mois : sa donnée a un âge que l'écran doit dire. */
function staleYear(documentDate: string, now: Date = new Date()): string | null {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(documentDate)
  if (!parsed) return null
  const limit = new Date(now)
  limit.setFullYear(limit.getFullYear() - 1)
  const date = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3])))
  return date < limit ? (parsed[1] ?? null) : null
}

/**
 * « Ajouter ce que tu sais » — les trois portes d'entrée humaines de
 * l'organigramme (#1103).
 *
 * « Ici il faudrait pouvoir, je ne sais pas comment, soit chargé un
 * organigramme si on en a un, soit pouvoir décrire des éléments et ensuite ca
 * intègre. »
 *
 * Trois portes, UNE écriture. Le formulaire, le fichier et le texte structuré
 * par Laura aboutissent tous au même `POST /analysis/:id/org-people` : c'est ce
 * qui garantit qu'une personne ajoutée par l'une se comporte exactement comme
 * une personne ajoutée par l'autre — mêmes règles de rattachement, même preuve,
 * même survie à la réanalyse.
 *
 * Les deux portes déterministes (formulaire, fichier) n'appellent aucun modèle
 * et fonctionnent en démonstration. Celle qui structure un texte en appelle un,
 * et le dit : elle affiche ce qu'elle a RETIRÉ faute d'être nommé dans le
 * texte, plutôt que de laisser croire que le modèle n'a rien trouvé.
 */
export function DeclareOrgPanel({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const declare = useDeclareOrgPeople(accountId)
  // #2553 / #3740 — l'import d'un DOCUMENT crée aussi les contacts du compte.
  const importChart = useImportOrgChartPeople(accountId)
  const bulkVerify = useBulkVerifyContacts()
  const propose = useProposeOrgPeopleFromText(accountId)
  const preview = usePreviewOrgPeople(accountId)
  const proposeFromFile = useProposeOrgPeopleFromFile(accountId)
  const proposeFromDocuments = useProposeOrgPeopleFromDocuments(accountId)
  const fileInput = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<Row>({ fullName: '' })
  const [text, setText] = useState('')
  const [reading, setReading] = useState<OrgFileReading | null>(null)
  // #2553.3 — la date du DOCUMENT importé (pas celle du clic). « importer un
  // organigramme qui a 3 ans, [que] les users en ont conscience » : un
  // organigramme daté 2023 doit marquer ses contacts « à vérifier », jamais se
  // présenter comme un fait d'aujourd'hui. Facultative : un fichier sans date
  // connue garde l'ancien comportement (affirmé à la date de l'import).
  const [documentDate, setDocumentDate] = useState('')
  // #3740.1 — ce que Bellum sait déjà des personnes du fichier, lu AVANT validation.
  const [known, setKnown] = useState<OrgImportPreviewResponse | null>(null)
  const [fileDropped, setFileDropped] = useState<string[]>([])
  // #4072.1 — combien de documents de l'espace ont été lus, quand aucune personne n'en sort.
  const [documentsNobody, setDocumentsNobody] = useState<number | null>(null)
  // Ce que l'import a fait des contacts (créé / lié) et ce que l'utilisateur coche
  // pour l'enrichissement — décoché = ne part pas, donc ne coûte rien.
  const [imported, setImported] = useState<NonNullable<DeclareOrgPeopleResponse['contacts']>>([])
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set())
  const selectedIds = imported.filter(entry => !unchecked.has(entry.contactId)).map(entry => entry.contactId)
  const [proposed, setProposed] = useState<{ people: Row[]; dropped: string[] } | null>(null)

  const patch = (next: Partial<Row>) => setForm(current => ({ ...current, ...next }))

  const submitForm = () => {
    if (!form.fullName.trim()) return
    declare.mutate([form], { onSuccess: () => setForm({ fullName: '' }) })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (SERVER_READ_EXTENSIONS.test(file.name)) {
      const fileB64 = await fileToBase64(file)
      proposeFromFile.mutate(
        { fileB64, filename: file.name },
        {
          onSuccess: proposal => {
            setReading({ rows: proposal.people, recognised: [], ignored: [], skipped: [], truncated: false })
            setFileDropped(proposal.dropped)
            setKnown(null)
            // L'année vient du fichier quand elle est lisible ; modifiable, jamais
            // affirmée à la place de l'utilisateur.
            setDocumentDate(file.lastModified ? new Date(file.lastModified).toISOString().slice(0, 10) : '')
            if (proposal.people.length > 0) preview.mutate(proposal.people, { onSuccess: setKnown })
          },
        },
      )
      return
    }
    setFileDropped([])
    const { text: content } = await decodeFile(file)
    const next = parseOrgFile(content)
    setReading(next)
    setDocumentDate('')
    setKnown(null)
    // L'aperçu est un confort : s'il tombe, le fichier reste ajoutable tel quel
    // (le hook l'annonce), jamais un aperçu inventé.
    if (next.rows.length > 0) preview.mutate(next.rows, { onSuccess: setKnown })
  }

  // #4072.1 — mêmes aperçu et validation que le fichier : une proposition, datée
  // par document (pas de date globale à saisir), rien n'est écrit avant le clic.
  const readDocuments = () => {
    setDocumentsNobody(null)
    proposeFromDocuments.mutate(undefined, {
      onSuccess: proposal => {
        setFileDropped([])
        setKnown(null)
        setDocumentDate('')
        if (proposal.people.length === 0) {
          setReading(null)
          setDocumentsNobody(proposal.documentsRead)
          return
        }
        setReading({ rows: proposal.people, recognised: [], ignored: [], skipped: [], truncated: proposal.truncated })
        preview.mutate(proposal.people, { onSuccess: setKnown })
      },
    })
  }

  const confirmFile = () => {
    if (!reading) return
    importChart.mutate(withDocumentDate(reading.rows, documentDate), {
      onSuccess: result => {
        setReading(null)
        setKnown(null)
        setDocumentDate('')
        setImported(result.contacts ?? [])
        setUnchecked(new Set())
      },
    })
  }

  return (
    <Card className="p-5 space-y-5">
      <Box>
        <Text weight="semibold">{t('orgDeclare.title')}</Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('orgDeclare.subtitle')}
        </Text>
      </Box>

      {/* ── Porte 1 : le formulaire ─────────────────────────────────────── */}
      <Box className="space-y-2">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('orgDeclare.form.heading')}
        </Text>
        <Box className="grid gap-2 sm:grid-cols-2">
          <Input
            value={form.fullName}
            onChange={e => patch({ fullName: e.target.value })}
            placeholder={t('orgDeclare.form.name')}
            aria-label={t('orgDeclare.form.name')}
          />
          <Input
            value={form.title ?? ''}
            onChange={e => patch({ title: e.target.value || undefined })}
            placeholder={t('orgDeclare.form.title')}
            aria-label={t('orgDeclare.form.title')}
          />
          <Input
            value={form.entityName ?? ''}
            onChange={e => patch({ entityName: e.target.value || undefined })}
            placeholder={t('orgDeclare.form.entity')}
            aria-label={t('orgDeclare.form.entity')}
          />
          <Input
            value={form.managerName ?? ''}
            onChange={e => patch({ managerName: e.target.value || undefined })}
            placeholder={t('orgDeclare.form.manager')}
            aria-label={t('orgDeclare.form.manager')}
          />
        </Box>
        {/* Ce que le formulaire NE promet pas, dit avant le clic : une entité ou
            un N+1 qu'on ne retrouve pas ne sont pas inventés. */}
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('orgDeclare.form.hint')}
        </Text>
        <Button size="sm" icon={Plus} onClick={submitForm} disabled={!form.fullName.trim() || declare.isPending}>
          {t('orgDeclare.form.submit')}
        </Button>
      </Box>

      {/* ── Porte 2 : un fichier ────────────────────────────────────────── */}
      <Box className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('orgDeclare.file.heading')}
        </Text>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv,text/plain,.pdf,application/pdf,.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={e => void onFile(e.target.files?.[0])}
        />
        <Button size="sm" variant="outline" icon={FileUp} onClick={() => fileInput.current?.click()}>
          {t('orgDeclare.file.pick')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          icon={FileSearch}
          disabled={proposeFromDocuments.isPending}
          isLoading={proposeFromDocuments.isPending}
          onClick={readDocuments}
        >
          {t('orgDeclare.documents.read')}
        </Button>
        {documentsNobody !== null ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('orgDeclare.documents.nobody', { count: documentsNobody })}
          </Text>
        ) : null}
        {proposeFromFile.isPending ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('orgDeclare.file.reading')}
          </Text>
        ) : null}
        {reading ? (
          <Box className="space-y-1.5 rounded-lg border border-[var(--bellum-border)] p-3">
            {/* Deux temps, comme l'assistant d'import : on montre ce qu'on a
                COMPRIS avant que rien ne parte. */}
            <Text size="xs">{t('orgDeclare.file.read', { count: reading.rows.length })}</Text>
            {reading.ignored.length > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('orgDeclare.file.ignored', { columns: reading.ignored.join(', ') })}
              </Text>
            ) : null}
            {reading.skipped.length > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('orgDeclare.file.skipped', { count: reading.skipped.length })}
              </Text>
            ) : null}
            {reading.truncated ? (
              <Text size="xs" className="text-[var(--bellum-warning-text)]">
                {t('orgDeclare.file.truncated')}
              </Text>
            ) : null}
            {fileDropped.length > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('orgDeclare.file.droppedFromFile', { names: fileDropped.join(', ') })}
              </Text>
            ) : null}
            {known ? <OrgImportKnownList preview={known} /> : null}
            {reading.rows.length > 0 ? (
              <>
                {/* #2553.3 — un organigramme a un âge, et le dire n'est pas
                    optionnel pour les cas qui ont motivé ce champ (Kovéa,
                    Agirc-Arrco, Clésia : 2023-2025). Facultatif quand même :
                    un CSV bricolé sans date connue garde l'ancien comportement. */}
                <Box className="space-y-1">
                  <label htmlFor="org-declare-document-date" className="block text-xs text-[var(--bellum-text-muted)]">
                    {t('orgDeclare.file.documentDateLabel')}
                  </label>
                  <Input
                    id="org-declare-document-date"
                    type="date"
                    value={documentDate}
                    onChange={e => setDocumentDate(e.target.value)}
                    className="max-w-[10rem]"
                  />
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('orgDeclare.file.documentDateHint')}
                  </Text>
                  {staleYear(documentDate) ? (
                    <Box display="flex" className="flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[var(--bellum-warning-text)]">
                        {t('orgDeclare.file.staleBadge', { year: staleYear(documentDate) })}
                      </Badge>
                      <Text size="xs" className="text-[var(--bellum-text-muted)]">
                        {t('orgDeclare.file.staleHint')}
                      </Text>
                    </Box>
                  ) : null}
                </Box>
                <Button size="sm" disabled={importChart.isPending} onClick={confirmFile}>
                  {t('orgDeclare.file.confirm', { count: reading.rows.length })}
                </Button>
              </>
            ) : null}
          </Box>
        ) : null}
      </Box>

      {imported.length > 0 ? (
        <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
          <Text size="sm" weight="semibold">
            {t('orgDeclare.result.title')}
          </Text>
          <Text size="xs">
            {t('orgDeclare.result.created', { count: imported.filter(entry => entry.status === 'created').length })}
          </Text>
          {imported.some(entry => entry.status === 'linked') ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('orgDeclare.result.linked', { count: imported.filter(entry => entry.status === 'linked').length })}
            </Text>
          ) : null}
          <Box className="max-h-48 space-y-1 overflow-y-auto">
            {imported.map(entry => (
              <label key={entry.contactId} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!unchecked.has(entry.contactId)}
                  aria-label={entry.fullName}
                  onChange={() =>
                    setUnchecked(current => {
                      const next = new Set(current)
                      if (next.has(entry.contactId)) next.delete(entry.contactId)
                      else next.add(entry.contactId)
                      return next
                    })
                  }
                />
                <span>{entry.fullName}</span>
                <Badge variant={entry.status === 'created' ? 'secondary' : 'outline'}>
                  {t(`orgDeclare.result.status.${entry.status}`)}
                </Badge>
              </label>
            ))}
          </Box>
          <Button
            size="sm"
            disabled={selectedIds.length === 0 || bulkVerify.isPending}
            onClick={() => bulkVerify.mutate(selectedIds)}
          >
            {t('orgDeclare.result.enrich', { count: selectedIds.length })}
          </Button>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('orgDeclare.result.enrichHint')}
          </Text>
        </Box>
      ) : null}
      {/* ── Porte 3 : un texte, mis en lignes par Laura ─────────────────── */}
      <Box className="space-y-2 border-t border-[var(--bellum-border)] pt-4">
        <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
          {t('orgDeclare.text.heading')}
        </Text>
        <Textarea
          rows={4}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('orgDeclare.text.placeholder')}
          aria-label={t('orgDeclare.text.heading')}
        />
        <Button
          size="sm"
          variant="outline"
          icon={Sparkles}
          disabled={!text.trim() || propose.isPending}
          isLoading={propose.isPending}
          onClick={() => propose.mutate({ text }, { onSuccess: setProposed })}
        >
          {t('orgDeclare.text.structure')}
        </Button>
        {proposed ? (
          <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
            {proposed.people.length === 0 ? (
              <Text size="xs">{t('orgDeclare.text.nobody')}</Text>
            ) : (
              <>
                <Box className="space-y-1">
                  {proposed.people.map(person => (
                    <Box key={person.fullName} display="flex" className="items-center gap-2">
                      <Text size="sm">{person.fullName}</Text>
                      {person.title ? <Badge variant="outline">{person.title}</Badge> : null}
                      {person.entityName ? <Badge variant="secondary">{person.entityName}</Badge> : null}
                    </Box>
                  ))}
                </Box>
                <Button
                  size="sm"
                  disabled={declare.isPending}
                  onClick={() =>
                    declare.mutate(proposed.people, {
                      onSuccess: () => {
                        setProposed(null)
                        setText('')
                      },
                    })
                  }
                >
                  {t('orgDeclare.text.confirm', { count: proposed.people.length })}
                </Button>
              </>
            )}
            {proposed.dropped.length > 0 ? (
              /* Ce qui a été RETIRÉ est nommé : un retrait silencieux se lirait
                 « le modèle n'a rien trouvé ». */
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('orgDeclare.text.dropped', { names: proposed.dropped.join(', ') })}
              </Text>
            ) : null}
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setProposed(null)}>
              {t('orgDeclare.text.discard')}
            </Button>
          </Box>
        ) : null}
      </Box>
    </Card>
  )
}

/**
 * #3740.1 — « si des personnes correspondent, l'enrichir avec les données de
 * Bellum » : pour chaque personne du fichier, ce que Bellum en sait déjà.
 * Une seule pastille par ligne ; l'e-mail et le téléphone sont en CLAIR (c87) ;
 * une personne que Bellum ne connaît pas porte « Inconnu de Bellum », jamais un
 * champ vide qui se lirait « rien à dire ».
 */
function OrgImportKnownList({ preview }: { preview: OrgImportPreviewResponse }) {
  const { t } = useTranslation('accounts')
  const known = preview.rows.filter(row => row.match !== 'new').length
  return (
    <Box className="space-y-1.5">
      <Text size="xs" weight="semibold">
        {known > 0
          ? t('orgDeclare.file.preview.summary', { known, total: preview.rows.length })
          : t('orgDeclare.file.preview.summaryNone')}
      </Text>
      <Box className="max-h-64 space-y-1.5 overflow-y-auto">
        {preview.rows.map(row => {
          const fields = row.fills.map(field =>
            t(field === 'title' ? 'orgDeclare.file.preview.fieldTitle' : 'orgDeclare.file.preview.fieldLinkedin'),
          )
          const contactLine = [row.bellum?.email, row.bellum?.phone].filter(Boolean).join(' · ')
          return (
            <Box key={row.fullName} className="space-y-0.5">
              <Box display="flex" className="flex-wrap items-center gap-2">
                <Text size="sm">{row.fullName}</Text>
                <Badge variant={row.match === 'new' ? 'outline' : 'secondary'}>
                  {t(`orgDeclare.file.preview.${row.match}`)}
                </Badge>
              </Box>
              {contactLine ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {contactLine}
                </Text>
              ) : null}
              {fields.length > 0 ? (
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('orgDeclare.file.preview.fills', { fields: fields.join(', ') })}
                </Text>
              ) : null}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
