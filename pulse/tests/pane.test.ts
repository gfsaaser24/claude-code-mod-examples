import { test, expect } from 'claude-code/testing'
for (const surface of ['desktop', 'terminal'] as const) {
  test('pulse pane is accepted on ' + surface, async $ => {
    const ui = await ($.ui as any).mount({
      plugin: 'pulse', surface, component: 'Pane', requestId: 'pulse',
      props: { title: 'pulse', isFocused: false, bodyColumns: 51, placement: 'dock', scroll: { offset: 0, bodyRows: 51 }, view: {} },
    })
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    await ui.unmount()
  })
}
