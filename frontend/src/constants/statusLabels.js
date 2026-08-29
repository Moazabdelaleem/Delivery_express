export const STATUS_LABEL = {
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

export function getStatusBadgeClass(status) {
  if (!status) return 'badge-created';
  return `badge-${status}`;
}
