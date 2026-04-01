// ============================================
// MCP-DOCA-V2 - Graceful Shutdown
// Desliga o sistema sem perder dados
// ============================================

import { logger } from './logger.js';
import { redisService } from '../services/redis.service.js';
import { queueService } from '../services/queue.service.js';

type ShutdownHandler = () => Promise<void>;

class GracefulShutdown {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 segundos

  /**
   * Registra um handler para ser executado no shutdown
   */
  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Inicia o processo de shutdown
   */
  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown já em andamento...', {}, 'SHUTDOWN');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Recebido ${signal}. Iniciando shutdown graceful...`, {}, 'SHUTDOWN');

    // Timer de segurança
    const forceExitTimer = setTimeout(() => {
      logger.error('Shutdown timeout! Forçando saída...', {}, 'SHUTDOWN');
      process.exit(1);
    }, this.shutdownTimeout);

    try {
      // 1. Parar de aceitar novas conexões
      logger.info('Parando de aceitar novas conexões...', {}, 'SHUTDOWN');

      // 2. Executar handlers registrados
      for (const handler of this.handlers) {
        try {
          await handler();
        } catch (error) {
          logger.error('Erro em handler de shutdown', error, 'SHUTDOWN');
        }
      }

      // 3. Fechar filas (aguarda jobs em andamento)
      logger.info('Encerrando filas...', {}, 'SHUTDOWN');
      await queueService.shutdown();

      // 4. Fechar Redis
      logger.info('Desconectando Redis...', {}, 'SHUTDOWN');
      await redisService.disconnect();

      // 5. Limpar timer
      clearTimeout(forceExitTimer);

      logger.info('Shutdown concluído com sucesso!', {}, 'SHUTDOWN');
      process.exit(0);
    } catch (error) {
      logger.error('Erro durante shutdown', error, 'SHUTDOWN');
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  /**
   * Configura listeners para sinais do sistema
   */
  setup(): void {
    // SIGTERM - Docker stop, Kubernetes
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    // SIGINT - Ctrl+C
    process.on('SIGINT', () => this.shutdown('SIGINT'));

    // Erros não tratados
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error, 'SHUTDOWN');
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', { reason }, 'SHUTDOWN');
      // Não faz shutdown, apenas loga
    });

    logger.info('Graceful shutdown configurado', {}, 'SHUTDOWN');
  }

  /**
   * Verifica se está em processo de shutdown
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// Singleton
export const gracefulShutdown = new GracefulShutdown();
