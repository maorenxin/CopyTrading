export async function query<T>(..._args: any[]): Promise<{ rows: T[] }> {
  throw new Error("Database not available in standalone mode");
}

export async function withTransaction<T>(
  _fn: (client: any) => Promise<T>,
): Promise<T> {
  throw new Error("Database not available in standalone mode");
}
