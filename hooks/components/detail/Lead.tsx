import type { Context, RowItem } from '../../lib/list'
import { nameIdentOf, statusSentenceOf, taskOf } from '../../lib/status'
import { KIND_ICON } from '../list/Row'
import type { Ui } from '../types'
import { NameBlock } from './NameBlock'
import { StatusBlock } from './StatusBlock'
import { TaskBlock } from './TaskBlock'

export type LeadProps = { item: RowItem; context: Context; home: string }

export const Lead = (ui: Ui, props: LeadProps) => [
  NameBlock(ui, { id: props.item.id, icon: KIND_ICON[props.item.kind], name: nameIdentOf(props.item, props.context) }),
  TaskBlock(ui, { id: props.item.id, task: taskOf(props.item, props.context) }),
  StatusBlock(ui, { id: props.item.id, status: props.item.status, sentence: statusSentenceOf(props.item, props.context, props.home) }),
]
