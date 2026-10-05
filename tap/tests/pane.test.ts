import { test, expect } from 'claude-code/testing'
for (const surface of ['desktop', 'terminal'] as const) {
  test('tap pane is accepted on ' + surface, async $ => {
    const ui = await ($.ui as any).mount({
      plugin: 'tap', surface, component: 'Pane', requestId: 'tap',
      props: { title: 'tap', isFocused: false, bodyColumns: 51, placement: 'dock', scroll: { offset: 0, bodyRows: 51 }, view: {} },
    })
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    await ui.unmount()
  })
}
