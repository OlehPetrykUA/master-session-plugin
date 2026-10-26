import { expect, test } from 'claude-code/testing'

import { PANE, click, started, warmUp } from '../testing/world'

warmUp()

test('a terminal render after the desktop render keeps the desktop clicks bound', async ($, on) => {
  const { calls } = await started($, on)
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await click(desktop, 'hit-ask')
  expect(calls.filter(one => one.tool === 'send_message').length).toBeGreaterThan(0)
  await terminal.unmount()
  await desktop.unmount()
})
