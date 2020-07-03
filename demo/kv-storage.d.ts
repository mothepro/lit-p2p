/** @spec https://wicg.github.io/kv-storage/ */
declare module 'std:kv-storage' {

  /** @type https://wicg.github.io/kv-storage/#KVStorageArea-set */
  type Key =
    number |
    string |
    Date |
    ArrayBuffer |
    DataView |
    Key[]

  /** @type https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeforstorage */
  type Value =
    void |
    boolean |
    number |
    string |
    Date |
    ArrayBuffer |
    DataView |
    Value[] |
    object

  export class storageArea {
    set(key: Key, value: Value): Promise<void>
    get(key: Key): Promise<Value>
    delete(key: Key): Promise<void>
    clear(): Promise<void>

    [Symbol.asyncIterator](): AsyncIterableIterator<[Key, Value]>
    entries(): AsyncIterableIterator<[Key, Value]>
    values(): AsyncIterableIterator<Value>
    keys(): AsyncIterableIterator<Key>
  }

  const storageInstance: InstanceType<typeof storageArea>

  export default storageInstance

  export const backingStore: {
    database: string
    store: "store"
    version: 1
  }
}
