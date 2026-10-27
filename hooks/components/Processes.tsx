import { CH, across, down, tall } from '../lib/layout'
import { NARROW, STOP_WIDE, confirmText, processLineOf, stopGroupOf, stoppingText } from '../lib/processes'
import type { ProcGroup, ProcRow, ProcView } from '../lib/processes'
import { dot } from '../theme/icons'
import { C } from '../theme/tokens'
import { ActionButton } from './ActionButton'
import { Icon } from './Icon'
import type { Actions, Ui } from './types'

export type ProcessesProps = { view: ProcView; columns: number; actions: Actions }

const CPU = 40
const MEMORY = 56
const TIME = 48

export function Processes(ui: Ui, props: ProcessesProps) {
  const { Box, Text, Svg } = ui
  const { view, actions } = props
  const width = props.columns * CH
  const isNarrow = width < NARROW
  const isWide = width >= STOP_WIDE
  const slot = isWide ? 76 : 32
  const rule = (id: string) => <Box key={`process-rule-${id}`} height={tall(1)} flexShrink={0} backgroundColor={C.border} />
  const cell = (id: string, size: number, text: string) => (
    <Box key={id} width={across(size)} flexShrink={0} flexDirection="row" justifyContent="flex-end">
      <Text size="footnote" color={C.text} tabular wrap="truncate-end">
        {text}
      </Text>
    </Box>
  )
  const stopButton = (row: ProcRow) =>
    row.canStop
      ? ActionButton(ui, {
          id: `process-stop-${row.pid}`,
          kind: 'ghost',
          icon: 'stop',
          label: isWide ? 'Stop' : `Stop ${row.program}`,
          size: 'b32',
          iconSize: 16,
          isIconOnly: !isWide,
          isPressed: view.asking === row.key,
          onPress: () => actions.askStop(row.key),
        })
      : null
  const seconds = (row: ProcRow) => view.stopping[row.key]
  const slotOf = (row: ProcRow) => {
    const isStopping = seconds(row) !== undefined
    return (
      <Box key={`process-slot-${row.pid}`} width={across(slot)} flexShrink={0} flexDirection="row" justifyContent="flex-end" alignItems="center">
        {isStopping ? (
          isWide ? (
            <Text size="footnote" color={C.muted} tabular wrap="truncate-end">
              {stoppingText(seconds(row) ?? 0)}
            </Text>
          ) : null
        ) : (
          stopButton(row)
        )}
      </Box>
    )
  }
  const name = (row: ProcRow) => (
    <Box key={`process-name-${row.pid}`} flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} gap={across(8)}>
      <Box flexShrink={1} minWidth={0}>
        <Text size="footnote" weight="semibold" mono wrap="truncate-end">
          {row.program}
        </Text>
      </Box>
      {row.group === 'tools' ? null : (
        <Box flexShrink={3} minWidth={0}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            {row.owner}
          </Text>
        </Box>
      )}
    </Box>
  )
  const lineUnder = (row: ProcRow, text: string, color: string) => (
    <Box key={`process-note-${row.pid}`} paddingLeft={across(12)} paddingRight={across(12)} paddingBottom={down(4)} minHeight={tall(24)}>
      <Text size="footnote" color={color} wrap="wrap">
        {text}
      </Text>
    </Box>
  )
  const confirm = (row: ProcRow) => (
    <Box key={`process-confirm-${row.pid}`} flexDirection="column" gap={down(8)} marginX={across(4)} marginBottom={down(4)} paddingX={across(12)} paddingTop={down(8)} paddingBottom={down(12)} borderStyle="round" borderColor={C.clear} backgroundColor={C.inset}>
      <Text size="footnote" color={C.text} wrap="wrap">
        {confirmText(row)}
      </Text>
      <Box flexDirection="row" gap={across(8)}>
        {ActionButton(ui, { id: `process-no-${row.pid}`, kind: 'secondary', icon: 'fail', label: 'Cancel', size: 'b32', iconSize: 16, onPress: actions.cancelStop })}
        {ActionButton(ui, { id: `process-yes-${row.pid}`, kind: 'primary', icon: 'stop', label: 'Stop', size: 'b32', iconSize: 16, onPress: () => actions.stopProcess({ pid: row.pid, lstart: row.lstart, ucomm: row.program, group: stopGroupOf(row) }) })}
      </Box>
    </Box>
  )
  const line = (row: ProcRow) => {
    const note = view.notes[row.key]
    const isStopping = seconds(row) !== undefined
    return (
      <Box key={`process-${row.pid}`} flexDirection="column">
        {isNarrow ? (
          <Box flexDirection="row" alignItems="center" gap={across(8)} minHeight={tall(44)} paddingLeft={across(12)} paddingRight={across(4)} paddingY={down(6)}>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
              {name(row)}
              <Text size="footnote" color={C.muted} tabular wrap="truncate-end">
                {processLineOf(row)}
              </Text>
            </Box>
            {slotOf(row)}
          </Box>
        ) : (
          <Box flexDirection="row" alignItems="center" gap={across(8)} minHeight={tall(36)} paddingLeft={across(12)} paddingRight={across(4)}>
            {name(row)}
            {cell(`process-cpu-${row.pid}`, CPU, row.cpu)}
            {cell(`process-memory-${row.pid}`, MEMORY, row.memory)}
            {cell(`process-time-${row.pid}`, TIME, row.time)}
            {slotOf(row)}
          </Box>
        )}
        {isStopping && !isWide ? lineUnder(row, stoppingText(seconds(row) ?? 0), C.muted) : null}
        {note ? lineUnder(row, note, /^Could not stop/.test(note) ? C.red : C.muted) : null}
        {view.asking === row.key ? confirm(row) : null}
      </Box>
    )
  }
  const group = (one: ProcGroup, index: number) => (
    <Box key={`process-group-${one.id}`} flexDirection="column">
      {one.id !== 'run' ? (
        <Box key={`process-${one.id}-head`} flexDirection="column">
          {index ? rule(one.id) : null}
          <Box flexDirection="row" alignItems="center" gap={across(8)} height={tall(28)} paddingX={across(12)}>
            {one.id === 'left' ? <Svg key="process-left-dot" source={dot('amber', 8)} alt="left behind" width={8} height={8} /> : null}
            <Text size="footnote" weight="semibold">
              {one.id === 'left' ? 'Left behind' : 'Chat tools'}
            </Text>
            <Text size="footnote" color={C.muted} tabular>
              {String(one.total)}
            </Text>
          </Box>
        </Box>
      ) : null}
      {one.rows.map((row, at) => (
        <Box key={`process-wrap-${row.pid}`} flexDirection="column">
          {at || one.id !== 'run' ? rule(String(row.pid)) : null}
          {line(row)}
        </Box>
      ))}
      {one.more ? (
        <Box key={`process-more-${one.id}`} flexDirection="column">
          {rule(`more-${one.id}`)}
          <Box height={tall(28)} paddingX={across(12)} justifyContent="center">
            <Text size="footnote" weight="semibold" color={C.muted}>{`+${one.more} more`}</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  )
  const body = () => {
    if (view.error) {
      return (
        <Box key="processes-error" flexDirection="row" alignItems="center" gap={across(8)} paddingX={across(12)} paddingY={down(8)} borderStyle="round" borderColor={C.clear} backgroundColor={C.amberTint}>
          {Icon(ui, { id: 'processes-error-icon', name: 'offline', size: 16, tone: 'amber' })}
          <Box flexShrink={1} minWidth={0}>
            <Text size="footnote" weight="semibold" color={C.text} wrap="wrap">
              {view.error}
            </Text>
          </Box>
        </Box>
      )
    }
    const empty = view.isEmpty ? (
      <Text key="processes-empty" size="footnote" color={C.muted}>
        No processes from this run.
      </Text>
    ) : null
    const groups = view.isEmpty ? view.groups.filter(one => one.rows.length) : view.groups
    if (!groups.length) return empty
    const list = (
      <Box key="processes-list" flexDirection="column" borderStyle="round" borderColor={C.border} backgroundColor={C.surface} overflow="hidden">
        {isNarrow ? null : (
          <Box key="processes-columns" flexDirection="column">
            <Box flexDirection="row" alignItems="center" gap={across(8)} height={tall(24)} paddingLeft={across(12)} paddingRight={across(4)}>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text size="caption" weight="semibold" color={C.muted} wrap="truncate-end">
                  Program · owner
                </Text>
              </Box>
              {(
                [
                  ['cpu', CPU, 'CPU'],
                  ['memory', MEMORY, 'Memory'],
                  ['time', TIME, 'Time'],
                ] as const
              ).map(([id, size, label]) => (
                <Box key={`process-head-${id}`} width={across(size)} flexShrink={0} flexDirection="row" justifyContent="flex-end">
                  <Text size="caption" weight="semibold" color={C.muted}>
                    {label}
                  </Text>
                </Box>
              ))}
              <Box key="process-head-slot" width={across(slot)} flexShrink={0} />
            </Box>
            {rule('columns')}
          </Box>
        )}
        {groups.map(group)}
      </Box>
    )
    return empty ? [empty, list] : list
  }
  return (
    <Box key="section-processes" flexDirection="column" gap={down(8)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)} paddingBottom={view.isOpen ? 0 : down(12)}>
      <Box key="processes-head" flexDirection="row" alignItems="center" gap={across(8)} height={tall(32)}>
        {Icon(ui, { id: 'processes-icon', name: 'usage', size: 14, tone: 'muted' })}
        <Text weight="semibold">Processes</Text>
        {view.isOpen && !view.error ? (
          <Text color={C.muted} tabular>
            {String(view.count)}
          </Text>
        ) : null}
        <Box flexGrow={1} />
        {ActionButton(ui, { id: 'processes-toggle', kind: 'ghost', icon: view.isOpen ? 'collapse' : 'expand', label: view.isOpen ? 'Hide' : 'Show', size: 'b32', iconSize: 16, onPress: actions.processes })}
      </Box>
      {view.isOpen && view.load ? (
        <Box key="processes-load" height={tall(16)} flexDirection="row" gap={across(4)}>
          <Text size="footnote" color={C.muted} wrap="truncate-end">
            <Text weight="semibold">Mac load</Text>
            {` ${view.load}`}
          </Text>
        </Box>
      ) : null}
      {view.isOpen ? body() : null}
    </Box>
  )
}
