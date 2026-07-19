/// <reference types="vite/client" />



export {}



declare global {

  interface Window {

    erp?: {

      saveGeneratedFile: (payload: {

        fileName: string

        directoryPath: string

        arrayBuffer: ArrayBuffer

      }) => Promise<{ ok: boolean; path?: string; error?: string }>

      convertDocxToPdf: (payload: {

        docxPath: string

        pdfPath: string

        allowedDirectory?: string

      }) => Promise<{ ok: boolean; path?: string; error?: string }>

      deleteFile: (payload: {

        filePath: string

        allowedDirectory: string

      }) => Promise<{ ok: boolean; path?: string; error?: string }>

      runWordPdfBat: (payload: {

        directoryPath: string

        timeoutMs?: number

      }) => Promise<{ ok: boolean; converted?: string[]; error?: string }>

    }

  }

}

