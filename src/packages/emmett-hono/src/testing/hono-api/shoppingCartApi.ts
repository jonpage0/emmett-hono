// src/testing/hono-api/shoppingCartApi.ts
import {
  DeciderCommandHandler,
  STREAM_DOES_NOT_EXIST,
  assertNotEmptyString,
  assertPositiveNumber,
  assertUnsignedBigInt,
  type EventStore,
  type ReadEventMetadataWithGlobalPosition,
} from '@event-driven-io/emmett';
import { Hono } from 'hono';
import { Legacy, sendCreated, sendNoContent } from '../../responses';
import { HeaderNames, toWeakETag } from '../../types';
import { decider } from '../decider/businessLogic';
import {
  type PricedProductItem,
  type ProductItem,
} from '../decider/shoppingCart';

export const handle = DeciderCommandHandler(decider);

const dummyPriceProvider = (_id: string) => 100;

export const shoppingCartApi =
  (store: EventStore<ReadEventMetadataWithGlobalPosition>) => (app: Hono) => {
    // 1. OPEN -------------------------------------------------------------
    app.post('/clients/:client/cart', async (c) => {
      const clientId = assertNotEmptyString(c.req.param('client'));
      const cartId = clientId;

      const result = await handle(
        store,
        cartId,
        {
          type: 'OpenShoppingCart',
          data: { clientId, shoppingCartId: cartId, now: new Date() },
        },
        { expectedStreamVersion: STREAM_DOES_NOT_EXIST },
      );

      return sendCreated(c, {
        createdId: cartId,
        eTag: toWeakETag(result.nextExpectedStreamVersion),
      });
    });

    // 2. ADD ITEM ---------------------------------------------------------
    app.post('/clients/:client/cart/:cartId/items', async (c) => {
      const cartId = assertNotEmptyString(c.req.param('cartId'));
      const body = await c.req.json<ProductItem>();
      const productItem: PricedProductItem = {
        productId: assertNotEmptyString(body.productId),
        quantity: assertPositiveNumber(body.quantity),
        unitPrice: dummyPriceProvider(body.productId),
      };

      const expected = assertUnsignedBigInt(
        (c.req.header(HeaderNames.IF_MATCH) ?? '').replace(/\D/g, ''),
      );

      const result = await handle(
        store,
        cartId,
        {
          type: 'AddProductItemToShoppingCart',
          data: { shoppingCartId: cartId, productItem },
        },
        { expectedStreamVersion: expected },
      );

      return sendNoContent(c, {
        eTag: toWeakETag(result.nextExpectedStreamVersion),
      });
    });

    // 3. CONFIRM ----------------------------------------------------------
    app.post('/clients/:client/cart/:cartId/confirm', async (c) => {
      const cartId = c.req.param('cartId');
      const expected = assertUnsignedBigInt(
        (c.req.header(HeaderNames.IF_MATCH) ?? '').replace(/\D/g, ''),
      );
      const result = await handle(
        store,
        cartId,
        {
          type: 'ConfirmShoppingCart',
          data: { shoppingCartId: cartId, now: new Date() },
        },
        { expectedStreamVersion: expected },
      );
      return sendNoContent(c, {
        eTag: toWeakETag(result.nextExpectedStreamVersion),
      });
    });

    // 4. CANCEL -----------------------------------------------------------
    app.delete('/clients/:client/cart/:cartId', async (c) => {
      const cartId = c.req.param('cartId');
      const expected = assertUnsignedBigInt(
        (c.req.header(HeaderNames.IF_MATCH) ?? '').replace(/\D/g, ''),
      );
      try {
        await handle(
          store,
          cartId,
          {
            type: 'CancelShoppingCart',
            data: { shoppingCartId: cartId, now: new Date() },
          },
          { expectedStreamVersion: expected },
        );
        return sendNoContent(c);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return Legacy.Forbidden({ problemDetails: message })(c);
      }
    });
  };
