import { useCallback, useEffect, useState } from 'react'
import { Button, Drawer, Input, Space, Table, Tag, message } from 'antd'
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import { whDownload, whGet, whPut } from '../warehouseApi'
import TabGuide from '../TabGuide'

type Row = {
  supplier: string
  month: string
  purchase_amt: number
  inbound_amt: number
  diff: number
  invoice?: string
  invoice_status?: string
  diff_note?: string
}

export default function AuxReconcileTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [detail, setDetail] = useState<{
    supplier: string
    month: string
    purchase_amt: number
    inbound_amt: number
    diff: number
    diff_note?: string
    purchases: { po_no: string; biz_date: string; total_amount: number; summary?: string }[]
    inbounds: { inbound_no: string; biz_date: string; total_amount: number; ref_po_no?: string }[]
  } | null>(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[] }>(`/aux/reconcile?month=${encodeURIComponent(month)}`)
      setRows(data.items || [])
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    void load()
  }, [load])

  const toggleInvoice = async (r: Row) => {
    const next = r.invoice_status === 'issued' ? 'unissued' : 'issued'
    try {
      await whPut('/aux/reconcile/invoice', { supplier: r.supplier, month: r.month || month, status: next })
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '更新失败')
    }
  }

  return (
    <div>
      <TabGuide
        title="对账结账 · 操作说明"
        steps={[
          '选择月份后刷新。系统按该月「月结采购金额」与「入库金额」汇总到每个供应商（已作废单据不计入）。',
          '看差异列：0 表示金额一致；不为 0 时点「溯源」，对照当月采购单列表和入库单列表，查漏入库或供应商名称不一致。',
          '溯源抽屉可填写并保存「差异说明」。发票列点「切换」在已开/未开之间标记（按供应商+自然月）。',
          '点「导出对账单」下载明细（日期、规格、数量、单价、总价、采购人），与供应商对账单核对。',
        ]}
        methods={[
          '采购单、入库单的供应商名称必须一致（从采购单带出，不要写成「鑫淼」和「鑫淼五金」两种）。',
          '建议次月 5 日前完成本月对账。金额差会写入页头总预警和「月度汇总」预警清单。',
        ]}
        notes={[
          '只汇总月结采购，不含现金采购。一期是金额汇总级，不做逐笔批次匹配。',
          '发票是轻量月标记，不是财务发票台账。本页无删除；对账差异请用溯源说明，不要改历史入库数量。',
          '数量是否轧平请看「月度汇总」首行「全仓数量恒等式」。',
        ]}
      />
      <div className="wh-toolbar">
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ width: 160 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload(`/aux/exports/reconcile?month=${encodeURIComponent(month)}`, `供应商对账单_${month}.xlsx`).catch(
              (e) => message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出对账单
        </Button>
      </div>
      <Table
        rowKey={(r) => `${r.supplier}-${r.month}`}
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '供应商', dataIndex: 'supplier', width: 100 },
          { title: '月份', dataIndex: 'month', width: 100 },
          { title: '采购金额', dataIndex: 'purchase_amt', render: (v: number) => Number(v || 0).toFixed(2) },
          { title: '入库金额', dataIndex: 'inbound_amt', render: (v: number) => Number(v || 0).toFixed(2) },
          {
            title: '差异',
            dataIndex: 'diff',
            render: (v: number) => (
              <span style={{ color: Number(v || 0) === 0 ? undefined : '#cf1322' }}>{Number(v || 0).toFixed(2)}</span>
            ),
          },
          {
            title: '发票',
            dataIndex: 'invoice',
            width: 120,
            render: (_: string, r: Row) => (
              <Space>
                <Tag color={r.invoice_status === 'issued' ? 'success' : 'warning'}>{r.invoice || '未开'}</Tag>
                <Button type="link" size="small" onClick={() => void toggleInvoice(r)}>
                  切换
                </Button>
              </Space>
            ),
          },
          {
            title: '差异说明',
            dataIndex: 'diff_note',
            ellipsis: true,
            render: (v: string) => v || '—',
          },
          {
            title: '操作',
            width: 80,
            render: (_: unknown, r: Row) => (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  void whGet<NonNullable<typeof detail>>(
                    `/aux/reconcile/detail?supplier=${encodeURIComponent(r.supplier)}&month=${encodeURIComponent(r.month || month)}`,
                  )
                    .then((d) => {
                      setDetail(d)
                      setNote(d.diff_note || '')
                    })
                    .catch((e) => message.error(e instanceof Error ? e.message : '加载失败'))
                }}
              >
                溯源
              </Button>
            ),
          },
        ]}
      />

      <Drawer title={`对账溯源 ${detail?.supplier || ''}`} open={!!detail} onClose={() => setDetail(null)} width={560}>
        {detail ? (
          <>
            <p>
              采购 {Number(detail.purchase_amt).toFixed(2)} − 入库 {Number(detail.inbound_amt).toFixed(2)} ＝ 差异{' '}
              <span style={{ color: Number(detail.diff) === 0 ? undefined : '#cf1322' }}>{Number(detail.diff).toFixed(2)}</span>
            </p>
            <Input.TextArea
              rows={2}
              placeholder="差异说明"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <Button
              type="primary"
              size="small"
              style={{ marginBottom: 16 }}
              onClick={() => {
                void whPut('/aux/reconcile/invoice', {
                  supplier: detail.supplier,
                  month: detail.month,
                  status: rows.find((x) => x.supplier === detail.supplier)?.invoice_status || 'unissued',
                  diff_note: note,
                })
                  .then(() => {
                    message.success('差异说明已保存')
                    void load()
                  })
                  .catch((e: unknown) => message.error(e instanceof Error ? e.message : '保存失败'))
              }}
            >
              保存说明
            </Button>
            <Table
              rowKey="po_no"
              size="small"
              pagination={false}
              title={() => '当月月结采购单'}
              dataSource={detail.purchases}
              columns={[
                { title: '单号', dataIndex: 'po_no' },
                { title: '日期', dataIndex: 'biz_date', width: 110 },
                { title: '金额', dataIndex: 'total_amount', width: 90, render: (v: number) => Number(v || 0).toFixed(2) },
                { title: '摘要', dataIndex: 'summary', ellipsis: true },
              ]}
            />
            <Table
              rowKey="inbound_no"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              title={() => '当月入库单'}
              dataSource={detail.inbounds}
              columns={[
                { title: '入库单', dataIndex: 'inbound_no' },
                { title: '日期', dataIndex: 'biz_date', width: 110 },
                { title: '采购单', dataIndex: 'ref_po_no', width: 140 },
                { title: '金额', dataIndex: 'total_amount', width: 90, render: (v: number) => Number(v || 0).toFixed(2) },
              ]}
            />
          </>
        ) : null}
      </Drawer>
    </div>
  )
}
