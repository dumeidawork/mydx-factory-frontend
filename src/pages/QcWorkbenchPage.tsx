import { Card, Radio, Space, Switch, Tooltip } from 'antd'
import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import styles from './WorkflowPages.module.css'
import FranceQcPanel from '../components/FranceQcPanel'
import DalianQcPanel from '../components/DalianQcPanel'
import { usePageTitle } from '../layout/usePageTitle'

export type QcOutputFormat = 'word' | 'pdf'

export default function QcWorkbenchPage() {
  const { pathname } = useLocation()
  const pageTitle = usePageTitle()
  const [outputFormat, setOutputFormat] = useState<QcOutputFormat>('word')
  const [useUtmtpt, setUseUtmtpt] = useState(false)
  const isDalian = pathname.endsWith('/dalian')

  return (
    <Card
      title={pageTitle}
      className={styles.pageCard}
      extra={
        <Space wrap>
          <Tooltip title="关闭时 A105 均使用普通质保书模板；开启后选用 UTMTPT 模板的业务条件待后续商定">
            <Space size={8}>
              <span>UTMTPT 版本</span>
              <Switch checked={useUtmtpt} onChange={setUseUtmtpt} />
            </Space>
          </Tooltip>
          <Radio.Group
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as QcOutputFormat)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: 'Word', value: 'word' },
              { label: 'PDF', value: 'pdf' },
            ]}
          />
        </Space>
      }
    >
      {isDalian ? (
        <DalianQcPanel outputFormat={outputFormat} useUtmtpt={useUtmtpt} />
      ) : (
        <FranceQcPanel outputFormat={outputFormat} useUtmtpt={useUtmtpt} />
      )}
    </Card>
  )
}
