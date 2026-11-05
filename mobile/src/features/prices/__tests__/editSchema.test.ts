import { editSchema } from '../editSchema';

describe('editSchema', () => {
  const valid = { price: '12.99', productName: 'Milk 1L', reason: 'Competitor match' };

  it('accepts a valid edit', () => {
    expect(editSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    [{ price: '12,99' }, 'price'],
    [{ price: '-1' }, 'price'],
    [{ price: '1.23456' }, 'price'],
    [{ productName: '  ' }, 'productName'],
    [{ productName: '=cmd()' }, 'productName'],
    [{ reason: 'ok' }, 'reason'],
  ])('rejects %j', (patch, field) => {
    const result = editSchema.safeParse({ ...valid, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(field);
  });
});
