import type { Repo } from '../../types'

import { shortOf } from '../lib/format'
import { isRepoClean } from '../lib/git'
import { across, down, tall } from '../lib/layout'
import { dot } from '../theme/icons'
import { C } from '../theme/tokens'
import { Icon } from './Icon'
import type { Ui } from './types'

export type RepoChipsProps = { trees: readonly Repo[] }

export function RepoChips(ui: Ui, props: RepoChipsProps) {
  const { Box, Text, Svg } = ui
  if (!props.trees.length) return null
  return (
    <Box key="section-repos" flexDirection="row" flexShrink={0} flexWrap="wrap" alignItems="center" columnGap={across(4)} rowGap={down(4)} paddingLeft={across(16)} paddingRight={across(16)} paddingBottom={down(12)}>
      <Box flexDirection="row" alignItems="center" gap={across(4)} marginRight={across(4)}>
        {Icon(ui, { id: 'repos-icon', name: 'folder', size: 12, tone: 'muted' })}
        <Text size="footnote" color={C.muted}>
          Repos
        </Text>
      </Box>
      {props.trees.map(repo => {
        const isClean = isRepoClean(repo)
        return (
          <Box key={`repo-${repo.path}`} flexDirection="row" alignItems="center" gap={across(4)} height={tall(24)} paddingX={across(8)} paddingY={0} borderStyle="round" borderColor={C.clear} backgroundColor={C.surface2}>
            {isClean ? Icon(ui, { id: `repo-mark-${repo.path}`, name: 'check', size: 12, tone: 'green', weight: 2.6, alt: 'clean' }) : <Svg key={`repo-mark-${repo.path}`} source={dot('red', 6)} alt="dirty" width={6} height={6} />}
            <Text size="footnote" mono>
              {shortOf(repo.name)}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
