export const STATUS_LABEL_EN = {
  created: 'Created',
  assigned: 'Assigned',
  notified_inventory: 'Notified Inv.',
  handed_to_delivery: 'Handed Over',
  pickup_failed: 'Pickup Failed',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  delivery_failed: 'Delivery Failed',
  returned_to_company: 'Returned',
  cash_cleared: 'Cash Cleared',
};

export const STATUS_LABEL_AR = {
  created: 'تم الإنشاء',
  assigned: 'تم التكليف',
  notified_inventory: 'إبلاغ المخزن',
  handed_to_delivery: 'تسليم للمندوب',
  pickup_failed: 'فشل الاستلام',
  in_transit: 'جاري التوصيل',
  delivered: 'تم التوصيل',
  delivery_failed: 'فشل التوصيل',
  returned_to_company: 'مرتجع للشركة',
  cash_cleared: 'تم توريد النقدية',
};

export function tStatusLabel(status, lang = 'en') {
  if (lang === 'ar') {
    return STATUS_LABEL_AR[status] || status || '';
  }
  return STATUS_LABEL_EN[status] || status || '';
}
