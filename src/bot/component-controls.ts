export type StoredComponent = {
  type?: number;
  custom_id?: string;
  disabled?: boolean;
  url?: string;
  options?: Array<{ value?: string }>;
  components?: StoredComponent[];
};

/** The button or menu on a message with this custom id. */
export function findControl(rows: StoredComponent[] | undefined, customId: string): StoredComponent | null {
  if (!customId) return null;
  for (const row of rows ?? []) {
    const children = row.components && row.components.length > 0 ? row.components : [row];
    for (const component of children) {
      if (component.custom_id === customId) return component;
    }
  }
  return null;
}

/** True when every chosen value is one of that menu's options. */
export function acceptedValues(control: StoredComponent, values: string[]): boolean {
  if (control.disabled || values.length === 0 || values.length > 25) return false;
  const allowed = new Set(
    (control.options ?? []).map((option) => option.value).filter((value): value is string => Boolean(value)),
  );
  return values.every((value) => allowed.has(value));
}
