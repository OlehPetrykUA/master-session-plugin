import { TITLE } from '../lib/constants'
import { across, bodyWidthOf, down, tall } from '../lib/layout'
import { headerButtonsOf, noticeOf, paneViewOf, pinOf } from '../lib/view'
import { C } from '../theme/tokens'
import { FilterChips } from './FilterChips'
import { Header } from './Header'
import { Icon } from './Icon'
import { List } from './list/List'
import { Narrative } from './Narrative'
import { Summary } from './list/Summary'
import { RepoChips } from './RepoChips'
import type { PaneData, Ui } from './types'

export function Pane(ui: Ui, data: PaneData, view = paneViewOf(data), pin = pinOf(data, view)) {
  const { Box, Text } = ui
  const { headerRows, lift } = pin
  return (
    <Box flexDirection="column" flexShrink={0} overflow="hidden">
      <Box key="header-space" height={headerRows} />
      {view.narrative ? Narrative(ui, { narrative: view.narrative, onToggle: data.actions.narrative }) : null}
      {Summary(ui, { blocks: view.blocks, perRow: view.perRow, width: bodyWidthOf(data.columns) })}
      {FilterChips(ui, { chips: view.chips, chosen: data.chosen, onFilter: data.actions.filter })}
      {List(ui, data, view)}
      <Box key="header-pin" position="absolute" top={0} left={0} right={0} height={tall(lift) + headerRows} flexDirection="column" paddingTop={down(lift)}>
        <Box key="header-band" flexDirection="column" height={headerRows} flexShrink={0} backgroundColor={C.panel}>
          {Header(ui, {
            title: TITLE,
            isLive: !data.live.error,
            status: view.status,
            buttons: headerButtonsOf(data, data.actions.ask, data.actions.refresh),
            isNarrow: view.isNarrow,
          })}
          {RepoChips(ui, { trees: data.trees })}
          <Box key="header-rule" height={tall(1)} flexShrink={0} backgroundColor={C.border} />
          {data.live.error ? (
            <Box key="notice" flexDirection="row" alignItems="center" flexShrink={0} gap={across(8)} marginTop={down(12)} marginLeft={across(16)} marginRight={across(16)} paddingX={across(12)} paddingY={down(8)} borderStyle="round" borderColor={C.clear} backgroundColor={C.amberTint}>
              {Icon(ui, { id: 'notice-icon', name: 'offline', size: 16, tone: 'amber' })}
              <Box flexShrink={1} minWidth={0}>
                <Text size="footnote" weight="semibold" color={C.text}>
                  {noticeOf(data.live.error)}
                </Text>
              </Box>
            </Box>
          ) : null}
          <Box flexGrow={1} />
        </Box>
      </Box>
    </Box>
  )
}
