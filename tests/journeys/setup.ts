class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

const memoryStorage = new MemoryStorage();

function installMemoryStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: memoryStorage,
  });
}

installMemoryStorage();

beforeEach(() => {
  memoryStorage.clear();
  installMemoryStorage();
});
