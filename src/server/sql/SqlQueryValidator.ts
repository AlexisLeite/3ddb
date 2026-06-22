const forbiddenKeywordPattern =
  /\b(alter|analyze|begin|call|cluster|commit|copy|create|deallocate|delete|do|drop|execute|grant|insert|listen|lock|merge|notify|prepare|refresh|reindex|reset|revoke|rollback|set|truncate|update|vacuum)\b/i;

function apiError(message: string): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode: 400 });
}

/**
 * Applies the SQL console's local read-only rules before any user-authored
 * statement or condition is allowed to reach the PostgreSQL driver.
 */
export class SqlQueryValidator {
  constructor(private readonly maxLength: number) {}

  /**
   * Validates a SQL WHERE expression for the renderable alias query context
   * while preventing full statements from being passed as conditions.
   */
  validateWhere(sql: unknown): string {
    const normalized = this.validateCommon(sql);
    if (/^(select|with)\b/i.test(normalized) || /\b(select|with)\b/i.test(normalized)) {
      throw apiError("La condicion WHERE no puede incluir subconsultas.");
    }
    return normalized;
  }

  /**
   * Validates a read-only SELECT/WITH statement that can later be converted to
   * feature or geometry identifiers for rendering in the map.
   */
  validateSelect(sql: unknown): string {
    const normalized = this.validateCommon(sql);
    if (!/^(select|with)\b/i.test(normalized)) {
      throw apiError("La consulta debe comenzar con SELECT o WITH.");
    }
    if (/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(normalized)) {
      throw apiError("La consulta no puede bloquear filas.");
    }
    return normalized;
  }

  private validateCommon(sql: unknown): string {
    if (typeof sql !== "string") throw apiError("La consulta SQL debe ser texto.");
    const normalized = sql.trim();
    if (!normalized) throw apiError("La consulta SQL no puede estar vacia.");
    if (normalized.length > this.maxLength) {
      throw apiError(`La consulta SQL no puede superar ${this.maxLength} caracteres.`);
    }
    if (/[;]/.test(normalized)) throw apiError("No se permiten multiples statements.");
    if (/--|\/\*|\*\//.test(normalized)) throw apiError("No se permiten comentarios SQL.");
    if (/\$\d+/.test(normalized)) throw apiError("No se permiten parametros SQL externos.");
    if (forbiddenKeywordPattern.test(normalized)) {
      throw apiError("Solo se permiten consultas de lectura.");
    }
    return normalized;
  }
}
