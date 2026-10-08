/**
 * @jest-environment @happy-dom/jest-environment
 */
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import {
  setCloudflareChallengeSolver,
  CLOUDFLARE_CHALLENGE_TOKEN_HEADER,
} from '../src/cloudflareChallenge';
import { setTokenHeader } from '../src/headers-helpers';

/**
 * The interceptors in request.ts register at import time when `typeof window !== 'undefined'`
 * (happy-dom provides window). The axios adapter is mocked to stand in for the network, and
 * `fetch` is spied on for `authenticatedFetch`.
 */

const mockAdapter = jest.fn();
let originalAdapter: typeof axios.defaults.adapter;
let dataRequest: typeof import('../src/request').default;

function challengeError(config: InternalAxiosRequestConfig) {
  return Promise.reject({
    response: {
      status: 403,
      headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' },
      data: '<html>Just a moment...</html>',
    },
    config,
  });
}

function ok(config: InternalAxiosRequestConfig, data: unknown = { ok: true }) {
  return Promise.resolve({ data, status: 200, headers: {}, config });
}

const isRetry = (config: InternalAxiosRequestConfig) =>
  Boolean(config.headers?.[CLOUDFLARE_CHALLENGE_TOKEN_HEADER]);

const challengeResponse = () =>
  new Response('<html>Just a moment...</html>', {
    status: 403,
    headers: { 'cf-mitigated': 'challenge', 'Content-Type': 'text/html' },
  });

beforeAll(async () => {
  originalAdapter = axios.defaults.adapter;
  axios.defaults.adapter = mockAdapter;
  dataRequest = (await import('../src/request')).default;
});

beforeEach(() => {
  mockAdapter.mockReset();
  setTokenHeader('token');
});

afterEach(() => {
  setCloudflareChallengeSolver(null);
  delete axios.defaults.headers.common['Authorization'];
  jest.restoreAllMocks();
});

afterAll(() => {
  axios.defaults.adapter = originalAdapter;
});

describe('Cloudflare managed challenges — axios', () => {
  it('retries a challenged request with the token once the solver resolves', async () => {
    const solver = jest.fn().mockResolvedValue('turnstile-token');
    setCloudflareChallengeSolver(solver);
    mockAdapter.mockImplementation((config: InternalAxiosRequestConfig) =>
      isRetry(config) ? ok(config) : challengeError(config),
    );

    const response = await axios.post('/api/files', new FormData());

    expect(response.data).toEqual({ ok: true });
    expect(solver).toHaveBeenCalledTimes(1);
    expect(mockAdapter).toHaveBeenCalledTimes(2);
    expect(mockAdapter.mock.calls[1][0].headers[CLOUDFLARE_CHALLENGE_TOKEN_HEADER]).toBe(
      'turnstile-token',
    );
  });

  it('shares one prompt between requests challenged at the same time', async () => {
    let resolveSolver!: (token: string) => void;
    const solver = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSolver = resolve;
        }),
    );
    setCloudflareChallengeSolver(solver);
    mockAdapter.mockImplementation((config: InternalAxiosRequestConfig) =>
      isRetry(config) ? ok(config, { url: config.url }) : challengeError(config),
    );

    const first = axios.get('/api/a');
    const second = axios.get('/api/b');
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveSolver('turnstile-token');

    const responses = await Promise.all([first, second]);
    expect(responses.map((r) => r.data.url)).toEqual(['/api/a', '/api/b']);
    expect(solver).toHaveBeenCalledTimes(1);
  });

  it('rejects with the challenge response when no solver is registered', async () => {
    mockAdapter.mockImplementation(challengeError);

    await expect(axios.get('/api/files')).rejects.toMatchObject({ response: { status: 403 } });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('rejects with the challenge response when the challenge is cancelled', async () => {
    setCloudflareChallengeSolver(() => Promise.reject(new Error('cancelled')));
    mockAdapter.mockImplementation(challengeError);

    await expect(axios.get('/api/files')).rejects.toMatchObject({ response: { status: 403 } });
    expect(mockAdapter).toHaveBeenCalledTimes(1);
  });

  it('does not prompt again when the retried request is challenged too', async () => {
    const solver = jest.fn().mockResolvedValue('turnstile-token');
    setCloudflareChallengeSolver(solver);
    mockAdapter.mockImplementation(challengeError);

    await expect(axios.get('/api/files')).rejects.toMatchObject({ response: { status: 403 } });
    expect(solver).toHaveBeenCalledTimes(1);
    expect(mockAdapter).toHaveBeenCalledTimes(2);
  });

  it('leaves a 403 without `cf-mitigated: challenge` alone', async () => {
    const solver = jest.fn().mockResolvedValue('turnstile-token');
    setCloudflareChallengeSolver(solver);
    mockAdapter.mockImplementation((config: InternalAxiosRequestConfig) =>
      Promise.reject({ response: { status: 403, headers: {}, data: {} }, config }),
    );

    await expect(axios.get('/api/files')).rejects.toMatchObject({ response: { status: 403 } });
    expect(solver).not.toHaveBeenCalled();
  });
});

describe('Cloudflare managed challenges — authenticatedFetch', () => {
  it('retries a challenged fetch with the token, keeping its other headers', async () => {
    const solver = jest.fn().mockResolvedValue('turnstile-token');
    setCloudflareChallengeSolver(solver);
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(challengeResponse())
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    const body = new FormData();

    const response = await dataRequest.authenticatedFetch('/api/files', {
      method: 'POST',
      body,
      headers: { Accept: 'text/event-stream' },
    });

    expect(response.status).toBe(200);
    expect(solver).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retried = fetchSpy.mock.calls[1][1];
    const retriedHeaders = new Headers(retried?.headers);
    expect(retried?.body).toBe(body);
    expect(retriedHeaders.get(CLOUDFLARE_CHALLENGE_TOKEN_HEADER)).toBe('turnstile-token');
    expect(retriedHeaders.get('Authorization')).toBe('Bearer token');
    expect(retriedHeaders.get('Accept')).toBe('text/event-stream');
  });

  it('returns the challenge response when the challenge is cancelled', async () => {
    setCloudflareChallengeSolver(() => Promise.reject(new Error('cancelled')));
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(challengeResponse());

    const response = await dataRequest.authenticatedFetch('/api/files', { method: 'POST' });

    expect(response.status).toBe(403);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a fetch whose body was a stream', async () => {
    const solver = jest.fn().mockResolvedValue('turnstile-token');
    setCloudflareChallengeSolver(solver);
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(challengeResponse());

    const response = await dataRequest.authenticatedFetch('/api/files', {
      method: 'POST',
      body: new ReadableStream(),
    });

    expect(response.status).toBe(403);
    expect(solver).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
