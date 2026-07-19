import { useState, useEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  DownloadOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Modal, Pagination } from 'antd';
import { apiUrl, fetchPostJson, isFetchGuardHandled } from '../utils/api';
import { saveGeneratedBlob } from '../utils/clientFileSave';
import { askSavePath } from '../utils/savePath';
import './TestFeeManager.css';

const PAGE_SIZE = 10;
const MIN_COL_WIDTH = 56;
const DEFAULT_TEST_QTY_IMPACT = 6;
const DEFAULT_TEST_QTY_TENSILE = 1;

const cellText = (value: unknown) => (value === null || value === undefined ? '' : String(value));

type TestFeeColumnKey =
  | 'material_no'
  | 'drawing_no'
  | 'specification'
  | 'material'
  | 'quantity'
  | 'remark'
  | 'order_no'
  | 'item_no'
  | 'heat_no'
  | 'heat_treatment_batch_no'
  | 'yield_strength'
  | 'tensile_strength'
  | 'elongation'
  | 'reduction_of_area'
  | 'hardness'
  | 'impact_work'
  | 'product_unit_price'
  | 'test_qty_impact'
  | 'test_qty_tensile'
  | 'sample_fee_impact'
  | 'sample_fee_tensile'
  | 'test_fee_impact'
  | 'test_fee_tensile'
  | 'action';

type TestFeeColumnDef = {
  key: TestFeeColumnKey;
  title: string;
  editable: boolean;
  defaultWidth: number;
  headerClass?: string;
};

const TEST_FEE_COLUMNS: TestFeeColumnDef[] = [
  { key: 'material_no', title: '物料号', editable: false, defaultWidth: 110 },
  { key: 'drawing_no', title: '图纸号', editable: false, defaultWidth: 140 },
  { key: 'specification', title: '规格型号', editable: false, defaultWidth: 140 },
  { key: 'material', title: '材质', editable: false, defaultWidth: 80 },
  { key: 'quantity', title: '数量', editable: false, defaultWidth: 72 },
  { key: 'remark', title: '备注', editable: false, defaultWidth: 100 },
  { key: 'order_no', title: '订单号', editable: false, defaultWidth: 110 },
  { key: 'item_no', title: '条目', editable: false, defaultWidth: 72 },
  { key: 'heat_no', title: '炉号', editable: false, defaultWidth: 100 },
  { key: 'heat_treatment_batch_no', title: '热处理批号', editable: false, defaultWidth: 130 },
  { key: 'yield_strength', title: '屈服', editable: false, defaultWidth: 72, headerClass: 'test-fee-group-test' },
  { key: 'tensile_strength', title: '抗拉', editable: false, defaultWidth: 72, headerClass: 'test-fee-group-test' },
  { key: 'elongation', title: '延伸', editable: false, defaultWidth: 72, headerClass: 'test-fee-group-test' },
  { key: 'reduction_of_area', title: '断面收缩', editable: false, defaultWidth: 88, headerClass: 'test-fee-group-test' },
  { key: 'hardness', title: '硬度', editable: false, defaultWidth: 88, headerClass: 'test-fee-group-test' },
  { key: 'impact_work', title: '冲击', editable: false, defaultWidth: 88, headerClass: 'test-fee-group-test' },
  { key: 'product_unit_price', title: '产品单价', editable: true, defaultWidth: 96 },
  { key: 'test_qty_impact', title: '冲击', editable: true, defaultWidth: 80, headerClass: 'test-fee-group-qty' },
  { key: 'test_qty_tensile', title: '拉伸', editable: true, defaultWidth: 80, headerClass: 'test-fee-group-qty' },
  { key: 'sample_fee_impact', title: '冲击', editable: true, defaultWidth: 88, headerClass: 'test-fee-group-sample' },
  { key: 'sample_fee_tensile', title: '拉伸', editable: true, defaultWidth: 88, headerClass: 'test-fee-group-sample' },
  { key: 'test_fee_impact', title: '冲击', editable: true, defaultWidth: 88, headerClass: 'test-fee-group-fee' },
  { key: 'test_fee_tensile', title: '拉伸', editable: true, defaultWidth: 88, headerClass: 'test-fee-group-fee' },
  { key: 'action', title: '操作', editable: false, defaultWidth: 132 },
];

const DEFAULT_COL_WIDTHS = Object.fromEntries(TEST_FEE_COLUMNS.map((col) => [col.key, col.defaultWidth])) as Record<
  TestFeeColumnKey,
  number
>;

const tableTotalWidth = (widths: Record<TestFeeColumnKey, number>) =>
  TEST_FEE_COLUMNS.reduce((sum, col) => sum + widths[col.key], 0);

const MIDDLE_COLUMNS = TEST_FEE_COLUMNS.filter((col) => col.key !== 'material_no' && col.key !== 'action');

const stickyColumnClass = (key: TestFeeColumnKey) => {
  if (key === 'material_no') return 'test-fee-sticky-left';
  if (key === 'action') return 'test-fee-sticky-right';
  return '';
};

function ResizableTitle({
  width,
  className,
  children,
  onResizeWidth,
  columnKey,
  rowSpan,
}: {
  width: number;
  className?: string;
  children: ReactNode;
  onResizeWidth: (nextWidth: number) => void;
  columnKey?: TestFeeColumnKey;
  rowSpan?: number;
}) {
  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      onResizeWidth(Math.max(MIN_COL_WIDTH, Math.round(startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const mergedClass = [className, columnKey ? stickyColumnClass(columnKey) : '', columnKey ? 'test-fee-sticky-corner' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <th
      rowSpan={rowSpan}
      className={mergedClass || undefined}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      <span className="test-fee-th-label">{children}</span>
      <span className="test-fee-col-resize-handle" onMouseDown={startResize} />
    </th>
  );
}

type TestFeeRow = Record<string, unknown> & {
  id: string;
  test_date?: string;
  test_qty_impact?: string | number;
  test_qty_tensile?: string | number;
  has_test_data?: boolean;
};

export default function TestFeeManager() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [tableData, setTableData] = useState<TestFeeRow[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [colWidths, setColWidths] = useState<Record<TestFeeColumnKey, number>>(DEFAULT_COL_WIDTHS);
  const [isXlsxLoaded, setIsXlsxLoaded] = useState(false);

  const setColumnWidth = (key: TestFeeColumnKey, nextWidth: number) => {
    setColWidths((prev) => ({ ...prev, [key]: nextWidth }));
  };

  const renderReadonlyCell = (row: TestFeeRow, key: TestFeeColumnKey) => {
    if (key === 'heat_treatment_batch_no') {
      return (
        <span className="test-fee-readonly">
          {cellText(row.heat_treatment_batch_no)}
          {!row.has_test_data ? <ExclamationCircleOutlined className="test-fee-warn-icon" title="试验数据有缺失" /> : null}
        </span>
      );
    }
    if (key === 'specification') {
      return (
        <span className="test-fee-readonly" title={cellText(row.specification)}>
          {cellText(row.specification)}
        </span>
      );
    }
    if (key === 'item_no') {
      const value = row.item_no;
      return <span className="test-fee-readonly">{value === null || value === undefined || value === '' ? '' : cellText(value)}</span>;
    }
    return <span className="test-fee-readonly">{cellText(row[key])}</span>;
  };

  const renderEditableCell = (row: TestFeeRow, key: TestFeeColumnKey) => {
    if (key === 'test_qty_impact' || key === 'test_qty_tensile') {
      const isImpact = key === 'test_qty_impact';
      return (
        <input
          type="number"
          className="test-fee-input money"
          min={0}
          value={defaultTestQty(row, key)}
          placeholder={isImpact ? String(DEFAULT_TEST_QTY_IMPACT) : String(DEFAULT_TEST_QTY_TENSILE)}
          onChange={(e) => handleInputChange(row.id, key, e.target.value)}
        />
      );
    }
    return (
      <input
        type="number"
        className="test-fee-input money"
        value={cellText(row[key])}
        onChange={(e) => handleInputChange(row.id, key, e.target.value)}
      />
    );
  };

  const renderActionCell = (row: TestFeeRow) => (
    <div className="test-fee-action-cell">
      <button type="button" onClick={() => void handleSaveRow(row.id)} className="test-fee-btn success test-fee-action-btn">
        保存
      </button>
      <button type="button" onClick={() => handleDeleteRow(row.id)} className="test-fee-delete test-fee-action-btn">
        删除
      </button>
    </div>
  );

  const renderBodyCell = (row: TestFeeRow, col: TestFeeColumnDef) => {
    if (col.key === 'action') return renderActionCell(row);
    if (!col.editable) return renderReadonlyCell(row, col.key);
    return renderEditableCell(row, col.key);
  };

  // 动态加载支持样式的 Excel 导出库 (xlsx-js-style)
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    script.onload = () => setIsXlsxLoaded(true);
    document.body.appendChild(script);
  }, []);

  const formatTimestamp = () => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  };

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    return String(err || '未知错误');
  };

  const showInfoDialog = (title: string, content?: string) => {
    Modal.info({ title, content, okText: '确定' });
  };

  const showSuccessDialog = (title: string, content?: React.ReactNode) => {
    Modal.success({ title, content, okText: '确定' });
  };

  const showErrorDialog = (title: string, content?: string) => {
    Modal.error({ title, content, okText: '确定' });
  };

  // ==========================================
  // 第一步：提取试验日期
  // ==========================================
  const handleExtractDate = async () => {
    const processingModal = Modal.info({
      title: '试验日期提取中…',
      content: '正在根据热处理批号提取试验日期，请稍候。',
      okButtonProps: { disabled: true },
      closable: false,
      maskClosable: false,
    });
    try {
      const { ok, data } = await fetchPostJson<any>('/api/v1/finance/test-fee/extract-dates', {});
      processingModal.destroy();
      if (ok && data.status === 'success') {
        showSuccessDialog('试验日期提取成功', data.message);
      } else {
        showErrorDialog('试验日期提取失败', data?.message || '服务器未返回成功状态。');
      }
    } catch (err: any) {
      processingModal.destroy();
      if (isFetchGuardHandled(err)) return;
      showErrorDialog('试验日期提取失败', getErrorMessage(err));
    }
  };

  // ==========================================
  // 第二步：检索区间数据并组装
  // ==========================================
  const handleSearch = async () => {
    if (!startDate || !endDate) {
      showErrorDialog('无法检索', '请先选择开始日期和结束日期。');
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/v1/finance/test-fee/records?start_date=${startDate}&end_date=${endDate}`));
      const data = await res.json();
      
      if (data.status === 'success') {
        const normalized = (data.data || []).map((row: Record<string, unknown>) => ({
          ...row,
          test_qty_impact:
            row.test_qty_impact !== '' && row.test_qty_impact != null
              ? row.test_qty_impact
              : DEFAULT_TEST_QTY_IMPACT,
          test_qty_tensile:
            row.test_qty_tensile !== '' && row.test_qty_tensile != null
              ? row.test_qty_tensile
              : DEFAULT_TEST_QTY_TENSILE,
        }));
        setTableData(normalized);
        setCurrentPage(1);
        if (data.data.length === 0) {
          showInfoDialog('未找到数据', '未找到符合该日期区间的数据。');
        }
      } else {
        showErrorDialog('数据加载失败', data?.message || '服务器未返回成功状态。');
      }
    } catch (err: any) {
      if (isFetchGuardHandled(err)) return;
      showErrorDialog('数据加载失败', getErrorMessage(err));
    }
  };

  const handleInputChange = (id: string, field: string, value: string) => {
    setTableData(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleDeleteRow = (id: string) => {
    setTableData(prev => prev.filter(row => row.id !== id));
  };

  // ==========================================
  // 第三步：保存到数据库
  // ==========================================
  const defaultTestQty = (
    row: { test_qty_impact?: string | number; test_qty_tensile?: string | number },
    field: 'test_qty_impact' | 'test_qty_tensile'
  ): number => {
    const value = row[field];
    if (value !== '' && value !== null && value !== undefined) return Number(value);
    return field === 'test_qty_impact' ? DEFAULT_TEST_QTY_IMPACT : DEFAULT_TEST_QTY_TENSILE;
  };

  const prepareRecordForSave = (row: TestFeeRow): TestFeeRow => {
    const pickQty = (field: 'test_qty_impact' | 'test_qty_tensile', fallback: number) => {
      const value = row[field];
      if (value !== '' && value !== null && value !== undefined) return value;
      return fallback;
    };
    return {
      ...row,
      test_date: String(row.test_date ?? ''),
      material_no: String(row.material_no ?? ''),
      order_no: String(row.order_no ?? ''),
      heat_no: String(row.heat_no ?? ''),
      heat_treatment_batch_no: String(row.heat_treatment_batch_no ?? ''),
      test_qty_impact: pickQty('test_qty_impact', DEFAULT_TEST_QTY_IMPACT),
      test_qty_tensile: pickQty('test_qty_tensile', DEFAULT_TEST_QTY_TENSILE),
    };
  };

  const formatApiError = (data: { detail?: unknown; message?: string }) => {
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail.map((item: { msg?: string }) => item?.msg || JSON.stringify(item)).join('；');
    }
    return data?.message || '服务器未返回成功状态。';
  };

  const saveRecords = async (records: TestFeeRow[]) => {
    if (!records.length) {
      showInfoDialog('没有需要保存的数据', '请先检索并确认试验费用明细。');
      return;
    }
    const payload = records.map((row) => {
      const { has_test_data: _hasTestData, ...rest } = prepareRecordForSave(row);
      return rest;
    });
    try {
      const { ok, data } = await fetchPostJson<{ status?: string; message?: string; saved_count?: number; detail?: unknown }>(
        '/api/v1/finance/test-fee/save',
        { records: payload },
      );
      if (ok && data.status === 'success') {
        const count = data.saved_count ?? records.length;
        showSuccessDialog('保存成功', data.message || `已保存 ${count} 条试验费用记录`);
        await handleSearch();
      } else {
        showErrorDialog('保存失败', formatApiError(data));
      }
    } catch (err: unknown) {
      if (isFetchGuardHandled(err)) return;
      showErrorDialog('保存失败', getErrorMessage(err));
    }
  };

  const handleSave = async () => {
    await saveRecords(tableData);
  };

  const handleSaveRow = async (rowId: string) => {
    const row = tableData.find((item) => item.id === rowId);
    if (!row) {
      showErrorDialog('保存失败', '未找到当前行数据，请重新检索后再试。');
      return;
    }
    await saveRecords([row]);
  };

  const totalPages = Math.max(1, Math.ceil(tableData.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedData = tableData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ==========================================
  // 第四步：生成真实 Excel 表格 (带样式和边框)
  // ==========================================
  const handleExport = async () => {
    if (!isXlsxLoaded) {
      showInfoDialog('Excel 引擎加载中', '请稍后再试。');
      return;
    }
    if (!startDate || !endDate) {
      showErrorDialog('无法生成报表', '请先选择开始日期和结束日期。');
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/v1/finance/test-fee/saved-records?start_date=${startDate}&end_date=${endDate}`));
      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        showErrorDialog('处理失败', '读取试验费用表失败。');
        return;
      }

      const exportData: any[] = data.data || [];
      if (exportData.length === 0) {
        showErrorDialog('无法生成报表', '数据库中暂无该日期区间已保存的数据，请先保存。');
        return;
      }

      const directoryPath = await askSavePath('请输入试验费用表保存路径');
      if (directoryPath === null) return;

      const XLSX = (window as any).XLSX;
      const wb = XLSX.utils.book_new();

      // 第一行与第二行固定表头
      const row1 = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '实验数量', '', '取样费用Sampling fee', '', '试验费用 \nTest fee', ''];
      const row2 = ['物料号', '图纸号', '规格型号', '材质', '数量', '备注', '订单号', '条目', '炉号', '热处理批号', '屈服', '抗拉', '延伸', '断面收缩', '硬度', '冲击', '产品单价', '冲击 impact test', '拉伸 Tensile test', '冲击 impact test', '拉伸 Tensile test', '冲击 impact test', '拉伸 Tensile test'];

      const formatToExcelData = (dataList: any[]) => {
        const rows = dataList.map(row => [
          row.material_no, row.drawing_no, row.specification, row.material, row.quantity, row.remark, row.order_no, row.item_no, row.heat_no, row.heat_treatment_batch_no,
          row.yield_strength, row.tensile_strength, row.elongation, row.reduction_of_area, row.hardness, row.impact_work,
          row.product_unit_price, row.test_qty_impact, row.test_qty_tensile, row.sample_fee_impact, row.sample_fee_tensile, row.test_fee_impact, row.test_fee_tensile
        ]);
        return [row1, row2, ...rows];
      };

      // 划分数据
      const dalianData = exportData.filter(d => d.order_no.startsWith('4'));
      const franceData = exportData.filter(d => d.order_no.startsWith('2'));

      const addSheet = (dataArray: any[], sheetName: string) => {
        const ws = XLSX.utils.aoa_to_sheet(dataArray);
        
        // 合并第一行的单元格
        ws['!merges'] = [ 
          { s: { r: 0, c: 17 }, e: { r: 0, c: 18 } }, 
          { s: { r: 0, c: 19 }, e: { r: 0, c: 20 } }, 
          { s: { r: 0, c: 21 }, e: { r: 0, c: 22 } } 
        ];

        // 🌟 给非空单元格加边框 (核心代码)
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) continue;

            // 如果单元格有值，或者它是被合并的表头，就加边框
            if (ws[cellRef].v !== undefined && ws[cellRef].v !== null && String(ws[cellRef].v).trim() !== '') {
              ws[cellRef].s = {
                border: {
                  top: { style: "thin", color: { auto: 1 } },
                  bottom: { style: "thin", color: { auto: 1 } },
                  left: { style: "thin", color: { auto: 1 } },
                  right: { style: "thin", color: { auto: 1 } }
                },
                alignment: { vertical: "center", horizontal: "center", wrapText: true }
              };
            }
          }
        }
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      };

      addSheet(formatToExcelData(exportData), "总表");
      addSheet(formatToExcelData(franceData), "法国");
      addSheet(formatToExcelData(dalianData), "大连");

      const timestamp = formatTimestamp();
      const fileName = `${startDate}-${endDate} 试验费用整理_${timestamp}.xlsx`;
      const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const savedPath = await saveGeneratedBlob(blob, fileName, directoryPath);

      showSuccessDialog(
        '试验费用表生成成功',
        <div>
          <p>文件保存地址：</p>
          <p style={{ wordBreak: 'break-all' }}>{savedPath}</p>
          <p>文件名：</p>
          <p style={{ wordBreak: 'break-all' }}>{fileName}</p>
        </div>,
      );
    } catch (err: any) {
      if (isFetchGuardHandled(err)) return;
      showErrorDialog('处理失败', getErrorMessage(err));
    }
  };

  return (
    <div className="test-fee-page">
      <div className="test-fee-header">
        <div>
          <h2 className="test-fee-title">试验费用管理</h2>
          <div className="test-fee-subtitle">
            提取试验日期、核对试验数据、维护费用并生成三 Sheet Excel 报表
          </div>
        </div>
      </div>

      <div className="test-fee-steps">
        <section className="test-fee-step-card">
          <div className="test-fee-step-head">
            <span className="test-fee-step-no">1</span>
            <div>
              <div className="test-fee-step-title">取得日期</div>
              <div className="test-fee-step-desc">按两种热处理批号规则提取 YYMMDD，并写入订单明细的试验日期字段。</div>
            </div>
          </div>
          <div className="test-fee-step-body">
            <button onClick={handleExtractDate} className="test-fee-btn indigo">
              <SettingOutlined /> 取得试验日期
            </button>
          </div>
        </section>

        <section className="test-fee-step-card">
          <div className="test-fee-step-head">
            <span className="test-fee-step-no">2</span>
            <div>
              <div className="test-fee-step-title">区间检索</div>
              <div className="test-fee-step-desc">选择试验日期范围，加载订单明细并关联热处理试验数据。</div>
            </div>
          </div>
          <div className="test-fee-step-body">
            <div className="test-fee-toolbar">
              <div className="test-fee-field">
                <label>开始日期</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="test-fee-date" />
              </div>
              <div className="test-fee-field">
                <label>结束日期</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="test-fee-date" />
              </div>
              <button onClick={handleSearch} className="test-fee-btn primary">
                <SearchOutlined /> 确定检索
              </button>
            </div>
          </div>
        </section>

        <section className="test-fee-step-card">
          <div className="test-fee-step-head">
            <span className="test-fee-step-no">3</span>
            <div>
              <div className="test-fee-step-title">核对保存</div>
              <div className="test-fee-step-desc">基础订单信息与试验结果来自数据库检索（只读）；请编辑产品单价、实验数量及费用字段后保存。表头可拖动调节列宽。</div>
            </div>
          </div>
          <div className="test-fee-step-body">
            <div className="test-fee-table-card">
              <div className="test-fee-summary">
                <div>
                  <div className="test-fee-summary-title">试验费用明细</div>
                  <div className="test-fee-summary-meta">
                    共 {tableData.length} 条，每页 {PAGE_SIZE} 条，黄色行表示试验数据可能缺失
                  </div>
                </div>
                <div className="test-fee-summary-meta">
                  日期区间：{startDate || '未选择'} ~ {endDate || '未选择'}
                </div>
              </div>
              <div className="test-fee-table-wrap">
                <table
                  className="test-fee-table"
                  style={{ width: tableTotalWidth(colWidths), minWidth: tableTotalWidth(colWidths) }}
                >
                  <colgroup>
                    {TEST_FEE_COLUMNS.map((col) => (
                      <col key={col.key} style={{ width: colWidths[col.key] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="test-fee-group-header">
                      <ResizableTitle
                        rowSpan={2}
                        width={colWidths.material_no}
                        columnKey="material_no"
                        className="test-fee-group-header-sticky"
                        onResizeWidth={(nextWidth) => setColumnWidth('material_no', nextWidth)}
                      >
                        物料号
                      </ResizableTitle>
                      <th colSpan={9}>基础订单信息</th>
                      <th colSpan={6} className="test-fee-group-test">
                        试验结果数据
                      </th>
                      <th>产品单价</th>
                      <th colSpan={2} className="test-fee-group-qty">
                        实验数量
                      </th>
                      <th colSpan={2} className="test-fee-group-sample">
                        取样费用
                      </th>
                      <th colSpan={2} className="test-fee-group-fee">
                        试验费用
                      </th>
                      <ResizableTitle
                        rowSpan={2}
                        width={colWidths.action}
                        columnKey="action"
                        className="test-fee-group-header-sticky"
                        onResizeWidth={(nextWidth) => setColumnWidth('action', nextWidth)}
                      >
                        操作
                      </ResizableTitle>
                    </tr>
                    <tr className="test-fee-col-header-row">
                      {MIDDLE_COLUMNS.map((col) => (
                        <ResizableTitle
                          key={col.key}
                          width={colWidths[col.key]}
                          className={col.headerClass}
                          onResizeWidth={(nextWidth) => setColumnWidth(col.key, nextWidth)}
                        >
                          {col.title}
                        </ResizableTitle>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableData.length === 0 ? (
                      <tr>
                        <td colSpan={TEST_FEE_COLUMNS.length} className="test-fee-empty">
                          暂无数据，请设定日期并点击检索
                        </td>
                      </tr>
                    ) : (
                      pagedData.map((row) => (
                        <tr
                          key={row.id}
                          className={!row.has_test_data ? 'missing-test-data' : ''}
                          title={
                            !row.has_test_data
                              ? '试验数据有缺失，请在【热处理与测试】模块查询试验记录是否提交'
                              : undefined
                          }
                        >
                          {TEST_FEE_COLUMNS.map((col) => (
                            <td
                              key={col.key}
                              className={[
                                stickyColumnClass(col.key),
                                !col.editable && col.key !== 'action' ? 'test-fee-cell-readonly' : '',
                                col.key === 'action' ? 'test-fee-cell-action' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            >
                              {renderBodyCell(row, col)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {tableData.length > 0 ? (
                <div className="test-fee-pagination">
                  <Pagination
                    current={safePage}
                    pageSize={PAGE_SIZE}
                    total={tableData.length}
                    showSizeChanger={false}
                    showTotal={(total) => `共 ${total} 条`}
                    onChange={(page) => setCurrentPage(page)}
                  />
                </div>
              ) : null}
            </div>
            <div className="test-fee-bottom-actions">
              <button onClick={handleSave} disabled={tableData.length === 0} className="test-fee-btn success">
                <SaveOutlined /> 保存到试验费用表
              </button>
            </div>
          </div>
        </section>

        <section className="test-fee-step-card">
          <div className="test-fee-step-head">
            <span className="test-fee-step-no">4</span>
            <div>
              <div className="test-fee-step-title">导出报表</div>
              <div className="test-fee-step-desc">从数据库读取已保存数据，生成【总表】【法国】【大连】三个 Sheet 的 Excel。</div>
            </div>
          </div>
          <div className="test-fee-step-body">
            <div className="test-fee-step-actions">
              <button onClick={handleExport} className="test-fee-btn warning">
                <DownloadOutlined /> 生成试验费用表 (Excel)
              </button>
            </div>
          </div>
        </section>
      </div>
      
      <div className="test-fee-help">
        <div className="test-fee-help-title">页面操作说明</div>
        <div>
          <p><b>第一步：</b>点击右上角【取得试验日期】，系统将自动从所有的热处理批号中提取出试验日期（如 MY26012101 会提取为 260121/MY20260121-2 会提取为 260121）。</p>
          <p><b>第二步：</b>设定上方【开始日期】与【结束日期】区间，点击【确定检索】，即可加载出该时间段内的所有明细，系统会自动关联机械测试结果。</p>
          <p><b>第三步：</b>基础订单信息与试验结果为只读；请填写产品单价、实验数量及取样/试验费用。表头列宽可拖动调节。完成后点击【保存】或底部【保存到试验费用表】。</p>
          <p><b>第四步：</b>点击底部【生成试验费用表 (Excel)】按钮，即可将您刚刚保存的数据分拣为总表、法国、大连 3 个 Sheet页</p>
        </div>
      </div>
    </div>
  );
}
