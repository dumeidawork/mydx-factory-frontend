import { useState } from 'react'
import { Button, Card, Form, Input, Select, Space, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import styles from './DocumentCenter.module.css'
import { apiUrl, isFetchGuardHandled } from '../utils/api'
import { message } from '../utils/feedback'

type DocType = 'quality_certificate' | 'packing_list' | 'shipping_mark'

const docTypeOptions = [
  { value: 'quality_certificate', labelKey: 'documents.qualityCertificate' },
  { value: 'packing_list', labelKey: 'documents.packingList' },
  { value: 'shipping_mark', labelKey: 'documents.shippingMark' },
]

export default function DocumentCenter() {
  const { t, i18n } = useTranslation()
  const [previewText, setPreviewText] = useState('')
  const [lastJobId, setLastJobId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const [form] = Form.useForm()

  const callPreview = async (values: Record<string, string>) => {
    setLoading(true)
    try {
      const payload = {
        document_type: values.document_type as DocType,
        language: values.language || i18n.language,
        order_no: values.order_no,
        payload: {
          client_name: values.client_name,
          product_name: values.product_name,
          specification: values.specification,
          quantity: values.quantity,
          box_no: values.box_no,
          destination_port: values.destination_port,
        },
      }
      const res = await fetch(apiUrl('/api/v1/documents/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': i18n.language },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.message || 'preview failed')
      setPreviewText(data.preview_text || '')
      message.success(t('documents.previewSuccess'))
    } catch (err) {
      if (isFetchGuardHandled(err)) return
      message.error(`${t('documents.previewFailed')}: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const callExport = async (values: Record<string, string>) => {
    setLoading(true)
    try {
      const payload = {
        document_type: values.document_type as DocType,
        language: values.language || i18n.language,
        order_no: values.order_no,
        payload: {
          client_name: values.client_name,
          product_name: values.product_name,
          specification: values.specification,
          quantity: values.quantity,
          box_no: values.box_no,
          destination_port: values.destination_port,
        },
      }
      const res = await fetch(apiUrl('/api/v1/documents/export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': i18n.language },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.message || 'export failed')
      setLastJobId(data.job_id)
      setPreviewText((text) => text || t('documents.exportCreated'))
      message.success(t('documents.exportSuccess'))
    } catch (err) {
      if (isFetchGuardHandled(err)) return
      message.error(`${t('documents.exportFailed')}: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = async () => {
    const values = await form.validateFields()
    await callPreview(values)
  }

  const handleExport = async () => {
    const values = await form.validateFields()
    await callExport(values)
  }

  const fullInput = { width: '100%' }

  return (
    <Space direction="vertical" size={16} className={styles.wrap} style={{ width: '100%' }}>
      <Typography.Title level={3} className={styles.title}>
        {t('documents.title')}
      </Typography.Title>
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            document_type: 'quality_certificate',
            language: i18n.language,
            order_no: 'PO-20260310-001',
            product_name: '法兰',
            specification: 'DN100',
            quantity: '100',
            box_no: '1',
            destination_port: 'Tokyo',
          }}
        >
          <div className={styles.formGrid}>
            <div className={styles.item}>
              <Form.Item
              name="document_type"
              label={t('documents.documentType')}
              rules={[{ required: true }]}
            >
              <Select
                style={fullInput}
                options={docTypeOptions.map((it) => ({ value: it.value, label: t(it.labelKey) }))}
              />
            </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="language" label={t('documents.language')} rules={[{ required: true }]}>
                <Select
                  style={fullInput}
                  options={[
                    { value: 'zh-CN', label: 'zh-CN' },
                    { value: 'en-US', label: 'en-US' },
                    { value: 'ja-JP', label: 'ja-JP' },
                  ]}
                />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="order_no" label={t('documents.orderNo')} rules={[{ required: true }]}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="client_name" label={t('documents.clientName')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="product_name" label={t('documents.productName')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="specification" label={t('documents.specification')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="quantity" label={t('documents.quantity')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="box_no" label={t('documents.boxNo')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
            <div className={styles.item}>
              <Form.Item name="destination_port" label={t('documents.destinationPort')}>
                <Input style={fullInput} />
              </Form.Item>
            </div>
          </div>
          <div className={styles.actions}>
            <Button type="default" onClick={handlePreview} loading={loading}>
              {t('documents.preview')}
            </Button>
            <Button type="primary" onClick={handleExport} loading={loading}>
              {t('documents.export')}
            </Button>
            {lastJobId && (
              <Button href={`/api/v1/documents/download/${lastJobId}`} target="_blank">
                {t('documents.download')}
              </Button>
            )}
          </div>
        </Form>
      </Card>
      <Card title={t('documents.previewResult')}>
        <pre className={styles.preview}>{previewText || t('documents.emptyPreview')}</pre>
      </Card>
    </Space>
  )
}
