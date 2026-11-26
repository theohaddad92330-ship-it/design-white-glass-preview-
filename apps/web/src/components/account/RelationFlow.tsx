import type { DecisionRole } from '@bellum/contracts'
import { Button, EntityAvatar, cn } from '@bellum/ui'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Mail, Phone, User } from 'lucide-react'
import { useMemo } from 'react'
import { RoleBadge } from '@/components/contacts/RoleBadge'
import { ContactAvatar } from '@/components/ui/ContactAvatar'

export type RelationFlowPerson = {
  id: string
  name: string
  title: string | null
  entity: string | null
  role: DecisionRole | null
  /** Photo Apollo réelle (fallback initiales quand absente). */
  photoUrl?: string | null
  /** Coordonnées réelles du contact — la maquette cible les met sur CHAQUE nœud
   *  pour qu'un organigramme soit actionnable sans ouvrir les fiches une à une.
   *  Absentes = rien n'est affiché (jamais de placeholder). */
  phone?: string | null
  email?: string | null
  onOpen?: () => void
}

/**
 * Un rattachement PORTÉ PAR LA DONNÉE entre deux nœuds déjà rendus.
 *
 * C'est la seule chose qui autorise un trait. Auparavant le parent d'un nœud
 * était choisi par arithmétique d'index sur l'ordre de tri
 * (`parentLevel[Math.floor((i * parentLevel.length) / level.length)]`) : le
 * graphe affirmait « cette personne rapporte à celle-là » sans qu'aucune source
 * ne le dise, et l'affirmait en TRAIT PLEIN sur la première rangée. Un lien
 * fabriqué ne peut pas être sauvé par un pointillé : le pointillé nuance
 * l'existence du lien, pas le choix des deux extrémités, qui était le vrai
 * mensonge. On ne trace donc plus rien sans donnée.
 */
export type RelationFlowLink = {
  /** Nœud du haut (le rattachement). */
  parentId: string
  /** Nœud du bas (la personne rattachée). */
  childId: string
  /** Sourcé → trait plein. Inféré → pointillé + score (annexe p5). */
  verified: boolean
  /** Confiance 0-100 d'un lien inféré, affichée sur le trait. */
  confidence?: number | null
}

type PersonData = Omit<RelationFlowPerson, 'id'> & {
  root?: boolean
}

type RelationFlowProps = {
  root: RelationFlowPerson
  levels?: RelationFlowPerson[][]
  /** Rattachements réels. Vide/absent = graphe sans trait, par honnêteté. */
  links?: ReadonlyArray<RelationFlowLink>
  expanded?: boolean
}

function PersonNode({ data }: NodeProps<Node<PersonData>>) {
  return (
    <div
      className={cn(
        'w-64 rounded-2xl border bg-[var(--bg-surface)] ring-1 z-10 transition-colors duration-200',
        data.root
          ? 'border-[var(--bellum-primary-500)] ring-[var(--bellum-primary-500)/40]'
          : 'border-border ring-transparent',
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !bg-[var(--border-default)]" />
      <div className="flex items-center gap-3 px-2.5 pt-3">
        <ContactAvatar name={data.name} photoUrl={data.photoUrl} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{data.name}</p>
            {data.role && <RoleBadge role={data.role} />}
          </div>
          {data.title && <p className="truncate text-xs text-muted-foreground">{data.title}</p>}
          {data.entity && <p className="truncate text-xs text-muted-foreground">{data.entity}</p>}
        </div>
      </div>
      {(data.phone || data.email) && (
        <div className="mt-2 space-y-0.5 px-2.5 pb-0.5">
          {data.phone && (
            <a
              href={`tel:${data.phone}`}
              className="flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-[var(--bellum-text-primary)]"
            >
              <Phone className="size-3 shrink-0" />
              <span className="truncate">{data.phone}</span>
            </a>
          )}
          {data.email && (
            <a
              href={`mailto:${data.email}`}
              className="flex items-center gap-1.5 truncate text-xs text-muted-foreground hover:text-[var(--bellum-text-primary)]"
            >
              <Mail className="size-3 shrink-0" />
              <span className="truncate">{data.email}</span>
            </a>
          )}
        </div>
      )}
      {data.onOpen && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={data.onOpen}
          className="mt-2.5 rounded-t-none flex w-full items-center justify-center gap-1.5 border-t border-border py-2 text-[var(--bellum-text-primary)] "
        >
          <User className="size-3.5" /> Voir la fiche
        </Button>
      )}
      <Handle type="source" position={Position.Bottom} className="!size-2 !bg-[var(--border-default)]" />
    </div>
  )
}

const nodeTypes: NodeTypes = { person: PersonNode }

const NODE_W = 280
const COL_GAP = 28
const DEFAULT_ROW_GAP = 220
const EXPANDED_ROW_GAP = 250

function rowLayout(count: number, y: number): Array<{ x: number; y: number }> {
  const total = count * NODE_W + (count - 1) * COL_GAP
  const startX = -total / 2
  return Array.from({ length: count }, (_, i) => ({ x: startX + i * (NODE_W + COL_GAP), y }))
}

export function RelationFlow({ root, levels, links, expanded = false }: RelationFlowProps) {
  const rows = useMemo(() => (levels ?? []).filter(level => level.length > 0), [levels])
  const rowGap = expanded ? EXPANDED_ROW_GAP : DEFAULT_ROW_GAP

  const nodes = useMemo(() => {
    const nodeList: Node[] = [
      {
        id: root.id,
        type: 'person',
        position: { x: -NODE_W / 2, y: 0 },
        data: { ...personData(root), root: true } satisfies PersonData,
      },
    ]

    rows.forEach((level, levelIndex) => {
      rowLayout(level.length, rowGap * (levelIndex + 1)).forEach((pos, i) => {
        const relation = level[i]!
        nodeList.push({ id: relation.id, type: 'person', position: pos, data: personData(relation) })
      })
    })

    return nodeList
  }, [root, rows, rowGap])

  // Un trait par rattachement RÉEL, et rien d'autre. Les deux extrémités doivent
  // exister à l'écran, sinon le lien pointerait dans le vide. Les rangées, elles,
  // ne sont qu'un regroupement de lecture : elles ne produisent aucun trait.
  const edges = useMemo(() => {
    const rendered = new Set(nodes.map(node => node.id))
    const seen = new Set<string>()
    const edgeList: Edge[] = []

    for (const link of links ?? []) {
      const key = `${link.parentId}->${link.childId}`
      if (seen.has(key)) continue
      if (link.parentId === link.childId) continue
      if (!rendered.has(link.parentId) || !rendered.has(link.childId)) continue
      seen.add(key)
      edgeList.push({
        id: `e-${key}`,
        source: link.parentId,
        target: link.childId,
        type: 'step',
        // Plein = sourcé ; pointillé + score = inféré (annexe p5). Le style encode
        // la FIABILITÉ du lien, jamais sa profondeur dans le dessin.
        //
        // La couleur est celle d'un TEXTE discret, pas celle d'une bordure :
        // `--border-default` (#dddcd6 en clair) est calibré pour séparer deux
        // blocs adjacents, et un trait de 1,5 px de cette couleur sur fond blanc
        // tourne à ~1,6:1 — invisible en mode clair, donc un lecteur y lit
        // « aucun lien connu » alors que le lien EST dans la donnée. Le pointillé
        // reste plus léger que le plein, mais par la trame, pas par l'effacement.
        style: link.verified
          ? { stroke: 'var(--bellum-text-muted)', strokeWidth: 1.75 }
          : {
              stroke: 'color-mix(in srgb, var(--bellum-text-muted) 75%, transparent)',
              strokeWidth: 1.5,
              strokeDasharray: '5 5',
            },
        label: !link.verified && typeof link.confidence === 'number' ? `${Math.round(link.confidence)} %` : undefined,
        labelBgPadding: [4, 2],
        labelStyle: { fill: 'var(--text-secondary)', fontSize: '0.75rem' },
        labelBgStyle: { fill: 'var(--bg-elevated)' },
      })
    }

    return edgeList
  }, [links, nodes])

  return (
    // `min-h` et pas seulement `h-full` : React Flow dessine dans un conteneur
    // MESURÉ, donc une hauteur nulle rend un graphe invisible — pas une erreur,
    // juste une carte vide. C'est ce qui arrivait sur l'onglet « Relations »
    // d'une fiche contact, dont le parent ne fixe aucune hauteur : les liens
    // existaient en base et l'écran affichait un rectangle vide. Le plancher est
    // ici pour qu'AUCUN appelant ne puisse reproduire ça ; ceux qui fixent une
    // hauteur (organigramme du compte) restent maîtres de la leur, plus grande.
    <div className="h-full min-h-[26rem] w-full overflow-hidden">
      <ReactFlow
        key={expanded ? 'expanded' : 'default'}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        panOnDrag
        zoomOnScroll={false}
        nodesDraggable={false}
        nodesConnectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--border-subtle)" />
        <Controls
          showInteractive={false}
          className="!bg-[var(--bg-elevated)] !border !border-[var(--border-subtle)] !rounded-lg overflow-hidden [&>button]:!bg-transparent [&>button]:!border-[var(--border-subtle)] [&>button]:!text-[var(--text-secondary)] [&>button:hover]:!bg-[var(--bg-surface-hover)]"
        />
      </ReactFlow>
    </div>
  )
}

function personData(person: RelationFlowPerson): PersonData {
  return {
    name: person.name,
    title: person.title,
    entity: person.entity,
    role: person.role,
    photoUrl: person.photoUrl,
    phone: person.phone,
    email: person.email,
    onOpen: person.onOpen,
  }
}
