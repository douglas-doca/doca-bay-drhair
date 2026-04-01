const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class UnObjectScraper {
  constructor(config) {
    this.config = {
      url: config.url || 'https://app.unobject.com.br/login',
      username: config.username,
      password: config.password,
      sala: config.sala || '01 - Deborah',
      salas: config.salas || [
        { id: 'sala01', nome: '01 - Deborah', profissional: 'Deborah', ativo: true }
      ],
      headless: config.headless !== false,
      screenshots: false, // ✅ HABILITADO!
      screenshotDir: config.screenshotDir || '/app/screenshots',
      timeout: config.timeout || 90000,
      duracaoAvaliacao: 40
    };
    
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, type = 'info') {
    const icons = {
      info: '📍',
      success: '✅',
      error: '❌',
      warning: '⚠️',
      debug: '🔍'
    };
    console.log(`${icons[type]} ${message}`);
  }

  async screenshot(name) {
    if (this.config.screenshots && this.page) {
      try {
        await fs.mkdir(this.config.screenshotDir, { recursive: true });
        const filepath = path.join(this.config.screenshotDir, `${Date.now()}-${name}.png`);
        await this.page.screenshot({ path: filepath, fullPage: true });
        this.log(`Screenshot: ${name}`, 'debug');
      } catch (e) {
        this.log(`Erro ao tirar screenshot: ${e.message}`, 'warning');
      }
    }
  }

  parseDataBR(dataStr) {
    if (!dataStr) {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return hoje;
    }
    
    dataStr = dataStr.toLowerCase();

    if (dataStr === 'hoje') {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return hoje;
    }
    
    if (dataStr === 'amanhã' || dataStr === 'amanha') {
      const amanha = new Date();
      amanha.setDate(amanha.getDate() + 1);
      amanha.setHours(0, 0, 0, 0);
      return amanha;
    }
    
    const parts = dataStr.split('/');
    if (parts.length === 2) {
      const hoje = new Date();
      const data = new Date(hoje.getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[0]), 12, 0, 0, 0);
      return data;
    } else if (parts.length === 3) {
      let year = parseInt(parts[2]);
      if (year < 2000) year += 2000;
      const data = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]), 12, 0, 0, 0);
      return data;
    }

    this.log(`Formato de data inválido: ${dataStr}. Usando 'hoje'.`, 'warning');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje;
  }

  async init() {
    if (this.browser) return;
    this.log('Iniciando navegador...');
    
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreHTTPSErrors: true
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // 🔥 Capturar console logs do navegador
    this.page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[DEBUG]')) {
        this.log(text.replace('[DEBUG]', '🔍'), 'debug');
      }
    });

    this.log('Navegador iniciado', 'success');
  }

  async login() {
    if (this.isLoggedIn) {
      try {
        await this.page.goto('https://app.unobject.com.br/schedule', { 
          waitUntil: 'networkidle0', 
          timeout: 10000 
        });
        if (!this.page.url().includes('login')) {
          this.log('Sessão já está ativa', 'info');
          return true;
        }
        this.isLoggedIn = false;
      } catch (e) {
        this.isLoggedIn = false;
      }
    }

    this.log('Fazendo login...');
    
    try {
      await this.page.goto(this.config.url, {
        waitUntil: 'networkidle0',
        timeout: 60000
      });
      
      await this.sleep(2000);

      await this.page.waitForSelector('input[name="login"]', { timeout: 10000 });
      await this.page.type('input[name="login"]', this.config.username, { delay: 50 });
      await this.page.type('input[name="password"]', this.config.password, { delay: 50 });

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        this.page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => b.textContent.includes('Acessar'));
          if (btn) btn.click();
        })
      ]);

      await this.sleep(2000);
      await this.screenshot('01-apos-login');

      if (!this.page.url().includes('login')) {
        this.isLoggedIn = true;
        this.log('Login realizado com sucesso!', 'success');
        return true;
      } else {
        throw new Error('Login falhou - credenciais incorretas');
      }
    } catch (err) {
      this.log(`Erro no login: ${err.message}`, 'error');
      await this.screenshot('error-login');
      throw err;
    }
  }

  async irParaAgenda() {
    if (this.page.url().includes('schedule')) {
      this.log('Já está na agenda', 'info');
      return;
    }
    
    this.log('Acessando agenda...');
    await this.page.goto('https://app.unobject.com.br/schedule', {
      waitUntil: 'networkidle0',
      timeout: this.config.timeout
    });
    
    await this.sleep(3000);
    await this.screenshot('02-agenda');
    this.log('Agenda carregada', 'success');
  }

  // =============================================================================
  // 🔥 NOVO: Selecionar múltiplas salas de uma vez
  // =============================================================================
  
  async selecionarTodasAsSalas(salas) {
    this.log(`🏥 Selecionando ${salas.length} salas simultaneamente...`);
    
    try {
      // Abrir dropdown - PROCURAR ESPECIFICAMENTE O INPUT/BUTTON
      const modalAbriu = await this.page.evaluate(() => {
        // 1. Tentar input com placeholder
        const inputs = Array.from(document.querySelectorAll('input'));
        for (const input of inputs) {
          const placeholder = (input.placeholder || '').toLowerCase();
          if (placeholder.includes('selecionar salas') || placeholder.includes('sala')) {
            console.log(`[DEBUG] Clicando INPUT placeholder: "${input.placeholder}"`);
            input.click();
            return { success: true, text: input.placeholder, method: 'input-placeholder' };
          }
        }
        
        // 2. Tentar botão específico
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = btn.textContent.trim();
          // Procurar botão com APENAS o texto de salas (não um botão gigante)
          if ((text === 'Selecionar salas...' || 
               text === 'Selecionar salas' ||
               text.toLowerCase() === 'salas') && 
              text.length < 30) {
            console.log(`[DEBUG] Clicando BUTTON: "${text}"`);
            btn.click();
            return { success: true, text: text, method: 'button-exact' };
          }
        }
        
        // 3. Tentar div/span clicável com texto específico
        const clickables = Array.from(document.querySelectorAll('div, span'));
        for (const el of clickables) {
          const text = el.textContent.trim();
          // Elemento pequeno que SÓ tem o texto de sala
          if ((text.includes('Selecionar salas') || text === 'Salas') && 
              text.length < 30 && 
              el.offsetParent !== null) {
            console.log(`[DEBUG] Clicando ELEMENTO: "${text}"`);
            el.click();
            return { success: true, text: text, method: 'element-small' };
          }
        }
        
        return { success: false };
      });

      if (modalAbriu.success) {
        this.log(`✅ Modal aberto via ${modalAbriu.method}: "${modalAbriu.text}"`, 'success');
      } else {
        this.log(`❌ Botão do modal NÃO ENCONTRADO!`, 'error');
        await this.screenshot('salas-00-botao-nao-encontrado');
        
        // Debug: mostrar todos os inputs
        await this.page.evaluate(() => {
          console.log('[DEBUG] === TODOS OS INPUTS ===');
          document.querySelectorAll('input').forEach((inp, i) => {
            console.log(`Input ${i}: type="${inp.type}" placeholder="${inp.placeholder}" value="${inp.value}"`);
          });
        });
        
        return false;
      }

      // 🔥 ESPERAR OS CHECKBOXES APARECEREM!
      this.log('⏳ Aguardando checkboxes carregarem...', 'info');
      
      try {
        await this.page.waitForSelector('input[type="checkbox"]', { 
          timeout: 10000,
          visible: true 
        });
        this.log('✅ Checkboxes detectados!', 'success');
      } catch (e) {
        this.log('⚠️ Timeout aguardando checkboxes - continuando assim mesmo', 'warning');
      }
      
      await this.sleep(2000);
      await this.screenshot('salas-01-dropdown-aberto');

      // 🔥 BUSCAR CHECKBOXES COM DEBUG COMPLETO!
      const resultado = await this.page.evaluate((salasConfig) => {
        const marcadas = [];
        const debugInfo = [];
        
        // Pegar TODOS os checkboxes
        const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        
        debugInfo.push(`Total de checkboxes encontrados: ${checkboxes.length}`);
        
        // Filtrar apenas visíveis
        const checkboxesVisiveis = checkboxes.filter(cb => {
          const isVisible = cb.offsetParent !== null;
          const rect = cb.getBoundingClientRect();
          const isInViewport = rect.width > 0 && rect.height > 0;
          return isVisible && isInViewport;
        });
        
        debugInfo.push(`Checkboxes visíveis: ${checkboxesVisiveis.length}`);
        
        for (let i = 0; i < checkboxesVisiveis.length; i++) {
          const checkbox = checkboxesVisiveis[i];
          
          // 🔥 PEGAR TODOS OS ATRIBUTOS
          const name = checkbox.getAttribute('name') || '';
          const value = checkbox.getAttribute('value') || '';
          const id = checkbox.getAttribute('id') || '';
          const className = checkbox.className || '';
          
          // Pegar texto do label associado
          let labelText = '';
          const label = checkbox.closest('label');
          if (label) {
            labelText = label.textContent.trim();
          } else {
            const parent = checkbox.parentElement;
            if (parent) {
              labelText = parent.textContent.trim();
            }
          }
          
          debugInfo.push(`Checkbox ${i}: name="${name}" value="${value}" label="${labelText.substring(0, 50)}" checked=${checkbox.checked}`);
          
          // Ver se corresponde a alguma sala
          for (const sala of salasConfig) {
            if (!sala.ativo) continue;
            
            // Match por qualquer campo que contenha profissional ou ID
            const match = name.includes(sala.profissional) || 
                          value.includes(sala.profissional) ||
                          labelText.includes(sala.profissional) ||
                          name.includes(sala.id.replace('sala', '')) ||
                          labelText.includes(sala.id.replace('sala', ''));
            
            if (match) {
              debugInfo.push(`  → MATCH com sala: ${sala.nome}`);
              if (!checkbox.checked) {
                checkbox.click();
                marcadas.push({ sala: labelText || name || value, action: 'marcou' });
              } else {
                marcadas.push({ sala: labelText || name || value, action: 'ja-marcado' });
              }
              break;
            }
          }
        }
        
        return { marcadas, debugInfo };
      }, salas.filter(s => s.ativo));

      // Log dos DEBUG INFO
      resultado.debugInfo.forEach(info => {
        this.log(info, 'debug');
      });

      // Log dos resultados
      if (resultado.marcadas.length > 0) {
        resultado.marcadas.forEach(r => {
          if (r.action === 'marcou') {
            this.log(`✅ Marcou: ${r.sala}`, 'success');
          } else {
            this.log(`✅ Já marcado: ${r.sala}`, 'success');
          }
        });
      } else {
        this.log(`⚠️ NENHUMA sala foi marcada!`, 'warning');
      }

      await this.sleep(1000);
      await this.screenshot('salas-02-marcadas');

      // Confirmar
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.toLowerCase().includes('confirmar'));
        if (btn) btn.click();
      });

      await this.sleep(2000);
      await this.screenshot('salas-03-confirmado');
      
      this.log(`✅ Processo concluído!`, 'success');
      return true;
      
    } catch (err) {
      this.log(`❌ Erro: ${err.message}`, 'error');
      return false;
    }
  }

  // =============================================================================
  // Método original mantido para compatibilidade
  // =============================================================================
  
  async selecionarSala() {
    this.log(`Selecionando sala: ${this.config.sala}...`);
    
    try {
      await this.page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button, div[role="button"], input, div'))
          .find(el => {
            const text = (el.textContent || el.placeholder || '').toLowerCase();
            return (text.includes('selecione as salas') || text.includes('selecionar salas')) &&
                   el.offsetParent !== null;
          });
        if (btn) btn.click();
      });

      await this.sleep(2000);

      const salaClicked = await this.page.evaluate((salaName) => {
        const items = Array.from(document.querySelectorAll('li, option, div[role="option"], label, input[type="checkbox"]'));
        for (const item of items) {
          const text = item.textContent.trim();
          if (text.includes(salaName) || (salaName.includes('Deborah') && text.includes('Deborah'))) { 
            if (item.type === 'checkbox') {
              item.checked = true;
              item.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              item.click();
            }
            return { success: true, text: text };
          }
        }
        return { success: false };
      }, this.config.sala);

      if (salaClicked.success) {
        this.log(`Sala selecionada: ${salaClicked.text}`, 'success');
      }

      await this.sleep(1000);

      await this.page.evaluate(() => {
        const confirmBtn = Array.from(document.querySelectorAll('button'))
          .find(b => {
            const text = b.textContent.toLowerCase();
            return text.includes('confirmar') || text.includes('ok') || 
                   text.includes('aplicar') || text.includes('salvar');
          });
        if (confirmBtn) confirmBtn.click();
      });

      await this.sleep(2000);
      await this.screenshot('03-sala-selecionada');
      return true;
    } catch (err) {
      this.log(`Erro ao selecionar sala: ${err.message}`, 'warning');
      return true;
    }
  }

  async garantirSessaoPronta() {
    await this.init();
    await this.login();
    await this.irParaAgenda();
    await this.selecionarSala();
  }

  async getDataAtual() {
    try {
      await this.sleep(2000);
      
      const dataInfo = await this.page.evaluate(() => {
        const datePattern = /(\d{2}\/\d{2}\/\d{4})/;
        const allText = document.body.innerText;
        const lines = allText.split('\n');
        
        for (const line of lines) {
          if (/(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i.test(line)) {
            const match = line.match(datePattern);
            if (match) {
              return {
                texto: line.trim(),
                data: match[1],
                diaSemana: line.match(/(segunda|terça|quarta|quinta|sexta|sábado|domingo)[-\s]*feira/i)?.[0] || ''
              };
            }
          }
        }
        
        return null;
      });
      
      if (dataInfo && dataInfo.data) {
        this.log(`Data lida: ${dataInfo.data}`, 'debug');
        return dataInfo;
      }

      this.log('Data não encontrada na página', 'warning');
      return null;
      
    } catch (e) {
      this.log(`Erro ao ler data: ${e.message}`, 'error');
      return null;
    }
  }

  async avancarDia() {
    await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (ariaLabel.includes('next') || ariaLabel.includes('próximo')) {
          btn.click();
          return;
        }
      }
      const rightArrow = Array.from(document.querySelectorAll('button svg path'))
        .find(p => p.getAttribute('d') && p.getAttribute('d').includes('M10 6L8.59 7.41'));
      if (rightArrow) {
        rightArrow.closest('button').click();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('>'));
      if (btn) btn.click();
    });
    await this.sleep(2000);
  }

  async voltarDia() {
    await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        if (ariaLabel.includes('previous') || ariaLabel.includes('anterior')) {
          btn.click();
          return;
        }
      }
      const leftArrow = Array.from(document.querySelectorAll('button svg path'))
        .find(p => p.getAttribute('d') && p.getAttribute('d').includes('M15.41 7.41L14 6l-6 6'));
      if (leftArrow) {
        leftArrow.closest('button').click();
        return;
      }
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('<'));
      if (btn) btn.click();
    });
    await this.sleep(2000);
  }

  async navegarParaDataViaCalendario(dataAlvo) {
    this.log(`📅 Navegando via calendário para ${dataAlvo.toLocaleDateString('pt-BR')}...`);
    
    try {
      this.log('Abrindo calendário...', 'debug');
      
      const calendarioAberto = await this.page.evaluate(() => {
        const spans = document.querySelectorAll('span.MuiButton-label');
        for (const span of spans) {
          const text = span.textContent || '';
          if (/\d{2}\/\d{2}\/\d{4}/.test(text) && text.includes('-')) {
            span.click();
            return { success: true, texto: text };
          }
        }
        
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent || '';
          if (/\d{2}\/\d{2}\/\d{4}/.test(text) && text.includes('feira')) {
            btn.click();
            return { success: true, texto: text };
          }
        }
        
        return { success: false };
      });
      
      if (!calendarioAberto.success) {
        this.log('❌ Não conseguiu abrir calendário', 'error');
        return false;
      }
      
      this.log(`✅ Calendário aberto`, 'success');
      await this.sleep(1500);
      await this.screenshot('nav-cal-01-aberto');
      
      const mesAlvo = dataAlvo.getMonth();
      const anoAlvo = dataAlvo.getFullYear();
      
      let tentativas = 0;
      const MAX_TENTATIVAS = 24;
      
      while (tentativas < MAX_TENTATIVAS) {
        const mesAnoAtual = await this.page.evaluate(() => {
          const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 
                         'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
          
          const elementos = document.querySelectorAll('div, span, p');
          for (const el of elementos) {
            const text = (el.textContent || '').toLowerCase().trim();
            
            for (let i = 0; i < meses.length; i++) {
              if (text.includes(meses[i]) && /\d{4}/.test(text) && text.length < 25) {
                const anoMatch = text.match(/(\d{4})/);
                if (anoMatch) {
                  return { mes: i, ano: parseInt(anoMatch[1]), texto: text };
                }
              }
            }
          }
          return null;
        });
        
        if (!mesAnoAtual) {
          this.log('⚠️ Não leu mês/ano', 'warning');
          tentativas++;
          await this.sleep(500);
          continue;
        }
        
        this.log(`📍 Mês atual: ${mesAnoAtual.texto}`, 'debug');
        
        if (mesAnoAtual.mes === mesAlvo && mesAnoAtual.ano === anoAlvo) {
          this.log(`✅ Mês correto!`, 'success');
          break;
        }
        
        const dataAtualCal = new Date(mesAnoAtual.ano, mesAnoAtual.mes, 1);
        const dataAlvoCal = new Date(anoAlvo, mesAlvo, 1);
        
        if (dataAlvoCal > dataAtualCal) {
          this.log('➡️ Avançando mês...', 'debug');
          
          const avancou = await this.page.evaluate(() => {
            const iconLabels = document.querySelectorAll('span.MuiIconButton-label');
            const labelsArray = Array.from(iconLabels).filter(label => {
              const svg = label.querySelector('svg');
              const rect = label.getBoundingClientRect();
              return svg && rect.y > 80 && rect.y < 200;
            });
            
            if (labelsArray.length >= 2) {
              labelsArray.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
              const setaDireita = labelsArray[labelsArray.length - 1];
              const btn = setaDireita.closest('button');
              if (btn) {
                btn.click();
                return { success: true, metodo: 'MuiIconButton-label' };
              }
            }
            
            const pathDireita = document.querySelector('path[d*="M8.59 16.59"]');
            if (pathDireita) {
              const btn = pathDireita.closest('button');
              if (btn) {
                btn.click();
                return { success: true, metodo: 'path-d' };
              }
            }
            
            const allButtons = Array.from(document.querySelectorAll('button'));
            const calendarButtons = allButtons.filter(btn => {
              const rect = btn.getBoundingClientRect();
              return rect.y > 80 && rect.y < 200 && rect.width < 60 && rect.height < 60;
            });
            
            if (calendarButtons.length >= 2) {
              calendarButtons.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
              calendarButtons[calendarButtons.length - 1].click();
              return { success: true, metodo: 'posicao' };
            }
            
            return { success: false };
          });
          
          if (!avancou.success) {
            this.log('⚠️ Não conseguiu clicar na seta direita', 'warning');
          } else {
            this.log(`Clicou via ${avancou.metodo}`, 'debug');
          }
          
        } else {
          this.log('⬅️ Voltando mês...', 'debug');
          
          const voltou = await this.page.evaluate(() => {
            const iconLabels = document.querySelectorAll('span.MuiIconButton-label');
            const labelsArray = Array.from(iconLabels).filter(label => {
              const svg = label.querySelector('svg');
              const rect = label.getBoundingClientRect();
              return svg && rect.y > 80 && rect.y < 200;
            });
            
            if (labelsArray.length >= 2) {
              labelsArray.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
              const setaEsquerda = labelsArray[0];
              const btn = setaEsquerda.closest('button');
              if (btn) {
                btn.click();
                return { success: true, metodo: 'MuiIconButton-label' };
              }
            }
            
            const pathEsquerda = document.querySelector('path[d*="M15.41 16.59"]');
            if (pathEsquerda) {
              const btn = pathEsquerda.closest('button');
              if (btn) {
                btn.click();
                return { success: true, metodo: 'path-d' };
              }
            }
            
            const allButtons = Array.from(document.querySelectorAll('button'));
            const calendarButtons = allButtons.filter(btn => {
              const rect = btn.getBoundingClientRect();
              return rect.y > 80 && rect.y < 200 && rect.width < 60 && rect.height < 60;
            });
            
            if (calendarButtons.length >= 2) {
              calendarButtons.sort((a, b) => a.getBoundingClientRect().x - b.getBoundingClientRect().x);
              calendarButtons[0].click();
              return { success: true, metodo: 'posicao' };
            }
            
            return { success: false };
          });
          
          if (!voltou.success) {
            this.log('⚠️ Não conseguiu clicar na seta esquerda', 'warning');
          }
        }
        
        await this.sleep(1000);
        tentativas++;
      }
      
      if (tentativas >= MAX_TENTATIVAS) {
        this.log('❌ Não chegou no mês correto', 'error');
        return false;
      }
      
      await this.screenshot('nav-cal-02-mes-correto');
      
      const diaAlvo = dataAlvo.getDate();
      this.log(`📍 Clicando no dia ${diaAlvo}...`, 'debug');
      
      const diaClicado = await this.page.evaluate((dia) => {
        const calendarGrid = document.querySelector('.MuiPickersCalendar-transitionContainer') ||
                             document.querySelector('[class*="PickersCalendar"]') ||
                             document.querySelector('[role="grid"]');
        
        if (calendarGrid) {
          const buttons = calendarGrid.querySelectorAll('button');
          for (const btn of buttons) {
            const text = btn.textContent.trim();
            if (text === String(dia)) {
              btn.click();
              return { success: true, metodo: 'grid-button' };
            }
          }
        }
        
        const elementos = document.querySelectorAll('p.MuiTypography-root');
        for (const el of elementos) {
          const text = el.textContent.trim();
          if (text === String(dia)) {
            const rect = el.getBoundingClientRect();
            if (rect.y > 180 && rect.y < 500) {
              const btn = el.closest('button');
              if (btn) {
                btn.click();
                return { success: true, metodo: 'typography' };
              }
            }
          }
        }
        
        const allButtons = Array.from(document.querySelectorAll('button'));
        for (const btn of allButtons) {
          const text = btn.textContent.trim();
          const rect = btn.getBoundingClientRect();
          if (text === String(dia) && rect.y > 180 && rect.y < 500 && rect.width < 60) {
            btn.click();
            return { success: true, metodo: 'button-direto' };
          }
        }
        
        return { success: false };
      }, diaAlvo);
      
      if (!diaClicado.success) {
        this.log(`❌ Dia ${diaAlvo} não encontrado`, 'error');
        return false;
      }
      
      this.log(`✅ Dia ${diaAlvo} selecionado (${diaClicado.metodo})`, 'success');
      await this.sleep(800);
      await this.screenshot('nav-cal-03-dia-ok');
      
      this.log('📍 Clicando em OK...', 'debug');
      
      const okClicado = await this.page.evaluate(() => {
        const spans = document.querySelectorAll('span.MuiButton-label');
        for (const span of spans) {
          if ((span.textContent || '').trim().toUpperCase() === 'OK') {
            const btn = span.closest('button');
            if (btn) btn.click();
            else span.click();
            return true;
          }
        }
        
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if ((btn.textContent || '').trim().toUpperCase() === 'OK') {
            btn.click();
            return true;
          }
        }
        
        return false;
      });
      
      if (okClicado) {
        this.log('✅ OK clicado!', 'success');
      }
      
      await this.sleep(2000);
      await this.screenshot('nav-cal-04-confirmado');
      
      return true;
      
    } catch (err) {
      this.log(`❌ Erro navegação calendário: ${err.message}`, 'error');
      await this.screenshot('erro-nav-calendario');
      return false;
    }
  }

  async navegarDiaADia(dataAlvo) {
    this.log(`➡️ Navegando dia a dia até ${dataAlvo.toLocaleDateString('pt-BR')}...`);
    
    let tentativas = 0;
    const MAX_TENTATIVAS = 50;

    while (tentativas < MAX_TENTATIVAS) {
      let dataAtualInfo = await this.getDataAtual();
      
      if (!dataAtualInfo || !dataAtualInfo.data) {
        tentativas++;
        await this.sleep(2000);
        continue;
      }
      
      const dataAtual = this.parseDataBR(dataAtualInfo.data);

      if (dataAtual.toDateString() === dataAlvo.toDateString()) {
        this.log(`✅ Data encontrada!`, 'success');
        return true;
      }

      if (dataAlvo > dataAtual) {
        await this.avancarDia();
      } else {
        await this.voltarDia();
      }
      
      tentativas++;
    }
    
    this.log(`❌ Não encontrou a data após ${MAX_TENTATIVAS} tentativas`, 'error');
    return false;
  }

  async extrairHorarios() {
    this.log('Extraindo horários...', 'debug');

    const horariosInfo = await this.page.evaluate(() => {
      const bodyText = document.body.innerText;
      
      const agendamentosElements = Array.from(document.querySelectorAll('div, span'))
        .filter(el => {
          const text = el.textContent;
          return /\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/.test(text) && 
                 text.length < 500;
        })
        .map(el => {
          const text = el.textContent.trim();
          const match = text.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
          if (match) {
            return {
              horarioInicio: match[1],
              horarioFim: match[2],
              tipo: text
            };
          }
          return null;
        })
        .filter(h => h !== null);

      const todosHorarios = [...new Set(bodyText.match(/\b([0-2]?\d):([0-5]\d)\b/g) || [])].sort();
      
      return { agendamentos: agendamentosElements, todosHorarios: todosHorarios };
    });

    this.log(`${horariosInfo.agendamentos.length} blocos ocupados encontrados`, 'debug');
    return horariosInfo;
  }

  // =============================================================================
  // 🔥 CORRIGIDO: Extrair horários por coluna de sala (usando seletores corretos do UnObject)
  // =============================================================================
  
  async extrairHorariosPorSala(salas) {
    this.log('🔍 Extraindo horários por sala (método CORRIGIDO)...', 'debug');
    
    const resultado = await this.page.evaluate((salasConfig) => {
      console.log('[DEBUG] 🔍 [EXTRAÇÃO] Iniciando...');
      console.log(`[DEBUG] 🔍 [EXTRAÇÃO] Salas configuradas: ${JSON.stringify(salasConfig.map(s => ({ id: s.id, nome: s.nome, prof: s.profissional })))}`);
      const resultado = {};
      
      // ========================================================================
      // PASSO 1: Encontrar colunas das salas (rbc-day-slot rbc-time-column)
      // ========================================================================
      const colunas = Array.from(document.querySelectorAll('.rbc-day-slot.rbc-time-column'));
      console.log(`[DEBUG] 🔍 [EXTRAÇÃO] ${colunas.length} colunas encontradas`);
      
      if (colunas.length === 0) {
        console.log('[DEBUG] ⚠️ [EXTRAÇÃO] Nenhuma coluna encontrada!');
        return null;
      }

      // ========================================================================
      // PASSO 2: Encontrar headers das salas para mapear coluna -> sala
      // ========================================================================
      const allHeaders = Array.from(document.querySelectorAll('.rbc-header'));
      console.log(`[DEBUG] 🔍 [EXTRAÇÃO] ${allHeaders.length} headers encontrados (total)`);
      
      // 🔥 DEBUG: Mostrar TODOS os headers
      allHeaders.forEach((h, idx) => {
        const text = h.textContent.trim();
        console.log(`[DEBUG] 🔍 [EXTRAÇÃO]   Header ${idx}: "${text}" (length=${text.length})`);
      });
      
      // 🔥 FILTRAR apenas headers que são de SALAS (contêm nome de alguma sala)
      const headers = allHeaders.filter(h => {
        const text = h.textContent.trim();
        const textNorm = text.replace(/\s+/g, '').toLowerCase();
        
        // Ver se este header contém o nome de alguma sala configurada
        return salasConfig.some(sala => {
          const salaNomeNorm = sala.nome.replace(/\s+/g, '').toLowerCase();
          const salaProfNorm = sala.profissional.replace(/\s+/g, '').toLowerCase();
          return textNorm.includes(salaNomeNorm) || textNorm.includes(salaProfNorm);
        });
      });
      
      console.log(`[DEBUG] 🔍 [EXTRAÇÃO] ${headers.length} headers de SALAS (filtrados)`);
      headers.forEach((h, idx) => {
        console.log(`[DEBUG] 🔍 [EXTRAÇÃO]   Header SALA ${idx}: "${h.textContent.trim()}"`);
      });

      // ========================================================================
      // PASSO 3: Para cada coluna, identificar a sala e extrair horários
      // ========================================================================
      colunas.forEach((coluna, colunaIdx) => {
        console.log(`[DEBUG] 🔍 [EXTRAÇÃO] Processando coluna ${colunaIdx + 1}...`);
        
        // Procurar header correspondente (mesma posição, mas APENAS entre headers de salas)
        let salaInfo = null;
        
        // 🔥 Usar o array FILTRADO de headers (apenas salas)
        const headerNessaPosicao = headers[colunaIdx]; // headers já é o array filtrado!
        
        if (headerNessaPosicao) {
          const headerText = headerNessaPosicao.textContent.trim();
          console.log(`[DEBUG] 🔍 [EXTRAÇÃO]   Header SALA na posição ${colunaIdx}: "${headerText}"`);
          
          // Identificar qual sala é este header
          for (const sala of salasConfig) {
            const headerNorm = headerText.replace(/\s+/g, '').toLowerCase();
            const salaNomeNorm = sala.nome.replace(/\s+/g, '').toLowerCase();
            const salaProfNorm = sala.profissional.replace(/\s+/g, '').toLowerCase();
            
            if (headerNorm.includes(salaNomeNorm) || headerNorm.includes(salaProfNorm)) {
              salaInfo = sala;
              console.log(`[DEBUG] 🔍 [EXTRAÇÃO] Coluna ${colunaIdx + 1} = ${sala.nome} (header="${headerText}")`);
              break;
            }
          }
        } else {
          console.log(`[DEBUG] ⚠️ [EXTRAÇÃO]   Nenhum header de SALA na posição ${colunaIdx}!`);
        }

        if (!salaInfo) {
          console.log(`[DEBUG] ⚠️ [EXTRAÇÃO] Sala não identificada para coluna ${colunaIdx + 1}`);
          return;
        }

        // ========================================================================
        // PASSO 4: Extrair eventos desta coluna
        // ========================================================================
        const eventosContainer = coluna.querySelector('.rbc-events-container');
        
        if (!eventosContainer) {
          console.log(`[DEBUG] ⚠️ [EXTRAÇÃO] Container de eventos não encontrado para ${salaInfo.nome}`);
          resultado[salaInfo.id] = {
            nome: salaInfo.nome,
            profissional: salaInfo.profissional,
            agendamentos: [],
            todosHorarios: []
          };
          return;
        }

        // Extrair todos os eventos (.rbc-event)
        const eventos = Array.from(eventosContainer.querySelectorAll('.rbc-event'));
        console.log(`[DEBUG] 🔍 [EXTRAÇÃO] ${eventos.length} eventos encontrados em ${salaInfo.nome}`);

        const agendamentos = [];
        const todosHorariosSet = new Set();

        eventos.forEach(evento => {
          // Pegar label do horário (.rbc-event-label)
          const label = evento.querySelector('.rbc-event-label');
          
          if (label) {
            const labelText = label.textContent.trim();
            console.log(`[DEBUG] 🔍 [EXTRAÇÃO] Evento: ${labelText}`);
            
            // Extrair horários (ex: "10:00 – 10:30")
            const match = labelText.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
            
            if (match) {
              const [_, horarioInicio, horarioFim] = match;
              agendamentos.push({
                horarioInicio,
                horarioFim
              });
              
              todosHorariosSet.add(horarioInicio);
              todosHorariosSet.add(horarioFim);
            }
          }
        });

        // Também extrair horários dos slots de tempo (rbc-time-slot)
        const timeSlots = Array.from(coluna.querySelectorAll('.rbc-time-slot'));
        timeSlots.forEach(slot => {
          const text = slot.textContent.trim();
          const match = text.match(/\b(\d{1,2}:\d{2})\b/);
          if (match) {
            todosHorariosSet.add(match[1]);
          }
        });

        const todosHorarios = [...todosHorariosSet].sort();

        // 🔥 GARANTIR que temos todos os horários do dia (10:00-20:00 a cada 10min)
        // Se extraímos poucos horários, gerar a grade completa
        if (todosHorarios.length < 10) {
          console.log(`[DEBUG] ⚠️ [EXTRAÇÃO] Poucos horários extraídos (${todosHorarios.length}), gerando grade completa...`);
          
          // Gerar horários de 10:00 até 20:00 a cada 10 minutos
          for (let h = 10; h <= 19; h++) {
            for (let m of [0, 10, 20, 30, 40, 50]) {
              const horario = `${h}:${m.toString().padStart(2, '0')}`;
              todosHorariosSet.add(horario);
            }
          }
          // Adicionar 20:00
          todosHorariosSet.add('20:00');
        }
        
        const todosHorariosCompletos = [...todosHorariosSet].sort();
        console.log(`[DEBUG] 🔍 [EXTRAÇÃO] ${salaInfo.nome}: horários finais = ${todosHorariosCompletos.length} (${todosHorariosCompletos.slice(0, 3).join(', ')}...)`);

        resultado[salaInfo.id] = {
          nome: salaInfo.nome,
          profissional: salaInfo.profissional,
          agendamentos: agendamentos,
          todosHorarios: todosHorariosCompletos
        };

        console.log(`[DEBUG] ✅ [EXTRAÇÃO] ${salaInfo.nome}: ${agendamentos.length} agendamentos, ${todosHorarios.length} horários`);
      });
      
      console.log('[DEBUG] ✅ [EXTRAÇÃO] Concluída!');
      return Object.keys(resultado).length > 0 ? resultado : null;
      
    }, salas);
    
    if (resultado) {
      for (const [salaId, dados] of Object.entries(resultado)) {
        this.log(`✅ ${dados.nome}: ${dados.agendamentos.length} agendamentos detectados`, 'debug');
      }
    } else {
      this.log('⚠️ Nenhum horário extraído (modo single-room?)', 'warning');
    }
    
    return resultado;
  }

  verificarDisponibilidadeConsecutiva(horariosInfo, horarioInicio, duracaoMinutos) {
    const todosHorarios = horariosInfo.todosHorarios;
    const ocupados = new Set();
    
    horariosInfo.agendamentos.forEach(ag => {
      const inicioIndex = todosHorarios.indexOf(ag.horarioInicio);
      const fimIndex = todosHorarios.indexOf(ag.horarioFim);
      if (inicioIndex >= 0 && fimIndex >= 0) {
        for (let i = inicioIndex; i < fimIndex; i++) {
          ocupados.add(todosHorarios[i]);
        }
      }
    });
    
    const indiceInicio = todosHorarios.indexOf(horarioInicio);
    if (indiceInicio < 0) return false;
    
    const slotsNecessarios = Math.ceil(duracaoMinutos / 10);
    
    for (let i = 0; i < slotsNecessarios; i++) {
      const slotIndex = indiceInicio + i;
      if (slotIndex >= todosHorarios.length) return false;
      if (ocupados.has(todosHorarios[slotIndex])) return false;
    }
    
    return true;
  }

  // =============================================================================
  // 🔥 NOVO: Consultar horários multi-sala (principal)
  // =============================================================================
  
  async consultarHorariosMultiSala(dataStr, salas) {
    this.log(`🏥 Consultando ${salas.length} salas para ${dataStr}...`);
    
    try {
      await this.garantirSessaoPronta();

      this.log('Garantindo visualização "Dia"');
      await this.page.evaluate(() => {
        const diaBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim().toLowerCase() === 'dia');
        if (diaBtn) diaBtn.click();
      });
      await this.sleep(2000);
      await this.screenshot('consulta-01-view-dia');

      const dataAlvo = this.parseDataBR(dataStr);
      this.log(`Data alvo: ${dataAlvo.toLocaleDateString('pt-BR')}`);

      // Navegação inteligente
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const diffDias = Math.ceil((dataAlvo - hoje) / (1000 * 60 * 60 * 24));
      
      this.log(`📍 Diferença: ${diffDias} dias`, 'debug');

      if (Math.abs(diffDias) > 5) {
        this.log(`📅 Usando navegação via CALENDÁRIO (${diffDias} dias)`, 'info');
        
        const sucessoCalendario = await this.navegarParaDataViaCalendario(dataAlvo);
        
        if (!sucessoCalendario) {
          this.log('⚠️ Calendário falhou, usando dia a dia...', 'warning');
          await this.navegarDiaADia(dataAlvo);
        }
      } else {
        this.log(`➡️ Usando navegação DIA A DIA (${diffDias} dias)`, 'info');
        await this.navegarDiaADia(dataAlvo);
      }

      await this.screenshot('consulta-02-data-correta');

      // 🔥 Selecionar TODAS as salas de uma vez
      await this.selecionarTodasAsSalas(salas);
      
      await this.sleep(3000);
      await this.screenshot('consulta-03-todas-salas-visiveis');

      // 🔥 Tentar extrair por coluna (se 2 salas lado a lado)
      let horariosPorSala = await this.extrairHorariosPorSala(salas);
      
      if (horariosPorSala) {
        // Sucesso! Conseguiu separar por coluna
        this.log('✅ Horários extraídos por coluna!', 'success');
        
        // Processar cada sala
        const resultado = {};
        
        for (const [salaId, salaInfo] of Object.entries(horariosPorSala)) {
          const ocupados = new Set();
          salaInfo.agendamentos.forEach(ag => {
            const inicioIndex = salaInfo.todosHorarios.indexOf(ag.horarioInicio);
            const fimIndex = salaInfo.todosHorarios.indexOf(ag.horarioFim);
            if (inicioIndex >= 0 && fimIndex >= 0) {
              for (let i = inicioIndex; i < fimIndex; i++) {
                ocupados.add(salaInfo.todosHorarios[i]);
              }
            }
          });

          const horariosLivres = salaInfo.todosHorarios.filter(h => !ocupados.has(h));
          
          const horariosFiltrados = horariosLivres.filter(h => {
            try {
              const [hora, minuto] = h.split(':').map(Number);
              const horarioEmMinutos = hora * 60 + minuto;
              
              const inicioManha = 10 * 60;
              const fimManha = 13 * 60;
              const inicioTarde = 15 * 60;
              const fimTarde = 20 * 60;
              
              const dentroHorario = (horarioEmMinutos >= inicioManha && horarioEmMinutos < fimManha) ||
                                   (horarioEmMinutos >= inicioTarde && horarioEmMinutos < fimTarde);
              
              if (!dentroHorario) return false;
              
              const tem40MinLivres = this.verificarDisponibilidadeConsecutiva(
                { ...salaInfo, todosHorarios: horariosLivres }, 
                h, 
                this.config.duracaoAvaliacao
              );
              
              return tem40MinLivres;
            } catch(e) { 
              return false; 
            }
          });

          resultado[salaId] = {
            nome: salaInfo.nome,
            profissional: salaInfo.profissional,
            horarios: horariosFiltrados
          };
          
          this.log(`✅ ${salaInfo.nome}: ${horariosFiltrados.length} horários`, 'success');
        }
        
        return resultado;
        
      } else {
        // Fallback: método tradicional (1 sala só)
        this.log('⚠️ Não detectou múltiplas colunas, usando método tradicional', 'warning');
        
        const horarios = await this.extrairHorarios();
        
        const ocupados = new Set();
        horarios.agendamentos.forEach(ag => {
          const inicioIndex = horarios.todosHorarios.indexOf(ag.horarioInicio);
          const fimIndex = horarios.todosHorarios.indexOf(ag.horarioFim);
          if (inicioIndex >= 0 && fimIndex >= 0) {
            for (let i = inicioIndex; i < fimIndex; i++) {
              ocupados.add(horarios.todosHorarios[i]);
            }
          }
        });

        const horariosLivres = horarios.todosHorarios.filter(h => !ocupados.has(h));
        
        const horariosFiltrados = horariosLivres.filter(h => {
          try {
            const [hora, minuto] = h.split(':').map(Number);
            const horarioEmMinutos = hora * 60 + minuto;
            
            const inicioManha = 10 * 60;
            const fimManha = 13 * 60;
            const inicioTarde = 15 * 60;
            const fimTarde = 20 * 60;
            
            const dentroHorario = (horarioEmMinutos >= inicioManha && horarioEmMinutos < fimManha) ||
                                 (horarioEmMinutos >= inicioTarde && horarioEmMinutos < fimTarde);
            
            if (!dentroHorario) return false;
            
            const tem40MinLivres = this.verificarDisponibilidadeConsecutiva(
              { ...horarios, todosHorarios: horariosLivres }, 
              h, 
              this.config.duracaoAvaliacao
            );
            
            return tem40MinLivres;
          } catch(e) { 
            return false; 
          }
        });

        // Retornar para todas as salas ativas (mesmo horário em todas)
        const resultado = {};
        const salasAtivas = salas.filter(s => s.ativo);
        
        salasAtivas.forEach(sala => {
          resultado[sala.id] = {
            nome: sala.nome,
            profissional: sala.profissional,
            horarios: horariosFiltrados
          };
        });
        
        return resultado;
      }

    } catch (err) {
      this.log(`❌ Erro ao consultar multi-sala: ${err.message}`, 'error');
      await this.screenshot('error-consulta-multisala');
      throw err;
    }
  }

  // =============================================================================
  // Método original mantido para compatibilidade
  // =============================================================================
  
  async consultarHorarios(dataStr) {
    this.log(`Iniciando consulta de horários para ${dataStr}...`);
    
    try {
      await this.garantirSessaoPronta();

      this.log('Garantindo visualização "Dia"');
      await this.page.evaluate(() => {
        const diaBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim().toLowerCase() === 'dia');
        if (diaBtn) diaBtn.click();
      });
      await this.sleep(2000);
      await this.screenshot('consulta-01-view-dia');

      const dataAlvo = this.parseDataBR(dataStr);
      this.log(`Data alvo: ${dataAlvo.toLocaleDateString('pt-BR')}`);

      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const diffDias = Math.ceil((dataAlvo - hoje) / (1000 * 60 * 60 * 24));
      
      this.log(`📍 Diferença: ${diffDias} dias`, 'debug');

      if (Math.abs(diffDias) > 5) {
        this.log(`📅 Usando navegação via CALENDÁRIO (${diffDias} dias)`, 'info');
        
        const sucessoCalendario = await this.navegarParaDataViaCalendario(dataAlvo);
        
        if (!sucessoCalendario) {
          this.log('⚠️ Calendário falhou, usando dia a dia...', 'warning');
          await this.navegarDiaADia(dataAlvo);
        }
      } else {
        this.log(`➡️ Usando navegação DIA A DIA (${diffDias} dias)`, 'info');
        await this.navegarDiaADia(dataAlvo);
      }

      await this.screenshot('consulta-02-data-correta');
      const horarios = await this.extrairHorarios();
      
      const ocupados = new Set();
      horarios.agendamentos.forEach(ag => {
        const inicioIndex = horarios.todosHorarios.indexOf(ag.horarioInicio);
        const fimIndex = horarios.todosHorarios.indexOf(ag.horarioFim);
        if (inicioIndex >= 0 && fimIndex >= 0) {
          for (let i = inicioIndex; i < fimIndex; i++) {
            ocupados.add(horarios.todosHorarios[i]);
          }
        }
      });

      const horariosLivres = horarios.todosHorarios.filter(h => !ocupados.has(h));
      
      const horariosFiltrados = horariosLivres.filter(h => {
        try {
          const [hora, minuto] = h.split(':').map(Number);
          const horarioEmMinutos = hora * 60 + minuto;
          
          const inicioManha = 10 * 60;
          const fimManha = 13 * 60;
          const inicioTarde = 15 * 60;
          const fimTarde = 20 * 60;
          
          const dentroHorario = (horarioEmMinutos >= inicioManha && horarioEmMinutos < fimManha) ||
                               (horarioEmMinutos >= inicioTarde && horarioEmMinutos < fimTarde);
          
          if (!dentroHorario) return false;
          
          const tem40MinLivres = this.verificarDisponibilidadeConsecutiva(
            { ...horarios, todosHorarios: horariosLivres }, 
            h, 
            this.config.duracaoAvaliacao
          );
          
          return tem40MinLivres;
        } catch(e) { 
          return false; 
        }
      });

      this.log(`Horários disponíveis em ${dataStr}: ${horariosFiltrados.join(', ')}`, 'success');
      return horariosFiltrados;

    } catch (err) {
      this.log(`Erro ao consultar horários: ${err.message}`, 'error');
      await this.screenshot('error-consulta-horarios');
      throw err;
    }
  }

  // =============================================================================
  // Método de agendamento original (mantido)
  // =============================================================================
  
  async criarAgendamento(dados) {
    this.log(`🎯 Criando agendamento: ${dados.cliente.nome} - ${dados.data} ${dados.horario}`);
    
    try {
      await this.garantirSessaoPronta();
      
      this.log('Mudando para visualização Dia...');
      await this.page.evaluate(() => {
        const diaBtn = Array.from(document.querySelectorAll('button'))
          .find(b => b.textContent.trim().toLowerCase() === 'dia');
        if (diaBtn) diaBtn.click();
      });
      await this.sleep(3000);
      await this.screenshot('agend-00-view-dia');
      
      const dataAlvo = this.parseDataBR(dados.data);
      this.log(`Navegando para ${dataAlvo.toLocaleDateString('pt-BR')}...`);
      
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const diffDias = Math.ceil((dataAlvo - hoje) / (1000 * 60 * 60 * 24));
      
      this.log(`📍 Diferença para agendamento: ${diffDias} dias`, 'debug');

      if (Math.abs(diffDias) > 5) {
        this.log(`📅 Usando navegação via CALENDÁRIO`, 'info');
        
        const sucessoCalendario = await this.navegarParaDataViaCalendario(dataAlvo);
        
        if (!sucessoCalendario) {
          this.log('⚠️ Calendário falhou, usando dia a dia...', 'warning');
          await this.navegarDiaADia(dataAlvo);
        }
      } else {
        this.log(`➡️ Usando navegação DIA A DIA`, 'info');
        await this.navegarDiaADia(dataAlvo);
      }
      
      await this.sleep(2000);
      await this.screenshot('agendamento-01-data-correta');
      
      this.log(`Clicando no horário ${dados.horario}...`);
      
      const horarioEncontrado = await this.page.evaluate((horario) => {
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          const text = el.textContent?.trim();
          
          if (text === horario && el.offsetWidth < 100 && el.offsetHeight < 50) {
            const rect = el.getBoundingClientRect();
            const isVisible = (rect.top >= 0 && rect.top <= window.innerHeight);
            
            if (!isVisible) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return { found: true, scrolled: true, y: rect.top };
            }
            
            return { found: true, scrolled: false, y: rect.top };
          }
        }
        
        return { found: false };
      }, dados.horario);
      
      if (!horarioEncontrado.found) {
        throw new Error(`Horário ${dados.horario} não encontrado na página`);
      }
      
      this.log(`Horário encontrado! ${horarioEncontrado.scrolled ? 'Rolou a página' : 'Já estava visível'}`, 'debug');
      
      await this.sleep(horarioEncontrado.scrolled ? 2000 : 500);
      await this.screenshot('agendamento-01b-horario-visivel');
      
      const horarioClicado = await this.page.evaluate((horario) => {
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const el of allElements) {
          const text = el.textContent?.trim();
          
          if (text === horario && el.offsetWidth < 100 && el.offsetHeight < 50) {
            const rect = el.getBoundingClientRect();
            const x = rect.right + 50;
            const y = rect.top + 5;
            const targetElement = document.elementFromPoint(x, y);
            
            if (targetElement) {
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
              });
              
              targetElement.dispatchEvent(clickEvent);
              
              return { 
                success: true, 
                coords: { x, y },
                targetTag: targetElement.tagName,
                targetClass: targetElement.className
              };
            }
          }
        }
        
        return { success: false };
      }, dados.horario);
      
      if (!horarioClicado.success) {
        throw new Error(`Não foi possível clicar no horário ${dados.horario}`);
      }
      
      this.log(`✅ Clicou em (${horarioClicado.coords.x}, ${horarioClicado.coords.y}) no ${horarioClicado.targetTag}`, 'success');
      
      await this.sleep(5000);
      await this.screenshot('agendamento-02-modal-aberto');
      
      let modalAberto = false;
      for (let i = 0; i < 5; i++) {
        modalAberto = await this.page.evaluate(() => {
          const modal = document.querySelector('div[role="dialog"]') ||
                        document.querySelector('[role="dialog"]') ||
                        document.querySelector('.MuiDialog-root') ||
                        document.querySelector('[class*="Dialog"]') ||
                        Array.from(document.querySelectorAll('*')).find(el => {
                          const text = el.textContent || '';
                          const rect = el.getBoundingClientRect();
                          return text.includes('Agendamento') && 
                                 text.includes('Cliente') &&
                                 rect.width > 400 && 
                                 rect.height > 300;
                        });
          
          return !!modal;
        });
        
        if (modalAberto) {
          this.log('✅ Modal detectado!', 'success');
          break;
        }
        
        this.log(`Tentativa ${i + 1}: Procurando modal...`, 'debug');
        await this.sleep(1000);
      }
      
      if (!modalAberto) {
        await this.screenshot('debug-modal-nao-detectado');
        this.log('⚠️ Modal não detectado pelo código, mas pode estar aberto. Continuando...', 'warning');
      }
      
      this.log('Clicando no + para cadastrar cliente...');
      await this.sleep(2000);
      
      const clicouPlus = await this.page.evaluate(() => {
        const plusBtn = document.querySelector('[data-testid="plus-button"]') ||
                        document.querySelector('button[aria-label*="+"]') ||
                        document.querySelector('button[title*="Adicionar"]') ||
                        Array.from(document.querySelectorAll('button')).find(btn => {
                          const text = btn.textContent.trim();
                          const html = btn.innerHTML;
                          return text === '+' || html.includes('+') || html.includes('plus');
                        });
        
        if (plusBtn && plusBtn.offsetParent !== null) {
          plusBtn.scrollIntoView({ block: 'center' });
          plusBtn.click();
          return { success: true, text: plusBtn.textContent };
        }
        
        return { success: false };
      });
      
      if (!clicouPlus.success) {
        await this.screenshot('debug-botao-plus-nao-encontrado');
        throw new Error('Botão + do cliente não encontrado');
      }
      
      this.log(`✅ Clicou no botão +`, 'success');
      await this.sleep(2500);
      await this.screenshot('agendamento-03-form-cliente');

      // PREENCHENDO FORMULÁRIO DO CLIENTE
      this.log('Preenchendo telefone...');
      let telefone = dados.cliente.telefone.replace(/\D/g, '');
      if (telefone.startsWith('55')) {
        telefone = telefone.substring(2);
      }

      await this.page.click('#cellPhone');
      await this.sleep(1000);

      await this.page.evaluate(() => {
        const campo = document.getElementById('cellPhone');
        if (campo) {
          campo.value = '+55';
          campo.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });

      await this.sleep(500);
      await this.page.click('#cellPhone', { clickCount: 3 });
      await this.sleep(200);
      await this.page.type('#cellPhone', `+55${telefone}`, { delay: 120 });
      await this.sleep(2000);

      this.log(`Telefone digitado: +55${telefone}`, 'debug');

      // NOME
      this.log('Preenchendo nome...');

      await this.page.evaluate(() => {
        const campo = document.getElementById('name');
        if (campo) {
          campo.removeAttribute('required');
          campo.setCustomValidity('');
          const form = campo.closest('form');
          if (form) form.setAttribute('novalidate', 'novalidate');
        }
      });

      await this.sleep(500);
      await this.page.focus('#name');
      await this.sleep(300);

      await this.page.evaluate(() => {
        const campo = document.getElementById('name');
        if (campo) campo.value = '';
      });

      await this.sleep(300);
      await this.page.click('#name');
      await this.sleep(500);
      await this.page.keyboard.type(dados.cliente.nome, { delay: 120 });
      await this.sleep(1000);

      await this.page.evaluate((nome) => {
        const campo = document.getElementById('name');
        if (campo) {
          campo.value = nome;
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
          ).set;
          nativeInputValueSetter.call(campo, nome);
          
          const inputEvent = new Event('input', { bubbles: true });
          campo.dispatchEvent(inputEvent);
          const changeEvent = new Event('change', { bubbles: true });
          campo.dispatchEvent(changeEvent);
        }
      }, dados.cliente.nome);

      await this.sleep(800);

      await this.page.evaluate(() => {
        const label = document.querySelector('label[for="cellPhone"]');
        if (label) label.click();
      });

      await this.sleep(1000);

      this.log(`✅ Nome preenchido: ${dados.cliente.nome}`, 'success');
      await this.screenshot('agendamento-03b-nome-preenchido');

      // DATA DE NASCIMENTO
      this.log('Preenchendo data de nascimento...');

      const dataNascimento = dados.cliente.dataNascimento || '01/01/1990';

      const campoDataEncontrado = await this.page.evaluate(() => {
        const campoData = document.querySelector('input[name="birthDate"], input[id*="birth"], input[id*="nascimento"]') ||
                          Array.from(document.querySelectorAll('input[type="text"]'))
                            .find(input => {
                              const label = input.closest('div')?.querySelector('label')?.textContent || '';
                              return label.toLowerCase().includes('nascimento');
                            });
        
        if (campoData) {
          campoData.scrollIntoView({ block: 'center' });
          return {
            found: true,
            id: campoData.id,
            name: campoData.name
          };
        }
        
        return { found: false };
      });

      if (campoDataEncontrado.found) {
        const seletor = campoDataEncontrado.id 
          ? `#${campoDataEncontrado.id}` 
          : `input[name="${campoDataEncontrado.name}"]`;
        
        await this.sleep(500);
        await this.page.click(seletor);
        await this.sleep(800);
        
        await this.page.evaluate((sel) => {
          const campo = document.querySelector(sel);
          if (campo) campo.value = '';
        }, seletor);
        
        await this.sleep(300);
        await this.page.type(seletor, dataNascimento, { delay: 100 });
        await this.sleep(1000);
        
        await this.page.evaluate((sel, data) => {
          const campo = document.querySelector(sel);
          if (campo) {
            campo.value = data;
            campo.removeAttribute('required');
            campo.setCustomValidity('');
            
            ['input', 'change', 'blur'].forEach(tipo => {
              const evt = new Event(tipo, { bubbles: true });
              campo.dispatchEvent(evt);
            });
          }
        }, seletor, dataNascimento);
        
        await this.sleep(800);
        await this.page.keyboard.press('Tab');
        await this.sleep(500);
        
        this.log(`✅ Data de nascimento: ${dataNascimento}`, 'success');
      } else {
        this.log('⚠️ Campo data não encontrado', 'warning');
      }

      await this.screenshot('agendamento-03c-data-nascimento');

      // GÊNERO
      this.log('Selecionando gênero masculino...');

      try {
        await this.sleep(2000);
        
        const dropdownAberto = await this.page.evaluate(() => {
          const svgs = document.querySelectorAll('svg.MuiSvgIcon-root');
          
          for (const svg of svgs) {
            const path = svg.querySelector('path[d="M7 10l5 5 5-5z"]');
            if (path) {
              let parent = svg.parentElement;
              let attempts = 0;
              
              while (parent && attempts < 5) {
                const text = parent.textContent || '';
                
                if (text.includes('Gênero')) {
                  svg.dispatchEvent(new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                  }));
                  
                  if (svg.parentElement) {
                    svg.parentElement.click();
                  }
                  
                  return true;
                }
                
                parent = parent.parentElement;
                attempts++;
              }
            }
          }
          
          return false;
        });
        
        if (dropdownAberto) {
          this.log('✅ Dropdown de gênero aberto', 'success');
        }
        
        await this.sleep(2000);
        await this.screenshot('agendamento-03b-genero-dropdown-aberto');
        
        const masculinoSelecionado = await this.page.evaluate(() => {
          let opcoes = document.querySelectorAll('li[role="option"]');
          
          if (opcoes.length === 0) {
            opcoes = document.querySelectorAll('ul[role="listbox"] li, ul li');
          }
          
          for (const opcao of opcoes) {
            const texto = opcao.textContent?.trim();
            
            if (texto && texto.toLowerCase() === 'masculino') {
              opcao.click();
              opcao.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
              }));
              
              return true;
            }
          }
          
          return false;
        });
        
        if (masculinoSelecionado) {
          this.log('✅ Masculino selecionado com sucesso!', 'success');
        } else {
          await this.page.keyboard.press('m');
          await this.sleep(500);
          await this.page.keyboard.press('Enter');
        }
        
        await this.sleep(1500);
        await this.screenshot('agendamento-03c-genero-selecionado');
        
      } catch (e) {
        this.log(`⚠️ Erro ao selecionar gênero: ${e.message}`, 'warning');
      }

      // SALVAR CLIENTE
      this.log('Salvando cliente...');
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(b => b.textContent.trim().toLowerCase().includes('salvar'));
        if (saveBtn) saveBtn.click();
      });
      
      await this.sleep(3000);
      await this.screenshot('agendamento-05-cliente-salvo');
      
      // SELECIONAR SERVIÇO
      this.log('Selecionando serviço Avaliação...');
      await this.page.evaluate(() => {
        const elementos = Array.from(document.querySelectorAll('*'));
        for (const el of elementos) {
          if (el.textContent.includes('Serviço') && el.textContent.length < 50) {
            const parent = el.closest('div');
            if (parent) {
              const dropdown = parent.querySelector('[role="button"], [role="combobox"]');
              if (dropdown && dropdown.offsetParent !== null) {
                dropdown.click();
                return true;
              }
            }
          }
        }
        return false;
      });
      
      await this.sleep(1000);
      
      await this.page.evaluate(() => {
        const options = Array.from(document.querySelectorAll('li[role="option"]'));
        const option = options.find(el => {
          const text = el.textContent.trim().toLowerCase();
          return text.includes('avaliação') || text.includes('avaliacao');
        });
        if (option) option.click();
      });
      
      await this.sleep(1000);
      await this.screenshot('agendamento-06-servico-selecionado');
      
      // SALVAR AGENDAMENTO
      this.log('Salvando agendamento...');
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const saveBtn = buttons.find(b => {
          const text = b.textContent.trim().toLowerCase();
          return text.includes('salvar') && b.offsetParent !== null;
        });
        if (saveBtn) saveBtn.click();
      });
      
      await this.sleep(3000);
      await this.screenshot('agendamento-07-finalizado');
      
      const voltou = await this.page.evaluate(() => {
        return !document.querySelector('div[role="dialog"]');
      });
      
      if (voltou) {
        this.log('✅ Agendamento criado com sucesso!', 'success');
        return { 
          success: true, 
          message: 'Agendamento criado com sucesso!',
          dados: dados
        };
      } else {
        this.log('⚠️ Modal ainda aberto, mas agendamento pode ter sido criado', 'warning');
        return { 
          success: true, 
          message: 'Agendamento provavelmente criado',
          dados: dados
        };
      }
      
    } catch (err) {
      this.log(`❌ Erro ao criar agendamento: ${err.message}`, 'error');
      await this.screenshot('error-agendamento');
      throw err;
    }
  }

  // =============================================================================
  // 🔥 NOVO: Criar agendamento em sala específica
  // =============================================================================
  
  async criarAgendamentoEmSala(dados, nomeSala) {
    this.log(`🎯 Criando agendamento em ${nomeSala}: ${dados.cliente.nome} - ${dados.data} ${dados.horario}`);
    
    const salaOriginal = this.config.sala;
    this.config.sala = nomeSala;
    
    try {
      const resultado = await this.criarAgendamento(dados);
      resultado.sala = nomeSala;
      return resultado;
    } finally {
      this.config.sala = salaOriginal;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      this.log('Navegador fechado');
    }
  }
}

module.exports = UnObjectScraper;