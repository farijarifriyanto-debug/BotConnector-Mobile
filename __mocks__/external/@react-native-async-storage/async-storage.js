// In-memory AsyncStorage mock shared via jest.config moduleNameMapper.
// IMPORTANT: this file must NOT import
// `@react-native-async-storage/async-storage/jest/async-storage-mock` —
// moduleNameMapper matches that subpath to THIS file (keys are unanchored
// regexes), which used to create a circular import and left the default
// export undefined.
const values = new Map();

const getItem = jest.fn(async key =>
  values.has(key) ? values.get(key) : null,
);
const setItem = jest.fn(async (key, value) => {
  values.set(key, String(value));
});
const removeItem = jest.fn(async key => {
  values.delete(key);
});
const multiGet = jest.fn(async keys =>
  keys.map(key => [key, values.has(key) ? values.get(key) : null]),
);
const multiSet = jest.fn(async pairs => {
  for (const [key, value] of pairs) {
    values.set(key, String(value));
  }
});
const multiRemove = jest.fn(async keys => {
  for (const key of keys) {
    values.delete(key);
  }
});
const getAllKeys = jest.fn(async () => [...values.keys()]);
const clear = jest.fn(async () => {
  values.clear();
});
const mergeItem = jest.fn(async (key, value) => {
  const current = values.has(key) ? values.get(key) : null;
  try {
    const parsedCurrent = JSON.parse(current ?? '{}');
    const parsedValue = JSON.parse(value);
    values.set(key, JSON.stringify({...parsedCurrent, ...parsedValue}));
  } catch {
    values.set(key, String(value));
  }
});

const mock = {
  getItem,
  setItem,
  removeItem,
  multiGet,
  multiSet,
  multiRemove,
  getAllKeys,
  clear,
  mergeItem,
};

export default mock;
export {
  getItem,
  setItem,
  removeItem,
  multiGet,
  multiSet,
  multiRemove,
  getAllKeys,
  clear,
  mergeItem,
};

export function __resetMockStorage() {
  values.clear();
}
