const DELIVERY_OUTCOMES = [
  { key: 'full_cash_full', label_ar: 'تم التسليم والتحصيل كاش', label_en: 'Full Delivery & Full Cash Collected', delivery_outcome: 'full', collection_outcome: 'full', payment_method: 'cash' },
  { key: 'full_transfer_full', label_ar: 'تم التسليم والتحويل بالكامل', label_en: 'Full Delivery & Full Transfer', delivery_outcome: 'full', collection_outcome: 'full', payment_method: 'instapay' },
  { key: 'full_none', label_ar: 'تم التسليم بدون تحصيل', label_en: 'Full Delivery & No Collection', delivery_outcome: 'full', collection_outcome: 'none', payment_method: 'none' },
  { key: 'shipped_3rd_party', label_ar: 'تم الشحن عبر شركة خارجية', label_en: 'Shipped via 3rd Party', delivery_outcome: 'shipped_3rd_party', collection_outcome: 'none', payment_method: 'none' },
  { key: 'partial_cash_partial', label_ar: 'تم التسليم جزئي والتحصيل جزئي كاش', label_en: 'Partial Delivery & Partial Cash', delivery_outcome: 'partial', collection_outcome: 'partial', payment_method: 'cash' },
  { key: 'partial_none', label_ar: 'تم التسليم جزئي بدون تحصيل', label_en: 'Partial Delivery & No Collection', delivery_outcome: 'partial', collection_outcome: 'none', payment_method: 'none' },
  { key: 'none_shipping_fee_only', label_ar: 'لم يتم التسليم ومحصل مصاريف شحن', label_en: 'Delivery Failed & Shipping Fee Collected', delivery_outcome: 'none', collection_outcome: 'shipping_fee_only', payment_method: 'cash' },
  { key: 'none_none', label_ar: 'لم يتم التسليم (مرفوض)', label_en: 'Delivery Failed (Refused)', delivery_outcome: 'none', collection_outcome: 'none', payment_method: 'none' },
  { key: 'not_shipped', label_ar: 'لم يتم الشحن (ملغى بالمخزن)', label_en: 'Not Shipped (Cancelled)', delivery_outcome: 'not_shipped', collection_outcome: 'none', payment_method: 'none' }
];

const DELIVERY_OUTCOMES_STEP1 = [
  { value: 'full', label_en: 'Full Delivery', label_ar: 'تسليم كامل' },
  { value: 'partial', label_en: 'Partial Delivery', label_ar: 'تسليم جزئي' },
  { value: 'none', label_en: 'Delivery Failed / Refused', label_ar: 'لم يتم التسليم (مرفوض)' },
  { value: 'shipped_3rd_party', label_en: 'Shipped via 3rd Party', label_ar: 'تم الشحن عبر شركة خارجية' },
  { value: 'not_shipped', label_en: 'Not Shipped (Cancelled)', label_ar: 'لم يتم الشحن (ملغى بالمخزن)' }
];

const DELIVERY_OUTCOMES_STEP2 = [
  { value: 'full', label_en: 'Full Amount Collected', label_ar: 'تحصيل المبلغ بالكامل' },
  { value: 'partial', label_en: 'Partial Amount Collected', label_ar: 'تحصيل مبلغ جزئي' },
  { value: 'shipping_fee_only', label_en: 'Shipping Fee Only Collected', label_ar: 'تحصيل مصاريف الشحن فقط' },
  { value: 'none', label_en: 'No Collection / Deferred', label_ar: 'بدون تحصيل (آجل / مدفوع مسبقاً)' }
];

const PAYMENT_METHODS_STEP3 = [
  { value: 'cash', label_en: 'Cash on Delivery', label_ar: 'كاش (نقداً)' },
  { value: 'instapay', label_en: 'InstaPay Transfer', label_ar: 'إنستا باي (InstaPay)' },
  { value: 'vodafone_cash', label_en: 'Vodafone Cash / E-Wallet', label_ar: 'فودافون كاش / محفظة إلكترونية' },
  { value: 'other', label_en: 'Bank Transfer / Other', label_ar: 'تحويل بنكي / آخر' }
];

const COLLECTION_FILTER_MAP = {
  full: ['full', 'partial', 'shipping_fee_only', 'none'],
  partial: ['full', 'partial', 'shipping_fee_only', 'none'],
  none: ['shipping_fee_only', 'none'],
  shipped_3rd_party: ['none'],
  not_shipped: ['none']
};

function getValidCollectionOutcomes(deliveryOutcome) {
  const allowed = COLLECTION_FILTER_MAP[deliveryOutcome] || ['none'];
  return DELIVERY_OUTCOMES_STEP2.filter(item => allowed.includes(item.value));
}

function getOutcomeByKey(key) {
  return DELIVERY_OUTCOMES.find(o => o.key === key) || DELIVERY_OUTCOMES[0];
}

function findOutcome(deliveryOutcome, collectionOutcome) {
  return DELIVERY_OUTCOMES.find(
    o => o.delivery_outcome === deliveryOutcome && o.collection_outcome === collectionOutcome
  ) || { delivery_outcome: deliveryOutcome, collection_outcome: collectionOutcome, status: 'delivered' };
}

module.exports = {
  DELIVERY_OUTCOMES,
  DELIVERY_OUTCOMES_STEP1,
  DELIVERY_OUTCOMES_STEP2,
  PAYMENT_METHODS_STEP3,
  COLLECTION_FILTER_MAP,
  getValidCollectionOutcomes,
  getOutcomeByKey,
  findOutcome
};
