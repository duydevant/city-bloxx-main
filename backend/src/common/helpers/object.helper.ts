type Trim<T> = {
  [P in keyof T]: T[P] extends string ? string : T[P] extends object ? Trim<T[P]> : T[P];
};

export function trimObject<T extends object>(obj: T): Trim<T> {
  const result = Object.keys(obj).reduce<Record<string, unknown>>((acc, key) => {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === 'string') {
      acc[key] = value.trim();
    } else if (value && typeof value === 'object') {
      acc[key] = trimObject(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});
  return result as Trim<T>;
}
