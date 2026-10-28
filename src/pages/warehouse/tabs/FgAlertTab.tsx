import { useCallback, useEffect, useState } from 'react'
import { Button, Table, Tag, message } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { whGet } from '../warehouseApi'
import TabGuide from '../TabGuide'

type Row = { id: number; level: string; title: string; created_at?: string }

export default function FgAlertTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>('/fg/alerts')
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <TabGuide
        title="成品预警 · 操作说明"
        steps={[
          '查看列表中库存偏低的成品/毛坯（一期规则：数量少于 5 件）。',
          '对照订单交期，决定是否催生产入库或调整发货计划。',
          '点「刷新」获取最新库存预警。',
        ]}
        methods={[
          '预警来源于成品库存余额实时计算，无需手工建预警单。',
          '处理方式：完工入库补货，或与业务确认是否可延期发货。',
        ]}
        notes={[
          '一期阈值为示意值，正式安全库存阈值后续可按物料配置。',
          '预警不等于禁止发货，请结合交期与实物综合判断。',
        ]}
      />
      <div className="wh-toolbar">
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          {
            title: '级别',
            dataIndex: 'level',
            width: 100,
            render: (l: string) => <Tag color={l === 'warning' ? 'warning' : 'blue'}>{l}</Tag>,
          },
          { title: '内容', dataIndex: 'title' },
          { title: '时间', dataIndex: 'created_at', width: 160 },
        ]}
      />
    </div>
  )
}
