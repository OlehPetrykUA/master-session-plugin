import type { LiveSession } from '../../types'

import { isArchivable } from '../data/contract'
import { stepOf } from '../lib/board'
import { TITLE } from '../lib/constants'
import { shortOf } from '../lib/format'
import { isRepoClean } from '../lib/git'
import { ARCHIVED_PEEK, EMPTY_TEXT, GROUP_LABEL, ageOf, rowTextOf, shownArchived } from '../lib/list'
import type { ListGroup, ListItem } from '../lib/list'
import { elapsedOf, headOf, syncOf, titleOf, whereOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { headerButtonsOf, paneViewOf } from '../lib/view'
import { CARD_BORDER, LABEL, TERMINAL_COLOR } from '../theme/tokens'
import { ArchiveConfirm } from './ArchiveConfirm'
import { badgeStateOf } from './list/Row'
import type { PaneData, TextUi } from './types'
import { UnarchiveConfirm } from './UnarchiveConfirm'

export function TextPane(ui: TextUi, data: PaneData, view = paneViewOf(data)) {
  const { Box, Text, Button } = ui
  const isReadOnly = !!data.from
  const { actions, asking, at, trees } = data

  const detail = (row: Row) => {
    const facts = row.board
    const now = row.live
    const step = stepOf(facts?.progress)
    const where = whereOf(row, trees)?.tree
    const isIdle = !!now && !now.isRunning
    const lines = [
      `${LABEL[row.state]}${step ? ` · step ${step.done} of ${step.total}${step.label ? `: ${step.label}` : ''}` : ''} · ${elapsedOf(row, at)}`,
      facts?.needsYou ? `Blocker: ${facts.needsYou}` : '',
      facts?.now ? `Now: ${facts.now}` : '',
      facts?.next ? `Next: ${facts.next}` : '',
      where ? `${where.isMain ? 'Main checkout' : 'Worktree'}: ${where.path} · ${headOf(where)}` : facts?.location ? `Location: ${facts.location}` : '',
      where ? `Git: ${where.dirty ? `${where.dirty} uncommitted` : 'clean'} · ${syncOf(where)} · last ${where.sha}` : facts?.git ? `Git: ${facts.git}` : '',
      ...(facts?.commits ?? []).slice(0, 3).map(line => `Commit ${line}`),
      facts?.tests?.length ? `Tests: ${facts.tests.join(' · ')}` : '',
      facts?.risk ? `Risk: ${facts.risk}` : '',
    ].filter(Boolean)
    return (
      <Box key={`detail-${row.id}`} flexDirection="column" padding="sm" borderStyle="round" borderColor={row.state === 'needs-you' ? 'error' : CARD_BORDER}>
        <Box flexDirection="row" gap="sm">
          <Text weight="semibold">{titleOf(row)}</Text>
          <Box flexGrow={1} />
          <Button key={`collapse-${row.id}`} plain label="Collapse" onPress={() => actions.collapse(row.id)} />
        </Box>
        {lines.map(line => (
          <Text dimColor wrap="truncate-end">
            {line}
          </Text>
        ))}
        {asking === `archive:${row.id}` ? (
          ArchiveConfirm(ui, { id: row.id, title: `Archive ${row.name}?`, targets: [row], actions })
        ) : (
          <Box key={`actions-${row.id}`} flexDirection="row" gap="sm">
            {now && facts?.needsYou ? <Button key={`chat-${row.id}`} variant="primary" label="Open chat" onPress={() => actions.open(row.id, row.name)} /> : null}
            {now ? <Button key={`open-${row.id}`} label="Open" onPress={() => actions.open(row.id, row.name)} /> : null}
            {isIdle && !isReadOnly ? <Button key={`archive-${row.id}`} label="Archive…" onPress={() => actions.confirm(`archive:${row.id}`)} /> : null}
          </Box>
        )}
      </Box>
    )
  }

  const row = (item: ListItem) => {
    if (item.kind === 'session' && data.open.includes(item.id)) return detail(item.row)
    const text = rowTextOf(item, at)
    const isNeeds = item.group === 'needs-you'
    const tail = [text.kind, text.line, isNeeds ? '' : text.elapsed, text.step && !isNeeds ? `${text.step.done}/${text.step.total}` : ''].filter(Boolean).join(' · ')
    return (
      <Box key={`row-${item.id}`} flexDirection="row" gap="sm">
        <Text color={TERMINAL_COLOR[badgeStateOf(item)]}>●</Text>
        {item.kind === 'session' ? <Button key={`row-open-${item.id}`} plain label={text.title} onPress={() => actions.toggle(item.id)} /> : <Text weight="semibold">{text.title}</Text>}
        <Text color={text.isAlert ? 'error' : undefined} dimColor={!text.isAlert || undefined} wrap="truncate-end">
          {tail}
        </Text>
        <Box flexGrow={1} />
        {isNeeds && item.kind === 'session' ? <Button key={`chat-${item.id}`} variant="primary" label="Open chat" onPress={() => actions.open(item.id, item.row.name)} /> : null}
      </Box>
    )
  }

  const archivedRow = (one: LiveSession) => (
    <Box key={`archived-${one.id}`} flexDirection="column">
      <Box flexDirection="row" gap="sm">
        <Text weight="semibold" wrap="truncate-end">
          {one.title || one.name}
        </Text>
        <Text dimColor>archived {ageOf(at - one.lastActivityAt)}</Text>
        <Box flexGrow={1} />
        {isReadOnly ? null : <Button key={`unarchive-${one.id}`} label="Unarchive" onPress={() => actions.confirm(`unarchive:${one.id}`)} />}
        <Button key={`archived-open-${one.id}`} label="Open" onPress={() => actions.open(one.id, one.name || one.title)} />
      </Box>
      {asking === `unarchive:${one.id}` ? UnarchiveConfirm(ui, { one, actions }) : null}
    </Box>
  )

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
          {one.isOpen ? shownArchived(one, data.archiveView, data.chosen).map(archivedRow) : null}
          {view.hasMore ? <Button key="archived-more" plain label={`Show ${one.archived.length - ARCHIVED_PEEK} more`} onPress={() => actions.archiveView('all')} /> : null}
        </Box>
      )
    }
    if (!one.items.length) return empty(`group-${one.id}`)
    const idle = one.items.flatMap((item): Row[] => (item.kind === 'session' && isArchivable(item.row.board ?? { state: item.row.state }, item.row.live) ? [item.row] : []))
    return (
      <Box key={`group-${one.id}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          <Text weight="semibold" color={TERMINAL_COLOR[one.id]}>{`${GROUP_LABEL[one.id]} ${one.items.length}`}</Text>
          {one.isPinned ? <Text dimColor>pinned on every filter</Text> : null}
          <Box flexGrow={1} />
          {one.id === 'done' && idle.length > 1 && asking !== 'archive:all' && !isReadOnly ? <Button key="archive-all" plain label="Archive all…" onPress={() => actions.confirm('archive:all')} /> : null}
        </Box>
        {one.id === 'done' && asking === 'archive:all' ? ArchiveConfirm(ui, { id: 'all', title: `Archive all ${idle.length} finished sessions?`, targets: idle, actions }) : null}
        {one.items.map(row)}
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
