import { oneLine } from '../../lib/list'
import { isCommandText } from '../../lib/status'

export function plainOf(text: string | undefined) {
  const flat = oneLine(text ?? '')
  return flat && !isCommandText(flat) ? flat : ''
}
