/**
 * Sanitiza string contra XSS
 */
export declare function sanitizeHTML(input: string): string;
/**
 * Remove caracteres perigosos para SQL
 */
export declare function sanitizeSQL(input: string): string;
/**
 * Valida telefone brasileiro
 */
export declare function validatePhone(phone: string): {
    valid: boolean;
    cleaned: string;
};
/**
 * Valida email
 */
export declare function validateEmail(email: string): boolean;
/**
 * Valida UUID
 */
export declare function validateUUID(uuid: string): boolean;
/**
 * Limita tamanho de string
 */
export declare function truncate(input: string, maxLength: number): string;
/**
 * Sanitiza mensagem de chat (uso geral)
 */
export declare function sanitizeMessage(message: string): string;
/**
 * Valida e sanitiza input de webhook
 */
export declare function validateWebhookPayload(payload: any): {
    valid: boolean;
    error?: string;
    sanitized?: any;
};
/**
 * Valida request de API
 */
export declare function validateAPIRequest(body: any, requiredFields: string[]): {
    valid: boolean;
    error?: string;
};
/**
 * Mascara dados sensíveis para logs
 */
export declare function maskSensitiveData(data: any): any;
//# sourceMappingURL=validation.d.ts.map