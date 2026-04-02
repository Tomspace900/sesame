// ============================================================
// API RESPONSE TYPES
// ============================================================

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: string;
  code: string;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function isApiSuccess<T>(res: ApiResponse<T>): res is ApiSuccess<T> {
  return res.success === true;
}

export function isApiError<T>(res: ApiResponse<T>): res is ApiError {
  return res.success === false;
}
