import { PAD_HEAD, confirmText, padLineOf, padProgram, stopGroupOf, stoppingText } from '../lib/processes'
import type { ProcRow, ProcView } from '../lib/processes'
import type { Actions, TextUi } from './types'

export type TextProcessesProps = { view: ProcView; actions: Actions }

export function TextProcesses(ui: TextUi, props: TextProcessesProps) {
  const { Box, Text, Button } = ui
  const { view, actions } = props
  const row = (one: ProcRow) => {
    const note = view.notes[one.key]
    const seconds = view.stopping[one.key]
    return (
      <Box key={`process-${one.pid}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          <Text weight="semibold">{padProgram(one.program)}</Text>
          {one.group === 'tools' ? null : (
            <Text dimColor wrap="truncate-end">
              {one.owner}
            </Text>
          )}
          <Box flexGrow={1} />
          <Text dimColor>{padLineOf(one)}</Text>
          {seconds !== undefined ? <Text dimColor>{stoppingText(seconds)}</Text> : one.canStop ? <Button key={`process-stop-${one.pid}`} plain label="Stop" onPress={() => actions.askStop(one.key)} /> : null}
        </Box>
        {note ? <Text color={/^Could not stop/.test(note) ? 'error' : undefined} dimColor={!/^Could not stop/.test(note) || undefined}>{note}</Text> : null}
        {view.asking === one.key ? (
          <Box flexDirection="column" gap="xs">
            <Text size="footnote">{confirmText(one)}</Text>
            <Box flexDirection="row" gap="sm">
              <Button key={`process-no-${one.pid}`} label="Cancel" onPress={actions.cancelStop} />
              <Button key={`process-yes-${one.pid}`} label="Stop" variant="primary" onPress={() => actions.stopProcess({ pid: one.pid, lstart: one.lstart, ucomm: one.program, group: stopGroupOf(one) })} />
            </Box>
          </Box>
        ) : null}
      </Box>
    )
  }
  return (
    <Box key="section-processes" flexDirection="column">
      <Box flexDirection="row" gap="sm">
        <Text weight="semibold">Processes</Text>
        {view.isOpen && !view.error ? <Text dimColor>{String(view.count)}</Text> : null}
        <Box flexGrow={1} />
        <Button key="processes-toggle" plain label={view.isOpen ? 'Hide' : 'Show'} onPress={actions.processes} />
      </Box>
      {view.isOpen && view.load ? <Text dimColor>{`Mac load ${view.load}`}</Text> : null}
      {view.isOpen && view.error ? <Text color="warning">{view.error}</Text> : null}
      {view.isOpen && view.isEmpty ? <Text dimColor>No processes from this run.</Text> : null}
      {view.isOpen && view.groups.some(one => one.rows.length) ? (
        <Box flexDirection="row" gap="sm">
          <Text dimColor>Program · owner</Text>
          <Box flexGrow={1} />
          <Text dimColor>{PAD_HEAD}</Text>
        </Box>
      ) : null}
      {view.isOpen
        ? view.groups.map(group => (
            <Box key={`process-group-${group.id}`} flexDirection="column">
              {group.id !== 'run' ? (
                <Box flexDirection="row" gap="sm">
                  {group.id === 'left' ? <Text color="warning">●</Text> : null}
                  <Text weight="semibold">{group.id === 'left' ? 'Left behind' : 'Chat tools'}</Text>
                  <Text dimColor>{String(group.total)}</Text>
                </Box>
              ) : null}
              {group.rows.map(row)}
              {group.more ? <Text dimColor>{`+${group.more} more`}</Text> : null}
            </Box>
          ))
        : null}
    </Box>
  )
}
