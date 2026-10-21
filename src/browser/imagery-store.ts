import type { ImageryEffects } from '../core/imagery'

import { fetchFromService } from './service'

/**
 * Where a Site's picture is kept between visits, and how it is fetched.
 *
 * IndexedDB rather than localStorage because a picture is megabytes, and
 * indefinite rather than expiring because the service's own cache lasts twelve
 * hours while a Site is meant to keep working with no signal long after that.
 *
 * Deliberately untested, along with the other adapters: a test here would be
 * testing IndexedDB rather than this app, and defects in it show up the moment
 * anyone opens a Site twice.
 */

const DATABASE = 'lotplanner'
const STORE = 'imagery'

let opening: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB would not open'))
    }
  })

  return opening
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const request = work(database.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => {
          resolve(request.result as T)
        }
        request.onerror = () => {
          reject(request.error ?? new Error('IndexedDB request failed'))
        }
      }),
  )
}

export async function readCachedImage(url: string): Promise<Blob | undefined> {
  const stored: unknown = await run('readonly', (store) => store.get(url))
  return stored instanceof Blob ? stored : undefined
}

export async function writeCachedImage(url: string, image: Blob): Promise<void> {
  await run('readwrite', (store) => store.put(image, url))
}

export async function fetchImage(url: string): Promise<Blob> {
  return await (await fetchFromService(url)).blob()
}

export const imageryEffects: ImageryEffects = {
  fetchImage,
  readCache: readCachedImage,
  writeCache: writeCachedImage,
}
