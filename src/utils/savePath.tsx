import { Input, Modal, Space } from 'antd'

export type SaveFileDialogResult = {
  directoryPath: string
  fileName: string
}

function normalizeXlsxFileName(fileName: string): string {
  const trimmed = fileName.trim() || 'export.xlsx'
  return /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`
}

export async function askSavePathAndFileName(
  title: string,
  initialDirectory = '',
  initialFileName = 'export.xlsx',
): Promise<SaveFileDialogResult | null> {
  const dirInputId = `save-path-input-${Date.now()}`
  const fileInputId = `save-file-input-${Date.now()}`
  return await new Promise((resolve) => {
    Modal.confirm({
      title,
      width: 640,
      okText: '确认导出',
      cancelText: '取消',
      content: (
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <div>保存目录：</div>
            <Input
              id={dirInputId}
              defaultValue={initialDirectory}
              placeholder="留空则保存到本机桌面（桌面客户端）。可填文件夹绝对路径，例如 C:\Exports"
            />
          </div>
          <div>
            <div>保存文件名：</div>
            <Input id={fileInputId} defaultValue={initialFileName} placeholder="例如 订单查询_20260608.xlsx" />
          </div>
        </Space>
      ),
      onOk: () => {
        const dirEl = document.getElementById(dirInputId) as HTMLInputElement | null
        const fileEl = document.getElementById(fileInputId) as HTMLInputElement | null
        const fileName = normalizeXlsxFileName(fileEl?.value || initialFileName)
        resolve({
          directoryPath: (dirEl?.value || '').trim(),
          fileName,
        })
      },
      onCancel: () => resolve(null),
    })
  })
}

export async function askSavePath(title: string, initialValue = ''): Promise<string | null> {
  const inputId = `save-path-input-${Date.now()}`
  return await new Promise((resolve) => {
    Modal.confirm({
      title,
      width: 640,
      okText: '确认',
      cancelText: '取消',
      content: (
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>保存路径：</div>
          <Input
            id={inputId}
            defaultValue={initialValue}
            placeholder="留空则保存到本机桌面（桌面客户端）。可填文件夹绝对路径，例如 C:\Exports"
          />
        </Space>
      ),
      onOk: () => {
        const el = document.getElementById(inputId) as HTMLInputElement | null
        resolve((el?.value || '').trim())
      },
      onCancel: () => resolve(null),
    })
  })
}
