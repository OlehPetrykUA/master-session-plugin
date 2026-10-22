import type { Repo } from '../../types'

import { shortOf } from '../lib/format'
import { isRepoClean } from '../lib/git'
import { across, down, statusWidthOf, tall } from '../lib/layout'
import { dot } from '../theme/icons'
import { C } from '../theme/tokens'
import { Icon } from './Icon'
import type { Ui } from './types'

export type RepoChipsProps = { trees: readonly Repo[]; status: string }

export function RepoChips(ui: Ui, props: RepoChipsProps) {
  const { Box, Text, Svg } = ui
  return (
    <Box key="section-repos" flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={across(5)} rowGap={down(5)} paddingLeft={across(16)} paddingRight={across(16)} paddingBottom={down(8)}>
        {props.trees.length ? (
          <Box flexDirection="row" alignItems="center" gap={across(4)} marginRight={across(2)}>
            {Icon(ui, { id: 'repos-icon', name: 'folder', size: 13, tone: 'muted' })}
            <Text size="footnote" color={C.muted}>
              Repos
            </Text>
          </Box>
        ) : null}
        {props.trees.map(repo => {
          const isClean = isRepoClean(repo)
          return (
            <Box key={`repo-${repo.path}`} flexDirection="row" alignItems="center" gap={across(5)} height={tall(26)} paddingX={across(7)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={C.surface2}>
              {isClean ? Icon(ui, { id: `repo-mark-${repo.path}`, name: 'check', size: 12, tone: 'green', weight: 2.6 }) : <Svg key={`repo-mark-${repo.path}`} source={dot('red')} alt="dirty" width={7} height={7} />}
              <Text size="footnote" mono>
                {shortOf(repo.name)}
              </Text>
            </Box>
          )
        })}
        <Box flexGrow={1} />
        <Box key="status" flexDirection="row" alignItems="center" justifyContent="flex-end" gap={across(4)} flexShrink={0} width={across(statusWidthOf(props.status))} height={tall(26)}>
          {Icon(ui, { id: 'status-clock', name: 'clock', size: 13, tone: 'muted' })}
          <Text size="footnote" color={C.muted}>
            {props.status}
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
