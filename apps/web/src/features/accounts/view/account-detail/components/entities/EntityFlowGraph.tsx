import { Card, Text, cn } from '@bellum/ui'
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Building2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { normaliseTypeKey, styleForType, type GraphEntity } from './entityTypes'

type EntityNodeData = {
  name: string
  type: string
  region: string | null
}

const nodeTypes: NodeTypes = { entity: EntityNode }
const NODE_W = 240
const NODE_H = 100
const COL_GAP = 40
const ROW_GAP = 60

export function EntityFlowGraph({ entities }: { entities: GraphEntity[] }) {
  const graph = useMemo(() => buildGraph(entities), [entities])
  const [nodes, , onNodesChange] = useNodesState(graph.nodes)
  const [edges, , onEdgesChange] = useEdgesState(graph.edges)

  return (
    <div className="border-t border-[var(--bellum-border)] p-4">
      <div className="h-[480px] w-full overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-bg)]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          fitView
          proOptions={{ hideAttribution: true }}
          panOnDrag
          zoomOnPinch
          zoomOnScroll={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--bellum-border)" />
        </ReactFlow>
      </div>
    </div>
  )
}

function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const { t } = useTranslation('accountOrg')
  const style = styleForType(data.type)
  // i18n keys: entityType.groupe | filiale | bu | direction | departement | jv | gie | siege_regional |
  // operational | marque | filiale_strategique | spv | cedee | homonyme | bruit | unknown
  const typeLabel = t(`entityType.${normaliseTypeKey(data.type)}`)
  return (
    <Card className={cn('w-56 border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 py-2.5 ring-1', style.ring)}>
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-[var(--bellum-bg)] !bg-[var(--bellum-border-strong)]"
      />
      <div className="mb-1 flex items-center gap-2">
        <Building2 className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', style.badge)}>
          {typeLabel}
        </span>
      </div>
      <Text element="p" size="sm" weight="semibold" noWrap>
        {data.name}
      </Text>
      {data.region ? (
        <Text element="p" size="xs" noWrap className="text-[var(--bellum-text-muted)]">
          {data.region}
        </Text>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-[var(--bellum-bg)] !bg-[var(--bellum-border-strong)]"
      />
    </Card>
  )
}

function buildGraph(entities: GraphEntity[]): { nodes: Node[]; edges: Edge[] } {
  if (entities.length === 0) return { nodes: [], edges: [] }
  return { nodes: buildNodes(entities), edges: buildEdges(entities) }
}

function buildNodes(entities: GraphEntity[]): Node[] {
  const byLevel = groupByLevel(entities)
  return Array.from(byLevel.entries()).flatMap(([level, group]) => {
    const startX = -(group.length * NODE_W + (group.length - 1) * COL_GAP) / 2
    return group.map((entity, index) => ({
      id: entity.id,
      type: 'entity',
      position: { x: startX + index * (NODE_W + COL_GAP), y: level * (NODE_H + ROW_GAP) },
      data: { name: entity.name, type: entity.type, region: entity.region } satisfies EntityNodeData,
    }))
  })
}

function buildEdges(entities: GraphEntity[]): Edge[] {
  const byName = new Map(entities.map(entity => [entity.name.toLowerCase(), entity]))
  return entities.flatMap(entity => {
    if (!entity.parent) return []
    const parent = byName.get(entity.parent.toLowerCase())
    return parent
      ? [
          {
            id: `edge-${parent.id}-${entity.id}`,
            source: parent.id,
            target: entity.id,
            type: 'default',
            style: { stroke: 'var(--border-default)', strokeWidth: 1.25 },
          },
        ]
      : []
  })
}

function groupByLevel(entities: GraphEntity[]) {
  const byLevel = new Map<number, GraphEntity[]>()
  entities.forEach(entity => byLevel.set(entity.level, [...(byLevel.get(entity.level) ?? []), entity]))
  return byLevel
}
