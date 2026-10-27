import { TITLE } from '../lib/constants'
import { shortOf } from '../lib/format'
import { isRepoClean } from '../lib/git'
import { ARCHIVED_PEEK, EMPTY_TEXT, GROUP_LABEL, CHAT_LABEL, archivedItemOf, chatTargetOf, displayNameOf, elapsedOfItem, isStartedBy, lineOf, lineTextOf, nameText, openIdOf, shownArchived, stepsOfItem, undoTextOf } from '../lib/list'
import type { ListGroup, ListItem, RowItem } from '../lib/list'
import { modelWordOf } from '../lib/rowfit'
import { headerButtonsOf, paneViewOf } from '../lib/view'
import { TERMINAL_COLOR } from '../theme/tokens'
import { clearOf } from './clear'
import { TextProcesses } from './TextProcesses'
import { TextSessionDetail, TextSubagentDetail, TextWorkflowDetail, colorOf } from './detail/TextDetail'
import type { PaneData, TextUi } from './types'
import { UnarchiveConfirm } from './UnarchiveConfirm'

export function TextPane(ui: TextUi, data: PaneData, view = paneViewOf(data)) {
  const { Box, Text, Button } = ui
  const { actions, asking, at, trees } = data
  const { context } = view

  const detail = (item: ListItem) => {
    const collapse = () => actions.collapse(openIdOf(item, data.open) ?? item.id)
    if (item.kind === 'workflow') return TextWorkflowDetail(ui, { item, context, open: data.open, onToggle: actions.toggle, onCollapse: collapse })
    if (item.kind === 'subagent') return TextSubagentDetail(ui, { item, context, onCollapse: collapse })
    return TextSessionDetail(ui, { item, context, asking, actions })
  }

  const undone = data.undone
  const undoLine = () =>
    undone ? (
      <Box key="undo" flexDirection="row" gap="sm">
        <Text dimColor>{undone.name ? `${undone.name} archived` : undoTextOf(undone)}</Text>
        {undone.ids.length || undone.hid ? <Button key="undo-archive" plain label="Undo" onPress={actions.undo} /> : null}
      </Box>
    ) : null

  const line = (item: RowItem) => {
    const steps = stepsOfItem(item)
    const chat = chatTargetOf(item)
    const isNeeds = item.status === 'needs'
    const tail = [lineTextOf(lineOf(item, context)), modelWordOf(item), isNeeds ? '' : elapsedOfItem(item, at), steps && !isNeeds ? `${steps.done}/${steps.total}` : ''].filter(Boolean).join(' · ')
    return (
      <Box key={`row-${item.id}`} flexDirection="row" gap="sm">
        <Text color={colorOf(item)}>●</Text>
        <Button key={`row-open-${item.id}`} plain label={nameText(displayNameOf(item))} onPress={() => actions.toggle(item.id)} />
        <Text color={isNeeds ? 'error' : undefined} dimColor={!isNeeds || undefined} wrap="truncate-end">
          {tail}
        </Text>
        <Box flexGrow={1} />
        {chat ? <Button key={`chat-${item.id}`} variant="primary" label={CHAT_LABEL} onPress={() => actions.open(chat.id, chat.name)} /> : null}
      </Box>
    )
  }

  const row = (item: ListItem) => (openIdOf(item, data.open) ? detail(item) : line(item))

  const archivedRow = (item: Extract<RowItem, { kind: 'archived' }>) => {
    const { one } = item
    return (
      <Box key={`archived-${one.id}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          {line(item)}
          <Button key={`unarchive-${one.id}`} label="Unarchive" onPress={() => actions.confirm(`unarchive:${one.id}`)} />
          {isStartedBy(one, context.self) ? <Button key={`archived-open-${one.id}`} label="Open" onPress={() => actions.open(one.id, one.name || one.title)} /> : null}
        </Box>
        {data.open.includes(one.id) ? <Text dimColor>{[one.title, one.cwd].filter(Boolean).join(' · ')}</Text> : null}
        {asking === `unarchive:${one.id}` ? UnarchiveConfirm(ui, { item, actions }) : null}
      </Box>
    )
  }

  const empty = (id: string) => (
    <Box key={`empty-${id}`} flexDirection="column">
      <Text weight="semibold">{EMPTY_TEXT[data.chosen].title}</Text>
      <Text dimColor>{EMPTY_TEXT[data.chosen].body}</Text>
      {data.chosen === 'all' ? null : <Button key={`show-all-${id}`} plain label="Show all" onPress={() => actions.filter('all')} />}
    </Box>
  )

  const group = (one: ListGroup) => {
    if (one.id === 'archived') {
      if (data.chosen === 'archived' && !one.archived.length) return empty('archived')
      return (
        <Box key="group-archived" flexDirection="column">
          <Box flexDirection="row" gap="sm">
            <Text weight="semibold">{`${GROUP_LABEL.archived} ${one.archived.length}`}</Text>
            <Box flexGrow={1} />
            {data.chosen === 'all' ? <Button key="archived-toggle" plain label={one.isOpen ? 'Hide' : 'Show'} onPress={() => actions.archiveView(one.isOpen ? 'closed' : 'open')} /> : null}
          </Box>
          {one.isOpen ? shownArchived(one, data.archiveView, data.chosen).map(entry => archivedRow(archivedItemOf(entry, data.board))) : null}
          {view.hasMore ? <Button key="archived-more" plain label={`Show ${one.archived.length - ARCHIVED_PEEK} more`} onPress={() => actions.archiveView('all')} /> : null}
        </Box>
      )
    }
    if (!one.items.length && undone?.group !== one.id) return empty(`group-${one.id}`)
    const clear = clearOf(one, trees, context)
    return (
      <Box key={`group-${one.id}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          <Text weight="semibold" color={TERMINAL_COLOR[one.id]}>{`${GROUP_LABEL[one.id]} ${one.items.length}`}</Text>
          {one.isPinned ? <Text dimColor>pinned on every filter</Text> : null}
          <Box flexGrow={1} />
          {clear ? <Button key="clear-done" plain label="Clear done" onPress={() => actions.clear(clear.rows, clear.skipped)} /> : null}
        </Box>
        {undone?.group === one.id ? [...one.items.slice(0, undone.index).map(row), undoLine(), ...one.items.slice(undone.index).map(row)] : one.items.map(row)}
      </Box>
    )
  }

  const blocks = view.blocks.map(block => `${block.label} ${block.value}${block.dots ? ` (${block.dots.map(mark => mark.count).join(' / ')})` : block.sub && block.sub !== '—' ? ` ${block.sub}` : ''}`)

  return (
    <Box flexDirection="column" gap="sm">
      <Box key="section-header" flexDirection="row" gap="sm">
        <Text weight="semibold">{TITLE}</Text>
        <Text color={data.live.error ? 'warning' : 'success'}>●</Text>
        <Text color={view.status.tone === 'amber' ? 'warning' : undefined} dimColor={view.status.tone !== 'amber' || undefined}>
          {view.status.text}
        </Text>
        <Box flexGrow={1} />
        {headerButtonsOf(data, actions.ask, actions.refresh).map(button => (
          <Button key={button.id} plain dimColor={button.isQuiet || undefined} label={button.label} onPress={button.onPress} />
        ))}
      </Box>
      {trees.length ? (
        <Box key="section-repos" flexDirection="row" flexWrap="wrap" gap="xs">
          <Text dimColor>Repos</Text>
          {trees.map(repo => (
            <Text key={`repo-${repo.path}`} color={isRepoClean(repo) ? 'success' : 'error'}>{`${isRepoClean(repo) ? '✓' : '●'} ${shortOf(repo.name)}`}</Text>
          ))}
        </Box>
      ) : null}
      {data.live.error ? <Text color="warning">{`Can’t read sessions: ${data.live.error}`}</Text> : null}
      {view.narrative ? (
        <Box key="section-narrative" flexDirection="column">
          <Text key="narrative-text" wrap="wrap" dimColor={view.narrative.isStale || undefined}>
            {view.narrative.text}
          </Text>
          <Text key="narrative-age" dimColor>
            {view.narrative.age}
          </Text>
        </Box>
      ) : null}
      <Box key="section-summary" flexDirection="column">
        <Text>{blocks.slice(0, 4).join(' · ')}</Text>
        <Text dimColor>{blocks.slice(4).join(' · ')}</Text>
      </Box>
      {view.processes ? TextProcesses(ui, { view: view.processes, actions }) : null}
      <Box key="section-chips" flexDirection="row" flexWrap="wrap" gap="xs">
        {view.chips.map(chip => (
          <Button key={`filter-${chip.id}`} variant={data.chosen === chip.id ? 'primary' : undefined} label={`${chip.label} ${chip.count}`} onPress={() => actions.filter(chip.id)} />
        ))}
      </Box>
      <Box key="section-list" flexDirection="column" gap="sm">
        {data.chosen === 'all' && !view.items.length ? empty('all') : null}
        {view.groups.map(group)}
      </Box>
    </Box>
  )
}
