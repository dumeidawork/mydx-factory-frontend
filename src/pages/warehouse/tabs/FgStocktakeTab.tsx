import { Alert, Table, Tag } from 'antd'
import TabGuide from '../TabGuide'

/** Phase1：盘点功能骨架；下列为界面预览示例，完整流程后续开放 */
const DEMO_ROWS = [
  { id: 1, st_no: 'ST-DEMO-001', warehouse: '本厂成品', biz_date: '2026-03-01', status: '草稿' },
  { id: 2, st_no: 'ST-DEMO-002', warehouse: '库毛坯', biz_date: '2026-03-10', status: '盘点中' },
  { id: 3, st_no: 'ST-DEMO-003', warehouse: '订单备库', biz_date: '2026-02-28', status: '已确认' },
]

export default function FgStocktakeTab() {
  return (
    <div>
      <TabGuide
        title="盘点 · 操作说明"
        steps={[
          '（后续版本）新建盘点单，选择仓库类型与盘点日。',
          '（后续版本）系统生成账面数量表，现场录入实盘数。',
          '（后续版本）确认后自动计算盘盈盘亏并调整库存。',
        ]}
        methods={[
          '一期请先用「库存台账 + 出入库流水」保持日常账实一致。',
          '临时盘点可导出库存台账，线下勾对后再补录调整流水。',
        ]}
        notes={[
          '当前页为功能预留，完整盘点流程尚未开放。',
          '盘点期间建议暂停无关出入库，避免边盘边动导致差异。',
        ]}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="盘点流程将在后续版本开放（表结构已预留）"
        description="下表为界面预览示例数据，不可新建/编辑；正式盘点请待后续版本。"
      />
      <Table
        rowKey="id"
        size="middle"
        dataSource={DEMO_ROWS}
        pagination={false}
        columns={[
          { title: '盘点单号', dataIndex: 'st_no', width: 140 },
          { title: '仓库类型', dataIndex: 'warehouse', width: 120 },
          { title: '盘点日', dataIndex: 'biz_date', width: 120 },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: string) => <Tag>{s}</Tag>,
          },
        ]}
      />
    </div>
  )
}
