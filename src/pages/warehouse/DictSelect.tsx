import { useCallback, useEffect, useState } from 'react'
import { Button, Divider, Input, Select, Space, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { whGet, whPost } from './warehouseApi'

type Opt = { value: string | number; label: string; id?: number; code?: string }

type Props = {
  kind: string
  value?: string | number | null
  onChange?: (v: string | number | undefined) => void
  placeholder?: string
  allowClear?: boolean
  style?: React.CSSProperties
  disabled?: boolean
}

export default function DictSelect({
  kind,
  value,
  onChange,
  placeholder,
  allowClear = true,
  style,
  disabled,
}: Props) {
  const [options, setOptions] = useState<Opt[]>([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await whGet<{ items: Opt[] }>(`/meta/options?kind=${encodeURIComponent(kind)}`)
      setOptions(data.items || [])
    } catch {
      setOptions([])
    }
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  const commit = async (text: string) => {
    const v = text.trim()
    if (!v) return
    setAdding(true)
    try {
      const res = await whPost<{ item?: { id?: number; code?: string; value?: string }; value?: string }>(
        '/meta/options',
        { kind, value: v },
      )
      await load()
      if (kind === 'location' || kind === 'shelf') {
        onChange?.(res.item?.id)
      } else if (kind === 'cost_center' || kind === 'cost-center') {
        onChange?.(res.item?.code || v)
      } else {
        onChange?.(res.value || res.item?.value || v)
      }
      setSearch('')
    } catch (e) {
      message.error(e instanceof Error ? e.message : '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const exists = options.some((o) => String(o.label) === search.trim() || String(o.value) === search.trim())

  return (
    <Select
      showSearch
      allowClear={allowClear}
      disabled={disabled}
      placeholder={placeholder}
      style={style || { width: '100%' }}
      value={value ?? undefined}
      options={options}
      filterOption={(input, option) => String(option?.label || '').toLowerCase().includes(input.toLowerCase())}
      onSearch={setSearch}
      onChange={(v) => onChange?.(v)}
      dropdownRender={(menu) => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <Space style={{ padding: '0 8px 4px' }} onMouseDown={(e) => e.preventDefault()}>
            <Input
              size="small"
              placeholder="输入新选项"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => {
                if (search.trim() && !exists) void commit(search)
              }}
            />
            <Button
              size="small"
              type="text"
              icon={<PlusOutlined />}
              loading={adding}
              disabled={!search.trim() || exists}
              onClick={() => void commit(search)}
            >
              添加
            </Button>
          </Space>
        </>
      )}
    />
  )
}
