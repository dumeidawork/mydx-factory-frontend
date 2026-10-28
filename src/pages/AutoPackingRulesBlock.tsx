import styles from './WorkflowPages.module.css'

export default function AutoPackingRulesBlock({ scope }: { scope: 'france' | 'dalian' }) {
  return (
    <div className={styles.opGuideBlock}>
      <div className={styles.opGuideLabel}>自动装箱规则</div>
      <ul className={styles.opGuideList}>
        {scope === 'france' ? (
          <>
            <li>按订单号读取法国客户箱单上的数量。</li>
            <li>每托件数优先用「物料-数量/托」对照表，没有对照时再用客户箱单上的每托数量。都没有、且 DN 大于等于 450 时按每托 2 件；否则须手填每托数量后才能提交。</li>
          </>
        ) : (
          <>
            <li>按预定到货日读取预定数量大于 0 的发货预定，装箱数量用预定数量。</li>
            <li>每托件数用本页「物料-数量/托」页签里的对照，不读法国那张表。没有对照、且 DN 大于等于 450 时按每托 2 件；否则不能写入发货明细。</li>
            <li>规格里取不到 DN 时，停在预览并提示缺项，不写入发货明细。</li>
          </>
        )}
        <li>托盘净空约 1150×750 mm。单箱重量上限 500 kg。默认箱重 20 kg，围栏高 200 mm。</li>
        <li>先按每托件数装满整托，剩余尾数再单独成箱。满托件数与对照表一致，尾箱可以不满托。</li>
        <li>同一物料号可以放在同一箱。碳钢不能和不锈钢同箱。同一 DN、法兰类型不同的不能同箱。304 与 316 在部分条件下可以同箱。</li>
        <li>高颈法兰按图纸外径和口部尺寸计算一箱能排几件，排开长度不超过 1150 mm。外径大于 575 mm 时改用实木托盘。没有图纸外径时不做这项约束。</li>
        {scope === 'france' ? (
          <li>预览不写数据库。确认后写入装箱明细，可再生成装箱单。</li>
        ) : (
          <li>预览不写数据库。保存时只把箱号写入发货明细的包装序号，不保存长宽高、箱重和托盘类型。</li>
        )}
      </ul>
    </div>
  )
}
