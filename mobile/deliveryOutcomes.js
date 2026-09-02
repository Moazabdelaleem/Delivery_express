export const DELIVERY_OUTCOMES = [
  {
    key: 'full_cash_full',
    label_ar: 'تم التسليم والتحصيل كاش (كامل)',
    label_en: 'Full Delivery & Full Cash Collected',
    delivery_outcome: 'full',
    collection_outcome: 'cash_full'
  },
  {
    key: 'full_transfer_full',
    label_ar: 'تم التسليم والتحويل (كامل)',
    label_en: 'Full Delivery & Full Bank/E-Wallet Transfer',
    delivery_outcome: 'full',
    collection_outcome: 'transfer_full'
  },
  {
    key: 'full_cash_none',
    label_ar: 'تم التسليم بدون تحصيل (آجل / مدفوع)',
    label_en: 'Full Delivery & No Collection (Deferred / Prepaid)',
    delivery_outcome: 'full',
    collection_outcome: 'none'
  },
  {
    key: 'shipped_3rd_party',
    label_ar: 'تم الشحن عبر شركة شحن خارجية',
    label_en: 'Shipped via 3rd Party Courier',
    delivery_outcome: 'shipped_3rd_party',
    collection_outcome: 'none'
  },
  {
    key: 'partial_cash_partial',
    label_ar: 'تم التسليم جزئي والتحصيل كاش جزئي',
    label_en: 'Partial Delivery & Partial Cash Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'cash_partial'
  },
  {
    key: 'partial_cash_none',
    label_ar: 'تم التسليم جزئي بدون تحصيل',
    label_en: 'Partial Delivery & No Collection',
    delivery_outcome: 'partial',
    collection_outcome: 'none'
  },
  {
    key: 'partial_transfer_partial',
    label_ar: 'تم التسليم جزئي والتحويل جزئي',
    label_en: 'Partial Delivery & Partial Bank/E-Wallet Transfer',
    delivery_outcome: 'partial',
    collection_outcome: 'transfer_partial'
  },
  {
    key: 'partial_transfer_full',
    label_ar: 'تم التسليم جزئي والتحويل بالكامل',
    label_en: 'Partial Delivery & Full Transfer',
    delivery_outcome: 'partial',
    collection_outcome: 'transfer_full'
  },
  {
    key: 'partial_cash_full',
    label_ar: 'تم التسليم جزئي والتحصيل كاش بالكامل',
    label_en: 'Partial Delivery & Full Cash Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'cash_full'
  },
  {
    key: 'none_cash_partial',
    label_ar: 'لم يتم التسليم والتحصيل جزئي (مصاريف شحن)',
    label_en: 'Delivery Failed & Shipping Fee Collected Only',
    delivery_outcome: 'none',
    collection_outcome: 'shipping_fee_only'
  },
  {
    key: 'none_none',
    label_ar: 'لم يتم التسليم (مرفوض بالكامل)',
    label_en: 'Delivery Failed (Refused)',
    delivery_outcome: 'none',
    collection_outcome: 'none'
  },
  {
    key: 'not_shipped',
    label_ar: 'لم يتم الشحن (ملغى بالمخزن)',
    label_en: 'Not Shipped (Cancelled in Warehouse)',
    delivery_outcome: 'not_shipped',
    collection_outcome: 'none'
  },
  {
    key: 'partial_shipping_fee_only',
    label_ar: 'تم التسليم جزئي ومحصل مصاريف الشحن فقط',
    label_en: 'Partial Delivery & Shipping Fee Only Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'shipping_fee_only'
  },
  {
    key: 'full_shipping_fee_only',
    label_ar: 'تم التسليم ومحصل مصاريف الشحن فقط',
    label_en: 'Full Delivery & Shipping Fee Only Collected',
    delivery_outcome: 'full',
    collection_outcome: 'shipping_fee_only'
  }
];

export const DELIVERY_OUTCOMES_STEP1 = [
  { value: 'full', label_en: 'Full Delivery', label_ar: 'تسليم كامل' },
  { value: 'partial', label_en: 'Partial Delivery', label_ar: 'تسليم جزئي' },
  { value: 'none', label_en: 'Delivery Failed / Refused', label_ar: 'لم يتم التسليم (مرفوض)' },
  { value: 'shipped_3rd_party', label_en: 'Shipped via 3rd Party', label_ar: 'تم الشحن عبر شركة خارجية' },
  { value: 'not_shipped', label_en: 'Not Shipped (Cancelled)', label_ar: 'لم يتم الشحن (ملغى بالمخزن)' }
];

export const DELIVERY_OUTCOMES_STEP2 = [
  { value: 'cash_full', label_en: 'Full Cash Collected', label_ar: 'تحصيل كاش بالكامل' },
  { value: 'cash_partial', label_en: 'Partial Cash Collected', label_ar: 'تحصيل كاش جزئي' },
  { value: 'transfer_full', label_en: 'Full Bank / E-Wallet Transfer', label_ar: 'تحويل بنكي / إلكتروني بالكامل' },
  { value: 'transfer_partial', label_en: 'Partial Bank / E-Wallet Transfer', label_ar: 'تحويل بنكي / إلكتروني جزئي' },
  { value: 'shipping_fee_only', label_en: 'Shipping Fee Only Collected', label_ar: 'تحصيل مصاريف الشحن فقط' },
  { value: 'none', label_en: 'No Collection', label_ar: 'بدون تحصيل' }
];

export const COLLECTION_FILTER_MAP = {
  full: ['cash_full', 'cash_partial', 'transfer_full', 'transfer_partial', 'none', 'shipping_fee_only'],
  partial: ['cash_full', 'cash_partial', 'transfer_full', 'transfer_partial', 'none', 'shipping_fee_only'],
  none: ['none', 'shipping_fee_only'],
  shipped_3rd_party: ['none'],
  not_shipped: ['none']
};

export function getValidCollectionOutcomes(deliveryOutcome) {
  const allowed = COLLECTION_FILTER_MAP[deliveryOutcome] || [];
  return DELIVERY_OUTCOMES_STEP2.filter(item => allowed.includes(item.value));
}

export function getOutcomeByKey(key) {
  return DELIVERY_OUTCOMES.find(o => o.key === key) || DELIVERY_OUTCOMES[0];
}

