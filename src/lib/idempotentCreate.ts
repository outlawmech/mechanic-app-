/**
 * Recover an insert whose response may have been lost before retrying it.
 * Callers keep the same id for the whole form submission attempt.
 */
export async function createOrRecoverById<T>(
  id: string,
  mayAlreadyExist: boolean,
  findById: (id: string) => Promise<T | null>,
  insert: () => Promise<T | null>,
): Promise<T> {
  if (mayAlreadyExist) {
    const existing = await findById(id);
    if (existing) return existing;
  }

  const created = await insert();
  if (!created) throw new Error('The server did not confirm the record was saved.');
  return created;
}
