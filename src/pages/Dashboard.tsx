import { useTranslation } from 'react-i18next'
import { Collapse } from 'antd'
import { AppstoreOutlined, FileTextOutlined, FilePdfOutlined, UnorderedListOutlined } from '@ant-design/icons'
import PendingContractTakeoverPanel from './PendingContractTakeoverPanel'
import PendingAmountConfirmPanel from './PendingAmountConfirmPanel'
import PendingDrawingReviewPanel from './PendingDrawingReviewPanel'
import PendingDrawingRevisePanel from './PendingDrawingRevisePanel'
import PendingMaterialGapPanel from './PendingMaterialGapPanel'
import PendingQtyMapDnPanel from './PendingQtyMapDnPanel'
import PendingTypingNoticePanel from './PendingTypingNoticePanel'
import PendingDalianContractDeferPanel from './PendingDalianContractDeferPanel'
import DalianShippingProgressPanel from './DalianShippingProgressPanel'
import { useWorkbenchUnread } from '../layout/WorkbenchUnreadContext'
import { useCollapseWhenEmpty } from './useCollapseWhenEmpty'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { t } = useTranslation()
  const {
    items,
    amountItems,
    drawingReviewItems,
    drawingReviseItems,
    materialDrawingItems,
    materialPriceItems,
    typingNoticeItems,
    dalianContractDeferItems,
    qtyMapDnItems,
  } = useWorkbenchUnread()
  const contractCount = items.length + amountItems.length + typingNoticeItems.length + dalianContractDeferItems.length
  const drawingCount = drawingReviewItems.length + drawingReviseItems.length
  const materialCount = materialDrawingItems.length + materialPriceItems.length + (qtyMapDnItems[0]?.missing_count || qtyMapDnItems.length)
  const todoCount = contractCount + drawingCount + materialCount
  const todoCollapse = useCollapseWhenEmpty(todoCount, 'todos')
  const contractCollapse = useCollapseWhenEmpty(contractCount, 'contract')
  const drawingCollapse = useCollapseWhenEmpty(drawingCount, 'drawing')
  const materialCollapse = useCollapseWhenEmpty(materialCount, 'material')

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <div className={styles.heroTitle}>{t('nav.dashboard')}</div>
        <div className={styles.heroDesc}>{t('app.name')}</div>
      </div>

      <Collapse
        className={`${styles.section} ${styles.sectionTodo}`}
        activeKey={todoCollapse.activeKey}
        onChange={todoCollapse.onChange}
        items={[
          {
            key: 'todos',
            label: (
              <span className={styles.sectionHead}>
                <UnorderedListOutlined />
                <span className={styles.sectionTitle}>待办事项</span>
                <span className={styles.sectionMeta}>
                  {todoCount > 0 ? `${todoCount} 项待处理` : '暂无待办'}
                </span>
              </span>
            ),
            children: (
              <div className={styles.todoBody}>
                <Collapse
                  className={`${styles.section} ${styles.sectionContract} ${styles.nestedSection}`}
                  activeKey={contractCollapse.activeKey}
                  onChange={contractCollapse.onChange}
                  items={[
                    {
                      key: 'contract',
                      label: (
                        <span className={styles.sectionHead}>
                          <FileTextOutlined />
                          <span className={styles.sectionTitle}>合同</span>
                          <span className={styles.sectionMeta}>
                            {contractCount > 0 ? `${contractCount} 项待处理` : '暂无待办'}
                          </span>
                        </span>
                      ),
                      children: (
                        <div className={styles.sectionBody}>
                          <PendingContractTakeoverPanel />
                          <PendingAmountConfirmPanel />
                          <PendingTypingNoticePanel />
                          <PendingDalianContractDeferPanel />
                        </div>
                      ),
                    },
                  ]}
                />
                <Collapse
                  className={`${styles.section} ${styles.sectionDrawing} ${styles.nestedSection}`}
                  activeKey={drawingCollapse.activeKey}
                  onChange={drawingCollapse.onChange}
                  items={[
                    {
                      key: 'drawing',
                      label: (
                        <span className={styles.sectionHead}>
                          <FilePdfOutlined />
                          <span className={styles.sectionTitle}>图纸</span>
                          <span className={styles.sectionMeta}>
                            {drawingCount > 0 ? `${drawingCount} 项待处理` : '暂无待办'}
                          </span>
                        </span>
                      ),
                      children: (
                        <div className={styles.sectionBody}>
                          <PendingDrawingReviewPanel />
                          <PendingDrawingRevisePanel />
                        </div>
                      ),
                    },
                  ]}
                />
                <Collapse
                  className={`${styles.section} ${styles.sectionMaterial} ${styles.nestedSection}`}
                  activeKey={materialCollapse.activeKey}
                  onChange={materialCollapse.onChange}
                  items={[
                    {
                      key: 'material',
                      label: (
                        <span className={styles.sectionHead}>
                          <AppstoreOutlined />
                          <span className={styles.sectionTitle}>物料</span>
                          <span className={styles.sectionMeta}>
                            {materialCount > 0 ? `${materialCount} 项待处理` : '暂无待办'}
                          </span>
                        </span>
                      ),
                      children: (
                        <div className={styles.sectionBody}>
                          <PendingMaterialGapPanel />
                          <PendingQtyMapDnPanel />
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />

      <DalianShippingProgressPanel />
    </div>
  )
}
