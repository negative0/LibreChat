import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { setCloudflareChallengeSolver } from 'librechat-data-provider';
import { OGDialog, OGDialogTemplate, ThemeContext, isDark } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

type PendingChallenge = {
  resolve: (token: string) => void;
  reject: (reason: Error) => void;
};

/**
 * CloudflareChallenge Component
 *
 * With `turnstile.managedChallenge` on, registers itself as the solver for Cloudflare managed
 * challenges on API requests (`cloudflareChallenge.ts` in librechat-data-provider): a challenged
 * request opens this dialog, and once the Turnstile widget is solved the request is retried.
 * Cancelling hands the request its original 403.
 *
 * Rendered at the root, outside the router, so it also covers the login and registration pages.
 */
const CloudflareChallenge = () => {
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const { data: startupConfig } = useGetStartupConfig();
  const turnstile = startupConfig?.turnstile;
  const enabled = Boolean(turnstile?.siteKey) && turnstile?.managedChallenge === true;
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<PendingChallenge | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    setCloudflareChallengeSolver(
      () =>
        new Promise<string>((resolve, reject) => {
          pendingRef.current = { resolve, reject };
          setOpen(true);
        }),
    );
    return () => {
      setCloudflareChallengeSolver(null);
      pendingRef.current?.reject(new Error('Cloudflare challenge dialog unmounted'));
      pendingRef.current = null;
    };
  }, [enabled]);

  const settle = useCallback((token: string | null) => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setOpen(false);
    if (token) {
      pending?.resolve(token);
    } else {
      pending?.reject(new Error('Cloudflare challenge cancelled'));
    }
  }, []);

  if (!enabled || !turnstile) {
    return null;
  }

  return (
    <OGDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          settle(null);
        }
      }}
    >
      <OGDialogTemplate
        title={localize('com_ui_cloudflare_challenge_title')}
        description={localize('com_ui_cloudflare_challenge_description')}
        className="max-w-sm"
        main={
          <div className="flex justify-center py-2">
            {open && (
              <Turnstile
                siteKey={turnstile.siteKey}
                options={{
                  ...turnstile.options,
                  theme: isDark(theme) ? 'dark' : 'light',
                }}
                onSuccess={settle}
              />
            )}
          </div>
        }
      />
    </OGDialog>
  );
};

export default CloudflareChallenge;
