export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.src = url
  iframe.setAttribute('title', '标签打印')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  await new Promise<void>((resolve, reject) => {
    const cleanupLater = () => {
      window.setTimeout(() => {
        iframe.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
    }
    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) {
        iframe.remove()
        URL.revokeObjectURL(url)
        reject(new Error('无法打开打印预览'))
        return
      }
      try {
        win.focus()
        win.print()
        cleanupLater()
        resolve()
      } catch (err) {
        iframe.remove()
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    window.setTimeout(() => {
      if (!iframe.contentWindow) {
        iframe.remove()
        URL.revokeObjectURL(url)
        reject(new Error('打印预览超时'))
      }
    }, 8000)
  })
}
