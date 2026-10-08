import userEvent from '@testing-library/user-event';
import { FormProvider, useForm } from 'react-hook-form';
import { render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactNode } from 'react';
import type { MCPServerFormData } from '../../hooks/useMCPServerForm';
import { AuthTypeEnum, AuthorizationTypeEnum } from '../../hooks/useMCPServerForm';
import HeadersSection from '../HeadersSection';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const TextInput = React.forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => React.createElement('input', { ...props, ref }),
  );
  return {
    Input: TextInput,
    SecretInput: React.forwardRef<
      HTMLInputElement,
      InputHTMLAttributes<HTMLInputElement> & { controlsOnHover?: boolean }
    >(({ controlsOnHover: _controls, ...props }, ref) =>
      React.createElement('input', { ...props, type: 'password', ref }),
    ),
    Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', props, children),
    Checkbox: ({
      checked,
      onCheckedChange,
      ...props
    }: {
      checked: boolean;
      onCheckedChange: (checked: boolean) => void;
    }) =>
      React.createElement('input', {
        type: 'checkbox',
        checked,
        onChange: (event: ChangeEvent<HTMLInputElement>) => onCheckedChange(event.target.checked),
        ...props,
      }),
    Label: ({ children, ...props }: { children: ReactNode }) =>
      React.createElement('label', props, children),
    FieldMessage: ({ id, message }: { id: string; message?: string }) =>
      React.createElement('p', { id, role: message ? 'alert' : undefined }, message),
  };
});

let submitted: MCPServerFormData | undefined;

function renderHeadersSection(authHeaders: MCPServerFormData['auth']['auth_headers'] = []) {
  function Wrapper() {
    const methods = useForm<MCPServerFormData>({
      defaultValues: {
        title: '',
        url: '',
        type: 'streamable-http',
        trust: false,
        auth: {
          auth_type: AuthTypeEnum.ServiceHttp,
          api_key_source: 'admin',
          api_key_authorization_type: AuthorizationTypeEnum.Bearer,
          auth_headers: authHeaders,
        },
      },
    });
    return (
      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit((data) => {
            submitted = data;
          })}
        >
          <HeadersSection isEditMode={authHeaders.length > 0} />
          <button type="submit" aria-label="submit" />
        </form>
      </FormProvider>
    );
  }
  return render(<Wrapper />);
}

describe('HeadersSection', () => {
  beforeEach(() => {
    submitted = undefined;
  });

  it('adds admin and user header rows and submits their values', async () => {
    const user = userEvent.setup();
    renderHeadersSection();

    await user.click(screen.getByRole('button', { name: /com_ui_add_header/ }));
    await user.type(screen.getByLabelText('com_ui_header_name'), 'X-Org-Id');
    await user.type(screen.getByLabelText('com_ui_header_value'), 'org-123');

    await user.click(screen.getByRole('button', { name: /com_ui_add_header/ }));
    const names = screen.getAllByLabelText('com_ui_header_name');
    await user.type(names[1], 'X-User-Token');
    await user.click(screen.getAllByRole('checkbox')[1]);

    expect(screen.getAllByLabelText('com_ui_header_value')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(submitted).toBeDefined());
    expect(submitted?.auth.auth_headers).toEqual([
      { name: 'X-Org-Id', value: 'org-123', source: 'admin' },
      { name: 'X-User-Token', value: '', source: 'user' },
    ]);
  });

  it('removes a row', async () => {
    const user = userEvent.setup();
    renderHeadersSection([{ name: 'X-Org-Id', value: '', source: 'admin' }]);

    await user.click(screen.getByRole('button', { name: 'com_ui_remove_header' }));
    expect(screen.queryByLabelText('com_ui_header_name')).not.toBeInTheDocument();
  });

  it('shows the keep-existing placeholder for stored values in edit mode', () => {
    renderHeadersSection([{ name: 'X-Org-Id', value: '', source: 'admin' }]);
    expect(screen.getByLabelText('com_ui_header_value')).toHaveAttribute(
      'placeholder',
      'com_ui_leave_blank_to_keep',
    );
  });

  it.each([
    ['the API key header', 'authorization', 'com_ui_header_name_duplicate'],
    ['an invalid name', 'X Org', 'com_ui_header_name_invalid'],
  ])('blocks submit for %s', async (_label, name, message) => {
    const user = userEvent.setup();
    renderHeadersSection();

    await user.click(screen.getByRole('button', { name: /com_ui_add_header/ }));
    await user.type(screen.getByLabelText('com_ui_header_name'), name);
    await user.click(screen.getByRole('button', { name: 'submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(submitted).toBeUndefined();
  });
});
