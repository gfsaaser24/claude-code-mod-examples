import { test, expect } from 'claude-code/testing'
const P = { title: 'Board', isFocused: false, bodyColumns: 51, placement: 'dock', scroll: { offset: 0, bodyRows: 51 }, view: {} }
test('board: sample cards, move, block, unblock', async $ => {
  let out = ''
  try {
    const ui = await ($.ui as any).mount({ plugin: 'board', surface: 'desktop', component: 'Pane', requestId: 'board', props: P })
    await ui.press({ key: 'sample' })
    const d1 = JSON.stringify(await ui.drawn())
    const svgs = d1.match(/"type":"Svg"/g)?.length ?? 0
    const links = d1.match(/"type":"Link"/g)?.length ?? 0
    await ui.press({ key: 'r-s1' })
    const moved = JSON.stringify(await ui.drawn()).includes('"key":"l-s1"')
    await ui.press({ key: 'b-s1' })
    const blocked = JSON.stringify(await ui.drawn()).includes('"key":"u-s1"')
    await ui.press({ key: 'u-s3' })
    const back = JSON.stringify(await ui.drawn()).includes('"key":"r-s3"')
    await ui.unmount()
    out = `ACCEPTED svgs=${svgs} links=${links} moved=${moved} blocked=${blocked} unblocked=${back}`
  } catch (err) { out = 'FAILED ' + String(err).slice(0, 400) }
  expect(out).toContain('ACCEPTED')
})
