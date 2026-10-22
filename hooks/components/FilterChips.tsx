import type { Filter } from '../../types'

import { across, down, tall } from '../lib/layout'
import { chipWidthOf } from '../lib/sections'
import { dot } from '../theme/icons'
import type { IconName } from '../theme/icons'
import { C } from '../theme/tokens'
import type { Tone } from '../theme/tokens'
import { Hit } from './Hit'
import { Icon } from './Icon'
import type { Ui } from './types'

export type Chip = { id: Filter; label: string; count: number; tone?: Tone; icon?: IconName }

export type FilterChipsProps = { chips: readonly Chip[]; chosen: Filter; onFilter: (id: Filter) => void }

export function FilterChips(ui: Ui, props: FilterChipsProps) {
  const { Box, Text, Button, Svg } = ui
  return (
    <Box key="section-chips" flexDirection="row" flexWrap="wrap" columnGap={across(6)} rowGap={down(6)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)} paddingBottom={down(4)}>
      {props.chips.map(chip => {
        const isOn = props.chosen === chip.id
        const markWidth = chip.tone ? 7 : chip.icon ? 14 : 0
        const width = chipWidthOf({ label: chip.label, count: chip.count, hasMark: !!markWidth, markWidth })
        const press = () => props.onFilter(chip.id)
        return (
          <Box
            key={`chip-${chip.id}`}
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            gap={across(6)}
            width={across(width)}
            flexShrink={0}
            height={tall(36)}
            paddingX={0}
            paddingY={0}
            borderStyle="round"
            borderColor={isOn ? C.accent : C.border}
            backgroundColor={isOn ? C.accentTint : C.surface}
            hover={{ backgroundColor: isOn ? C.accentTint2 : C.hoverBg, borderColor: isOn ? C.accent : C.borderStrong }}
          >
            {chip.tone ? (
              <Svg key={`chip-dot-${chip.id}`} source={dot(chip.tone)} alt={chip.label} width={7} height={7} />
            ) : chip.icon ? (
              Icon(ui, { id: `chip-icon-${chip.id}`, name: chip.icon, size: 14, tone: isOn ? 'accentText' : 'text' })
            ) : null}
            {ui.Client || isOn ? (
              <Text weight={isOn ? 'semibold' : 'medium'} color={isOn ? C.accent : C.text}>
                {chip.label}
              </Text>
            ) : (
              <Button key={`filter-${chip.id}`} plain label={chip.label} onPress={press} hover={{ backgroundColor: C.clear }} />
            )}
            <Text weight={isOn ? 'semibold' : undefined} color={isOn ? C.accent : C.muted} tabular>
              {String(chip.count)}
            </Text>
            {Hit(ui, { id: `chip-${chip.id}`, width, height: 36, onPress: press })}
          </Box>
        )
      })}
    </Box>
  )
}
