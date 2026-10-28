import { useEffect, useState } from 'react'

/** 暂无待办时收起；出现待办后自动展开，之后尊重用户手动展开/收起。 */
export function useCollapseWhenEmpty(count: number, openKey: string) {
  const [activeKey, setActiveKey] = useState<string[]>([])

  useEffect(() => {
    setActiveKey((prev) => {
      if (count <= 0) return []
      if (prev.length === 0) return [openKey]
      return prev
    })
  }, [count, openKey])

  return {
    activeKey,
    onChange: (keys: string | string[]) => {
      setActiveKey(Array.isArray(keys) ? keys : keys ? [keys] : [])
    },
  }
}
