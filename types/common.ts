/**
 * Tipos Comunes: API Responses
 * TypeScript strict
 */

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface PaginatedResult<T> {
  total: number;
  page: number;
  limit?: number;
  totalPages: number;
  data?: T[];
  items?: T[];
  [key: string]: any;
}

export interface ApiError {
  statusCode: number;
  message: string;
  details?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
}
