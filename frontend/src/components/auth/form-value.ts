/**
 * Value of an auth form field, read from the DOM at submit time (by id, no
 * `name`: nothing would end up in a URL). The inputs are uncontrolled, so what
 * the user typed before hydration is kept instead of being lost or truncated.
 */
export function formValue(form: HTMLFormElement, id: string): string {
  const el = form.elements.namedItem(id);
  return el instanceof HTMLInputElement ? el.value : "";
}
