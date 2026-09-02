/**
 * Delivery Outcome Status Selection Mapping Constant
 * Maps 13 client-facing Arabic labels to (delivery_outcome, collection_outcome) two-field model.
 */

const DELIVERY_OUTCOMES = [
  {
    key: 'full_cash_full',
    label_ar: 'تم التسليم والتحصيل',
    label_en: 'Delivered & Full Cash Collected',
    delivery_outcome: 'full',
    collection_outcome: 'cash_full',
    payment_method: 'cash',
    requires_payment: true,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'full_transfer_full',
    label_ar: 'تم التسليم والتحويل',
    label_en: 'Delivered & Full Transfer Collected',
    delivery_outcome: 'full',
    collection_outcome: 'transfer_full',
    payment_method: 'instapay',
    requires_payment: true,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'full_none',
    label_ar: 'تم التسليم بدون تحصيل',
    label_en: 'Delivered Without Collection',
    delivery_outcome: 'full',
    collection_outcome: 'none',
    payment_method: 'none',
    requires_payment: false,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'shipped_3rd_party_none',
    label_ar: 'تم الشحن',
    label_en: 'Shipped via 3rd Party',
    delivery_outcome: 'shipped_3rd_party',
    collection_outcome: 'none',
    payment_method: 'none',
    requires_payment: false,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'partial_cash_full',
    label_ar: 'تم التسليم جزئي والتحصيل',
    label_en: 'Partial Delivery & Full Cash Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'cash_full',
    payment_method: 'cash',
    requires_payment: true,
    requires_partial_breakdown: true,
    status: 'delivered'
  },
  {
    key: 'partial_none',
    label_ar: 'تم التسليم جزئي بدون تحصيل',
    label_en: 'Partial Delivery Without Collection',
    delivery_outcome: 'partial',
    collection_outcome: 'none',
    payment_method: 'none',
    requires_payment: false,
    requires_partial_breakdown: true,
    status: 'delivered'
  },
  {
    key: 'full_transfer_partial',
    label_ar: 'تم التسليم والتحويل جزئي',
    label_en: 'Full Delivery & Partial Transfer Collected',
    delivery_outcome: 'full',
    collection_outcome: 'transfer_partial',
    payment_method: 'instapay',
    requires_payment: true,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'partial_transfer_full',
    label_ar: 'تم التسليم جزئي والتحويل',
    label_en: 'Partial Delivery & Full Transfer Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'transfer_full',
    payment_method: 'instapay',
    requires_payment: true,
    requires_partial_breakdown: true,
    status: 'delivered'
  },
  {
    key: 'full_cash_partial',
    label_ar: 'تم التسليم والتحصيل جزئي',
    label_en: 'Full Delivery & Partial Cash Collected',
    delivery_outcome: 'full',
    collection_outcome: 'cash_partial',
    payment_method: 'cash',
    requires_payment: true,
    requires_partial_breakdown: false,
    status: 'delivered'
  },
  {
    key: 'none_shipping_fee_only',
    label_ar: 'لم يتم التسليم والتحصيل جزئي',
    label_en: 'Delivery Failed & Shipping Fee Collected',
    delivery_outcome: 'none',
    collection_outcome: 'shipping_fee_only',
    payment_method: 'cash',
    requires_payment: true,
    requires_partial_breakdown: false,
    status: 'delivery_failed'
  },
  {
    key: 'none_none',
    label_ar: 'لم يتم التسليم',
    label_en: 'Delivery Failed',
    delivery_outcome: 'none',
    collection_outcome: 'none',
    payment_method: 'none',
    requires_payment: false,
    requires_partial_breakdown: false,
    status: 'delivery_failed'
  },
  {
    key: 'not_shipped_none',
    label_ar: 'لم يتم الشحن',
    label_en: 'Not Shipped',
    delivery_outcome: 'not_shipped',
    collection_outcome: 'none',
    payment_method: 'none',
    requires_payment: false,
    requires_partial_breakdown: false,
    status: 'delivery_failed'
  },
  {
    key: 'partial_cash_partial',
    label_ar: 'تم التسليم جزئي والتحصيل جزئي (نقداً)',
    label_en: 'Partial Delivery & Partial Cash Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'cash_partial',
    payment_method: 'cash',
    requires_payment: true,
    requires_partial_breakdown: true,
    status: 'delivered'
  },
  {
    key: 'partial_transfer_partial',
    label_ar: 'تم التسليم جزئي والتحويل جزئي (تحويل)',
    label_en: 'Partial Delivery & Partial Transfer Collected',
    delivery_outcome: 'partial',
    collection_outcome: 'transfer_partial',
    payment_method: 'instapay',
    requires_payment: true,
    requires_partial_breakdown: true,
    status: 'delivered'
  }
];

function getOutcomeByKey(key) {
  return DELIVERY_OUTCOMES.find(o => o.key === key);
}

function findOutcome(deliveryOutcome, collectionOutcome) {
  return DELIVERY_OUTCOMES.find(
    o => o.delivery_outcome === deliveryOutcome && o.collection_outcome === collectionOutcome
  );
}

const DELIVERY_OUTCOMES_STEP1 = [
  { value: 'full', label_en: 'Full Delivery', label_ar: 'تسليم كامل' },
  { value: 'partial', label_en: 'Partial Delivery', label_ar: 'تسليم جزئي' },
  { value: 'none', label_en: 'Delivery Failed / Refused', label_ar: 'لم يتم التسليم (مرفوض)' },
  { value: 'shipped_3rd_party', label_en: 'Shipped via 3rd Party', label_ar: 'تم الشحن عبر شركة خارجية' },
  { value: 'not_shipped', label_en: 'Not Shipped (Cancelled)', label_ar: 'لم يتم الشحن (ملغى بالمخزن)' }
];

const DELIVERY_OUTCOMES_STEP2 = [
  { value: 'cash_full', label_en: 'Full Cash Collected', label_ar: 'تحصيل كاش بالكامل' },
  { value: 'cash_partial', label_en: 'Partial Cash Collected', label_ar: 'تحصيل كاش جزئي' },
  { value: 'transfer_full', label_en: 'Full Bank / E-Wallet Transfer', label_ar: 'تحويل بنكي / إلكتروني بالكامل' },
  { value: 'transfer_partial', label_en: 'Partial Bank / E-Wallet Transfer', label_ar: 'تحويل بنكي / إلكتروني جزئي' },
  { value: 'shipping_fee_only', label_en: 'Shipping Fee Only Collected', label_ar: 'تحصيل مصاريف الشحن فقط' },
  { value: 'none', label_en: 'No Collection', label_ar: 'بدون تحصيل' }
];

const COLLECTION_FILTER_MAP = {
  full: ['cash_full', 'cash_partial', 'transfer_full', 'transfer_partial', 'none', 'shipping_fee_only'],
  partial: ['cash_full', 'cash_partial', 'transfer_full', 'transfer_partial', 'none', 'shipping_fee_only'],
  none: ['none', 'shipping_fee_only'],
  shipped_3rd_party: ['none'],
  not_shipped: ['none']
};

function getValidCollectionOutcomes(deliveryOutcome) {
  const allowed = COLLECTION_FILTER_MAP[deliveryOutcome] || [];
  return DELIVERY_OUTCOMES_STEP2.filter(item => allowed.includes(item.value));
}

module.exports = {
  DELIVERY_OUTCOMES,
  DELIVERY_OUTCOMES_STEP1,
  DELIVERY_OUTCOMES_STEP2,
  COLLECTION_FILTER_MAP,
  getValidCollectionOutcomes,
  getOutcomeByKey,
  findOutcome
};

