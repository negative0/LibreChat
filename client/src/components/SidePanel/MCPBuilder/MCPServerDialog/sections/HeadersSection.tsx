import { Plus, X } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { MAX_MCP_AUTH_HEADERS, getApiKeyHeaderName } from 'librechat-data-provider';
import { Label, Input, Button, Checkbox, SecretInput, FieldMessage } from '@librechat/client';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import { AuthTypeEnum } from '../hooks/useMCPServerForm';
import { useLocalize } from '~/hooks';

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

interface HeadersSectionProps {
  isEditMode: boolean;
}

interface HeaderRowProps extends HeadersSectionProps {
  index: number;
  onRemove: () => void;
}

function HeaderRow({ index, isEditMode, onRemove }: HeaderRowProps) {
  const localize = useLocalize();
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  const source = useWatch<MCPServerFormData, `auth.auth_headers.${number}.source`>({
    name: `auth.auth_headers.${index}.source`,
  });

  const nameId = `auth_header_name_${index}`;
  const valueId = `auth_header_value_${index}`;
  const userProvidesId = `auth_header_user_${index}`;
  const errorId = `auth_header_error_${index}`;
  const nameError = errors.auth?.auth_headers?.[index]?.name;

  const validateName = (name: string): string | true => {
    const { auth } = getValues();
    const lowered = name.trim().toLowerCase();
    if (!lowered || auth.auth_type !== AuthTypeEnum.ServiceHttp) {
      return true;
    }
    if (!HEADER_NAME_PATTERN.test(lowered)) {
      return localize('com_ui_header_name_invalid');
    }
    const apiKeyHeader = getApiKeyHeaderName({
      authorization_type: auth.api_key_authorization_type,
      custom_header: auth.api_key_custom_header,
    });
    const isDuplicate =
      lowered === apiKeyHeader.toLowerCase() ||
      (auth.auth_headers ?? []).some(
        (header, i) => i !== index && header.name.trim().toLowerCase() === lowered,
      );
    return isDuplicate ? localize('com_ui_header_name_duplicate') : true;
  };

  return (
    <div
      role="group"
      aria-labelledby={nameId}
      className="border-border-light space-y-2 rounded-lg border p-2"
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor={nameId} className="text-sm font-medium">
            {localize('com_ui_header_name')}
          </Label>
          <Input
            id={nameId}
            placeholder="X-Org-Id"
            aria-invalid={nameError ? 'true' : 'false'}
            aria-describedby={nameError ? errorId : undefined}
            {...register(`auth.auth_headers.${index}.name`, { validate: validateName })}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={localize('com_ui_remove_header')}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {nameError?.message && <FieldMessage id={errorId} message={nameError.message} />}

      {source !== 'user' && (
        <div className="space-y-1.5">
          <Label htmlFor={valueId} className="text-sm font-medium">
            {localize('com_ui_header_value')}
          </Label>
          <SecretInput
            id={valueId}
            autoComplete="new-password"
            controlsOnHover
            placeholder={isEditMode ? localize('com_ui_leave_blank_to_keep') : ''}
            {...register(`auth.auth_headers.${index}.value`)}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id={userProvidesId}
          checked={source === 'user'}
          onCheckedChange={(checked) =>
            setValue(`auth.auth_headers.${index}.source`, checked ? 'user' : 'admin', {
              shouldDirty: true,
            })
          }
          aria-labelledby={`${userProvidesId}_label`}
        />
        <label
          id={`${userProvidesId}_label`}
          htmlFor={userProvidesId}
          className="cursor-pointer text-sm"
        >
          {localize('com_ui_user_provides_value')}
        </label>
      </div>
    </div>
  );
}

export default function HeadersSection({ isEditMode }: HeadersSectionProps) {
  const localize = useLocalize();
  const { control } = useFormContext<MCPServerFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'auth.auth_headers' });

  return (
    <fieldset className="space-y-2">
      <legend>
        <Label className="text-sm font-medium">{localize('com_ui_additional_headers')}</Label>
      </legend>
      <p className="text-text-secondary text-xs">
        {localize('com_ui_additional_headers_description')}
      </p>
      {fields.map((field, index) => (
        <HeaderRow
          key={field.id}
          index={index}
          isEditMode={isEditMode}
          onRemove={() => remove(index)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= MAX_MCP_AUTH_HEADERS}
        onClick={() => append({ name: '', value: '', source: 'admin' })}
      >
        <Plus className="mr-1 size-4" aria-hidden="true" />
        {localize('com_ui_add_header')}
      </Button>
    </fieldset>
  );
}
