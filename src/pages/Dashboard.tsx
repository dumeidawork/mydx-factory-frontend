import { useTranslation } from 'react-i18next'
import { Card, Row, Col, Typography } from 'antd'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { t } = useTranslation()
  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>{t('nav.dashboard')}</div>
        <div className={styles.heroDesc}>{t('app.name')}</div>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <Card title={t('nav.contracts')} className={styles.moduleCard}>
            <Typography.Text type="secondary">合同录入、图纸管理、订单分配</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title={t('nav.production')} className={styles.moduleCard}>
            <Typography.Text type="secondary">生产节点流转、扫码报工、进度追踪</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card title={t('nav.finance')} className={styles.moduleCard}>
            <Typography.Text type="secondary">收支记录、审批流、对账单生成</Typography.Text>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
