import { isArchivable } from '../data/contract'
import { TITLE } from '../lib/constants'
import { shortOf } from '../lib/format'
import { isRepoClean } from '../lib/git'
import { ARCHIVED_PEEK, EMPTY_TEXT, GROUP_LABEL, archivedItemOf, displayNameOf, elapsedOfItem, lineOf, lineTextOf, nameText, openIdOf, plural, sessionOfAgent, shownArchived, stepsOfItem } from '../lib/list'
import type { Context, ListGroup, ListItem, RowItem } from '../lib/list'
import { familyOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { headerButtonsOf, paneViewOf } from '../lib/view'
import { TERMINAL_COLOR } from '../theme/tokens'
import { lossesOf } from './detail/losses'
import { TextSessionDetail, TextSubagentDetail, TextWorkflowDetail, colorOf } from './detail/TextDetail'
import type { PaneData, TextUi } from './types'
import { UnarchiveConfirm } from './UnarchiveConfirm'

export function TextPane(ui: TextUi, data: PaneData, view = paneViewOf(data)) {
  const { Box, Text, Button } = ui
  const { actions, asking, at, trees } = data
  const context: Context = { at, trees, sessions: familyOf(data.live), agents: data.agents, rows: data.rows }

  const detail = (item: ListItem) => {
    const collapse = () => actions.collapse(openIdOf(item, data.open) ?? item.id)
    if (item.kind === 'workflow') return TextWorkflowDetail(ui, { item, context, open: data.open, onToggle: actions.toggle, onCollapse: collapse })
    if (item.kind === 'subagent') return TextSubagentDetail(ui, { item, context, onCollapse: collapse })
    return TextSessionDetail(ui, { item, context, asking, actions })
  }

  const chatOf = (item: RowItem) => {
    if (item.status !== 'needs') return undefined
    if (item.kind === 'session') return item.row
    return item.kind === 'subagent' ? sessionOfAgent(item.agent, data) : undefined
  }

  const undone = data.undone
  const undoLine = () =>
    undone ? (
      <Box key="undo" flexDirection="row" gap="sm">
        <Text dimColor>{undone.name ? `${undone.name} archived, worktree removed` : `Archived ${plural(undone.ids.length, 'session')}${undone.skipped ? ` · skipped ${undone.skipped} with work to keep` : ''}`}</Text>
        {undone.ids.length ? <Button key="undo-archive" plain label="Undo" onPress={actions.undo} /> : null}
      </Box>
    ) : null

  const archiveAll = (rows: readonly Row[]) => {
    const clean = rows.filter(one => !lossesOf(one, trees, familyOf(data.live)).length)
    actions.archive(clean, { group: 'done', skipped: rows.length - clean.length })
  }

  const line = (item: RowItem) => {
    const steps = stepsOfItem(item)
    const chat = chatOf(item)
    const isNeeds = item.status === 'needs'
    const tail = [lineTextOf(lineOf(item, context)), isNeeds ? '' : elapsedOfItem(item, at), steps && !isNeeds ? `${steps.done}/${steps.total}` : ''].filter(Boolean).join(' · ')
    return (
      <Box key={`row-${item.id}`} flexDirection="row" gap="sm">
        <Text color={colorOf(item)}>●</Text>
        <Button key={`row-open-${item.id}`} plain label={nameText(displayNameOf(item))} onPress={() => actions.toggle(item.id)} />
        <Text color={isNeeds ? 'error' : undefined} dimColor={!isNeeds || undefined} wrap="truncate-end">
          {tail}
        </Text>
        <Box flexGrow={1} />
        {chat ? <Button key={`chat-${item.id}`} variant="primary" label="Open chat" onPress={() => actions.open(chat.id, chat.name)} /> : null}
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
          <Button key={`archived-open-${one.id}`} label="Open" onPress={() => actions.open(one.id, one.name || one.title)} />
        </Box>
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
    const idle = one.id === 'done' ? one.items.flatMap((item): Row[] => (item.kind === 'session' && isArchivable(item.row.board ?? { state: item.row.state }, item.row.live) ? [item.row] : [])) : []
    return (
      <Box key={`group-${one.id}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          <Text weight="semibold" color={TERMINAL_COLOR[one.id]}>{`${GROUP_LABEL[one.id]} ${one.items.length}`}</Text>
          {one.isPinned ? <Text dimColor>pinned on every filter</Text> : null}
          <Box flexGrow={1} />
          {one.id === 'done' && idle.length ? <Button key="archive-all" plain label="Archive all" onPress={() => archiveAll(idle)} /> : null}
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
      <Box key="section-summary" flexDirection="column">
        <Text>{blocks.slice(0, 4).join(' · ')}</Text>
        <Text dimColor>{blocks.slice(4).join(' · ')}</Text>
      </Box>
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
