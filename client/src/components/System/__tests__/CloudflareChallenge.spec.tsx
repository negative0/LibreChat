import userEvent from '@testing-library/user-event';
import { act, render, screen } from '@testing-library/react';
import { solveCloudflareChallenge } from 'librechat-data-provider';
import CloudflareChallenge from '../CloudflareChallenge';

const mockStartupConfig = { current: {} as Record<string, unknown> };

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: mockStartupConfig.current }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@marsidev/react-turnstile', () => ({
  Turnstile: ({ siteKey, onSuccess }: { siteKey: string; onSuccess: (token: string) => void }) => (
    <button type="button" aria-label="solve" onClick={() => onSuccess(`token-for-${siteKey}`)} />
  ),
}));

const enable = (managedChallenge: boolean | undefined) => {
  mockStartupConfig.current = { turnstile: { siteKey: 'site-key', managedChallenge } };
};

describe('CloudflareChallenge', () => {
  it('opens on a challenge and resolves with the Turnstile token', async () => {
    enable(true);
    render(<CloudflareChallenge />);

    let solving!: Promise<string | null>;
    act(() => {
      solving = solveCloudflareChallenge();
    });
    expect(await screen.findByText('com_ui_cloudflare_challenge_title')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'solve' }));

    await expect(solving).resolves.toBe('token-for-site-key');
    expect(screen.queryByText('com_ui_cloudflare_challenge_title')).not.toBeInTheDocument();
  });

  it('resolves null when the dialog is cancelled', async () => {
    enable(true);
    render(<CloudflareChallenge />);

    let solving!: Promise<string | null>;
    act(() => {
      solving = solveCloudflareChallenge();
    });
    await screen.findByText('com_ui_cloudflare_challenge_title');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await expect(solving).resolves.toBeNull();
  });

  it('registers no solver unless managedChallenge is on', async () => {
    enable(undefined);
    render(<CloudflareChallenge />);

    await expect(solveCloudflareChallenge()).resolves.toBeNull();
    expect(screen.queryByText('com_ui_cloudflare_challenge_title')).not.toBeInTheDocument();
  });

  it('unregisters its solver on unmount', async () => {
    enable(true);
    const { unmount } = render(<CloudflareChallenge />);
    unmount();

    await expect(solveCloudflareChallenge()).resolves.toBeNull();
  });
});
