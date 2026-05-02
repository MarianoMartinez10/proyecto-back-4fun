/**
 * Tipos y Enums: Órdenes
 * TypeScript strict
 */

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export interface Order {
  id: string;
  userId: string;
  paymentMethod: string;
  externalId?: string;
  shippingPrice: number;
  totalPrice: number;
  status: OrderStatus;
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
