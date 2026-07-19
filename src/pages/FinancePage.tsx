import { Tabs } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import TestFeeManager from '../components/TestFeeManager';
import './FinancePage.css';

export default function FinancePage() {
  return (
    <div className="finance-page">
      <div className="finance-page-header">
        <span className="finance-page-icon"><SettingOutlined /></span>
        <div>
          <h1 className="finance-page-title">财务管理</h1>
          <div className="finance-page-subtitle">集中处理费用维护、报表导出与财务数据整理</div>
        </div>
      </div>
      <Tabs
        className="finance-tabs"
        defaultActiveKey="test-fee"
        items={[
          {
            key: 'test-fee',
            label: '试验费用',
            children: <TestFeeManager />,
          },
          {
            key: 'other',
            label: '其他（待开发）',
            children: <div className="finance-empty">其他财务功能待开发...</div>,
          }
        ]}
      />
    </div>
  );
}
