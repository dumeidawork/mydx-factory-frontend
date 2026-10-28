import { Card } from 'antd'
import styles from './WorkflowPages.module.css'
import { usePageTitle } from '../layout/usePageTitle'
import DalianPackingPanel from './DalianPackingPanel'

export default function DalianManualPackingPage() {
  const pageTitle = usePageTitle()
  return (
    <Card title={pageTitle} className={styles.pageCard}>
      <DalianPackingPanel mode="manual" />
    </Card>
  )
}
