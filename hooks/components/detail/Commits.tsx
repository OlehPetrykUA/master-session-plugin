import { across, tall } from '../../lib/layout'
import { C } from '../../theme/tokens'
import type { Ui } from '../types'
import { Block } from './Block'

export type CommitsProps = { id: string; commits: readonly string[] }

export function Commits(ui: Ui, props: CommitsProps) {
  const { Box, Text } = ui
  const { id } = props
  return Block(ui, {
    id: `commits-${id}`,
    icon: 'git',
    label: 'Commits',
    children: props.commits.slice(0, 3).map((line, index) => (
      <Box key={`commit-${id}-${index}`} flexDirection="row" alignItems="flex-start" gap={across(8)}>
        <Box flexDirection="row" alignItems="center" height={tall(20)} flexShrink={0}>
          <Text size="footnote" mono color={C.muted}>
            {line.split(' ')[0] ?? ''}
          </Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}>
          <Text wrap="wrap">{line.split(' ').slice(1).join(' ')}</Text>
        </Box>
      </Box>
    )),
  })
}
