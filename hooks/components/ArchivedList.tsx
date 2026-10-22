import type { LiveSession } from '../../types'

import { agoOf } from '../lib/format'
import { across, down } from '../lib/layout'
import { ActionButton } from './ActionButton'
import { Card } from './Card'
import { Icon } from './Icon'
import { ListRow } from './ListRow'
import { Quiet } from './Quiet'
import type { Actions, Ui } from './types'
import { UnarchiveConfirm } from './UnarchiveConfirm'

export type ArchivedListProps = { archived: readonly LiveSession[]; asking: string; isReadOnly: boolean; at: number; actions: Actions }

export function ArchivedList(ui: Ui, props: ArchivedListProps) {
  const { Box } = ui
  const { archived, asking, actions } = props
  const asked = archived.find(one => asking === `unarchive:${one.id}`)
  return (
    <Box key="section-archived" flexDirection="column" gap={down(8)}>
      {Card(ui, {
        id: 'archived-list',
        children: archived.map((one, index) =>
          ListRow(ui, {
            id: `archived-${one.id}`,
            mark: null,
            name: one.title || one.name,
            meta: (
              <Box flexDirection="row" alignItems="center" gap={across(5)} minWidth={0}>
                {Icon(ui, { id: `archived-check-${one.id}`, name: 'check', size: 12, tone: 'grey', weight: 2.6 })}
                {Quiet(ui, { text: `archived · ${agoOf(props.at - one.lastActivityAt)}` })}
              </Box>
            ),
            actions: [
              props.isReadOnly || asked === one ? null : ActionButton(ui, { id: `unarchive-${one.id}`, kind: 'ghost', icon: 'unarchive', label: 'Unarchive', onPress: () => actions.confirm(`unarchive:${one.id}`), size: 'mx' }),
              asked === one ? null : ActionButton(ui, { id: `archived-open-${one.id}`, kind: 'soft', icon: 'open', label: 'Open', onPress: () => actions.open(one.id, one.name || one.title), size: 'ms' }),
            ],
            isFirst: index === 0,
          }),
        ),
      })}
      {asked ? UnarchiveConfirm(ui, { one: asked, actions }) : null}
    </Box>
  )
}
