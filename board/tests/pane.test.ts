import { test, expect } from 'claude-code/testing'
for (const surface of ['desktop', 'terminal'] as const) {
  test('board pane is accepted on ' + surface, async $ => {
    const ui = await ($.ui as any).mount({
      plugin: 'board', surface, component: 'Pane', requestId: 'board',
      props: { title: 'board', isFocused: false, bodyColumns: 51, placement: 'dock', scroll: { offset: 0, bodyRows: 51 }, view: {} },
    })
    expect(await ui.find({ type: 'Button' })).toBeDefined()
    await ui.unmount()
  })
}
