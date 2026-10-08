import type { MCPAuthHeader, MCPOptions } from 'librechat-data-provider';

export interface AuthHeaderFormValue {
  name: string;
  value: string;
  source: MCPAuthHeader['source'];
}

interface AuthHeadersFormConfig {
  auth_type: string;
  auth_headers?: AuthHeaderFormValue[];
}

/** Rows for the edit form; stored values are never pre-filled. */
export function toAuthHeaderFormValues(
  authHeaders: MCPOptions['authHeaders'] | undefined,
): AuthHeaderFormValue[] {
  return (authHeaders ?? []).map(({ name, source }) => ({ name, source, value: '' }));
}

/**
 * Serializes the additional header rows. A blank admin value is omitted so the server keeps the
 * stored one; rows without a name are dropped.
 */
export function getAuthHeadersConfig(
  auth: AuthHeadersFormConfig,
): MCPOptions['authHeaders'] | undefined {
  if (auth.auth_type !== 'service_http') {
    return undefined;
  }

  const headers: MCPAuthHeader[] = [];
  for (const { name, value, source } of auth.auth_headers ?? []) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      continue;
    }
    headers.push({
      name: trimmedName,
      source,
      ...(source === 'admin' && value && { value }),
    });
  }

  return headers.length > 0 ? headers : undefined;
}
