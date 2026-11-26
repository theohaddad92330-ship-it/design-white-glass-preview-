'use client'

import { Card, Text, cn } from '@bellum/ui'
import {
  Background,
  BackgroundVariant,
  Controls,
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
import { useTranslations } from 'next-intl'
import { Kicker } from '@/features/landing/Kicker'

/** Two-letter initials from a display name — avoids shipping avatar image assets. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

type Role = 'sponsor' | 'influ' | 'ope'

/** Color classes only — human-readable label + desc live in the `product` messages. */
const ROLE: Record<Role, { badge: string; dot: string }> = {
  sponsor: {
    badge: 'text-violet-300 bg-violet-500/[0.16] border-violet-500/30',
    dot: '#9b85ff',
  },
  influ: {
    badge: 'text-[#4d9dff] bg-[#4d9dff]/[0.14] border-[#4d9dff]/30',
    dot: '#4d9dff',
  },
  ope: {
    badge: 'text-[#36e6a0] bg-[#36e6a0]/[0.13] border-[#36e6a0]/30',
    dot: '#36e6a0',
  },
}

type ContactData = {
  ring: string
  name: string
  /** Key into the `nodes` messages record (root/c0/c1/c2). */
  roleKey: string
  kind: Role
  lead?: boolean
}

const HANDLE = 'opacity-0 !size-1.5 !border-0 !bg-transparent'

function ContactNode({ data }: NodeProps<Node<ContactData>>) {
  const t = useTranslations('product')
  const r = ROLE[data.kind]
  return (
    <div
      className={cn(
        'flex w-[230px] items-center gap-2.5 rounded-[13px] border bg-[rgba(16,16,28,0.9)] p-3 backdrop-blur',
        data.lead ? 'animate-glow border-violet-500/45' : 'border-white/[0.14]',
      )}
    >
      <Handle type="target" position={Position.Top} className={HANDLE} />
      <span
        className={cn(
          'flex size-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white',
          data.ring,
        )}
        aria-hidden
      >
        {initials(data.name)}
      </span>
      <div className="min-w-0 flex-1">
        <Text element="div" size="sm" weight="medium" color="text-white" className="truncate">
          {data.name}
        </Text>
        <Text element="div" size="xs" className="truncate text-[#8a8aa0]">
          {t(`nodes.${data.roleKey}`)}
        </Text>
      </div>
      <span className={cn('shrink-0 rounded-md border px-2 py-[3px] text-xs font-medium', r.badge)}>
        {t(`roles.${data.kind}.label`)}
      </span>
      <Handle type="source" position={Position.Bottom} className={HANDLE} />
    </div>
  )
}

const nodeTypes: NodeTypes = { contact: ContactNode }

const INITIAL_NODES: Node<ContactData>[] = [
  {
    id: 'root',
    type: 'contact',
    position: { x: 250, y: 0 },
    data: {
      ring: 'from-[#7b61ff] to-[#5b3fe0]',
      name: 'Julien Nicolas',
      roleKey: 'root',
      kind: 'sponsor',
      lead: true,
    },
  },
  {
    id: 'c0',
    type: 'contact',
    position: { x: 0, y: 170 },
    data: {
      ring: 'from-[#4d9dff] to-[#2b6fd4]',
      name: 'Claire Dubois',
      roleKey: 'c0',
      kind: 'influ',
    },
  },
  {
    id: 'c1',
    type: 'contact',
    position: { x: 250, y: 170 },
    data: {
      ring: 'from-[#4d9dff] to-[#2b6fd4]',
      name: 'Thomas Renaud',
      roleKey: 'c1',
      kind: 'influ',
    },
  },
  {
    id: 'c2',
    type: 'contact',
    position: { x: 500, y: 170 },
    data: {
      ring: 'from-[#36e6a0] to-[#1f9e6e]',
      name: 'Élodie Martin',
      roleKey: 'c2',
      kind: 'ope',
    },
  },
]

const INITIAL_EDGES: Edge[] = ['c0', 'c1', 'c2'].map(target => ({
  id: `e-root-${target}`,
  source: 'root',
  target,
  type: 'smoothstep',
  style: { stroke: 'rgba(155,133,255,0.5)', strokeWidth: 1.4 },
}))

function OrgFlow() {
  const [nodes, , onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, , onEdgesChange] = useEdgesState(INITIAL_EDGES)

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.4}
      maxZoom={1.4}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      className="[&_.react-flow__edge-path]:!stroke-[length:1.4]"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.08)" />
      <Controls
        showInteractive={false}
        className="!rounded-lg !border !border-white/10 !bg-[rgba(16,16,28,0.8)] [&>button]:!border-white/10 [&>button]:!bg-transparent [&>button]:!fill-zinc-400 [&>button:hover]:!bg-white/10"
      />
    </ReactFlow>
  )
}

export function ProductOrgChart() {
  const t = useTranslations('product')
  return (
    <section className="py-14">
      <div className="mx-auto max-w-[1100px] px-6">
        <div className="mx-auto max-w-2xl text-center">
          <Kicker center>{t('orgChart.kicker')}</Kicker>
          <Text
            element="h2"
            weight="medium"
            color="text-white"
            className="mt-4 text-[clamp(26px,3.2vw,38px)] leading-tight"
          >
            {t('orgChart.title')}
          </Text>
          <Text element="p" size="lg" color="text-zinc-400" className="mx-auto mt-4 max-w-xl leading-relaxed">
            {t('orgChart.desc')}
          </Text>
        </div>

        <Card className="mt-11 overflow-hidden rounded-2xl border-white/[0.12] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] backdrop-blur-[16px]">
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <span className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/[0.14]" />
              <span className="size-2.5 rounded-full bg-white/[0.14]" />
              <span className="size-2.5 rounded-full bg-white/[0.14]" />
            </span>
            <Text element="span" size="sm" weight="medium" color="text-zinc-200">
              {t('orgChart.cardTitle')}
            </Text>
            <span className="ml-auto rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300">
              {t('orgChart.cardBadge')}
            </span>
          </div>

          <div className="h-[420px] w-full bg-[radial-gradient(680px_380px_at_50%_-10%,rgba(123,97,255,0.12),transparent_70%)]">
            <OrgFlow />
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 border-t border-white/[0.08] px-7 py-6">
            {(Object.keys(ROLE) as Role[]).map(k => (
              <div key={k} className="flex max-w-[300px] items-start gap-3">
                <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ background: ROLE[k].dot }} />
                <div>
                  <Text element="div" size="sm" weight="medium" color="text-white">
                    {t(`roles.${k}.label`)}
                  </Text>
                  <Text element="div" size="xs" className="mt-0.5 leading-relaxed text-[#8a8aa0]">
                    {t(`roles.${k}.desc`)}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  )
}
