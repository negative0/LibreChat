import { getApiKeyHeaderName, getAuthHeaderVarName } from 'librechat-data-provider';
import type { MCPAuthHeader, MCPOptions } from 'librechat-data-provider';

type ApiKeyConfig = Partial<NonNullable<MCPOptions['apiKey']>> | null | undefined;
/** Loosened like `apiKey`: raw (pre-inspection) configs carry optional header fields. */
type AuthHeadersConfig = ReadonlyArray<Partial<MCPAuthHeader>> | null | undefined;
type HeaderMap = Record<string, string | undefined> | null | undefined;

interface InjectedHeader {
  name: string;
  value: string;
}

/** Recognizes only server-generated API key fields, not similarly named explicit variables. */
export function isGeneratedUserApiKeyVariable(name: string): boolean {
  return /^MCP_API_KEY(?:_[a-f0-9]{64})?$/.test(name);
}

/** Recognizes the server-generated field holding a user's value for one auth header. */
export function isGeneratedAuthHeaderVariable(variable: string, headerName: string): boolean {
  return new RegExp(`^${getAuthHeaderVarName(headerName)}(?:_[a-f0-9]{64})?$`).test(variable);
}

function hasHeader(headers: HeaderMap, name: string): boolean {
  const lowered = name.toLowerCase();
  return headers != null && Object.keys(headers).some((key) => key.toLowerCase() === lowered);
}

/** The header injected by an operator-provided API key, before placeholder resolution. */
export function getAdminApiKeyHeader(apiKey: ApiKeyConfig): InjectedHeader | undefined {
  if (apiKey?.source !== 'admin' || !apiKey.key) {
    return;
  }
  const { key, authorization_type } = apiKey;
  const name = getApiKeyHeaderName(apiKey);
  const prefixes = { basic: 'Basic ', bearer: 'Bearer ', custom: '' };
  const prefix = prefixes[authorization_type ?? 'custom'];
  return { name, value: `${prefix}${key}` };
}

/** Headers injected by operator-provided `authHeaders` values, before placeholder resolution. */
export function getAdminAuthHeaders(authHeaders: AuthHeadersConfig): InjectedHeader[] {
  const injected: InjectedHeader[] = [];
  for (const { name, value, source } of authHeaders ?? []) {
    if (source === 'admin' && name && value) {
      injected.push({ name, value });
    }
  }
  return injected;
}

/** Sets each injected header, replacing any existing entry whose name differs only in case. */
export function injectHeaders(
  headers: Record<string, string> | undefined,
  injected: InjectedHeader[],
): Record<string, string> | undefined {
  if (injected.length === 0) {
    return headers;
  }
  const replaced = new Set(injected.map(({ name }) => name.toLowerCase()));
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!replaced.has(name.toLowerCase())) {
      result[name] = value;
    }
  }
  for (const { name, value } of injected) {
    result[name] = value;
  }
  return result;
}

/** A shadowed catalog credential must not be injected or required by a chat connection. */
export function isApiKeyHeaderOverridden(
  apiKey: ApiKeyConfig,
  requestHeaders?: HeaderMap,
): boolean {
  const injected = apiKey?.source === 'user' || getAdminApiKeyHeader(apiKey) != null;
  return injected && hasHeader(requestHeaders, getApiKeyHeaderName(apiKey ?? undefined));
}

/** Auth headers not shadowed by an operator's chat-only `requestHeaders`. */
export function getEffectiveAuthHeaders<T extends Partial<MCPAuthHeader>>(
  authHeaders: readonly T[] | null | undefined,
  requestHeaders?: HeaderMap,
): T[] | undefined {
  return authHeaders?.filter(({ name }) => !name || !hasHeader(requestHeaders, name));
}

/** Generated customUserVars whose header a chat-only `requestHeaders` entry shadows. */
export function getShadowedGeneratedVars(config: {
  apiKey?: ApiKeyConfig;
  authHeaders?: AuthHeadersConfig;
  requestHeaders?: HeaderMap;
  customUserVars?: Record<string, unknown> | null;
}): string[] {
  const shadowedHeaders: string[] = [];
  for (const { source, name } of config.authHeaders ?? []) {
    if (source === 'user' && name && hasHeader(config.requestHeaders, name)) {
      shadowedHeaders.push(name);
    }
  }
  const apiKeyShadowed =
    config.apiKey?.source === 'user' &&
    isApiKeyHeaderOverridden(config.apiKey, config.requestHeaders);
  if (shadowedHeaders.length === 0 && !apiKeyShadowed) {
    return [];
  }
  return Object.keys(config.customUserVars ?? {}).filter(
    (variable) =>
      (apiKeyShadowed && isGeneratedUserApiKeyVariable(variable)) ||
      shadowedHeaders.some((name) => isGeneratedAuthHeaderVariable(variable, name)),
  );
}
