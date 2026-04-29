/**
 * Tipos y Enums: Usuarios y Roles
 * TypeScript strict
 */

export enum Role {
  BUYER = 'BUYER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  phone?: string;
  address?: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

export interface UserAuthContext extends User {
  token?: string;
}

export interface SellerProfile {
  id: string;
  userId: string;
  storeName: string;
  storeDescription?: string;
  bankAccount?: string;
  taxId?: string;
  isApproved: boolean;
  createdAt: Date;
}
