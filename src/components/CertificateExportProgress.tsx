import { Typography } from 'antd'

export default function CertificateExportProgress({
  progress,
}: {
  progress: string | null
}) {
  if (!progress) return null
  return (
    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
      {progress}
    </Typography.Text>
  )
}
