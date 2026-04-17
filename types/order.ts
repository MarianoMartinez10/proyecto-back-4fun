/**
 * Tipos y Enums: Órdenes
 * TypeScript strict
 */

export enum OrderStatus {
  pending = 'pending',
  processing = 'processing',
  shipped = 'shipped',
  delivered = 'delivered',
  cancelled = 'cancelled'
}

export interface Order {
  id: string;
  userId: string;
  paymentMethod: string;
  externalId?: string;
  itemsPrice: number;
  shippingPrice: number;
  totalPrice: number;
  orderStatus: OrderStatus;
  isPaid: boolean;
  paidAt?: Date;
  isDelivered: boolean;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceAtPurchase: number;
}
