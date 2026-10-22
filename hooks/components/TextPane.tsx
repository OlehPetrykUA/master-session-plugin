import type { LiveSession } from '../../types'

import { stepOf } from '../lib/board'
import { TITLE } from '../lib/constants'
import { agoOf, shortOf } from '../lib/format'
import { dirtyOf, isRepoClean } from '../lib/git'
import { elapsedOf, headOf, lineOf, syncOf, titleOf, whereOf } from '../lib/rows'
import type { Row } from '../lib/rows'
import { paneViewOf } from '../lib/view'
import { CARD_BORDER, LABEL, TERMINAL_COLOR } from '../theme/tokens'
import { ArchiveConfirm } from './ArchiveConfirm'
import type { PaneData, TextUi } from './types'
import { UnarchiveConfirm } from './UnarchiveConfirm'

export function TextPane(ui: TextUi, data: PaneData, view = paneViewOf(data)) {
  const { Box, Text, Button } = ui
  const isReadOnly = !!data.from
  const { actions, asking, at, trees } = data

  const tile = (row: Row) => {
    const step = stepOf(row.board?.progress)
    const where = whereOf(row, trees)?.tree
    const dirty = where ? dirtyOf(where, row.board?.files ?? [], data.home) : 0
    return (
      <Box key={`tile-${row.id}`} width="50%" flexDirection="column" padding="sm" borderStyle="round" borderColor={row.state === 'needs-you' ? 'error' : CARD_BORDER}>
        <Text color={TERMINAL_COLOR[row.state]}>{[`● ${LABEL[row.state]}`, dirty ? `●${dirty}` : '', elapsedOf(row, at), step ? `${step.done}/${step.total}` : '–'].filter(Boolean).join(' ')}</Text>
        <Button key={`tile-open-${row.id}`} plain label={titleOf(row)} onPress={() => actions.toggle(row.id)} />
        <Text dimColor wrap="truncate-end">
          {lineOf(row)}
        </Text>
      </Box>
    )
  }

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

  const archivedRow = (one: LiveSession) => (
    <Box key={`archived-${one.id}`} flexDirection="column">
      <Box flexDirection="row" gap="sm">
        <Text weight="semibold" wrap="truncate-end">
          {one.name || one.title}
        </Text>
        <Text dimColor>archived · {agoOf(at - one.lastActivityAt)}</Text>
        <Box flexGrow={1} />
        {isReadOnly ? null : <Button key={`unarchive-${one.id}`} label="Unarchive" onPress={() => actions.confirm(`unarchive:${one.id}`)} />}
        <Button key={`archived-open-${one.id}`} label="Open" onPress={() => actions.open(one.id, one.name || one.title)} />
      </Box>
      {asking === `unarchive:${one.id}` ? UnarchiveConfirm(ui, { one, actions }) : null}
    </Box>
  )

  const rest = view.shown.filter(row => !view.focused.includes(row))
  const pairs: Row[][] = []
  for (let index = 0; index < rest.length; index += 2) pairs.push(rest.slice(index, index + 2))

  return (
    <Box flexDirection="column" gap="sm">
      <Box key="section-header" flexDirection="row" gap="sm">
        <Text weight="semibold">{view.isSummary ? 'Run summary' : TITLE}</Text>
        <Text color={data.live.error ? 'warning' : 'success'}>●</Text>
        <Box flexGrow={1} />
        <Text dimColor>{view.status}</Text>
        {view.isAllDone ? <Button key="view-toggle" plain label={view.isSummary ? 'Board' : 'Summary'} onPress={() => actions.showBoard(view.isSummary)} /> : null}
        {data.from || view.isSummary ? null : <Button key="ask" plain label="Ask for updates" onPress={actions.ask} />}
        <Button key="refresh" plain label="Refresh" onPress={actions.refresh} />
      </Box>
      {trees.length ? (
        <Box key="section-repos" flexDirection="row" flexWrap="wrap" gap="xs">
          <Text dimColor>Repos</Text>
          {trees.map(repo => (
            <Text key={`repo-${repo.path}`} color={isRepoClean(repo) ? 'success' : 'error'}>{`${isRepoClean(repo) ? '✓' : '●'} ${shortOf(repo.name)}`}</Text>
          ))}
        </Box>
      ) : null}
      <Box key="section-chips" flexDirection="row" flexWrap="wrap" gap="xs">
        {view.chips.map(chip => (
          <Button key={`filter-${chip.id}`} variant={data.chosen === chip.id ? 'primary' : undefined} label={`${chip.label} ${chip.count}`} onPress={() => actions.filter(chip.id)} />
        ))}
      </Box>
      {data.live.error ? <Text color="warning">Can't read sessions: {data.live.error}</Text> : null}
      {data.chosen === 'archived' ? (
        data.archived.length ? (
          <Box key="section-archived" flexDirection="column">
            {data.archived.map(archivedRow)}
          </Box>
        ) : (
          <Text dimColor>Nothing archived yet.</Text>
        )
      ) : (
        <Box key="section-tiles" flexDirection="column" gap="sm">
          {view.focused.map(detail)}
          {pairs.map((two, index) => (
            <Box key={`row-${index}`} flexDirection="row" gap="sm">
              {two.map(tile)}
            </Box>
          ))}
          {view.shown.length ? null : <Text dimColor>{data.rows.length ? 'No sessions in this filter.' : 'No worker sessions yet. Start one with /master-session and a task.'}</Text>}
        </Box>
      )}
    </Box>
  )
}
