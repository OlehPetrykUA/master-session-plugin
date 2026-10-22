import { TITLE } from '../lib/constants'
import { across, bodyWidthOf, down, tall } from '../lib/layout'
import { paneViewOf, pinOf } from '../lib/view'
import { C } from '../theme/tokens'
import { ArchivedList } from './ArchivedList'
import { FilterChips } from './FilterChips'
import { Header } from './Header'
import { RepoChips } from './RepoChips'
import { RunSummary } from './RunSummary'
import { TileGrid } from './TileGrid'
import type { PaneData, Ui } from './types'

export function Pane(ui: Ui, data: PaneData, view = paneViewOf(data), pin = pinOf(data, view)) {
  const { Box, Text } = ui
  const isReadOnly = !!data.from
  const bodyWidth = bodyWidthOf(data.columns)
  const body =
    data.chosen === 'archived' ? (
      data.archived.length ? (
        ArchivedList(ui, { archived: data.archived, asking: data.asking, isReadOnly, at: data.at, actions: data.actions })
      ) : (
        <Text key="archived-empty" size="footnote" color={C.muted}>
          Nothing archived yet.
        </Text>
      )
    ) : view.isSummary ? (
      RunSummary(ui, { rows: data.rows, counts: data.counts, trees: data.trees, board: data.board, at: data.at, asking: data.asking, isReadOnly, actions: data.actions })
    ) : (
      TileGrid(ui, {
        shown: view.shown,
        focused: view.focused,
        isEmpty: !data.rows.length,
        trees: data.trees,
        home: data.home,
        at: data.at,
        asking: data.asking,
        isReadOnly,
        textWidth: (bodyWidth - 10) / 2 - 2 - 24,
        innerWidth: bodyWidth - 2 - 24,
        actions: data.actions,
      })
    )
  const { headerRows, lift } = pin
  return (
    <Box flexDirection="column" flexShrink={0} overflow="hidden">
      <Box key="header-space" height={headerRows} />
      {view.isSummary ? null : FilterChips(ui, { chips: view.chips, chosen: data.chosen, onFilter: data.actions.filter })}
      {data.live.error ? (
        <Box key="error" paddingX={across(16)} paddingTop={down(8)}>
          <Text color={C.amber} size="footnote">
            Can't read sessions: {data.live.error}
          </Text>
        </Box>
      ) : null}
      <Box key="body" flexDirection="column" paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)} paddingBottom={down(16)}>
        {body}
      </Box>
      <Box key="header-pin" position="absolute" top={0} left={0} right={0} height={tall(lift) + headerRows} flexDirection="column" paddingTop={down(lift)} backgroundColor={C.panel}>
        {Header(ui, {
          title: view.isSummary ? 'Run summary' : TITLE,
          isLive: !data.live.error,
          toggle: view.isAllDone ? { label: view.isSummary ? 'Board' : 'Summary', icon: view.isSummary ? 'panel' : 'list', onPress: () => data.actions.showBoard(view.isSummary) } : undefined,
          onRefresh: data.actions.refresh,
          onAsk: isReadOnly || view.isSummary ? undefined : data.actions.ask,
          columns: data.columns,
        })}
        {RepoChips(ui, { trees: data.trees, status: view.status })}
        <Box flexGrow={1} />
        <Box key="header-rule" height={tall(1)} backgroundColor={C.border} />
      </Box>
    </Box>
  )
}
