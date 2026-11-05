import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { z } from 'zod';
import { ApiError } from '@/api/client';
import type { PriceRecord } from '@/api/types';
import { useUser } from '@/auth/SessionProvider';
import { Button, Field, Notice } from '@/components/ui';
import { font, spacing } from '@/theme';
import { currencySymbol, formatMoney, formatRelative } from '@/utils/format';
import { editSchema } from './editSchema';
import { useUpdatePrice } from './hooks';

type FieldErrors = Partial<Record<keyof z.infer<typeof editSchema>, string>>;

export function EditPriceForm({ record, onDone }: { record: PriceRecord; onDone: () => void }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const mutation = useUpdatePrice(record.id);
  const [price, setPrice] = useState(record.price);
  const [productName, setProductName] = useState(record.productName);
  const [reason, setReason] = useState('');
  const [baseVersion, setBaseVersion] = useState(record.version);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [conflict, setConflict] = useState<PriceRecord | null>(null);

  const priceChanged = Number(price) !== Number(record.price) || (conflict !== null && Number(price) !== Number(conflict.price));
  const nameChanged = productName.trim() !== record.productName;
  const dirty = priceChanged || nameChanged;
  const delta = Number(record.price) > 0 ? (Number(price) - Number(record.price)) / Number(record.price) : 0;

  const save = () => {
    const parsed = editSchema.safeParse({ price, productName, reason });
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      setErrors({ price: flat.price?.[0], productName: flat.productName?.[0], reason: flat.reason?.[0] });
      return;
    }
    setErrors({});
    mutation.mutate(
      {
        version: baseVersion,
        price: priceChanged ? parsed.data.price : undefined,
        productName: nameChanged ? parsed.data.productName : undefined,
        reason: parsed.data.reason,
      },
      {
        onSuccess: onDone,
        onError: (err) => {
          if (err instanceof ApiError && err.status === 412 && err.body.current) setConflict(err.body.current as PriceRecord);
          else if (err instanceof ApiError && err.status === 400) {
            const f = err.fieldErrors;
            setErrors({ price: f.price?.[0], productName: f.productName?.[0], reason: f.reason?.[0] });
          }
        },
      },
    );
  };

  const useLatest = () => {
    if (!conflict) return;
    queryClient.setQueryData(['prices', user.userId, 'record', record.id], conflict);
    onDone();
  };

  const keepMine = () => {
    if (!conflict) return;
    setBaseVersion(conflict.version); // next save deliberately replaces the newer version
    setConflict(null);
    mutation.reset();
  };

  return (
    <View style={{ gap: spacing.lg }}>
      {conflict && (
        <Notice
          tone="warning"
          title="Someone else changed this record"
          message={`${conflict.updatedBy} updated it ${formatRelative(conflict.updatedAt)}: now ${formatMoney(conflict.price, conflict.currency)} · "${conflict.productName}". Your changes were not saved.`}
        >
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs }}>
            <Button title="Use latest" variant="secondary" onPress={useLatest} style={{ minHeight: 36 }} />
            <Button title="Keep my changes" variant="ghost" onPress={keepMine} style={{ minHeight: 36 }} />
          </View>
        </Notice>
      )}

      <Field
        label={`Price (${record.currency})`}
        prefix={currencySymbol(record.currency)}
        value={price}
        onChangeText={(t) => setPrice(t.replace(',', '.'))}
        keyboardType="decimal-pad"
        error={errors.price}
        testID="edit-price"
      />
      {priceChanged && Math.abs(delta) >= 0.5 && !errors.price && (
        <Notice
          tone="warning"
          title={`${Math.round(Math.abs(delta) * 100)}% ${delta < 0 ? 'decrease' : 'increase'}`}
          message="That is a large change. Double-check the amount before saving."
        />
      )}
      <Field label="Product name" value={productName} onChangeText={setProductName} error={errors.productName} testID="edit-name" />
      <Field
        label="Reason for change"
        value={reason}
        onChangeText={setReason}
        placeholder="e.g. Competitor price match"
        error={errors.reason}
        hint="Visible to pricing analysts in the change history."
        testID="edit-reason"
      />

      {mutation.isPaused && (
        <Notice tone="info" title="Waiting for a connection" message="Your change will be sent automatically when you're back online." />
      )}
      {mutation.isError && !conflict && !(mutation.error instanceof ApiError && mutation.error.status === 400) && (
        <Notice tone="danger" title="Couldn't save" message={mutation.error.message} />
      )}

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Button title="Cancel" variant="secondary" onPress={onDone} style={{ flex: 1 }} />
        <Button
          title="Save changes"
          onPress={save}
          loading={mutation.isPending && !mutation.isPaused}
          disabled={!dirty || conflict !== null}
          style={{ flex: 2 }}
          testID="edit-save"
        />
      </View>
      <Text style={[font.caption, { textAlign: 'center' }]}>Editing version {baseVersion}</Text>
    </View>
  );
}
