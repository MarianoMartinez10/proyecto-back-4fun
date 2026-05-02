/**
 * Tipos y Enums: Productos
 * TypeScript strict
 */

export enum ProductType {
  DIGITAL = 'DIGITAL',
  PHYSICAL = 'PHYSICAL'
}

export enum SpecPreset {
  LOW = 'LOW',
  MID = 'MID',
  HIGH = 'HIGH'
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  platformId: string;
  genreId: string;
  type: ProductType;
  releaseDate: Date;
  developer: string;
  imageUrl: string;
  trailerUrl?: string;
  stock: number;
  isActive: boolean;
  specPreset?: SpecPreset;
  discountPercent: number;
  discountEndDate?: Date;
  displayOrder: number;
  sellerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductDTO extends Partial<Product> {
  finalPrice: number;
  discountPercentage: number;
  seller?: {
    id: string;
    name: string;
    storeName?: string;
  };
}
