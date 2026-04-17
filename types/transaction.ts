/**
 * Tipos y Enums: Transacciones (Sistema de Escrow)
 * TypeScript strict - Sin `any`
 */

export enum TransactionStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  FUNDS_RELEASED = 'FUNDS_RELEASED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED'
}

export interface Transaction {
  id: string;
  orderId: string;
  sellerId: string;
  amount: number;
  status: TransactionStatus;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectionReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionWithRelations extends Transaction {
  seller?: {
    id: string;
    name: string;
    email: string;
  };
  order?: {
    id: string;
    totalPrice: number;
  };
  approvalAdmin?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface EscrowBalance {
  totalEscrow: number;
  totalReleased: number;
  pendingCount: number;
  totalBalance: number;
}

export interface FinancialStats {
  totalEscrow: number;
  pendingTransactionCount: number;
  totalApproved: number;
  approvedTransactionCount: number;
  rejectedCount: number;
}
