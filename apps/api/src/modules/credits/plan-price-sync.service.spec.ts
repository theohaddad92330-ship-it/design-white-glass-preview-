import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { StripeService, type SubscriptionLineItem } from '../stripe/stripe.service'
import { PlanCatalogService } from './plan-catalog.service'
import { PlanPriceSyncService } from './plan-price-sync.service'
import { BELLUM_LINE_METADATA_KEY, SEAT_LINE_NAME } from './pricing'

/** A subscription row as the sync reads it — only the two fields it touches. */
const sub = (id: string) => ({ stripe_subscription_id: id }) as SubscriptionEntity

const line = (over: Partial<SubscriptionLineItem> = {}): SubscriptionLineItem => ({
  itemId: 'si_plan',
  unitAmount: 11900,
  currency: 'eur',
  interval: 'month',
  quantity: 1,
  productId: 'prod_plan',
  productName: 'BellumAI Team',
  productMetadata: { [BELLUM_LINE_METADATA_KEY]: 'plan' },
  ...over,
})

describe('PlanPriceSyncService', () => {
  let service: PlanPriceSyncService
  let find: jest.Mock
  let listSubscriptionItems: jest.Mock
  let updateSubscriptionItemPrice: jest.Mock
  let updateProduct: jest.Mock
  let getOrDefault: jest.Mock

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([sub('sub_1')])
    listSubscriptionItems = jest.fn().mockResolvedValue([line()])
    updateSubscriptionItemPrice = jest.fn().mockResolvedValue({})
    updateProduct = jest.fn().mockResolvedValue(undefined)
    // Catalog now says 15900 — the subscription above is still on 11900.
    getOrDefault = jest.fn().mockResolvedValue({ key: 'team', label: 'Team', price: 15900, extra_seat_price: 2900 })

    const moduleRef = await Test.createTestingModule({
      providers: [
        PlanPriceSyncService,
        { provide: getRepositoryToken(SubscriptionEntity), useValue: { find } },
        { provide: PlanCatalogService, useValue: { getOrDefault } },
        { provide: StripeService, useValue: { listSubscriptionItems, updateSubscriptionItemPrice, updateProduct } },
      ],
    }).compile()

    service = moduleRef.get(PlanPriceSyncService)
  })

  it('re-prices a live subscription to the catalog price without proration', async () => {
    const report = await service.syncPlan('team')

    expect(report).toMatchObject({ planKey: 'team', considered: 1, updated: 1, skipped: 0, failed: 0 })
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub_1', itemId: 'si_plan', unitAmount: 15900, interval: 'month' }),
    )
  })

  it('only considers subscriptions on that plan that have a Stripe id', async () => {
    await service.syncPlan('team')
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ plan: 'team' }) }))
  })

  it('bills an annual subscriber the discounted yearly amount, not the monthly one', async () => {
    listSubscriptionItems.mockResolvedValue([line({ interval: 'year', unitAmount: 114200 })])

    await service.syncPlan('team')

    // 159 €/mo → 12 months at −20 %, rounded to a whole euro = 1526,40 → 1526 €.
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ unitAmount: 152600, interval: 'year' }),
    )
  })

  it('is idempotent — a subscription already at the target price is skipped', async () => {
    listSubscriptionItems.mockResolvedValue([line({ unitAmount: 15900 })])

    const report = await service.syncPlan('team')

    expect(report).toMatchObject({ updated: 0, skipped: 1 })
    expect(updateSubscriptionItemPrice).not.toHaveBeenCalled()
  })

  it('re-prices the seat line too, but never touches the seat QUANTITY', async () => {
    listSubscriptionItems.mockResolvedValue([
      line(),
      line({
        itemId: 'si_seat',
        productId: 'prod_seat',
        productName: SEAT_LINE_NAME,
        productMetadata: { [BELLUM_LINE_METADATA_KEY]: 'seat' },
        quantity: 4,
        unitAmount: 1900,
      }),
    ])

    await service.syncPlan('team')

    // How many seats the customer bought is their decision, not a catalog value.
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'si_seat', unitAmount: 2900, quantity: 4 }),
    )
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'si_plan', unitAmount: 15900, quantity: 1 }),
    )
  })

  it('leaves the seat line alone when it is already at the catalog price', async () => {
    listSubscriptionItems.mockResolvedValue([
      line(),
      line({
        itemId: 'si_seat',
        productId: 'prod_seat',
        productName: SEAT_LINE_NAME,
        productMetadata: { [BELLUM_LINE_METADATA_KEY]: 'seat' },
        quantity: 4,
        unitAmount: 2900,
      }),
    ])

    await service.syncPlan('team')

    expect(updateSubscriptionItemPrice).toHaveBeenCalledTimes(1)
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'si_plan' }))
  })

  it('identifies the plan line on a legacy subscription that predates the tags', async () => {
    listSubscriptionItems.mockResolvedValue([
      line({ productMetadata: {} }),
      line({
        itemId: 'si_seat',
        productId: 'prod_seat',
        productName: SEAT_LINE_NAME,
        productMetadata: {},
        quantity: 2,
      }),
    ])

    const report = await service.syncPlan('team')

    expect(report).toMatchObject({ updated: 1 })
    expect(updateSubscriptionItemPrice).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'si_plan' }))
  })

  it('leaves an ambiguous subscription untouched rather than guessing at the bill', async () => {
    listSubscriptionItems.mockResolvedValue([
      line({ itemId: 'si_a', productId: 'prod_a', productName: 'Mystère A', productMetadata: {} }),
      line({ itemId: 'si_b', productId: 'prod_b', productName: 'Mystère B', productMetadata: {} }),
    ])

    const report = await service.syncPlan('team')

    expect(report).toMatchObject({ updated: 0, skipped: 1 })
    expect(updateSubscriptionItemPrice).not.toHaveBeenCalled()
  })

  it('keeps going when one subscription fails', async () => {
    find.mockResolvedValue([sub('sub_1'), sub('sub_2'), sub('sub_3')])
    listSubscriptionItems
      .mockResolvedValueOnce([line()])
      .mockRejectedValueOnce(new Error('No such subscription'))
      .mockResolvedValueOnce([line()])

    const report = await service.syncPlan('team')

    expect(report).toMatchObject({ considered: 3, updated: 2, failed: 1 })
  })
})
