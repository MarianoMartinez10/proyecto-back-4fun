/**
 * Tipos y Enums: Productos
 * TypeScript strict
 */

export enum ProductType {
  Digital = 'Digital',
  Fisico = 'Fisico'
}

export enum SpecPreset {
  Low = 'Low',
  Mid = 'Mid',
  High = 'High'
}

export interface Product {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  platformId: string;
  genreId: string;
  tipo: ProductType;
  fechaLanzamiento: Date;
  desarrollador: string;
  imagenUrl: string;
  trailerUrl?: string;
  calificacion: number;
  stock: number;
  cantidadVendida: number;
  activo: boolean;
  specPreset?: SpecPreset;
  descuentoPorcentaje: number;
  descuentoFechaFin?: Date;
  orden: number;
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
