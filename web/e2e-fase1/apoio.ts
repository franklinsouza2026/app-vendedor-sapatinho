/**
 * Apoio às jornadas E2E da Fase 1: API real (:3020), adapter CONTROLADO
 * (arquivos de eventos do contrato) e login pela tela.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { CODIGO_LOJA, DIR_ERP, IDS, PESSOAS, PORTA_API, SENHA_ADMIN, SENHA_VENDEDORA } from './ambiente';

export { CODIGO_LOJA, IDS, PESSOAS, SENHA_ADMIN, SENHA_VENDEDORA };
export const API = `http://localhost:${PORTA_API}`;

type Pessoa = { matricula: string; loja: string };

export async function token(request: APIRequestContext, pessoa: Pessoa, senha?: string): Promise<string> {
  const ehAdmin = pessoa.matricula.includes('ADM');
  const r = await request.post(`${API}/auth/login`, { data: { lojaId: pessoa.loja, matriculaErp: pessoa.matricula, senha: senha ?? (ehAdmin ? SENHA_ADMIN : SENHA_VENDEDORA) } });
  expect(r.status(), `login de ${pessoa.matricula}`).toBe(200);
  return (await r.json()).token as string;
}

export function cliente(request: APIRequestContext, tk: string) {
  const headers = { authorization: `Bearer ${tk}` };
  return {
    get: (path: string) => request.get(`${API}${path}`, { headers }),
    post: (path: string, data?: unknown) => request.post(`${API}${path}`, { headers, data: data ?? {} }),
    put: (path: string, data?: unknown) => request.put(`${API}${path}`, { headers, data: data ?? {} }),
    async json<T = any>(metodo: 'get' | 'post' | 'put', path: string, data?: unknown): Promise<T> {
      const r = metodo === 'get' ? await request.get(`${API}${path}`, { headers }) : metodo === 'post' ? await request.post(`${API}${path}`, { headers, data: data ?? {} }) : await request.put(`${API}${path}`, { headers, data: data ?? {} });
      expect(r.ok(), `${metodo.toUpperCase()} ${path} → ${r.status()} ${await r.text()}`).toBeTruthy();
      return (await r.json()) as T;
    },
  };
}

let seq = 0;
export function idUnico(prefixo: string) {
  return `${prefixo}-${Date.now().toString(36)}-${++seq}`;
}

export interface ItemVenda {
  referencia: string;
  descricao: string;
  categoria?: string | null;
  quantidade: number;
  pares: number;
  valor: number;
}

export function venda(p: Pessoa, valor: number, opcoes: { id?: string; quando?: Date; itens?: ItemVenda[] } = {}) {
  const itens = opcoes.itens ?? [{ referencia: 'E2E-REF-GENERICA', descricao: 'Produto E2E', categoria: 'Salto', quantidade: 1, pares: 1, valor }];
  return { tipo: 'VENDA' as const, idExterno: opcoes.id ?? idUnico('v'), lojaExterna: CODIGO_LOJA[p.loja], vendedorExterno: p.matricula, ocorridoEm: (opcoes.quando ?? new Date(Date.now() - 60_000)).toISOString(), valor, itens };
}

export function cancelamento(vendaId: string, id = idUnico('c')) {
  return { tipo: 'CANCELAMENTO' as const, idExterno: id, vendaIdExterno: vendaId, ocorridoEm: new Date(Date.now() - 30_000).toISOString() };
}

/** Deposita eventos como o ERP entregaria (um arquivo = um lote). */
export function entregar(integracaoId: string, eventos: unknown[], nome = idUnico('lote')) {
  const pasta = join(DIR_ERP, integracaoId);
  mkdirSync(pasta, { recursive: true });
  writeFileSync(join(pasta, `${nome}.json`), JSON.stringify(eventos));
  return nome;
}

/** Pede sync pelo endpoint do Admin e espera a execução terminar (worker real). */
export async function sincronizar(request: APIRequestContext, tkAdmin: string, integracaoId: string, esperado: 'SUCESSO' | 'ERRO' = 'SUCESSO') {
  const c = cliente(request, tkAdmin);
  const ultima = async () => {
    const s = await c.json('get', '/admin/fase1/saude');
    const execs = (s.integracoes.find((i: any) => i.id === integracaoId)?.execucoes ?? []).filter((e: any) => e.finalizadaEm);
    return execs[0] as { id: string; status: string } | undefined;
  };
  const idAntes = (await ultima())?.id ?? null;
  await c.json('post', `/admin/fase1/integracoes/${integracaoId}/sincronizar`);
  await expect
    .poll(
      async () => {
        const e = await ultima();
        return e && e.id !== idAntes ? e.status : 'aguardando';
      },
      { timeout: 30_000, intervals: [300, 500, 1000] }
    )
    .not.toBe('aguardando');
  expect((await ultima())?.status, 'resultado da sincronização').toBe(esperado);
}

export async function painel(request: APIRequestContext, p: Pessoa) {
  return cliente(request, await token(request, p)).json('get', '/app/painel');
}

export async function vendedorId(request: APIRequestContext, tkAdmin: string, matricula: string): Promise<string> {
  const e = await cliente(request, tkAdmin).json('get', '/admin/fase1/estado');
  const v = e.vendedores.find((x: any) => x.matricula === matricula);
  expect(v, `vendedor ${matricula} no estado do Admin`).toBeTruthy();
  return v.id;
}

export function mesAtual(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${p.find((x) => x.type === 'year')!.value}-${p.find((x) => x.type === 'month')!.value}`;
}

export async function entrarPelaTela(page: Page, p: Pessoa, senha?: string) {
  await page.goto('/login');
  await page.getByLabel('Loja').selectOption(p.loja);
  await page.getByLabel('Matrícula').fill(p.matricula);
  await page.getByLabel('Senha').fill(senha ?? (p.matricula.includes('ADM') ? SENHA_ADMIN : SENHA_VENDEDORA));
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
