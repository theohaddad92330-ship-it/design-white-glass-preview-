import type { OrgGraph } from '@bellum/contracts'
import { Button, Card, SelectField, Text } from '@bellum/ui'
import { Move, PencilLine } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NamedAbsence } from '@/components/feedback/NamedAbsence'
import { OrgHierarchyTree } from './OrgHierarchyTree'
import { OrgCorrectionDrawer } from './corrections/OrgCorrectionDrawer'
import {
  PERSON_CORRECTION_FIELDS,
  currentPersonValue,
  describeCorrectionValue,
  graphNodeLabels,
  type PersonCorrectionField,
} from './corrections/orgCorrectionDraft'
import { buildFocalOrgView, defaultFocalDirectionId, type FocalPersonCard } from './focalOrgData'

/**
 * LE MODE ÉDITION — réarranger l'organigramme, et ce que ça veut dire ici.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN REFUS DATÉ, ET SON REVIREMENT DATÉ
 * ─────────────────────────────────────────────────────────────────────────
 * **Refusé le 27/08/2026** (décision 7 du paquet OrgGraph) : « le drag & drop
 * est séduisant visuellement mais trop destructeur pour une donnée sourcée ».
 * **Raison d'origine** : un déplacement à la souris ne porte ni raison ni
 * preuve, et l'API n'a aucune route qui accepterait l'un sans les deux. Le
 * refus est répété le 30/08 dans
 * `agent_docs/orggraph-contradictions-2026-08-30.md` §5 (« mode édition plein
 * écran — plus le drag & drop »).
 *
 * **Levé par Louis le 31/08/2026**, et la raison d'origine est TENUE : le
 * glisser-déposer ne devient pas une seconde façon d'écrire. Il **propose** un
 * `reportsTo`, et c'est le tiroir de correction — le seul chemin d'écriture qui
 * existe — qui réclame la raison et la preuve avant d'appeler
 * `PATCH /accounts/:id/org-graph/corrections`. Un dépôt, à lui seul, n'écrit
 * rien : il ouvre un formulaire dont le bouton reste désactivé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ LE GESTE EST OPÉRABLE AU CLAVIER, SINON IL N'EXISTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Le glisser-déposer natif (`dragstart`/`drop`) n'est atteignable qu'à la
 * souris : livré seul, il retirerait la fonctionnalité à qui n'en a pas. Chaque
 * carte porte donc DEUX boutons, tabulables et actionnables à Entrée :
 *
 *   1. **« Déplacer <nom> »** — saisit la carte (`aria-pressed`), et l'annonce
 *      dans une région live ;
 *   2. **« Rattacher <nom> ici »** — apparaît sur toutes les AUTRES cartes tant
 *      qu'une carte est saisie, et joue exactement le même code que le dépôt à
 *      la souris. Échap repose la carte.
 *
 * Les deux chemins appellent la même fonction : il n'y a pas un geste souris et
 * un geste clavier, il y a UN geste avec deux façons de le déclencher.
 *
 * ⚠️ **Aucun critère protégé ne classe qui que ce soit ici.** L'ordre des cartes
 * est celui de `focalOrgData` (niveau, puis confiance, puis nom) ; ni photo, ni
 * âge, ni genre, ni nationalité n'entrent dans cet écran.
 */
export function OrgEditView({
  accountId,
  graph,
  discovered,
  directionId,
  onDirectionChange,
}: {
  accountId: string
  graph: OrgGraph
  /** Contacts découverts sur le DOSSIER. `undefined` = on ne sait pas ; jamais 0. */
  discovered?: number
  directionId: string | null
  onDirectionChange: (id: string) => void
}) {
  const { t } = useTranslation('accountOrg')
  const view = useMemo(
    () => buildFocalOrgView(graph, directionId ?? defaultFocalDirectionId(graph), { discovered }),
    [graph, directionId, discovered],
  )
  /** La carte SAISIE — par la souris ou par le clavier, c'est le même état. */
  const [picked, setPicked] = useState<FocalPersonCard | null>(null)
  /** La personne dont le panneau droit parle. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** La correction en cours de rédaction — d'un dépôt, ou d'un champ du panneau. */
  const [editing, setEditing] = useState<{
    personId: string
    personName: string
    field: PersonCorrectionField
    proposedValue?: string
  } | null>(null)

  if (!view) return <NamedAbsence what={t('absence.view')} reason={t('absence.viewReason')} testId="org-view-absence" />

  const selected = view.contacts.find(card => card.id === selectedId) ?? null

  /**
   * LE DÉPÔT — souris et clavier passent tous deux par ici.
   *
   * Il n'écrit RIEN. Il ouvre le tiroir sur `reportsTo`, avec le responsable
   * que le geste vient de désigner. La raison et la preuve restent à écrire,
   * et sans elles le contrat refuse.
   */
  const dropOn = (manager: FocalPersonCard) => {
    if (!picked || picked.id === manager.id) return
    setEditing({ personId: picked.id, personName: picked.fullName, field: 'reportsTo', proposedValue: manager.id })
    setSelectedId(picked.id)
    setPicked(null)
  }

  return (
    <div
      className="space-y-4"
      onKeyDown={event => {
        // Échap repose la carte : un geste qu'on ne peut pas annuler au clavier
        // est un geste qu'on n'ose pas commencer.
        if (event.key === 'Escape' && picked) setPicked(null)
      }}
    >
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Text element="h3" size="base" weight="semibold">
              {t('edit.title')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('edit.subtitle')}
            </Text>
          </div>
          <label className="ml-auto min-w-0">
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('focal.directionLabel')}
            </Text>
            <SelectField
              ariaLabel={t('focal.directionAria')}
              value={view.direction.id}
              onChange={next => onDirectionChange(next)}
              options={view.directions.map(direction => ({
                value: direction.id,
                label: `${direction.name} · ${t('focal.peopleCount', { count: direction.peopleCount })}`,
              }))}
              className="mt-1 w-full min-w-[14rem]"
            />
          </label>
        </div>
        <Text size="xs" className="mt-3 text-[var(--bellum-text-secondary)]">
          {t('edit.keyboardHint')}
        </Text>
        {/* Ce que le geste fait — et surtout ce qu'il NE fait pas. */}
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('edit.nothingWrittenYet')}
        </Text>
        {/* La carte saisie s'ANNONCE : sans région live, un utilisateur de
            lecteur d'écran ne sait pas qu'il tient quelque chose. */}
        <Text role="status" aria-live="polite" size="xs" className="mt-1 text-[var(--bellum-text-accent)]">
          {picked ? t('edit.picked', { name: picked.fullName }) : ''}
        </Text>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card className="min-w-0 p-4">
          <Text element="h3" size="base" weight="semibold">
            {t('hierarchy.treeTitle', { direction: view.direction.name })}
          </Text>
          <OrgHierarchyTree
            view={view}
            ariaLabel={t('edit.treeAria')}
            cardState={person => ({
              selected: picked?.id === person.id || selectedId === person.id,
              draggable: true,
              onDragStart: () => setPicked(person),
              // Sans `preventDefault`, le navigateur refuse le dépôt : la carte
              // reviendrait à sa place sans qu'aucun code ne s'exécute.
              onDragOver: event => event.preventDefault(),
              onDrop: () => dropOn(person),
            })}
            cardFooter={person => (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="xs"
                  variant={picked?.id === person.id ? 'secondary' : 'outline'}
                  aria-pressed={picked?.id === person.id}
                  className="gap-1.5 pointer-coarse:min-h-11"
                  onClick={() => setPicked(picked?.id === person.id ? null : person)}
                >
                  <Move className="size-3" aria-hidden />
                  {picked?.id === person.id
                    ? t('edit.pickCancel', { name: person.fullName })
                    : t('edit.pick', { name: person.fullName })}
                </Button>
                {/* LE chemin clavier du dépôt. Il n'apparaît que pendant une
                    saisie : un bouton « rattacher ici » permanent proposerait un
                    geste sans sujet. */}
                {picked && picked.id !== person.id ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="black"
                    className="pointer-coarse:min-h-11"
                    onClick={() => dropOn(person)}
                  >
                    {t('edit.dropHere', { name: picked.fullName })}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="gap-1.5 pointer-coarse:min-h-11"
                  onClick={() => setSelectedId(person.id)}
                >
                  <PencilLine className="size-3" aria-hidden />
                  {t('edit.openPanel', { name: person.fullName })}
                </Button>
              </div>
            )}
          />
        </Card>

        <PersonPanel graph={graph} person={selected} onCorrect={setEditing} />
      </div>

      {/* LA porte d'écriture — une seule, pour le dépôt comme pour le panneau.
          La `key` remonte le tiroir à chaque nouvelle proposition : sans elle,
          un second dépôt rouvrirait le brouillon du premier. */}
      {editing ? (
        <OrgCorrectionDrawer
          key={`${editing.personId}-${editing.field}-${editing.proposedValue ?? ''}`}
          accountId={accountId}
          graph={graph}
          objectType="person"
          objectId={editing.personId}
          objectName={editing.personName}
          field={editing.field}
          proposedValue={editing.proposedValue}
          open
          withTrigger={false}
          onOpenChange={next => {
            if (!next) setEditing(null)
          }}
        />
      ) : null}
    </div>
  )
}

/**
 * « MODIFIER UNE PERSONNE » — le panneau droit de la maquette 03.
 *
 * ⚠️ **Ce n'est PAS un formulaire à six champs.** La maquette en dessine un, et
 * c'est exactement ce que le contrat existe pour interdire : « deux claims
 * différents = deux preuves différentes ». Un formulaire qui corrigerait le
 * poste, l'entité, le niveau et le N+1 sous une seule preuve enregistrerait
 * quatre affirmations sur la foi d'une seule.
 *
 * Le panneau montre donc ce que le graphe dit AUJOURD'HUI, champ par champ, et
 * chaque ligne a son propre geste — qui ouvre le tiroir sur CE champ, avec SA
 * preuve. Même écran, même lecture, une affirmation à la fois.
 *
 * Une valeur absente s'écrit « non renseigné », jamais « 0 » ni un tiret muet.
 */
function PersonPanel({
  graph,
  person,
  onCorrect,
}: {
  graph: OrgGraph
  person: FocalPersonCard | null
  onCorrect: (next: { personId: string; personName: string; field: PersonCorrectionField }) => void
}) {
  const { t } = useTranslation('accountOrg')
  const labels = graphNodeLabels(graph)
  if (!person) {
    return (
      <Card className="p-4">
        <Text element="h3" size="base" weight="semibold">
          {t('edit.panelTitle')}
        </Text>
        <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('edit.panelEmpty')}
        </Text>
      </Card>
    )
  }
  return (
    <Card className="min-w-0 p-4" role="group" aria-label={t('edit.panelTitle')}>
      <Text element="h3" size="base" weight="semibold">
        {t('edit.panelTitle')}
      </Text>
      <Text size="sm" weight="semibold" className="mt-2 text-[var(--bellum-text-primary)]">
        {person.fullName}
      </Text>
      {person.title ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {person.title}
        </Text>
      ) : null}

      <dl className="mt-3 space-y-3">
        {PERSON_CORRECTION_FIELDS.map(field => (
          <div key={field}>
            <dt>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`correction.fields.${field}`)}
              </Text>
            </dt>
            <dd className="mt-0.5">
              <Text size="sm" className="text-[var(--bellum-text-primary)]">
                {describeCorrectionValue(
                  currentPersonValue(graph, person.id, field),
                  labels,
                  t('correction.currentUnknown'),
                  key => t(`correction.roles.${key}`),
                )}
              </Text>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="mt-1 pointer-coarse:min-h-11"
                onClick={() => onCorrect({ personId: person.id, personName: person.fullName, field })}
              >
                {t('edit.correctField', { field: t(`correction.fields.${field}`) })}
              </Button>
            </dd>
          </div>
        ))}
      </dl>

      {/* La maquette écrit « Source de la correction : Utilisateur BellumAI ».
          On nomme la CAPACITÉ, pas un produit : c'est quelqu'un de l'espace qui
          l'affirme, et c'est ce que la preuve `workspace_user` enregistre. */}
      <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
        {t('edit.correctionSource')}
      </Text>
    </Card>
  )
}
