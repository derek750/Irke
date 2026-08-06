import { chunkDoc } from './context/chunk'
import type { AnswerBankEntry, ContextChunk, ContextDoc, ContextSource } from './types'

const DB_NAME = 'irke'
/** v3: chunks may carry optional `embedding` / `embeddedAt` (no new stores). */
const DB_VERSION = 3

export const STORE_DOCS = 'context_docs'
export const STORE_CHUNKS = 'context_chunks'
export const STORE_ANSWERS = 'answer_bank'

/** v1 stores, kept only so an upgrade can drop them. Their records used the old profile-era shape. */
const LEGACY_STORES = ['brain_docs', 'brain_chunks']

type StoreName = typeof STORE_DOCS | typeof STORE_CHUNKS | typeof STORE_ANSWERS

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      for (const legacy of LEGACY_STORES) {
        if (db.objectStoreNames.contains(legacy)) db.deleteObjectStore(legacy)
      }

      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        const docs = db.createObjectStore(STORE_DOCS, { keyPath: 'id' })
        docs.createIndex('source', 'source')
      }
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

export async function putDoc(doc: ContextDoc): Promise<void> {
  await withStore(STORE_DOCS, 'readwrite', (store) => promisify(store.put(doc)))
}

export async function listDocs(): Promise<ContextDoc[]> {
  const docs = await withStore(STORE_DOCS, 'readonly', (store) =>
    promisify(store.getAll() as IDBRequest<ContextDoc[]>),
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

export async function replaceChunksForDoc(docId: string, chunks: ContextChunk[]): Promise<void> {
  await withStore(STORE_CHUNKS, 'readwrite', async (store) => {
    const keys = await promisify(store.index('docId').getAllKeys(docId))
    await Promise.all(keys.map((key) => promisify(store.delete(key as IDBValidKey))))
    await Promise.all(chunks.map((chunk) => promisify(store.put(chunk))))
  })
}

export async function saveDoc(doc: ContextDoc): Promise<void> {
  await putDoc(doc)
  await replaceChunksForDoc(doc.id, chunkDoc(doc))
}

/**
 * A sync is authoritative for its source: files removed from the Drive folder or repos the user
 * unchecked disappear here too, so the index never drifts from what the connection actually covers.
 */
export async function replaceDocsForSource(source: ContextSource, docs: ContextDoc[]): Promise<void> {
  const existing = await withStore(STORE_DOCS, 'readonly', (store) =>
    promisify(store.index('source').getAllKeys(source)),
  )
  for (const key of existing) await deleteDocAndChunks(key as string)
  for (const doc of docs) await saveDoc(doc)
}

export async function listChunks(): Promise<ContextChunk[]> {
  return withStore(STORE_CHUNKS, 'readonly', (store) =>
    promisify(store.getAll() as IDBRequest<ContextChunk[]>),
  )
}

/** Upsert chunks in place (used after embedding so we do not re-chunk). */
export async function putChunks(chunks: ContextChunk[]): Promise<void> {
  if (!chunks.length) return
  await withStore(STORE_CHUNKS, 'readwrite', async (store) => {
    await Promise.all(chunks.map((chunk) => promisify(store.put(chunk))))
  })
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
