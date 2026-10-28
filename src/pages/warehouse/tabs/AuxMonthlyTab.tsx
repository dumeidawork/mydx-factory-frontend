import { useCallback, useEffect, useState } from 'react'
import { Badge, Col, Row, Statistic, Table, Tag, Button, message } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { whDownload, whGet } from '../warehouseApi'
import TabGuide from '../TabGuide'

type Summary = {
  month: string
  purchase_total: number
  payable_total: number
  stock_value: number
  consume: { category: string; amount: number }[]
  triple_check: {
    key: string
    purchase_qty: number
    inbound_qty: number
    issue_qty: number
    purchase_amt: number
    inbound_amt: number
    issue_amt: number
    ok: boolean
  }[]
  alerts: { id: number; level: string; title: string }[]
}

export default function AuxMonthlyTab() {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await whGet<Summary>('/aux/monthly-summary')
      setData(d)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const consume = data?.consume || []
  const consumeTotal = consume.reduce((s, r) => s + Number(r.amount || 0), 0)

  return (
    <div>
      <TabGuide
        title="月度汇总 · 操作说明"
        steps={[
          '先看三大指标：月度采购总额、各供应商应付合计、实际库存货值。结账前请先补全入库和领用。',
          '「分类消耗汇总」按成本中心列出本月领用金额（已作废领用不计入）；可点「导出消耗」。',
          '「三单汇总校验」首行是全仓数量恒等式，其余行是各供应商月结采购金额 vs 入库金额。对账细节到「对账结账」点溯源。',
          '下方预警清单含低库存、超储、价格异常、现金偏低、对账差异、数量恒等式异常等。点「导出预警」下载未处理清单。',
        ]}
        methods={[
          '默认当月；点「刷新」会重算指标、恒等式，并把当前月份的对账/恒等式异常写入预警。',
          '供应商对账单在「对账结账」导出；现金备用金在「现金账本」导出。本页导出的是消耗和预警。',
        ]}
        notes={[
          '数量恒等式：当月入库数量 − 领用数量 ≈ 期末库存 − 期初库存（已作废入库/领用不计入；期初用流水反推，容差 0.001）。本月有期初调整时可能显示异常，属正常提示。',
          '采购 vs 入库只比对月结金额，容差 0.01 元。逐笔差异请到对账页「溯源」，不要在本页改单。',
          '库存货值 = 现存量 × 最近单价；单价为 0 的物料会拉低货值。低库存预警按每种辅料自己的下限，不是全局阈值。',
        ]}
      />
      <div className="wh-toolbar">
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
          刷新
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload(
              `/aux/exports/monthly-consume?month=${encodeURIComponent(data?.month || '')}`,
              '每月总消耗.xlsx',
            ).catch((e) => message.error(e instanceof Error ? e.message : '导出失败'))
          }}
        >
          导出消耗
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload('/aux/exports/alerts', '预警异常清单.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出预警
        </Button>
        <div className="wh-toolbar-spacer" />
        <span style={{ color: '#64748b' }}>{data?.month || ''} 月度汇总</span>
      </div>

      <Row gutter={16} className="wh-stat-row">
        <Col xs={24} sm={8}>
          <Statistic title="月度采购总金额(元)" value={data?.purchase_total || 0} precision={2} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="各供应商应付合计(元)" value={data?.payable_total || 0} precision={2} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="实际库存货值(元)" value={data?.stock_value || 0} precision={2} />
        </Col>
      </Row>

      <h4 style={{ marginBottom: 8 }}>
        分类消耗汇总 <Badge count={data?.alerts?.length || 0} style={{ marginLeft: 8 }} />
      </h4>
      <Table
        rowKey="category"
        size="small"
        pagination={false}
        style={{ marginBottom: 20 }}
        dataSource={[...consume, { category: '合计', amount: consumeTotal }]}
        columns={[
          { title: '类别', dataIndex: 'category' },
          { title: '金额(元)', dataIndex: 'amount', render: (v: number) => Number(v || 0).toFixed(2) },
        ]}
      />

      <h4 style={{ marginBottom: 8 }}>三单汇总校验（数量/金额）</h4>
      <Table
        rowKey="key"
        size="middle"
        pagination={false}
        dataSource={data?.triple_check || []}
        columns={[
          { title: '物料/供应商', dataIndex: 'key' },
          { title: '采购数量', dataIndex: 'purchase_qty', width: 90 },
          { title: '入库数量', dataIndex: 'inbound_qty', width: 90 },
          { title: '出库数量', dataIndex: 'issue_qty', width: 90 },
          { title: '采购金额', dataIndex: 'purchase_amt', width: 90 },
          { title: '入库金额', dataIndex: 'inbound_amt', width: 90 },
          { title: '出库金额', dataIndex: 'issue_amt', width: 90 },
          {
            title: '结果',
            dataIndex: 'ok',
            width: 90,
            render: (ok: boolean) => (ok ? <Tag color="success">一致</Tag> : <Tag color="error">异常</Tag>),
          },
        ]}
      />

      <h4 style={{ margin: '20px 0 8px' }}>站内预警</h4>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data?.alerts || []}
        columns={[
          {
            title: '级别',
            dataIndex: 'level',
            width: 90,
            render: (l: string) => <Tag color={l === 'error' ? 'error' : 'warning'}>{l}</Tag>,
          },
          { title: '内容', dataIndex: 'title' },
        ]}
      />
    </div>
  )
}
