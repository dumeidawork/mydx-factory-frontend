import { useEffect, useMemo } from 'react'
import { Form, Input, Modal } from 'antd'
import { normalizeDrawingRevForDb, parsedFormPatch } from '../utils/specParser'
import { CORE_LIST_DIM_KEYS, DIM_FIELDS, DIM_LABELS } from '../utils/drawingSourceFields'
import type { DrawingArchiveRow } from './drawingReviewTypes'

type Props = {
  open: boolean
  item: DrawingArchiveRow | null
  submitting?: boolean
  onCancel: () => void
  onSubmit: (values: Record<string, string>) => void | Promise<void>
}

export default function DrawingReviseModal({ open, item, submitting = false, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm()

  const dimKeys = useMemo(() => {
    const present = DIM_FIELDS.filter((key) => String((item as Record<string, unknown> | null)?.[key] ?? '').trim())
    const extras = CORE_LIST_DIM_KEYS.filter(
      (key) => key !== 'spec_model' && DIM_FIELDS.includes(key as (typeof DIM_FIELDS)[number]) && !present.includes(key as (typeof DIM_FIELDS)[number]),
    ) as Array<(typeof DIM_FIELDS)[number]>
    return [...present, ...extras]
  }, [item])

  useEffect(() => {
    if (open && item) {
      const dims: Record<string, string> = {}
      DIM_FIELDS.forEach((key) => {
        dims[key] = String(item[key] ?? '')
      })
      form.setFieldsValue({
        customer_code: item.customer_code,
        standard_no: item.standard_no || '',
        drawing_rev_no: item.drawing_rev_no || '',
        material: item.material,
        spec_model: item.spec_model,
        spec: item.spec || '',
        model: item.model || '',
        material_no: item.material_no || '',
        drawing_type: item.drawing_type,
        ...dims,
      })
    }
  }, [open, item, form])

  return (
    <Modal
      open={open}
      title="核对并修改图纸数据"
      onCancel={onCancel}
      okText="确认并重新提交审核"
      confirmLoading={submitting}
      width={720}
      onOk={async () => {
        const values = await form.validateFields()
        await onSubmit({
          ...values,
          drawing_rev_no: normalizeDrawingRevForDb(String(values.drawing_rev_no || '')),
        })
      }}
    >
      {item?.review_remark ? <div style={{ marginBottom: 12, color: '#b45309' }}>审核说明：{item.review_remark}</div> : null}
      <Form form={form} layout="vertical">
        <Form.Item name="spec_model" label="规格型号" rules={[{ required: true, message: '请输入规格型号' }]}>
          <Input
            onBlur={() => {
              form.setFieldsValue(parsedFormPatch(String(form.getFieldValue('spec_model') || '')))
            }}
          />
        </Form.Item>
        {dimKeys.map((key) => (
          <Form.Item key={key} name={key} label={DIM_LABELS[key] || key}>
            <Input />
          </Form.Item>
        ))}
        <Form.Item name="customer_code" label="客户代码" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="standard_no"
          label="标准号"
          rules={[
            {
              validator: async (_, value) => {
                const other = String(form.getFieldValue('drawing_rev_no') || '').trim()
                if (!String(value || '').trim() && !other) {
                  throw new Error('标准号与图纸号-版本号必须填写其中一个')
                }
              },
            },
          ]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="drawing_rev_no"
          label="图纸号-版本号"
          rules={[
            {
              validator: async (_, value) => {
                const other = String(form.getFieldValue('standard_no') || '').trim()
                if (!String(value || '').trim() && !other) {
                  throw new Error('标准号与图纸号-版本号必须填写其中一个')
                }
              },
            },
          ]}
        >
          <Input
            placeholder="A5E02970605A Rev017 或 A5E02970605A-017"
            onBlur={(e) => {
              const next = normalizeDrawingRevForDb(e.target.value)
              if (next !== e.target.value) form.setFieldValue('drawing_rev_no', next)
            }}
          />
        </Form.Item>
        <Form.Item name="material" label="材质" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="spec" label="规格">
          <Input />
        </Form.Item>
        <Form.Item name="model" label="型号">
          <Input />
        </Form.Item>
        <Form.Item name="material_no" label="物料号">
          <Input />
        </Form.Item>
        <Form.Item name="drawing_type" label="类型" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
      </Form>
    </Modal>
  )
}
