// ============================================
// MCP-DOCA-V2 - Validation & Sanitization
// Proteção contra SQL Injection, XSS, etc.
// ============================================

/**
 * Sanitiza string contra XSS
 */
export function sanitizeHTML(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Remove caracteres perigosos para SQL
 */
export function sanitizeSQL(input: string): string {
  return input
    .replace(/'/g, "''")
    .replace(/;/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '');
}

/**
 * Valida telefone brasileiro
 */
export function validatePhone(phone: string): { valid: boolean; cleaned: string } {
  const cleaned = phone.replace(/\D/g, '');
  const valid = cleaned.length >= 10 && cleaned.length <= 13;
  return { valid, cleaned };
}

/**
 * Valida email
 */
export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valida UUID
 */
export function validateUUID(uuid: string): boolean {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

/**
 * Limita tamanho de string
 */
export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return input.substring(0, maxLength);
}

/**
 * Sanitiza mensagem de chat (uso geral)
 */
export function sanitizeMessage(message: string): string {
  if (!message) return '';
  
  // Remove tags HTML
  let sanitized = message.replace(/<[^>]*>/g, '');
  
  // Limita tamanho (5000 chars max)
  sanitized = truncate(sanitized, 5000);
  
  // Remove caracteres de controle exceto newline
  sanitized = sanitized.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
  
  return sanitized.trim();
}

/**
 * Valida e sanitiza input de webhook
 */
export function validateWebhookPayload(payload: any): { 
  valid: boolean; 
  error?: string;
  sanitized?: any;
} {
  if (!payload) {
    return { valid: false, error: 'Payload vazio' };
  }

  // WAHA usa 'event', Z-API usa 'type' - aceitar ambos
  if (!payload.event && !payload.type) {
    return { valid: false, error: 'Campo event ou type obrigatório' };
  }

  // Sanitizar campos de texto - WAHA
  if (payload.payload?.body) {
    payload.payload.body = sanitizeMessage(payload.payload.body);
  }

  // Sanitizar campos de texto - Z-API
  if (payload.text?.message) {
    payload.text.message = sanitizeMessage(payload.text.message);
  }
  if (payload.body) {
    payload.body = sanitizeMessage(payload.body);
  }

  return { valid: true, sanitized: payload };
}

/**
 * Valida request de API
 */
export function validateAPIRequest(body: any, requiredFields: string[]): {
  valid: boolean;
  error?: string;
} {
  for (const field of requiredFields) {
    if (!body[field]) {
      return { valid: false, error: `Campo '${field}' é obrigatório` };
    }
  }
  return { valid: true };
}

/**
 * Mascara dados sensíveis para logs
 */
export function maskSensitiveData(data: any): any {
  if (!data) return data;
  
  const sensitiveFields = ['password', 'senha', 'api_key', 'apikey', 'token', 'secret'];
  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    if (masked[field]) {
      masked[field] = '***REDACTED***';
    }
  }
  
  // Mascarar telefone parcialmente
  if (masked.phone) {
    const phone = masked.phone.toString();
    if (phone.length > 6) {
      masked.phone = phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
    }
  }
  
  return masked;
}
