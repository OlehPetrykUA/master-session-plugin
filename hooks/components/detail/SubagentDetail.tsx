import { clockOf, nameText, parentsOf } from '../../lib/list'
import type { Context, RowItem } from '../../lib/list'
import { modelWordOf } from '../../lib/rowfit'
import { partOfOf } from '../../lib/status'
import { Card } from '../list/Card'
import type { RowProps } from '../list/Row'
import { Quiet } from '../Quiet'
import { Strong } from '../Strong'
import type { Ui } from '../types'
import { Block } from './Block'
import { durationOf, runningTimeOf } from './format'
import { Lead } from './Lead'
import { ModelValue } from './Model'
import { Pair } from './Pair'

export type SubagentDetailProps = { item: Extract<RowItem, { kind: 'subagent' | 'agent' }>; context: Context; rowProps: RowProps; home: string; innerWidth: number }

export function SubagentDetail(ui: Ui, props: SubagentDetailProps) {
  const { Text } = ui
  const { item, context } = props
  const agent = item.agent
  const id = item.id
  const at = context.at
  const end = agent.endedAt ?? at
  const model = modelWordOf(item)
  const isNeeds = item.status === 'needs'
  const isRunning = agent.state === 'running'
  const half = (key: string, icon: Parameters<typeof Block>[1]['icon'], label: string, children: Parameters<typeof Block>[1]['children'], gap?: number) => Block(ui, { id: `${key}-${id}`, icon, label, isHalf: true, children, gap })
  const time =
    isNeeds && agent.asking
      ? [Strong(ui, { text: `waiting ${runningTimeOf(item, at)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(agent.startedAt)}`, isFull: true })]
      : isRunning
        ? [Strong(ui, { text: `running ${runningTimeOf(item, at)}`, isFull: true }), Quiet(ui, { text: `started ${clockOf(agent.startedAt)}`, isFull: true })]
        : [Strong(ui, { text: `took ${durationOf(end - agent.startedAt)}`, isFull: true }), Quiet(ui, { text: `${clockOf(agent.startedAt)} – ${clockOf(end)}`, isFull: true })]
  const chain = item.kind === 'subagent' ? parentsOf(item, context).map(nameText) : []
  const [part, nth] = item.kind === 'agent' ? partOfOf(item) : ['', '']
  return Card(ui, {
    ...props.rowProps,
    children: [
      ...Lead(ui, { item, context, home: props.home }),
      Pair(ui, {
        id: `pair-model-time-${id}`,
        left: half('model', 'modelChip', 'Model', [ModelValue(ui, { id, model: item.kind === 'subagent' ? item.agent.model : agent.model, text: model || '—' }), agent.type ? Quiet(ui, { text: agent.type, isMono: true, isFull: true }) : null], 8),
        right: half('time', 'elapsed', 'Time', time),
      }),
      item.kind === 'agent'
        ? Block(ui, { id: `part-of-${id}`, icon: 'flow', label: 'Part of', children: [Strong(ui, { text: part, isFull: true }), Quiet(ui, { text: nth, isFull: true })] })
        : Block(ui, {
            id: `started-${id}`,
            icon: 'agent',
            label: 'Started by',
            children: [
              <Text key={`started-text-${id}`} wrap="wrap">
                {chain.map((name, index) => (index === chain.length - 1 ? <Text weight="semibold">{name}</Text> : `${name} › `))}
              </Text>,
              Quiet(ui, { text: [item.agent.isBackground ? 'background' : 'foreground', chain.length > 1 ? `${chain.length} deep` : ''].filter(Boolean).join(' · '), isFull: true }),
            ],
          }),
    ],
  })
}
