import type { AnswerBankEntry, BrainChunk, BrainDoc } from './types'

const DB_NAME = 'irke'
const DB_VERSION = 1

export const STORE_DOCS = 'brain_docs'
export const STORE_CHUNKS = 'brain_chunks'
export const STORE_ANSWERS = 'answer_bank'

type StoreName = typeof STORE_DOCS | typeof STORE_CHUNKS | typeof STORE_ANSWERS

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_DOCS)) db.createObjectStore(STORE_DOCS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const chunks = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' })
        chunks.createIndex('docId', 'docId')
      }
      if (!db.objectStoreNames.contains(STORE_ANSWERS)) {
        const answers = db.createObjectStore(STORE_ANSWERS, { keyPath: 'id' })
        answers.createIndex('fingerprint', 'fingerprint', { unique: true })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Failed to open Irke database'))
  })

  return dbPromise
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function withStore<T>(
  name: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb()
  const tx = db.transaction(name, mode)
  const result = await run(tx.objectStore(name))
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
  return result
}

export async function putDoc(doc: BrainDoc): Promise<void> {
  await withStore(STORE_DOCS, 'readwrite', (store) => promisify(store.put(doc)))
}

export async function listDocs(): Promise<BrainDoc[]> {
  const docs = await withStore(STORE_DOCS, 'readonly', (store) =>
    promisify(store.getAll() as IDBRequest<BrainDoc[]>),
  )
  return docs.sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteDocAndChunks(docId: string): Promise<void> {
  await withStore(STORE_DOCS, 'readwrite', (store) => promisify(store.delete(docId)))
  await withStore(STORE_CHUNKS, 'readwrite', async (store) => {
    const keys = await promisify(store.index('docId').getAllKeys(docId))
    await Promise.all(keys.map((key) => promisify(store.delete(key as IDBValidKey))))
  })
}

export async function replaceChunksForDoc(docId: string, chunks: BrainChunk[]): Promise<void> {
  await withStore(STORE_CHUNKS, 'readwrite', async (store) => {
    const keys = await promisify(store.index('docId').getAllKeys(docId))
    await Promise.all(keys.map((key) => promisify(store.delete(key as IDBValidKey))))
    await Promise.all(chunks.map((chunk) => promisify(store.put(chunk))))
  })
}

export async function listChunks(): Promise<BrainChunk[]> {
  return withStore(STORE_CHUNKS, 'readonly', (store) =>
    promisify(store.getAll() as IDBRequest<BrainChunk[]>),
  )
}

export async function findAnswer(fingerprint: string): Promise<AnswerBankEntry | null> {
  const match = await withStore(STORE_ANSWERS, 'readonly', (store) =>
    promisify(store.index('fingerprint').get(fingerprint) as IDBRequest<AnswerBankEntry | undefined>),
  )
  return match ?? null
}

export async function putAnswer(entry: AnswerBankEntry): Promise<void> {
  await withStore(STORE_ANSWERS, 'readwrite', (store) => promisify(store.put(entry)))
}

export async function listAnswers(): Promise<AnswerBankEntry[]> {
  const answers = await withStore(STORE_ANSWERS, 'readonly', (store) =>
    promisify(store.getAll() as IDBRequest<AnswerBankEntry[]>),
  )
  return answers.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteAnswer(id: string): Promise<void> {
  await withStore(STORE_ANSWERS, 'readwrite', (store) => promisify(store.delete(id)))
}
