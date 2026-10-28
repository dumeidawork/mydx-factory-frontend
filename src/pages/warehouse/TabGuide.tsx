import { Collapse } from 'antd'

type TabGuideProps = {
  /** 折叠面板标题 */
  title?: string
  /** 操作步骤 */
  steps: string[]
  /** 操作方法 / 补充说明（可选） */
  methods?: string[]
  /** 注意事项 */
  notes?: string[]
  /** 默认是否展开 */
  defaultOpen?: boolean
}

/** 各仓库 Tab 顶部的操作说明 */
export default function TabGuide({
  title = '操作说明',
  steps,
  methods,
  notes,
  defaultOpen = true,
}: TabGuideProps) {
  return (
    <Collapse
      className="wh-tab-guide"
      defaultActiveKey={defaultOpen ? ['guide'] : []}
      items={[
        {
          key: 'guide',
          label: title,
          children: (
            <div className="wh-guide-body">
              <div className="wh-guide-block">
                <div className="wh-guide-label">操作步骤</div>
                <ol className="wh-guide-list">
                  {steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              {methods && methods.length > 0 ? (
                <div className="wh-guide-block">
                  <div className="wh-guide-label">操作方法</div>
                  <ul className="wh-guide-list">
                    {methods.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {notes && notes.length > 0 ? (
                <div className="wh-guide-block">
                  <div className="wh-guide-label">注意事项</div>
                  <ul className="wh-guide-list wh-guide-notes">
                    {notes.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ),
        },
      ]}
    />
  )
}
