import { getAuthHeadersConfig, toAuthHeaderFormValues } from './headers';

describe('getAuthHeadersConfig', () => {
  it('serializes admin and user rows, trimming names', () => {
    expect(
      getAuthHeadersConfig({
        auth_type: 'service_http',
        auth_headers: [
          { name: ' X-Org-Id ', value: 'org-123', source: 'admin' },
          { name: 'X-User-Token', value: 'ignored', source: 'user' },
        ],
      }),
    ).toEqual([
      { name: 'X-Org-Id', source: 'admin', value: 'org-123' },
      { name: 'X-User-Token', source: 'user' },
    ]);
  });

  it('omits a blank admin value so the stored one is kept', () => {
    expect(
      getAuthHeadersConfig({
        auth_type: 'service_http',
        auth_headers: [{ name: 'X-Org-Id', value: '', source: 'admin' }],
      }),
    ).toEqual([{ name: 'X-Org-Id', source: 'admin' }]);
  });

  it('drops unnamed rows and returns undefined when none remain', () => {
    expect(
      getAuthHeadersConfig({
        auth_type: 'service_http',
        auth_headers: [{ name: '  ', value: 'orphan', source: 'admin' }],
      }),
    ).toBeUndefined();
  });

  it('does not send headers for another authentication type', () => {
    expect(
      getAuthHeadersConfig({
        auth_type: 'oauth',
        auth_headers: [{ name: 'X-Org-Id', value: 'stale', source: 'admin' }],
      }),
    ).toBeUndefined();
  });
});

describe('toAuthHeaderFormValues', () => {
  it('restores names and sources without values', () => {
    expect(
      toAuthHeaderFormValues([
        { name: 'X-Org-Id', source: 'admin' },
        { name: 'X-User-Token', source: 'user' },
      ]),
    ).toEqual([
      { name: 'X-Org-Id', source: 'admin', value: '' },
      { name: 'X-User-Token', source: 'user', value: '' },
    ]);
  });
});
