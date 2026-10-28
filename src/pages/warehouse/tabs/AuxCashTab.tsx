import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Col, Descriptions, Drawer, Form, Input, InputNumber, Modal, Row, Space, Statistic, Table, Tag, message } from 'antd'
import { DownloadOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { whDownload, whGet, whPost, whPut } from '../warehouseApi'
import TabGuide from '../TabGuide'

type Row = {
  id: number
  biz_date: string
  transfer_in: number
  prev_balance: number
  spent: number
  next_balance: number
  remark?: string
  source?: string
  status?: string
  can_void?: boolean
  created_by_name?: string
}

export default function AuxCashTab() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [warnAmount, setWarnAmount] = useState<number | null>(null)
  const [viewing, setViewing] = useState<Row | null>(null)
  const [remarkRow, setRemarkRow] = useState<Row | null>(null)
  const [form] = Form.useForm()
  const [remarkForm] = Form.useForm()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await whGet<{ items: Row[]; cash_warn_amount?: string }>('/aux/cash-ledger')
      setRows(data.items || [])
      const raw = data.cash_warn_amount
      setWarnAmount(raw === '' || raw == null ? null : Number(raw))
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const openRows = rows.filter((r) => r.status !== 'voided')
    const latest = [...openRows].sort((a, b) => b.id - a.id)[0]
    return {
      balance: latest?.next_balance ?? 0,
      spent: openRows.reduce((s, r) => s + Number(r.spent || 0), 0),
      transfer: openRows.reduce((s, r) => s + Number(r.transfer_in || 0), 0),
    }
  }, [rows])

  const submit = async () => {
    const v = await form.validateFields()
    try {
      await whPost('/aux/cash-ledger', {
        biz_date: new Date().toISOString().slice(0, 10),
        transfer_in: v.transfer_in || 0,
        spent: v.spent || 0,
        remark: v.remark,
      })
      message.success('现金账本已登记')
      setOpen(false)
      form.resetFields()
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  const saveWarn = async () => {
    try {
      await whPut('/aux/settings', { cash_warn_amount: warnAmount == null ? '' : String(warnAmount) })
      message.success('预警金额已保存')
      await load()
    } catch (e) {
      message.error(e instanceof Error ? e.message : '保存失败')
    }
  }

  return (
    <div>
      <TabGuide
        title="现金账本 · 操作说明"
        steps={[
          '查看顶部「当前备用金余额 / 累计转款 / 累计花费」。公司拨入备用金：点「登记转款/花费」，填转款金额和备注。',
          '在工具栏填写「预警金额」并点「保存预警」。当前余额（含垫付为负）低于该金额时，写入页头总预警。',
          '车间现金采购在「采购管理」点「确认付款」后，本页会自动增加一笔花费。操作列可「查看」「改备注」。',
          '仅最新一条手工登记可「作废」并回退余额。采购付款自动行只能改备注，不能作废。点「导出明细」下载现金明细表。',
        ]}
        methods={[
          '滚动公式：下次对账剩 = 上次余 + 转款 − 花费。预警金额留空表示不按金额预警。',
          '付款权限在采购管理：库管或财务点「确认付款」。收据在现金采购单附件里，不必在本页再传。',
        ]}
        notes={[
          '已由现金采购自动写入的花费，请勿再手工登记一遍。',
          '余额为负说明可能垫付或漏记转款，应立即核对转款与「采购管理」已付款单据。',
          '本账本只记备用金池，不等于全部采购成本；月结供应商采购走「对账结账」。',
        ]}
      />
      <Row gutter={16} className="wh-stat-row">
        <Col xs={24} sm={8}>
          <Statistic title="当前备用金余额(元)" value={stats.balance} precision={2} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="累计转款(元)" value={stats.transfer} precision={2} />
        </Col>
        <Col xs={24} sm={8}>
          <Statistic title="累计花费(元)" value={stats.spent} precision={2} />
        </Col>
      </Row>

      <div className="wh-toolbar">
        <span>预警金额(元)</span>
        <InputNumber
          value={warnAmount ?? undefined}
          onChange={(v) => setWarnAmount(v == null ? null : Number(v))}
          style={{ width: 140 }}
          placeholder="可空=不预警"
        />
        <Button onClick={() => void saveWarn()}>保存预警</Button>
        <Button icon={<ReloadOutlined />} onClick={() => void load()}>
          刷新
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={() => {
            void whDownload('/aux/exports/cash-ledger', '现金明细.xlsx').catch((e) =>
              message.error(e instanceof Error ? e.message : '导出失败'),
            )
          }}
        >
          导出明细
        </Button>
        <div className="wh-toolbar-spacer" />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          登记转款/花费
        </Button>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={[
          { title: '日期', dataIndex: 'biz_date', width: 120 },
          { title: '转款/元', dataIndex: 'transfer_in', render: (v: number) => Number(v || 0).toFixed(2) },
          { title: '上次对账余/元', dataIndex: 'prev_balance', render: (v: number) => Number(v || 0).toFixed(2) },
          {
            title: '合计',
            render: (_, r) => (Number(r.transfer_in || 0) + Number(r.prev_balance || 0)).toFixed(2),
          },
          { title: '花费/元', dataIndex: 'spent', render: (v: number) => Number(v || 0).toFixed(2) },
          { title: '下次对账剩/元', dataIndex: 'next_balance', render: (v: number) => Number(v || 0).toFixed(2) },
          { title: '备注', dataIndex: 'remark', ellipsis: true, render: (v: string) => v || '—' },
          {
            title: '来源',
            width: 90,
            render: (_, r) =>
              r.source === 'purchase_pay' ? <Tag>采购付款</Tag> : r.status === 'voided' ? <Tag>已作废</Tag> : <Tag color="blue">手工</Tag>,
          },
          { title: '录入人', dataIndex: 'created_by_name', width: 90 },
          {
            title: '操作',
            width: 160,
            render: (_, r) => (
              <Space size={0} wrap>
                <Button type="link" size="small" onClick={() => setViewing(r)}>
                  查看
                </Button>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    setRemarkRow(r)
                    remarkForm.setFieldsValue({ remark: r.remark })
                  }}
                >
                  改备注
                </Button>
                {r.can_void ? (
                  <Button
                    type="link"
                    size="small"
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: '作废该手工登记？',
                        content: '仅最新一条手工登记可作废，余额回退到上一笔。',
                        onOk: async () => {
                          await whPost(`/aux/cash-ledger/${r.id}/void`, {})
                          message.success('已作废')
                          await load()
                        },
                      })
                    }}
                  >
                    作废
                  </Button>
                ) : null}
              </Space>
            ),
          },
        ]}
      />

      <Modal title="登记现金账本" open={open} onCancel={() => setOpen(false)} onOk={() => void submit()} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ transfer_in: 0, spent: 0 }}>
          <Form.Item name="transfer_in" label="转款/元">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="spent" label="花费/元">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="修改备注"
        open={!!remarkRow}
        onCancel={() => setRemarkRow(null)}
        onOk={() => {
          void (async () => {
            if (!remarkRow) return
            const v = await remarkForm.validateFields()
            await whPut(`/aux/cash-ledger/${remarkRow.id}`, { remark: v.remark })
            message.success('备注已保存')
            setRemarkRow(null)
            await load()
          })()
        }}
        destroyOnClose
      >
        <Form form={remarkForm} layout="vertical">
          <Form.Item name="remark" label="备注">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer title="现金账本详情" open={!!viewing} onClose={() => setViewing(null)} width={420}>
        {viewing ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="日期">{viewing.biz_date}</Descriptions.Item>
            <Descriptions.Item label="转款">{Number(viewing.transfer_in || 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="花费">{Number(viewing.spent || 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="下次剩">{Number(viewing.next_balance || 0).toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="备注">{viewing.remark || '—'}</Descriptions.Item>
            <Descriptions.Item label="来源">{viewing.source === 'purchase_pay' ? '采购付款' : '手工'}</Descriptions.Item>
            <Descriptions.Item label="状态">{viewing.status === 'voided' ? '已作废' : '有效'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Drawer>
    </div>
  )
}
