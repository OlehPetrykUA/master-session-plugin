import type { Filter } from '../../types'

import { across, down, tall } from '../lib/layout'
import { chipWidthOf } from '../lib/sections'
import { chipFace, dot } from '../theme/icons'
import type { FaceLook, IconName } from '../theme/icons'
import { C } from '../theme/tokens'
import type { Tone } from '../theme/tokens'
import { Hit } from './Hit'
import { Icon } from './Icon'
import type { Ui } from './types'

export type Chip = { id: Filter; label: string; count: number; tone?: Tone; icon?: IconName }

export type FilterChipsProps = { chips: readonly Chip[]; chosen: Filter; onFilter: (id: Filter) => void }

const SELECTED: { rest: FaceLook; hover: FaceLook } = { rest: { fill: 'accentTint', stroke: 'accentBtn', ink: 'accentText' }, hover: { fill: 'accentTint2', stroke: 'accentBtn', ink: 'accentText' } }

export const markWidthOf = (chip: Chip) => (chip.tone ? 8 : chip.icon ? 14 : 0)

export function FilterChips(ui: Ui, props: FilterChipsProps) {
  const { Box, Text, Button, Svg } = ui
  return (
    <Box key="section-chips" flexDirection="row" flexWrap="wrap" columnGap={across(8)} rowGap={down(8)} paddingLeft={across(16)} paddingRight={across(16)} paddingTop={down(12)}>
      {props.chips.map(chip => {
        const isOn = props.chosen === chip.id
        const markWidth = markWidthOf(chip)
        const width = chipWidthOf({ label: chip.label, count: chip.count, hasMark: !!markWidth, markWidth })
        const press = () => props.onFilter(chip.id)
        if (isOn && ui.Client) {
          const mark = chip.tone ? { dot: chip.tone } : chip.icon ? { icon: chip.icon } : undefined
          return (
            <Box key={`chip-${chip.id}`} flexDirection="row" flexShrink={0} width={across(width)} height={tall(32)} paddingX={0} paddingY={0}>
              <Svg key={`chip-face-${chip.id}`} source={chipFace(width, 32, mark, chip.label, String(chip.count), SELECTED.rest)} alt={`${chip.label} ${chip.count}`} width={width} height={32} />
              <Box position="absolute" top={0} left={0} display="none" hover={{ display: 'flex' }}>
                <Svg key={`chip-face-hot-${chip.id}`} source={chipFace(width, 32, mark, chip.label, String(chip.count), SELECTED.hover)} alt={`${chip.label} ${chip.count}`} width={width} height={32} />
              </Box>
              {Hit(ui, { id: `chip-${chip.id}`, width, height: 32, onPress: press })}
            </Box>
          )
        }
        return (
          <Box
            key={`chip-${chip.id}`}
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
            gap={across(8)}
            width={across(width)}
            flexShrink={0}
            height={tall(32)}
            paddingX={0}
            paddingY={0}
            borderStyle="round"
            borderColor={isOn ? C.accent : C.border}
            backgroundColor={isOn ? C.accentTint : C.surface}
            hover={{ backgroundColor: isOn ? C.accentTint2 : C.hoverBg, borderColor: isOn ? C.accent : C.borderStrong }}
          >
            {chip.tone ? (
              <Svg key={`chip-dot-${chip.id}`} source={dot(chip.tone, 8)} alt={chip.label} width={8} height={8} />
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
            {Hit(ui, { id: `chip-${chip.id}`, width, height: 32, onPress: press })}
          </Box>
        )
      })}
    </Box>
  )
}
